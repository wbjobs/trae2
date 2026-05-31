import math
from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Optional
from enum import Enum
from .models import BoundingBox, Cylinder, CollisionVolume
from simulation.machine_model import MachineModel


class CollisionType(Enum):
    TOOL_HOLDER_TO_WORKTABLE = 'tool_holder_to_worktable'
    TOOL_TO_WORKPIECE = 'tool_to_workpiece'
    SPINDLE_TO_FIXTURE = 'spindle_to_fixture'
    SPINDLE_TO_WORKTABLE = 'spindle_to_worktable'
    TOOL_HOLDER_TO_FIXTURE = 'tool_holder_to_fixture'
    AXIS_LIMIT = 'axis_limit'


@dataclass
class CollisionObject:
    name: str
    volume: CollisionVolume = field(default_factory=CollisionVolume)
    position: Dict[str, float] = field(default_factory=dict)

    def update_position(self, position: Dict[str, float]):
        self.position.update(position)
        self._update_volume_positions()

    def _update_volume_positions(self):
        pass


@dataclass
class CollisionResult:
    is_collision: bool = False
    collision_type: Optional[CollisionType] = None
    distance: float = 0.0
    position: Tuple[float, float, float] = (0, 0, 0)
    object_a: str = ''
    object_b: str = ''
    timestamp: float = 0.0
    command_index: int = 0
    details: str = ''


