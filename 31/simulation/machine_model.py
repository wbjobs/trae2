from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple


class MachineType(Enum):
    VERTICAL_MACHINING_CENTER = 'VMC'
    HORIZONTAL_MACHINING_CENTER = 'HMC'
    LATHE = 'LATHE'
    MILL_TURN = 'MILL_TURN'
    GANTRY = 'GANTRY'


@dataclass
class Axis:
    name: str
    min_limit: float = 0.0
    max_limit: float = 1000.0
    home_position: float = 0.0
    max_feed_rate: float = 10000.0
    max_acceleration: float = 500.0
    current_position: float = 0.0
    is_linear: bool = True

    def check_limit(self, position: float) -> bool:
        return self.min_limit <= position <= self.max_limit

    def distance_to_limit(self, position: float) -> Tuple[str, float]:
        if position < self.min_limit:
            return ('min', self.min_limit - position)
        elif position > self.max_limit:
            return ('max', position - self.max_limit)
        return ('ok', 0.0)


@dataclass
class MachineModel:
    name: str = 'VMC-850'
    machine_type: MachineType = MachineType.VERTICAL_MACHINING_CENTER
    axes: Dict[str, Axis] = field(default_factory=dict)
    tool_holder_length: float = 60.0
    tool_length: float = 80.0
    spindle_to_table_distance: float = 500.0
    table_size: Tuple[float, float, float] = (900, 550, 100)
    table_position: Tuple[float, float, float] = (0, 0, 0)
    spindle_radius: float = 50.0
    spindle_length: float = 150.0

    @classmethod
    def from_config(cls, config: dict) -> 'MachineModel':
        machine_cfg = config.get('machine', {})
        collision_cfg = config.get('collision', {})

        type_map = {
            'VMC': MachineType.VERTICAL_MACHINING_CENTER,
            'HMC': MachineType.HORIZONTAL_MACHINING_CENTER,
            'LATHE': MachineType.LATHE,
            'MILL_TURN': MachineType.MILL_TURN,
            'GANTRY': MachineType.GANTRY,
            'vertical_machining_center': MachineType.VERTICAL_MACHINING_CENTER,
            'horizontal_machining_center': MachineType.HORIZONTAL_MACHINING_CENTER,
        }
        raw_type = machine_cfg.get('type', 'VMC')
        machine_type = type_map.get(raw_type, MachineType.VERTICAL_MACHINING_CENTER)

        axes = {}
        for axis_name, limits in machine_cfg.get('limits', {}).items():
            axes[axis_name] = Axis(
                name=axis_name,
                min_limit=limits.get('min', 0),
                max_limit=limits.get('max', 1000),
                home_position=machine_cfg.get('home_position', {}).get(axis_name, 0),
                max_feed_rate=machine_cfg.get('feed_rate_max', 10000),
                max_acceleration=500.0,
                is_linear=axis_name in ('X', 'Y', 'Z')
            )
        return cls(
            name=machine_cfg.get('name', 'VMC-850'),
            machine_type=machine_type,
            axes=axes,
            tool_holder_length=collision_cfg.get('tool_holder_length', 60),
            spindle_radius=collision_cfg.get('spindle_radius', 50),
            spindle_length=collision_cfg.get('spindle_length', 150),
            table_size=tuple(collision_cfg.get('worktable_size', [900, 550, 100])),
            table_position=tuple(collision_cfg.get('worktable_position', [0, 0, 0])),
        )

    def get_axis(self, name: str) -> Optional[Axis]:
        return self.axes.get(name)

    def get_tool_tip_position(self) -> Tuple[float, float, float]:
        x = self.axes['X'].current_position if 'X' in self.axes else 0.0
        y = self.axes['Y'].current_position if 'Y' in self.axes else 0.0
        z = self.axes['Z'].current_position if 'Z' in self.axes else 0.0
        return (x, y, z)

    def get_tool_center_position(self) -> Tuple[float, float, float]:
        x, y, z = self.get_tool_tip_position()
        return (x, y, z - self.tool_length / 2.0)

    def set_axis_positions(self, positions: Dict[str, float]):
        for axis_name, pos in positions.items():
            if axis_name in self.axes:
                self.axes[axis_name].current_position = pos

    def get_spindle_position(self) -> Tuple[float, float, float]:
        x = self.axes['X'].current_position if 'X' in self.axes else 0.0
        y = self.axes['Y'].current_position if 'Y' in self.axes else 0.0
        z = (self.axes['Z'].current_position if 'Z' in self.axes else 0.0) + self.tool_holder_length + self.spindle_length / 2.0
        return (x, y, z)

    def get_tool_holder_position(self) -> Tuple[float, float, float]:
        x = self.axes['X'].current_position if 'X' in self.axes else 0.0
        y = self.axes['Y'].current_position if 'Y' in self.axes else 0.0
        z = (self.axes['Z'].current_position if 'Z' in self.axes else 0.0) + self.tool_holder_length / 2.0
        return (x, y, z)
