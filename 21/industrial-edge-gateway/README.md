# 工业边缘网关协议转换与数据流编排系统

基于微服务架构的工业边缘网关系统，支持多工业协议互转、可视化拖拽编排、跨节点通信。

## 系统架构

```
industrial-edge-gateway/
├── frontend-orchestration/     # 前端编排画布模块
│   ├── index.html             # 主页面
│   ├── css/                   # 样式文件
│   │   ├── canvas.css         # 画布样式
│   │   └── components.css     # 组件样式
│   └── js/                    # JavaScript 文件
│       ├── api.js             # API 接口
│       ├── canvas.js          # 画布核心
│       ├── nodes.js           # 节点管理
│       ├── connections.js     # 连接管理
│       ├── properties.js      # 属性面板
│       └── main.js            # 主入口
│
├── protocol-parser/            # 协议解析模块
│   └── src/
│       ├── base.py            # 协议基类与工厂
│       ├── modbus_parser.py   # Modbus TCP/RTU 解析
│       ├── profinet_parser.py # Profinet 解析
│       ├── opcua_parser.py    # OPC UA 解析
│       └── service.py         # 微服务入口
│
├── dataflow-router/            # 数据流路由模块
│   └── src/
│       ├── engine.py          # 转换/条件/路由引擎
│       ├── rule_manager.py    # 规则管理器
│       └── service.py         # 微服务入口
│
├── device-gateway/             # 设备接入网关模块
│   └── src/
│       ├── device_manager.py  # 设备连接管理
│       ├── data_collector.py  # 数据采集器
│       └── service.py         # 微服务入口
│
├── data-storage/               # 数据落地存储模块
│   └── src/
│       ├── storage_engine.py  # 存储引擎与分桶管理
│       ├── time_series_db.py  # 时序数据库适配
│       └── service.py         # 微服务入口
│
├── cross-node-communication/   # 跨节点通信模块
│   └── src/
│       ├── mqtt_client.py     # MQTT 客户端
│       ├── http_client.py     # HTTP 客户端
│       ├── message_bus.py     # 消息总线
│       └── service.py         # 微服务入口
│
├── shared/                     # 共享模块
│   └── src/
│       ├── models.py          # 通用数据模型
│       ├── exceptions.py      # 自定义异常
│       ├── config.py          # 配置管理
│       └── logger.py          # 日志工具
│
├── config/                     # 配置文件
│   ├── gateway_config.json    # 边缘端配置
│   └── cloud_config.json      # 云端配置
│
└── scripts/                    # 脚本
    ├── gateway_main.py        # 主入口
    ├── orchestration/         # 编排服务
    ├── start.bat              # Windows 启动
    ├── start.sh               # Linux 启动
    └── test_gateway.py        # 测试脚本
```

## 核心功能

### 1. 多协议支持
- **Modbus TCP** - 工业以太网标准协议
- **Modbus RTU** - 串口通信协议
- **Profinet** - 基于以太网的工业自动化总线
- **OPC UA** - 开放平台通信统一架构

### 2. 可视化编排
- 拖拽式节点创建
- 节点类型：数据源、数据目标、设备、转换、条件、存储
- 连接端口拖拽连线
- 属性面板实时编辑
- 转换表达式编辑器
- 触发条件配置

### 3. 数据流路由
- 表达式转换引擎
- 条件触发判断
- 规则链执行
- 执行历史记录

### 4. 数据存储
- 时序数据库分桶存储
- 支持 SQLite (嵌入式)、TimescaleDB、InfluxDB
- 数据保留策略
- 批量写入优化

### 5. 跨节点通信
- MQTT 消息队列
- HTTP REST API
- 内部消息总线
- 心跳保活机制

## 快速开始

### 环境要求
- Python 3.8+
- 支持 Windows / Linux (嵌入式)

### 安装依赖
```bash
pip install -r requirements.txt
```

### 运行测试
```bash
python scripts/test_gateway.py
```

### 启动网关

**边缘端模式:**
```bash
# Windows
scripts\start.bat

# Linux
bash scripts/start.sh
```

**云端模式:**
```bash
bash scripts/start.sh cloud
```

### 访问界面
启动后访问: http://localhost:8006

## API 接口

详细接口文档请参考 [API_REFERENCE.md](API_REFERENCE.md)

### 设备管理
- `GET /devices` - 获取设备列表
- `POST /devices` - 注册设备
- `POST /devices/connect` - 连接设备
- `POST /devices/read` - 读取数据点
- `POST /devices/write` - 写入数据点

### 规则管理
- `GET /rules` - 获取规则列表
- `POST /rules` - 创建规则
- `PUT /rules/{id}` - 更新规则
- `DELETE /rules/{id}` - 删除规则

### 数据存储
- `GET /buckets` - 获取分桶列表
- `POST /buckets` - 创建分桶
- `POST /write` - 写入数据
- `GET /query` - 查询数据

## 配置说明

### 环境变量
| 变量 | 说明 | 默认值 |
|------|------|--------|
| GATEWAY_ENV | 运行环境 (edge/cloud) | edge |
| DATABASE_URL | 数据库连接 | - |
| MQTT_BROKER | MQTT 代理 | mqtt://localhost:1883 |
| CLOUD_ENDPOINT | 云端地址 | - |

### 配置文件
- `config/gateway_config.json` - 边缘端配置
- `config/cloud_config.json` - 云端配置

## 部署说明

### 嵌入式 Linux
1. 安装 Python 3.8+
2. 安装依赖: `pip install -r requirements.txt`
3. 配置 `config/gateway_config.json`
4. 运行: `bash scripts/start.sh`

### 云端服务器
1. 安装 Docker 和 Docker Compose
2. 配置 PostgreSQL/TimescaleDB
3. 配置 MQTT Broker (可选 EMQX/Mosquitto)
4. 设置 `GATEWAY_ENV=cloud`
5. 运行: `bash scripts/start.sh cloud`

## 技术栈

- **后端**: Python 3.8+, 标准库 HTTP Server
- **前端**: 原生 JavaScript + SVG + CSS
- **数据库**: SQLite (默认), TimescaleDB, InfluxDB
- **通信**: MQTT, HTTP REST

## 许可证

MIT License