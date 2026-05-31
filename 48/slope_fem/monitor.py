"""
任务监控服务对接模块
==================

提供任务监控功能,可对接后端任务监控服务,
实时上报计算进度和状态。
"""

import os
import sys
import time
import json
import logging
import threading
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any
from enum import Enum
import uuid
import requests

try:
    import pika
    RABBITMQ_AVAILABLE = True
except ImportError:
    RABBITMQ_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskProgress:
    """任务进度"""
    task_id: str
    status: TaskStatus
    progress: float = 0.0
    current_step: str = ""
    message: str = ""
    error: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    elapsed_time: float = 0.0
    additional_data: Dict = field(default_factory=dict)


class MonitorClient:
    """监控客户端"""

    def __init__(self, server_url: str = "", enabled: bool = False,
                 update_interval: float = 5.0):
        self.server_url = server_url
        self.enabled = enabled and bool(server_url)
        self.update_interval = update_interval
        self._tasks: Dict[str, TaskProgress] = {}
        self._update_thread: Optional[threading.Thread] = None
        self._running = False

        if self.enabled:
            logger.info(f"监控服务已启用, 服务器地址: {server_url}")
        else:
            logger.info("监控服务未启用")

    def create_task(self, task_name: str, task_type: str = "analysis") -> str:
        """创建监控任务"""
        task_id = str(uuid.uuid4())

        task = TaskProgress(
            task_id=task_id,
            status=TaskStatus.PENDING,
            progress=0.0,
            current_step="初始化",
            message=f"任务 '{task_name}' 已创建",
            start_time=time.time(),
            additional_data={
                "task_name": task_name,
                "task_type": task_type
            }
        )

        self._tasks[task_id] = task

        if self.enabled:
            self._send_update(task)

        logger.info(f"监控任务已创建: {task_id}")
        return task_id

    def update_task(self, task_id: str, status: Optional[TaskStatus] = None,
                     progress: Optional[float] = None,
                     current_step: Optional[str] = None,
                     message: Optional[str] = None,
                     additional_data: Optional[Dict] = None) -> None:
        """更新任务状态"""
        if task_id not in self._tasks:
            logger.warning(f"任务不存在: {task_id}")
            return

        task = self._tasks[task_id]

        if status is not None:
            task.status = status
        if progress is not None:
            task.progress = max(0.0, min(100.0, progress))
        if current_step is not None:
            task.current_step = current_step
        if message is not None:
            task.message = message
        if additional_data is not None:
            task.additional_data.update(additional_data)

        task.elapsed_time = time.time() - (task.start_time or time.time())

        if self.enabled:
            self._send_update(task)

    def complete_task(self, task_id: str, message: str = "任务完成",
                       result_data: Optional[Dict] = None) -> None:
        """完成任务"""
        if task_id not in self._tasks:
            return

        task = self._tasks[task_id]
        task.status = TaskStatus.COMPLETED
        task.progress = 100.0
        task.end_time = time.time()
        task.elapsed_time = task.end_time - (task.start_time or time.time())
        task.message = message

        if result_data:
            task.additional_data["result"] = result_data

        if self.enabled:
            self._send_update(task)

        logger.info(f"任务完成: {task_id}, 耗时: {task.elapsed_time:.2f}s")

    def fail_task(self, task_id: str, error: str,
                   message: str = "任务执行失败") -> None:
        """任务失败"""
        if task_id not in self._tasks:
            return

        task = self._tasks[task_id]
        task.status = TaskStatus.FAILED
        task.end_time = time.time()
        task.elapsed_time = task.end_time - (task.start_time or time.time())
        task.error = error
        task.message = message

        if self.enabled:
            self._send_update(task)

        logger.error(f"任务失败: {task_id}, 错误: {error}")

    def cancel_task(self, task_id: str, message: str = "任务已取消") -> None:
        """取消任务"""
        if task_id not in self._tasks:
            return

        task = self._tasks[task_id]
        task.status = TaskStatus.CANCELLED
        task.end_time = time.time()
        task.elapsed_time = task.end_time - (task.start_time or time.time())
        task.message = message

        if self.enabled:
            self._send_update(task)

        logger.info(f"任务已取消: {task_id}")

    def get_task(self, task_id: str) -> Optional[TaskProgress]:
        """获取任务信息"""
        return self._tasks.get(task_id)

    def get_all_tasks(self) -> List[TaskProgress]:
        """获取所有任务"""
        return list(self._tasks.values())

    def _send_update(self, task: TaskProgress) -> None:
        """发送更新到监控服务器"""
        if not self.enabled or not self.server_url:
            return

        try:
            data = {
                "task_id": task.task_id,
                "status": task.status.value,
                "progress": task.progress,
                "current_step": task.current_step,
                "message": task.message,
                "error": task.error,
                "start_time": task.start_time,
                "end_time": task.end_time,
                "elapsed_time": task.elapsed_time,
                "additional_data": task.additional_data,
                "timestamp": time.time()
            }

            url = f"{self.server_url.rstrip('/')}/api/tasks/update"
            response = requests.post(url, json=data, timeout=5)

            if response.status_code != 200:
                logger.warning(f"监控更新失败: {response.status_code}")

        except requests.exceptions.RequestException as e:
            logger.debug(f"监控服务连接失败: {e}")
        except Exception as e:
            logger.debug(f"监控更新错误: {e}")

    def start_heartbeat(self, task_id: str) -> None:
        """启动心跳线程"""
        if not self.enabled:
            return

        self._running = True

        def heartbeat():
            while self._running and task_id in self._tasks:
                task = self._tasks[task_id]
                if task.status in [TaskStatus.RUNNING, TaskStatus.PENDING]:
                    self._send_update(task)
                time.sleep(self.update_interval)

        self._update_thread = threading.Thread(target=heartbeat, daemon=True)
        self._update_thread.start()

    def stop_heartbeat(self) -> None:
        """停止心跳"""
        self._running = False
        if self._update_thread:
            self._update_thread.join(timeout=2)


