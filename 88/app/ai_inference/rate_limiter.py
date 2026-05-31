import asyncio
import time
from loguru import logger


class AdaptiveRateLimiter:
    def __init__(
        self,
        max_concurrency: int = 5,
        requests_per_minute: int = 30,
        burst_size: int = 10,
    ):
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._max_concurrency = max_concurrency
        self._rpm = requests_per_minute
        self._burst_size = burst_size
        self._tokens = float(burst_size)
        self._last_refill = time.monotonic()
        self._refill_rate = requests_per_minute / 60.0
        self._lock = asyncio.Lock()
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._backoff_factor = 1.0

    async def acquire(self):
        await self._semaphore.acquire()
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            self._tokens = min(self._burst_size, self._tokens + elapsed * self._refill_rate)
            self._last_refill = now

            if self._tokens < 1.0:
                wait_time = (1.0 - self._tokens) / self._refill_rate * self._backoff_factor
                logger.debug(f"Rate limiter: waiting {wait_time:.2f}s for token refill")
                await asyncio.sleep(wait_time)
                self._tokens = 0.0
            else:
                self._tokens -= 1.0

    def release(self):
        self._semaphore.release()

    def report_success(self):
        self._consecutive_failures = 0
        self._consecutive_successes += 1
        if self._consecutive_successes >= 5 and self._backoff_factor > 1.0:
            self._backoff_factor = max(1.0, self._backoff_factor * 0.8)
            self._consecutive_successes = 0
            logger.info(f"Rate limiter backoff reduced to {self._backoff_factor:.2f}")

    def report_failure(self, is_rate_limit: bool = False):
        self._consecutive_successes = 0
        self._consecutive_failures += 1
        if is_rate_limit or self._consecutive_failures >= 3:
            self._backoff_factor = min(8.0, self._backoff_factor * 2.0)
            self._consecutive_failures = 0
            logger.warning(f"Rate limiter backoff increased to {self._backoff_factor:.2f}")

    async def __aenter__(self):
        await self.acquire()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            is_rate_limit = "429" in str(exc_val) or "rate" in str(exc_val).lower()
            self.report_failure(is_rate_limit=is_rate_limit)
        else:
            self.report_success()
        self.release()
        return False


_rate_limiter: AdaptiveRateLimiter | None = None


def get_rate_limiter() -> AdaptiveRateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        from app.config import get_settings
        settings = get_settings()
        _rate_limiter = AdaptiveRateLimiter(
            max_concurrency=5,
            requests_per_minute=30,
            burst_size=10,
        )
    return _rate_limiter
