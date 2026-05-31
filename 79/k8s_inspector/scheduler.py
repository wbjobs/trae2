import os
import time
import json
import logging
import threading
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Union
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)


class CronTrigger:
    def __init__(
        self,
        minute: Union[str, int] = "*",
        hour: Union[str, int] = "*",
        day: Union[str, int] = "*",
        month: Union[str, int] = "*",
        day_of_week: Union[str, int] = "*",
    ):
        self.minute = self._parse_field(minute, 0, 59)
        self.hour = self._parse_field(hour, 0, 23)
        self.day = self._parse_field(day, 1, 31)
        self.month = self._parse_field(month, 1, 12)
        self.day_of_week = self._parse_field(day_of_week, 0, 6)

    @staticmethod
    def _parse_field(
        value: Union[str, int], min_val: int, max_val: int
    ) -> set:
        if value == "*":
            return set(range(min_val, max_val + 1))
        if isinstance(value, int):
            if min_val <= value <= max_val:
                return {value}
            raise ValueError(f"值 {value} 超出范围 [{min_val}, {max_val}]")

        result = set()
        for part in str(value).split(","):
            if "-" in part:
                start, end = map(int, part.split("-"))
                if min_val <= start <= end <= max_val:
                    result.update(range(start, end + 1))
                else:
                    raise ValueError(f"范围 {part} 超出 [{min_val}, {max_val}]")
            elif "/" in part:
                base, step = part.split("/")
                step = int(step)
                start = int(base) if base != "*" else min_val
                result.update(range(start, max_val + 1, step))
            else:
                val = int(part)
                if min_val <= val <= max_val:
                    result.add(val)
                else:
                    raise ValueError(f"值 {val} 超出范围 [{min_val}, {max_val}]")
        return result

    def get_next_run_time(self, now: Optional[datetime] = None) -> datetime:
        now = now or datetime.now()
        current = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

        while True:
            if (
                current.minute in self.minute
                and current.hour in self.hour
                and current.day in self.day
                and current.month in self.month
                and current.weekday() in self.day_of_week
            ):
                return current

            current += timedelta(minutes=1)
            if current.year > now.year + 5:
                raise RuntimeError("无法找到下一次运行时间")


class IntervalTrigger:
    def __init__(self, seconds: int = 60):
        self.interval = seconds

    def get_next_run_time(self, now: Optional[datetime] = None) -> datetime:
        now = now or datetime.now()
        return now + timedelta(seconds=self.interval)


class InspectionTask:
    def __init__(
        self,
        name: str,
        task_func: Callable,
        trigger: Union[CronTrigger, IntervalTrigger],
        args: Optional[tuple] = None,
        kwargs: Optional[Dict[str, Any]] = None,
        enabled: bool = True,
        max_retries: int = 0,
        retry_delay: int = 30,
    ):
        self.name = name
        self.task_func = task_func
        self.trigger = trigger
        self.args = args or ()
        self.kwargs = kwargs or {}
        self.enabled = enabled
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.last_run: Optional[datetime] = None
        self.next_run: Optional[datetime] = trigger.get_next_run_time()
        self.running = False
        self.execution_count = 0
        self.success_count = 0
        self.failure_count = 0
        self.last_error: Optional[str] = None

    def should_run(self, now: Optional[datetime] = None) -> bool:
        if not self.enabled or self.running:
            return False
        now = now or datetime.now()
        return self.next_run and now >= self.next_run

    def execute(self) -> Any:
        self.running = True
        self.last_run = datetime.now()
        self.execution_count += 1
        result = None
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                logger.info(f"执行任务 [{self.name}] (尝试 {attempt + 1}/{self.max_retries + 1})")
                result = self.task_func(*self.args, **self.kwargs)
                self.success_count += 1
                self.last_error = None
                logger.info(f"任务 [{self.name}] 执行成功")
                break
            except Exception as e:
                last_error = str(e)
                self.last_error = last_error
                logger.error(f"任务 [{self.name}] 执行失败 (尝试 {attempt + 1}): {e}")
                if attempt < self.max_retries:
                    time.sleep(self.retry_delay)
            finally:
                if attempt == self.max_retries and last_error:
                    self.failure_count += 1

        self.running = False
        self.next_run = self.trigger.get_next_run_time()
        return result

    def get_status(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "running": self.running,
            "last_run": self.last_run.strftime("%Y-%m-%d %H:%M:%S") if self.last_run else None,
            "next_run": self.next_run.strftime("%Y-%m-%d %H:%M:%S") if self.next_run else None,
            "execution_count": self.execution_count,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "last_error": self.last_error,
        }