class AnalysisMonitor:
    """分析过程监控器"""

    def __init__(self, monitor_client: Optional[MonitorClient] = None):
        self.monitor = monitor_client
        self.task_id: Optional[str] = None
        self._callbacks: List[Callable[[float, str], None]] = []

    def start_analysis(self, analysis_name: str) -> str:
        """开始分析"""
        if self.monitor:
            self.task_id = self.monitor.create_task(analysis_name, "slope_stability")
            self.monitor.start_heartbeat(self.task_id)
            logger.info(f"分析监控已启动: {analysis_name}")
        return self.task_id or ""

    def update_progress(self, progress: float, step: str, message: str = "") -> None:
        """更新进度"""
        if self.monitor and self.task_id:
            self.monitor.update_task(
                self.task_id,
                status=TaskStatus.RUNNING,
                progress=progress,
                current_step=step,
                message=message
            )

        for callback in self._callbacks:
            try:
                callback(progress, step)
            except Exception as e:
                logger.debug(f"进度回调错误: {e}")

    def complete_analysis(self, result_data: Optional[Dict] = None) -> None:
        """完成分析"""
        if self.monitor and self.task_id:
            self.monitor.complete_task(self.task_id, "分析完成", result_data)
            self.monitor.stop_heartbeat()

    def fail_analysis(self, error: str) -> None:
        """分析失败"""
        if self.monitor and self.task_id:
            self.monitor.fail_task(self.task_id, error)
            self.monitor.stop_heartbeat()

    def add_progress_callback(self, callback: Callable[[float, str], None]) -> None:
        """添加进度回调"""
        self._callbacks.append(callback)

    def remove_progress_callback(self, callback: Callable[[float, str], None]) -> None:
        """移除进度回调"""
        if callback in self._callbacks:
            self._callbacks.remove(callback)


