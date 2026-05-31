# 科研项目成果资产全生命周期管理系统

基于 Angular + SpringBoot + OSS + PostgreSQL 构建的科研资产全生命周期管理平台。

## 项目架构

```
research-asset-management/
├── database/                 # 数据库脚本
│   └── schema.sql            # 数据库建表脚本
├── backend/                  # SpringBoot 后端
│   ├── src/
│   │   └── main/
│   │       ├── java/com/research/asset/
│   │       │   ├── config/   # 配置类
│   │       │   ├── controller/ # 控制器
│   │       │   ├── service/   # 业务服务
│   │       │   ├── repository/ # 数据访问
│   │       │   ├── entity/    # 实体类
│   │       │   ├── enums/     # 枚举类
│   │       │   ├── dto/       # 传输对象
│   │       │   └── AssetApplication.java
│   │       └── resources/
│   │           └── application.yml
│   └── pom.xml
└── frontend/                 # Angular 前端
    ├── src/
    │   ├── app/
    │   │   ├── core/         # 核心服务
    │   │   ├── models/       # 模型定义
    │   │   ├── layout/       # 布局组件
    │   │   ├── shared/       # 共享组件
    │   │   ├── workspace/    # 工作台
    │   │   ├── archive/      # 成果归档
    │   │   ├── permission/   # 权限分级
    │   │   ├── circulation/  # 文件流转
    │   │   ├── version/      # 版本管控
    │   │   └── approval/     # 审批流
    │   ├── styles.scss
    │   └── main.ts
    └── package.json
```

## 功能模块

### 1. 资产工作台 (Workspace)
- 统计仪表盘（资产总数、本月新增、待审批、借阅中）
- 资产类型分布可视化
- 最近操作记录
- 快捷操作入口

### 2. 成果归档模块 (Archive)
- 资产列表查询（支持关键词、类型、状态、密级筛选）
- 资产信息录入（标题、类型、摘要、关键词、作者、密级）
- 附件上传（OSS对象存储）
- 资产详情查看
- 归档审批提交

### 3. 权限分级模块 (Permission)
- 用户角色分配
- 角色权限配置
- RBAC权限模型
- 数据权限隔离

### 4. 文件流转模块 (Circulation)
- 借阅申请
- 借阅审批
- 资产归还
- 逾期检测
- 流转记录追踪

### 5. 版本管控模块 (Version)
- 版本自动编号
- 版本历史记录
- 版本对比
- 变更说明记录

### 6. 审批流模块 (Approval)
- 审批链定义
- 多种审批模式（单人/会签/或签）
- 审批进度可视化
- 审批日志记录
- 审批处理（同意/驳回/转审）

## 技术栈

### 后端技术栈
- **框架**: SpringBoot 3.2.5
- **语言**: Java 17
- **ORM**: Spring Data JPA
- **数据库**: PostgreSQL
- **安全**: Spring Security
- **对象存储**: 阿里云 OSS
- **文档**: SpringDoc OpenAPI
- **构建工具**: Maven

### 前端技术栈
- **框架**: Angular 17
- **语言**: TypeScript 5.4
- **样式**: SCSS
- **状态管理**: RxJS
- **构建工具**: Angular CLI

## 快速启动

### 1. 数据库初始化

```bash
# 创建数据库
psql -U postgres -c "CREATE DATABASE research_asset;"

# 执行建表脚本
psql -U postgres -d research_asset -f database/schema.sql
```

### 2. 后端启动

```bash
cd backend

# 修改配置文件 application.yml 中的数据库和OSS配置
# 1. 数据库连接信息
# 2. OSS access-key 配置

# 启动服务
mvn spring-boot:run
```

后端服务将在 `http://localhost:8080` 启动

API文档地址: `http://localhost:8080/swagger-ui.html`

### 3. 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务
npm start
```

前端服务将在 `http://localhost:4200` 启动

## 数据库配置

默认管理员账号:
- 用户名: `admin`
- 密码: `admin123` (BCrypt加密存储)

## API 接口概览

| 模块 | 接口前缀 | 主要功能 |
|------|----------|----------|
| 资产管理 | `/api/assets` | CRUD、归档、文件管理 |
| 文件存储 | `/api/oss` | 上传、下载、预览 |
| 借阅流转 | `/api/circulations` | 申请、审批、归还 |
| 版本管理 | `/api/versions` | 创建、查询、对比 |
| 审批管理 | `/api/approvals` | 提交、处理、查询 |
| 权限管理 | `/api/permissions` | 角色、权限分配 |
| 用户管理 | `/api/users` | CRUD、密码管理 |

## 核心业务流程

### 成果归档流程
1. 用户创建资产草稿
2. 上传附件文件（存储到OSS）
3. 填写完整元数据
4. 提交归档审批
5. 审批人逐级审批
6. 审批通过后资产正式归档

### 资产借阅流程
1. 用户提交借阅申请
2. 审批人审批
3. 审批通过后资产状态变为借阅中
4. 借阅人查看/下载资产
5. 到期前归还资产
6. 系统自动检测逾期

### 版本管理流程
1. 修改资产内容
2. 创建新版本
3. 记录变更说明
4. 版本历史可追溯
5. 支持版本对比

## 注意事项

1. **OSS配置**: 使用前请配置正确的阿里云OSS AccessKey
2. **密码加密**: 用户密码使用BCrypt加密存储
3. **跨域配置**: 后端已配置允许 `http://localhost:4200` 访问
4. **文件大小**: 默认支持最大100MB文件上传
5. **权限控制**: 细粒度的RBAC权限模型，请根据实际业务调整

## License

MIT License
