import threading
import time
import uuid
from typing import Dict, List, Optional, Callable
from datetime import datetime, timedelta
from queue import Queue, Empty, PriorityQueue

import httpx

from cache import get_cache
from models import (
    CallbackEvent,
    CallbackEventType,
)


class CallbackManager:
    _instance: Optional["CallbackManager"] = None
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
        self._registrations: Dict[str, List[Dict]] = {}
        self._event_log: List[Dict] = []
        self._pending_events: Queue = Queue(maxsize=50000)
        self._retry_queue: PriorityQueue = PriorityQueue()
        self._dead_letter_queue: List[Dict] = []
        self._rw_lock = threading.RLock()
        self._http_client = httpx.Client(timeout=8.0)
        self._delivery_threads = [
            threading.Thread(
                target=self._delivery_worker,
                daemon=True,
                name=f"callback-worker-{i}",
            )
            for i in range(4)
        ]
        self._retry_thread = threading.Thread(
            target=self._retry_worker, daemon=True, name="callback-retry"
        )
        for t in self._delivery_threads:
            t.start()
        self._retry_thread.start()

    def _delivery_worker(self):
        while True:
            try:
                event_data = self._pending_events.get(timeout=1.0)
                success = self._do_deliver_sync(event_data)
                if not success:
                    self._schedule_retry(event_data)
            except Empty:
                continue
            except Exception:
                pass

    def _retry_worker(self):
        while True:
            try:
                schedule_time, _, event_data = self._retry_queue.get(timeout=1.0)
                now = time.time()
                if schedule_time > now:
                    time.sleep(min(1.0, schedule_time - now))
                success = self._do_deliver_sync(event_data)
                if not success:
                    self._schedule_retry(event_data)
            except Empty:
                continue
            except Exception:
                pass

    def _schedule_retry(self, event_data: Dict):
        retry_count = event_data.get("retry_count", 0) + 1
        max_retries = event_data.get("max_retries", 5)
        event_data["retry_count"] = retry_count

        if retry_count >= max_retries:
            with self._rw_lock:
                self._dead_letter_queue.append({
                    **event_data,
                    "dead_letter_at": datetime.utcnow().isoformat(),
                })
                if len(self._dead_letter_queue) > 1000:
                    self._dead_letter_queue = self._dead_letter_queue[-1000:]
            self._cache.set(
                f"callback:dlq:{event_data.get('event_id')}",
                event_data,
                ttl=86400,
            )
            return

        delay = min(60.0, 1.0 * (2 ** (retry_count - 1)))
        schedule_time = time.time() + delay
        self._retry_queue.put((
            schedule_time,
            event_data.get("event_id"),
            event_data,
        ))

    def _do_deliver_sync(self, event_data: Dict) -> bool:
        target_url = event_data.get("target_url", "")
        if not target_url:
            return True

        try:
            response = self._http_client.post(
                target_url,
                json=event_data.get("payload", {}),
                headers={
                    "Content-Type": "application/json",
                    "X-Callback-Event-Id": event_data.get("event_id", ""),
                    "X-Callback-Event-Type": event_data.get("event_type", ""),
                    "X-Retry-Count": str(event_data.get("retry_count", 0)),
                },
                timeout=8.0,
            )
            log_entry = {
                "event_id": event_data.get("event_id"),
                "event_type": event_data.get("event_type"),
                "target_url": target_url,
                "status_code": response.status_code,
                "success": 200 <= response.status_code < 300,
                "retry_count": event_data.get("retry_count", 0),
                "timestamp": datetime.utcnow().isoformat(),
                "worker": threading.current_thread().name,
            }
            with self._rw_lock:
                self._event_log.append(log_entry)
                if len(self._event_log) > 5000:
                    self._event_log = self._event_log[-5000:]
            self._cache.set(
                f"callback:log:{event_data.get('event_id')}",
                log_entry,
                ttl=3600,
            )
            return log_entry["success"]
        except Exception as e:
            log_entry = {
                "event_id": event_data.get("event_id"),
                "event_type": event_data.get("event_type"),
                "target_url": target_url,
                "status_code": 0,
                "success": False,
                "error": str(e)[:200],
                "retry_count": event_data.get("retry_count", 0),
                "timestamp": datetime.utcnow().isoformat(),
            }
            with self._rw_lock:
                self._event_log.append(log_entry)
                if len(self._event_log) > 5000:
                    self._event_log = self._event_log[-5000:]
            return False

    def register_callback(
        self,
        event_type: CallbackEventType,
        url: str,
        description: str = "",
        filter_conditions: Optional[Dict] = None,
    ) -> str:
        registration_id = str(uuid.uuid4())[:8]
        registration = {
            "registration_id": registration_id,
            "event_type": event_type.value,
            "url": url,
            "description": description,
            "filter_conditions": filter_conditions or {},
            "created_at": datetime.utcnow().isoformat(),
            "active": True,
        }
        with self._rw_lock:
            if event_type.value not in self._registrations:
                self._registrations[event_type.value] = []
            self._registrations[event_type.value].append(registration)
        return registration_id

    def unregister_callback(self, registration_id: str) -> bool:
        with self._rw_lock:
            for event_type, registrations in self._registrations.items():
                for i, reg in enumerate(registrations):
                    if reg["registration_id"] == registration_id:
                        reg["active"] = False
                        return True
        return False

    def trigger_event(
        self,
        event_type: CallbackEventType,
        payload: Dict,
        source_service: str = "scheduler",
    ) -> str:
        event_id = str(uuid.uuid4())
        event_data = {
            "event_id": event_id,
            "event_type": event_type.value,
            "source_service": source_service,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat(),
            "retry_count": 0,
            "max_retries": 5,
        }

        with self._rw_lock:
            registrations = self._registrations.get(event_type.value, [])
            target_count = 0
            for reg in registrations:
                if not reg.get("active", True):
                    continue
                conditions = reg.get("filter_conditions", {})
                if conditions and not self._match_conditions(
                    payload, conditions
                ):
                    continue
                event_copy = event_data.copy()
                event_copy["target_url"] = reg["url"]
                event_copy["registration_id"] = reg["registration_id"]
                try:
                    self._pending_events.put_nowait(event_copy)
                    target_count += 1
                except Exception:
                    pass

        if target_count > 0:
            self._cache.set(
                f"callback:event:{event_id}",
                {**event_data, "target_count": target_count},
                ttl=3600,
            )
        return event_id

    def _match_conditions(self, payload: Dict, conditions: Dict) -> bool:
        for key, expected in conditions.items():
            actual = payload.get(key)
            if actual != expected:
                return False
        return True

    def list_registrations(
        self, event_type: Optional[CallbackEventType] = None
    ) -> List[Dict]:
        with self._rw_lock:
            if event_type:
                return list(self._registrations.get(event_type.value, []))
            result = []
            for registrations in self._registrations.values():
                result.extend(registrations)
            return result

    def get_delivery_log(
        self, event_type: Optional[CallbackEventType] = None, limit: int = 100
    ) -> List[Dict]:
        with self._rw_lock:
            logs = self._event_log[-limit:] if len(self._event_log) > limit else self._event_log
        if event_type:
            logs = [l for l in logs if l.get("event_type") == event_type.value]
        return logs

    def get_dead_letter_queue(self, limit: int = 100) -> List[Dict]:
        with self._rw_lock:
            return list(self._dead_letter_queue[-limit:])

    def replay_dead_letter(self, event_id: str) -> bool:
        with self._rw_lock:
            for i, item in enumerate(self._dead_letter_queue):
                if item.get("event_id") == event_id:
                    item["retry_count"] = 0
                    item["replay_at"] = datetime.utcnow().isoformat()
                    try:
                        self._pending_events.put_nowait(item)
                        self._dead_letter_queue.pop(i)
                        return True
                    except Exception:
                        return False
        return False

    def get_callback_stats(self) -> Dict:
        with self._rw_lock:
            total_registrations = sum(
                len(regs) for regs in self._registrations.values()
            )
            active_registrations = sum(
                1
                for regs in self._registrations.values()
                for r in regs
                if r.get("active", True)
            )
            total_deliveries = len(self._event_log)
            successful = sum(1 for l in self._event_log if l.get("success"))
            failed = sum(1 for l in self._event_log if not l.get("success"))
            return {
                "registered_event_types": list(self._registrations.keys()),
                "total_registrations": total_registrations,
                "active_registrations": active_registrations,
                "pending_deliveries": self._pending_events.qsize(),
                "retry_queue_size": self._retry_queue.qsize(),
                "dead_letter_count": len(self._dead_letter_queue),
                "total_deliveries": total_deliveries,
                "successful_deliveries": successful,
                "failed_deliveries": failed,
                "worker_threads": len(self._delivery_threads),
                "success_rate": round(successful / total_deliveries * 100, 2)
                if total_deliveries > 0
                else 0,
            }


_callback_manager_instance: Optional[CallbackManager] = None


def get_callback_manager() -> CallbackManager:
    global _callback_manager_instance
    if _callback_manager_instance is None:
        _callback_manager_instance = CallbackManager()
    return _callback_manager_instance