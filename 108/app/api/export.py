import os
from sanic import Blueprint, Request
from sanic.response import file
from pydantic import BaseModel, Field
from typing import Optional
from app.core import settings, success, get_db, NotFoundException, log
from app.modules.auth import login_required, permission_required
from app.modules.export import ExportService
from app.modules.search import SearchService

export_bp = Blueprint("export", url_prefix="/api/export")


class ExportRequest(BaseModel):
    task_id: Optional[int] = None
    export_format: str = Field("excel", description="导出格式: excel/pdf/json")
    include_analysis: bool = True


class SearchExportRequest(BaseModel):
    keyword: str = ""
    search_type: str = Field("law", description="检索类型: law/case")
    export_format: str = Field("excel", description="导出格式: excel/pdf/json")
    law_type: Optional[str] = None
    case_type: Optional[str] = None


@export_bp.post("/comparison")
@login_required()
@permission_required("export:download")
async def export_comparison(request: Request):
    req = ExportRequest(**request.json)

    if not req.task_id:
        raise NotFoundException("请指定任务ID")

    async with get_db() as db:
        from app.models import Task
        task = await db.get(Task, req.task_id)
        if not task:
            raise NotFoundException("任务不存在")

        if task.status != "completed":
            raise NotFoundException(f"任务尚未完成，当前状态: {task.status}")

        filename = await ExportService.export_comparison_results(
            db, req.task_id, req.export_format, req.include_analysis
        )

        return success({
            "download_url": f"/api/export/download/{filename}",
            "filename": filename,
            "format": req.export_format
        }, "导出成功")


@export_bp.post("/search")
@login_required()
@permission_required("export:download")
async def export_search_results(request: Request):
    req = SearchExportRequest(**request.json)

    if req.search_type == "law":
        result = await SearchService.search_laws(
            keyword=req.keyword,
            law_type=req.law_type,
            search_type="hybrid",
            page=1,
            page_size=1000
        )
    else:
        result = await SearchService.search_cases(
            keyword=req.keyword,
            case_type=req.case_type,
            search_type="hybrid",
            page=1,
            page_size=1000
        )

    filename = await ExportService.export_search_results(
        result["hits"],
        req.search_type,
        req.keyword,
        req.export_format
    )

    return success({
        "download_url": f"/api/export/download/{filename}",
        "filename": filename,
        "total": result["total"],
        "exported": len(result["hits"])
    }, "导出成功")


@export_bp.get("/download/<filename:str>")
@login_required()
@permission_required("export:download")
async def download_file(request: Request, filename: str):
    filepath = os.path.join(settings.EXPORT_DIR, filename)

    if not os.path.exists(filepath):
        raise NotFoundException("文件不存在")

    log.info(f"下载文件: {filename}")

    if filename.endswith(".xlsx"):
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif filename.endswith(".pdf"):
        content_type = "application/pdf"
    elif filename.endswith(".json"):
        content_type = "application/json"
    elif filename.endswith(".docx"):
        content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        content_type = "application/octet-stream"

    return await file(
        filepath,
        filename=filename,
        content_type=content_type
    )


@export_bp.get("/list")
@login_required()
@permission_required("export:download")
async def list_export_files(request: Request):
    export_dir = settings.EXPORT_DIR
    files = []

    if os.path.exists(export_dir):
        for filename in os.listdir(export_dir):
            filepath = os.path.join(export_dir, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                files.append({
                    "filename": filename,
                    "size": stat.st_size,
                    "created_at": stat.st_ctime,
                    "download_url": f"/api/export/download/{filename}"
                })

    files.sort(key=lambda x: x["created_at"], reverse=True)
    return success(files[:50])


@export_bp.delete("/<filename:str>")
@login_required()
@permission_required("export:download")
async def delete_export_file(request: Request, filename: str):
    filepath = os.path.join(settings.EXPORT_DIR, filename)

    if not os.path.exists(filepath):
        raise NotFoundException("文件不存在")

    os.remove(filepath)
    log.info(f"删除导出文件: {filename}")
    return success(message="删除成功")
