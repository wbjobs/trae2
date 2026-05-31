import json
import asyncio
from loguru import logger
from app.task_queue.celery_app import celery_app
from app.config import get_settings

settings = get_settings()

_loop = None


def _get_or_create_loop() -> asyncio.AbstractEventLoop:
    global _loop
    try:
        loop = asyncio.get_running_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
        return loop
    except RuntimeError:
        if _loop is None or _loop.is_closed():
            _loop = asyncio.new_event_loop()
        return _loop


def _run_async(coro):
    loop = _get_or_create_loop()
    return loop.run_until_complete(coro)


TASK_TYPE_TO_AI_FN = {}


def _get_ai_functions():
    if not TASK_TYPE_TO_AI_FN:
        from app.ai_inference.summary import generate_summary
        from app.ai_inference.keywords import extract_keywords
        from app.ai_inference.correction import correct_content
        from app.ai_inference.classify import classify_document
        from app.ai_inference.translate import translate_content

        TASK_TYPE_TO_AI_FN.update({
            "summary": generate_summary,
            "keywords": extract_keywords,
            "correction": correct_content,
            "classify": classify_document,
            "translate": translate_content,
            "full": None,
        })
    return TASK_TYPE_TO_AI_FN


RETRY_DELAYS = [30, 120, 600]

TRANSIENT_ERRORS = {
    "timeout", "timed out", "connection", "429", "rate limit",
    "overloaded", "service unavailable", "503", "502", "500",
}


def _is_transient_error(error_msg: str) -> bool:
    msg_lower = error_msg.lower()
    return any(e in msg_lower for e in TRANSIENT_ERRORS)


def _get_retry_delay(retry_count: int) -> int:
    idx = min(retry_count, len(RETRY_DELAYS) - 1)
    return RETRY_DELAYS[idx]


async def _process_single_document(document_id: str, task_type: str, task_id: str, extra_params: dict | None = None) -> dict:
    from app.database import async_session
    from app.models import Document, TaskDocument
    from app.semantic_search.indexer import update_document_index
    from sqlalchemy import select

    ai_fns = _get_ai_functions()

    async with async_session() as session:
        result = await session.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()
        if not document:
            return {"status": "failed", "error": f"Document not found: {document_id}"}

        content = document.content or ""
        if not content.strip():
            return {"status": "failed", "error": "Document has no content"}

        try:
            if task_type == "full":
                summary_fn = ai_fns["summary"]
                keywords_fn = ai_fns["keywords"]
                correction_fn = ai_fns["correction"]
                classify_fn = ai_fns["classify"]

                from app.ai_inference.rate_limiter import get_rate_limiter
                limiter = get_rate_limiter()

                async with limiter:
                    summary = await asyncio.wait_for(summary_fn(content), timeout=120)
                document.summary = summary

                async with limiter:
                    keywords = await asyncio.wait_for(keywords_fn(content), timeout=120)
                keywords_str = json.dumps(keywords, ensure_ascii=False)
                document.keywords = keywords_str

                async with limiter:
                    correction = await asyncio.wait_for(correction_fn(content), timeout=180)
                correction_str = json.dumps(correction, ensure_ascii=False)
                document.correction = correction_str

                async with limiter:
                    classification = await asyncio.wait_for(classify_fn(content), timeout=120)
                classification_str = json.dumps(classification, ensure_ascii=False)
                document.classification = classification_str

                document.status = "processed"
                await update_document_index(
                    document_id, summary=summary, keywords=keywords_str
                )

            elif task_type == "translate":
                translate_fn = ai_fns["translate"]
                target_lang = (extra_params or {}).get("target_lang", "en")
                source_lang = (extra_params or {}).get("source_lang")

                from app.ai_inference.rate_limiter import get_rate_limiter
                limiter = get_rate_limiter()

                async with limiter:
                    translation = await asyncio.wait_for(
                        translate_fn(content, target_lang, source_lang), timeout=300
                    )
                document.translation = translation
                document.status = "translated"

            else:
                ai_fn = ai_fns.get(task_type)
                if not ai_fn:
                    return {"status": "failed", "error": f"Unknown task type: {task_type}"}

                from app.ai_inference.rate_limiter import get_rate_limiter
                limiter = get_rate_limiter()

                timeout_map = {"summary": 120, "keywords": 120, "correction": 180, "classify": 120}
                timeout = timeout_map.get(task_type, 120)

                async with limiter:
                    ai_result = await asyncio.wait_for(ai_fn(content), timeout=timeout)

                if task_type == "summary":
                    document.summary = ai_result
                    document.status = "summarized"
                    await update_document_index(document_id, summary=ai_result)
                elif task_type == "keywords":
                    keywords_str = json.dumps(ai_result, ensure_ascii=False)
                    document.keywords = keywords_str
                    document.status = "keyworded"
                    await update_document_index(document_id, keywords=keywords_str)
                elif task_type == "correction":
                    correction_str = json.dumps(ai_result, ensure_ascii=False)
                    document.correction = correction_str
                    document.status = "corrected"
                    await update_document_index(document_id)
                elif task_type == "classify":
                    classification_str = json.dumps(ai_result, ensure_ascii=False)
                    document.classification = classification_str
                    document.status = "classified"
                    await update_document_index(document_id)

            await session.commit()
            return {"status": "completed", "document_id": document_id}

        except asyncio.TimeoutError:
            await session.rollback()
            logger.error(f"Timeout processing document {document_id}")
            return {"status": "failed", "error": f"Processing timeout for document {document_id}"}
        except Exception as e:
            await session.rollback()
            logger.error(f"Failed to process document {document_id}: {e}")
            return {"status": "failed", "error": str(e)}


