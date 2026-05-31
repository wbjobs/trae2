import os
import yaml
import re
import fnmatch
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ServerConfig:
    name: str
    host: str
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    private_key: Optional[str] = None
    private_key_passphrase: Optional[str] = None
    tags: List[str] = field(default_factory=list)


@dataclass
class LogConfig:
    log_dir: str = "logs"
    log_level: str = "INFO"
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    max_bytes: int = 10 * 1024 * 1024
    backup_count: int = 5


@dataclass
class SSHConfig:
    timeout: int = 30
    max_retries: int = 3
    retry_delay: int = 2
    pool_size: int = 10
    allow_agent: bool = True
    look_for_keys: bool = True


@dataclass
class SecurityConfig:
    enabled: bool = True
    whitelist: List[str] = field(default_factory=list)
    blacklist: List[str] = field(default_factory=list)
    default_action: str = "allow"


@dataclass
class AppConfig:
    servers: List[ServerConfig] = field(default_factory=list)
    ssh: SSHConfig = field(default_factory=SSHConfig)
    logging: LogConfig = field(default_factory=LogConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)
    default_parallel: int = 5


class CommandValidator:
    def __init__(self, security_config: SecurityConfig):
        self.config = security_config
        self._compiled_whitelist = []
        self._compiled_blacklist = []
        self._compile_patterns()

    def _compile_patterns(self) -> None:
        self._compiled_whitelist = self._compile(self.config.whitelist)
        self._compiled_blacklist = self._compile(self.config.blacklist)

    def _compile(self, patterns: List[str]) -> list:
        compiled = []
        for pattern in patterns:
            if pattern.startswith("regex:"):
                compiled.append(("regex", re.compile(pattern[6:])))
            else:
                compiled.append(("glob", pattern))
        return compiled

    def validate(self, command: str) -> Tuple[bool, Optional[str]]:
        if not self.config.enabled:
            return True, None

        cmd_clean = command.strip()
        if not cmd_clean:
            return False, "Empty command"

        in_whitelist = self._match(self._compiled_whitelist, cmd_clean)
        in_blacklist = self._match(self._compiled_blacklist, cmd_clean)

        if self.config.default_action == "allow":
            if in_blacklist and not in_whitelist:
                return False, f"Command blocked by blacklist"
            return True, None
        else:
            if in_whitelist or not in_blacklist:
                return True, None
            return False, f"Command not in whitelist"

    def _match(self, compiled_patterns: list, command: str) -> bool:
        for pattern_type, pattern in compiled_patterns:
            if pattern_type == "regex":
                if pattern.search(command):
                    return True
            else:
                for part in command.split():
                    if fnmatch.fnmatch(part, pattern):
                        return True
                if fnmatch.fnmatch(command, pattern):
                    return True
        return False

    def reload(self, security_config: SecurityConfig) -> None:
        self.config = security_config
        self._compile_patterns()


