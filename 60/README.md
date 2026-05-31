# 物联网终端固件差分升级与版本管控工具

一个功能完善的物联网设备固件升级命令行工具，支持差分包生成、设备版本查询、版本比对、多设备并行升级等功能。

## 功能特性

- **差分包生成**: 支持 bsdiff、hdiff、simple 等多种差分算法，减小升级包体积
- **多协议支持**: 支持 MQTT、HTTP、CoAP、Modbus 等主流物联网通信协议
- **版本管理**: 固件版本解析、比对，支持语义化版本号
- **批量升级**: 多设备并行升级，支持自定义并发数
- **进度监控**: 实时升级进度显示，支持任务状态查询
- **断点续传**: 失败自动重试，支持任务取消
- **日志记录**: 完整的升级任务日志，便于追溯审计

## 项目结构

```
iot_fw_upgrade/
├── __init__.py              # 包初始化
├── main.py                  # 主入口
├── cli.py                   # 命令行解析模块
├── device_comm.py           # 设备通信模块
├── diff_pkg.py              # 差分包生成模块
├── version_compare.py       # 版本比对模块
├── upgrade_manager.py       # 升级进度管理模块
└── utils/
    ├── __init__.py
    ├── logger.py            # 日志配置
    ├── config.py            # 配置管理
    └── common.py            # 通用工具
```

## 安装依赖

```bash
# 可选依赖（MQTT协议支持）
pip install paho-mqtt

# 可选依赖（bsdiff差分算法）
pip install bsdiff4
```

## 快速开始

### 1. 生成测试固件

```bash
cd firmware
python generate_test_fw.py
```

### 2. 生成差分升级包

```bash
# 基本用法
python iot-fw-upgrade diff --old firmware/firmware_v1.0.0.bin \
    --new firmware/firmware_v1.1.0.bin \
    --output patches/v1.0.0_to_v1.1.0.patch

# 指定差分算法
python iot-fw-upgrade diff --old firmware/firmware_v1.0.0.bin \
    --new firmware/firmware_v1.1.0.bin \
    --output patches/v1.0.0_to_v1.1.0.patch \
    --algorithm hdiff

# 包含元数据
python iot-fw-upgrade diff --old firmware/firmware_v1.0.0.bin \
    --new firmware/firmware_v1.1.0.bin \
    --output patches/v1.0.0_to_v1.1.0.patch \
    --metadata metadata.json
```

### 3. 查询设备版本

```bash
# 查询单台设备
python iot-fw-upgrade query --device 192.168.1.100

# 指定通信协议
python iot-fw-upgrade query --device 192.168.1.100 --protocol http

# 查询所有设备（在devices.json中配置）
python iot-fw-upgrade query
```

### 4. 版本比对

```bash
# 比对版本号
python iot-fw-upgrade compare --old v1.0.0 --new v1.1.0

# 比对固件文件
python iot-fw-upgrade compare --old firmware/firmware_v1.0.0.bin \
    --new firmware/firmware_v1.1.0.bin

# 显示详细差异
python iot-fw-upgrade compare --old firmware/firmware_v1.0.0.bin \
    --new firmware/firmware_v1.1.0.bin --detail

# 输出比对报告
python iot-fw-upgrade compare --old v1.0.0 --new v1.1.0 \
    --output compare_report.json
```

### 5. 升级单台设备

```bash
python iot-fw-upgrade upgrade --device 192.168.1.100 \
    --patch patches/v1.0.0_to_v1.1.0.patch

# 指定协议和超时
python iot-fw-upgrade upgrade --device 192.168.1.100 \
    --patch patches/v1.0.0_to_v1.1.0.patch \
    --protocol mqtt --timeout 60 --retry 3
```

### 6. 批量升级多设备

```bash
# 使用设备列表文件批量升级
python iot-fw-upgrade batch-upgrade --devices devices.json \
    --patch patches/v1.0.0_to_v1.1.0.patch

# 设置并发数
python iot-fw-upgrade batch-upgrade --devices devices.json \
    --patch patches/v1.0.0_to_v1.1.0.patch \
    --parallel 5
```

### 7. 查看升级进度

