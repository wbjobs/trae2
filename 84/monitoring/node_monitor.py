from typing import Dict, Any, List, Optional, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
import threading
import time
from datetime import datetime
import logging
import numpy as np
from config import settings

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

logger = logging.getLogger(__name__)


class NodeStatus(Enum):
    ONLINE = 'online'
    OFFLINE = 'offline'
    BUSY = 'busy'
    IDLE = 'idle'
    WARNING = 'warning'
    ERROR = 'error'


@dataclass
class SystemMetrics:
    timestamp: datetime = field(default_factory=datetime.utcnow)
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    memory_used_gb: float = 0.0
    memory_available_gb: float = 0.0
    memory_total_gb: float = 0.0
    disk_percent: float = 0.0
    disk_used_gb: float = 0.0
    disk_total_gb: float = 0.0
    network_in_mbps: float = 0.0
    network_out_mbps: float = 0.0
    load_avg_1: float = 0.0
    load_avg_5: float = 0.0
    load_avg_15: float = 0.0
    cpu_count: int = 0
    cpu_freq_mhz: float = 0.0
    cpu_freq_max_mhz: float = 0.0
    cpu_percent_per_core: List[float] = field(default_factory=list)
    cpu_utilization_percent: float = 0.0
    memory_bandwidth_gbps: float = 0.0
    estimated_gflops: float = 0.0
    active_tasks: int = 0
    queue_length: int = 0
    workers_active: int = 0
    workers_idle: int = 0
    temperature_celsius: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp.isoformat(),
            'cpu_percent': float(self.cpu_percent),
            'memory_percent': float(self.memory_percent),
            'memory_used_gb': float(self.memory_used_gb),
            'memory_available_gb': float(self.memory_available_gb),
            'memory_total_gb': float(self.memory_total_gb),
            'disk_percent': float(self.disk_percent),
            'disk_used_gb': float(self.disk_used_gb),
            'disk_total_gb': float(self.disk_total_gb),
            'network_in_mbps': float(self.network_in_mbps),
            'network_out_mbps': float(self.network_out_mbps),
            'load_avg_1': float(self.load_avg_1),
            'load_avg_5': float(self.load_avg_5),
            'load_avg_15': float(self.load_avg_15),
            'cpu_count': int(self.cpu_count),
            'cpu_freq_mhz': float(self.cpu_freq_mhz),
            'cpu_freq_max_mhz': float(self.cpu_freq_max_mhz),
            'cpu_percent_per_core': [float(x) for x in self.cpu_percent_per_core],
            'cpu_utilization_percent': float(self.cpu_utilization_percent),
            'memory_bandwidth_gbps': float(self.memory_bandwidth_gbps),
            'estimated_gflops': float(self.estimated_gflops),
            'active_tasks': int(self.active_tasks),
            'queue_length': int(self.queue_length),
            'workers_active': int(self.workers_active),
            'workers_idle': int(self.workers_idle),
            'temperature_celsius': float(self.temperature_celsius) if self.temperature_celsius else None
        }
    
    def is_healthy(self, thresholds: Dict[str, float]) -> Tuple[bool, List[str]]:
        issues = []
        if self.cpu_percent > thresholds.get('cpu_percent', 90.0):
            issues.append(f"CPU usage {self.cpu_percent:.1f}% exceeds threshold")
        if self.memory_percent > thresholds.get('memory_percent', 90.0):
            issues.append(f"Memory usage {self.memory_percent:.1f}% exceeds threshold")
        if self.disk_percent > thresholds.get('disk_percent', 85.0):
            issues.append(f"Disk usage {self.disk_percent:.1f}% exceeds threshold")
        return len(issues) == 0, issues


