"""公共工具模块 - 精简冗余代码，提供通用功能"""
from __future__ import annotations

import logging
import re
import sys
import time
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar

from colorama import Fore, Style

logger = logging.getLogger(__name__)

T = TypeVar("T")


class StatusLevel:
    """状态级别常量"""
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    UNKNOWN = "UNKNOWN"


def get_status_level(
    value: float,
    warning_threshold: float,
    critical_threshold: float,
) -> str:
    """根据阈值确定状态级别

    Args:
        value: 当前值
        warning_threshold: 警告阈值
        critical_threshold: 严重阈值

    Returns:
        状态级别字符串
    """
    if value >= critical_threshold:
        return StatusLevel.CRITICAL
    elif value >= warning_threshold:
        return StatusLevel.WARNING
    return StatusLevel.NORMAL


def format_bytes(bytes_value: float) -> str:
    """格式化字节数为人类可读格式

    Args:
        bytes_value: 字节数

    Returns:
        格式化后的字符串
    """
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if bytes_value < 1024:
            return f"{bytes_value:.2f} {unit}"
        bytes_value /= 1024
    return f"{bytes_value:.2f} PB"


def format_percent(value: float) -> str:
    """格式化百分比

    Args:
        value: 百分比值

    Returns:
        格式化后的字符串
    """
    return f"{value:.1f}%"


def format_duration(seconds: float) -> str:
    """格式化时间长度

    Args:
        seconds: 秒数

    Returns:
        格式化后的时间字符串
    """
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{seconds / 60:.1f}m"
    else:
        return f"{seconds / 3600:.1f}h"


def safe_float(value: Any, default: float = 0.0) -> float:
    """安全转换为 float

    Args:
        value: 要转换的值
        default: 默认值

    Returns:
        转换后的 float 值
    """
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    """安全转换为 int

    Args:
        value: 要转换的值
        default: 默认值

    Returns:
        转换后的 int 值
    """
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_kv_output(output: str, separator: str = ":") -> Dict[str, str]:
    """解析键值对输出

    Args:
        output: 输出内容
        separator: 分隔符

    Returns:
        解析后的字典
    """
    result: Dict[str, str] = {}
    for line in output.strip().split("\n"):
        if separator in line:
            key, value = line.split(separator, 1)
            result[key.strip()] = value.strip()
    return result


def parse_table_output(output: str, header_sep: Optional[str] = None) -> List[Dict[str, str]]:
    """解析表格格式输出

    Args:
        output: 输出内容
        header_sep: 表头分隔符（如 "---"）

    Returns:
        解析后的字典列表
    """
    lines = [line for line in output.strip().split("\n") if line.strip()]
    if not lines:
        return []

    if header_sep:
        lines = [l for l in lines if header_sep not in l]

    if len(lines) < 2:
        return []

    headers = re.split(r"\s{2,}", lines[0].strip())
    result = []

    for line in lines[1:]:
        values = re.split(r"\s{2,}", line.strip())
        if len(values) >= len(headers):
            row = {headers[i]: values[i] for i in range(len(headers))}
            result.append(row)

    return result


def chunk_list(items: List[T], chunk_size: int) -> List[List[T]]:
    """将列表分块

    Args:
        items: 源列表
        chunk_size: 每块大小

    Returns:
        分块后的列表
    """
    return [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]


class SimpleProgress:
    """简单进度指示器"""

    def __init__(self, total: int, description: str = "处理中"):
        self.total = total
        self.current = 0
        self.description = description
        self.start_time = time.time()
        self.last_update = 0

    def update(self, n: int = 1):
        """更新进度"""
        self.current += n
        current_time = time.time()

        if current_time - self.last_update > 0.5 or self.current >= self.total:
            self._print_progress()
            self.last_update = current_time

    def _print_progress(self):
        """打印进度"""
        elapsed = time.time() - self.start_time
        percent = (self.current / self.total) * 100 if self.total > 0 else 0

        bar_length = 30
        filled = int(bar_length * self.current / self.total) if self.total > 0 else 0
        bar = "█" * filled + "░" * (bar_length - filled)

        sys.stdout.write(
            f"\r{self.description}: |{bar}| "
            f"{self.current}/{self.total} ({percent:.1f}%) "
            f"耗时: {elapsed:.1f}s"
        )
        sys.stdout.flush()

        if self.current >= self.total:
            print()

    def finish(self):
        """完成进度"""
        self.current = self.total
        self._print_progress()


