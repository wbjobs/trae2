"""
运动学核心模块 - 重构版
包含更稳定的插补算法、更精细的错误处理和更高的性能
"""

from .state import MachineState, AxisState, MotionState
from .planner import MotionPlanner, LinearPlanner, CircularPlanner
from .trajectory import Trajectory, TrajectorySegment, SegmentType
from .interpolator import LinearInterpolator, CircularInterpolator, InterpolatorFactory
from .core import KinematicsCore

__all__ = [
    'MachineState', 'AxisState', 'MotionState',
    'MotionPlanner', 'LinearPlanner', 'CircularPlanner',
    'Trajectory', 'TrajectorySegment', 'SegmentType',
    'LinearInterpolator', 'CircularInterpolator', 'InterpolatorFactory',
    'KinematicsCore',
]
