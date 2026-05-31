import threading
import time
from typing import Any, Dict, Optional, List
from dataclasses import dataclass, field
from datetime import datetime

from config import get_config


@dataclass
class CacheEntry:
    key: str
    value: Any
    created_at: float = field(default_factory=time.time)
    expires_at: float = 0.0
    access_count: int = 0

    def is_expired(self) -> bool:
        if self.expires_at <= 0:
            return False
        return time.time() > self.expires_at

    def touch(self):
        self.access_count += 1


class MemoryCache:
    _instance: Optional["MemoryCache"] = None
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
        self._store: Dict[str, CacheEntry] = {}
        self._rw_lock = threading.RLock()
        self._config = get_config().cache
        self._cleanup_interval = 60.0
        self._last_cleanup = time.time()

    def _cleanup_expired(self):
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return
        self._last_cleanup = now
        with self._rw_lock:
            expired_keys = [
                k for k, v in self._store.items() if v.is_expired()
            ]
            for k in expired_keys:
                del self._store[k]

    def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        category: str = "general",
    ) -> None:
        self._cleanup_expired()
        category_ttl_map = {
            "task": self._config.task_ttl,
            "channel": self._config.channel_ttl,
            "signaling": self._config.signaling_ttl,
            "general": 3600,
        }
        effective_ttl = ttl if ttl is not None else category_ttl_map.get(category, 3600)
        with self._rw_lock:
            if len(self._store) >= self._config.max_entries:
                oldest_key = min(
                    self._store, key=lambda k: self._store[k].created_at
                )
                del self._store[oldest_key]
            expires_at = time.time() + effective_ttl if effective_ttl > 0 else 0.0
            self._store[key] = CacheEntry(
                key=key, value=value, expires_at=expires_at
            )

    def get(self, key: str, default: Any = None) -> Any:
        self._cleanup_expired()
        with self._rw_lock:
            entry = self._store.get(key)
            if entry is None:
                return default
            if entry.is_expired():
                del self._store[key]
                return default
            entry.touch()
            return entry.value

    def delete(self, key: str) -> bool:
        with self._rw_lock:
            if key in self._store:
                del self._store[key]
                return True
            return False

    def exists(self, key: str) -> bool:
        self._cleanup_expired()
        with self._rw_lock:
            return key in self._store and not self._store[key].is_expired()

    def keys_by_prefix(self, prefix: str) -> List[str]:
        self._cleanup_expired()
        with self._rw_lock:
            return [k for k in self._store if k.startswith(prefix)]

    def size(self) -> int:
        self._cleanup_expired()
        with self._rw_lock:
            return len(self._store)

    def clear(self) -> None:
        with self._rw_lock:
            self._store.clear()

    def stats(self) -> Dict[str, Any]:
        with self._rw_lock:
            total = len(self._store)
            expired = sum(1 for v in self._store.values() if v.is_expired())
            access_counts = [v.access_count for v in self._store.values()]
            return {
                "total_entries": total,
                "expired_entries": expired,
                "active_entries": total - expired,
                "max_entries": self._config.max_entries,
                "avg_access_count": (
                    sum(access_counts) / len(access_counts) if access_counts else 0
                ),
                "total_accesses": sum(access_counts),
            }


_cache_instance: Optional[MemoryCache] = None


def get_cache() -> MemoryCache:
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = MemoryCache()
    return _cache_instance