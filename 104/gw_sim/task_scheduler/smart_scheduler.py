import time
import logging
import threading
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
from datetime import datetime

logger = logging.getLogger(__name__)


class WorkerProfile:

    def __init__(self, worker_id: str):
        self.worker_id = worker_id
        self.queue_name: str = ""
        self.active_tasks: int = 0
        self.reserved_tasks: int = 0
        self.capacity: int = 2
        self.avg_task_duration: float = 0.0
        self.completed_count: int = 0
        self.total_duration: float = 0.0
        self.last_heartbeat: float = time.time()
        self.is_idle: bool = True

    @property
    def utilization(self) -> float:
        if self.capacity <= 0:
            return 1.0
        return (self.active_tasks + self.reserved_tasks) / self.capacity

    @property
    def available_slots(self) -> int:
        return max(0, self.capacity - self.active_tasks - self.reserved_tasks)

    def update_task_completion(self, duration: float):
        self.completed_count += 1
        self.total_duration += duration
        self.avg_task_duration = self.total_duration / self.completed_count

    def to_dict(self) -> Dict:
        return {
            "worker_id": self.worker_id,
            "queue": self.queue_name,
            "active_tasks": self.active_tasks,
            "reserved_tasks": self.reserved_tasks,
            "capacity": self.capacity,
            "utilization": round(self.utilization, 4),
            "available_slots": self.available_slots,
            "avg_task_duration": round(self.avg_task_duration, 2),
            "completed_count": self.completed_count,
            "is_idle": self.is_idle,
        }


