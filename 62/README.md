# 地铁弱电系统信令采集与全网状态监控系统

## 系统架构

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  车载终端    │────▶│ 车站节点    │────▶│  地面运维服务器   │
│ (OnBoard)   │     │ (Station)   │     │  (OCC Center)    │
└─────────────┘     └─────────────┘     └──────────────────┘
       │                   │                      │
       └──────── 车-站-中心跨服务数据交互 ────────────┘
                            │
                     ┌──────┴──────┐
                     │ 信令接收服务 │──▶ 链路质量分析 ──▶ 态势可视化
                     │ (Signaling) │      │
                     └─────────────┘      ▼
                                  操作日志审计
```

## 模块说明

| 模块 | 路径 | 说明 |
|------|------|------|
| 信令接收服务 | backend/signaling-service | 抓取通信/门禁/广播等弱电信令，解析协议 |
| 链路质量分析 | backend/link-analyzer | 分析链路通断、延迟、抖动，异常链路标记 |
| 车站节点同步 | backend/station-sync | 车-站-中心跨服务数据交互与同步 |
| 操作日志审计 | backend/audit-service | 操作日志留存与审计查询 |
| 态势可视化 | frontend/dashboard | React + ECharts 前端态势面板 |

## 技术栈

- 后端：Node.js + Express + WebSocket + SQLite
- 前端：React 18 + Vite + ECharts
- 通信：HTTP/REST + WebSocket + MQTT 轻量协议
- 部署：车载终端 (x86/ARM) + 车站节点 + 地面运维服务器

## 快速启动

```bash
# 启动信令接收服务
cd backend/signaling-service && npm install && npm start

# 启动链路分析服务
cd backend/link-analyzer && npm install && npm start

# 启动车站同步服务
cd backend/station-sync && npm install && npm start

# 启动审计服务
cd backend/audit-service && npm install && npm start

# 启动前端
cd frontend/dashboard && npm install && npm run dev
```