class InspectionScheduler:
    def __init__(
        self,
        max_workers: int = 5,
        stop_on_error: bool = False,
        state_file: Optional[str] = None,
    ):
        self.tasks: Dict[str, InspectionTask] = {}
        self.max_workers = max_workers
        self.stop_on_error = stop_on_error
        self.state_file = state_file
        self._stop_event = threading.Event()
        self._scheduler_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._executor: Optional[ThreadPoolExecutor] = None

    def add_task(
        self,
        name: str,
        task_func: Callable,
        trigger: Union[CronTrigger, IntervalTrigger, Dict[str, Any]],
        args: Optional[tuple] = None,
        kwargs: Optional[Dict[str, Any]] = None,
        enabled: bool = True,
        max_retries: int = 0,
        retry_delay: int = 30,
    ) -> InspectionTask:
        with self._lock:
            if name in self.tasks:
                raise ValueError(f"任务 [{name}] 已存在")

            if isinstance(trigger, dict):
                if "interval" in trigger:
                    trigger_obj: Union[CronTrigger, IntervalTrigger] = IntervalTrigger(
                        seconds=trigger["interval"]
                    )
                else:
                    trigger_obj = CronTrigger(
                        minute=trigger.get("minute", "*"),
                        hour=trigger.get("hour", "*"),
                        day=trigger.get("day", "*"),
                        month=trigger.get("month", "*"),
                        day_of_week=trigger.get("day_of_week", "*"),
                    )
            else:
                trigger_obj = trigger

            task = InspectionTask(
                name=name,
                task_func=task_func,
                trigger=trigger_obj,
                args=args,
                kwargs=kwargs,
                enabled=enabled,
                max_retries=max_retries,
                retry_delay=retry_delay,
            )
            self.tasks[name] = task
            logger.info(f"已添加任务 [{name}]")
            return task

    def remove_task(self, name: str) -> bool:
        with self._lock:
            if name in self.tasks:
                del self.tasks[name]
                logger.info(f"已移除任务 [{name}]")
                return True
            return False

    def get_task(self, name: str) -> Optional[InspectionTask]:
        return self.tasks.get(name)

    def list_tasks(self) -> List[Dict[str, Any]]:
        return [task.get_status() for task in self.tasks.values()]

    def run_task(self, name: str) -> Any:
        task = self.get_task(name)
        if not task:
            raise ValueError(f"任务 [{name}] 不存在")
        return task.execute()

    def _run_ready_tasks(self) -> None:
        with self._lock:
            tasks_to_run = [
                task for task in self.tasks.values() if task.should_run()
            ]

        if not tasks_to_run:
            return

        if self._executor is None:
            self._executor = ThreadPoolExecutor(max_workers=self.max_workers)

        futures = {
            self._executor.submit(task.execute): task.name
            for task in tasks_to_run
        }

        for future in as_completed(futures):
            task_name = futures[future]
            try:
                future.result()
            except Exception as e:
                logger.error(f"任务 [{task_name}] 异常: {e}")
                if self.stop_on_error:
                    self.stop()
                    raise

    def _scheduler_loop(self) -> None:
        logger.info("调度器主循环已启动")
        while not self._stop_event.is_set():
            try:
                self._run_ready_tasks()
                self._save_state()
            except Exception as e:
                logger.error(f"调度器循环异常: {e}")
                if self.stop_on_error:
                    break
            self._stop_event.wait(5)

        if self._executor:
            self._executor.shutdown(wait=True)
            self._executor = None

        logger.info("调度器主循环已停止")

    def start(self, block: bool = False) -> None:
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            logger.warning("调度器已在运行中")
            return

        self._stop_event.clear()
        self._load_state()

        if block:
            self._scheduler_loop()
        else:
            self._scheduler_thread = threading.Thread(
                target=self._scheduler_loop, daemon=True
            )
            self._scheduler_thread.start()
            logger.info("调度器已启动 (非阻塞模式)")

    def stop(self) -> None:
        self._stop_event.set()
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=30)
            self._scheduler_thread = None
        self._save_state()
        logger.info("调度器已停止")

    def is_running(self) -> bool:
        return self._scheduler_thread is not None and self._scheduler_thread.is_alive()

    def _save_state(self) -> None:
        if not self.state_file:
            return
        try:
            state = {
                "tasks": {
                    name: {
                        "last_run": task.last_run.isoformat() if task.last_run else None,
                        "execution_count": task.execution_count,
                        "success_count": task.success_count,
                        "failure_count": task.failure_count,
                        "last_error": task.last_error,
                    }
                    for name, task in self.tasks.items()
                },
                "saved_at": datetime.now().isoformat(),
            }
            os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"保存调度器状态失败: {e}")

    def _load_state(self) -> None:
        if not self.state_file or not os.path.exists(self.state_file):
            return
        try:
            with open(self.state_file, "r", encoding="utf-8") as f:
                state = json.load(f)

            task_states = state.get("tasks", {})
            for name, task_state in task_states.items():
                task = self.tasks.get(name)
                if task:
                    if task_state.get("last_run"):
                        task.last_run = datetime.fromisoformat(task_state["last_run"])
                    task.execution_count = task_state.get("execution_count", 0)
                    task.success_count = task_state.get("success_count", 0)
                    task.failure_count = task_state.get("failure_count", 0)
                    task.last_error = task_state.get("last_error")

            logger.info("调度器状态已加载")
        except Exception as e:
            logger.warning(f"加载调度器状态失败: {e}")
