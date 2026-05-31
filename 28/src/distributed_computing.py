"""
分布式计算与任务监控模块
支持本地单机运行与分布式计算集群运行，对接任务监控后端服务
"""

import os
import time
import uuid
import json
import threading
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
import logging
from datetime import datetime
from pathlib import Path
import psutil

try:
    from mpi4py import MPI
    MPI_AVAILABLE = True
except ImportError:
    MPI_AVAILABLE = False

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ComputationMode(Enum):
    LOCAL = "local"
    DISTRIBUTED = "distributed"
    CLUSTER = "cluster"


@dataclass
class TaskInfo:
    task_id: str
    name: str
    status: TaskStatus
    mode: ComputationMode
    progress: float = 0.0
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    error_message: Optional[str] = None
    worker_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            'task_id': self.task_id,
            'name': self.name,
            'status': self.status.value,
            'mode': self.mode.value,
            'progress': self.progress,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'error_message': self.error_message,
            'worker_id': self.worker_id,
            'metadata': self.metadata
        }


@dataclass
class SystemResources:
    cpu_percent: float
    memory_usage_mb: float
    memory_percent: float
    disk_usage_percent: float
    network_io_mb: float = 0.0


class TaskMonitor:
    def __init__(self, monitoring_url: Optional[str] = None, enable_monitoring: bool = True):
        self.monitoring_url = monitoring_url
        self.enable_monitoring = enable_monitoring
        self._tasks: Dict[str, TaskInfo] = {}
        self._monitoring_thread: Optional[threading.Thread] = None
        self._stop_monitoring = threading.Event()

    def create_task(self, name: str, mode: ComputationMode = ComputationMode.LOCAL) -> str:
        task_id = str(uuid.uuid4())
        task = TaskInfo(
            task_id=task_id,
            name=name,
            status=TaskStatus.PENDING,
            mode=mode,
            worker_id=str(os.getpid())
        )
        self._tasks[task_id] = task
        logger.info(f"创建任务: {task_id} ({name})")
        self._notify_backend(task)
        return task_id

    def start_task(self, task_id: str):
        if task_id not in self._tasks:
            logger.warning(f"任务不存在: {task_id}")
            return
        task = self._tasks[task_id]
        task.status = TaskStatus.RUNNING
        task.start_time = time.time()
        logger.info(f"任务开始执行: {task_id}")
        self._notify_backend(task)

    def update_progress(self, task_id: str, progress: float, message: str = None):
        if task_id not in self._tasks:
            return
        task = self._tasks[task_id]
        task.progress = max(0.0, min(100.0, progress))
        if message:
            task.metadata['progress_message'] = message
        self._notify_backend(task)

    def complete_task(self, task_id: str, results: Optional[Dict] = None):
        if task_id not in self._tasks:
            return
        task = self._tasks[task_id]
        task.status = TaskStatus.COMPLETED
        task.progress = 100.0
        task.end_time = time.time()
        if results:
            task.metadata['results'] = results
        duration = (task.end_time - task.start_time) if task.start_time else 0
        logger.info(f"任务完成: {task_id}, 耗时: {duration:.2f}秒")
        self._notify_backend(task)

    def fail_task(self, task_id: str, error_message: str):
        if task_id not in self._tasks:
            return
        task = self._tasks[task_id]
        task.status = TaskStatus.FAILED
        task.error_message = error_message
        task.end_time = time.time()
        logger.error(f"任务失败: {task_id}, 错误: {error_message}")
        self._notify_backend(task)

    def get_task_status(self, task_id: str) -> Optional[TaskInfo]:
        return self._tasks.get(task_id)

    def get_all_tasks(self) -> List[TaskInfo]:
        return list(self._tasks.values())

    def _notify_backend(self, task: TaskInfo):
        if not self.enable_monitoring or not self.monitoring_url or not REQUESTS_AVAILABLE:
            return
        try:
            url = f"{self.monitoring_url}/tasks/{task.task_id}"
            requests.put(url, json=task.to_dict(), timeout=2)
        except Exception as e:
            logger.debug(f"监控服务通知失败: {e}")

    def start_system_monitoring(self, task_id: str, interval: int = 5):
        if not self.enable_monitoring:
            return

        def monitor():
            while not self._stop_monitoring.is_set():
                resources = self._get_system_resources()
                if task_id in self._tasks:
                    self._tasks[task_id].metadata['system_resources'] = asdict(resources)
                time.sleep(interval)

        self._stop_monitoring.clear()
        self._monitoring_thread = threading.Thread(target=monitor, daemon=True)
        self._monitoring_thread.start()

    def stop_system_monitoring(self):
        self._stop_monitoring.set()
        if self._monitoring_thread:
            self._monitoring_thread.join(timeout=2)

    def _get_system_resources(self) -> SystemResources:
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')

        return SystemResources(
            cpu_percent=psutil.cpu_percent(),
            memory_usage_mb=memory.used / (1024 * 1024),
            memory_percent=memory.percent,
            disk_usage_percent=disk.percent
        )


