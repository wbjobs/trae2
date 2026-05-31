from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
import uuid
import time
import logging
from datetime import datetime, timedelta
from config import CFDConfig, PriorityLevel
from .priority_queue import PriorityTaskQueue, TaskPriority

logger = logging.getLogger(__name__)


class JobStatus(Enum):
    PENDING = 'pending'
    QUEUED = 'queued'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'
    PAUSED = 'paused'


@dataclass
class NodeLoadInfo:
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    active_tasks: int = 0
    max_tasks: int = 4
    last_updated: float = 0.0

    @property
    def load_factor(self) -> float:
        if self.max_tasks == 0:
            return 1.0
        task_load = self.active_tasks / self.max_tasks
        return max(task_load, self.cpu_percent / 100.0, self.memory_percent / 100.0)

    @property
    def is_overloaded(self) -> bool:
        return self.load_factor > 0.85

    @property
    def can_accept_more(self) -> bool:
        return self.active_tasks < self.max_tasks and self.load_factor < 0.9


@dataclass
class SimulationJob:
    config: CFDConfig
    initial_conditions: Optional[Dict[str, Any]] = None
    job_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: JobStatus = JobStatus.PENDING
    priority: PriorityLevel = PriorityLevel.NORMAL
    submitted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    dependencies: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    celery_task_id: Optional[str] = None
    progress: float = 0.0
    resource_weight: float = 1.0
    retry_count: int = 0
    max_retries: int = 3

    def to_dict(self) -> Dict[str, Any]:
        return {
            'job_id': self.job_id,
            'status': self.status.value,
            'priority': self.priority.value,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error': self.error,
            'dependencies': self.dependencies,
            'metadata': self.metadata,
            'celery_task_id': self.celery_task_id,
            'progress': self.progress,
            'resource_weight': self.resource_weight,
            'retry_count': self.retry_count,
            'config': self.config.to_dict()
        }


