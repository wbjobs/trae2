import os
import sys
import platform
import subprocess
import importlib
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from enum import Enum
import logging
import json
from pathlib import Path

logger = logging.getLogger(__name__)


class EnvironmentType(Enum):
    LOCAL = "local"
    REMOTE = "remote"
    CLUSTER = "cluster"
    CONTAINER = "container"


class DependencyStatus(Enum):
    INSTALLED = "installed"
    MISSING = "missing"
    VERSION_MISMATCH = "version_mismatch"


@dataclass
class DependencyInfo:
    name: str
    required_version: str = ""
    installed_version: str = ""
    status: DependencyStatus = DependencyStatus.MISSING
    import_path: str = ""


@dataclass
class SystemResource:
    cpu_count: int = 0
    cpu_usage: float = 0.0
    total_memory: int = 0
    available_memory: int = 0
    total_disk: int = 0
    available_disk: int = 0
    gpu_count: int = 0
    gpu_memory: List[int] = field(default_factory=list)


@dataclass
class RemoteNode:
    node_id: str
    host: str
    port: int = 22
    username: str = ""
    status: str = "offline"
    resources: SystemResource = field(default_factory=SystemResource)
    max_tasks: int = 1
    current_tasks: int = 0
    tags: List[str] = field(default_factory=list)


class DependencyManager:
    def __init__(self):
        self.dependencies: Dict[str, DependencyInfo] = {}
        self._init_dependencies()
    
    def _init_dependencies(self) -> None:
        core_deps = [
            ("numpy", "1.24.0"),
            ("scipy", "1.10.0"),
            ("numba", "0.57.0"),
            ("h5py", "3.8.0"),
            ("pyyaml", "6.0"),
            ("pandas", "2.0.0"),
            ("matplotlib", "3.7.0"),
            ("psutil", "5.9.0"),
            ("requests", "2.31.0"),
        ]
        
        for name, version in core_deps:
            self.dependencies[name] = DependencyInfo(
                name=name,
                required_version=version,
                import_path=name
            )
    
    def check_dependency(self, name: str) -> DependencyStatus:
        if name not in self.dependencies:
            dep = DependencyInfo(name=name, import_path=name)
            self.dependencies[name] = dep
        else:
            dep = self.dependencies[name]
        
        try:
            module = importlib.import_module(dep.import_path)
            dep.installed_version = getattr(module, "__version__", "unknown")
            
            if dep.required_version:
                if self._compare_versions(dep.installed_version, dep.required_version) >= 0:
                    dep.status = DependencyStatus.INSTALLED
                else:
                    dep.status = DependencyStatus.VERSION_MISMATCH
            else:
                dep.status = DependencyStatus.INSTALLED
                
        except ImportError:
            dep.status = DependencyStatus.MISSING
        
        return dep.status
    
    def check_all(self) -> Dict[str, DependencyInfo]:
        for name in list(self.dependencies.keys()):
            self.check_dependency(name)
        return self.dependencies
    
    def _compare_versions(self, v1: str, v2: str) -> int:
        try:
            v1_parts = [int(x) for x in v1.split(".")[:3]]
            v2_parts = [int(x) for x in v2.split(".")[:3]]
            
            for a, b in zip(v1_parts, v2_parts):
                if a > b:
                    return 1
                elif a < b:
                    return -1
            return 0
        except:
            return 0
    
    def install_dependency(self, name: str) -> bool:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", name])
            self.check_dependency(name)
            return True
        except subprocess.CalledProcessError:
            return False
    
    def get_missing_dependencies(self) -> List[str]:
        return [
            name for name, dep in self.dependencies.items()
            if dep.status == DependencyStatus.MISSING
        ]
    
    def get_version_mismatches(self) -> List[str]:
        return [
            name for name, dep in self.dependencies.items()
            if dep.status == DependencyStatus.VERSION_MISMATCH
        ]


