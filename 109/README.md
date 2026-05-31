# 矿山地形3D重构标注系统

基于 Babylon.js + SpringBoot + PostGIS 开发的矿山地形3D重构标注系统。

## 功能模块

*   **3D地形重构模块** - 基于点云数据重建矿山地形表面
*   **点云数据解析模块** - 加载、解析和可视化点云数据
*   **地理坐标转换模块** - WGS84与场景坐标相互转换
*   **后端数据服务模块** - SpringBoot REST API 数据服务
*   **开采范围标注模块** - 多边形标注、面积测算

## 技术栈

### 前端
*   Babylon.js - 3D渲染引擎
*   原生JavaScript (ES6+)

### 后端
*   Spring Boot 2.7.x
*   Spring Data JPA
*   Hibernate Spatial
*   PostGIS 空间数据库

### 数据库
*   PostgreSQL + PostGIS

## 快速开始

### 1. 数据库初始化

```bash
# 创建数据库
createdb mine_terrain

# 执行初始化脚本
psql -d mine_terrain -f database/init.sql
```

### 2. 启动后端服务

```bash
cd backend
mvn spring-boot:run
```

后端服务将在 http://localhost:8080 启动

### 3. 启动前端

```bash
cd frontend
python -m http.server 8081
```

或使用其他HTTP服务器，访问 http://localhost:8081

## API接口

### 点云数据

*   `GET /api/pointcloud/{mineId}` - 获取点云数据
*   `GET /api/pointcloud/{mineId}/count` - 获取点云数量
*   `POST /api/pointcloud/{mineId}` - 添加单个点云数据
*   `POST /api/pointcloud/{mineId}/batch` - 批量导入
*   `DELETE /api/pointcloud/{id}` - 删除点云数据

### 开采区域

*   `GET /api/mining-area/{mineId}` - 获取开采区域列表
*   `GET /api/mining-area/detail/{id}` - 获取单个开采区域
*   `POST /api/mining-area` - 创建开采区域
*   `PUT /api/mining-area/{id}` - 更新开采区域
*   `DELETE /api/mining-area/{id}` - 删除开采区域

## 使用说明

1.  **加载点云数据** - 点击"加载点云数据"按钮加载矿山点云
2.  **重建地形** - 点击"重建地形表面"生成3D地形
3.  **圈画开采范围** - 点击"圈画开采范围"进入标注模式，在地面点击添加顶点
4.  **完成标注** - 按Enter键完成标注，输入区域名称
5.  **取消标注** - 按Esc键取消标注

## 项目结构

```
├── backend/                 # 后端SpringBoot项目
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/mine/terrain/
│   │   │   │   ├── entity/      # 实体类
│   │   │   │   ├── repository/ # 数据访问层
│   │   │   │   ├── service/    # 业务逻辑层
│   │   │   │   ├── controller/ # 控制层
│   │   │   │   ├── config/     # 配置类
│   │   │   │   └── dto/        # 数据传输对象
│   │   │   └── resources/
│   │   │       └── application.yml
│   └── pom.xml
├── frontend/              # 前端项目
│   ├── index.html
│   └── src/js/
│   │   ├── main.js              # 主入口
│   │   ├── SceneManager.js    # 场景管理
│   │   ├── PointCloudLoader.js # 点云加载
│   │   ├── TerrainReconstructor.js # 地形重构
│   │   ├── AnnotationTool.js  # 标注工具
│   │   ├── CoordinateConverter.js # 坐标转换
│   │   └── APIService.js     # API服务
└── database/
    └── init.sql               # 数据库初始化脚本
```
