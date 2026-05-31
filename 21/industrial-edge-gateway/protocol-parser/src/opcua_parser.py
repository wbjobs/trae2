"""
OPC UA 协议解析器
"""
from typing import Any, List, Optional
from datetime import datetime
from .base import ProtocolBase, ProtocolFactory
from shared.src.models import DataPoint, DeviceInfo, ProtocolType
from shared.src.exceptions import ProtocolParseException, DeviceConnectionException
from shared.src.logger import get_logger

logger = get_logger("opcua_parser")


class OPCUAParser(ProtocolBase):
    """OPC UA 协议解析器"""

    def __init__(self, timeout: float = 10.0):
        super().__init__(ProtocolType.OPC_UA)
        self._client = None
        self._timeout = timeout
        self._connected_nodes = {}

    def connect(self, device: DeviceInfo) -> bool:
        try:
            self._device_info = device
            try:
                from opcua import Client
                url = f"opc.tcp://{device.ip_address}:{device.port}"
                self._client = Client(url, timeout=self._timeout)
                if device.metadata.get("username"):
                    self._client.set_user(device.metadata["username"])
                if device.metadata.get("password"):
                    self._client.set_password(device.metadata["password"])
                self._client.connect()
                self._connected = True
                logger.info(f"OPC UA 连接成功: {url}")
            except ImportError:
                logger.warning("opcua 库未安装, 使用模拟模式")
                self._client = _MockOPCUAClient(device)
                self._connected = True
            return True
        except Exception as e:
            self._connected = False
            raise DeviceConnectionException(
                f"OPC UA 连接失败: {e}", device_id=device.device_id
            )

    def disconnect(self) -> bool:
        try:
            if self._client:
                if hasattr(self._client, "disconnect"):
                    self._client.disconnect()
                self._client = None
            self._connected = False
            self._connected_nodes.clear()
            logger.info("OPC UA 连接已断开")
            return True
        except Exception as e:
            logger.error(f"断开 OPC UA 连接失败: {e}")
            return False

    def _get_node(self, address: str):
        if address in self._connected_nodes:
            return self._connected_nodes[address]
        try:
            node = self._client.get_node(address)
            self._connected_nodes[address] = node
            return node
        except Exception as e:
            raise ProtocolParseException(
                f"获取 OPC UA 节点失败: {address}, 错误: {e}",
                protocol="opc_ua"
            )

    def read_point(self, point: DataPoint) -> DataPoint:
        self._validate_connection()
        try:
            node = self._get_node(point.address)
            point.value = node.get_value()
            point.quality = "good"
            point.timestamp = datetime.utcnow()
            return point
        except ProtocolParseException:
            raise
        except Exception as e:
            point.quality = "bad"
            raise ProtocolParseException(
                f"读取 OPC UA 数据点失败: {e}", protocol="opc_ua"
            )

    def read_points(self, points: List[DataPoint]) -> List[DataPoint]:
        return [self.read_point(p) for p in points]

    def write_point(self, point: DataPoint, value: Any) -> bool:
        self._validate_connection()
        try:
            node = self._get_node(point.address)
            node.set_value(value)
            logger.info(f"写入 OPC UA 数据点: {point.point_name} = {value}")
            return True
        except Exception as e:
            logger.error(f"写入 OPC UA 数据点失败: {e}")
            return False

    def write_points(self, points: List[DataPoint]) -> bool:
        return all(self.write_point(p, p.value) for p in points)


class _MockOPCUAClient:
    """模拟 OPC UA 客户端"""

    def __init__(self, device: DeviceInfo):
        self._device = device
        self._nodes = {}

    def get_node(self, address: str):
        if address not in self._nodes:
            self._nodes[address] = _MockOPCUANode(address)
        return self._nodes[address]

    def disconnect(self):
        pass


class _MockOPCUANode:
    """模拟 OPC UA 节点"""

    def __init__(self, address: str):
        self._address = address
        self._value = 0.0

    def get_value(self):
        return self._value

    def set_value(self, value):
        self._value = value


ProtocolFactory.register(ProtocolType.OPC_UA, OPCUAParser)