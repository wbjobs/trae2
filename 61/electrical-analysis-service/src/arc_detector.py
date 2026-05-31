#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
from typing import Dict, List
from collections import deque
from datetime import datetime, timedelta

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))


class ArcDetector:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.arc_events: Dict[str, deque] = {}
        self.time_window = timedelta(minutes=10)
        self.warning_threshold = config.get("sensor", {}).get("thresholds", {}).get("arc", {}).get("warning", 1)
        self.critical_threshold = config.get("sensor", {}).get("thresholds", {}).get("arc", {}).get("critical", 3)

    def report_arc(self, room_id: str, device_id: str, count: int = 1) -> Dict:
        key = f"{room_id}:{device_id}"
        
        if key not in self.arc_events:
            self.arc_events[key] = deque()
        
        now = datetime.now()
        for _ in range(count):
            self.arc_events[key].append(now)
        
        self._cleanup_old_events(key)
        
        event_count = len(self.arc_events[key])
        level = "normal"
        
        if event_count >= self.critical_threshold:
            level = "critical"
        elif event_count >= self.warning_threshold:
            level = "warning"
        
        return {
            "room_id": room_id,
            "device_id": device_id,
            "arc_count": event_count,
            "time_window_minutes": self.time_window.total_seconds() / 60,
            "level": level,
            "needs_trip": level == "critical"
        }

    def _cleanup_old_events(self, key: str):
        if key not in self.arc_events:
            return
        
        cutoff = datetime.now() - self.time_window
        events = self.arc_events[key]
        
        while events and events[0] < cutoff:
            events.popleft()

    def get_arc_status(self, room_id: str, device_id: str) -> Dict:
        key = f"{room_id}:{device_id}"
        self._cleanup_old_events(key)
        
        events = self.arc_events.get(key, deque())
        return {
            "room_id": room_id,
            "device_id": device_id,
            "arc_count": len(events),
            "first_event": events[0].isoformat() if events else None,
            "last_event": events[-1].isoformat() if events else None
        }

    def reset_arc_events(self, room_id: str, device_id: str):
        key = f"{room_id}:{device_id}"
        if key in self.arc_events:
            self.arc_events[key].clear()
            self.logger.info(f"Arc events reset for {device_id}")
