"""
CFD Parallel Computing System
============================

基于 Python + Numba + Celery + InfluxDB 的流体力学离散数据并行计算调度系统。

模块结构:
- cfd_compute: Numba加速的计算核心模块
- preprocessing: 数据预处理模块（网格分片、数据清洗）
- scheduler: 任务调度模块（Celery任务、优先级调度）
- storage: 结果存储模块（InfluxDB时序数据存储）
- monitoring: 计算节点监控模块
- config: 配置模块
"""

__version__ = '1.0.0'
__author__ = 'CFD System Team'

from config import (
    settings,
    CFDConfig,
    GridConfig,
    SimulationConfig,
    ShardInfo,
    BoundaryCondition,
    SimulationType,
    PriorityLevel
)

from preprocessing import (
    GridSharder,
    DataCleaner,
    DataLoader,
    DataValidator
)

from cfd_compute import (
    NavierStokesSolver,
    solve_shard,
    compute_flow_metrics,
    FlowMetrics
)

from scheduler import (
    TaskScheduler,
    SimulationJob,
    TaskManager,
    task_manager,
    PriorityTaskQueue,
    TaskPriority,
    JobStatus
)

from storage import (
    InfluxDBStorage,
    ResultSerializer,
    ResultWriter,
    AsyncResultWriter
)

from monitoring import (
    NodeMonitor,
    TaskMonitor,
    AlertManager,
    SystemMetrics,
    NodeStatus,
    TaskInfo,
    Alert,
    AlertLevel
)

__all__ = [
    'settings',
    'CFDConfig',
    'GridConfig',
    'SimulationConfig',
    'ShardInfo',
    'BoundaryCondition',
    'SimulationType',
    'PriorityLevel',
    'GridSharder',
    'DataCleaner',
    'DataLoader',
    'DataValidator',
    'NavierStokesSolver',
    'solve_shard',
    'compute_flow_metrics',
    'FlowMetrics',
    'TaskScheduler',
    'SimulationJob',
    'TaskManager',
    'task_manager',
    'PriorityTaskQueue',
    'TaskPriority',
    'JobStatus',
    'InfluxDBStorage',
    'ResultSerializer',
    'ResultWriter',
    'AsyncResultWriter',
    'NodeMonitor',
    'TaskMonitor',
    'AlertManager',
    'SystemMetrics',
    'NodeStatus',
    'TaskInfo',
    'Alert',
    'AlertLevel'
]
