#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from dataclasses import dataclass, field
from typing import Dict, Optional
from datetime import datetime
import json


@dataclass
class SensorData:
    device_id: str
    room_id: str
    sensor_type: str
    value: float
    unit: str
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: Dict = field(default_factory=dict)

    def to_dict(self):
        return {
            "device_id": self.device_id,
            "room_id": self.room_id,
            "sensor_type": self.sensor_type,
            "value": self.value,
            "unit": self.unit,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata
        }

    def to_json(self):
        return json.dumps(self.to_dict())

    @classmethod
    def from_dict(cls, data):
        return cls(
            device_id=data["device_id"],
            room_id=data["room_id"],
            sensor_type=data["sensor_type"],
            value=data["value"],
            unit=data["unit"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            metadata=data.get("metadata", {})
        )


@dataclass
class AlertMessage:
    alert_id: str
    room_id: str
    device_id: str
    alert_type: str
    level: str
    message: str
    value: Optional[float] = None
    threshold: Optional[float] = None
    timestamp: datetime = field(default_factory=datetime.now)
    acknowledged: bool = False

    def to_dict(self):
        return {
            "alert_id": self.alert_id,
            "room_id": self.room_id,
            "device_id": self.device_id,
            "alert_type": self.alert_type,
            "level": self.level,
            "message": self.message,
            "value": self.value,
            "threshold": self.threshold,
            "timestamp": self.timestamp.isoformat(),
            "acknowledged": self.acknowledged
        }

    def to_json(self):
        return json.dumps(self.to_dict())


@dataclass
class ControlCommand:
    command_id: str
    room_id: str
    device_id: str
    command_type: str
    params: Dict = field(default_factory=dict)
    issued_by: str = "system"
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self):
        return {
            "command_id": self.command_id,
            "room_id": self.room_id,
            "device_id": self.device_id,
            "command_type": self.command_type,
            "params": self.params,
            "issued_by": self.issued_by,
            "timestamp": self.timestamp.isoformat()
        }

    def to_json(self):
        return json.dumps(self.to_dict())


@dataclass
class DeviceStatus:
    device_id: str
    room_id: str
    status: str
    last_heartbeat: datetime
    firmware_version: Optional[str] = None
    ip_address: Optional[str] = None

    def to_dict(self):
        return {
            "device_id": self.device_id,
            "room_id": self.room_id,
            "status": self.status,
            "last_heartbeat": self.last_heartbeat.isoformat(),
            "firmware_version": self.firmware_version,
            "ip_address": self.ip_address
        }
