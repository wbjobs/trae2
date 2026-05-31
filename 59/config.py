"""
配置文件加载模块
Configuration Loader Module

负责加载和解析 YAML 配置文件，支持自定义配置路径和默认配置。
"""

import os
import yaml
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from pathlib import Path


@dataclass
class NodeConfig:
    """集群节点配置"""
    name: str
    host: str
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    ssh_key: Optional[str] = None
    ssh_key_passphrase: Optional[str] = None
    role: str = "worker"
    labels: List[str] = field(default_factory=list)
    enabled: bool = True

    @classmethod
    def from_dict(cls, data: dict) -> "NodeConfig":
        return cls(
            name=data.get("name", ""),
            host=data.get("host", ""),
            port=data.get("port", 22),
            username=data.get("username", "root"),
            password=data.get("password"),
            ssh_key=data.get("ssh_key"),
            ssh_key_passphrase=data.get("ssh_key_passphrase"),
            role=data.get("role", "worker"),
            labels=data.get("labels", []),
            enabled=data.get("enabled", True),
        )


@dataclass
class ThresholdConfig:
    """资源水位阈值配置"""
    cpu_warning: float = 70.0
    cpu_critical: float = 90.0
    memory_warning: float = 75.0
    memory_critical: float = 90.0
    disk_warning: float = 80.0
    disk_critical: float = 95.0
    container_restart_warning: int = 3
    container_restart_critical: int = 5

    @classmethod
    def from_dict(cls, data: dict) -> "ThresholdConfig":
        return cls(
            cpu_warning=data.get("cpu_warning", 70.0),
            cpu_critical=data.get("cpu_critical", 90.0),
            memory_warning=data.get("memory_warning", 75.0),
            memory_critical=data.get("memory_critical", 90.0),
            disk_warning=data.get("disk_warning", 80.0),
            disk_critical=data.get("disk_critical", 95.0),
            container_restart_warning=data.get("container_restart_warning", 3),
            container_restart_critical=data.get("container_restart_critical", 5),
        )


@dataclass
class LogConfig:
    """日志配置"""
    log_dir: str = "./logs"
    log_format: str = "json"
    log_level: str = "INFO"
    max_file_size: int = 10
    backup_count: int = 5
    include_timestamp: bool = True
    separate_by_node: bool = True
    encoding: str = "utf-8"

    @classmethod
    def from_dict(cls, data: dict) -> "LogConfig":
        return cls(
            log_dir=data.get("log_dir", "./logs"),
            log_format=data.get("log_format", "json"),
            log_level=data.get("log_level", "INFO"),
            max_file_size=data.get("max_file_size", 10),
            backup_count=data.get("backup_count", 5),
            include_timestamp=data.get("include_timestamp", True),
            separate_by_node=data.get("separate_by_node", True),
            encoding=data.get("encoding", "utf-8"),
        )


@dataclass
class SSHConfig:
    """SSH 连接配置"""
    timeout: int = 30
    auth_timeout: int = 15
    banner_timeout: int = 15
    retry_count: int = 3
    retry_delay: float = 2.0
    keepalive_interval: int = 60
    allow_agent: bool = False
    look_for_keys: bool = False

    @classmethod
    def from_dict(cls, data: dict) -> "SSHConfig":
        return cls(
            timeout=data.get("timeout", 30),
            auth_timeout=data.get("auth_timeout", 15),
            banner_timeout=data.get("banner_timeout", 15),
            retry_count=data.get("retry_count", 3),
            retry_delay=data.get("retry_delay", 2.0),
            keepalive_interval=data.get("keepalive_interval", 60),
            allow_agent=data.get("allow_agent", False),
            look_for_keys=data.get("look_for_keys", False),
        )


@dataclass
class AppConfig:
    """应用主配置"""
    nodes: List[NodeConfig] = field(default_factory=list)
    thresholds: ThresholdConfig = field(default_factory=ThresholdConfig)
    log: LogConfig = field(default_factory=LogConfig)
    ssh: SSHConfig = field(default_factory=SSHConfig)
    global_settings: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> "AppConfig":
        nodes = [NodeConfig.from_dict(n) for n in data.get("nodes", [])]
        thresholds = ThresholdConfig.from_dict(data.get("thresholds", {}))
        log = LogConfig.from_dict(data.get("log", {}))
        ssh = SSHConfig.from_dict(data.get("ssh", {}))
        global_settings = data.get("global_settings", {})
        return cls(
            nodes=nodes,
            thresholds=thresholds,
            log=log,
            ssh=ssh,
            global_settings=global_settings,
        )

    def get_node_by_name(self, name: str) -> Optional[NodeConfig]:
        for node in self.nodes:
            if node.name == name:
                return node
        return None

    def get_nodes_by_role(self, role: str) -> List[NodeConfig]:
        return [n for n in self.nodes if n.role == role and n.enabled]

    def get_enabled_nodes(self) -> List[NodeConfig]:
        return [n for n in self.nodes if n.enabled]

    def get_nodes_by_label(self, label: str) -> List[NodeConfig]:
        return [n for n in self.nodes if label in n.labels and n.enabled]


