#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
from typing import Dict, List
from collections import deque
from datetime import datetime
import statistics

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.models import SensorData


class DataProcessor:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.data_buffers: Dict[str, deque] = {}
        self.buffer_size = 100

    def process(self, data: SensorData) -> Dict:
        key = f"{data.room_id}:{data.device_id}"
        
        if key not in self.data_buffers:
            self.data_buffers[key] = deque(maxlen=self.buffer_size)
        
        self.data_buffers[key].append(data)
        
        stats = self._calculate_statistics(key)
        
        return {
            "device_id": data.device_id,
            "room_id": data.room_id,
            "sensor_type": data.sensor_type,
            "current_value": data.value,
            "statistics": stats
        }

    def _calculate_statistics(self, key: str) -> Dict:
        buffer = self.data_buffers[key]
        if len(buffer) < 2:
            return {}
        
        values = [d.value for d in buffer]
        
        return {
            "count": len(values),
            "mean": round(statistics.mean(values), 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "stddev": round(statistics.stdev(values), 2) if len(values) > 1 else 0,
            "trend": self._calculate_trend(values),
            "rate_of_change": round(values[-1] - values[0], 2)
        }

    def _calculate_trend(self, values: List[float]) -> str:
        if len(values) < 5:
            return "stable"
        
        recent = values[-5:]
        avg_recent = sum(recent) / len(recent)
        older = values[:-5]
        avg_older = sum(older) / len(older)
        
        diff_pct = (avg_recent - avg_older) / avg_older * 100 if avg_older != 0 else 0
        
        if diff_pct > 10:
            return "rising"
        elif diff_pct < -10:
            return "falling"
        return "stable"

    def detect_anomaly(self, data: SensorData) -> bool:
        key = f"{data.room_id}:{data.device_id}"
        buffer = self.data_buffers.get(key, deque())
        
        if len(buffer) < 10:
            return False
        
        values = [d.value for d in buffer]
        mean = statistics.mean(values)
        stddev = statistics.stdev(values) if len(values) > 1 else 0
        
        if stddev == 0:
            return False
        
        z_score = abs(data.value - mean) / stddev
        return z_score > 3.0

    def get_recent_data(self, room_id: str, device_id: str, count: int = 10) -> List[Dict]:
        key = f"{room_id}:{device_id}"
        buffer = self.data_buffers.get(key, deque())
        
        recent = list(buffer)[-count:]
        return [d.to_dict() for d in recent]
