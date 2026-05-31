import os
import sys
import time
import queue
import signal
import threading
import multiprocessing
from multiprocessing import Pool, Manager, cpu_count
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
import uuid
from datetime import datetime
import traceback


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class TaskType(Enum):
    DENOISE = "denoise"
    FEATURE_EXTRACTION = "feature_extraction"
    CLASSIFICATION = "classification"
    FULL_PIPELINE = "full_pipeline"
    MODEL_TRAINING = "model_training"
    SAMPLE_IMPORT = "sample_import"


@dataclass
class Task:
    task_id: str
    task_type: str
    func_name: str
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    timeout: float = 300.0
    retry_count: int = 0
    max_retries: int = 3

    @property
    def duration(self) -> Optional[float]:
        if self.started_at and self.completed_at:
            return self.completed_at - self.started_at
        return None


@dataclass
class ProcessingTask:
    task_id: str
    task_type: TaskType
    priority: int = 5
    data: Dict[str, Any] = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    timeout: float = 300.0

    def __lt__(self, other):
        return self.priority < other.priority


class WorkerProcess:
    def __init__(self, task_queue, result_queue, worker_id: int):
        self.worker_id = worker_id
        self.task_queue = task_queue
        self.result_queue = result_queue
        self._process = None
        self._running = False

    def start(self):
        self._running = True
        self._process = multiprocessing.Process(
            target=self._worker_loop,
            args=(self.task_queue, self.result_queue, self.worker_id),
            daemon=True
        )
        self._process.start()

    def stop(self):
        self._running = False
        if self._process:
            self._process.terminate()
            self._process.join(timeout=5)

    @staticmethod
    def _worker_loop(task_queue, result_queue, worker_id: int):
        signal.signal(signal.SIGINT, signal.SIG_IGN)

        print(f"Worker {worker_id} started, PID: {os.getpid()}")

        while True:
            try:
                task = task_queue.get(timeout=1.0)
                if task is None:
                    break

                WorkerProcess._execute_task(task, result_queue, worker_id)

            except queue.Empty:
                continue
            except Exception as e:
                print(f"Worker {worker_id} error: {e}")
                continue

        print(f"Worker {worker_id} stopped")

    @staticmethod
    def _execute_task(task: Task, result_queue, worker_id: int):
        task.started_at = time.time()
        task.status = TaskStatus.RUNNING

        try:
            func = _get_function(task.func_name)
            if func is None:
                raise ValueError(f"Function {task.func_name} not found")

            result = func(*task.args, **task.kwargs)

            task.result = result
            task.status = TaskStatus.COMPLETED

        except Exception as e:
            task.error = f"{type(e).__name__}: {str(e)}"
            task.status = TaskStatus.FAILED
            print(f"Task {task.task_id} failed in worker {worker_id}: {task.error}")
            traceback.print_exc()

        finally:
            task.completed_at = time.time()
            result_queue.put(task)


def _get_function(func_name: str) -> Optional[Callable]:
    module_map = {
        "process_denoise_task": "denoiser",
        "process_feature_extraction_task": "feature_extractor",
        "process_classification_task": "fault_classifier",
    }

    try:
        if func_name in module_map:
            module_name = module_map[func_name]
            module = __import__(module_name)
            return getattr(module, func_name)
    except Exception as e:
        print(f"Error loading function {func_name}: {e}")

    return None


class TaskManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, max_workers: int = None, min_workers: int = 1,
                 auto_scale: bool = True, load_threshold_high: float = 0.8,
                 load_threshold_low: float = 0.3):
        if hasattr(self, '_initialized') and self._initialized:
            return

        self._initialized = True
        self._manager = Manager()
        self.task_queue = self._manager.Queue()
        self.result_queue = self._manager.Queue()

        self.tasks: Dict[str, Task] = {}
        self._tasks_lock = threading.Lock()

        if max_workers is None:
            max_workers = max(1, min(cpu_count() - 1, 8))
        self.max_workers = max_workers
        self.min_workers = min_workers
        self.num_workers = min_workers
        self.workers: List[WorkerProcess] = []

        self._dispatcher_thread = None
        self._result_handler_thread = None
        self._running = False

        self._callbacks: Dict[str, List[Callable]] = {}

        self.priority_queue = queue.PriorityQueue()

        self.auto_scale = auto_scale
        self.load_threshold_high = load_threshold_high
        self.load_threshold_low = load_threshold_low
        self._load_history: List[float] = []

        self._task_dependencies: Dict[str, List[str]] = {}
        self._completed_tasks: set = set()

        self._start()

    def _start(self):
        if self._running:
            return

        self._running = True

        for i in range(self.num_workers):
            worker = WorkerProcess(self.task_queue, self.result_queue, i)
            worker.start()
            self.workers.append(worker)

        print(f"Started {self.num_workers} worker processes")

        self._result_handler_thread = threading.Thread(
            target=self._result_handler_loop,
            daemon=True
        )
        self._result_handler_thread.start()

        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True
        )
        self._monitor_thread.start()

    def _stop(self):
        self._running = False

        for _ in range(self.num_workers):
            self.task_queue.put(None)

        for worker in self.workers:
            worker.stop()

        self.workers.clear()

    def _result_handler_loop(self):
        while self._running:
            try:
                completed_task = self.result_queue.get(timeout=1.0)

                with self._tasks_lock:
                    if completed_task.task_id in self.tasks:
                        self.tasks[completed_task.task_id] = completed_task

                    if completed_task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.TIMEOUT]:
                        self._completed_tasks.add(completed_task.task_id)

                self._trigger_callbacks(completed_task)

            except queue.Empty:
                continue
            except Exception as e:
                print(f"Result handler error: {e}")

    def _monitor_loop(self):
        while self._running:
            try:
                time.sleep(5)
                self._check_timeouts()
                self._check_worker_health()
                if self.auto_scale:
                    self._auto_scale_workers()
                self._check_dependencies()
            except Exception as e:
                print(f"Monitor error: {e}")

    def _get_current_load(self) -> float:
        try:
            queue_size = self.task_queue.qsize()
            running_count = sum(1 for t in self.tasks.values() if t.status == TaskStatus.RUNNING)
            total_capacity = self.num_workers * 2
            load = (queue_size + running_count) / max(total_capacity, 1)
            return min(load, 1.0)
        except:
            return 0.0

    def _auto_scale_workers(self):
        current_load = self._get_current_load()
        self._load_history.append(current_load)
        if len(self._load_history) > 10:
            self._load_history = self._load_history[-10:]

        avg_load = sum(self._load_history) / len(self._load_history) if self._load_history else 0

        if avg_load > self.load_threshold_high and self.num_workers < self.max_workers:
            self._scale_up()
        elif avg_load < self.load_threshold_low and self.num_workers > self.min_workers:
            self._scale_down()

    def _scale_up(self):
        new_worker_id = len(self.workers)
        worker = WorkerProcess(self.task_queue, self.result_queue, new_worker_id)
        worker.start()
        self.workers.append(worker)
        self.num_workers += 1
        print(f"Scaled up to {self.num_workers} workers (avg load high)")

    def _scale_down(self):
        if len(self.workers) > self.min_workers:
            worker = self.workers.pop()
            worker.stop()
            self.num_workers -= 1
            print(f"Scaled down to {self.num_workers} workers (avg load low)")

    def _check_dependencies(self):
        with self._tasks_lock:
            for task_id, dependencies in list(self._task_dependencies.items()):
                if all(dep in self._completed_tasks for dep in dependencies):
                    task = self.tasks.get(task_id)
                    if task and task.status == TaskStatus.PENDING:
                        self._submit_to_queue(task)
                    del self._task_dependencies[task_id]

    def _check_timeouts(self):
        now = time.time()
        with self._tasks_lock:
            for task_id, task in list(self.tasks.items()):
                if task.status == TaskStatus.RUNNING and task.started_at:
                    if now - task.started_at > task.timeout:
                        task.status = TaskStatus.TIMEOUT
                        task.completed_at = now
                        task.error = "Task timeout"
                        print(f"Task {task_id} timed out")

    def _check_worker_health(self):
        for i, worker in enumerate(self.workers):
            if worker._process and not worker._process.is_alive():
                print(f"Worker {i} died, restarting...")
                worker.stop()

                new_worker = WorkerProcess(self.task_queue, self.result_queue, i)
                new_worker.start()
                self.workers[i] = new_worker

    def _submit_to_queue(self, task: Task):
        self.task_queue.put(task)

    def submit_task(self, func_name: str, *args,
                    task_type: str = "general",
                    timeout: float = 300.0,
                    max_retries: int = 3,
                    callback: Optional[Callable] = None,
                    depends_on: Optional[List[str]] = None,
                    **kwargs) -> str:
        task_id = str(uuid.uuid4())

        task = Task(
            task_id=task_id,
            task_type=task_type,
            func_name=func_name,
            args=args,
            kwargs=kwargs,
            timeout=timeout,
            max_retries=max_retries
        )

        with self._tasks_lock:
            self.tasks[task_id] = task

        if callback:
            self.register_callback(task_id, callback)

        if depends_on:
            with self._tasks_lock:
                self._task_dependencies[task_id] = depends_on
        else:
            self._submit_to_queue(task)

        return task_id

    def submit_task_batch(self, tasks: List[Dict],
                          batch_size: int = 10,
                          callback: Optional[Callable] = None) -> List[str]:
        task_ids = []
        for i, task_info in enumerate(tasks):
            task_id = self.submit_task(
                func_name=task_info.get('func_name'),
                *task_info.get('args', ()),
                task_type=task_info.get('task_type', 'general'),
                timeout=task_info.get('timeout', 300.0),
                max_retries=task_info.get('max_retries', 3),
                **task_info.get('kwargs', {})
            )
            task_ids.append(task_id)

        return task_ids

    def submit_processing_task(self, task: ProcessingTask,
                                callback: Optional[Callable] = None) -> str:
        task_id = task.task_id

        with self._tasks_lock:
            self.tasks[task_id] = task

        if callback:
            self.register_callback(task_id, callback)

        self.priority_queue.put(task)

        return task_id

    def get_task(self, task_id: str) -> Optional[Task]:
        with self._tasks_lock:
            return self.tasks.get(task_id)

    def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        task = self.get_task(task_id)
        return task.status if task else None

    def get_task_result(self, task_id: str) -> Optional[Any]:
        task = self.get_task(task_id)
        return task.result if task else None

    def wait_for_task(self, task_id: str, timeout: float = 300.0) -> Optional[Task]:
        start_time = time.time()
        while time.time() - start_time < timeout:
            task = self.get_task(task_id)
            if task and task.status in [
                TaskStatus.COMPLETED, TaskStatus.FAILED,
                TaskStatus.TIMEOUT, TaskStatus.CANCELLED
            ]:
                return task
            time.sleep(0.1)
        return None

    def register_callback(self, task_id: str, callback: Callable):
        with self._tasks_lock:
            if task_id not in self._callbacks:
                self._callbacks[task_id] = []
            self._callbacks[task_id].append(callback)

    def _trigger_callbacks(self, task: Task):
        with self._tasks_lock:
            if task.task_id in self._callbacks:
                for callback in self._callbacks[task.task_id]:
                    try:
                        callback(task)
                    except Exception as e:
                        print(f"Callback error: {e}")
                del self._callbacks[task.task_id]

    def cancel_task(self, task_id: str) -> bool:
        with self._tasks_lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                if task.status == TaskStatus.PENDING:
                    task.status = TaskStatus.CANCELLED
                    return True
        return False

    def get_queue_stats(self) -> Dict:
        with self._tasks_lock:
            pending = sum(1 for t in self.tasks.values() if t.status == TaskStatus.PENDING)
            running = sum(1 for t in self.tasks.values() if t.status == TaskStatus.RUNNING)
            completed = sum(1 for t in self.tasks.values() if t.status == TaskStatus.COMPLETED)
            failed = sum(1 for t in self.tasks.values() if t.status in [TaskStatus.FAILED, TaskStatus.TIMEOUT])

        return {
            "pending": pending,
            "running": running,
            "completed": completed,
            "failed": failed,
            "workers": self.num_workers,
            "min_workers": self.min_workers,
            "max_workers": self.max_workers,
            "auto_scale": self.auto_scale,
            "current_load": self._get_current_load(),
            "queue_size": self.task_queue.qsize() if hasattr(self.task_queue, 'qsize') else 0
        }

    def get_worker_stats(self) -> List[Dict]:
        stats = []
        for i, worker in enumerate(self.workers):
            process = worker._process
            stats.append({
                "worker_id": i,
                "pid": process.pid if process else None,
                "is_alive": process.is_alive() if process else False
            })
        return stats

    def cleanup_old_tasks(self, max_age: float = 3600.0):
        now = time.time()
        with self._tasks_lock:
            old_task_ids = [
                task_id for task_id, task in self.tasks.items()
                if task.completed_at and (now - task.completed_at > max_age)
            ]
            for task_id in old_task_ids:
                del self.tasks[task_id]
                if task_id in self._callbacks:
                    del self._callbacks[task_id]


