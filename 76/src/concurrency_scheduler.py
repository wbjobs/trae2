import asyncio
import threading
import time
from typing import Dict, List, Optional, Tuple, Callable, Any, Coroutine
from collections import deque
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, Future
from dataclasses import dataclass, field
from enum import Enum
import logging
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)


class TaskPriority(Enum):
    HIGH = 0
    MEDIUM = 1
    LOW = 2
    BACKGROUND = 3


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class Task:
    task_id: str
    func: Callable
    args: Tuple = field(default_factory=tuple)
    kwargs: Dict = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.MEDIUM
    timeout: Optional[float] = None
    callback: Optional[Callable[[Any, 'Task'], None]] = None
    error_callback: Optional[Callable[[Exception, 'Task'], None]] = None
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None
    error: Optional[Exception] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    metadata: Dict = field(default_factory=dict)
    
    @property
    def duration(self) -> Optional[float]:
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None
    
    @property
    def wait_time(self) -> float:
        if self.started_at:
            return (self.started_at - self.created_at).total_seconds()
        return (datetime.utcnow() - self.created_at).total_seconds()


@dataclass
class WorkerMetrics:
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    cancelled_tasks: int = 0
    timeout_tasks: int = 0
    total_processing_time: float = 0.0
    total_wait_time: float = 0.0
    active_tasks: int = 0
    
    @property
    def success_rate(self) -> float:
        if self.total_tasks == 0:
            return 1.0
        return self.completed_tasks / self.total_tasks
    
    @property
    def avg_processing_time(self) -> float:
        if self.completed_tasks == 0:
            return 0.0
        return self.total_processing_time / self.completed_tasks
    
    @property
    def avg_wait_time(self) -> float:
        if self.total_tasks == 0:
            return 0.0
        return self.total_wait_time / self.total_tasks


