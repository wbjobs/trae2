from sanic import Blueprint, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from app.core import success, paginated_response, get_db, NotFoundException, BadRequestException
from app.modules.auth import login_required, permission_required
from app.modules.tasks import TaskService, TaskStatus

task_bp = Blueprint("task", url_prefix="/api/tasks")


class CreateTaskRequest(BaseModel):
    name: str = Field(..., description="任务名称")
    task_type: str = Field(..., description="任务类型")
    params: dict = Field(default_factory=dict)


@task_bp.post("")
@login_required()
@permission_required("task:create")
async def create_task(request: Request):
    user = request.ctx.user
    req = CreateTaskRequest(**request.json)

    async with get_db() as db:
        task = await TaskService.create_task(
            db,
            name=req.name,
            task_type=req.task_type,
            params=req.params,
            creator_id=user.id
        )
        return success({
            "task_id": task.id,
            "name": task.name,
            "type": task.task_type,
            "status": task.status
        }, "任务创建成功")


@task_bp.get("")
@login_required()
@permission_required("task:view")
async def list_tasks(request: Request):
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    status = request.args.get("status")
    task_type = request.args.get("task_type")
    mine = request.args.get("mine", "false").lower() == "true"

    creator_id = request.ctx.user.id if mine else None

    async with get_db() as db:
        tasks, total = await TaskService.list_tasks(
            db,
            skip=(page - 1) * page_size,
            limit=page_size,
            status=status,
            task_type=task_type,
            creator_id=creator_id
        )

        task_list = [{
            "id": t.id,
            "name": t.name,
            "task_type": t.task_type,
            "status": t.status,
            "progress": t.progress,
            "total": t.total,
            "completed": t.completed,
            "failed": t.failed,
            "retry_count": t.retry_count,
            "max_retries": t.max_retries,
            "creator_id": t.creator_id,
            "started_at": t.started_at.isoformat() if t.started_at else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "result_summary": t.result_summary
        } for t in tasks]

        return paginated_response(task_list, total, page, page_size)


@task_bp.get("/<task_id:int>")
@login_required()
@permission_required("task:view")
async def get_task_detail(request: Request, task_id: int):
    async with get_db() as db:
        task = await TaskService.get_task(db, task_id)
        if not task:
            raise NotFoundException("任务不存在")

        return success({
            "id": task.id,
            "name": task.name,
            "task_type": task.task_type,
            "status": task.status,
            "progress": task.progress,
            "total": task.total,
            "completed": task.completed,
            "failed": task.failed,
            "params": task.params,
            "result_summary": task.result_summary,
            "error_message": task.error_message,
            "retry_count": task.retry_count,
            "max_retries": task.max_retries,
            "creator_id": task.creator_id,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "results_count": len(task.results)
        })


@task_bp.get("/<task_id:int>/logs")
@login_required()
@permission_required("task:view")
async def get_task_logs(request: Request, task_id: int):
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 50))

    async with get_db() as db:
        logs, total = await TaskService.get_task_logs(
            db, task_id,
            skip=(page - 1) * page_size,
            limit=page_size
        )

        log_list = [{
            "id": l.id,
            "level": l.level,
            "message": l.message,
            "details": l.details,
            "duration_ms": l.duration_ms,
            "created_at": l.created_at.isoformat() if l.created_at else None
        } for l in logs]

        return paginated_response(log_list, total, page, page_size)


@task_bp.get("/<task_id:int>/results")
@login_required()
@permission_required("task:view")
async def get_task_results(request: Request, task_id: int):
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    min_score = int(request.args.get("min_score", 0))

    async with get_db() as db:
        task = await TaskService.get_task(db, task_id)
        if not task:
            raise NotFoundException("任务不存在")

        results, total = await TaskService.get_task_results(
            db, task_id,
            skip=(page - 1) * page_size,
            limit=page_size
        )

        if min_score > 0:
            results = [r for r in results if r.get("similarity_score", 0) >= min_score]
            total = len(results)

        return paginated_response(results, total, page, page_size)


@task_bp.post("/<task_id:int>/cancel")
@login_required()
@permission_required("task:manage")
async def cancel_task(request: Request, task_id: int):
    async with get_db() as db:
        try:
            await TaskService.cancel_task(db, task_id)
            return success(message="任务取消成功")
        except ValueError as e:
            raise BadRequestException(str(e))


@task_bp.get("/queue/status")
@login_required()
@permission_required("task:manage")
async def get_queue_status(request: Request):
    status = TaskService.get_queue_status()
    return success(status)


@task_bp.get("/stats")
@login_required()
@permission_required("task:view")
async def get_task_stats(request: Request):
    async with get_db() as db:
        from sqlalchemy import select, func
        from app.models import Task

        status_counts = await db.execute(
            select(Task.status, func.count(Task.id))
            .group_by(Task.status)
        )
        stats = {
            "status_distribution": {row[0]: row[1] for row in status_counts.all()},
            "queue_status": TaskService.get_queue_status()
        }

        today_stats = await db.execute(
            select(func.count(Task.id))
            .where(Task.created_at >= func.date('now'))
        )
        stats["today_created"] = today_stats.scalar() or 0

        return success(stats)
