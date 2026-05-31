import uuid
import threading
import time
from typing import Dict, List, Optional
from datetime import datetime

from cache import get_cache
from models import (
    FailureRecord,
    FailureCategory,
    FailureSeverity,
    ScheduledTask,
    TaskStatus,
)


class FailureTracer:
    _instance: Optional["FailureTracer"] = None
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
        self._failures: Dict[str, FailureRecord] = {}
        self._task_failures: Dict[str, List[str]] = {}
        self._category_index: Dict[str, List[str]] = {}
        self._satellite_index: Dict[str, List[str]] = {}
        self._rw_lock = threading.RLock()

    def _determine_category_and_severity(
        self, error_message: str, task: Optional[ScheduledTask]
    ) -> tuple:
        msg_lower = error_message.lower()
        if "channel" in msg_lower and "unavailable" in msg_lower:
            return FailureCategory.CHANNEL_UNAVAILABLE, FailureSeverity.HIGH
        if "conflict" in msg_lower or "version" in msg_lower:
            return FailureCategory.CHANNEL_CONFLICT, FailureSeverity.MEDIUM
        if "timeout" in msg_lower or "timed out" in msg_lower:
            return FailureCategory.TIMEOUT, FailureSeverity.MEDIUM
        if "signaling" in msg_lower:
            return FailureCategory.SIGNALING_ERROR, FailureSeverity.HIGH
        if "exhausted" in msg_lower or "resource" in msg_lower:
            return FailureCategory.RESOURCE_EXHAUSTED, FailureSeverity.CRITICAL
        if "validation" in msg_lower or "invalid" in msg_lower:
            return FailureCategory.TASK_VALIDATION, FailureSeverity.LOW
        return FailureCategory.UNKNOWN, FailureSeverity.MEDIUM

    def record_failure(
        self,
        task: ScheduledTask,
        error_message: str,
        stack_trace: Optional[Dict] = None,
    ) -> FailureRecord:
        category, severity = self._determine_category_and_severity(error_message, task)
        failure_id = str(uuid.uuid4())
        previous_ids = self._task_failures.get(task.task_id, [])
        record = FailureRecord(
            failure_id=failure_id,
            task_id=task.task_id,
            failure_category=category,
            severity=severity,
            message=error_message,
            root_cause=self._analyze_root_cause(category, error_message),
            stack_trace=stack_trace or {},
            recovery_action=self._suggest_recovery(category, severity),
            retryable=severity != FailureSeverity.CRITICAL,
            retry_count=len(previous_ids),
            max_retries=3,
            previous_failure_ids=previous_ids[-3:],
            channel_id=task.allocated_channel_id,
            satellite_id=task.satellite_id,
        )
        with self._rw_lock:
            self._failures[failure_id] = record
            if task.task_id not in self._task_failures:
                self._task_failures[task.task_id] = []
            self._task_failures[task.task_id].append(failure_id)
            cat_key = category.value
            if cat_key not in self._category_index:
                self._category_index[cat_key] = []
            self._category_index[cat_key].append(failure_id)
            if task.satellite_id:
                sat_key = task.satellite_id
                if sat_key not in self._satellite_index:
                    self._satellite_index[sat_key] = []
                self._satellite_index[sat_key].append(failure_id)
        self._cache.set(
            f"failure:{failure_id}", record.model_dump(), ttl=86400
        )
        return record

    def _analyze_root_cause(self, category: FailureCategory, message: str) -> str:
        analysis_map = {
            FailureCategory.CHANNEL_UNAVAILABLE:
                "No suitable channel matched satellite requirements. "
                "Possible causes: satellite not in supported list, all matching channels busy or offline.",
            FailureCategory.CHANNEL_CONFLICT:
                "Optimistic lock version conflict during channel allocation. "
                "Another task acquired the channel concurrently.",
            FailureCategory.TIMEOUT:
                "Operation exceeded time limit. Possible causes: "
                "network latency, hardware unresponsiveness, or downstream service slowdown.",
            FailureCategory.SIGNALING_ERROR:
                "Signaling subsystem error. Check signal encoding, "
                "modulation parameters, and ground station transceiver health.",
            FailureCategory.RESOURCE_EXHAUSTED:
                "System resource pool depleted. Check memory, "
                "file descriptors, and connection limits.",
            FailureCategory.TASK_VALIDATION:
                "Task parameters failed validation. Review satellite ID, "
                "frequency range, and time window constraints.",
            FailureCategory.UNKNOWN:
                "Unclassified error. Enable debug logging and review "
                "system metrics at time of failure.",
        }
        return analysis_map.get(category, "Root cause not classified.")

    def _suggest_recovery(self, category: FailureCategory, severity: FailureSeverity) -> str:
        recovery_map = {
            FailureCategory.CHANNEL_UNAVAILABLE:
                "1. Add satellite to channel support list  2. Wait for channel availability  "
                "3. Consider scheduling at a different time window",
            FailureCategory.CHANNEL_CONFLICT:
                "1. Retry allocation after short delay  2. Increase priority to gain precedence  "
                "3. Consider pre-allocating channels for high-priority tasks",
            FailureCategory.TIMEOUT:
                "1. Check network connectivity  2. Verify hardware status  "
                "3. Increase timeout threshold for this operation type",
            FailureCategory.SIGNALING_ERROR:
                "1. Verify signal encoding parameters  2. Check RF link budget  "
                "3. Run transceiver diagnostic tests",
            FailureCategory.RESOURCE_EXHAUSTED:
                "1. Free up system resources  2. Reduce concurrent task count  "
                "3. Scale cluster horizontally",
            FailureCategory.TASK_VALIDATION:
                "1. Correct invalid parameters  2. Verify satellite registration  "
                "3. Check schedule window conflicts",
            FailureCategory.UNKNOWN:
                "1. Collect diagnostic logs  2. Check system metrics  3. Escalate to engineering team",
        }
        return recovery_map.get(category, "No specific recovery action available.")

    def resolve_failure(self, failure_id: str, note: str = "") -> bool:
        with self._rw_lock:
            record = self._failures.get(failure_id)
            if record is None:
                return False
            record.resolved = True
            record.resolved_at = datetime.utcnow()
            record.resolution_note = note
        self._cache.set(
            f"failure:{failure_id}", record.model_dump(), ttl=86400
        )
        return True

    def get_failure(self, failure_id: str) -> Optional[FailureRecord]:
        cached = self._cache.get(f"failure:{failure_id}")
        if cached:
            return FailureRecord(**cached)
        with self._rw_lock:
            return self._failures.get(failure_id)

    def get_failures_for_task(self, task_id: str) -> List[FailureRecord]:
        with self._rw_lock:
            failure_ids = self._task_failures.get(task_id, [])
            return [
                self._failures[fid]
                for fid in failure_ids
                if fid in self._failures
            ]

    def get_failures_by_category(
        self, category: FailureCategory
    ) -> List[FailureRecord]:
        with self._rw_lock:
            ids = self._category_index.get(category.value, [])
            return [self._failures[fid] for fid in ids if fid in self._failures]

    def get_failures_by_satellite(
        self, satellite_id: str
    ) -> List[FailureRecord]:
        with self._rw_lock:
            ids = self._satellite_index.get(satellite_id, [])
            return [self._failures[fid] for fid in ids if fid in self._failures]

    def get_unresolved_failures(self) -> List[FailureRecord]:
        with self._rw_lock:
            return [f for f in self._failures.values() if not f.resolved]

    def get_failure_chain(self, failure_id: str) -> List[FailureRecord]:
        with self._rw_lock:
            chain = []
            current = self._failures.get(failure_id)
            visited = set()
            while current and current.failure_id not in visited:
                visited.add(current.failure_id)
                chain.append(current)
                prev_ids = current.previous_failure_ids
                if not prev_ids:
                    break
                prev_id = prev_ids[-1]
                current = self._failures.get(prev_id)
            return chain

    def get_failure_stats(self) -> Dict:
        with self._rw_lock:
            total = len(self._failures)
            resolved = sum(1 for f in self._failures.values() if f.resolved)
            unresolved = total - resolved
            category_counts = {}
            for cat, ids in self._category_index.items():
                category_counts[cat] = len(ids)
            severity_counts = {}
            for f in self._failures.values():
                sev = f.severity.value
                severity_counts[sev] = severity_counts.get(sev, 0) + 1
            return {
                "total": total,
                "resolved": resolved,
                "unresolved": unresolved,
                "resolution_rate": round(resolved / total * 100, 2) if total > 0 else 0,
                "by_category": category_counts,
                "by_severity": severity_counts,
                "tasks_with_failures": len(self._task_failures),
                "satellites_affected": len(self._satellite_index),
            }


_failure_tracer_instance: Optional[FailureTracer] = None


def get_failure_tracer() -> FailureTracer:
    global _failure_tracer_instance
    if _failure_tracer_instance is None:
        _failure_tracer_instance = FailureTracer()
    return _failure_tracer_instance