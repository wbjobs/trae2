# 工业边缘网关 - API 接口文档

## 概述
本系统采用微服务架构，各服务通过 REST API 进行通信。

## 服务端口映射

| 服务 | 端口 | 说明 |
|------|------|------|
| 协议解析 | 8001 | Modbus/Profinet/OPC UA 协议处理 |
| 数据流路由 | 8002 | 数据转换、规则执行 |
| 设备网关 | 8003 | 设备连接管理、数据采集 |
| 数据存储 | 8004 | 时序数据分桶存储 |
| 跨节点通信 | 8005 | MQTT/HTTP 云端通信 |
| 编排服务 | 8006 | 前端界面 + API 代理 |

## 统一入口 (端口 8006)

所有 API 可通过编排服务统一访问：

### 设备管理

#### 获取设备列表
```
GET /devices
Response: { "devices": [DeviceInfo, ...] }
```

#### 获取设备详情
```
GET /devices/{device_id}
Response: DeviceInfo
```

#### 注册设备
```
POST /devices
Body: {
    "device_name": "PLC控制器",
    "device_type": "plc",
    "protocol": "modbus_tcp",
    "ip_address": "192.168.1.100",
    "port": 502,
    "slave_id": 1
}
Response: { "status": "registered", "device": DeviceInfo }
```

#### 删除设备
```
DELETE /devices/{device_id}
Response: { "status": "unregistered" }
```

#### 连接设备
```
POST /devices/connect
Body: { "device_id": "dev-001" }
Response: { "status": "connected" }
```

#### 断开设备
```
POST /devices/disconnect
Body: { "device_id": "dev-001" }
Response: { "status": "disconnected" }
```

#### 读取数据点
```
POST /devices/read
Body: {
    "device_id": "dev-001",
    "points": [
        { "address": "0", "data_type": "float32" },
        { "address": "2", "data_type": "float32" }
    ]
}
Response: {
    "points": [
        { "point_id": "...", "value": 25.5, "quality": "good", "timestamp": "..." },
        ...
    ]
}
```

#### 写入数据点
```
POST /devices/write
Body: {
    "device_id": "dev-001",
    "points": [
        { "address": "100", "data_type": "float32", "value": 50.0 }
    ]
}
Response: { "status": "success" }
```

### 数据流规则

#### 获取规则列表
```
GET /rules
Response: { "rules": [DataFlowRule, ...] }
```

#### 创建规则
```
POST /rules
Body: {
    "rule_name": "温度上传",
    "source_device": "dev-001",
    "source_point": "0",
    "target_device": "cloud",
    "target_point": "temperature",
    "transform_expression": "value * 1.8 + 32",
    "trigger_condition": "value > 0",
    "direction": "edge_to_cloud",
    "priority": 5,
    "enabled": true
}
Response: { "status": "created", "rule": DataFlowRule }
```

#### 更新规则
```
PUT /rules/{rule_id}
Body: { "enabled": false }
Response: { "status": "updated", "rule": DataFlowRule }
```

#### 删除规则
```
DELETE /rules/{rule_id}
Response: { "status": "deleted" }
```

#### 执行规则
```
POST /execute
Body: {
    "rule_id": "rule-001",
    "context": { "value": 100, "timestamp": "..." }
}
Response: { "results": [...] }
```

#### 获取执行统计
```
GET /stats
Response: {
    "total_rules": 10,
    "enabled_rules": 8,
    "success_executions": 1500,
    "failed_executions": 5
}
```

### 数据存储

#### 获取分桶列表
```
GET /buckets
Response: { "buckets": {...} }
```

#### 创建分桶
```
POST /buckets
Body: {
    "name": "factory_sensor_data",
    "description": "工厂传感器数据",
    "retention_days": 365
}
Response: { "status": "created", "bucket": {...} }
```

#### 删除分桶
```
DELETE /buckets/{bucket_name}
Response: { "status": "deleted" }
```

#### 添加测量项
```
POST /buckets/measurements
Body: {
    "bucket": "factory_sensor_data",
    "measurement": "temperature",
    "tags": { "unit": "celsius" }
}
Response: { "status": "added" }
```

#### 写入数据
```
POST /write
Body: {
    "bucket": "factory_sensor_data",
    "measurement": "temperature",
    "point": {
        "device_id": "dev-001",
        "point_id": "point-001",
        "value": 25.5,
        "quality": "good"
    },
    "tags": { "location": "area1" }
}
Response: { "status": "written" }
```

#### 批量写入
```
POST /write/batch
Body: {
    "bucket": "factory_sensor_data",
    "measurement": "temperature",
    "points": [...],
    "tags": { "location": "area1" }
}
Response: { "status": "written", "count": 10 }
```

#### 查询数据
```
GET /query?bucket=xxx&measurement=xxx&start=2024-01-01T00:00:00&end=2024-01-02T00:00:00
Response: { "results": [...] }
```

#### 查询最新数据
```
GET /query/latest?bucket=xxx&measurement=xxx
Response: { "result": {...} }
```

### 协议解析

#### 获取支持的协议
```
GET /protocols
Response: { "protocols": ["modbus_tcp", "modbus_rtu", "profinet", "opc_ua"] }
```

### 健康检查

#### 服务健康状态
```
GET /health
Response: { "status": "running" }
```

## 数据模型

### DeviceInfo
```json
{
    "device_id": "string (UUID)",
    "device_name": "string",
    "device_type": "string",
    "protocol": "modbus_tcp | modbus_rtu | profinet | opc_ua",
    "ip_address": "string",
    "port": 502,
    "slave_id": 1,
    "status": "online | offline | error"
}
```

### DataPoint
```json
{
    "point_id": "string (UUID)",
    "device_id": "string",
    "point_name": "string",
    "address": "string",
    "data_type": "bool | int16 | int32 | float32 | float64",
    "value": "any",
    "quality": "good | bad | uncertain",
    "timestamp": "ISO8601",
    "unit": "string"
}
```

### DataFlowRule
```json
{
    "rule_id": "string (UUID)",
    "rule_name": "string",
    "source_device": "string",
    "source_point": "string",
    "target_device": "string",
    "target_point": "string",
    "transform_expression": "string (Python expression)",
    "trigger_condition": "string (Python expression)",
    "direction": "edge_to_cloud | cloud_to_edge | edge_to_edge",
    "priority": 1-10,
    "enabled": true
}
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| GATEWAY_ENV | 运行环境 (edge/cloud) | edge |
| GATEWAY_ID | 网关唯一标识 | gateway-{pid} |
| GATEWAY_NAME | 网关名称 | Industrial Edge Gateway |
| LOG_LEVEL | 日志级别 | INFO |
| DATABASE_URL | 数据库连接串 | - |
| MQTT_BROKER | MQTT 代理地址 | mqtt://localhost:1883 |
| CLOUD_ENDPOINT | 云端 API 地址 | - |