#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
from typing import Dict, Tuple, Optional
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.models import SensorData


class ThresholdDetector:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.thresholds = config.get("sensor", {}).get("thresholds", {})

    def check_threshold(self, data: SensorData) -> Tuple[bool, str, Optional[float]]:
        sensor_type = data.sensor_type
        value = data.value
        
        if sensor_type not in self.thresholds:
            return False, "normal", None
        
        threshold_config = self.thresholds[sensor_type]
        
        if "warning_min" in threshold_config:
            return self._check_range_threshold(value, threshold_config)
        else:
            return self._check_upper_threshold(value, threshold_config)

    def _check_upper_threshold(self, value: float, config: Dict) -> Tuple[bool, str, float]:
        warning = config.get("warning", float("inf"))
        critical = config.get("critical", float("inf"))
        
        if value >= critical:
            return True, "critical", critical
        elif value >= warning:
            return True, "warning", warning
        return False, "normal", warning

    def _check_range_threshold(self, value: float, config: Dict) -> Tuple[bool, str, float]:
        warning_min = config.get("warning_min", float("-inf"))
        warning_max = config.get("warning_max", float("inf"))
        critical_min = config.get("critical_min", float("-inf"))
        critical_max = config.get("critical_max", float("inf"))
        
        if value <= critical_min or value >= critical_max:
            return True, "critical", critical_max
        elif value <= warning_min or value >= warning_max:
            return True, "warning", warning_max
        return False, "normal", warning_max

    def get_threshold_config(self, sensor_type: str) -> Dict:
        return self.thresholds.get(sensor_type, {})
