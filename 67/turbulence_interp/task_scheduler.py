import logging
import threading
import time
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Callable, Union
from pathlib import Path
from datetime import datetime

from .task_base import Task, TaskResult, TaskExecutor, TaskStatus
from .local_executor import LocalExecutor

logger = logging.getLogger(__name__)


@dataclass
class SchedulerConfig:
    executor_type: str = "local"
    max_workers: int = 4
    task_timeout: float = 3600.0
    poll_interval: float = 5.0
    retry_failed: bool = False
    max_retries: int = 3
    ssh_host: Optional[str] = None
    ssh_username: Optional[str] = None
    ssh_port: int = 22
    ssh_workdir: str = "/tmp"
    slurm_partition: str = "compute"
    slurm_nodes: int = 1
    slurm_tasks_per_node: int = 1


class TaskScheduler:
    def __init__(self, config: Optional[SchedulerConfig] = None, **kwargs):
        self.config = config or SchedulerConfig(**kwargs)
        self._executor = self._create_executor()
        self._tasks: Dict[str, Task] = {}
        self._task_history: List[Task] = []
        self._lock = threading.Lock()
        self._running = False
        self._monitor_thread: Optional[threading.Thread] = None

    def _create_executor(self) -> TaskExecutor:
        if self.config.executor_type == "local":
            return LocalExecutor(
                max_workers=self.config.max_workers,
                task_timeout=self.config.task_timeout,
            )
        elif self.config.executor_type == "slurm":
            from .cluster_executors import SlurmExecutor
            if not self.config.ssh_host or not self.config.ssh_username:
                raise ValueError("SSH host and username required for Slurm executor")
            return SlurmExecutor(
                host=self.config.ssh_host,
                username=self.config.ssh_username,
                remote_workdir=self.config.ssh_workdir,
                port=self.config.ssh_port,
                partition=self.config.slurm_partition,
                nodes=self.config.slurm_nodes,
                tasks_per_node=self.config.slurm_tasks_per_node,
            )
        elif self.config.executor_type == "ssh":
            from .cluster_executors import SSHExecutor
            if not self.config.ssh_host or not self.config.ssh_username:
                raise ValueError("SSH host and username required for SSH executor")
            return SSHExecutor(
                host=self.config.ssh_host,
                username=self.config.ssh_username,
                remote_workdir=self.config.ssh_workdir,
                port=self.config.ssh_port,
            )
        else:
            raise ValueError(f"Unknown executor type: {self.config.executor_type}")

    def start(self):
        if self._running:
            return
        
        self._running = True
        
        if hasattr(self._executor, "start"):
            self._executor.start()
        
        if self.config.executor_type != "local":
            self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self._monitor_thread.start()
        
        logger.info(f"TaskScheduler started with {self.config.executor_type} executor")

    def stop(self):
        self._running = False
        
        if self._monitor_thread:
            self._monitor_thread.join(timeout=10.0)
            self._monitor_thread = None
        
        if hasattr(self._executor, "stop"):
            self._executor.stop()
        
        logger.info("TaskScheduler stopped")

    def _monitor_loop(self):
        while self._running:
            with self._lock:
                task_ids = list(self._tasks.keys())
            
            for task_id in task_ids:
                with self._lock:
                    task = self._tasks.get(task_id)
                
                if task and task.status in [TaskStatus.QUEUED, TaskStatus.RUNNING]:
                    old_status = task.status
                    new_status = self._executor.monitor(task)
                    
                    if new_status != old_status:
                        logger.info(f"Task {task_id} status changed: {old_status.value} -> {new_status.value}")
                        
                        if new_status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                            with self._lock:
                                if task in self._task_history:
                                    self._task_history.remove(task)
                                self._task_history.append(task)
            
            time.sleep(self.config.poll_interval)

    def submit(self, name: str, func: Callable, *args, **kwargs) -> str:
        import uuid
        task_id = str(uuid.uuid4())[:8]
        
        task = Task(
            task_id=task_id,
            name=name,
            func=func,
            args=args,
            kwargs=kwargs,
        )
        
        with self._lock:
            self._tasks[task_id] = task
        
        if self._executor.submit(task):
            if not self._running:
                self.start()
            return task_id
        else:
            with self._lock:
                del self._tasks[task_id]
            raise RuntimeError(f"Failed to submit task: {name}")

    def submit_batch(self, tasks: List[Dict[str, Any]]) -> List[str]:
        task_ids = []
        for task_info in tasks:
            task_id = self.submit(
                task_info["name"],
                task_info["func"],
                *task_info.get("args", ()),
                **task_info.get("kwargs", {}),
            )
            task_ids.append(task_id)
        return task_ids

    def get_status(self, task_id: str) -> TaskStatus:
        with self._lock:
            task = self._tasks.get(task_id)
        
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        
        return self._executor.monitor(task)

    def get_result(self, task_id: str, timeout: Optional[float] = None,
                   poll_interval: float = 1.0) -> Optional[TaskResult]:
        start_time = time.time()
        
        while True:
            status = self.get_status(task_id)
            
            if status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                with self._lock:
                    task = self._tasks.get(task_id)
                return self._executor.get_result(task)
            
            if timeout is not None and time.time() - start_time >= timeout:
                return None
            
            time.sleep(poll_interval)

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
        
        if not task:
            raise ValueError(f"Task not found: {task_id}")
        
        return self._executor.cancel(task)

    def cancel_all(self) -> None:
        with self._lock:
            task_ids = list(self._tasks.keys())
        
        for task_id in task_ids:
            try:
                self.cancel(task_id)
            except Exception as e:
                logger.warning(f"Error cancelling task {task_id}: {e}")

    def wait_all(self, timeout: Optional[float] = None, poll_interval: float = 1.0) -> bool:
        start_time = time.time()
        
        while True:
            with self._lock:
                tasks = list(self._tasks.values())
            
            all_complete = all(
                t.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]
                for t in tasks
            )
            
            if all_complete:
                return True
            
            if timeout is not None and time.time() - start_time >= timeout:
                return False
            
            time.sleep(poll_interval)

    def get_completed_tasks(self) -> List[Task]:
        with self._lock:
            return [t for t in self._task_history if t.status == TaskStatus.COMPLETED]

    def get_failed_tasks(self) -> List[Task]:
        with self._lock:
            return [t for t in self._task_history if t.status == TaskStatus.FAILED]

    def retry_failed(self) -> List[str]:
        if not self.config.retry_failed:
            return []
        
        with self._lock:
            failed_tasks = [t for t in self._task_history if t.status == TaskStatus.FAILED]
        
        retried_ids = []
        for task in failed_tasks:
            if task.metadata.get("retries", 0) < self.config.max_retries:
                task.metadata["retries"] = task.metadata.get("retries", 0) + 1
                
                new_id = self.submit(
                    f"{task.name}_retry{task.metadata['retries']}",
                    task.func,
                    *task.args,
                    **task.kwargs,
                )
                retried_ids.append(new_id)
        
        return retried_ids

    def export_task_history(self, filepath: str) -> None:
        import json
        
        with self._lock:
            history_data = [t.to_dict() for t in self._task_history]
        
        with open(filepath, "w") as f:
            json.dump(history_data, f, indent=2)
        
        logger.info(f"Exported task history to {filepath}")

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
        return False

    @staticmethod
    def available_executors() -> List[str]:
        return ["local", "slurm", "ssh"]
