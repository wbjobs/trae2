# 车载终端数据汇聚转发 API 集群

基于 Go 微服务架构的车载终端数据汇聚转发系统，支持海量车载终端接入、数据编解码、流量管控、区域路由、离线缓存和数据存储。

## 系统架构

```
┌─────────────────┐
│   车载终端集群   │
└────────┬────────┘
         │ TCP/HTTP
┌────────▼────────┐
│  Nginx 负载均衡  │
└────────┬────────┘
         │
┌────────▼────────────────────────────────────────┐
│           Gateway 节点集群                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Node-001 │  │ Node-002 │  │ Node-003 │ ...  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
└───────┼──────────────┼──────────────┼──────────┘
        │              │              │
┌───────▼──────────────▼──────────────▼──────────┐
│  终端接入  │  数据编解码  │  流量控制  │  路由转发 │
└───────┬──────────────┬──────────────┬──────────┘
        │              │              │
┌───────▼──────────────▼──────────────▼──────────┐
│  Redis 集群 (缓存/服务注册发现/限流/离线队列)   │
└───────┬────────────────────────────────────────┘
        │
┌───────▼────────┐
│   MySQL 集群    │
│  (数据分表存储)  │
└────────────────┘
```

## 功能模块

### 1. 终端接入模块 ([access](internal/access))
- **TCP 服务器**: 支持 JT808 协议终端接入
- **HTTP 服务器**: 支持 RESTful API 接入
- **连接管理**: 连接池管理、连接状态监控
- **设备鉴权**: Token 验证、设备状态管理

### 2. 数据编解码模块 ([codec](internal/codec))
- **JT808 协议解析**: 支持标准 JT808-2019 协议
- **统一消息转换**: 将不同协议转换为内部统一格式
- **数据校验**: CRC 校验、数据完整性验证

### 3. 流量控管模块 ([flowctrl](internal/flowctrl))
- **令牌桶限流**: 全局、单设备、单 IP 限流
- **分布式限流**: 基于 Redis 的集群限流
- **熔断器**: 故障熔断、自动恢复
- **滑动窗口**: QPS 统计与控制

### 4. 转发路由模块 ([router](internal/router))
- **区域路由**: 根据车辆所属区域转发
- **一致性哈希**: 设备级路由保证
- **负载均衡**: 轮询、权重、最少连接、IP 哈希

### 5. 离线数据缓存模块 ([cache](internal/cache))
- **离线队列**: 故障数据自动重试
- **数据压缩**: 大消息自动 GZIP 压缩
- **设备缓存**: 设备信息、位置缓存

### 6. 数据落地模块 ([storage](internal/storage))
- **MySQL 存储**: 数据持久化
- **批量写入**: 提升写入性能
- **数据分表**: 按设备哈希分表

### 7. 集群管理模块 ([cluster](internal/cluster))
- **服务注册发现**: 基于 Redis 的服务注册
- **健康检查**: 节点存活检测
- **集群状态同步**: 节点信息实时同步

## 快速开始

### 环境要求
- Go 1.21+
- MySQL 8.0+
- Redis 7.0+
- Docker (可选)

### 本地运行

1. **初始化数据库**
```bash
mysql -u root -p < deploy/init.sql
```

2. **修改配置**
```bash
vim configs/config.yaml
```

3. **运行服务**
```bash
cd vehicle-gateway
go mod download
go run cmd/server/main.go
```

### Docker 部署

```bash
cd deploy
docker-compose up -d
```

## 配置说明

主要配置项 ([config.yaml](configs/config.yaml)):

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| server.node_id | 节点唯一标识 | node-001 |
| server.http_addr | HTTP 监听地址 | :8080 |
| server.tcp_addr | TCP 监听地址 | :8081 |
| database.host | MySQL 地址 | 127.0.0.1 |
| redis.addr | Redis 地址 | 127.0.0.1:6379 |
| cluster.enabled | 集群模式开关 | true |
| flowctrl.global_qps | 全局限流 QPS | 10000 |
| flowctrl.per_device_qps | 单设备限流 QPS | 100 |

## API 接口

### HTTP 接口

#### 1. 设备登录
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "device_id": "000000000001",
  "token": "your_token"
}
```

#### 2. 数据上报
```
POST /api/v1/data/upload
Authorization: Bearer {token}
X-Device-ID: {device_id}
Content-Type: application/json

{
  "msg_type": "LOCATION",
  "data": {
    "latitude": 39.9042,
    "longitude": 116.4074,
    "speed": 60.5
  }
}
```

#### 3. 心跳
```
POST /api/v1/heartbeat
Authorization: Bearer {token}
X-Device-ID: {device_id}
```

#### 4. 健康检查
```
GET /api/v1/health
```

### TCP 协议 (JT808)

TCP 端口: 8081

支持标准 JT808 协议消息:
- 0x0100: 终端注册
- 0x0200: 位置信息汇报
- 0x0002: 终端心跳
- 0x0003: 终端注销

## 性能指标

| 指标 | 目标值 |
|------|--------|
| 单节点 TCP 连接数 | 10,000+ |
| 单节点消息处理 | 10,000 QPS |
| 数据写入延迟 | < 100ms |
| 集群线性扩展 | 支持 N 节点 |

## 监控与运维

### 日志
- 日志级别: debug, info, warn, error
- 支持文件输出与滚动
- 支持 JSON 格式

### 常用命令

```bash
# 查看连接数
redis-cli SCARD service:vehicle-gateway:nodes

# 查看离线队列长度
redis-cli LLEN offline:queue

# 查看在线设备
redis-cli KEYS "online:*"
```

## 扩展开发

### 添加新协议

1. 在 `internal/codec/` 下创建新的解码器
2. 实现 `Decode` 和 `ConvertToUnified` 方法
3. 在接入层注册新协议处理

### 自定义路由策略

1. 在 `internal/router/` 中实现新的路由算法
2. 实现 `AddNode`, `RemoveNode`, `GetNode` 方法
3. 在集群管理器中配置使用

## 许可证

MIT License
