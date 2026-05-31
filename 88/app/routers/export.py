from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models import User, Document
from app.schemas import ExportRequest, APIResponse
from app.export.json_exporter import JsonExporter
from app.export.csv_exporter import CsvExporter
from app.export.excel_exporter import ExcelExporter

router = APIRouter(prefix="/export", tags=["结果导出"])


@router.post("")
async def export_documents(
    request: ExportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    documents = []
    for doc_id in request.document_ids:
        result = await db.execute(select(Document).where(Document.id == doc_id))
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
        if doc.owner_id != current_user.id and current_user.role != "admin":
            raise HTTPException(status_code=403, detail=f"Access denied for document: {doc_id}")

        doc_dict = {
            "id": doc.id,
            "original_name": doc.original_name,
            "file_type": doc.file_type,
            "file_size": doc.file_size,
            "status": doc.status,
            "created_at": str(doc.created_at),
        }
        if request.include_content:
            doc_dict["content"] = doc.content
        if request.include_summary:
            doc_dict["summary"] = doc.summary
        if request.include_keywords:
            doc_dict["keywords"] = doc.keywords
        if request.include_correction:
            doc_dict["correction"] = doc.correction
        documents.append(doc_dict)

    options = {
        "include_content": request.include_content,
        "include_summary": request.include_summary,
        "include_keywords": request.include_keywords,
        "include_correction": request.include_correction,
    }

    if request.export_format == "json":
        exporter = JsonExporter()
    elif request.export_format == "csv":
        exporter = CsvExporter()
    elif request.export_format == "excel":
        exporter = ExcelExporter()
    else:
        raise HTTPException(status_code=400, detail="Unsupported export format")

    filepath = await exporter.export(documents, options)

    from pathlib import Path
    return FileResponse(
        path=filepath,
        filename=Path(filepath).name,
        media_type="application/octet-stream",
    )


@router.get("/download/{filename}")
async def download_export(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    from pathlib import Path
    from app.config import get_settings
    settings = get_settings()

    filepath = Path(settings.EXPORT_DIR) / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="application/octet-stream",
    )