class ConfigManager:
    def __init__(self, config_dir: Optional[str] = None):
        self.config_dir = Path(config_dir) if config_dir else Path.home() / ".cluster_ops"
        self.config_file = self.config_dir / "config.yaml"
        self.config = AppConfig()
        self.validator: Optional[CommandValidator] = None
        self._load_config()

    def _load_config(self) -> None:
        if not self.config_file.exists():
            self._create_default_config()
            return

        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}

            if "servers" in data:
                self.config.servers = [
                    ServerConfig(**server) for server in data["servers"]
                ]

            if "ssh" in data:
                ssh_data = data["ssh"]
                self.config.ssh = SSHConfig(
                    timeout=ssh_data.get("timeout", 30),
                    max_retries=ssh_data.get("max_retries", 3),
                    retry_delay=ssh_data.get("retry_delay", 2),
                    pool_size=ssh_data.get("pool_size", 10),
                    allow_agent=ssh_data.get("allow_agent", True),
                    look_for_keys=ssh_data.get("look_for_keys", True),
                )

            if "logging" in data:
                log_data = data["logging"]
                self.config.logging = LogConfig(
                    log_dir=log_data.get("log_dir", "logs"),
                    log_level=log_data.get("log_level", "INFO"),
                    log_format=log_data.get(
                        "log_format",
                        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
                    ),
                    max_bytes=log_data.get("max_bytes", 10 * 1024 * 1024),
                    backup_count=log_data.get("backup_count", 5),
                )

            if "security" in data:
                sec_data = data["security"]
                self.config.security = SecurityConfig(
                    enabled=sec_data.get("enabled", True),
                    whitelist=sec_data.get("whitelist", []),
                    blacklist=sec_data.get("blacklist", []),
                    default_action=sec_data.get("default_action", "allow"),
                )

            self.config.default_parallel = data.get("default_parallel", 5)

            self.validator = CommandValidator(self.config.security)

        except Exception as e:
            print(f"Warning: Failed to load config: {e}")
            self._create_default_config()

    def _create_default_config(self) -> None:
        self.config_dir.mkdir(parents=True, exist_ok=True)
        default_config = {
            "servers": [],
            "ssh": {
                "timeout": 30,
                "max_retries": 3,
                "retry_delay": 2,
                "pool_size": 10,
                "allow_agent": True,
                "look_for_keys": True,
            },
            "logging": {
                "log_dir": str(self.config_dir / "logs"),
                "log_level": "INFO",
                "log_format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                "max_bytes": 10485760,
                "backup_count": 5,
            },
            "security": {
                "enabled": False,
                "whitelist": [],
                "blacklist": [
                    "rm -rf /",
                    "mkfs",
                    "dd if=/dev",
                    "shutdown",
                    "reboot",
                    "regex:^rm\\s+-rf\\s+/",
                ],
                "default_action": "allow",
            },
            "default_parallel": 5,
        }
        with open(self.config_file, "w", encoding="utf-8") as f:
            yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True)

    def save(self) -> None:
        data = {
            "servers": [
                {
                    "name": s.name,
                    "host": s.host,
                    "port": s.port,
                    "username": s.username,
                    "password": s.password,
                    "private_key": s.private_key,
                    "private_key_passphrase": s.private_key_passphrase,
                    "tags": s.tags,
                }
                for s in self.config.servers
            ],
            "ssh": {
                "timeout": self.config.ssh.timeout,
                "max_retries": self.config.ssh.max_retries,
                "retry_delay": self.config.ssh.retry_delay,
                "pool_size": self.config.ssh.pool_size,
                "allow_agent": self.config.ssh.allow_agent,
                "look_for_keys": self.config.ssh.look_for_keys,
            },
            "logging": {
                "log_dir": self.config.logging.log_dir,
                "log_level": self.config.logging.log_level,
                "log_format": self.config.logging.log_format,
                "max_bytes": self.config.logging.max_bytes,
                "backup_count": self.config.logging.backup_count,
            },
            "security": {
                "enabled": self.config.security.enabled,
                "whitelist": self.config.security.whitelist,
                "blacklist": self.config.security.blacklist,
                "default_action": self.config.security.default_action,
            },
            "default_parallel": self.config.default_parallel,
        }
        with open(self.config_file, "w", encoding="utf-8") as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True)

    def validate_command(self, command: str) -> Tuple[bool, Optional[str]]:
        if not self.validator:
            self.validator = CommandValidator(self.config.security)
        return self.validator.validate(command)

    def add_server(self, server: ServerConfig) -> None:
        existing = self.get_server(server.name)
        if existing:
            self.config.servers.remove(existing)
        self.config.servers.append(server)
        self.save()

    def remove_server(self, name: str) -> bool:
        server = self.get_server(name)
        if server:
            self.config.servers.remove(server)
            self.save()
            return True
        return False

    def get_server(self, name: str) -> Optional[ServerConfig]:
        for server in self.config.servers:
            if server.name == name:
                return server
        return None

    def get_servers_by_tags(self, tags: List[str]) -> List[ServerConfig]:
        if not tags:
            return self.config.servers.copy()
        return [
            s for s in self.config.servers
            if any(tag in s.tags for tag in tags)
        ]

    def get_all_servers(self) -> List[ServerConfig]:
        return self.config.servers.copy()


config_manager = ConfigManager()
