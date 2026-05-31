"""
日志工具模块
"""
import logging
import sys
from pathlib import Path
from typing import Optional


class LoggerManager:
    """日志管理器"""

    _loggers = {}

    @classmethod
    def get_logger(cls, name: str, level: str = "INFO", log_file: Optional[str] = None) -> logging.Logger:
        if name in cls._loggers:
            return cls._loggers[name]

        logger = logging.getLogger(name)
        logger.setLevel(getattr(logging, level.upper(), logging.INFO))

        formatter = logging.Formatter(
            "[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        if log_file:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(log_file, encoding="utf-8")
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)

        cls._loggers[name] = logger
        return logger

    @classmethod
    def set_level(cls, name: str, level: str):
        if name in cls._loggers:
            cls._loggers[name].setLevel(getattr(logging, level.upper(), logging.INFO))


def get_logger(name: str, level: str = "INFO", log_file: Optional[str] = None) -> logging.Logger:
    return LoggerManager.get_logger(name, level, log_file)