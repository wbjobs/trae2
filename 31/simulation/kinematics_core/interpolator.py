"""
插补器模块 - 提供线性和圆弧插补
"""

import math
from typing import List, Dict, Tuple, Optional
from abc import ABC, abstractmethod


class Interpolator(ABC):
    @abstractmethod
    def interpolate(
        self,
        start: Dict[str, float],
        end: Dict[str, float],
        feed_rate: float,
        max_deviation: float = 0.001
    ) -> List[Dict[str, float]]:
        pass


class LinearInterpolator(Interpolator):
    def interpolate(
        self,
        start: Dict[str, float],
        end: Dict[str, float],
        feed_rate: float,
        max_deviation: float = 0.001
    ) -> List[Dict[str, float]]:
        axes = list(set(start.keys()) & set(end.keys()))
        if not axes:
            return []

        distances = {a: end[a] - start[a] for a in axes}
        total_distance = math.sqrt(sum(d ** 2 for d in distances.values()))

        if total_distance < 1e-10:
            return []

        if feed_rate <= 0:
            feed_rate = 10000.0

        max_segment_length = max(1.0, max_deviation * 1000)
        num_steps = max(1, int(math.ceil(total_distance / max_segment_length)))
        num_steps = min(num_steps, 100)

        points = []
        for i in range(1, num_steps + 1):
            ratio = i / num_steps
            point = {}
            for a in axes:
                point[a] = start[a] + distances[a] * ratio
            points.append(point)

        return points


class CircularInterpolator(Interpolator):
    def interpolate(
        self,
        start: Dict[str, float],
        end: Dict[str, float],
        feed_rate: float,
        max_deviation: float = 0.001,
        center_offsets: Optional[Dict[str, float]] = None,
        plane: str = 'XY',
        clockwise: bool = True
    ) -> List[Dict[str, float]]:
        center_offsets = center_offsets or {}

        if plane == 'XY':
            ax1, ax2, ax3 = 'X', 'Y', 'Z'
            off1, off2 = center_offsets.get('I', 0), center_offsets.get('J', 0)
        elif plane == 'XZ':
            ax1, ax2, ax3 = 'X', 'Z', 'Y'
            off1, off2 = center_offsets.get('I', 0), center_offsets.get('K', 0)
        else:
            ax1, ax2, ax3 = 'Y', 'Z', 'X'
            off1, off2 = center_offsets.get('J', 0), center_offsets.get('K', 0)

        s1 = start.get(ax1, 0.0)
        s2 = start.get(ax2, 0.0)
        e1 = end.get(ax1, 0.0)
        e2 = end.get(ax2, 0.0)
        s3 = start.get(ax3, 0.0)
        e3 = end.get(ax3, 0.0)

        center_1 = s1 + off1
        center_2 = s2 + off2

        radius = math.sqrt(off1 ** 2 + off2 ** 2)
        if radius < 1e-10:
            return []

        start_angle = math.atan2(s2 - center_2, s1 - center_1)
        end_angle = math.atan2(e2 - center_2, e1 - center_1)

        arc_length = self._calculate_arc_length(start_angle, end_angle, clockwise)
        arc_distance = abs(arc_length) * radius

        linear_distance = e3 - s3
        total_distance = math.sqrt(arc_distance ** 2 + linear_distance ** 2)

        if total_distance < 1e-10:
            return []

        if feed_rate <= 0:
            feed_rate = 10000.0

        max_chord_error = max_deviation
        max_angle_step = 2.0 * math.acos(radius / (radius + max_chord_error))
        num_steps = max(1, int(math.ceil(abs(arc_length) / max_angle_step)))
        num_steps = min(num_steps, 100)

        points = []
        for i in range(1, num_steps + 1):
            ratio = i / num_steps
            angle = start_angle + arc_length * ratio

            point = dict(start)
            point[ax1] = center_1 + radius * math.cos(angle)
            point[ax2] = center_2 + radius * math.sin(angle)
            point[ax3] = s3 + linear_distance * ratio

            points.append(point)

        return points

    @staticmethod
    def _calculate_arc_length(start_angle: float, end_angle: float, clockwise: bool) -> float:
        two_pi = 2.0 * math.pi
        if clockwise:
            delta = end_angle - start_angle
            if delta >= 0:
                delta -= two_pi
            return delta
        else:
            delta = end_angle - start_angle
            if delta <= 0:
                delta += two_pi
            return delta


class InterpolatorFactory:
    @staticmethod
    def get_linear() -> LinearInterpolator:
        return LinearInterpolator()

    @staticmethod
    def get_circular() -> CircularInterpolator:
        return CircularInterpolator()
