# 设备运维指标分析可视化平台

基于 React + Pandas + Doris + ECharts 开发的设备运维指标分析可视化平台。

## 功能模块

### 1. 前端可视化大屏模块
- 实时监控大屏展示
- 多维度联动图表
- 设备状态实时监控
- 异常告警展示

### 2. 原始数据清洗模块
- 数据去重处理
- 缺失值填充（插值、均值、中位数等）
- 异常值检测（IQR、Z-Score、孤立森林）
- 数据平滑处理
- 数据质量报告

### 3. 指标聚合计算模块
- 多时间粒度聚合（分钟、小时、天、周、月）
- 统计指标计算（均值、最大值、最小值、标准差等）
- 异常标记与评分
- 趋势分析

### 4. 自定义报表模块
- 设备汇总报表
- 指标趋势报表
- 异常分析报表
- 自定义报表配置
- Excel/PDF导出

### 5. 数据权限模块
- 基于角色的访问控制（RBAC）
- 多用户角色（管理员、操作员、查看者、访客）
- 设备级数据权限控制
- JWT认证

## 技术栈

### 后端
- FastAPI (API服务)
- Pandas (数据处理)
- Apache Doris (数据存储)
- SQLAlchemy (ORM)
- ReportLab (PDF导出)

### 前端
- React 18
- TypeScript
- Vite
- Ant Design
- ECharts
- Zustand (状态管理)
- Axios

## 快速开始

### 后端启动

```bash
cd backend
pip install -r requirements.txt
python main.py
```

API文档: http://localhost:8000/docs

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

访问: http://localhost:3000

## 默认测试账号

| 用户名 | 密码 | 角色 | 权限 |
|--------|------|------|------|
| admin | admin123 | 管理员 | 全部权限 |
| operator | operator123 | 操作员 | 数据操作、报表导出 |
| viewer | viewer123 | 查看者 | 仅查看权限 |

## API接口

### 认证接口
- `POST /api/auth/token` - 登录获取token
- `GET /api/auth/me` - 获取当前用户信息
- `GET /api/auth/roles` - 获取角色权限列表

### 数据接口
- `GET /api/data/devices` - 获取设备列表
- `GET /api/data/metrics` - 获取指标列表
- `POST /api/data/clean` - 数据清洗
- `POST /api/data/aggregate` - 数据聚合
- `GET /api/data/sample` - 获取模拟数据
- `GET /api/data/quality-report` - 数据质量报告

### 仪表盘接口
- `GET /api/dashboard/overview` - 获取概览数据
- `GET /api/dashboard/device-status` - 获取设备状态
- `GET /api/dashboard/metric-trend` - 获取指标趋势
- `GET /api/dashboard/anomaly-alerts` - 获取异常告警
- `GET /api/dashboard/realtime` - 获取实时数据
- `GET /api/dashboard/comparison` - 设备对比数据

### 报表接口
- `GET /api/reports/templates` - 获取报表模板
- `POST /api/reports/generate` - 生成报表
- `POST /api/reports/export/excel` - 导出Excel
- `POST /api/reports/export/pdf` - 导出PDF
- `GET /api/reports/list` - 报表列表
- `POST /api/reports/save` - 保存报表
- `DELETE /api/reports/:id` - 删除报表

## 项目结构

```
.
├── backend/
│   ├── api/              # API路由
│   │   ├── auth.py      # 认证接口
│   │   ├── data.py      # 数据接口
│   │   ├── dashboard.py # 仪表盘接口
│   │   └── reports.py   # 报表接口
│   ├── auth/             # 权限模块
│   │   └── permission.py
│   ├── data_cleaning/    # 数据清洗模块
│   │   └── cleaner.py
│   ├── aggregation/      # 指标聚合模块
│   │   └── aggregator.py
│   ├── reports/          # 报表模块
│   │   └── report_generator.py
│   ├── utils/            # 工具类
│   │   ├── database.py   # 数据库连接
│   │   └── mock_data.py  # 模拟数据
│   ├── main.py           # 入口文件
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # 组件
│   │   ├── pages/        # 页面
│   │   ├── services/     # API服务
│   │   ├── store/        # 状态管理
│   │   ├── styles/       # 样式
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Doris数据库表结构

- `devices` - 设备信息表
- `raw_metrics` - 原始指标数据表（动态分区）
- `cleaned_metrics` - 清洗后指标数据表
- `aggregated_metrics` - 聚合指标数据表
- `users` - 用户表
- `reports` - 报表配置表