class ThreadPoolExecutor:
    def __init__(self, max_workers: int = None):
        self.max_workers = max_workers or max(1, cpu_count())
        self._pool = None
        self._tasks: Dict[str, Any] = {}
        self._lock = threading.Lock()

    def start(self):
        if self._pool is None:
            self._pool = ThreadPoolExecutor._create_pool(self.max_workers)

    @staticmethod
    def _create_pool(max_workers):
        from concurrent.futures import ThreadPoolExecutor as _ThreadPoolExecutor
        return _ThreadPoolExecutor(max_workers=max_workers)

    def submit(self, func: Callable, *args, **kwargs) -> str:
        if self._pool is None:
            self.start()

        task_id = str(uuid.uuid4())
        future = self._pool.submit(func, *args, **kwargs)

        with self._lock:
            self._tasks[task_id] = {
                "future": future,
                "created_at": time.time()
            }

        return task_id

    def get_result(self, task_id: str, timeout: float = None):
        with self._lock:
            task_info = self._tasks.get(task_id)

        if not task_info:
            return None

        future = task_info["future"]
        if future.done():
            try:
                return future.result(timeout=0)
            except Exception as e:
                return {"error": str(e)}
        return None

    def shutdown(self):
        if self._pool:
            self._pool.shutdown(wait=False)
            self._pool = None