class NodeMonitor:
    def __init__(self, node_name: Optional[str] = None,
                 interval: float = 5.0,
                 history_size: int = 1000):
        self.node_name = node_name or settings.node_name
        self.interval = interval
        self.history_size = history_size
        self._metrics_history: List[SystemMetrics] = []
        self._stop_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()
        self._callbacks: List[Callable[[SystemMetrics], None]] = []
        self._status = NodeStatus.OFFLINE
        self._last_metrics: Optional[SystemMetrics] = None
        self._prev_network_io = None
        self._prev_time = None
        self.thresholds = {
            'cpu_percent': 90.0,
            'memory_percent': 90.0,
            'disk_percent': 85.0,
            'max_tasks': settings.node_max_workers
        }
    
    def add_callback(self, callback: Callable[[SystemMetrics], None]) -> None:
        self._callbacks.append(callback)
    
    def remove_callback(self, callback: Callable[[SystemMetrics], None]) -> None:
        if callback in self._callbacks:
            self._callbacks.remove(callback)
    
    def collect_metrics(self) -> SystemMetrics:
        metrics = SystemMetrics()
        if not PSUTIL_AVAILABLE:
            logger.warning("psutil not available, returning empty metrics")
            metrics.cpu_count = 1
            return metrics
        metrics.cpu_count = psutil.cpu_count(logical=True)
        metrics.cpu_percent_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
        if metrics.cpu_percent_per_core:
            metrics.cpu_percent = float(np.mean(metrics.cpu_percent_per_core))
            active_cores = sum(1 for p in metrics.cpu_percent_per_core if p > 10.0)
            metrics.cpu_utilization_percent = (active_cores / max(1, metrics.cpu_count)) * 100
        else:
            metrics.cpu_percent = psutil.cpu_percent(interval=0.1)
        try:
            freq = psutil.cpu_freq()
            if freq:
                metrics.cpu_freq_mhz = freq.current
                metrics.cpu_freq_max_mhz = freq.max
        except Exception:
            pass
        FLOPS_PER_CYCLE = 8.0
        cpu_freq_ghz = max(0.001, metrics.cpu_freq_mhz / 1000.0)
        metrics.estimated_gflops = cpu_freq_ghz * FLOPS_PER_CYCLE * metrics.cpu_count
        memory = psutil.virtual_memory()
        metrics.memory_total_gb = memory.total / (1024 ** 3)
        metrics.memory_used_gb = memory.used / (1024 ** 3)
        metrics.memory_available_gb = memory.available / (1024 ** 3)
        metrics.memory_percent = memory.percent
        metrics.memory_bandwidth_gbps = metrics.memory_used_gb / max(0.001, metrics.memory_total_gb) * 20.0
        try:
            disk = psutil.disk_usage('/')
            metrics.disk_total_gb = disk.total / (1024 ** 3)
            metrics.disk_used_gb = disk.used / (1024 ** 3)
            metrics.disk_percent = disk.percent
        except Exception:
            pass
        try:
            load_avg = psutil.getloadavg()
            metrics.load_avg_1 = load_avg[0]
            metrics.load_avg_5 = load_avg[1]
            metrics.load_avg_15 = load_avg[2]
        except Exception:
            pass
        current_time = time.time()
        current_network = psutil.net_io_counters()
        if self._prev_network_io and self._prev_time:
            dt = current_time - self._prev_time
            if dt > 0:
                bytes_in = current_network.bytes_recv - self._prev_network_io.bytes_recv
                bytes_out = current_network.bytes_sent - self._prev_network_io.bytes_sent
                metrics.network_in_mbps = (bytes_in * 8 / dt) / (1024 * 1024)
                metrics.network_out_mbps = (bytes_out * 8 / dt) / (1024 * 1024)
        self._prev_network_io = current_network
        self._prev_time = current_time
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                for name, entries in temps.items():
                    for entry in entries:
                        if entry.current:
                            metrics.temperature_celsius = entry.current
                            break
                    if metrics.temperature_celsius:
                        break
        except Exception:
            pass
        metrics.active_tasks = self._count_active_tasks()
        workers_active, workers_idle = self._count_workers()
        metrics.workers_active = workers_active
        metrics.workers_idle = workers_idle
        metrics.queue_length = self._get_queue_length()
        metrics.timestamp = datetime.utcnow()
        return metrics
    
    def _count_active_tasks(self) -> int:
        try:
            from scheduler.celery_app import app
            inspect = app.control.inspect()
            active = inspect.active()
            if active:
                return sum(len(tasks) for tasks in active.values())
            return 0
        except Exception:
            return 0
    
    def _count_workers(self) -> Tuple[int, int]:
        try:
            from scheduler.celery_app import app
            inspect = app.control.inspect()
            stats = inspect.stats()
            active = inspect.active()
            if not stats:
                return 0, 0
            total_workers = sum(len(s.get('pool', {}).get('processes', [])) for s in stats.values())
            active_workers = sum(len(tasks) for tasks in active.values()) if active else 0
            idle_workers = max(0, total_workers - active_workers)
            return active_workers, idle_workers
        except Exception:
            return 0, 0
    
    def _get_queue_length(self) -> int:
        try:
            from scheduler.celery_app import app
            with app.connection_or_acquire() as conn:
                queue_names = ['compute', 'simulation', 'storage', 'monitoring']
                total = 0
                for qname in queue_names:
                    try:
                        queue = conn.default_channel.queue_declare(queue=qname, passive=True)
                        total += queue.message_count
                    except Exception:
                        pass
                return total
        except Exception:
            return 0
    
    def _monitor_loop(self) -> None:
        logger.info(f"Starting node monitor for {self.node_name}")
        self._status = NodeStatus.ONLINE
        while not self._stop_event.is_set():
            try:
                metrics = self.collect_metrics()
                with self._lock:
                    self._last_metrics = metrics
                    self._metrics_history.append(metrics)
                    if len(self._metrics_history) > self.history_size:
                        self._metrics_history = self._metrics_history[-self.history_size:]
                    healthy, issues = metrics.is_healthy(self.thresholds)
                    if not healthy:
                        self._status = NodeStatus.WARNING
                        logger.warning(f"Node {self.node_name} health issues: {issues}")
                    else:
                        if metrics.cpu_percent > 70 or metrics.active_tasks > 0:
                            self._status = NodeStatus.BUSY
                        else:
                            self._status = NodeStatus.IDLE
                for callback in self._callbacks:
                    try:
                        callback(metrics)
                    except Exception as e:
                        logger.error(f"Error in metrics callback: {e}")
            except Exception as e:
                logger.error(f"Error collecting metrics: {e}")
                self._status = NodeStatus.ERROR
            self._stop_event.wait(self.interval)
        self._status = NodeStatus.OFFLINE
        logger.info(f"Stopped node monitor for {self.node_name}")
    
    def start(self) -> None:
        if self._monitor_thread is not None and self._monitor_thread.is_alive():
            return
        self._stop_event.clear()
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()
    
    def stop(self) -> None:
        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=10)
            self._monitor_thread = None
    
    def get_current_metrics(self) -> Optional[SystemMetrics]:
        with self._lock:
            return self._last_metrics
    
    def get_metrics_history(self, last_n: Optional[int] = None) -> List[SystemMetrics]:
        with self._lock:
            if last_n is None:
                return list(self._metrics_history)
            return list(self._metrics_history[-last_n:])
    
    def get_status(self) -> NodeStatus:
        return self._status
    
    def get_health_report(self) -> Dict[str, Any]:
        metrics = self.get_current_metrics()
        if metrics is None:
            return {
                'node_name': self.node_name,
                'status': self._status.value,
                'healthy': False,
                'message': 'No metrics available'
            }
        healthy, issues = metrics.is_healthy(self.thresholds)
        return {
            'node_name': self.node_name,
            'status': self._status.value,
            'healthy': healthy,
            'issues': issues,
            'metrics': metrics.to_dict(),
            'thresholds': self.thresholds
        }
    
    def is_running(self) -> bool:
        return self._monitor_thread is not None and self._monitor_thread.is_alive()
    
    def set_thresholds(self, thresholds: Dict[str, float]) -> None:
        self.thresholds.update(thresholds)
    
    def __enter__(self):
        self.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
