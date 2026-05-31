from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta
import threading
import logging
from .node_monitor import SystemMetrics
from .task_monitor import TaskInfo, TaskState

logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    INFO = 'info'
    WARNING = 'warning'
    ERROR = 'error'
    CRITICAL = 'critical'


@dataclass
class Alert:
    alert_id: str
    level: AlertLevel
    source: str
    message: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'alert_id': self.alert_id,
            'level': self.level.value,
            'source': self.source,
            'message': self.message,
            'timestamp': self.timestamp.isoformat(),
            'resolved': self.resolved,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'metadata': self.metadata
        }


class AlertManager:
    def __init__(self, retention_hours: int = 72,
                 on_alert: Optional[Callable[[Alert], None]] = None):
        self._alerts: Dict[str, Alert] = {}
        self._retention_hours = retention_hours
        self._lock = threading.RLock()
        self._on_alert = on_alert
        self._suppressed_alerts: set = set()
        self._alert_count = {level.value: 0 for level in AlertLevel}
        self._thresholds = {
            'cpu_percent': 90.0,
            'memory_percent': 90.0,
            'disk_percent': 85.0,
            'task_duration_seconds': 3600,
            'task_retries': 3
        }
        self._cooldown_period = timedelta(minutes=5)
        self._last_alert_time: Dict[str, datetime] = {}
    
    def set_thresholds(self, thresholds: Dict[str, float]) -> None:
        self._thresholds.update(thresholds)
    
    def suppress_alert(self, alert_id: str) -> None:
        with self._lock:
            self._suppressed_alerts.add(alert_id)
    
    def unsuppress_alert(self, alert_id: str) -> None:
        with self._lock:
            self._suppressed_alerts.discard(alert_id)
    
    def _can_alert(self, alert_key: str) -> bool:
        now = datetime.utcnow()
        last_alert = self._last_alert_time.get(alert_key)
        if last_alert and (now - last_alert) < self._cooldown_period:
            return False
        self._last_alert_time[alert_key] = now
        return True
    
    def create_alert(self, level: AlertLevel, source: str, message: str,
                     metadata: Optional[Dict[str, Any]] = None,
                     alert_key: Optional[str] = None) -> Optional[Alert]:
        if alert_key and not self._can_alert(alert_key):
            return None
        with self._lock:
            import uuid
            alert_id = str(uuid.uuid4())
            alert = Alert(
                alert_id=alert_id,
                level=level,
                source=source,
                message=message,
                metadata=metadata or {}
            )
            self._alerts[alert_id] = alert
            self._alert_count[level.value] += 1
            if alert_id in self._suppressed_alerts:
                return alert
            logger.log(
                logging.INFO if level == AlertLevel.INFO else
                logging.WARNING if level == AlertLevel.WARNING else
                logging.ERROR if level == AlertLevel.ERROR else
                logging.CRITICAL,
                f"ALERT [{level.value}] {source}: {message}"
            )
            if self._on_alert:
                try:
                    self._on_alert(alert)
                except Exception as e:
                    logger.error(f"Error in alert callback: {e}")
            return alert
    
    def resolve_alert(self, alert_id: str, resolution_message: Optional[str] = None) -> bool:
        with self._lock:
            alert = self._alerts.get(alert_id)
            if alert is None or alert.resolved:
                return False
            alert.resolved = True
            alert.resolved_at = datetime.utcnow()
            if resolution_message:
                alert.metadata['resolution'] = resolution_message
            logger.info(f"Resolved alert {alert_id}: {alert.message}")
            return True
    
    def check_system_metrics(self, metrics: SystemMetrics) -> List[Alert]:
        alerts = []
        source = f"node:{metrics.cpu_count}"
        if metrics.cpu_percent > self._thresholds['cpu_percent']:
            alert = self.create_alert(
                level=AlertLevel.WARNING if metrics.cpu_percent < 95 else AlertLevel.ERROR,
                source=source,
                message=f"High CPU usage: {metrics.cpu_percent:.1f}%",
                metadata={'cpu_percent': metrics.cpu_percent},
                alert_key='high_cpu'
            )
            if alert:
                alerts.append(alert)
        if metrics.memory_percent > self._thresholds['memory_percent']:
            alert = self.create_alert(
                level=AlertLevel.WARNING if metrics.memory_percent < 95 else AlertLevel.CRITICAL,
                source=source,
                message=f"High memory usage: {metrics.memory_percent:.1f}%",
                metadata={'memory_percent': metrics.memory_percent,
                          'memory_available_gb': metrics.memory_available_gb},
                alert_key='high_memory'
            )
            if alert:
                alerts.append(alert)
        if metrics.disk_percent > self._thresholds['disk_percent']:
            alert = self.create_alert(
                level=AlertLevel.WARNING,
                source=source,
                message=f"High disk usage: {metrics.disk_percent:.1f}%",
                metadata={'disk_percent': metrics.disk_percent},
                alert_key='high_disk'
            )
            if alert:
                alerts.append(alert)
        if metrics.temperature_celsius and metrics.temperature_celsius > 85:
            alert = self.create_alert(
                level=AlertLevel.CRITICAL,
                source=source,
                message=f"High temperature: {metrics.temperature_celsius:.1f}°C",
                metadata={'temperature_celsius': metrics.temperature_celsius},
                alert_key='high_temperature'
            )
            if alert:
                alerts.append(alert)
        return alerts
    
    def check_task(self, task: TaskInfo) -> List[Alert]:
        alerts = []
        source = f"task:{task.task_id}"
        if task.retry_count > self._thresholds['task_retries']:
            alert = self.create_alert(
                level=AlertLevel.WARNING,
                source=source,
                message=f"Task {task.name} has been retried {task.retry_count} times",
                metadata={'task_id': task.task_id, 'retry_count': task.retry_count},
                alert_key=f'task_retries_{task.task_id}'
            )
            if alert:
                alerts.append(alert)
        if task.state == TaskState.RUNNING and task.duration_seconds() > self._thresholds['task_duration_seconds']:
            alert = self.create_alert(
                level=AlertLevel.WARNING,
                source=source,
                message=f"Task {task.name} is running for {task.duration_seconds():.0f}s",
                metadata={'task_id': task.task_id, 'duration': task.duration_seconds()},
                alert_key=f'long_running_{task.task_id}'
            )
            if alert:
                alerts.append(alert)
        if task.state == TaskState.FAILURE:
            alert = self.create_alert(
                level=AlertLevel.ERROR,
                source=source,
                message=f"Task {task.name} failed: {task.error_message}",
                metadata={'task_id': task.task_id, 'error': task.error_message},
                alert_key=f'task_failed_{task.task_id}'
            )
            if alert:
                alerts.append(alert)
        return alerts
    
    def get_alert(self, alert_id: str) -> Optional[Alert]:
        with self._lock:
            return self._alerts.get(alert_id)
    
    def get_alerts_by_level(self, level: AlertLevel,
                            include_resolved: bool = False) -> List[Alert]:
        with self._lock:
            return [
                alert for alert in self._alerts.values()
                if alert.level == level and (include_resolved or not alert.resolved)
            ]
    
    def get_active_alerts(self) -> List[Alert]:
        with self._lock:
            return [alert for alert in self._alerts.values() if not alert.resolved]
    
    def get_recent_alerts(self, minutes: int = 60,
                          level: Optional[AlertLevel] = None) -> List[Alert]:
        with self._lock:
            cutoff = datetime.utcnow() - timedelta(minutes=minutes)
            return [
                alert for alert in self._alerts.values()
                if alert.timestamp >= cutoff and (level is None or alert.level == level)
            ]
    
    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            active = self.get_active_alerts()
            by_level = {}
            for level in AlertLevel:
                by_level[level.value] = len(self.get_alerts_by_level(level))
            return {
                'total_alerts': len(self._alerts),
                'active_alerts': len(active),
                'resolved_alerts': len(self._alerts) - len(active),
                'by_level': by_level,
                'total_by_level': self._alert_count.copy(),
                'suppressed_count': len(self._suppressed_alerts)
            }
    
    def cleanup_old_alerts(self) -> int:
        with self._lock:
            cutoff = datetime.utcnow() - timedelta(hours=self._retention_hours)
            to_remove = [
                alert_id for alert_id, alert in self._alerts.items()
                if alert.resolved and (alert.resolved_at or alert.timestamp) < cutoff
            ]
            for alert_id in to_remove:
                del self._alerts[alert_id]
            return len(to_remove)
    
    def list_all_alerts(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [alert.to_dict() for alert in self._alerts.values()]
