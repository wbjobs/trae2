import numpy as np
import multiprocessing as mp
import concurrent.futures
from typing import Any, Callable, List, Tuple, Optional, Dict, Union
from dataclasses import dataclass, field
from enum import Enum
from functools import partial
import threading
import queue
import time

from config import ParallelConfig
from utils import setup_logger, Timer

logger = setup_logger("parallel_kernel")


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class TaskResult:
    task_id: str
    status: TaskStatus
    result: Any = None
    error: Optional[str] = None
    execution_time: float = 0.0
    memory_used: float = 0.0
    worker_id: Optional[int] = None


@dataclass
class ChunkTask:
    task_id: str
    data_chunk: Any
    function: Callable
    args: Tuple = ()
    kwargs: Dict = field(default_factory=dict)
    priority: int = 0
    retry_count: int = 0


class ParallelKernel:
    def __init__(self, config: ParallelConfig):
        self.config = config
        self.n_workers = self._determine_n_workers()
        self._executor = None
        self._active_tasks: Dict[str, ChunkTask] = {}
        self._results_lock = threading.Lock()
        self._shutdown_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None
        logger.info(f"ParallelKernel initialized with {self.n_workers} workers, backend={config.backend}")

    def _determine_n_workers(self) -> int:
        if self.config.n_workers == -1:
            return max(1, mp.cpu_count() - 1)
        return max(1, min(self.config.n_workers, mp.cpu_count()))

    def __enter__(self):
        self._initialize_executor()
        self._start_monitor()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()

    def _initialize_executor(self):
        if self._executor is not None:
            return

        if self.config.backend == "multiprocessing":
            ctx = mp.get_context("spawn")
            self._executor = concurrent.futures.ProcessPoolExecutor(
                max_workers=self.n_workers,
                mp_context=ctx
            )
        elif self.config.backend == "threading":
            self._executor = concurrent.futures.ThreadPoolExecutor(
                max_workers=self.n_workers,
                thread_name_prefix="ocean_worker"
            )
        else:
            raise ValueError(f"Unsupported backend: {self.config.backend}")

    def _start_monitor(self):
        self._shutdown_event.clear()
        self._monitor_thread = threading.Thread(target=self._monitor_tasks, daemon=True)
        self._monitor_thread.start()

    def _monitor_tasks(self, check_interval: float = 1.0):
        logger.debug("Task monitor started")
        while not self._shutdown_event.is_set():
            try:
                time.sleep(check_interval)
            except:
                break
        logger.debug("Task monitor stopped")

    def shutdown(self, wait: bool = True, cancel_futures: bool = True):
        self._shutdown_event.set()

        if self._monitor_thread and self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=2.0)

        if self._executor:
            try:
                self._executor.shutdown(wait=wait, cancel_futures=cancel_futures)
            except TypeError:
                self._executor.shutdown(wait=wait)
            self._executor = None
            logger.info("ParallelKernel shutdown complete")

    def chunk_data(self, data: np.ndarray, chunk_size: Optional[int] = None) -> List[np.ndarray]:
        chunk_size = chunk_size or self.config.chunk_size
        if len(data) <= chunk_size:
            return [data]

        n_chunks = int(np.ceil(len(data) / chunk_size))
        chunks = np.array_split(data, n_chunks)
        logger.debug(f"Split data into {len(chunks)} chunks")
        return chunks

    def execute(
        self,
        function: Callable,
        data: Union[np.ndarray, List[Any]],
        *args,
        **kwargs
    ) -> List[TaskResult]:
        if isinstance(data, np.ndarray):
            chunks = self.chunk_data(data)
        else:
            chunks = list(data)

        n_chunks = len(chunks)
        logger.info(f"Executing {n_chunks} tasks in parallel with {self.n_workers} workers")

        results_dict: Dict[str, TaskResult] = {}
        completed_count = 0

        with Timer("Parallel execution", logger):
            if self._executor is None:
                self._initialize_executor()

            future_to_task: Dict[concurrent.futures.Future, str] = {}
            task_start_times: Dict[str, float] = {}

            for i, chunk in enumerate(chunks):
                task_id = f"chunk_{i}_{int(time.time() * 1000000)}"
                task_start_times[task_id] = time.time()

                try:
                    future = self._executor.submit(
                        self._execute_task,
                        task_id,
                        function,
                        chunk,
                        *args,
                        **kwargs
                    )
                    future_to_task[future] = task_id
                except Exception as e:
                    results_dict[task_id] = TaskResult(
                        task_id=task_id,
                        status=TaskStatus.FAILED,
                        error=f"Failed to submit task: {str(e)}"
                    )
                    completed_count += 1

            try:
                for future in concurrent.futures.as_completed(
                    future_to_task.keys(),
                    timeout=self.config.task_timeout * max(10, n_chunks // self.n_workers)
                ):
                    task_id = future_to_task[future]
                    try:
                        result = future.result(timeout=1.0)
                        results_dict[task_id] = result
                    except concurrent.futures.TimeoutError:
                        results_dict[task_id] = TaskResult(
                            task_id=task_id,
                            status=TaskStatus.TIMEOUT,
                            error=f"Task timed out after {self.config.task_timeout}s"
                        )
                    except Exception as e:
                        results_dict[task_id] = TaskResult(
                            task_id=task_id,
                            status=TaskStatus.FAILED,
                            error=str(e)
                        )

                    completed_count += 1
                    if completed_count % max(1, n_chunks // 10) == 0:
                        logger.debug(f"Progress: {completed_count}/{n_chunks} tasks completed")

            except concurrent.futures.TimeoutError:
                logger.warning("Global timeout reached, checking remaining tasks")
                for future, task_id in future_to_task.items():
                    if task_id not in results_dict:
                        if future.done():
                            try:
                                result = future.result(timeout=0.5)
                                results_dict[task_id] = result
                            except Exception as e:
                                results_dict[task_id] = TaskResult(
                                    task_id=task_id,
                                    status=TaskStatus.FAILED,
                                    error=str(e)
                                )
                        else:
                            results_dict[task_id] = TaskResult(
                                task_id=task_id,
                                status=TaskStatus.TIMEOUT,
                                error="Global timeout exceeded"
                            )

        results = [results_dict.get(f"chunk_{i}_{int(time.time() * 1000000)}") or
                   TaskResult(task_id=f"chunk_{i}", status=TaskStatus.FAILED, error="Missing result")
                   for i in range(n_chunks)]

        actual_results = list(results_dict.values())
        success_count = sum(1 for r in actual_results if r.status == TaskStatus.COMPLETED)
        logger.info(f"Execution complete: {success_count}/{n_chunks} tasks succeeded")

        return actual_results

    @staticmethod
    def _execute_task(
        task_id: str,
        function: Callable,
        data_chunk: Any,
        *args,
        **kwargs
    ) -> TaskResult:
        start_time = time.perf_counter()
        worker_id = mp.current_process().pid if mp.current_process().name != "MainProcess" else threading.get_ident()

        try:
            result = function(data_chunk, *args, **kwargs)
            execution_time = time.perf_counter() - start_time
            return TaskResult(
                task_id=task_id,
                status=TaskStatus.COMPLETED,
                result=result,
                execution_time=execution_time,
                worker_id=worker_id
            )
        except MemoryError as e:
            return TaskResult(
                task_id=task_id,
                status=TaskStatus.FAILED,
                error=f"MemoryError: {str(e)}",
                execution_time=time.perf_counter() - start_time,
                worker_id=worker_id
            )
        except Exception as e:
            execution_time = time.perf_counter() - start_time
            return TaskResult(
                task_id=task_id,
                status=TaskStatus.FAILED,
                error=str(e),
                execution_time=execution_time,
                worker_id=worker_id
            )

    def map_reduce(
        self,
        map_func: Callable,
        reduce_func: Callable,
        data: Union[np.ndarray, List[Any]],
        *args,
        **kwargs
    ) -> Any:
        map_results = self.execute(map_func, data, *args, **kwargs)

        successful_results = [
            r.result for r in map_results if r.status == TaskStatus.COMPLETED
        ]

        if not successful_results:
            raise RuntimeError("All map tasks failed")

        return reduce_func(successful_results)

    def apply_async(self, function: Callable, *args, **kwargs):
        if self._executor is None:
            self._initialize_executor()
        return self._executor.submit(function, *args, **kwargs)


class MultiLevelParallelKernel:
    def __init__(self, config: ParallelConfig):
        self.config = config
        self.process_pool = mp.Pool(processes=max(1, mp.cpu_count() // 2))
        self.thread_pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=max(2, mp.cpu_count())
        )

    def hybrid_execute(
        self,
        process_func: Callable,
        thread_func: Callable,
        data: np.ndarray,
        process_chunk_size: Optional[int] = None,
        thread_chunk_size: Optional[int] = None
    ) -> List[Any]:
        process_chunk_size = process_chunk_size or self.config.chunk_size * 10
        process_chunks = np.array_split(data, max(1, len(data) // process_chunk_size))

        def process_wrapper(chunk):
            thread_chunks = np.array_split(chunk, max(1, len(chunk) // (thread_chunk_size or 1000)))
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = [executor.submit(thread_func, tc) for tc in thread_chunks]
                return [f.result() for f in futures]

        results = self.process_pool.map(process_wrapper, process_chunks)
        return [item for sublist in results for item in sublist]

    def shutdown(self):
        self.process_pool.close()
        self.process_pool.join()
        self.thread_pool.shutdown()


class VectorizedProcessor:
    @staticmethod
    def vectorized_operation(data: np.ndarray, operation: str, **kwargs) -> np.ndarray:
        ops = {
            "mean": np.mean,
            "std": np.std,
            "min": np.min,
            "max": np.max,
            "median": np.median,
            "sum": np.sum,
            "normalize": lambda x: (x - np.mean(x)) / (np.std(x) + 1e-10),
            "scale": lambda x, min_val, max_val: (x - min_val) / (max_val - min_val + 1e-10),
        }

        if operation not in ops:
            raise ValueError(f"Unsupported operation: {operation}")

        return ops[operation](data, **kwargs)

    @staticmethod
    def batch_apply(
        data: np.ndarray,
        functions: List[Callable],
        axis: int = 0
    ) -> List[np.ndarray]:
        return [func(data, axis=axis) for func in functions]


def profile_parallel_performance(
    function: Callable,
    data: np.ndarray,
    n_workers_list: List[int] = [1, 2, 4, 8],
    n_runs: int = 3,
    backend: str = "multiprocessing"
) -> Dict[int, Dict[str, float]]:
    results = {}

    for n_workers in n_workers_list:
        times = []
        for _ in range(n_runs):
            config = ParallelConfig(n_workers=n_workers, backend=backend)
            with ParallelKernel(config) as kernel:
                with Timer() as timer:
                    kernel.execute(function, data)
                times.append(timer.elapsed)

        results[n_workers] = {
            "mean_time": np.mean(times),
            "std_time": np.std(times),
            "speedup": times[0] / np.mean(times) if n_workers > 1 else 1.0,
            "efficiency": (times[0] / np.mean(times)) / n_workers if n_workers > 1 else 1.0
        }

    return results
