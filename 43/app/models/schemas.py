from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator

from app.constants import (
    ParameterType,
    ParameterUnit,
    AlarmLevel,
    AlarmStatus,
    ThresholdCondition,
    NodeStatus,
)


class ParameterData(BaseModel):
    param_type: ParameterType
    value: float
    unit: ParameterUnit
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    quality: int = Field(default=0, ge=0, le=3)


class CollectDataRequest(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    pipeline_id: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    location: str = Field(default="", max_length=256)
    parameters: List[ParameterData] = Field(..., min_length=1, max_length=50)
    batch_id: Optional[str] = Field(default=None, max_length=128)

    @field_validator("parameters")
    @classmethod
    def validate_param_types(cls, v):
        types = [p.param_type for p in v]
        if len(types) != len(set(types)):
            raise ValueError("Duplicate parameter types in single request")
        return v


class CollectDataResponse(BaseModel):
    success: bool
    message: str
    received_count: int
    alarms_generated: int = 0
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    batch_id: Optional[str] = None


class AlarmQueryRequest(BaseModel):
    device_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    alarm_level: Optional[AlarmLevel] = None
    status: Optional[AlarmStatus] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=500)


class AlarmQueryResponse(BaseModel):
    total: int
    page: int
    page_size: int
    alarms: List[Dict[str, Any]]


class ThresholdConfigRequest(BaseModel):
    param_type: ParameterType
    alarm_level: AlarmLevel
    condition: ThresholdCondition
    threshold_value: float
    unit: ParameterUnit
    upper_value: Optional[float] = None
    duration_seconds: int = Field(default=0, ge=0, le=86400)
    enabled: bool = True


class ThresholdConfigResponse(BaseModel):
    success: bool
    message: str
    config_id: Optional[str] = None


class NodeInfo(BaseModel):
    node_id: str
    host: str
    port: int
    status: NodeStatus
    load: float = Field(default=0.0, ge=0.0, le=1.0)
    connections: int = Field(default=0, ge=0)
    last_heartbeat: Optional[datetime] = None
    version: str = "1.0.0"


class ClusterStatus(BaseModel):
    cluster_name: str
    node_count: int
    online_nodes: int
    total_connections: int
    total_throughput: float = 0.0
    nodes: List[NodeInfo]
    timestamp: datetime = Field(default_factory=datetime.utcnow)