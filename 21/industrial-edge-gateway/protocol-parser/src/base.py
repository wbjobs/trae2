"""
协议解析基类与工厂
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from datetime import datetime
from shared.src.models import DataPoint, DeviceInfo, ProtocolType
from shared.src.exceptions import ProtocolParseException
from shared.src.logger import get_logger

logger = get_logger("protocol_parser")


class ProtocolBase(ABC):
    """协议解析器基类"""

    def __init__(self, protocol_type: ProtocolType):
        self.protocol_type = protocol_type
        self._connected = False
        self._device_info: Optional[DeviceInfo] = None

    @abstractmethod
    def connect(self, device: DeviceInfo) -> bool:
        """连接设备"""
        pass

    @abstractmethod
    def disconnect(self) -> bool:
        """断开连接"""
        pass

    @abstractmethod
    def read_point(self, point: DataPoint) -> DataPoint:
        """读取单个数据点"""
        pass

    @abstractmethod
    def read_points(self, points: List[DataPoint]) -> List[DataPoint]:
        """批量读取数据点"""
        pass

    @abstractmethod
    def write_point(self, point: DataPoint, value: Any) -> bool:
        """写入单个数据点"""
        pass

    @abstractmethod
    def write_points(self, points: List[DataPoint]) -> bool:
        """批量写入数据点"""
        pass

    @property
    def is_connected(self) -> bool:
        return self._connected

    def _validate_connection(self):
        """验证连接状态"""
        if not self._connected:
            raise ProtocolParseException(
                f"协议 {self.protocol_type.value} 未连接",
                protocol=self.protocol_type.value
            )


class ProtocolFactory:
    """协议解析器工厂"""

    _parsers: Dict[str, type] = {}

    @classmethod
    def register(cls, protocol_type: ProtocolType, parser_class: type):
        """注册协议解析器"""
        cls._parsers[protocol_type.value] = parser_class
        logger.info(f"注册协议解析器: {protocol_type.value}")

    @classmethod
    def create(cls, protocol_type: ProtocolType, **kwargs) -> ProtocolBase:
        """创建协议解析器实例"""
        parser_class = cls._parsers.get(protocol_type.value)
        if parser_class is None:
            raise ProtocolParseException(
                f"不支持的协议类型: {protocol_type.value}",
                protocol=protocol_type.value
            )
        return parser_class(**kwargs)

    @classmethod
    def get_supported_protocols(cls) -> List[str]:
        """获取支持的协议列表"""
        return list(cls._parsers.keys())