def init_task_manager():
    task_manager = TaskManager()
    return task_manager


def get_task_manager() -> TaskManager:
    return TaskManager()


_thread_pool = None


def get_thread_pool() -> ThreadPoolExecutor:
    global _thread_pool
    if _thread_pool is None:
        _thread_pool = ThreadPoolExecutor(max_workers=16)
        _thread_pool.start()
    return _thread_pool


def process_with_timeout(func: Callable, timeout: float = 60.0, *args, **kwargs):
    def target(result_dict):
        try:
            result_dict['result'] = func(*args, **kwargs)
        except Exception as e:
            result_dict['error'] = str(e)
            result_dict['exception'] = e

    manager = Manager()
    result_dict = manager.dict()

    process = multiprocessing.Process(target=target, args=(result_dict,))
    process.start()
    process.join(timeout=timeout)

    if process.is_alive():
        process.terminate()
        process.join()
        return {"error": "Timeout"}

    if 'error' in result_dict:
        return {"error": result_dict['error']}

    return result_dict.get('result')


def safe_execute(func: Callable, *args, default_value=None, max_retries: int = 3, **kwargs):
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Function {func.__name__} failed after {max_retries} attempts: {e}")
                return default_value
            time.sleep(0.1 * (attempt + 1))
    return default_value
