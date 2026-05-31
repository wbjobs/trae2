from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Tuple
import numpy as np
from enum import Enum


class WeatherVariable(Enum):
    TEMPERATURE = "temperature"
    HUMIDITY = "humidity"
    PRESSURE = "pressure"
    WIND_SPEED = "wind_speed"
    WIND_DIRECTION = "wind_direction"
    PRECIPITATION = "precipitation"


@dataclass
class ObservationData:
    station_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None
    precipitation: Optional[float] = None


@dataclass
class GridDefinition:
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
    resolution: float

    @property
    def lat_points(self) -> np.ndarray:
        return np.arange(self.lat_min, self.lat_max + self.resolution, self.resolution)

    @property
    def lon_points(self) -> np.ndarray:
        return np.arange(self.lon_min, self.lon_max + self.resolution, self.resolution)

    @property
    def shape(self) -> Tuple[int, int]:
        return len(self.lat_points), len(self.lon_points)

    def get_grid_coords(self) -> Tuple[np.ndarray, np.ndarray]:
        return np.meshgrid(self.lon_points, self.lat_points)


@dataclass
class GridWeatherData:
    grid_def: GridDefinition
    timestamp: datetime
    temperature: Optional[np.ndarray] = None
    humidity: Optional[np.ndarray] = None
    pressure: Optional[np.ndarray] = None
    wind_speed: Optional[np.ndarray] = None
    wind_direction: Optional[np.ndarray] = None
    precipitation: Optional[np.ndarray] = None

    def get_variable(self, variable: WeatherVariable) -> np.ndarray:
        return getattr(self, variable.value)

    def set_variable(self, variable: WeatherVariable, data: np.ndarray) -> None:
        setattr(self, variable.value, data)


@dataclass
class SimulationTask:
    task_id: str
    grid_region: Tuple[float, float, float, float]
    time_step: int
    start_time: datetime
    end_time: datetime
    variables: List[WeatherVariable]
    priority: int = 0
    status: str = "pending"
    worker_id: Optional[str] = None
    result: Optional[Dict] = field(default_factory=dict)


@dataclass
class WorkerStatus:
    worker_id: str
    hostname: str
    cpu_usage: float
    memory_usage: float
    memory_total: float
    active_tasks: int
    last_heartbeat: datetime
    status: str = "idle"