class ConcurrencyScheduler:
    def __init__(
        self,
        max_workers: int = 8,
        max_queue_size: int = 1000,
        use_process_pool: bool = False,
        task_timeout: Optional[float] = 60.0
    ):
        self.max_workers = max_workers
        self.max_queue_size = max_queue_size
        self.task_timeout = task_timeout
        
        if use_process_pool:
            self.executor = ProcessPoolExecutor(max_workers=max_workers)
        else:
            self.executor = ThreadPoolExecutor(max_workers=max_workers)
        
        self._pending_tasks: deque[Task] = deque()
        self._active_tasks: Dict[str, Tuple[Task, Future]] = {}
        self._completed_tasks: Dict[str, Task] = {}
        self._task_locks: Dict[str, threading.Lock] = {}
        
        self._queue_lock = threading.Lock()
        self._active_lock = threading.Lock()
        self._completed_lock = threading.Lock()
        
        self._worker_metrics = WorkerMetrics()
        self._metrics_lock = threading.Lock()
        
        self._is_running = False
        self._dispatcher_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        
        self._priority_weights = {
            TaskPriority.HIGH: 10,
            TaskPriority.MEDIUM: 5,
            TaskPriority.LOW: 2,
            TaskPriority.BACKGROUND: 1
        }
        
        self._start_dispatcher()
    
    def _start_dispatcher(self):
        if self._is_running:
            return
        
        self._is_running = True
        self._dispatcher_thread = threading.Thread(
            target=self._dispatch_loop,
            daemon=True
        )
        self._dispatcher_thread.start()
        logger.info(f"Concurrency scheduler started with {self.max_workers} workers")
    
    def _dispatch_loop(self):
        while not self._stop_event.is_set():
            try:
                self._dispatch_tasks()
                self._cleanup_completed()
                time.sleep(0.01)
            except Exception as e:
                logger.error(f"Dispatcher error: {e}")
                time.sleep(0.1)
    
    def _dispatch_tasks(self):
        with self._queue_lock:
            queue_size = len(self._pending_tasks)
        
        with self._active_lock:
            active_count = len(self._active_tasks)
        
        if queue_size == 0 or active_count >= self.max_workers:
            return
        
        n_to_dispatch = min(
            self.max_workers - active_count,
            queue_size
        )
        
        for _ in range(n_to_dispatch):
            task = self._select_next_task()
            if task:
                self._execute_task(task)
    
    def _select_next_task(self) -> Optional[Task]:
        with self._queue_lock:
            if not self._pending_tasks:
                return None
            
            high_priority = [t for t in self._pending_tasks if t.priority == TaskPriority.HIGH]
            medium_priority = [t for t in self._pending_tasks if t.priority == TaskPriority.MEDIUM]
            low_priority = [t for t in self._pending_tasks if t.priority == TaskPriority.LOW]
            background = [t for t in self._pending_tasks if t.priority == TaskPriority.BACKGROUND]
            
            for priority_list in [high_priority, medium_priority, low_priority, background]:
                if priority_list:
                    task = priority_list[0]
                    self._pending_tasks.remove(task)
                    return task
            
            return None
    
    def _execute_task(self, task: Task):
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.utcnow()
        
        with self._metrics_lock:
            self._worker_metrics.total_tasks += 1
            self._worker_metrics.total_wait_time += task.wait_time
            self._worker_metrics.active_tasks += 1
        
        def run_with_timeout():
            try:
                timeout = task.timeout or self.task_timeout
                if timeout:
                    result = self._run_with_timeout(task.func, task.args, task.kwargs, timeout)
                else:
                    result = task.func(*task.args, **task.kwargs)
                
                task.result = result
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.utcnow()
                
                with self._metrics_lock:
                    self._worker_metrics.completed_tasks += 1
                    if task.duration:
                        self._worker_metrics.total_processing_time += task.duration
                
                if task.callback:
                    try:
                        task.callback(result, task)
                    except Exception as e:
                        logger.error(f"Task callback error: {e}")
                
                return result
                
            except TimeoutError as e:
                task.status = TaskStatus.TIMEOUT
                task.error = e
                task.completed_at = datetime.utcnow()
                
                with self._metrics_lock:
                    self._worker_metrics.timeout_tasks += 1
                
                if task.error_callback:
                    try:
                        task.error_callback(e, task)
                    except Exception as cb_err:
                        logger.error(f"Task error callback error: {cb_err}")
                
                raise e
                
            except Exception as e:
                task.status = TaskStatus.FAILED
                task.error = e
                task.completed_at = datetime.utcnow()
                
                with self._metrics_lock:
                    self._worker_metrics.failed_tasks += 1
                
                if task.error_callback:
                    try:
                        task.error_callback(e, task)
                    except Exception as cb_err:
                        logger.error(f"Task error callback error: {cb_err}")
                
                raise e
            
            finally:
                with self._metrics_lock:
                    self._worker_metrics.active_tasks -= 1
                
                with self._active_lock:
                    if task.task_id in self._active_tasks:
                        del self._active_tasks[task.task_id]
                
                with self._completed_lock:
                    self._completed_tasks[task.task_id] = task
                    if len(self._completed_tasks) > 1000:
                        oldest = sorted(self._completed_tasks.keys())[0]
                        del self._completed_tasks[oldest]
        
        future = self.executor.submit(run_with_timeout)
        
        with self._active_lock:
            self._active_tasks[task.task_id] = (task, future)
    
    def _run_with_timeout(self, func: Callable, args: Tuple, kwargs: Dict, timeout: float) -> Any:
        result = [None]
        exception = [None]
        
        def target():
            try:
                result[0] = func(*args, **kwargs)
            except Exception as e:
                exception[0] = e
        
        thread = threading.Thread(target=target, daemon=True)
        thread.start()
        thread.join(timeout=timeout)
        
        if thread.is_alive():
            raise TimeoutError(f"Function {func.__name__} timed out after {timeout} seconds")
        
        if exception[0] is not None:
            raise exception[0]
        
        return result[0]
    
    def _cleanup_completed(self):
        with self._active_lock:
            completed_ids = [
                tid for tid, (_, future) in self._active_tasks.items()
                if future.done()
            ]
            for tid in completed_ids:
                try:
                    self._active_tasks[tid][1].result(timeout=0)
                except Exception:
                    pass
    
    def submit(
        self,
        func: Callable,
        *args,
        priority: TaskPriority = TaskPriority.MEDIUM,
        timeout: Optional[float] = None,
        callback: Optional[Callable[[Any, Task], None]] = None,
        error_callback: Optional[Callable[[Exception, Task], None]] = None,
        metadata: Optional[Dict] = None,
        **kwargs
    ) -> str:
        with self._queue_lock:
            if len(self._pending_tasks) >= self.max_queue_size:
                raise RuntimeError(f"Task queue full ({self.max_queue_size})")
        
        task_id = f"task_{uuid.uuid4().hex[:16]}"
        task = Task(
            task_id=task_id,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            timeout=timeout,
            callback=callback,
            error_callback=error_callback,
            metadata=metadata or {}
        )
        
        with self._queue_lock:
            self._pending_tasks.append(task)
        
        logger.debug(f"Task {task_id} submitted (priority: {priority.name})")
        return task_id
    
    def submit_async(
        self,
        coro: Coroutine,
        priority: TaskPriority = TaskPriority.MEDIUM,
        timeout: Optional[float] = None,
        callback: Optional[Callable[[Any, Task], None]] = None,
        error_callback: Optional[Callable[[Exception, Task], None]] = None,
        metadata: Optional[Dict] = None
    ) -> str:
        def sync_wrapper():
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(coro)
            finally:
                loop.close()
        
        return self.submit(
            sync_wrapper,
            priority=priority,
            timeout=timeout,
            callback=callback,
            error_callback=error_callback,
            metadata=metadata
        )
    
    def submit_batch(
        self,
        tasks: List[Tuple[Callable, Tuple, Dict]],
        priority: TaskPriority = TaskPriority.MEDIUM,
        timeout: Optional[float] = None
    ) -> List[str]:
        task_ids = []
        for func, args, kwargs in tasks:
            task_id = self.submit(
                func,
                *args,
                priority=priority,
                timeout=timeout,
                **kwargs
            )
            task_ids.append(task_id)
        return task_ids
    
    def get_task_status(self, task_id: str) -> Optional[Dict]:
        with self._queue_lock:
            for task in self._pending_tasks:
                if task.task_id == task_id:
                    return {
                        "task_id": task_id,
                        "status": task.status.value,
                        "position": list(self._pending_tasks).index(task) + 1,
                        "queue_size": len(self._pending_tasks),
                        "wait_time": task.wait_time,
                        "priority": task.priority.name,
                        "metadata": task.metadata
                    }
        
        with self._active_lock:
            if task_id in self._active_tasks:
                task, _ = self._active_tasks[task_id]
                return {
                    "task_id": task_id,
                    "status": task.status.value,
                    "duration": task.duration or (datetime.utcnow() - task.started_at).total_seconds(),
                    "priority": task.priority.name,
                    "metadata": task.metadata
                }
        
        with self._completed_lock:
            if task_id in self._completed_tasks:
                task = self._completed_tasks[task_id]
                return {
                    "task_id": task_id,
                    "status": task.status.value,
                    "result": task.result if task.status == TaskStatus.COMPLETED else None,
                    "error": str(task.error) if task.error else None,
                    "duration": task.duration,
                    "wait_time": task.wait_time,
                    "priority": task.priority.name,
                    "metadata": task.metadata,
                    "completed_at": task.completed_at.isoformat() if task.completed_at else None
                }
        
        return None
    
    def get_result(self, task_id: str, timeout: Optional[float] = None) -> Any:
        start_time = time.time()
        
        while True:
            status = self.get_task_status(task_id)
            if status is None:
                raise KeyError(f"Task {task_id} not found")
            
            if status["status"] == TaskStatus.COMPLETED.value:
                with self._completed_lock:
                    return self._completed_tasks[task_id].result
            
            if status["status"] in [TaskStatus.FAILED.value, TaskStatus.TIMEOUT.value]:
                with self._completed_lock:
                    error = self._completed_tasks[task_id].error
                    raise error or RuntimeError(f"Task {task_id} {status['status']}")
            
            if status["status"] == TaskStatus.CANCELLED.value:
                raise RuntimeError(f"Task {task_id} cancelled")
            
            if timeout and (time.time() - start_time) > timeout:
                raise TimeoutError(f"Waiting for task {task_id} timed out")
            
            time.sleep(0.1)
    
    def cancel_task(self, task_id: str) -> bool:
        with self._queue_lock:
            for i, task in enumerate(self._pending_tasks):
                if task.task_id == task_id:
                    task.status = TaskStatus.CANCELLED
                    self._pending_tasks.remove(task)
                    
                    with self._completed_lock:
                        self._completed_tasks[task_id] = task
                    
                    with self._metrics_lock:
                        self._worker_metrics.cancelled_tasks += 1
                    
                    logger.info(f"Task {task_id} cancelled from queue")
                    return True
        
        with self._active_lock:
            if task_id in self._active_tasks:
                task, future = self._active_tasks[task_id]
                if not future.done():
                    future.cancel()
                    task.status = TaskStatus.CANCELLED
                    task.completed_at = datetime.utcnow()
                    
                    with self._metrics_lock:
                        self._worker_metrics.cancelled_tasks += 1
                    
                    logger.info(f"Task {task_id} cancelled (running)")
                    return True
        
        return False
    
    def get_queue_size(self) -> int:
        with self._queue_lock:
            return len(self._pending_tasks)
    
    def get_active_count(self) -> int:
        with self._active_lock:
            return len(self._active_tasks)
    
    def get_metrics(self) -> Dict:
        with self._metrics_lock:
            return {
                "total_tasks": self._worker_metrics.total_tasks,
                "completed_tasks": self._worker_metrics.completed_tasks,
                "failed_tasks": self._worker_metrics.failed_tasks,
                "cancelled_tasks": self._worker_metrics.cancelled_tasks,
                "timeout_tasks": self._worker_metrics.timeout_tasks,
                "active_tasks": self._worker_metrics.active_tasks,
                "queued_tasks": self.get_queue_size(),
                "success_rate": self._worker_metrics.success_rate,
                "avg_processing_time_ms": self._worker_metrics.avg_processing_time * 1000,
                "avg_wait_time_ms": self._worker_metrics.avg_wait_time * 1000,
                "total_processing_time": self._worker_metrics.total_processing_time,
                "max_workers": self.max_workers,
                "utilization": self._worker_metrics.active_tasks / max(1, self.max_workers)
            }
    
    def shutdown(self, wait: bool = True, cancel_pending: bool = True):
        logger.info("Shutting down concurrency scheduler")
        
        self._stop_event.set()
        
        if cancel_pending:
            with self._queue_lock:
                for task in list(self._pending_tasks):
                    self.cancel_task(task.task_id)
        
        with self._active_lock:
            for task_id in list(self._active_tasks.keys()):
                self.cancel_task(task_id)
        
        self.executor.shutdown(wait=wait)
        
        if self._dispatcher_thread:
            self._dispatcher_thread.join(timeout=5.0)
        
        self._is_running = False
        logger.info("Concurrency scheduler shutdown complete")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
    
    async def get_task_status_async(self, task_id: str) -> Optional[Dict]:
        return await asyncio.get_event_loop().run_in_executor(
            None, self.get_task_status, task_id
        )
    
    async def get_result_async(self, task_id: str, timeout: Optional[float] = None) -> Any:
        return await asyncio.get_event_loop().run_in_executor(
            None, self.get_result, task_id, timeout
        )


