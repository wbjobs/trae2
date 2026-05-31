from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.polish import (
    PolishRequest,
    PolishResponse,
    DocumentPolishTask,
    VersionCompareRequest,
    VersionCompareResponse,
    TaskLog,
)
from app.schemas.common import Response, PaginatedResponse, Pagination
from app.services.polish_service import polish_service
from app.services.compare_service import compare_service
from app.services.task_log_service import task_log_service

router = APIRouter()


@router.post("/text", response_model=Response[PolishResponse])
async def polish_text(
    request: PolishRequest,
    current_user: User = Depends(get_current_user),
):
    result = await polish_service.polish_text(request)
    return Response(data=result, message="润色完成")


@router.post("/documents/{document_id}", response_model=Response[DocumentPolishTask])
async def create_polish_task(
    document_id: int,
    polish_type: str = Query("professional", description="润色类型: professional/concise/fluent/formal/creative"),
    tone: str = Query("formal", description="语气风格: formal/friendly/neutral/authoritative/persuasive"),
    industry: Optional[str] = Query(None, description="所属行业"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await polish_service.create_polish_task(
        db=db,
        document_id=document_id,
        polish_type=polish_type,
        tone=tone,
        user_id=current_user.id,
        industry=industry,
    )

    from app.tasks.polish_tasks import process_polish_task
    process_polish_task.apply_async(
        args=[task.task_id],
        priority=7,
        countdown=1,
    )

    return Response(data=task, message="润色任务提交成功")


@router.get("/tasks/{task_id}", response_model=Response[DocumentPolishTask])
async def get_polish_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await polish_service.get_task_by_id(db, task_id, current_user.id)
    return Response(data=task, message="获取成功")


@router.get("/tasks", response_model=PaginatedResponse[DocumentPolishTask])
async def list_polish_tasks(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    status: Optional[str] = Query(None, description="任务状态"),
    polish_type: Optional[str] = Query(None, description="润色类型"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select, desc
    from app.models.polish import DocumentPolishTask as DPT

    query = select(DPT).where(DPT.user_id == current_user.id)

    if status:
        query = query.where(DPT.status == status)
    if polish_type:
        query = query.where(DPT.polish_type == polish_type)

    query = query.order_by(desc(DPT.created_at))

    count_query = select(DPT.id).where(DPT.user_id == current_user.id)
    if status:
        count_query = count_query.where(DPT.status == status)
    if polish_type:
        count_query = count_query.where(DPT.polish_type == polish_type)

    total_result = await db.execute(count_query)
    total = len(list(total_result.scalars().all()))

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    tasks = list(result.scalars().all())

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


@router.post("/compare", response_model=Response[VersionCompareResponse])
async def compare_versions(
    request: VersionCompareRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.document import Document
    doc_result = await db.execute(
        select(Document).where(Document.id == request.document_id)
    )
    document = doc_result.scalar_one_or_none()
    if not document or document.user_id != current_user.id:
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException(detail="无权访问此文档")

    result = await compare_service.compare_versions(
        db=db,
        document_id=request.document_id,
        version1_id=request.version1_id,
        version2_id=request.version2_id,
        compare_type=request.compare_type,
    )
    return Response(data=result, message="对比完成")


@router.post("/compare/text", response_model=Response[VersionCompareResponse])
async def compare_texts(
    text1: str,
    text2: str,
    compare_type: str = Query("all", description="对比类型"),
    current_user: User = Depends(get_current_user),
):
    result = await compare_service.compare_texts(text1, text2, compare_type)
    return Response(data=result, message="对比完成")


@router.get("/tasks/{task_id}/logs", response_model=Response[List[TaskLog]])
async def get_task_logs(
    task_id: str,
    limit: int = Query(100, ge=1, le=500, description="日志数量限制"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = await task_log_service.get_task_logs(
        db=db,
        task_id=task_id,
        user_id=current_user.id,
        limit=limit,
    )
    return Response(data=logs, message="获取成功")


@router.get("/tasks/failed", response_model=Response[List[dict]])
async def get_failed_tasks(
    hours: int = Query(24, ge=1, le=168, description="查询时间范围（小时）"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    failed_tasks = await task_log_service.get_failed_tasks(
        db=db,
        user_id=current_user.id,
        hours=hours,
    )
    return Response(data=failed_tasks, message="获取成功")


@router.post("/tasks/retry", response_model=Response[dict])
async def retry_failed_tasks(
    task_ids: Optional[List[str]] = Query(None, description="指定任务ID列表，为空则重试所有失败任务"),
    max_retries: int = Query(3, ge=1, le=10, description="最大重试次数"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await task_log_service.retry_failed_tasks(
        db=db,
        user_id=current_user.id,
        task_ids=task_ids,
        max_retries=max_retries,
    )
    return Response(data=result, message="重试操作完成")
