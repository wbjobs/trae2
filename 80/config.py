#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
配置模块
"""

import os
import json
from typing import Dict, Any


class Config:
    def __init__(self, config_file: str = None):
        self._config = self._load_defaults()
        
        if config_file and os.path.exists(config_file):
            self._load_from_file(config_file)
        
        self._load_from_env()
    
    def _load_defaults(self) -> Dict[str, Any]:
        return {
            'log_level': 'INFO',
            'log_file': '/var/log/iiot-fw-mgr.log',
            'device_db_path': '/etc/iiot-fw-mgr/devices.json',
            'delta_cache_dir': '/var/cache/iiot-fw-mgr/delta',
            'firmware_cache_dir': '/var/cache/iiot-fw-mgr/firmware',
            'max_parallel_devices': 10,
            'default_timeout': 30,
            'retry_count': 3,
            'retry_interval': 5,
            'chunk_size': 4096,
            'max_delta_size': 100 * 1024 * 1024,
            'supported_protocols': ['modbus', 'mqtt', 'http', 'coap'],
            'supported_delta_algorithms': ['bsdiff', 'xdelta', 'lzdiff'],
            'upgrade_status_file': '/var/lib/iiot-fw-mgr/upgrade_status.json',
            'backup_dir': '/var/backups/iiot-fw-mgr',
            'max_reconnect_attempts': 5,
            'reconnect_delay': 2,
            'connection_idle_timeout': 30,
            'heartbeat_interval': 15,
            'max_transfer_retries': 6,
            'transfer_retry_base_delay': 1,
            'enable_integrity_check': True,
            'enable_progress_persistence': True,
            'allow_downgrade': False,
            'allow_unstable_versions': False,
        }
    
    def _load_from_file(self, config_file: str):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                file_config = json.load(f)
                self._config.update(file_config)
        except Exception as e:
            print(f"警告: 无法加载配置文件 {config_file}: {e}")
    
    def _load_from_env(self):
        env_mapping = {
            'IIOT_FW_LOG_LEVEL': 'log_level',
            'IIOT_FW_LOG_FILE': 'log_file',
            'IIOT_FW_DEVICE_DB': 'device_db_path',
            'IIOT_FW_MAX_PARALLEL': 'max_parallel_devices',
            'IIOT_FW_TIMEOUT': 'default_timeout',
        }
        
        for env_var, config_key in env_mapping.items():
            if env_var in os.environ:
                value = os.environ[env_var]
                if config_key in ['max_parallel_devices', 'default_timeout', 'retry_count', 'retry_interval']:
                    value = int(value)
                self._config[config_key] = value
    
    def __getattr__(self, name: str) -> Any:
        if name in self._config:
            return self._config[name]
        raise AttributeError(f"'Config' object has no attribute '{name}'")
    
    def get(self, key: str, default: Any = None) -> Any:
        return self._config.get(key, default)
    
    def ensure_dirs(self):
        dirs = [
            os.path.dirname(self.device_db_path),
            self.delta_cache_dir,
            self.firmware_cache_dir,
            os.path.dirname(self.upgrade_status_file),
            self.backup_dir,
            os.path.dirname(self.log_file),
        ]
        
        for directory in dirs:
            if directory and not os.path.exists(directory):
                try:
                    os.makedirs(directory, exist_ok=True)
                except Exception:
                    pass
