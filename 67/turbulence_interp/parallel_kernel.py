import os
import logging
import time
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Callable, Tuple, Union, Generic, TypeVar
from pathlib import Path
from abc import ABC, abstractmethod
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed

import numpy as np

logger = logging.getLogger(__name__)

T = TypeVar("T")
R = TypeVar("R")


@dataclass
class TaskResult:
    task_id: str
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    worker_id: Optional[int] = None


@dataclass
class ParallelConfig:
    max_workers: int = 4
    backend: str = "concurrent"
    chunk_size: int = 1000
    use_processes: bool = True
    memory_limit_gb: Optional[float] = None
    task_timeout: Optional[float] = None
    max_retries: int = 3
    retry_delay: float = 1.0


class ParallelBackend(ABC):
    @abstractmethod
    def execute(self, func: Callable, tasks: List[Tuple], **kwargs) -> List[TaskResult]:
        pass

    @abstractmethod
    def shutdown(self):
        pass


class ConcurrentFuturesBackend(ParallelBackend):
    def __init__(self, config: ParallelConfig):
        self.config = config
        self.executor: Optional[Union[ProcessPoolExecutor, ThreadPoolExecutor]] = None
        self._init_executor()

    def _init_executor(self):
        if self.config.use_processes:
            self.executor = ProcessPoolExecutor(
                max_workers=self.config.max_workers,
            )
        else:
            self.executor = ThreadPoolExecutor(
                max_workers=self.config.max_workers,
            )

    def execute(self, func: Callable, tasks: List[Tuple], **kwargs) -> List[TaskResult]:
        results: List[TaskResult] = []
        futures = {}
        task_timeout = self.config.task_timeout
        
        for i, task_args in enumerate(tasks):
            future = self.executor.submit(self._wrap_task, func, f"task_{i}", task_args)
            futures[future] = f"task_{i}"

        for future in as_completed(futures):
            task_id = futures[future]
            try:
                if task_timeout:
                    result = future.result(timeout=task_timeout)
                else:
                    result = future.result()
                results.append(result)
            except TimeoutError as e:
                future.cancel()
                results.append(TaskResult(
                    task_id=task_id,
                    success=False,
                    error=f"Task timed out after {task_timeout}s",
                ))
            except Exception as e:
                results.append(TaskResult(
                    task_id=task_id,
                    success=False,
                    error=str(e),
                ))

        return results

    def _wrap_task(self, func: Callable, task_id: str, args: Tuple) -> TaskResult:
        max_retries = self.config.max_retries
        retry_delay = self.config.retry_delay
        
        for attempt in range(max_retries):
            start_time = time.time()
            worker_id = os.getpid() if self.config.use_processes else os.getppid()
            try:
                result = func(*args)
                return TaskResult(
                    task_id=task_id,
                    success=True,
                    result=result,
                    execution_time=time.time() - start_time,
                    worker_id=worker_id,
                )
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Task {task_id} attempt {attempt + 1} failed: {e}, retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                else:
                    return TaskResult(
                        task_id=task_id,
                        success=False,
                        error=str(e),
                        execution_time=time.time() - start_time,
                        worker_id=worker_id,
                    )

    def shutdown(self):
        if self.executor:
            self.executor.shutdown(wait=True)


class JoblibBackend(ParallelBackend):
    def __init__(self, config: ParallelConfig):
        self.config = config
        try:
            from joblib import Parallel, delayed
            self.Parallel = Parallel
            self.delayed = delayed
        except ImportError:
            raise ImportError("joblib is required for JoblibBackend")

    def execute(self, func: Callable, tasks: List[Tuple], **kwargs) -> List[TaskResult]:
        results: List[TaskResult] = []
        
        delayed_funcs = [
            self.delayed(self._wrap_task)(func, f"task_{i}", task_args)
            for i, task_args in enumerate(tasks)
        ]

        joblib_results = self.Parallel(
            n_jobs=self.config.max_workers,
            prefer="processes" if self.config.use_processes else "threads",
            verbose=kwargs.get("verbose", 0),
        )(delayed_funcs)

        for result in joblib_results:
            results.append(result)

        return results

    def _wrap_task(self, func: Callable, task_id: str, args: Tuple) -> TaskResult:
        start_time = time.time()
        worker_id = os.getpid()
        try:
            result = func(*args)
            return TaskResult(
                task_id=task_id,
                success=True,
                result=result,
                execution_time=time.time() - start_time,
                worker_id=worker_id,
            )
        except Exception as e:
            return TaskResult(
                task_id=task_id,
                success=False,
                error=str(e),
                execution_time=time.time() - start_time,
                worker_id=worker_id,
            )

    def shutdown(self):
        pass


class DaskBackend(ParallelBackend):
    def __init__(self, config: ParallelConfig, dask_client=None):
        self.config = config
        self.client = dask_client
        self._own_client = dask_client is None
        self._init_client()

    def _init_client(self):
        if self._own_client:
            try:
                from dask.distributed import Client, LocalCluster
                cluster = LocalCluster(
                    n_workers=self.config.max_workers,
                    processes=self.config.use_processes,
                )
                self.client = Client(cluster)
            except ImportError:
                raise ImportError("dask distributed is required for DaskBackend")

    def execute(self, func: Callable, tasks: List[Tuple], **kwargs) -> List[TaskResult]:
        if self.client is None:
            raise RuntimeError("Dask client not initialized")

        futures = [
            self.client.submit(self._wrap_task, func, f"task_{i}", task_args)
            for i, task_args in enumerate(tasks)
        ]

        results = self.client.gather(futures)
        return list(results)

    def _wrap_task(self, func: Callable, task_id: str, args: Tuple) -> TaskResult:
        start_time = time.time()
        worker_id = os.getpid()
        try:
            result = func(*args)
            return TaskResult(
                task_id=task_id,
                success=True,
                result=result,
                execution_time=time.time() - start_time,
                worker_id=worker_id,
            )
        except Exception as e:
            return TaskResult(
                task_id=task_id,
                success=False,
                error=str(e),
                execution_time=time.time() - start_time,
                worker_id=worker_id,
            )

    def shutdown(self):
        if self.client and self._own_client:
            self.client.close()


