import asyncio
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import ExtractionTask, ExtractionBatch, TaskStatus, BatchStatus
from app.schemas import SchemaField, BatchExtractionRequest
from app.crud import (
    create_batch_task, get_batch_by_id, get_batch_tasks,
    update_task_status, update_task_result, get_batch_stats,
    mark_batch_failed
)
from app.core.preprocessor import preprocessor
from app.core.llm_client import llm_client
from app.core.formatter import formatter
from app.config import settings

logger = logging.getLogger(__name__)


class BatchExtractionService:
    BATCH_CONCURRENCY = 5
    BATCH_POLL_INTERVAL = 0.5

    async def create_and_process_batch(
        self,
        db: Session,
        request: BatchExtractionRequest
    ) -> ExtractionBatch:
        batch, tasks = create_batch_task(db, request)
        if not tasks:
            return batch

        schema_fields = [SchemaField(**f) for f in request.schema]

        asyncio.create_task(self._process_batch_async(
            db=db,
            batch_id=batch.batch_id,
            tasks=tasks,
            schema_fields=schema_fields
        ))

        return batch

    async def _process_batch_async(
        self,
        db: Session,
        batch_id: str,
        tasks: List[ExtractionTask],
        schema_fields: List[SchemaField]
    ):
        semaphore = asyncio.Semaphore(self.BATCH_CONCURRENCY)

        async def process_single(task: ExtractionTask):
            async with semaphore:
                return await self._process_single_task(
                    db=db,
                    task=task,
                    schema_fields=schema_fields
                )

        task_coroutines = [process_single(task) for task in tasks]
        results = await asyncio.gather(*task_coroutines, return_exceptions=True)

        failed_count = sum(1 for r in results if isinstance(r, Exception) or r is False)
        completed_count = sum(1 for r in results if not isinstance(r, Exception) and r is not False)

        logger.info(
            f"批量任务 {batch_id} 完成: 成功 {completed_count}, 失败 {failed_count}, 总数 {len(tasks)}"
        )

    async def _process_single_task(
        self,
        db: Session,
        task: ExtractionTask,
        schema_fields: List[SchemaField]
    ) -> bool:
        try:
            update_task_status(db, task.task_id, TaskStatus.PROCESSING)

            preprocess_result = preprocessor.preprocess(task.original_text, extract_keywords=True)
            cleaned_text = preprocess_result["cleaned_text"]

            if len(cleaned_text) > settings.LLM_MAX_INPUT_CHARS:
                compressed = preprocessor.compress_by_schema(
                    cleaned_text, schema_fields, max_chars=settings.LLM_MAX_INPUT_CHARS
                )
                logger.info(
                    f"任务 {task.task_id} 文本压缩: "
                    f"{compressed['original_length']} -> {compressed['compressed_length']}"
                )
                cleaned_text = compressed["text"]

            llm_result = await llm_client.extract(cleaned_text, schema_fields)
            formatted_result = llm_result["result"]
            raw_response = llm_result["raw_response"]

            validation = formatter.validate_result(formatted_result, schema_fields)
            if not validation["valid"]:
                logger.warning(
                    f"任务 {task.task_id} 结果验证警告: {validation['errors']}"
                )

            update_task_result(
                db,
                task.task_id,
                formatted_result,
                preprocessed_text=cleaned_text,
                llm_response=raw_response
            )
            return True

        except Exception as e:
            logger.error(f"任务 {task.task_id} 处理失败: {str(e)}", exc_info=True)
            update_task_status(
                db,
                task.task_id,
                TaskStatus.FAILED,
                error_message=str(e)[:500]
            )
            return False

    def get_batch_progress(self, db: Session, batch_id: str) -> Dict[str, Any]:
        batch = get_batch_by_id(db, batch_id)
        if not batch:
            return {"error": "batch_not_found"}

        stats = get_batch_stats(db, batch_id)
        processing = stats.get("processing", 0)
        pending = stats.get("pending", 0)
        completed = stats.get("completed", 0)
        failed = stats.get("failed", 0)

        progress_percent = 0.0
        if batch.total_count > 0:
            progress_percent = round(
                (completed + failed) / batch.total_count * 100, 1
            )

        return {
            "batch_id": batch.batch_id,
            "status": batch.status.value,
            "total_count": batch.total_count,
            "completed_count": completed,
            "failed_count": failed,
            "processing_count": processing,
            "pending_count": pending,
            "progress_percent": progress_percent,
            "error_message": batch.error_message,
            "created_at": batch.created_at,
            "updated_at": batch.updated_at,
            "completed_at": batch.completed_at
        }


batch_service = BatchExtractionService()
