"""
协议兼容性自动检测器
自动探测设备支持的协议类型，检测协议版本兼容性
"""
import socket
import struct
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum
from shared.src.models import DeviceInfo, ProtocolType
from shared.src.logger import get_logger
from shared.src.exceptions import DeviceConnectionException, ProtocolParseException

logger = get_logger("protocol_detector")


class ProtocolCompatibility(Enum):
    """协议兼容性级别"""
    FULL = "full"
    PARTIAL = "partial"
    NONE = "none"


class ProtocolDetectionResult:
    """协议检测结果"""

    def __init__(
        self,
        protocol: ProtocolType,
        compatible: ProtocolCompatibility,
        latency_ms: float = 0,
        error: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.protocol = protocol
        self.compatible = compatible
        self.latency_ms = latency_ms
        self.error = error
        self.details = details or {}
        self.timestamp = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "protocol": self.protocol.value,
            "compatible": self.compatible.value,
            "latency_ms": self.latency_ms,
            "error": self.error,
            "details": self.details,
            "timestamp": self.timestamp,
        }


class ProtocolDetector:
    """
    协议兼容性自动检测器
    
    支持检测的协议:
    - Modbus TCP
    - Profinet
    - OPC UA
    - MQTT
    """

    DEFAULT_TIMEOUT = 2.0
    DEFAULT_PORTS = {
        ProtocolType.MODBUS_TCP: [502],
        ProtocolType.PROFINET: [34964, 0x8892],
        ProtocolType.OPC_UA: [4840, 4841],
        ProtocolType.MQTT: [1883, 8883],
    }

    def __init__(self, timeout: float = DEFAULT_TIMEOUT):
        self.timeout = timeout
        self._lock = threading.Lock()

    def detect_all(self, ip_address: str, ports: Optional[Dict[ProtocolType, List[int]]] = None) -> List[ProtocolDetectionResult]:
        """
        检测设备支持的所有协议
        
        Args:
            ip_address: 设备IP地址
            ports: 可选的自定义端口映射
            
        Returns:
            所有协议的检测结果列表
        """
        results = []
        test_ports = ports or self.DEFAULT_PORTS
        
        for protocol, port_list in test_ports.items():
            for port in port_list:
                try:
                    result = self._detect_protocol(ip_address, port, protocol)
                    results.append(result)
                    if result.compatible in [ProtocolCompatibility.FULL, ProtocolCompatibility.PARTIAL]:
                        break
                except Exception as e:
                    logger.debug(f"检测 {protocol.value} 失败 (端口 {port}): {e}")
                    results.append(ProtocolDetectionResult(
                        protocol=protocol,
                        compatible=ProtocolCompatibility.NONE,
                        error=str(e),
                    ))
        
        return results

    def detect_best(self, ip_address: str, preferred_protocols: Optional[List[ProtocolType]] = None) -> Optional[ProtocolDetectionResult]:
        """
        检测并返回最佳匹配的协议
        
        Args:
            ip_address: 设备IP地址
            preferred_protocols: 优先尝试的协议列表
            
        Returns:
            最佳匹配的检测结果，无匹配则返回None
        """
        results = self.detect_all(ip_address)
        
        if preferred_protocols:
            preferred_results = [r for r in results if r.protocol in preferred_protocols]
            full_compatible = [r for r in preferred_results if r.compatible == ProtocolCompatibility.FULL]
            if full_compatible:
                return min(full_compatible, key=lambda x: x.latency_ms)
            partial_compatible = [r for r in preferred_results if r.compatible == ProtocolCompatibility.PARTIAL]
            if partial_compatible:
                return min(partial_compatible, key=lambda x: x.latency_ms)
        
        full_compatible = [r for r in results if r.compatible == ProtocolCompatibility.FULL]
        if full_compatible:
            return min(full_compatible, key=lambda x: x.latency_ms)
        
        partial_compatible = [r for r in results if r.compatible == ProtocolCompatibility.PARTIAL]
        if partial_compatible:
            return min(partial_compatible, key=lambda x: x.latency_ms)
        
        return None

    def auto_configure_device(self, device: DeviceInfo) -> DeviceInfo:
        """
        自动检测并配置设备协议
        
        Args:
            device: 待配置的设备信息
            
        Returns:
            配置后的设备信息
        """
        logger.info(f"开始自动检测设备协议: {device.ip_address}")
        
        preferred = [device.protocol] if device.protocol else None
        result = self.detect_best(device.ip_address, preferred)
        
        if result:
            device.protocol = result.protocol
            device.metadata["protocol_detection"] = result.to_dict()
            device.metadata["auto_detected"] = True
            logger.info(f"设备 {device.ip_address} 自动检测到协议: {result.protocol.value}")
        else:
            logger.warning(f"未能检测到设备 {device.ip_address} 的兼容协议，使用默认配置")
        
        return device

    def _detect_protocol(self, ip_address: str, port: int, protocol: ProtocolType) -> ProtocolDetectionResult:
        """检测单个协议"""
        start_time = time.time()
        
        try:
            if protocol == ProtocolType.MODBUS_TCP:
                return self._detect_modbus_tcp(ip_address, port, start_time)
            elif protocol == ProtocolType.PROFINET:
                return self._detect_profinet(ip_address, port, start_time)
            elif protocol == ProtocolType.OPC_UA:
                return self._detect_opc_ua(ip_address, port, start_time)
            elif protocol == ProtocolType.MQTT:
                return self._detect_mqtt(ip_address, port, start_time)
            else:
                return ProtocolDetectionResult(
                    protocol=protocol,
                    compatible=ProtocolCompatibility.NONE,
                    error=f"不支持的协议检测: {protocol.value}",
                )
        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return ProtocolDetectionResult(
                protocol=protocol,
                compatible=ProtocolCompatibility.NONE,
                latency_ms=latency,
                error=str(e),
            )

    def _detect_modbus_tcp(self, ip_address: str, port: int, start_time: float) -> ProtocolDetectionResult:
        """检测 Modbus TCP 协议"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(self.timeout)
                sock.connect((ip_address, port))
                
                transaction_id = 0x1234
                request = struct.pack(
                    ">HHHBBHH",
                    transaction_id,
                    0x0000,
                    0x0006,
                    0x01,
                    0x04,
                    0x0000,
                    0x000A,
                )
                sock.send(request)
                
                response = sock.recv(1024)
                latency = (time.time() - start_time) * 1000
                
                if len(response) >= 9:
                    resp_tid = struct.unpack(">H", response[0:2])[0]
                    if resp_tid == transaction_id:
                        return ProtocolDetectionResult(
                            protocol=ProtocolType.MODBUS_TCP,
                            compatible=ProtocolCompatibility.FULL,
                            latency_ms=latency,
                            details={"port": port, "response_length": len(response)},
                        )
                
                return ProtocolDetectionResult(
                    protocol=ProtocolType.MODBUS_TCP,
                    compatible=ProtocolCompatibility.PARTIAL,
                    latency_ms=latency,
                    error="Modbus TCP 端口开放但响应异常",
                    details={"port": port},
                )
        except (socket.timeout, ConnectionRefusedError):
            raise

    def _detect_profinet(self, ip_address: str, port: int, start_time: float) -> ProtocolDetectionResult:
        """检测 Profinet 协议"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            sock.connect((ip_address, port))
            latency = (time.time() - start_time) * 1000
            
            hello_packet = struct.pack(">HHH", 0x0001, 0x0000, 0x0010)
            sock.send(hello_packet)
            
            try:
                response = sock.recv(256)
                if len(response) >= 6:
                    frame_id = struct.unpack(">H", response[0:2])[0]
                    if frame_id in [0x0001, 0x8001]:
                        sock.close()
                        return ProtocolDetectionResult(
                            protocol=ProtocolType.PROFINET,
                            compatible=ProtocolCompatibility.FULL,
                            latency_ms=latency,
                            details={"port": port, "frame_id": hex(frame_id)},
                        )
            except socket.timeout:
                pass
            
            sock.close()
            return ProtocolDetectionResult(
                protocol=ProtocolType.PROFINET,
                compatible=ProtocolCompatibility.PARTIAL,
                latency_ms=latency,
                error="Profinet 端口开放但无有效响应",
                details={"port": port},
            )
        except (socket.timeout, ConnectionRefusedError):
            raise

    def _detect_opc_ua(self, ip_address: str, port: int, start_time: float) -> ProtocolDetectionResult:
        """检测 OPC UA 协议"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(self.timeout)
                sock.connect((ip_address, port))
                latency = (time.time() - start_time) * 1000
                
                hello_message = bytes([
                    0x48, 0x45, 0x4C, 0x46,
                    0x0A, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00,
                    0x01, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00,
                ])
                sock.send(hello_message)
                
                try:
                    response = sock.recv(32)
                    if len(response) >= 8 and response[0:4] == b'HELF':
                        return ProtocolDetectionResult(
                            protocol=ProtocolType.OPC_UA,
                            compatible=ProtocolCompatibility.FULL,
                            latency_ms=latency,
                            details={"port": port, "response_length": len(response)},
                        )
                except socket.timeout:
                    pass
                
                return ProtocolDetectionResult(
                    protocol=ProtocolType.OPC_UA,
                    compatible=ProtocolCompatibility.PARTIAL,
                    latency_ms=latency,
                    error="OPC UA 端口开放但无有效响应",
                    details={"port": port},
                )
        except (socket.timeout, ConnectionRefusedError):
            raise

    def _detect_mqtt(self, ip_address: str, port: int, start_time: float) -> ProtocolDetectionResult:
        """检测 MQTT 协议"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(self.timeout)
                sock.connect((ip_address, port))
                latency = (time.time() - start_time) * 1000
                
                connect_packet = bytes([
                    0x10,
                    0x0E,
                    0x00, 0x04,
                    0x4D, 0x51, 0x54, 0x54,
                    0x04,
                    0x02,
                    0x00, 0x3C,
                    0x00, 0x00,
                ])
                sock.send(connect_packet)
                
                try:
                    response = sock.recv(4)
                    if len(response) >= 4 and response[0] == 0x20:
                        return ProtocolDetectionResult(
                            protocol=ProtocolType.MQTT,
                            compatible=ProtocolCompatibility.FULL,
                            latency_ms=latency,
                            details={"port": port, "connect_response": response[3]},
                        )
                except socket.timeout:
                    pass
                
                return ProtocolDetectionResult(
                    protocol=ProtocolType.MQTT,
                    compatible=ProtocolCompatibility.PARTIAL,
                    latency_ms=latency,
                    error="MQTT 端口开放但无有效响应",
                    details={"port": port},
                )
        except (socket.timeout, ConnectionRefusedError):
            raise

    def check_port_open(self, ip_address: str, port: int, timeout: Optional[float] = None) -> bool:
        """检查端口是否开放"""
        check_timeout = timeout or self.timeout
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(check_timeout)
                result = sock.connect_ex((ip_address, port))
                return result == 0
        except Exception:
            return False


