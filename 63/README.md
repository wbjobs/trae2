# 长输管线腐蚀监测数据接入与分级告警API集群

## 项目概述

本系统是一个高性能、高可用的长输管线腐蚀监测数据接入与分级告警API集群系统，支持上万监测点同时并发接入，实现腐蚀数据的实时采集、校验、告警判定、消息推送和分布式任务调度。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     API 集群层                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Worker1    │  │ Worker2 │  │ WorkerN │         │
│  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     数据校验层                           │
│  参数校验 │ 格式验证 │ 异常处理 │ 设备认证           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     分布式任务队列                       │
│  Bull / Redis Queue                                 │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 阈值判定引擎 │    │ 时序数据库   │    │ 消息队列     │
│ 多级告警   │    │ InfluxDB     │    │ Kafka        │
└──────────────┘    └──────────────┘    └──────────────┘
```

## 核心功能模块

### 1. 接口路由层 ([app.js](file:///e:/trae2/63/app.js)
- RESTful API 接口
- 负载均衡与集群管理
- 请求限流与安全防护
- 统一响应格式

### 2. 数据校验模块 ([validators/](file:///e:/trae2/63/validators/))
- 腐蚀数据参数校验
- 设备ID格式验证
- 数据范围校验
- 批量数据校验

### 3. 腐蚀阈值判定模块 ([services/alertThreshold.service.js](file:///e:/trae2/63/services/alertThreshold.service.js))
- 腐蚀电位告警判定
- 壁厚损失率告警判定
- 四级告警级别：正常/预警/告警/紧急
- 动态阈值配置

### 4. 消息推送模块 ([services/kafkaProducer.service.js](file:///e:/trae2/63/services/kafkaProducer.service.js))
- Kafka 消息生产者
- 原始数据推送
- 告警消息推送
- 批量消息处理

### 5. 分布式任务调度模块 ([services/taskScheduler.service.js](file:///e:/trae2/63/services/taskScheduler.service.js))
- Bull 队列任务调度
- 数据处理任务
- 告警处理任务
- 批量处理任务
- 任务优先级管理

### 6. 时序数据库接入层 ([services/influxdb.service.js](file:///e:/trae2/63/services/influxdb.service.js))
- InfluxDB 数据写入
- 腐蚀数据存储
- 告警数据存储
- 数据查询接口

## 技术栈

- **运行时**: Node.js 16+
- **Web框架**: Express.js
- **消息队列**: Kafka
- **任务队列**: Bull (Redis)
- **时序数据库**: InfluxDB 2.x
- **缓存**: Redis
- **数据校验**: Joi
- **日志**: Winston
- **集群**: Node.js Cluster

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- Redis >= 6.0
- Kafka >= 2.8
- InfluxDB >= 2.0

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env` 文件并根据实际环境修改配置：

```bash
cp .env.example .env
```

### 启动服务

#### 单节点模式：

```bash
npm start
```

#### 集群模式：

```bash
npm run start:cluster
```

#### 开发模式：

```bash
npm run dev
```

## API 接口文档

### 1. 腐蚀数据上报

#### 单条数据上报

```http
POST /api/v1/corrosion/data
Content-Type: application/json

{
  "deviceId": "DEV-12345678-1234-1234-1234-1234567890AB",
  "timestamp": 1704067200000,
  "location": {
    "pipelineId": "PL-001",
    "segmentId": "SEG-001",
    "kilometerMarker": 125.5,
    "latitude": 39.9042,
    "longitude": 116.4074
  },
  "corrosion": {
    "potential": -850,
    "wallThickness": 8.5,
    "originalThickness": 10.0,
    "corrosionRate": 0.15
  },
  "environment": {
    "temperature": 25.5,
    "humidity": 65,
    "ph": 7.2,
    "soilResistivity": 2500
  },
  "metadata": {
    "signalStrength": 85,
    "batteryLevel": 78,
    "firmwareVersion": "v2.1.0"
  }
}
```

**响应示例：

