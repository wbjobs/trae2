import math
from typing import List, Tuple, Dict, Optional
from .machine_model import MachineModel, Axis


class KinematicsEngine:
    def __init__(self, machine_model: MachineModel):
        self.machine = machine_model

    def forward_kinematics(self) -> Dict[str, float]:
        result = {}
        for axis_name, axis in self.machine.axes.items():
            result[axis_name] = axis.current_position
        return result

    def inverse_kinematics(self, target_position: Dict[str, float]) -> Dict[str, float]:
        result = {}
        for axis_name, pos in target_position.items():
            if axis_name in self.machine.axes:
                result[axis_name] = pos
        return result

    def check_axis_limits(self, positions: Dict[str, float]) -> List[Tuple[str, str, float]]:
        violations = []
        for axis_name, pos in positions.items():
            axis = self.machine.get_axis(axis_name)
            if axis:
                status, distance = axis.distance_to_limit(pos)
                if status != 'ok':
                    violations.append((axis_name, status, distance))
        return violations

    def interpolate_linear(
        self,
        start: Dict[str, float],
        end: Dict[str, float],
        feed_rate: float,
        time_step: float,
        max_path_error: float = 0.001
    ) -> List[Dict[str, float]]:
        axes = [a for a in ('X', 'Y', 'Z') if a in start and a in end]
        if not axes:
            return [end]

        distances = {a: end[a] - start[a] for a in axes}
        total_distance = math.sqrt(sum(d ** 2 for d in distances.values()))

        if total_distance < 1e-10:
            return [end]

        if feed_rate <= 0:
            feed_rate = 10000.0

        total_time = total_distance / feed_rate
        num_steps = max(1, int(math.ceil(total_time / time_step)))

        path_points = []
        for i in range(1, num_steps + 1):
            t = i / num_steps
            point = {}
            for a in axes:
                point[a] = start[a] + distances[a] * t
            path_points.append(point)

        return path_points

    def interpolate_circular(
        self,
        start: Dict[str, float],
        end: Dict[str, float],
        center_offsets: Dict[str, float],
        plane: str = 'XY',
        clockwise: bool = True,
        feed_rate: float = 10000.0,
        time_step: float = 0.001,
        max_path_error: float = 0.001
    ) -> List[Dict[str, float]]:
        if plane == 'XY':
            primary_axis, secondary_axis, linear_axis = 'X', 'Y', 'Z'
        elif plane == 'XZ':
            primary_axis, secondary_axis, linear_axis = 'X', 'Z', 'Y'
        elif plane == 'YZ':
            primary_axis, secondary_axis, linear_axis = 'Y', 'Z', 'X'
        else:
            return [end]

        I_val = center_offsets.get('I', 0.0)
        J_val = center_offsets.get('J', 0.0)
        K_val = center_offsets.get('K', 0.0)

        if plane == 'XY':
            center_offset_1, center_offset_2 = I_val, J_val
        elif plane == 'XZ':
            center_offset_1, center_offset_2 = I_val, K_val
        else:
            center_offset_1, center_offset_2 = J_val, K_val

        start_1 = start.get(primary_axis, 0.0)
        start_2 = start.get(secondary_axis, 0.0)
        end_1 = end.get(primary_axis, 0.0)
        end_2 = end.get(secondary_axis, 0.0)

        center_1 = start_1 + center_offset_1
        center_2 = start_2 + center_offset_2

        radius = math.sqrt(center_offset_1 ** 2 + center_offset_2 ** 2)
        if radius < 1e-10:
            return [end]

        start_angle = math.atan2(start_2 - center_2, start_1 - center_1)
        end_angle = math.atan2(end_2 - center_2, end_1 - center_1)

        arc_length = self._calculate_arc_length(start_angle, end_angle, clockwise)
        arc_distance = abs(arc_length) * radius

        linear_start = start.get(linear_axis, 0.0)
        linear_end = end.get(linear_axis, 0.0)
        linear_distance = linear_end - linear_start
        total_distance = math.sqrt(arc_distance ** 2 + linear_distance ** 2)

        if total_distance < 1e-10:
            return [end]

        if feed_rate <= 0:
            feed_rate = 10000.0

        total_time = total_distance / feed_rate
        num_steps = max(1, int(math.ceil(total_time / time_step)))

        path_points = []
        for i in range(1, num_steps + 1):
            t = i / num_steps
            angle = start_angle + arc_length * t

            point = dict(start)
            point[primary_axis] = center_1 + radius * math.cos(angle)
            point[secondary_axis] = center_2 + radius * math.sin(angle)
            point[linear_axis] = linear_start + linear_distance * t

            path_points.append(point)

        return path_points

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
