# 工业时序工况数据分析与可视化平台

基于 **ECharts + Python FastAPI + ClickHouse + Grafana** 构建的工业级时序数据可视化分析平台，支持海量工业工况数据的存储、清洗、分析和可视化展示。

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端可视化层                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │ Vue 3 +     │  │ ECharts 图表 │  │ Element Plus UI │    │
│  │ Element Plus│  │ 多维度联动   │  │   组件库        │    │
│  └─────────────┘  └─────────────┘  └─────────────────┘    │
└────────────────────────────────┬────────────────────────────┘
                                 │ HTTP/WebSocket
┌────────────────────────────────▼────────────────────────────┐
│                       后端服务层 (FastAPI)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 权限管控  │  │ 时序查询  │  │ 数据清洗  │  │ 报表生成  │    │
│  │  模块    │  │  模块    │  │  模块    │  │  模块    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└────────────────────────────────┬────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────┐
│                       数据存储层                              │
│  ┌──────────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │  ClickHouse  │  │  Redis   │  │   Grafana (可视化)  │    │
│  │  时序数据库  │  │  缓存    │  │   专业分析看板      │    │
│  └──────────────┘  └──────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 🌟 核心功能模块

### 1. 前端可视化大屏模块
- 📊 **实时工况监控** - 实时数据刷新，支持多指标叠加展示
- 📈 **趋势分析** - 自定义时间区间查询，支持缩放、平移
- 🎯 **多维度联动** - 工厂、设备、指标三级筛选联动
- 📱 **响应式设计** - 支持大屏、桌面、移动端适配

### 2. 数据清洗模块
- 🧹 **9种清洗规则** - 去重、缺失值处理、异常值检测、平滑处理等
- 📊 **数据质量报告** - 自动生成数据质量评估报告
- ⚡ **任务调度** - 支持定时和手动触发清洗任务
- 📋 **任务追踪** - 完整的清洗任务生命周期管理

### 3. 时序数据查询模块
- 🚀 **高性能查询** - 基于 ClickHouse 列式存储，亿级数据秒级响应
- 📊 **智能聚合** - 自动根据时间跨度选择最优聚合粒度
- 🔍 **多维过滤** - 支持工厂、设备、指标、时间多维度组合查询
- 📉 **降采样优化** - 自动降采样保证前端渲染性能

### 4. 报表生成模块
- 📑 **Excel 报表** - 包含时序数据和统计汇总
- 📄 **PDF 报表** - 专业格式的分析报告，含图表和统计表格
- 📥 **离线导出** - 支持下载和本地保存
- 🎨 **自定义模板** - 可配置报表内容和格式

### 5. 权限管控模块
- 🔐 **JWT 认证** - 安全的用户身份验证
- 👥 **角色权限** - 管理员/编辑者/查看者三级角色
- 🏭 **工厂级数据隔离** - 按工厂分配数据访问权限
- 📝 **用户管理** - 完整的用户增删改查功能

## 📁 项目结构

