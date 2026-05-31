"""
共享数据模型 - 工业边缘网关通用数据结构
"""
from enum import Enum
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
import uuid
import json
try:
    from .logger import get_logger
except ImportError:
    from logger import get_logger

logger = get_logger("models")


class ProtocolType(Enum):
    """支持的工业协议类型"""
    MODBUS_TCP = "modbus_tcp"
    MODBUS_RTU = "modbus_rtu"
    PROFINET = "profinet"
    OPC_UA = "opc_ua"
    MQTT = "mqtt"
    HTTP = "http"
    TCP = "tcp"
    UDP = "udp"


class ServiceStatus(Enum):
    """服务状态枚举"""
    STOPPED = "stopped"
    RUNNING = "running"
    ERROR = "error"
    DEGRADED = "degraded"
    MAINTENANCE = "maintenance"


class DataDirection(Enum):
    """数据流向"""
    EDGE_TO_CLOUD = "edge_to_cloud"
    CLOUD_TO_EDGE = "cloud_to_edge"
    EDGE_TO_EDGE = "edge_to_edge"
    INTERNAL = "internal"


@dataclass
class DataPoint:
    """
    数据点 - 工业数据最小单元
    
    Attributes:
        point_id: 数据点唯一标识
        device_id: 所属设备ID
        point_name: 数据点名称
        address: 寄存器地址
        data_type: 数据类型 (bool, int16, int32, float32, float64)
        value: 当前值
        quality: 数据质量 (good, bad, uncertain)
        timestamp: 时间戳
        unit: 单位
        description: 描述
    """
    point_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str = ""
    point_name: str = ""
    address: str = ""
    data_type: str = "float32"
    value: Any = None
    quality: str = "good"
    timestamp: datetime = field(default_factory=datetime.utcnow)
    unit: str = ""
    description: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "point_id": self.point_id,
            "device_id": self.device_id,
            "point_name": self.point_name,
            "address": self.address,
            "data_type": self.data_type,
            "value": self.value,
            "quality": self.quality,
            "timestamp": self.timestamp.isoformat(),
            "unit": self.unit,
            "description": self.description,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DataPoint":
        if "timestamp" in data and isinstance(data["timestamp"], str):
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class DeviceInfo:
    """
    设备信息
    
    Attributes:
        device_id: 设备唯一标识
        device_name: 设备名称
        device_type: 设备类型
        protocol: 使用的协议类型
        ip_address: IP地址
        port: 端口号
        slave_id: 从站ID (Modbus)
        rack: 机架号 (Profinet)
        slot: 槽号 (Profinet)
        status: 设备状态
        data_points: 数据点列表
    """
    device_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    device_name: str = ""
    device_type: str = ""
    protocol: ProtocolType = ProtocolType.MODBUS_TCP
    ip_address: str = ""
    port: int = 502
    slave_id: int = 1
    rack: int = 0
    slot: int = 1
    status: str = "offline"
    data_points: List[DataPoint] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "device_name": self.device_name,
            "device_type": self.device_type,
            "protocol": self.protocol.value,
            "ip_address": self.ip_address,
            "port": self.port,
            "slave_id": self.slave_id,
            "rack": self.rack,
            "slot": self.slot,
            "status": self.status,
            "data_points": [dp.to_dict() for dp in self.data_points],
            "metadata": self.metadata,
        }


@dataclass
class DataFlowRule:
    """
    数据流规则 - 编排规则定义
    
    Attributes:
        rule_id: 规则ID
        rule_name: 规则名称
        source_device: 源设备ID
        source_point: 源数据点ID
        target_device: 目标设备ID
        target_point: 目标数据点ID
        transform_expression: 转换表达式
        trigger_condition: 触发条件
        direction: 数据流向
        priority: 优先级
        enabled: 是否启用
    """
    rule_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    rule_name: str = ""
    source_device: str = ""
    source_point: str = ""
    target_device: str = ""
    target_point: str = ""
    transform_expression: str = ""
    trigger_condition: str = ""
    direction: DataDirection = DataDirection.EDGE_TO_CLOUD
    priority: int = 5
    enabled: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "source_device": self.source_device,
            "source_point": self.source_point,
            "target_device": self.target_device,
            "target_point": self.target_point,
            "transform_expression": self.transform_expression,
            "trigger_condition": self.trigger_condition,
            "direction": self.direction.value,
            "priority": self.priority,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DataFlowRule":
        """
        从字典创建 DataFlowRule 对象
        包含完善的字段校验和异常处理，确保加载规则时不会因单条规则损坏导致全部失败
        """
        if not isinstance(data, dict):
            raise ValueError(f"期望字典类型, 实际 {type(data)}")
        
        try:
            parsed_data = {}
            for field_name in cls.__dataclass_fields__:
                if field_name in data:
                    value = data[field_name]
                    if field_name == "direction" and isinstance(value, str):
                        try:
                            parsed_data[field_name] = DataDirection(value)
                        except (ValueError, KeyError) as e:
                            logger.warning(f"无效的 direction 值 '{value}', 使用默认值: {e}")
                            continue
                    elif field_name in ["created_at", "updated_at"] and isinstance(value, str):
                        try:
                            parsed_data[field_name] = datetime.fromisoformat(value)
                        except (ValueError, TypeError) as e:
                            logger.warning(f"无效的时间戳格式 '{value}', 使用当前时间: {e}")
                            continue
                    else:
                        parsed_data[field_name] = value
            
            return cls(**parsed_data)
        except Exception as e:
            logger.error(f"从字典创建 DataFlowRule 失败: {e}, 数据: {data}")
            raise


@dataclass
class Message:
    """
    消息 - 微服务间通信消息格式
    
    Attributes:
        msg_id: 消息ID
        msg_type: 消息类型
        source: 发送方
        target: 接收方
        payload: 消息负载
        timestamp: 时间戳
        priority: 优先级
    """
    msg_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    msg_type: str = ""
    source: str = ""
    target: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    priority: int = 5

    def to_json(self) -> str:
        return json.dumps({
            "msg_id": self.msg_id,
            "msg_type": self.msg_type,
            "source": self.source,
            "target": self.target,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat(),
            "priority": self.priority,
        })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "msg_id": self.msg_id,
            "msg_type": self.msg_type,
            "source": self.source,
            "target": self.target,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat(),
            "priority": self.priority,
        }

    @classmethod
    def from_json(cls, json_str: str) -> "Message":
        data = json.loads(json_str)
        if "timestamp" in data:
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class ServiceInfo:
    """服务信息"""
    service_name: str
    service_type: str
    status: ServiceStatus = ServiceStatus.STOPPED
    host: str = "0.0.0.0"
    port: int = 0
    health_endpoint: str = "/health"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "service_name": self.service_name,
            "service_type": self.service_type,
            "status": self.status.value,
            "host": self.host,
            "port": self.port,
            "health_endpoint": self.health_endpoint,
            "metadata": self.metadata,
        }