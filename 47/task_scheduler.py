import queue
import threading
import time
from datetime import datetime
from enum import Enum
from typing import Callable, Dict, Any, Optional, List, Union
from dataclasses import dataclass, field
from pathlib import Path
import uuid
import json

from utils import setup_logger, Timer, generate_task_id, save_json, load_json
from config import AppConfig

logger = setup_logger("task_scheduler")


class JobStatus(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    PAUSED = "paused"


@dataclass
class Job:
    job_id: str
    name: str
    func: Callable
    args: tuple = ()
    kwargs: Dict[str, Any] = field(default_factory=dict)
    priority: int = 0
    status: JobStatus = JobStatus.QUEUED
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Any = None
    error: Optional[str] = None
    progress: float = 0.0
    max_retries: int = 3
    retry_count: int = 0
    timeout: int = 3600
    dependencies: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "name": self.name,
            "priority": self.priority,
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "execution_time": (self.completed_at - self.started_at) if self.started_at and self.completed_at else None,
            "result": str(self.result) if self.result is not None else None,
            "error": self.error,
            "progress": self.progress,
            "retry_count": self.retry_count,
            "dependencies": self.dependencies,
            "metadata": self.metadata
        }


@dataclass
class SchedulerStats:
    total_jobs: int = 0
    completed_jobs: int = 0
    failed_jobs: int = 0
    running_jobs: int = 0
    queued_jobs: int = 0
    cancelled_jobs: int = 0
    total_execution_time: float = 0.0
    avg_execution_time: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_jobs": self.total_jobs,
            "completed_jobs": self.completed_jobs,
            "failed_jobs": self.failed_jobs,
            "running_jobs": self.running_jobs,
            "queued_jobs": self.queued_jobs,
            "cancelled_jobs": self.cancelled_jobs,
            "total_execution_time": self.total_execution_time,
            "avg_execution_time": self.avg_execution_time,
        }


class JobQueue:
    def __init__(self):
        self._queue: List[Job] = []
        self._lock = threading.Lock()

    def add(self, job: Job) -> None:
        with self._lock:
            self._queue.append(job)
            self._queue.sort(key=lambda j: (-j.priority, j.created_at))

    def pop(self) -> Optional[Job]:
        with self._lock:
            if not self._queue:
                return None
            return self._queue.pop(0)

    def peek(self) -> Optional[Job]:
        with self._lock:
            return self._queue[0] if self._queue else None

    def remove(self, job_id: str) -> Optional[Job]:
        with self._lock:
            for i, job in enumerate(self._queue):
                if job.job_id == job_id:
                    return self._queue.pop(i)
            return None

    def size(self) -> int:
        with self._lock:
            return len(self._queue)

    def is_empty(self) -> bool:
        return self.size() == 0

    def clear(self) -> None:
        with self._lock:
            self._queue.clear()


