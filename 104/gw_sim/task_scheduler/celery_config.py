from celery import Celery
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND

celery_app = Celery(
    "gw_sim",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3000,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    task_routes={
        "task_scheduler.tasks.compute_seepage_steady_task": {"queue": "seepage"},
        "task_scheduler.tasks.compute_seepage_transient_task": {"queue": "seepage"},
        "task_scheduler.tasks.compute_water_level_task": {"queue": "seepage"},
        "task_scheduler.tasks.preprocess_data_task": {"queue": "default"},
        "task_scheduler.tasks.long_term_projection_task": {"queue": "seepage"},
    },
    task_queues={
        "default": {"exchange": "default", "routing_key": "default"},
        "seepage": {"exchange": "seepage", "routing_key": "seepage"},
    },
)
