import threading
import time
import uuid
from typing import Dict, List, Optional, Callable
from datetime import datetime

from cache import get_cache
from models import (
    SignalingMessage,
    SignalingDirection,
    SignalingType,
    SignalingPriority,
)


class SignalingManager:
    _instance: Optional["SignalingManager"] = None
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
        self._queue: List[SignalingMessage] = []
        self._processing: Dict[str, SignalingMessage] = {}
        self._delivered: List[SignalingMessage] = []
        self._rw_lock = threading.RLock()
        self._uplink_handlers: Dict[str, Callable] = {}
        self._downlink_handlers: Dict[str, Callable] = {}
        self._processor_thread = threading.Thread(
            target=self._process_queue, daemon=True
        )
        self._processor_thread.start()

    def _process_queue(self):
        while True:
            try:
                self._process_batch()
            except Exception:
                pass
            time.sleep(0.1)

    def _process_batch(self):
        batch = []
        with self._rw_lock:
            self._queue.sort(key=lambda m: self._priority_weight(m.priority))
            to_process = min(len(self._queue), 50)
            for _ in range(to_process):
                if self._queue:
                    msg = self._queue.pop(0)
                    batch.append(msg)
                    self._processing[msg.message_id] = msg

        for msg in batch:
            try:
                self._dispatch_message(msg)
            except Exception:
                pass
            finally:
                with self._rw_lock:
                    self._processing.pop(msg.message_id, None)
                    self._delivered.append(msg)
                    if len(self._delivered) > 500:
                        self._delivered = self._delivered[-500:]

    def _priority_weight(self, priority: SignalingPriority) -> int:
        return {
            SignalingPriority.CRITICAL: 0,
            SignalingPriority.HIGH: 1,
            SignalingPriority.NORMAL: 2,
            SignalingPriority.LOW: 3,
        }.get(priority, 2)

    def _dispatch_message(self, msg: SignalingMessage):
        self._cache.set(
            f"signaling:{msg.message_id}",
            msg.model_dump(),
            category="signaling",
        )
        handlers = self._downlink_handlers if msg.direction == SignalingDirection.DOWNLINK else self._uplink_handlers
        for sat_id, handler in handlers.items():
            if sat_id == msg.satellite_id or sat_id == "*":
                try:
                    handler(msg)
                except Exception:
                    pass

    def receive_message(self, message: SignalingMessage) -> Dict:
        with self._rw_lock:
            self._queue.append(message)
        self._cache.set(
            f"signaling:received:{message.message_id}",
            message.model_dump(),
            category="signaling",
        )
        return {
            "message_id": message.message_id,
            "queued": True,
            "queue_position": len(self._queue),
            "estimated_processing_ms": len(self._queue) * 50,
        }

    def send_message(self, message: SignalingMessage) -> Dict:
        self._cache.set(
            f"signaling:sent:{message.message_id}",
            message.model_dump(),
            category="signaling",
        )
        self._dispatch_message(message)
        with self._rw_lock:
            self._delivered.append(message)
            if len(self._delivered) > 500:
                self._delivered = self._delivered[-500:]
        return {
            "message_id": message.message_id,
            "delivered": True,
            "timestamp": datetime.utcnow().isoformat(),
        }

    def register_uplink_handler(
        self, satellite_id: str, handler: Callable
    ) -> None:
        with self._rw_lock:
            self._uplink_handlers[satellite_id] = handler

    def register_downlink_handler(
        self, satellite_id: str, handler: Callable
    ) -> None:
        with self._rw_lock:
            self._downlink_handlers[satellite_id] = handler

    def unregister_uplink_handler(self, satellite_id: str) -> bool:
        with self._rw_lock:
            return self._uplink_handlers.pop(satellite_id, None) is not None

    def unregister_downlink_handler(self, satellite_id: str) -> bool:
        with self._rw_lock:
            return self._downlink_handlers.pop(satellite_id, None) is not None

    def get_message_status(self, message_id: str) -> Optional[Dict]:
        cached = self._cache.get(f"signaling:{message_id}")
        if cached:
            return cached
        with self._rw_lock:
            if message_id in self._processing:
                return {
                    "message_id": message_id,
                    "status": "processing",
                    "data": self._processing[message_id].model_dump(),
                }
            for msg in self._queue:
                if msg.message_id == message_id:
                    return {
                        "message_id": message_id,
                        "status": "queued",
                        "position": self._queue.index(msg),
                        "data": msg.model_dump(),
                    }
            for msg in self._delivered:
                if msg.message_id == message_id:
                    return {
                        "message_id": message_id,
                        "status": "delivered",
                        "data": msg.model_dump(),
                    }
        return None

    def list_queued_messages(self) -> List[Dict]:
        with self._rw_lock:
            return [m.model_dump() for m in self._queue]

    def list_processing_messages(self) -> List[Dict]:
        with self._rw_lock:
            return [m.model_dump() for m in self._processing.values()]

    def get_queue_stats(self) -> Dict:
        with self._rw_lock:
            return {
                "queued": len(self._queue),
                "processing": len(self._processing),
                "delivered_recent": len(self._delivered),
                "total_handlers": len(self._uplink_handlers) + len(self._downlink_handlers),
                "uplink_handlers": list(self._uplink_handlers.keys()),
                "downlink_handlers": list(self._downlink_handlers.keys()),
            }

    def flush_queue(self) -> int:
        with self._rw_lock:
            count = len(self._queue)
            self._queue.clear()
            return count


_signaling_manager_instance: Optional[SignalingManager] = None


def get_signaling_manager() -> SignalingManager:
    global _signaling_manager_instance
    if _signaling_manager_instance is None:
        _signaling_manager_instance = SignalingManager()
    return _signaling_manager_instance