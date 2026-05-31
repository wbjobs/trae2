from celery import Celery
from kombu import Queue
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "docsemantic",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=500,
    task_soft_time_limit=600,
    task_time_limit=900,
    task_routes={
        "app.task_queue.tasks.process_single_document_task": {"queue": "processing"},
        "app.task_queue.tasks.process_batch_coordinator_task": {"queue": "coordinator"},
        "app.task_queue.tasks.retry_dead_letter_task": {"queue": "dead_letter_retry"},
    },
    task_queues={
        "coordinator": Queue("coordinator"),
        "processing": Queue("processing"),
        "dead_letter_retry": Queue("dead_letter_retry"),
    },
    task_default_queue="default",
    worker_concurrency=4,
    broker_transport_options={
        "visibility_timeout": 1800,
        "max_retries": 3,
    },
    result_expires=3600,
)
