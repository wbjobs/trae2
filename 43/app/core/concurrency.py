import asyncio
import logging
import time
from typing import Dict, Optional, Callable, Any, List
from dataclasses import dataclass, field
from enum import Enum
from collections import deque

logger = logging.getLogger(__name__)


class CircuitBreakerState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerStats:
    success_count: int = 0
    failure_count: int = 0
    timeout_count: int = 0
    last_state_change: float = 0.0
    consecutive_failures: int = 0


class CircuitBreaker:
    """
    熔断器模式实现
    保护下游服务免受过载影响，实现快速失败和自动恢复
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        success_threshold: int = 3,
        timeout_seconds: float = 30.0,
        recovery_timeout: float = 60.0,
    ):
        self.name = name
        self._state = CircuitBreakerState.CLOSED
        self._stats = CircuitBreakerStats(last_state_change=time.time())
        self._failure_threshold = failure_threshold
        self._success_threshold = success_threshold
        self._timeout_seconds = timeout_seconds
        self._recovery_timeout = recovery_timeout
        self._half_open_success = 0

    async def execute(
        self, func: Callable, *args, **kwargs
    ) -> Optional[Any]:
        if not self._can_execute():
            raise CircuitBreakerOpenError(
                f"Circuit breaker '{self.name}' is open"
            )

        start = time.time()
        try:
            result = await asyncio.wait_for(
                func(*args, **kwargs), timeout=self._timeout_seconds
            )
            self._on_success()
            return result
        except asyncio.TimeoutError:
            self._on_timeout()
            raise
        except Exception as e:
            self._on_failure()
            raise

    def _can_execute(self) -> bool:
        if self._state == CircuitBreakerState.CLOSED:
            return True

        if self._state == CircuitBreakerState.OPEN:
            elapsed = time.time() - self._stats.last_state_change
            if elapsed >= self._recovery_timeout:
                self._state = CircuitBreakerState.HALF_OPEN
                self._half_open_success = 0
                self._stats.last_state_change = time.time()
                logger.info(
                    "Circuit breaker '%s' transitioning to HALF_OPEN",
                    self.name,
                )
                return True
            return False

        return True

    def _on_success(self):
        self._stats.success_count += 1
        self._stats.consecutive_failures = 0

        if self._state == CircuitBreakerState.HALF_OPEN:
            self._half_open_success += 1
            if self._half_open_success >= self._success_threshold:
                self._state = CircuitBreakerState.CLOSED
                self._stats.last_state_change = time.time()
                logger.info(
                    "Circuit breaker '%s' closed after %d successes",
                    self.name,
                    self._half_open_success,
                )

    def _on_failure(self):
        self._stats.failure_count += 1
        self._stats.consecutive_failures += 1

        if self._state == CircuitBreakerState.CLOSED:
            if self._stats.consecutive_failures >= self._failure_threshold:
                self._open_circuit("failure")
        elif self._state == CircuitBreakerState.HALF_OPEN:
            self._open_circuit("half_open_failure")

    def _on_timeout(self):
        self._stats.timeout_count += 1
        self._stats.consecutive_failures += 1

        if self._state == CircuitBreakerState.CLOSED:
            if self._stats.consecutive_failures >= self._failure_threshold:
                self._open_circuit("timeout")
        elif self._state == CircuitBreakerState.HALF_OPEN:
            self._open_circuit("half_open_timeout")

    def _open_circuit(self, reason: str):
        self._state = CircuitBreakerState.OPEN
        self._stats.last_state_change = time.time()
        self._half_open_success = 0
        logger.warning(
            "Circuit breaker '%s' OPENED due to %s (consecutive failures: %d)",
            self.name,
            reason,
            self._stats.consecutive_failures,
        )

    def get_state(self) -> Dict:
        return {
            "name": self.name,
            "state": self._state.value,
            "stats": {
                "success_count": self._stats.success_count,
                "failure_count": self._stats.failure_count,
                "timeout_count": self._stats.timeout_count,
                "consecutive_failures": self._stats.consecutive_failures,
            },
            "config": {
                "failure_threshold": self._failure_threshold,
                "success_threshold": self._success_threshold,
                "timeout_seconds": self._timeout_seconds,
                "recovery_timeout": self._recovery_timeout,
            },
        }


class CircuitBreakerOpenError(Exception):
    pass


@dataclass
class PooledConnection:
    id: str
    created_at: float
    last_used: float
    in_use: bool = False
    user_data: Any = None


class ConnectionPool:
    """
    通用连接池实现
    管理数据库、缓存等外部资源的连接，提高并发访问效率
    """

    def __init__(
        self,
        name: str,
        max_size: int = 10,
        min_idle: int = 2,
        max_idle_time: float = 300.0,
        create_factory: Optional[Callable] = None,
        destroy_factory: Optional[Callable] = None,
    ):
        self.name = name
        self._max_size = max_size
        self._min_idle = min_idle
        self._max_idle_time = max_idle_time
        self._create_factory = create_factory
        self._destroy_factory = destroy_factory
        self._connections: deque = deque()
        self._lock = asyncio.Lock()
        self._condition = asyncio.Condition(self._lock)
        self._total_created = 0
        self._total_destroyed = 0

    async def initialize(self):
        async with self._lock:
            for _ in range(self._min_idle):
                await self._create_connection()

    async def _create_connection(self) -> PooledConnection:
        conn = PooledConnection(
            id=f"conn_{self.name}_{self._total_created}",
            created_at=time.time(),
            last_used=time.time(),
        )
        if self._create_factory:
            conn.user_data = await self._create_factory()
        self._connections.append(conn)
        self._total_created += 1
        return conn

    async def acquire(self, timeout: float = 10.0) -> Optional[PooledConnection]:
        async with self._condition:
            start = time.time()
            while time.time() - start < timeout:
                for conn in self._connections:
                    if not conn.in_use:
                        conn.in_use = True
                        conn.last_used = time.time()
                        return conn

                if len(self._connections) < self._max_size:
                    conn = await self._create_connection()
                    conn.in_use = True
                    return conn

                await self._condition.wait()

            raise ConnectionPoolTimeoutError(
                f"Connection pool '{self.name}' timeout after {timeout}s"
            )

    async def release(self, conn: PooledConnection):
        async with self._condition:
            conn.in_use = False
            conn.last_used = time.time()
            self._condition.notify()

    async def cleanup(self):
        async with self._lock:
            now = time.time()
            to_remove = []

            for conn in self._connections:
                if not conn.in_use:
                    idle_time = now - conn.last_used
                    if idle_time > self._max_idle_time:
                        to_remove.append(conn)

            for conn in to_remove:
                if self._destroy_factory:
                    try:
                        await self._destroy_factory(conn.user_data)
                    except Exception as e:
                        logger.error("Destroy connection failed: %s", e)
                self._connections.remove(conn)
                self._total_destroyed += 1

            logger.info(
                "Connection pool '%s' cleanup: removed %d connections",
                self.name,
                len(to_remove),
            )

    def get_stats(self) -> Dict:
        in_use = sum(1 for c in self._connections if c.in_use)
        idle = len(self._connections) - in_use
        return {
            "name": self.name,
            "total_connections": len(self._connections),
            "in_use": in_use,
            "idle": idle,
            "max_size": self._max_size,
            "min_idle": self._min_idle,
            "total_created": self._total_created,
            "total_destroyed": self._total_destroyed,
            "utilization": in_use / self._max_size if self._max_size > 0 else 0,
        }


class ConnectionPoolTimeoutError(Exception):
    pass


class BoundedSemaphore:
    """
    有界信号量
    限制并发请求数量，防止系统过载
    """

    def __init__(self, max_concurrent: int, name: str = ""):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max_concurrent = max_concurrent
        self._name = name
        self._wait_time = deque(maxlen=100)
        self._acquired = 0
        self._released = 0

    async def acquire(self, timeout: float = 5.0) -> bool:
        start = time.time()
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=timeout)
            wait_time = time.time() - start
            self._wait_time.append(wait_time)
            self._acquired += 1
            return True
        except asyncio.TimeoutError:
            return False

    def release(self):
        self._semaphore.release()
        self._released += 1

    def get_stats(self) -> Dict:
        avg_wait = sum(self._wait_time) / len(self._wait_time) if self._wait_time else 0
        return {
            "name": self._name,
            "max_concurrent": self._max_concurrent,
            "current_value": self._semaphore._value,
            "total_acquired": self._acquired,
            "total_released": self._released,
            "avg_wait_time_ms": avg_wait * 1000,
            "utilization": (
                (self._max_concurrent - self._semaphore._value) / self._max_concurrent
                if self._max_concurrent > 0
                else 0
            ),
        }


class ConcurrencyManager:
    """
    并发管理器
    统一管理熔断器、连接池、并发限制等并发控制组件
    """

    def __init__(self):
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        self._connection_pools: Dict[str, ConnectionPool] = {}
        self._semaphores: Dict[str, BoundedSemaphore] = {}
        self._initialized = False

    async def initialize(self):
        self._initialized = True
        logger.info("Concurrency manager initialized")

    def get_or_create_circuit_breaker(
        self,
        name: str,
        failure_threshold: int = 5,
        success_threshold: int = 3,
        timeout_seconds: float = 30.0,
        recovery_timeout: float = 60.0,
    ) -> CircuitBreaker:
        if name not in self._circuit_breakers:
            self._circuit_breakers[name] = CircuitBreaker(
                name=name,
                failure_threshold=failure_threshold,
                success_threshold=success_threshold,
                timeout_seconds=timeout_seconds,
                recovery_timeout=recovery_timeout,
            )
        return self._circuit_breakers[name]

    async def create_connection_pool(
        self,
        name: str,
        max_size: int = 10,
        min_idle: int = 2,
        max_idle_time: float = 300.0,
        create_factory: Optional[Callable] = None,
        destroy_factory: Optional[Callable] = None,
    ) -> ConnectionPool:
        if name in self._connection_pools:
            return self._connection_pools[name]

        pool = ConnectionPool(
            name=name,
            max_size=max_size,
            min_idle=min_idle,
            max_idle_time=max_idle_time,
            create_factory=create_factory,
            destroy_factory=destroy_factory,
        )
        await pool.initialize()
        self._connection_pools[name] = pool
        return pool

    def get_or_create_semaphore(
        self, name: str, max_concurrent: int
    ) -> BoundedSemaphore:
        if name not in self._semaphores:
            self._semaphores[name] = BoundedSemaphore(max_concurrent, name)
        return self._semaphores[name]

    def get_all_stats(self) -> Dict:
        return {
            "circuit_breakers": {
                name: cb.get_state() for name, cb in self._circuit_breakers.items()
            },
            "connection_pools": {
                name: pool.get_stats() for name, pool in self._connection_pools.items()
            },
            "semaphores": {
                name: sem.get_stats() for name, sem in self._semaphores.items()
            },
        }