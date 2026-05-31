from celery import Celery
from celery.signals import task_postrun, task_prerun
from config import settings
from datetime import datetime

app = Celery(
    'cfd_scheduler',
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        'scheduler.tasks'
    ]
)

app.conf.update(
    task_serializer='pickle',
    accept_content=['pickle', 'json'],
    result_serializer='pickle',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600 * 24,
    task_soft_time_limit=3600 * 23,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    worker_send_task_events=True,
    result_expires=86400,
    task_default_priority=5,
    task_queue_max_priority=15,
    worker_disable_rate_limits=True,
    broker_transport_options={
        'visibility_timeout': 3600,
        'max_retries': 5,
        'interval_start': 0,
        'interval_step': 0.2,
        'interval_max': 1.0,
    },
    task_routes={
        'scheduler.tasks.compute_shard_task': {'queue': 'compute'},
        'scheduler.tasks.run_simulation_task': {'queue': 'simulation'},
        'scheduler.tasks.process_and_store_results': {'queue': 'storage'},
        'scheduler.tasks.monitor_node_task': {'queue': 'monitoring'},
    },
    task_queues={
        'compute': {
            'exchange': 'compute',
            'routing_key': 'compute',
            'queue_arguments': {'x-max-priority': 15}
        },
        'simulation': {
            'exchange': 'simulation',
            'routing_key': 'simulation',
            'queue_arguments': {'x-max-priority': 15}
        },
        'storage': {
            'exchange': 'storage',
            'routing_key': 'storage',
            'queue_arguments': {'x-max-priority': 10}
        },
        'monitoring': {
            'exchange': 'monitoring',
            'routing_key': 'monitoring',
            'queue_arguments': {'x-max-priority': 10}
        },
    }
)

_active_tasks = {}


@task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **extra):
    _active_tasks[task_id] = {
        'task_name': task.name if task else 'unknown',
        'start_time': datetime.utcnow(),
        'args': args,
        'kwargs': kwargs
    }


@task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, 
                         retval=None, state=None, **extra):
    if task_id in _active_tasks:
        task_info = _active_tasks.pop(task_id)
        task_info['end_time'] = datetime.utcnow()
        task_info['state'] = state
        task_info['retval'] = str(retval)[:100] if retval else None


def get_active_tasks_count() -> int:
    return len(_active_tasks)


def get_active_tasks() -> dict:
    return _active_tasks.copy()


@app.task(bind=True, name='scheduler.tasks.heartbeat')
def heartbeat(self):
    return {
        'status': 'alive',
        'timestamp': datetime.utcnow().isoformat(),
        'active_tasks': get_active_tasks_count()
    }
