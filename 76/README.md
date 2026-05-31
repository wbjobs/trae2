# 电机运行异响音频诊断 AI 预处理平台

## 平台概述

本平台是一个完整的电机异响音频诊断AI预处理系统，支持音频流实时接收、智能降噪处理、多维特征提取、AI故障分类以及样本库管理。平台采用异步架构设计，支持多路音频并发处理，对接前端可视化控制台与持久化存储服务。

## 技术栈

- **后端框架**: FastAPI (高性能异步Web框架)
- **音频处理**: librosa, noisereduce, scipy, soundfile
- **机器学习**: scikit-learn (RandomForest分类器)
- **数据库**: SQLite + SQLAlchemy ORM
- **并发模型**: asyncio + 线程池 + WebSocket
- **前端**: HTML5 + ECharts 可视化 + Axios
- **部署**: Uvicorn ASGI服务器

## 项目结构

```
e:\trae2\76\
├── src/
│   ├── __init__.py
│   ├── config.py              # 配置管理
│   ├── database.py            # 数据库模型与连接
│   ├── schemas.py             # 数据模型与校验
│   ├── denoiser.py            # 音频降噪处理模块
│   ├── feature_extractor.py   # 振动特征提取模块
│   ├── ai_classifier.py       # AI故障分类模块
│   ├── sample_library.py      # 样本库管理模块
│   ├── storage_service.py     # 存储服务模块
│   ├── audio_stream.py        # 音频流管理模块
│   └── main.py                # 主程序入口与API路由
├── frontend/
│   └── index.html             # 前端控制台
├── data/
│   ├── samples/               # 样本存储目录
│   ├── uploads/               # 上传文件目录
│   └── audio_diagnosis.db     # SQLite数据库
├── models/
│   ├── fault_classifier.pkl   # AI分类模型
│   └── model_info.json        # 模型信息
├── logs/                      # 日志目录
├── requirements.txt           # Python依赖
├── .env                       # 环境变量配置
└── README.md                  # 项目说明
```

## 核心功能模块

### 1. 音频流接收接口 ([audio_stream.py](file:///e:/trae2/76/src/audio_stream.py))

- 支持 WebSocket 实时音频流传输
- 多路并发流处理（默认最大10路）
- 会话管理与自动超时清理
- 流式诊断，每2秒输出一次诊断结果
- 流数据持久化存储

### 2. 降噪处理模块 ([denoiser.py](file:///e:/trae2/76/src/denoiser.py))

支持5种降噪算法：
- **谱减法 (spectral)**: 基于噪声谱估计的谱减法
- **巴特沃斯滤波 (butterworth)**: 带通滤波器，20-2000Hz
- **维纳滤波 (wiener)**: 自适应维纳滤波
- **小波降噪 (wavelet)**: 小波阈值去噪
- **综合降噪 (combined)**: 巴特沃斯 + 谱减 + 维纳（推荐）

### 3. 振动特征提取模块 ([feature_extractor.py](file:///e:/trae2/76/src/feature_extractor.py))

提取 **100+维** 音频特征，包括：
- **时域特征** (15维): RMS、峰值、峰值因子、峭度、偏度、过零率等
- **频域特征** (15维): 频谱质心、频谱扩展、滚降频率、基频、主导频率等
- **梅尔谱特征** (7维): 梅尔频谱均值、方差、最大值等
- **色度特征** (13维): 12维色度特征 + 标准差
- **MFCC特征** (80维): 20维MFCC + 20维一阶差分 + 20维二阶差分 + 各自标准差
- **谐波特征** (7维): 谐波能量、冲击能量、谐波冲击比等
- **节奏特征** (4维): 节奏速度、 onset强度均值/标准差、 onset计数

### 4. AI故障分类模块 ([ai_classifier.py](file:///e:/trae2/76/src/ai_classifier.py))

- **模型类型**: RandomForest 随机森林分类器
- **模型架构**: StandardScaler + RandomForest(200棵树, 最大深度15)
- **支持9类故障识别**:
  - normal (正常)
  - bearing_fault (轴承故障)
  - gear_fault (齿轮故障)
  - rotor_fault (转子故障)
  - stator_fault (定子故障)
  - unbalance (不平衡)
  - misalignment (不对中)
  - mechanical_looseness (机械松动)
  - unknown (未知)