@celery_app.task(
    bind=True,
    name="app.task_queue.tasks.process_single_document_task",
    max_retries=3,
    queue="processing",
)
def process_single_document_task(self, task_id: str, document_id: str, task_type: str, extra_params: dict | None = None):
    try:
        result = _run_async(_do_process_single(task_id, document_id, task_type, extra_params))
        return result
    except Exception as exc:
        retry_count = self.request.retries or 0
        error_msg = str(exc)

        if _is_transient_error(error_msg) and retry_count < self.max_retries:
            delay = _get_retry_delay(retry_count)
            logger.warning(f"Transient error for doc {document_id}, retry {retry_count+1} after {delay}s: {error_msg}")
            raise self.retry(exc=exc, countdown=delay)
        else:
            _run_async(_mark_doc_failed(task_id, document_id, error_msg, retry_count + 1))
            return {"status": "failed", "error": error_msg}


async def _do_process_single(task_id: str, document_id: str, task_type: str, extra_params: dict | None = None) -> dict:
    from app.database import async_session
    from app.models import TaskDocument, Document
    from sqlalchemy import select
    from app.task_queue.ws_manager import ws_manager

    doc_result = await _process_single_document(document_id, task_type, task_id, extra_params)

    async with async_session() as session:
        result = await session.execute(
            select(TaskDocument).where(
                TaskDocument.task_id == task_id,
                TaskDocument.document_id == document_id,
            )
        )
        td = result.scalar_one_or_none()
        if td:
            td.status = doc_result["status"]
            td.result = json.dumps(doc_result, ensure_ascii=False)
            if doc_result["status"] != "completed":
                td.error_message = doc_result.get("error", "")
            await session.commit()

        doc_result_q = await session.execute(select(Document).where(Document.id == document_id))
        doc = doc_result_q.scalar_one_or_none()
        doc_name = doc.filename if doc else document_id

    progress_info = await _calculate_progress(task_id)
    await ws_manager.broadcast_progress(
        task_id=task_id,
        status="processing",
        progress=progress_info["progress"],
        completed_count=progress_info["completed"],
        failed_count=progress_info["failed"],
        total_count=progress_info["total"],
        current_document=doc_name,
    )
    await ws_manager.broadcast_document_result(
        task_id=task_id,
        document_id=document_id,
        document_name=doc_name,
        status=doc_result["status"],
        error=doc_result.get("error"),
    )

    return doc_result


async def _calculate_progress(task_id: str) -> dict:
    from app.database import async_session
    from app.models import TaskDocument
    from sqlalchemy import select, func

    async with async_session() as session:
        total_q = await session.execute(
            select(func.count()).where(TaskDocument.task_id == task_id)
        )
        total = total_q.scalar() or 1

        completed_q = await session.execute(
            select(func.count()).where(
                TaskDocument.task_id == task_id,
                TaskDocument.status == "completed",
            )
        )
        completed = completed_q.scalar() or 0

        failed_q = await session.execute(
            select(func.count()).where(
                TaskDocument.task_id == task_id,
                TaskDocument.status == "failed",
            )
        )
        failed = failed_q.scalar() or 0

    progress = int(((completed + failed) / total) * 100) if total > 0 else 0
    return {"progress": progress, "completed": completed, "failed": failed, "total": total}


