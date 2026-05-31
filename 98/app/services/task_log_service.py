import json
import time
from datetime import datetime
from typing import Optional, List, Dict, Any
from functools import wraps
from contextlib import contextmanager
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from loguru import logger

from app.core.database import AsyncSessionLocal
from app.models.polish import TaskLog
from app.models.task import ProofreadTask
from app.tasks.proofread_tasks import process_proofread_task


class TaskLogService:
    def __init__(self):
        pass

    async def log_task(
        self,
        db: AsyncSession,
        task_id: str,
        task_type: str,
        status: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        duration_ms: Optional[int] = None,
        retry_count: int = 0,
    ) -> TaskLog:
        log_entry = TaskLog(
            task_id=task_id,
            task_type=task_type,
            status=status,
            message=message,
            details=details,
            duration_ms=duration_ms,
            retry_count=retry_count,
        )
        db.add(log_entry)
        try:
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to log task: {e}")
        return log_entry

    async def get_task_logs(
        self,
        db: AsyncSession,
        task_id: str,
        user_id: int,
        limit: int = 100,
    ) -> List[TaskLog]:
        task_result = await db.execute(
            select(ProofreadTask).where(ProofreadTask.task_id == task_id)
        )
        task = task_result.scalar_one_or_none()

        if not task:
            from app.models.polish import DocumentPolishTask
            polish_result = await db.execute(
                select(DocumentPolishTask).where(DocumentPolishTask.task_id == task_id)
            )
            polish_task = polish_result.scalar_one_or_none()
            if not polish_task:
                return []
            if polish_task.user_id != user_id:
                return []
        elif task.user_id != user_id:
            return []

        result = await db.execute(
            select(TaskLog).where(TaskLog.task_id == task_id)
            .order_by(desc(TaskLog.created_at))
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_failed_tasks(
        self,
        db: AsyncSession,
        user_id: int,
        hours: int = 24,
    ) -> List[Dict[str, Any]]:
        cutoff = datetime.utcnow() - datetime.timedelta(hours=hours)

        proofread_result = await db.execute(
            select(ProofreadTask).where(
                ProofreadTask.user_id == user_id,
                ProofreadTask.status == "failed",
                ProofreadTask.created_at >= cutoff,
            ).order_by(desc(ProofreadTask.created_at))
        )
        failed_proofread = proofread_result.scalars().all()

        from app.models.polish import DocumentPolishTask
        polish_result = await db.execute(
            select(DocumentPolishTask).where(
                DocumentPolishTask.user_id == user_id,
                DocumentPolishTask.status == "failed",
                DocumentPolishTask.created_at >= cutoff,
            ).order_by(desc(DocumentPolishTask.created_at))
        )
        failed_polish = polish_result.scalars().all()

        failed_tasks = []
        for task in failed_proofread:
            failed_tasks.append({
                "task_id": task.task_id,
                "task_type": "proofread",
                "document_id": task.document_id,
                "error_message": task.error_message,
                "created_at": task.created_at,
            })

        for task in failed_polish:
            failed_tasks.append({
                "task_id": task.task_id,
                "task_type": "polish",
                "document_id": task.document_id,
                "error_message": task.error_message,
                "created_at": task.created_at,
            })

        return failed_tasks

    async def retry_failed_tasks(
        self,
        db: AsyncSession,
        user_id: int,
        task_ids: Optional[List[str]] = None,
        max_retries: int = 3,
    ) -> Dict[str, Any]:
        from app.models.polish import DocumentPolishTask
        from app.tasks.polish_tasks import process_polish_task

        cutoff = datetime.utcnow() - datetime.timedelta(hours=72)

        proofread_query = select(ProofreadTask).where(
            ProofreadTask.user_id == user_id,
            ProofreadTask.status == "failed",
            ProofreadTask.created_at >= cutoff,
        )

        polish_query = select(DocumentPolishTask).where(
            DocumentPolishTask.user_id == user_id,
            DocumentPolishTask.status == "failed",
            DocumentPolishTask.created_at >= cutoff,
        )

        if task_ids:
            proofread_query = proofread_query.where(ProofreadTask.task_id.in_(task_ids))
            polish_query = polish_query.where(DocumentPolishTask.task_id.in_(task_ids))

        proofread_result = await db.execute(proofread_query)
        proofread_tasks = list(proofread_result.scalars().all())

        polish_result = await db.execute(polish_query)
        polish_tasks = list(polish_result.scalars().all())

        all_tasks = [("proofread", t) for t in proofread_tasks] + [("polish", t) for t in polish_tasks]

        retried = []
        skipped = []

        for task_type, task in all_tasks:
            log_result = await db.execute(
                select(TaskLog).where(
                    TaskLog.task_id == task.task_id,
                    TaskLog.status == "retry",
                )
            )
            retry_count = len(list(log_result.scalars().all()))

            if retry_count >= max_retries:
                skipped.append({
                    "task_id": task.task_id,
                    "task_type": task_type,
                    "reason": f"已达到最大重试次数 {max_retries}",
                })
                continue

            task.status = "pending"
            task.progress = 0
            task.error_message = None
            task.started_at = None
            task.completed_at = None

            if task_type == "proofread" and task.result:
                await db.delete(task.result)

            await db.commit()

            if task_type == "proofread":
                process_proofread_task.apply_async(
                    args=[task.task_id],
                    priority=8,
                    countdown=2,
                )
            else:
                process_polish_task.apply_async(
                    args=[task.task_id],
                    priority=8,
                    countdown=2,
                )

            await self.log_task(
                db=db,
                task_id=task.task_id,
                task_type=task_type,
                status="retry",
                message=f"第 {retry_count + 1} 次自动重试",
                details={"retry_count": retry_count + 1},
                retry_count=retry_count + 1,
            )

            retried.append({
                "task_id": task.task_id,
                "task_type": task_type,
            })

        return {
            "retried_count": len(retried),
            "skipped_count": len(skipped),
            "retried_tasks": retried,
            "skipped_tasks": skipped,
        }

    @contextmanager
    def task_timer(self, task_id: str, task_type: str, db: AsyncSession):
        start_time = time.time()
        try:
            yield
            duration = int((time.time() - start_time) * 1000)
            import asyncio
            asyncio.create_task(
                self.log_task(
                    db=db,
                    task_id=task_id,
                    task_type=task_type,
                    status="completed",
                    message="任务执行成功",
                    duration_ms=duration,
                )
            )
        except Exception as e:
            duration = int((time.time() - start_time) * 1000)
            import asyncio
            asyncio.create_task(
                self.log_task(
                    db=db,
                    task_id=task_id,
                    task_type=task_type,
                    status="failed",
                    message=f"任务执行失败: {str(e)}",
                    details={"error": str(e)},
                    duration_ms=duration,
                )
            )
            raise

    def log_decorator(self, task_type: str):
        def decorator(func):
            @wraps(func)
            async def wrapper(task_id_str: str, *args, **kwargs):
                db = AsyncSessionLocal()
                try:
                    start_time = time.time()

                    await self.log_task(
                        db=db,
                        task_id=task_id_str,
                        task_type=task_type,
                        status="started",
                        message="任务开始执行",
                    )

                    result = await func(task_id_str, *args, **kwargs)

                    duration = int((time.time() - start_time) * 1000)
                    await self.log_task(
                        db=db,
                        task_id=task_id_str,
                        task_type=task_type,
                        status="completed",
                        message="任务执行成功",
                        duration_ms=duration,
                    )

                    return result

                except Exception as e:
                    duration = int((time.time() - start_time) * 1000)
                    await self.log_task(
                        db=db,
                        task_id=task_id_str,
                        task_type=task_type,
                        status="failed",
                        message=f"任务执行失败: {str(e)}",
                        details={"error": str(e)},
                        duration_ms=duration,
                    )
                    raise
                finally:
                    await db.close()

            return wrapper
        return decorator


task_log_service = TaskLogService()
