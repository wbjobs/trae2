# 海洋生物标本影像归档与生态溯源全栈Web系统

## 项目简介

本系统是一个专业的海洋生物标本影像归档与生态溯源管理平台，实现了标本信息管理、高清影像在线查看、生物栖息溯源查询、多角色权限隔离等核心功能。

## 技术栈

### 后端
- **Node.js** + **TypeScript** - 服务端运行环境和类型系统
- **Express** - Web应用框架
- **MySQL** + **Sequelize** - 关系型数据库和ORM
- **JWT** - 身份认证
- **AWS SDK (S3兼容)** - 对象存储服务对接
- **Multer** - 文件上传处理
- **Winston** - 日志管理

### 前端
- **React 18** + **TypeScript** - UI框架和类型系统
- **Vite** - 构建工具
- **Ant Design** - UI组件库
- **React Router** - 路由管理
- **Zustand** - 状态管理
- **Axios** - HTTP客户端
- **React Leaflet** - 地图可视化
- **React Viewer** - 高清影像查看器

## 项目结构

```
marine-specimen-system/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── config/            # 配置文件
│   │   ├── controllers/       # 控制器
│   │   ├── middleware/        # 中间件
│   │   ├── models/            # 数据模型
│   │   ├── routes/            # 路由
│   │   ├── services/          # 业务服务
│   │   ├── utils/             # 工具函数
│   │   └── index.ts           # 入口文件
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── components/        # 组件
│   │   ├── pages/             # 页面
│   │   ├── services/          # API服务
│   │   ├── store/             # 状态管理
│   │   ├── types/             # 类型定义
│   │   └── main.tsx           # 入口文件
│   ├── package.json
│   └── vite.config.ts
└── package.json               # 根配置
```

## 功能模块

### 1. 用户权限模块
- 用户注册与登录（JWT认证）
- 多角色权限管理（管理员、策展人、研究员、访客）
- 用户信息管理
- 密码修改

### 2. 标本档案接口
- 标本信息CRUD操作
- 标本分类管理
- 标本状态流转（待审核/已审核/已归档）
- 高级搜索与筛选
- 数据统计仪表盘

### 3. 高清影像存储
- S3兼容对象存储对接
- 高清图片批量上传
- 图片分类管理（主图、细节图、显微图、生境图）
- 高清影像在线查看（支持缩放、旋转、下载）
- 图片排序和主图设置

### 4. 生态溯源轨迹模块
- 溯源记录管理（采集、运输、处理、入库、展出、研究、修复）
- 地图可视化展示
- 轨迹时间线
- 环境参数记录（温度、湿度等）

## 快速开始

### 环境要求
- Node.js >= 16.x
- MySQL >= 8.0
- MinIO 或其他S3兼容对象存储服务

### 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装所有子项目依赖
npm run install:all
```

### 配置环境变量

#### 后端配置 (backend/.env)
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

DB_HOST=localhost
DB_PORT=3306
DB_NAME=marine_specimen
DB_USER=root
DB_PASSWORD=your_password

S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=specimen-images
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
```

### 启动服务

```bash
# 启动数据库和对象存储服务

# 初始化数据库（创建测试用户）
cd backend
npm run seed

# 启动后端服务
npm run dev:server

# 启动前端服务（新开终端）
npm run dev:client

# 或同时启动前后端
npm run dev
```

### 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |
| curator | curator123 | 策展人 |
| researcher | research123 | 研究员 |

## 角色权限说明

### 管理员 (Admin)
- 拥有系统所有权限
- 用户管理
- 系统配置

### 策展人 (Curator)
- 标本档案的增删改查
- 标本审核
- 影像上传和管理
- 溯源记录管理

### 研究员 (Researcher)
- 标本档案查看
- 影像查看
- 溯源记录查看

### 访客 (Guest)
- 标本档案查看（有限）
- 影像查看（有限）

## API文档

### 认证接口
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/change-password` - 修改密码

### 用户管理接口
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户

### 标本接口
- `GET /api/specimens` - 获取标本列表
- `GET /api/specimens/:id` - 获取标本详情
- `POST /api/specimens` - 创建标本
- `PUT /api/specimens/:id` - 更新标本
- `DELETE /api/specimens/:id` - 删除标本
- `PATCH /api/specimens/:id/verify` - 审核标本

### 影像接口
- `GET /api/images/specimen/:specimenId` - 获取标本图片列表
- `POST /api/images` - 上传图片
- `PUT /api/images/:id` - 更新图片信息
- `DELETE /api/images/:id` - 删除图片
- `PATCH /api/images/:id/primary` - 设置主图

### 溯源接口
- `GET /api/traceability/specimen/:specimenId` - 获取标本溯源记录
- `POST /api/traceability` - 创建溯源记录
- `PUT /api/traceability/:id` - 更新溯源记录
- `DELETE /api/traceability/:id` - 删除溯源记录

## 浏览器支持

- Chrome >= 90
- Firefox >= 88
- Safari >= 14
- Edge >= 90

## 高分显示支持

系统支持：
- 4K及以上分辨率显示优化
- 高DPI屏幕适配
- 高清图片无损缩放
- 响应式布局

## 开发说明

### 代码规范
- 使用TypeScript严格模式
- 遵循ESLint规范
- 组件命名使用PascalCase
- 函数命名使用camelCase

### 提交规范
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式调整
- refactor: 重构
- test: 测试相关
- chore: 构建/工具相关

## 许可证

MIT License
