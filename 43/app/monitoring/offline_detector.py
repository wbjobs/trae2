import uuid
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Callable, Set
from dataclasses import dataclass, field

from app.config import settings
from app.constants import AlarmLevel, AlarmStatus
from app.models.alarm_models import AlarmEvent
from app.models.data_models import DeviceInfo

logger = logging.getLogger(__name__)


@dataclass
class MonitorPointHeartbeat:
    device_id: str
    pipeline_id: str
    last_seen: datetime
    is_online: bool = True
    offline_notified: bool = False
    heartbeat_count: int = 0
    missed_count: int = 0
    consecutive_missed: int = 0
    location: str = ""


@dataclass
class OfflineAlert:
    alert_id: str
    device_id: str
    pipeline_id: str
    offline_since: datetime
    alert_level: AlarmLevel
    status: AlarmStatus
    last_seen: datetime
    resolved_at: Optional[datetime] = None


class OfflineDetector:
    """
    监测点离线研判模块
    跟踪所有监测点的心跳状态，实现多级离线判定、自动告警、
    自动恢复检测、离线统计分析等功能。
    """

    def __init__(self):
        self._heartbeats: Dict[str, MonitorPointHeartbeat] = {}
        self._offline_alerts: Dict[str, OfflineAlert] = {}
        self._device_info: Dict[str, DeviceInfo] = {}
        self._callbacks: List[Callable] = []
        self._check_interval = 30
        self._offline_threshold = 120
        self._critical_offline_threshold = 300
        self._consecutive_missed_warning = 2
        self._consecutive_missed_critical = 5
        self._recovered_clear_delay = 60
        self._redis_client = None
        self._initialized = False

    async def initialize(self, redis_client=None):
        if redis_client:
            self._redis_client = redis_client
        self._initialized = True
        logger.info(
            "Offline detector initialized: threshold=%ds critical=%ds",
            self._offline_threshold,
            self._critical_offline_threshold,
        )

    def register_heartbeat(
        self,
        device_id: str,
        pipeline_id: str,
        location: str = "",
    ):
        key = f"{pipeline_id}:{device_id}"
        now = datetime.now(timezone.utc)

        if key not in self._heartbeats:
            self._heartbeats[key] = MonitorPointHeartbeat(
                device_id=device_id,
                pipeline_id=pipeline_id,
                last_seen=now,
                location=location,
            )
            logger.info("New monitor point registered: %s", key)

        hb = self._heartbeats[key]
        hb.last_seen = now
        hb.heartbeat_count += 1
        hb.consecutive_missed = 0

        was_offline = not hb.is_online
        hb.is_online = True

        if was_offline and hb.offline_notified:
            asyncio.create_task(self._handle_recovery(key, hb))

        self._async_persist_heartbeat(key, hb)

    async def _async_persist_heartbeat(self, key: str, hb: MonitorPointHeartbeat):
        if not self._redis_client:
            return
        try:
            data = {
                "device_id": hb.device_id,
                "pipeline_id": hb.pipeline_id,
                "last_seen": hb.last_seen.isoformat(),
                "is_online": hb.is_online,
                "heartbeat_count": hb.heartbeat_count,
                "location": hb.location,
            }
            await self._redis_client.setex(
                f"cp:heartbeat:{key}",
                self._offline_threshold * 3,
                json.dumps(data, ensure_ascii=False),
            )
        except Exception as e:
            logger.warning("Failed to persist heartbeat: %s", e)

    async def check_offline_status(self) -> List[AlarmEvent]:
        alarms: List[AlarmEvent] = []
        now = datetime.now(timezone.utc)

        for key, hb in self._heartbeats.items():
            elapsed = (now - hb.last_seen).total_seconds()

            if elapsed > self._offline_threshold and hb.is_online:
                hb.missed_count += 1
                hb.consecutive_missed += 1

                if hb.consecutive_missed >= self._consecutive_missed_warning:
                    hb.is_online = False
                    alarm = await self._create_offline_alarm(hb)
                    if alarm:
                        alarms.append(alarm)
                        hb.offline_notified = True
                        logger.warning(
                            "Monitor point offline: %s (%.0fs elapsed, %d consecutive missed)",
                            key,
                            elapsed,
                            hb.consecutive_missed,
                        )
            elif hb.is_online:
                hb.consecutive_missed = max(0, hb.consecutive_missed - 1)

            if not hb.is_online and hb.offline_notified:
                alert = self._offline_alerts.get(key)
                if alert and elapsed > self._critical_offline_threshold:
                    if alert.alert_level == AlarmLevel.WARNING:
                        escalation_alarm = await self._escalate_offline_alarm(hb, alert)
                        if escalation_alarm:
                            alarms.append(escalation_alarm)

        await self._cleanup_stale_entries()
        return alarms

    async def _create_offline_alarm(self, hb: MonitorPointHeartbeat) -> Optional[AlarmEvent]:
        key = f"{hb.pipeline_id}:{hb.device_id}"

        elapsed = (datetime.now(timezone.utc) - hb.last_seen).total_seconds()
        level = (
            AlarmLevel.CRITICAL
            if elapsed > self._critical_offline_threshold
            else AlarmLevel.WARNING
        )

        alert = OfflineAlert(
            alert_id=str(uuid.uuid4()),
            device_id=hb.device_id,
            pipeline_id=hb.pipeline_id,
            offline_since=hb.last_seen,
            alert_level=level,
            status=AlarmStatus.PENDING,
            last_seen=hb.last_seen,
        )
        self._offline_alerts[key] = alert

        from app.constants import ParameterType, ThresholdCondition, ParameterUnit

        return AlarmEvent(
            alarm_id=alert.alert_id,
            device_id=hb.device_id,
            pipeline_id=hb.pipeline_id,
            param_type=ParameterType.POTENTIAL,
            alarm_level=level,
            condition=ThresholdCondition.OUT_OF_RANGE,
            threshold_value=self._offline_threshold,
            actual_value=elapsed,
            unit=ParameterUnit.MILLIVOLT,
            timestamp=datetime.now(timezone.utc),
            status=AlarmStatus.PENDING,
            message=(
                f"【{level.value}】监测点离线告警 - 设备[{hb.device_id}] "
                f"管道[{hb.pipeline_id}] 已离线 {elapsed:.0f}秒"
            ),
            metadata={
                "alert_type": "offline",
                "last_seen": hb.last_seen.isoformat(),
                "location": hb.location,
                "heartbeat_count": hb.heartbeat_count,
            },
        )

    async def _escalate_offline_alarm(
        self, hb: MonitorPointHeartbeat, alert: OfflineAlert
    ) -> Optional[AlarmEvent]:
        alert.alert_level = AlarmLevel.CRITICAL
        alert.status = AlarmStatus.ESCALATED

        from app.constants import ParameterType, ThresholdCondition, ParameterUnit

        elapsed = (datetime.now(timezone.utc) - hb.last_seen).total_seconds()

        return AlarmEvent(
            alarm_id=str(uuid.uuid4()),
            device_id=hb.device_id,
            pipeline_id=hb.pipeline_id,
            param_type=ParameterType.POTENTIAL,
            alarm_level=AlarmLevel.CRITICAL,
            condition=ThresholdCondition.OUT_OF_RANGE,
            threshold_value=self._critical_offline_threshold,
            actual_value=elapsed,
            unit=ParameterUnit.MILLIVOLT,
            timestamp=datetime.now(timezone.utc),
            status=AlarmStatus.ESCALATED,
            message=(
                f"【严重】监测点离线升级告警 - 设备[{hb.device_id}] "
                f"管道[{hb.pipeline_id}] 已离线超过 {elapsed:.0f}秒，请立即处理"
            ),
            metadata={
                "alert_type": "offline_escalation",
                "original_alert_id": alert.alert_id,
                "last_seen": hb.last_seen.isoformat(),
                "location": hb.location,
            },
        )

    async def _handle_recovery(self, key: str, hb: MonitorPointHeartbeat):
        alert = self._offline_alerts.get(key)
        if alert:
            alert.status = AlarmStatus.RESOLVED
            alert.resolved_at = datetime.now(timezone.utc)
            hb.offline_notified = False

            logger.info(
                "Monitor point recovered: %s (offline for %.0fs)",
                key,
                (alert.resolved_at - alert.offline_since).total_seconds(),
            )

            from app.constants import ParameterType, ThresholdCondition, ParameterUnit

            recovery_alarm = AlarmEvent(
                alarm_id=str(uuid.uuid4()),
                device_id=hb.device_id,
                pipeline_id=hb.pipeline_id,
                param_type=ParameterType.POTENTIAL,
                alarm_level=AlarmLevel.INFO,
                condition=ThresholdCondition.RANGE,
                threshold_value=self._offline_threshold,
                actual_value=0,
                unit=ParameterUnit.MILLIVOLT,
                timestamp=datetime.now(timezone.utc),
                status=AlarmStatus.RESOLVED,
                message=(
                    f"【恢复通知】监测点[{hb.device_id}]已恢复在线，"
                    f"离线时长 {(alert.resolved_at - alert.offline_since).total_seconds():.0f}秒"
                ),
                metadata={
                    "alert_type": "recovery",
                    "resolved_at": alert.resolved_at.isoformat(),
                    "offline_duration": (alert.resolved_at - alert.offline_since).total_seconds(),
                },
            )

            for callback in self._callbacks:
                try:
                    await callback(recovery_alarm)
                except Exception as e:
                    logger.error("Recovery callback failed: %s", e)

    async def _cleanup_stale_entries(self):
        now = datetime.now(timezone.utc)
        stale_keys = []
        for key, hb in self._heartbeats.items():
            if (now - hb.last_seen).total_seconds() > 86400 * 7:
                stale_keys.append(key)
        for key in stale_keys:
            del self._heartbeats[key]
            if key in self._offline_alerts:
                del self._offline_alerts[key]
        if stale_keys:
            logger.info("Cleaned up %d stale monitor points", len(stale_keys))

    def get_online_count(self) -> int:
        return sum(1 for hb in self._heartbeats.values() if hb.is_online)

    def get_offline_count(self) -> int:
        return sum(1 for hb in self._heartbeats.values() if not hb.is_online)

    def get_monitor_point_status(self, device_id: str, pipeline_id: str) -> Optional[dict]:
        key = f"{pipeline_id}:{device_id}"
        hb = self._heartbeats.get(key)
        if not hb:
            return None
        now = datetime.now(timezone.utc)
        return {
            "device_id": hb.device_id,
            "pipeline_id": hb.pipeline_id,
            "is_online": hb.is_online,
            "last_seen": hb.last_seen.isoformat(),
            "elapsed_seconds": (now - hb.last_seen).total_seconds(),
            "heartbeat_count": hb.heartbeat_count,
            "missed_count": hb.missed_count,
            "consecutive_missed": hb.consecutive_missed,
            "location": hb.location,
        }

    def get_all_status(self) -> List[dict]:
        return [
            self.get_monitor_point_status(hb.device_id, hb.pipeline_id)
            for hb in self._heartbeats.values()
        ]

    def get_statistics(self) -> dict:
        online = self.get_online_count()
        offline = self.get_offline_count()
        total = online + offline
        pending_alerts = sum(
            1
            for a in self._offline_alerts.values()
            if a.status == AlarmStatus.PENDING
        )
        return {
            "total_monitor_points": total,
            "online": online,
            "offline": offline,
            "offline_rate": (offline / total * 100) if total > 0 else 0,
            "pending_offline_alerts": pending_alerts,
            "active_offline_alerts": len(self._offline_alerts),
        }

    def register_callback(self, callback: Callable):
        self._callbacks.append(callback)
        logger.info("Registered offline alert callback")

    async def sync_from_redis(self):
        if not self._redis_client:
            return
        try:
            keys = await self._redis_client.keys("cp:heartbeat:*")
            for key in keys:
                data = await self._redis_client.get(key)
                if data:
                    import json

                    hb_data = json.loads(data)
                    device_id = hb_data["device_id"]
                    pipeline_id = hb_data["pipeline_id"]
                    cache_key = f"{pipeline_id}:{device_id}"
                    if cache_key not in self._heartbeats:
                        self._heartbeats[cache_key] = MonitorPointHeartbeat(
                            device_id=device_id,
                            pipeline_id=pipeline_id,
                            last_seen=datetime.fromisoformat(hb_data["last_seen"]),
                            is_online=hb_data.get("is_online", True),
                            heartbeat_count=hb_data.get("heartbeat_count", 0),
                            location=hb_data.get("location", ""),
                        )
            logger.info("Synced %d heartbeat entries from Redis", len(keys))
        except Exception as e:
            logger.error("Failed to sync heartbeats from Redis: %s", e)


import json