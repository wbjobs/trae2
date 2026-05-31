#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
工具函数模块
"""

import os
import sys
import logging
import hashlib
import signal
import threading
from typing import Callable, Optional


def setup_logging(level: str = 'INFO', log_file: str = None):
    log_level = getattr(logging, level.upper(), logging.INFO)
    
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    if log_file:
        try:
            log_dir = os.path.dirname(log_file)
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)
            
            file_handler = logging.FileHandler(log_file)
            file_handler.setFormatter(formatter)
            root_logger.addHandler(file_handler)
        except Exception as e:
            root_logger.warning(f"无法创建日志文件 {log_file}: {e}")


def signal_handler(signum, frame):
    logger = logging.getLogger(__name__)
    logger.info(f"收到信号 {signum}, 正在退出...")
    sys.exit(0)


def calculate_file_hash(file_path: str, algorithm: str = 'sha256') -> str:
    hash_obj = hashlib.new(algorithm)
    
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            hash_obj.update(chunk)
    
    return hash_obj.hexdigest()


def calculate_data_hash(data: bytes, algorithm: str = 'sha256') -> str:
    return hashlib.new(algorithm, data).hexdigest()


def get_file_size(file_path: str) -> int:
    return os.path.getsize(file_path)


def ensure_dir(directory: str):
    if not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)


class Timeout:
    def __init__(self, seconds: int, callback: Optional[Callable] = None):
        self.seconds = seconds
        self.callback = callback
        self._timer = None
        self._timed_out = False
    
    def __enter__(self):
        self._timer = threading.Timer(self.seconds, self._timeout_handler)
        self._timer.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._timer:
            self._timer.cancel()
        return False
    
    def _timeout_handler(self):
        self._timed_out = True
        if self.callback:
            self.callback()
    
    @property
    def timed_out(self) -> bool:
        return self._timed_out


class AtomicCounter:
    def __init__(self, initial: int = 0):
        self._value = initial
        self._lock = threading.Lock()
    
    def increment(self, amount: int = 1) -> int:
        with self._lock:
            self._value += amount
            return self._value
    
    def decrement(self, amount: int = 1) -> int:
        with self._lock:
            self._value -= amount
            return self._value
    
    @property
    def value(self) -> int:
        with self._lock:
            return self._value


def format_bytes(size: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} PB"


def format_progress(current: int, total: int) -> str:
    if total <= 0:
        return "0%"
    percentage = (current / total) * 100
    return f"{percentage:.1f}%"
