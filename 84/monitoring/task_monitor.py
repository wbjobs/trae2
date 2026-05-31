from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta
import threading
import logging
from config import PriorityLevel

logger = logging.getLogger(__name__)


class TaskState(Enum):
    PENDING = 'pending'
    QUEUED = 'queued'
    STARTED = 'started'
    RUNNING = 'running'
    SUCCESS = 'success'
    FAILURE = 'failure'
    REVOKED = 'revoked'
    RETRY = 'retry'


@dataclass
class TaskInfo:
    task_id: str
    name: str
    state: TaskState = TaskState.PENDING
    priority: PriorityLevel = PriorityLevel.NORMAL
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    progress: float = 0.0
    current_iteration: int = 0
    total_iterations: int = 0
    shard_id: Optional[int] = None
    node_name: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'task_id': self.task_id,
            'name': self.name,
            'state': self.state.value,
            'priority': self.priority.value,
            'created_at': self.created_at.isoformat(),
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'failed_at': self.failed_at.isoformat() if self.failed_at else None,
            'progress': self.progress,
            'current_iteration': self.current_iteration,
            'total_iterations': self.total_iterations,
            'shard_id': self.shard_id,
            'node_name': self.node_name,
            'error_message': self.error_message,
            'retry_count': self.retry_count,
            'duration_seconds': self.duration_seconds(),
            'metadata': self.metadata
        }
    
    def duration_seconds(self) -> float:
        end_time = self.completed_at or self.failed_at or datetime.utcnow()
        if self.started_at is None:
            return 0.0
        return (end_time - self.started_at).total_seconds()
    
    def estimated_remaining_seconds(self) -> float:
        if self.progress <= 0 or self.started_at is None:
            return float('inf')
        elapsed = (datetime.utcnow() - self.started_at).total_seconds()
        if elapsed <= 0:
            return float('inf')
        total_estimated = elapsed / self.progress
        return max(0.0, total_estimated - elapsed)


class TaskMonitor:
    def __init__(self, retention_hours: int = 24,
                 on_task_failed: Optional[Callable[[TaskInfo], None]] = None,
                 on_task_completed: Optional[Callable[[TaskInfo], None]] = None):
        self._tasks: Dict[str, TaskInfo] = {}
        self._retention_hours = retention_hours
        self._lock = threading.RLock()
        self._on_task_failed = on_task_failed
        self._on_task_completed = on_task_completed
        self._stats = {
            'total_submitted': 0,
            'total_completed': 0,
            'total_failed': 0,
            'total_revoked': 0,
            'total_retries': 0
        }
    
    def register_task(self, task_id: str, name: str,
                      priority: PriorityLevel = PriorityLevel.NORMAL,
                      total_iterations: int = 0,
                      shard_id: Optional[int] = None,
                      metadata: Optional[Dict[str, Any]] = None) -> TaskInfo:
        with self._lock:
            task = TaskInfo(
                task_id=task_id,
                name=name,
                priority=priority,
                state=TaskState.QUEUED,
                total_iterations=total_iterations,
                shard_id=shard_id,
                metadata=metadata or {}
            )
            self._tasks[task_id] = task
            self._stats['total_submitted'] += 1
            return task
    
    def update_task_state(self, task_id: str, state: TaskState,
                          error_message: Optional[str] = None,
                          node_name: Optional[str] = None) -> Optional[TaskInfo]:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None
            task.state = state
            if node_name:
                task.node_name = node_name
            if state == TaskState.STARTED or state == TaskState.RUNNING:
                if task.started_at is None:
                    task.started_at = datetime.utcnow()
            elif state == TaskState.SUCCESS:
                task.completed_at = datetime.utcnow()
                task.progress = 1.0
                self._stats['total_completed'] += 1
                if self._on_task_completed:
                    try:
                        self._on_task_completed(task)
                    except Exception as e:
                        logger.error(f"Error in on_task_completed callback: {e}")
            elif state == TaskState.FAILURE:
                task.failed_at = datetime.utcnow()
                task.error_message = error_message
                self._stats['total_failed'] += 1
                if self._on_task_failed:
                    try:
                        self._on_task_failed(task)
                    except Exception as e:
                        logger.error(f"Error in on_task_failed callback: {e}")
            elif state == TaskState.REVOKED:
                self._stats['total_revoked'] += 1
            elif state == TaskState.RETRY:
                task.retry_count += 1
                self._stats['total_retries'] += 1
            return task
    
    def update_progress(self, task_id: str, current_iteration: int,
                        progress: Optional[float] = None) -> Optional[TaskInfo]:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None
            task.current_iteration = current_iteration
            if progress is not None:
                task.progress = progress
            elif task.total_iterations > 0:
                task.progress = current_iteration / task.total_iterations
            return task
    
    def update_metadata(self, task_id: str, metadata: Dict[str, Any]) -> Optional[TaskInfo]:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None
            task.metadata.update(metadata)
            return task
    
    def get_task(self, task_id: str) -> Optional[TaskInfo]:
        with self._lock:
            return self._tasks.get(task_id)
    
    def get_tasks_by_state(self, state: TaskState) -> List[TaskInfo]:
        with self._lock:
            return [t for t in self._tasks.values() if t.state == state]
    
    def get_active_tasks(self) -> List[TaskInfo]:
        with self._lock:
            return [t for t in self._tasks.values() 
                    if t.state in (TaskState.STARTED, TaskState.RUNNING, TaskState.RETRY)]
    
    def get_recent_tasks(self, minutes: int = 60) -> List[TaskInfo]:
        with self._lock:
            cutoff = datetime.utcnow() - timedelta(minutes=minutes)
            return [t for t in self._tasks.values() 
                    if t.created_at >= cutoff or 
                    (t.completed_at and t.completed_at >= cutoff)]
    
    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            if task.state in (TaskState.STARTED, TaskState.RUNNING, TaskState.QUEUED):
                task.state = TaskState.REVOKED
                self._stats['total_revoked'] += 1
                return True
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            active = self.get_active_tasks()
            queued = self.get_tasks_by_state(TaskState.QUEUED)
            failed = self.get_tasks_by_state(TaskState.FAILURE)
            avg_duration = 0.0
            completed = [t for t in self._tasks.values() if t.state == TaskState.SUCCESS]
            if completed:
                durations = [t.duration_seconds() for t in completed]
                avg_duration = sum(durations) / len(durations)
            return {
                **self._stats,
                'currently_active': len(active),
                'currently_queued': len(queued),
                'currently_failed': len(failed),
                'average_completion_seconds': avg_duration,
                'total_tracked': len(self._tasks)
            }
    
    def cleanup_old_tasks(self) -> int:
        with self._lock:
            cutoff = datetime.utcnow() - timedelta(hours=self._retention_hours)
            to_remove = [
                task_id for task_id, task in self._tasks.items()
                if task.state in (TaskState.SUCCESS, TaskState.FAILURE, TaskState.REVOKED)
                and (task.completed_at or task.failed_at or task.created_at) < cutoff
            ]
            for task_id in to_remove:
                del self._tasks[task_id]
            return len(to_remove)
    
    def list_all_tasks(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [t.to_dict() for t in self._tasks.values()]
    
    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            states = {}
            for state in TaskState:
                count = len(self.get_tasks_by_state(state))
                if count > 0:
                    states[state.value] = count
            priorities = {}
            for priority in PriorityLevel:
                count = len([t for t in self._tasks.values() if t.priority == priority])
                if count > 0:
                    priorities[priority.value] = count
            return {
                'states': states,
                'priorities': priorities,
                'stats': self.get_stats()
            }
