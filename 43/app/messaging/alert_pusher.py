import json
import logging
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timezone
from collections import defaultdict

import httpx

from app.config import settings
from app.constants import (
    AlarmLevel,
    ALARM_LEVEL_NAMES,
    ALARM_LEVEL_COLORS,
)
from app.models.alarm_models import AlarmEvent

logger = logging.getLogger(__name__)


class AlertPusher:
    """
    消息推送模块
    实现告警消息分级推送，支持邮件、短信、Webhook 多渠道通知。
    根据告警级别自动选择推送渠道和策略。
    增加告警去重、静默窗口、推送失败重试、降级策略。
    """

    def __init__(self):
        self._channels = settings.ALARM_PUSH_CHANNELS.split(",")
        self._subscribers: Dict[AlarmLevel, List[str]] = {
            AlarmLevel.INFO: [],
            AlarmLevel.WARNING: [],
            AlarmLevel.CRITICAL: [],
            AlarmLevel.EMERGENCY: [],
        }
        self._webhook_clients: Dict[str, httpx.AsyncClient] = {}
        self._pushed_alarms: Set[str] = set()
        self._alarm_cooldown: Dict[str, float] = {}
        self._push_retry_count = 2
        self._push_retry_delay = 1.0
        self._cooldown_seconds = {
            AlarmLevel.INFO: 300,
            AlarmLevel.WARNING: 120,
            AlarmLevel.CRITICAL: 60,
            AlarmLevel.EMERGENCY: 10,
        }
        self._init_webhook_clients()

    def _init_webhook_clients(self):
        if settings.WEBHOOK_URL:
            self._webhook_clients["default"] = httpx.AsyncClient(
                timeout=10.0,
                limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            )

    def register_subscriber(self, level: AlarmLevel, contact: str):
        if contact not in self._subscribers[level]:
            self._subscribers[level].append(contact)
            logger.info("Registered subscriber %s for level %s", contact, level.value)

    def unregister_subscriber(self, level: AlarmLevel, contact: str):
        if contact in self._subscribers[level]:
            self._subscribers[level].remove(contact)
            logger.info("Unregistered subscriber %s for level %s", contact, level.value)

    def set_cooldown(self, level: AlarmLevel, seconds: int):
        self._cooldown_seconds[level] = seconds
        logger.info("Set cooldown %ds for level %s", seconds, level.value)

    def _is_in_cooldown(self, alarm: AlarmEvent) -> bool:
        import time

        cooldown_key = f"{alarm.device_id}:{alarm.param_type.value}:{alarm.alarm_level.value}"
        cooldown = self._cooldown_seconds.get(alarm.alarm_level, 60)
        now = time.time()

        if cooldown_key in self._alarm_cooldown:
            last_push = self._alarm_cooldown[cooldown_key]
            if now - last_push < cooldown:
                logger.debug(
                    "Alarm %s in cooldown (%.0fs remaining), skipping push",
                    alarm.alarm_id,
                    cooldown - (now - last_push),
                )
                return True

        self._alarm_cooldown[cooldown_key] = now
        return False

    def _is_duplicate_push(self, alarm_id: str) -> bool:
        if alarm_id in self._pushed_alarms:
            logger.warning("Duplicate push detected for alarm %s", alarm_id)
            return True
        if len(self._pushed_alarms) > 10000:
            self._pushed_alarms.clear()
            logger.info("Cleared pushed alarms cache (size limit reached)")
        self._pushed_alarms.add(alarm_id)
        return False

    async def push_alarm(self, alarm: AlarmEvent) -> Dict[str, Any]:
        if self._is_duplicate_push(alarm.alarm_id):
            return {"status": "duplicate", "channels": {}}

        if self._is_in_cooldown(alarm):
            return {"status": "cooldown", "channels": {}}

        results: Dict[str, bool] = {}
        tasks = []
        channel_configs = self._get_channel_configs(alarm.alarm_level)

        for config in channel_configs:
            channel = config["channel"]
            if channel == "email" and "email" in self._channels:
                tasks.append(("email", self._push_with_retry(alarm, "email", self._push_email)))
            elif channel == "sms" and "sms" in self._channels:
                tasks.append(("sms", self._push_with_retry(alarm, "sms", self._push_sms)))
            elif channel == "webhook" and "webhook" in self._channels:
                tasks.append(("webhook", self._push_with_retry(alarm, "webhook", self._push_webhook)))

        if tasks:
            task_results = await asyncio.gather(
                *[t[1] for t in tasks], return_exceptions=True
            )
            for (name, _), result in zip(tasks, task_results):
                if isinstance(result, Exception):
                    results[name] = False
                    logger.error("Failed to push %s: %s", name, result)
                else:
                    results[name] = result

        success_count = sum(1 for v in results.values() if v)
        total_count = len(results)

        return {
            "status": "success" if success_count > 0 else "failed",
            "channels": results,
            "success_count": success_count,
            "total_count": total_count,
        }

    async def _push_with_retry(
        self,
        alarm: AlarmEvent,
        channel: str,
        push_func,
    ) -> bool:
        for attempt in range(1, self._push_retry_count + 1):
            try:
                result = await push_func(alarm)
                if result:
                    if attempt > 1:
                        logger.info(
                            "Push succeeded on retry %d for alarm %s (channel: %s)",
                            attempt,
                            alarm.alarm_id,
                            channel,
                        )
                    return True
            except Exception as e:
                logger.error(
                    "Push failed (attempt %d/%d) for alarm %s (channel: %s): %s",
                    attempt,
                    self._push_retry_count,
                    alarm.alarm_id,
                    channel,
                    e,
                )
            if attempt < self._push_retry_count:
                await asyncio.sleep(self._push_retry_delay * attempt)
        return False

    async def push_alarms_batch(
        self, alarms: List[AlarmEvent]
    ) -> List[Dict[str, Any]]:
        results = []
        for alarm in alarms:
            result = await self.push_alarm(alarm)
            results.append(result)
        return results

    def _get_channel_configs(self, level: AlarmLevel) -> List[Dict[str, Any]]:
        configs = []

        if level >= AlarmLevel.INFO:
            configs.append({"channel": "webhook", "priority": 1})

        if level >= AlarmLevel.WARNING:
            configs.append({"channel": "email", "priority": 2})

        if level >= AlarmLevel.CRITICAL:
            configs.append({"channel": "sms", "priority": 3})

        if level >= AlarmLevel.EMERGENCY:
            configs.append({"channel": "webhook", "priority": 3})

        return sorted(configs, key=lambda x: x["priority"])

    async def _push_email(self, alarm: AlarmEvent) -> bool:
        try:
            subscribers = self._get_subscribers_for_level(alarm.alarm_level)
            if not subscribers and not settings.EMAIL_USER:
                logger.debug("No email subscribers for alarm %s", alarm.alarm_id)
                return False

            msg = MIMEMultipart("alternative")
            msg["Subject"] = self._build_email_subject(alarm)
            msg["From"] = settings.EMAIL_USER or "cp-monitor@system"
            msg["To"] = ", ".join(subscribers) if subscribers else settings.EMAIL_USER
            msg["X-Priority"] = self._get_email_priority(alarm.alarm_level)

            html_content = self._build_email_html(alarm)
            text_content = self._build_email_text(alarm)

            msg.attach(MIMEText(text_content, "plain", "utf-8"))
            msg.attach(MIMEText(html_content, "html", "utf-8"))

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._send_email, msg)
            logger.info(
                "Email alert pushed for alarm %s to %d subscribers",
                alarm.alarm_id,
                len(subscribers) if subscribers else 1,
            )
            return True
        except Exception as e:
            logger.error("Failed to push email: %s", e)
            return False

    def _send_email(self, msg: MIMEMultipart):
        with smtplib.SMTP(settings.EMAIL_SMTP_HOST, settings.EMAIL_SMTP_PORT, timeout=30) as server:
            server.starttls()
            if settings.EMAIL_USER and settings.EMAIL_PASSWORD:
                server.login(settings.EMAIL_USER, settings.EMAIL_PASSWORD)
            server.send_message(msg)

    def _get_email_priority(self, level: AlarmLevel) -> str:
        priority_map = {
            AlarmLevel.INFO: "3 (Normal)",
            AlarmLevel.WARNING: "2 (High)",
            AlarmLevel.CRITICAL: "1 (Highest)",
            AlarmLevel.EMERGENCY: "1 (Highest)",
        }
        return priority_map.get(level, "3 (Normal)")

    async def _push_sms(self, alarm: AlarmEvent) -> bool:
        if not settings.SMS_API_URL or not settings.SMS_API_KEY:
            return False
        try:
            subscribers = self._get_subscribers_for_level(alarm.alarm_level)
            if not subscribers:
                return False

            content = self._build_sms_content(alarm)
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    settings.SMS_API_URL,
                    json={
                        "api_key": settings.SMS_API_KEY,
                        "recipients": subscribers,
                        "content": content,
                        "priority": "high" if alarm.alarm_level >= AlarmLevel.CRITICAL else "normal",
                    },
                )
                if response.status_code == 200:
                    logger.info(
                        "SMS alert pushed for alarm %s to %d subscribers",
                        alarm.alarm_id,
                        len(subscribers),
                    )
                    return True
                logger.warning(
                    "SMS push returned status %d for alarm %s",
                    response.status_code,
                    alarm.alarm_id,
                )
            return False
        except Exception as e:
            logger.error("Failed to push SMS: %s", e)
            return False

    async def _push_webhook(self, alarm: AlarmEvent) -> bool:
        if not settings.WEBHOOK_URL:
            return False
        try:
            client = self._webhook_clients.get("default")
            if client is None:
                return False

            payload = {
                "alarm_id": alarm.alarm_id,
                "device_id": alarm.device_id,
                "pipeline_id": alarm.pipeline_id,
                "param_type": alarm.param_type.value,
                "alarm_level": alarm.alarm_level.value,
                "level_name": ALARM_LEVEL_NAMES[alarm.alarm_level],
                "actual_value": alarm.actual_value,
                "threshold_value": alarm.threshold_value,
                "unit": alarm.unit.value,
                "message": alarm.message,
                "timestamp": alarm.timestamp.isoformat(),
                "status": alarm.status.value,
                "metadata": alarm.metadata,
            }

            response = await client.post(
                settings.WEBHOOK_URL,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Alarm-Level": str(alarm.alarm_level.value),
                    "X-Alarm-ID": alarm.alarm_id,
                },
            )
            if response.status_code in (200, 202):
                logger.info("Webhook alert pushed for alarm %s", alarm.alarm_id)
                return True
            logger.warning(
                "Webhook push returned status %d for alarm %s",
                response.status_code,
                alarm.alarm_id,
            )
            return False
        except Exception as e:
            logger.error("Failed to push webhook: %s", e)
            return False

    def _get_subscribers_for_level(self, level: AlarmLevel) -> List[str]:
        subscribers = list(self._subscribers.get(level, []))
        for higher_level in AlarmLevel:
            if higher_level > level and higher_level in self._subscribers:
                subscribers.extend(self._subscribers[higher_level])
        return list(set(subscribers))

    def _build_email_subject(self, alarm: AlarmEvent) -> str:
        level_name = ALARM_LEVEL_NAMES[alarm.alarm_level]
        prefix = {
            AlarmLevel.INFO: "[INFO]",
            AlarmLevel.WARNING: "[WARN]",
            AlarmLevel.CRITICAL: "[CRIT]",
            AlarmLevel.EMERGENCY: "[EMERG]",
        }.get(alarm.alarm_level, "[ALERT]")
        return f"{prefix} 阴极保护告警 - 设备{alarm.device_id} - {level_name}"

    def _build_email_html(self, alarm: AlarmEvent) -> str:
        level_name = ALARM_LEVEL_NAMES[alarm.alarm_level]
        color = ALARM_LEVEL_COLORS[alarm.alarm_level]
        return f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="border-left: 4px solid {color}; padding-left: 15px;">
                <h2 style="color: {color};">【{level_name}】阴极保护参数告警</h2>
                <table style="border-collapse: collapse; margin: 10px 0;">
                    <tr><td style="padding: 5px 15px;"><strong>告警ID:</strong></td><td style="padding: 5px 15px;">{alarm.alarm_id}</td></tr>
                    <tr><td style="padding: 5px 15px;"><strong>设备编号:</strong></td><td style="padding: 5px 15px;">{alarm.device_id}</td></tr>
                    <tr><td style="padding: 5px 15px;"><strong>管道编号:</strong></td><td style="padding: 5px 15px;">{alarm.pipeline_id}</td></tr>
                    <tr><td style="padding: 5px 15px;"><strong>参数类型:</strong></td><td style="padding: 5px 15px;">{alarm.param_type.value}</td></tr>
                    <tr><td style="padding: 5px 15px;"><strong>实测值:</strong></td><td style="padding: 5px 15px; font-size: 16px; font-weight: bold; color: {color};">{alarm.actual_value:.2f} {alarm.unit.value}</td></tr>
                    <tr><td style="padding: 5px 15px;"><strong>阈值:</strong></td><td style="padding: 5px 15px;">{alarm.threshold_value:.2f} {alarm.unit.value}</td></tr>
                    <tr><td style="padding: 5px 15px;"><strong>告警时间:</strong></td><td style="padding: 5px 15px;">{alarm.timestamp.strftime('%Y-%m-%d %H:%M:%S')}</td></tr>
                </table>
                <p style="background: #f8f9fa; padding: 10px; border-radius: 4px;"><strong>告警消息:</strong> {alarm.message}</p>
                <hr>
                <p style="color: #999; font-size: 12px;">
                    此邮件由阴极保护监测系统自动发送，请勿直接回复。<br>
                    如需处理此告警，请登录监测系统管理控制台。
                </p>
            </div>
        </body>
        </html>
        """

    def _build_email_text(self, alarm: AlarmEvent) -> str:
        level_name = ALARM_LEVEL_NAMES[alarm.alarm_level]
        return f"""
