"""
设备管理器 - 管理设备连接和状态
"""
import json
import os
import threading
import time
from typing import Dict, List, Optional
from datetime import datetime
from shared.src.models import DeviceInfo, DataPoint, ProtocolType, ServiceStatus
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("device_manager")


class ConnectionPool:
    """设备连接池 - 管理活跃的协议连接"""

    def __init__(self, max_connections: int = 100):
        self._max_connections = max_connections
        self._connections: Dict[str, any] = {}
        self._lock = threading.Lock()

    def add_connection(self, device_id: str, parser: any, device: DeviceInfo):
        with self._lock:
            if len(self._connections) >= self._max_connections:
                self._evict_oldest()
            self._connections[device_id] = {
                "parser": parser,
                "device": device,
                "connected_at": datetime.utcnow(),
                "last_used": datetime.utcnow(),
            }

    def get_connection(self, device_id: str) -> Optional[Dict]:
        with self._lock:
            conn = self._connections.get(device_id)
            if conn:
                conn["last_used"] = datetime.utcnow()
            return conn

    def remove_connection(self, device_id: str) -> bool:
        with self._lock:
            if device_id in self._connections:
                conn = self._connections[device_id]
                try:
                    conn["parser"].disconnect()
                except Exception:
                    pass
                del self._connections[device_id]
                return True
            return False

    def _evict_oldest(self):
        if self._connections:
            oldest = min(self._connections, key=lambda k: self._connections[k]["last_used"])
            self.remove_connection(oldest)

    def get_all_connections(self) -> Dict:
        return dict(self._connections)

    def get_stats(self) -> Dict:
        return {
            "active_connections": len(self._connections),
            "max_connections": self._max_connections,
        }


class DeviceManager:
    """设备管理器"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        service_config = config.get("services", "device_gateway")
        self._pool = ConnectionPool(service_config.get("max_connections", 100))
        self._devices: Dict[str, DeviceInfo] = {}
        self._devices_file = "devices.json"
        self._load_devices()

    def _load_devices(self):
        if os.path.exists(self._devices_file):
            try:
                with open(self._devices_file, "r", encoding="utf-8") as f:
                    devices_data = json.load(f)
                for device_data in devices_data:
                    device = DeviceInfo(
                        device_id=device_data["device_id"],
                        device_name=device_data["device_name"],
                        device_type=device_data.get("device_type", ""),
                        protocol=ProtocolType(device_data.get("protocol", "modbus_tcp")),
                        ip_address=device_data.get("ip_address", ""),
                        port=device_data.get("port", 502),
                        slave_id=device_data.get("slave_id", 1),
                        rack=device_data.get("rack", 0),
                        slot=device_data.get("slot", 1),
                    )
                    self._devices[device.device_id] = device
                logger.info(f"加载 {len(self._devices)} 个设备")
            except Exception as e:
                logger.error(f"加载设备失败: {e}")

    def _save_devices(self):
        try:
            devices_data = [device.to_dict() for device in self._devices.values()]
            with open(self._devices_file, "w", encoding="utf-8") as f:
                json.dump(devices_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"保存设备失败: {e}")

    def register_device(self, device_data: Dict) -> DeviceInfo:
        device = DeviceInfo(
            device_id=device_data.get("device_id", ""),
            device_name=device_data.get("device_name", ""),
            device_type=device_data.get("device_type", ""),
            protocol=ProtocolType(device_data.get("protocol", "modbus_tcp")),
            ip_address=device_data.get("ip_address", ""),
            port=device_data.get("port", 502),
            slave_id=device_data.get("slave_id", 1),
            rack=device_data.get("rack", 0),
            slot=device_data.get("slot", 1),
        )
        self._devices[device.device_id] = device
        self._save_devices()
        logger.info(f"注册设备: {device.device_name} ({device.device_id})")
        return device

    def unregister_device(self, device_id: str) -> bool:
        if device_id in self._devices:
            self._pool.remove_connection(device_id)
            del self._devices[device_id]
            self._save_devices()
            return True
        return False

    def get_device(self, device_id: str) -> Optional[DeviceInfo]:
        return self._devices.get(device_id)

    def get_all_devices(self) -> List[DeviceInfo]:
        return list(self._devices.values())

    def connect_device(self, device_id: str) -> bool:
        from protocol_parser.src.base import ProtocolFactory
        
        device = self._devices.get(device_id)
        if not device:
            logger.error(f"设备不存在: {device_id}")
            return False

        try:
            parser = ProtocolFactory.create(device.protocol)
            parser.connect(device)
            self._pool.add_connection(device_id, parser, device)
            device.status = "online"
            logger.info(f"设备已连接: {device.device_name}")
            return True
        except Exception as e:
            device.status = "error"
            logger.error(f"设备连接失败: {device.device_name}, 错误: {e}")
            return False

    def disconnect_device(self, device_id: str) -> bool:
        device = self._devices.get(device_id)
        if device:
            device.status = "offline"
        return self._pool.remove_connection(device_id)

    def is_device_connected(self, device_id: str) -> bool:
        return self._pool.get_connection(device_id) is not None

    def read_device_points(self, device_id: str, points: List[Dict]) -> List[Dict]:
        conn = self._pool.get_connection(device_id)
        if not conn:
            raise Exception(f"设备未连接: {device_id}")

        parser = conn["parser"]
        point_objects = [DataPoint(**p) for p in points]
        
        if len(point_objects) == 1:
            result = parser.read_point(point_objects[0])
            return [result.to_dict()]
        else:
            results = parser.read_points(point_objects)
            return [r.to_dict() for r in results]

    def write_device_points(self, device_id: str, points: List[Dict]) -> bool:
        conn = self._pool.get_connection(device_id)
        if not conn:
            raise Exception(f"设备未连接: {device_id}")

        parser = conn["parser"]
        for p in points:
            point = DataPoint(
                address=p.get("address"),
                data_type=p.get("data_type", "float32"),
                value=p.get("value"),
            )
            parser.write_point(point, point.value)
        return True

    def get_connected_devices(self) -> List[str]:
        return list(self._pool.get_all_connections().keys())

    def get_stats(self) -> Dict:
        return {
            "total_devices": len(self._devices),
            "online_devices": len(self.get_connected_devices()),
            "offline_devices": len(self._devices) - len(self.get_connected_devices()),
            "pool_stats": self._pool.get_stats(),
        }