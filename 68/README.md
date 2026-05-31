# 尾矿库坝体渗流场有限元分析计算工具集

## 项目简介

本项目是一个专业的尾矿库坝体渗流场有限元分析计算工具集，提供完整的工程参数解析、自动网格剖分、有限元计算、结果可视化及分析报告生成功能。

## 功能特性

- **工程参数解析**：支持坝体岩土参数录入、边界条件配置
- **自动网格剖分**：基于坝体几何形状自动生成有限元网格
- **有限元计算内核**：稳定渗流场数值模拟，支持并行计算
- **结果后处理**：渗流压力、水头、渗流速度等结果渲染
- **分析报告生成**：自动生成专业的PDF分析报告
- **分布式计算支持**：支持本地单机与分布式集群运行
- **任务监控服务**：实时对接后端任务监控服务

## 安装

```bash
pip install -r requirements.txt
python setup.py install
```

## 使用

```bash
python -m src.main --config config/example_config.yaml
```

## 项目结构

```
seepage_fem/
├── src/
│   ├── params_parser.py      # 工程参数解析
│   ├── mesh_generator.py     # 坝体网格剖分
│   ├── fem_solver.py         # 有限元计算内核
│   ├── post_processor.py     # 结果后处理
│   ├── report_generator.py   # 分析报告生成
│   ├── task_monitor.py       # 任务监控服务
│   └── main.py               # 主程序入口
├── config/                   # 配置文件目录
├── output/                   # 输出结果目录
└── tests/                    # 测试用例
```
