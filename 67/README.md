# 大气湍流观测数据时空插值并行计算套件

## 项目简介

本套件是一个专业的大气湍流观测数据处理系统，提供完整的从原始观测数据解析到时空插值并行计算的全流程解决方案。支持多线程并行计算、任务排队调度、本地与集群跨环境任务提交，以及多种标准格式的结果导出。

## 主要功能

### 1. 原始观测数据解析 (`data_parser.py`)
- 支持多种数据格式：CSV、NetCDF、HDF5、TXT、DAT
- 自动识别数据格式并解析
- 数据验证与质量检查
- 异常值检测与数据清理
- 多文件批量解析

### 2. 多核并行计算内核 (`parallel_kernel.py`)
- 多种并行后端支持：
  - `concurrent`: Python 标准库 concurrent.futures
  - `joblib`: 基于 joblib 的并行计算
  - `dask`: 基于 Dask Distributed 的分布式计算
  - `mpi`: 基于 MPI 的高性能计算
- 自动数据分块与负载均衡
- 任务执行状态监控
- 结果聚合与错误处理

### 3. 时空插值模块 (`spatiotemporal_interpolator.py`)
- **空间插值方法**：
  - IDW (反距离加权)
  - Kriging (克里金插值)
  - Spline (样条插值)
  - Nearest Neighbor (最近邻)
- **时间插值方法**：
  - Linear (线性插值)
  - Cubic (三次插值)
  - Spline (样条插值)
- **数据降噪方法**：
  - 小波去噪 (Wavelet)
  - 高斯滤波 (Gaussian)
  - 萨维茨基-戈莱滤波 (Savitzky-Golay)
  - 卡尔曼滤波 (Kalman)
- 完整的时空联合插值

### 4. 任务调度模块 (`task_scheduler.py`)
- 本地任务队列与调度
- 集群任务提交 (支持 SLURM)
- SSH 远程执行
- 任务状态实时监控
- 任务取消与重试机制
- 任务结果自动收集

### 5. 结果导出模块 (`result_exporter.py`)
- 多种导出格式：
  - NetCDF (推荐)
  - CSV
  - HDF5
  - GeoTIFF (地理栅格)
  - JSON
  - Parquet
- 数据压缩支持
- 元数据保留
- 批量导出与变量分离导出

## 项目结构

```
turbulence_interp/
├── __init__.py
├── main.py                    # 主入口与命令行接口
├── config/
│   ├── __init__.py
│   ├── loader.py             # 配置加载器
│   └── config.yaml           # 默认配置文件
├── data_parser.py            # 数据解析模块
├── parallel_kernel.py        # 并行计算内核
├── spatiotemporal_interpolator.py  # 时空插值模块
├── task_scheduler.py         # 任务调度模块
└── result_exporter.py        # 结果导出模块

examples/
└── basic_usage.py            # 使用示例

requirements.txt
setup.py
README.md
```

## 快速开始

### 安装依赖

```bash
pip install -r requirements.txt
```

### 命令行使用

#### 1. 生成示例数据

```bash
python -m turbulence_interp.main --generate-sample -i sample_data.csv
```

#### 2. 运行完整处理流程

```bash
python -m turbulence_interp.main -i sample_data.csv -o ./output
```

#### 3. 指定参数运行

```bash
python -m turbulence_interp.main \
  -i sample_data.csv \
  -o ./output \
  -v turbulence_intensity wind_speed \
  -r 0.1 \
  --lon-range 105 115 \
  --lat-range 25 35
```

#### 4. 提交到集群运行

```bash
python -m turbulence_interp.main -i sample_data.csv -o ./output --cluster
```

### Python API 使用

#### 基本使用示例