```
industrial-iot-platform/
├── backend/                    # 后端服务
│   ├── __init__.py
│   ├── main.py                # FastAPI 主入口
│   ├── config.py              # 配置管理
│   ├── api/                   # API 接口
│   │   ├── __init__.py
│   │   ├── auth.py           # 认证授权 API
│   │   ├── timeseries.py     # 时序数据 API
│   │   ├── dashboard.py      # 仪表盘 API
│   │   ├── reports.py        # 报表管理 API
│   │   └── cleaning.py       # 数据清洗 API
│   ├── services/              # 业务服务
│   │   ├── __init__.py
│   │   ├── auth.py           # 认证服务
│   │   ├── timeseries.py     # 时序数据服务
│   │   ├── cleaning.py       # 数据清洗服务
│   │   └── reports.py        # 报表生成服务
│   ├── database/              # 数据库
│   │   ├── __init__.py
│   │   ├── clickhouse.py     # ClickHouse 连接
│   │   └── schema.sql        # 数据库 schema
│   └── utils/                 # 工具类
│       ├── __init__.py
│       └── logger.py         # 日志工具
├── frontend/                  # 前端页面
│   ├── index.html            # 主页面
│   ├── css/
│   │   └── style.css         # 样式文件
│   └── js/
│       └── app.js            # 前端应用逻辑
├── grafana/                   # Grafana 配置
│   ├── dashboard.json        # 预配置仪表盘
│   └── clickhouse-datasource.yml  # 数据源配置
├── scripts/                   # 脚本工具
│   ├── init_data.py          # 示例数据生成
│   ├── start.bat             # Windows 启动脚本
│   ├── start.sh              # Linux/Mac 启动脚本
│   └── init.bat              # 数据初始化脚本
├── reports/                   # 报表输出目录
├── logs/                      # 日志目录
├── docker-compose.yml         # Docker 编排文件
├── Dockerfile                 # 后端镜像构建
├── requirements.txt           # Python 依赖
├── .env.example              # 环境变量示例
└── README.md                 # 项目文档
```

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone <repository-url>
cd industrial-iot-platform

# 2. 启动所有服务
docker-compose up -d

# 3. 访问服务
# 前端页面: http://localhost:8000/static/index.html
# API 文档: http://localhost:8000/docs
# Grafana: http://localhost:3000 (admin/admin123)
```

### 方式二：本地部署

#### 前置条件
- Python 3.11+
- ClickHouse 23.8+
- Redis 7.0+ (可选)
- Node.js 18+ (可选，仅前端开发需要)

#### 安装步骤

1. **安装 ClickHouse**
   - Windows: 下载官方安装包或使用 Docker
   - Linux/Mac: `curl https://clickhouse.com/ | sh`

2. **启动 ClickHouse**
   ```bash
   clickhouse-server start
   ```

3. **创建数据库和表**
   ```bash
   clickhouse-client --multiquery < backend/database/schema.sql
   ```

4. **安装 Python 依赖**
   ```bash
   pip install -r requirements.txt
   ```

5. **配置环境变量**
   ```bash
   copy .env.example .env
   # 编辑 .env 文件，配置 ClickHouse 连接信息
   ```

6. **生成示例数据（可选）**
   ```bash
   # Windows
   scripts\init.bat
   
   # Linux/Mac
   python scripts/init_data.py --days 7 --interval 60
   ```

7. **启动服务**
   ```bash
   # Windows
   scripts\start.bat
   
   # Linux/Mac
   bash scripts/start.sh
   ```

8. **访问系统**
   - 前端页面: http://localhost:8000/static/index.html
   - API 文档: http://localhost:8000/docs
   - 默认账号: `admin` / `admin123`

## 📊 API 接口说明

### 认证接口
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息
- `GET /api/auth/users` - 获取用户列表
- `POST /api/auth/users` - 创建用户

### 时序数据接口
- `GET /api/timeseries/factories` - 获取工厂列表
- `GET /api/timeseries/devices` - 获取设备列表
- `GET /api/timeseries/metrics` - 获取指标列表
- `POST /api/timeseries/query` - 查询时序数据
- `POST /api/timeseries/statistics` - 获取统计数据
- `POST /api/timeseries/ingest` - 写入数据
- `POST /api/timeseries/generate-sample` - 生成样本数据

### 仪表盘接口
- `GET /api/dashboard/overview` - 获取概览数据
- `GET /api/dashboard/trends` - 获取趋势数据
- `GET /api/dashboard/realtime` - 获取实时数据

### 数据清洗接口
- `POST /api/cleaning/execute` - 执行数据清洗
- `GET /api/cleaning/quality` - 获取数据质量报告
- `GET /api/cleaning/tasks` - 获取清洗任务列表
- `GET /api/cleaning/rules` - 获取清洗规则列表

