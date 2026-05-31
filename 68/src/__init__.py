from .params_parser import ParamsParser
from .mesh_generator import MeshGenerator, MeshData
from .fem_solver import FEMSolver, FEMResult, SeepageResultBundle
from .post_processor import PostProcessor
from .report_generator import ReportGenerator
from .task_monitor import TaskMonitor
from .multi_scenario import MultiScenarioRunner, ScenarioConfig, ScenarioResult

__version__ = "2.0.0"
__all__ = [
    "ParamsParser",
    "MeshGenerator",
    "MeshData",
    "FEMSolver",
    "FEMResult",
    "SeepageResultBundle",
    "PostProcessor",
    "ReportGenerator",
    "TaskMonitor",
    "MultiScenarioRunner",
    "ScenarioConfig",
    "ScenarioResult",
]
