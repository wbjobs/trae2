#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
版本比对模块
支持语义化版本号、自定义版本号格式比对
"""

import re
import logging
from typing import List, Optional, Tuple


class Version:
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
                    num = int(''.join(num_buffer))
                    parts.append((num, ''))
                    num_buffer = []
                if str_buffer:
                    s = ''.join(str_buffer).lower()
                    parts.append((0, s))
                    str_buffer = []
            elif token.isdigit():
                if str_buffer:
                    s = ''.join(str_buffer).lower()
                    parts.append((0, s))
                    str_buffer = []
                num_buffer.append(token)
            else:
                if num_buffer:
                    num = int(''.join(num_buffer))
                    parts.append((num, ''))
                    num_buffer = []
                str_buffer.append(token)
        
        if num_buffer:
            num = int(''.join(num_buffer))
            parts.append((num, ''))
        if str_buffer:
            s = ''.join(str_buffer).lower()
            parts.append((0, s))
        
        if not parts:
            parts = [(0, '')]
        
        while len(parts) < 3:
            parts.append((0, ''))
        
        return parts
    
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
    
    def _normalize_version_parts(self, parts: List[Tuple[int, str]]) -> List[Tuple[int, str]]:
        normalized = []
        for num, s in parts:
            if num == 0 and s and normalized and normalized[-1][1] == '':
                normalized[-1] = (normalized[-1][0], s)
            else:
                normalized.append((num, s))
        return normalized
    
    def _compare_string_part(self, a: str, b: str) -> int:
        if not a and not b:
            return 0
        
        if not a:
            return 1
        if not b:
            return -1
        
        if a == b:
            return 0
        
        prerelease_order = {
            'alpha': 0,
            'a': 0,
            'beta': 1,
            'b': 1,
            'pre': 2,
            'rc': 3,
            'release': 4,
            'r': 4,
            'stable': 5,
            's': 5,
            'final': 6,
            'ga': 7,
        }
        
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
        
        a_rank = prerelease_order.get(a_lower, None)
        b_rank = prerelease_order.get(b_lower, None)
        
        if a_rank is not None and b_rank is not None:
            return a_rank - b_rank
        
        if a_rank is not None:
            return -1
        if b_rank is not None:
            return 1
        
        if a_lower < b_lower:
            return -1
        elif a_lower > b_lower:
            return 1
        return 0
    
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
    
    def is_compatible(self, other: 'Version') -> bool:
        return self.major == other.major
    
    def is_upgrade(self, other: 'Version') -> bool:
        return self > other
    
    def is_downgrade(self, other: 'Version') -> bool:
        return self < other


class VersionConstraint:
    def __init__(self, constraint_str: str):
        self._original = constraint_str
        self._constraints = self._parse_constraint(constraint_str)
    
    def _parse_constraint(self, constraint_str: str) -> List[Tuple[str, Version]]:
        constraints = []
        
        parts = constraint_str.split(',')
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            match = re.match(r'^([<>]=?|==?|!=|~|\^)?\s*(.+)$', part)
            if match:
                op = match.group(1) or '=='
                version_str = match.group(2).strip()
                
                if op == '=':
                    op = '=='
                
                constraints.append((op, Version(version_str)))
        
        return constraints
    
    def is_satisfied(self, version: Version) -> bool:
        for op, constraint_version in self._constraints:
            if not self._check_constraint(version, op, constraint_version):
                return False
        return True
    
    def _check_constraint(self, version: Version, op: str, constraint: Version) -> bool:
        if op == '==':
            return version == constraint
        elif op == '!=':
            return version != constraint
        elif op == '>':
            return version > constraint
        elif op == '>=':
            return version >= constraint
        elif op == '<':
            return version < constraint
        elif op == '<=':
            return version <= constraint
        elif op == '~':
            return version.major == constraint.major and version.minor == constraint.minor and version >= constraint
        elif op == '^':
            return version.major == constraint.major and version >= constraint
        return False
    
    def __str__(self) -> str:
        return self._original


class VersionComparator:
    def __init__(self, config=None):
        self.config = config
        self.logger = logging.getLogger(__name__)
    
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
        v = Version(version)
        c = VersionConstraint(constraint)
        return c.is_satisfied(v)
    
    def find_latest(self, versions: List[str]) -> Optional[str]:
        if not versions:
            return None
        
        version_objs = [Version(v) for v in versions]
        latest = max(version_objs)
        return latest._original
    
    def find_oldest(self, versions: List[str]) -> Optional[str]:
        if not versions:
            return None
        
        version_objs = [Version(v) for v in versions]
        oldest = min(version_objs)
        return oldest._original
    
    def filter_versions(self, versions: List[str], constraint: str) -> List[str]:
        c = VersionConstraint(constraint)
        return [v for v in versions if c.is_satisfied(Version(v))]
    
    def get_version_info(self, version: str) -> dict:
        v = Version(version)
        return {
            'original': version,
            'major': v.major,
            'minor': v.minor,
            'patch': v.patch,
            'build': v.build,
        }
    
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
                        allow_major: bool = False) -> bool:
        from_v = Version(from_version)
        to_v = Version(to_version)
        
        if to_v <= from_v:
            return False
        
        if not allow_major and to_v.major != from_v.major:
            return False
        
        return True
    
    def parse_firmware_version(self, version_str: str) -> dict:
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
            version_str = version_str.strip()
            
            match = re.match(
                r'^[vV]?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$',
                version_str
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
