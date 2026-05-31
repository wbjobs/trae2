import asyncio
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
from app.models.polish import DocumentPolishTask, PolishItem
from app.models.document import Document
from app.services.polish_service import polish_service
from app.services.task_log_service import task_log_service
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
    _lock = None

    def __init__(self):
        import threading
        self._lock = threading.Lock()

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
def process_polish_task(self, task_id_str: str):
    task_logger.info(f"Starting polish task: {task_id_str}")

    loop = get_or_create_event_loop()
    result = loop.run_until_complete(_process_polish_task_with_logging(task_id_str))

    task_logger.info(f"Task {task_id_str} completed with status: {result.get('status')}")
    return result


@task_log_service.log_decorator(task_type="polish")
async def _process_polish_task_with_logging(task_id_str: str):
    return await _process_polish_task(task_id_str)


async def _process_polish_task(task_id_str: str):
    db: AsyncSession = AsyncSessionLocal()
    try:
        await db.execute(text("PRAGMA journal_mode=WAL"))
        await db.commit()

        result = await db.execute(
            select(DocumentPolishTask).where(DocumentPolishTask.task_id == task_id_str)
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
            task_type="polish",
            status="processing",
            message="开始AI润色处理",
            details={
                "document_id": task.document_id,
                "polish_type": task.polish_type,
                "tone": task.tone,
            },
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
                task_type="polish",
                status="failed",
                message="文档不存在或无内容",
            )

            return {"status": "error", "message": "Document not found"}

        task.progress = 20
        task.original_content = document.content
        await db.commit()

        await task_log_service.log_task(
            db=db,
            task_id=task_id_str,
            task_type="polish",
            status="processing",
            message="调用AI润色服务",
            details={
                "content_length": len(document.content),
                "polish_type": task.polish_type,
                "tone": task.tone,
            },
        )

        try:
            from app.schemas.polish import PolishRequest
            request = PolishRequest(
                content=document.content,
                polish_type=task.polish_type,
                tone=task.tone,
                industry=task.industry or document.industry,
            )
            polish_result = await asyncio.wait_for(
                polish_service.polish_text(request),
                timeout=settings.ai_service_timeout,
            )
        except asyncio.TimeoutError:
            task.status = "failed"
            task.error_message = "AI service timeout"
            await db.commit()

            await task_log_service.log_task(
                db=db,
                task_id=task_id_str,
                task_type="polish",
                status="failed",
                message="AI服务超时",
            )

            return {"status": "error", "message": "AI service timeout"}

        task.progress = 60
        await db.commit()

        await task_log_service.log_task(
            db=db,
            task_id=task_id_str,
            task_type="polish",
            status="processing",
            message="AI润色完成，开始处理结果",
            details={
                "improvement_count": len(polish_result.polish_items),
                "success": polish_result.success,
            },
        )

        if not polish_result.success:
            task.status = "failed"
            task.error_message = polish_result.error or "Polish service failed"
            await db.commit()

            await task_log_service.log_task(
                db=db,
                task_id=task_id_str,
                task_type="polish",
                status="failed",
                message=f"AI服务失败: {polish_result.error}",
            )

            return {"status": "error", "message": polish_result.error}

        task.progress = 80
        task.polished_content = polish_result.polished_content
        await db.commit()

        for item in polish_result.polish_items:
            polish_item = PolishItem(
                task_id=task.id,
                polish_type=item.polish_type,
                original_text=item.original_text[:1000],
                polished_text=item.polished_text[:1000],
                position_start=item.position_start,
                position_end=item.position_end,
                paragraph=item.paragraph,
                explanation=item.explanation,
                severity=item.severity,
                confidence=item.confidence,
            )
            db.add(polish_item)

        task.status = "completed"
        task.progress = 100
        task.completed_at = datetime.utcnow()
        await db.commit()

        await task_log_service.log_task(
            db=db,
            task_id=task_id_str,
            task_type="polish",
            status="completed",
            message="润色任务完成",
            details={
                "total_improvements": len(polish_result.polish_items),
                "by_type": polish_result.summary.get("by_type", {}),
                "overall_improvement": polish_result.overall_improvement,
            },
        )

        return {
            "status": "success",
            "task_id": task_id_str,
            "total_improvements": len(polish_result.polish_items),
        }

    except Exception as e:
        await db.rollback()
        logger.exception(f"Error processing polish task {task_id_str}: {e}")

        try:
            await task_log_service.log_task(
                db=db,
                task_id=task_id_str,
                task_type="polish",
                status="failed",
                message=f"任务执行异常: {str(e)}",
                details={"error": str(e)},
            )

            result = await db.execute(
                select(DocumentPolishTask).where(DocumentPolishTask.task_id == task_id_str)
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


@celery_app.task
def cleanup_failed_polish_tasks():
    loop = get_or_create_event_loop()
    return loop.run_until_complete(_cleanup_failed_polish_tasks())


async def _cleanup_failed_polish_tasks():
    db = AsyncSessionLocal()
    try:
        timeout = datetime.utcnow() - datetime.timedelta(hours=1)
        result = await db.execute(
            select(DocumentPolishTask).where(
                DocumentPolishTask.status == "processing",
                DocumentPolishTask.started_at < timeout,
            )
        )
        stuck_tasks = result.scalars().all()

        for task in stuck_tasks:
            task.status = "failed"
            task.error_message = "Task timeout - worker may have crashed"
            await db.commit()
            logger.warning(f"Marked stuck polish task {task.task_id} as failed")

        return {"cleaned_count": len(stuck_tasks)}
    finally:
        await db.close()
