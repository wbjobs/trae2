from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.dependencies import get_current_user, require_process
from app.database import get_db
from app.models import User, Task, TaskDocument, Document
from app.schemas import TaskCreate, TaskOut, TaskDetailOut, APIResponse
from app.task_queue.scheduler import submit_batch_task, get_task_status, revoke_task, submit_dead_letter_retry

router = APIRouter(prefix="/tasks", tags=["任务管理"])


@router.post("", response_model=TaskOut)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(require_process),
    db: AsyncSession = Depends(get_db),
):
    task = Task(
        name=task_data.name,
        task_type=task_data.task_type,
        total_count=len(task_data.document_ids),
        creator_id=current_user.id,
    )
    db.add(task)
    await db.flush()

    for doc_id in task_data.document_ids:
        result = await db.execute(select(Document).where(Document.id == doc_id))
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
        if doc.owner_id != current_user.id and current_user.role != "admin":
            raise HTTPException(status_code=403, detail=f"Access denied for document: {doc_id}")

        td = TaskDocument(task_id=task.id, document_id=doc_id)
        db.add(td)

    await db.commit()
    await db.refresh(task)

    extra_params = None
    if task_data.task_type == "translate":
        extra_params = {
            "target_lang": task_data.target_lang or "en",
            "source_lang": task_data.source_lang,
        }

    try:
        celery_id = submit_batch_task(task.id, extra_params)
        task.status = "queued"
        task.celery_task_id = celery_id
        await db.commit()
        await db.refresh(task)
    except Exception as e:
        task.status = "queue_failed"
        task.error_message = str(e)
        await db.commit()

    return task


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).where(Task.creator_id == current_user.id)
    query = query.offset(skip).limit(limit).order_by(Task.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{task_id}", response_model=TaskDetailOut)
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.creator_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    return task


@router.post("/{task_id}/cancel", response_model=APIResponse)
async def cancel_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.creator_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    if task.status in ("completed", "failed", "cancelled", "partial", "dead_letter"):
        raise HTTPException(status_code=400, detail="Task cannot be cancelled")

    if task.celery_task_id:
        try:
            revoke_task(task.celery_task_id)
        except Exception:
            pass

    task.status = "cancelled"
    await db.commit()
    return APIResponse(success=True, message="Task cancelled")


@router.get("/{task_id}/progress")
async def get_task_progress(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    celery_status = None
    if task.celery_task_id:
        try:
            celery_status = get_task_status(task.celery_task_id)
        except Exception:
            pass

    return {
        "task_id": task.id,
        "status": task.status,
        "progress": task.progress,
        "total_count": task.total_count,
        "completed_count": task.completed_count,
        "failed_count": task.failed_count,
        "retry_count": task.retry_count,
        "max_retries": task.max_retries,
        "celery_status": celery_status,
    }


@router.post("/{task_id}/retry", response_model=APIResponse)
async def retry_task(
    task_id: str,
    current_user: User = Depends(require_process),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.creator_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    if task.status not in ("failed", "partial", "dead_letter"):
        raise HTTPException(status_code=400, detail="Only failed/partial/dead_letter tasks can be retried")

    if task.retry_count >= task.max_retries:
        raise HTTPException(
            status_code=400,
            detail=f"Task has exceeded max retries ({task.max_retries})",
        )

    try:
        celery_id = submit_dead_letter_retry(task_id)
        task.status = "retrying"
        task.celery_task_id = celery_id
        await db.commit()
        return APIResponse(
            success=True,
            message=f"Task retry submitted (attempt {task.retry_count + 1}/{task.max_retries})",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit retry: {e}")