class AudioProcessingScheduler(ConcurrencyScheduler):
    def __init__(
        self,
        max_workers: int = 8,
        max_stream_workers: int = 4
    ):
        super().__init__(max_workers=max_workers)
        self.max_stream_workers = max_stream_workers
        self._stream_sessions: Dict[str, str] = {}
        self._stream_lock = threading.Lock()
    
    def submit_diagnosis(
        self,
        func: Callable,
        *args,
        callback: Optional[Callable] = None,
        **kwargs
    ) -> str:
        return self.submit(
            func,
            *args,
            priority=TaskPriority.HIGH,
            timeout=30.0,
            callback=callback,
            metadata={"type": "diagnosis"},
            **kwargs
        )
    
    def submit_stream_processing(
        self,
        session_id: str,
        func: Callable,
        *args,
        callback: Optional[Callable] = None,
        **kwargs
    ) -> Optional[str]:
        with self._stream_lock:
            active_streams = len([
                tid for tid, t in self._active_tasks.items()
                if t[0].metadata.get("type") == "stream"
            ])
            
            if active_streams >= self.max_stream_workers:
                return None
            
            if session_id in self._stream_sessions:
                existing_task_id = self._stream_sessions[session_id]
                if self.get_task_status(existing_task_id):
                    return None
            
            task_id = self.submit(
                func,
                *args,
                priority=TaskPriority.MEDIUM,
                timeout=60.0,
                callback=callback,
                metadata={"type": "stream", "session_id": session_id},
                **kwargs
            )
            
            self._stream_sessions[session_id] = task_id
            return task_id
    
    def submit_batch_processing(
        self,
        func: Callable,
        *args,
        callback: Optional[Callable] = None,
        **kwargs
    ) -> str:
        return self.submit(
            func,
            *args,
            priority=TaskPriority.LOW,
            timeout=300.0,
            callback=callback,
            metadata={"type": "batch"},
            **kwargs
        )
    
    def submit_model_training(
        self,
        func: Callable,
        *args,
        callback: Optional[Callable] = None,
        **kwargs
    ) -> str:
        return self.submit(
            func,
            *args,
            priority=TaskPriority.BACKGROUND,
            timeout=600.0,
            callback=callback,
            metadata={"type": "training"},
            **kwargs
        )
    
    def release_stream_session(self, session_id: str):
        with self._stream_lock:
            if session_id in self._stream_sessions:
                del self._stream_sessions[session_id]
    
    def get_stream_load(self) -> Dict:
        with self._stream_lock:
            active_streams = len([
                tid for tid, t in self._active_tasks.items()
                if t[0].metadata.get("type") == "stream"
            ])
        
        return {
            "active_streams": active_streams,
            "max_streams": self.max_stream_workers,
            "available_streams": self.max_stream_workers - active_streams,
            "utilization": active_streams / max(1, self.max_stream_workers)
        }
