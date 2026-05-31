# 光伏电站运维分析可视化平台

基于 Vue + PySpark + Hive + ECharts 搭建的光伏电站运维分析可视化平台

## 项目架构

```
pv-ops-dashboard/
├── frontend/                    # 前端 Vue 项目
│   ├── src/
│   │   ├── components/      # 通用组件
│   │   ├── views/           # 页面视图
│   │   ├── api/             # API 接口
│   │   ├── store/           # 状态管理
│   │   ├── utils/           # 工具函数
│   │   ├── styles/          # 样式文件
│   │   └── router/          # 路由配置
│   └── package.json
├── backend/                 # 后端 PySpark 项目
│   ├── spark/              # Spark 计算模块
│   │   ├── data_cleaning.py      # 数据清洗模块
│   │   ├── power_aggregation.py # 发电量聚合模块
│   │   ├── fault_analysis.py    # 故障统计模块
│   │   └── report_generator.py # 报表生成模块
│   ├── hive/               # Hive 表结构
│   │   └── create_tables.sql    # 建表SQL
│   ├── api/                # API 服务
│   │   └── app.py             # Flask API
│   ├── config/             # 配置文件
│   │   └── config.py
│   └── requirements.txt
└── docs/                   # 文档
```

## 功能模块

### 1. 前端大屏模块 (Dashboard)
- 发电量趋势图（支持日/周/月切换）
- 故障类型分布饼图
- 设备状态仪表盘
- 损耗分析柱状图
- 逆变器运行数据表
- 故障点位热力分布图
- 实时时钟显示
- 统计卡片（累计发电量、今日发电量、发电效率、损耗率、设备在线率、故障数量）

### 2. 光伏数据清洗模块
- 去重处理
- 缺失值填充
- 异常值过滤
- 格式标准化
- 数据质量验证
- 清洗任务监控

### 3. 发电量聚合模块
- 按小时聚合
- 按日聚合
- 按月聚合
- 系统效率计算
- 损耗分析计算
- 目标完成率对比

### 4. 故障统计模块
- 故障类型分类
- 故障趋势分析
- 故障设备排名
- 故障热力图
- MTBF 计算

### 5. 报表生成模块
- 日报表
- 周报表
- 月报表
- 自定义报表
- 多格式导出（Excel/CSV/JSON）

## 技术栈

### 前端
- **Vue 3** - 渐进式 JavaScript 框架
- **ECharts 5** - 数据可视化图表库
- **Element Plus** - UI 组件库
- **Pinia** - 状态管理
- **Vite** - 构建工具
- **Axios** - HTTP 客户端
- **Day.js** - 日期处理
- **XLSX** - Excel 导出

### 后端
- **PySpark** - 分布式计算
- **Hive** - 数据仓库
- **Flask** - Web 框架
- **Pandas** - 数据处理
- **OpenPyXL** - Excel 生成

## 快速开始

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000

### 后端启动

```bash
cd backend
pip install -r requirements.txt
python api/app.py
```

API 服务运行在 http://localhost:5000

## API 接口

| 接口 | 方法 | 说明
---|---|---
`/api/stats` | GET | 获取统计数据
`/api/power-trend` | GET | 发电量趋势
`/api/fault-distribution` | GET | 故障分布
`/api/device-status` | GET | 设备状态
`/api/loss-analysis` | GET | 损耗分析
`/api/inverter-data` | GET | 逆变器数据
`/api/data-cleaning` | POST | 执行数据清洗
`/api/export-report` | GET | 导出报表
`/api/health` | GET | 健康检查

## Hive 数据表

### ODS 层（原始数据）
- `pv_panel_raw - 光伏板原始数据
- `pv_inverter_raw - 逆变器原始数据
- `pv_fault_raw - 故障原始数据
- `pv_weather_raw - 气象站原始数据

### DWD 层（清洗后数据）
- `pv_panel_cleaned - 光伏板清洗后数据
- `pv_inverter_cleaned - 逆变器清洗后数据

### DWS 层（聚合数据）
- `pv_power_hourly - 小时发电量聚合
- `pv_power_daily - 日发电量聚合
- `pv_power_monthly - 月发电量聚合
- `pv_fault_daily - 日故障统计
- `pv_efficiency_daily - 日效率统计

### ADS 层（应用层
- `pv_station_daily_report - 电站日报表
- `pv_fault_type_stats - 故障类型统计

## 配置说明

### 前端配置
修改 `frontend/vite.config.js` 中的代理配置

### 后端配置
修改 `backend/config/config.py` 中的配置项

## 数据流转

1. 原始数据采集 → Hive ODS层
2. PySpark 数据清洗 → Hive DWD层
3. PySpark 聚合计算 → Hive DWS层
4. Flask API 提供数据服务
5. Vue 前端可视化展示

## 开发说明

### Mock 数据模式

后端默认开启 Mock 数据模式，可直接运行前端查看效果。
如需连接真实 Spark/Hive 环境：
1. 配置好 Spark 和 Hive 环境
2. 修改 `backend/api/app.py` 中 `MOCK_DATA = False`

## License

MIT
