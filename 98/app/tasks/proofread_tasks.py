import asyncio
import threading
import time
from datetime import datetime
from typing import List, Dict, Any
from celery import Task
from celery.utils.log import get_task_logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.tasks.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.core.config import get_settings
from app.models.task import ProofreadTask, TaskResult, CorrectionItem
from app.models.document import Document
from app.services.ai_service import ai_service
from app.services.format_service import format_service
from app.services.task_log_service import task_log_service
from app.search.document_index import document_index
from loguru import logger

settings = get_settings()
task_logger = get_task_logger(__name__)


def get_or_create_event_loop():
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop


class AsyncSQLAlchemyTask(Task):
    _db = None
    _lock = threading.Lock()

    @property
    def db(self):
        with self._lock:
            if self._db is None:
                self._db = AsyncSessionLocal()
        return self._db

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        if self._db is not None:
            loop = get_or_create_event_loop()
            loop.run_until_complete(self._db.close())
            self._db = None


@celery_app.task(
    bind=True,
    base=AsyncSQLAlchemyTask,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    max_retries=3,
    rate_limit="10/m",
)
def process_proofread_task(self, task_id_str: str):
    task_logger.info(f"Starting proofread task: {task_id_str}")

    loop = get_or_create_event_loop()
    result = loop.run_until_complete(_process_task_with_logging(task_id_str))

    task_logger.info(f"Task {task_id_str} completed with status: {result.get('status')}")
    return result


@task_log_service.log_decorator(task_type="proofread")
async def _process_task_with_logging(task_id_str: str):
    return await _process_task(task_id_str)


async def _process_task(task_id_str: str):
    db: AsyncSession = AsyncSessionLocal()
    try:
        await db.execute(text("PRAGMA journal_mode=WAL"))
        await db.commit()

        result = await db.execute(
            select(ProofreadTask).where(ProofreadTask.task_id == task_id_str)
        )
        task = result.scalar_one_or_none()

        if not task:
            logger.error(f"Task {task_id_str} not found")
            return {"status": "error", "message": "Task not found"}

        if task.status in ["completed", "processing"]:
            logger.warning(f"Task {task_id_str} already in status: {task.status}")
            return {"status": "skipped", "message": "Task already processed"}

        task.status = "processing"
        task.started_at = datetime.utcnow()
        await db.commit()

        await task_log_service.log_task(
            db=db,
            task_id=task_id_str,
            task_type="proofread",
            status="processing",
            message="开始AI校对处理",
            details={"document_id": task.document_id, "task_type": task.task_type},
        )

        doc_result = await db.execute(
            select(Document).where(Document.id == task.document_id)
        )
        document = doc_result.scalar_one_or_none()

        if not document or not document.content:
            task.status = "failed"
            task.error_message = "Document not found or no content"
            await db.commit()

            await task_log_service.log_task(
                db=db,
                task_id=task_id_str,
                task_type="proofread",
                status="failed",
                message="文档不存在或无内容",
            )

            return {"status": "error", "message": "Document not found"}

        task.progress = 20
        await db.commit()

        await task_log_service.log_task(
            db=db,
            task_id=task_id_str,
            task_type="proofread",
            status="processing",
            message="调用AI校对服务",
            details={"content_length": len(document.content)},
        )

        try:
            ai_result = await asyncio.wait_for(
                ai_service.proofread(
                    content=document.content,
                    task_type=task.task_type,
                    industry=task.industry or document.industry,
                ),
                timeout=settings.ai_service_timeout,
            )
        except asyncio.TimeoutError:
            task.status = "failed"
            task.error_message = "AI service timeout"
            await db.commit()

            await task_log_service.log_task(
                db=db,
                task_id=task_id_str,
                task_type="proofread",
                status="failed",
                message="AI服务超时",
            )

            return {"status": "error", "message": "AI service timeout"}

        task.progress = 60
        await db.commit()

        await task_log_service.log_task(
            db=db,
            task_id=task_id_str,
            task_type="proofread",
            status="processing",
            message="AI校对完成，开始处理结果",
            details={"correction_count": len(ai_result.corrections), "success": ai_result.success},
        )

        if not ai_result.success:
            task.status = "failed"
            task.error_message = ai_result.error or "AI service failed"
            await db.commit()

            await task_log_service.log_task(
                db=db,
                task_id=task_id_str,
                task_type="proofread",
                status="failed",
                message=f"AI服务失败: {ai_result.error}",
            )

            return {"status": "error", "message": ai_result.error}

        task.progress = 80
        await db.commit()

        if "format" in task.task_type or task.task_type == "full":
            corrected_content = format_service.standardize_format(
                ai_result.corrected_content,
                document.file_type
            )
        else:
            corrected_content = ai_result.corrected_content

        task_result = TaskResult(
            task_id=task.id,
            original_content=document.content,
            corrected_content=corrected_content,
            summary=ai_result.summary,
            total_corrections=len(ai_result.corrections),
            spelling_errors=sum(
                1 for c in ai_result.corrections
                if c.get("correction_type") == "spelling"),
            grammar_errors=sum(
                1 for c in ai_result.corrections
                if c.get("correction_type") == "grammar"),
            terminology_errors=sum(
                1 for c in ai_result.corrections
                if c.get("correction_type") == "terminology"),
            format_errors=sum(
                1 for c in ai_result.corrections
                if c.get("correction_type") == "format"),
            confidence_score=ai_result.confidence_score,
        )
        db.add(task_result)
        await db.flush()

        for corr in ai_result.corrections:
            correction = CorrectionItem(
                result_id=task_result.id,
                correction_type=corr.get("correction_type", "unknown"),
                original_text=corr.get("original_text", "")[:500],
                corrected_text=corr.get("corrected_text", "")[:500],
                position_start=corr.get("position_start"),
                position_end=corr.get("position_end"),
                paragraph=corr.get("paragraph"),
                line_number=corr.get("line_number"),
                explanation=corr.get("explanation"),
                severity=corr.get("severity", "medium"),
                confidence=corr.get("confidence", 0.0),
            )
            db.add(correction)

        task.status = "completed"
        task.progress = 100
        task.completed_at = datetime.utcnow()
        document.status = "proofread"

        try:
            await document_index.index_document(document)
        except Exception as e:
            logger.warning(f"Failed to index document {document.id}: {e}")

        await db.commit()

        await task_log_service.log_task(
            db=db,
            task_id=task_id_str,
            task_type="proofread",
            status="completed",
            message="校对任务完成",
            details={
                "total_corrections": len(ai_result.corrections),
                "spelling": sum(1 for c in ai_result.corrections if c.get("correction_type") == "spelling"),
                "grammar": sum(1 for c in ai_result.corrections if c.get("correction_type") == "grammar"),
                "terminology": sum(1 for c in ai_result.corrections if c.get("correction_type") == "terminology"),
                "format": sum(1 for c in ai_result.corrections if c.get("correction_type") == "format"),
            },
        )

        return {
            "status": "success",
            "task_id": task_id_str,
            "total_corrections": len(ai_result.corrections),
        }

    except Exception as e:
        await db.rollback()
        logger.exception(f"Error processing task {task_id_str}: {e}")

        try:
            await task_log_service.log_task(
                db=db,
                task_id=task_id_str,
                task_type="proofread",
                status="failed",
                message=f"任务执行异常: {str(e)}",
                details={"error": str(e)},
            )

            result = await db.execute(
                select(ProofreadTask).where(ProofreadTask.task_id == task_id_str)
            )
            task = result.scalar_one_or_none()
            if task:
                task.status = "failed"
                task.error_message = str(e)[:500]
                await db.commit()
        except Exception as inner_e:
            logger.error(f"Failed to update task status: {inner_e}")

        return {"status": "error", "message": str(e)}

    finally:
        await db.close()


