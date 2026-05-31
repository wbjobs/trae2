import threading
import multiprocessing
import queue
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import concurrent.futures

from utils import setup_logger

logger = setup_logger("task_executor")


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class TaskResult:
    task_id: str
    status: TaskStatus
    result: Any = None
    exception: Optional[Exception] = None
    start_time: float = 0.0
    end_time: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time


class BaseExecutor(ABC):
    @abstractmethod
    def submit(self, func: Callable, args: Tuple = None, kwargs: Dict = None, task_id: str = None) -> str:
        pass

    @abstractmethod
    def get_result(self, task_id: str, timeout: float = None) -> Optional[TaskResult]:
        pass

    @abstractmethod
    def shutdown(self, wait: bool = True) -> None:
        pass

    @abstractmethod
    def active_count(self) -> int:
        pass


class ThreadPoolExecutor(BaseExecutor):
    def __init__(self, max_workers: int = None, thread_name_prefix: str = "worker"):
        self.max_workers = max_workers or max(1, multiprocessing.cpu_count() - 1)
        self.executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=self.max_workers,
            thread_name_prefix=thread_name_prefix
        )
        self.futures: Dict[str, concurrent.futures.Future] = {}
        self.results: Dict[str, TaskResult] = {}
        self._lock = threading.Lock()
        self._callback_handlers: List[Callable[[TaskResult], None]] = []

    def submit(self, func: Callable, args: Tuple = None, kwargs: Dict = None, task_id: str = None) -> str:
        args = args or ()
        kwargs = kwargs or {}
        task_id = task_id or f"task_{time.time_ns()}"

        wrapped_func = self._wrap_function(func, task_id)

        with self._lock:
            future = self.executor.submit(wrapped_func, *args, **kwargs)
            self.futures[task_id] = future
            future.add_done_callback(lambda f: self._handle_completion(task_id, f))

        return task_id

    def _wrap_function(self, func: Callable, task_id: str) -> Callable:
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                return TaskResult(
                    task_id=task_id,
                    status=TaskStatus.COMPLETED,
                    result=result,
                    start_time=start_time,
                    end_time=time.time()
                )
            except Exception as e:
                return TaskResult(
                    task_id=task_id,
                    status=TaskStatus.FAILED,
                    exception=e,
                    start_time=start_time,
                    end_time=time.time()
                )

        return wrapper

    def _handle_completion(self, task_id: str, future: concurrent.futures.Future) -> None:
        try:
            result = future.result()
        except Exception as e:
            result = TaskResult(
                task_id=task_id,
                status=TaskStatus.FAILED,
                exception=e,
                start_time=time.time(),
                end_time=time.time()
            )

        with self._lock:
            self.results[task_id] = result
            if task_id in self.futures:
                del self.futures[task_id]

        for handler in self._callback_handlers:
            try:
                handler(result)
            except Exception as e:
                logger.error(f"Callback handler error: {e}")

    def add_completion_callback(self, callback: Callable[[TaskResult], None]) -> None:
        self._callback_handlers.append(callback)

    def get_result(self, task_id: str, timeout: float = None) -> Optional[TaskResult]:
        with self._lock:
            if task_id in self.results:
                return self.results[task_id]

            if task_id in self.futures:
                future = self.futures[task_id]
                try:
                    result = future.result(timeout=timeout)
                    return result
                except concurrent.futures.TimeoutError:
                    return TaskResult(
                        task_id=task_id,
                        status=TaskStatus.TIMEOUT,
                        exception=TimeoutError(f"Task {task_id} timed out")
                    )

        return None

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self.futures:
                return self.futures[task_id].cancel()
        return False

    def shutdown(self, wait: bool = True) -> None:
        self.executor.shutdown(wait=wait)

    def active_count(self) -> int:
        with self._lock:
            return len(self.futures)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown(wait=True)
        return False


class ProcessPoolExecutor(BaseExecutor):
    def __init__(self, max_workers: int = None):
        self.max_workers = max_workers or max(1, multiprocessing.cpu_count() - 1)
        self.executor = concurrent.futures.ProcessPoolExecutor(max_workers=self.max_workers)
        self.futures: Dict[str, concurrent.futures.Future] = {}
        self.results: Dict[str, TaskResult] = {}
        self._lock = threading.Lock()
        self._manager = multiprocessing.Manager()

    def submit(self, func: Callable, args: Tuple = None, kwargs: Dict = None, task_id: str = None) -> str:
        args = args or ()
        kwargs = kwargs or {}
        task_id = task_id or f"task_{time.time_ns()}"

        with self._lock:
            future = self.executor.submit(self._process_wrapper, func, args, kwargs, task_id)
            self.futures[task_id] = future
            future.add_done_callback(lambda f: self._handle_completion(task_id, f))

        return task_id

    @staticmethod
    def _process_wrapper(func: Callable, args: Tuple, kwargs: Dict, task_id: str) -> TaskResult:
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            return TaskResult(
                task_id=task_id,
                status=TaskStatus.COMPLETED,
                result=result,
                start_time=start_time,
                end_time=time.time()
            )
        except Exception as e:
            return TaskResult(
                task_id=task_id,
                status=TaskStatus.FAILED,
                exception=e,
                start_time=start_time,
                end_time=time.time()
            )

    def _handle_completion(self, task_id: str, future: concurrent.futures.Future) -> None:
        try:
            result = future.result()
        except Exception as e:
            result = TaskResult(
                task_id=task_id,
                status=TaskStatus.FAILED,
                exception=e
            )

        with self._lock:
            self.results[task_id] = result
            if task_id in self.futures:
                del self.futures[task_id]

    def get_result(self, task_id: str, timeout: float = None) -> Optional[TaskResult]:
        with self._lock:
            if task_id in self.results:
                return self.results[task_id]

            if task_id in self.futures:
                future = self.futures[task_id]
                try:
                    return future.result(timeout=timeout)
                except concurrent.futures.TimeoutError:
                    return TaskResult(
                        task_id=task_id,
                        status=TaskStatus.TIMEOUT,
                        exception=TimeoutError(f"Task {task_id} timed out")
                    )

        return None

    def shutdown(self, wait: bool = True) -> None:
        self.executor.shutdown(wait=wait)

    def active_count(self) -> int:
        with self._lock:
            return len(self.futures)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown(wait=True)
        return False


