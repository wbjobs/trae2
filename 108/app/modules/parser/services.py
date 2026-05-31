import os
import aiofiles
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sanic.request import File
from app.core import settings, log, BadRequestException, NotFoundException
from app.models import Document, Law, Case
from .document_parser import parse_document, ParserFactory
from .law_extractor import law_extractor


class DocumentService:
    ALLOWED_EXTENSIONS = set(['.pdf', '.docx', '.doc', '.txt'])
    MAX_FILE_SIZE = 50 * 1024 * 1024

    @staticmethod
    async def save_uploaded_file(file: File, uploader_id: int, doc_type: str = "auto") -> Document:
        if not file.name:
            raise BadRequestException("文件名不能为空")

        file_ext = os.path.splitext(file.name)[1].lower()
        if file_ext not in settings.allowed_extensions_list:
            raise BadRequestException(f"不支持的文件类型。支持类型: {', '.join(settings.allowed_extensions_list)}")

        if len(file.body) > settings.MAX_FILE_SIZE:
            raise BadRequestException(f"文件大小超过限制。最大限制: {settings.MAX_FILE_SIZE // 1024 // 1024}MB")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{file.name.replace(' ', '_')}"
        file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file.body)

        document = Document(
            title=os.path.splitext(file.name)[0],
            file_name=file.name,
            file_path=file_path,
            file_type=file_ext,
            file_size=len(file.body),
            doc_type=doc_type,
            status="pending",
            uploader_id=uploader_id
        )

        return document

    @staticmethod
    async def parse_and_extract(db: AsyncSession, document_id: int) -> Tuple[List[Law], List[Case]]:
        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()
        if not document:
            raise NotFoundException("文档不存在")

        try:
            document.status = "parsing"
            await db.commit()

            parsed_data = parse_document(document.file_path, document.file_type)
            document.content = parsed_data.get("content", "")
            document.parsed_content = parsed_data

            if document.doc_type == "auto":
                document.doc_type = DocumentService._detect_doc_type(document.content)

            laws = []
            cases = []

            if document.doc_type in ["law", "auto"]:
                extracted_laws = law_extractor.extract_laws(document.content, source=document.title)
                for law_data in extracted_laws:
                    law = Law(
                        **law_data,
                        document_id=document.id
                    )
                    db.add(law)
                    laws.append(law)

            if document.doc_type in ["case", "auto"]:
                extracted_cases = law_extractor.extract_cases(document.content, source=document.title)
                for case_data in extracted_cases:
                    case = Case(
                        **case_data,
                        document_id=document.id
                    )
                    db.add(case)
                    cases.append(case)

            document.status = "completed"
            await db.commit()

            for law in laws:
                await db.refresh(law)
            for case in cases:
                await db.refresh(case)

            log.info(f"文档 {document_id} 解析完成: 提取到 {len(laws)} 条法条, {len(cases)} 个案例")
            return laws, cases

        except Exception as e:
            log.error(f"文档解析失败: {str(e)}")
            document.status = "failed"
            document.error_message = str(e)
            await db.commit()
            raise

    @staticmethod
    async def batch_parse_documents(db: AsyncSession, document_ids: List[int]) -> Dict[str, Any]:
        results = {
            "total": len(document_ids),
            "success": 0,
            "failed": 0,
            "laws_extracted": 0,
            "cases_extracted": 0
        }

        for doc_id in document_ids:
            try:
                laws, cases = await DocumentService.parse_and_extract(db, doc_id)
                results["success"] += 1
                results["laws_extracted"] += len(laws)
                results["cases_extracted"] += len(cases)
            except Exception:
                results["failed"] += 1

        return results

    @staticmethod
    async def get_document(db: AsyncSession, document_id: int) -> Optional[Document]:
        result = await db.execute(select(Document).where(Document.id == document_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def list_documents(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        doc_type: Optional[str] = None,
        status: Optional[str] = None,
        uploader_id: Optional[int] = None,
        keyword: Optional[str] = None
    ) -> Tuple[List[Document], int]:
        query = select(Document)

        if doc_type:
            query = query.where(Document.doc_type == doc_type)
        if status:
            query = query.where(Document.status == status)
        if uploader_id:
            query = query.where(Document.uploader_id == uploader_id)
        if keyword:
            query = query.where(
                (Document.title.contains(keyword)) |
                (Document.file_name.contains(keyword))
            )

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar()

        result = await db.execute(query.offset(skip).limit(limit).order_by(Document.id.desc()))
        documents = result.scalars().all()
        return documents, total

    @staticmethod
    async def delete_document(db: AsyncSession, document_id: int) -> bool:
        document = await DocumentService.get_document(db, document_id)
        if not document:
            raise NotFoundException("文档不存在")

        if os.path.exists(document.file_path):
            os.remove(document.file_path)

        await db.delete(document)
        await db.commit()
        return True

    @staticmethod
    def _detect_doc_type(content: str) -> str:
        law_keywords = ["中华人民共和国", "第.*条", "法律", "条例", "规定", "办法", "法条"]
        case_keywords = ["判决书", "裁定书", "调解书", "人民法院", "原告", "被告", "本院查明", "判决如下"]

        content_preview = content[:2000]
        law_score = sum(1 for kw in law_keywords if kw in content_preview or (isinstance(kw, str) and kw in content_preview))
        case_score = sum(1 for kw in case_keywords if kw in content_preview)

        if case_score > law_score:
            return "case"
        elif law_score > case_score:
            return "law"
        else:
            return "law"