```python
from turbulence_interp import (
    ObservationDataParser,
    SpatiotemporalInterpolator,
    ParallelProcessor,
    ResultExporter,
)
from turbulence_interp.main import generate_sample_data
import pandas as pd

# 1. 生成或加载数据
sample_file = "sample_data.csv"
generate_sample_data(sample_file, num_stations=20, num_times=24)

# 2. 解析数据
parser = ObservationDataParser()
dataset = parser.parse(sample_file)
df = dataset.to_dataframe()

# 3. 空间插值
interpolator = SpatiotemporalInterpolator(
    spatial_method="idw",
    noise_reduction="gaussian",
    grid_resolution=0.2,
)

result = interpolator.interpolate_spatial(
    df,
    "turbulence_intensity",
    lon_range=(105, 115),
    lat_range=(25, 35),
)

print(result.dataset)

# 4. 并行时空插值
target_times = pd.date_range(
    start=df["timestamp"].min(),
    end=df["timestamp"].max(),
    freq="1H"
)

with ParallelProcessor(max_workers=4) as processor:
    st_result = interpolator.interpolate_spatiotemporal(
        df,
        "turbulence_intensity",
        lon_range=(105, 115),
        lat_range=(25, 35),
        target_times=target_times,
        parallel_processor=processor,
    )

# 5. 导出结果
exporter = ResultExporter()
exporter.export(st_result.dataset, "output/turbulence_result", format="netcdf")
```

#### 完整流程示例

```python
from turbulence_interp.main import TurbulenceInterpolationPipeline
from turbulence_interp.config import load_config

config = load_config()

with TurbulenceInterpolationPipeline(config=config) as pipeline:
    output_paths = pipeline.run(
        input_path="sample_data.csv",
        output_dir="./output",
        variables=["turbulence_intensity", "wind_speed"],
        use_parallel=True,
    )
    
    for path in output_paths:
        print(f"输出文件: {path}")
```

#### 任务调度示例

```python
from turbulence_interp import TaskScheduler, Task

def my_computation(x, y):
    return x * y + x + y

scheduler = TaskScheduler()

# 提交多个任务
tasks = []
for i in range(10):
    task = Task(
        task_id=f"job_{i}",
        name=f"Computation_{i}",
        func=my_computation,
        args=(i, i + 1),
        priority=10 - i,
    )
    tasks.append(task)

task_ids = scheduler.submit_batch(tasks)

# 等待完成
completed = scheduler.wait_all(timeout=60.0)
print(f"完成 {len(completed)} 个任务")

# 获取结果
for task in scheduler.list_tasks():
    result = scheduler.get_result(task.task_id)
    print(f"{task.task_id}: {result.result if result else None}")

scheduler.shutdown()
```

#### 集群任务提交

```python
from turbulence_interp.main import TurbulenceInterpolationPipeline

with TurbulenceInterpolationPipeline() as pipeline:
    # 配置集群信息
    cluster_config = {
        "host": "hpc.example.com",
        "username": "your_username",
        "port": 22,
        "remote_workdir": "/home/your_username/jobs",
        "partition": "compute",
        "nodes": 2,
        "tasks_per_node": 16,
    }
    
    # 提交到集群
    task_id = pipeline.submit_to_cluster(
        input_path="sample_data.csv",
        output_dir="/remote/output/path",
        cluster_config=cluster_config,
        variables=["turbulence_intensity"],
    )
    
    print(f"集群任务ID: {task_id}")
```

## 配置说明

配置文件位于 `turbulence_interp/config/config.yaml`：

```yaml
system:
  max_workers: 8              # 最大工作线程数
  memory_limit_gb: 16         # 内存限制 (GB)
  log_level: INFO             # 日志级别

parallel:
  backend: concurrent         # 并行后端: concurrent/joblib/dask/mpi
  chunk_size: 1000            # 数据分块大小
  use_dask: false             # 是否使用 Dask

interpolation:
  spatial_method: kriging     # 空间插值方法
  temporal_method: linear     # 时间插值方法
  noise_reduction: wavelet    # 降噪方法
  grid_resolution: 0.1        # 网格分辨率 (度)
  search_radius: 5.0          # 搜索半径 (度)

cluster:
  host: "hpc.example.com"     # 集群主机地址
  port: 22                    # SSH 端口
  username: "user"            # 用户名
  remote_workdir: "/home/user/turbulence_jobs"  # 远程工作目录
  scheduler: "slurm"          # 集群调度器
  partition: "compute"        # 分区名称
  nodes: 1                    # 节点数
  tasks_per_node: 16          # 每节点任务数

output:
  format: netcdf              # 输出格式
  compression: true           # 是否压缩
  compression_level: 4        # 压缩级别
  include_metadata: true      # 是否包含元数据
```