class ProtocolCompatibilityChecker:
    """协议兼容性检查器"""

    @staticmethod
    def check_compatibility(protocol: ProtocolType, device_capabilities: Dict[str, Any]) -> ProtocolCompatibility:
        """
        检查协议与设备能力的兼容性
        
        Args:
            protocol: 要检查的协议
            device_capabilities: 设备能力描述
            
        Returns:
            兼容性级别
        """
        supported_protocols = device_capabilities.get("supported_protocols", [])
        if protocol.value in supported_protocols:
            return ProtocolCompatibility.FULL
        
        protocol_families = {
            ProtocolType.MODBUS_TCP: ["modbus", "modbus_tcp", "modbus_rtu"],
            ProtocolType.MODBUS_RTU: ["modbus", "modbus_tcp", "modbus_rtu"],
            ProtocolType.PROFINET: ["profinet", "ethernet/ip", "industrial_ethernet"],
            ProtocolType.OPC_UA: ["opc", "opc_ua", "opc_da"],
            ProtocolType.MQTT: ["mqtt", "mqtts"],
        }
        
        family = protocol_families.get(protocol, [])
        for proto in family:
            if proto in [str(p).lower() for p in supported_protocols]:
                return ProtocolCompatibility.PARTIAL
        
        return ProtocolCompatibility.NONE

    @staticmethod
    def get_protocol_features(protocol: ProtocolType) -> Dict[str, Any]:
        """获取协议特性"""
        features = {
            ProtocolType.MODBUS_TCP: {
                "max_registers_per_read": 125,
                "max_registers_per_write": 123,
                "supported_data_types": ["bool", "int16", "uint16", "int32", "uint32", "float32", "float64"],
                "connection_type": "tcp",
                "default_port": 502,
                "security": False,
                "real_time": True,
            },
            ProtocolType.PROFINET: {
                "max_data_per_cycle": 1440,
                "cycle_times_ms": [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
                "supported_data_types": ["bool", "int8", "uint8", "int16", "uint16", "int32", "uint32", "float32", "float64"],
                "connection_type": "ethernet",
                "default_port": 34964,
                "security": False,
                "real_time": True,
                "isochronous": True,
            },
            ProtocolType.OPC_UA: {
                "max_nodes_per_read": 1000,
                "encoding": ["binary", "xml", "json"],
                "supported_data_types": ["bool", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "float32", "float64", "string", "datetime"],
                "connection_type": "tcp/https",
                "default_port": 4840,
                "security": True,
                "real_time": False,
                "discovery": True,
            },
            ProtocolType.MQTT: {
                "qos_levels": [0, 1, 2],
                "max_payload_size": 256 * 1024 * 1024,
                "supported_data_types": ["binary", "string", "json"],
                "connection_type": "tcp",
                "default_port": 1883,
                "security": True,
                "real_time": False,
                "pub_sub": True,
            },
        }
        return features.get(protocol, {})
