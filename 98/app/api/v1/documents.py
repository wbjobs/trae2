from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.document import Document, DocumentUpdate
from app.schemas.common import Response, PaginatedResponse, Pagination
from app.services.document_service import document_service
from app.search.document_index import document_index

router = APIRouter()


@router.post("/upload", response_model=Response[Document])
async def upload_document(
    file: UploadFile = File(..., description="文档文件"),
    title: Optional[str] = Form(None, description="文档标题"),
    industry: Optional[str] = Form(None, description="所属行业"),
    password: Optional[str] = Form(None, description="文档密码（用于加密文档）"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_content = await file.read()
    document = await document_service.create_document(
        db=db,
        file_content=file_content,
        filename=file.filename,
        title=title or file.filename,
        user_id=current_user.id,
        industry=industry,
        password=password,
    )

    await document_index.index_document(document)

    return Response(data=document, message="文档上传并解析成功")


@router.get("", response_model=PaginatedResponse[Document])
async def list_documents(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    status: Optional[str] = Query(None, description="文档状态"),
    industry: Optional[str] = Query(None, description="所属行业"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    documents, total = await document_service.list_documents(
        db=db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        status=status,
        industry=industry,
    )

    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        data=documents,
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        ),
        message="获取成功",
    )


@router.get("/{doc_id}", response_model=Response[Document])
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await document_service.check_owner(db, doc_id, current_user.id)
    document = await document_service.get_by_id(db, doc_id)
    return Response(data=document, message="获取成功")


@router.put("/{doc_id}", response_model=Response[Document])
async def update_document(
    doc_id: int,
    doc_in: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await document_service.update_document(db, doc_id, doc_in, current_user.id)
    await document_index.index_document(document)
    return Response(data=document, message="更新成功")


@router.delete("/{doc_id}", response_model=Response[bool])
async def delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await document_service.delete_document(db, doc_id, current_user.id)
    await document_index.delete_document(doc_id)
    return Response(data=True, message="删除成功")