### 报表接口
- `POST /api/reports/generate/excel` - 生成 Excel 报表
- `POST /api/reports/generate/pdf` - 生成 PDF 报表
- `GET /api/reports/download/{filename}` - 下载报表
- `GET /api/reports/tasks` - 获取报表任务列表

## 📈 ClickHouse 表设计

### 主时序表 `industrial_metrics`
```sql
CREATE TABLE industrial_metrics (
    timestamp DateTime64(9) CODEC(DoubleDelta, LZ4),
    device_id String CODEC(LZ4),
    device_type String CODEC(LZ4),
    factory_id String CODEC(LZ4),
    metric_name String CODEC(LZ4),
    metric_value Float64 CODEC(Gorilla, LZ4),
    unit String CODEC(LZ4),
    quality Int8 DEFAULT 1 CODEC(LZ4),
    tags Map(String, String) CODEC(LZ4)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (factory_id, device_id, metric_name, timestamp)
TTL timestamp + INTERVAL 2 YEAR
```

### 物化视图
- `metrics_1min_mv` - 1分钟聚合
- `metrics_1hour_mv` - 1小时聚合
- `metrics_1day_mv` - 1天聚合

## 🎨 前端功能预览

### 概览大屏
- 统计卡片：设备总数、监控指标、数据点数、数据质量
- 实时工况趋势图
- 指标统计分布图
- 多指标对比分析图
- 设备状态监控表

### 趋势分析
- 自定义设备、指标、聚合粒度
- 交互式时序图表（缩放、平移）
- 详细统计数据表格

### 数据清洗
- 数据质量评估报告
- 清洗规则配置
- 清洗任务追踪

### 报表管理
- Excel/PDF 报表生成
- 报表下载
- 历史报表查询

### 用户管理
- 用户列表管理
- 角色权限分配
- 工厂访问控制

## 🔧 数据清洗规则

| 规则名称 | 说明 | 参数 |
|---------|------|------|
| `remove_duplicates` | 移除重复数据 | subset: 去重字段 |
| `handle_missing` | 处理缺失值 | method: ffill/bfill/drop/interpolate |
| `remove_outliers_zscore` | Z-score 异常值检测 | threshold: 阈值 |
| `remove_outliers_iqr` | IQR 异常值检测 | - |
| `smooth_moving_average` | 移动平均平滑 | window: 窗口大小 |
| `normalize_minmax` | Min-Max 归一化 | - |
| `normalize_standard` | 标准化处理 | - |
| `interpolate_linear` | 线性插值 | - |
| `filter_quality` | 按质量过滤 | min_quality: 最小质量值 |

## 📊 Grafana 集成

项目提供预配置的 Grafana 仪表盘，支持：
- 实时时序趋势图
- 设备状态统计
- 指标对比分析
- 数据质量监控

**导入方式**:
1. 登录 Grafana (http://localhost:3000)
2. 进入 Dashboards → Import
3. 上传 `grafana/dashboard.json` 文件

## 🔐 默认账号

| 角色 | 用户名 | 密码 | 权限 |
|------|--------|------|------|
| 管理员 | admin | admin123 | 全部权限 |

## 📝 开发说明

### 添加新的 API 接口
1. 在 `backend/api/` 下创建或修改路由文件
2. 在 `backend/services/` 实现业务逻辑
3. 在 `backend/main.py` 注册路由

### 自定义前端组件
1. 修改 `frontend/index.html` 添加新视图
2. 在 `frontend/js/app.js` 实现逻辑
3. 在 `frontend/css/style.css` 添加样式

### 扩展数据清洗规则
1. 在 `backend/services/cleaning.py` 的 `DataCleaner` 类中添加新方法
2. 在 `list_cleaning_rules` 接口中注册新规则

## 🤝 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 📞 技术支持

如有问题或建议，请通过以下方式联系：
- 提交 Issue
- 发送邮件至项目维护者

---

**✨ 打造工业级时序数据分析平台，助力企业数字化转型**