class TaskScheduler:
    def __init__(self, max_concurrent_jobs: int = 4,
                 backpressure_threshold: float = 0.85,
                 dynamic_batch: bool = True,
                 min_batch: int = 10,
                 max_batch: int = 200):
        self._queue = PriorityTaskQueue(
            aging_interval=5,
            aging_boost=1,
            starvation_threshold=20
        )
        self._jobs: Dict[str, SimulationJob] = {}
        self._max_concurrent_jobs = max_concurrent_jobs
        self._running_jobs: set = set()
        self._completed_jobs: set = set()
        self._failed_jobs: set = set()
        self._on_job_submitted: Optional[Callable] = None
        self._on_job_started: Optional[Callable] = None
        self._on_job_completed: Optional[Callable] = None
        self._on_job_failed: Optional[Callable] = None
        self._node_loads: Dict[str, NodeLoadInfo] = {}
        self._backpressure_threshold = backpressure_threshold
        self._dynamic_batch = dynamic_batch
        self._min_batch = min_batch
        self._max_batch = max_batch
        self._last_schedule_time = 0.0
        self._schedule_interval = 1.0

    def on_job_submitted(self, callback: Callable) -> None:
        self._on_job_submitted = callback

    def on_job_started(self, callback: Callable) -> None:
        self._on_job_started = callback

    def on_job_completed(self, callback: Callable) -> None:
        self._on_job_completed = callback

    def on_job_failed(self, callback: Callable) -> None:
        self._on_job_failed = callback

    def update_node_load(self, node_name: str, cpu_percent: float,
                         memory_percent: float, active_tasks: int,
                         max_tasks: int = 4) -> None:
        self._node_loads[node_name] = NodeLoadInfo(
            cpu_percent=cpu_percent,
            memory_percent=memory_percent,
            active_tasks=active_tasks,
            max_tasks=max_tasks,
            last_updated=time.time()
        )

    def _get_cluster_load(self) -> float:
        if not self._node_loads:
            return len(self._running_jobs) / max(1, self._max_concurrent_jobs)
        total_capacity = sum(n.max_tasks for n in self._node_loads.values())
        total_active = sum(n.active_tasks for n in self._node_loads.values())
        if total_capacity == 0:
            return 1.0
        return total_active / total_capacity

    def _should_apply_backpressure(self) -> bool:
        return self._get_cluster_load() > self._backpressure_threshold

    def compute_batch_size(self, base_iterations: int = 100) -> int:
        if not self._dynamic_batch:
            return base_iterations
        load = self._get_cluster_load()
        if load > 0.9:
            batch = max(self._min_batch, int(base_iterations * 0.3))
        elif load > 0.7:
            batch = max(self._min_batch, int(base_iterations * 0.6))
        elif load > 0.5:
            batch = int(base_iterations * 0.8)
        else:
            batch = base_iterations
        return min(batch, self._max_batch)

    def submit(self, config: CFDConfig,
               initial_conditions: Optional[Dict[str, Any]] = None,
               dependencies: Optional[List[str]] = None,
               resource_weight: float = 1.0) -> str:
        job = SimulationJob(
            config=config,
            initial_conditions=initial_conditions,
            priority=config.priority,
            dependencies=dependencies or [],
            resource_weight=resource_weight
        )
        job.submitted_at = datetime.utcnow()
        job.status = JobStatus.QUEUED
        self._jobs[job.job_id] = job
        task_data = {
            'job_id': job.job_id,
            'config': config.to_dict(),
            'initial_conditions': initial_conditions,
            'resource_weight': resource_weight
        }
        self._queue.put(task_data, priority=job.priority.value, task_id=job.job_id)
        if self._on_job_submitted:
            self._on_job_submitted(job)
        self._process_queue()
        return job.job_id

    def _process_queue(self) -> None:
        now = time.time()
        if now - self._last_schedule_time < self._schedule_interval:
            if len(self._running_jobs) < self._max_concurrent_jobs:
                pass
            else:
                return
        self._last_schedule_time = now
        effective_max = self._max_concurrent_jobs
        if self._should_apply_backpressure():
            effective_max = max(1, int(self._max_concurrent_jobs * 0.7))
            logger.info(f'Backpressure: limiting concurrent jobs to {effective_max}')
        while len(self._running_jobs) < effective_max and not self._queue.empty():
            next_task = self._queue.get_nowait()
            if next_task is None:
                break
            job_id = next_task['task_id']
            if job_id not in self._jobs:
                continue
            job = self._jobs[job_id]
            deps_met = all(
                dep in self._completed_jobs
                for dep in job.dependencies
            )
            if not deps_met:
                self._queue.put(
                    next_task['data'],
                    priority=next_task['priority'],
                    task_id=job_id
                )
                continue
            self._start_job(job)

    def _start_job(self, job: SimulationJob) -> None:
        try:
            from .tasks import task_manager
            job.status = JobStatus.RUNNING
            job.started_at = datetime.utcnow()
            self._running_jobs.add(job.job_id)
            celery_task_id = task_manager.submit_simulation(
                job.config,
                job.initial_conditions
            )
            job.celery_task_id = celery_task_id
            if self._on_job_started:
                self._on_job_started(job)
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            job.completed_at = datetime.utcnow()
            self._running_jobs.discard(job.job_id)
            self._failed_jobs.add(job.job_id)
            if self._on_job_failed:
                self._on_job_failed(job)

    def update_job_status(self, job_id: str) -> Optional[JobStatus]:
        if job_id not in self._jobs:
            return None
        job = self._jobs[job_id]
        if job.status != JobStatus.RUNNING or job.celery_task_id is None:
            return job.status
        try:
            from .tasks import task_manager
            status = task_manager.get_job_status(job.celery_task_id)
            if status is None:
                return job.status
            state = status.get('state', 'PENDING')
            if state == 'SUCCESS':
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.utcnow()
                job.progress = 1.0
                self._running_jobs.discard(job.job_id)
                self._completed_jobs.add(job.job_id)
                if self._on_job_completed:
                    self._on_job_completed(job)
                self._process_queue()
            elif state == 'FAILURE':
                job.retry_count += 1
                if job.retry_count < job.max_retries:
                    job.status = JobStatus.QUEUED
                    self._running_jobs.discard(job.job_id)
                    self._queue.put(
                        {'job_id': job.job_id, 'config': job.config.to_dict(),
                         'initial_conditions': job.initial_conditions},
                        priority=job.priority.value + 1,
                        task_id=job.job_id
                    )
                    logger.info(f'Retrying job {job.job_id} (attempt {job.retry_count + 1})')
                else:
                    job.status = JobStatus.FAILED
                    job.error = status.get('status', 'Max retries exceeded')
                    job.completed_at = datetime.utcnow()
                    self._running_jobs.discard(job.job_id)
                    self._failed_jobs.add(job.job_id)
                    if self._on_job_failed:
                        self._on_job_failed(job)
                self._process_queue()
            elif state in ('STARTED', 'PROGRESS'):
                job.progress = status.get('metadata', {}).get('progress', 0.5)
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            job.completed_at = datetime.utcnow()
            self._running_jobs.discard(job.job_id)
            self._failed_jobs.add(job.job_id)
        return job.status

    def cancel_job(self, job_id: str) -> bool:
        if job_id not in self._jobs:
            return False
        job = self._jobs[job_id]
        if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            return False
        if self._queue.contains(job_id):
            self._queue.remove(job_id)
        if job.celery_task_id:
            try:
                from .tasks import task_manager
                task_manager.cancel_job(job.celery_task_id)
            except Exception:
                pass
        job.status = JobStatus.CANCELLED
        job.completed_at = datetime.utcnow()
        self._running_jobs.discard(job_id)
        return True

    def pause_job(self, job_id: str) -> bool:
        if job_id not in self._jobs:
            return False
        job = self._jobs[job_id]
        if job.status != JobStatus.RUNNING:
            return False
        if job.celery_task_id:
            try:
                from .tasks import task_manager
                task_manager.cancel_job(job.celery_task_id)
            except Exception:
                pass
        job.status = JobStatus.PAUSED
        self._running_jobs.discard(job_id)
        return True

    def get_job(self, job_id: str) -> Optional[SimulationJob]:
        return self._jobs.get(job_id)

    def get_jobs_by_status(self, status: JobStatus) -> List[SimulationJob]:
        return [job for job in self._jobs.values() if job.status == status]

    def list_all_jobs(self) -> List[Dict[str, Any]]:
        return [job.to_dict() for job in self._jobs.values()]

    def update_all_statuses(self) -> Dict[str, JobStatus]:
        results = {}
        for job_id in list(self._jobs.keys()):
            if self._jobs[job_id].status == JobStatus.RUNNING:
                results[job_id] = self.update_job_status(job_id)
        return results

    def get_stats(self) -> Dict[str, Any]:
        queue_stats = self._queue.get_stats()
        cluster_load = self._get_cluster_load()
        return {
            'total_jobs': len(self._jobs),
            'pending_jobs': len(self.get_jobs_by_status(JobStatus.PENDING)),
            'queued_jobs': len(self.get_jobs_by_status(JobStatus.QUEUED)),
            'running_jobs': len(self.get_jobs_by_status(JobStatus.RUNNING)),
            'completed_jobs': len(self.get_jobs_by_status(JobStatus.COMPLETED)),
            'failed_jobs': len(self.get_jobs_by_status(JobStatus.FAILED)),
            'cancelled_jobs': len(self.get_jobs_by_status(JobStatus.CANCELLED)),
            'paused_jobs': len(self.get_jobs_by_status(JobStatus.PAUSED)),
            'max_concurrent': self._max_concurrent_jobs,
            'cluster_load': cluster_load,
            'backpressure_active': self._should_apply_backpressure(),
            'recommended_batch_size': self.compute_batch_size(),
            'queue': queue_stats
        }

    def cleanup_old_jobs(self, older_than_days: int = 7) -> int:
        cutoff = datetime.utcnow() - timedelta(days=older_than_days)
        removed = 0
        for job_id in list(self._jobs.keys()):
            job = self._jobs[job_id]
            if (job.completed_at and job.completed_at < cutoff):
                del self._jobs[job_id]
                self._completed_jobs.discard(job_id)
                self._failed_jobs.discard(job_id)
                removed += 1
        return removed
