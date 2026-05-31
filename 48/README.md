# 岩土工程边坡稳定性有限元分析计算工具集

## 项目简介

本项目是一个专业的岩土工程边坡稳定性有限元分析工具集，采用Python开发，支持从参数输入、网格剖分、数值计算到结果可视化和报告生成的全流程分析。

## 功能特性

- **工程参数解析**：支持JSON/YAML格式的参数录入，包含边坡几何、土层参数、边界条件等
- **自动网格剖分**：支持Delaunay三角剖分和结构化网格，自动边界加密和质量优化
- **稳定性数值模拟**：基于有限元法的强度折减分析，支持弹塑性本构模型
- **结果后处理**：位移场、应力场、应变场的云图渲染和矢量可视化
- **专业分析报告**：自动生成HTML和JSON格式的分析报告，包含图表和结论
- **分布式计算**：支持MPI并行计算，可在本地单机和分布式集群上运行
- **任务监控**：对接后端任务监控服务，实时上报计算进度和状态

## 系统架构

```
slope_fem/
├── parameters.py      # 工程参数解析与验证
├── mesh.py            # 边坡网格剖分
├── fem_kernel.py      # 有限元计算内核
├── post_process.py    # 结果后处理与可视化
├── report.py          # 分析报告生成
├── distributed.py     # 分布式计算支持
└── monitor.py         # 任务监控服务对接
```

## 安装依赖

```bash
pip install -r requirements.txt
```

### 可选依赖

- **分布式计算**：`mpi4py`
- **高级可视化**：`pyvista`, `meshpy`
- **系统资源监控**：`psutil`
- **消息队列**：`pika`

## 快速开始

### 1. 准备参数配置文件

参考 `examples/example_params.json` 配置边坡参数：

```json
{
    "project_info": {
        "name": "某高速公路边坡稳定性分析",
        "project_id": "SLP-2024-001"
    },
    "slope_geometry": {
        "height": 15.0,
        "angle": 45.0,
        "crest_width": 10.0,
        "toe_width": 5.0,
        "total_width": 30.0,
        "total_height": 21.0
    },
    "soil_layers": [
        {
            "name": "表层填土",
            "thickness": 3.0,
            "density": 1850.0,
            "young_modulus": 15e6,
            "poisson_ratio": 0.35,
            "cohesion": 15e3,
            "friction_angle": 28.0
        }
    ]
}
```

### 2. 运行分析

#### 本地运行

```bash
python main.py --config examples/example_params.json --output ./results
```

#### 分布式运行

```bash
mpiexec -n 4 python main.py --config examples/example_params.json --mode distributed
```

### 3. 查看结果

分析完成后，在输出目录中可查看：

- **位移场云图**：`displacement_magnitude.png`, `displacement_x.png`, `displacement_y.png`
- **应力场云图**：`sigma_x.png`, `sigma_y.png`, `shear_stress.png`, `principal_stresses.png`
- **收敛曲线**：`convergence_curve.png`
- **滑动面分析**：`failure_surface.png`
- **变形网格**：`deformed_mesh.png`
- **分析报告**：`slope_analysis_report.html`, `slope_analysis_report.json`
- **VTK结果**：`results.vtk`（可使用ParaView查看）

## 使用示例

### 基本使用

```python
from slope_fem import (
    SlopeParameters,
    MeshGenerator,
    FEMSolver,
    StrengthReductionAnalysis,
    ResultsProcessor,
    Visualizer,
    ReportGenerator
)

# 加载参数
params = SlopeParameters.from_json("examples/example_params.json")
params.validate()

# 生成网格
mesh_generator = MeshGenerator(params)
mesh = mesh_generator.generate("delaunay")

# 有限元计算
solver = FEMSolver(mesh, params)
sr_analysis = StrengthReductionAnalysis(solver, params)
sr_result = sr_analysis.run()

# 结果后处理
processor = ResultsProcessor(mesh, params)
processed = processor.process_results(solver.results[-1])

# 可视化
visualizer = Visualizer(mesh, params)
visualizer.generate_all_plots(processed, sr_result)

# 生成报告
report = ReportGenerator()
report_data = report.prepare_report_data(params, mesh, solver.results[-1], processed, sr_result)
report.generate_html_report(report_data)
```

