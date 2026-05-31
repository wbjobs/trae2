# 分布式异构终端日志溯源链路分析系统 - API 接口文档

## 概述

本系统提供完整的日志采集、存储、分析和溯源能力，支持跨终端日志追踪。

## 基础信息

- **Base URL**: `http://localhost:8080/api`
- **认证方式**: Bearer Token (JWT)
- **响应格式**: JSON

## 认证接口

### 登录

```
POST /auth/login
```

请求体:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

响应:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "1",
      "username": "admin",
      "role": "admin"
    }
  }
}
```

## 日志接口

### 查询日志

```
POST /logs/query
```

请求体:
```json
{
  "traceId": "可选，Trace ID",
  "level": ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"],
  "service": "服务名称",
  "node": "节点名称",
  "os": ["Linux", "Windows"],
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-02T00:00:00Z",
  "keyword": "关键词搜索"
}
```

响应:
```json
{
  "success": true,
  "data": [...],
  "total": 100
}
```

### 获取日志统计

```
POST /logs/stats
```

请求体: 同查询日志

响应:
```json
{
  "success": true,
  "data": {
    "DEBUG": 100,
    "INFO": 500,
    "WARN": 50,
    "ERROR": 20,
    "FATAL": 5
  }
}
```

### 获取日志详情

```
GET /logs/:id
```

### 获取可用级别

```
GET /logs/levels
```

### 获取服务列表

```
GET /logs/services
```

### 获取节点列表

```
GET /logs/nodes
```

### 接收日志

```
POST /logs/ingest
```

请求体:
```json
{
  "traceId": "trace-xxx",
  "spanId": "span-xxx",
  "level": "INFO",
  "service": "my-service",
  "message": "日志内容",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## 链路追踪接口

### 获取链路详情

```
GET /trace/:traceId
```

响应:
```json
{
  "success": true,
  "data": {
    "nodes": [...],
    "edges": [...],
    "totalDuration": 150,
    "status": "success"
  }
}
```

### 获取链路列表

```
POST /trace/list
```

### 获取链路时间线

```
GET /trace/:traceId/timeline
```

### 比较多条链路

```
POST /trace/compare
```

请求体:
```json
{
  "traceIds": ["trace-1", "trace-2"]
}
```

## 异常聚类接口

### 获取异常聚类

```
GET /clusters?timeRange=24h&severity=high
```

参数:
- `timeRange`: 1h, 6h, 24h, 7d
- `severity`: low, medium, high, critical

### 获取聚类详情

```
GET /clusters/:clusterId
```

### 获取聚类日志

```
GET /clusters/:clusterId/logs?page=1&pageSize=10
```

### 获取异常模式

```
GET /clusters/patterns?timeRange=24h
```

## 数据源接口

### 获取数据源列表

```
GET /sources
```

### 创建数据源

```
POST /sources
```

请求体:
```json
{
  "name": "应用日志",
  "type": "file",
  "config": {
    "path": "/var/log/app.log"
  },
  "connected": false
}
```

### 更新数据源

```
PUT /sources/:id
```

### 删除数据源

```
DELETE /sources/:id
```

### 测试连接

```
POST /sources/:id/test
```

## 仪表板接口

### 获取仪表板列表

```
GET /dashboards
```

### 创建仪表板

```
POST /dashboards
```

请求体:
```json
{
  "name": "默认仪表板",
  "components": [...],
  "layout": "free",
  "filters": {}
}
```

### 更新仪表板

```
PUT /dashboards/:id
```

### 删除仪表板

```
DELETE /dashboards/:id
```

## 服务状态

### 健康检查

```
GET /health
```

### 服务状态

```
GET /services/status
```

## 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |