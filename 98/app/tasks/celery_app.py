from kombu import Queue, Exchange
from celery import Celery
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "doc_proofread",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

default_exchange = Exchange("default", type="direct")
priority_exchange = Exchange("priority", type="direct")

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,
    task_soft_time_limit=1500,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    worker_max_memory_per_child=200000,
    worker_concurrency=4,
    task_default_queue="default",
    task_default_exchange="default",
    task_default_routing_key="default",
    task_queues=(
        Queue("default", default_exchange, routing_key="default", queue_arguments={"x-max-priority": 10}),
        Queue("high_priority", priority_exchange, routing_key="high.priority", queue_arguments={"x-max-priority": 10}),
        Queue("batch", default_exchange, routing_key="batch", queue_arguments={"x-max-priority": 5}),
    ),
    task_routes={
        "app.tasks.proofread_tasks.process_proofread_task": {
            "queue": "default",
            "routing_key": "default",
        },
        "app.tasks.proofread_tasks.batch_process_documents": {
            "queue": "batch",
            "routing_key": "batch",
        },
    },
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    result_expires=86400,
    broker_pool_limit=10,
    broker_connection_max_retries=10,
    broker_connection_timeout=30,
    redis_max_connections=50,
    redis_socket_connect_timeout=5,
    redis_socket_timeout=30,
)

celery_app.autodiscover_tasks(["app.tasks"])