class TaskScheduler:
    def __init__(self, config: AppConfig, max_workers: int = 4):
        self.config = config
        self.max_workers = max_workers
        self._job_queue = JobQueue()
        self._running_jobs: Dict[str, threading.Thread] = {}
        self._job_threads: Dict[str, threading.Thread] = {}
        self._completed_jobs: Dict[str, Job] = {}
        self._all_jobs: Dict[str, Job] = {}
        self._lock = threading.RLock()
        self._callback_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._scheduler_thread: Optional[threading.Thread] = None
        self._monitor_thread: Optional[threading.Thread] = None
        self._callbacks: Dict[str, List[Callable]] = {
            "on_start": [],
            "on_complete": [],
            "on_fail": [],
            "on_progress": []
        }
        self._callback_queue: queue.Queue = queue.Queue()
        self._callback_thread: Optional[threading.Thread] = None
        self._stats = SchedulerStats()
        self._state_file = Path(config.temp_dir) / "scheduler_state.json"

    def submit(
        self,
        func: Callable,
        name: str = "",
        args: tuple = (),
        kwargs: Optional[Dict[str, Any]] = None,
        priority: int = 0,
        dependencies: Optional[List[str]] = None,
        max_retries: int = 3,
        timeout: int = 3600,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        job_id = generate_task_id("job")
        job = Job(
            job_id=job_id,
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs or {},
            priority=priority,
            dependencies=dependencies or [],
            max_retries=max_retries,
            timeout=timeout,
            metadata=metadata or {}
        )

        with self._lock:
            self._all_jobs[job_id] = job
            self._stats.total_jobs += 1

        self._job_queue.add(job)
        logger.info(f"Submitted job {job_id}: {job.name} (priority={priority})")
        self._trigger_callbacks("on_start", job)
        return job_id

    def _check_dependencies(self, job: Job) -> bool:
        with self._lock:
            for dep_id in job.dependencies:
                dep_job = self._all_jobs.get(dep_id)
                if dep_job is None:
                    logger.warning(f"Dependency {dep_id} not found for job {job.job_id}")
                    return False
                if dep_job.status != JobStatus.COMPLETED:
                    return False
        return True

    def _run_job(self, job: Job) -> None:
        job.status = JobStatus.RUNNING
        job.started_at = time.time()
        logger.info(f"Starting job {job.job_id}: {job.name}")

        def progress_callback(progress: float):
            job.progress = progress
            self._enqueue_callback("on_progress", job)

        job.kwargs["progress_callback"] = progress_callback

        try:
            result = job.func(*job.args, **job.kwargs)
            job.result = result
            job.status = JobStatus.COMPLETED
            job.completed_at = time.time()

            with self._lock:
                self._completed_jobs[job.job_id] = job
                self._stats.completed_jobs += 1
                exec_time = job.completed_at - job.started_at
                self._stats.total_execution_time += exec_time
                if self._stats.completed_jobs > 0:
                    self._stats.avg_execution_time = (
                        self._stats.total_execution_time / self._stats.completed_jobs
                    )

            logger.info(f"Completed job {job.job_id}: {job.name} in {job.completed_at - job.started_at:.2f}s")
            self._enqueue_callback("on_complete", job)

        except Exception as e:
            job.error = str(e)
            job.retry_count += 1

            if job.retry_count < job.max_retries:
                logger.warning(f"Job {job.job_id} failed (attempt {job.retry_count}/{job.max_retries}): {e}")
                job.status = JobStatus.QUEUED
                job.progress = 0.0
                self._job_queue.add(job)
            else:
                job.status = JobStatus.FAILED
                job.completed_at = time.time()
                with self._lock:
                    self._stats.failed_jobs += 1
                logger.error(f"Job {job.job_id} failed permanently after {job.max_retries} attempts: {e}")
                self._enqueue_callback("on_fail", job)

        finally:
            with self._lock:
                self._running_jobs.pop(job.job_id, None)
                self._job_threads.pop(job.job_id, None)

    def _scheduler_loop(self) -> None:
        logger.info("Scheduler loop started")
        while not self._stop_event.is_set():
            try:
                if len(self._running_jobs) < self.max_workers:
                    job = self._job_queue.peek()
                    if job and self._check_dependencies(job):
                        self._job_queue.pop()
                        thread = threading.Thread(
                            target=self._run_job,
                            args=(job,),
                            daemon=True
                        )
                        with self._lock:
                            self._running_jobs[job.job_id] = {}
                            self._job_threads[job.job_id] = thread
                            self._stats.running_jobs = len(self._running_jobs)
                            self._stats.queued_jobs = self._job_queue.size()
                        thread.start()

                time.sleep(0.05)

                with self._lock:
                    self._stats.queued_jobs = self._job_queue.size()
                    self._stats.running_jobs = len(self._running_jobs)

            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
                time.sleep(0.1)

        logger.info("Scheduler loop stopped")

    def _monitor_loop(self) -> None:
        logger.info("Job monitor started")
        while not self._stop_event.is_set():
            try:
                time.sleep(1.0)
                current_time = time.time()

                with self._lock:
                    for job_id, thread in list(self._job_threads.items()):
                        job = self._all_jobs.get(job_id)
                        if job and job.status == JobStatus.RUNNING:
                            elapsed = current_time - job.started_at
                            if elapsed > job.timeout:
                                logger.warning(f"Job {job_id} timed out after {elapsed:.1f}s")
                                job.status = JobStatus.TIMEOUT
                                job.error = f"Job timeout after {job.timeout}s"
                                job.completed_at = current_time
                                self._stats.failed_jobs += 1
                                self._running_jobs.pop(job_id, None)
                                self._job_threads.pop(job_id, None)
            except Exception as e:
                logger.error(f"Error in monitor loop: {e}")

        logger.info("Job monitor stopped")

    def _callback_processor(self) -> None:
        logger.info("Callback processor started")
        while not self._stop_event.is_set():
            try:
                try:
                    event, job = self._callback_queue.get(timeout=0.5)
                    self._trigger_callbacks(event, job)
                    self._callback_queue.task_done()
                except queue.Empty:
                    continue
            except Exception as e:
                logger.error(f"Error in callback processor: {e}")

        logger.info("Callback processor stopped")

    def _enqueue_callback(self, event: str, job: Job) -> None:
        try:
            self._callback_queue.put_nowait((event, job))
        except queue.Full:
            pass

    def start(self) -> None:
        if self._scheduler_thread is None or not self._scheduler_thread.is_alive():
            self._stop_event.clear()
            self._scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
            self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self._callback_thread = threading.Thread(target=self._callback_processor, daemon=True)
            self._scheduler_thread.start()
            self._monitor_thread.start()
            self._callback_thread.start()
            logger.info("TaskScheduler started")

    def stop(self, wait: bool = True) -> None:
        self._stop_event.set()

        if wait:
            if self._scheduler_thread and self._scheduler_thread.is_alive():
                self._scheduler_thread.join(timeout=5)
            if self._monitor_thread and self._monitor_thread.is_alive():
                self._monitor_thread.join(timeout=2)
            if self._callback_thread and self._callback_thread.is_alive():
                self._callback_thread.join(timeout=2)

        logger.info("TaskScheduler stopped")

    def cancel_job(self, job_id: str) -> bool:
        with self._lock:
            if job_id in self._running_jobs:
                job = self._all_jobs.get(job_id)
                if job:
                    job.status = JobStatus.CANCELLED
                    self._stats.cancelled_jobs += 1
                logger.info(f"Cancelled job {job_id}")
                return True

        removed = self._job_queue.remove(job_id)
        if removed:
            with self._lock:
                removed.status = JobStatus.CANCELLED
                self._stats.cancelled_jobs += 1
            return True

        return False

    def get_job_status(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._all_jobs.get(job_id)

    def wait_for_job(self, job_id: str, timeout: Optional[float] = None) -> Optional[Any]:
        start_time = time.time()
        while True:
            job = self.get_job_status(job_id)
            if job is None:
                return None
            if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.TIMEOUT]:
                return job.result if job.status == JobStatus.COMPLETED else None
            if timeout and (time.time() - start_time) > timeout:
                return None
            time.sleep(0.1)

    def wait_for_all(self, timeout: Optional[float] = None) -> None:
        start_time = time.time()
        while True:
            with self._lock:
                if self._job_queue.is_empty() and len(self._running_jobs) == 0:
                    return
            if timeout and (time.time() - start_time) > timeout:
                return
            time.sleep(0.1)

    def add_callback(self, event: str, callback: Callable) -> None:
        if event in self._callbacks:
            self._callbacks[event].append(callback)

    def _trigger_callbacks(self, event: str, job: Job) -> None:
        for callback in self._callbacks.get(event, []):
            try:
                callback(job)
            except Exception as e:
                logger.error(f"Error in callback for event {event}: {e}")

    def get_stats(self) -> SchedulerStats:
        with self._lock:
            return SchedulerStats(**self._stats.to_dict())

    def get_all_jobs(self) -> List[Job]:
        with self._lock:
            return list(self._all_jobs.values())

    def save_state(self) -> None:
        state = {
            "stats": self._stats.to_dict(),
            "jobs": {
                job_id: job.to_dict()
                for job_id, job in self._all_jobs.items()
            },
            "saved_at": time.time()
        }
        save_json(state, self._state_file)
        logger.info(f"Scheduler state saved to {self._state_file}")

    def load_state(self) -> None:
        if self._state_file.exists():
            state = load_json(self._state_file)
            logger.info(f"Scheduler state loaded from {self._state_file}")
            return state
        return None

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
        self.save_state()


class PriorityScheduler(TaskScheduler):
    def __init__(self, config: AppConfig, max_workers: int = 4):
        super().__init__(config, max_workers)
        self._high_priority_threshold = 10
        self._low_priority_threshold = -10

    def submit_high_priority(self, *args, **kwargs) -> str:
        kwargs["priority"] = self._high_priority_threshold + 1
        return self.submit(*args, **kwargs)

    def submit_low_priority(self, *args, **kwargs) -> str:
        kwargs["priority"] = self._low_priority_threshold - 1
        return self.submit(*args, **kwargs)


class BatchScheduler(TaskScheduler):
    def __init__(self, config: AppConfig, max_workers: int = 4, batch_size: int = 10):
        super().__init__(config, max_workers)
        self.batch_size = batch_size
        self._batch_buffer: List[Job] = []

    def submit_batch(self, jobs: List[Dict[str, Any]]) -> List[str]:
        job_ids = []
        for job_spec in jobs:
            job_id = self.submit(**job_spec)
            job_ids.append(job_id)
        return job_ids

    def process_batch(self) -> None:
        if len(self._batch_buffer) >= self.batch_size:
            for job in self._batch_buffer:
                self._job_queue.add(job)
            self._batch_buffer.clear()


class WorkflowScheduler:
    def __init__(self, config: AppConfig, max_workers: int = 4):
        self.scheduler = TaskScheduler(config, max_workers)
        self._workflows: Dict[str, List[str]] = {}

    def define_workflow(
        self,
        workflow_id: str,
        stages: List[Dict[str, Any]]
    ) -> str:
        job_ids = []
        prev_job_id = None

        for i, stage in enumerate(stages):
            dependencies = [prev_job_id] if prev_job_id else []
            job_id = self.scheduler.submit(
                func=stage["func"],
                name=stage.get("name", f"{workflow_id}_stage_{i}"),
                args=stage.get("args", ()),
                kwargs=stage.get("kwargs", {}),
                priority=stage.get("priority", 0),
                dependencies=dependencies
            )
            job_ids.append(job_id)
            prev_job_id = job_id

        self._workflows[workflow_id] = job_ids
        return workflow_id

    def get_workflow_status(self, workflow_id: str) -> Dict[str, Any]:
        job_ids = self._workflows.get(workflow_id, [])
        jobs = [self.scheduler.get_job_status(jid) for jid in job_ids]
        statuses = [j.status.value for j in jobs if j]

        if all(s == "completed" for s in statuses):
            overall_status = "completed"
        elif any(s == "failed" for s in statuses):
            overall_status = "failed"
        elif any(s == "running" for s in statuses):
            overall_status = "running"
        else:
            overall_status = "pending"

        return {
            "workflow_id": workflow_id,
            "total_stages": len(job_ids),
            "completed_stages": sum(1 for s in statuses if s == "completed"),
            "overall_status": overall_status,
            "stages": [j.to_dict() for j in jobs if j]
        }
