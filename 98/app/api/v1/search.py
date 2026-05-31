from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.common import Response, PaginatedResponse, Pagination
from app.search.document_index import document_index

router = APIRouter()


@router.get("", response_model=PaginatedResponse[Dict[str, Any]])
async def search_documents(
    keyword: str = Query(..., description="搜索关键词"),
    industry: Optional[str] = Query(None, description="所属行业"),
    file_type: Optional[str] = Query(None, description="文件类型"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user),
):
    result = await document_index.search_documents(
        keyword=keyword,
        user_id=current_user.id,
        industry=industry,
        file_type=file_type,
        page=page,
        page_size=page_size,
    )

    total = result["total"]
    documents = result["documents"]
    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        data=documents,
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        ),
        message="搜索成功",
    )


@router.get("/health", response_model=Response[bool])
async def search_health():
    from app.search.es_client import es_client

    is_connected = es_client.client is not None and await es_client.client.ping()
    return Response(data=is_connected, message="获取成功")
