# 行业标准文档智能校对 AI 系统

基于 FastAPI + 大模型推理服务 + Elasticsearch 开发的行业标准文档智能校对 AI 系统。

## 功能特性

### 1. 文档解析模块
- 支持多格式文档解析：Word(.docx)、PDF、Excel(.xlsx)、TXT、Markdown
- 自动提取文档内容、统计字数和段落数
- 支持批量导入

### 2. AI 校对推理模块
- 错别字校验：识别常见错别字并提供正确写法
- 语法校验：检测语法问题，提供优化建议
- 专业术语校验：基于行业知识库校验专业术语
- 格式校验：检测文档格式规范问题

### 3. 格式规整模块
- 自动统一文档版式格式
- 标准化标点符号、编号、缩进
- 规范标题格式和日期格式

### 4. 异步任务队列模块
- 基于 Celery + Redis 的异步任务处理
- 支持批量任务提交
- 实时任务进度追踪
- 任务失败自动重试机制

### 5. 结果导出模块
- 支持多种格式导出：DOCX、TXT、Markdown、HTML
- 导出校对修改意见列表
- 自定义导出文件名

### 6. 用户权限模块
- JWT 令牌认证
- RBAC 角色权限控制
- 支持超级管理员管理
- 用户注册/登录

### 7. Elasticsearch 搜索引擎
- 文档全文检索
- 支持按行业、文件类型筛选
- 中文分词搜索

## 技术栈

- **后端框架**: FastAPI 0.104+
- **数据库**: SQLite (可扩展到 PostgreSQL/MySQL)
- **ORM**: SQLAlchemy 2.0+
- **任务队列**: Celery 5.3+
- **消息代理**: Redis
- **搜索引擎**: Elasticsearch 8.x
- **文档解析**: python-docx, pdfplumber, openpyxl, pandas
- **AI 服务**: 可对接外部大模型推理服务

## 快速开始

### 环境要求

- Python 3.10+
- Redis 6.0+
- Elasticsearch 8.x (可选，用于搜索功能)

### 安装依赖

```bash
pip install -r requirements.txt
```

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，根据实际情况修改配置。

### 初始化数据库

```bash
python -m scripts.init_db
```

### 启动服务

#### 1. 启动 FastAPI 服务

```bash
python main.py
```

或使用 uvicorn:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. 启动 Celery Worker

```bash
celery -A app.tasks.celery_app worker --loglevel=info -P solo
```

### 访问 API 文档

启动服务后访问:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 项目结构

```
.
├── app/
│   ├── __init__.py
│   ├── core/                    # 核心配置
│   │   ├── __init__.py
│   │   ├── config.py           # 配置管理
│   │   ├── database.py         # 数据库连接
│   │   ├── deps.py             # 依赖注入
│   │   ├── exceptions.py       # 异常定义
│   │   ├── logging_config.py   # 日志配置
│   │   └── security.py         # 安全认证
│   ├── models/                 # 数据模型
│   │   ├── __init__.py
│   │   ├── user.py            # 用户模型
│   │   ├── document.py        # 文档模型
│   │   └── task.py            # 任务模型
│   ├── schemas/                # Pydantic 模型
│   │   ├── __init__.py
│   │   ├── common.py          # 通用响应
│   │   ├── user.py            # 用户 Schema
│   │   ├── document.py        # 文档 Schema
│   │   └── task.py            # 任务 Schema
│   ├── services/               # 业务服务
│   │   ├── __init__.py
│   │   ├── user_service.py    # 用户服务
│   │   ├── document_service.py # 文档服务
│   │   ├── task_service.py    # 任务服务
│   │   ├── ai_service.py      # AI 校对服务
│   │   ├── format_service.py  # 格式化服务
│   │   └── export_service.py  # 导出服务
│   ├── parsers/                # 文档解析器
│   │   ├── __init__.py
│   │   ├── base_parser.py     # 解析器基类
│   │   ├── docx_parser.py     # Word 解析
│   │   ├── pdf_parser.py      # PDF 解析
│   │   ├── excel_parser.py    # Excel 解析
│   │   ├── txt_parser.py      # TXT 解析
│   │   ├── md_parser.py       # Markdown 解析
│   │   └── parser_factory.py  # 解析器工厂
│   ├── search/                 # 搜索模块
│   │   ├── __init__.py
│   │   ├── es_client.py       # ES 客户端
│   │   └── document_index.py  # 文档索引
│   ├── tasks/                  # 任务模块
│   │   ├── __init__.py
│   │   ├── celery_app.py      # Celery 配置
│   │   └── proofread_tasks.py # 校对任务
│   └── api/                    # API 路由
│       ├── __init__.py
│       └── v1/
│           ├── __init__.py
│           ├── auth.py        # 认证接口
│           ├── documents.py   # 文档接口
│           ├── tasks.py       # 任务接口
│           ├── search.py      # 搜索接口
│           ├── export.py      # 导出接口
│           └── admin.py       # 管理接口
├── scripts/                    # 脚本
│   ├── __init__.py
│   └── init_db.py             # 数据库初始化
├── uploads/                    # 上传文件目录
├── exports/                    # 导出文件目录
├── logs/                       # 日志目录
├── main.py                     # 应用入口
├── requirements.txt            # 依赖列表
├── .env.example                # 环境变量示例
└── README.md                   # 项目说明
```

## API 接口列表

### 认证授权
- `POST /api/v1/auth/register` - 用户注册
- `POST /api/v1/auth/login` - 用户登录
- `GET /api/v1/auth/me` - 获取当前用户信息

### 文档管理
- `POST /api/v1/documents/upload` - 上传文档
- `GET /api/v1/documents` - 获取文档列表
- `GET /api/v1/documents/{id}` - 获取文档详情
- `PUT /api/v1/documents/{id}` - 更新文档信息
- `DELETE /api/v1/documents/{id}` - 删除文档

### 校对任务
- `POST /api/v1/tasks/submit` - 提交校对任务
- `POST /api/v1/tasks/batch` - 批量提交任务
- `GET /api/v1/tasks/{task_id}/status` - 获取任务状态
- `GET /api/v1/tasks/{task_id}/result` - 获取任务结果
- `GET /api/v1/tasks` - 获取任务列表
- `POST /api/v1/tasks/{task_id}/retry` - 重试任务

### 搜索
- `GET /api/v1/search` - 搜索文档
- `GET /api/v1/search/health` - 搜索服务健康检查

### 导出
- `GET /api/v1/export/task/{task_id}` - 导出任务结果
- `POST /api/v1/export/content` - 导出内容

### 管理
- `GET /api/v1/admin/users` - 获取用户列表
- `GET /api/v1/admin/users/{id}` - 获取用户详情
- `PUT /api/v1/admin/users/{id}` - 更新用户
- `DELETE /api/v1/admin/users/{id}` - 删除用户
- `GET /api/v1/admin/stats` - 获取系统统计

## 默认账号

- 用户名: `admin`
- 密码: `admin123`

## 开发说明

### 添加新的文档解析器

1. 继承 `BaseParser` 类
2. 实现 `parse` 方法
3. 在 `parser_factory.py` 中注册

### 对接真实 AI 服务

修改 `app/services/ai_service.py` 中的 `_call_ai_service` 方法，对接实际的大模型推理服务。

## 许可证

MIT License
