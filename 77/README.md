# 高速公路桥梁附属设施三维巡检与病害标注3D平台

## 项目概述

基于 WebGL/Three.js 的高速公路桥梁附属设施三维巡检与病害标注平台，实现桥梁护栏、支座等附属设施三维加载、应力可视化、自由视角交互、病害点位标注分层展示，支持前后端联调。

## 技术栈

- **前端框架**: Three.js (WebGL)
- **构建工具**: Vite
- **HTTP客户端**: Axios
- **后端服务**: Node.js + Express
- **UI**: 原生 HTML/CSS/JavaScript

## 项目结构

```
e:\trae2\77/
├── src/
│   ├── main.js                 # 主应用入口，整合所有模块
│   ├── modelLoader.js          # 3D模型加载模块（桥梁、护栏、支座）
│   ├── stressCalculator.js     # 应力计算与可视化模块
│   ├── viewController.js       # 视角交互控制模块
│   ├── inspectionAPI.js        # 巡检数据接口模块
│   ├── diseaseLayerManager.js  # 病害图层管理模块
│   └── style.css               # 样式文件
├── index.html                  # HTML入口
├── server.js                   # 后端Mock服务
├── vite.config.js              # Vite配置
├── package.json                # 项目依赖配置
└── dist/                       # 构建输出目录
```

## 功能模块

### 1. 3D模型加载模块 ([modelLoader.js](file:///e:/trae2/77/src/modelLoader.js))
- 支持外部 GLB/GLTF 模型加载
- 程序化生成桥梁主体、护栏、支座模型
- 支座带唯一标识，支持数据关联

### 2. 应力计算模块 ([stressCalculator.js](file:///e:/trae2/77/src/stressCalculator.js))
- 支座应力计算（基于位置、荷载动态计算）
- 护栏应力计算（冲击力、风荷载）
- 桥面板分段应力计算（车辆荷载影响）
- 彩色热力图可视化（绿-黄-橙-红-紫）
- 实时数值标签显示
- 应力报告生成

### 3. 视角交互控制模块 ([viewController.js](file:///e:/trae2/77/src/viewController.js))
- **轨道模式**: 鼠标拖拽旋转、滚轮缩放
- **第一人称模式**: WASD移动、鼠标转向
- **俯视模式**: 2D平面图视角
- 对象选择与高亮
- 自动巡航（预设航点）
- 测量工具（两点距离测量）
- 视角飞行过渡动画

### 4. 巡检数据接口模块 ([inspectionAPI.js](file:///e:/trae2/77/src/inspectionAPI.js))
- 完整的 RESTful API 封装
- 支持 Mock 模式与真实后端切换
- 数据类型：
  - 桥梁信息管理
  - 支座/护栏等附属设施数据
  - 病害记录 CRUD
  - 巡检记录管理
  - 应力历史/实时数据
  - 报告导出与图片上传

### 5. 病害图层管理模块 ([diseaseLayerManager.js](file:///e:/trae2/77/src/diseaseLayerManager.js))
- 病害点位3D标注（带图标与标签）
- 按类型分层：裂缝、变形、剥落、锈蚀、缺失
- 按严重程度筛选：轻微、中等、严重
- 按处理状态筛选：待处理、维修中、已修复
- 热力图模式展示
- 病害统计与导出（JSON/CSV）
- 点击查看详情，支持标记已修复

## 操作说明

### 快捷键
- `1` - 切换到轨道模式
- `2` - 切换到第一人称模式
- `3` - 切换到俯视模式
- `R` - 重置视图
- `WASD` - 第一人称模式下移动
- `Space` - 第一人称模式上升
- `Shift` - 第一人称模式下降

### 工具栏
- 👆 选择工具 - 点击选择对象
- 📏 测量工具 - 两点距离测量
- 📝 标注工具 - 添加病害标注
- 🔄 轨道视图
- 👁 第一人称视图
- ⬇ 俯视视图
- 📊 应力可视化开关
- 🚗 自动巡航开关
- 📷 截图保存
- ↺ 重置视图

## 安装与运行

### 1. 安装依赖
```bash
npm install
```

### 2. 开发模式运行前端
```bash
npm run dev
```
访问 http://localhost:3000

### 3. 构建生产版本
```bash
npm run build
```

### 4. 启动后端服务
```bash
npm run server
```
后端服务运行在 http://localhost:8080

### 5. 前后端联调
1. 先启动后端服务: `npm run server`
2. 再启动前端开发: `npm run dev`
3. 前端通过 `/api` 代理访问后端接口

## API接口说明

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/bridges` | 获取桥梁列表 |
| GET | `/api/bridges/:id` | 获取桥梁详情 |
| GET | `/api/bearings` | 获取支座列表 |
| GET | `/api/bearings/:id` | 获取支座详情 |
| GET | `/api/guardrails` | 获取护栏列表 |
| GET | `/api/diseases` | 获取病害列表（支持筛选） |
| POST | `/api/diseases` | 新增病害记录 |
| PUT | `/api/diseases/:id` | 更新病害记录 |
| DELETE | `/api/diseases/:id` | 删除病害记录 |
| GET | `/api/inspections` | 获取巡检记录 |
| POST | `/api/inspections` | 创建巡检记录 |
| GET | `/api/stress/history` | 获取应力历史数据 |
| GET | `/api/stress/realtime` | 获取实时应力数据 |

## 数据格式说明

### 病害数据结构
```javascript
{
  id: "disease_001",
  bridgeId: "bridge_001",
  componentType: "bearing",      // bearing/guardrail/deck
  componentId: "bearing_-2_-1",
  type: "crack",                  // crack/deformation/spalling/corrosion/missing
  severity: "moderate",           // minor/moderate/severe
  description: "病害描述",
  position: { x: -1.5, y: 5.4, z: -30 },
  discoveryDate: "2026-05-10",
  inspector: "巡检员姓名",
  status: "pending",              // pending/repairing/repaired
  repairSuggestion: "维修建议",
  length: 15,                      // 可选：长度cm
  width: 2,                        // 可选：宽度cm
  depth: 0.5,                      // 可选：深度cm
  area: 0.5                        // 可选：面积m²
}
```

## 前后端联调配置

### 切换到真实后端
在 `src/main.js` 中修改：
```javascript
// 关闭Mock模式
this.inspectionAPI.setMockMode(false);
```

### 配置API地址
修改 `vite.config.js` 中的代理目标：
```javascript
proxy: {
  '/api': {
    target: 'http://your-backend-server:port',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '')
  }
}
```

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

需支持 WebGL 2.0

## 性能优化建议

1. 模型使用 GLTF/GLB 格式压缩
2. 大场景使用 LOD (Level of Detail)
3. 开启阴影贴图优化
4. 病害点数量多时考虑实例化渲染

## License

MIT