class EnvironmentDetector:
    @staticmethod
    def get_system_info() -> Dict:
        return {
            "os": platform.system(),
            "os_version": platform.version(),
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
            "hostname": platform.node()
        }
    
    @staticmethod
    def detect_environment() -> EnvironmentType:
        if os.getenv("KUBERNETES_SERVICE_HOST"):
            return EnvironmentType.CLUSTER
        elif os.getenv("DOCKER_CONTAINER") or Path("/.dockerenv").exists():
            return EnvironmentType.CONTAINER
        elif os.getenv("SSH_CONNECTION"):
            return EnvironmentType.REMOTE
        else:
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


class ResourceMonitor:
    @staticmethod
    def get_system_resources() -> SystemResource:
        import psutil
        
        resource = SystemResource()
        
        resource.cpu_count = psutil.cpu_count(logical=True)
        resource.cpu_usage = psutil.cpu_percent(interval=0.1)
        
        mem = psutil.virtual_memory()
        resource.total_memory = mem.total
        resource.available_memory = mem.available
        
        disk = psutil.disk_usage('/')
        resource.total_disk = disk.total
        resource.available_disk = disk.free
        
        resource.gpu_count, gpu_memory = ResourceMonitor._get_gpu_info()
        resource.gpu_memory = gpu_memory
        
        return resource
    
    @staticmethod
    def _get_gpu_info() -> Tuple[int, List[int]]:
        try:
            import subprocess
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=index,memory.total",
                 "--format=csv,nounits,noheader"],
                capture_output=True, text=True, timeout=5
            )
            
            if result.returncode == 0:
                gpus = []
                for line in result.stdout.strip().split('\n'):
                    if line:
                        parts = line.split(',')
                        gpus.append(int(parts[1].strip()))
                return len(gpus), gpus
        except:
            pass
        
        return 0, []
    
    @staticmethod
    def get_process_resources(pid: Optional[int] = None) -> Dict:
        import psutil
        
        if pid is None:
            pid = os.getpid()
        
        process = psutil.Process(pid)
        
        return {
            "pid": pid,
            "cpu_percent": process.cpu_percent(),
            "memory_mb": process.memory_info().rss / (1024 * 1024),
            "num_threads": process.num_threads()
        }


class RemoteNodeManager:
    def __init__(self):
        self.nodes: Dict[str, RemoteNode] = {}
    
    def add_node(
        self,
        node_id: str,
        host: str,
        port: int = 22,
        username: str = "",
        max_tasks: int = 1,
        tags: Optional[List[str]] = None
    ) -> None:
        self.nodes[node_id] = RemoteNode(
            node_id=node_id,
            host=host,
            port=port,
            username=username,
            max_tasks=max_tasks,
            tags=tags or []
        )
        logger.info(f"已添加节点: {node_id}@{host}")
    
    def remove_node(self, node_id: str) -> bool:
        if node_id in self.nodes:
            del self.nodes[node_id]
            logger.info(f"已移除节点: {node_id}")
            return True
        return False
    
    def get_available_nodes(self) -> List[RemoteNode]:
        return [
            node for node in self.nodes.values()
            if node.status == "online" and node.current_tasks < node.max_tasks
        ]
    
    def ping_node(self, node_id: str) -> bool:
        if node_id not in self.nodes:
            return False
        
        node = self.nodes[node_id]
        
        try:
            if platform.system() == "Windows":
                cmd = ["ping", "-n", "1", "-w", "2000", node.host]
            else:
                cmd = ["ping", "-c", "1", "-W", "2", node.host]
            result = subprocess.run(cmd, capture_output=True)
            node.status = "online" if result.returncode == 0 else "offline"
        except:
            node.status = "offline"
        
        return node.status == "online"
    
    def ping_all_nodes(self) -> None:
        for node_id in list(self.nodes.keys()):
            self.ping_node(node_id)
    
    def select_best_node(self, task_tags: Optional[List[str]] = None) -> Optional[RemoteNode]:
        available = self.get_available_nodes()
        
        if task_tags:
            available = [
                node for node in available
                if any(tag in node.tags for tag in task_tags)
            ]
        
        if not available:
            return None
        
        available.sort(key=lambda n: n.current_tasks / n.max_tasks)
        return available[0]


class CrossEnvironmentAdapter:
    def __init__(self):
        self.dependency_manager = DependencyManager()
        self.env_detector = EnvironmentDetector()
        self.resource_monitor = ResourceMonitor()
        self.remote_manager = RemoteNodeManager()
        
        self.environment_type = self.env_detector.detect_environment()
        self.system_info = self.env_detector.get_system_info()
        
        logger.info(f"检测到环境类型: {self.environment_type.value}")
    
    def validate_environment(self) -> Dict:
        dependencies = self.dependency_manager.check_all()
        resources = self.resource_monitor.get_system_resources()
        
        missing = self.dependency_manager.get_missing_dependencies()
        mismatched = self.dependency_manager.get_version_mismatches()
        
        return {
            "environment_type": self.environment_type.value,
            "system_info": self.system_info,
            "dependencies_ok": len(missing) == 0 and len(mismatched) == 0,
            "missing_dependencies": missing,
            "version_mismatches": mismatched,
            "resources": {
                "cpu_count": resources.cpu_count,
                "cpu_usage": resources.cpu_usage,
                "total_memory_gb": resources.total_memory / (1024**3),
                "available_memory_gb": resources.available_memory / (1024**3),
                "gpu_count": resources.gpu_count
            }
        }
    
    def setup_environment(self, auto_fix: bool = False) -> bool:
        validation = self.validate_environment()
        
        if validation["dependencies_ok"]:
            logger.info("环境验证通过")
            return True
        
        if auto_fix:
            missing = validation["missing_dependencies"]
            for dep in missing:
                logger.info(f"正在安装依赖: {dep}")
                self.dependency_manager.install_dependency(dep)
            
            validation = self.validate_environment()
            return validation["dependencies_ok"]
        
        logger.warning("存在缺失的依赖")
        return False
    
    def get_execution_context(self) -> Dict:
        resources = self.resource_monitor.get_system_resources()
        
        return {
            "environment": self.environment_type.value,
            "system": self.system_info,
            "resources": {
                "cpu_count": resources.cpu_count,
                "cpu_usage": resources.cpu_usage,
                "memory_available_gb": resources.available_memory / (1024**3),
                "gpu_available": resources.gpu_count > 0
            },
            "max_parallel_tasks": max(1, resources.cpu_count - 1),
            "recommended_workers": min(
                max(1, resources.cpu_count - 1),
                int(resources.available_memory // (4 * 1024**3))
            )
        }
    
    def configure_remote_nodes(self, nodes_config: List[Dict]) -> None:
        for config in nodes_config:
            self.remote_manager.add_node(
                node_id=config.get("node_id", config["host"]),
                host=config["host"],
                port=config.get("port", 22),
                username=config.get("username", ""),
                max_tasks=config.get("max_tasks", 1),
                tags=config.get("tags", [])
            )
        
        self.remote_manager.ping_all_nodes()
    
    def is_running_in_container(self) -> bool:
        return self.environment_type == EnvironmentType.CONTAINER
    
    def is_running_in_cluster(self) -> bool:
        return self.environment_type == EnvironmentType.CLUSTER
    
    def get_path_compatible_path(self, path: str) -> str:
        if self.env_detector.is_windows():
            return path.replace("/", "\\")
        return path.replace("\\", "/")
    
    @staticmethod
    def get_temp_dir() -> str:
        temp_dir = os.environ.get("TMPDIR") or os.environ.get("TEMP") or "/tmp"
        Path(temp_dir).mkdir(parents=True, exist_ok=True)
        return temp_dir
