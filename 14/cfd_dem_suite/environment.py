import os
import platform
import subprocess
from dataclasses import dataclass
from typing import Dict, Tuple, List
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class EnvironmentType(Enum):
    LOCAL = "local"
    REMOTE = "remote"
    CLUSTER = "cluster"
    CONTAINER = "container"
    CLOUD = "cloud"


@dataclass
class SystemInfo:
    os: str
    os_version: str
    architecture: str
    python_version: str
    hostname: str
    environment_type: EnvironmentType
    is_windows: bool
    is_linux: bool
    is_macos: bool


class EnvironmentDetector:
    @staticmethod
    def get_system_info() -> SystemInfo:
        return SystemInfo(
            os=platform.system(),
            os_version=platform.version(),
            architecture=platform.machine(),
            python_version=platform.python_version(),
            hostname=platform.node(),
            environment_type=EnvironmentDetector.detect_environment(),
            is_windows=EnvironmentDetector.is_windows(),
            is_linux=EnvironmentDetector.is_linux(),
            is_macos=EnvironmentDetector.is_macos()
        )
    
    @staticmethod
    def detect_environment() -> EnvironmentType:
        if os.getenv("KUBERNETES_SERVICE_HOST"):
            return EnvironmentType.CLUSTER
        
        if os.getenv("DOCKER_CONTAINER") or os.path.exists("/.dockerenv"):
            return EnvironmentType.CONTAINER
        
        if os.getenv("AWS_EXECUTION_ENV") or os.getenv("GCE_METADATA_HOST"):
            return EnvironmentType.CLOUD
        
        if os.getenv("SSH_CONNECTION") or os.getenv("SSH_CLIENT"):
            return EnvironmentType.REMOTE
        
        return EnvironmentType.LOCAL
    
    @staticmethod
    def is_windows() -> bool:
        return platform.system() == "Windows"
    
    @staticmethod
    def is_linux() -> bool:
        return platform.system() == "Linux"
    
    @staticmethod
    def is_macos() -> bool:
        return platform.system() == "Darwin"
    
    @staticmethod
    def get_cpu_count() -> int:
        try:
            import multiprocessing
            return multiprocessing.cpu_count()
        except:
            return os.cpu_count() or 1
    
    @staticmethod
    def get_env_var(name: str, default: str = "") -> str:
        return os.getenv(name, default)
    
    @staticmethod
    def get_path_separator() -> str:
        return os.sep
    
    @staticmethod
    def to_native_path(path: str) -> str:
        if EnvironmentDetector.is_windows():
            return path.replace("/", "\\")
        return path.replace("\\", "/")
    
    @staticmethod
    def execute_command(command: List[str], **kwargs) -> Tuple[int, str, str]:
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                **kwargs
            )
            return result.returncode, result.stdout, result.stderr
        except Exception as e:
            return -1, "", str(e)
    
    @staticmethod
    def get_temp_dir() -> str:
        temp_dir = os.environ.get("TMPDIR") or os.environ.get("TEMP") or "/tmp"
        os.makedirs(temp_dir, exist_ok=True)
        return temp_dir
    
    @staticmethod
    def print_environment_summary() -> None:
        info = EnvironmentDetector.get_system_info()
        print("=" * 60)
        print("Environment Summary")
        print("=" * 60)
        print(f"  OS: {info.os} {info.os_version}")
        print(f"  Architecture: {info.architecture}")
        print(f"  Python: {info.python_version}")
        print(f"  Hostname: {info.hostname}")
        print(f"  Environment: {info.environment_type.value}")
        print(f"  CPU Cores: {EnvironmentDetector.get_cpu_count()}")
        print("=" * 60)
