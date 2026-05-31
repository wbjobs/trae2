# 嵌入式固件批量刷写与版本管理工具

一个功能完善的嵌入式设备固件批量刷写和版本管理命令行工具，支持串口/网口设备通信、批量并行操作、固件分包烧录、版本查询比对和进度监控。

## 功能特性

- **多接口支持**: 串口 (UART) 和网口 (TCP/IP) 设备通信
- **批量操作**: 支持多设备并行刷写和版本查询
- **固件分包**: 智能固件分包，支持自定义包大小
- **进度监控**: 实时刷写进度显示，支持多设备并行监控
- **版本管理**: 版本查询、版本报告生成、版本差异比对
- **任务管理**: 任务队列、历史记录、任务取消
- **跨平台**: 支持 Linux (嵌入式环境) 和 Windows

## 安装

```bash
# 安装依赖
pip install -r requirements.txt

# 或者以开发模式安装
pip install -e .
```

## 项目结构

```
.
├── main.py              # 主入口文件
├── cli.py               # 命令解析模块
├── device_comms.py      # 设备通信模块
├── firmware_flasher.py  # 固件分包烧录模块
├── version_manager.py   # 版本比对模块
├── task_manager.py      # 任务进度管理模块
├── requirements.txt     # 依赖列表
├── setup.py             # 安装配置
└── examples/            # 示例文件
    └── devices.yaml     # 设备列表示例
```

## 快速开始

### 1. 扫描设备

```bash
# 扫描所有串口设备
python main.py device scan --type serial

# 扫描网络设备 (指定IP范围)
python main.py device scan --type net --ip-range 192.168.1.1-192.168.1.100 --port 8080

# 扫描所有设备
python main.py device scan --type all --ip-range 192.168.1.0/24
```

### 2. 查询固件版本

```bash
# 查询单个设备版本
python main.py firmware version -d /dev/ttyUSB0

# 查询多个网络设备版本
python main.py firmware version -d 192.168.1.100:8080 -d 192.168.1.101:8080

# 从设备列表文件查询并保存报告
python main.py firmware version -l examples/devices.yaml -o version_report -f json
```

### 3. 刷写固件

```bash
# 单设备刷写
python main.py firmware flash firmware.bin -d /dev/ttyUSB0

# 多设备并行刷写 (带进度条)
python main.py firmware flash firmware.bin \
    -d /dev/ttyUSB0 \
    -d /dev/ttyUSB1 \
    -d 192.168.1.100:8080 \
    --parallel --max-workers 4

# 从设备列表文件批量刷写，刷写前擦除，刷写后校验
python main.py firmware flash firmware.bin \
    -l examples/devices.yaml \
    --chunk-size 2048 \
    --retry 3 \
    --erase \
    --verify
```

### 4. 版本比对

```bash
# 比对两个版本报告文件
python main.py firmware compare report_old.json report_new.json

# 比对并保存结果
python main.py firmware compare report_old.json report_new.json -o diff_result.json
```

### 5. 任务管理

```bash
# 列出所有任务
python main.py task list

# 查看特定任务状态
python main.py task status -t abc12345

# 实时监控任务进度
python main.py task status -t abc12345 --watch --interval 2

# 取消任务
python main.py task cancel abc12345

# 强制取消任务
python main.py task cancel abc12345 --force
```

## 设备列表文件格式

支持 YAML、JSON 和纯文本格式：

### YAML 格式 (devices.yaml)

```yaml
devices:
  - connection: /dev/ttyUSB0
    name: "Device 1 - Serial"
    baudrate: 115200
  - connection: /dev/ttyUSB1
    name: "Device 2 - Serial"
    baudrate: 921600
  - connection: 192.168.1.100
    port: 8080
    name: "Device 3 - Network"
```

### JSON 格式 (devices.json)

```json
{
  "devices": [
    {
      "connection": "/dev/ttyUSB0",
      "name": "Device 1",
      "baudrate": 115200
    },
    {
      "connection": "192.168.1.100",
      "port": 8080,
      "name": "Device 2"
    }
  ]
}
```

### 纯文本格式 (devices.txt)

```txt
# 每行一个设备，格式: connection [name]
/dev/ttyUSB0 Device1
/dev/ttyUSB1 Device2
192.168.1.100:8080 Device3
```

## 通信协议

工具使用自定义的帧格式与嵌入式设备通信：

