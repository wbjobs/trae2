"""
仿真器模块 - 重构版
使用新的运动学核心，提升复杂程序仿真稳定性
"""

import math
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Callable
from threading import Lock

from .machine_model import MachineModel
from .kinematics_core import KinematicsCore, TrajectorySegment, SegmentType
from core.parser import GCodeCommand, MotionType, CoordinateSystem, Plane


class SimulationState(Enum):
    IDLE = 'idle'
    RUNNING = 'running'
    PAUSED = 'paused'
    COMPLETED = 'completed'
    ERROR = 'error'


class EventType(Enum):
    POSITION_UPDATE = 'position_update'
    COLLISION_WARNING = 'collision_warning'
    COLLISION_DETECTED = 'collision_detected'
    LIMIT_VIOLATION = 'limit_violation'
    ERROR = 'error'
    COMPLETED = 'completed'
    COMMAND_PROCESSED = 'command_processed'
    SEGMENT_STARTED = 'segment_started'
    SEGMENT_COMPLETED = 'segment_completed'


@dataclass
class SimulationEvent:
    event_type: EventType
    timestamp: float
    data: dict = field(default_factory=dict)
    message: str = ''


@dataclass
class SimulationPath:
    points: List[Dict[str, float]] = field(default_factory=list)
    total_length: float = 0.0
    rapid_length: float = 0.0
    feed_length: float = 0.0
    command_count: int = 0


