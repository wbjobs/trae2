# 多品牌打印机集中管控桌面应用

基于 Electron + C++ 后端开发的多品牌打印机集中管控系统，支持 Windows、Linux 双平台运行。

## 功能模块

### 1. 主界面管控模块
- 打印机设备列表展示
- 实时状态监控
- 打印任务管理
- 系统设置

### 2. 打印机驱动适配模块
- 多品牌打印机驱动适配
- 统一驱动接口抽象
- 驱动动态加载

### 3. 任务队列模块
- 打印任务排队管理
- 任务优先级调度
- 任务状态跟踪

### 4. 状态采集模块
- 打印机状态实时采集
- 异常状态告警
- 状态历史记录

### 5. 打印模板管理模块
- 打印模板设计
- 模板预览
- 模板版本管理

### 6. 跨平台适配模块
- Windows 平台适配
- Linux 平台适配
- 统一系统调用接口

## 技术栈

- **前端**: Electron + TypeScript + HTML/CSS
- **后端**: C++17
- **桥接层**: Node.js Native Addon (N-API)
- **构建工具**: CMake + node-gyp + TypeScript

## 项目结构

```
printer-management-system/
├── electron/              # Electron 前端
│   ├── src/
│   │   ├── main/         # 主进程
│   │   ├── renderer/     # 渲染进程
│   │   └── shared/       # 共享代码
│   └── tsconfig.json
├── cpp-backend/          # C++ 后端
│   ├── src/
│   │   ├── driver/       # 驱动适配模块
│   │   ├── task/         # 任务队列模块
│   │   ├── status/       # 状态采集模块
│   │   ├── template/     # 模板管理模块
│   │   └── platform/     # 跨平台适配模块
│   ├── include/
│   └── CMakeLists.txt
├── native-addon/         # Node.js 原生插件
│   ├── src/
│   └── binding.gyp
└── package.json
```

## 开发环境要求

- Node.js 18+
- CMake 3.15+
- C++17 兼容编译器 (MSVC 2019+, GCC 8+, Clang 10+)
- Windows 10+ 或 Linux (Ubuntu 20.04+)

## 快速开始

```bash
# 安装依赖
npm install

# 构建 C++ 后端
npm run build:cpp

# 构建原生插件
npm run build:addon

# 构建 Electron
npm run build:electron

# 启动应用
npm start
```
