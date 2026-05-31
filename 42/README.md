# 轨道交通车载通信单元信道状态监控系统

Railway On-board Communication Channel Monitoring System

## 系统概述

本系统用于实时监控轨道交通车载通信单元的信道状态，包含信令采集、质量分析、节点同步、异常告警和日志审计等功能。

## 功能特性

### 📡 信令接收服务
- 支持 LTE-M、GSM-R、5G-R、TETRA 等多种通信协议
- 实时 WebSocket 信令数据推送
- 多频段支持（450MHz ~ 3500MHz）
- 信令数据缓存与历史记录

### 📊 信道质量分析
- 信噪比（SNR）实时监测与分析
- 丢包率统计与趋势分析
- 延迟与抖动监测
- 信道质量评分与等级划分
- 智能异常检测与告警

### 🔗 车载节点同步
- 全线路车载节点状态实时同步
- 节点心跳监测与超时检测
- 车地跨服务数据交互
- 断点续传与数据队列

### ⚠️ 告警中心
- 实时异常信道标记
- 多级告警机制（严重/警告）
- 告警确认与解决流程
- 告警历史记录

### 📝 日志审计
- 全操作日志留存
- 多分类日志管理（系统/用户/配置/分析/同步/告警）
- 日志搜索与过滤
- 日志导出功能

## 项目结构

```
railway-monitor/
├── backend/
│   ├── services/
│   │   ├── signalingService.js    # 信令接收服务
│   │   ├── analysisService.js     # 信道质量分析模块
│   │   ├── syncService.js         # 车载节点同步模块
│   │   └── groundServer.js        # 地面运维服务器
│   └── modules/
│       ├── logger.js              # 日志模块
│       └── auditLogger.js         # 审计日志模块
├── frontend/
│   ├── index.html                 # 主页面
│   ├── styles/
│   │   └── main.css               # 样式文件
│   └── src/
│       ├── api/
│       │   └── api.js             # API 接口
│       ├── components/
│       │   ├── Charts.js          # 图表组件
│       │   ├── ChannelGrid.js     # 信道网格组件
│       │   ├── NodeGrid.js        # 节点网格组件
│       │   ├── AlertPanel.js      # 告警面板组件
│       │   └── AuditPanel.js      # 审计面板组件
│       └── app.js                 # 主应用逻辑
├── config/
│   └── config.js                  # 系统配置
├── deployment/
│   ├── docker-compose.yml         # Docker Compose 配置
│   ├── Dockerfile.*               # Docker 镜像配置
│   ├── nginx.conf                 # Nginx 配置
│   ├── start.bat                  # Windows 启动脚本
│   ├── start.sh                   # Linux 启动脚本
│   └── systemd/                   # Systemd 服务配置
├── logs/                          # 日志目录
├── package.json                   # 后端依赖
├── server.js                      # 主服务入口
└── .env.example                   # 环境变量示例
```

## 快速开始

### 环境要求
- Node.js >= 16.x
- MongoDB >= 4.x (可选)
- Redis >= 6.x (可选)

### Windows 快速启动

```bash
# 1. 克隆项目
git clone <repository-url>
cd railway-monitor

# 2. 使用启动脚本
deployment\start.bat
```

### Linux 快速启动

```bash
# 1. 克隆项目
git clone <repository-url>
cd railway-monitor

# 2. 添加执行权限
chmod +x deployment/start.sh

# 3. 启动服务
./deployment/start.sh
```

### 手动启动

```bash
# 1. 安装后端依赖
npm install

# 2. 安装前端依赖
cd frontend && npm install && cd ..

# 3. 复制环境变量配置
cp .env.example .env

# 4. 启动后端服务 (端口 3000)
npm start

# 5. 启动前端服务 (端口 8080)
cd frontend && npm run dev
```

### Docker 部署

```bash
# 启动所有服务
cd deployment
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f backend
```

## 访问地址

- 前端面板: http://localhost:8080
- 后端 API: http://localhost:3000
- WebSocket: ws://localhost:3000
- 信令服务: ws://localhost:8080
- 地面服务: http://localhost:8081

## API 接口

### 系统状态
- `GET /api/health` - 健康检查
- `GET /api/config` - 获取配置

### 信道管理
- `GET /api/channels` - 获取所有信道状态
- `WebSocket: channelUpdate` - 信道状态实时更新

### 节点管理
- `GET /api/nodes` - 获取所有节点状态
- `WebSocket: nodeUpdate` - 节点状态实时更新

### 数据分析
- `GET /api/analysis/recent?limit=100` - 获取最近分析结果
- `WebSocket: analysisResult` - 分析结果实时推送

### 告警管理
- `GET /api/alerts?limit=50` - 获取告警列表
- `WebSocket: anomalyDetected` - 异常告警实时推送

### 日志审计
- `GET /api/audit?page=1&pageSize=20&category=SYSTEM` - 查询审计日志

## 配置说明

### 主要配置项

```javascript
{
  server: {
    port: 3000,              // 主服务端口
    signalingPort: 8080,     // 信令服务端口
    host: '0.0.0.0'          // 监听地址
  },
  ground: {
    serverUrl: 'http://ground-server:8080',  // 地面服务器地址
    syncInterval: 5000                        // 同步间隔(ms)
  },
  analysis: {
    snr: {
      excellent: 30,    // >= 30dB: 优秀
      good: 20,         // >= 20dB: 良好
      fair: 10,         // >= 10dB: 一般
      poor: 0           // < 0dB: 较差
    },
    packetLoss: {
      excellent: 0.01,  // <= 0.01%: 优秀
      good: 0.1,        // <= 0.1%: 良好
      fair: 1,          // <= 1%: 一般
      poor: 5           // <= 5%: 较差
    }
  }
}
```

## 支持的通信协议

| 协议 | 频段 | 典型应用 |
|------|------|----------|
| LTE-M | 450MHz/800MHz/900MHz | 车地通信、物联网 |
| GSM-R | 900MHz | 铁路专用通信 |
| 5G-R | 1800MHz/2600MHz/3500MHz | 下一代铁路通信 |
| TETRA | 380-430MHz | 专业集群通信 |

## 部署架构

### 车载端部署
- 嵌入式 Linux 系统
- 低功耗硬件平台
- 本地数据缓存
- 断点续传机制

### 地面运维中心
- 多列车数据汇聚
- 大数据分析平台
- 可视化运维面板
- 历史数据存储

## 技术栈

### 后端
- Node.js + Express
- Socket.io (WebSocket)
- Winston (日志)
- MongoDB/Redis (可选)

### 前端
- 原生 JavaScript
- Chart.js (图表)
- Socket.io Client
- 响应式设计

### 部署
- Docker / Docker Compose
- Nginx (反向代理)
- Systemd (服务管理)

## 许可证

MIT License
