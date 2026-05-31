"""
设备接入网关模块
负责设备连接管理、设备注册和数据采集调度
"""
from .device_manager import DeviceManager, ConnectionPool
from .data_collector import DataCollector
from .service import DeviceGatewayService

__all__ = [
    "DeviceManager",
    "ConnectionPool",
    "DataCollector",
    "DeviceGatewayService",
]

__version__ = "1.0.0"