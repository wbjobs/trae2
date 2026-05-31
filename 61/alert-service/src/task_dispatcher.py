#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import uuid
from typing import List, Dict, Optional, Callable
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))


class TaskPriority(Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


class TaskStatus(Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ESCALATED = "escalated"


class TaskType(Enum):
    INSPECTION = "inspection"
    MAINTENANCE = "maintenance"
    REPAIR = "repair"
    CALIBRATION = "calibration"
    CLEANING = "cleaning"
    INVESTIGATION = "investigation"


class MaintenanceTask:
    def __init__(self, task_id: str, task_type: TaskType, title: str, description: str,
                 room_id: str, device_id: str, priority: TaskPriority,
                 assigned_to: str = None, estimated_duration: int = 60):
        self.task_id = task_id
        self.task_type = task_type
        self.title = title
        self.description = description
        self.room_id = room_id
        self.device_id = device_id
        self.priority = priority
        self.status = TaskStatus.PENDING
        self.assigned_to = assigned_to
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.estimated_duration = estimated_duration
        self.due_at = self._calculate_due_date()
        self.notes: List[Dict] = []
        self.escalation_count = 0

    def _calculate_due_date(self) -> datetime:
        hours_map = {
            TaskPriority.EMERGENCY: 1,
            TaskPriority.CRITICAL: 4,
            TaskPriority.HIGH: 24,
            TaskPriority.NORMAL: 72,
            TaskPriority.LOW: 168
        }
        return self.created_at + timedelta(hours=hours_map.get(self.priority, 72))

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type.value,
            "title": self.title,
            "description": self.description,
            "room_id": self.room_id,
            "device_id": self.device_id,
            "priority": self.priority.value,
            "status": self.status.value,
            "assigned_to": self.assigned_to,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "due_at": self.due_at.isoformat(),
            "estimated_duration_minutes": self.estimated_duration,
            "notes": self.notes,
            "escalation_count": self.escalation_count
        }


class MaintenanceWorker:
    def __init__(self, worker_id: str, name: str, skills: List[str],
                 phone: str = None, email: str = None):
        self.worker_id = worker_id
        self.name = name
        self.skills = skills
        self.phone = phone
        self.email = email
        self.current_task: Optional[str] = None
        self.tasks_completed = 0
        self.availability = True
        self.online = True

    def to_dict(self) -> Dict:
        return {
            "worker_id": self.worker_id,
            "name": self.name,
            "skills": self.skills,
            "phone": self.phone,
            "email": self.email,
            "current_task": self.current_task,
            "tasks_completed": self.tasks_completed,
            "availability": self.availability,
            "online": self.online
        }


class TaskDispatcher:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        self.tasks: Dict[str, MaintenanceTask] = {}
        self.workers: Dict[str, MaintenanceWorker] = {}
        self.task_history: List[MaintenanceTask] = []
        
        self.auto_dispatch = config.get("maintenance", {}).get("auto_dispatch", True)
        self.escalation_threshold = config.get("maintenance", {}).get("escalation_hours", 2)
        self.max_history = config.get("maintenance", {}).get("max_history", 1000)
        
        self.callbacks: Dict[str, List[Callable]] = defaultdict(list)
        
        self._init_default_workers()
        
        self.stats = {
            "total_created": 0,
            "total_assigned": 0,
            "total_completed": 0,
            "total_escalated": 0,
            "auto_dispatched": 0
        }

    def _init_default_workers(self):
        default_workers = [
            {"name": "张工", "skills": ["electrical", "mechanical", "arc"], "phone": "13800138001"},
            {"name": "李工", "skills": ["electrical", "calibration", "temperature"], "phone": "13800138002"},
            {"name": "王工", "skills": ["hvac", "fire", "smoke"], "phone": "13800138003"},
            {"name": "赵工", "skills": ["monitoring", "software", "network"], "phone": "13800138004"},
        ]
        
        for i, w in enumerate(default_workers):
            worker = MaintenanceWorker(
                worker_id=f"worker_{i+1:03d}",
                name=w["name"],
                skills=w["skills"],
                phone=w["phone"]
            )
            self.workers[worker.worker_id] = worker

    def create_task(self, task_type: TaskType, title: str, description: str,
                    room_id: str, device_id: str, priority: TaskPriority = TaskPriority.NORMAL,
                    auto_assign: bool = None, trigger_source: str = "system") -> MaintenanceTask:
        task_id = f"task_{uuid.uuid4().hex[:12]}"
        
        task = MaintenanceTask(
            task_id=task_id,
            task_type=task_type,
            title=title,
            description=description,
            room_id=room_id,
            device_id=device_id,
            priority=priority
        )
        
        self.tasks[task_id] = task
        self.stats["total_created"] += 1
        
        self.logger.info(f"Task created: {task_id} - {title} (priority: {priority.value})")
        
        if auto_assign is None:
            auto_assign = self.auto_dispatch
        
        if auto_assign:
            self.assign_task(task_id)
        
        self._trigger_callbacks("created", task)
        
        return task

    def create_task_from_alert(self, alert: Dict) -> Optional[MaintenanceTask]:
        alert_level = alert.get("level", "warning")
        alert_type = alert.get("alert_type", "")
        room_id = alert.get("room_id", "")
        device_id = alert.get("device_id", "")
        value = alert.get("value", 0)
        
        priority_map = {
            "emergency": TaskPriority.EMERGENCY,
            "critical": TaskPriority.CRITICAL,
            "warning": TaskPriority.HIGH,
            "info": TaskPriority.NORMAL
        }
        priority = priority_map.get(alert_level, TaskPriority.NORMAL)
        
        type_map = {
            "temperature": TaskType.INVESTIGATION,
            "current": TaskType.REPAIR,
            "voltage": TaskType.CALIBRATION,
            "arc": TaskType.REPAIR,
            "smoke": TaskType.INVESTIGATION,
            "humidity": TaskType.INSPECTION
        }
        
        sensor_type = alert_type.replace("_threshold", "")
        task_type = type_map.get(sensor_type, TaskType.INVESTIGATION)
        
        title_map = {
            "temperature": f"温度异常告警 - {device_id}",
            "current": f"电流过载告警 - {device_id}",
            "voltage": f"电压异常告警 - {device_id}",
            "arc": f"电弧检测告警 - {device_id}",
            "smoke": f"烟雾检测告警 - {device_id}",
            "humidity": f"湿度异常告警 - {device_id}"
        }
        title = title_map.get(sensor_type, f"设备告警 - {device_id}")
        
        description = (
            f"设备 {device_id} 触发 {alert_level} 级别告警\n"
            f"告警类型: {alert_type}\n"
            f"当前值: {value}\n"
            f"告警时间: {datetime.now().isoformat()}"
        )
        
        task = self.create_task(
            task_type=task_type,
            title=title,
            description=description,
            room_id=room_id,
            device_id=device_id,
            priority=priority,
            trigger_source="alert"
        )
        
        return task

    def create_scheduled_tasks(self):
        pass

    def assign_task(self, task_id: str, worker_id: str = None) -> bool:
        if task_id not in self.tasks:
            return False
        
        task = self.tasks[task_id]
        
        if task.status not in [TaskStatus.PENDING, TaskStatus.ESCALATED]:
            return False
        
        if worker_id is None:
            worker_id = self._find_best_worker(task)
        
        if worker_id is None or worker_id not in self.workers:
            return False
        
        worker = self.workers[worker_id]
        
        if not worker.availability or not worker.online:
            return False
        
        task.assigned_to = worker_id
        task.status = TaskStatus.ASSIGNED
        task.updated_at = datetime.now()
        worker.current_task = task_id
        
        self.stats["total_assigned"] += 1
        self.stats["auto_dispatched"] += 1
        
        self.logger.info(f"Task {task_id} assigned to {worker.name} ({worker_id})")
        
        self._trigger_callbacks("assigned", task)
        
        return True

    def _find_best_worker(self, task: MaintenanceTask) -> Optional[str]:
        device_type = task.device_id.split("_")[-1] if "_" in task.device_id else "general"
        
        skill_map = {
            "temp": "temperature",
            "hum": "hvac",
            "curr": "electrical",
            "volt": "electrical",
            "arc": "arc",
            "smoke": "fire"
        }
        required_skill = skill_map.get(device_type, "electrical")
        
        priority_order = [
            TaskPriority.EMERGENCY,
            TaskPriority.CRITICAL,
            TaskPriority.HIGH,
            TaskPriority.NORMAL,
            TaskPriority.LOW
        ]
        
        candidates = []
        for worker_id, worker in self.workers.items():
            if worker.availability and worker.online:
                skill_match = required_skill in worker.skills
                is_free = worker.current_task is None
                
                score = 0
                if is_free:
                    score += 100
                if skill_match:
                    score += 50
                score += worker.tasks_completed * 0.1
                
                if task.priority in priority_order[:2]:
                    score += 200
                
                candidates.append((score, worker_id))
        
        if not candidates:
            return None
        
        candidates.sort(reverse=True)
        return candidates[0][1]

    def start_task(self, task_id: str, worker_id: str = None) -> bool:
        if task_id not in self.tasks:
            return False
        
        task = self.tasks[task_id]
        
        if task.status not in [TaskStatus.ASSIGNED, TaskStatus.PENDING]:
            return False
        
        task.status = TaskStatus.IN_PROGRESS
        task.started_at = datetime.now()
        task.updated_at = datetime.now()
        
        self.logger.info(f"Task {task_id} started")
        self._trigger_callbacks("started", task)
        
        return True

    def complete_task(self, task_id: str, notes: str = None) -> bool:
        if task_id not in self.tasks:
            return False
        
        task = self.tasks[task_id]
        
        if task.status != TaskStatus.IN_PROGRESS:
            return False
        
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now()
        task.updated_at = datetime.now()
        
        if notes:
            task.notes.append({
                "timestamp": datetime.now().isoformat(),
                "content": notes,
                "type": "completion"
            })
        
        if task.assigned_to and task.assigned_to in self.workers:
            worker = self.workers[task.assigned_to]
            worker.current_task = None
            worker.tasks_completed += 1
        
        self.stats["total_completed"] += 1
        
        self.task_history.append(task)
        if len(self.task_history) > self.max_history:
            self.task_history = self.task_history[-self.max_history:]
        
        del self.tasks[task_id]
        
        self.logger.info(f"Task {task_id} completed")
        self._trigger_callbacks("completed", task)
        
        return True

    def escalate_task(self, task_id: str, reason: str = None) -> bool:
        if task_id not in self.tasks:
            return False
        
        task = self.tasks[task_id]
        
        priority_order = [
            TaskPriority.LOW,
            TaskPriority.NORMAL,
            TaskPriority.HIGH,
            TaskPriority.CRITICAL,
            TaskPriority.EMERGENCY
        ]
        
        current_idx = priority_order.index(task.priority)
        if current_idx < len(priority_order) - 1:
            task.priority = priority_order[current_idx + 1]
            task.escalation_count += 1
            task.status = TaskStatus.ESCALATED
            task.updated_at = datetime.now()
            
            if reason:
                task.notes.append({
                    "timestamp": datetime.now().isoformat(),
                    "content": reason,
                    "type": "escalation"
                })
            
            self.stats["total_escalated"] += 1
            
            self.logger.warning(f"Task {task_id} escalated to {task.priority.value}")
            self._trigger_callbacks("escalated", task)
            
            self.assign_task(task_id)
            
            return True
        
        return False

    def cancel_task(self, task_id: str, reason: str = None) -> bool:
        if task_id not in self.tasks:
            return False
        
        task = self.tasks[task_id]
        task.status = TaskStatus.CANCELLED
        task.updated_at = datetime.now()
        
        if task.assigned_to and task.assigned_to in self.workers:
            self.workers[task.assigned_to].current_task = None
        
        if reason:
            task.notes.append({
                "timestamp": datetime.now().isoformat(),
                "content": reason,
                "type": "cancellation"
            })
        
        self.task_history.append(task)
        del self.tasks[task_id]
        
        self.logger.info(f"Task {task_id} cancelled")
        self._trigger_callbacks("cancelled", task)
        
        return True

    def get_task(self, task_id: str) -> Optional[MaintenanceTask]:
        return self.tasks.get(task_id)

    def get_tasks(self, status: TaskStatus = None, room_id: str = None,
                  priority: TaskPriority = None, assigned_to: str = None) -> List[MaintenanceTask]:
        tasks = list(self.tasks.values())
        
        if status:
            tasks = [t for t in tasks if t.status == status]
        if room_id:
            tasks = [t for t in tasks if t.room_id == room_id]
        if priority:
            tasks = [t for t in tasks if t.priority == priority]
        if assigned_to:
            tasks = [t for t in tasks if t.assigned_to == assigned_to]
        
        priority_order = [
            TaskPriority.EMERGENCY,
            TaskPriority.CRITICAL,
            TaskPriority.HIGH,
            TaskPriority.NORMAL,
            TaskPriority.LOW
        ]
        tasks.sort(key=lambda t: (priority_order.index(t.priority), t.created_at))
        
        return tasks

    def get_worker_tasks(self, worker_id: str) -> Dict[str, List[MaintenanceTask]]:
        active = [t for t in self.tasks.values() if t.assigned_to == worker_id]
        history = [t for t in self.task_history if t.assigned_to == worker_id]
        
        return {
            "active": active,
            "history": history[-50:]
        }

    def get_workers(self) -> List[MaintenanceWorker]:
        return list(self.workers.values())

    def add_task_callback(self, event_type: str, callback: Callable):
        self.callbacks[event_type].append(callback)

    def _trigger_callbacks(self, event_type: str, task: MaintenanceTask):
        for callback in self.callbacks.get(event_type, []):
            try:
                callback(task)
            except Exception as e:
                self.logger.error(f"Callback error for {event_type}: {e}")

    def check_overdue_tasks(self):
        now = datetime.now()
        overdue = []
        
        for task_id, task in list(self.tasks.items()):
            if now > task.due_at and task.status in [TaskStatus.PENDING, TaskStatus.ASSIGNED]:
                wait_time = (now - task.created_at).total_seconds() / 3600
                if wait_time > self.escalation_threshold:
                    self.escalate_task(task_id, "Task overdue - automatic escalation")
                    overdue.append(task_id)
        
        return overdue

    def get_stats(self) -> Dict:
        status_counts = defaultdict(int)
        for task in self.tasks.values():
            status_counts[task.status.value] += 1
        
        priority_counts = defaultdict(int)
        for task in self.tasks.values():
            priority_counts[task.priority.value] += 1
        
        return {
            **self.stats,
            "active_tasks": len(self.tasks),
            "by_status": dict(status_counts),
            "by_priority": dict(priority_counts),
            "total_workers": len(self.workers),
            "available_workers": sum(1 for w in self.workers.values() if w.availability and w.online)
        }
