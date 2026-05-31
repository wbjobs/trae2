#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import random
import time
import logging
import threading
from typing import Dict, List, Optional, Callable
from datetime import datetime
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.models import SensorData


class SensorCollector:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.simulated = True
        self.serial_ports = config.get("gateway", {}).get("serial_ports", [])
        self.sensors = self._init_sensors()
        
        self.collection_interval_ms = config.get("gateway", {}).get("collection_interval_ms", 1000)
        self.batch_size = config.get("gateway", {}).get("collection_batch_size", 10)
        self.max_pending = config.get("gateway", {}).get("max_pending_collections", 100)
        
        self.pending_data: List[SensorData] = []
        self.data_lock = threading.Lock()
        self.collection_count = 0
        self.error_count = 0
        
        self.collecting = False
        self.collection_thread: Optional[threading.Thread] = None
        
        self._anomaly_base = {}

    def _init_sensors(self) -> List[Dict]:
        rooms = self.config.get("rooms", [])
        sensors = []
        for room in rooms:
            room_id = room["id"]
            room_sensors = [
                {"device_id": f"{room_id}_temp_01", "room_id": room_id, "type": "temperature", "unit": "°C"},
                {"device_id": f"{room_id}_hum_01", "room_id": room_id, "type": "humidity", "unit": "%"},
                {"device_id": f"{room_id}_curr_01", "room_id": room_id, "type": "current", "unit": "A"},
                {"device_id": f"{room_id}_volt_01", "room_id": room_id, "type": "voltage", "unit": "V"},
                {"device_id": f"{room_id}_arc_01", "room_id": room_id, "type": "arc", "unit": "次"},
                {"device_id": f"{room_id}_smoke_01", "room_id": room_id, "type": "smoke", "unit": "ppm"},
            ]
            sensors.extend(room_sensors)
        return sensors

    def collect_all(self) -> List[SensorData]:
        sensor_data_list = []
        batch_timestamp = datetime.now()
        
        for i, sensor in enumerate(self.sensors):
            try:
                data = self._collect_single(sensor)
                if data:
                    data.timestamp = batch_timestamp
                    sensor_data_list.append(data)
            except Exception as e:
                self.error_count += 1
                self.logger.error(f"Error collecting from {sensor['device_id']}: {e}")
        
        self.collection_count += 1
        
        with self.data_lock:
            self.pending_data.extend(sensor_data_list)
            if len(self.pending_data) > self.max_pending:
                overflow = len(self.pending_data) - self.max_pending
                self.pending_data = self.pending_data[-self.max_pending:]
                self.logger.warning(f"Pending data overflow, dropped {overflow} readings")
        
        return sensor_data_list

    def collect_batch(self, batch_size: int = None) -> List[SensorData]:
        if batch_size is None:
            batch_size = self.batch_size
        
        with self.data_lock:
            batch = self.pending_data[:batch_size]
            self.pending_data = self.pending_data[batch_size:]
            return batch

    def get_pending_count(self) -> int:
        with self.data_lock:
            return len(self.pending_data)

    def _collect_single(self, sensor: Dict) -> SensorData:
        if self.simulated:
            return self._simulate_collection(sensor)
        else:
            return self._read_hardware(sensor)

    def _simulate_collection(self, sensor: Dict) -> SensorData:
        sensor_type = sensor["type"]
        device_id = sensor["device_id"]
        
        base_ranges = {
            "temperature": (25, 35),
            "humidity": (40, 60),
            "current": (10, 50),
            "voltage": (210, 230),
            "arc": (0, 1),
            "smoke": (0, 10),
        }
        
        if device_id not in self._anomaly_base:
            self._anomaly_base[device_id] = {
                "value": None,
                "trend": 0,
                "last_update": time.time()
            }
        
        state = self._anomaly_base[device_id]
        
        min_val, max_val = base_ranges.get(sensor_type, (0, 100))
        
        if state["value"] is not None:
            trend = state["trend"]
            noise = random.uniform(-0.5, 0.5)
            value = state["value"] + trend + noise
            value = max(min_val, min(max_val, value))
            state["trend"] *= 0.95
        else:
            value = random.uniform(min_val, max_val)
        
        if random.random() < 0.03:
            if sensor_type == "temperature":
                value = random.uniform(45, 55)
                state["trend"] = random.uniform(-1, 1)
            elif sensor_type == "current":
                value = random.uniform(90, 120)
                state["trend"] = random.uniform(-2, 2)
            elif sensor_type == "smoke":
                value = random.uniform(60, 150)
                state["trend"] = random.uniform(-5, 5)
            elif sensor_type == "arc":
                value = random.randint(2, 5)
            elif sensor_type == "humidity":
                value = random.uniform(70, 90)
        
        state["value"] = value
        state["last_update"] = time.time()
        
        return SensorData(
            device_id=sensor["device_id"],
            room_id=sensor["room_id"],
            sensor_type=sensor_type,
            value=round(value, 2),
            unit=sensor["unit"],
            timestamp=datetime.now()
        )

    def _read_hardware(self, sensor: Dict) -> SensorData:
        try:
            import serial
            for port in self.serial_ports:
                try:
                    ser = serial.Serial(port, 9600, timeout=1)
                    ser.write(f"READ:{sensor['device_id']}\n".encode())
                    response = ser.readline().decode().strip()
                    ser.close()
                    
                    if response.startswith("OK:"):
                        value = float(response.split(":")[1])
                        return SensorData(
                            device_id=sensor["device_id"],
                            room_id=sensor["room_id"],
                            sensor_type=sensor["type"],
                            value=value,
                            unit=sensor["unit"]
                        )
                except Exception:
                    continue
        except ImportError:
            self.logger.warning("pyserial not available, using simulation mode")
            self.simulated = True
            return self._simulate_collection(sensor)
        
        return self._simulate_collection(sensor)

    def start_continuous_collection(self, callback: Callable, interval_ms: int = None):
        if interval_ms is None:
            interval_ms = self.collection_interval_ms
        
        self.collecting = True
        self.logger.info(f"Starting continuous sensor data collection (interval: {interval_ms}ms)")
        
        def collection_loop():
            last_collection = time.time()
            while self.collecting:
                try:
                    current_time = time.time()
                    elapsed = (current_time - last_collection) * 1000
                    
                    if elapsed >= interval_ms:
                        data_list = self.collect_all()
                        callback(data_list)
                        last_collection = current_time
                    else:
                        sleep_time = min((interval_ms - elapsed) / 1000, 0.1)
                        time.sleep(sleep_time)
                        
                except Exception as e:
                    self.logger.error(f"Collection error: {e}")
                    time.sleep(1)
        
        self.collection_thread = threading.Thread(target=collection_loop, daemon=True)
        self.collection_thread.start()

    def stop_continuous_collection(self):
        self.collecting = False
        if self.collection_thread:
            self.collection_thread.join(timeout=5)
        self.logger.info("Continuous collection stopped")

    def get_sensor_list(self) -> List[Dict]:
        return [
            {
                "device_id": s["device_id"],
                "room_id": s["room_id"],
                "type": s["type"],
                "unit": s["unit"]
            }
            for s in self.sensors
        ]

    def get_stats(self) -> Dict:
        return {
            "total_sensors": len(self.sensors),
            "collection_count": self.collection_count,
            "error_count": self.error_count,
            "pending_data_count": self.get_pending_count(),
            "is_collecting": self.collecting,
            "collection_interval_ms": self.collection_interval_ms
        }
