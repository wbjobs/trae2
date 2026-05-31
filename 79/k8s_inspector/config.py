import os
import yaml
from typing import Any, Dict, List, Optional


class ConfigLoader:
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "config",
            "config.yaml",
        )
        self.config: Dict[str, Any] = {}
        self._load_config()

    def _load_config(self) -> None:
        expanded_path = os.path.expanduser(self.config_path)
        if not os.path.exists(expanded_path):
            raise FileNotFoundError(f"配置文件不存在: {expanded_path}")
        with open(expanded_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f) or {}

    def get(self, key: str, default: Any = None) -> Any:
        keys = key.split(".")
        value = self.config
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value

    @property
    def global_config(self) -> Dict[str, Any]:
        return self.get("global", {})

    @property
    def ssh_config(self) -> Dict[str, Any]:
        return self.get("ssh", {})

    @property
    def k8s_config(self) -> Dict[str, Any]:
        return self.get("kubernetes", {})

    @property
    def thresholds(self) -> Dict[str, Any]:
        return self.get("resource_thresholds", {})

    @property
    def nodes(self) -> List[Dict[str, Any]]:
        return self.get("nodes", [])

    @property
    def namespaces(self) -> List[str]:
        return self.get("namespaces", [])

    @property
    def disk_paths(self) -> List[str]:
        return self.get("disk_paths", ["/"])
