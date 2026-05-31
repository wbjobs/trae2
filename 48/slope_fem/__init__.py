"""
岩土工程边坡稳定性有限元分析计算工具集
========================================

模块组成:
- parameters: 工程参数解析与验证
- mesh: 边坡网格剖分
- fem_kernel: 有限元计算内核
- post_process: 结果后处理与可视化
- report: 分析报告生成
- distributed: 分布式计算支持
- monitor: 任务监控服务对接
- scenarios: 多工况管理
- snapshot: 状态快照保存
- data_models: 标准化数据模型
- comparison: 工况对比分析
"""

__version__ = "2.0.0"
__author__ = "Geotechnical Engineering Team"

from .parameters import SlopeParameters, ParameterValidator
from .mesh import SlopeMesh, MeshGenerator, OptimizedMeshGenerator, IncrementalMeshModifier
from .fem_kernel import FEMSolver, StrengthReductionAnalysis
from .post_process import ResultsProcessor, Visualizer
from .report import ReportGenerator
from .scenarios import ScenarioGenerator, ScenarioRunner, ParameterType, ParameterVariation, Scenario, ScenarioResult
from .snapshot import SnapshotManager, IncrementalSnapshot, CheckpointManager, SnapshotState
from .data_models import AnalysisResult, ResultDataBuilder, MeshInfo, MaterialInfo, FEMResultData, ConvergenceInfo, StrengthReductionResult, FailureSurfaceInfo, AnalysisSummary, AnalysisStatus
from .comparison import ScenarioComparison, ComparisonReportGenerator

__all__ = [
    "SlopeParameters",
    "ParameterValidator",
    "SlopeMesh",
    "MeshGenerator",
    "OptimizedMeshGenerator",
    "IncrementalMeshModifier",
    "FEMSolver",
    "StrengthReductionAnalysis",
    "ResultsProcessor",
    "Visualizer",
    "ReportGenerator",
    "ScenarioGenerator",
    "ScenarioRunner",
    "ParameterType",
    "ParameterVariation",
    "Scenario",
    "ScenarioResult",
    "SnapshotManager",
    "IncrementalSnapshot",
    "CheckpointManager",
    "SnapshotState",
    "AnalysisResult",
    "ResultDataBuilder",
    "MeshInfo",
    "MaterialInfo",
    "FEMResultData",
    "ConvergenceInfo",
    "StrengthReductionResult",
    "FailureSurfaceInfo",
    "AnalysisSummary",
    "AnalysisStatus",
    "ScenarioComparison",
    "ComparisonReportGenerator",
]
