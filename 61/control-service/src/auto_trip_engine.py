#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import threading
from typing import Dict
from datetime import datetime, timedelta

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.models import ControlCommand


class AutoTripEngine:
    def __init__(self, config: Dict, device_controller):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.device_controller = device_controller
        
        self.auto_trip_enabled = True
        self.trip_cooldown = timedelta(minutes=5)
        self.last_trip_times: Dict[str, datetime] = {}
        
        threshold_config = config.get("sensor", {}).get("thresholds", {})
        self.trip_triggers = {
            "temperature": threshold_config.get("temperature", {}).get("critical", 50.0),
            "current": threshold_config.get("current", {}).get("critical", 100.0),
            "smoke": threshold_config.get("smoke", {}).get("critical", 100.0),
            "arc_threshold": 3
        }

    def check_and_trip(self, room_id: str, device_id: str, sensor_type: str, value: float, level: str) -> Dict:
        if not self.auto_trip_enabled:
            return {"auto_trip": False, "reason": "disabled"}
        
        if self._is_in_cooldown(device_id):
            return {"auto_trip": False, "reason": "cooldown"}
        
        should_trip = self._should_trip(sensor_type, value, level)
        
        if should_trip:
            return self._execute_auto_trip(room_id, device_id, sensor_type, value)
        
        return {"auto_trip": False, "reason": "normal"}

    def _should_trip(self, sensor_type: str, value: float, level: str) -> bool:
        if level != "critical" and level != "emergency":
            return False
        
        if sensor_type == "arc":
            return value >= self.trip_triggers["arc_threshold"]
        elif sensor_type == "temperature":
            return value >= self.trip_triggers["temperature"]
        elif sensor_type == "current":
            return value >= self.trip_triggers["current"]
        elif sensor_type == "smoke":
            return value >= self.trip_triggers["smoke"]
        
        return False

    def _is_in_cooldown(self, device_id: str) -> bool:
        if device_id not in self.last_trip_times:
            return False
        
        time_since_last_trip = datetime.now() - self.last_trip_times[device_id]
        return time_since_last_trip < self.trip_cooldown

    def _execute_auto_trip(self, room_id: str, device_id: str, sensor_type: str, value: float) -> Dict:
        self.logger.critical(f"Auto-tripping {device_id} due to {sensor_type} anomaly: {value}")
        
        command = ControlCommand(
            command_id=f"auto_trip_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            room_id=room_id,
            device_id=device_id,
            command_type="trip",
            params={
                "reason": "auto",
                "trigger": sensor_type,
                "value": value
            },
            issued_by="system"
        )
        
        result = self.device_controller.execute_command(command)
        self.last_trip_times[device_id] = datetime.now()
        
        return {
            "auto_trip": True,
            "device_id": device_id,
            "sensor_type": sensor_type,
            "value": value,
            "result": result
        }

    def enable_auto_trip(self):
        self.auto_trip_enabled = True
        self.logger.info("Auto-trip enabled")

    def disable_auto_trip(self):
        self.auto_trip_enabled = False
        self.logger.info("Auto-trip disabled")

    def set_cooldown(self, minutes: int):
        self.trip_cooldown = timedelta(minutes=minutes)
        self.logger.info(f"Trip cooldown set to {minutes} minutes")

    def get_status(self) -> Dict:
        return {
            "auto_trip_enabled": self.auto_trip_enabled,
            "trip_cooldown_minutes": self.trip_cooldown.total_seconds() / 60,
            "trip_triggers": self.trip_triggers,
            "last_trip_times": {
                device_id: dt.isoformat()
                for device_id, dt in self.last_trip_times.items()
            }
        }
