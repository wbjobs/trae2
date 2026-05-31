from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.task import (
    ProofreadTask,
    TaskCreate,
    TaskResult,
    TaskStatus,
)
from app.schemas.common import Response, PaginatedResponse, Pagination
from app.services.task_service import task_service

router = APIRouter()


@router.post("/submit", response_model=Response[ProofreadTask])
async def submit_task(
    task_in: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await task_service.submit_task(db, task_in, current_user)
    return Response(data=task, message="任务提交成功")


@router.post("/batch", response_model=Response)
async def submit_batch_tasks(
    document_ids: List[int],
    task_type: str = "full",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await task_service.submit_batch_tasks(
        db=db,
        document_ids=document_ids,
        task_type=task_type,
        user_id=current_user.id,
    )
    return Response(data=result, message="批量任务提交成功")


@router.get("/{task_id}/status", response_model=Response[TaskStatus])
async def get_task_status(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    status = await task_service.get_task_status(db, task_id, current_user.id)
    return Response(data=TaskStatus(**status), message="获取成功")


@router.get("/{task_id}/result", response_model=Response[TaskResult])
async def get_task_result(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await task_service.get_task_result(db, task_id, current_user.id)
    return Response(data=result, message="获取成功")


@router.get("", response_model=PaginatedResponse[ProofreadTask])
async def list_tasks(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    status: Optional[str] = Query(None, description="任务状态"),
    task_type: Optional[str] = Query(None, description="任务类型"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks, total = await task_service.list_tasks(
        db=db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        status=status,
        task_type=task_type,
    )

    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        data=tasks,
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        ),
        message="获取成功",
    )


@router.post("/{task_id}/retry", response_model=Response[ProofreadTask])
async def retry_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await task_service.retry_task(db, task_id, current_user.id)
    return Response(data=task, message="任务重试成功")


@router.patch("/corrections/{correction_id}/accept")
async def accept_correction(
    correction_id: int,
    accepted: int = 1,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    correction = await task_service.update_correction_status(
        db=db,
        correction_id=correction_id,
        accepted=accepted,
        user_id=current_user.id,
    )
    return Response(data=correction, message="状态更新成功")
