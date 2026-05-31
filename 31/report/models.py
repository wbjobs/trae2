from dataclasses import dataclass, field
from typing import List, Dict, Optional
from datetime import datetime


@dataclass
class ReportCollisionEvent:
    timestamp: float
    collision_type: str
    distance: float
    position: Dict[str, float]
    object_a: str
    object_b: str
    details: str
    command_index: int


@dataclass
class ReportLimitEvent:
    timestamp: float
    axis: str
    limit_type: str
    distance: float
    position: float
    command_index: int


@dataclass
class ReportError:
    line_number: int
    message: str
    error_type: str


@dataclass
class ReportWarning:
    line_number: int
    message: str


@dataclass
class ReportData:
    filename: str = ''
    machine_name: str = ''
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None
    total_commands: int = 0
    processed_commands: int = 0
    total_path_length: float = 0.0
    rapid_path_length: float = 0.0
    feed_path_length: float = 0.0
    simulation_duration: float = 0.0
    collision_events: List[ReportCollisionEvent] = field(default_factory=list)
    limit_violations: List[ReportLimitEvent] = field(default_factory=list)
    errors: List[ReportError] = field(default_factory=list)
    warnings: List[ReportWarning] = field(default_factory=list)
    max_spindle_speed: float = 0.0
    max_feed_rate: float = 0.0
    axis_positions: Dict[str, Dict[str, float]] = field(default_factory=dict)
