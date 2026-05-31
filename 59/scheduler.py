"""定时任务调度模块"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScheduleType(Enum):
    """调度类型"""
    ONCE = "once"
    INTERVAL = "interval"
    CRON = "cron"


@dataclass
class ScheduleConfig:
    """调度配置"""
    schedule_type: ScheduleType
    interval_seconds: Optional[int] = None
    cron_expression: Optional[str] = None
    run_at: Optional[datetime] = None
    max_runs: Optional[int] = None


@dataclass
class Task:
    """巡检任务"""
    task_id: str
    name: str
    config: ScheduleConfig
    target_nodes: List[str]
    check_types: List[str]
    callback: Optional[Callable] = None
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    run_count: int = 0
    last_error: Optional[str] = None


class TaskScheduler:
    """任务调度器"""

    def __init__(self):
        self._tasks: Dict[str, Task] = {}
        self._running = False
        self._scheduler_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()

    def add_task(
        self,
        name: str,
        schedule_config: ScheduleConfig,
        target_nodes: List[str],
        check_types: List[str],
        callback: Optional[Callable] = None,
    ) -> str:
        """添加定时任务

        Args:
            name: 任务名称
            schedule_config: 调度配置
            target_nodes: 目标节点列表
            check_types: 检查类型列表
            callback: 任务执行回调函数

        Returns:
            任务 ID
        """
        task_id = f"task_{int(time.time())}_{len(self._tasks)}"
        task = Task(
            task_id=task_id,
            name=name,
            config=schedule_config,
            target_nodes=target_nodes,
            check_types=check_types,
            callback=callback,
        )
        task.next_run_at = self._calculate_next_run(task)

        with self._lock:
            self._tasks[task_id] = task

        logger.info(f"已添加定时任务: {name} ({task_id})")
        return task_id

    def remove_task(self, task_id: str) -> bool:
        """移除任务"""
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks[task_id]
                task.status = TaskStatus.CANCELLED
                del self._tasks[task_id]
                logger.info(f"已移除任务: {task_id}")
                return True
        return False

    def list_tasks(self) -> List[Task]:
        """列出所有任务"""
        with self._lock:
            return list(self._tasks.values())

    def get_task(self, task_id: str) -> Optional[Task]:
        """获取任务详情"""
        with self._lock:
            return self._tasks.get(task_id)

    def start(self):
        """启动调度器"""
        if self._running:
            return

        self._running = True
        self._stop_event.clear()
        self._scheduler_thread = threading.Thread(
            target=self._scheduler_loop,
            daemon=True,
            name="TaskScheduler",
        )
        self._scheduler_thread.start()
        logger.info("任务调度器已启动")

    def stop(self):
        """停止调度器"""
        if not self._running:
            return

        self._stop_event.set()
        self._running = False
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=5)
        logger.info("任务调度器已停止")

    def _scheduler_loop(self):
        """调度主循环"""
        while not self._stop_event.is_set():
            try:
                self._check_and_run_tasks()
            except Exception as e:
                logger.exception(f"调度循环异常: {e}")

            self._stop_event.wait(1)

    def _check_and_run_tasks(self):
        """检查并运行到期的任务"""
        now = datetime.now()

        with self._lock:
            tasks_to_run = []
            for task in self._tasks.values():
                if task.next_run_at and task.next_run_at <= now:
                    if task.config.schedule_type == ScheduleType.ONCE and task.run_count > 0:
                        continue
                    if task.config.max_runs and task.run_count >= task.config.max_runs:
                        continue
                    tasks_to_run.append(task)

        for task in tasks_to_run:
            self._execute_task(task)

    def _execute_task(self, task: Task):
        """执行任务"""
        task.status = TaskStatus.RUNNING
        task.last_run_at = datetime.now()
        task.run_count += 1

        try:
            logger.info(f"开始执行任务: {task.name}")

            if task.callback:
                task.callback(task)

            task.status = TaskStatus.COMPLETED
            task.last_error = None
            logger.info(f"任务执行完成: {task.name}")

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.last_error = str(e)
            logger.exception(f"任务执行失败: {task.name}, 错误: {e}")

        task.next_run_at = self._calculate_next_run(task)

    def _calculate_next_run(self, task: Task) -> Optional[datetime]:
        """计算下次运行时间"""
        config = task.config

        if config.schedule_type == ScheduleType.ONCE:
            if task.run_count > 0:
                return None
            return config.run_at or datetime.now()

        elif config.schedule_type == ScheduleType.INTERVAL:
            if config.max_runs and task.run_count >= config.max_runs:
                return None

            base_time = task.last_run_at or datetime.now()
            interval = config.interval_seconds or 60
            return datetime.fromtimestamp(base_time.timestamp() + interval)

        elif config.schedule_type == ScheduleType.CRON:
            return self._parse_cron_next_run(config.cron_expression)

        return None

    def _parse_cron_next_run(self, cron_expr: Optional[str]) -> Optional[datetime]:
        """简化的 CRON 表达式解析 (仅支持分钟级)
        格式: * * * * *
        """
        if not cron_expr:
            return None

        try:
            parts = cron_expr.split()
            if len(parts) != 5:
                logger.warning(f"无效的 CRON 表达式: {cron_expr}")
                return None

            minute, hour, day, month, dow = parts

            now = datetime.now()
            next_run = now.replace(second=0, microsecond=0)

            if minute != "*":
                target_minute = int(minute)
                if next_run.minute >= target_minute:
                    next_run = next_run.replace(minute=target_minute, hour=next_run.hour + 1)
                else:
                    next_run = next_run.replace(minute=target_minute)
            else:
                next_run = next_run.replace(minute=next_run.minute + 1)

            return next_run

        except Exception as e:
            logger.warning(f"CRON 解析失败: {e}")
            return None

    def run_once(self, task_id: str) -> bool:
        """立即执行一次任务"""
        with self._lock:
            task = self._tasks.get(task_id)

        if task:
            self._execute_task(task)
            return True
        return False

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