### 5. 样本库管理模块 ([sample_library.py](file:///e:/trae2/76/src/sample_library.py))

- 样本增删改查 (CRUD)
- 按电机类型、故障类型、标注状态筛选
- 样本标签更新与自动归档
- 统计信息导出
- 数据集导出 (JSON/CSV格式)

### 6. 存储服务模块 ([storage_service.py](file:///e:/trae2/76/src/storage_service.py))

- 异步文件存储
- 音频文件编码转换
- 流数据分片存储与组装
- 特征与诊断结果持久化
- 存储统计信息

## API 接口文档

### REST API

#### 1. 故障诊断
```http
POST /api/v1/diagnosis
Content-Type: multipart/form-data

Parameters:
- file: 音频文件 (required)
- motor_id: 电机ID (required)
- motor_type: 电机类型 (default: induction_motor)
- save_sample: 是否保存到样本库 (default: true)
- denoise_method: 降噪方法 (default: combined)

Response:
{
  "record_id": "diag_xxx",
  "sample_id": "samp_xxx",
  "motor_id": "motor001",
  "fault_type": "bearing_fault",
  "confidence": 0.92,
  "fault_probabilities": {...},
  "features": {...},
  "processing_time_ms": 245.3,
  "is_realtime": false,
  "timestamp": "2026-05-27T..."
}
```

#### 2. 样本管理

```http
# 上传样本
POST /api/v1/samples/upload
Content-Type: multipart/form-data

Parameters:
- file: 音频文件
- motor_type: 电机类型
- fault_type: 故障类型（可选）
- fault_severity: 严重程度（可选）
- is_labeled: 是否已标注

# 查询样本列表
GET /api/v1/samples?motor_type=&fault_type=&is_labeled=&skip=0&limit=100

# 获取样本详情
GET /api/v1/samples/{sample_id}

# 获取样本音频
GET /api/v1/samples/{sample_id}/audio

# 更新样本标签
PUT /api/v1/samples/{sample_id}/label?fault_type=xxx

# 删除样本
DELETE /api/v1/samples/{sample_id}

# 获取统计信息
GET /api/v1/samples/statistics
```

#### 3. 诊断历史
```http
GET /api/v1/diagnosis/history?motor_id=&fault_type=&limit=100
```

#### 4. 模型信息
```http
GET /api/v1/model/info
GET /api/v1/model/features
```

#### 5. 批量处理
```http
POST /api/v1/process/batch
Content-Type: application/json

{
  "file_ids": ["id1", "id2"],
  "motor_id": "motor001",
  "motor_type": "induction_motor"
}
```

### WebSocket API

#### 实时音频流
```javascript
// 1. 建立连接
const ws = new WebSocket('ws://localhost:8000/api/v1/stream/ws');

// 2. 发送初始化消息
ws.send(JSON.stringify({
  motor_id: 'motor001',
  motor_type: 'induction_motor',
  sample_rate: 16000,
  channels: 1,
  format: 'wav'
}));

// 3. 接收初始化响应
{
  "success": true,
  "session_id": "stream_xxx",
  "message": "流会话已建立，开始发送音频数据"
}

// 4. 发送音频数据 (Float32Array二进制)
ws.send(audioBuffer);

// 5. 接收诊断响应
{
  "session_id": "stream_xxx",
  "chunk_index": 42,
  "duration_received": 10.5,
  "buffer_duration": 0.0,
  "diagnosis": {
    "record_id": "diag_xxx",
    "fault_type": "bearing_fault",
    "confidence": 0.89,
    ...
  },
  "status": "ok"
}

// 其他接口
GET /api/v1/stream/sessions          // 获取活跃会话
POST /api/v1/stream/{session_id}/close  // 关闭会话
```

## 快速开始

### 1. 安装依赖

```bash
cd e:\trae2\76
pip install -r requirements.txt
```

### 2. 启动服务

