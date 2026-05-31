from sanic import Blueprint, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from app.core import success, paginated_response, get_db, NotFoundException
from app.modules.auth import login_required, permission_required
from app.modules.parser import DocumentService

document_bp = Blueprint("document", url_prefix="/api/documents")


class ParseBatchRequest(BaseModel):
    document_ids: List[int] = Field(..., description="文档ID列表")


class DocumentTypeRequest(BaseModel):
    doc_type: str = Field(..., description="文档类型: law/case/auto")


@document_bp.post("/upload")
@login_required()
@permission_required("document:upload")
async def upload_document(request: Request):
    user = request.ctx.user
    doc_type = request.args.get("doc_type", "auto")

    if not request.files or "file" not in request.files:
        raise NotFoundException("请选择要上传的文件")

    file = request.files.get("file")
    if not file:
        raise NotFoundException("文件为空")

    async with get_db() as db:
        document = await DocumentService.save_uploaded_file(file, user.id, doc_type)
        db.add(document)
        await db.commit()
        await db.refresh(document)

        from app.modules.tasks import TaskService, TaskType
        task = await TaskService.create_task(
            db,
            name=f"解析文档: {document.title}",
            task_type=TaskType.PARSE_DOCUMENT,
            params={"document_id": document.id},
            creator_id=user.id
        )

        return success({
            "document_id": document.id,
            "task_id": task.id,
            "title": document.title,
            "file_name": document.file_name,
            "file_size": document.file_size,
            "doc_type": document.doc_type,
            "status": document.status
        }, "文件上传成功，已提交解析任务")


@document_bp.post("/batch-upload")
@login_required()
@permission_required("document:upload")
async def batch_upload_documents(request: Request):
    user = request.ctx.user
    doc_type = request.args.get("doc_type", "auto")

    if not request.files:
        raise NotFoundException("请选择要上传的文件")

    files = request.files.getlist("file")
    results = []
    document_ids = []

    async with get_db() as db:
        for file in files:
            document = await DocumentService.save_uploaded_file(file, user.id, doc_type)
            db.add(document)
            await db.commit()
            await db.refresh(document)
            document_ids.append(document.id)
            results.append({
                "document_id": document.id,
                "title": document.title,
                "file_name": document.file_name,
                "file_size": document.file_size
            })

        from app.modules.tasks import TaskService, TaskType
        task = await TaskService.create_task(
            db,
            name=f"批量解析 {len(document_ids)} 个文档",
            task_type=TaskType.PARSE_BATCH,
            params={"document_ids": document_ids},
            creator_id=user.id
        )

        return success({
            "documents": results,
            "task_id": task.id,
            "total": len(results)
        }, f"成功上传 {len(results)} 个文件")


@document_bp.get("")
@login_required()
@permission_required("document:view")
async def list_documents(request: Request):
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    doc_type = request.args.get("doc_type")
    status = request.args.get("status")
    keyword = request.args.get("keyword")

    async with get_db() as db:
        documents, total = await DocumentService.list_documents(
            db,
            skip=(page - 1) * page_size,
            limit=page_size,
            doc_type=doc_type,
            status=status,
            keyword=keyword
        )

        doc_list = [{
            "id": d.id,
            "title": d.title,
            "file_name": d.file_name,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "doc_type": d.doc_type,
            "status": d.status,
            "error_message": d.error_message,
            "uploader_id": d.uploader_id,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None
        } for d in documents]

        return paginated_response(doc_list, total, page, page_size)


@document_bp.get("/<document_id:int>")
@login_required()
@permission_required("document:view")
async def get_document(request: Request, document_id: int):
    async with get_db() as db:
        document = await DocumentService.get_document(db, document_id)
        if not document:
            raise NotFoundException("文档不存在")

        return success({
            "id": document.id,
            "title": document.title,
            "file_name": document.file_name,
            "file_type": document.file_type,
            "file_size": document.file_size,
            "doc_type": document.doc_type,
            "content": document.content,
            "parsed_content": document.parsed_content,
            "status": document.status,
            "error_message": document.error_message,
            "created_at": document.created_at.isoformat() if document.created_at else None
        })


@document_bp.post("/<document_id:int>/reparse")
@login_required()
@permission_required("document:upload")
async def reparse_document(request: Request, document_id: int):
    user = request.ctx.user
    async with get_db() as db:
        document = await DocumentService.get_document(db, document_id)
        if not document:
            raise NotFoundException("文档不存在")

        document.status = "pending"
        document.error_message = None
        await db.commit()

        from app.modules.tasks import TaskService, TaskType
        task = await TaskService.create_task(
            db,
            name=f"重新解析: {document.title}",
            task_type=TaskType.PARSE_DOCUMENT,
            params={"document_id": document.id},
            creator_id=user.id
        )

        return success({"task_id": task.id}, "已提交重新解析任务")


@document_bp.post("/batch-parse")
@login_required()
@permission_required("document:upload")
async def batch_parse(request: Request):
    user = request.ctx.user
    req = ParseBatchRequest(**request.json)

    async with get_db() as db:
        from app.modules.tasks import TaskService, TaskType
        task = await TaskService.create_task(
            db,
            name=f"批量解析 {len(req.document_ids)} 个文档",
            task_type=TaskType.PARSE_BATCH,
            params={"document_ids": req.document_ids},
            creator_id=user.id
        )
        return success({"task_id": task.id}, "已提交批量解析任务")


@document_bp.delete("/<document_id:int>")
@login_required()
@permission_required("document:delete")
async def delete_document(request: Request, document_id: int):
    async with get_db() as db:
        await DocumentService.delete_document(db, document_id)
        return success(message="删除成功")


@document_bp.put("/<document_id:int>/type")
@login_required()
@permission_required("document:upload")
async def update_document_type(request: Request, document_id: int):
    req = DocumentTypeRequest(**request.json)
    async with get_db() as db:
        document = await DocumentService.get_document(db, document_id)
        if not document:
            raise NotFoundException("文档不存在")

        document.doc_type = req.doc_type
        await db.commit()
        return success({"doc_type": document.doc_type}, "文档类型更新成功")
