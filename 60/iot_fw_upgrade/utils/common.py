#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通用工具函数"""

import hashlib
import os
import json
from typing import Tuple


def calculate_md5(file_path: str) -> str:
    """
    计算文件MD5值

    Args:
        file_path: 文件路径

    Returns:
        MD5哈希值
    """
    md5_hash = hashlib.md5()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            md5_hash.update(chunk)
    return md5_hash.hexdigest()


def calculate_sha256(file_path: str) -> str:
    """
    计算文件SHA256值

    Args:
        file_path: 文件路径

    Returns:
        SHA256哈希值
    """
    sha256_hash = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def get_file_size(file_path: str) -> int:
    """
    获取文件大小

    Args:
        file_path: 文件路径

    Returns:
        文件大小（字节）
    """
    return os.path.getsize(file_path)


def ensure_dir(path: str):
    """
    确保目录存在

    Args:
        path: 目录路径
    """
    os.makedirs(path, exist_ok=True)


def load_json(file_path: str) -> dict:
    """
    加载JSON文件

    Args:
        file_path: 文件路径

    Returns:
        解析后的字典
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data: dict, file_path: str):
    """
    保存JSON文件

    Args:
        data: 要保存的数据
        file_path: 文件路径
    """
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
