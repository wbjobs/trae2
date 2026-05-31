#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""配置加载模块"""

import json
import os
from typing import Dict, Any


DEFAULT_CONFIG = {
    "log_level": "INFO",
    "device_timeout": 30,
    "max_parallel_upgrades": 10,
    "diff_algorithm": "bsdiff",
    "retry_count": 3,
    "retry_interval": 5,
    "firmware_store": "./firmware",
    "upgrade_log_dir": "./upgrade_logs",
    "device_config": "./devices.json",
}


def load_config(config_path: str = None) -> Dict[str, Any]:
    """
    加载配置文件

    Args:
        config_path: 配置文件路径

    Returns:
        配置字典
    """
    config = DEFAULT_CONFIG.copy()

    if config_path and os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                user_config = json.load(f)
                config.update(user_config)
        except Exception as e:
            print(f"警告: 加载配置文件失败: {e}")

    return config


def save_config(config: Dict[str, Any], config_path: str):
    """
    保存配置文件

    Args:
        config: 配置字典
        config_path: 配置文件路径
    """
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
