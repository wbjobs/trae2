import uuid
from typing import Optional, List, Tuple, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import joinedload

from app.core.exceptions import NotFoundException, ForbiddenException
from app.models.task import ProofreadTask, TaskResult, CorrectionItem
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate
from app.tasks.proofread_tasks import process_proofread_task, batch_process_documents


class TaskService:
    async def get_by_id(self, db: AsyncSession, task_id: int) -> Optional[ProofreadTask]:
        result = await db.execute(select(ProofreadTask).where(ProofreadTask.id == task_id))
        return result.scalar_one_or_none()

    async def get_by_task_id(self, db: AsyncSession, task_id_str: str) -> Optional[ProofreadTask]:
        result = await db.execute(
            select(ProofreadTask)
            .options(joinedload(ProofreadTask.result).joinedload(TaskResult.corrections))
            .where(ProofreadTask.task_id == task_id_str)
        )
        return result.scalar_one_or_none()

    async def check_owner(self, db: AsyncSession, task_id: int, user_id: int) -> bool:
        task = await self.get_by_id(db, task_id)
        if not task:
            raise NotFoundException(detail="任务不存在")
        if task.user_id != user_id:
            raise ForbiddenException(detail="无权访问此任务")
        return True

    async def create_task(
        self,
        db: AsyncSession,
        document_id: int,
        task_type: str,
        user_id: int,
        industry: Optional[str] = None,
        priority: int = 5,
    ) -> ProofreadTask:
        task = ProofreadTask(
            task_id=str(uuid.uuid4()),
            document_id=document_id,
            user_id=user_id,
            task_type=task_type,
            industry=industry,
            priority=priority,
            status="pending",
            progress=0,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return task

    async def submit_task(
        self,
        db: AsyncSession,
        task_in: TaskCreate,
        user: User,
    ) -> ProofreadTask:
        task = await self.create_task(
            db=db,
            document_id=task_in.document_id,
            task_type=task_in.task_type,
            user_id=user.id,
            industry=task_in.industry,
            priority=task_in.priority,
        )

        process_proofread_task.delay(task.task_id)

        return task

    async def submit_batch_tasks(
        self,
        db: AsyncSession,
        document_ids: List[int],
        task_type: str,
        user_id: int,
    ) -> Dict[str, Any]:
        batch_process_documents.delay(document_ids, user_id, task_type)
        return {
            "status": "submitted",
            "document_count": len(document_ids),
            "task_type": task_type,
        }

    async def get_task_status(self, db: AsyncSession, task_id_str: str, user_id: int):
        task = await self.get_by_task_id(db, task_id_str)
        if not task:
            raise NotFoundException(detail="任务不存在")
        if task.user_id != user_id:
            raise ForbiddenException(detail="无权访问此任务")

        return {
            "task_id": task.task_id,
            "status": task.status,
            "progress": task.progress,
            "created_at": task.created_at,
            "started_at": task.started_at,
            "completed_at": task.completed_at,
            "error_message": task.error_message,
        }

    async def get_task_result(self, db: AsyncSession, task_id_str: str, user_id: int):
        task = await self.get_by_task_id(db, task_id_str)
        if not task:
            raise NotFoundException(detail="任务不存在")
        if task.user_id != user_id:
            raise ForbiddenException(detail="无权访问此任务")

        return task.result

    async def list_tasks(
        self,
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        task_type: Optional[str] = None,
    ) -> Tuple[List[ProofreadTask], int]:
        offset = (page - 1) * page_size

        query = select(ProofreadTask).where(ProofreadTask.user_id == user_id)

        if status:
            query = query.where(ProofreadTask.status == status)
        if task_type:
            query = query.where(ProofreadTask.task_type == task_type)

        query = query.order_by(desc(ProofreadTask.created_at)).offset(offset).limit(page_size)

        result = await db.execute(query)
        tasks = result.scalars().all()

        count_query = select(func.count()).select_from(ProofreadTask).where(ProofreadTask.user_id == user_id)
        if status:
            count_query = count_query.where(ProofreadTask.status == status)
        if task_type:
            count_query = count_query.where(ProofreadTask.task_type == task_type)

        count_result = await db.execute(count_query)
        total = count_result.scalar()

        return list(tasks), total

    async def update_correction_status(
        self,
        db: AsyncSession,
        correction_id: int,
        accepted: int,
        user_id: int,
    ) -> CorrectionItem:
        result = await db.execute(
            select(CorrectionItem)
            .join(TaskResult)
            .join(ProofreadTask)
            .where(CorrectionItem.id == correction_id, ProofreadTask.user_id == user_id)
        )
        correction = result.scalar_one_or_none()

        if not correction:
            raise NotFoundException(detail="校正项不存在或无权访问")

        correction.accepted = accepted
        await db.commit()
        await db.refresh(correction)
        return correction

    async def retry_task(self, db: AsyncSession, task_id_str: str, user_id: int) -> ProofreadTask:
        task = await self.get_by_task_id(db, task_id_str)
        if not task:
            raise NotFoundException(detail="任务不存在")
        if task.user_id != user_id:
            raise ForbiddenException(detail="无权访问此任务")

        task.status = "pending"
        task.progress = 0
        task.error_message = None
        task.started_at = None
        task.completed_at = None

        if task.result:
            await db.delete(task.result)

        await db.commit()
        await db.refresh(task)

        process_proofread_task.delay(task.task_id)

        return task


task_service = TaskService()
