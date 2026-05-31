from app.tasks.celery_app import celery_app
from app.tasks.proofread_tasks import process_proofread_task, batch_process_documents

__all__ = [
    "celery_app",
    "process_proofread_task",
    "batch_process_documents",
]