class ConfigLoader:
    """配置加载器"""

    DEFAULT_CONFIG_PATHS = [
        "config.yaml",
        "config.yml",
        "./config/config.yaml",
        "./config/config.yml",
        os.path.expanduser("~/.cluster_inspector/config.yaml"),
    ]

    @staticmethod
    def load(config_path: Optional[str] = None) -> AppConfig:
        """加载配置文件

        Args:
            config_path: 配置文件路径，为 None 时自动搜索默认路径

        Returns:
            AppConfig 配置对象

        Raises:
            FileNotFoundError: 配置文件不存在
            ValueError: 配置文件格式错误
        """
        if config_path is None:
            config_path = ConfigLoader._find_config()
        else:
            config_path = os.path.abspath(config_path)

        if not os.path.exists(config_path):
            raise FileNotFoundError(f"配置文件不存在: {config_path}")

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise ValueError(f"YAML 解析错误: {e}")
        except Exception as e:
            raise ValueError(f"读取配置文件失败: {e}")

        if not isinstance(data, dict):
            raise ValueError("配置文件格式错误，根节点必须是字典")

        config = AppConfig.from_dict(data)
        config.global_settings["_config_path"] = config_path
        return config

    @staticmethod
    def _find_config() -> str:
        """搜索默认配置路径

        Returns:
            找到的配置文件路径

        Raises:
            FileNotFoundError: 未找到配置文件
        """
        for path in ConfigLoader.DEFAULT_CONFIG_PATHS:
            if os.path.exists(path):
                return os.path.abspath(path)
        raise FileNotFoundError(
            "未找到配置文件，请通过 --config 参数指定或在默认路径创建配置文件。"
            f"默认搜索路径: {', '.join(ConfigLoader.DEFAULT_CONFIG_PATHS)}"
        )

    @staticmethod
    def generate_default_config(output_path: str) -> str:
        """生成默认配置文件

        Args:
            output_path: 输出文件路径

        Returns:
            生成的配置文件路径
        """
        default_config = {
            "global_settings": {
                "cluster_name": "production-cluster",
                "environment": "production",
                "notification_enabled": False,
            },
            "ssh": {
                "timeout": 45,
                "auth_timeout": 20,
                "banner_timeout": 15,
                "retry_count": 3,
                "retry_delay": 2.0,
                "keepalive_interval": 30,
            },
            "thresholds": {
                "cpu_warning": 70.0,
                "cpu_critical": 90.0,
                "memory_warning": 75.0,
                "memory_critical": 90.0,
                "disk_warning": 80.0,
                "disk_critical": 95.0,
                "container_restart_warning": 3,
                "container_restart_critical": 5,
            },
            "log": {
                "log_dir": "./logs",
                "log_format": "json",
                "log_level": "INFO",
                "max_file_size": 10,
                "backup_count": 5,
                "include_timestamp": True,
                "separate_by_node": True,
                "encoding": "utf-8",
            },
            "nodes": [
                {
                    "name": "master-node-01",
                    "host": "192.168.1.10",
                    "port": 22,
                    "username": "root",
                    "password": "your_password_here",
                    "role": "master",
                    "labels": ["production", "k8s-master"],
                    "enabled": True,
                },
                {
                    "name": "worker-node-01",
                    "host": "192.168.1.11",
                    "port": 22,
                    "username": "root",
                    "ssh_key": "~/.ssh/id_rsa",
                    "ssh_key_passphrase": "",
                    "role": "worker",
                    "labels": ["production", "k8s-worker"],
                    "enabled": True,
                },
                {
                    "name": "worker-node-02",
                    "host": "192.168.1.12",
                    "port": 22,
                    "username": "root",
                    "password": "your_password_here",
                    "role": "worker",
                    "labels": ["production", "k8s-worker", "gpu"],
                    "enabled": True,
                },
            ],
        }

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True, indent=2)

        return os.path.abspath(output_path)