| 字段      | 长度(字节) | 说明               |
|----------|-----------|-------------------|
| 起始字节  | 1         | 0xAA              |
| 命令码    | 1         | 详见命令定义      |
| 长度      | 2         | 数据区长度 (大端) |
| 数据区    | N         | 命令数据          |
| 校验和    | 1         | 累加和校验        |
| 结束字节  | 1         | 0x55              |

### 命令码定义

| 命令码 | 名称          | 说明                     |
|-------|---------------|--------------------------|
| 0x00  | PING          | 设备在线检测             |
| 0x01  | CMD_VERSION   | 查询固件版本             |
| 0x02  | CMD_FLASH_INIT | 初始化固件刷写          |
| 0x03  | CMD_FLASH_DATA | 发送固件数据            |
| 0x04  | CMD_FLASH_VERIFY | 校验固件              |
| 0x05  | CMD_FLASH_END  | 结束刷写                |
| 0x06  | CMD_ERASE      | 擦除flash               |
| 0x10  | RESP_ACK       | 成功应答                |
| 0x11  | RESP_NACK      | 失败应答                |

## Linux 嵌入式环境部署

### 依赖安装

```bash
# Debian/Ubuntu 系列
sudo apt-get install python3 python3-pip
pip3 install -r requirements.txt

# 或者使用系统包
sudo apt-get install python3-serial python3-click python3-yaml
```

### 串口权限

```bash
# 添加用户到 dialout 组
sudo usermod -a -G dialout $USER

# 临时生效 (需要重新登录)
newgrp dialout
```

### systemd 服务 (可选)

创建 `/etc/systemd/system/fw-manager.service`:

```ini
[Unit]
Description=Firmware Manager Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/fw-manager
ExecStart=/usr/bin/python3 main.py server
Restart=always

[Install]
WantedBy=multi-user.target
```

## 命令参考

### 全局选项

| 选项                  | 说明                     | 默认值 |
|----------------------|--------------------------|--------|
| `-v, --verbose`      | 启用详细输出             | False  |
| `-c, --config-file`  | 配置文件路径             | None   |
| `--parallel`         | 启用并行操作             | False  |
| `--max-workers N`    | 最大并行工作线程数        | 4      |
| `--help`             | 显示帮助                 | -      |

### device scan

| 选项                  | 说明                     | 默认值    |
|----------------------|--------------------------|-----------|
| `-t, --type`         | 设备类型 (serial/net/all)| all       |
| `-b, --baudrate`     | 串口波特率                | 115200    |
| `--ip-range`         | IP扫描范围                | None      |
| `-p, --port`         | 网口端口                  | 8080      |

### firmware flash

| 选项                  | 说明                     | 默认值   |
|----------------------|--------------------------|----------|
| `-d, --device`       | 目标设备 (可多次指定)     | None     |
| `-l, --device-list`  | 设备列表文件              | None     |
| `-b, --baudrate`     | 串口波特率                | 115200   |
| `--chunk-size`       | 分包大小(字节)            | 1024     |
| `--retry`            | 失败重试次数              | 3        |
| `--verify`           | 刷写后校验                | True     |
| `--erase`            | 刷写前擦除                | False    |

### firmware version

| 选项                  | 说明                     | 默认值   |
|----------------------|--------------------------|----------|
| `-d, --device`       | 目标设备                 | None     |
| `-l, --device-list`  | 设备列表文件              | None     |
| `-o, --output`       | 输出文件路径              | None     |
| `-f, --format`       | 输出格式 (json/yaml/text)| text     |

### firmware compare

| 选项                  | 说明                     | 默认值   |
|----------------------|--------------------------|----------|
| `-o, --output`       | 输出文件路径              | None     |
| `--show-diff`        | 显示差异详情              | True     |

## 常见问题

### Q: 串口设备无法连接？

A: 检查以下几点：
1. 设备路径是否正确 (ls /dev/tty*)
2. 用户是否有串口访问权限
3. 波特率等参数是否匹配
4. 设备是否被其他程序占用

### Q: 网络设备扫描不到？

A: 
1. 确认设备在同一网段
2. 检查防火墙设置
3. 确认设备端服务已启动
4. 使用 ping 测试网络连通性

### Q: 刷写进度卡在某个位置？

A: 
1. 检查设备是否正常响应
2. 尝试增大重试次数
3. 减小分包大小
4. 检查线缆连接

## 许可证

MIT License