【{level_name}】阴极保护参数告警

告警ID: {alarm.alarm_id}
设备编号: {alarm.device_id}
管道编号: {alarm.pipeline_id}
参数类型: {alarm.param_type.value}
实测值: {alarm.actual_value:.2f} {alarm.unit.value}
阈值: {alarm.threshold_value:.2f} {alarm.unit.value}
告警时间: {alarm.timestamp.strftime('%Y-%m-%d %H:%M:%S')}
告警消息: {alarm.message}

此邮件由阴极保护监测系统自动发送，请勿直接回复。
"""

    def _build_sms_content(self, alarm: AlarmEvent) -> str:
        level_name = ALARM_LEVEL_NAMES[alarm.alarm_level]
        return (
            f"【{level_name}】设备{alarm.device_id} "
            f"{alarm.param_type.value}: "
            f"{alarm.actual_value:.1f}{alarm.unit.value} "
            f"(阈值{alarm.threshold_value:.1f})"
        )

    def get_push_status(self) -> Dict[str, Any]:
        return {
            "channels": self._channels,
            "subscribers": {
                level.value: len(subs)
                for level, subs in self._subscribers.items()
            },
            "cooldown_seconds": {
                level.value: seconds
                for level, seconds in self._cooldown_seconds.items()
            },
            "pushed_cache_size": len(self._pushed_alarms),
            "retry_count": self._push_retry_count,
        }

    async def close(self):
        for client in self._webhook_clients.values():
            await client.aclose()