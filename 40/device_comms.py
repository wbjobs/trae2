import socket
import struct
import time
import threading
import queue
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any, Tuple, Deque
from collections import deque

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False


class DeviceType(Enum):
    SERIAL = "serial"
    NETWORK = "network"
    UNKNOWN = "unknown"


class ConnectionStatus(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    ERROR = "error"


@dataclass
class ConnectionStats:
    bytes_sent: int = 0
    bytes_received: int = 0
    packets_sent: int = 0
    packets_received: int = 0
    errors: int = 0
    reconnect_count: int = 0
    avg_response_time: float = 0.0
    _response_times: Deque[float] = field(default_factory=lambda: deque(maxlen=50))

    def add_response_time(self, rt: float):
        self._response_times.append(rt)
        if self._response_times:
            self.avg_response_time = sum(self._response_times) / len(self._response_times)


@dataclass
class DeviceInfo:
    device_id: str
    device_type: DeviceType
    connection: str
    name: str = ""
    status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    port: Optional[int] = None
    baudrate: int = 115200
    timeout: int = 10
    max_reconnect_attempts: int = 5
    heartbeat_interval: int = 30
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CommunicationResult:
    success: bool
    data: bytes = b""
    error_message: str = ""
    response_time: float = 0.0
    retries: int = 0


class DeviceConnection(ABC):
    def __init__(self, device_info: DeviceInfo):
        self.device_info = device_info
        self._lock = threading.RLock()
        self._status = ConnectionStatus.DISCONNECTED
        self._stats = ConnectionStats()
        self._reconnect_attempts = 0
        self._last_activity = 0.0
        self._shutdown = False
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._receive_buffer = bytearray()
        self._packet_queue: queue.Queue[Tuple[int, bytes]] = queue.Queue(maxsize=100)
        self._reader_thread: Optional[threading.Thread] = None

    @abstractmethod
    def _connect_internal(self) -> bool:
        pass

    @abstractmethod
    def _disconnect_internal(self) -> None:
        pass

    @abstractmethod
    def _send_internal(self, data: bytes) -> int:
        pass

    @abstractmethod
    def _receive_internal(self, size: int, timeout: float) -> bytes:
        pass

    def connect(self) -> bool:
        with self._lock:
            if self._status == ConnectionStatus.CONNECTED:
                return True

            self._status = ConnectionStatus.CONNECTING
            self._shutdown = False

            try:
                if self._connect_internal():
                    self._status = ConnectionStatus.CONNECTED
                    self._reconnect_attempts = 0
                    self._last_activity = time.time()
                    self._start_background_threads()
                    return True
            except Exception as e:
                self.device_info.metadata["last_error"] = str(e)

            self._status = ConnectionStatus.ERROR
            return False

    def reconnect(self) -> bool:
        with self._lock:
            if self._reconnect_attempts >= self.device_info.max_reconnect_attempts:
                return False

            self._status = ConnectionStatus.RECONNECTING
            self._reconnect_attempts += 1

            delay = min(1.0 * (2 ** (self._reconnect_attempts - 1)), 10.0)
            time.sleep(delay)

            try:
                self._disconnect_internal()
            except Exception:
                pass

            try:
                if self._connect_internal():
                    self._status = ConnectionStatus.CONNECTED
                    self._stats.reconnect_count += 1
                    self._last_activity = time.time()
                    return True
            except Exception as e:
                self.device_info.metadata["last_error"] = str(e)

            self._status = ConnectionStatus.ERROR
            return False

    def disconnect(self) -> None:
        with self._lock:
            self._shutdown = True
            self._stop_background_threads()
            try:
                self._disconnect_internal()
            except Exception:
                pass
            self._status = ConnectionStatus.DISCONNECTED
            self._receive_buffer.clear()
            while not self._packet_queue.empty():
                try:
                    self._packet_queue.get_nowait()
                except queue.Empty:
                    break

    def _start_background_threads(self):
        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._reader_thread.start()

        if self.device_info.heartbeat_interval > 0:
            self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
            self._heartbeat_thread.start()

    def _stop_background_threads(self):
        if self._reader_thread and self._reader_thread.is_alive():
            self._reader_thread.join(timeout=2.0)

        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            self._heartbeat_thread.join(timeout=2.0)

    def _heartbeat_loop(self):
        while not self._shutdown and self.is_connected():
            try:
                time.sleep(self.device_info.heartbeat_interval)
                if time.time() - self._last_activity > self.device_info.heartbeat_interval:
                    if not self._send_heartbeat():
                        if not self.reconnect():
                            break
            except Exception:
                break

    def _send_heartbeat(self) -> bool:
        ping_packet = DeviceProtocol.build_packet(0x00, b"PING")
        result = self.send_and_receive(ping_packet, expected_size=16, timeout=5.0)
        return result.success

    def _reader_loop(self):
        while not self._shutdown and self.is_connected():
            try:
                data = self._receive_internal(4096, timeout=1.0)
                if data:
                    self._receive_buffer.extend(data)
                    self._stats.bytes_received += len(data)
                    self._parse_packets_from_buffer()
            except socket.timeout:
                continue
            except Exception:
                if not self._shutdown:
                    if not self.reconnect():
                        break

    def _parse_packets_from_buffer(self):
        while len(self._receive_buffer) >= 6:
            start_idx = self._find_start_byte()
            if start_idx < 0:
                self._receive_buffer.clear()
                break

            if start_idx > 0:
                del self._receive_buffer[:start_idx]

            if len(self._receive_buffer) < 6:
                break

            length = (self._receive_buffer[2] << 8) | self._receive_buffer[3]
            total_packet_len = length + 6

            if len(self._receive_buffer) < total_packet_len:
                break

            packet = bytes(self._receive_buffer[:total_packet_len])
            cmd, data = DeviceProtocol.parse_packet(packet)

            if cmd is not None:
                try:
                    self._packet_queue.put_nowait((cmd, data))
                    self._stats.packets_received += 1
                except queue.Full:
                    pass

            del self._receive_buffer[:total_packet_len]

    def _find_start_byte(self) -> int:
        for i, byte in enumerate(self._receive_buffer):
            if byte == DeviceProtocol.START_BYTE:
                return i
        return -1

    def send(self, data: bytes, timeout: Optional[float] = None) -> CommunicationResult:
        start_time = time.time()
        retries = 0
        max_retries = 3

        while retries <= max_retries:
            if not self._ensure_connected():
                return CommunicationResult(
                    success=False,
                    error_message="Failed to connect",
                    response_time=time.time() - start_time,
                    retries=retries
                )

            with self._lock:
                try:
                    actual_timeout = timeout if timeout is not None else self.device_info.timeout
                    bytes_sent = self._send_internal(data)
                    self._stats.bytes_sent += bytes_sent
                    self._stats.packets_sent += 1
                    self._last_activity = time.time()
                    return CommunicationResult(
                        success=True,
                        data=data[:bytes_sent],
                        response_time=time.time() - start_time,
                        retries=retries
                    )
                except Exception as e:
                    retries += 1
                    self._stats.errors += 1
                    if retries <= max_retries:
                        self.reconnect()
                    else:
                        return CommunicationResult(
                            success=False,
                            error_message=str(e),
                            response_time=time.time() - start_time,
                            retries=retries
                        )

        return CommunicationResult(
            success=False,
            error_message="Max retries exceeded",
            response_time=time.time() - start_time,
            retries=retries
        )

    def receive(self, size: int = 1024, timeout: Optional[float] = None) -> CommunicationResult:
        start_time = time.time()
        if not self._ensure_connected():
            return CommunicationResult(
                success=False,
                error_message="Device not connected",
                response_time=time.time() - start_time
            )

        try:
            actual_timeout = timeout if timeout is not None else self.device_info.timeout
            cmd, data = self._packet_queue.get(timeout=actual_timeout)
            return CommunicationResult(
                success=True,
                data=data,
                response_time=time.time() - start_time
            )
        except queue.Empty:
            return CommunicationResult(
                success=False,
                error_message="Receive timeout",
                response_time=time.time() - start_time
            )

    def send_and_receive(
        self, data: bytes, expected_size: int = 1024, timeout: Optional[float] = None
    ) -> CommunicationResult:
        start_time = time.time()
        retries = 0
        max_retries = 3

        while retries <= max_retries:
            if not self._ensure_connected():
                return CommunicationResult(
                    success=False,
                    error_message="Failed to connect",
                    response_time=time.time() - start_time,
                    retries=retries
                )

            with self._lock:
                try:
                    actual_timeout = timeout if timeout is not None else self.device_info.timeout
                    bytes_sent = self._send_internal(data)
                    self._stats.bytes_sent += bytes_sent
                    self._stats.packets_sent += 1
                    self._last_activity = time.time()

                    try:
                        cmd, resp_data = self._packet_queue.get(timeout=actual_timeout)
                        response_time = time.time() - start_time
                        self._stats.add_response_time(response_time)
                        return CommunicationResult(
                            success=True,
                            data=DeviceProtocol.build_packet(cmd, resp_data),
                            response_time=response_time,
                            retries=retries
                        )
                    except queue.Empty:
                        retries += 1
                        self._stats.errors += 1
                        if retries > max_retries:
                            return CommunicationResult(
                                success=False,
                                error_message="Receive timeout",
                                response_time=time.time() - start_time,
                                retries=retries
                            )
                        self.reconnect()

                except Exception as e:
                    retries += 1
                    self._stats.errors += 1
                    if retries > max_retries:
                        return CommunicationResult(
                            success=False,
                            error_message=str(e),
                            response_time=time.time() - start_time,
                            retries=retries
                        )
                    self.reconnect()

        return CommunicationResult(
            success=False,
            error_message="Max retries exceeded",
            response_time=time.time() - start_time,
            retries=retries
        )

    def _ensure_connected(self) -> bool:
        if self.is_connected():
            return True
        if self._status == ConnectionStatus.RECONNECTING:
            return self.reconnect()
        return self.connect()

    def is_connected(self) -> bool:
        return self._status == ConnectionStatus.CONNECTED

    def get_status(self) -> ConnectionStatus:
        return self._status

    def get_stats(self) -> ConnectionStats:
        return self._stats


class SerialConnection(DeviceConnection):
    def __init__(self, device_info: DeviceInfo):
        super().__init__(device_info)
        self._serial: Optional[serial.Serial] = None

    def _connect_internal(self) -> bool:
        if not SERIAL_AVAILABLE:
            return False

        self._serial = serial.Serial(
            port=self.device_info.connection,
            baudrate=self.device_info.baudrate,
            timeout=0.1,
            write_timeout=self.device_info.timeout,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            bytesize=serial.EIGHTBITS,
        )
        return self._serial.is_open

    def _disconnect_internal(self) -> None:
        if self._serial and self._serial.is_open:
            self._serial.close()
        self._serial = None

    def _send_internal(self, data: bytes) -> int:
        if not self._serial:
            raise RuntimeError("Serial port not initialized")
        return self._serial.write(data)

    def _receive_internal(self, size: int, timeout: float) -> bytes:
        if not self._serial:
            raise RuntimeError("Serial port not initialized")
        return self._serial.read(size)


class NetworkConnection(DeviceConnection):
    def __init__(self, device_info: DeviceInfo):
        super().__init__(device_info)
        self._socket: Optional[socket.socket] = None
        self._host = device_info.connection
        self._port = device_info.port or 8080

    def _connect_internal(self) -> bool:
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._socket.settimeout(self.device_info.timeout)
        self._socket.connect((self._host, self._port))
        return True

    def _disconnect_internal(self) -> None:
        if self._socket:
            try:
                self._socket.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                self._socket.close()
            except Exception:
                pass
        self._socket = None

    def _send_internal(self, data: bytes) -> int:
        if not self._socket:
            raise RuntimeError("Socket not initialized")
        total_sent = 0
        while total_sent < len(data):
            sent = self._socket.send(data[total_sent:])
            if sent == 0:
                raise RuntimeError("Socket connection broken")
            total_sent += sent
        return total_sent

    def _receive_internal(self, size: int, timeout: float) -> bytes:
        if not self._socket:
            raise RuntimeError("Socket not initialized")
        self._socket.settimeout(timeout)
        try:
            return self._socket.recv(size)
        except socket.timeout:
            return b""


class DeviceConnectionFactory:
    @staticmethod
    def create_connection(device_info: DeviceInfo) -> DeviceConnection:
        if device_info.device_type == DeviceType.SERIAL:
            return SerialConnection(device_info)
        elif device_info.device_type == DeviceType.NETWORK:
            return NetworkConnection(device_info)
        else:
            raise ValueError(f"Unsupported device type: {device_info.device_type}")


class DeviceScanner:
    @staticmethod
    def scan_serial_ports(baudrate: int = 115200) -> List[DeviceInfo]:
        devices = []
        if not SERIAL_AVAILABLE:
            return devices

        try:
            ports = serial.tools.list_ports.comports()
            for port in ports:
                device_info = DeviceInfo(
                    device_id=f"serial_{port.device}",
                    device_type=DeviceType.SERIAL,
                    connection=port.device,
                    name=port.description or port.device,
                    baudrate=baudrate,
                    metadata={
                        "hwid": port.hwid,
                        "vid": port.vid,
                        "pid": port.pid,
                        "serial_number": port.serial_number,
                    },
                )
                devices.append(device_info)
        except Exception:
            pass
        return devices

    @staticmethod
    def scan_network_devices(ip_range: str, port: int = 8080, timeout: float = 0.3) -> List[DeviceInfo]:
        devices = []
        import ipaddress

        try:
            if "-" in ip_range:
                start_ip, end_ip = ip_range.split("-")
                start = int(ipaddress.IPv4Address(start_ip.strip()))
                end = int(ipaddress.IPv4Address(end_ip.strip()))
                ip_list = [str(ipaddress.IPv4Address(ip)) for ip in range(start, end + 1)]
            elif "/" in ip_range:
                network = ipaddress.ip_network(ip_range, strict=False)
                ip_list = [str(ip) for ip in network.hosts()]
            else:
                ip_list = [ip_range]

            def check_ip(ip: str, result_list: List):
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                    sock.settimeout(timeout)
                    result = sock.connect_ex((ip, port))
                    sock.close()
                    if result == 0:
                        device_info = DeviceInfo(
                            device_id=f"net_{ip}_{port}",
                            device_type=DeviceType.NETWORK,
                            connection=ip,
                            name=f"Network Device {ip}:{port}",
                            port=port,
                        )
                        result_list.append(device_info)
                except Exception:
                    pass

            threads = []
            results: List[DeviceInfo] = []
            for ip in ip_list:
                t = threading.Thread(target=check_ip, args=(ip, results))
                threads.append(t)
                t.start()

            for t in threads:
                t.join()

            devices = results
        except Exception:
            pass

        return devices


class DeviceProtocol:
    START_BYTE = 0xAA
    END_BYTE = 0x55
    CMD_VERSION = 0x01
    CMD_FLASH_INIT = 0x02
    CMD_FLASH_DATA = 0x03
    CMD_FLASH_VERIFY = 0x04
    CMD_FLASH_END = 0x05
    CMD_ERASE = 0x06
    CMD_FLASH_RESUME = 0x07
    CMD_GET_STATUS = 0x08
    RESP_ACK = 0x10
    RESP_NACK = 0x11
    RESP_STATUS = 0x12

    MAX_PACKET_SIZE = 65536

    @staticmethod
    def build_packet(cmd: int, data: bytes = b"") -> bytes:
        if len(data) > DeviceProtocol.MAX_PACKET_SIZE:
            raise ValueError(f"Data too large: {len(data)} bytes")
        length = len(data)
        header = bytes([DeviceProtocol.START_BYTE, cmd, (length >> 8) & 0xFF, length & 0xFF])
        checksum = DeviceProtocol._calculate_checksum(header + data)
        return header + data + bytes([checksum, DeviceProtocol.END_BYTE])

    @staticmethod
    def parse_packet(packet: bytes) -> Tuple[Optional[int], bytes]:
        if len(packet) < 6:
            return None, b""
        if packet[0] != DeviceProtocol.START_BYTE or packet[-1] != DeviceProtocol.END_BYTE:
            return None, b""
        expected_checksum = packet[-2]
        actual_checksum = DeviceProtocol._calculate_checksum(packet[:-2])
        if expected_checksum != actual_checksum:
            return None, b""
        cmd = packet[1]
        length = (packet[2] << 8) | packet[3]
        if len(packet) < length + 6:
            return None, b""
        data = packet[4: 4 + length]
        return cmd, data

    @staticmethod
    def _calculate_checksum(data: bytes) -> int:
        return sum(data) & 0xFF

    @staticmethod
    def calculate_crc16(data: bytes) -> int:
        crc = 0xFFFF
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 0x0001:
                    crc = (crc >> 1) ^ 0xA001
                else:
                    crc >>= 1
        return crc & 0xFFFF