class Simulator:
    def __init__(self, machine_model: MachineModel):
        self.machine = machine_model
        self._kinematics = KinematicsCore(machine_model)
        self._legacy_kinematics = None

        self.state = SimulationState.IDLE
        self.commands: List[GCodeCommand] = []
        self.current_command_index: int = 0
        self.current_path: SimulationPath = SimulationPath()
        self.events: List[SimulationEvent] = []
        self.event_callbacks: List[Callable] = []

        self._pause_flag = False
        self._stop_flag = False
        self._simulation_speed = 1.0
        self._use_new_kinematics = True

        self._current_position = {'X': 0.0, 'Y': 0.0, 'Z': 0.0}
        self._lock = Lock()

        self._interpolation_budget = 0.0
        self._current_segment: Optional[TrajectorySegment] = None
        self._segment_points: List[Dict[str, float]] = []
        self._segment_point_index: int = 0

        self._error_count: int = 0
        self._max_errors_before_pause: int = 100

        self.reset()

    def load_commands(self, commands: List[GCodeCommand]) -> None:
        self.commands = commands
        self.current_command_index = 0
        self.current_path = SimulationPath()
        self.current_path.command_count = len(commands)
        self.events.clear()
        self.state = SimulationState.IDLE
        self._reset_internals()

    def _reset_internals(self) -> None:
        self._current_segment = None
        self._segment_points = []
        self._segment_point_index = 0
        self._error_count = 0
        self._error_count = 0

    def reset(self) -> None:
        self.current_command_index = 0
        self.current_path = SimulationPath()
        self.current_path.command_count = len(self.commands)
        self.events.clear()
        self._kinematics.reset()
        for axis in self.machine.axes.values():
            axis.current_position = axis.home_position
        self._current_position = {
            a: self.machine.axes[a].home_position
            for a in self.machine.axes
        }
        self.state = SimulationState.IDLE
        self._reset_internals()

    def set_simulation_speed(self, speed: float) -> None:
        self._simulation_speed = max(0.1, min(speed, 200.0))

    def pause(self) -> None:
        self._pause_flag = True
        if self.state == SimulationState.RUNNING:
            self.state = SimulationState.PAUSED

    def resume(self) -> None:
        self._pause_flag = False
        if self.state == SimulationState.PAUSED:
            self.state = SimulationState.RUNNING

    def stop(self) -> None:
        self._stop_flag = True

    def register_callback(self, callback: Callable) -> None:
        self.event_callbacks.append(callback)

    def _emit_event(self, event: SimulationEvent) -> None:
        self.events.append(event)
        for callback in self.event_callbacks:
            try:
                callback(event)
            except Exception as e:
                print(f"Event callback error: {e}")

    def _safe_step(self) -> Optional[SimulationEvent]:
        try:
            return self.step()
        except Exception as e:
            self._error_count += 1
            error_event = SimulationEvent(
                event_type=EventType.ERROR,
                timestamp=time.time(),
                data={'error': str(e), 'command_index': self.current_command_index},
                message=f'Simulation error at command {self.current_command_index}: {e}'
            )
            self._emit_event(error_event)

            if self._error_count >= self._max_errors_before_pause:
                self.state = SimulationState.ERROR
                return error_event

            self.current_command_index += 1
            return error_event

    def step(self) -> Optional[SimulationEvent]:
        if self.current_command_index >= len(self.commands):
            self.state = SimulationState.COMPLETED
            completion_event = SimulationEvent(
                event_type=EventType.COMPLETED,
                timestamp=time.time(),
                message='Simulation completed'
            )
            self._emit_event(completion_event)
            return completion_event

        if self._segment_points and self._segment_point_index < len(self._segment_points):
            point = self._segment_points[self._segment_point_index]
            self._segment_point_index += 1
            return self._apply_position(point)

        command = self.commands[self.current_command_index]

        try:
            if self._use_new_kinematics:
                return self._step_new_kinematics(command)
            else:
                return self._step_legacy(command)
        except Exception as e:
            return self._handle_step_error(command, e)

    def _step_new_kinematics(self, command: GCodeCommand) -> Optional[SimulationEvent]:
        if command.motion_type in (MotionType.RAPID, MotionType.LINEAR,
                                    MotionType.CIRCULAR_CW, MotionType.CIRCULAR_CCW):
            segment = self._kinematics.plan_motion(command, self._current_position)
            if segment:
                self._current_segment = segment
                self._segment_points = self._kinematics.interpolate_segment(segment)
                self._segment_point_index = 0

                start_event = SimulationEvent(
                    event_type=EventType.SEGMENT_STARTED,
                    timestamp=time.time(),
                    data={
                        'command_index': self.current_command_index,
                        'segment_type': segment.segment_type.value,
                        'distance': segment.distance
                    }
                )
                self._emit_event(start_event)

                if self._segment_points:
                    point = self._segment_points[0]
                    self._segment_point_index = 1
                    result_event = self._apply_position(point)

                    if self._segment_point_index >= len(self._segment_points):
                        self._finalize_segment(segment)
                    return result_event
                else:
                    self._finalize_segment(segment)
                    return None
            else:
                cmd_event = SimulationEvent(
                    event_type=EventType.COMMAND_PROCESSED,
                    timestamp=time.time(),
                    data={'command_index': self.current_command_index},
                    message=f'Processed line {command.line_number}'
                )
                self._emit_event(cmd_event)
                self.current_command_index += 1
                return cmd_event

        elif command.motion_type == MotionType.DWELL:
            dwell_event = SimulationEvent(
                event_type=EventType.COMMAND_PROCESSED,
                timestamp=time.time(),
                data={'command_index': self.current_command_index, 'dwell': True},
                message=f'Dwell at line {command.line_number}'
            )
            self._emit_event(dwell_event)
            self.current_command_index += 1
            return dwell_event

        else:
            cmd_event = SimulationEvent(
                event_type=EventType.COMMAND_PROCESSED,
                timestamp=time.time(),
                data={'command_index': self.current_command_index},
                message=f'Processed line {command.line_number}'
            )
            self._emit_event(cmd_event)
            self.current_command_index += 1
            return cmd_event

        return None

    def _step_legacy(self, command: GCodeCommand) -> Optional[SimulationEvent]:
        if command.motion_type in (MotionType.RAPID, MotionType.LINEAR):
            return self._process_linear_move(command)
        elif command.motion_type in (MotionType.CIRCULAR_CW, MotionType.CIRCULAR_CCW):
            return self._process_circular_move(command)
        elif command.motion_type == MotionType.DWELL:
            event = SimulationEvent(
                event_type=EventType.COMMAND_PROCESSED,
                timestamp=time.time(),
                data={'command_index': self.current_command_index, 'dwell': True},
                message=f'Dwell at line {command.line_number}'
            )
            self._emit_event(event)
            self.current_command_index += 1
            return event
        else:
            event = SimulationEvent(
                event_type=EventType.COMMAND_PROCESSED,
                timestamp=time.time(),
                data={'command_index': self.current_command_index},
                message=f'Processed line {command.line_number}'
            )
            self._emit_event(event)
            self.current_command_index += 1
            return event

    def _apply_position(self, position: Dict[str, float]) -> SimulationEvent:
        self._current_position = position
        self.machine.set_axis_positions(position)
        self._kinematics.update_position(position)

        self.current_path.points.append(dict(position))

        pos_event = SimulationEvent(
            event_type=EventType.POSITION_UPDATE,
            timestamp=time.time(),
            data={
                'position': dict(position),
                'command_index': self.current_command_index,
            }
        )
        self._emit_event(pos_event)
        return pos_event

    def _finalize_segment(self, segment: TrajectorySegment) -> None:
        is_rapid = segment.segment_type == SegmentType.RAPID
        self.current_path.total_length += segment.distance
        if is_rapid:
            self.current_path.rapid_length += segment.distance
        else:
            self.current_path.feed_length += segment.distance

        self._kinematics.add_path_length(segment.distance, is_rapid)

        completion_event = SimulationEvent(
            event_type=EventType.SEGMENT_COMPLETED,
            timestamp=time.time(),
            data={
                'command_index': self.current_command_index,
                'segment_type': segment.segment_type.value,
                'distance': segment.distance
            }
        )
        self._emit_event(completion_event)

        self.current_command_index += 1
        self._current_segment = None
        self._segment_points = []
        self._segment_point_index = 0

    def _handle_step_error(self, command: GCodeCommand, error: Exception) -> SimulationEvent:
        self._error_count += 1
        error_event = SimulationEvent(
            event_type=EventType.ERROR,
            timestamp=time.time(),
            data={
                'error': str(error),
                'command_index': self.current_command_index,
                'line_number': command.line_number
            },
            message=f'Error at line {command.line_number}: {error}'
        )
        self._emit_event(error_event)
        self.current_command_index += 1

        if self._error_count >= self._max_errors_before_pause:
            self.state = SimulationState.ERROR

        return error_event

    def _process_linear_move(self, command: GCodeCommand) -> Optional[SimulationEvent]:
        target = {}
        for axis in ('X', 'Y', 'Z'):
            if command.has_explicit_axis(axis):
                target[axis] = command.coordinates.get(axis, 0.0)
            else:
                target[axis] = self._current_position.get(axis, 0.0)

        has_any_axis = any(command.has_explicit_axis(a) for a in ('X', 'Y', 'Z'))
        if not has_any_axis:
            self.current_command_index += 1
            return None

        feed_rate = command.feed_rate if command.feed_rate and command.feed_rate > 0 else 10000.0

        start_pos = dict(self._current_position)
        self._current_position = target
        self.machine.set_axis_positions(target)

        segment_length = math.sqrt(
            sum((target.get(a, 0) - start_pos.get(a, 0)) ** 2
                for a in ('X', 'Y', 'Z'))
        )

        self.current_path.points.append(dict(target))

        if command.motion_type == MotionType.RAPID:
            self.current_path.rapid_length += segment_length
        else:
            self.current_path.feed_length += segment_length
        self.current_path.total_length += segment_length

        event = SimulationEvent(
            event_type=EventType.POSITION_UPDATE,
            timestamp=time.time(),
            data={
                'position': dict(target),
                'command_index': self.current_command_index,
                'motion_type': command.motion_type.value
            },
            message=f'{command.motion_type.value} to X={target["X"]:.3f} Y={target["Y"]:.3f} Z={target["Z"]:.3f}'
        )
        self._emit_event(event)
        self.current_command_index += 1
        return event

    def _process_circular_move(self, command: GCodeCommand) -> Optional[SimulationEvent]:
        target = {}
        for axis in ('X', 'Y', 'Z'):
            if command.has_explicit_axis(axis):
                target[axis] = command.coordinates.get(axis, 0.0)
            else:
                target[axis] = self._current_position.get(axis, 0.0)

        has_any_axis = any(command.has_explicit_axis(a) for a in ('X', 'Y', 'Z'))
        if not has_any_axis:
            self.current_command_index += 1
            return None

        plane_map = {Plane.XY: 'XY', Plane.XZ: 'XZ', Plane.YZ: 'YZ'}
        plane = plane_map.get(command.plane, 'XY')

        self._current_position = target
        self.machine.set_axis_positions(target)
        self.current_path.points.append(dict(target))

        event = SimulationEvent(
            event_type=EventType.POSITION_UPDATE,
            timestamp=time.time(),
            data={
                'position': dict(target),
                'command_index': self.current_command_index,
                'motion_type': command.motion_type.value
            },
            message=f'{command.motion_type.value} to X={target["X"]:.3f} Y={target["Y"]:.3f} Z={target["Z"]:.3f}'
        )
        self._emit_event(event)
        self.current_command_index += 1
        return event

    def run(self, callback: Optional[Callable] = None) -> None:
        self.state = SimulationState.RUNNING
        self._stop_flag = False
        self._pause_flag = False

        if callback:
            self.register_callback(callback)

        while (self.current_command_index < len(self.commands)
               and not self._stop_flag
               and self.state != SimulationState.ERROR):
            while self._pause_flag and not self._stop_flag:
                time.sleep(0.01)

            if self._stop_flag:
                break

            self._safe_step()

            time.sleep(0.01 / self._simulation_speed)

        if self.state != SimulationState.ERROR:
            self.state = SimulationState.COMPLETED

        completion_event = SimulationEvent(
            event_type=EventType.COMPLETED,
            timestamp=time.time(),
            message='Simulation completed'
        )
        self._emit_event(completion_event)

    def get_progress(self) -> float:
        if not self.commands:
            return 0.0
        return self.current_command_index / len(self.commands)

    @property
    def current_position(self) -> Dict[str, float]:
        return dict(self._current_position)
