# 3D GIS 空间地理矢量测绘可视化系统

基于 Three.js + WebGIS + SpringBoot + PostGIS 开发的空间地理矢量 3D 交互测绘可视化系统。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (Vue 3 + Three.js)             │
├─────────────────┬─────────────────┬─────────────────────┤
│  3D场景渲染模块 │ 矢量数据解析模块 │  GIS坐标转换模块    │
│  测绘标注模块   │                 │                     │
└─────────────────┴─────────────────┴─────────────────────┘
                              ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────┐
│              后端 (SpringBoot 3.2 + Hibernate Spatial)  │
├─────────────────┬─────────────────┬─────────────────────┤
│  矢量数据服务   │ 坐标换算服务    │  标注管理服务       │
└─────────────────┴─────────────────┴─────────────────────┘
                              ↓ JDBC
┌─────────────────────────────────────────────────────────┐
│              空间数据库 (PostgreSQL + PostGIS)          │
└─────────────────────────────────────────────────────────┘
```

## 功能模块

### 1. 3D 场景渲染模块
- ✅ Three.js 地形渲染（DEM 数字高程模型）
- ✅ 地形晕渲和颜色分级
- ✅ OrbitControls 自由交互（旋转、缩放、平移）
- ✅ 多视角切换（俯视图、正视图、透视图）
- ✅ 指南针和坐标轴
- ✅ 网格辅助线
- ✅ 阴影效果

### 2. 矢量数据解析模块
- ✅ GeoJSON 格式解析
- ✅ 点、线、面、多点、多线、多面渲染
- ✅ 图层样式配置
- ✅ 要素标签显示
- ✅ 数据导入功能

### 3. GIS 坐标转换模块
- ✅ WGS84 (EPSG:4326) ↔ Web Mercator (EPSG:3857)
- ✅ WGS84 ↔ CGCS2000 (EPSG:4490)
- ✅ 高斯-克吕格投影转换
- ✅ 经纬度转平面局部坐标
- ✅ 大圆距离计算（Haversine 公式）
- ✅ 椭球面积计算

### 4. 后端数据服务模块
- ✅ 矢量数据 CRUD 接口
- ✅ GeoJSON 格式输出
- ✅ 空间查询（BBOX、缓冲区查询）
- ✅ 坐标转换接口
- ✅ 距离和面积计算接口
- ✅ 数据导入接口
- ✅ Hibernate Spatial + PostGIS 集成

### 5. 测绘标注模块
- ✅ 点位标注（支持多种类型）
- ✅ 距离测量（两点点击完成）
- ✅ 面积测量（多点点击完成）
- ✅ 实时动态虚线预览
- ✅ 测量结果标签显示
- ✅ 标注持久化存储

## 技术栈

### 前端
- **框架**: Vue 3.4 + Vite 5
- **3D 引擎**: Three.js 0.160
- **GIS 库**: Turf.js 6.5, Proj4 2.9
- **UI 组件**: Element Plus 2.4
- **HTTP 客户端**: Axios 1.6

### 后端
- **框架**: Spring Boot 3.2
- **ORM**: Hibernate Spatial 6.4
- **GIS 库**: GeoTools 30.0, JTS 1.19
- **数据库驱动**: PostgreSQL JDBC
- **JSON 处理**: FastJSON2

### 数据库
- PostgreSQL 15+
- PostGIS 3.3+

## 项目结构

```
gis3d-mapping/
├── backend/                          # SpringBoot 后端
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/gis3d/
│       │   ├── Gis3dMappingApplication.java    # 启动类
│       │   ├── config/                         # 配置类
│       │   │   └── CorsConfig.java
│       │   ├── controller/                     # 控制层
│       │   │   ├── VectorDataController.java   # 矢量数据接口
│       │   │   ├── CoordinateController.java   # 坐标转换接口
│       │   │   └── AnnotationController.java   # 标注接口
│       │   ├── service/                        # 业务层
│       │   │   ├── VectorDataService.java
│       │   │   ├── CoordinateTransformService.java
│       │   │   └── AnnotationService.java
│       │   ├── repository/                     # 数据访问层
│       │   │   ├── VectorDataRepository.java
│       │   │   └── AnnotationRepository.java
│       │   ├── entity/                         # 实体类
│       │   │   ├── VectorData.java
│       │   │   ├── Annotation.java
│       │   │   └── MapConverter.java
│       │   └── dto/                            # 数据传输对象
│       │       ├── CoordinateDTO.java
│       │       └── Result.java
│       └── resources/
│           └── application.yml                  # 应用配置
├── frontend/                         # Vue 前端
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js                               # 入口文件
│       ├── App.vue                               # 主组件
│       ├── api/
│       │   └── index.js                          # API 接口
│       ├── core/
│       │   ├── Gis3dScene.js                    # 3D 场景管理
│       │   ├── VectorRenderer.js                # 矢量渲染器
│       │   └── SurveyMeasurement.js             # 测绘测量
│       └── utils/
│           ├── coordinateTransform.js           # 坐标转换
│           └── vectorParser.js                  # 矢量解析
├── database/                         # 数据库脚本
│   └── init.sql                              # 初始化脚本
└── README.md
```

## 快速开始

### 环境要求
- Node.js >= 18.0
- JDK >= 17
- Maven >= 3.8
- PostgreSQL >= 15
- PostGIS >= 3.3

### 1. 数据库配置

```sql
-- 创建数据库
CREATE DATABASE gis3d_db;

