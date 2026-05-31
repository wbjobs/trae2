# 智能配电房多维度感知与远程联动控制系统

基于微服务架构的智能配电房监控系统，实现设备状态可视化、异常联动跳闸、远程参数配置等功能。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端组态监控面板                        │
│  (React + TypeScript + ECharts + Ant Design)           │
└─────────────────────────────┬───────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────┐
│                    API 网关 / Nginx                       │
└─────────┬───────────────────┬───────────────────┬───────┘
          │                   │                   │
┌─────────▼───────┐   ┌───────▼────────┐   ┌────▼───────────┐
│  感知数据网关    │   │ 电气参数分析   │   │  联动指令下发  │
│  (MQTT + Redis)  │   │  (阈值检测)    │   │  (跳闸控制)    │
└─────────┬───────┘   └───────┬────────┘   └────┬───────────┘
          │                   │                   │
└─────────▼───────────────────▼───────────────────▼───────────┘
│                    告警推送模块                           │
│  (邮件 + 短信 + Webhook + 控制台)                       │
└───────────────────────────────────────────────────────────┘
```

## 模块说明

### 1. frontend-monitoring-panel - 前端组态监控面板
- 技术栈: React 18 + TypeScript + Vite
- UI组件: Ant Design 5.x
- 数据可视化: ECharts
- 功能页面:
  - 监控面板: 实时数据展示、设备状态概览
  - 设备控制: 跳闸/合闸操作、自动跳闸配置
  - 数据分析: 趋势图、数据分布、阈值查看
  - 告警中心: 活动告警、历史告警、告警确认
  - 系统配置: 阈值设置、告警通道配置

### 2. gateway-service - 感知数据网关
- 传感器数据采集（支持模拟和真实硬件）
- MQTT消息发布
- Redis数据缓存与历史存储
- 边缘-云端数据同步
- REST API接口

### 3. electrical-analysis-service - 电气参数分析
- 阈值检测（上限/范围）
- 数据统计分析（均值、趋势、异常检测）
- 电弧故障检测（时间窗口计数）
- 实时数据分析服务

### 4. control-service - 联动指令下发
- 设备状态管理
- 跳闸/合闸/配置/复位控制
- 自动跳闸引擎（冷却机制）
- 操作历史记录

### 5. alert-service - 告警推送
- 多渠道告警（邮件、短信、Webhook、控制台）
- 告警分级（info/warning/critical/emergency）
- 告警抑制机制
- 告警历史管理

### 6. common - 公共模块
- 数据模型定义
- MQTT客户端封装
- 配置加载器
- 常量定义

## 快速开始

### 环境要求
- Python 3.8+
- Node.js 16+
- Redis
- MQTT Broker (Mosquitto)

### Windows环境

1. 安装依赖:
```powershell
.\scripts\install-deps.ps1
```

2. 启动所有服务:
```powershell
.\scripts\start-all.ps1
```

### Linux/macOS环境

1. 安装Python依赖:
```bash
pip install -r gateway-service/requirements.txt
pip install -r electrical-analysis-service/requirements.txt
pip install -r control-service/requirements.txt
pip install -r alert-service/requirements.txt
```

2. 安装前端依赖:
```bash
cd frontend-monitoring-panel
npm install
```

3. 启动所有服务:
```bash
chmod +x scripts/start-all.sh
./scripts/start-all.sh
```

### Docker部署

```bash
docker-compose up -d
```

## 服务地址

| 服务 | 地址 |
|------|------|
| 前端监控面板 | http://localhost:3000 |
| 网关服务API | http://localhost:5000 |
| 分析服务API | http://localhost:5001 |
| 控制服务API | http://localhost:5002 |
| 告警服务API | http://localhost:5003 |
| MQTT Broker | localhost:1883 |
| Redis | localhost:6379 |

## 传感器类型

- **temperature**: 温度 (°C)
- **humidity**: 湿度 (%)
- **current**: 电流 (A)
- **voltage**: 电压 (V)
- **arc**: 电弧检测 (次/10分钟)
- **smoke**: 烟雾浓度 (ppm)

## 告警级别

| 级别 | 颜色 | 说明 |
|------|------|------|
| info | 蓝色 | 通知信息 |
| warning | 橙色 | 警告，需要关注 |
| critical | 红色 | 严重，建议处理 |
| emergency | 红色 | 紧急，立即处理 |

## 配置说明

配置文件位于 `config/` 目录:

- `application.yaml`: 基础配置
- `application-edge.yaml`: 边缘节点配置
- `application-cloud.yaml`: 云端服务配置

通过环境变量 `ENV` 指定运行环境:
```bash
export ENV=edge  # 边缘节点
export ENV=cloud # 云端服务
```

## API接口示例

### 获取配电房列表
```http
GET /api/gateway/api/rooms
```

### 获取房间实时传感器数据
```http
GET /api/gateway/api/sensor/latest/{room_id}
```

### 发送控制命令
```http
POST /api/control/api/command
Content-Type: application/json

{
  "room_id": "room_001",
  "device_id": "room_001_curr_01",
  "command_type": "trip",
  "params": {
    "reason": "manual"
  }
}
```

### 获取活动告警
```http
GET /api/alert/api/alerts/active
```

## 边缘节点部署

在嵌入式Linux设备上部署:
```bash
chmod +x scripts/edge-deploy.sh
sudo ./scripts/edge-deploy.sh
```

## 云端服务部署

在云服务器上部署:
```bash
chmod +x scripts/cloud-deploy.sh
sudo ./scripts/cloud-deploy.sh
```

## 目录结构

```
.
├── frontend-monitoring-panel/    # 前端监控面板
│   ├── src/
│   │   ├── pages/               # 页面组件
│   │   ├── services/            # API服务
│   │   └── types/               # TypeScript类型
│   ├── package.json
│   └── vite.config.ts
├── gateway-service/              # 感知数据网关
│   └── src/
├── electrical-analysis-service/  # 电气参数分析
│   └── src/
├── control-service/              # 联动指令下发
│   └── src/
├── alert-service/                # 告警推送模块
│   └── src/
├── common/                       # 公共模块
│   └── src/
├── config/                       # 配置文件
├── scripts/                      # 部署脚本
└── docker-compose.yml
```

## 许可证

MIT License
