import logging
import queue
import threading
import time
from typing import List, Optional, Dict, Any

from .task_base import Task, TaskResult, TaskExecutor, TaskStatus

logger = logging.getLogger(__name__)


class LocalExecutor(TaskExecutor):
    def __init__(self, max_workers: int = 4, task_timeout: float = 3600.0):
        self.max_workers = max_workers
        self.task_timeout = task_timeout
        self._task_queue: queue.Queue = queue.Queue()
        self._results: Dict[str, TaskResult] = {}
        self._running: bool = False
        self._threads: List[threading.Thread] = []
        self._lock = threading.Lock()
        self._task_cancelled: Dict[str, threading.Event] = {}

    def start(self):
        if self._running:
            return
        self._running = True
        for i in range(self.max_workers):
            t = threading.Thread(target=self._worker, args=(i,), daemon=True)
            t.start()
            self._threads.append(t)
        logger.info(f"Started LocalExecutor with {self.max_workers} workers")

    def stop(self):
        self._running = False
        for t in self._threads:
            t.join(timeout=5.0)
        self._threads = []
        logger.info("Stopped LocalExecutor")

    def _worker(self, worker_id: int):
        while self._running:
            try:
                task = self._task_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            if task.func is None:
                self._task_queue.task_done()
                continue

            if task.task_id in self._task_cancelled and self._task_cancelled[task.task_id].is_set():
                task.status = TaskStatus.CANCELLED
                self._task_queue.task_done()
                continue

            cancel_event = self._task_cancelled.get(task.task_id, threading.Event())
            task.status = TaskStatus.RUNNING
            task.started_at = time.time()
            
            start_time = time.time()
            result_container: List[Any] = [None]
            error_container: List[Optional[str]] = [None]
            
            def run_task():
                try:
                    result_container[0] = task.func(*task.args, **task.kwargs)
                except Exception as e:
                    error_container[0] = str(e)

            worker_thread = threading.Thread(target=run_task, daemon=True)
            worker_thread.start()
            worker_thread.join(timeout=self.task_timeout)

            if worker_thread.is_alive() or cancel_event.is_set():
                task.status = TaskStatus.CANCELLED if cancel_event.is_set() else TaskStatus.FAILED
                task.error = "Task cancelled" if cancel_event.is_set() else "Task timed out"
                logger.warning(f"Task {task.task_id} {task.error}")
                
                task_result = TaskResult(
                    task_id=task.task_id,
                    success=False,
                    error=task.error,
                    execution_time=time.time() - start_time,
                )
            elif error_container[0] is not None:
                task.status = TaskStatus.FAILED
                task.error = error_container[0]
                logger.error(f"Task {task.task_id} failed: {task.error}")
                
                task_result = TaskResult(
                    task_id=task.task_id,
                    success=False,
                    error=task.error,
                    execution_time=time.time() - start_time,
                )
            else:
                task.status = TaskStatus.COMPLETED
                task.result = result_container[0]
                
                task_result = TaskResult(
                    task_id=task.task_id,
                    success=True,
                    result=task.result,
                    execution_time=time.time() - start_time,
                )
            
            task.completed_at = time.time()
            
            with self._lock:
                self._results[task.task_id] = task_result
            
            self._task_queue.task_done()

    def submit(self, task: Task) -> bool:
        if not self._running:
            self.start()
        
        self._task_cancelled[task.task_id] = threading.Event()
        task.status = TaskStatus.QUEUED
        self._task_queue.put(task)
        logger.info(f"Submitted task {task.task_id} to LocalExecutor")
        return True

    def monitor(self, task: Task) -> TaskStatus:
        return task.status

    def cancel(self, task: Task) -> bool:
        if task.status in [TaskStatus.QUEUED, TaskStatus.RUNNING]:
            if task.task_id in self._task_cancelled:
                self._task_cancelled[task.task_id].set()
            task.status = TaskStatus.CANCELLED
            return True
        return False

    def get_result(self, task: Task) -> Optional[TaskResult]:
        with self._lock:
            return self._results.get(task.task_id)

    def wait_all(self, timeout: Optional[float] = None) -> bool:
        try:
            self._task_queue.join(timeout=timeout)
            return True
        except queue.Empty:
            return False
