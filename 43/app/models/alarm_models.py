from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any

from app.constants import (
    AlarmLevel,
    AlarmStatus,
    ParameterType,
    ThresholdCondition,
    ParameterUnit,
)


@dataclass
class AlarmEvent:
    alarm_id: str
    device_id: str
    pipeline_id: str
    param_type: ParameterType
    alarm_level: AlarmLevel
    condition: ThresholdCondition
    threshold_value: float
    actual_value: float
    unit: ParameterUnit
    timestamp: datetime
    status: AlarmStatus = AlarmStatus.PENDING
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    message: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "alarm_id": self.alarm_id,
            "device_id": self.device_id,
            "pipeline_id": self.pipeline_id,
            "param_type": self.param_type.value,
            "alarm_level": self.alarm_level.value,
            "condition": self.condition.value,
            "threshold_value": self.threshold_value,
            "actual_value": self.actual_value,
            "unit": self.unit.value,
            "timestamp": self.timestamp.isoformat(),
            "status": self.status.value,
            "acknowledged_by": self.acknowledged_by,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "message": self.message,
            "metadata": self.metadata,
        }


@dataclass
class AlarmRule:
    rule_id: str
    param_type: ParameterType
    alarm_level: AlarmLevel
    condition: ThresholdCondition
    threshold_value: float
    unit: ParameterUnit
    upper_value: Optional[float] = None
    duration_seconds: int = 0
    enabled: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    description: str = ""

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "param_type": self.param_type.value,
            "alarm_level": self.alarm_level.value,
            "condition": self.condition.value,
            "threshold_value": self.threshold_value,
            "unit": self.unit.value,
            "upper_value": self.upper_value,
            "duration_seconds": self.duration_seconds,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "description": self.description,
        }