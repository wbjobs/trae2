import re
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Tuple


class MotionType(Enum):
    RAPID = 'G00'
    LINEAR = 'G01'
    CIRCULAR_CW = 'G02'
    CIRCULAR_CCW = 'G03'
    DWELL = 'G04'
    NONE = 'NONE'


class CoordinateSystem(Enum):
    ABSOLUTE = 'G90'
    INCREMENTAL = 'G91'


class Plane(Enum):
    XY = 'G17'
    XZ = 'G18'
    YZ = 'G19'


@dataclass
class GCodeToken:
    type: str
    value: str
    line_number: int
    position: int


@dataclass
class GCodeCommand:
    line_number: int
    original_text: str
    motion_type: MotionType
    coordinates: Dict[str, float] = field(default_factory=dict)
    center_offsets: Dict[str, float] = field(default_factory=dict)
    explicit_axes: set = field(default_factory=set)
    radius: Optional[float] = None
    feed_rate: Optional[float] = None
    spindle_speed: Optional[float] = None
    coordinate_system: CoordinateSystem = CoordinateSystem.ABSOLUTE
    plane: Plane = Plane.XY
    is_comment: bool = False
    comment_text: str = ''
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def get_coordinate(self, axis: str, default: float = 0.0) -> float:
        return self.coordinates.get(axis, default)

    def get_center_offset(self, axis: str, default: float = 0.0) -> float:
        return self.center_offsets.get(axis, default)

    def has_explicit_axis(self, axis: str) -> bool:
        return axis in self.explicit_axes
