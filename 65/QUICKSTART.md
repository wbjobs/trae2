# 快速启动指南

## 前置准备

### 1. 安装必要软件
- **Node.js 18+**: https://nodejs.org/
- **MySQL 8.0+**: https://dev.mysql.com/downloads/mysql/
- **MinIO (可选)**: https://min.io/download (用于本地对象存储)

### 2. 启动 MySQL 服务
确保MySQL服务已启动，并创建数据库：
```sql
CREATE DATABASE marine_specimen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. 启动 MinIO (用于本地开发)
```bash
# Windows
minio.exe server C:\minio --console-address ":9001"

# 或使用 Docker
docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"
```
默认账号: minioadmin / minioadmin

在MinIO控制台创建一个名为 `specimen-images` 的存储桶，并设置为公共访问。

## 项目配置

### 后端配置
在 `backend/` 目录下创建 `.env` 文件：

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=marine_specimen_secret_key_2024
JWT_EXPIRES_IN=24h

DB_HOST=localhost
DB_PORT=3306
DB_NAME=marine_specimen
DB_USER=root
DB_PASSWORD=your_mysql_password

S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=specimen-images
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
```

### 前端配置
前端配置已在 `frontend/vite.config.ts` 中预设，后端API代理指向 `http://localhost:3001`。

## 安装与启动

### 1. 安装依赖
在项目根目录执行：
```bash
npm run install:all
```

或者分别安装：
```bash
# 根目录
npm install

# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

### 2. 初始化数据库
在 `backend/` 目录执行：
```bash
npm run seed
```
这将创建数据库表和测试用户。

### 3. 启动服务

#### 方式一：同时启动前后端（推荐）
在项目根目录：
```bash
npm run dev
```

#### 方式二：分别启动
**启动后端服务：**
```bash
cd backend
npm run dev
```

**启动前端服务（新开终端）：**
```bash
cd frontend
npm run dev
```

### 4. 访问系统
- 前端地址: http://localhost:5173
- 后端API: http://localhost:3001

## 默认测试账号

| 用户名 | 密码 | 角色 | 权限 |
|--------|------|------|------|
| admin | admin123 | 管理员 | 全部权限 |
| curator | curator123 | 策展人 | 标本管理、影像管理、溯源管理 |
| researcher | research123 | 研究员 | 查看权限 |

## 功能测试流程

### 1. 登录系统
1. 打开 http://localhost:5173
2. 使用 admin/admin123 登录
3. 进入控制台页面

### 2. 标本管理
1. 点击左侧菜单 "标本档案"
2. 点击 "新增标本" 填写标本信息
3. 提交后在列表查看
4. 点击标本名称查看详情

### 3. 影像管理
1. 在标本详情页点击 "查看影像"
2. 或通过左侧菜单 "影像管理" 进入
3. 选择标本后上传多张图片
4. 点击图片进入高清查看模式

### 4. 溯源管理
1. 在标本详情页点击 "查看溯源"
2. 或通过左侧菜单 "生态溯源" 进入
3. 在地图上查看轨迹
4. 添加新的溯源记录

### 5. 用户管理（仅管理员）
1. 点击左侧菜单 "用户管理"
2. 新增/编辑/删除用户
3. 切换用户角色和状态

## 常见问题

### 数据库连接失败
- 检查MySQL服务是否启动
- 确认 `.env` 中的数据库配置正确
- 确认数据库 `marine_specimen` 已创建

### 图片上传失败
- 检查MinIO服务是否启动
- 确认存储桶 `specimen-images` 已创建
- 检查 `.env` 中的S3配置

### 前端无法连接后端
- 确认后端服务已启动在3001端口
- 检查Vite代理配置
- 查看浏览器控制台Network请求

## 开发调试

### 后端日志
后端启动后会在控制台输出日志，包含：
- 数据库连接状态
- API请求日志
- 错误信息

### 前端调试
- 打开浏览器开发者工具
- Console查看错误信息
- Network查看API请求

### 数据库重置
如需重置数据库，重新执行：
```bash
cd backend
npm run seed
```
**注意：这会删除所有数据并重新创建表结构。**
