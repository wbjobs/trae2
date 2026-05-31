"""
Modbus TCP 协议解析器
"""
import struct
import socket
import threading
from typing import Any, Dict, List, Optional
from datetime import datetime
from .base import ProtocolBase, ProtocolFactory
from shared.src.models import DataPoint, DeviceInfo, ProtocolType
from shared.src.exceptions import ProtocolParseException, DeviceConnectionException
from shared.src.logger import get_logger

logger = get_logger("modbus_tcp_parser")


class ModbusTCPParser(ProtocolBase):
    """Modbus TCP 协议解析器 (线程安全)"""

    def __init__(self, timeout: float = 5.0):
        super().__init__(ProtocolType.MODBUS_TCP)
        self._socket: Optional[socket.socket] = None
        self._timeout = timeout
        self._transaction_id = 0
        self._lock = threading.Lock()
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 3

    def connect(self, device: DeviceInfo) -> bool:
        with self._lock:
            return self._connect_locked(device)
    
    def _connect_locked(self, device: DeviceInfo) -> bool:
        try:
            self._device_info = device
            if self._socket:
                try:
                    self._socket.close()
                except Exception:
                    pass
            
            self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._socket.settimeout(self._timeout)
            self._socket.connect((device.ip_address, device.port))
            self._connected = True
            self._reconnect_attempts = 0
            logger.info(f"Modbus TCP 连接成功: {device.ip_address}:{device.port}")
            return True
        except Exception as e:
            self._connected = False
            raise DeviceConnectionException(
                f"Modbus TCP 连接失败: {e}", device_id=device.device_id
            )

    def _ensure_connected(self):
        """确保连接可用，必要时重连"""
        if not self._connected or self._socket is None:
            if self._device_info and self._reconnect_attempts < self._max_reconnect_attempts:
                logger.warning(f"连接已断开，尝试重连 ({self._reconnect_attempts + 1}/{self._max_reconnect_attempts})")
                self._reconnect_attempts += 1
                self._connect_locked(self._device_info)
            else:
                raise DeviceConnectionException(
                    f"连接已断开且无法重连 (已尝试 {self._reconnect_attempts} 次)",
                    device_id=self._device_info.device_id if self._device_info else "unknown"
                )

    def disconnect(self) -> bool:
        with self._lock:
            try:
                if self._socket:
                    self._socket.close()
                    self._socket = None
                self._connected = False
                logger.info("Modbus TCP 连接已断开")
                return True
            except Exception as e:
                logger.error(f"断开连接失败: {e}")
                return False

    def _build_request(self, slave_id: int, function_code: int, address: int, count: int = 1) -> bytes:
        self._transaction_id = (self._transaction_id + 1) & 0xFFFF
        header = struct.pack(">HHHB", self._transaction_id, 0, 6, slave_id)
        pdu = struct.pack(">BHH", function_code, address, count)
        return header + pdu

    def _parse_response(self, response: bytes, expected_length: int) -> bytes:
        if len(response) < expected_length:
            raise ProtocolParseException(
                f"响应长度不足: 期望 {expected_length} 字节, 实际 {len(response)} 字节",
                protocol="modbus_tcp"
            )
        transaction_id, protocol_id, length, unit_id = struct.unpack(">HHHB", response[:7])
        pdu = response[7:]
        if len(pdu) < 2:
            raise ProtocolParseException("PDU 长度不足", protocol="modbus_tcp")
        function_code = pdu[0]
        if function_code & 0x80:
            exception_code = pdu[1]
            exception_messages = {0x01: "非法功能", 0x02: "非法数据地址", 0x03: "非法数据值", 0x04: "从站故障"}
            raise ProtocolParseException(
                f"Modbus 异常: {exception_messages.get(exception_code, f'未知异常 {exception_code}')}",
                protocol="modbus_tcp"
            )
        return pdu[1:]

    def read_point(self, point: DataPoint) -> DataPoint:
        with self._lock:
            return self._read_point_locked(point)
    
    def _read_point_locked(self, point: DataPoint) -> DataPoint:
        self._ensure_connected()
        try:
            slave_id = self._device_info.slave_id if self._device_info else 1
            address = int(point.address)
            if point.data_type == "bool":
                request = self._build_request(slave_id, 0x01, address, 1)
                self._socket.send(request)
                response = self._socket.recv(1024)
                data = self._parse_response(response, 9)
                point.value = bool(data[0] & 0x01)
            else:
                request = self._build_request(slave_id, 0x03, address, self._get_register_count(point.data_type))
                self._socket.send(request)
                response = self._socket.recv(1024)
                data = self._parse_response(response, 9 + 2 * self._get_register_count(point.data_type))
                point.value = self._parse_value(data, point.data_type)
            point.quality = "good"
            point.timestamp = datetime.utcnow()
            return point
        except (ProtocolParseException, DeviceConnectionException):
            raise
        except BrokenPipeError as e:
            self._connected = False
            raise ProtocolParseException(f"连接已断开: {e}", protocol="modbus_tcp")
        except Exception as e:
            point.quality = "bad"
            raise ProtocolParseException(f"读取 Modbus 数据点失败: {e}", protocol="modbus_tcp")

    def read_points(self, points: List[DataPoint]) -> List[DataPoint]:
        with self._lock:
            return self._read_points_locked(points)
    
    def _read_points_locked(self, points: List[DataPoint]) -> List[DataPoint]:
        self._ensure_connected()
        if not points:
            return points
        try:
            sorted_points = sorted(points, key=lambda p: int(p.address))
            result = []
            i = 0
            while i < len(sorted_points):
                start_addr = int(sorted_points[i].address)
                batch = [sorted_points[i]]
                j = i + 1
                while j < len(sorted_points):
                    curr_addr = int(sorted_points[j].address)
                    if curr_addr - start_addr <= 100:
                        batch.append(sorted_points[j])
                        j += 1
                    else:
                        break
                slave_id = self._device_info.slave_id if self._device_info else 1
                count = j - i
                request = self._build_request(slave_id, 0x03, start_addr, count)
                self._socket.send(request)
                response = self._socket.recv(1024)
                data = self._parse_response(response, 9 + 2 * count)
                for idx, point in enumerate(batch):
                    offset = idx * 2
                    if offset + 2 <= len(data):
                        point.value = self._parse_value(data[offset:], point.data_type)
                        point.quality = "good"
                        point.timestamp = datetime.utcnow()
                    else:
                        point.quality = "bad"
                    result.append(point)
                i = j
            return result
        except (ProtocolParseException, DeviceConnectionException):
            raise
        except BrokenPipeError as e:
            self._connected = False
            raise ProtocolParseException(f"连接已断开: {e}", protocol="modbus_tcp")
        except Exception as e:
            raise ProtocolParseException(f"批量读取 Modbus 数据点失败: {e}", protocol="modbus_tcp")

    def write_point(self, point: DataPoint, value: Any) -> bool:
        with self._lock:
            return self._write_point_locked(point, value)
    
    def _write_point_locked(self, point: DataPoint, value: Any) -> bool:
        self._ensure_connected()
        try:
            slave_id = self._device_info.slave_id if self._device_info else 1
            address = int(point.address)
            
            if point.data_type == "bool":
                request = self._build_request(slave_id, 0x05, address, 0xFF00 if value else 0x0000)
            else:
                register_value = self._value_to_register(value, point.data_type)
                request = self._build_request(slave_id, 0x06, address, register_value)
            
            self._socket.send(request)
            response = self._socket.recv(1024)
            
            if len(response) >= 12:
                resp_addr = struct.unpack(">H", response[8:10])[0]
                if resp_addr == address:
                    logger.info(f"写入 Modbus 数据点: {point.point_name} = {value}")
                    return True
            
            return False
        except BrokenPipeError as e:
            self._connected = False
            logger.error(f"写入 Modbus 数据点失败 (连接已断开): {e}")
            return False
        except Exception as e:
            logger.error(f"写入 Modbus 数据点失败: {e}")
            return False

    def write_points(self, points: List[DataPoint]) -> bool:
        with self._lock:
            return all(self._write_point_locked(p, p.value) for p in points)

    @staticmethod
    def _get_register_count(data_type: str) -> int:
        type_map = {"bool": 1, "int16": 1, "uint16": 1, "int32": 2, "uint32": 2, "float32": 2, "float64": 4}
        return type_map.get(data_type, 1)

    @staticmethod
    def _parse_value(data: bytes, data_type: str) -> Any:
        try:
            if data_type == "bool":
                return bool(data[0] & 0x01)
            elif data_type == "int16":
                return struct.unpack(">h", data[:2])[0]
            elif data_type == "uint16":
                return struct.unpack(">H", data[:2])[0]
            elif data_type == "int32":
                return struct.unpack(">i", data[:4])[0]
            elif data_type == "uint32":
                return struct.unpack(">I", data[:4])[0]
            elif data_type == "float32":
                return struct.unpack(">f", data[:4])[0]
            elif data_type == "float64":
                return struct.unpack(">d", data[:8])[0]
            else:
                return struct.unpack(">H", data[:2])[0]
        except Exception:
            return None

    @staticmethod
    def _value_to_register(value: Any, data_type: str) -> int:
        try:
            if data_type == "bool":
                return 0xFF00 if value else 0x0000
            elif data_type in ["int16", "uint16"]:
                return int(value) & 0xFFFF
            elif data_type in ["int32", "uint32"]:
                return int(value) & 0xFFFF
            elif data_type == "float32":
                return int(struct.unpack(">I", struct.pack(">f", float(value)))[0]) & 0xFFFF
            else:
                return int(value) & 0xFFFF
        except Exception:
            return 0


ProtocolFactory.register(ProtocolType.MODBUS_TCP, ModbusTCPParser)