class MpiBackend(ParallelBackend):
    def __init__(self, config: ParallelConfig):
        self.config = config
        try:
            from mpi4py import MPI
            self.MPI = MPI
            self.comm = MPI.COMM_WORLD
            self.rank = self.comm.Get_rank()
            self.size = self.comm.Get_size()
        except ImportError:
            raise ImportError("mpi4py is required for MpiBackend")

    def execute(self, func: Callable, tasks: List[Tuple], **kwargs) -> List[TaskResult]:
        if self.rank == 0:
            chunks = self._split_tasks(tasks)
        else:
            chunks = None

        my_chunk = self.comm.scatter(chunks, root=0)
        local_results = []

        for i, task_args in enumerate(my_chunk):
            task_id = f"task_{self.rank}_{i}"
            start_time = time.time()
            try:
                result = func(*task_args)
                local_results.append(TaskResult(
                    task_id=task_id,
                    success=True,
                    result=result,
                    execution_time=time.time() - start_time,
                    worker_id=self.rank,
                ))
            except Exception as e:
                local_results.append(TaskResult(
                    task_id=task_id,
                    success=False,
                    error=str(e),
                    execution_time=time.time() - start_time,
                    worker_id=self.rank,
                ))

        all_results = self.comm.gather(local_results, root=0)
        
        if self.rank == 0:
            flat_results = []
            for rank_results in all_results:
                flat_results.extend(rank_results)
            return flat_results
        else:
            return []

    def _split_tasks(self, tasks: List[Tuple]) -> List[List[Tuple]]:
        chunk_size = len(tasks) // self.size
        chunks = []
        for i in range(self.size):
            start = i * chunk_size
            end = start + chunk_size if i < self.size - 1 else len(tasks)
            chunks.append(tasks[start:end])
        return chunks

    def shutdown(self):
        pass


class ParallelProcessor:
    BACKENDS = {
        "concurrent": ConcurrentFuturesBackend,
        "joblib": JoblibBackend,
        "dask": DaskBackend,
        "mpi": MpiBackend,
    }

    def __init__(self, config: Optional[ParallelConfig] = None, **kwargs):
        self.config = config or ParallelConfig(**kwargs)
        self.backend: Optional[ParallelBackend] = None
        self._init_backend()

    def _init_backend(self):
        backend_cls = self.BACKENDS.get(self.config.backend)
        if backend_cls is None:
            raise ValueError(f"Unsupported backend: {self.config.backend}")
        self.backend = backend_cls(self.config)
        logger.info(f"Initialized {self.config.backend} backend with {self.config.max_workers} workers")

    def map(self, func: Callable, tasks: List[Tuple], **kwargs) -> List[TaskResult]:
        if self.backend is None:
            raise RuntimeError("Backend not initialized")

        logger.info(f"Executing {len(tasks)} tasks with {self.config.backend} backend")
        start_time = time.time()
        
        results = self.backend.execute(func, tasks, **kwargs)
        
        total_time = time.time() - start_time
        success_count = sum(1 for r in results if r.success)
        logger.info(f"Completed {success_count}/{len(tasks)} tasks in {total_time:.2f}s")

        return results

    def map_chunks(self, func: Callable, data: np.ndarray, *args, axis: int = 0, **kwargs) -> List[TaskResult]:
        chunks = self._split_array(data, axis)
        tasks = [(chunk,) + args for chunk in chunks]
        return self.map(func, tasks, **kwargs)

    def _split_array(self, data: np.ndarray, axis: int) -> List[np.ndarray]:
        chunk_size = self.config.chunk_size
        total_size = data.shape[axis]
        
        if total_size <= chunk_size:
            return [data]

        n_chunks = (total_size + chunk_size - 1) // chunk_size
        chunks = []
        for i in range(n_chunks):
            start = i * chunk_size
            end = min(start + chunk_size, total_size)
            slc = [slice(None)] * data.ndim
            slc[axis] = slice(start, end)
            chunks.append(data[tuple(slc)])

        return chunks

    def shutdown(self):
        if self.backend:
            self.backend.shutdown()
            logger.info("Parallel backend shut down")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
        return False

    @staticmethod
    def available_backends() -> List[str]:
        available = ["concurrent"]
        try:
            import joblib
            available.append("joblib")
        except ImportError:
            pass
        try:
            import dask.distributed
            available.append("dask")
        except ImportError:
            pass
        try:
            import mpi4py
            available.append("mpi")
        except ImportError:
            pass
        return available


def chunked_computation(func: Callable, data: np.ndarray, chunk_size: int, axis: int = 0, **kwargs) -> np.ndarray:
    results = []
    total_size = data.shape[axis]
    n_chunks = (total_size + chunk_size - 1) // chunk_size
    
    for i in range(n_chunks):
        start = i * chunk_size
        end = min(start + chunk_size, total_size)
        slc = [slice(None)] * data.ndim
        slc[axis] = slice(start, end)
        chunk = data[tuple(slc)]
        result = func(chunk, **kwargs)
        results.append(result)
    
    return np.concatenate(results, axis=axis)
