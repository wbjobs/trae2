#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""版本比对模块

用于比对固件版本差异，生成版本差异报告。
修复：修正changed_bytes计算逻辑，优化版本提取，支持固件内容解析
"""

import os
import logging
import json
import re
import hashlib
import struct
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class VersionInfo:
    """版本信息"""
    version: str
    major: int = 0
    minor: int = 0
    patch: int = 0
    build: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        self._parse_version()

    def _parse_version(self):
        """解析版本号 - 支持多种格式"""
        version_clean = self.version.strip().lstrip('vV')

        patterns = [
            r'^(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)(?:\.(?P<build>\d+))?(?:-(?P<pre>[a-zA-Z0-9]+))?$',
            r'^(?P<major>\d+)\.(?P<minor>\d+)(?:\.(?P<patch>\d+))?(?:\.(?P<build>\d+))?(?:-(?P<pre>[a-zA-Z0-9]+))?$',
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
                    self.metadata['prerelease'] = match.group('pre')
                return

        logger.warning(f"无法解析版本号: {self.version}，使用默认值 0.0.0")
        self.major = 0
        self.minor = 0
        self.patch = 0
        self.build = 0

    def to_tuple(self) -> Tuple[int, int, int, int]:
        return (self.major, self.minor, self.patch, self.build)

    def __lt__(self, other: 'VersionInfo') -> bool:
        return self.to_tuple() < other.to_tuple()

    def __le__(self, other: 'VersionInfo') -> bool:
        return self.to_tuple() <= other.to_tuple()

    def __gt__(self, other: 'VersionInfo') -> bool:
        return self.to_tuple() > other.to_tuple()

    def __ge__(self, other: 'VersionInfo') -> bool:
        return self.to_tuple() >= other.to_tuple()

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, VersionInfo):
            return NotImplemented
        return self.to_tuple() == other.to_tuple()

    def __str__(self) -> str:
        return self.version

    def __hash__(self):
        return hash(self.to_tuple())


@dataclass
class FirmwareInfo:
    """固件信息"""
    path: str
    size: int
    md5: str
    sha256: str
    version: VersionInfo
    build_time: Optional[datetime] = None
    sections: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "path": self.path,
            "size": self.size,
            "md5": self.md5,
            "sha256": self.sha256,
            "version": str(self.version),
            "build_time": self.build_time.isoformat() if self.build_time else None,
            "sections": self.sections
        }


@dataclass
class DiffSegment:
    """差异段"""
    offset: int
    length: int
    type: str
    old_value: Optional[bytes] = None
    new_value: Optional[bytes] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "offset": self.offset,
            "length": self.length,
            "type": self.type,
            "old_hex": self.old_value.hex() if self.old_value else None,
            "new_hex": self.new_value.hex() if self.new_value else None,
            "old_ascii": self._to_ascii(self.old_value),
            "new_ascii": self._to_ascii(self.new_value)
        }

    def _to_ascii(self, data: Optional[bytes]) -> Optional[str]:
        if not data:
            return None
        try:
            return ''.join(chr(b) if 32 <= b < 127 else '.' for b in data)
        except Exception:
            return None


@dataclass
class CompareResult:
    """比对结果"""
    old_version: VersionInfo
    new_version: VersionInfo
    is_newer: bool
    change_type: str
    size_change: int
    size_change_percent: float
    changed_bytes: int
    changed_percent: float
    segments: List[DiffSegment] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "old_version": str(self.old_version),
            "new_version": str(self.new_version),
            "is_newer": self.is_newer,
            "change_type": self.change_type,
            "size_change": self.size_change,
            "size_change_percent": round(self.size_change_percent, 2),
            "changed_bytes": self.changed_bytes,
            "changed_percent": round(self.changed_percent, 2),
            "segment_count": len(self.segments),
            "segments": [s.to_dict() for s in self.segments[:100]],
            "summary": self.summary
        }


class VersionComparator:
    """版本比对器"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._min_match_length = 8
        self._max_segments = 1000

    def compare(self, old_input: str, new_input: str, detail: bool = False,
                output_path: Optional[str] = None) -> int:
        """
        比对版本

        Args:
            old_input: 旧版本号或固件文件路径
            new_input: 新版本号或固件文件路径
            detail: 是否显示详细差异
            output_path: 输出报告路径

        Returns:
            退出码
        """
        old_is_file = os.path.exists(old_input) and os.path.isfile(old_input)
        new_is_file = os.path.exists(new_input) and os.path.isfile(new_input)

        if old_is_file and new_is_file:
            result = self._compare_files(old_input, new_input, detail)
        elif not old_is_file and not new_is_file:
            result = self._compare_versions(old_input, new_input)
        else:
            logger.error("请同时提供版本号或同时提供固件文件路径")
            return 1

        if not result:
            return 1

        self._print_result(result, detail)

        if output_path:
            try:
                with open(output_path, 'w', encoding='utf-8') as f:
                    json.dump(result.to_dict(), f, indent=2, ensure_ascii=False)
                logger.info(f"比对报告已保存到: {output_path}")
            except Exception as e:
                logger.error(f"保存报告失败: {e}")

        return 0

    def _compare_versions(self, old_version: str, new_version: str) -> CompareResult:
        """
        比对版本号

        Args:
            old_version: 旧版本号
            new_version: 新版本号

        Returns:
            比对结果
        """
        old_ver = VersionInfo(old_version)
        new_ver = VersionInfo(new_version)

        is_newer = new_ver > old_ver
        change_type = self._get_change_type(old_ver, new_ver)

        result = CompareResult(
            old_version=old_ver,
            new_version=new_ver,
            is_newer=is_newer,
            change_type=change_type,
            size_change=0,
            size_change_percent=0,
            changed_bytes=0,
            changed_percent=0
        )

        result.summary = {
            "old_version": str(old_ver),
            "new_version": str(new_ver),
            "old_version_tuple": old_ver.to_tuple(),
            "new_version_tuple": new_ver.to_tuple(),
            "is_newer": is_newer,
            "change_type": change_type,
            "description": self._get_change_description(change_type)
        }

        return result

    def _compare_files(self, old_path: str, new_path: str, detail: bool) -> CompareResult:
        """
        比对固件文件

        Args:
            old_path: 旧固件路径
            new_path: 新固件路径
            detail: 是否分析详细差异

        Returns:
            比对结果
        """
        try:
            old_info = self._analyze_firmware(old_path)
            new_info = self._analyze_firmware(new_path)
        except Exception as e:
            logger.error(f"分析固件失败: {e}")
            return None

        is_newer = new_info.version > old_info.version
        change_type = self._get_change_type(old_info.version, new_info.version)

        size_change = new_info.size - old_info.size
        size_change_percent = (size_change / old_info.size * 100) if old_info.size > 0 else 0

        with open(old_path, 'rb') as f:
            old_data = f.read()

        with open(new_path, 'rb') as f:
            new_data = f.read()

        changed_bytes, segments = self._find_differences(old_data, new_data, detail)

        max_size = max(len(old_data), len(new_data))
        changed_percent = (changed_bytes / max_size * 100) if max_size > 0 else 0

        result = CompareResult(
            old_version=old_info.version,
            new_version=new_info.version,
            is_newer=is_newer,
            change_type=change_type,
            size_change=size_change,
            size_change_percent=size_change_percent,
            changed_bytes=changed_bytes,
            changed_percent=changed_percent,
            segments=segments if detail else []
        )

        result.summary = {
            "old_version": str(old_info.version),
            "new_version": str(new_info.version),
            "old_version_tuple": old_info.version.to_tuple(),
            "new_version_tuple": new_info.version.to_tuple(),
            "old_size": old_info.size,
            "new_size": new_info.size,
            "old_md5": old_info.md5,
            "new_md5": new_info.md5,
            "old_sha256": old_info.sha256,
            "new_sha256": new_info.sha256,
            "is_newer": is_newer,
            "change_type": change_type,
            "description": self._get_change_description(change_type),
            "size_change": size_change,
            "size_change_percent": round(size_change_percent, 2),
            "changed_bytes": changed_bytes,
            "changed_percent": round(changed_percent, 2)
        }

        return result

    def _analyze_firmware(self, firmware_path: str) -> FirmwareInfo:
        """
        分析固件文件

        Args:
            firmware_path: 固件路径

        Returns:
            固件信息
        """
        size = os.path.getsize(firmware_path)

        md5_hash = hashlib.md5()
        sha256_hash = hashlib.sha256()

        with open(firmware_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                md5_hash.update(chunk)
                sha256_hash.update(chunk)

        version = self._extract_version(firmware_path)

        try:
            with open(firmware_path, 'rb') as f:
                header = f.read(1024)
                embedded_version = self._extract_version_from_header(header)
                if embedded_version and embedded_version.version != "0.0.0":
                    version = embedded_version
                    logger.debug(f"从固件头提取版本: {version}")
        except Exception as e:
            logger.debug(f"从固件头提取版本失败: {e}")

        build_time = datetime.fromtimestamp(os.path.getmtime(firmware_path))

        return FirmwareInfo(
            path=firmware_path,
            size=size,
            md5=md5_hash.hexdigest(),
            sha256=sha256_hash.hexdigest(),
            version=version,
            build_time=build_time
        )

    def _extract_version(self, firmware_path: str) -> VersionInfo:
        """
        从固件路径中提取版本

        Args:
            firmware_path: 固件路径

        Returns:
            版本信息
        """
        filename = os.path.basename(firmware_path)

        patterns = [
            r'v?(\d+\.\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9]+)?)',
            r'_v?(\d+\.\d+\.\d+(?:\.\d+)?)',
            r'(\d+\.\d+\.\d+(?:\.\d+)?)',
            r'(\d+\.\d+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, filename)
            if match:
                version_str = match.group(1)
                if not version_str.startswith('v'):
                    version_str = 'v' + version_str
                return VersionInfo(version_str)

        logger.warning(f"无法从文件名提取版本: {filename}，使用默认版本 v0.0.0")
        return VersionInfo("v0.0.0")

    def _extract_version_from_header(self, header: bytes) -> Optional[VersionInfo]:
        """
        从固件头提取版本信息

        Args:
            header: 固件头数据

        Returns:
            版本信息（如果找到）
        """
        try:
            header_str = header.decode('ascii', errors='ignore')

            patterns = [
                r'v?(\d+\.\d+\.\d+(?:\.\d+)?)',
                r'firmware[_-]?version[_-]?[:=]?\s*v?(\d+\.\d+\.\d+)',
                r'version[_-]?[:=]?\s*v?(\d+\.\d+\.\d+)',
                r'FW[_-]?VER[_-]?[:=]?\s*v?(\d+\.\d+\.\d+)',
            ]

            for pattern in patterns:
                match = re.search(pattern, header_str, re.IGNORECASE)
                if match:
                    version_str = match.group(1)
                    if not version_str.startswith('v'):
                        version_str = 'v' + version_str
                    return VersionInfo(version_str)

        except Exception as e:
            logger.debug(f"解析固件头失败: {e}")

        return None

    def _get_change_type(self, old_ver: VersionInfo, new_ver: VersionInfo) -> str:
        """
        获取变更类型

        Args:
            old_ver: 旧版本
            new_ver: 新版本

        Returns:
            变更类型
        """
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

    def _get_change_description(self, change_type: str) -> str:
        """
        获取变更描述

        Args:
            change_type: 变更类型

        Returns:
            描述文本
        """
        descriptions = {
            "major": "主版本升级，包含重大功能变更",
            "minor": "次版本升级，包含新功能",
            "patch": "补丁版本，主要修复Bug",
            "build": "构建版本变更",
            "same": "版本相同",
            "downgrade": "版本降级"
        }
        return descriptions.get(change_type, "未知变更")

    def _find_differences(self, old_data: bytes, new_data: bytes, detail: bool) -> Tuple[int, List[DiffSegment]]:
        """
        查找二进制差异 - 修复计算逻辑

        Args:
            old_data: 旧数据
            new_data: 新数据
            detail: 是否查找详细差异段

        Returns:
            (变更字节数, 差异段列表)
        """
        min_len = min(len(old_data), len(new_data))
        max_len = max(len(old_data), len(new_data))

        changed_bytes = 0

        for i in range(min_len):
            if old_data[i] != new_data[i]:
                changed_bytes += 1

        changed_bytes += abs(len(old_data) - len(new_data))

        if not detail:
            return changed_bytes, []

        segments = []
        i = 0
        segment_count = 0

        while i < min_len and segment_count < self._max_segments:
            if old_data[i] != new_data[i]:
                start = i
                while i < min_len and old_data[i] != new_data[i]:
                    i += 1
                end = i

                seg = DiffSegment(
                    offset=start,
                    length=end - start,
                    type="modified",
                    old_value=old_data[start:min(end, start + 32)],
                    new_value=new_data[start:min(end, start + 32)]
                )
                segments.append(seg)
                segment_count += 1
            else:
                i += 1

        if len(old_data) != len(new_data):
            if len(new_data) > len(old_data):
                segments.append(DiffSegment(
                    offset=len(old_data),
                    length=len(new_data) - len(old_data),
                    type="added",
                    new_value=new_data[len(old_data):len(old_data) + 32]
                ))
            else:
                segments.append(DiffSegment(
                    offset=len(new_data),
                    length=len(old_data) - len(new_data),
                    type="removed",
                    old_value=old_data[len(new_data):len(new_data) + 32]
                ))

        return changed_bytes, segments

    def _print_result(self, result: CompareResult, detail: bool):
        """
        打印比对结果

        Args:
            result: 比对结果
            detail: 是否显示详细信息
        """
        print("\n" + "=" * 60)
        print("版本比对结果")
        print("=" * 60)
        print(f"旧版本: {result.old_version} (tuple: {result.old_version.to_tuple()})")
        print(f"新版本: {result.new_version} (tuple: {result.new_version.to_tuple()})")
        print(f"版本更新: {'是' if result.is_newer else '否'}")
        print(f"变更类型: {result.change_type}")
        print(f"变更说明: {result.summary.get('description', '')}")
        print("-" * 60)

        if 'old_size' in result.summary:
            old_size = result.summary['old_size']
            new_size = result.summary['new_size']
            size_change = result.size_change

            print(f"旧文件大小: {old_size:,} 字节 ({old_size / 1024 / 1024:.2f} MB)")
            print(f"新文件大小: {new_size:,} 字节 ({new_size / 1024 / 1024:.2f} MB)")

            if size_change > 0:
                print(f"大小变化: +{size_change:,} 字节 (+{result.size_change_percent:.2f}%)")
            elif size_change < 0:
                print(f"大小变化: {size_change:,} 字节 ({result.size_change_percent:.2f}%)")
            else:
                print("大小变化: 无")

            print(f"变更字节数: {result.changed_bytes:,} 字节")
            print(f"变更率: {result.changed_percent:.2f}%")

            if 'old_md5' in result.summary:
                print(f"旧文件 MD5: {result.summary['old_md5']}")
                print(f"新文件 MD5: {result.summary['new_md5']}")

        if detail and result.segments:
            print("-" * 60)
            print(f"详细差异 (前 {min(len(result.segments), 20)} 段):")
            print(f"{'偏移':<12} {'长度':<8} {'类型':<10} {'旧值(前16字节)':<34} {'新值(前16字节)'}")
            print("-" * 90)

            for seg in result.segments[:20]:
                old_hex = seg.old_value[:16].hex() if seg.old_value else '-' * 32
                new_hex = seg.new_value[:16].hex() if seg.new_value else '-' * 32
                print(f"0x{seg.offset:08X}  {seg.length:<8} {seg.type:<10} {old_hex:<34} {new_hex}")

            if len(result.segments) > 20:
                print(f"... 还有 {len(result.segments) - 20} 段差异")

        print("=" * 60 + "\n")