class CollisionDetector:
    def __init__(self, machine_model: MachineModel):
        self.machine = machine_model
        self._collision_objects: Dict[str, CollisionObject] = {}
        self._min_warning_distance: float = 5.0
        self._min_collision_distance: float = 0.1
        self._initialize_objects()

    def _initialize_objects(self):
        spindle = CollisionObject(name='spindle')
        spindle_pos = self.machine.get_spindle_position()
        spindle.volume.add_cylinder(
            center=(spindle_pos[0], spindle_pos[1], spindle_pos[2]),
            radius=self.machine.spindle_radius,
            length=self.machine.spindle_length,
            axis='Z'
        )
        self._collision_objects['spindle'] = spindle

        tool_holder = CollisionObject(name='tool_holder')
        th_pos = self.machine.get_tool_holder_position()
        tool_holder.volume.add_cylinder(
            center=(th_pos[0], th_pos[1], th_pos[2]),
            radius=self.machine.spindle_radius * 0.6,
            length=self.machine.tool_holder_length,
            axis='Z'
        )
        self._collision_objects['tool_holder'] = tool_holder

        tool_tip = CollisionObject(name='tool_tip')
        tt_pos = self.machine.get_tool_center_position()
        tool_tip.volume.add_cylinder(
            center=(tt_pos[0], tt_pos[1], tt_pos[2]),
            radius=5.0,
            length=self.machine.tool_length,
            axis='Z'
        )
        self._collision_objects['tool_tip'] = tool_tip

        worktable = CollisionObject(name='worktable')
        wt_pos = self.machine.table_position
        wt_size = self.machine.table_size
        worktable.volume.add_box(
            center=(wt_pos[0] + wt_size[0] / 2, wt_pos[1] + wt_size[1] / 2,
                     wt_pos[2] + wt_size[2] / 2),
            size=wt_size
        )
        self._collision_objects['worktable'] = worktable

        fixture = CollisionObject(name='fixture')
        fixture.volume.add_box(
            center=(wt_pos[0] + wt_size[0] / 2, wt_pos[1] + wt_size[1] / 2,
                     wt_pos[2] + wt_size[2] + 40),
            size=(wt_size[0] * 0.6, wt_size[1] * 0.4, 80)
        )
        self._collision_objects['fixture'] = fixture

        workpiece = CollisionObject(name='workpiece')
        workpiece.volume.add_box(
            center=(wt_pos[0] + wt_size[0] / 2, wt_pos[1] + wt_size[1] / 2,
                     wt_pos[2] + wt_size[2] + 40 + 40),
            size=(200, 150, 80)
        )
        self._collision_objects['workpiece'] = workpiece

    def set_warning_distance(self, distance: float):
        self._min_warning_distance = max(0.0, distance)

    def set_collision_distance(self, distance: float):
        self._min_collision_distance = max(0.0, distance)

    def update_positions(self, position: Dict[str, float]):
        self.machine.set_axis_positions(position)

        spindle_pos = self.machine.get_spindle_position()
        if 'spindle' in self._collision_objects:
            self._collision_objects['spindle'].volume.shapes[0].center = spindle_pos

        th_pos = self.machine.get_tool_holder_position()
        if 'tool_holder' in self._collision_objects:
            self._collision_objects['tool_holder'].volume.shapes[0].center = th_pos

        tt_pos = self.machine.get_tool_center_position()
        if 'tool_tip' in self._collision_objects:
            self._collision_objects['tool_tip'].volume.shapes[0].center = tt_pos

    def check_collisions(self, position: Dict[str, float]) -> List[CollisionResult]:
        self.update_positions(position)
        results = []

        spindle = self._collision_objects.get('spindle')
        tool_holder = self._collision_objects.get('tool_holder')
        tool_tip = self._collision_objects.get('tool_tip')
        worktable = self._collision_objects.get('worktable')
        fixture = self._collision_objects.get('fixture')
        workpiece = self._collision_objects.get('workpiece')

        if spindle and worktable:
            dist = self._distance_between_cylinder_and_box(
                spindle.volume.shapes[0], worktable.volume.shapes[0]
            )
            if dist < self._min_collision_distance:
                results.append(CollisionResult(
                    is_collision=True,
                    collision_type=CollisionType.SPINDLE_TO_WORKTABLE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='spindle',
                    object_b='worktable',
                    details=f'Spindle collides with worktable, distance: {dist:.4f}mm'
                ))
            elif dist < self._min_warning_distance:
                results.append(CollisionResult(
                    is_collision=False,
                    collision_type=CollisionType.SPINDLE_TO_WORKTABLE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='spindle',
                    object_b='worktable',
                    details=f'Spindle near worktable, distance: {dist:.4f}mm'
                ))

        if tool_holder and fixture:
            dist = self._distance_between_cylinder_and_box(
                tool_holder.volume.shapes[0], fixture.volume.shapes[0]
            )
            if dist < self._min_collision_distance:
                results.append(CollisionResult(
                    is_collision=True,
                    collision_type=CollisionType.TOOL_HOLDER_TO_FIXTURE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='tool_holder',
                    object_b='fixture',
                    details=f'Tool holder collides with fixture, distance: {dist:.4f}mm'
                ))
            elif dist < self._min_warning_distance:
                results.append(CollisionResult(
                    is_collision=False,
                    collision_type=CollisionType.TOOL_HOLDER_TO_FIXTURE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='tool_holder',
                    object_b='fixture',
                    details=f'Tool holder near fixture, distance: {dist:.4f}mm'
                ))

        if tool_holder and worktable:
            dist = self._distance_between_cylinder_and_box(
                tool_holder.volume.shapes[0], worktable.volume.shapes[0]
            )
            if dist < self._min_collision_distance:
                results.append(CollisionResult(
                    is_collision=True,
                    collision_type=CollisionType.TOOL_HOLDER_TO_WORKTABLE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='tool_holder',
                    object_b='worktable',
                    details=f'Tool holder collides with worktable, distance: {dist:.4f}mm'
                ))
            elif dist < self._min_warning_distance:
                results.append(CollisionResult(
                    is_collision=False,
                    collision_type=CollisionType.TOOL_HOLDER_TO_WORKTABLE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='tool_holder',
                    object_b='worktable',
                    details=f'Tool holder near worktable, distance: {dist:.4f}mm'
                ))

        if tool_tip and workpiece:
            dist = self._distance_between_cylinder_and_box(
                tool_tip.volume.shapes[0], workpiece.volume.shapes[0]
            )
            if dist < self._min_collision_distance:
                results.append(CollisionResult(
                    is_collision=True,
                    collision_type=CollisionType.TOOL_TO_WORKPIECE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='tool_tip',
                    object_b='workpiece',
                    details=f'Tool collides with workpiece, distance: {dist:.4f}mm'
                ))
            elif dist < self._min_warning_distance:
                results.append(CollisionResult(
                    is_collision=False,
                    collision_type=CollisionType.TOOL_TO_WORKPIECE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='tool_tip',
                    object_b='workpiece',
                    details=f'Tool near workpiece, distance: {dist:.4f}mm'
                ))

        if spindle and fixture:
            dist = self._distance_between_cylinder_and_box(
                spindle.volume.shapes[0], fixture.volume.shapes[0]
            )
            if dist < self._min_collision_distance:
                results.append(CollisionResult(
                    is_collision=True,
                    collision_type=CollisionType.SPINDLE_TO_FIXTURE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='spindle',
                    object_b='fixture',
                    details=f'Spindle collides with fixture, distance: {dist:.4f}mm'
                ))
            elif dist < self._min_warning_distance:
                results.append(CollisionResult(
                    is_collision=False,
                    collision_type=CollisionType.SPINDLE_TO_FIXTURE,
                    distance=dist,
                    position=(position.get('X', 0), position.get('Y', 0), position.get('Z', 0)),
                    object_a='spindle',
                    object_b='fixture',
                    details=f'Spindle near fixture, distance: {dist:.4f}mm'
                ))

        return results

    def _distance_between_cylinder_and_box(self, cylinder: Cylinder, box: BoundingBox) -> float:
        closest_point = self._closest_point_on_box_to_cylinder(box, cylinder)
        return cylinder.distance_to_point(closest_point)

    @staticmethod
    def _closest_point_on_box_to_cylinder(box: BoundingBox, cylinder: Cylinder) -> Tuple[float, float, float]:
        mn = box.min_corner
        mx = box.max_corner

        closest = [
            min(max(cylinder.center[i], mn[i]), mx[i])
            for i in range(3)
        ]
        return tuple(closest)

    def get_collision_object(self, name: str) -> Optional[CollisionObject]:
        return self._collision_objects.get(name)

    def get_all_objects(self) -> Dict[str, CollisionObject]:
        return dict(self._collision_objects)
