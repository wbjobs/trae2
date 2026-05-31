import psutil
import time
import threading
import logging
import platform
import os
from typing import Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def _get_windows_temperature() -> Dict:
    try:
        if platform.system() != "Windows":
            return {}
        try:
            import wmi
            w = wmi.WMI(namespace=r"root\wmi")
            temp_info = w.MSAcpi_ThermalZoneTemperature()
            temps = {}
            for i, sensor in enumerate(temp_info):
                try:
                    temp_celsius = (sensor.CurrentTemperature - 2732) / 10.0
                    temps[f"sensor_{i}"] = round(temp_celsius, 2)
                except Exception:
                    pass
            return temps if temps else {}
        except ImportError:
            logger.debug("wmi module not available for Windows temperature reading")
            return {}
    except Exception as e:
        logger.debug(f"Windows temperature read failed: {e}")
        return {}


def _get_linux_temperature() -> Dict:
    try:
        if platform.system() != "Linux":
            return {}
        temps = {}
        thermal_paths = [
            "/sys/class/thermal/thermal_zone0/temp",
            "/sys/class/thermal/thermal_zone1/temp",
        ]
        for i, path in enumerate(thermal_paths):
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        temp_milli = int(f.read().strip())
                        temps[f"zone_{i}"] = round(temp_milli / 1000.0, 2)
                except Exception:
                    pass
        return temps if temps else {}
    except Exception as e:
        logger.debug(f"Linux temperature read failed: {e}")
        return {}


def _get_psutil_temperature() -> Dict:
    try:
        if hasattr(psutil, "sensors_temperatures"):
            temps = psutil.sensors_temperatures()
            result = {}
            for sensor_name, entries in temps.items():
                for i, entry in enumerate(entries):
                    key = f"{sensor_name}_{i}" if len(entries) > 1 else sensor_name
                    result[key] = round(entry.current, 2) if entry.current is not None else None
            return {k: v for k, v in result.items() if v is not None}
        return {}
    except Exception as e:
        logger.debug(f"psutil temperature read failed: {e}")
        return {}


def _get_cpu_load_windows() -> Dict:
    try:
        cpu_count = psutil.cpu_count() or 1
        cpu_percent = psutil.cpu_percent(interval=0.1, percpu=True)
        avg_load = sum(cpu_percent) / len(cpu_percent) if cpu_percent else 0
        return {
            "1min_approx": round(avg_load, 2),
            "5min_approx": round(avg_load * 0.8, 2),
            "15min_approx": round(avg_load * 0.5, 2),
            "per_cpu": [round(p, 2) for p in cpu_percent],
            "cpu_count": cpu_count,
        }
    except Exception as e:
        logger.debug(f"Windows CPU load approximation failed: {e}")
        return {}


def _get_disk_path() -> str:
    if platform.system() == "Windows":
        return "C:\\"
    return "/"


