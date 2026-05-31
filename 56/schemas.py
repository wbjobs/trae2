from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class FaultType(str, Enum):
    NORMAL = "normal"
    BEARING_FAULT = "bearing_fault"
    GEAR_FAULT = "gear_fault"
    MOTOR_FAULT = "motor_fault"
    PUMP_FAULT = "pump_fault"
    FAN_FAULT = "fan_fault"
    UNBALANCE = "unbalance"
    MISALIGNMENT = "misalignment"
    LOOSE_PART = "loose_part"
    UNKNOWN = "unknown"


class Severity(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AudioStreamInfo(BaseModel):
    device_id: str
    stream_id: Optional[str] = None
    sample_rate: int = 44100
    channels: int = 1
    format: str = "wav"


class AudioUploadResponse(BaseModel):
    sample_id: str
    device_id: str
    file_name: str
    status: str
    message: str


class NoiseReductionConfig(BaseModel):
    method: str = "spectral_gating"
    strength: float = 0.8
    stationary: bool = True
    prop_decrease: float = 0.8


class FeatureExtractionConfig(BaseModel):
    n_mfcc: int = 40
    n_fft: int = 2048
    hop_length: int = 512
    n_mels: int = 128
    extract_time_domain: bool = True
    extract_frequency_domain: bool = True
    extract_mfcc: bool = True
    extract_spectral: bool = True
    extract_cepstral: bool = True


class ClassificationRequest(BaseModel):
    sample_id: str
    model_version: Optional[str] = "latest"


class ClassificationResult(BaseModel):
    sample_id: str
    fault_type: str
    fault_severity: str
    confidence: float
    all_probabilities: Dict[str, float]
    processing_time: float
    features_used: List[str]


class AudioFeatures(BaseModel):
    time_domain: Dict[str, float] = {}
    frequency_domain: Dict[str, float] = {}
    mfcc: Dict[str, List[float]] = {}
    spectral: Dict[str, List[float]] = {}
    cepstral: Dict[str, float] = {}


class SampleInfo(BaseModel):
    sample_id: str
    device_id: str
    file_name: str
    duration: float
    sample_rate: int
    fault_type: Optional[str] = None
    fault_severity: Optional[str] = None
    is_labeled: bool = False
    classification_result: Optional[str] = None
    classification_confidence: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DeviceCreate(BaseModel):
    device_id: str
    device_name: str
    device_type: str
    location: Optional[str] = None
    description: Optional[str] = None


class DeviceInfoResponse(BaseModel):
    device_id: str
    device_name: str
    device_type: str
    location: Optional[str]
    status: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ProcessingStatus(BaseModel):
    task_id: str
    device_id: str
    stage: str
    status: str
    message: str
    processing_time: Optional[float]
    created_at: datetime


class BatchProcessingRequest(BaseModel):
    device_ids: List[str]
    processing_pipeline: List[str] = ["denoise", "extract_features", "classify"]


class StreamSession(BaseModel):
    stream_id: str
    device_id: str
    start_time: datetime
    is_active: bool
    chunks_processed: int
    total_duration: float


class ModelInfo(BaseModel):
    model_name: str
    model_version: str
    accuracy: float
    fault_types: List[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SegmentMarkerCreate(BaseModel):
    sample_id: str
    start_time: float
    end_time: float
    label: Optional[str] = None
    notes: Optional[str] = None
    created_by: str = "user"


class SegmentMarkerUpdate(BaseModel):
    label: Optional[str] = None
    notes: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None


class SegmentMarkerResponse(BaseModel):
    marker_id: str
    sample_id: str
    start_time: float
    end_time: float
    label: Optional[str]
    notes: Optional[str]
    created_by: str
    created_at: float
    updated_at: float


class FineTuneRequest(BaseModel):
    sample_ids: Optional[List[str]] = None
    learning_rate: float = 0.1
    validation_split: float = 0.2


class FineTuneResponse(BaseModel):
    success: bool
    new_model_version: str
    accuracy: float
    samples_used: int
    training_time: float
    improvement: Optional[float] = None
    previous_accuracy: Optional[float] = None
    warnings: List[str] = []
    error: Optional[str] = None


class AutoDetectSegmentsRequest(BaseModel):
    method: str = "energy"
    threshold: float = 0.1
    min_segment_duration: float = 0.5
    max_segment_duration: float = 5.0
