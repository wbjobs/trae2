import numpy as np
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime
import uuid


@dataclass
class ObservationFrame:
    frame_id: int
    timestamp: datetime
    exposure_time: float
    temperature: float
    data: np.ndarray

    def __post_init__(self):
        self.data = np.asarray(self.data, dtype=np.float64)

    @property
    def shape(self) -> Tuple[int, int]:
        return self.data.shape

    @property
    def mean_intensity(self) -> float:
        return float(np.mean(self.data))

    @property
    def max_intensity(self) -> float:
        return float(np.max(self.data))


@dataclass
class Spot:
    spot_id: str
    x: float
    y: float
    intensity: float
    area: float
    frame_id: int
    timestamp: datetime
    snr: float = 0.0

    def __post_init__(self):
        if not self.spot_id:
            self.spot_id = str(uuid.uuid4())


@dataclass
class DenoisedFrame:
    frame_id: int
    original_frame: ObservationFrame
    denoised_data: np.ndarray
    noise_level: float
    denoising_method: str
    processing_time: float

    @property
    def shape(self) -> Tuple[int, int]:
        return self.denoised_data.shape


@dataclass
class Trajectory:
    trajectory_id: str
    spots: List[Spot]
    coefficients: np.ndarray
    fitting_method: str
    r_squared: float
    rmse: float
    start_time: datetime
    end_time: datetime

    def __post_init__(self):
        if not self.trajectory_id:
            self.trajectory_id = str(uuid.uuid4())
        self.coefficients = np.asarray(self.coefficients, dtype=np.float64)

    @property
    def num_points(self) -> int:
        return len(self.spots)

    @property
    def duration(self) -> float:
        return (self.end_time - self.start_time).total_seconds()

    def predict_position(self, time_seconds: float) -> Tuple[float, float]:
        x_coeffs = self.coefficients[:len(self.coefficients) // 2]
        y_coeffs = self.coefficients[len(self.coefficients) // 2:]
        x = np.polyval(x_coeffs, time_seconds)
        y = np.polyval(y_coeffs, time_seconds)
        return float(x), float(y)


@dataclass
class ProcessingResult:
    job_id: str
    source_file: str
    total_frames: int
    detected_spots: int
    trajectories: List[Trajectory]
    denoised_frames: List[DenoisedFrame]
    processing_time: float
    start_time: datetime
    end_time: datetime
    success: bool
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.job_id:
            self.job_id = str(uuid.uuid4())


@dataclass
class Task:
    task_id: str
    task_type: str
    priority: int
    source_file: str
    parameters: Dict[str, Any]
    status: str = "pending"
    result: Optional[ProcessingResult] = None
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None

    def __post_init__(self):
        if not self.task_id:
            self.task_id = str(uuid.uuid4())

    def mark_started(self):
        self.status = "running"
        self.started_at = datetime.now()

    def mark_completed(self, result: ProcessingResult):
        self.status = "completed"
        self.completed_at = datetime.now()
        self.result = result

    def mark_failed(self, error: str):
        self.status = "failed"
        self.completed_at = datetime.now()
        self.error = error
