import time
import logging
import asyncio
from collections import defaultdict, deque
from typing import Dict, Optional, Tuple
from dataclasses import dataclass, field

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class TokenBucket:
    rate: float
    capacity: int
    tokens: float
    last_refill: float
    burst_allowance: int = 0


@dataclass
class SlidingWindowState:
    timestamps: deque = field(default_factory=deque)
    last_check: float = 0.0


class HybridRateLimiter:
    """
    混合限流算法：令牌桶 + 滑动窗口
    - 令牌桶：控制平均速率，允许一定程度的突发流量
    - 滑动窗口：控制短时间内的最大请求量，防止尖峰攻击
    """

    def __init__(self):
        self._token_buckets: Dict[str, TokenBucket] = {}
        self._sliding_windows: Dict[str, SlidingWindowState] = defaultdict(
            SlidingWindowState
        )
        self._device_limits: Dict[str, dict] = {}
        self._default_limits = {
            "rate_per_second": 5.0,
            "burst_capacity": 50,
            "window_limit": 100,
            "window_seconds": 60,
        }
        self._lock = asyncio.Lock()
        self._last_cleanup = time.time()
        self._cleanup_interval = 300

    def _get_limits(self, key: str) -> dict:
        if key in self._device_limits:
            return self._device_limits[key]
        base = settings.RATE_LIMIT_PER_MINUTE
        return {
            "rate_per_second": base / 60.0,
            "burst_capacity": base // 2,
            "window_limit": base,
            "window_seconds": 60,
        }

    async def _refill_bucket(self, key: str, limits: dict, now: float):
        bucket = self._token_buckets.get(key)
        if not bucket:
            bucket = TokenBucket(
                rate=limits["rate_per_second"],
                capacity=limits["burst_capacity"],
                tokens=limits["burst_capacity"],
                last_refill=now,
                burst_allowance=limits["burst_capacity"] // 2,
            )
            self._token_buckets[key] = bucket
            return

        elapsed = now - bucket.last_refill
        if elapsed > 0:
            bucket.tokens = min(
                bucket.capacity, bucket.tokens + elapsed * bucket.rate
            )
            bucket.last_refill = now

    async def _check_sliding_window(
        self, key: str, limits: dict, now: float
    ) -> Tuple[bool, int]:
        window = self._sliding_windows[key]
        window_start = now - limits["window_seconds"]

        while window.timestamps and window.timestamps[0] < window_start:
            window.timestamps.popleft()

        current_count = len(window.timestamps)

        if current_count >= limits["window_limit"]:
            oldest = window.timestamps[0] if window.timestamps else now
            retry_after = limits["window_seconds"] - (now - oldest)
            return False, retry_after

        return True, 0

    async def is_allowed(self, key: str, limit: Optional[int] = None) -> tuple:
        async with self._lock:
            await self._maybe_cleanup()

            limits = self._get_limits(key)
            if limit:
                limits = {
                    "rate_per_second": limit / 60.0,
                    "burst_capacity": limit // 2,
                    "window_limit": limit,
                    "window_seconds": 60,
                }

            now = time.time()

            await self._refill_bucket(key, limits, now)

            bucket = self._token_buckets[key]
            window_allowed, retry_after = await self._check_sliding_window(
                key, limits, now
            )

            if not window_allowed:
                window = self._sliding_windows[key]
                current_count = len(window.timestamps)
                logger.warning(
                    "Sliding window limit exceeded for %s: %d/%d",
                    key,
                    current_count,
                    limits["window_limit"],
                )
                return False, current_count, limits["window_limit"], retry_after

            if bucket.tokens < 1.0:
                retry_after = (1.0 - bucket.tokens) / bucket.rate
                logger.warning(
                    "Token bucket exhausted for %s: %.1f/%d",
                    key,
                    bucket.tokens,
                    bucket.capacity,
                )
                current_count = len(self._sliding_windows[key].timestamps)
                return False, current_count, limits["window_limit"], retry_after

            bucket.tokens -= 1.0
            self._sliding_windows[key].timestamps.append(now)

            current_count = len(self._sliding_windows[key].timestamps)
            return True, current_count, limits["window_limit"], 0

    async def is_allowed_batch(self, key: str, count: int) -> tuple:
        async with self._lock:
            await self._maybe_cleanup()

            limits = self._get_limits(key)
            now = time.time()

            await self._refill_bucket(key, limits, now)
            bucket = self._token_buckets[key]

            window_allowed, _ = await self._check_sliding_window(key, limits, now)

            effective_count = min(count, limits["window_limit"] // 10)

            if not window_allowed:
                return False, 0, limits["window_limit"], 60

            if bucket.tokens < effective_count:
                retry_after = (effective_count - bucket.tokens) / bucket.rate
                return False, 0, limits["window_limit"], retry_after

            bucket.tokens -= effective_count
            for _ in range(effective_count):
                self._sliding_windows[key].timestamps.append(now)

            current_count = len(self._sliding_windows[key].timestamps)
            return True, current_count, limits["window_limit"], 0

    async def _maybe_cleanup(self):
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return

        self._last_cleanup = now
        expired_keys = []

        for key, bucket in self._token_buckets.items():
            if now - bucket.last_refill > 3600:
                expired_keys.append(key)

        for key in expired_keys:
            del self._token_buckets[key]
            if key in self._sliding_windows:
                del self._sliding_windows[key]

        logger.info("Cleanup: removed %d expired rate limiter entries", len(expired_keys))

    def set_device_limit(
        self,
        device_id: str,
        rate_per_second: Optional[float] = None,
        burst_capacity: Optional[int] = None,
        window_limit: Optional[int] = None,
        window_seconds: int = 60,
    ):
        current = self._device_limits.get(device_id, self._default_limits.copy())
        if rate_per_second is not None:
            current["rate_per_second"] = rate_per_second
        if burst_capacity is not None:
            current["burst_capacity"] = burst_capacity
        if window_limit is not None:
            current["window_limit"] = window_limit
        current["window_seconds"] = window_seconds
        self._device_limits[device_id] = current
        logger.info("Updated rate limit for device %s: %s", device_id, current)

    def get_status(self) -> dict:
        return {
            "algorithm": "hybrid_token_bucket_sliding_window",
            "default_limits": self._default_limits,
            "tracked_keys": len(self._token_buckets),
            "device_overrides": len(self._device_limits),
        }

    def get_key_status(self, key: str) -> dict:
        bucket = self._token_buckets.get(key)
        window = self._sliding_windows.get(key)
        limits = self._get_limits(key)

        return {
            "key": key,
            "limits": limits,
            "token_bucket": {
                "tokens": bucket.tokens if bucket else 0,
                "capacity": bucket.capacity if bucket else 0,
                "rate": bucket.rate if bucket else 0,
            },
            "sliding_window": {
                "current_count": len(window.timestamps) if window else 0,
                "limit": limits["window_limit"],
            },
        }


class RateLimiter:
    """
    限流中间件（向后兼容版本）
    内部使用 HybridRateLimiter 实现
    """

    def __init__(self):
        self._hybrid = HybridRateLimiter()

    def is_allowed(self, key: str, limit: Optional[int] = None) -> tuple:
        return asyncio.get_event_loop().run_until_complete(
            self._hybrid.is_allowed(key, limit)
        )

    async def is_allowed_async(self, key: str, limit: Optional[int] = None) -> tuple:
        return await self._hybrid.is_allowed(key, limit)

    async def is_allowed_batch(self, key: str, count: int) -> tuple:
        return await self._hybrid.is_allowed_batch(key, count)

    def set_device_limit(
        self,
        device_id: str,
        rate_per_second: Optional[float] = None,
        burst_capacity: Optional[int] = None,
        window_limit: Optional[int] = None,
        window_seconds: int = 60,
    ):
        self._hybrid.set_device_limit(
            device_id, rate_per_second, burst_capacity, window_limit, window_seconds
        )

    def get_status(self) -> dict:
        return self._hybrid.get_status()

    def get_key_status(self, key: str) -> dict:
        return self._hybrid.get_key_status(key)

    def cleanup(self):
        pass