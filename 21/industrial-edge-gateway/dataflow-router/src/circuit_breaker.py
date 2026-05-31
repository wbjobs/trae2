"""
数据流异常熔断器 (Circuit Breaker)
实现熔断模式，保护系统免受持续故障的影响
"""
import threading
import time
from enum import Enum
from typing import Any, Callable, Dict, Optional
from shared.src.logger import get_logger

logger = get_logger("circuit_breaker")


class CircuitState(Enum):
    """熔断器状态"""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """
    熔断器实现
    
    状态转换:
    - CLOSED: 正常运行，允许请求通过
    - OPEN: 故障阈值触发，拒绝所有请求
    - HALF_OPEN: 冷却时间过后，允许少量请求探测
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
        success_threshold: int = 2,
    ):
        """
        初始化熔断器
        
        Args:
            name: 熔断器名称
            failure_threshold: 连续失败次数阈值，超过则熔断
            recovery_timeout: 熔断后恢复等待时间（秒）
            half_open_max_calls: 半开状态允许的最大请求数
            success_threshold: 半开状态下需要的连续成功次数以恢复闭合
        """
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.success_threshold = success_threshold
        
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        self._open_timestamp: Optional[float] = None
        self._lock = threading.RLock()
        
        self._on_open: Optional[Callable] = None
        self._on_half_open: Optional[Callable] = None
        self._on_close: Optional[Callable] = None

    @property
    def state(self) -> CircuitState:
        """获取当前状态"""
        with self._lock:
            return self._state

    @property
    def is_open(self) -> bool:
        """是否处于熔断状态"""
        return self.state == CircuitState.OPEN

    @property
    def is_closed(self) -> bool:
        """是否处于闭合状态"""
        return self.state == CircuitState.CLOSED

    @property
    def is_half_open(self) -> bool:
        """是否处于半开状态"""
        return self.state == CircuitState.HALF_OPEN

    def can_execute(self) -> bool:
        """判断是否可以执行请求"""
        with self._lock:
            if self._state == CircuitState.CLOSED:
                return True
            
            if self._state == CircuitState.OPEN:
                if self._open_timestamp and (time.time() - self._open_timestamp) >= self.recovery_timeout:
                    self._transition_to_half_open()
                    return True
                return False
            
            if self._state == CircuitState.HALF_OPEN:
                if self._half_open_calls < self.half_open_max_calls:
                    return True
                return False
            
            return False

    def on_success(self):
        """记录成功执行"""
        with self._lock:
            if self._state == CircuitState.CLOSED:
                self._failure_count = 0
            elif self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                self._half_open_calls += 1
                if self._success_count >= self.success_threshold:
                    self._transition_to_closed()

    def on_failure(self, error: Optional[Exception] = None):
        """记录执行失败"""
        with self._lock:
            if self._state == CircuitState.CLOSED:
                self._failure_count += 1
                logger.warning(f"熔断器 [{self.name}] 失败计数: {self._failure_count}/{self.failure_threshold}")
                if self._failure_count >= self.failure_threshold:
                    self._transition_to_open(error)
            elif self._state == CircuitState.HALF_OPEN:
                self._half_open_calls += 1
                logger.warning(f"熔断器 [{self.name}] 半开状态下失败，重新熔断")
                self._transition_to_open(error)

    def reset(self):
        """重置熔断器状态"""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._half_open_calls = 0
            self._open_timestamp = None
            logger.info(f"熔断器 [{self.name}] 已重置")

    def force_open(self):
        """强制熔断"""
        with self._lock:
            self._transition_to_open(None)

    def force_close(self):
        """强制闭合"""
        with self._lock:
            self._transition_to_closed()

    def get_metrics(self) -> Dict[str, Any]:
        """获取熔断器指标"""
        with self._lock:
            return {
                "name": self.name,
                "state": self._state.value,
                "failure_count": self._failure_count,
                "success_count": self._success_count,
                "half_open_calls": self._half_open_calls,
                "failure_threshold": self.failure_threshold,
                "recovery_timeout": self.recovery_timeout,
                "open_timestamp": self._open_timestamp,
                "time_until_recovery": max(0, self.recovery_timeout - (time.time() - self._open_timestamp)) if self._open_timestamp else 0,
            }

    def _transition_to_open(self, error: Optional[Exception]):
        """转换到熔断状态"""
        self._state = CircuitState.OPEN
        self._open_timestamp = time.time()
        self._success_count = 0
        self._half_open_calls = 0
        logger.warning(f"熔断器 [{self.name}] 已熔断! 失败次数: {self._failure_count}, 错误: {error}")
        if self._on_open:
            try:
                self._on_open(self)
            except Exception as e:
                logger.error(f"执行熔断回调失败: {e}")

    def _transition_to_half_open(self):
        """转换到半开状态"""
        self._state = CircuitState.HALF_OPEN
        self._success_count = 0
        self._half_open_calls = 0
        logger.info(f"熔断器 [{self.name}] 进入半开状态，开始探测")
        if self._on_half_open:
            try:
                self._on_half_open(self)
            except Exception as e:
                logger.error(f"执行半开回调失败: {e}")

    def _transition_to_closed(self):
        """转换到闭合状态"""
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        self._open_timestamp = None
        logger.info(f"熔断器 [{self.name}] 已恢复闭合状态")
        if self._on_close:
            try:
                self._on_close(self)
            except Exception as e:
                logger.error(f"执行闭合回调失败: {e}")

    def set_callbacks(
        self,
        on_open: Optional[Callable] = None,
        on_half_open: Optional[Callable] = None,
        on_close: Optional[Callable] = None,
    ):
        """设置状态变化回调"""
        self._on_open = on_open
        self._on_half_open = on_half_open
        self._on_close = on_close

    def execute(self, func: Callable, *args, **kwargs) -> Any:
        """
        执行函数，自动应用熔断器逻辑
        
        Args:
            func: 要执行的函数
            *args: 函数参数
            **kwargs: 函数关键字参数
            
        Returns:
            函数执行结果
            
        Raises:
            CircuitBreakerOpenException: 熔断器已打开时抛出
            Exception: 函数执行失败时抛出原始异常
        """
        if not self.can_execute():
            raise CircuitBreakerOpenException(
                f"熔断器 [{self.name}] 已打开，拒绝请求。"
                f"预计 {max(0, self.recovery_timeout - (time.time() - self._open_timestamp)):.1f} 秒后恢复"
            )
        
        try:
            result = func(*args, **kwargs)
            self.on_success()
            return result
        except Exception as e:
            self.on_failure(e)
            raise


class CircuitBreakerOpenException(Exception):
    """熔断器已打开异常"""
    pass


class CircuitBreakerManager:
    """熔断器管理器 - 管理多个熔断器实例"""

    def __init__(self):
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        self._lock = threading.Lock()

    def get_or_create(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        **kwargs,
    ) -> CircuitBreaker:
        """获取或创建熔断器"""
        with self._lock:
            if name not in self._circuit_breakers:
                self._circuit_breakers[name] = CircuitBreaker(
                    name=name,
                    failure_threshold=failure_threshold,
                    recovery_timeout=recovery_timeout,
                    **kwargs,
                )
            return self._circuit_breakers[name]

    def get(self, name: str) -> Optional[CircuitBreaker]:
        """获取指定熔断器"""
        return self._circuit_breakers.get(name)

    def remove(self, name: str):
        """移除熔断器"""
        with self._lock:
            if name in self._circuit_breakers:
                del self._circuit_breakers[name]

    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """获取所有熔断器指标"""
        with self._lock:
            return {
                name: cb.get_metrics()
                for name, cb in self._circuit_breakers.items()
            }

    def reset_all(self):
        """重置所有熔断器"""
        with self._lock:
            for cb in self._circuit_breakers.values():
                cb.reset()