class DistributedSolver:
    def __init__(self, config: Dict):
        self.config = config
        self.mode = ComputationMode(config.get('mode', 'local'))
        self.workers = config.get('workers', 1)
        self.monitor = TaskMonitor(
            monitoring_url=config.get('monitoring_url'),
            enable_monitoring=config.get('enable_monitoring', True)
        )

        if MPI_AVAILABLE:
            self.comm = MPI.COMM_WORLD
            self.rank = self.comm.Get_rank()
            self.size = self.comm.Get_size()
        else:
            self.comm = None
            self.rank = 0
            self.size = 1

    def is_master(self) -> bool:
        return self.rank == 0

    def is_worker(self) -> bool:
        return self.rank != 0

    def run_distributed(self, task_name: str, solver_func: Callable, *args, **kwargs) -> Any:
        if self.mode == ComputationMode.LOCAL or self.size == 1:
            return self._run_local(task_name, solver_func, *args, **kwargs)
        else:
            return self._run_mpi(task_name, solver_func, *args, **kwargs)

    def _run_local(self, task_name: str, solver_func: Callable, *args, **kwargs) -> Any:
        logger.info(f"本地模式运行: {task_name}")
        task_id = self.monitor.create_task(task_name, ComputationMode.LOCAL)
        self.monitor.start_system_monitoring(task_id)
        self.monitor.start_task(task_id)

        try:
            def progress_callback(progress, message=None):
                self.monitor.update_progress(task_id, progress, message)

            kwargs['progress_callback'] = progress_callback
            result = solver_func(*args, **kwargs)

            self.monitor.complete_task(task_id, {'status': 'success'})
            return result

        except Exception as e:
            self.monitor.fail_task(task_id, str(e))
            raise
        finally:
            self.monitor.stop_system_monitoring()

    def _run_mpi(self, task_name: str, solver_func: Callable, *args, **kwargs) -> Any:
        if self.is_master():
            logger.info(f"MPI分布式模式运行: {task_name}, 进程数: {self.size}")
            task_id = self.monitor.create_task(task_name, ComputationMode.DISTRIBUTED)
            self.monitor.start_task(task_id)

        try:
            self.comm.Barrier()

            if self.is_master():
                self.monitor.update_progress(task_id, 10.0, "数据分发中...")

            data = args[0] if args else None
            data_chunks = self._distribute_data(data) if self.is_master() else None
            local_data = self.comm.scatter(data_chunks, root=0)

            if self.is_master():
                self.monitor.update_progress(task_id, 30.0, "并行计算中...")

            def progress_callback(progress, message=None):
                if self.is_master():
                    overall_progress = 30.0 + progress * 0.6
                    self.monitor.update_progress(task_id, overall_progress, message)

            kwargs['progress_callback'] = progress_callback
            local_result = solver_func(local_data, *args[1:], **kwargs)

            all_results = self.comm.gather(local_result, root=0)

            if self.is_master():
                self.monitor.update_progress(task_id, 90.0, "结果汇总中...")
                final_result = self._merge_results(all_results)
                self.monitor.complete_task(task_id, {'status': 'success', 'workers': self.size})
                return final_result
            else:
                return None

        except Exception as e:
            if self.is_master():
                self.monitor.fail_task(task_id, str(e))
            raise

    def _distribute_data(self, data) -> List:
        if not hasattr(data, '__len__'):
            return [data] * self.size

        n = len(data)
        chunk_size = (n + self.size - 1) // self.size
        chunks = []
        for i in range(self.size):
            start = i * chunk_size
            end = min(start + chunk_size, n)
            chunks.append(data[start:end] if hasattr(data, '__getitem__') else data)
        return chunks

    def _merge_results(self, results: List) -> Any:
        if not results:
            return None

        if all(isinstance(r, dict) for r in results):
            merged = {}
            for r in results:
                merged.update(r)
            return merged

        if all(isinstance(r, list) for r in results):
            return [item for sublist in results for item in sublist]

        return results[0]


class ClusterManager:
    def __init__(self, config: Dict):
        self.config = config
        self.cluster_nodes = config.get('nodes', [])
        self.task_queue: List[str] = []
        self.running_tasks: Dict[str, str] = {}

    def submit_task(self, task_data: Dict) -> str:
        task_id = str(uuid.uuid4())
        self.task_queue.append(task_id)
        logger.info(f"任务已提交到集群: {task_id}")
        return task_id

    def get_queue_status(self) -> Dict:
        return {
            'queued': len(self.task_queue),
            'running': len(self.running_tasks),
            'nodes': len(self.cluster_nodes)
        }

    def cancel_task(self, task_id: str) -> bool:
        if task_id in self.task_queue:
            self.task_queue.remove(task_id)
            return True
        return False


def get_computation_mode() -> ComputationMode:
    if MPI_AVAILABLE and MPI.COMM_WORLD.Get_size() > 1:
        return ComputationMode.DISTRIBUTED
    return ComputationMode.LOCAL


def create_solver_config(mode: str = 'local', workers: int = 1, 
                        monitoring_url: str = None, enable_monitoring: bool = True) -> Dict:
    return {
        'mode': mode,
        'workers': workers,
        'monitoring_url': monitoring_url,
        'enable_monitoring': enable_monitoring
    }