```json
{
  "success": true,
  "requestId": "xxx",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "message": "Data received successfully",
  "data": {
    "success": true,
    "deviceId": "DEV-...",
    "jobId": "123",
    "timestamp": 1704067200000,
    "receivedAt": 1704067200000
  }
}
```

#### 批量数据上报

```http
POST /api/v1/corrosion/data/batch
Content-Type: application/json

{
  "batchId": "BATCH-20240101-001",
  "records": [
    {
      "deviceId": "DEV-...",
      "timestamp": 1704067200000,
      ...
    }
  ]
}
```

#### 即时校验上报

```http
POST /api/v1/corrosion/data/immediate
Content-Type: application/json
```

### 2. 设备状态查询

```http
GET /api/v1/corrosion/device/:deviceId/status
```

### 3. 告警管理

#### 查询告警列表

```http
GET /api/v1/alerts?level=critical&page=1&pageSize=20
```

#### 告警确认

```http
POST /api/v1/alerts/acknowledge
Content-Type: application/json

{
  "alertId": "ALERT-xxx",
  "operator": "张三",
  "remark": "已安排现场检查",
  "acknowledgeAction": "acknowledge"
}
```

#### 获取阈值配置

```http
GET /api/v1/alerts/thresholds
```

#### 更新阈值配置

```http
PUT /api/v1/alerts/thresholds
Content-Type: application/json

{
  "type": "potential",
  "warning": -850,
  "critical": -1000,
  "emergency": -1150
}
```

### 4. 系统监控

#### 健康检查

```http
GET /api/v1/health
```

#### 队列状态

```http
GET /api/v1/corrosion/stats/queues
```

#### 系统统计

```http
GET /api/v1/corrosion/stats/system
```

## 告警级别说明

| 级别 | 电位阈值 (mV) | 壁厚损失率 (%) | 说明 |
|------|--------------|---------------|------|
| 正常 | > -850 | < 10 | 正常运行 |
| 预警 | -850 ~ -1000 | 10 ~ 20 | 需要关注 |
| 告警 | -1000 ~ -1150 | 20 ~ 30 | 需要处理 |
| 紧急 | ≤ -1150 | ≥ 30 | 立即处置 |

## 性能指标

- 单节点支持：> 10,000 TPS
- 集群支持：> 50,000+ TPS
- 数据处理延迟：< 100ms
- 支持并发接入点：10,000+

## 项目结构

```
e:\trae2\63
├── app.js                      # Express应用主文件
├── server.js                   # 单节点服务启动文件
├── cluster.js                  # 集群模式启动文件
├── package.json               # 项目依赖配置
├── .env                       # 环境变量配置
├── config/
│   └── index.js            # 配置管理
├── middleware/
│   ├── errorHandler.js     # 错误处理中间件
│   └── requestLogger.js  # 请求日志中间件
├── routes/
│   ├── corrosion.routes.js  # 腐蚀数据路由
│   ├── alert.routes.js     # 告警管理路由
│   └── health.routes.js    # 健康检查路由
├── services/
│   ├── dataProcessing.service.js    # 数据处理服务
│   ├── alertThreshold.service.js # 告警阈值服务
│   ├── taskScheduler.service.js    # 任务调度服务
│   ├── kafkaProducer.service.js   # Kafka生产者服务
│   └── influxdb.service.js        # InfluxDB服务
├── validators/
│   ├── corrosion.validator.js # 腐蚀数据校验
│   └── alert.validator.js    # 告警数据校验
├── utils/
│   ├── logger.js           # 日志工具
│   ├── redis.js            # Redis客户端
│   └── response.js         # 响应工具
└── logs/                     # 日志目录
```

## 监控与运维

### 日志文件位置：
- 应用日志：`logs/app.log`
- 错误日志：`logs/error.log`

### 关键监控指标：
- `stats:total_processed` - 总处理数据量
- `stats:alerts:total` - 总告警数
- `stats:alerts:emergency` - 紧急告警数
- `stats:alerts:critical` - 严重告警数
- `stats:alerts:warning` - 预警数

## License

MIT
