import os
import uuid
from typing import Optional, List, Tuple
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.config import get_settings
from app.core.exceptions import (
    NotFoundException,
    FileTooLargeException,
    UnsupportedFileTypeException,
    DocumentParseException,
    ForbiddenException,
)
from app.models.document import Document
from app.models.user import User
from app.schemas.document import DocumentCreate, DocumentUpdate
from app.parsers.parser_factory import parser_factory

settings = get_settings()


class DocumentService:
    def __init__(self):
        self.upload_dir = Path(settings.upload_dir)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def get_by_id(self, db: AsyncSession, doc_id: int) -> Optional[Document]:
        result = await db.execute(select(Document).where(Document.id == doc_id))
        return result.scalar_one_or_none()

    async def check_owner(self, db: AsyncSession, doc_id: int, user_id: int) -> bool:
        doc = await self.get_by_id(db, doc_id)
        if not doc:
            raise NotFoundException(detail="文档不存在")
        if doc.owner_id != user_id:
            raise ForbiddenException(detail="无权访问此文档")
        return True

    async def save_uploaded_file(
        self,
        file_content: bytes,
        filename: str,
        user_id: int,
    ) -> Tuple[str, str, int]:
        file_ext = os.path.splitext(filename)[1].lower()

        if not parser_factory.supports(file_ext):
            raise UnsupportedFileTypeException(
                detail=f"不支持的文件类型: {file_ext}。支持的类型: {settings.allowed_extensions}"
            )

        file_size = len(file_content)
        if file_size > settings.max_file_size:
            raise FileTooLargeException(
                detail=f"文件大小超过限制，最大允许: {settings.max_file_size // 1024 // 1024}MB"
            )

        unique_filename = f"{uuid.uuid4().hex}{file_ext}"
        user_dir = self.upload_dir / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)
        file_path = user_dir / unique_filename

        with open(file_path, "wb") as f:
            f.write(file_content)

        return str(file_path), unique_filename, file_size

    def parse_document(self, file_path: str, file_ext: str, password: Optional[str] = None):
        parser = parser_factory.get_parser(file_ext)
        if not parser:
            raise UnsupportedFileTypeException(detail=f"不支持的文件类型: {file_ext}")

        result = parser.parse(file_path, password=password)
        if not result.success:
            raise DocumentParseException(detail=result.error or "文档解析失败")

        return result

    async def create_document(
        self,
        db: AsyncSession,
        file_content: bytes,
        filename: str,
        title: str,
        user_id: int,
        industry: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Document:
        file_path, stored_filename, file_size = await self.save_uploaded_file(
            file_content, filename, user_id
        )

        file_ext = os.path.splitext(filename)[1].lower()
        parse_result = self.parse_document(file_path, file_ext, password=password)

        doc_in = DocumentCreate(
            title=title or os.path.splitext(filename)[0],
            filename=filename,
            file_path=file_path,
            file_size=file_size,
            file_type=file_ext,
            content=parse_result.content,
            industry=industry,
        )

        document = Document(
            title=doc_in.title,
            filename=doc_in.filename,
            file_path=doc_in.file_path,
            file_size=doc_in.file_size,
            file_type=doc_in.file_type,
            content=doc_in.content,
            industry=doc_in.industry,
            owner_id=user_id,
            status="parsed",
        )

        db.add(document)
        await db.commit()
        await db.refresh(document)

        return document

    async def update_document(
        self, db: AsyncSession, doc_id: int, doc_in: DocumentUpdate, user_id: int
    ) -> Document:
        await self.check_owner(db, doc_id, user_id)
        document = await self.get_by_id(db, doc_id)

        update_data = doc_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(document, field, value)

        document.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(document)

        return document

    async def delete_document(self, db: AsyncSession, doc_id: int, user_id: int) -> bool:
        await self.check_owner(db, doc_id, user_id)
        document = await self.get_by_id(db, doc_id)

        if os.path.exists(document.file_path):
            os.remove(document.file_path)

        await db.delete(document)
        await db.commit()
        return True

    async def list_documents(
        self,
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        industry: Optional[str] = None,
    ) -> Tuple[List[Document], int]:
        offset = (page - 1) * page_size

        query = select(Document).where(Document.owner_id == user_id)

        if status:
            query = query.where(Document.status == status)
        if industry:
            query = query.where(Document.industry == industry)

        query = query.order_by(Document.created_at.desc()).offset(offset).limit(page_size)

        result = await db.execute(query)
        documents = result.scalars().all()

        count_query = select(func.count()).select_from(Document).where(Document.owner_id == user_id)
        if status:
            count_query = count_query.where(Document.status == status)
        if industry:
            count_query = count_query.where(Document.industry == industry)

        count_result = await db.execute(count_query)
        total = count_result.scalar()

        return list(documents), total


document_service = DocumentService()
