#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成测试固件文件"""

import os
import random
import hashlib


def generate_firmware(path, version, size=1024*1024):
    """生成模拟固件文件"""
    header = f"IoT Firmware v{version}\0".encode()
    header += f"Build: 20240101\0Model: IoT-Sensor-V1\0".encode()
    header += f"MD5: placeholder\0".encode()

    padding_size = size - len(header)
    padding = bytes(random.getrandbits(8) for _ in range(padding_size))
    data = header + padding

    md5 = hashlib.md5(data).hexdigest()
    data = data.replace(b'placeholder', md5.encode())

    with open(path, 'wb') as f:
        f.write(data)

    print(f"Generated: {path} ({len(data)} bytes, MD5: {md5})")


if __name__ == "__main__":
    firmware_dir = os.path.dirname(os.path.abspath(__file__))

    generate_firmware(os.path.join(firmware_dir, "firmware_v1.0.0.bin"), "1.0.0")
    generate_firmware(os.path.join(firmware_dir, "firmware_v1.1.0.bin"), "1.1.0")
    generate_firmware(os.path.join(firmware_dir, "firmware_v2.0.0.bin"), "2.0.0")