```bash
# 方式1: 直接运行
python -m src.main

# 方式2: 使用uvicorn
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 访问平台

- **前端控制台**: http://localhost:8000/static/index.html
- **API文档**: http://localhost:8000/docs (Swagger UI)
- **健康检查**: http://localhost:8000/health

### 4. 前端控制台功能

1. **📊 数据概览**: 样本统计、故障分布、诊断趋势、置信度分布
2. **🔍 故障诊断**: 上传音频文件进行故障诊断，支持多种降噪方法
3. **📡 实时流处理**: WebSocket实时音频采集与诊断，波形可视化
4. **📚 样本库管理**: 样本上传、查询、标注、删除、播放
5. **📋 诊断历史**: 历史诊断记录查询与追溯
6. **🤖 模型信息**: AI模型参数与特征维度详情

## 配置说明 ([.env](file:///e:/trae2/76/.env))

```dotenv
APP_HOST=0.0.0.0              # 监听地址
APP_PORT=8000                  # 监听端口
LOG_LEVEL=info                 # 日志级别
SAMPLE_STORAGE_PATH=./data/samples    # 样本存储路径
UPLOAD_STORAGE_PATH=./data/uploads    # 上传路径
MODEL_PATH=./models           # 模型路径
DATABASE_URL=sqlite:///./data/audio_diagnosis.db  # 数据库URL
MAX_CONCURRENT_STREAMS=10     # 最大并发流数
SAMPLE_RATE=16000              # 默认采样率
AUDIO_CHANNELS=1               # 默认声道数
CHUNK_SIZE=4096                # 音频块大小
ENABLE_CORS_ORIGINS=*          # CORS配置
```

## 故障类型说明

| 故障类型 | 英文标识 | 典型特征 |
|---------|---------|---------|
| 正常 | normal | 纯净的电源频率谐波 |
| 轴承故障 | bearing_fault | 150Hz载波 + 15Hz调制，边带丰富 |
| 齿轮故障 | gear_fault | 300Hz啮合频率 + 25Hz旋转频率，周期性冲击 |
| 转子故障 | rotor_fault | 电源频率 ± 2倍转差频率边带 |
| 定子故障 | stator_fault | 奇次谐波显著，100Hz调制 |
| 不平衡 | unbalance | 1倍转频及其谐波主导 |
| 不对中 | misalignment | 1倍和2倍转频显著，轴向频率分量 |
| 机械松动 | mechanical_looseness | 丰富的次谐波和高次谐波 |

## 音频采集建议

1. **采样率**: 推荐 16kHz 或更高
2. **位深度**: 16bit 或 24bit
3. **声道**: 单声道即可，多声道自动混合
4. **时长**: 单次诊断建议 2-5 秒
5. **格式**: WAV、FLAC、MP3
6. **传感器**: 压电加速度传感器或高质量麦克风
7. **安装位置**: 电机端盖、轴承座、齿轮箱壳体
8. **环境**: 尽量减少背景噪声干扰

## 性能指标

- **单样本诊断耗时**: 200-500ms (含降噪+特征提取+分类)
- **实时流延迟**: < 500ms (2秒窗口)
- **并发处理能力**: 10路并发流 (可配置)
- **特征维度**: 100+维
- **模型准确率**: >95% (合成数据训练)
- **支持音频格式**: WAV, MP3, FLAC, OGG

## 代码优化建议

### 1. 性能优化

```python
# 对于高并发场景，建议使用进程池替代线程池
from concurrent.futures import ProcessPoolExecutor

# 特征提取可以批量向量化
features = extractor.extract_batch(audio_list)
```

### 2. 模型改进

```python
# 建议用真实电机数据微调模型
classifier.fine_tune(real_features, real_labels)
```

### 3. 数据库升级

```python
# 生产环境建议替换为 PostgreSQL 或 MySQL
DATABASE_URL=postgresql://user:pass@localhost/db
```

## 故障排除

### 常见问题

1. **端口被占用**: 修改 `.env` 中的 `APP_PORT`
2. **依赖安装失败**: 
   ```bash
   pip install --upgrade pip
   pip install numpy scipy --only-binary :all:
   ```
3. **librosa 加载失败**: 安装 ffmpeg
   ```bash
   # Windows (使用chocolatey)
   choco install ffmpeg
   ```
4. **模型文件损坏**: 删除 `models/fault_classifier.pkl` 后重启服务自动重新生成

### 日志查看

日志输出到控制台，可通过 `LOG_LEVEL=debug` 查看详细调试信息。

## License

MIT License
