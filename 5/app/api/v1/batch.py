import logging
from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.schemas import (
    BatchExtractionRequest,
    BatchExtractionResponse,
    BatchProgressResponse,
    BatchResultsResponse,
    BatchTaskResultItem,
    BatchListResponse,
    SchemaField,
    TaskStatus
)
from app.models import BatchStatus
from app.crud import (
    get_batch_by_id, get_batch_tasks, get_batches, get_batch_stats
)
from app.core.rate_limiter import limiter
from app.core.batch_service import batch_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/batch", tags=["批量抽取"])


@router.post(
    "/extract",
    response_model=BatchExtractionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="提交批量抽取任务"
)
@limiter.limit("20/minute")
async def batch_extract(
    request: Request,
    batch_request: BatchExtractionRequest,
    db: Session = Depends(get_db)
):
    batch = await batch_service.create_and_process_batch(db, batch_request)

    return BatchExtractionResponse(
        batch_id=batch.batch_id,
        total_count=batch.total_count,
        status=batch.status,
        created_at=batch.created_at
    )


@router.get(
    "/progress/{batch_id}",
    response_model=BatchProgressResponse,
    summary="查询批量任务进度"
)
@limiter.limit("120/minute")
async def get_batch_progress(
    request: Request,
    batch_id: str,
    db: Session = Depends(get_db)
):
    batch = get_batch_by_id(db, batch_id)
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"批量任务 {batch_id} 不存在"
        )

    progress = batch_service.get_batch_progress(db, batch_id)

    return BatchProgressResponse(**progress)


@router.get(
    "/results/{batch_id}",
    response_model=BatchResultsResponse,
    summary="查询批量任务完整结果"
)
@limiter.limit("60/minute")
async def get_batch_results(
    request: Request,
    batch_id: str,
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(100, ge=1, le=500, description="每页数量"),
    status_filter: Optional[TaskStatus] = Query(None, description="按任务状态过滤"),
    db: Session = Depends(get_db)
):
    batch = get_batch_by_id(db, batch_id)
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"批量任务 {batch_id} 不存在"
        )

    progress = batch_service.get_batch_progress(db, batch_id)

    total, tasks = get_batch_tasks(db, batch_id, status=status_filter, skip=skip, limit=limit)

    results = []
    for i, task in enumerate(tasks):
        results.append(BatchTaskResultItem(
            task_id=task.task_id,
            status=task.status,
            result=task.result,
            error_message=task.error_message,
            text_index=i + skip,
            metadata=getattr(task, 'metadata', None)
        ))

    return BatchResultsResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_count=batch.total_count,
        completed_count=progress["completed_count"],
        failed_count=progress["failed_count"],
        progress_percent=progress["progress_percent"],
        results=results
    )


@router.get(
    "/tasks",
    response_model=BatchListResponse,
    summary="获取批量任务列表"
)
@limiter.limit("60/minute")
async def list_batches(
    request: Request,
    status: Optional[BatchStatus] = Query(None, description="批量任务状态过滤"),
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db)
):
    total, batches = get_batches(db, status=status, skip=skip, limit=limit)

    items = []
    for batch in batches:
        progress = batch_service.get_batch_progress(db, batch.batch_id)
        items.append(BatchProgressResponse(**progress))

    return BatchListResponse(
        total=total,
        items=items
    )


@router.get(
    "/summary",
    summary="批量任务统计概览"
)
@limiter.limit("60/minute")
async def batch_summary(
    request: Request,
    db: Session = Depends(get_db)
):
    total_all, _ = get_batches(db)
    total_pending, _ = get_batches(db, status=BatchStatus.PENDING)
    total_processing, _ = get_batches(db, status=BatchStatus.PROCESSING)
    total_completed, _ = get_batches(db, status=BatchStatus.COMPLETED)
    total_partial, _ = get_batches(db, status=BatchStatus.PARTIAL_COMPLETED)
    total_failed, _ = get_batches(db, status=BatchStatus.FAILED)

    return {
        "total_batches": total_all,
        "by_status": {
            "pending": total_pending,
            "processing": total_processing,
            "completed": total_completed,
            "partial_completed": total_partial,
            "failed": total_failed
        }
    }
