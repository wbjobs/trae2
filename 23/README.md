# 电力巡检终端状态上报与阈值告警 API 集群

高性能、可扩展的电力巡检终端数据采集与智能告警系统。

## 功能特性

### 核心功能
- **终端数据上报**：支持上千台终端同时接入，高并发数据接收
- **智能阈值判定**：多级告警阈值配置，连续超标检测，冷却期控制
- **分级告警推送**：支持 Webhook、短信、邮件、控制台等多渠道推送
- **分布式锁**：基于 Redis 的分布式锁，防止并发请求重复处理
- **消息队列**：RabbitMQ 异步解耦，跨服务消息传递
- **数据持久化**：MySQL 关系型数据库存储，支持大数据量查询
- **集群部署**：多实例负载均衡，自动故障恢复

### 技术特性
- **高并发处理**：Node.js Cluster 模式，充分利用多核 CPU
- **请求限流**：基于 IP 的速率限制，防止恶意攻击
- **数据校验**：Joi 数据验证，确保数据完整性和合法性
- **链路追踪**：全局 Request ID，请求全链路追踪
- **优雅停机**：平滑关闭，确保请求完整性
- **健康检查**：内置健康检查端点，支持容器编排

## 系统架构

```
                    ┌─────────────────┐
                    │   Nginx 负载    │
                    │   均衡器        │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼──────┐     ┌───────▼──────┐     ┌───────▼──────┐
│  API 实例 1  │     │  API 实例 2  │     │  API 实例 N  │
│  (Worker)    │     │  (Worker)    │     │  (Worker)    │
└───────┬──────┘     └───────┬──────┘     └───────┬──────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐
    │   Redis   │      │ RabbitMQ  │      │   MySQL   │
    │ 分布式锁  │      │  消息队列 │      │  数据存储 │
    └───────────┘      └───────────┘      └───────────┘
```

## API 接口

### 终端数据接口
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/terminals/report` | 终端数据上报 |
| GET | `/api/v1/terminals/:terminalId/status` | 获取终端状态 |
| GET | `/api/v1/terminals/:terminalId/history` | 获取终端历史数据 |
| GET | `/api/v1/terminals/:terminalId/alarms` | 获取终端告警 |
| GET | `/api/v1/terminals/list` | 获取终端列表 |

### 告警管理接口
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/alarms` | 获取告警列表 |
| GET | `/api/v1/alarms/:alarmId` | 获取告警详情 |
| PUT | `/api/v1/alarms/:alarmId/acknowledge` | 确认告警 |
| PUT | `/api/v1/alarms/:alarmId/resolve` | 解决告警 |
| GET | `/api/v1/alarms/stats/summary` | 获取告警统计 |

### 阈值规则接口
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/thresholds` | 创建阈值规则 |
| GET | `/api/v1/thresholds` | 获取阈值规则列表 |
| GET | `/api/v1/thresholds/:ruleId` | 获取阈值规则详情 |
| PUT | `/api/v1/thresholds/:ruleId` | 更新阈值规则 |
| DELETE | `/api/v1/thresholds/:ruleId` | 删除阈值规则 |

### 系统接口
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/ready` | 就绪检查 |

## 快速开始

### 环境要求
- Node.js >= 18
- MySQL >= 8.0
- Redis >= 7.0
- RabbitMQ >= 3.12

### 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env

# 修改 .env 配置文件

# 编译 TypeScript
npm run build

# 单实例启动
npm start

# 集群模式启动
npm run start:cluster

# 开发模式
npm run dev
```

### Docker 部署

```bash
# 启动完整集群
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api

# 停止服务
docker-compose down
```

### 终端数据上报示例

```bash
curl -X POST http://localhost:3000/api/v1/terminals/report \
  -H "Content-Type: application/json" \
  -d '{
    "terminalId": "PWR-INS-001",
    "timestamp": 1700000000000,
    "location": {
      "latitude": 39.9042,
      "longitude": 116.4074
    },
    "status": "online",
    "metrics": {
      "voltage": 220,
      "current": 15.5,
      "temperature": 45,
      "humidity": 60,
      "batteryLevel": 85,
      "signalStrength": -75,
      "cpuUsage": 45,
      "memoryUsage": 62
    }
  }'
```

## 配置说明

### 环境变量配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SERVER_PORT` | 服务端口 | 3000 |
| `CLUSTER_MODE` | 是否启用集群模式 | true |
| `CLUSTER_WORKERS` | 工作进程数 | CPU 核心数 |
| `MYSQL_HOST` | MySQL 主机 | localhost |
| `REDIS_HOST` | Redis 主机 | localhost |
| `RABBITMQ_HOST` | RabbitMQ 主机 | localhost |
| `RATE_LIMIT_MAX` | 每分钟最大请求数 | 1000 |

### 告警级别

| 级别 | 说明 | 推送渠道 |
|------|------|----------|
| `info` | 信息 | 控制台 |
| `warning` | 警告 | Webhook、邮件 |
| `critical` | 严重 | Webhook、邮件、短信 |
| `fatal` | 致命 | 所有渠道 |

## 性能指标

- **并发处理**：单实例支持 2000+ QPS
- **数据吞吐量**：集群模式支持 10000+ 终端同时上报
- **响应延迟**：平均响应时间 < 50ms
- **可用性**：99.9% 以上

## 监控与运维

### 健康检查
```bash
curl http://localhost:3000/health
```

### 日志查看
- 应用日志：`./logs/app.log`
- 错误日志：自动记录到文件和控制台

### 数据清理
系统自动清理 90 天前的历史数据，可通过配置调整保留周期。

## 目录结构

```
.
├── src/
│   ├── config/              # 配置文件
│   ├── controllers/         # 控制器
│   ├── database/            # 数据库层
│   │   ├── models/          # ORM 模型
│   │   └── repositories/    # 数据访问层
│   ├── middleware/          # 中间件
│   ├── routes/              # 路由定义
│   ├── services/            # 业务服务
│   ├── types/               # TypeScript 类型
│   ├── utils/               # 工具函数
│   ├── app.ts               # Express 应用
│   ├── server.ts            # 单实例启动
│   └── cluster.ts           # 集群启动
├── Dockerfile               # Docker 镜像
├── docker-compose.yml       # 集群编排
├── nginx.conf               # Nginx 配置
└── package.json             # 项目依赖
```

## License

MIT
