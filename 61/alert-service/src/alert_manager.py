#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
from typing import Dict, List
from collections import deque
from datetime import datetime, timedelta

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from .alert_channels import EmailChannel, SMSChannel, WebhookChannel, ConsoleChannel


class AlertManager:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        self.channels = {}
        self.alert_history: deque = deque(maxlen=1000)
        self.active_alerts: Dict[str, Dict] = {}
        
        self.suppression_window = timedelta(minutes=5)
        self.last_sent: Dict[str, datetime] = {}
        
        self._setup_channels()

    def _setup_channels(self):
        alert_config = self.config.get("alert", {})
        enabled_channels = alert_config.get("channels", ["console"])
        
        if "console" in enabled_channels:
            self.channels["console"] = ConsoleChannel()
        
        if "email" in enabled_channels:
            email_config = alert_config.get("email", {})
            self.channels["email"] = EmailChannel(email_config)
        
        if "sms" in enabled_channels:
            sms_config = alert_config.get("sms", {})
            self.channels["sms"] = SMSChannel(sms_config)
        
        if "webhook" in enabled_channels:
            webhook_config = alert_config.get("webhook", {})
            self.channels["webhook"] = WebhookChannel(webhook_config)
        
        self.logger.info(f"Enabled alert channels: {list(self.channels.keys())}")

    def process_alert(self, alert: Dict) -> Dict:
        alert_id = alert.get("alert_id")
        alert_type = alert.get("alert_type")
        device_id = alert.get("device_id")
        level = alert.get("level")
        
        alert_key = f"{device_id}:{alert_type}"
        
        self.alert_history.append(alert)
        self.active_alerts[alert_id] = alert
        
        if not self._should_send_alert(alert_key, level):
            return {"status": "suppressed", "alert_id": alert_id}
        
        success_count = self._send_to_channels(alert)
        
        self.last_sent[alert_key] = datetime.now()
        
        return {
            "status": "sent",
            "alert_id": alert_id,
            "channels_sent": success_count,
            "total_channels": len(self.channels)
        }

    def _should_send_alert(self, alert_key: str, level: str) -> bool:
        if level in ["critical", "emergency"]:
            return True
        
        if alert_key not in self.last_sent:
            return True
        
        time_since_last = datetime.now() - self.last_sent[alert_key]
        return time_since_last > self.suppression_window

    def _send_to_channels(self, alert: Dict) -> int:
        level = alert.get("level", "info")
        success_count = 0
        
        for name, channel in self.channels.items():
            try:
                if level in ["critical", "emergency"] or name in ["console", "webhook"]:
                    if channel.send(alert):
                        success_count += 1
            except Exception as e:
                self.logger.error(f"Error sending to channel {name}: {e}")
        
        return success_count

    def acknowledge_alert(self, alert_id: str) -> bool:
        if alert_id in self.active_alerts:
            self.active_alerts[alert_id]["acknowledged"] = True
            self.active_alerts[alert_id]["acknowledged_at"] = datetime.now().isoformat()
            self.logger.info(f"Alert {alert_id} acknowledged")
            return True
        return False

    def get_active_alerts(self, room_id: str = None, level: str = None) -> List[Dict]:
        alerts = list(self.active_alerts.values())
        
        if room_id:
            alerts = [a for a in alerts if a.get("room_id") == room_id]
        
        if level:
            alerts = [a for a in alerts if a.get("level") == level]
        
        return sorted(alerts, key=lambda x: x.get("timestamp", ""), reverse=True)

    def get_alert_history(self, limit: int = 100) -> List[Dict]:
        history = list(self.alert_history)[-limit:]
        return sorted(history, key=lambda x: x.get("timestamp", ""), reverse=True)

    def clear_active_alerts(self, room_id: str = None):
        if room_id:
            self.active_alerts = {
                k: v for k, v in self.active_alerts.items()
                if v.get("room_id") != room_id
            }
        else:
            self.active_alerts.clear()
        
        self.logger.info("Active alerts cleared")
