from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_superuser
from app.models.user import User
from app.schemas.user import UserUpdate
from app.schemas.common import Response, PaginatedResponse, Pagination
from app.services.user_service import user_service

router = APIRouter()


@router.get("/users", response_model=PaginatedResponse[User])
async def list_users(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    users, total = await user_service.list_users(db, page, page_size)
    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        data=users,
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        ),
        message="获取成功",
    )


@router.get("/users/{user_id}", response_model=Response[User])
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    user = await user_service.get_by_id(db, user_id)
    return Response(data=user, message="获取成功")


@router.put("/users/{user_id}", response_model=Response[User])
async def update_user(
    user_id: int,
    user_in: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    user = await user_service.update_user(db, user_id, user_in)
    return Response(data=user, message="更新成功")


@router.delete("/users/{user_id}", response_model=Response[bool])
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    await user_service.delete_user(db, user_id)
    return Response(data=True, message="删除成功")


@router.get("/stats", response_model=Response[dict])
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    from sqlalchemy import func, select
    from app.models.document import Document
    from app.models.task import ProofreadTask

    user_count = await db.scalar(select(func.count()).select_from(User))
    doc_count = await db.scalar(select(func.count()).select_from(Document))
    task_count = await db.scalar(select(func.count()).select_from(ProofreadTask))

    return Response(
        data={
            "user_count": user_count,
            "document_count": doc_count,
            "task_count": task_count,
        },
        message="获取成功",
    )