## 支持的插值方法

### 空间插值方法

| 方法 | 说明 | 适用场景 |
|------|------|----------|
| `idw` | 反距离加权 | 数据分布均匀，计算快速 |
| `kriging` | 克里金插值 | 提供不确定性估计，统计最优 |
| `spline` | 样条插值 | 平滑表面，适合连续变化 |
| `nearest` | 最近邻 | 分类数据，保持原始值 |

### 时间插值方法

| 方法 | 说明 | 适用场景 |
|------|------|----------|
| `linear` | 线性插值 | 数据变化平缓，计算快速 |
| `cubic` | 三次插值 | 平滑过渡，精度较高 |
| `spline` | 样条插值 | 高度平滑，适合周期性数据 |

### 降噪方法

| 方法 | 说明 | 适用场景 |
|------|------|----------|
| `wavelet` | 小波去噪 | 非平稳信号，多分辨率分析 |
| `gaussian` | 高斯滤波 | 高斯噪声，平滑效果好 |
| `savgol` | 萨维茨基-戈莱滤波 | 保持峰值，平滑数据 |
| `kalman` | 卡尔曼滤波 | 动态系统，实时数据 |

## 支持的导出格式

| 格式 | 扩展名 | 特点 |
|------|--------|------|
| `netcdf` | `.nc` | 科学数据标准，支持压缩，元数据丰富 |
| `csv` | `.csv` | 通用格式，易于读取 |
| `hdf5` | `.h5` | 大型数据集，分层结构 |
| `geotiff` | `.tif` | 地理空间栅格，GIS 兼容 |
| `json` | `.json` | Web 友好，人类可读 |
| `parquet` | `.parquet` | 列式存储，高效压缩 |

## 性能优化建议

1. **并行计算**：
   - 对于大规模数据，使用 4-8 个工作线程通常能获得最佳性能
   - 数据量特别大时考虑使用 Dask 或 MPI 后端

2. **插值选择**：
   - IDW 最快，但精度一般
   - Kriging 精度最高但计算较慢，适合小区域
   - Spline 介于两者之间

3. **网格分辨率**：
   - 根据数据密度选择合适的分辨率
   - 过高的分辨率会显著增加计算时间

4. **内存管理**：
   - 处理时空立方体时注意内存使用
   - 可以按时间片分批处理

## 扩展开发

### 添加新的插值方法

```python
from turbulence_interp.spatiotemporal_interpolator import SpatialInterpolator
import numpy as np

class MyInterpolator(SpatialInterpolator):
    def interpolate(self, points, values, grid, **kwargs):
        # 实现你的插值算法
        result = np.zeros(grid.shape[:-1])
        # ... 插值逻辑 ...
        return result, None  # 返回插值结果和不确定性(可选)

# 注册新方法
SpatiotemporalInterpolator.SPATIAL_METHODS["my_method"] = MyInterpolator
```

### 添加新的导出格式

```python
from turbulence_interp.result_exporter import ResultExporter
from pathlib import Path

class MyExporter(ResultExporter):
    def _export_myformat(self, dataset, output_path, **kwargs):
        # 实现你的导出逻辑
        output_path = output_path.with_suffix(".myfmt")
        # ... 导出逻辑 ...
        return output_path

# 注册新格式
ResultExporter.SUPPORTED_FORMATS["myformat"] = ".myfmt"
```

## 测试

运行示例程序测试所有功能：

```bash
python examples/basic_usage.py
```

## 许可证

本项目仅供学术研究使用。

## 联系方式

如有问题或建议，请联系项目开发团队。
