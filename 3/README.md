# 点云渲染系统 - Point Cloud Rendering System

基于 Three.js 开发的分布式点云渲染系统，采用前后端分离、微服务架构设计。

## 系统架构

### 后端服务（Backend Services）

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway (3000)                   │
├─────────────────────────────────────────────────────────┤
│  /tile-service/*    →   Tile Service (3001)             │
│  /spatial-index/*   →   Spatial Index Service (3002)    │
└─────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────┐
│                    Service Registry                     │
│  • 服务注册与发现                                        │
│  • 健康检查                                              │
│  • 跨服务调用                                            │
└─────────────────────────────────────────────────────────┘
```

### 前端模块（Frontend Modules）

```
┌─────────────────────────────────────────────────────────┐
│                  Point Cloud App                        │
├──────────────────┬──────────────────┬───────────────────┤
│  Renderer        │  Coordinate      │  Layer Control    │
│  Module          │  Transform       │  Module           │
│  (Three.js)      │  Module          │                   │
├──────────────────┴──────────────────┴───────────────────┤
│                   API Service Layer                      │
│  • TileServiceClient                                    │
│  • SpatialIndexClient                                   │
│  • ServiceFactory                                       │
└─────────────────────────────────────────────────────────┘
```

## 目录结构

```
point-cloud-system/
├── backend/
│   ├── common/
│   │   ├── ServiceRegistry.js      # 服务注册中心
│   │   └── ServiceGateway.js       # API 网关
│   ├── gateway.js                  # 网关启动文件
│   └── services/
│       ├── tile-service/           # 点云分片加载服务
│       │   ├── package.json
│       │   ├── server.js
│       │   └── src/
│       │       ├── TileLoader.js   # 瓦片加载器
│       │       └── routes.js       # API 路由
│       └── spatial-index/          # 空间索引服务
│           ├── package.json
│           ├── server.js
│           └── src/
│               ├── RTreeIndex.js   # R-tree 索引
│               ├── SpatialIndexService.js
│               └── routes.js
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js                 # 应用入口
│       ├── modules/
│       │   ├── renderer/
│       │   │   └── PointCloudRenderer.js
│       │   ├── coordinate/
│       │   │   └── CoordinateTransform.js
│       │   └── layer-control/
│       │       └── LayerManager.js
│       └── services/
│           ├── APIClient.js
│           ├── TileServiceClient.js
│           ├── SpatialIndexClient.js
│           └── ServiceFactory.js
├── data/                           # 点云数据目录
├── scripts/
│   ├── start-all.js                # 启动所有服务
│   ├── start-backend.js            # 仅启动后端
│   └── generate-sample-data.js     # 生成示例数据
└── package.json                    # 根配置
```

## 功能特性

### 后端功能

1. **点云分片加载服务 (Tile Service)**
   - LOD (Level of Detail) 多分辨率支持
   - 瓦片缓存机制
   - 按空间范围批量加载
   - 图层元信息管理

2. **空间索引服务 (Spatial Index Service)**
   - R-tree 空间索引算法
   - 按范围查询
   - 按点查询
   - 按半径查询
   - 视图视锥查询
   - 图层管理

3. **跨服务交互层**
   - 服务注册与发现
   - 心跳检测
   - API 网关路由
   - 服务间通信

### 前端功能

1. **渲染引擎模块**
   - Three.js WebGL 渲染
   - 点云材质与着色
   - LOD 动态切换
   - 相机控制（旋转、平移、缩放）
   - 拾取与交互
   - 性能统计

2. **坐标转换模块**
   - 多坐标系支持 (WGS84, Web Mercator, 等)
   - 投影变换
   - 偏移、缩放、旋转
   - 经纬度与本地坐标互转
   - 距离、面积计算

3. **图层控制模块**
   - 多图层管理
   - 可见性控制
   - 透明度调节
   - 点大小调整
   - 颜色设置
   - 动态瓦片加载
   - 视口驱动加载

## 快速开始

### 1. 安装依赖

```bash
npm run install:all
```

### 2. 生成示例数据

```bash
npm run generate:data
```

### 3. 启动所有服务

```bash
npm start
```

或分别启动：

```bash
# 仅启动后端服务
npm run start:backend

# 仅启动前端
npm run start:frontend
```

### 4. 访问应用

打开浏览器访问: http://localhost:8080

## API 接口

### 瓦片服务 (Tile Service) - 端口 3001

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/tile/:layerId/:lod/:x/:y/:z` | 获取单个瓦片 |
| POST | `/api/tiles/bounds` | 按范围获取瓦片 |
| GET | `/api/layer/:layerId` | 获取图层信息 |
| GET | `/api/layers` | 获取所有图层 |
| GET | `/api/cache/clear` | 清除缓存 |
| GET | `/api/cache/stats` | 缓存统计 |

### 空间索引服务 (Spatial Index Service) - 端口 3002

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/index/tile/:layerId` | 索引单个瓦片 |
| POST | `/api/index/tiles/:layerId` | 批量索引瓦片 |
| POST | `/api/query/bounds/:layerId` | 按范围查询 |
| POST | `/api/query/point/:layerId` | 按点查询 |
| POST | `/api/query/radius/:layerId` | 按半径查询 |
| POST | `/api/query/view/:layerId` | 视锥查询 |
| POST | `/api/query/multi` | 多图层查询 |
| GET | `/api/layers` | 获取所有图层 |
| PUT | `/api/layers/:layerId` | 更新图层 |
| POST | `/api/layers` | 添加图层 |
| DELETE | `/api/layers/:layerId` | 删除图层 |

### API 网关 - 端口 3000

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 网关信息 |
| GET | `/health` | 所有服务健康状态 |
| GET | `/services` | 服务列表 |
| GET | `/tile-service/*` | 代理到瓦片服务 |
| GET | `/spatial-index/*` | 代理到空间索引服务 |

## 技术栈

### 后端
- Node.js + Express
- rbush (R-tree 空间索引)
- CORS 跨域支持

### 前端
- Three.js (WebGL 渲染)
- Vite (构建工具)
- ES Modules

## 操作说明

### 鼠标操作
- **左键拖拽**: 旋转视角
- **右键拖拽**: 平移视图
- **滚轮**: 缩放
- **点击**: 选择点并在控制台输出坐标

### 控制面板
- **重置视图**: 恢复初始相机位置
- **重新加载**: 重新加载所有图层数据
- **点大小**: 调整全局点渲染大小
- **背景色**: 切换背景颜色

### 图层控制
- **复选框**: 显示/隐藏图层
- **滑块**: 调整图层透明度

## 性能优化

1. **LOD 多分辨率**: 根据相机距离自动切换细节级别
2. **视锥剔除**: 只加载视口范围内的瓦片
3. **瓦片缓存**: LRU 缓存策略，避免重复加载
4. **异步加载**: 并发加载，不阻塞渲染线程
5. **内存管理**: 自动卸载超出范围的瓦片

## 扩展开发

### 添加新图层

```javascript
// 前端
await layerManager.addLayer({
  id: 'my-layer',
  name: '我的图层',
  color: [255, 0, 0],
  pointSize: 2
});
```

### 自定义坐标转换

```javascript
import CoordinateTransform from './modules/coordinate/CoordinateTransform.js';

const transform = new CoordinateTransform({
  sourceCRS: 'EPSG:4326',
  targetCRS: 'EPSG:3857',
  offset: { x: 100, y: 200, z: 0 }
});

const point = transform.transformPoint({ x: 116.4, y: 39.9, z: 50 });
```

### 自定义空间查询

```javascript
// 按半径查询
const results = await serviceFactory.queryByRadius(
  'buildings',
  centerX, centerY, centerZ,
  100 // 半径
);
```

## 许可证

MIT License
