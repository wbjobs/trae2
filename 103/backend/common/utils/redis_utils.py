"""
Redis 工具函数
"""
from django.core.cache import cache
from django.conf import settings
import json
import time
import uuid


class RedisLock:
    def __init__(self, lock_key, expire=60):
        self.lock_key = lock_key
        self.expire = expire
        self.lock_value = str(uuid.uuid4())
        self.acquired = False

    def acquire(self, timeout=10):
        end_time = time.time() + timeout
        while time.time() < end_time:
            if cache.add(self.lock_key, self.lock_value, self.expire):
                self.acquired = True
                return True
            time.sleep(0.1)
        return False

    def release(self):
        if self.acquired:
            current_value = cache.get(self.lock_key)
            if current_value == self.lock_value:
                cache.delete(self.lock_key)
            self.acquired = False

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()


def get_cache(key, default=None):
    value = cache.get(key)
    if value is not None:
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return value
    return default


def set_cache(key, value, timeout=None):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    cache.set(key, value, timeout)


def delete_cache(key):
    cache.delete(key)


def delete_pattern(pattern):
    cache.delete_pattern(pattern)


def cache_key_exists(key):
    return cache.has_key(key)


def increment(key, delta=1):
    return cache.incr(key, delta)


def get_or_set(key, func, timeout=None):
    value = get_cache(key)
    if value is None:
        value = func()
        set_cache(key, value, timeout)
    return value
