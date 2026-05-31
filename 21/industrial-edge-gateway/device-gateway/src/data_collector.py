"""
数据采集器 - 定时采集设备数据
"""
import threading
import time
from typing import Callable, Dict, List, Optional
from datetime import datetime
from .device_manager import DeviceManager
from shared.src.logger import get_logger

logger = get_logger("data_collector")


class DataCollector:
    """数据采集器 - 定时轮询设备数据"""

    def __init__(self, device_manager: DeviceManager):
        self._device_manager = device_manager
        self._schedules: Dict[str, Dict] = {}
        self._threads: Dict[str, threading.Thread] = {}
        self._callbacks: List[Callable] = []
        self._running = False

    def start(self):
        self._running = True
        logger.info("数据采集器已启动")

    def stop(self):
        self._running = False
        for device_id in list(self._threads.keys()):
            self._stop_collection(device_id)
        logger.info("数据采集器已停止")

    def add_schedule(self, device_id: str, points: List[Dict], interval: float = 1.0):
        self._schedules[device_id] = {
            "points": points,
            "interval": interval,
            "enabled": True,
        }
        self._start_collection(device_id)
        logger.info(f"添加采集计划: {device_id}, 间隔: {interval}s")

    def remove_schedule(self, device_id: str):
        if device_id in self._schedules:
            self._stop_collection(device_id)
            del self._schedules[device_id]
            logger.info(f"移除采集计划: {device_id}")

    def _start_collection(self, device_id: str):
        if device_id in self._threads and self._threads[device_id].is_alive():
            return

        thread = threading.Thread(
            target=self._collect_loop,
            args=(device_id,),
            daemon=True,
            name=f"collector-{device_id}"
        )
        self._threads[device_id] = thread
        thread.start()

    def _stop_collection(self, device_id: str):
        if device_id in self._schedules:
            self._schedules[device_id]["enabled"] = False

    def _collect_loop(self, device_id: str):
        while self._running:
            schedule = self._schedules.get(device_id)
            if not schedule or not schedule.get("enabled", False):
                break

            try:
                points = schedule["points"]
                results = self._device_manager.read_device_points(device_id, points)
                
                for callback in self._callbacks:
                    try:
                        callback(device_id, results)
                    except Exception as e:
                        logger.error(f"回调执行失败: {e}")

            except Exception as e:
                logger.error(f"数据采集失败 {device_id}: {e}")

            time.sleep(schedule["interval"])

    def register_callback(self, callback: Callable):
        self._callbacks.append(callback)

    def unregister_callback(self, callback: Callable):
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    def get_schedules(self) -> Dict:
        return {
            device_id: {
                "points": schedule["points"],
                "interval": schedule["interval"],
                "enabled": schedule["enabled"],
            }
            for device_id, schedule in self._schedules.items()
        }