__version__ = "1.0.0"
__author__ = "CFD-DEM Team"

__all__ = [
    "SimulationConfig",
    "TaskScheduler",
    "CFDDEMSolver",
    "ResultExporter",
]


def __getattr__(name):
    if name == "SimulationConfig":
        from .config import SimulationConfig
        return SimulationConfig
    elif name == "TaskScheduler":
        from .scheduler import TaskScheduler
        return TaskScheduler
    elif name == "CFDDEMSolver":
        from .kernel import CFDDEMSolver
        return CFDDEMSolver
    elif name == "ResultExporter":
        from .output import ResultExporter
        return ResultExporter
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
