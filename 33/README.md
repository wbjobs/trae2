# 气象探空廓线多要素融合分析可视化系统

## 项目概述

本系统是一个专业的气象探空数据处理与可视化平台，实现了探空数据接入、数据融合清洗、气象指标计算、多维图表渲染和专业报表导出等核心功能。

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI组件库**: Ant Design 5
- **图表库**: ECharts + echarts-for-react
- **HTTP客户端**: Axios
- **日期处理**: Day.js
- **报表导出**: SheetJS (Excel) + jsPDF (PDF)

## 项目结构

```
src/
├── api/                    # 数据接入接口层
│   ├── http.ts            # HTTP客户端封装
│   └── sounding.ts        # 探空数据API接口
├── components/            # 公共组件
│   ├── charts/            # 图表组件
│   │   ├── TemperatureProfileChart.tsx   # 温度廓线图
│   │   ├── WindProfileChart.tsx          # 风廓线图
│   │   ├── SkewTChart.tsx               # 斜温图
│   │   ├── RHProfileChart.tsx           # 湿度廓线图
│   │   ├── WindBarbChart.tsx            # 风杆图
│   │   └── VerticalCrossSection.tsx     # 垂直剖面图
│   └── layout/
│       └── MainLayout.tsx   # 主布局组件
├── mock/                   # Mock数据层
│   ├── stations.ts        # 站点模拟数据
│   ├── soundingData.ts    # 探空数据生成器
│   └── mockApi.ts         # Mock API服务
├── modules/               # 业务模块
│   ├── dataFusion/        # 数据融合清洗模块
│   │   ├── types.ts
│   │   ├── validationRules.ts
│   │   ├── dataCleaner.ts
│   │   └── dataFusion.ts
│   ├── meteorologicalIndices/  # 气象指标计算模块
│   │   ├── types.ts
│   │   └── calculator.ts
│   └── export/            # 报表导出模块
│       ├── types.ts
│       ├── excelExporter.ts
│       ├── pdfExporter.ts
│       └── csvExporter.ts
├── pages/                 # 页面组件
│   ├── Dashboard.tsx      # 数据总览
│   ├── DataQuery.tsx      # 数据查询
│   ├── DataAnalysis.tsx   # 指标分析
│   └── DataVisualization.tsx  # 可视化分析
├── services/              # 业务服务层
│   └── soundingService.ts
├── styles/                # 全局样式
│   └── global.less
├── types/                 # 类型定义
│   └── index.ts
├── App.tsx               # 应用根组件
└── main.tsx              # 入口文件
```

## 功能模块

### 1. 探空数据接入接口
- 支持与气象探空后端服务对接
- 提供探空数据查询、获取接口
- 支持分页查询和时间范围查询
- 可配置Mock数据模式便于开发

### 2. 数据融合清洗模块
- 数据质量检测与评分
- 缺失值自动填补
- 异常值检测与处理
- 数据平滑处理
- 标准等压面插值融合
- 多源数据融合能力

### 3. 气象指标计算模块
- **稳定度指标**: CAPE、CIN、抬升指数、K指数、肖沃尔特指数等
- **风场指标**: 最大风速、风切变、整体理查森数等
- **热力学指标**: 可降水量、各类CAPE计算等
- 共支持20+专业气象指标

### 4. 多维图表渲染
- 温度-露点廓线图
- 风廓线图（风速+风向）
- 斜温图 (Skew-T)
- 相对湿度廓线图
- 风杆图
- 时间-高度垂直剖面图
- 多要素对比分析图

### 5. 数据报表导出
- 支持 Excel 格式导出
- 支持 PDF 格式导出
- 支持 CSV 格式导出
- 可配置导出内容（原始数据、指标数据、图表）

## 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 配置说明

### 环境变量配置

在 `.env.development` 或 `.env.production` 中配置：

```env
# 是否使用Mock数据
VITE_USE_MOCK=true

# API基础地址
VITE_API_BASE_URL=/api
```

### 后端对接

当 `VITE_USE_MOCK=false` 时，系统将调用真实后端API，需要确保后端提供以下接口：

- `GET /api/sounding/list` - 探空数据列表（分页）
- `GET /api/sounding/:id` - 获取单条探空数据
- `GET /api/sounding/latest/:stationId` - 获取站点最新数据
- `GET /api/station/list` - 获取站点列表
- `GET /api/sounding/range` - 获取时间范围内数据

## 扩展开发

### 添加新的气象指标

1. 在 `src/modules/meteorologicalIndices/calculator.ts` 中添加计算方法
2. 在 `types.ts` 中扩展类型定义
3. 在对应页面中展示新指标

### 添加新的图表类型

1. 在 `src/components/charts/` 下创建新图表组件
2. 在 `src/components/charts/index.ts` 中导出
3. 在可视化页面中集成

## 浏览器支持

- Chrome (推荐)
- Firefox
- Safari
- Edge

## License

MIT
