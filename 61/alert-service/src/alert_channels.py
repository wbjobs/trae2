#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests
from typing import Dict

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))


class AlertChannel:
    def send(self, alert: Dict) -> bool:
        raise NotImplementedError


class EmailChannel(AlertChannel):
    def __init__(self, config: Dict):
        self.logger = logging.getLogger(__name__)
        self.smtp_server = config.get("smtp_server", "smtp.example.com")
        self.smtp_port = config.get("smtp_port", 587)
        self.username = config.get("username", "alert@example.com")
        self.password = config.get("password", "")
        self.use_ssl = config.get("use_ssl", False)
        self.recipients = config.get("recipients", ["admin@example.com"])

    def send(self, alert: Dict) -> bool:
        try:
            msg = MIMEMultipart()
            msg["From"] = self.username
            msg["To"] = ", ".join(self.recipients)
            msg["Subject"] = f"[配电房告警] {alert.get('level', 'info').upper()}: {alert.get('alert_type', 'unknown')}"
            
            body = self._format_alert_body(alert)
            msg.attach(MIMEText(body, "plain", "utf-8"))
            
            if self.use_ssl:
                server = smtplib.SMTP_SSL(self.smtp_server, self.smtp_port)
            else:
                server = smtplib.SMTP(self.smtp_server, self.smtp_port)
                server.starttls()
            
            if self.password:
                server.login(self.username, self.password)
            
            server.send_message(msg)
            server.quit()
            
            self.logger.info(f"Email alert sent to {self.recipients}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to send email alert: {e}")
            return False

    def _format_alert_body(self, alert: Dict) -> str:
        return f"""
配电房告警通知
==================
告警ID: {alert.get('alert_id')}
配电房: {alert.get('room_id')}
设备ID: {alert.get('device_id')}
告警类型: {alert.get('alert_type')}
告警级别: {alert.get('level')}
告警消息: {alert.get('message')}
当前值: {alert.get('value')}
阈值: {alert.get('threshold')}
时间: {alert.get('timestamp')}
"""


class SMSChannel(AlertChannel):
    def __init__(self, config: Dict):
        self.logger = logging.getLogger(__name__)
        self.api_url = config.get("api_url", "http://sms.example.com/send")
        self.api_key = config.get("api_key", "")
        self.phones = config.get("phones", ["13800138000"])

    def send(self, alert: Dict) -> bool:
        try:
            message = f"[配电房告警] {alert.get('level')}: {alert.get('message')}"
            
            for phone in self.phones:
                payload = {
                    "phone": phone,
                    "message": message,
                    "api_key": self.api_key
                }
                
                response = requests.post(self.api_url, json=payload, timeout=5)
                if response.status_code != 200:
                    self.logger.warning(f"Failed to send SMS to {phone}")
            
            self.logger.info("SMS alerts sent")
            return True
        except Exception as e:
            self.logger.error(f"Failed to send SMS alert: {e}")
            return False


class WebhookChannel(AlertChannel):
    def __init__(self, config: Dict):
        self.logger = logging.getLogger(__name__)
        self.webhook_url = config.get("url", "http://localhost:3000/api/alerts/webhook")
        self.headers = config.get("headers", {})

    def send(self, alert: Dict) -> bool:
        try:
            response = requests.post(
                self.webhook_url,
                json=alert,
                headers=self.headers,
                timeout=5
            )
            
            if response.status_code == 200:
                self.logger.info("Webhook alert sent successfully")
                return True
            else:
                self.logger.warning(f"Webhook returned status {response.status_code}")
                return False
        except Exception as e:
            self.logger.error(f"Failed to send webhook alert: {e}")
            return False


class ConsoleChannel(AlertChannel):
    def __init__(self, config: Dict = None):
        self.logger = logging.getLogger(__name__)

    def send(self, alert: Dict) -> bool:
        level = alert.get("level", "info")
        message = alert.get("message", "No message")
        
        log_func = {
            "info": self.logger.info,
            "warning": self.logger.warning,
            "critical": self.logger.error,
            "emergency": self.logger.critical
        }.get(level, self.logger.info)
        
        log_func(f"ALERT [{level}]: {message}")
        return True
