import os
import yaml
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class NodeConfig:
    host: str
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    key_file: Optional[str] = None
    role: str = "storage"
    tags: list = field(default_factory=list)


@dataclass
class DiskThreshold:
    usage_percent: int = 85
    inode_percent: int = 85
    smart_warning: bool = True
    bad_sectors: int = 0
    include_virtual_fs: bool = False


@dataclass
class RetryConfig:
    max_retries: int = 3
    retry_delay: float = 2.0
    backoff_factor: float = 1.5


@dataclass
class EncodingConfig:
    ssh_encoding: str = "utf-8"
    file_encoding: str = "utf-8"
    output_encoding: str = "utf-8"
    strict_mode: bool = False


@dataclass
class ServiceCheck:
    name: str
    pattern: Optional[str] = None
    required: bool = True
    restart_on_fail: bool = False


@dataclass
class SchedulingConfig:
    initial_batch_size: int = 20
    max_batch_size: int = 200
    min_batch_size: int = 1
    state_dir: str = "./data"
    auto_save_interval: int = 60
    enable_auto_blacklist: bool = True
    blacklist_threshold: int = 5
    blacklist_duration: int = 3600


@dataclass
class AppConfig:
    nodes: list = field(default_factory=list)
    disk_threshold: DiskThreshold = field(default_factory=DiskThreshold)
    services: list = field(default_factory=list)
    retry: RetryConfig = field(default_factory=RetryConfig)
    encoding: EncodingConfig = field(default_factory=EncodingConfig)
    scheduling: SchedulingConfig = field(default_factory=SchedulingConfig)
    ssh_timeout: int = 30
    ssh_connect_timeout: int = 10
    log_dir: str = "./logs"
    max_parallel: int = 50

    @classmethod
    def load(cls, config_path: str) -> "AppConfig":
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"配置文件不存在: {config_path}")

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                raw = yaml.safe_load(f)
        except UnicodeDecodeError:
            with open(config_path, "r", encoding="gbk", errors="replace") as f:
                raw = yaml.safe_load(f)
        except Exception as e:
            raise RuntimeError(f"读取配置文件失败: {e}")

        if not raw:
            return cls()

        nodes = []
        for item in raw.get("nodes", []):
            nodes.append(NodeConfig(
                host=item.get("host", ""),
                port=item.get("port", 22),
                username=item.get("username", "root"),
                password=item.get("password"),
                key_file=item.get("key_file"),
                role=item.get("role", "storage"),
                tags=item.get("tags", []),
            ))

        disk_raw = raw.get("disk_threshold", {})
        disk_threshold = DiskThreshold(
            usage_percent=disk_raw.get("usage_percent", 85),
            inode_percent=disk_raw.get("inode_percent", 85),
            smart_warning=disk_raw.get("smart_warning", True),
            bad_sectors=disk_raw.get("bad_sectors", 0),
            include_virtual_fs=disk_raw.get("include_virtual_fs", False),
        )

        retry_raw = raw.get("retry", {})
        retry = RetryConfig(
            max_retries=retry_raw.get("max_retries", 3),
            retry_delay=retry_raw.get("retry_delay", 2.0),
            backoff_factor=retry_raw.get("backoff_factor", 1.5),
        )

        encoding_raw = raw.get("encoding", {})
        encoding = EncodingConfig(
            ssh_encoding=encoding_raw.get("ssh_encoding", "utf-8"),
            file_encoding=encoding_raw.get("file_encoding", "utf-8"),
            output_encoding=encoding_raw.get("output_encoding", "utf-8"),
            strict_mode=encoding_raw.get("strict_mode", False),
        )

        services = []
        for item in raw.get("services", []):
            services.append(ServiceCheck(
                name=item.get("name", ""),
                pattern=item.get("pattern"),
                required=item.get("required", True),
                restart_on_fail=item.get("restart_on_fail", False),
            ))

        scheduling_raw = raw.get("scheduling", {})
        scheduling = SchedulingConfig(
            initial_batch_size=scheduling_raw.get("initial_batch_size", 20),
            max_batch_size=scheduling_raw.get("max_batch_size", 200),
            min_batch_size=scheduling_raw.get("min_batch_size", 1),
            state_dir=scheduling_raw.get("state_dir", "./data"),
            auto_save_interval=scheduling_raw.get("auto_save_interval", 60),
            enable_auto_blacklist=scheduling_raw.get("enable_auto_blacklist", True),
            blacklist_threshold=scheduling_raw.get("blacklist_threshold", 5),
            blacklist_duration=scheduling_raw.get("blacklist_duration", 3600),
        )

        global_raw = raw.get("global", {})
        return cls(
            nodes=nodes,
            disk_threshold=disk_threshold,
            services=services,
            retry=retry,
            encoding=encoding,
            scheduling=scheduling,
            ssh_timeout=global_raw.get("ssh_timeout", 30),
            ssh_connect_timeout=global_raw.get("ssh_connect_timeout", 10),
            log_dir=global_raw.get("log_dir", "./logs"),
            max_parallel=global_raw.get("max_parallel", 50),
        )

    def get_nodes_by_role(self, role: str) -> list:
        return [n for n in self.nodes if n.role == role]

    def get_nodes_by_tag(self, tag: str) -> list:
        return [n for n in self.nodes if tag in n.tags]

    def get_node_by_host(self, host: str) -> Optional[NodeConfig]:
        for n in self.nodes:
            if n.host == host:
                return n
        return None