def print_banner(title: str, version: str = ""):
    """打印工具横幅"""
    border = "═" * 60
    title_line = f"║           {title} v{version}                    ║" if version else f"║           {title}                    ║"

    print(f"\n╔{border}╗")
    print(title_line)
    print(f"║           Container Cluster Inspector                        ║")
    print(f"╚{border}╝\n")


def print_status_icon(level: str) -> str:
    """获取状态图标"""
    icons = {
        "NORMAL": f"{Fore.GREEN}✓{Style.RESET_ALL}",
        "WARNING": f"{Fore.YELLOW}⚠{Style.RESET_ALL}",
        "CRITICAL": f"{Fore.RED}✗{Style.RESET_ALL}",
        "UNKNOWN": f"{Fore.LIGHTBLACK_EX}?{Style.RESET_ALL}",
    }
    return icons.get(level, icons["UNKNOWN"])


def format_status_text(level: str) -> str:
    """格式化状态文本"""
    colors = {
        "NORMAL": Fore.GREEN,
        "WARNING": Fore.YELLOW,
        "CRITICAL": Fore.RED,
        "UNKNOWN": Fore.LIGHTBLACK_EX,
    }
    color = colors.get(level, Fore.LIGHTBLACK_EX)
    return f"{color}{level}{Style.RESET_ALL}"


class RetryHelper:
    """重试辅助类"""

    @staticmethod
    def retry(
        func: Callable[..., T],
        max_retries: int = 3,
        delay: float = 1.0,
        backoff: float = 2.0,
        exceptions: Tuple[Type[Exception], ...] = (Exception,),
    ) -> T:
        """重试执行函数

        Args:
            func: 要执行的函数
            max_retries: 最大重试次数
            delay: 初始延迟（秒）
            backoff: 退避乘数
            exceptions: 需要重试的异常类型

        Returns:
            函数执行结果
        """
        last_exception: Optional[Exception] = None

        for attempt in range(max_retries + 1):
            try:
                return func()
            except exceptions as e:
                last_exception = e
                if attempt < max_retries:
                    sleep_time = delay * (backoff ** attempt)
                    logger.debug(
                        f"第 {attempt + 1}/{max_retries} 次尝试失败, "
                        f"{sleep_time:.1f}s 后重试: {e}"
                    )
                    time.sleep(sleep_time)
                else:
                    logger.debug(f"所有重试失败: {e}")

        if last_exception:
            raise last_exception

        raise RuntimeError("Unexpected error in retry helper")

    @staticmethod
    def retry_decorator(
        max_retries: int = 3,
        delay: float = 1.0,
        backoff: float = 2.0,
        exceptions: Tuple[Type[Exception], ...] = (Exception,),
    ):
        """重试装饰器"""
        def decorator(func: Callable[..., T]) -> Callable[..., T]:
            def wrapper(*args, **kwargs) -> T:
                return RetryHelper.retry(
                    lambda: func(*args, **kwargs),
                    max_retries=max_retries,
                    delay=delay,
                    backoff=backoff,
                    exceptions=exceptions,
                )
            return wrapper
        return decorator


class TimingContext:
    """计时上下文管理器"""

    def __init__(self, name: str = "操作"):
        self.name = name
        self.start_time: float = 0.0
        self.end_time: float = 0.0

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.time()
        duration = self.end_time - self.start_time
        logger.debug(f"{self.name} 耗时: {duration:.3f}s")

    @property
    def duration(self) -> float:
        """获取持续时间"""
        if self.end_time == 0:
            return time.time() - self.start_time
        return self.end_time - self.start_time


def now_str() -> str:
    """获取当前时间字符串"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def safe_filename(filename: str) -> str:
    """生成安全的文件名"""
    return re.sub(r'[<>:"/\\|?*]', "_", filename)
