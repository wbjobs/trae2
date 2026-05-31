import time
import hashlib
import json
from typing import Any, Dict, Optional
from datetime import datetime, timedelta
from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity: int = 100, ttl_seconds: int = 300):
        self.capacity = capacity
        self.ttl_seconds = ttl_seconds
        self.cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        if key not in self.cache:
            return None
        
        value, expire_time = self.cache[key]
        
        if time.time() > expire_time:
            del self.cache[key]
            return None
        
        self.cache.move_to_end(key)
        return value

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None):
        ttl = ttl_seconds or self.ttl_seconds
        expire_time = time.time() + ttl
        
        if key in self.cache:
            self.cache.move_to_end(key)
        elif len(self.cache) >= self.capacity:
            self.cache.popitem(last=False)
        
        self.cache[key] = (value, expire_time)

    def delete(self, key: str):
        if key in self.cache:
            del self.cache[key]

    def clear(self):
        self.cache.clear()

    def __len__(self) -> int:
        return len(self.cache)


def generate_cache_key(prefix: str, **kwargs) -> str:
    sorted_kwargs = sorted(kwargs.items())
    key_string = f"{prefix}:{json.dumps(sorted_kwargs, sort_keys=True)}"
    return hashlib.md5(key_string.encode()).hexdigest()


query_cache = LRUCache(capacity=200, ttl_seconds=60)
metrics_cache = LRUCache(capacity=100, ttl_seconds=120)
dashboard_cache = LRUCache(capacity=50, ttl_seconds=30)