```bash
# 查看所有任务
python iot-fw-upgrade status

# 查看指定任务
python iot-fw-upgrade status --task upgrade_20240101_000001

# 实时监控任务进度
python iot-fw-upgrade status --task upgrade_20240101_000001 --watch
```

### 8. 设备管理

```bash
# 列出所有设备
python iot-fw-upgrade devices --list

# 添加设备
python iot-fw-upgrade devices --add '{"id":"dev_006","ip":"192.168.1.106","protocol":"mqtt"}'

# 从文件添加设备
python iot-fw-upgrade devices --add new_device.json

# 移除设备
python iot-fw-upgrade devices --remove dev_005
```

### 9. 取消升级任务

```bash
python iot-fw-upgrade cancel --task upgrade_20240101_000001

# 强制取消
python iot-fw-upgrade cancel --task upgrade_20240101_000001 --force
```

## 配置文件

默认配置文件 `config.json`:

```json
{
    "log_level": "INFO",
    "device_timeout": 30,
    "max_parallel_upgrades": 10,
    "diff_algorithm": "bsdiff",
    "retry_count": 3,
    "retry_interval": 5,
    "firmware_store": "./firmware",
    "upgrade_log_dir": "./upgrade_logs",
    "device_config": "./devices.json"
}
```

## 设备配置文件

`devices.json` 格式:

```json
[
    {
        "id": "dev_001",
        "ip": "192.168.1.101",
        "port": 1883,
        "protocol": "mqtt",
        "model": "IoT-Sensor-V1",
        "version": "v1.0.0",
        "status": "online"
    }
]
```

## 差分包格式

差分包文件格式:

| 偏移 | 长度 | 内容 | 说明 |
|------|------|------|------|
| 0 | 4字节 | 魔数 | 固定为 `IOTD` |
| 4 | 2字节 | 版本 | 差分包格式版本 |
| 6 | 4字节 | 信息区长度 | JSON元数据长度 |
| 10 | N字节 | 信息区 | JSON格式的差分包信息 |
| 10+N | M字节 | 差分数据 | 实际的差分算法输出 |

## 差分包元数据

生成的 `.info.json` 文件包含:

```json
{
    "old_version": "v1.0.0",
    "new_version": "v1.1.0",
    "algorithm": "bsdiff",
    "old_size": 1048576,
    "new_size": 1048576,
    "diff_size": 123456,
    "compression_ratio": 88.23,
    "old_md5": "...",
    "new_md5": "...",
    "diff_md5": "...",
    "created_at": 1704067200.0,
    "metadata": {
        "description": "...",
        "changelog": [...]
    }
}
```

## Linux 嵌入式环境部署

### 交叉编译（可选）

```bash
# 使用 PyInstaller 打包为单文件可执行程序
pip install pyinstaller
pyinstaller --onefile --name iot-fw-upgrade iot-fw-upgrade
```

### 运行环境要求

- Python 3.6+
- 依赖: 标准库即可运行（可选安装 paho-mqtt 和 bsdiff4）
- 内存: 建议 ≥ 64MB
- 存储: 根据固件大小而定，建议 ≥ 固件大小 × 4

### 嵌入式系统优化

```bash
# 使用轻量级差分算法
python iot-fw-upgrade diff --algorithm simple ...

# 减少并发数
python iot-fw-upgrade batch-upgrade --parallel 2 ...
```

## 常见问题

### Q: 如何添加自定义通信协议?

A: 在 `device_comm.py` 中继承 `BaseProtocol` 类，实现 `connect`、`disconnect`、`send_command`、`query_version`、`send_firmware` 方法，然后在 `protocol_map` 中注册。

### Q: 如何添加自定义差分算法?

A: 在 `diff_pkg.py` 中继承 `BaseDiffAlgorithm` 类，实现 `generate_diff` 和 `apply_diff` 方法，然后在 `DiffPackageGenerator._algorithms` 中注册。

### Q: 升级失败后如何恢复?

A: 工具会自动重试指定次数。如果仍然失败，可查看 `upgrade_logs/` 目录下的任务日志，根据错误信息处理后重新发起升级。

## 许可证

MIT License
