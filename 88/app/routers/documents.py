import uuid
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.dependencies import get_current_user, require_upload
from app.config import get_settings
from app.database import get_db
from app.document_parser.base import parse_document, EmptyFileError, EncryptedFileError, UnsupportedFormatError
from app.models import User, Document
from app.schemas import DocumentOut, DocumentDetailOut, BatchUploadResponse, APIResponse
from app.semantic_search.indexer import index_document

router = APIRouter(prefix="/documents", tags=["文档管理"])
settings = get_settings()


@router.post("/upload", response_model=BatchUploadResponse)
async def upload_documents(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(require_upload),
    db: AsyncSession = Depends(get_db),
):
    uploaded = []
    errors = []

    for file in files:
        ext = Path(file.filename).suffix.lstrip(".").lower()
        if ext not in settings.allowed_extensions_list:
            errors.append({"filename": file.filename, "error": f"Unsupported file type: {ext}"})
            continue

        content = await file.read()
        if len(content) == 0:
            errors.append({"filename": file.filename, "error": "File is empty"})
            continue

        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            errors.append({"filename": file.filename, "error": "File too large"})
            continue

        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)

        file_id = uuid.uuid4().hex[:12]
        saved_filename = f"{file_id}_{file.filename}"
        saved_path = upload_dir / saved_filename

        with open(saved_path, "wb") as f:
            f.write(content)

        doc = Document(
            filename=saved_filename,
            original_name=file.filename,
            file_type=ext,
            file_size=len(content),
            file_path=str(saved_path),
            status="uploaded",
            owner_id=current_user.id,
        )
        db.add(doc)
        await db.flush()

        try:
            parsed_content = parse_document(str(saved_path), ext)
            doc.content = parsed_content
            doc.status = "parsed"
        except EmptyFileError:
            doc.status = "parse_failed"
            doc.content = ""
        except EncryptedFileError:
            doc.status = "encrypted"
            doc.content = "[加密文档] 无法解析加密的PDF文件"
        except UnsupportedFormatError as e:
            doc.status = "parse_failed"
            doc.content = ""
        except Exception as e:
            doc.status = "parse_failed"

        await db.flush()

        try:
            await index_document(
                document_id=doc.id,
                filename=doc.filename,
                original_name=doc.original_name,
                content=doc.content or "",
                file_type=doc.file_type,
                owner_id=doc.owner_id,
                created_at=doc.created_at.isoformat() if doc.created_at else "",
            )
        except Exception:
            pass

        uploaded.append(DocumentOut.model_validate(doc))

    await db.commit()
    return BatchUploadResponse(uploaded=uploaded, errors=errors)


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    skip: int = 0,
    limit: int = 20,
    status_filter: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).where(Document.owner_id == current_user.id)
    if status_filter:
        query = query.where(Document.status == status_filter)
    query = query.offset(skip).limit(limit).order_by(Document.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{document_id}", response_model=DocumentDetailOut)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    return doc


@router.delete("/{document_id}", response_model=APIResponse)
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        os.remove(doc.file_path)
    except OSError:
        pass

    from app.semantic_search.indexer import delete_document_index
    try:
        await delete_document_index(document_id)
    except Exception:
        pass

    await db.delete(doc)
    await db.commit()
    return APIResponse(success=True, message="Document deleted")
