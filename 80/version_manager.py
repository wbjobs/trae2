#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
版本管理模块
整合版本比对、固件版本管理、升级兼容性检查
"""

import os
import re
import json
import logging
from typing import List, Optional, Tuple, Dict
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class FirmwareVersion:
    version: str
    major: int = 0
    minor: int = 0
    patch: int = 0
    build: int = 0
    prerelease: Optional[str] = None
    metadata: Optional[str] = None
    file_path: Optional[str] = None
    file_size: int = 0
    file_hash: str = ""
    release_notes: str = ""
    release_date: str = ""
    is_stable: bool = True
    compatible_hardware: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        self._parse_version()
    
    def _parse_version(self):
        version_str = self.version.strip()
        version_str = re.sub(r'^[vV]', '', version_str)
        
        if '+' in version_str:
            version_str, self.metadata = version_str.split('+', 1)
        
        if '-' in version_str:
            version_str, self.prerelease = version_str.split('-', 1)
        
        parts = version_str.split('.')
        for i, part in enumerate(parts[:4]):
            if part.isdigit():
                if i == 0:
                    self.major = int(part)
                elif i == 1:
                    self.minor = int(part)
                elif i == 2:
                    self.patch = int(part)
                elif i == 3:
                    self.build = int(part)
        
        if self.prerelease:
            stable_keywords = ['release', 'stable', 'final', 'ga']
            self.is_stable = any(kw in self.prerelease.lower() for kw in stable_keywords)
        else:
            self.is_stable = True
    
    def to_tuple(self) -> Tuple[int, int, int, int]:
        return (self.major, self.minor, self.patch, self.build)
    
    def __str__(self) -> str:
        return self.version
    
    def __repr__(self) -> str:
        return f"FirmwareVersion('{self.version}')"


class Version:
    PRERELEASE_ORDER = {
        'alpha': 0, 'a': 0,
        'beta': 1, 'b': 1,
        'pre': 2,
        'rc': 3,
        'release': 4, 'r': 4,
        'stable': 5, 's': 5,
        'final': 6,
        'ga': 7,
    }
    
    def __init__(self, version_str: str):
        self._original = version_str
        self._parts = self._parse_version(version_str)
    
    def _parse_version(self, version_str: str) -> List[Tuple[int, str]]:
        parts = []
        version_str = version_str.strip()
        version_str = re.sub(r'^[vV]', '', version_str)
        
        if '+' in version_str:
            version_str = version_str[:version_str.index('+')]
        
        version_str = re.sub(r'[-_]', '.', version_str)
        raw_tokens = re.findall(r'(\d+|[a-zA-Z]+|\.)', version_str)
        
        num_buffer = []
        str_buffer = []
        
        for token in raw_tokens:
            if token == '.':
                if num_buffer:
                    parts.append((int(''.join(num_buffer)), ''))
                    num_buffer = []
                if str_buffer:
                    parts.append((0, ''.join(str_buffer).lower()))
                    str_buffer = []
            elif token.isdigit():
                if str_buffer:
                    parts.append((0, ''.join(str_buffer).lower()))
                    str_buffer = []
                num_buffer.append(token)
            else:
                if num_buffer:
                    parts.append((int(''.join(num_buffer)), ''))
                    num_buffer = []
                str_buffer.append(token)
        
        if num_buffer:
            parts.append((int(''.join(num_buffer)), ''))
        if str_buffer:
            parts.append((0, ''.join(str_buffer).lower()))
        
        if not parts:
            parts = [(0, '')]
        
        while len(parts) < 3:
            parts.append((0, ''))
        
        return parts
    
    def _compare_string_part(self, a: str, b: str) -> int:
        if not a and not b:
            return 0
        if not a:
            return 1
        if not b:
            return -1
        if a == b:
            return 0
        
        a_lower = a.lower()
        b_lower = b.lower()
        
        a_is_numeric = a_lower.isdigit()
        b_is_numeric = b_lower.isdigit()
        
        if a_is_numeric and b_is_numeric:
            return int(a_lower) - int(b_lower)
        if a_is_numeric:
            return -1
        if b_is_numeric:
            return 1
        
        a_rank = self.PRERELEASE_ORDER.get(a_lower, None)
        b_rank = self.PRERELEASE_ORDER.get(b_lower, None)
        
        if a_rank is not None and b_rank is not None:
            return a_rank - b_rank
        if a_rank is not None:
            return -1
        if b_rank is not None:
            return 1
        
        return -1 if a_lower < b_lower else 1
    
    def _compare(self, other: 'Version') -> int:
        max_len = max(len(self._parts), len(other._parts))
        self_parts = self._parts + [(0, '')] * (max_len - len(self._parts))
        other_parts = other._parts + [(0, '')] * (max_len - len(other._parts))
        
        for i in range(max_len):
            self_num, self_str = self_parts[i]
            other_num, other_str = other_parts[i]
            
            if self_num != other_num:
                return self_num - other_num
            if self_str != other_str:
                return self._compare_string_part(self_str, other_str)
        
        return 0
    
    def __lt__(self, other: 'Version') -> bool:
        return self._compare(other) < 0
    def __le__(self, other: 'Version') -> bool:
        return self._compare(other) <= 0
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return False
        return self._compare(other) == 0
    def __ne__(self, other: object) -> bool:
        if not isinstance(other, Version):
            return True
        return self._compare(other) != 0
    def __gt__(self, other: 'Version') -> bool:
        return self._compare(other) > 0
    def __ge__(self, other: 'Version') -> bool:
        return self._compare(other) >= 0
    def __str__(self) -> str:
        return self._original
    def __repr__(self) -> str:
        return f"Version('{self._original}')"
    
    @property
    def major(self) -> int:
        return self._parts[0][0] if self._parts else 0
    @property
    def minor(self) -> int:
        return self._parts[1][0] if len(self._parts) > 1 else 0
    @property
    def patch(self) -> int:
        return self._parts[2][0] if len(self._parts) > 2 else 0
    @property
    def build(self) -> int:
        return self._parts[3][0] if len(self._parts) > 3 else 0


class VersionConstraint:
    def __init__(self, constraint_str: str):
        self._original = constraint_str
        self._constraints = self._parse_constraint(constraint_str)
    
    def _parse_constraint(self, constraint_str: str) -> List[Tuple[str, Version]]:
        constraints = []
        for part in constraint_str.split(','):
            part = part.strip()
            if not part:
                continue
            match = re.match(r'^([<>]=?|==?|!=|~|\^)?\s*(.+)$', part)
            if match:
                op = match.group(1) or '=='
                if op == '=':
                    op = '=='
                constraints.append((op, Version(match.group(2).strip())))
        return constraints
    
    def is_satisfied(self, version: Version) -> bool:
        for op, constraint_version in self._constraints:
            if op == '==':
                if version != constraint_version:
                    return False
            elif op == '!=':
                if version == constraint_version:
                    return False
            elif op == '>':
                if version <= constraint_version:
                    return False
            elif op == '>=':
                if version < constraint_version:
                    return False
            elif op == '<':
                if version >= constraint_version:
                    return False
            elif op == '<=':
                if version > constraint_version:
                    return False
            elif op == '~':
                if version.major != constraint_version.major or \
                   version.minor != constraint_version.minor or \
                   version < constraint_version:
                    return False
            elif op == '^':
                if version.major != constraint_version.major or \
                   version < constraint_version:
                    return False
        return True
    
    def __str__(self) -> str:
        return self._original


class VersionManager:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self._firmware_repo: Dict[str, FirmwareVersion] = {}
        self._load_firmware_repo()
    
    def _load_firmware_repo(self):
        repo_file = os.path.join(
            os.path.dirname(self.config.firmware_cache_dir),
            'firmware_repo.json'
        )
        
        try:
            if os.path.exists(repo_file):
                with open(repo_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for version_str, fw_data in data.items():
                        self._firmware_repo[version_str] = FirmwareVersion(**fw_data)
        except Exception as e:
            self.logger.warning(f"加载固件仓库失败: {e}")
    
    def _save_firmware_repo(self):
        repo_file = os.path.join(
            os.path.dirname(self.config.firmware_cache_dir),
            'firmware_repo.json'
        )
        
        try:
            os.makedirs(os.path.dirname(repo_file), exist_ok=True)
            data = {
                version: fw.__dict__
                for version, fw in self._firmware_repo.items()
            }
            with open(repo_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        except Exception as e:
            self.logger.error(f"保存固件仓库失败: {e}")
    
    def compare(self, version1: str, version2: str) -> int:
        v1 = Version(version1)
        v2 = Version(version2)
        if v1 < v2:
            return -1
        elif v1 > v2:
            return 1
        return 0
    
    def is_newer(self, version1: str, version2: str) -> bool:
        return Version(version1) > Version(version2)
    
    def is_older(self, version1: str, version2: str) -> bool:
        return Version(version1) < Version(version2)
    
    def is_equal(self, version1: str, version2: str) -> bool:
        return Version(version1) == Version(version2)
    
    def satisfies_constraint(self, version: str, constraint: str) -> bool:
        return VersionConstraint(constraint).is_satisfied(Version(version))
    
    def check_upgrade_type(self, from_version: str, to_version: str) -> str:
        from_v = Version(from_version)
        to_v = Version(to_version)
        
        if to_v <= from_v:
            return 'none'
        if to_v.major != from_v.major:
            return 'major'
        elif to_v.minor != from_v.minor:
            return 'minor'
        elif to_v.patch != from_v.patch:
            return 'patch'
        else:
            return 'build'
    
    def is_safe_upgrade(self, from_version: str, to_version: str,
                        allow_major: bool = False,
                        allow_downgrade: bool = False,
                        allow_unstable: bool = False) -> Tuple[bool, str]:
        from_v = Version(from_version)
        to_v = Version(to_version)
        to_fw = self._firmware_repo.get(to_version)
        
        if to_v < from_v:
            if not allow_downgrade and not self.config.get('allow_downgrade', False):
                return False, "不允许降级"
            return True, "允许降级"
        
        if to_v == from_v:
            return False, "版本相同，无需升级"
        
        if to_v.major != from_v.major and not allow_major:
            return False, "不允许跨主版本升级"
        
        if to_fw and not to_fw.is_stable and not allow_unstable:
            if not self.config.get('allow_unstable_versions', False):
                return False, "目标版本为不稳定版本"
        
        return True, "安全升级"
    
    def get_upgrade_path(self, from_version: str, to_version: str,
                         available_versions: List[str] = None) -> List[str]:
        if available_versions is None:
            available_versions = list(self._firmware_repo.keys())
        
        if not available_versions:
            return [to_version]
        
        from_v = Version(from_version)
        to_v = Version(to_version)
        
        if to_v <= from_v:
            return []
        
        versions = sorted([Version(v) for v in available_versions])
        path = []
        
        for v in versions:
            if from_v < v <= to_v:
                path.append(str(v))
        
        if str(to_v) not in path:
            path.append(to_version)
        
        return path
    
    def register_firmware(self, firmware_path: str, version: str,
                          release_notes: str = "",
                          compatible_hardware: List[str] = None) -> Optional[FirmwareVersion]:
        try:
            from utils import calculate_file_hash
            
            if not os.path.exists(firmware_path):
                self.logger.error(f"固件文件不存在: {firmware_path}")
                return None
            
            fw = FirmwareVersion(
                version=version,
                file_path=firmware_path,
                file_size=os.path.getsize(firmware_path),
                file_hash=calculate_file_hash(firmware_path),
                release_notes=release_notes,
                release_date=datetime.now().isoformat(),
                compatible_hardware=compatible_hardware or []
            )
            
            self._firmware_repo[version] = fw
            self._save_firmware_repo()
            
            self.logger.info(f"固件已注册: {version}")
            return fw
            
        except Exception as e:
            self.logger.error(f"注册固件失败: {e}")
            return None
    
    def get_firmware_info(self, version: str) -> Optional[FirmwareVersion]:
        return self._firmware_repo.get(version)
    
    def get_all_firmware(self) -> List[FirmwareVersion]:
        return sorted(
            self._firmware_repo.values(),
            key=lambda fw: Version(fw.version),
            reverse=True
        )
    
    def get_latest_firmware(self, constraint: str = None,
                            only_stable: bool = True) -> Optional[FirmwareVersion]:
        firmware_list = self.get_all_firmware()
        
        if only_stable:
            firmware_list = [fw for fw in firmware_list if fw.is_stable]
        
        if constraint:
            firmware_list = [
                fw for fw in firmware_list
                if self.satisfies_constraint(fw.version, constraint)
            ]
        
        return firmware_list[0] if firmware_list else None
    
    def get_version_info(self, version: str) -> dict:
        v = Version(version)
        return {
            'original': version,
            'major': v.major,
            'minor': v.minor,
            'patch': v.patch,
            'build': v.build,
        }
    
    def parse_version(self, version_str: str) -> dict:
        result = {
            'raw': version_str,
            'valid': False,
            'major': 0,
            'minor': 0,
            'patch': 0,
            'build': 0,
            'prerelease': None,
            'metadata': None
        }
        
        try:
            match = re.match(
                r'^[vV]?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$',
                version_str.strip()
            )
            
            if match:
                result['valid'] = True
                result['major'] = int(match.group(1))
                result['minor'] = int(match.group(2))
                result['patch'] = int(match.group(3))
                if match.group(4):
                    result['build'] = int(match.group(4))
                result['prerelease'] = match.group(5)
                result['metadata'] = match.group(6)
            else:
                v = Version(version_str)
                result['valid'] = True
                result['major'] = v.major
                result['minor'] = v.minor
                result['patch'] = v.patch
                result['build'] = v.build
        
        except Exception as e:
            self.logger.warning(f"解析版本号失败 '{version_str}': {e}")
        
        return result
    
    def find_latest(self, versions: List[str]) -> Optional[str]:
        if not versions:
            return None
        version_objs = [Version(v) for v in versions]
        return str(max(version_objs))
    
    def find_oldest(self, versions: List[str]) -> Optional[str]:
        if not versions:
            return None
        version_objs = [Version(v) for v in versions]
        return str(min(version_objs))
    
    def filter_versions(self, versions: List[str], constraint: str) -> List[str]:
        c = VersionConstraint(constraint)
        return [v for v in versions if c.is_satisfied(Version(v))]
