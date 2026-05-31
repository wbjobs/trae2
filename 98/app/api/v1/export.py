from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import NotFoundException
from app.models.user import User
from app.schemas.common import Response
from app.services.export_service import export_service
from app.services.task_service import task_service

router = APIRouter()


@router.get("/task/{task_id}")
async def export_task_result(
    task_id: str,
    format_type: str = Query("docx", description="导出格式: docx/txt/md/html"),
    filename: Optional[str] = Query(None, description="文件名"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await task_service.get_by_task_id(db, task_id)
    if not task or task.user_id != current_user.id:
        raise NotFoundException(detail="任务不存在或无权访问")

    if not task.result:
        raise NotFoundException(detail="任务结果不存在")

    file_path = export_service.export_task_result(
        result=task.result,
        user_id=current_user.id,
        format_type=format_type,
        filename=filename,
    )

    actual_path = export_service.get_export_file_path(file_path)
    if not actual_path:
        raise NotFoundException(detail="导出文件不存在")

    media_types = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt": "text/plain",
        "md": "text/markdown",
        "html": "text/html",
    }

    return FileResponse(
        path=actual_path,
        media_type=media_types.get(format_type, "application/octet-stream"),
        filename=f"{filename or 'result'}.{format_type}",
    )


@router.post("/content", response_model=Response[str])
async def export_content(
    content: str,
    title: Optional[str] = None,
    format_type: str = "docx",
    current_user: User = Depends(get_current_user),
):
    if format_type == "txt":
        file_path = export_service.export_to_txt(content, current_user.id, title or "document")
    elif format_type == "docx":
        file_path = export_service.export_to_docx(content, current_user.id, title or "document", title)
    elif format_type == "md":
        file_path = export_service.export_to_markdown(content, current_user.id, title or "document", title)
    elif format_type == "html":
        file_path = export_service.export_to_html(content, current_user.id, title or "document", title)
    else:
        raise ValueError(f"不支持的导出格式: {format_type}")

    return Response(data=file_path, message="导出成功")
