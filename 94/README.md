# 气象要素数值模拟并行推演计算系统

基于 Python + Dask + Redis + TimescaleDB 构建的大规模气象数据分布式计算系统。

## 系统架构

### 核心模块

1. **气象数据预处理模块** (`data_preprocessor.py`)
   - 数据清洗与去重
   - 观测数据网格化插值（IDW、Kriging、RBF、最近邻）
   - 质量控制

2. **网格推演计算模块** (`grid_simulator.py`)
   - 平流扩散数值模型
   - 温度、湿度、气压、风向风速、降水多要素模拟
   - 区域并行计算支持

3. **分布式任务调度模块** (`task_scheduler.py`)
   - 基于 Redis 的任务队列
   - Dask 分布式计算支持
   - 工作池管理
   - 任务优先级调度

4. **计算结果融合模块** (`result_fusion.py`)
   - 多区域结果合并
   - 数据平滑处理
   - 缺失值填充
   - 集合平均与离散度计算
   - 空间/时间一致性检查

5. **节点监控模块** (`node_monitor.py`)
   - 系统指标采集（CPU、内存、磁盘、网络）
   - 节点心跳检测
   - 集群状态监控
   - 告警机制

6. **时序数据库存储模块** (`timescaledb_storage.py`)
   - TimescaleDB 超表优化
   - 网格元数据管理
   - 时间序列查询
   - 区域统计分析
   - 任务日志记录

## 技术栈

- **Python 3.8+**: 主要开发语言
- **Dask**: 分布式并行计算框架
- **Redis**: 任务队列、缓存、节点状态存储
- **TimescaleDB**: 时序数据存储（基于 PostgreSQL）
- **NumPy/SciPy**: 数值计算与插值算法
- **Pandas**: 数据处理
- **SQLAlchemy**: ORM 数据库操作
- **psutil**: 系统监控

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
pip install -r requirements.txt
```

### 2. 配置服务

确保以下服务已启动并配置：

**Redis**:
```bash
# 默认配置
# Host: localhost
# Port: 6379
```

**TimescaleDB**:
```bash
# 创建数据库
createdb weather_simulation

# 初始化扩展 (在 PostgreSQL 中执行)
# CREATE EXTENSION IF NOT EXISTS timescaledb;
```

**Dask 调度器 (可选)**:
```bash
# 启动调度器
dask-scheduler

# 启动工作节点
dask-worker tcp://localhost:8786
```

### 3. 配置文件

修改 `.env` 文件配置系统参数：

```env
# Dask 配置
DASK_SCHEDULER_HOST=localhost
DASK_SCHEDULER_PORT=8786

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# TimescaleDB 配置
TIMESCALEDB_HOST=localhost
TIMESCALEDB_PORT=5432
TIMESCALEDB_DATABASE=weather_simulation
TIMESCALEDB_USER=postgres
TIMESCALEDB_PASSWORD=postgres

# 网格配置
GRID_RESOLUTION=5.0
GRID_LAT_MIN=20
GRID_LAT_MAX=50
GRID_LON_MIN=100
GRID_LON_MAX=140

# 模拟配置
SIMULATION_TIME_STEPS=10
SIMULATION_DT_SECONDS=3600
PARALLEL_WORKERS=4
```

### 4. 运行测试

```bash
# 运行系统测试
python test_system.py
```

### 5. 运行示例

**单节点模拟**:
```bash
python weather_simulation_system.py single
```

**分布式模拟**:
```bash
python weather_simulation_system.py distributed
```

**监控演示**:
```bash
python weather_simulation_system.py monitoring
```

## 使用示例

### 基本使用

```python
from weather_simulation_system import WeatherSimulationSystem, generate_sample_observations

# 初始化系统
system = WeatherSimulationSystem(use_dask=False, enable_monitoring=True)

# 生成/加载观测数据
observations = generate_sample_observations(100)

# 数据预处理（网格化）
initial_data = system.process_observations(observations)

# 运行模拟
results = system.run_simulation(initial_data, num_steps=10)

# 质量控制
qc_results = system.run_quality_control(results)

# 关闭系统
system.shutdown()
```

### 分布式计算

```python
# 使用多区域并行计算
results = system.run_distributed_simulation(
    initial_data,
    num_steps=24,
    num_regions=8,
    num_workers=4
)
```

### 数据查询

```python
from datetime import datetime, timedelta
from data_models import WeatherVariable

# 查询单点时间序列
end_time = datetime.utcnow()
start_time = end_time - timedelta(hours=24)

time_series = system.query_time_series(
    latitude=35.0,
    longitude=120.0,
    variable=WeatherVariable.TEMPERATURE,
    start_time=start_time,
    end_time=end_time
)

# 查询区域统计
region_stats = system.query_region_stats(
    lat_min=30, lat_max=40,
    lon_min=115, lon_max=125,
    variable=WeatherVariable.TEMPERATURE,
    start_time=start_time,
    end_time=end_time
)
```

### 集群监控

```python
from node_monitor import ClusterMonitor, MonitorAPI

# 获取集群状态
monitor = ClusterMonitor()
summary = monitor.get_cluster_summary()
print(f"活跃节点: {summary['active_nodes']}")
print(f"平均CPU: {summary['avg_cpu_usage']:.1f}%")

# 获取告警
alerts = monitor.get_alerts(limit=10)

# 健康检查
api = MonitorAPI()
health = api.get_system_health()
print(f"系统状态: {health['status']}")
```

## 文件结构

```
weather_simulation/
├── __init__.py                    # 包初始化
├── config.py                      # 配置管理
├── data_models.py                 # 数据模型定义
├── data_preprocessor.py           # 数据预处理模块
├── grid_simulator.py              # 网格模拟模块
├── task_scheduler.py              # 任务调度模块
├── result_fusion.py               # 结果融合模块
├── node_monitor.py                # 节点监控模块
├── timescaledb_storage.py         # 时序数据库存储
├── weather_simulation_system.py   # 系统主入口
├── test_system.py                 # 系统测试
├── requirements.txt               # 依赖清单
├── .env                           # 环境配置
└── README.md                      # 说明文档
```

## 数据模型

### 气象变量

- `temperature`: 温度 (°C)
- `humidity`: 相对湿度 (%)
- `pressure`: 气压 (hPa)
- `wind_speed`: 风速 (m/s)
- `wind_direction`: 风向 (°)
- `precipitation`: 降水量 (mm)

### 核心类

**ObservationData**: 站点观测数据
**GridDefinition**: 网格定义
**GridWeatherData**: 格点气象数据
**SimulationTask**: 模拟任务
**WorkerStatus**: 工作节点状态

## 性能优化建议

1. **网格分辨率**: 根据计算资源调整，更高分辨率需要更多内存和计算时间
2. **区域划分**: 建议区域数量与工作节点数匹配
3. **批处理大小**: 数据库批量插入建议 1000-10000 条/批
4. **Redis 配置**: 生产环境建议开启持久化和密码保护
5. **TimescaleDB**: 根据数据量配置合适的 chunk 时间间隔

## 故障排查

### Redis 连接失败
- 检查 Redis 服务是否启动
- 确认主机名和端口配置
- 检查防火墙设置

### TimescaleDB 初始化失败
- 确认 PostgreSQL 服务运行正常
- 检查数据库是否存在
- 验证用户权限和 TimescaleDB 扩展是否安装

### Dask 连接失败
- 确认 Dask 调度器已启动
- 检查网络连通性
- 查看调度器日志

## 许可证

MIT License