async def _mark_doc_failed(task_id: str, document_id: str, error: str, retry_count: int = 0):
    from app.database import async_session
    from app.models import TaskDocument, Task
    from sqlalchemy import select
    from app.task_queue.ws_manager import ws_manager

    async with async_session() as session:
        result = await session.execute(
            select(TaskDocument).where(
                TaskDocument.task_id == task_id,
                TaskDocument.document_id == document_id,
            )
        )
        td = result.scalar_one_or_none()
        if td:
            td.status = "failed"
            td.error_message = error
            await session.commit()

        task_q = await session.execute(select(Task).where(Task.id == task_id))
        task = task_q.scalar_one_or_none()
        if task:
            task.failed_count = (task.failed_count or 0) + 1
            if retry_count >= 3:
                task.retry_count = retry_count
            await session.commit()

    await ws_manager.broadcast_document_result(
        task_id=task_id,
        document_id=document_id,
        document_name=document_id,
        status="failed",
        error=error,
    )


@celery_app.task(
    bind=True,
    name="app.task_queue.tasks.process_batch_coordinator_task",
    queue="coordinator",
)
def process_batch_coordinator_task(self, task_id: str, extra_params: dict | None = None):
    _run_async(_coordinate_batch(self, task_id, extra_params))


async def _coordinate_batch(celery_task, task_id: str, extra_params: dict | None = None):
    from app.database import async_session
    from app.models import Task, TaskDocument
    from sqlalchemy import select
    from app.task_queue.ws_manager import ws_manager

    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            logger.error(f"Task not found: {task_id}")
            return

        if task.status == "cancelled":
            logger.info(f"Task {task_id} is cancelled, skipping")
            return

        task.status = "processing"
        await session.commit()

        result = await session.execute(
            select(TaskDocument).where(TaskDocument.task_id == task_id)
        )
        task_docs = result.scalars().all()
        task_type = task.task_type
        doc_ids = [td.document_id for td in task_docs]

    await ws_manager.broadcast_progress(
        task_id=task_id, status="processing", progress=0,
        completed_count=0, failed_count=0, total_count=len(doc_ids),
    )

    from celery import group

    signatures = []
    for doc_id in doc_ids:
        sig = process_single_document_task.s(task_id, doc_id, task_type, extra_params)
        signatures.append(sig)

    batch_group = group(signatures)
    result = batch_group.apply_async()

    try:
        ready = result.get(timeout=900, disable_sync_subtasks=False)
    except Exception as e:
        logger.error(f"Batch group failed for task {task_id}: {e}")
        ready = []

    completed = 0
    failed = 0
    for r in (ready if ready else []):
        if isinstance(r, dict) and r.get("status") == "completed":
            completed += 1
        else:
            failed += 1

    total = len(doc_ids)

    async with async_session() as session:
        result_q = await session.execute(select(Task).where(Task.id == task_id))
        task = result_q.scalar_one_or_none()
        if not task:
            return

        if task.status == "cancelled":
            return

        if failed > 0 and failed == total:
            final_status = "failed"
        elif failed > 0:
            final_status = "partial"
        else:
            final_status = "completed"

        task.status = final_status
        task.progress = 100
        task.completed_count = completed
        task.failed_count = failed
        task.result = json.dumps(
            {"completed": completed, "failed": failed, "total": total}, ensure_ascii=False
        )
        await session.commit()
        logger.info(f"Batch task finished: {task_id}, completed={completed}, failed={failed}")

    await ws_manager.broadcast_task_complete(
        task_id=task_id, status=final_status,
        completed_count=completed, failed_count=failed, total_count=total,
    )


@celery_app.task(
    bind=True,
    name="app.task_queue.tasks.retry_dead_letter_task",
    max_retries=1,
    queue="dead_letter_retry",
)
def retry_dead_letter_task(self, task_id: str):
    _run_async(_retry_dead_letter(task_id))


async def _retry_dead_letter(task_id: str):
    from app.database import async_session
    from app.models import Task, TaskDocument
    from sqlalchemy import select, update

    async with async_session() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            logger.error(f"Dead letter retry: task not found {task_id}")
            return

        if task.retry_count >= task.max_retries:
            logger.warning(f"Dead letter task {task_id} exceeded max retries ({task.max_retries})")
            task.status = "dead_letter"
            task.error_message = f"Exceeded max retries ({task.max_retries})"
            await session.commit()
            return

        task.retry_count += 1
        task.status = "retrying"

        await session.execute(
            update(TaskDocument)
            .where(TaskDocument.task_id == task_id, TaskDocument.status == "failed")
            .values(status="pending", error_message="")
        )
        await session.commit()

    logger.info(f"Retrying dead letter task {task_id}, attempt {task.retry_count}/{task.max_retries}")
    submit_batch_task(task_id)
