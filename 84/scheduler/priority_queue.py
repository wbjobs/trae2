from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from enum import IntEnum
import heapq
import threading
import queue
import uuid
import time
from datetime import datetime


class TaskPriority(IntEnum):
    LOW = 0
    NORMAL = 5
    HIGH = 10
    CRITICAL = 15


@dataclass(order=True)
class PrioritizedTask:
    priority: int
    submitted_at: float
    task_id: str = field(compare=False)
    task_data: Dict[str, Any] = field(compare=False)
    callback: Optional[Callable] = field(default=None, compare=False)
    original_priority: int = field(default=0, compare=False)
    boost_count: int = field(default=0, compare=False)
    age_cycles: int = field(default=0, compare=False)

    def __post_init__(self):
        self.priority = -self.priority
        if self.original_priority == 0:
            self.original_priority = -self.priority


class PriorityTaskQueue:
    def __init__(self, maxsize: int = 0,
                 aging_interval: int = 5,
                 aging_boost: int = 1,
                 max_priority: int = 15,
                 starvation_threshold: int = 20):
        self._queue: List[PrioritizedTask] = []
        self._lock = threading.RLock()
        self._maxsize = maxsize
        self._task_ids: set = set()
        self._tasks_by_id: Dict[str, PrioritizedTask] = {}
        self._aging_interval = aging_interval
        self._aging_boost = aging_boost
        self._max_priority = max_priority
        self._starvation_threshold = starvation_threshold
        self._dequeue_count = 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._queue)

    def empty(self) -> bool:
        with self._lock:
            return len(self._queue) == 0

    def full(self) -> bool:
        with self._lock:
            return self._maxsize > 0 and len(self._queue) >= self._maxsize

    def qsize(self) -> int:
        return len(self)

    def put(self, task_data: Dict[str, Any], priority: int = TaskPriority.NORMAL,
            task_id: Optional[str] = None, callback: Optional[Callable] = None) -> str:
        if task_id is None:
            task_id = str(uuid.uuid4())
        with self._lock:
            if self._maxsize > 0 and len(self._queue) >= self._maxsize:
                raise queue.Full("Queue is full")
            if task_id in self._task_ids:
                raise ValueError(f"Task {task_id} already in queue")
            prioritized = PrioritizedTask(
                priority=priority,
                submitted_at=datetime.utcnow().timestamp(),
                task_id=task_id,
                task_data=task_data,
                callback=callback,
                original_priority=priority,
                boost_count=0,
                age_cycles=0
            )
            heapq.heappush(self._queue, prioritized)
            self._task_ids.add(task_id)
            self._tasks_by_id[task_id] = prioritized
            return task_id

    def get(self, block: bool = True, timeout: Optional[float] = None) -> Optional[Dict[str, Any]]:
        with self._lock:
            if not self._queue:
                if not block:
                    return None
                raise queue.Empty("Queue is empty")
            self._apply_aging()
            prioritized = heapq.heappop(self._queue)
            self._task_ids.discard(prioritized.task_id)
            del self._tasks_by_id[prioritized.task_id]
            self._dequeue_count += 1
            if prioritized.callback:
                try:
                    prioritized.callback(prioritized.task_id, prioritized.task_data)
                except Exception:
                    pass
            return {
                'task_id': prioritized.task_id,
                'priority': -prioritized.priority,
                'original_priority': prioritized.original_priority,
                'boost_count': prioritized.boost_count,
                'age_cycles': prioritized.age_cycles,
                'data': prioritized.task_data
            }

    def get_nowait(self) -> Optional[Dict[str, Any]]:
        return self.get(block=False)

    def _apply_aging(self) -> None:
        if self._dequeue_count % self._aging_interval != 0:
            return
        to_reinsert = []
        for task in self._queue:
            task.age_cycles += 1
            if task.age_cycles >= self._starvation_threshold:
                current_priority = -task.priority
                new_priority = min(current_priority + self._aging_boost, self._max_priority)
                if new_priority > current_priority:
                    task.priority = -new_priority
                    task.boost_count += 1
                    to_reinsert.append(task)
        if to_reinsert:
            for task in to_reinsert:
                self._queue.remove(task)
            for task in to_reinsert:
                heapq.heappush(self._queue, task)

    def remove(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._task_ids:
                return False
            task = self._tasks_by_id[task_id]
            self._queue.remove(task)
            heapq.heapify(self._queue)
            self._task_ids.discard(task_id)
            del self._tasks_by_id[task_id]
            return True

    def update_priority(self, task_id: str, new_priority: int) -> bool:
        with self._lock:
            if task_id not in self._task_ids:
                return False
            old_task = self._tasks_by_id[task_id]
            self._queue.remove(old_task)
            updated = PrioritizedTask(
                priority=new_priority,
                submitted_at=old_task.submitted_at,
                task_id=task_id,
                task_data=old_task.task_data,
                callback=old_task.callback,
                original_priority=old_task.original_priority,
                boost_count=old_task.boost_count + (1 if new_priority > old_task.original_priority else 0),
                age_cycles=old_task.age_cycles
            )
            heapq.heappush(self._queue, updated)
            self._tasks_by_id[task_id] = updated
            return True

    def peek(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            if not self._queue:
                return None
            prioritized = self._queue[0]
            return {
                'task_id': prioritized.task_id,
                'priority': -prioritized.priority,
                'data': prioritized.task_data
            }

    def contains(self, task_id: str) -> bool:
        with self._lock:
            return task_id in self._task_ids

    def list_tasks(self) -> List[Dict[str, Any]]:
        with self._lock:
            tasks = []
            for prioritized in sorted(self._queue, key=lambda x: (x.priority, x.submitted_at)):
                tasks.append({
                    'task_id': prioritized.task_id,
                    'priority': -prioritized.priority,
                    'original_priority': prioritized.original_priority,
                    'boost_count': prioritized.boost_count,
                    'age_cycles': prioritized.age_cycles,
                    'submitted_at': datetime.fromtimestamp(prioritized.submitted_at).isoformat(),
                    'data': prioritized.task_data
                })
            return tasks

    def clear(self) -> None:
        with self._lock:
            self._queue.clear()
            self._task_ids.clear()
            self._tasks_by_id.clear()

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            if not self._queue:
                return {
                    'size': 0,
                    'max_priority': None,
                    'min_priority': None,
                    'avg_priority': None,
                    'starved_tasks': 0,
                    'boosted_tasks': 0
                }
            priorities = [-t.priority for t in self._queue]
            starved = sum(1 for t in self._queue if t.age_cycles >= self._starvation_threshold)
            boosted = sum(1 for t in self._queue if t.boost_count > 0)
            return {
                'size': len(self._queue),
                'max_priority': max(priorities),
                'min_priority': min(priorities),
                'avg_priority': sum(priorities) / len(priorities),
                'starved_tasks': starved,
                'boosted_tasks': boosted,
                'dequeue_count': self._dequeue_count,
                'tasks_by_priority': {
                    str(p): priorities.count(p)
                    for p in set(priorities)
                }
            }

    def get_starved_tasks(self) -> List[str]:
        with self._lock:
            return [t.task_id for t in self._queue
                    if t.age_cycles >= self._starvation_threshold]
