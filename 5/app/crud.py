from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List, Tuple
from datetime import datetime
import uuid
from app.models import ExtractionTask, TaskStatus, ExtractionBatch, BatchStatus
from app.schemas import ExtractionRequest, SchemaField, BatchExtractionRequest, BatchTextItem
from app.core.preprocessor import preprocessor


def create_task(db: Session, request: ExtractionRequest, batch_id: Optional[str] = None) -> ExtractionTask:
    task_id = f"task_{uuid.uuid4().hex}"
    content_hash = preprocessor.get_content_hash(request.text)
    db_task = ExtractionTask(
        task_id=task_id,
        batch_id=batch_id,
        original_text=request.text,
        schema_definition=[f.model_dump() for f in request.schema],
        status=TaskStatus.PENDING,
        content_hash=content_hash
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


def create_batch_task(
    db: Session,
    request: BatchExtractionRequest
) -> Tuple[ExtractionBatch, List[ExtractionTask]]:
    batch_id = f"batch_{uuid.uuid4().hex}"
    schema_dicts = [f.model_dump() for f in request.schema]

    db_batch = ExtractionBatch(
        batch_id=batch_id,
        total_count=0,
        completed_count=0,
        failed_count=0,
        status=BatchStatus.PENDING,
        schema_definition=schema_dicts
    )
    db.add(db_batch)
    db.flush()

    tasks: List[ExtractionTask] = []
    seen_hashes: set = set()

    for item in request.texts:
        content_hash = preprocessor.get_content_hash(item.text)

        if request.dedup and content_hash in seen_hashes:
            continue
        seen_hashes.add(content_hash)

        task_id = f"task_{uuid.uuid4().hex}"
        db_task = ExtractionTask(
            task_id=task_id,
            batch_id=batch_id,
            original_text=item.text,
            schema_definition=schema_dicts,
            status=TaskStatus.PENDING,
            content_hash=content_hash
        )
        db.add(db_task)
        tasks.append(db_task)

    db_batch.total_count = len(tasks)
    db_batch.status = BatchStatus.PROCESSING if tasks else BatchStatus.COMPLETED
    db.commit()
    db.refresh(db_batch)
    for t in tasks:
        db.refresh(t)

    return db_batch, tasks


def get_task_by_id(db: Session, task_id: str) -> Optional[ExtractionTask]:
    return db.query(ExtractionTask).filter(ExtractionTask.task_id == task_id).first()


def get_batch_by_id(db: Session, batch_id: str) -> Optional[ExtractionBatch]:
    return db.query(ExtractionBatch).filter(ExtractionBatch.batch_id == batch_id).first()


def get_tasks(
    db: Session,
    status: Optional[TaskStatus] = None,
    batch_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 20
) -> Tuple[int, List[ExtractionTask]]:
    query = db.query(ExtractionTask)
    if status:
        query = query.filter(ExtractionTask.status == status)
    if batch_id:
        query = query.filter(ExtractionTask.batch_id == batch_id)
    total = query.count()
    items = query.order_by(ExtractionTask.created_at.desc()).offset(skip).limit(limit).all()
    return total, items


def get_batch_tasks(
    db: Session,
    batch_id: str,
    status: Optional[TaskStatus] = None,
    skip: int = 0,
    limit: int = 100
) -> Tuple[int, List[ExtractionTask]]:
    query = db.query(ExtractionTask).filter(ExtractionTask.batch_id == batch_id)
    if status:
        query = query.filter(ExtractionTask.status == status)
    total = query.count()
    items = query.order_by(ExtractionTask.id.asc()).offset(skip).limit(limit).all()
    return total, items


def get_batch_stats(db: Session, batch_id: str) -> dict:
    status_counts = (
        db.query(ExtractionTask.status, func.count(ExtractionTask.id))
        .filter(ExtractionTask.batch_id == batch_id)
        .group_by(ExtractionTask.status)
        .all()
    )
    stats = {"completed": 0, "failed": 0, "processing": 0, "pending": 0}
    for status, count in status_counts:
        stats[status.value] = count
    return stats


def update_task_status(
    db: Session,
    task_id: str,
    status: TaskStatus,
    error_message: Optional[str] = None
) -> Optional[ExtractionTask]:
    task = get_task_by_id(db, task_id)
    if not task:
        return None
    task.status = status
    if error_message:
        task.error_message = error_message
    if status == TaskStatus.COMPLETED or status == TaskStatus.FAILED:
        task.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(task)

    if task.batch_id:
        _recalculate_batch_status(db, task.batch_id)

    return task


def update_task_result(
    db: Session,
    task_id: str,
    result: dict,
    preprocessed_text: Optional[str] = None,
    llm_response: Optional[str] = None
) -> Optional[ExtractionTask]:
    task = get_task_by_id(db, task_id)
    if not task:
        return None
    task.status = TaskStatus.COMPLETED
    task.result = result
    task.preprocessed_text = preprocessed_text
    task.llm_response = llm_response
    task.completed_at = datetime.utcnow()
    task.error_message = None
    db.commit()
    db.refresh(task)

    if task.batch_id:
        _recalculate_batch_status(db, task.batch_id)

    return task


def _recalculate_batch_status(db: Session, batch_id: str):
    batch = get_batch_by_id(db, batch_id)
    if not batch:
        return

    stats = get_batch_stats(db, batch_id)
    batch.completed_count = stats["completed"]
    batch.failed_count = stats["failed"]

    if batch.total_count > 0:
        if batch.completed_count + batch.failed_count >= batch.total_count:
            if batch.failed_count == 0:
                batch.status = BatchStatus.COMPLETED
            elif batch.completed_count == 0:
                batch.status = BatchStatus.FAILED
            else:
                batch.status = BatchStatus.PARTIAL_COMPLETED
            batch.completed_at = datetime.utcnow()
        else:
            batch.status = BatchStatus.PROCESSING
    else:
        batch.status = BatchStatus.COMPLETED
        batch.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(batch)


def get_batches(
    db: Session,
    status: Optional[BatchStatus] = None,
    skip: int = 0,
    limit: int = 20
) -> Tuple[int, List[ExtractionBatch]]:
    query = db.query(ExtractionBatch)
    if status:
        query = query.filter(ExtractionBatch.status == status)
    total = query.count()
    items = query.order_by(ExtractionBatch.created_at.desc()).offset(skip).limit(limit).all()
    return total, items


def get_pending_tasks(db: Session, limit: int = 10) -> List[ExtractionTask]:
    return db.query(ExtractionTask).filter(
        ExtractionTask.status == TaskStatus.PENDING
    ).order_by(ExtractionTask.created_at.asc()).limit(limit).all()


def get_batch_pending_tasks(db: Session, batch_id: str, limit: int = 10) -> List[ExtractionTask]:
    return db.query(ExtractionTask).filter(
        ExtractionTask.batch_id == batch_id,
        ExtractionTask.status == TaskStatus.PENDING
    ).order_by(ExtractionTask.id.asc()).limit(limit).all()


def mark_batch_failed(db: Session, batch_id: str, error_message: str):
    batch = get_batch_by_id(db, batch_id)
    if not batch:
        return
    batch.status = BatchStatus.FAILED
    batch.error_message = error_message
    batch.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(batch)
