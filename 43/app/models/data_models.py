from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from app.constants import ParameterType, ParameterUnit


@dataclass
class PipelineDataPoint:
    device_id: str
    pipeline_id: str
    param_type: ParameterType
    value: float
    unit: ParameterUnit
    timestamp: datetime
    location: str = ""
    quality: int = 0
    batch_id: Optional[str] = None
    node_id: str = ""

    def to_influx_point(self) -> dict:
        return {
            "measurement": "cp_protection_data",
            "tags": {
                "device_id": self.device_id,
                "pipeline_id": self.pipeline_id,
                "param_type": self.param_type.value,
                "location": self.location,
                "node_id": self.node_id,
            },
            "fields": {
                "value": self.value,
                "quality": self.quality,
            },
            "time": self.timestamp.isoformat(),
        }


@dataclass
class DeviceInfo:
    device_id: str
    pipeline_id: str
    name: str = ""
    model: str = ""
    firmware_version: str = ""
    last_seen: Optional[datetime] = None
    status: str = "offline"
    location: str = ""
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "device_id": self.device_id,
            "pipeline_id": self.pipeline_id,
            "name": self.name,
            "model": self.model,
            "firmware_version": self.firmware_version,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "status": self.status,
            "location": self.location,
            "metadata": self.metadata,
        }