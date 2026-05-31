from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class FaultTypeEnum(str, Enum):
    NORMAL = "normal"
    BEARING_FAULT = "bearing_fault"
    GEAR_FAULT = "gear_fault"
    ROTOR_FAULT = "rotor_fault"
    STATOR_FAULT = "stator_fault"
    UNBALANCE = "unbalance"
    MISALIGNMENT = "misalignment"
    MECHANICAL_LOOSENESS = "mechanical_looseness"
    UNKNOWN = "unknown"


class MotorTypeEnum(str, Enum):
    INDUCTION_MOTOR = "induction_motor"
    SYNCHRONOUS_MOTOR = "synchronous_motor"
    DC_MOTOR = "dc_motor"
    SERVO_MOTOR = "servo_motor"
    STEPPER_MOTOR = "stepper_motor"
    OTHER = "other"


class AudioUploadResponse(BaseModel):
    success: bool
    sample_id: str
    message: str


class DiagnosisRequest(BaseModel):
    motor_id: str
    motor_type: MotorTypeEnum = MotorTypeEnum.INDUCTION_MOTOR
    realtime: bool = False
    save_sample: bool = True


class DiagnosisResult(BaseModel):
    record_id: str
    sample_id: Optional[str]
    motor_id: str
    fault_type: FaultTypeEnum
    confidence: float
    fault_probabilities: Dict[str, float]
    features: Dict[str, Any]
    processing_time_ms: float
    is_realtime: bool
    timestamp: datetime


class AudioSampleInfo(BaseModel):
    sample_id: str
    motor_type: str
    fault_type: Optional[str]
    fault_severity: Optional[str]
    duration: float
    sample_rate: int
    is_labeled: bool
    confidence: Optional[float]
    created_at: datetime


class SampleQueryResponse(BaseModel):
    total: int
    samples: List[AudioSampleInfo]


class StreamInitRequest(BaseModel):
    motor_id: str
    motor_type: MotorTypeEnum = MotorTypeEnum.INDUCTION_MOTOR
    sample_rate: int = 16000
    channels: int = 1
    format: str = "wav"


class StreamInitResponse(BaseModel):
    success: bool
    session_id: str
    message: str


class StreamChunkResponse(BaseModel):
    session_id: str
    chunk_index: int
    diagnosis: Optional[DiagnosisResult]
    status: str


class ModelInfoResponse(BaseModel):
    model_name: str
    model_version: str
    model_type: str
    classes: List[str]
    accuracy: Optional[float]
    is_active: bool


class ProcessingStatus(BaseModel):
    status: str
    progress: float
    message: str


class AudioMarkerRequest(BaseModel):
    sample_id: str
    start_time: float
    end_time: Optional[float] = None
    label: Optional[str] = None
    confidence: Optional[float] = None
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class AudioMarkerResponse(BaseModel):
    marker_id: str
    sample_id: str
    start_time: float
    end_time: Optional[float]
    label: Optional[str]
    confidence: Optional[float]
    notes: Optional[str]
    created_at: datetime


class AudioSegmentRequest(BaseModel):
    sample_id: str
    start_time: float
    end_time: float
    label: Optional[str] = None


class AudioSegmentResponse(BaseModel):
    segment_id: str
    sample_id: str
    start_time: float
    end_time: float
    duration: float
    label: Optional[str]
    download_url: Optional[str]


class SegmentListResponse(BaseModel):
    total: int
    segments: List[AudioSegmentResponse]


class FinetuneRequest(BaseModel):
    sample_ids: Optional[List[str]] = None
    labels: Optional[Dict[str, str]] = None
    description: Optional[str] = None
    n_estimators: int = 100
    max_depth: int = 15
    validation_split: float = 0.2
    min_accuracy: float = 0.7
    auto_trigger: bool = True


class FinetuneResponse(BaseModel):
    job_id: str
    status: str
    message: str


class FinetuneJobResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    description: Optional[str]
    num_samples: int
    train_accuracy: Optional[float]
    validation_accuracy: Optional[float]
    f1_score: Optional[float]
    model_updated: bool
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime


class FinetuneJobListResponse(BaseModel):
    active: List[FinetuneJobResponse]
    completed: List[FinetuneJobResponse]


class BatchProcessRequest(BaseModel):
    file_paths: Optional[List[str]] = None
    directory: Optional[str] = None
    recursive: bool = True
    denoise_method: str = "adaptive_industrial"
    motor_type: str = "induction_motor"
    save_features: bool = False


class BatchProcessResponse(BaseModel):
    batch_id: str
    status: str
    total_files: int
    message: str


class BatchStatusResponse(BaseModel):
    batch_id: str
    status: str
    total_files: int
    success_count: int
    failed_count: int
    success_rate: float
    duration_seconds: Optional[float]
    prediction_distribution: Optional[Dict[str, int]]


class BatchResultResponse(BaseModel):
    batch_id: str
    total_files: int
    success_count: int
    failed_count: int
    success_rate: float
    results: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]
    statistics: Dict[str, Any]


class SplitAudioRequest(BaseModel):
    max_segment_duration: float = 30.0
    overlap_duration: float = 1.0
    detect_anomalies: bool = True
    auto_denoise: bool = True


class SplitAudioResponse(BaseModel):
    original_file: str
    total_duration: float
    segment_count: int
    segments: List[Dict[str, Any]]


class SchedulerStatusResponse(BaseModel):
    total_tasks: int
    completed_tasks: int
    active_tasks: int
    queued_tasks: int
    failed_tasks: int
    success_rate: float
    avg_processing_time_ms: float
    max_workers: int
    utilization: float


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: Optional[float]
    result: Optional[Any]
    error: Optional[str]
    duration: Optional[float]
    priority: str
    created_at: datetime


class AddTrainingSampleRequest(BaseModel):
    features: Optional[Dict[str, float]] = None
    label: str
    sample_id: Optional[str] = None
    motor_type: Optional[str] = None
    confidence: Optional[float] = None
    source: str = "manual"
