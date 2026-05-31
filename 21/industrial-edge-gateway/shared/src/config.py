"""
配置管理模块
"""
import os
import json
import yaml
from typing import Any, Dict
from pathlib import Path
try:
    from .exceptions import ConfigurationException
except ImportError:
    from exceptions import ConfigurationException


class GatewayConfig:
    """
    网关配置管理
    
    支持多种配置格式: JSON, YAML, 环境变量
    适配嵌入式Linux与云端服务器双环境
    """

    def __init__(self, config_path: str = None):
        self._config: Dict[str, Any] = {}
        self._config_path = config_path
        self._environment = os.environ.get("GATEWAY_ENV", "edge")  # edge or cloud
        self._load_defaults()
        if config_path and Path(config_path).exists():
            self._load_from_file(config_path)
        self._load_from_env()

    def _load_defaults(self):
        """加载默认配置"""
        self._config = {
            "gateway": {
                "id": f"gateway-{os.getpid()}",
                "name": "Industrial Edge Gateway",
                "environment": self._environment,
                "log_level": "INFO",
            },
            "services": {
                "protocol_parser": {
                    "host": "0.0.0.0",
                    "port": 8001,
                    "protocols": ["modbus_tcp", "modbus_rtu", "profinet", "opc_ua"],
                },
                "dataflow_router": {
                    "host": "0.0.0.0",
                    "port": 8002,
                    "rules_file": "dataflow_rules.json",
                },
                "device_gateway": {
                    "host": "0.0.0.0",
                    "port": 8003,
                    "max_connections": 100,
                },
                "data_storage": {
                    "host": "0.0.0.0",
                    "port": 8004,
                    "storage_type": "timescaledb",
                    "database_url": "postgresql://postgres:postgres@localhost:5432/industrial_db",
                    "retention_days": 365,
                },
                "cross_node": {
                    "host": "0.0.0.0",
                    "port": 8005,
                    "mqtt_broker": "mqtt://localhost:1883",
                    "cloud_endpoint": "",
                    "heartbeat_interval": 30,
                },
                "orchestration": {
                    "host": "0.0.0.0",
                    "port": 8006,
                    "frontend_dir": "frontend-orchestration/dist",
                },
            },
            "device_configs": [],
            "dataflow_rules": [],
        }

    def _load_from_file(self, config_path: str):
        """从配置文件加载配置"""
        path = Path(config_path)
        if path.suffix in [".json"]:
            with open(path, "r", encoding="utf-8") as f:
                self._config = json.load(f)
        elif path.suffix in [".yaml", ".yml"]:
            with open(path, "r", encoding="utf-8") as f:
                self._config = yaml.safe_load(f)
        else:
            raise ConfigurationException(f"不支持的配置格式: {path.suffix}", config_key="config_format")

    def _load_from_env(self):
        """从环境变量加载配置 (覆盖配置"""
        env_mappings = {
            "GATEWAY_ID": ("gateway", "id"),
            "GATEWAY_NAME": ("gateway", "name"),
            "GATEWAY_ENV": ("gateway", "environment"),
            "LOG_LEVEL": ("gateway", "log_level"),
            "DATABASE_URL": ("services", "data_storage", "database_url"),
            "MQTT_BROKER": ("services", "cross_node", "mqtt_broker"),
            "CLOUD_ENDPOINT": ("services", "cross_node", "cloud_endpoint"),
        }
        for env_key, *config_path in env_mappings.items():
            value = os.environ.get(env_key)
            if value:
                self._set_nested(config_path, value)

    def _set_nested(self, keys, value):
        """设置嵌套配置值"""
        config = self._config
        for key in keys[:-1]:
            config = config.setdefault(key, {})
        config[keys[-1]] = value

    def get(self, *keys, default=None):
        """获取配置值"""
        config = self._config
        for key in keys:
            if isinstance(config, dict):
                config = config.get(key)
            else:
                return default
            if config is None:
                return default
        return config

    def set(self, *keys, value):
        """设置配置值"""
        self._set_nested(keys, value)

    @property
    def environment(self) -> str:
        """当前运行环境: edge 或 cloud"""
        return self._environment

    @property
    def is_edge(self) -> bool:
        """是否为边缘端"""
        return self._environment == "edge"

    @property
    def is_cloud(self) -> bool:
        """是否为云端"""
        return self._environment == "cloud"

    def to_dict(self) -> Dict[str, Any]:
        return self._config

    def save(self, config_path: str = None):
        """保存配置到文件"""
        path = Path(config_path or self._config_path)
        if path.suffix == ".json":
            with open(path, "w", encoding="utf-8") as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
        elif path.suffix in [".yaml", ".yml"]:
            with open(path, "w", encoding="utf-8") as f:
                yaml.dump(self._config, f, allow_unicode=True)


def load_config(config_path: str = None) -> GatewayConfig:
    """加载配置的便捷函数"""
    return GatewayConfig(config_path)