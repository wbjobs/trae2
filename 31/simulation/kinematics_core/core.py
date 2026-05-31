"""
运动学核心 - 整合所有子模块，提供统一的运动学接口
"""

from typing import List, Dict, Optional, Tuple
import time
import threading
from queue import Queue, Empty

from .state import MachineState, AxisState, MotionState, AxisStatus
from .planner import PlannerFactory, LinearPlanner, CircularPlanner
from .interpolator import LinearInterpolator, CircularInterpolator, InterpolatorFactory
from .trajectory import Trajectory, TrajectorySegment, SegmentType
from simulation.machine_model import MachineModel


class KinematicsCore:
    def __init__(self, machine_model: MachineModel):
        self.machine_model = machine_model
        self.state = self._build_machine_state()
        self.linear_interpolator = LinearInterpolator()
        self.circular_interpolator = CircularInterpolator()
        self.trajectory = Trajectory()
        self._command_queue: Queue = Queue()
        self._current_segment: Optional[TrajectorySegment] = None
        self._segment_start_time: float = 0.0
        self._lock = threading.Lock()
        self._interpolation_cache: Dict[str, List[Dict[str, float]]] = {}
        self._max_cache_size = 1000

    def _build_machine_state(self) -> MachineState:
        axes = {}
        for name, axis in self.machine_model.axes.items():
            axes[name] = AxisState(
                name=name,
                position=axis.home_position,
                target_position=axis.home_position,
                max_velocity=axis.max_feed_rate,
                max_acceleration=axis.max_acceleration,
                min_limit=axis.min_limit,
                max_limit=axis.max_limit,
                home_position=axis.home_position
            )
        return MachineState(axes=axes)

    def reset(self) -> None:
        with self._lock:
            self.state.reset()
            self.trajectory = Trajectory()
            self._current_segment = None
            self._interpolation_cache.clear()
            while not self._command_queue.empty():
                try:
                    self._command_queue.get_nowait()
                except Empty:
                    break

    def check_limits(self, positions: Dict[str, float]) -> List[Tuple[str, str, float]]:
        violations = []
        for name, pos in positions.items():
            axis = self.state.get_axis(name)
            if axis:
                if pos < axis.min_limit:
                    violations.append((name, 'negative', axis.min_limit - pos))
                elif pos > axis.max_limit:
                    violations.append((name, 'positive', pos - axis.max_limit))
        return violations

    def plan_motion(self, command, current_position: Dict[str, float]) -> Optional[TrajectorySegment]:
        planner = PlannerFactory.get_planner(command)
        if not planner:
            return None

        feed_rate = command.feed_rate or self.state.feed_rate or 10000.0
        return planner.plan(current_position, command, feed_rate)

    def interpolate_segment(self, segment: TrajectorySegment) -> List[Dict[str, float]]:
        cache_key = (
            str(segment.start_position),
            str(segment.end_position),
            str(segment.segment_type.value),
            segment.feed_rate,
            str(segment.center_offsets),
            segment.plane
        )

        if cache_key in self._interpolation_cache:
            return self._interpolation_cache[cache_key]

        if segment.segment_type in (SegmentType.LINEAR, SegmentType.RAPID, SegmentType.FEED):
            points = self.linear_interpolator.interpolate(
                segment.start_position,
                segment.end_position,
                segment.feed_rate
            )
        elif segment.segment_type in (SegmentType.CIRCULAR_CW, SegmentType.CIRCULAR_CCW):
            clockwise = segment.segment_type == SegmentType.CIRCULAR_CW
            points = self.circular_interpolator.interpolate(
                segment.start_position,
                segment.end_position,
                segment.feed_rate,
                center_offsets=segment.center_offsets,
                plane=segment.plane,
                clockwise=clockwise
            )
        else:
            points = []

        if len(self._interpolation_cache) >= self._max_cache_size:
            oldest_key = next(iter(self._interpolation_cache))
            del self._interpolation_cache[oldest_key]

        self._interpolation_cache[cache_key] = points
        return points

    def update_position(self, position: Dict[str, float]) -> None:
        with self._lock:
            for name, pos in position.items():
                axis = self.state.get_axis(name)
                if axis:
                    axis.update(pos)
            self.machine_model.set_axis_positions(position)

    def get_position(self) -> Dict[str, float]:
        return self.state.get_position()

    def forward_kinematics(self) -> Dict[str, float]:
        return self.get_position()

    def inverse_kinematics(self, target: Dict[str, float]) -> Dict[str, float]:
        return target

    def start_trajectory_execution(self) -> None:
        self.trajectory.reset()
        self.state.start_cycle()
        self.state.motion_state = MotionState.FEED

    def stop_trajectory_execution(self) -> None:
        self.state.stop_cycle()
        self.state.motion_state = MotionState.IDLE

    def get_elapsed_time(self) -> float:
        return self.state.get_elapsed_time()

    def add_path_length(self, length: float, is_rapid: bool = False) -> None:
        self.state.path_length += length
        if is_rapid:
            self.state.rapid_path_length += length
        else:
            self.state.feed_path_length += length
