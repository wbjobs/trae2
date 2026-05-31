# 地质剖面应力场有限元模拟计算工具集

## 项目结构

```
e:\trae2\28\
├── main.py                          # 主程序入口
├── test_simulation.py               # 功能测试脚本
├── requirements.txt                 # Python依赖包
├── PROJECT_STRUCTURE.md             # 项目结构说明
├── simulation.log                   # 运行日志文件(自动生成)
│
├── config/
│   └── default_config.yaml          # 默认配置文件
│
├── src/
│   ├── __init__.py                  # 包初始化
│   ├── config_parser.py             # 参数配置解析模块
│   ├── mesh_generator.py            # 网格划分模块
│   ├── fem_solver.py                # 有限元计算内核
│   ├── post_processor.py            # 结果后处理与可视化模块
│   ├── report_generator.py          # 报告生成模块
│   └── distributed_computing.py     # 分布式计算与任务监控模块
│
└── results/                         # 结果输出目录(自动生成)
    ├── mesh_data.json               # 网格数据
    ├── fem_results.npz              # 有限元计算结果
    ├── stress_analysis_report.pdf   # 分析报告
    ├── visualizations/              # 可视化图表
    │   ├── mesh_model.png
    │   ├── displacement.png
    │   ├── stress_xx.png
    │   ├── stress_yy.png
    │   ├── stress_xy.png
    │   ├── von_mises.png
    │   ├── layer_stress_distribution.png
    │   └── stress_profile.png
    └── data/                        # 导出数据
        ├── nodal_data.csv
        ├── element_data.csv
        └── statistics.csv
```

## 模块说明

### 1. 参数配置解析模块 (config_parser.py)
- **功能**: 解析YAML格式的配置文件
- **核心类**: `ConfigParser`
- **主要功能**:
  - 加载和验证配置参数
  - 解析几何模型、材料参数、边界条件
  - 配置参数的持久化保存

### 2. 网格划分模块 (mesh_generator.py)
- **功能**: 自动生成有限元网格
- **核心类**: `MeshGenerator`, `MeshData`
- **主要功能**:
  - 支持MeshPy非结构化网格和结构化网格
  - 网格质量评估
  - 区域细化和网格光顺
  - 材料ID自动分配

### 3. 有限元计算内核 (fem_solver.py)
- **功能**: 线弹性力学有限元求解
- **核心类**: `ElasticityFEMSolver`, `FEMResult`
- **主要功能**:
  - 刚度矩阵组装
  - 载荷向量组装
  - 边界条件施加
  - 线性方程组求解
  - 应力应变计算

### 4. 结果后处理与可视化模块 (post_processor.py)
- **功能**: 计算结果分析和可视化
- **核心类**: `PostProcessor`, `StressStatistics`
- **主要功能**:
  - 应力统计分析
  - 分层应力统计
  - 应力云图生成
  - 数据导出(CSV格式)

### 5. 报告生成模块 (report_generator.py)
- **功能**: 生成专业分析报告
- **核心类**: `ReportGenerator`
- **主要功能**:
  - PDF格式报告生成
  - JSON格式报告生成
  - 包含计算摘要、模型信息、结果分析

### 6. 分布式计算与任务监控模块 (distributed_computing.py)
- **功能**: 支持分布式计算和任务监控
- **核心类**: `DistributedSolver`, `TaskMonitor`, `ClusterManager`
- **主要功能**:
  - 本地/分布式/集群计算模式
  - MPI并行计算支持
  - 任务进度监控
  - 系统资源监控
  - 对接后端监控服务

## 使用方法

### 基本使用

```bash
# 使用默认配置运行模拟
python main.py

# 指定配置文件和输出目录
python main.py --config config/default_config.yaml --output results

# 仅验证配置
python main.py --validate-only

# 禁用可视化和报告
python main.py --no-visual --no-report
```

### 编程接口

```python
from src.config_parser import ConfigParser
from src.mesh_generator import MeshGenerator
from src.fem_solver import ElasticityFEMSolver
from src.post_processor import PostProcessor

# 加载配置
config_parser = ConfigParser('config/default_config.yaml')
config = config_parser.load_config()

# 生成网格
mesh_generator = MeshGenerator(config)
mesh_data = mesh_generator.generate()

# 有限元求解
solver = ElasticityFEMSolver(config, mesh_data)
result = solver.solve()

# 后处理
post_processor = PostProcessor(config, mesh_data, result)
statistics = post_processor.compute_statistics()
post_processor.generate_visualizations('results')
```

## 依赖包

- numpy - 数值计算
- scipy - 科学计算和稀疏矩阵求解
- matplotlib - 可视化绘图
- pyyaml - YAML配置解析
- pandas - 数据处理
- seaborn - 统计可视化
- meshpy - 非结构化网格生成(可选)
- mpi4py - MPI并行计算(可选)
- reportlab - PDF报告生成(可选)
- psutil - 系统资源监控
- requests - HTTP请求(监控服务对接)

## 配置参数说明

配置文件采用YAML格式，包含以下主要部分：

- **project**: 项目基本信息
- **geometry**: 几何模型参数(剖面尺寸、岩层分布)
- **material**: 材料参数(杨氏模量、泊松比、密度)
- **boundary_conditions**: 边界条件(位移约束、应力载荷)
- **initial_conditions**: 初始条件(重力、侧压系数)
- **mesh**: 网格参数
- **solver**: 求解器参数
- **post_processing**: 后处理参数
- **computation**: 计算模式和监控配置
- **report**: 报告生成配置

## 运行环境

- Python 3.8+
- Windows/Linux/macOS
- 支持MPI集群环境(可选)
