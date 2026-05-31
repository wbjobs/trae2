import requests
import json
import time
import threading
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
from datetime import datetime
import logging
from pathlib import Path
import os

from .config import SimulationConfig
from .scheduler import Task, TaskStatus

logger = logging.getLogger(__name__)


class BackendStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class TaskStatusUpdate:
    task_id: str
    status: BackendStatus
    progress: float = 0.0
    message: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = ""


class BackendClient:
    def __init__(
        self,
        api_url: str = "",
        api_key: str = "",
        node_id: str = "local-node-01",
        timeout: int = 30,
        max_retries: int = 3
    ):
        self.api_url = api_url or os.getenv("BACKEND_API_URL", "")
        self.api_key = api_key or os.getenv("BACKEND_API_KEY", "")
        self.node_id = node_id or os.getenv("COMPUTE_NODE_ID", "local-node-01")
        self.timeout = timeout
        self.max_retries = max_retries
        
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
            "X-Node-ID": self.node_id
        })
        
        self._status_update_thread: Optional[threading.Thread] = None
        self._status_queue: List[TaskStatusUpdate] = []
        self._queue_lock = threading.Lock()
        self._stop_updates = threading.Event()
        
        self.callbacks: Dict[str, List[Callable]] = {
            "status_updated": [],
            "status_update_failed": [],
            "result_uploaded": [],
            "result_upload_failed": []
        }
    
    def register_callback(self, event: str, callback: Callable) -> None:
        if event in self.callbacks:
            self.callbacks[event].append(callback)
    
    def _trigger_callbacks(self, event: str, **kwargs) -> None:
        for callback in self.callbacks.get(event, []):
            try:
                callback(**kwargs)
            except Exception as e:
                logger.error(f"回调执行失败 [{event}]: {e}")
    
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        files: Optional[Dict] = None
    ) -> Optional[requests.Response]:
        url = f"{self.api_url.rstrip('/')}/{endpoint.lstrip('/')}"
        
        for attempt in range(self.max_retries):
            try:
                if method == "GET":
                    response = self.session.get(url, params=data, timeout=self.timeout)
                elif method == "POST":
                    if files:
                        response = self.session.post(
                            url, data=data, files=files, timeout=self.timeout
                        )
                    else:
                        response = self.session.post(
                            url, json=data, timeout=self.timeout
                        )
                elif method == "PUT":
                    response = self.session.put(url, json=data, timeout=self.timeout)
                elif method == "DELETE":
                    response = self.session.delete(url, timeout=self.timeout)
                else:
                    return None
                
                response.raise_for_status()
                return response
                
            except requests.exceptions.RequestException as e:
                logger.warning(f"请求失败 (尝试 {attempt + 1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
        
        logger.error(f"请求失败，已达到最大重试次数: {url}")
        return None
    
    def is_connected(self) -> bool:
        try:
            response = self._make_request("GET", "/health")
            return response is not None and response.status_code == 200
        except:
            return False
    
    def register_node(self, node_info: Dict) -> bool:
        response = self._make_request("POST", "/nodes/register", data=node_info)
        if response and response.status_code == 200:
            logger.info(f"节点已注册: {self.node_id}")
            return True
        return False
    
    def unregister_node(self) -> bool:
        response = self._make_request("POST", "/nodes/unregister")
        if response and response.status_code == 200:
            logger.info(f"节点已注销: {self.node_id}")
            return True
        return False
    
    def fetch_task(self) -> Optional[Dict]:
        response = self._make_request("POST", "/tasks/fetch", data={
            "node_id": self.node_id
        })
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get("task"):
                logger.info(f"获取到新任务: {data['task'].get('task_id')}")
                return data["task"]
        
        return None
    
    def update_task_status(
        self,
        task_id: str,
        status: BackendStatus,
        progress: float = 0.0,
        message: str = "",
        metadata: Optional[Dict] = None
    ) -> bool:
        update = TaskStatusUpdate(
            task_id=task_id,
            status=status,
            progress=progress,
            message=message,
            metadata=metadata or {},
            timestamp=datetime.now().isoformat()
        )
        
        response = self._make_request(
            "POST",
            f"/tasks/{task_id}/status",
            data=asdict(update)
        )
        
        if response and response.status_code == 200:
            self._trigger_callbacks(
                "status_updated",
                task_id=task_id,
                status=status.value
            )
            return True
        
        self._trigger_callbacks(
            "status_update_failed",
            task_id=task_id,
            status=status.value
        )
        return False
    
    def queue_status_update(self, update: TaskStatusUpdate) -> None:
        with self._queue_lock:
            self._status_queue.append(update)
    
    def _process_status_queue(self) -> None:
        while not self._stop_updates.is_set():
            updates_to_send = []
            
            with self._queue_lock:
                if self._status_queue:
                    updates_to_send = self._status_queue[:10]
                    self._status_queue = self._status_queue[10:]
            
            if updates_to_send:
                for update in updates_to_send:
                    self.update_task_status(
                        update.task_id,
                        update.status,
                        update.progress,
                        update.message,
                        update.metadata
                    )
            
            time.sleep(0.5)
    
    def start_status_updates(self) -> None:
        if self._status_update_thread and self._status_update_thread.is_alive():
            return
        
        self._stop_updates.clear()
        self._status_update_thread = threading.Thread(
            target=self._process_status_queue,
            daemon=True
        )
        self._status_update_thread.start()
        logger.info("状态上报线程已启动")
    
    def stop_status_updates(self) -> None:
        self._stop_updates.set()
        if self._status_update_thread:
            self._status_update_thread.join(timeout=2)
        logger.info("状态上报线程已停止")
    
    def upload_result(
        self,
        task_id: str,
        result_path: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        path = Path(result_path)
        if not path.exists():
            logger.error(f"结果文件不存在: {result_path}")
            return False
        
        try:
            with open(result_path, 'rb') as f:
                files = {"result_file": (path.name, f, "application/octet-stream")}
                data = {
                    "task_id": task_id,
                    "metadata": json.dumps(metadata or {})
                }
                
                response = self._make_request(
                    "POST",
                    f"/tasks/{task_id}/results",
                    data=data,
                    files=files
                )
                
                if response and response.status_code == 200:
                    logger.info(f"结果已上传: {task_id}")
                    self._trigger_callbacks(
                        "result_uploaded",
                        task_id=task_id,
                        file=path.name
                    )
                    return True
                
        except Exception as e:
            logger.error(f"上传结果失败: {e}")
        
        self._trigger_callbacks(
            "result_upload_failed",
            task_id=task_id,
            file=path.name
        )
        return False
    
    def upload_result_directory(
        self,
        task_id: str,
        directory: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        dir_path = Path(directory)
        if not dir_path.is_dir():
            logger.error(f"结果目录不存在: {directory}")
            return False
        
        all_success = True
        for file_path in dir_path.rglob("*"):
            if file_path.is_file():
                if not self.upload_result(task_id, str(file_path), metadata):
                    all_success = False
        
        return all_success
    
    def get_task_config(self, task_id: str) -> Optional[Dict]:
        response = self._make_request("GET", f"/tasks/{task_id}/config")
        if response and response.status_code == 200:
            return response.json().get("config")
        return None
    
    def send_heartbeat(self, load_info: Optional[Dict] = None) -> bool:
        data = {
            "node_id": self.node_id,
            "timestamp": datetime.now().isoformat(),
            "load": load_info or {}
        }
        
        response = self._make_request("POST", "/nodes/heartbeat", data=data)
        return response is not None and response.status_code == 200
    
    def close(self) -> None:
        self.stop_status_updates()
        self.session.close()


class BackendIntegration:
    def __init__(self, config: SimulationConfig):
        self.config = config
        self.client = BackendClient(
            api_url=config.backend.api_url,
            api_key=config.backend.api_key,
            node_id=config.backend.node_id
        )
        
        self.enabled = config.backend.enable_backend
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._stop_heartbeat = threading.Event()
    
    def initialize(self) -> bool:
        if not self.enabled:
            logger.info("后端集成已禁用")
            return True
        
        if not self.client.is_connected():
            logger.warning("无法连接到后端服务")
            return False
        
        from .adapter import ResourceMonitor
        node_info = {
            "node_id": self.config.backend.node_id,
            "resources": asdict(ResourceMonitor.get_system_resources()),
            "max_tasks": self.config.parallel.num_processes
        }
        
        if self.client.register_node(node_info):
            self.client.start_status_updates()
            self._start_heartbeat()
            logger.info("后端集成初始化成功")
            return True
        
        return False
    
    def _start_heartbeat(self) -> None:
        def heartbeat_loop():
            from .adapter import ResourceMonitor
            
            while not self._stop_heartbeat.is_set():
                try:
                    load_info = {
                        "cpu_usage": ResourceMonitor.get_system_resources().cpu_usage,
                        "memory_usage": ResourceMonitor.get_process_resources()["memory_mb"]
                    }
                    self.client.send_heartbeat(load_info)
                except Exception as e:
                    logger.debug(f"心跳发送失败: {e}")
                
                time.sleep(10)
        
        self._stop_heartbeat.clear()
        self._heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
    
    def _stop_heartbeat_loop(self) -> None:
        self._stop_heartbeat.set()
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=2)
    
    def report_task_started(self, task_id: str) -> None:
        if not self.enabled:
            return
        
        self.client.queue_status_update(TaskStatusUpdate(
            task_id=task_id,
            status=BackendStatus.RUNNING,
            progress=0.0,
            message="任务开始执行"
        ))
    
    def report_task_progress(
        self,
        task_id: str,
        progress: float,
        message: str = "",
        metadata: Optional[Dict] = None
    ) -> None:
        if not self.enabled:
            return
        
        self.client.queue_status_update(TaskStatusUpdate(
            task_id=task_id,
            status=BackendStatus.RUNNING,
            progress=progress,
            message=message,
            metadata=metadata or {}
        ))
    
    def report_task_completed(
        self,
        task_id: str,
        result_path: str,
        metadata: Optional[Dict] = None
    ) -> None:
        if not self.enabled:
            return
        
        self.client.update_task_status(
            task_id,
            BackendStatus.COMPLETED,
            progress=1.0,
            message="任务完成",
            metadata=metadata or {}
        )
        
        self.client.upload_result_directory(task_id, result_path, metadata)
    
    def report_task_failed(
        self,
        task_id: str,
        error_message: str,
        metadata: Optional[Dict] = None
    ) -> None:
        if not self.enabled:
            return
        
        self.client.update_task_status(
            task_id,
            BackendStatus.FAILED,
            message=error_message,
            metadata=metadata or {}
        )
    
    def fetch_remote_task(self) -> Optional[Dict]:
        if not self.enabled:
            return None
        
        return self.client.fetch_task()
    
    def shutdown(self) -> None:
        if not self.enabled:
            return
        
        self._stop_heartbeat_loop()
        self.client.unregister_node()
        self.client.close()
        logger.info("后端集成已关闭")
