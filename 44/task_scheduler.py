import uuid
import threading
import time
from typing import Dict, List, Optional, Callable
from datetime import datetime, timedelta
from queue import Queue, Empty

from cache import get_cache
from channel_manager import get_channel_manager
from failure_tracer import get_failure_tracer
from models import (
    ScheduledTask,
    TaskStatus,
    TaskType,
    PriorityAdjustRecord,
    PriorityAdjustReason,
    FailureCategory,
)


class TaskScheduler:
    _instance: Optional["TaskScheduler"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._cache = get_cache()
        self._channel_mgr = get_channel_manager()
        self._failure_tracer = get_failure_tracer()
        self._tasks: Dict[str, ScheduledTask] = {}
        self._task_versions: Dict[str, int] = {}
        self._priority_adjustments: Dict[str, List[PriorityAdjustRecord]] = {}
        self._pending_by_priority: Dict[int, List[str]] = {}
        self._rw_lock = threading.RLock()
        self._event_callbacks: List[Callable] = []
        self._allocation_queue: Queue = Queue(maxsize=10000)
        self._notification_queue: Queue = Queue(maxsize=10000)
        self._priority_check_interval = 30.0
        self._escalation_wait_threshold = 60.0
        self._scheduler_thread = threading.Thread(
            target=self._run_scheduler, daemon=True, name="scheduler-main"
        )
        self._allocation_thread = threading.Thread(
            target=self._run_allocation_worker, daemon=True, name="scheduler-alloc"
        )
        self._notification_thread = threading.Thread(
            target=self._run_notification_worker, daemon=True, name="scheduler-notify"
        )
        self._priority_thread = threading.Thread(
            target=self._run_priority_monitor, daemon=True, name="scheduler-priority"
        )
        self._scheduler_thread.start()
        self._allocation_thread.start()
        self._notification_thread.start()
        self._priority_thread.start()

    def _sync_cache(self, task: ScheduledTask):
        self._cache.set(f"task:{task.task_id}", task.model_dump(), category="task")

    def _inc_version(self, task_id: str) -> int:
        self._task_versions[task_id] = self._task_versions.get(task_id, 0) + 1
        return self._task_versions[task_id]

    def _add_to_pending_index(self, task_id: str, priority: int):
        with self._rw_lock:
            if priority not in self._pending_by_priority:
                self._pending_by_priority[priority] = []
            if task_id not in self._pending_by_priority[priority]:
                self._pending_by_priority[priority].append(task_id)

    def _remove_from_pending_index(self, task_id: str, old_priority: int):
        with self._rw_lock:
            if old_priority in self._pending_by_priority:
                self._pending_by_priority[old_priority] = [
                    tid for tid in self._pending_by_priority[old_priority]
                    if tid != task_id
                ]
                if not self._pending_by_priority[old_priority]:
                    del self._pending_by_priority[old_priority]

    def _run_scheduler(self):
        while True:
            try:
                self._process_schedule_cycle()
            except Exception:
                pass
            time.sleep(0.5)

    def _process_schedule_cycle(self):
        with self._rw_lock:
            all_tasks = list(self._tasks.values())
        pending_ids = [t.task_id for t in all_tasks if t.status == TaskStatus.PENDING]
        running_ids = [t.task_id for t in all_tasks if t.status == TaskStatus.RUNNING]
        scheduled_ids = [t.task_id for t in all_tasks if t.status == TaskStatus.SCHEDULED]
        scheduled_tasks = [t for t in all_tasks if t.task_id in scheduled_ids]
        running_tasks = [t for t in all_tasks if t.task_id in running_ids]

        for tid in pending_ids:
            try:
                self._allocation_queue.put_nowait(tid)
            except Exception:
                pass

        now = datetime.utcnow()
        for task in scheduled_tasks:
            if task.scheduled_start and now >= task.scheduled_start:
                with self._rw_lock:
                    t = self._tasks.get(task.task_id)
                    if not t or t.status != TaskStatus.SCHEDULED:
                        continue
                    t.status = TaskStatus.RUNNING
                    t.updated_at = now
                    self._sync_cache(t)
                    self._inc_version(task.task_id)
                self._notification_queue.put({
                    "task": task,
                    "status": TaskStatus.RUNNING,
                })

        for task in running_tasks:
            if task.scheduled_end and now >= task.scheduled_end:
                self.complete_task(task.task_id, "Scheduled end time reached")

    def _run_allocation_worker(self):
        while True:
            try:
                task_id = self._allocation_queue.get(timeout=1.0)
                self._try_allocate(task_id)
            except Empty:
                continue
            except Exception:
                pass

    def _try_allocate(self, task_id: str):
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if not task or task.status != TaskStatus.PENDING:
                return
            task_copy = ScheduledTask(**task.model_dump())

        success, channel, msg = self._channel_mgr.allocate_channel(task_copy)
        if not success:
            return

        with self._rw_lock:
            t = self._tasks.get(task_id)
            if not t or t.status != TaskStatus.PENDING:
                self._channel_mgr.release_channel(task_id)
                return
            t.status = TaskStatus.SCHEDULED
            t.allocated_channel_id = channel.channel_id
            t.updated_at = datetime.utcnow()
            self._sync_cache(t)
            self._inc_version(task_id)
            self._remove_from_pending_index(task_id, t.original_priority)
        self._notification_queue.put({
            "task": t,
            "status": TaskStatus.SCHEDULED,
        })

    def _run_notification_worker(self):
        while True:
            try:
                item = self._notification_queue.get(timeout=1.0)
                self._notify_status_change(item["task"], item["status"])
            except Empty:
                continue
            except Exception:
                pass

    def _run_priority_monitor(self):
        while True:
            try:
                self._check_priority_escalation()
            except Exception:
                pass
            time.sleep(self._priority_check_interval)

    def _check_priority_escalation(self):
        now = time.time()
        with self._rw_lock:
            tasks = list(self._tasks.values())
        for task in tasks:
            if task.status != TaskStatus.PENDING:
                continue
            wait_time = now - task.created_at.timestamp()
            if wait_time > self._escalation_wait_threshold and task.priority < 10:
                old_priority = task.priority
                new_priority = min(10, task.priority + 1)
                self._adjust_priority(
                    task.task_id, new_priority,
                    PriorityAdjustReason.WAITING_TIMEOUT,
                    note=f"Waited {wait_time:.0f}s, escalated from {old_priority} to {new_priority}"
                )

    def _adjust_priority(
        self,
        task_id: str,
        new_priority: int,
        reason: PriorityAdjustReason,
        operator: str = "system",
        note: str = "",
    ) -> bool:
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            if task.status not in (TaskStatus.PENDING, TaskStatus.SCHEDULED):
                return False
            old_priority = task.priority
            if old_priority == new_priority:
                return True
            task.priority = new_priority
            task.priority_escalation_count += 1
            task.updated_at = datetime.utcnow()
            self._sync_cache(task)
            self._inc_version(task_id)

            adjust_record = PriorityAdjustRecord(
                adjust_id=str(uuid.uuid4())[:8],
                task_id=task_id,
                old_priority=old_priority,
                new_priority=new_priority,
                reason=reason,
                operator=operator,
                note=note,
            )
            if task_id not in self._priority_adjustments:
                self._priority_adjustments[task_id] = []
            self._priority_adjustments[task_id].append(adjust_record)

            self._remove_from_pending_index(task_id, old_priority)
            self._add_to_pending_index(task_id, new_priority)
        return True

    def adjust_priority(
        self,
        task_id: str,
        new_priority: int,
        reason: PriorityAdjustReason = PriorityAdjustReason.MANUAL_ESCALATION,
        operator: str = "admin",
        note: str = "",
    ) -> bool:
        new_priority = max(1, min(10, new_priority))
        return self._adjust_priority(task_id, new_priority, reason, operator, note)

    def get_priority_history(self, task_id: str) -> List[Dict]:
        with self._rw_lock:
            records = self._priority_adjustments.get(task_id, [])
            return [r.model_dump() for r in records]

    def create_task(self, task: ScheduledTask) -> bool:
        with self._rw_lock:
            if task.task_id in self._tasks:
                return False
            task.original_priority = task.priority
            self._tasks[task.task_id] = task
            self._task_versions[task.task_id] = 1
            self._sync_cache(task)
            self._add_to_pending_index(task.task_id, task.priority)
        try:
            self._allocation_queue.put_nowait(task.task_id)
        except Exception:
            pass
        return True

    def get_task(self, task_id: str) -> Optional[ScheduledTask]:
        cached = self._cache.get(f"task:{task_id}")
        if cached:
            return ScheduledTask(**cached)
        with self._rw_lock:
            return self._tasks.get(task_id)

    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        satellite_id: Optional[str] = None,
        task_type: Optional[TaskType] = None,
    ) -> List[ScheduledTask]:
        with self._rw_lock:
            result = list(self._tasks.values())
        if status:
            result = [t for t in result if t.status == status]
        if satellite_id:
            result = [t for t in result if t.satellite_id == satellite_id]
        if task_type:
            result = [t for t in result if t.task_type == task_type]
        return sorted(result, key=lambda t: (t.priority, t.created_at), reverse=True)

    def update_task(self, task_id: str, **kwargs) -> bool:
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            for key, value in kwargs.items():
                if hasattr(task, key):
                    setattr(task, key, value)
            task.updated_at = datetime.utcnow()
            self._sync_cache(task)
            self._inc_version(task_id)
            return True

    def start_task(self, task_id: str) -> bool:
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if not task or task.status != TaskStatus.SCHEDULED:
                return False
            need_alloc = not task.allocated_channel_id
            task_copy = ScheduledTask(**task.model_dump())

        if need_alloc:
            success, channel, msg = self._channel_mgr.allocate_channel(task_copy)
            if not success:
                self._handle_allocation_failure(task_id, msg)
                return False
            with self._rw_lock:
                t = self._tasks.get(task_id)
                if not t or t.status != TaskStatus.SCHEDULED:
                    self._channel_mgr.release_channel(task_id)
                    return False
                t.allocated_channel_id = channel.channel_id

        with self._rw_lock:
            t = self._tasks.get(task_id)
            if not t:
                return False
            t.status = TaskStatus.RUNNING
            t.updated_at = datetime.utcnow()
            self._sync_cache(t)
            self._inc_version(task_id)
        self._notification_queue.put({
            "task": t,
            "status": TaskStatus.RUNNING,
        })
        return True

    def _handle_allocation_failure(self, task_id: str, error_message: str):
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            task.failure_count += 1
            task.last_failure_reason = error_message
            task.updated_at = datetime.utcnow()
            self._sync_cache(task)
        self._failure_tracer.record_failure(task, error_message)
        if task.failure_count >= 3:
            new_priority = max(1, task.priority - 1)
            self._adjust_priority(
                task_id, new_priority,
                PriorityAdjustReason.FAILURE_RECOVERY,
                note=f"After {task.failure_count} failures, degraded priority to {new_priority}"
            )

    def pause_task(self, task_id: str) -> bool:
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if not task or task.status != TaskStatus.RUNNING:
                return False
            task.status = TaskStatus.PAUSED
            task.updated_at = datetime.utcnow()
            self._sync_cache(task)
            self._inc_version(task_id)
        self._notification_queue.put({
            "task": task,
            "status": TaskStatus.PAUSED,
        })
        return True

    def resume_task(self, task_id: str) -> bool:
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if not task or task.status != TaskStatus.PAUSED:
                return False
            task.status = TaskStatus.RUNNING
            task.updated_at = datetime.utcnow()
            self._sync_cache(task)
            self._inc_version(task_id)
        self._notification_queue.put({
            "task": task,
            "status": TaskStatus.RUNNING,
        })
        return True

    def complete_task(self, task_id: str, result_message: str = "") -> bool:
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if not task:
                return False
            task.status = TaskStatus.COMPLETED
            task.updated_at = datetime.utcnow()
            if task.parameters is None:
                task.parameters = {}
            task.parameters["completion_message"] = result_message
            self._sync_cache(task)
            self._inc_version(task_id)
            has_channel = bool(task.allocated_channel_id)

        if has_channel:
            self._channel_mgr.release_channel(task_id)
        self._notification_queue.put({
            "task": task,
            "status": TaskStatus.COMPLETED,
        })
        return True

    def fail_task(self, task_id: str, error_message: str) -> bool:
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if not task:
                return False
            task.status = TaskStatus.FAILED
            task.failure_count += 1
            task.last_failure_reason = error_message
            task.updated_at = datetime.utcnow()
            if task.parameters is None:
                task.parameters = {}
            task.parameters["error_message"] = error_message
            self._sync_cache(task)
            self._inc_version(task_id)
            has_channel = bool(task.allocated_channel_id)

        if has_channel:
            self._channel_mgr.release_channel(task_id)
        self._failure_tracer.record_failure(task, error_message)
        self._notification_queue.put({
            "task": task,
            "status": TaskStatus.FAILED,
        })
        return True

    def cancel_task(self, task_id: str) -> bool:
        with self._rw_lock:
            task = self._tasks.get(task_id)
            if not task:
                return False
            if task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
                return False
            task.status = TaskStatus.CANCELLED
            task.updated_at = datetime.utcnow()
            self._sync_cache(task)
            self._inc_version(task_id)
            has_channel = bool(task.allocated_channel_id)

        if has_channel:
            self._channel_mgr.release_channel(task_id)
        self._notification_queue.put({
            "task": task,
            "status": TaskStatus.CANCELLED,
        })
        return True

    def delete_task(self, task_id: str) -> bool:
        with self._rw_lock:
            if task_id not in self._tasks:
                return False
            task = self._tasks.pop(task_id)
            self._task_versions.pop(task_id, None)
            self._cache.delete(f"task:{task_id}")
            has_channel = bool(task.allocated_channel_id)
            self._remove_from_pending_index(task_id, task.original_priority)
            self._priority_adjustments.pop(task_id, None)

        if has_channel:
            self._channel_mgr.release_channel(task_id)
        return True

    def register_status_callback(self, callback: Callable) -> None:
        with self._rw_lock:
            self._event_callbacks.append(callback)

    def _notify_status_change(self, task: ScheduledTask, new_status: TaskStatus):
        event = {
            "event_type": "task_status_changed",
            "task_id": task.task_id,
            "new_status": new_status.value,
            "satellite_id": task.satellite_id,
            "channel_id": task.allocated_channel_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        with self._rw_lock:
            callbacks = list(self._event_callbacks)
        for cb in callbacks:
            try:
                cb(event)
            except Exception:
                pass

    def get_schedule_stats(self) -> Dict:
        with self._rw_lock:
            tasks = list(self._tasks.values())
            priority_groups = {
                p: len(tids) for p, tids in self._pending_by_priority.items()
            }
        return {
            "total": len(tasks),
            "pending": sum(1 for t in tasks if t.status == TaskStatus.PENDING),
            "scheduled": sum(1 for t in tasks if t.status == TaskStatus.SCHEDULED),
            "running": sum(1 for t in tasks if t.status == TaskStatus.RUNNING),
            "paused": sum(1 for t in tasks if t.status == TaskStatus.PAUSED),
            "completed": sum(1 for t in tasks if t.status == TaskStatus.COMPLETED),
            "failed": sum(1 for t in tasks if t.status == TaskStatus.FAILED),
            "cancelled": sum(1 for t in tasks if t.status == TaskStatus.CANCELLED),
            "allocation_queue_size": self._allocation_queue.qsize(),
            "notification_queue_size": self._notification_queue.qsize(),
            "priority_distribution": priority_groups,
            "total_adjustments": sum(
                len(v) for v in self._priority_adjustments.values()
            ),
        }


_task_scheduler_instance: Optional[TaskScheduler] = None


def get_task_scheduler() -> TaskScheduler:
    global _task_scheduler_instance
    if _task_scheduler_instance is None:
        _task_scheduler_instance = TaskScheduler()
    return _task_scheduler_instance