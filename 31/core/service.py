import time
import threading
from enum import Enum
from typing import List, Dict, Optional, Callable
from datetime import datetime

from core.parser import GCodeParser, GCodeCommand
from collision import CollisionDetector, CollisionResult
from report import ReportGenerator, ReportData, ReportCollisionEvent, ReportLimitEvent, ReportError, ReportWarning
from config import load_config, get_config


class ServiceState(Enum):
    IDLE = 'idle'
    LOADING = 'loading'
    PARSING = 'parsing'
    PARSED = 'parsed'
    SIMULATING = 'simulating'
    PAUSED = 'paused'
    COMPLETED = 'completed'
    ERROR = 'error'
    GENERATING_REPORT = 'generating_report'
    REPORT_READY = 'report_ready'


class SimulationService:
    def __init__(self):
        self._lock = threading.Lock()
        self._state = ServiceState.IDLE
        self._parser = GCodeParser()
        self._machine_model: Optional['MachineModel'] = None
        self._simulator: Optional['Simulator'] = None
        self._collision_detector: Optional[CollisionDetector] = None
        self._commands: List[GCodeCommand] = []
        self._current_filename: str = ''
        self._report_data: Optional[ReportData] = None
        self._collision_results: List[CollisionResult] = []
        self._simulation_thread: Optional[threading.Thread] = None
        self._event_callbacks: List[Callable] = []
        self._state_callbacks: List[Callable] = []

    @property
    def state(self) -> ServiceState:
        return self._state

    @property
    def simulator(self) -> Optional['Simulator']:
        return self._simulator

    @property
    def commands(self) -> List[GCodeCommand]:
        return self._commands

    @property
    def collision_results(self) -> List[CollisionResult]:
        return self._collision_results

    @property
    def machine_model(self) -> Optional['MachineModel']:
        return self._machine_model

    @property
    def report_data(self) -> Optional[ReportData]:
        return self._report_data

    def register_event_callback(self, callback: Callable):
        self._event_callbacks.append(callback)

    def register_state_callback(self, callback: Callable):
        self._state_callbacks.append(callback)

    def _set_state(self, state: ServiceState):
        self._state = state
        for cb in self._state_callbacks:
            try:
                cb(state)
            except Exception:
                pass

    def _emit_event(self, event: dict):
        for cb in self._event_callbacks:
            try:
                cb(event)
            except Exception:
                pass

    def initialize(self):
        from simulation import Simulator, MachineModel
        with self._lock:
            config = load_config()
            self._machine_model = MachineModel.from_config(config)
            self._simulator = Simulator(self._machine_model)
            self._collision_detector = CollisionDetector(self._machine_model)

            warn_dist = get_config('collision.min_distance_warning', 5.0)
            coll_dist = get_config('collision.min_distance_collision', 0.1)
            self._collision_detector.set_warning_distance(warn_dist)
            self._collision_detector.set_collision_distance(coll_dist)

            self._simulator.register_callback(self._on_simulation_event)
            self._set_state(ServiceState.IDLE)

    def load_gcode_file(self, filepath: str) -> bool:
        with self._lock:
            try:
                self._set_state(ServiceState.LOADING)
                self._current_filename = filepath
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                self._set_state(ServiceState.PARSING)
                self._commands = self._parser.parse(content)
                self._simulator.load_commands(self._commands)
                self._collision_results.clear()
                self._report_data = None
                self._set_state(ServiceState.PARSED)
                return True
            except Exception as e:
                self._set_state(ServiceState.ERROR)
                self._emit_event({'type': 'error', 'message': str(e)})
                return False

    def load_gcode_text(self, text: str, filename: str = 'untitled.nc') -> bool:
        with self._lock:
            try:
                self._current_filename = filename
                self._set_state(ServiceState.PARSING)
                self._commands = self._parser.parse(text)
                self._simulator.load_commands(self._commands)
                self._collision_results.clear()
                self._report_data = None
                self._set_state(ServiceState.PARSED)
                return True
            except Exception as e:
                self._set_state(ServiceState.ERROR)
                self._emit_event({'type': 'error', 'message': str(e)})
                return False

    def start_simulation(self):
        if self._simulation_thread and self._simulation_thread.is_alive():
            return

        self._simulation_thread = threading.Thread(
            target=self._run_simulation, daemon=True
        )
        self._simulation_thread.start()

    def _run_simulation(self):
        from simulation import EventType, SimulationState
        with self._lock:
            self._set_state(ServiceState.SIMULATING)

        start_time = time.time()

        while self._simulator.current_command_index < len(self._commands):
            if self._simulator._stop_flag:
                break

            while self._simulator._pause_flag:
                self._set_state(ServiceState.PAUSED)
                time.sleep(0.05)
                if self._simulator._stop_flag:
                    break

            self._set_state(ServiceState.SIMULATING)

            result = self._simulator.step()
            if result and result.event_type == EventType.POSITION_UPDATE:
                position = result.data.get('position', {})
                collisions = self._collision_detector.check_collisions(position)
                self._collision_results.extend(collisions)

            time.sleep(0.01 / self._simulator._simulation_speed)

        simulation_duration = time.time() - start_time
        self._simulator.state = SimulationState.COMPLETED

        self._build_report_data(simulation_duration)

        self._set_state(ServiceState.COMPLETED)

    def pause_simulation(self):
        if self._simulator:
            self._simulator.pause()

    def resume_simulation(self):
        if self._simulator:
            self._simulator.resume()

    def stop_simulation(self):
        if self._simulator:
            self._simulator.stop()

    def reset_simulation(self):
        if self._simulator:
            self._simulator.reset()
            self._collision_results.clear()
            self._report_data = None
            self._set_state(ServiceState.PARSED)

    def set_simulation_speed(self, speed: float):
        if self._simulator:
            self._simulator.set_simulation_speed(speed)

    def _build_report_data(self, duration: float):
        from simulation import EventType
        data = ReportData(
            filename=self._current_filename,
            machine_name=self._machine_model.name if self._machine_model else '',
            start_time=datetime.now(),
            end_time=datetime.now(),
            total_commands=len(self._commands),
            processed_commands=self._simulator.current_command_index,
            total_path_length=self._simulator.current_path.total_length,
            rapid_path_length=self._simulator.current_path.rapid_length,
            feed_path_length=self._simulator.current_path.feed_length,
            simulation_duration=duration
        )

        for result in self._collision_results:
            data.collision_events.append(ReportCollisionEvent(
                timestamp=result.timestamp,
                collision_type=result.collision_type.value if result.collision_type else '',
                distance=result.distance,
                position={'X': result.position[0], 'Y': result.position[1], 'Z': result.position[2]},
                object_a=result.object_a,
                object_b=result.object_b,
                details=result.details,
                command_index=result.command_index
            ))

        for event in self._simulator.events:
            if event.event_type == EventType.LIMIT_VIOLATION:
                data.limit_violations.append(ReportLimitEvent(
                    timestamp=event.timestamp,
                    axis=event.data.get('axis', ''),
                    limit_type=event.data.get('limit_type', ''),
                    distance=event.data.get('distance', 0),
                    position=event.data.get('position', 0),
                    command_index=event.data.get('command_index', 0)
                ))

        for cmd in self._commands:
            for err in cmd.errors:
                data.errors.append(ReportError(
                    line_number=cmd.line_number,
                    message=err,
                    error_type='parsing'
                ))
            for warn in cmd.warnings:
                data.warnings.append(ReportWarning(
                    line_number=cmd.line_number,
                    message=warn
                ))

        self._report_data = data

    def generate_report(self, output_format: str = 'html', output_dir: str = './reports') -> str:
        if not self._report_data:
            return ''

        self._set_state(ServiceState.GENERATING_REPORT)
        generator = ReportGenerator(self._report_data)

        if output_format.lower() == 'html':
            filepath = generator.generate_html(output_dir)
        else:
            filepath = generator.generate_text(output_dir)

        self._set_state(ServiceState.REPORT_READY)
        return filepath

    def get_progress(self) -> float:
        if self._simulator:
            return self._simulator.get_progress()
        return 0.0

    def get_current_position(self) -> Dict[str, float]:
        if self._simulator:
            return dict(self._simulator.current_position)
        return {'X': 0, 'Y': 0, 'Z': 0}

    def get_tool_path_points(self) -> List[Dict[str, float]]:
        if self._simulator:
            return self._simulator.current_path.points
        return []

    def _on_simulation_event(self, event: 'SimulationEvent'):
        event_dict = {
            'type': event.event_type.value,
            'timestamp': event.timestamp,
            'data': event.data,
            'message': event.message
        }
        self._emit_event(event_dict)
