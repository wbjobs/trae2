# 分布式异构终端日志溯源链路分析系统 - 架构文档

## 系统架构

### 整体架构图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │
│   前端可视化   │────▶│   网关转发    │────▶│  日志采集服务  │
│  (React)    │     │  (Express)  │     │ (Node.js)   │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │             │
                                        │  存储索引模块  │
                                        │ (PostgreSQL) │
                                        │             │
                                        └─────────────┘
```

### 模块说明

#### 1. 前端可视化模块
- **技术栈**: React 18 + TypeScript + Vite + Ant Design + ECharts + D3.js
- **功能**:
  - 低代码组件拖拽式构建仪表板
  - 多维度日志筛选面板
  - 链路溯源图可视化（D3力导向图）
  - 异常聚类分析展示
  - 实时日志监控

#### 2. 网关转发模块
- **技术栈**: Node.js + Express + http-proxy-middleware
- **功能**:
  - API 请求路由转发
  - JWT 认证授权
  - 请求限流保护
  - 统一日志记录
  - 服务健康检查

#### 3. 日志采集服务
- **技术栈**: Node.js + Elasticsearch + Redis + Chokidar
- **功能**:
  - 多源日志采集（文件、数据库、API、Syslog）
  - 日志格式解析与标准化
  - 批量索引写入 Elasticsearch
  - 异常日志自动聚类
  - 系统指标采集
  - 跨平台文件监控（Linux/Windows）

#### 4. 存储索引模块
- **技术栈**: Node.js + PostgreSQL + Redis
- **功能**:
  - 数据库分表存储（按 Trace ID 哈希分片）
  - 数据源配置管理
  - 仪表板配置存储
  - Redis 缓存加速
  - 定期数据清理

## 数据模型

### 日志条目 (LogEntry)
```typescript
{
  id: string                    // 唯一标识
  traceId: string               // 链路追踪ID
  spanId: string                // 跨度ID
  parentSpanId: string          // 父跨度ID
  timestamp: string             // 时间戳
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
  service: string               // 服务名称
  node: string                  // 节点名称
  os: 'Linux' | 'Windows'       // 操作系统
  message: string               // 日志内容
  stackTrace?: string           // 堆栈信息
  metadata?: Record<string, any> // 元数据
  tags?: string[]               // 标签
}
```

### 分表策略
- **分片数**: 可配置（默认 4 个分片表）
- **分片规则**: `shardId = hash(traceId) % shardCount`
- **表命名**: `log_entries_0`, `log_entries_1`, ...

## 跨平台适配

### Linux 环境
- 文件监控: inotify
- 日志路径: `/var/log/`, `/var/log/syslog`
- 系统服务: systemd

### Windows 环境
- 文件监控: ReadDirectoryChangesW
- 日志路径: `C:\Logs\`, 事件日志
- 系统服务: Windows Service

### 统一接口
```typescript
interface PlatformAdapter {
  getLogPaths(): string[]
  watchFile(filePath: string): FileWatcher
  collectMetrics(): SystemMetrics
}
```

## 部署架构

### Docker Compose (推荐)
```yaml
version: '3.8'
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]

  gateway:
    build: ./gateway
    ports: ["8080:8080"]
    environment:
      - COLLECTOR_SERVICE_URL=http://collector:8081
      - STORAGE_SERVICE_URL=http://storage:8082

  collector:
    build: ./collector
    ports: ["8081:8081"]
    environment:
      - ELASTICSEARCH_HOST=elasticsearch:9200
      - REDIS_HOST=redis

  storage:
    build: ./storage
    ports: ["8082:8082"]
    environment:
      - DB_HOST=postgresql
      - REDIS_HOST=redis

  elasticsearch:
    image: elasticsearch:8.11.0
    ports: ["9200:9200"]
    environment:
      - discovery.type=single-node

  postgresql:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      - POSTGRES_DB=log_trace_db
      - POSTGRES_PASSWORD=postgres

  redis:
    image: redis:7
    ports: ["6379:6379"]
```

## 性能优化

### 写入优化
- 批量写入（Bulk API）
- 异步缓冲队列
- 定时刷新机制

### 查询优化
- Redis 缓存热点数据
- Elasticsearch 查询缓存
- 数据库索引优化
- 查询结果分页

### 存储优化
- 按日期索引（ILM 策略）
- 定期清理过期数据
- 冷热数据分离

## 安全机制

### 认证授权
- JWT Token 认证
- 角色权限控制（RBAC）
- Token 自动刷新

### 数据安全
- 敏感数据脱敏
- HTTPS 传输加密
- SQL 注入防护

### 访问控制
- API 限流
- IP 黑名单
- 请求审计日志