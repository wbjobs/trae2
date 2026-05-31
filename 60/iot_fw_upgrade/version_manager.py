#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""版本管理模块

独立的版本管理功能，包括版本解析、验证、排序、兼容性检查等。
"""

import re
import logging
import json
import os
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class VersionStatus(Enum):
    """版本状态"""
    DEV = "dev"
    ALPHA = "alpha"
    BETA = "beta"
    RC = "rc"
    STABLE = "stable"


class VersionCompatibility(Enum):
    """版本兼容性"""
    COMPATIBLE = "compatible"
    MINOR_CHANGE = "minor_change"
    MAJOR_CHANGE = "major_change"
    INCOMPATIBLE = "incompatible"
    UNKNOWN = "unknown"


@dataclass
class VersionInfo:
    """版本信息"""
    version: str
    major: int = 0
    minor: int = 0
    patch: int = 0
    build: int = 0
    prerelease: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        self._parse_version()

    def _parse_version(self):
        """解析版本号 - 支持多种格式"""
        version_clean = self.version.strip().lstrip('vV')

        patterns = [
            r'^(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)(?:\.(?P<build>\d+))?(?:-(?P<pre>[a-zA-Z0-9.]+))?$',
            r'^(?P<major>\d+)\.(?P<minor>\d+)(?:\.(?P<patch>\d+))?(?:\.(?P<build>\d+))?(?:-(?P<pre>[a-zA-Z0-9.]+))?$',
            r'^(?P<major>\d+)(?:\.(?P<minor>\d+))?(?:\.(?P<patch>\d+))?(?:\.(?P<build>\d+))?$',
        ]

        for pattern in patterns:
            match = re.match(pattern, version_clean)
            if match:
                self.major = int(match.group('major'))
                self.minor = int(match.group('minor')) if match.group('minor') else 0
                self.patch = int(match.group('patch')) if match.group('patch') else 0
                if match.group('build'):
                    self.build = int(match.group('build'))
                if match.group('pre'):
                    self.prerelease = match.group('pre')
                return

        logger.warning(f"无法解析版本号: {self.version}，使用默认值 0.0.0")
        self.major = 0
        self.minor = 0
        self.patch = 0
        self.build = 0

    def to_tuple(self) -> Tuple[int, int, int, int]:
        return (self.major, self.minor, self.patch, self.build)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "major": self.major,
            "minor": self.minor,
            "patch": self.patch,
            "build": self.build,
            "prerelease": self.prerelease,
            "metadata": self.metadata
        }

    @property
    def is_stable(self) -> bool:
        """是否为稳定版本"""
        if self.prerelease:
            return False
        return True

    @property
    def status(self) -> VersionStatus:
        """获取版本状态"""
        if not self.prerelease:
            return VersionStatus.STABLE
        pre_lower = self.prerelease.lower()
        if 'alpha' in pre_lower:
            return VersionStatus.ALPHA
        elif 'beta' in pre_lower:
            return VersionStatus.BETA
        elif 'rc' in pre_lower:
            return VersionStatus.RC
        elif 'dev' in pre_lower:
            return VersionStatus.DEV
        return VersionStatus.ALPHA

    @property
    def release_type(self) -> str:
        """获取发布类型"""
        if self.major == 0:
            return "initial"
        if self.minor % 2 == 1:
            return "feature"
        return "stable"

    def compare(self, other: 'VersionInfo') -> int:
        """比较版本"""
        t1 = self.to_tuple()
        t2 = other.to_tuple()
        if t1 < t2:
            return -1
        elif t1 > t2:
            return 1
        else:
            if self.prerelease and not other.prerelease:
                return -1
            elif not self.prerelease and other.prerelease:
                return 1
            elif self.prerelease and other.prerelease:
                if self.prerelease < other.prerelease:
                    return -1
                elif self.prerelease > other.prerelease:
                    return 1
            return 0

    def __lt__(self, other: 'VersionInfo') -> bool:
        return self.compare(other) < 0

    def __le__(self, other: 'VersionInfo') -> bool:
        return self.compare(other) <= 0

    def __gt__(self, other: 'VersionInfo') -> bool:
        return self.compare(other) > 0

    def __ge__(self, other: 'VersionInfo') -> bool:
        return self.compare(other) >= 0

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, VersionInfo):
            return NotImplemented
        return self.compare(other) == 0

    def __hash__(self):
        return hash(self.to_tuple() + (self.prerelease or '',))

    def __str__(self) -> str:
        return self.version

    def __repr__(self) -> str:
        return f"VersionInfo('{self.version}')"


@dataclass
class FirmwareVersion:
    """固件版本信息"""
    version: VersionInfo
    path: Optional[str] = None
    size: int = 0
    md5: str = ""
    sha256: str = ""
    release_notes: str = ""
    changelog: List[str] = field(default_factory=list)
    min_upgrade_version: Optional[VersionInfo] = None
    incompatible_versions: List[VersionInfo] = field(default_factory=list)
    supported_models: List[str] = field(default_factory=list)
    is_critical: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": str(self.version),
            "path": self.path,
            "size": self.size,
            "md5": self.md5,
            "sha256": self.sha256,
            "release_notes": self.release_notes,
            "changelog": self.changelog,
            "min_upgrade_version": str(self.min_upgrade_version) if self.min_upgrade_version else None,
            "incompatible_versions": [str(v) for v in self.incompatible_versions],
            "supported_models": self.supported_models,
            "is_critical": self.is_critical
        }


@dataclass
class UpgradePath:
    """升级路径"""
    from_version: VersionInfo
    to_version: VersionInfo
    is_direct: bool = True
    intermediate_versions: List[VersionInfo] = field(default_factory=list)
    estimated_time: int = 0
    risk_level: str = "low"


class VersionManager:
    """版本管理器"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._firmware_store = config.get("firmware_store", "./firmware")
        self._version_db: Dict[str, FirmwareVersion] = {}
        self._load_version_db()

    def _load_version_db(self):
        """加载版本数据库"""
        db_path = os.path.join(self._firmware_store, "versions.json")
        if os.path.exists(db_path):
            try:
                with open(db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for version_str, fw_data in data.items():
                    self._version_db[version_str] = self._dict_to_firmware_version(fw_data)
                logger.info(f"已加载 {len(self._version_db)} 个版本信息")
            except Exception as e:
                logger.warning(f"加载版本数据库失败: {e}")

    def _save_version_db(self):
        """保存版本数据库"""
        try:
            os.makedirs(self._firmware_store, exist_ok=True)
            db_path = os.path.join(self._firmware_store, "versions.json")
            data = {k: v.to_dict() for k, v in self._version_db.items()}
            with open(db_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"保存版本数据库失败: {e}")

    def _dict_to_firmware_version(self, data: Dict[str, Any]) -> FirmwareVersion:
        """字典转固件版本对象"""
        fw = FirmwareVersion(
            version=VersionInfo(data["version"]),
            path=data.get("path"),
            size=data.get("size", 0),
            md5=data.get("md5", ""),
            sha256=data.get("sha256", ""),
            release_notes=data.get("release_notes", ""),
            changelog=data.get("changelog", []),
            is_critical=data.get("is_critical", False)
        )
        if data.get("min_upgrade_version"):
            fw.min_upgrade_version = VersionInfo(data["min_upgrade_version"])
        for v in data.get("incompatible_versions", []):
            fw.incompatible_versions.append(VersionInfo(v))
        fw.supported_models = data.get("supported_models", [])
        return fw

    def parse_version(self, version_str: str) -> VersionInfo:
        """解析版本字符串"""
        return VersionInfo(version_str)

    def compare_versions(self, v1: str, v2: str) -> int:
        """比较两个版本字符串"""
        return VersionInfo(v1).compare(VersionInfo(v2))

    def sort_versions(self, versions: List[str], reverse: bool = False) -> List[str]:
        """对版本列表排序"""
        version_infos = [VersionInfo(v) for v in versions]
        version_infos.sort(reverse=reverse)
        return [str(v) for v in version_infos]

    def get_latest_version(self, versions: List[str], include_prerelease: bool = False) -> Optional[str]:
        """获取最新版本"""
        if not versions:
            return None

        version_infos = [VersionInfo(v) for v in versions]
        if not include_prerelease:
            version_infos = [v for v in version_infos if v.is_stable]

        if not version_infos:
            return None

        return str(max(version_infos))

    def check_compatibility(self, from_version: str, to_version: str,
                           device_model: Optional[str] = None) -> VersionCompatibility:
        """检查版本兼容性"""
        from_ver = VersionInfo(from_version)
        to_ver = VersionInfo(to_version)

        fw = self._version_db.get(str(to_ver))
        if fw:
            if fw.min_upgrade_version and from_ver < fw.min_upgrade_version:
                return VersionCompatibility.INCOMPATIBLE

            for incompat_ver in fw.incompatible_versions:
                if from_ver == incompat_ver:
                    return VersionCompatibility.INCOMPATIBLE

            if device_model and fw.supported_models and device_model not in fw.supported_models:
                return VersionCompatibility.INCOMPATIBLE

        if from_ver.major != to_ver.major:
            return VersionCompatibility.MAJOR_CHANGE
        elif from_ver.minor != to_ver.minor:
            return VersionCompatibility.MINOR_CHANGE
        else:
            return VersionCompatibility.COMPATIBLE

    def get_upgrade_path(self, from_version: str, to_version: str) -> Optional[UpgradePath]:
        """获取升级路径"""
        from_ver = VersionInfo(from_version)
        to_ver = VersionInfo(to_version)

        if from_ver >= to_ver:
            return None

        compatibility = self.check_compatibility(from_version, to_version)
        if compatibility == VersionCompatibility.INCOMPATIBLE:
            intermediate = self._find_intermediate_versions(from_ver, to_ver)
            if intermediate:
                return UpgradePath(
                    from_version=from_ver,
                    to_version=to_ver,
                    is_direct=False,
                    intermediate_versions=intermediate,
                    estimated_time=len(intermediate) * 300,
                    risk_level="medium"
                )
            return None

        return UpgradePath(
            from_version=from_ver,
            to_version=to_ver,
            is_direct=True,
            estimated_time=300,
            risk_level="low"
        )

    def _find_intermediate_versions(self, from_ver: VersionInfo,
                                    to_ver: VersionInfo) -> List[VersionInfo]:
        """查找中间升级版本"""
        available = []
        for version_str in self._version_db.keys():
            ver = VersionInfo(version_str)
            if from_ver < ver < to_ver:
                available.append(ver)

        available.sort()

        result = []
        current = from_ver

        for ver in available:
            compatibility = self.check_compatibility(str(current), str(ver))
            if compatibility != VersionCompatibility.INCOMPATIBLE:
                result.append(ver)
                current = ver

        if result and current >= from_ver:
            return result
        return []

    def is_version_exists(self, version: str) -> bool:
        """检查版本是否存在"""
        return str(VersionInfo(version)) in self._version_db

    def add_firmware_version(self, fw: FirmwareVersion):
        """添加固件版本"""
        self._version_db[str(fw.version)] = fw
        self._save_version_db()

    def remove_firmware_version(self, version: str):
        """删除固件版本"""
        ver_str = str(VersionInfo(version))
        if ver_str in self._version_db:
            del self._version_db[ver_str]
            self._save_version_db()

    def get_firmware_version(self, version: str) -> Optional[FirmwareVersion]:
        """获取固件版本信息"""
        return self._version_db.get(str(VersionInfo(version)))

    def list_all_versions(self, model: Optional[str] = None) -> List[str]:
        """列出所有版本"""
        versions = list(self._version_db.keys())
        if model:
            versions = [
                v for v in versions
                if not self._version_db[v].supported_models
                or model in self._version_db[v].supported_models
            ]
        return self.sort_versions(versions, reverse=True)

    def validate_version_format(self, version_str: str) -> bool:
        """验证版本格式"""
        try:
            ver = VersionInfo(version_str)
            return ver.major > 0 or ver.minor > 0 or ver.patch > 0
        except Exception:
            return False

    def get_version_diff(self, old_version: str, new_version: str) -> Dict[str, Any]:
        """获取版本差异信息"""
        old_ver = VersionInfo(old_version)
        new_ver = VersionInfo(new_version)

        old_fw = self._version_db.get(str(old_ver))
        new_fw = self._version_db.get(str(new_ver))

        result = {
            "old_version": str(old_ver),
            "new_version": str(new_ver),
            "is_upgrade": new_ver > old_ver,
            "change_type": self._get_change_type(old_ver, new_ver),
            "compatibility": self.check_compatibility(old_version, new_version).value
        }

        if new_fw:
            result["new_release_notes"] = new_fw.release_notes
            result["new_changelog"] = new_fw.changelog
            result["is_critical"] = new_fw.is_critical

        if old_fw and new_fw:
            result["size_change"] = new_fw.size - old_fw.size
            result["size_change_percent"] = (
                (new_fw.size - old_fw.size) / old_fw.size * 100
                if old_fw.size > 0 else 0
            )

        return result

    def _get_change_type(self, old_ver: VersionInfo, new_ver: VersionInfo) -> str:
        """获取变更类型"""
        if new_ver.major > old_ver.major:
            return "major"
        elif new_ver.minor > old_ver.minor:
            return "minor"
        elif new_ver.patch > old_ver.patch:
            return "patch"
        elif new_ver.build > old_ver.build:
            return "build"
        elif new_ver == old_ver:
            return "same"
        else:
            return "downgrade"

    def check_rollback_available(self, current_version: str,
                                target_version: str) -> Tuple[bool, str]:
        """检查是否可以回滚"""
        current = VersionInfo(current_version)
        target = VersionInfo(target_version)

        if target >= current:
            return False, "目标版本必须低于当前版本"

        target_fw = self._version_db.get(str(target))
        if target_fw and not target_fw.metadata.get("allow_rollback", True):
            return False, "该版本不支持回滚"

        compatibility = self.check_compatibility(str(current), str(target))
        if compatibility == VersionCompatibility.MAJOR_CHANGE:
            return False, "主版本降级可能存在兼容性问题"

        return True, "可以回滚"

    def get_version_info(self, version: str) -> Optional[Dict[str, Any]]:
        """获取版本详细信息"""
        ver = VersionInfo(version)
        fw = self._version_db.get(str(ver))

        if not fw:
            return None

        return {
            "version": str(ver),
            "major": ver.major,
            "minor": ver.minor,
            "patch": ver.patch,
            "build": ver.build,
            "prerelease": ver.prerelease,
            "status": ver.status.value,
            "is_stable": ver.is_stable,
            "size": fw.size,
            "md5": fw.md5,
            "sha256": fw.sha256,
            "release_notes": fw.release_notes,
            "changelog": fw.changelog,
            "supported_models": fw.supported_models,
            "is_critical": fw.is_critical
        }
