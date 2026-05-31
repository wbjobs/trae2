"""
机器状态模块 - 管理机床各轴的运动状态
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Optional, Tuple
import time


class AxisStatus(Enum):
    IDLE = 'idle'
    MOVING = 'moving'
    ACCELERATING = 'accelerating'
    DECELERATING = 'decelerating'
    HOLD = 'hold'
    ERROR = 'error'
    LIMIT_POSITIVE = 'limit_positive'
    LIMIT_NEGATIVE = 'limit_negative'


@dataclass
class AxisState:
    name: str
    position: float = 0.0
    target_position: float = 0.0
    velocity: float = 0.0
    max_velocity: float = 10000.0
    max_acceleration: float = 500.0
    min_limit: float = 0.0
    max_limit: float = 1000.0
    status: AxisStatus = AxisStatus.IDLE
    last_update: float = field(default_factory=time.time)
    following_error: float = 0.0
    home_position: float = 0.0

    def update(self, position: float, velocity: float = 0.0) -> None:
        self.position = position
        self.velocity = velocity
        self.last_update = time.time()
        self._check_limits()

    def _check_limits(self) -> None:
        if self.position >= self.max_limit:
            self.status = AxisStatus.LIMIT_POSITIVE
        elif self.position <= self.min_limit:
            self.status = AxisStatus.LIMIT_NEGATIVE
        elif self.velocity > 0:
            self.status = AxisStatus.MOVING
        elif abs(self.velocity) < 0.1:
            self.status = AxisStatus.IDLE

    def distance_to_limit(self) -> Tuple[str, float]:
        if self.position < self.min_limit:
            return ('negative', self.min_limit - self.position)
        elif self.position > self.max_limit:
            return ('positive', self.position - self.max_limit)
        return ('ok', 0.0)

    def in_limit(self) -> bool:
        return self.min_limit <= self.position <= self.max_limit

    def reset(self) -> None:
        self.position = self.home_position
        self.target_position = self.home_position
        self.velocity = 0.0
        self.status = AxisStatus.IDLE
        self.following_error = 0.0


class MotionState(Enum):
    IDLE = 'idle'
    RAPID = 'rapid'
    FEED = 'feed'
    CIRCULAR_CW = 'circular_cw'
    CIRCULAR_CCW = 'circular_ccw'
    DWELL = 'dwell'
    HOLD = 'hold'
    ERROR = 'error'
    COMPLETED = 'completed'


@dataclass
class MachineState:
    axes: Dict[str, AxisState] = field(default_factory=dict)
    motion_state: MotionState = MotionState.IDLE
    feed_rate: float = 0.0
    spindle_speed: float = 0.0
    spindle_running: bool = False
    coolant_on: bool = False
    current_line: int = 0
    program_name: str = ''
    cycle_start_time: Optional[float] = None
    cycle_elapsed_time: float = 0.0
    path_length: float = 0.0
    rapid_path_length: float = 0.0
    feed_path_length: float = 0.0
    motion_stack: list = field(default_factory=list)

    def get_axis(self, name: str) -> Optional[AxisState]:
        return self.axes.get(name)

    def get_position(self) -> Dict[str, float]:
        return {name: axis.position for name, axis in self.axes.items()}

    def set_position(self, positions: Dict[str, float]) -> None:
        for name, pos in positions.items():
            if name in self.axes:
                self.axes[name].position = pos

    def start_cycle(self) -> None:
        self.cycle_start_time = time.time()
        self.cycle_elapsed_time = 0.0

    def stop_cycle(self) -> None:
        if self.cycle_start_time:
            self.cycle_elapsed_time += time.time() - self.cycle_start_time
        self.cycle_start_time = None

    def get_elapsed_time(self) -> float:
        if self.cycle_start_time:
            return self.cycle_elapsed_time + (time.time() - self.cycle_start_time)
        return self.cycle_elapsed_time

    def reset(self) -> None:
        for axis in self.axes.values():
            axis.reset()
        self.motion_state = MotionState.IDLE
        self.path_length = 0.0
        self.rapid_path_length = 0.0
        self.feed_path_length = 0.0
        self.cycle_start_time = None
        self.cycle_elapsed_time = 0.0
        self.current_line = 0
        self.motion_stack.clear()