class ResourceMonitor:
    """资源监控器"""

    def __init__(self, monitor_client: Optional[MonitorClient] = None):
        self.monitor = monitor_client
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self, interval: float = 10.0) -> None:
        """启动资源监控"""
        self._running = True

        def monitor_resources():
            while self._running:
                try:
                    resources = self._get_system_resources()
                    if self.monitor and self.monitor.enabled:
                        self._send_resource_data(resources)
                except Exception as e:
                    logger.debug(f"资源监控错误: {e}")
                time.sleep(interval)

        self._thread = threading.Thread(target=monitor_resources, daemon=True)
        self._thread.start()
        logger.info("资源监控已启动")

    def stop(self) -> None:
        """停止资源监控"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("资源监控已停止")

    def _get_system_resources(self) -> Dict:
        """获取系统资源使用情况"""
        resources = {
            "timestamp": time.time(),
            "cpu_usage": 0.0,
            "memory_usage": 0.0,
            "memory_total": 0.0,
            "memory_available": 0.0,
            "disk_usage": 0.0
        }

        try:
            import psutil
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage(os.getcwd())

            resources.update({
                "cpu_usage": cpu_percent,
                "memory_usage": memory.percent,
                "memory_total": memory.total,
                "memory_available": memory.available,
                "disk_usage": disk.percent
            })
        except ImportError:
            pass

        return resources

    def _send_resource_data(self, resources: Dict) -> None:
        """发送资源数据"""
        if not self.monitor or not self.monitor.enabled:
            return

        try:
            url = f"{self.monitor.server_url.rstrip('/')}/api/resources/update"
            requests.post(url, json=resources, timeout=3)
        except Exception as e:
            logger.debug(f"资源数据发送失败: {e}")


class MessageQueueMonitor:
    """消息队列监控"""

    def __init__(self, host: str = "localhost", port: int = 5672,
                 username: str = "guest", password: str = "guest",
                 queue_name: str = "slope_analysis_tasks"):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.queue_name = queue_name
        self.connection = None
        self.channel = None
        self._connected = False

    def connect(self) -> bool:
        """连接消息队列"""
        if not RABBITMQ_AVAILABLE:
            logger.warning("RabbitMQ不可用")
            return False

        try:
            credentials = pika.PlainCredentials(self.username, self.password)
            parameters = pika.ConnectionParameters(
                host=self.host,
                port=self.port,
                credentials=credentials
            )
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            self.channel.queue_declare(queue=self.queue_name, durable=True)
            self._connected = True
            logger.info("已连接到消息队列")
            return True
        except Exception as e:
            logger.error(f"消息队列连接失败: {e}")
            return False

    def publish_task(self, task_data: Dict) -> bool:
        """发布任务"""
        if not self._connected or not self.channel:
            return False

        try:
            message = json.dumps(task_data)
            self.channel.basic_publish(
                exchange='',
                routing_key=self.queue_name,
                body=message,
                properties=pika.BasicProperties(
                    delivery_mode=2,
                )
            )
            logger.info(f"任务已发布到队列: {task_data.get('task_id', 'unknown')}")
            return True
        except Exception as e:
            logger.error(f"任务发布失败: {e}")
            return False

    def consume_tasks(self, callback: Callable[[Dict], None]) -> None:
        """消费任务"""
        if not self._connected or not self.channel:
            return

        def on_message(ch, method, properties, body):
            try:
                task_data = json.loads(body)
                callback(task_data)
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception as e:
                logger.error(f"任务处理失败: {e}")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        self.channel.basic_qos(prefetch_count=1)
        self.channel.basic_consume(queue=self.queue_name, on_message_callback=on_message)

        logger.info("开始消费任务队列...")
        self.channel.start_consuming()

    def close(self) -> None:
        """关闭连接"""
        if self.connection:
            try:
                self.connection.close()
            except Exception as e:
                logger.debug(f"连接关闭错误: {e}")
        self._connected = False
        logger.info("消息队列连接已关闭")