-- 连接数据库
\c gis3d_db;

-- 执行初始化脚本
\i database/init.sql
```

### 2. 后端启动

```bash
cd backend

# 编译项目
mvn clean install

# 运行项目
mvn spring-boot:run
```

后端服务地址: http://localhost:8080/api

### 3. 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 开发模式运行
npm run dev
```

前端服务地址: http://localhost:3000

### 4. 验证部署

1. 打开浏览器访问 http://localhost:3000
2. 系统会自动加载示例数据（北京地区地标、道路、行政区）
3. 尝试使用测距、测面、标注等功能
4. 点击"从数据库加载"按钮验证后端连接

## API 接口文档

### 矢量数据接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vector` | 获取所有矢量数据 |
| GET | `/api/vector/{id}` | 获取单个矢量数据 |
| POST | `/api/vector` | 保存矢量数据 |
| DELETE | `/api/vector/{id}` | 删除矢量数据 |
| GET | `/api/vector/layer/{layerName}` | 按图层获取 |
| GET | `/api/vector/layers` | 获取所有图层名 |
| GET | `/api/vector/bbox` | 空间范围查询 |
| GET | `/api/vector/within` | 缓冲区查询 |
| GET | `/api/vector/geojson` | 获取全部 GeoJSON |
| POST | `/api/vector/import/geojson` | 导入 GeoJSON |

### 坐标转换接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/coordinate/transform` | 通用坐标转换 |
| POST | `/api/coordinate/wgs84-to-mercator` | WGS84 转墨卡托 |
| POST | `/api/coordinate/mercator-to-wgs84` | 墨卡托转 WGS84 |
| POST | `/api/coordinate/distance` | 计算距离 |
| POST | `/api/coordinate/area` | 计算面积 |

### 标注接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/annotation` | 获取所有标注 |
| POST | `/api/annotation` | 保存标注 |
| DELETE | `/api/annotation/{id}` | 删除标注 |
| POST | `/api/annotation/point` | 创建点标注 |

## 使用说明

### 图层控制
- ✅ 勾选/取消勾选图层名称控制显示
- ✅ 支持单独控制地形、网格、坐标轴显示
- ✅ 可导入本地 GeoJSON 文件
- ✅ 可从 PostGIS 数据库加载数据

### 距离测量
1. 点击"开始测距"按钮
2. 在地图上点击第一个点
3. 在地图上点击第二个点
4. 系统自动计算并显示两点间的大地距离

### 面积测量
1. 点击"开始测面"按钮
2. 在地图上依次点击至少3个顶点
3. 点击"完成测量"按钮
4. 系统自动计算并显示多边形面积

### 点位标注
1. 点击"添加标注"按钮
2. 在地图上点击要标注的位置
3. 输入标注名称
4. 标注自动保存到数据库

### 坐标转换
1. 选择源坐标系和目标坐标系
2. 输入 X/经度 和 Y/纬度
3. 点击"转换"按钮查看结果

### 空间查询
1. 输入查询半径（米）
2. 点击"点击地图查询"按钮
3. 在地图上点击查询中心点
4. 查看查询结果列表，点击可飞行定位

## 核心算法

### 大圆距离计算 (Haversine)
```javascript
a = sin²(Δφ/2) + cos φ1 ⋅ cos φ2 ⋅ sin²(Δλ/2)
c = 2 ⋅ atan2(√a, √(1−a))
d = R ⋅ c
```
其中 R = 6378137m（地球长半径）

### 多边形面积计算 (测地线)
基于梯形法则计算椭球面上的多边形面积，考虑地球曲率。

### 坐标转换
- 使用 Proj4 库支持多种坐标系
- 支持 EPSG:4326, EPSG:3857, EPSG:4490, EPSG:4549 等

## 扩展开发

### 添加新的图层样式
修改 `frontend/src/core/VectorRenderer.js` 中的 `getDefaultStyles()` 方法。

### 添加新的坐标系
在 `frontend/src/utils/coordinateTransform.js` 中添加投影定义：
```javascript
proj4.defs('EPSG:XXXX', '+proj=... +no_defs')
```

### 自定义空间查询
在 `backend/src/main/java/com/gis3d/repository/VectorDataRepository.java` 中添加新的查询方法。

## 常见问题

### 1. 前端连接后端失败
- 检查后端是否正常启动
- 检查 `frontend/vite.config.js` 中的代理配置
- 确认端口没有被占用

### 2. 数据库连接失败
- 检查 PostgreSQL 和 PostGIS 是否正确安装
- 检查 `backend/src/main/resources/application.yml` 中的数据库配置
- 确认数据库用户权限

### 3. 3D 场景显示异常
- 检查浏览器是否支持 WebGL2
- 清除浏览器缓存
- 更新显卡驱动

### 4. 坐标转换结果不准确
- 确认坐标系定义正确
- 检查坐标顺序（经度在前，纬度在后）
- 考虑使用七参数转换提高精度

## 性能优化建议

1. **数据简化**: 大数据量使用 `ST_Simplify` 简化几何
2. **空间索引**: 确保几何字段上有 GIST 索引
3. **分页查询**: 大量数据使用分页加载
4. **LOD 技术**: 地形数据使用多层次细节
5. **WebWorker**: 坐标转换等计算放入 WebWorker

## License

MIT License

## 联系方式

项目地址: `e:\标注项目\trae2\89`
