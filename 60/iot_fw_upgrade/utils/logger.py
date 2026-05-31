#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""日志配置模块"""

import logging
import sys
from logging.handlers import RotatingFileHandler
import os


def setup_logger(level: str = "INFO", log_file: str = None):
    """
    设置日志

    Args:
        level: 日志级别
        log_file: 日志文件路径
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    formatter = logging.Formatter(log_format)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file, maxBytes=10*1024*1024, backupCount=5
        )
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    return root_logger
