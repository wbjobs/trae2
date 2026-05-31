#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
增量包生成模块
支持 bsdiff, xdelta, lzdiff, zstd-delta, vcdiff, chunked 算法
"""

import os
import sys
import zlib
import lzma
import bz2
import hashlib
import struct
import logging
import subprocess
from typing import Optional, Tuple, List, Dict
from abc import ABC, abstractmethod
from collections import defaultdict

from utils import calculate_file_hash, ensure_dir, format_bytes


class DeltaAlgorithm(ABC):
    @abstractmethod
    def generate(self, old_file: str, new_file: str, output_file: str) -> bool:
        pass
    
    @abstractmethod
    def apply(self, old_file: str, delta_file: str, output_file: str) -> bool:
        pass
    
    def get_name(self) -> str:
        return self.__class__.__name__.replace('Algorithm', '').lower()
    
    def estimate_compression_ratio(self, old_size: int, new_size: int) -> float:
        return 0.5


class BSDiffAlgorithm(DeltaAlgorithm):
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._has_bsdiff_tool = self._has_bsdiff()
        self._has_bspatch_tool = self._has_bspatch()
    
    def generate(self, old_file: str, new_file: str, output_file: str) -> bool:
        if self._has_bsdiff_tool:
            return self._generate_with_bsdiff(old_file, new_file, output_file)
        else:
            self.logger.warning("未找到 bsdiff 工具，使用优化后的内置算法")
            return self._generate_optimized(old_file, new_file, output_file)
    
    def apply(self, old_file: str, delta_file: str, output_file: str) -> bool:
        if self._has_bspatch_tool:
            return self._apply_with_bspatch(old_file, delta_file, output_file)
        else:
            self.logger.warning("未找到 bspatch 工具，使用内置补丁算法")
            return self._apply_optimized(old_file, delta_file, output_file)
    
    def _has_bsdiff(self) -> bool:
        try:
            subprocess.run(['bsdiff', '-h'], capture_output=True, timeout=5)
            return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
    
    def _has_bspatch(self) -> bool:
        try:
            subprocess.run(['bspatch', '-h'], capture_output=True, timeout=5)
            return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
    
    def _generate_with_bsdiff(self, old_file: str, new_file: str, output_file: str) -> bool:
        try:
            result = subprocess.run(
                ['bsdiff', old_file, new_file, output_file],
                capture_output=True,
                timeout=600
            )
            return result.returncode == 0
        except Exception as e:
            self.logger.error(f"bsdiff 执行失败: {e}")
            return False
    
    def _apply_with_bspatch(self, old_file: str, delta_file: str, output_file: str) -> bool:
        try:
            result = subprocess.run(
                ['bspatch', old_file, output_file, delta_file],
                capture_output=True,
                timeout=600
            )
            return result.returncode == 0
        except Exception as e:
            self.logger.error(f"bspatch 执行失败: {e}")
            return False
    
    def _generate_optimized(self, old_file: str, new_file: str, output_file: str) -> bool:
        try:
            old_size = os.path.getsize(old_file)
            new_size = os.path.getsize(new_file)
            
            block_size = 4096
            if old_size > 100 * 1024 * 1024:
                block_size = 16384
            
            old_blocks = self._build_block_index(old_file, block_size)
            
            delta = bytearray()
            delta.extend(b'OBSD')
            delta.extend(struct.pack('<I', old_size))
            delta.extend(struct.pack('<I', new_size))
            delta.extend(struct.pack('<I', block_size))
            
            old_hash = hashlib.sha256()
            new_hash = hashlib.sha256()
            
            with open(old_file, 'rb') as f_old:
                while True:
                    data = f_old.read(1024 * 1024)
                    if not data:
                        break
                    old_hash.update(data)
            
            with open(new_file, 'rb') as f_new, open(output_file, 'wb') as f_out:
                f_out.write(delta)
                f_out.write(old_hash.digest())
                
                new_pos = 0
                while new_pos < new_size:
                    f_new.seek(new_pos)
                    block = f_new.read(min(block_size, new_size - new_pos))
                    new_hash.update(block)
                    
                    block_hash = hashlib.md5(block).digest()
                    if block_hash in old_blocks:
                        f_out.write(b'R')
                        f_out.write(struct.pack('<Q', old_blocks[block_hash]))
                        f_out.write(struct.pack('<I', len(block)))
                        new_pos += len(block)
                    else:
                        match_len, match_offset = self._find_longest_match(
                            f_new, new_pos, block, old_file, block_size
                        )
                        
                        if match_len >= 128 and match_offset >= 0:
                            f_out.write(b'M')
                            f_out.write(struct.pack('<Q', match_offset))
                            f_out.write(struct.pack('<I', match_len))
                            new_pos += match_len
                        else:
                            compressed = zlib.compress(block, level=9)
                            if len(compressed) < len(block):
                                f_out.write(b'C')
                                f_out.write(struct.pack('<I', len(compressed)))
                                f_out.write(compressed)
                            else:
                                f_out.write(b'A')
                                f_out.write(struct.pack('<I', len(block)))
                                f_out.write(block)
                            new_pos += len(block)
                
                f_out.write(b'H')
                f_out.write(new_hash.digest())
            
            return True
        except Exception as e:
            self.logger.error(f"生成增量包失败: {e}")
            return False
    
    def _build_block_index(self, old_file: str, block_size: int) -> Dict[bytes, int]:
        blocks = {}
        with open(old_file, 'rb') as f:
            offset = 0
            while True:
                block = f.read(block_size)
                if not block:
                    break
                if len(block) == block_size:
                    block_hash = hashlib.md5(block).digest()
                    if block_hash not in blocks:
                        blocks[block_hash] = offset
                offset += len(block)
        return blocks
    
    def _find_longest_match(self, f_new, new_pos: int, current_block: bytes,
                           old_file: str, block_size: int) -> Tuple[int, int]:
        window_size = min(65536, len(current_block))
        if window_size < 16:
            return 0, -1
        
        fingerprint = current_block[:16]
        
        with open(old_file, 'rb') as f_old:
            old_data = f_old.read()
            pos = old_data.find(fingerprint)
            if pos == -1:
                return 0, -1
            
            match_len = 16
            while (pos + match_len < len(old_data) and
                   new_pos + match_len < os.path.getsize(f_new.name)):
                f_new.seek(new_pos + match_len)
                new_byte = f_new.read(1)
                if not new_byte or old_data[pos + match_len] != new_byte[0]:
                    break
                match_len += 1
            
            return match_len, pos
    
    def _apply_optimized(self, old_file: str, delta_file: str, output_file: str) -> bool:
        try:
            with open(old_file, 'rb') as f_old, \
                 open(delta_file, 'rb') as f_delta, \
                 open(output_file, 'wb') as f_out:
                
                magic = f_delta.read(4)
                if magic != b'OBSD':
                    self.logger.error("无效的优化 bsdiff 格式")
                    return False
                
                old_size = struct.unpack('<I', f_delta.read(4))[0]
                new_size = struct.unpack('<I', f_delta.read(4))[0]
                block_size = struct.unpack('<I', f_delta.read(4))[0]
                
                old_hash_expected = f_delta.read(32)
                
                old_hash_actual = hashlib.sha256()
                f_old.seek(0)
                while True:
                    data = f_old.read(1024 * 1024)
                    if not data:
                        break
                    old_hash_actual.update(data)
                
                if old_hash_actual.digest() != old_hash_expected:
                    self.logger.error("旧固件哈希不匹配")
                    return False
                
                old_data = f_old.read()
                new_hash = hashlib.sha256()
                output_data = bytearray()
                
                while True:
                    op = f_delta.read(1)
                    if not op:
                        break
                    
                    if op == b'H':
                        expected_hash = f_delta.read(32)
                        actual_hash = hashlib.sha256(output_data).digest()
                        if actual_hash != expected_hash:
                            self.logger.error("新固件哈希不匹配")
                            return False
                        break
                    
                    if op == b'R':
                        offset = struct.unpack('<Q', f_delta.read(8))[0]
                        length = struct.unpack('<I', f_delta.read(4))[0]
                        block = old_data[offset:offset + length]
                        output_data.extend(block)
                    elif op == b'M':
                        offset = struct.unpack('<Q', f_delta.read(8))[0]
                        length = struct.unpack('<I', f_delta.read(4))[0]
                        block = old_data[offset:offset + length]
                        output_data.extend(block)
                    elif op == b'A':
                        length = struct.unpack('<I', f_delta.read(4))[0]
                        block = f_delta.read(length)
                        output_data.extend(block)
                    elif op == b'C':
                        length = struct.unpack('<I', f_delta.read(4))[0]
                        compressed = f_delta.read(length)
                        block = zlib.decompress(compressed)
                        output_data.extend(block)
                
                f_out.write(output_data)
                return True
                
        except Exception as e:
            self.logger.error(f"应用增量包失败: {e}")
            return False


class XDeltaAlgorithm(DeltaAlgorithm):
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._has_xdelta_tool = self._has_xdelta()
    
    def generate(self, old_file: str, new_file: str, output_file: str) -> bool:
        if self._has_xdelta_tool:
            return self._generate_with_xdelta(old_file, new_file, output_file)
        else:
            self.logger.warning("未找到 xdelta3 工具，使用备用 lzbsdiff")
            return BSDiffAlgorithm().generate(old_file, new_file, output_file)
    
    def apply(self, old_file: str, delta_file: str, output_file: str) -> bool:
        if self._has_xdelta_tool:
            return self._apply_with_xdelta(old_file, delta_file, output_file)
        else:
            self.logger.warning("未找到 xdelta3 工具，使用备用算法")
            return BSDiffAlgorithm().apply(old_file, delta_file, output_file)
    
    def _has_xdelta(self) -> bool:
        try:
            subprocess.run(['xdelta3', '-h'], capture_output=True, timeout=5)
            return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
    
    def _generate_with_xdelta(self, old_file: str, new_file: str, output_file: str) -> bool:
        try:
            result = subprocess.run(
                ['xdelta3', '-e', '-9', '-s', old_file, new_file, output_file],
                capture_output=True,
                timeout=600
            )
            return result.returncode == 0
        except Exception as e:
            self.logger.error(f"xdelta3 执行失败: {e}")
            return False
    
    def _apply_with_xdelta(self, old_file: str, delta_file: str, output_file: str) -> bool:
        try:
            result = subprocess.run(
                ['xdelta3', '-d', '-s', old_file, delta_file, output_file],
                capture_output=True,
                timeout=600
            )
            return result.returncode == 0
        except Exception as e:
            self.logger.error(f"xdelta3 执行失败: {e}")
            return False


class ZstdDeltaAlgorithm(DeltaAlgorithm):
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._has_zstd_tool = self._has_zstd()
    
    def generate(self, old_file: str, new_file: str, output_file: str) -> bool:
        if self._has_zstd_tool:
            return self._generate_with_zstd(old_file, new_file, output_file)
        else:
            self.logger.warning("未找到 zstd 工具，使用内置 zstd-delta")
            return self._generate_native(old_file, new_file, output_file)
    
    def apply(self, old_file: str, delta_file: str, output_file: str) -> bool:
        if self._has_zstd_tool:
            return self._apply_with_zstd(old_file, delta_file, output_file)
        else:
            return self._apply_native(old_file, delta_file, output_file)
    
    def _has_zstd(self) -> bool:
        try:
            subprocess.run(['zstd', '-h'], capture_output=True, timeout=5)
            return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
    
    def _generate_with_zstd(self, old_file: str, new_file: str, output_file: str) -> bool:
        try:
            result = subprocess.run(
                ['zstd', '--patch-from', old_file, new_file, '-o', output_file, '-22'],
                capture_output=True,
                timeout=600
            )
            return result.returncode == 0
        except Exception as e:
            self.logger.error(f"zstd 执行失败: {e}")
            return False
    
    def _apply_with_zstd(self, old_file: str, delta_file: str, output_file: str) -> bool:
        try:
            result = subprocess.run(
                ['zstd', '-d', '--patch-from', old_file, delta_file, '-o', output_file],
                capture_output=True,
                timeout=600
            )
            return result.returncode == 0
        except Exception as e:
            self.logger.error(f"zstd 解压失败: {e}")
            return False
    
    def _generate_native(self, old_file: str, new_file: str, output_file: str) -> bool:
        try:
            old_size = os.path.getsize(old_file)
            new_size = os.path.getsize(new_file)
            
            with open(old_file, 'rb') as f:
                old_data = f.read()
            with open(new_file, 'rb') as f:
                new_data = f.read()
            
            old_hash = hashlib.sha256(old_data).digest()
            new_hash = hashlib.sha256(new_data).digest()
            
            compressed = lzma.compress(new_data, preset=9 | lzma.PRESET_EXTREME)
            
            with open(output_file, 'wb') as f:
                f.write(b'ZSTD')
                f.write(struct.pack('<I', old_size))
                f.write(struct.pack('<I', new_size))
                f.write(struct.pack('<I', len(compressed)))
                f.write(old_hash)
                f.write(new_hash)
                f.write(compressed)
            
            return True
        except Exception as e:
            self.logger.error(f"zstd-delta 生成失败: {e}")
            return False
    
    def _apply_native(self, old_file: str, delta_file: str, output_file: str) -> bool:
        try:
            with open(delta_file, 'rb') as f:
                magic = f.read(4)
                if magic != b'ZSTD':
                    return False
                
                old_size = struct.unpack('<I', f.read(4))[0]
                new_size = struct.unpack('<I', f.read(4))[0]
                comp_size = struct.unpack('<I', f.read(4))[0]
                old_hash = f.read(32)
                new_hash = f.read(32)
                compressed = f.read(comp_size)
            
            with open(old_file, 'rb') as f:
                old_data = f.read()
            
            if hashlib.sha256(old_data).digest() != old_hash:
                self.logger.error("旧固件哈希不匹配")
                return False
            
            new_data = lzma.decompress(compressed)
            
            if hashlib.sha256(new_data).digest() != new_hash:
                self.logger.error("新固件哈希不匹配")
                return False
            
            with open(output_file, 'wb') as f:
                f.write(new_data)
            
            return True
        except Exception as e:
            self.logger.error(f"zstd-delta 应用失败: {e}")
            return False


class VCDiffAlgorithm(DeltaAlgorithm):
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._window_size = 65536
    
    def generate(self, old_file: str, new_file: str, output_file: str) -> bool:
        try:
            old_size = os.path.getsize(old_file)
            new_size = os.path.getsize(new_file)
            
            with open(old_file, 'rb') as f:
                old_data = f.read()
            with open(new_file, 'rb') as f:
                new_data = f.read()
            
            old_hash = hashlib.sha256(old_data).digest()
            new_hash = hashlib.sha256(new_data).digest()
            
            delta = bytearray()
            delta.extend(b'VCDF')
            delta.extend(struct.pack('<I', old_size))
            delta.extend(struct.pack('<I', new_size))
            delta.extend(old_hash)
            delta.extend(new_hash)
            
            i = 0
            while i < len(new_data):
                match_len, match_offset = self._find_best_match(
                    new_data, i, old_data, self._window_size
                )
                
                if match_len >= 16:
                    delta.extend(b'C')
                    delta.extend(struct.pack('<H', match_offset))
                    delta.extend(struct.pack('<H', match_len))
                    i += match_len
                else:
                    run_len = 1
                    while (i + run_len < len(new_data) and
                           run_len < 256 and
                           new_data[i + run_len] == new_data[i]):
                        run_len += 1
                    
                    if run_len >= 4:
                        delta.extend(b'R')
                        delta.extend(struct.pack('<B', run_len))
                        delta.extend(bytes([new_data[i]]))
                        i += run_len
                    else:
                        add_len = 1
                        while (i + add_len < len(new_data) and add_len < 256):
                            ml, _ = self._find_best_match(
                                new_data, i + add_len, old_data, 1024
                            )
                            if ml >= 16:
                                break
                            add_len += 1
                        
                        delta.extend(b'A')
                        delta.extend(struct.pack('<B', add_len))
                        delta.extend(new_data[i:i + add_len])
                        i += add_len
            
            delta.extend(b'E')
            delta.extend(new_hash)
            
            with open(output_file, 'wb') as f:
                f.write(delta)
            
            return True
        except Exception as e:
            self.logger.error(f"VCDiff 生成失败: {e}")
            return False
    
    def apply(self, old_file: str, delta_file: str, output_file: str) -> bool:
        try:
            with open(old_file, 'rb') as f:
                old_data = f.read()
            
            with open(delta_file, 'rb') as f:
                magic = f.read(4)
                if magic != b'VCDF':
                    return False
                
                old_size = struct.unpack('<I', f.read(4))[0]
                new_size = struct.unpack('<I', f.read(4))[0]
                old_hash = f.read(32)
                expected_new_hash = f.read(32)
                
                if hashlib.sha256(old_data).digest() != old_hash:
                    self.logger.error("旧固件哈希不匹配")
                    return False
                
                output = bytearray()
                
                while True:
                    op = f.read(1)
                    if not op or op == b'E':
                        actual_new_hash = f.read(32)
                        if hashlib.sha256(output).digest() != expected_new_hash:
                            self.logger.error("新固件哈希不匹配")
                            return False
                        break
                    
                    if op == b'C':
                        offset = struct.unpack('<H', f.read(2))[0]
                        length = struct.unpack('<H', f.read(2))[0]
                        output.extend(old_data[offset:offset + length])
                    elif op == b'R':
                        run_len = struct.unpack('<B', f.read(1))[0]
                        byte_val = f.read(1)[0]
                        output.extend(bytes([byte_val] * run_len))
                    elif op == b'A':
                        add_len = struct.unpack('<B', f.read(1))[0]
                        output.extend(f.read(add_len))
            
            with open(output_file, 'wb') as f:
                f.write(output)
            
            return True
        except Exception as e:
            self.logger.error(f"VCDiff 应用失败: {e}")
            return False
    
    def _find_best_match(self, new_data: bytes, new_pos: int,
                        old_data: bytes, window_size: int) -> Tuple[int, int]:
        if new_pos + 16 > len(new_data):
            return 0, -1
        
        max_len = min(window_size, len(new_data) - new_pos)
        fingerprint = new_data[new_pos:new_pos + 16]
        
        best_len = 0
        best_offset = -1
        search_pos = 0
        
        while True:
            pos = old_data.find(fingerprint, search_pos)
            if pos == -1:
                break
            
            match_len = 16
            while (pos + match_len < len(old_data) and
                   new_pos + match_len < len(new_data) and
                   match_len < max_len and
                   old_data[pos + match_len] == new_data[new_pos + match_len]):
                match_len += 1
            
            if match_len > best_len:
                best_len = match_len
                best_offset = pos
                if best_len >= max_len:
                    break
            
            search_pos = pos + 1
        
        return best_len, best_offset


class ChunkedDeltaAlgorithm(DeltaAlgorithm):
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._chunk_size = 1 * 1024 * 1024
    
    def generate(self, old_file: str, new_file: str, output_file: str) -> bool:
        try:
            old_size = os.path.getsize(old_file)
            new_size = os.path.getsize(new_file)
            num_chunks = (new_size + self._chunk_size - 1) // self._chunk_size
            
            chunk_hash_map = self._build_chunk_hash_map(old_file)
            
            old_hash = hashlib.sha256()
            with open(old_file, 'rb') as f:
                while True:
                    data = f.read(1024 * 1024)
                    if not data:
                        break
                    old_hash.update(data)
            
            new_hash = hashlib.sha256()
            with open(new_file, 'rb') as f:
                while True:
                    data = f.read(1024 * 1024)
                    if not data:
                        break
                    new_hash.update(data)
            
            with open(output_file, 'wb') as f_out:
                f_out.write(b'CHNK')
                f_out.write(struct.pack('<I', old_size))
                f_out.write(struct.pack('<I', new_size))
                f_out.write(struct.pack('<I', self._chunk_size))
                f_out.write(struct.pack('<I', num_chunks))
                f_out.write(old_hash.digest())
                f_out.write(new_hash.digest())
                
                with open(new_file, 'rb') as f_new:
                    for chunk_idx in range(num_chunks):
                        f_new.seek(chunk_idx * self._chunk_size)
                        chunk_data = f_new.read(min(
                            self._chunk_size,
                            new_size - chunk_idx * self._chunk_size
                        ))
                        
                        chunk_hash = hashlib.sha256(chunk_data).digest()
                        
                        if chunk_hash in chunk_hash_map:
                            f_out.write(b'R')
                            f_out.write(struct.pack('<Q', chunk_hash_map[chunk_hash]))
                            f_out.write(struct.pack('<I', len(chunk_data)))
                        else:
                            compressed = self._compress_chunk(chunk_data)
                            if len(compressed) < len(chunk_data):
                                f_out.write(b'C')
                                f_out.write(struct.pack('<I', len(compressed)))
                                f_out.write(compressed)
                            else:
                                f_out.write(b'A')
                                f_out.write(struct.pack('<I', len(chunk_data)))
                                f_out.write(chunk_data)
            
            return True
        except Exception as e:
            self.logger.error(f"分块增量生成失败: {e}")
            return False
    
    def apply(self, old_file: str, delta_file: str, output_file: str) -> bool:
        try:
            with open(old_file, 'rb') as f_old, \
                 open(delta_file, 'rb') as f_delta, \
                 open(output_file, 'wb') as f_out:
                
                magic = f_delta.read(4)
                if magic != b'CHNK':
                    return False
                
                old_size = struct.unpack('<I', f_delta.read(4))[0]
                new_size = struct.unpack('<I', f_delta.read(4))[0]
                chunk_size = struct.unpack('<I', f_delta.read(4))[0]
                num_chunks = struct.unpack('<I', f_delta.read(4))[0]
                old_hash_expected = f_delta.read(32)
                new_hash_expected = f_delta.read(32)
                
                old_hash_actual = hashlib.sha256()
                f_old.seek(0)
                while True:
                    data = f_old.read(1024 * 1024)
                    if not data:
                        break
                    old_hash_actual.update(data)
                
                if old_hash_actual.digest() != old_hash_expected:
                    self.logger.error("旧固件哈希不匹配")
                    return False
                
                old_data = f_old.read()
                new_hash = hashlib.sha256()
                total_written = 0
                
                for chunk_idx in range(num_chunks):
                    op = f_delta.read(1)
                    if op == b'R':
                        offset = struct.unpack('<Q', f_delta.read(8))[0]
                        length = struct.unpack('<I', f_delta.read(4))[0]
                        chunk_data = old_data[offset:offset + length]
                    elif op == b'A':
                        length = struct.unpack('<I', f_delta.read(4))[0]
                        chunk_data = f_delta.read(length)
                    elif op == b'C':
                        length = struct.unpack('<I', f_delta.read(4))[0]
                        compressed = f_delta.read(length)
                        chunk_data = self._decompress_chunk(compressed)
                    else:
                        self.logger.error(f"未知操作码: {op}")
                        return False
                    
                    f_out.write(chunk_data)
                    new_hash.update(chunk_data)
                    total_written += len(chunk_data)
                
                if new_hash.digest() != new_hash_expected:
                    self.logger.error("新固件哈希不匹配")
                    return False
                
                return True
        except Exception as e:
            self.logger.error(f"分块增量应用失败: {e}")
            return False
    
    def _build_chunk_hash_map(self, old_file: str) -> Dict[bytes, int]:
        chunk_map = {}
        with open(old_file, 'rb') as f:
            offset = 0
            while True:
                chunk = f.read(self._chunk_size)
                if not chunk:
                    break
                chunk_hash = hashlib.sha256(chunk).digest()
                if chunk_hash not in chunk_map:
                    chunk_map[chunk_hash] = offset
                offset += len(chunk)
        return chunk_map
    
    def _compress_chunk(self, data: bytes) -> bytes:
        methods = [
            lambda d: b'L' + lzma.compress(d, preset=9),
            lambda d: b'Z' + zlib.compress(d, level=9),
            lambda d: b'B' + bz2.compress(d, compresslevel=9),
        ]
        
        best = min((method(data) for method in methods), key=len)
        return best
    
    def _decompress_chunk(self, data: bytes) -> bytes:
        method = data[0:1]
        compressed = data[1:]
        
        if method == b'L':
            return lzma.decompress(compressed)
        elif method == b'Z':
            return zlib.decompress(compressed)
        elif method == b'B':
            return bz2.decompress(compressed)
        else:
            raise ValueError(f"未知压缩方法: {method}")


class LZDiffAlgorithm(DeltaAlgorithm):
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def generate(self, old_file: str, new_file: str, output_file: str) -> bool:
        try:
            old_size = os.path.getsize(old_file)
            new_size = os.path.getsize(new_file)
            
            with open(new_file, 'rb') as f:
                new_data = f.read()
            
            old_hash = calculate_file_hash(old_file)
            new_hash = hashlib.sha256(new_data).hexdigest()
            
            compressed = self._compress_best(new_data)
            
            with open(output_file, 'wb') as f:
                f.write(b'LZDF')
                f.write(struct.pack('<I', old_size))
                f.write(struct.pack('<I', new_size))
                f.write(struct.pack('<I', len(compressed)))
                f.write(bytes.fromhex(old_hash))
                f.write(bytes.fromhex(new_hash))
                f.write(compressed)
            
            return True
        except Exception as e:
            self.logger.error(f"生成增量包失败: {e}")
            return False
    
    def apply(self, old_file: str, delta_file: str, output_file: str) -> bool:
        try:
            with open(delta_file, 'rb') as f:
                if f.read(4) != b'LZDF':
                    return False
                
                old_len = struct.unpack('<I', f.read(4))[0]
                new_len = struct.unpack('<I', f.read(4))[0]
                comp_len = struct.unpack('<I', f.read(4))[0]
                old_hash = f.read(32).hex()
                new_hash = f.read(32).hex()
                compressed = f.read(comp_len)
            
            actual_old_hash = calculate_file_hash(old_file)
            if actual_old_hash != old_hash:
                self.logger.error("旧固件哈希不匹配")
                return False
            
            new_data = self._decompress(compressed)
            
            actual_new_hash = hashlib.sha256(new_data).hexdigest()
            if actual_new_hash != new_hash:
                self.logger.error("新固件哈希不匹配")
                return False
            
            with open(output_file, 'wb') as f:
                f.write(new_data)
            
            return True
        except Exception as e:
            self.logger.error(f"应用增量包失败: {e}")
            return False
    
    def _compress_best(self, data: bytes) -> bytes:
        results = []
        try:
            zstd_comp = lzma.compress(data, preset=9 | lzma.PRESET_EXTREME)
            results.append((b'L', zstd_comp))
        except:
            pass
        
        zlib_comp = zlib.compress(data, level=9)
        results.append((b'Z', zlib_comp))
        
        try:
            bz2_comp = bz2.compress(data, compresslevel=9)
            results.append((b'B', bz2_comp))
        except:
            pass
        
        best = min(results, key=lambda x: len(x[1]))
        return best[0] + best[1]
    
    def _decompress(self, data: bytes) -> bytes:
        method = data[0:1]
        payload = data[1:]
        
        if method == b'L':
            return lzma.decompress(payload)
        elif method == b'Z':
            return zlib.decompress(payload)
        elif method == b'B':
            return bz2.decompress(payload)
        else:
            return zlib.decompress(payload)


class DeltaGenerator:
    DELTA_MAGIC = b'IIOT'
    DELTA_VERSION = 2
    
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self._algorithms: Dict[str, DeltaAlgorithm] = {
            'bsdiff': BSDiffAlgorithm(),
            'xdelta': XDeltaAlgorithm(),
            'lzdiff': LZDiffAlgorithm(),
            'zstd': ZstdDeltaAlgorithm(),
            'vcdiff': VCDiffAlgorithm(),
            'chunked': ChunkedDeltaAlgorithm(),
        }
    
    def generate_delta(self, old_firmware: str, new_firmware: str,
                      output_path: str = None, algorithm: str = 'auto') -> Optional[str]:
        if not os.path.exists(old_firmware):
            self.logger.error(f"旧固件文件不存在: {old_firmware}")
            return None
        
        if not os.path.exists(new_firmware):
            self.logger.error(f"新固件文件不存在: {new_firmware}")
            return None
        
        old_size = os.path.getsize(old_firmware)
        new_size = os.path.getsize(new_firmware)
        self.logger.info(f"旧固件大小: {format_bytes(old_size)}")
        self.logger.info(f"新固件大小: {format_bytes(new_size)}")
        
        if output_path is None:
            old_name = os.path.splitext(os.path.basename(old_firmware))[0]
            new_name = os.path.splitext(os.path.basename(new_firmware))[0]
            output_path = f"delta_{old_name}_to_{new_name}.bin"
        
        ensure_dir(os.path.dirname(output_path) or '.')
        
        if algorithm == 'auto':
            algorithm = self._select_best_algorithm(old_size, new_size)
            self.logger.info(f"自动选择算法: {algorithm}")
        
        if algorithm not in self._algorithms:
            self.logger.error(f"不支持的算法: {algorithm}")
            return None
        
        algo = self._algorithms[algorithm]
        self.logger.info(f"使用 {algorithm} 算法生成增量包...")
        
        temp_delta = output_path + '.tmp'
        
        if not algo.generate(old_firmware, new_firmware, temp_delta):
            self.logger.error("增量包生成失败")
            if os.path.exists(temp_delta):
                os.remove(temp_delta)
            return None
        
        if not os.path.exists(temp_delta):
            self.logger.error("增量包文件未生成")
            return None
        
        delta_size = os.path.getsize(temp_delta)
        self.logger.info(f"增量包原始大小: {format_bytes(delta_size)}")
        
        max_delta = getattr(self.config, 'max_delta_size', 100 * 1024 * 1024)
        if delta_size > max_delta:
            self.logger.warning(f"增量包过大 ({format_bytes(delta_size)}), 使用完整固件")
            os.remove(temp_delta)
            return self._create_full_patch(old_firmware, new_firmware, output_path)
        
        reduction_ratio = (1 - delta_size / new_size) * 100 if new_size > 0 else 0
        if reduction_ratio < 10:
            self.logger.warning(f"压缩率过低 ({reduction_ratio:.1f}%), 使用完整固件")
            os.remove(temp_delta)
            return self._create_full_patch(old_firmware, new_firmware, output_path)
        
        final_path = self._wrap_delta_header(
            temp_delta, output_path, algorithm,
            old_firmware, new_firmware
        )
        
        os.remove(temp_delta)
        
        if final_path:
            final_size = os.path.getsize(final_path)
            compression_ratio = (1 - final_size / new_size) * 100 if new_size > 0 else 0
            self.logger.info(f"最终增量包大小: {format_bytes(final_size)}")
            self.logger.info(f"压缩率: {compression_ratio:.1f}%")
        
        return final_path
    
    def _select_best_algorithm(self, old_size: int, new_size: int) -> str:
        size_diff = abs(new_size - old_size)
        size_ratio = min(old_size, new_size) / max(old_size, new_size) if max(old_size, new_size) > 0 else 0
        
        if new_size > 100 * 1024 * 1024:
            return 'chunked'
        elif size_ratio > 0.7:
            if old_size > 50 * 1024 * 1024:
                return 'zstd'
            return 'bsdiff'
        elif size_ratio > 0.5:
            return 'zstd'
        elif size_ratio > 0.3:
            return 'vcdiff'
        else:
            return 'lzdiff'
    
    def benchmark_algorithms(self, old_firmware: str, new_firmware: str) -> List[dict]:
        results = []
        temp_dir = getattr(self.config, 'firmware_cache_dir', '.')
        
        for name, algo in self._algorithms.items():
            try:
                import time
                temp_output = os.path.join(temp_dir, f"bench_{name}.tmp")
                
                start = time.time()
                success = algo.generate(old_firmware, new_firmware, temp_output)
                gen_time = time.time() - start
                
                if success and os.path.exists(temp_output):
                    delta_size = os.path.getsize(temp_output)
                    
                    start = time.time()
                    apply_success = algo.apply(
                        old_firmware, temp_output,
                        os.path.join(temp_dir, f"bench_{name}_out.tmp")
                    )
                    apply_time = time.time() - start
                    
                    new_size = os.path.getsize(new_firmware)
                    ratio = (1 - delta_size / new_size) * 100 if new_size > 0 else 0
                    
                    results.append({
                        'algorithm': name,
                        'success': apply_success,
                        'delta_size': delta_size,
                        'compression_ratio': ratio,
                        'gen_time': gen_time,
                        'apply_time': apply_time,
                    })
                    
                    os.remove(temp_output)
                    out_file = os.path.join(temp_dir, f"bench_{name}_out.tmp")
                    if os.path.exists(out_file):
                        os.remove(out_file)
            except Exception as e:
                self.logger.debug(f"算法 {name} 基准测试失败: {e}")
                continue
        
        return sorted(results, key=lambda r: r['delta_size'])
    
    def _wrap_delta_header(self, delta_file: str, output_file: str,
                          algorithm: str, old_firmware: str,
                          new_firmware: str) -> Optional[str]:
        try:
            old_hash = calculate_file_hash(old_firmware)
            new_hash = calculate_file_hash(new_firmware)
            
            with open(delta_file, 'rb') as f:
                delta_data = f.read()
            
            header = self.DELTA_MAGIC
            header += struct.pack('<H', self.DELTA_VERSION)
            
            algo_bytes = algorithm.encode('utf-8')
            header += struct.pack('<B', len(algo_bytes))
            header += algo_bytes
            
            old_size = os.path.getsize(old_firmware)
            new_size = os.path.getsize(new_firmware)
            header += struct.pack('<Q', old_size)
            header += struct.pack('<Q', new_size)
            
            old_hash_bytes = bytes.fromhex(old_hash)
            new_hash_bytes = bytes.fromhex(new_hash)
            header += old_hash_bytes
            header += new_hash_bytes
            
            delta_size = len(delta_data)
            header += struct.pack('<Q', delta_size)
            
            with open(output_file, 'wb') as f:
                f.write(header)
                f.write(delta_data)
            
            return output_file
        
        except Exception as e:
            self.logger.error(f"封装增量包头部失败: {e}")
            return None
    
    def _create_full_patch(self, old_firmware: str, new_firmware: str,
                          output_path: str) -> Optional[str]:
        try:
            self.logger.info("生成完整固件包...")
            
            with open(new_firmware, 'rb') as f:
                new_data = f.read()
            
            compressed = self._compress_best(new_data)
            
            old_hash = calculate_file_hash(old_firmware)
            new_hash = calculate_file_hash(new_firmware)
            
            header = self.DELTA_MAGIC
            header += struct.pack('<H', self.DELTA_VERSION)
            
            algo = 'full'
            algo_bytes = algo.encode('utf-8')
            header += struct.pack('<B', len(algo_bytes))
            header += algo_bytes
            
            old_size = os.path.getsize(old_firmware)
            new_size = os.path.getsize(new_firmware)
            header += struct.pack('<Q', old_size)
            header += struct.pack('<Q', new_size)
            
            old_hash_bytes = bytes.fromhex(old_hash)
            new_hash_bytes = bytes.fromhex(new_hash)
            header += old_hash_bytes
            header += new_hash_bytes
            
            header += struct.pack('<Q', len(compressed))
            
            with open(output_path, 'wb') as f:
                f.write(header)
                f.write(compressed)
            
            return output_path
        
        except Exception as e:
            self.logger.error(f"生成完整固件包失败: {e}")
            return None
    
    def _compress_best(self, data: bytes) -> bytes:
        methods = [
            lambda d: b'L' + lzma.compress(d, preset=9),
            lambda d: b'Z' + zlib.compress(d, level=9),
            lambda d: b'B' + bz2.compress(d, compresslevel=9),
        ]
        
        best = min((method(data) for method in methods), key=len)
        return best
    
    def verify_delta(self, delta_file: str) -> Optional[dict]:
        try:
            with open(delta_file, 'rb') as f:
                magic = f.read(4)
                if magic != self.DELTA_MAGIC:
                    self.logger.error("无效的增量包格式")
                    return None
                
                version = struct.unpack('<H', f.read(2))[0]
                algo_len = struct.unpack('<B', f.read(1))[0]
                algorithm = f.read(algo_len).decode('utf-8')
                
                old_size = struct.unpack('<Q', f.read(8))[0]
                new_size = struct.unpack('<Q', f.read(8))[0]
                
                old_hash = f.read(32).hex()
                new_hash = f.read(32).hex()
                
                delta_size = struct.unpack('<Q', f.read(8))[0]
                
                return {
                    'version': version,
                    'algorithm': algorithm,
                    'old_size': old_size,
                    'new_size': new_size,
                    'old_hash': old_hash,
                    'new_hash': new_hash,
                    'delta_size': delta_size,
                }
        
        except Exception as e:
            self.logger.error(f"验证增量包失败: {e}")
            return None
    
    def extract_delta_data(self, delta_file: str) -> Optional[bytes]:
        try:
            with open(delta_file, 'rb') as f:
                magic = f.read(4)
                if magic != self.DELTA_MAGIC:
                    return None
                
                f.read(2)
                algo_len = struct.unpack('<B', f.read(1))[0]
                f.read(algo_len)
                f.read(16)
                f.read(64)
                delta_size = struct.unpack('<Q', f.read(8))[0]
                
                return f.read(delta_size)
        
        except Exception as e:
            self.logger.error(f"提取增量数据失败: {e}")
            return None
    
    def apply_delta(self, old_firmware: str, delta_file: str,
                    output_file: str) -> bool:
        try:
            info = self.verify_delta(delta_file)
            if not info:
                return False
            
            algorithm = info['algorithm']
            if algorithm == 'full':
                return self._apply_full_patch(old_firmware, delta_file, output_file)
            
            if algorithm not in self._algorithms:
                self.logger.error(f"不支持的算法: {algorithm}")
                return False
            
            delta_data = self.extract_delta_data(delta_file)
            if not delta_data:
                return False
            
            temp_delta = output_file + '.tmp'
            with open(temp_delta, 'wb') as f:
                f.write(delta_data)
            
            success = self._algorithms[algorithm].apply(old_firmware, temp_delta, output_file)
            
            os.remove(temp_delta)
            
            if success:
                actual_hash = calculate_file_hash(output_file)
                if actual_hash != info['new_hash']:
                    self.logger.error("输出文件哈希不匹配")
                    return False
            
            return success
        except Exception as e:
            self.logger.error(f"应用增量包失败: {e}")
            return False
    
    def _apply_full_patch(self, old_firmware: str, delta_file: str,
                         output_file: str) -> bool:
        try:
            info = self.verify_delta(delta_file)
            if not info:
                return False
            
            delta_data = self.extract_delta_data(delta_file)
            if not delta_data:
                return False
            
            method = delta_data[0:1]
            compressed = delta_data[1:]
            
            if method == b'L':
                new_data = lzma.decompress(compressed)
            elif method == b'Z':
                new_data = zlib.decompress(compressed)
            elif method == b'B':
                new_data = bz2.decompress(compressed)
            else:
                new_data = zlib.decompress(compressed)
            
            with open(output_file, 'wb') as f:
                f.write(new_data)
            
            return True
        except Exception as e:
            self.logger.error(f"应用完整固件包失败: {e}")
            return False
    
    def list_algorithms(self) -> List[str]:
        return list(self._algorithms.keys())
