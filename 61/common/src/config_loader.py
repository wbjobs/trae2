#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import yaml
import os
from typing import Dict


class ConfigLoader:
    def __init__(self, config_dir: str = None):
        if config_dir is None:
            config_dir = os.path.join(os.path.dirname(__file__), "..", "..", "config")
        self.config_dir = config_dir
        self._config = {}

    def load_config(self, config_name: str = "application") -> Dict:
        config_path = os.path.join(self.config_dir, f"{config_name}.yaml")
        env = os.environ.get("ENV", "development")
        env_config_path = os.path.join(self.config_dir, f"{config_name}-{env}.yaml")

        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                self._config = yaml.safe_load(f) or {}

        if os.path.exists(env_config_path):
            with open(env_config_path, "r", encoding="utf-8") as f:
                env_config = yaml.safe_load(f) or {}
                self._merge_config(self._config, env_config)

        return self._config

    def _merge_config(self, base: Dict, override: Dict):
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._merge_config(base[key], value)
            else:
                base[key] = value

    def get(self, key: str, default=None):
        keys = key.split(".")
        value = self._config
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value
