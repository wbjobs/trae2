import os
import sys
import time
import json
import psutil
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field, asdict
from enum import Enum
import threading
import logging


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskStage(Enum):
    INITIALIZING = "initializing"
    PARSING_PARAMS = "parsing_params"
    GENERATING_MESH = "generating_mesh"
    SOLVING = "solving"
    POST_PROCESSING = "post_processing"
    GENERATING_REPORT = "generating_report"
    FINALIZING = "finalizing"


@dataclass
class TaskInfo:
    task_id: str
    project_name: str
    status: TaskStatus
    stage: TaskStage
    progress: float = 0.0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    elapsed_time: float = 0.0
    error_message: str = ""
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    memory_percent: float = 0.0
    result_summary: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            'task_id': self.task_id,
            'project_name': self.project_name,
            'status': self.status.value,
            'stage': self.stage.value,
            'progress': self.progress,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'elapsed_time': self.elapsed_time,
            'error_message': self.error_message,
            'cpu_usage': self.cpu_usage,
            'memory_usage': self.memory_usage,
            'memory_percent': self.memory_percent,
            'result_summary': self.result_summary
        }


class TaskMonitor:
    def __init__(self, project_name: str = "Seepage Analysis", 
                 monitor_interval: float = 1.0,
                 enable_logging: bool = True,
                 log_file: Optional[str] = None):
        self.task_id = str(uuid.uuid4())[:8]
        self.project_name = project_name
        
        self.task_info = TaskInfo(
            task_id=self.task_id,
            project_name=project_name,
            status=TaskStatus.PENDING,
            stage=TaskStage.INITIALIZING
        )
        
        self.monitor_interval = monitor_interval
        self._monitoring = False
        self._monitor_thread = None
        
        self._callbacks: Dict[str, List[Callable]] = {
            'status_change': [],
            'stage_change': [],
            'progress_update': [],
            'task_complete': [],
            'task_failed': []
        }
        
        self.logger = None
        if enable_logging:
            self._setup_logging(log_file)
        
        self._update_system_resources()
    
    def _setup_logging(self, log_file: Optional[str] = None):
        self.logger = logging.getLogger(f"task_monitor_{self.task_id}")
        self.logger.setLevel(logging.INFO)
        
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)
        
        if log_file:
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(formatter)
            self.logger.addHandler(file_handler)
    
    def start(self):
        self.task_info.status = TaskStatus.RUNNING
        self.task_info.start_time = datetime.now()
        self._monitoring = True
        
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()
        
        self._trigger_callbacks('status_change', self.task_info)
        self._log(f"任务 {self.task_id} 已启动")
    
    def _monitor_loop(self):
        while self._monitoring:
            if self.task_info.status == TaskStatus.RUNNING:
                self._update_system_resources()
                self.task_info.elapsed_time = (
                    datetime.now() - self.task_info.start_time
                ).total_seconds()
            
            time.sleep(self.monitor_interval)
    
    def _update_system_resources(self):
        try:
            process = psutil.Process(os.getpid())
            self.task_info.cpu_usage = process.cpu_percent(interval=None)
            memory_info = process.memory_info()
            self.task_info.memory_usage = memory_info.rss / (1024 * 1024)
            self.task_info.memory_percent = process.memory_percent()
        except:
            pass
    
    def update_stage(self, stage: TaskStage):
        old_stage = self.task_info.stage
        self.task_info.stage = stage
        self._trigger_callbacks('stage_change', old_stage, stage)
        self._log(f"进入阶段: {stage.value}")
    
    def update_progress(self, current: int, total: int, progress: Optional[float] = None):
        if progress is not None:
            self.task_info.progress = progress
        else:
            self.task_info.progress = (current / total) * 100 if total > 0 else 0
        
        self._trigger_callbacks('progress_update', self.task_info.progress)
    
    def complete(self, result_summary: Optional[Dict] = None):
        self.task_info.status = TaskStatus.COMPLETED
        self.task_info.stage = TaskStage.FINALIZING
        self.task_info.progress = 100.0
        self.task_info.end_time = datetime.now()
        self._monitoring = False
        
        if result_summary:
            self.task_info.result_summary = result_summary
        
        self._trigger_callbacks('task_complete', self.task_info)
        self._log(f"任务 {self.task_id} 已完成")
    
    def fail(self, error_message: str):
        self.task_info.status = TaskStatus.FAILED
        self.task_info.error_message = error_message
        self.task_info.end_time = datetime.now()
        self._monitoring = False
        
        self._trigger_callbacks('task_failed', self.task_info, error_message)
        self._log(f"任务 {self.task_id} 失败: {error_message}", level=logging.ERROR)
    
    def pause(self):
        if self.task_info.status == TaskStatus.RUNNING:
            self.task_info.status = TaskStatus.PAUSED
            self._trigger_callbacks('status_change', self.task_info)
            self._log(f"任务 {self.task_id} 已暂停")
    
    def resume(self):
        if self.task_info.status == TaskStatus.PAUSED:
            self.task_info.status = TaskStatus.RUNNING
            self._trigger_callbacks('status_change', self.task_info)
            self._log(f"任务 {self.task_id} 已恢复")
    
    def cancel(self):
        self.task_info.status = TaskStatus.CANCELLED
        self.task_info.end_time = datetime.now()
        self._monitoring = False
        self._log(f"任务 {self.task_id} 已取消")
    
    def register_callback(self, callback_type: str, callback: Callable):
        if callback_type in self._callbacks:
            self._callbacks[callback_type].append(callback)
    
    def _trigger_callbacks(self, callback_type: str, *args, **kwargs):
        for callback in self._callbacks.get(callback_type, []):
            try:
                callback(*args, **kwargs)
            except Exception as e:
                self._log(f"回调执行失败: {e}", level=logging.ERROR)
    
    def _log(self, message: str, level: int = logging.INFO):
        if self.logger:
            self.logger.log(level, message)
    
    def get_status(self) -> Dict:
        return self.task_info.to_dict()
    
    def get_elapsed_time(self) -> str:
        elapsed = self.task_info.elapsed_time
        hours = int(elapsed // 3600)
        minutes = int((elapsed % 3600) // 60)
        seconds = int(elapsed % 60)
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    def print_status(self):
        status = self.get_status()
        print(f"\n{'='*60}")
        print(f"任务ID: {status['task_id']}")
        print(f"项目名称: {status['project_name']}")
        print(f"当前状态: {status['status']}")
        print(f"当前阶段: {status['stage']}")
        print(f"进度: {status['progress']:.1f}%")
        print(f"已用时间: {self.get_elapsed_time()}")
        print(f"CPU使用率: {status['cpu_usage']:.1f}%")
        print(f"内存使用: {status['memory_usage']:.1f} MB ({status['memory_percent']:.1f}%)")
        if status['error_message']:
            print(f"错误信息: {status['error_message']}")
        print(f"{'='*60}\n")


class DistributedTaskManager:
    def __init__(self, scheduler_type: str = 'local'):
        self.scheduler_type = scheduler_type
        self.tasks: Dict[str, TaskMonitor] = {}
        self.cluster_config = {}
    
    def configure_cluster(self, config: Dict):
        self.cluster_config = config
    
    def submit_task(self, task_monitor: TaskMonitor) -> str:
        self.tasks[task_monitor.task_id] = task_monitor
        task_monitor.start()
        return task_monitor.task_id
    
    def get_task_status(self, task_id: str) -> Optional[Dict]:
        if task_id in self.tasks:
            return self.tasks[task_id].get_status()
        return None
    
    def get_all_tasks(self) -> List[Dict]:
        return [task.get_status() for task in self.tasks.values()]
    
    def cancel_task(self, task_id: str) -> bool:
        if task_id in self.tasks:
            self.tasks[task_id].cancel()
            return True
        return False
    
    def wait_for_completion(self, task_id: str, timeout: Optional[float] = None) -> bool:
        if task_id not in self.tasks:
            return False
        
        task = self.tasks[task_id]
        start_time = time.time()
        
        while task.task_info.status not in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
            if timeout and (time.time() - start_time) > timeout:
                return False
            time.sleep(1)
        
        return task.task_info.status == TaskStatus.COMPLETED
    
    def export_task_logs(self, task_id: str, output_path: str) -> bool:
        if task_id not in self.tasks:
            return False
        
        status = self.tasks[task_id].get_status()
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(status, f, indent=2, ensure_ascii=False, default=str)
        
        return True


class ProgressReporter:
    def __init__(self, task_monitor: TaskMonitor):
        self.monitor = task_monitor
        self.current_stage = 0
        self.total_stages = 6
    
    def _get_stage_progress(self, stage_progress: float) -> float:
        return (self.current_stage + stage_progress) / self.total_stages * 100
    
    def params_parsing(self, progress: float = 1.0):
        self.monitor.update_stage(TaskStage.PARSING_PARAMS)
        self.monitor.update_progress(0, 1, self._get_stage_progress(progress))
        self.current_stage += 1
    
    def mesh_generation(self, progress: float = 1.0):
        self.monitor.update_stage(TaskStage.GENERATING_MESH)
        self.monitor.update_progress(0, 1, self._get_stage_progress(progress))
        self.current_stage += 1
    
    def solving(self, current: int, total: int):
        self.monitor.update_stage(TaskStage.SOLVING)
        stage_progress = current / total if total > 0 else 0
        self.monitor.update_progress(0, 1, self._get_stage_progress(stage_progress))
    
    def post_processing(self, progress: float = 1.0):
        self.monitor.update_stage(TaskStage.POST_PROCESSING)
        self.monitor.update_progress(0, 1, self._get_stage_progress(progress))
        self.current_stage += 1
    
    def report_generation(self, progress: float = 1.0):
        self.monitor.update_stage(TaskStage.GENERATING_REPORT)
        self.monitor.update_progress(0, 1, self._get_stage_progress(progress))
        self.current_stage += 1
    
    def finalizing(self):
        self.monitor.update_stage(TaskStage.FINALIZING)
        self.monitor.update_progress(0, 1, 100.0)