class NodeMonitor:

    def __init__(self, node_id: Optional[str] = None, heartbeat_interval: int = 10):
        self.node_id = node_id or f"node-{id(self)}"
        self.heartbeat_interval = heartbeat_interval
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._status: Dict = {}
        self._task_history: List[Dict] = []
        self._start_time: Optional[float] = None
        self._platform = platform.system()

    def collect_metrics(self) -> Dict:
        cpu_percent = psutil.cpu_percent(interval=0.5)
        memory = psutil.virtual_memory()
        disk_path = _get_disk_path()
        disk = psutil.disk_usage(disk_path)

        metrics = {
            "node_id": self.node_id,
            "timestamp": datetime.utcnow().isoformat(),
            "platform": self._platform,
            "cpu": {
                "percent": cpu_percent,
                "count": psutil.cpu_count(),
                "freq": psutil.cpu_freq()._asdict() if psutil.cpu_freq() else {},
                "per_core_percent": psutil.cpu_percent(interval=None, percpu=True),
            },
            "memory": {
                "total_gb": round(memory.total / (1024**3), 2),
                "available_gb": round(memory.available / (1024**3), 2),
                "used_percent": memory.percent,
                "used_gb": round(memory.used / (1024**3), 2),
            },
            "disk": {
                "path": disk_path,
                "total_gb": round(disk.total / (1024**3), 2),
                "free_gb": round(disk.free / (1024**3), 2),
                "used_percent": disk.percent,
                "used_gb": round(disk.used / (1024**3), 2),
            },
            "uptime_seconds": time.time() - self._start_time if self._start_time else 0,
        }

        temperature = {}
        temp_psutil = _get_psutil_temperature()
        if temp_psutil:
            temperature.update(temp_psutil)
        if self._platform == "Windows" and not temperature:
            temperature.update(_get_windows_temperature())
        elif self._platform == "Linux" and not temperature:
            temperature.update(_get_linux_temperature())
        metrics["temperature"] = temperature if temperature else {}

        if self._platform == "Linux":
            try:
                load_avg = psutil.getloadavg()
                metrics["load_avg"] = {
                    "1min": load_avg[0],
                    "5min": load_avg[1],
                    "15min": load_avg[2],
                }
            except (AttributeError, OSError) as e:
                logger.debug(f"Linux loadavg read failed: {e}")
                metrics["load_avg"] = _get_cpu_load_windows()
        else:
            metrics["load_avg"] = _get_cpu_load_windows()

        try:
            net_io = psutil.net_io_counters()
            metrics["network"] = {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv,
                "packets_sent": net_io.packets_sent,
                "packets_recv": net_io.packets_recv,
            }
        except Exception as e:
            logger.debug(f"Network metrics read failed: {e}")
            metrics["network"] = {}

        self._status = metrics
        return metrics

    def get_node_status(self) -> Dict:
        if not self._status:
            return self.collect_metrics()
        return self._status

    def get_temperatures(self) -> Dict:
        status = self.get_node_status()
        return status.get("temperature", {})

    def get_average_temperature(self) -> Optional[float]:
        temps = self.get_temperatures()
        if not temps:
            return None
        values = [v for v in temps.values() if isinstance(v, (int, float))]
        return round(sum(values) / len(values), 2) if values else None

    def record_task(self, task_id: str, task_name: str, status: str, duration: float = 0.0):
        record = {
            "task_id": task_id,
            "task_name": task_name,
            "status": status,
            "duration_seconds": duration,
            "timestamp": datetime.utcnow().isoformat(),
        }
        self._task_history.append(record)
        if len(self._task_history) > 1000:
            self._task_history = self._task_history[-500:]

    def get_task_history(self, limit: int = 50) -> List[Dict]:
        return self._task_history[-limit:]

    def start_heartbeat(self):
        if self._running:
            return
        self._running = True
        self._start_time = time.time()
        self._thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._thread.start()
        logger.info(f"Node {self.node_id} heartbeat started on {self._platform}")

    def stop_heartbeat(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info(f"Node {self.node_id} heartbeat stopped")

    def _heartbeat_loop(self):
        while self._running:
            try:
                self.collect_metrics()
            except Exception as e:
                logger.error(f"Heartbeat collection error: {e}")
            time.sleep(self.heartbeat_interval)

    def is_healthy(self) -> bool:
        if not self._status:
            return False
        cpu_ok = self._status.get("cpu", {}).get("percent", 0) < 95
        mem_ok = self._status.get("memory", {}).get("used_percent", 0) < 95
        disk_ok = self._status.get("disk", {}).get("used_percent", 0) < 98

        temp_ok = True
        avg_temp = self.get_average_temperature()
        if avg_temp is not None and avg_temp > 90:
            temp_ok = False

        return cpu_ok and mem_ok and disk_ok and temp_ok

    def get_health_report(self) -> Dict:
        metrics = self.get_node_status()
        healthy = self.is_healthy()
        issues = []
        if metrics.get("cpu", {}).get("percent", 0) > 90:
            issues.append("CPU usage above 90%")
        if metrics.get("memory", {}).get("used_percent", 0) > 90:
            issues.append("Memory usage above 90%")
        if metrics.get("disk", {}).get("used_percent", 0) > 95:
            issues.append("Disk usage above 95%")
        avg_temp = self.get_average_temperature()
        if avg_temp is not None and avg_temp > 85:
            issues.append(f"Temperature above 85C ({avg_temp}C)")

        return {
            "node_id": self.node_id,
            "platform": self._platform,
            "healthy": healthy,
            "issues": issues,
            "metrics": metrics,
            "task_count": len(self._task_history),
            "avg_temperature_c": avg_temp,
        }