### 启用监控

```python
from slope_fem.monitor import MonitorClient, AnalysisMonitor

# 创建监控客户端
monitor = MonitorClient(
    server_url="http://localhost:8080/api",
    enabled=True
)

# 启动分析监控
analysis_monitor = AnalysisMonitor(monitor)
analysis_monitor.start_analysis("边坡稳定性分析")

# 更新进度
analysis_monitor.update_progress(50.0, "强度折减分析", "当前折减系数 1.5")

# 完成分析
analysis_monitor.complete_analysis({"factor_of_safety": 1.35})
```

## 模块说明

### parameters.py - 参数解析模块

- `SlopeParameters`：边坡分析参数类，支持JSON/YAML加载
- `ParameterValidator`：参数验证器，检查参数合理性
- 支持的参数类型：项目信息、边坡几何、土层参数、边界条件、分析设置

### mesh.py - 网格剖分模块

- `SlopeMesh`：网格数据结构，包含节点、单元、边界信息
- `MeshGenerator`：网格生成器，支持Delaunay三角剖分和结构化网格
- 功能：边界节点生成、内部节点生成、单元质量优化、边界加密

### fem_kernel.py - 有限元计算内核

- `ElasticitySolver`：线弹性求解器，单元刚度矩阵计算、整体刚度矩阵组装
- `NonlinearSolver`：非线性求解器，牛顿-拉夫逊迭代法
- `FEMSolver`：有限元求解器主类，线性/非线性求解接口
- `StrengthReductionAnalysis`：强度折减分析，安全系数计算、滑动面识别

### post_process.py - 结果后处理模块

- `ResultsProcessor`：结果处理器，应力应变计算、统计分析
- `Visualizer`：可视化器，云图、矢量图、变形网格、收敛曲线绘制
- 支持导出VTK格式，可在ParaView中进行高级后处理

### report.py - 报告生成模块

- `ReportGenerator`：报告生成器，支持HTML和JSON格式
- 内置专业报告模板，包含参数、结果、结论
- 自动评估边坡稳定性，给出工程建议

### distributed.py - 分布式计算模块

- `DistributedSolver`：分布式求解器，支持MPI并行计算
- `TaskScheduler`：任务调度器，任务分配和结果收集
- 支持本地、分布式、集群三种运行模式

### monitor.py - 任务监控模块

- `MonitorClient`：监控客户端，对接后端监控服务
- `AnalysisMonitor`：分析过程监控，进度实时上报
- `ResourceMonitor`：系统资源监控，CPU/内存/磁盘使用情况
- `MessageQueueMonitor`：消息队列支持，任务异步处理

## 技术指标

- **单元类型**：三节点三角形单元（CST）、四节点四边形单元
- **本构模型**：线弹性、摩尔-库仑弹塑性
- **求解方法**：直接法（spsolve）、牛顿-拉夫逊迭代
- **稳定性分析**：强度折减法（Phi-c折减）
- **并行效率**：理想情况下接近线性加速比

## 规范依据

- 《建筑边坡工程技术规范》GB 50330-2013
- 《岩土工程勘察规范》GB 50021-2001（2009年版）
- 《建筑地基基础设计规范》GB 50007-2011

## 注意事项

1. 本工具仅用于辅助设计，实际工程需结合工程师经验判断
2. 输入参数应基于实际勘察数据，确保分析结果的可靠性
3. 复杂边坡建议结合其他分析方法（如极限平衡法）进行对比验证
4. 大模型计算建议使用分布式模式以提高计算效率

## License

MIT License
