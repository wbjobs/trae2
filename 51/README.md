# 精密仪器光路调试离线仿真系统

Optical Path Alignment Simulation System

## 项目简介

本项目是一个跨平台的桌面应用程序，用于精密仪器光路的离线仿真与调试。系统集成了几何光学光线追踪、物理光学干涉衍射计算、以及自动化报告生成功能。

## 功能特性

### 🔧 光路参数解析模块
- 支持 JSON/YAML/XML/CSV 多种格式参数导入
- 内置迈克尔逊、马赫-曾德尔等经典光路模板
- 可视化元件参数编辑
- 支持元件配置导出

### ⚡ 光学路径仿真模块
- 几何光学光线追踪算法
- 支持透镜、反射镜、分光镜等10种光学元件
- 实时光路可视化
- 光线传播路径记录

### 📊 干涉效果计算模块
- 迈克尔逊干涉条纹仿真
- 杨氏双缝干涉计算
- 单缝/圆孔衍射图案
- 光栅衍射效应
- 全息图计算
- 条纹对比度、可见度分析

### 📄 调试报告生成模块
- 自动生成 PDF 格式调试报告
- 包含系统概述、仿真结果、数据分析
- 智能调试建议
- 支持自定义报告模板

## 技术架构

```
optical-simulation-app/
├── electron/              # Electron 主进程
├── src/                   # React 前端 UI
│   ├── components/        # UI 组件
│   ├── pages/             # 页面组件
│   ├── services/          # API 服务
│   └── types/             # TypeScript 类型
├── backend/               # Python 后端服务
│   ├── main.py           # FastAPI 主入口
│   └── modules/          # 核心计算模块
│       ├── parameter_parser.py    # 参数解析
│       ├── ray_simulation.py     # 光线仿真
│       ├── interference.py       # 干涉计算
│       └── report_generator.py   # 报告生成
└── examples/             # 示例配置文件
```

### 技术栈
- **前端**: React 18 + TypeScript + Vite
- **桌面框架**: Electron 28
- **后端**: Python + FastAPI
- **数值计算**: NumPy + SciPy
- **数据可视化**: ECharts
- **报告生成**: ReportLab

## 安装与运行

### 环境要求
- Node.js >= 18.0
- Python >= 3.9
- pip (Python 包管理器)

### 安装依赖

```bash
# 安装前端依赖
npm install

# 安装 Python 后端依赖
npm run install:backend
```

### 开发模式

```bash
# 1. 启动后端服务（单独终端）
npm run start:backend

# 2. 启动前端开发服务器（新终端）
npm run dev:vite

# 3. 启动 Electron（新终端）
npm run dev:electron
```

或者使用一键启动：

```bash
# 需要先手动启动后端服务
npm run dev
```

### 生产构建

```bash
# 构建 Windows 版本
npm run build:win

# 构建 macOS 版本
npm run build:mac

# 构建所有平台
npm run build
```

## 使用指南

### 1. 元件管理
- 点击「元件管理」页面
- 添加光学元件（透镜、反射镜、分光镜等）
- 调整元件位置和参数
- 或直接加载预设模板

### 2. 仿真计算
- 选择仿真类型（光线追踪/干涉/衍射等）
- 设置计算分辨率
- 点击「开始仿真」
- 查看实时预览

### 3. 结果分析
- 查看概览统计数据
- 分析光强分布曲线
- 观察 2D 热力图
- 查看详细分析报告

### 4. 报告生成
- 配置报告选项
- 点击「生成 PDF 报告」
- 自动下载完整调试报告

## 支持的光学元件

| 元件类型 | 说明 | 主要参数 |
|---------|------|---------|
| 透镜 | 折射透镜 | 焦距、直径、折射率 |
| 反射镜 | 平面/曲面反射镜 | 反射率、曲率半径 |
| 分光镜 | 光束分束器 | 分束比、反射率 |
| 光阑 | 孔径光阑 | 半径、形状 |
| 光栅 | 衍射光栅 | 刻线密度、衍射级次 |
| 棱镜 | 色散棱镜 | 顶角、折射率 |
| 滤光片 | 光谱滤光片 | 中心波长、带宽 |
| 波片 | 相位延迟片 | 类型、延迟量 |
| 探测器 | 光电探测器 | 分辨率、灵敏度 |

## API 接口

后端服务运行在 `http://localhost:8000`

### 主要接口
- `GET /api/health` - 健康检查
- `GET /api/elements/types` - 获取支持的元件类型
- `GET /api/templates/{name}` - 获取光路模板
- `POST /api/parse/upload` - 上传并解析参数文件
- `POST /api/simulate/ray` - 光线追踪仿真
- `POST /api/simulate/interference` - 干涉/衍射计算
- `POST /api/report/generate` - 生成 PDF 报告

## 目录说明

```
optical-simulation-app/
├── electron/              # Electron 主进程代码
│   ├── main.js           # 主进程入口
│   └── preload.js        # 预加载脚本
├── src/                   # React 前端代码
│   ├── components/        # 可复用组件
│   │   ├── Sidebar.tsx
│   │   └── SimulationCanvas.tsx
│   ├── pages/             # 页面组件
│   │   ├── Dashboard.tsx
│   │   ├── ElementsPage.tsx
│   │   ├── SimulationPage.tsx
│   │   ├── ResultsPage.tsx
│   │   └── ReportPage.tsx
│   ├── services/          # API 服务
│   └── types/             # TypeScript 类型定义
├── backend/               # Python 后端
│   ├── main.py           # FastAPI 应用
│   ├── requirements.txt  # Python 依赖
│   └── modules/          # 核心计算模块
├── examples/             # 示例配置文件
└── build/                # 构建资源
```

## 许可证

MIT License

## 联系方式

如有问题或建议，请提交 Issue。
