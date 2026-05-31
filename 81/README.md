# 分布式节点状态遥测网关系统

基于 Node.js + Vue3 + Redis + MySQL 搭建的分布式节点状态遥测网关系统

## 项目架构

```
├── frontend/              # 前端可视化面板模块 (Vue3)
├── gateway-server/        # 网关转发服务模块 (Node.js)
├── collector/             # 节点心跳采集模块 (Node.js)
├── persistence/           # 数据持久化模块 (MySQL + Redis)
│   └── database/
│       └── init.sql       # 数据库初始化脚本
├── package.json           # 根项目配置
└── .env                   # 环境变量配置
```

## 功能模块

### 1. 前端可视化面板模块
- 数据概览仪表盘（节点统计、CPU/内存分布图）
- 多分组节点分页列表
- 实时状态标签展示
- 节点筛选路由（按分组、区域、状态）
- 热点节点排行榜
- WebSocket 实时数据推送

### 2. 网关转发服务模块
- 多级接口转发链路
- WebSocket 实时推送服务
- 节点状态实时缓存
- 统计数据聚合

### 3. 节点心跳采集模块
- 多区域边缘节点模拟
- 定时采集 CPU、内存、带宽、在线时长数据
- 节点数据自动上报

### 4. 数据持久化模块
- Redis 缓存热点节点状态
- MySQL 落地全量历史数据
- 节点数据查询接口

## 快速开始

### 环境要求
- Node.js >= 16.0.0
- MySQL >= 5.7
- Redis >= 5.0

### 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd frontend
npm install
```

### 数据库初始化

1. 创建 MySQL 数据库
2. 执行初始化脚本:
```bash
mysql -u root -p < persistence/database/init.sql
```

### 启动服务

#### 方式一：分别启动各服务

```bash
# 启动数据持久化服务 (端口 3003)
npm run persistence

# 启动网关服务 (端口 3001)
npm run gateway

# 启动节点采集服务 (端口 3002)
npm run collector

# 启动前端开发服务 (端口 5173)
npm run frontend
```

#### 方式二：一键启动所有服务

```bash
npm run dev
```

### 访问地址

- 前端面板: http://localhost:5173
- 网关服务: http://localhost:3001
- 采集服务: http://localhost:3002
- 持久化服务: http://localhost:3003

## API 接口

### 网关服务接口

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/nodes | GET | 获取节点列表 |
| /api/nodes/realtime | GET | 获取实时节点状态 |
| /api/nodes/hot | GET | 获取热点节点 |
| /api/node/:nodeId/metrics | GET | 获取节点历史指标 |
| /api/statistics | GET | 获取统计数据 |
| /api/groups | GET | 获取分组列表 |
| /api/regions | GET | 获取区域列表 |
| /api/collector/heartbeat | POST | 接收节点心跳 |

### WebSocket 消息

```javascript
// 连接
const ws = new WebSocket('ws://localhost:3001')

// 接收心跳数据
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.type === 'heartbeat') {
    console.log(data.data) // 节点指标数据
  }
}
```

## 节点数据结构

```javascript
{
  nodeId: 'node-east-001',      // 节点ID
  groupId: 'group-east',        // 分组ID
  region: 'shanghai',           // 区域
  cpu: 45.23,                   // CPU使用率 (%)
  memory: 62.15,                // 内存使用率 (%)
  bandwidth: 35.67,             // 带宽 (Mbps)
  uptime: 3600,                 // 运行时间 (秒)
  status: 'online',             // 状态: online/offline/warning
  timestamp: '2024-01-01T00:00:00.000Z'
}
```

## 配置说明

修改 `.env` 文件配置数据库和服务端口：

```env
# 服务端口
GATEWAY_PORT=3001
COLLECTOR_PORT=3002
PERSISTENCE_PORT=3003

# MySQL 配置
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=123456
MYSQL_DATABASE=telemetry_db

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
```
