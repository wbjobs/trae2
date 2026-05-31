import sys
import subprocess
import importlib
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)


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


class DependencyManager:
    def __init__(self):
        self.dependencies: Dict[str, DependencyInfo] = {}
        self._init_core_dependencies()
    
    def _init_core_dependencies(self) -> None:
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
    
    def add_dependency(
        self,
        name: str,
        required_version: str = "",
        import_path: Optional[str] = None
    ) -> None:
        self.dependencies[name] = DependencyInfo(
            name=name,
            required_version=required_version,
            import_path=import_path or name
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
            def parse_version(v):
                parts = []
                for p in v.split(".")[:3]:
                    try:
                        parts.append(int(''.join(c for c in p if c.isdigit())))
                    except:
                        parts.append(0)
                return parts
            
            v1_parts = parse_version(v1)
            v2_parts = parse_version(v2)
            
            for a, b in zip(v1_parts, v2_parts):
                if a > b:
                    return 1
                elif a < b:
                    return -1
            return 0
        except:
            return 0
    
    def install_dependency(self, name: str, version: Optional[str] = None) -> bool:
        try:
            package = f"{name}=={version}" if version else name
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", package],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            self.check_dependency(name)
            return self.dependencies[name].status == DependencyStatus.INSTALLED
        except subprocess.CalledProcessError:
            return False
    
    def install_missing(self, auto_fix_version: bool = False) -> bool:
        all_ok = True
        
        for name in self.get_missing_dependencies():
            if not self.install_dependency(name):
                all_ok = False
        
        if auto_fix_version:
            for name in self.get_version_mismatches():
                dep = self.dependencies[name]
                if self.install_dependency(name, dep.required_version):
                    all_ok = False
        
        return all_ok
    
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
    
    def is_ready(self) -> bool:
        self.check_all()
        return (
            len(self.get_missing_dependencies()) == 0 and
            len(self.get_version_mismatches()) == 0
        )
    
    def get_summary(self) -> Dict:
        self.check_all()
        return {
            'total': len(self.dependencies),
            'installed': len([d for d in self.dependencies.values() 
                            if d.status == DependencyStatus.INSTALLED]),
            'missing': len(self.get_missing_dependencies()),
            'version_mismatch': len(self.get_version_mismatches()),
            'details': {
                name: {
                    'status': dep.status.value,
                    'installed': dep.installed_version,
                    'required': dep.required_version
                }
                for name, dep in self.dependencies.items()
            }
        }
