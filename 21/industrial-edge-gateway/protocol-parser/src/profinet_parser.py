"""
Profinet 协议解析器
基于 Profinet IO 协议实现工业设备数据交互
"""
import struct
import socket
import threading
from typing import Any, List, Optional
from datetime import datetime
from .base import ProtocolBase, ProtocolFactory
from shared.src.models import DataPoint, DeviceInfo, ProtocolType
from shared.src.exceptions import ProtocolParseException, DeviceConnectionException
from shared.src.logger import get_logger

logger = get_logger("profinet_parser")


class ProfinetParser(ProtocolBase):
    """Profinet IO 协议解析器 (线程安全)"""

    PROFINET_PORT = 0x8892
    FRAME_ID_ACK = 0x0001
    FRAME_ID_DATA = 0x0002

    def __init__(self, timeout: float = 5.0):
        super().__init__(ProtocolType.PROFINET)
        self._socket: Optional[socket.socket] = None
        self._timeout = timeout
        self._cycle_counter = 0
        self._io_data_size = 0
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
            self._socket.connect((device.ip_address, self.PROFINET_PORT))
            self._connected = True
            self._reconnect_attempts = 0
            logger.info(f"Profinet 连接成功: {device.ip_address}:{self.PROFINET_PORT}")
            self._perform_connect_sequence(device)
            return True
        except Exception as e:
            self._connected = False
            raise DeviceConnectionException(
                f"Profinet 连接失败: {e}", device_id=device.device_id
            )

    def _ensure_connected(self):
        """确保连接可用，必要时重连"""
        if not self._connected or self._socket is None:
            if self._device_info and self._reconnect_attempts < self._max_reconnect_attempts:
                logger.warning(f"Profinet 连接已断开，尝试重连 ({self._reconnect_attempts + 1}/{self._max_reconnect_attempts})")
                self._reconnect_attempts += 1
                self._connect_locked(self._device_info)
            else:
                raise DeviceConnectionException(
                    f"连接已断开且无法重连",
                    device_id=self._device_info.device_id if self._device_info else "unknown"
                )

    def disconnect(self) -> bool:
        with self._lock:
            try:
                if self._socket:
                    disconnect_req = struct.pack(">HHH", 0x0003, 0x0000, 8)
                    try:
                        self._socket.send(disconnect_req)
                    except Exception:
                        pass
                    self._socket.close()
                    self._socket = None
                self._connected = False
                logger.info("Profinet 连接已断开")
                return True
            except Exception as e:
                logger.error(f"断开 Profinet 连接失败: {e}")
                return False

    def _perform_connect_sequence(self, device: DeviceInfo):
        connect_req = self._build_connect_request(device)
        self._socket.send(connect_req)
        response = self._socket.recv(1024)
        if len(response) < 6:
            raise ProtocolParseException("Profinet 连接响应无效", protocol="profinet")
        frame_id = struct.unpack(">H", response[0:2])[0]
        if frame_id != self.FRAME_ID_ACK:
            raise ProtocolParseException("Profinet 连接被拒绝", protocol="profinet")
        self._io_data_size = device.rack * 100 + device.slot
        logger.info(f"Profinet 连接建立成功, IO数据大小: {self._io_data_size}")

    def _build_connect_request(self, device: DeviceInfo) -> bytes:
        header = struct.pack(">HHH", 0x0001, 0x0000, 16)
        connect_data = struct.pack(
            ">HBBHH",
            device.rack,
            device.slot,
            0x00,
            device.slave_id,
            self._cycle_counter
        )
        return header + connect_data

    def _build_read_request(self, address: int, length: int) -> bytes:
        header = struct.pack(">HHH", 0x0002, 0x0000, 12 + length)
        read_req = struct.pack(">HHH", self._cycle_counter, address, length)
        return header + read_req

    def _parse_profinet_response(self, response: bytes) -> bytes:
        if len(response) < 8:
            raise ProtocolParseException("Profinet 响应长度不足", protocol="profinet")
        frame_id = struct.unpack(">H", response[0:2])[0]
        if frame_id & 0x8000:
            raise ProtocolParseException("Profinet 错误响应", protocol="profinet")
        return response[8:]

    def read_point(self, point: DataPoint) -> DataPoint:
        with self._lock:
            return self._read_point_locked(point)
    
    def _read_point_locked(self, point: DataPoint) -> DataPoint:
        self._ensure_connected()
        try:
            address = int(point.address)
            length = self._get_profinet_data_size(point.data_type)
            request = self._build_read_request(address, length)
            self._socket.send(request)
            response = self._socket.recv(1024)
            data = self._parse_profinet_response(response)
            point.value = self._parse_profinet_value(data, point.data_type)
            point.quality = "good"
            point.timestamp = datetime.utcnow()
            return point
        except ProtocolParseException:
            raise
        except BrokenPipeError as e:
            self._connected = False
            point.quality = "bad"
            raise ProtocolParseException(f"连接已断开: {e}", protocol="profinet")
        except Exception as e:
            point.quality = "bad"
            raise ProtocolParseException(
                f"读取 Profinet 数据点失败: {e}", protocol="profinet"
            )

    def read_points(self, points: List[DataPoint]) -> List[DataPoint]:
        with self._lock:
            self._ensure_connected()
            return [self._read_point_locked(p) for p in points]

    def write_point(self, point: DataPoint, value: Any) -> bool:
        with self._lock:
            return self._write_point_locked(point, value)
    
    def _write_point_locked(self, point: DataPoint, value: Any) -> bool:
        self._ensure_connected()
        try:
            address = int(point.address)
            data = self._value_to_profinet_bytes(value, point.data_type)
            request = self._build_write_request(address, data)
            self._socket.send(request)
            response = self._socket.recv(1024)
            return len(response) >= 8
        except BrokenPipeError as e:
            self._connected = False
            logger.error(f"写入 Profinet 数据点失败 (连接已断开): {e}")
            return False
        except Exception as e:
            logger.error(f"写入 Profinet 数据点失败: {e}")
            return False

    def _build_write_request(self, address: int, data: bytes) -> bytes:
        length = len(data)
        header = struct.pack(">HHH", 0x0004, 0x0000, 12 + length)
        write_req = struct.pack(">HH", self._cycle_counter, address)
        return header + write_req + data

    def write_points(self, points: List[DataPoint]) -> bool:
        with self._lock:
            return all(self._write_point_locked(p, p.value) for p in points)

    @staticmethod
    def _get_profinet_data_size(data_type: str) -> int:
        type_map = {"bool": 1, "int8": 1, "uint8": 1, "int16": 2, "uint16": 2,
                    "int32": 4, "uint32": 4, "float32": 4, "float64": 8, "string": 32}
        return type_map.get(data_type, 2)

    @staticmethod
    def _parse_profinet_value(data: bytes, data_type: str) -> Any:
        try:
            if data_type == "bool":
                return bool(data[0] & 0x01)
            elif data_type in ["int8", "int16", "int32"]:
                return struct.unpack(f">i{len(data)}", data)[0] if len(data) > 1 else data[0]
            elif data_type in ["uint8", "uint16", "uint32"]:
                return struct.unpack(f">I{len(data)}", data)[0] if len(data) > 1 else data[0]
            elif data_type == "float32":
                return struct.unpack(">f", data[:4])[0]
            elif data_type == "float64":
                return struct.unpack(">d", data[:8])[0]
            elif data_type == "string":
                return data.decode("utf-8", errors="ignore").rstrip("\x00")
            else:
                return struct.unpack(">H", data[:2])[0]
        except Exception:
            return None

    @staticmethod
    def _value_to_profinet_bytes(value: Any, data_type: str) -> bytes:
        try:
            if data_type == "bool":
                return bytes([1 if value else 0])
            elif data_type in ["int8", "uint8"]:
                return bytes([int(value) & 0xFF])
            elif data_type in ["int16", "uint16"]:
                return struct.pack(">H", int(value) & 0xFFFF)
            elif data_type in ["int32", "uint32"]:
                return struct.pack(">I", int(value) & 0xFFFFFFFF)
            elif data_type == "float32":
                return struct.pack(">f", float(value))
            elif data_type == "float64":
                return struct.pack(">d", float(value))
            elif data_type == "string":
                return str(value).encode("utf-8").ljust(32, b'\x00')
            else:
                return struct.pack(">H", int(value) & 0xFFFF)
        except Exception:
            return b'\x00' * 2


ProtocolFactory.register(ProtocolType.PROFINET, ProfinetParser)