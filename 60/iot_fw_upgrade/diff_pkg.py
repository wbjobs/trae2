#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""差分包生成模块

支持多种差分算法生成固件升级包，减小升级包体积。
优化：重构差分算法，实现高效的滚动哈希分块和LCS匹配
"""

import os
import logging
import struct
import zlib
import hashlib
import json
import time
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class DiffPackageInfo:
    """差分包信息"""
    old_version: str
    new_version: str
    algorithm: str
    old_size: int
    new_size: int
    diff_size: int
    compression_ratio: float
    old_md5: str
    new_md5: str
    diff_md5: str
    created_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "old_version": self.old_version,
            "new_version": self.new_version,
            "algorithm": self.algorithm,
            "old_size": self.old_size,
            "new_size": self.new_size,
            "diff_size": self.diff_size,
            "compression_ratio": self.compression_ratio,
            "old_md5": self.old_md5,
            "new_md5": self.new_md5,
            "diff_md5": self.diff_md5,
            "created_at": self.created_at,
            "metadata": self.metadata
        }


class RollingHash:
    """滚动哈希 - Rabin-Karp指纹算法"""

    BASE = 16777619
    MOD = 2147483647

    def __init__(self, data: bytes, window_size: int):
        self.data = data
        self.window_size = window_size
        self.n = len(data)
        self._power = pow(self.BASE, window_size - 1, self.MOD)
        self._hashes: List[int] = []
        self._precompute()

    def _precompute(self):
        """预计算所有窗口的哈希值"""
        if self.n < self.window_size:
            return

        h = 0
        for i in range(self.window_size):
            h = (h * self.BASE + self.data[i]) % self.MOD
        self._hashes.append(h)

        for i in range(self.window_size, self.n):
            h = ((h - self.data[i - self.window_size] * self._power) * self.BASE + self.data[i]) % self.MOD
            self._hashes.append(h)

    def get_hash(self, pos: int) -> int:
        """获取指定位置的哈希值"""
        if 0 <= pos <= len(self._hashes):
            return self._hashes[pos]
        return -1

    def get_all_hashes(self) -> Dict[int, List[int]]:
        """获取所有哈希值到位置的映射"""
        hash_map: Dict[int, List[int]] = {}
        for i, h in enumerate(self._hashes):
            if h not in hash_map:
                hash_map[h] = []
            hash_map[h].append(i)
        return hash_map


class LCSMatcher:
    """最长公共子序列匹配器 - 用于查找重复块"""

    def __init__(self, block_size: int = 4096):
        self.block_size = block_size

    def find_matches(self, old_data: bytes, new_data: bytes) -> List[Tuple[int, int, int]]:
        """
        查找新旧数据中的匹配块

        Returns:
            匹配列表: [(old_offset, new_offset, length)]
        """
        matches: List[Tuple[int, int, int]] = []

        if len(old_data) < self.block_size or len(new_data) < self.block_size:
            return matches

        rolling_hash = RollingHash(old_data, self.block_size)
        old_hash_map = rolling_hash.get_all_hashes()

        new_rolling = RollingHash(new_data, self.block_size)

        i = 0
        n = len(new_data)

        while i < n - self.block_size + 1:
            h = new_rolling.get_hash(i)

            if h in old_hash_map:
                best_old_pos = -1
                best_len = 0

                for old_pos in old_hash_map[h]:
                    l = self._extend_match(old_data, new_data, old_pos, i)
                    if l > best_len:
                        best_len = l
                        best_old_pos = old_pos

                if best_len >= self.block_size:
                    matches.append((best_old_pos, i, best_len))
                    i += best_len
                    continue

            i += 1

        return self._merge_overlaps(matches)

    def _extend_match(self, old_data: bytes, new_data: bytes, old_pos: int, new_pos: int) -> int:
        """扩展匹配长度"""
        l = 0
        max_old = len(old_data) - old_pos
        max_new = len(new_data) - new_pos
        max_len = min(max_old, max_new)

        while l < max_len and old_data[old_pos + l] == new_data[new_pos + l]:
            l += 1

        return l

    def _merge_overlaps(self, matches: List[Tuple[int, int, int]]) -> List[Tuple[int, int, int]]:
        """合并重叠的匹配项"""
        if not matches:
            return []

        matches.sort(key=lambda x: x[1])

        merged = [matches[0]]
        for i in range(1, len(matches)):
            last_old, last_new, last_len = merged[-1]
            curr_old, curr_new, curr_len = matches[i]

            if curr_new < last_new + last_len:
                overlap = (last_new + last_len) - curr_new
                if overlap > 0:
                    if curr_old + curr_len > last_old + last_len:
                        new_len = (curr_old + curr_len) - last_old
                        merged[-1] = (last_old, last_new, max(last_len, new_len))
                else:
                    merged.append(matches[i])
            else:
                merged.append(matches[i])

        return merged


class BaseDiffAlgorithm:
    """差分算法基类"""

    def generate_diff(self, old_data: bytes, new_data: bytes) -> bytes:
        raise NotImplementedError

    def apply_diff(self, old_data: bytes, diff_data: bytes) -> bytes:
        raise NotImplementedError


class OptimizedDiffAlgorithm(BaseDiffAlgorithm):
    """优化的差分算法 - 基于滚动哈希和LCS匹配"""

    MAGIC = b'OPTDIF'
    MIN_BLOCK_SIZE = 512
    MAX_BLOCK_SIZE = 65536

    def __init__(self, block_size: int = 4096):
        self.block_size = max(self.MIN_BLOCK_SIZE, min(block_size, self.MAX_BLOCK_SIZE))

    def _adaptive_block_size(self, old_size: int, new_size: int) -> int:
        """根据文件大小自适应调整块大小"""
        avg_size = (old_size + new_size) / 2
        if avg_size > 100 * 1024 * 1024:
            return 65536
        elif avg_size > 10 * 1024 * 1024:
            return 16384
        elif avg_size > 1 * 1024 * 1024:
            return 4096
        else:
            return 1024

    def generate_diff(self, old_data: bytes, new_data: bytes) -> bytes:
        block_size = self._adaptive_block_size(len(old_data), len(new_data))
        matcher = LCSMatcher(block_size)
        matches = matcher.find_matches(old_data, new_data)

        ops = []
        new_pos = 0
        new_len = len(new_data)

        matches.sort(key=lambda x: x[1])

        for old_pos, match_new_pos, match_len in matches:
            if match_new_pos > new_pos:
                ops.append(('literal', new_pos, match_new_pos - new_pos))
            ops.append(('copy', old_pos, match_len))
            new_pos = match_new_pos + match_len

        if new_pos < new_len:
            ops.append(('literal', new_pos, new_len - new_pos))

        return self._serialize_ops(ops, old_data, new_data, block_size)

    def _serialize_ops(self, ops: List[Tuple[str, int, int]],
                       old_data: bytes, new_data: bytes,
                       block_size: int) -> bytes:
        """序列化操作序列"""
        body = bytearray()

        for op_type, offset, length in ops:
            if op_type == 'copy':
                flag = 1
                body.append(flag)
                body.extend(struct.pack('<II', offset, length))
            else:
                flag = 0
                literal = new_data[offset:offset + length]
                compressed = zlib.compress(literal, level=9)

                if len(compressed) < length:
                    flag = 2
                    body.append(flag)
                    body.extend(struct.pack('<II', length, len(compressed)))
                    body.extend(compressed)
                else:
                    body.append(flag)
                    body.extend(struct.pack('<I', length))
                    body.extend(literal)

        header = self.MAGIC + struct.pack('<II', len(old_data), len(new_data))
        return header + bytes(body)

    def apply_diff(self, old_data: bytes, diff_data: bytes) -> bytes:
        if not diff_data.startswith(self.MAGIC):
            raise ValueError("无效的优化差分格式")

        offset = len(self.MAGIC)
        old_size, new_size = struct.unpack_from('<II', diff_data, offset)
        offset += 8

        new_data = bytearray(new_size)
        new_pos = 0

        while offset < len(diff_data):
            flag = diff_data[offset]
            offset += 1

            if flag == 1:
                old_off, length = struct.unpack_from('<II', diff_data, offset)
                offset += 8
                new_data[new_pos:new_pos + length] = old_data[old_off:old_off + length]
                new_pos += length
            elif flag == 0:
                length = struct.unpack_from('<I', diff_data, offset)[0]
                offset += 4
                new_data[new_pos:new_pos + length] = diff_data[offset:offset + length]
                offset += length
                new_pos += length
            elif flag == 2:
                orig_len, comp_len = struct.unpack_from('<II', diff_data, offset)
                offset += 8
                compressed = diff_data[offset:offset + comp_len]
                offset += comp_len
                literal = zlib.decompress(compressed)
                new_data[new_pos:new_pos + orig_len] = literal
                new_pos += orig_len
            else:
                raise ValueError(f"未知的操作类型: {flag}")

        return bytes(new_data)


class FastDiffAlgorithm(BaseDiffAlgorithm):
    """快速差分算法 - 基于固定块比较，适合嵌入式环境"""

    MAGIC = b'FSTDIF'

    def __init__(self, block_size: int = 4096):
        self.block_size = block_size

    def generate_diff(self, old_data: bytes, new_data: bytes) -> bytes:
        old_blocks = self._split_blocks(old_data)
        new_blocks = self._split_blocks(new_data)

        old_hash_map = self._hash_blocks(old_blocks)

        ops = []
        for i, new_block in enumerate(new_blocks):
            block_hash = hashlib.md5(new_block).digest()
            if block_hash in old_hash_map:
                old_idx = old_hash_map[block_hash]
                ops.append(('copy', old_idx, len(new_block)))
            else:
                ops.append(('literal', i, new_block))

        return self._serialize_ops(ops, len(old_data), len(new_data))

    def _split_blocks(self, data: bytes) -> List[bytes]:
        blocks = []
        for i in range(0, len(data), self.block_size):
            blocks.append(data[i:i + self.block_size])
        return blocks

    def _hash_blocks(self, blocks: List[bytes]) -> Dict[bytes, int]:
        hash_map = {}
        for i, block in enumerate(blocks):
            h = hashlib.md5(block).digest()
            if h not in hash_map:
                hash_map[h] = i
        return hash_map

    def _serialize_ops(self, ops: List[Tuple], old_size: int, new_size: int) -> bytes:
        header = self.MAGIC + struct.pack('<III', old_size, new_size, self.block_size)
        body = bytearray()

        for op in ops:
            if op[0] == 'copy':
                body.append(1)
                body.extend(struct.pack('<II', op[1], op[2]))
            else:
                body.append(0)
                body.extend(struct.pack('<I', len(op[2])))
                body.extend(op[2])

        return header + bytes(body)

    def apply_diff(self, old_data: bytes, diff_data: bytes) -> bytes:
        if not diff_data.startswith(self.MAGIC):
            raise ValueError("无效的快速差分格式")

        offset = len(self.MAGIC)
        old_size, new_size, block_size = struct.unpack_from('<III', diff_data, offset)
        offset += 12

        old_blocks = self._split_blocks(old_data)
        new_data = bytearray()

        while offset < len(diff_data):
            flag = diff_data[offset]
            offset += 1

            if flag == 1:
                old_idx, length = struct.unpack_from('<II', diff_data, offset)
                offset += 8
                if old_idx < len(old_blocks):
                    new_data.extend(old_blocks[old_idx][:length])
                else:
                    new_data.extend(b'\x00' * length)
            else:
                length = struct.unpack_from('<I', diff_data, offset)[0]
                offset += 4
                new_data.extend(diff_data[offset:offset + length])
                offset += length

        return bytes(new_data[:new_size])


class BSDiffAlgorithm(BaseDiffAlgorithm):
    """BSDiff算法实现"""

    MAGIC = b'BSDIFF40'

    def generate_diff(self, old_data: bytes, new_data: bytes) -> bytes:
        try:
            import bsdiff4
            diff = bsdiff4.diff(old_data, new_data)
            return self.MAGIC + diff
        except ImportError:
            logger.warning("未安装bsdiff4库，使用优化差分算法")
            opt = OptimizedDiffAlgorithm()
            return b'BSDFALL' + opt.generate_diff(old_data, new_data)

    def apply_diff(self, old_data: bytes, diff_data: bytes) -> bytes:
        if diff_data.startswith(b'BSDIFF40'):
            import bsdiff4
            return bsdiff4.patch(old_data, diff_data[8:])
        elif diff_data.startswith(b'BSDFALL'):
            opt = OptimizedDiffAlgorithm()
            return opt.apply_diff(old_data, diff_data[7:])
        else:
            raise ValueError("无效的BSDiff差分格式")


class HDiffAlgorithm(BaseDiffAlgorithm):
    """HDiff算法实现"""

    MAGIC = b'HDIFFZ'

    def generate_diff(self, old_data: bytes, new_data: bytes) -> bytes:
        opt = OptimizedDiffAlgorithm()
        optimized_diff = opt.generate_diff(old_data, new_data)
        compressed = zlib.compress(optimized_diff, level=9)
        return self.MAGIC + struct.pack('<QQ', len(old_data), len(new_data)) + compressed

    def apply_diff(self, old_data: bytes, diff_data: bytes) -> bytes:
        if not diff_data.startswith(self.MAGIC):
            raise ValueError("无效的HDiff差分格式")

        offset = len(self.MAGIC)
        old_size, new_size = struct.unpack_from('<QQ', diff_data, offset)
        offset += 16

        compressed = diff_data[offset:]
        raw_diff = zlib.decompress(compressed)

        opt = OptimizedDiffAlgorithm()
        return opt.apply_diff(old_data, raw_diff)


class SimpleDiffAlgorithm(BaseDiffAlgorithm):
    """简单差分算法"""

    BLOCK_SIZE = 4096
    MAGIC = b'SIMDIF'

    def generate_diff(self, old_data: bytes, new_data: bytes) -> bytes:
        old_blocks = self._split_blocks(old_data)
        new_blocks = self._split_blocks(new_data)

        diff_blocks = []
        for i, new_block in enumerate(new_blocks):
            if i < len(old_blocks) and old_blocks[i] == new_block:
                diff_blocks.append((0, i, b''))
            else:
                diff_blocks.append((1, i, new_block))

        return self._serialize_diff(diff_blocks, len(old_data), len(new_data))

    def _split_blocks(self, data: bytes) -> list:
        blocks = []
        for i in range(0, len(data), self.BLOCK_SIZE):
            blocks.append(data[i:i + self.BLOCK_SIZE])
        return blocks

    def _serialize_diff(self, diff_blocks: list, old_size: int, new_size: int) -> bytes:
        header = self.MAGIC + struct.pack('<III', old_size, new_size, len(diff_blocks))
        body = b''
        for flag, idx, data in diff_blocks:
            body += struct.pack('<BII', flag, idx, len(data))
            if data:
                body += data
        return header + body

    def apply_diff(self, old_data: bytes, diff_data: bytes) -> bytes:
        if not diff_data.startswith(self.MAGIC):
            raise ValueError("无效的SimpleDiff差分格式")

        offset = len(self.MAGIC)
        old_size, new_size, block_count = struct.unpack_from('<III', diff_data, offset)
        offset += 12

        new_data = bytearray(new_size)
        old_blocks = self._split_blocks(old_data)

        for _ in range(block_count):
            flag, idx, data_len = struct.unpack_from('<BII', diff_data, offset)
            offset += 9

            if flag == 0:
                if idx < len(old_blocks):
                    block_data = old_blocks[idx]
                else:
                    block_data = b'\x00' * self.BLOCK_SIZE
            else:
                block_data = diff_data[offset:offset + data_len]
                offset += data_len

            start = idx * self.BLOCK_SIZE
            end = min(start + len(block_data), new_size)
            new_data[start:end] = block_data[:end - start]

        return bytes(new_data)


class DiffPackageGenerator:
    """差分包生成器"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._algorithms = {
            "bsdiff": BSDiffAlgorithm(),
            "bsdiff4": BSDiffAlgorithm(),
            "hdiff": HDiffAlgorithm(),
            "optimized": OptimizedDiffAlgorithm(),
            "fast": FastDiffAlgorithm(),
            "simple": SimpleDiffAlgorithm(),
        }

    def generate(self, old_firmware_path: str, new_firmware_path: str,
                 output_path: str, algorithm: str = "optimized",
                 metadata_path: Optional[str] = None) -> int:
        """
        生成差分升级包
        """
        if not os.path.exists(old_firmware_path):
            logger.error(f"旧固件文件不存在: {old_firmware_path}")
            return 1

        if not os.path.exists(new_firmware_path):
            logger.error(f"新固件文件不存在: {new_firmware_path}")
            return 1

        try:
            with open(old_firmware_path, 'rb') as f:
                old_data = f.read()

            with open(new_firmware_path, 'rb') as f:
                new_data = f.read()

        except Exception as e:
            logger.error(f"读取固件文件失败: {e}")
            return 1

        logger.info(f"旧固件大小: {len(old_data)} 字节")
        logger.info(f"新固件大小: {len(new_data)} 字节")

        if algorithm not in self._algorithms:
            logger.error(f"不支持的差分算法: {algorithm}")
            logger.info(f"支持的算法: {', '.join(self._algorithms.keys())}")
            return 1

        algo = self._algorithms[algorithm]

        logger.info(f"使用 {algorithm} 算法生成差分包...")
        start_time = time.time()

        try:
            diff_data = algo.generate_diff(old_data, new_data)
        except Exception as e:
            logger.error(f"生成差分包失败: {e}")
            return 1

        elapsed = time.time() - start_time
        logger.info(f"差分生成完成，耗时: {elapsed:.2f}s")

        diff_size = len(diff_data)
        compression_ratio = (1 - diff_size / len(new_data)) * 100 if len(new_data) > 0 else 0

        logger.info(f"差分包大小: {diff_size} 字节")
        logger.info(f"压缩率: {compression_ratio:.2f}%")

        metadata = {}
        if metadata_path and os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
            except Exception as e:
                logger.warning(f"加载元数据失败: {e}")

        old_md5 = hashlib.md5(old_data).hexdigest()
        new_md5 = hashlib.md5(new_data).hexdigest()
        diff_md5 = hashlib.md5(diff_data).hexdigest()

        info = DiffPackageInfo(
            old_version=metadata.get("old_version", os.path.basename(old_firmware_path)),
            new_version=metadata.get("new_version", os.path.basename(new_firmware_path)),
            algorithm=algorithm,
            old_size=len(old_data),
            new_size=len(new_data),
            diff_size=diff_size,
            compression_ratio=compression_ratio,
            old_md5=old_md5,
            new_md5=new_md5,
            diff_md5=diff_md5,
            metadata=metadata
        )

        try:
            self._write_package(output_path, diff_data, info)
        except Exception as e:
            logger.error(f"写入差分包失败: {e}")
            return 1

        info_path = output_path + ".info.json"
        try:
            with open(info_path, 'w', encoding='utf-8') as f:
                json.dump(info.to_dict(), f, indent=2, ensure_ascii=False)
            logger.info(f"差分包信息已保存到: {info_path}")
        except Exception as e:
            logger.warning(f"保存差分包信息失败: {e}")

        logger.info(f"差分包已生成: {output_path}")
        self._print_info(info)

        return 0

    def _write_package(self, output_path: str, diff_data: bytes, info: DiffPackageInfo):
        """写入差分包文件"""
        magic = b'IOTD'
        version = 1

        info_json = json.dumps(info.to_dict()).encode('utf-8')
        info_length = len(info_json)

        header = magic + struct.pack('<HI', version, info_length)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'wb') as f:
            f.write(header)
            f.write(info_json)
            f.write(diff_data)

    def read_package(self, package_path: str) -> Tuple[DiffPackageInfo, bytes]:
        """读取差分包"""
        with open(package_path, 'rb') as f:
            data = f.read()

        if len(data) < 10:
            raise ValueError("差分包文件太小")

        magic = data[:4]
        if magic != b'IOTD':
            raise ValueError("无效的差分包格式")

        version, info_length = struct.unpack_from('<HI', data, 4)
        offset = 10

        if len(data) < offset + info_length:
            raise ValueError("差分包文件损坏")

        info_json = data[offset:offset + info_length]
        info_dict = json.loads(info_json.decode('utf-8'))
        info = DiffPackageInfo(**info_dict)

        diff_data = data[offset + info_length:]

        return info, diff_data

    def apply_package(self, old_firmware_path: str, package_path: str, output_path: str) -> int:
        """应用差分包还原新固件"""
        try:
            info, diff_data = self.read_package(package_path)

            with open(old_firmware_path, 'rb') as f:
                old_data = f.read()

            algo = self._algorithms.get(info.algorithm)
            if not algo:
                logger.error(f"不支持的差分算法: {info.algorithm}")
                return 1

            new_data = algo.apply_diff(old_data, diff_data)

            new_md5 = hashlib.md5(new_data).hexdigest()
            if new_md5 != info.new_md5:
                logger.error(f"MD5校验失败: 期望 {info.new_md5}, 实际 {new_md5}")
                return 1

            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'wb') as f:
                f.write(new_data)

            logger.info(f"新固件已还原: {output_path}")
            logger.info(f"大小: {len(new_data)} 字节, MD5: {new_md5}")
            return 0

        except Exception as e:
            logger.error(f"应用差分包失败: {e}")
            return 1

    def _print_info(self, info: DiffPackageInfo):
        """打印差分包信息"""
        print("\n" + "=" * 50)
        print("差分包信息")
        print("=" * 50)
        print(f"旧版本: {info.old_version}")
        print(f"新版本: {info.new_version}")
        print(f"差分算法: {info.algorithm}")
        print(f"旧固件大小: {info.old_size:,} 字节 ({info.old_size / 1024 / 1024:.2f} MB)")
        print(f"新固件大小: {info.new_size:,} 字节 ({info.new_size / 1024 / 1024:.2f} MB)")
        print(f"差分包大小: {info.diff_size:,} 字节 ({info.diff_size / 1024 / 1024:.2f} MB)")
        print(f"压缩率: {info.compression_ratio:.2f}%")
        print(f"旧固件 MD5: {info.old_md5}")
        print(f"新固件 MD5: {info.new_md5}")
        print(f"差分包 MD5: {info.diff_md5}")
        if info.metadata:
            print(f"元数据: {json.dumps(info.metadata, ensure_ascii=False)}")
        print("=" * 50 + "\n")

    def verify_package(self, package_path: str, old_firmware_path: str = None) -> int:
        """验证差分包完整性"""
        try:
            info, diff_data = self.read_package(package_path)

            diff_md5 = hashlib.md5(diff_data).hexdigest()
            if diff_md5 != info.diff_md5:
                logger.error(f"差分包MD5校验失败: 期望 {info.diff_md5}, 实际 {diff_md5}")
                return 1

            logger.info("差分包格式校验通过")
            self._print_info(info)

            if old_firmware_path and os.path.exists(old_firmware_path):
                with open(old_firmware_path, 'rb') as f:
                    old_data = f.read()

                old_md5 = hashlib.md5(old_data).hexdigest()
                if old_md5 != info.old_md5:
                    logger.error(f"旧固件MD5不匹配: 期望 {info.old_md5}, 实际 {old_md5}")
                    return 1

                logger.info("旧固件匹配，正在验证差分还原...")
                algo = self._algorithms.get(info.algorithm)
                if algo:
                    new_data = algo.apply_diff(old_data, diff_data)
                    new_md5 = hashlib.md5(new_data).hexdigest()
                    if new_md5 != info.new_md5:
                        logger.error(f"差分还原MD5校验失败: 期望 {info.new_md5}, 实际 {new_md5}")
                        return 1
                    logger.info("差分还原验证通过")

            logger.info("差分包验证通过")
            return 0

        except Exception as e:
            logger.error(f"验证差分包失败: {e}")
            return 1