@celery_app.task(
    bind=True,
    base=AsyncSQLAlchemyTask,
    rate_limit="5/m",
)
def batch_process_documents(self, document_ids: List[int], user_id: int, task_type: str = "full"):
    task_logger.info(f"Starting batch process for {len(document_ids)} documents")

    loop = get_or_create_event_loop()
    result = loop.run_until_complete(_batch_process(document_ids, user_id, task_type))

    return result


async def _batch_process(document_ids: List[int], user_id: int, task_type: str):
    from app.services.task_service import task_service

    task_ids = []
    semaphore = asyncio.Semaphore(3)

    async def process_single_document(doc_id):
        async with semaphore:
            db = AsyncSessionLocal()
            try:
                task = await task_service.create_task(
                    db=db,
                    document_id=doc_id,
                    task_type=task_type,
                    user_id=user_id,
                )
                task_ids.append(task.task_id)

                process_proofread_task.apply_async(
                    args=[task.task_id],
                    priority=5,
                    countdown=1,
                )

                await asyncio.sleep(0.5)
                return task.task_id
            except Exception as e:
                logger.error(f"Failed to create task for document {doc_id}: {e}")
                return None
            finally:
                await db.close()

    tasks = [process_single_document(doc_id) for doc_id in document_ids]
    await asyncio.gather(*tasks, return_exceptions=True)

    return {
        "status": "success",
        "task_ids": [tid for tid in task_ids if tid],
        "total": len([tid for tid in task_ids if tid]),
        "failed": len(document_ids) - len([tid for tid in task_ids if tid]),
    }


@celery_app.task
def cleanup_failed_tasks():
    loop = get_or_create_event_loop()
    return loop.run_until_complete(_cleanup_failed_tasks())


async def _cleanup_failed_tasks():
    db = AsyncSessionLocal()
    try:
        timeout = datetime.utcnow() - datetime.timedelta(hours=1)
        result = await db.execute(
            select(ProofreadTask).where(
                ProofreadTask.status == "processing",
                ProofreadTask.started_at < timeout,
            )
        )
        stuck_tasks = result.scalars().all()

        for task in stuck_tasks:
            task.status = "failed"
            task.error_message = "Task timeout - worker may have crashed"
            await db.commit()
            logger.warning(f"Marked stuck task {task.task_id} as failed")

        return {"cleaned_count": len(stuck_tasks)}
    finally:
        await db.close()