class BatchProcessor:
    def __init__(self, executor: BaseExecutor, batch_size: int = 10):
        self.executor = executor
        self.batch_size = batch_size

    def map(self, func: Callable, items: List[Any], **kwargs) -> List[TaskResult]:
        results = []
        task_ids = []

        for i in range(0, len(items), self.batch_size):
            batch = items[i:i + self.batch_size]

            batch_task_ids = []
            for item in batch:
                tid = self.executor.submit(func, args=(item,), kwargs=kwargs)
                batch_task_ids.append(tid)

            for tid in batch_task_ids:
                result = self.executor.get_result(tid, timeout=None)
                if result:
                    results.append(result)

            task_ids.extend(batch_task_ids)

        return results

    def map_with_progress(
        self,
        func: Callable,
        items: List[Any],
        progress_callback: Callable[[int, int], None] = None,
        **kwargs
    ) -> List[TaskResult]:
        results = []
        total = len(items)

        for i, item in enumerate(items):
            tid = self.executor.submit(func, args=(item,), kwargs=kwargs)
            result = self.executor.get_result(tid, timeout=None)
            if result:
                results.append(result)

            if progress_callback:
                progress_callback(i + 1, total)

        return results


class WorkStealingExecutor(BaseExecutor):
    def __init__(self, n_workers: int = None):
        self.n_workers = n_workers or max(1, multiprocessing.cpu_count() - 1)
        self.task_queues: List[queue.Queue] = [queue.Queue() for _ in range(self.n_workers)]
        self.results: Dict[str, TaskResult] = {}
        self.workers: List[threading.Thread] = []
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._active_count = 0

        self._start_workers()

    def _start_workers(self) -> None:
        for i in range(self.n_workers):
            worker = threading.Thread(
                target=self._worker_loop,
                args=(i,),
                daemon=True,
                name=f"worker_{i}"
            )
            worker.start()
            self.workers.append(worker)

    def _worker_loop(self, worker_id: int) -> None:
        while not self._stop_event.is_set():
            task = None
            for q in [self.task_queues[worker_id]] + [self.task_queues[(worker_id + i + 1) % self.n_workers] for i in range(self.n_workers - 1)]:
                try:
                    task = q.get(timeout=0.01)
                    break
                except queue.Empty:
                    continue

            if task is None:
                continue

            func, args, kwargs, task_id = task
            start_time = time.time()

            try:
                result = func(*args, **kwargs)
                task_result = TaskResult(
                    task_id=task_id,
                    status=TaskStatus.COMPLETED,
                    result=result,
                    start_time=start_time,
                    end_time=time.time()
                )
            except Exception as e:
                task_result = TaskResult(
                    task_id=task_id,
                    status=TaskStatus.FAILED,
                    exception=e,
                    start_time=start_time,
                    end_time=time.time()
                )

            with self._lock:
                self.results[task_id] = task_result
                self._active_count -= 1

    def submit(self, func: Callable, args: Tuple = None, kwargs: Dict = None, task_id: str = None) -> str:
        args = args or ()
        kwargs = kwargs or {}
        task_id = task_id or f"task_{time.time_ns()}"

        with self._lock:
            queue_idx = min(range(self.n_workers), key=lambda i: self.task_queues[i].qsize())
            self.task_queues[queue_idx].put((func, args, kwargs, task_id))
            self._active_count += 1

        return task_id

    def get_result(self, task_id: str, timeout: float = None) -> Optional[TaskResult]:
        start = time.time()
        while timeout is None or time.time() - start < timeout:
            with self._lock:
                if task_id in self.results:
                    return self.results[task_id]
            time.sleep(0.01)
        return None

    def shutdown(self, wait: bool = True) -> None:
        self._stop_event.set()
        if wait:
            for worker in self.workers:
                worker.join(timeout=1.0)

    def active_count(self) -> int:
        with self._lock:
            return self._active_count + sum(q.qsize() for q in self.task_queues)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown(wait=True)
        return False


def create_executor(backend: str = "thread", max_workers: int = None) -> BaseExecutor:
    if backend in ["thread", "threading"]:
        return ThreadPoolExecutor(max_workers=max_workers)
    elif backend in ["process", "multiprocessing"]:
        return ProcessPoolExecutor(max_workers=max_workers)
    elif backend == "work_stealing":
        return WorkStealingExecutor(n_workers=max_workers)
    else:
        raise ValueError(f"Unknown backend: {backend}. Use 'thread', 'process', or 'work_stealing'")
