# 法律条文智能援引与类案匹配 AI 服务系统

## 项目简介

本系统是基于深度学习的法律文书智能分析服务，提供法律条文自动援引和相似案例匹配功能。系统采用模块化架构，支持批量文书并行处理，可部署于 Linux 服务器。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        API 网关 (FastAPI)                       │
├─────────────┬────────────────┬────────────────┬────────────────┤
│  文书解析   │  语义向量化    │  条文匹配      │  案例匹配      │
└─────────────┴────────────────┴────────────────┴────────────────┘
                              │
                              ▼
┌─────────────┐  ┌────────────────┐  ┌────────────────┐
│  业务服务   │  │   Redis 缓存   │  │  Celery 队列    │
└─────────────┘  └────────────────┘  └────────────────┘
```

## 核心模块

1. **文书解析模块** (`document_parser.py`)
   - 支持 TXT、DOCX、PDF 格式文件解析
   - 自动提取当事人、法院、案号、诉讼请求等元数据
   - 法律关键词识别

2. **AI 语义向量计算模块** (`embedding_service.py`)
   - 基于中文预训练语言模型的语义向量化
   - 支持批量文本编码
   - Redis 缓存加速

3. **条文检索匹配模块** (`provision_matcher.py`)
   - 法律条文向量索引构建
   - 语义相似度检索
   - 多段落融合匹配

4. **类案匹配模块** (`case_matcher.py`)
   - 裁判文书向量索引
   - 多维度相似案例检索
   - 法条重合度分析

5. **结果排序模块** (`result_ranker.py`)
   - 混合排序策略
   - 置信度计算
   - 结果去重

6. **对外接口网关** (`gateway.py`)
   - RESTful API 接口
   - API 密钥认证
   - 限流控制
   - 批量异步处理

## 快速开始

### 环境要求

- Python 3.10+
- Redis 6.0+
- （可选）CUDA 11.7+（GPU 加速）

### 安装部署

#### 方式一：一键部署脚本

```bash
chmod +x deploy/deploy.sh
sudo ./deploy/deploy.sh
```

#### 方式二：Docker Compose

```bash
cd deploy
docker-compose up -d
```

#### 方式三：手动安装

```bash
# 1. 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 4. 启动服务
python main.py
```

### 启动 Celery Worker（可选，用于异步任务）

```bash
celery -A deploy.celery_tasks worker --loglevel=info --concurrency=4
```

## API 文档

启动服务后访问：`http://localhost:8000/docs`

### 主要接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/v1/analyze/upload` | POST | 上传法律文书进行分析 |
| `/api/v1/analyze/text` | POST | 直接分析文本内容 |
| `/api/v1/analyze/batch` | POST | 批量文书分析（异步） |
| `/api/v1/tasks/{task_id}` | GET | 查询批量任务状态 |
| `/api/v1/search/provisions` | POST | 法律条文检索 |
| `/api/v1/search/cases` | POST | 相似案例检索 |
| `/api/v1/provisions` | GET | 获取法律条文列表 |
| `/api/v1/cases` | GET | 获取案例列表 |
| `/health` | GET | 健康检查 |

### 请求示例

```bash
# 文本分析
curl -X POST http://localhost:8000/api/v1/analyze/text \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "text": "原被告签订买卖合同，原告供货后被告拖欠货款...",
    "case_type": "民事",
    "top_k_provisions": 10,
    "top_k_cases": 5
  }'

# 文件上传分析
curl -X POST http://localhost:8000/api/v1/analyze/upload \
  -H "X-API-Key: your-api-key" \
  -F "file=@contract.pdf" \
  -F "case_type=民事"
```

## 数据准备

系统内置示例法律条文和案例数据。如需使用自定义数据，请按以下格式准备：

### 法律条文数据格式 (`data/legal_provisions.json`)

```json
[
  {
    "provision_id": "law_001",
    "law_name": "中华人民共和国民法典",
    "article_number": "第五百七十七条",
    "article_title": "违约责任",
    "content": "当事人一方不履行合同义务...",
    "category": "合同编"
  }
]
```

### 案例数据格式 (`data/cases.json`)

```json
[
  {
    "case_id": "case_001",
    "case_number": "(2023)京01民初100号",
    "title": "甲公司与乙公司买卖合同纠纷案",
    "court": "北京市第一中级人民法院",
    "case_type": "民事",
    "judgment_date": "2023-06-15",
    "summary": "原告甲公司与被告乙公司签订买卖合同...",
    "full_text": "本院认为...",
    "legal_provisions": ["民法典第五百七十七条"],
    "parties": ["甲公司", "乙公司"],
    "keywords": ["买卖合同", "拖欠货款"]
  }
]
```

## 运行测试

```bash
# 运行所有测试
pytest

# 运行端到端测试
python tests/test_full_pipeline.py
```

## 性能优化建议

1. **GPU 加速**：设置 `DEVICE=cuda` 使用 GPU 进行向量计算
2. **批量处理**：使用批量接口处理大量文书
3. **缓存配置**：增大 Redis 内存以提高缓存命中率
4. **工作进程**：根据 CPU 核心数调整 `CELERY_WORKER_CONCURRENCY`

## 系统监控

- 日志位置：`logs/legal_ai_service_YYYY-MM-DD.log`
- 健康检查：`GET /health`
- Systemd 状态：`systemctl status legal-ai-service`

## 许可证

MIT License