class SmartScheduler:

    QUEUE_PRIORITY = {
        "seepage": 2,
        "default": 1,
    }

    TASK_COMPLEXITY = {
        "task_scheduler.tasks.compute_seepage_steady_task": 3,
        "task_scheduler.tasks.compute_seepage_transient_task": 5,
        "task_scheduler.tasks.compute_water_level_task": 2,
        "task_scheduler.tasks.long_term_projection_task": 8,
        "task_scheduler.tasks.preprocess_data_task": 1,
    }

    def __init__(self):
        self._workers: Dict[str, WorkerProfile] = {}
        self._task_queue: List[Dict] = []
        self._lock = threading.Lock()
        self._placement_history: List[Dict] = []

    def register_worker(self, worker_id: str, queue_name: str = "default", capacity: int = 2):
        with self._lock:
            if worker_id not in self._workers:
                self._workers[worker_id] = WorkerProfile(worker_id)
            profile = self._workers[worker_id]
            profile.queue_name = queue_name
            profile.capacity = capacity
            logger.info(f"Registered worker {worker_id} on queue {queue_name}, capacity={capacity}")

    def update_worker_status(self, worker_id: str, active: int = 0, reserved: int = 0):
        with self._lock:
            if worker_id in self._workers:
                profile = self._workers[worker_id]
                profile.active_tasks = active
                profile.reserved_tasks = reserved
                profile.is_idle = (active + reserved) == 0
                profile.last_heartbeat = time.time()

    def record_task_completion(self, worker_id: str, task_name: str, duration: float):
        with self._lock:
            if worker_id in self._workers:
                self._workers[worker_id].update_task_completion(duration)

    def get_optimal_queue(self, task_name: str) -> str:
        complexity = self.TASK_COMPLEXITY.get(task_name, 1)

        with self._lock:
            queue_workers: Dict[str, List[WorkerProfile]] = defaultdict(list)
            for profile in self._workers.values():
                queue_workers[profile.queue_name].append(profile)

            best_queue = "default"
            best_score = -1

            for queue_name, workers in queue_workers.items():
                total_available = sum(w.available_slots for w in workers)
                total_capacity = sum(w.capacity for w in workers)
                if total_capacity == 0:
                    continue

                availability_score = total_available / total_capacity
                avg_speed = 1.0
                completed = [w for w in workers if w.avg_task_duration > 0]
                if completed:
                    avg_speed = 1.0 / (sum(w.avg_task_duration for w in completed) / len(completed))

                queue_priority = self.QUEUE_PRIORITY.get(queue_name, 1)

                score = availability_score * 0.5 + min(avg_speed, 1.0) * 0.3 + (queue_priority / 3.0) * 0.2

                if complexity > 3 and total_available < 1:
                    score *= 0.5

                if score > best_score:
                    best_score = score
                    best_queue = queue_name

        return best_queue

    def find_idle_workers(self) -> List[WorkerProfile]:
        with self._lock:
            return [w for w in self._workers.values() if w.is_idle]

    def suggest_task_redistribution(self) -> List[Dict]:
        with self._lock:
            suggestions = []
            idle_workers = [w for w in self._workers.values() if w.is_idle]
            overloaded = [w for w in self._workers.values() if w.utilization > 0.9]

            for idle_w in idle_workers:
                for busy_w in overloaded:
                    if idle_w.queue_name == busy_w.queue_name or idle_w.available_slots > 0:
                        suggestions.append({
                            "action": "redistribute",
                            "from_worker": busy_w.worker_id,
                            "to_worker": idle_w.worker_id,
                            "from_utilization": round(busy_w.utilization, 4),
                            "to_utilization": round(idle_w.utilization, 4),
                            "reason": f"Worker {busy_w.worker_id} overloaded ({busy_w.utilization:.0%}), "
                                     f"worker {idle_w.worker_id} is idle",
                        })
                        break

            return suggestions

    def estimate_completion_time(self, task_name: str) -> Optional[float]:
        complexity = self.TASK_COMPLEXITY.get(task_name, 1)

        with self._lock:
            relevant_workers = [w for w in self._workers.values()
                              if w.available_slots > 0 and w.avg_task_duration > 0]

        if not relevant_workers:
            return None

        avg_duration = sum(w.avg_task_duration for w in relevant_workers) / len(relevant_workers)
        return avg_duration * (complexity / 3.0)

    def get_cluster_utilization(self) -> Dict:
        with self._lock:
            if not self._workers:
                return {"total_workers": 0, "utilization": 0, "idle_workers": 0}

            total_capacity = sum(w.capacity for w in self._workers.values())
            total_used = sum(w.active_tasks + w.reserved_tasks for w in self._workers.values())
            idle_count = sum(1 for w in self._workers.values() if w.is_idle)

            return {
                "total_workers": len(self._workers),
                "total_capacity": total_capacity,
                "total_used": total_used,
                "utilization": round(total_used / total_capacity, 4) if total_capacity > 0 else 0,
                "idle_workers": idle_count,
                "overloaded_workers": sum(1 for w in self._workers.values() if w.utilization > 0.9),
                "workers": [w.to_dict() for w in self._workers.values()],
                "redistribution_suggestions": self.suggest_task_redistribution(),
            }

    def schedule_batch(self, tasks: List[Dict]) -> List[Dict]:
        assignments = []
        with self._lock:
            sorted_tasks = sorted(
                tasks,
                key=lambda t: self.TASK_COMPLEXITY.get(t.get("task_name", ""), 1),
                reverse=True,
            )

            available_workers = sorted(
                [w for w in self._workers.values() if w.available_slots > 0],
                key=lambda w: w.available_slots,
                reverse=True,
            )

            worker_idx = 0
            for task in sorted_tasks:
                if not available_workers:
                    assignments.append({**task, "assigned_worker": None, "queue": "default"})
                    continue

                worker = available_workers[worker_idx % len(available_workers)]
                task_name = task.get("task_name", "")
                queue = worker.queue_name

                if worker.available_slots <= 0:
                    worker_idx = (worker_idx + 1) % len(available_workers)
                    worker = available_workers[worker_idx % len(available_workers)]
                    queue = worker.queue_name

                assignments.append({
                    **task,
                    "assigned_worker": worker.worker_id,
                    "queue": queue,
                })
                worker.reserved_tasks += 1
                worker_idx += 1

                self._placement_history.append({
                    "task": task_name,
                    "worker": worker.worker_id,
                    "timestamp": datetime.utcnow().isoformat(),
                })

        return assignments
