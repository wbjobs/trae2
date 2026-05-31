"""
轨迹模块 - 定义运动轨迹和段
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional
import math


class SegmentType(Enum):
    RAPID = 'rapid'
    LINEAR = 'linear'
    FEED = 'feed'
    CIRCULAR_CW = 'circular_cw'
    CIRCULAR_CCW = 'circular_ccw'
    DWELL = 'dwell'


@dataclass
class TrajectorySegment:
    segment_id: int
    segment_type: SegmentType
    start_position: Dict[str, float]
    end_position: Dict[str, float]
    feed_rate: float
    duration: float = 0.0
    distance: float = 0.0
    center_offsets: Dict[str, float] = field(default_factory=dict)
    radius: Optional[float] = None
    plane: str = 'XY'
    start_time: float = 0.0
    line_number: int = 0
    command_index: int = 0
    _processed: bool = False

    def calculate_metrics(self) -> None:
        if self.segment_type in (SegmentType.LINEAR, SegmentType.CIRCULAR_CW, SegmentType.CIRCULAR_CCW):
            self.distance = self._calculate_distance()
            if self.feed_rate > 0:
                self.duration = self.distance / self.feed_rate * 60.0

    def _calculate_distance(self) -> float:
        axes = set(self.start_position.keys()) & set(self.end_position.keys())
        return math.sqrt(
            sum((self.end_position[a] - self.start_position[a]) ** 2 for a in axes)
        )

    def get_position_at(self, t: float) -> Dict[str, float]:
        if self.duration <= 0 or t <= 0:
            return dict(self.start_position)
        if t >= self.duration:
            return dict(self.end_position)

        ratio = t / self.duration
        return {
            axis: self.start_position[axis] + (self.end_position[axis] - self.start_position[axis]) * ratio
            for axis in self.start_position
        }


@dataclass
class Trajectory:
    segments: List[TrajectorySegment] = field(default_factory=list)
    total_duration: float = 0.0
    total_distance: float = 0.0
    current_segment_index: int = 0

    def add_segment(self, segment: TrajectorySegment) -> None:
        segment.calculate_metrics()
        segment.start_time = self.total_duration
        self.segments.append(segment)
        self.total_duration += segment.duration
        self.total_distance += segment.distance

    def get_segment_at(self, global_time: float) -> Optional[TrajectorySegment]:
        if global_time >= self.total_duration:
            return self.segments[-1] if self.segments else None

        for i, segment in enumerate(self.segments):
            if segment.start_time <= global_time < segment.start_time + segment.duration:
                return segment
        return None

    def get_position_at(self, global_time: float) -> Dict[str, float]:
        segment = self.get_segment_at(global_time)
        if not segment:
            return self.segments[-1].end_position if self.segments else {}

        local_time = global_time - segment.start_time
        return segment.get_position_at(local_time)

    def reset(self) -> None:
        self.current_segment_index = 0
        for seg in self.segments:
            seg._processed = False
