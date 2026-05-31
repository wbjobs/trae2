"""
运动规划器模块 - 将命令转换为轨迹段
"""

from typing import Dict, Optional
from abc import ABC, abstractmethod
from .trajectory import TrajectorySegment, SegmentType
from .state import MotionState


class MotionPlanner(ABC):
    @abstractmethod
    def plan(
        self,
        start_position: Dict[str, float],
        command,
        feed_rate: float
    ) -> Optional[TrajectorySegment]:
        pass


class LinearPlanner(MotionPlanner):
    def plan(
        self,
        start_position: Dict[str, float],
        command,
        feed_rate: float
    ) -> Optional[TrajectorySegment]:
        target = {}
        for axis in ('X', 'Y', 'Z'):
            if command.has_explicit_axis(axis):
                target[axis] = command.coordinates.get(axis, 0.0)
            else:
                target[axis] = start_position.get(axis, 0.0)

        if not any(command.has_explicit_axis(a) for a in ('X', 'Y', 'Z')):
            return None

        seg_type = SegmentType.RAPID if command.motion_type.value == 'G00' else SegmentType.FEED
        actual_feed = 10000.0 if seg_type == SegmentType.RAPID else (feed_rate or 10000.0)

        segment = TrajectorySegment(
            segment_id=0,
            segment_type=seg_type,
            start_position=dict(start_position),
            end_position=target,
            feed_rate=actual_feed,
            line_number=command.line_number
        )
        segment.calculate_metrics()
        return segment


class CircularPlanner(MotionPlanner):
    def plan(
        self,
        start_position: Dict[str, float],
        command,
        feed_rate: float
    ) -> Optional[TrajectorySegment]:
        target = {}
        for axis in ('X', 'Y', 'Z'):
            if command.has_explicit_axis(axis):
                target[axis] = command.coordinates.get(axis, 0.0)
            else:
                target[axis] = start_position.get(axis, 0.0)

        if not any(command.has_explicit_axis(a) for a in ('X', 'Y', 'Z')):
            return None

        plane_map = {'XY': 'XY', 'XZ': 'XZ', 'YZ': 'YZ'}
        from core.parser.models import Plane
        plane = plane_map.get(command.plane.value if hasattr(command.plane, 'value') else str(command.plane), 'XY')

        seg_type = (
            SegmentType.CIRCULAR_CW
            if command.motion_type.value == 'G02'
            else SegmentType.CIRCULAR_CCW
        )

        segment = TrajectorySegment(
            segment_id=0,
            segment_type=seg_type,
            start_position=dict(start_position),
            end_position=target,
            feed_rate=feed_rate or 10000.0,
            center_offsets=dict(command.center_offsets),
            radius=command.radius,
            plane=plane,
            line_number=command.line_number
        )
        segment.calculate_metrics()
        return segment


class PlannerFactory:
    @staticmethod
    def get_planner(command) -> Optional[MotionPlanner]:
        mt = command.motion_type.value if hasattr(command.motion_type, 'value') else str(command.motion_type)
        if mt in ('G00', 'G01'):
            return LinearPlanner()
        elif mt in ('G02', 'G03'):
            return CircularPlanner()
        return None
