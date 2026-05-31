"""
工业边缘网关 - 共享模块
提供跨微服务的通用数据模型、工具函数和配置管理
"""
from .models import (
    DataPoint,
    DeviceInfo,
    ProtocolType,
    DataFlowRule,
    ServiceStatus,
    Message,
)
from .exceptions import (
    GatewayException,
    ProtocolParseException,
    DataFlowException,
    StorageException,
    CommunicationException,
)
from .config import GatewayConfig, load_config

__version__ = "1.0.0"