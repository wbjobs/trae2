#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""设备通信模块

支持多种物联网设备通信协议，用于与终端设备进行通信。
优化：添加断点续传、分片校验、心跳保活、自动重连机制
"""

import logging
import json
import time
import socket
import struct
import hashlib
import threading
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field


logger = logging.getLogger(__name__)


@dataclass
class DeviceInfo:
    """设备信息"""
    device_id: str
    ip: Optional[str] = None
    port: int = 1883
    protocol: str = "mqtt"
    model: Optional[str] = None
    firmware_version: Optional[str] = None
    status: str = "offline"
    extra: Dict[str, Any] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "ip": self.ip,
            "port": self.port,
            "protocol": self.protocol,
            "model": self.model,
            "firmware_version": self.firmware_version,
            "status": self.status,
            "extra": self.extra or {}
        }


@dataclass
class CommunicationResult:
    """通信结果"""
    success: bool
    data: Any = None
    error: Optional[str] = None
    response_time: float = 0.0


@dataclass
class ChunkTransferState:
    """分片传输状态"""
    chunk_index: int = 0
    chunk_hash: str = ""
    transferred: bool = False
    verified: bool = False


@dataclass
class TransferState:
    """传输状态（用于断点续传）"""
    total_size: int = 0
    total_chunks: int = 0
    chunk_size: int = 4096
    transferred_chunks: List[ChunkTransferState] = field(default_factory=list)
    last_success_chunk: int = -1
    is_resumable: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_size": self.total_size,
            "total_chunks": self.total_chunks,
            "chunk_size": self.chunk_size,
            "last_success_chunk": self.last_success_chunk,
            "is_resumable": self.is_resumable
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TransferState':
        state = cls()
        state.total_size = data.get("total_size", 0)
        state.total_chunks = data.get("total_chunks", 0)
        state.chunk_size = data.get("chunk_size", 4096)
        state.last_success_chunk = data.get("last_success_chunk", -1)
        state.is_resumable = data.get("is_resumable", False)
        return state


class ConnectionManager:
    """连接管理器 - 处理心跳保活和自动重连"""

    def __init__(self, protocol: 'BaseProtocol', device: DeviceInfo,
                 heartbeat_interval: int = 30, max_reconnect: int = 5):
        self.protocol = protocol
        self.device = device
        self.heartbeat_interval = heartbeat_interval
        self.max_reconnect = max_reconnect
        self.reconnect_count = 0
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._running = False
        self._lock = threading.Lock()
        self._last_heartbeat: float = 0
        self._on_connection_lost: Optional[Callable] = None

    def start(self, on_connection_lost: Optional[Callable] = None):
        """启动心跳保活"""
        self._on_connection_lost = on_connection_lost
        self._running = True
        self._last_heartbeat = time.time()
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_worker, daemon=True)
        self._heartbeat_thread.start()
        logger.debug(f"[{self.device.device_id}] 心跳保活已启动")

    def stop(self):
        """停止心跳保活"""
        self._running = False
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            self._heartbeat_thread.join(timeout=2)
        logger.debug(f"[{self.device.device_id}] 心跳保活已停止")

    def _heartbeat_worker(self):
        """心跳工作线程"""
        while self._running:
            try:
                time.sleep(self.heartbeat_interval)
                if not self._running:
                    break

                elapsed = time.time() - self._last_heartbeat
                if elapsed > self.heartbeat_interval * 2:
                    logger.warning(f"[{self.device.device_id}] 连接超时，尝试重连...")
                    self._try_reconnect()
                else:
                    self._send_heartbeat()

            except Exception as e:
                logger.error(f"[{self.device.device_id}] 心跳异常: {e}")

    def _send_heartbeat(self):
        """发送心跳"""
        try:
            result = self.protocol.send_command("heartbeat", {"timestamp": int(time.time())})
            if result.success:
                self._last_heartbeat = time.time()
                logger.debug(f"[{self.device.device_id}] 心跳成功")
            else:
                logger.warning(f"[{self.device.device_id}] 心跳失败: {result.error}")
                self._try_reconnect()
        except Exception as e:
            logger.warning(f"[{self.device.device_id}] 心跳异常: {e}")
            self._try_reconnect()

    def _try_reconnect(self):
        """尝试重连"""
        with self._lock:
            if self.reconnect_count >= self.max_reconnect:
                logger.error(f"[{self.device.device_id}] 重连次数已达上限")
                if self._on_connection_lost:
                    self._on_connection_lost()
                self._running = False
                return

            self.reconnect_count += 1
            logger.info(f"[{self.device.device_id}] 正在重连 ({self.reconnect_count}/{self.max_reconnect})...")

            try:
                self.protocol.disconnect()
                time.sleep(1)

                if self.protocol.connect(self.device):
                    self.reconnect_count = 0
                    self._last_heartbeat = time.time()
                    logger.info(f"[{self.device.device_id}] 重连成功")
                else:
                    wait_time = min(2 ** self.reconnect_count, 30)
                    logger.warning(f"[{self.device.device_id}] 重连失败，{wait_time}秒后重试")
                    time.sleep(wait_time)

            except Exception as e:
                logger.error(f"[{self.device.device_id}] 重连异常: {e}")
                time.sleep(min(2 ** self.reconnect_count, 30))

    def record_activity(self):
        """记录活动，重置心跳计时器"""
        self._last_heartbeat = time.time()


class BaseProtocol(ABC):
    """通信协议基类"""

    def __init__(self, timeout: int = 30):
        self.timeout = timeout
        self._connection_manager: Optional[ConnectionManager] = None

    @abstractmethod
    def connect(self, device: DeviceInfo) -> bool:
        """连接设备"""
        pass

    @abstractmethod
    def disconnect(self):
        """断开连接"""
        pass

    @abstractmethod
    def send_command(self, command: str, payload: Any = None) -> CommunicationResult:
        """发送命令"""
        pass

    @abstractmethod
    def query_version(self) -> CommunicationResult:
        """查询版本"""
        pass

    @abstractmethod
    def send_firmware(self, firmware_data: bytes, progress_callback=None,
                      resume_state: Optional[TransferState] = None) -> CommunicationResult:
        """发送固件数据"""
        pass

    def read_firmware(self) -> CommunicationResult:
        """
        读取设备当前固件（用于备份）

        默认实现返回 None，具体协议可重写此方法
        """
        return CommunicationResult(
            success=True,
            data=None
        )

    def start_keepalive(self, device: DeviceInfo, on_connection_lost: Optional[Callable] = None):
        """启动心跳保活"""
        if self._connection_manager:
            self._connection_manager.stop()

        self._connection_manager = ConnectionManager(self, device)
        self._connection_manager.start(on_connection_lost)

    def stop_keepalive(self):
        """停止心跳保活"""
        if self._connection_manager:
            self._connection_manager.stop()
            self._connection_manager = None

    def _calculate_chunk_hash(self, data: bytes) -> str:
        """计算数据块哈希"""
        return hashlib.md5(data).hexdigest()

    def _verify_chunk(self, chunk: bytes, expected_hash: str) -> bool:
        """验证数据块"""
        return self._calculate_chunk_hash(chunk) == expected_hash

    def _save_transfer_state(self, device_id: str, state: TransferState):
        """保存传输状态（用于断点续传）"""
        try:
            import os
            state_dir = os.path.join(os.path.dirname(__file__), '..', 'transfer_states')
            os.makedirs(state_dir, exist_ok=True)
            state_path = os.path.join(state_dir, f"{device_id}.json")
            with open(state_path, 'w', encoding='utf-8') as f:
                json.dump(state.to_dict(), f)
            logger.debug(f"[{device_id}] 传输状态已保存")
        except Exception as e:
            logger.warning(f"[{device_id}] 保存传输状态失败: {e}")

    def _load_transfer_state(self, device_id: str) -> Optional[TransferState]:
        """加载传输状态"""
        try:
            import os
            state_path = os.path.join(os.path.dirname(__file__), '..', 'transfer_states', f"{device_id}.json")
            if os.path.exists(state_path):
                with open(state_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                state = TransferState.from_dict(data)
                state.is_resumable = True
                logger.debug(f"[{device_id}] 找到可恢复的传输状态")
                return state
        except Exception as e:
            logger.warning(f"[{device_id}] 加载传输状态失败: {e}")
        return None

    def _clear_transfer_state(self, device_id: str):
        """清除传输状态"""
        try:
            import os
            state_path = os.path.join(os.path.dirname(__file__), '..', 'transfer_states', f"{device_id}.json")
            if os.path.exists(state_path):
                os.remove(state_path)
                logger.debug(f"[{device_id}] 传输状态已清除")
        except Exception as e:
            logger.warning(f"[{device_id}] 清除传输状态失败: {e}")


class MQTTProtocol(BaseProtocol):
    """MQTT协议实现"""

    def __init__(self, timeout: int = 30, broker_host: str = None, broker_port: int = 1883):
        super().__init__(timeout)
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.client = None
        self.device = None
        self._response = None
        self._response_received = threading.Event()
        self._lock = threading.Lock()

    def connect(self, device: DeviceInfo) -> bool:
        try:
            import paho.mqtt.client as mqtt
            self.device = device
            self.client = mqtt.Client(client_id=f"fw_upgrade_{int(time.time())}_{id(self)}")
            self.client.on_message = self._on_message
            self.client.on_disconnect = self._on_disconnect
            self.client.reconnect_delay_set(min_delay=1, max_delay=30)
            self.client.connect(
                self.broker_host or device.ip,
                self.broker_port or device.port,
                keepalive=self.timeout
            )
            self.client.loop_start()
            self.client.subscribe(f"device/{device.device_id}/response")
            logger.info(f"MQTT连接成功: {device.device_id}")
            return True
        except ImportError:
            logger.warning("未安装paho-mqtt库，使用模拟模式")
            self.device = device
            return True
        except Exception as e:
            logger.error(f"MQTT连接失败: {e}")
            return False

    def _on_disconnect(self, client, userdata, rc):
        """MQTT断开回调"""
        if rc != 0:
            logger.warning(f"[{self.device.device_id if self.device else '?'}] MQTT意外断开 (code={rc})")

    def _on_message(self, client, userdata, msg):
        try:
            with self._lock:
                self._response = json.loads(msg.payload.decode())
                self._response_received.set()
        except Exception as e:
            logger.error(f"解析MQTT消息失败: {e}")

    def disconnect(self):
        if self._connection_manager:
            self._connection_manager.stop()
        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception as e:
                logger.error(f"MQTT断开失败: {e}")
        self.client = None

    def send_command(self, command: str, payload: Any = None) -> CommunicationResult:
        start_time = time.time()
        self._response_received.clear()
        self._response = None

        try:
            message = {
                "command": command,
                "timestamp": int(time.time()),
                "payload": payload or {}
            }

            if self.client:
                topic = f"device/{self.device.device_id}/command"
                self.client.publish(topic, json.dumps(message))

                if not self._response_received.wait(timeout=self.timeout):
                    return CommunicationResult(
                        success=False,
                        error="命令超时",
                        response_time=time.time() - start_time
                    )

                return CommunicationResult(
                    success=self._response.get("success", False),
                    data=self._response.get("data"),
                    error=self._response.get("error"),
                    response_time=time.time() - start_time
                )
            else:
                return self._simulate_response(command, payload, start_time)

        except Exception as e:
            return CommunicationResult(
                success=False,
                error=str(e),
                response_time=time.time() - start_time
            )

    def _simulate_response(self, command: str, payload: Any, start_time: float) -> CommunicationResult:
        time.sleep(0.3)

        if command == "query_version":
            return CommunicationResult(
                success=True,
                data={"version": "v1.0.0", "model": "SIM-MODEL-001"},
                response_time=time.time() - start_time
            )
        elif command == "start_upgrade":
            return CommunicationResult(
                success=True,
                data={"status": "ready", "max_chunk_size": 4096, "supported_hash": "md5"},
                response_time=time.time() - start_time
            )
        elif command == "send_chunk":
            chunk_hash = payload.get("hash", "") if payload else ""
            return CommunicationResult(
                success=True,
                data={"received": True, "hash_verified": True, "expected_hash": chunk_hash},
                response_time=time.time() - start_time
            )
        elif command == "finish_upgrade":
            return CommunicationResult(
                success=True,
                data={"status": "upgrading"},
                response_time=time.time() - start_time
            )
        elif command == "heartbeat":
            return CommunicationResult(
                success=True,
                data={"status": "alive"},
                response_time=time.time() - start_time
            )
        elif command == "query_progress":
            return CommunicationResult(
                success=True,
                data={"last_chunk": -1, "status": "idle"},
                response_time=time.time() - start_time
            )
        else:
            return CommunicationResult(
                success=True,
                data={"status": "ok"},
                response_time=time.time() - start_time
            )

    def query_version(self) -> CommunicationResult:
        return self.send_command("query_version")

    def send_firmware(self, firmware_data: bytes, progress_callback=None,
                      resume_state: Optional[TransferState] = None) -> CommunicationResult:
        chunk_size = 4096
        total_chunks = (len(firmware_data) + chunk_size - 1) // chunk_size
        start_chunk = 0

        if resume_state and resume_state.is_resumable:
            start_chunk = resume_state.last_success_chunk + 1
            logger.info(f"[{self.device.device_id}] 从分片 {start_chunk} 恢复传输")

            progress_result = self.send_command("query_progress")
            if progress_result.success and progress_result.data:
                device_last = progress_result.data.get("last_chunk", -1)
                if device_last > start_chunk:
                    start_chunk = device_last + 1

        if start_chunk == 0:
            result = self.send_command("start_upgrade", {
                "size": len(firmware_data),
                "total_chunks": total_chunks,
                "chunk_size": chunk_size,
                "hash_algorithm": "md5"
            })
            if not result.success:
                return result
        else:
            result = self.send_command("resume_upgrade", {
                "size": len(firmware_data),
                "total_chunks": total_chunks,
                "start_chunk": start_chunk,
                "hash_algorithm": "md5"
            })
            if not result.success:
                logger.warning(f"[{self.device.device_id}] 恢复传输失败，从头开始")
                start_chunk = 0
                result = self.send_command("start_upgrade", {
                    "size": len(firmware_data),
                    "total_chunks": total_chunks,
                    "chunk_size": chunk_size,
                    "hash_algorithm": "md5"
                })
                if not result.success:
                    return result

        state = TransferState(
            total_size=len(firmware_data),
            total_chunks=total_chunks,
            chunk_size=chunk_size,
            is_resumable=True
        )

        for i in range(start_chunk, total_chunks):
            start = i * chunk_size
            end = min(start + chunk_size, len(firmware_data))
            chunk = firmware_data[start:end]
            chunk_hash = self._calculate_chunk_hash(chunk)

            for attempt in range(3):
                result = self.send_command("send_chunk", {
                    "chunk_index": i,
                    "total_chunks": total_chunks,
                    "data": chunk.hex(),
                    "hash": chunk_hash
                })

                if result.success:
                    verified = True
                    if result.data and "expected_hash" in result.data:
                        verified = result.data.get("hash_verified", True)

                    if verified:
                        state.last_success_chunk = i
                        self._save_transfer_state(self.device.device_id, state)
                        break
                    else:
                        logger.warning(f"[{self.device.device_id}] 分片 {i} 哈希校验失败，重试 {attempt + 1}/3")
                else:
                    logger.warning(f"[{self.device.device_id}] 分片 {i} 发送失败: {result.error}，重试 {attempt + 1}/3")
                    time.sleep(1)
            else:
                return CommunicationResult(
                    success=False,
                    error=f"分片 {i} 传输失败，已重试3次"
                )

            if progress_callback:
                progress_callback((i + 1) / total_chunks * 100)

        self._clear_transfer_state(self.device.device_id)
        return self.send_command("finish_upgrade")


class HTTPProtocol(BaseProtocol):
    """HTTP协议实现"""

    def __init__(self, timeout: int = 30):
        super().__init__(timeout)
        self.device = None
        self.base_url = None
        self._session = None

    def connect(self, device: DeviceInfo) -> bool:
        try:
            self.device = device
            self.base_url = f"http://{device.ip}:{device.port}"
            logger.info(f"HTTP连接成功: {device.ip}:{device.port}")
            return True
        except Exception as e:
            logger.error(f"HTTP连接失败: {e}")
            return False

    def disconnect(self):
        self.device = None
        self.base_url = None

    def send_command(self, command: str, payload: Any = None) -> CommunicationResult:
        start_time = time.time()
        try:
            import urllib.request
            import urllib.error

            url = f"{self.base_url}/api/{command}"
            data = json.dumps(payload or {}).encode() if payload else None

            req = urllib.request.Request(url, data=data, method='POST')
            req.add_header('Content-Type', 'application/json')

            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                result = json.loads(response.read().decode())
                return CommunicationResult(
                    success=result.get("success", False),
                    data=result.get("data"),
                    error=result.get("error"),
                    response_time=time.time() - start_time
                )
        except ImportError:
            return self._simulate_response(command, payload, start_time)
        except Exception as e:
            return CommunicationResult(
                success=False,
                error=str(e),
                response_time=time.time() - start_time
            )

    def _simulate_response(self, command: str, payload: Any, start_time: float) -> CommunicationResult:
        time.sleep(0.2)
        if command == "version":
            return CommunicationResult(
                success=True,
                data={"version": "v1.0.0", "model": "HTTP-MODEL-001"},
                response_time=time.time() - start_time
            )
        return CommunicationResult(
            success=True,
            data={"status": "ok"},
            response_time=time.time() - start_time
        )

    def query_version(self) -> CommunicationResult:
        return self.send_command("version")

    def send_firmware(self, firmware_data: bytes, progress_callback=None,
                      resume_state: Optional[TransferState] = None) -> CommunicationResult:
        start_time = time.time()
        chunk_size = 64 * 1024
        total_chunks = (len(firmware_data) + chunk_size - 1) // chunk_size
        start_chunk = 0

        if resume_state and resume_state.is_resumable:
            start_chunk = resume_state.last_success_chunk + 1
            logger.info(f"[{self.device.device_id}] 从分片 {start_chunk} 恢复传输")

        state = TransferState(
            total_size=len(firmware_data),
            total_chunks=total_chunks,
            chunk_size=chunk_size,
            is_resumable=True
        )

        for i in range(start_chunk, total_chunks):
            start = i * chunk_size
            end = min(start + chunk_size, len(firmware_data))
            chunk = firmware_data[start:end]
            chunk_hash = self._calculate_chunk_hash(chunk)

            for attempt in range(3):
                try:
                    import urllib.request

                    url = f"{self.base_url}/api/upload_chunk"
                    headers = {
                        'Content-Type': 'application/octet-stream',
                        'X-Chunk-Index': str(i),
                        'X-Total-Chunks': str(total_chunks),
                        'X-Chunk-Hash': chunk_hash,
                        'X-Total-Size': str(len(firmware_data))
                    }

                    req = urllib.request.Request(url, data=chunk, method='POST', headers=headers)

                    with urllib.request.urlopen(req, timeout=self.timeout) as response:
                        result = json.loads(response.read().decode())

                        if result.get("success") and result.get("hash_verified", True):
                            state.last_success_chunk = i
                            self._save_transfer_state(self.device.device_id, state)
                            break
                        else:
                            logger.warning(f"[{self.device.device_id}] 分片 {i} 验证失败，重试 {attempt + 1}/3")
                except Exception as e:
                    logger.warning(f"[{self.device.device_id}] 分片 {i} 发送失败: {e}，重试 {attempt + 1}/3")

                time.sleep(1)
            else:
                return CommunicationResult(
                    success=False,
                    error=f"分片 {i} 传输失败"
                )

            if progress_callback:
                progress_callback((i + 1) / total_chunks * 100)

        self._clear_transfer_state(self.device.device_id)

        try:
            import urllib.request
            url = f"{self.base_url}/api/finish_upgrade"
            req = urllib.request.Request(url, method='POST')
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                result = json.loads(response.read().decode())
                return CommunicationResult(
                    success=result.get("success", True),
                    data=result.get("data"),
                    error=result.get("error"),
                    response_time=time.time() - start_time
                )
        except Exception as e:
            return CommunicationResult(
                success=False,
                error=f"完成升级失败: {e}",
                response_time=time.time() - start_time
            )


class CoAPProtocol(BaseProtocol):
    """CoAP协议实现"""

    def __init__(self, timeout: int = 30):
        super().__init__(timeout)
        self.device = None

    def connect(self, device: DeviceInfo) -> bool:
        try:
            self.device = device
            logger.info(f"CoAP连接成功: {device.ip}:{device.port}")
            return True
        except Exception as e:
            logger.error(f"CoAP连接失败: {e}")
            return False

    def disconnect(self):
        self.device = None

    def send_command(self, command: str, payload: Any = None) -> CommunicationResult:
        start_time = time.time()
        time.sleep(0.3)
        return CommunicationResult(
            success=True,
            data={"version": "v1.0.0", "model": "COAP-MODEL-001"},
            response_time=time.time() - start_time
        )

    def query_version(self) -> CommunicationResult:
        return self.send_command("version")

    def send_firmware(self, firmware_data: bytes, progress_callback=None,
                      resume_state: Optional[TransferState] = None) -> CommunicationResult:
        start_time = time.time()
        chunk_size = 1024
        total_chunks = (len(firmware_data) + chunk_size - 1) // chunk_size

        for i in range(total_chunks):
            start = i * chunk_size
            end = min(start + chunk_size, len(firmware_data))
            time.sleep(0.01)

            if progress_callback:
                progress_callback((i + 1) / total_chunks * 100)

        return CommunicationResult(
            success=True,
            data={"status": "success"},
            response_time=time.time() - start_time
        )


class ModbusProtocol(BaseProtocol):
    """Modbus协议实现"""

    def __init__(self, timeout: int = 30):
        super().__init__(timeout)
        self.device = None
        self.client = None
        self._lock = threading.Lock()

    def connect(self, device: DeviceInfo) -> bool:
        try:
            self.device = device
            self.client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.client.settimeout(self.timeout)
            self.client.connect((device.ip, device.port or 502))
            logger.info(f"Modbus连接成功: {device.ip}:{device.port or 502}")
            return True
        except Exception as e:
            logger.error(f"Modbus连接失败: {e}")
            return False

    def disconnect(self):
        if self.client:
            try:
                self.client.close()
            except Exception as e:
                logger.error(f"Modbus断开失败: {e}")
        self.client = None

    def _reconnect(self) -> bool:
        """重连Modbus"""
        try:
            if self.client:
                try:
                    self.client.close()
                except Exception:
                    pass

            self.client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.client.settimeout(self.timeout)
            self.client.connect((self.device.ip, self.device.port or 502))
            logger.info(f"[{self.device.device_id}] Modbus重连成功")
            return True
        except Exception as e:
            logger.error(f"[{self.device.device_id}] Modbus重连失败: {e}")
            return False

    def send_command(self, command: str, payload: Any = None) -> CommunicationResult:
        start_time = time.time()
        try:
            with self._lock:
                if not self.client:
                    return CommunicationResult(
                        success=False,
                        error="未连接",
                        response_time=time.time() - start_time
                    )

                transaction_id = int(time.time()) % 65536
                protocol_id = 0
                unit_id = 1

                if command == "query_version":
                    function_code = 3
                    start_addr = 0
                    quantity = 10

                    data = struct.pack('>HHHBBHH',
                                       transaction_id, protocol_id, 6, unit_id,
                                       function_code, start_addr, quantity
                                       )

                    try:
                        self.client.send(data)
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        logger.warning(f"[{self.device.device_id}] 连接断开，尝试重连")
                        if self._reconnect():
                            self.client.send(data)
                        else:
                            return CommunicationResult(
                                success=False,
                                error="重连失败",
                                response_time=time.time() - start_time
                            )

                    response = self.client.recv(1024)

                    if len(response) > 5:
                        version_data = response[9:].decode('ascii', errors='ignore').strip('\x00')
                        return CommunicationResult(
                            success=True,
                            data={"version": version_data or "v1.0.0"},
                            response_time=time.time() - start_time
                        )

                return CommunicationResult(
                    success=True,
                    data={"status": "ok"},
                    response_time=time.time() - start_time
                )

        except Exception as e:
            return CommunicationResult(
                success=False,
                error=str(e),
                response_time=time.time() - start_time
            )

    def query_version(self) -> CommunicationResult:
        return self.send_command("query_version")

    def send_firmware(self, firmware_data: bytes, progress_callback=None,
                      resume_state: Optional[TransferState] = None) -> CommunicationResult:
        start_time = time.time()
        total = len(firmware_data)
        chunk_size = 256
        total_chunks = (total + chunk_size - 1) // chunk_size
        sent = 0

        with self._lock:
            for i in range(total_chunks):
                start = i * chunk_size
                end = min(start + chunk_size, total)
                chunk = firmware_data[start:end]

                for attempt in range(3):
                    try:
                        if not self.client:
                            if not self._reconnect():
                                return CommunicationResult(
                                    success=False,
                                    error="连接失败且重连失败",
                                    response_time=time.time() - start_time
                                )

                        self.client.send(chunk)
                        sent += len(chunk)

                        if progress_callback:
                            progress_callback(sent / total * 100)
                        break

                    except (BrokenPipeError, ConnectionResetError, OSError) as e:
                        logger.warning(f"[{self.device.device_id}] 发送失败: {e}，尝试重连")
                        if not self._reconnect():
                            if attempt < 2:
                                time.sleep(1)
                                continue
                            return CommunicationResult(
                                success=False,
                                error=f"发送失败: {e}",
                                response_time=time.time() - start_time
                            )
                        time.sleep(0.5)

                    except Exception as e:
                        if attempt < 2:
                            time.sleep(1)
                            continue
                        return CommunicationResult(
                            success=False,
                            error=f"发送失败: {e}",
                            response_time=time.time() - start_time
                        )

        return CommunicationResult(
            success=True,
            data={"status": "success"},
            response_time=time.time() - start_time
        )


class DeviceCommunicator:
    """设备通信器"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._protocols: Dict[str, BaseProtocol] = {}
        self._devices: Dict[str, DeviceInfo] = {}
        self._enable_keepalive = config.get("enable_keepalive", True)
        self._heartbeat_interval = config.get("heartbeat_interval", 30)

    def _get_protocol(self, protocol: str, timeout: int) -> BaseProtocol:
        """获取协议实例"""
        protocol_map = {
            "mqtt": MQTTProtocol,
            "http": HTTPProtocol,
            "coap": CoAPProtocol,
            "modbus": ModbusProtocol,
        }

        protocol_class = protocol_map.get(protocol.lower())
        if not protocol_class:
            raise ValueError(f"不支持的协议: {protocol}")

        return protocol_class(timeout=timeout)

    def get_device_info(self, device_identifier: str, protocol: str = "mqtt", timeout: int = 30) -> Optional[DeviceInfo]:
        """
        获取设备信息
        """
        if device_identifier in self._devices:
            return self._devices[device_identifier]

        is_ip = '.' in device_identifier and ':' not in device_identifier.split('/')[0]

        device = DeviceInfo(
            device_id=device_identifier if not is_ip else f"device_{device_identifier.replace('.', '_')}",
            ip=device_identifier if is_ip else None,
            protocol=protocol
        )

        self._devices[device_identifier] = device
        return device

    def query_version(self, device_identifier: str = None, protocol: str = "mqtt", timeout: int = 30) -> int:
        """
        查询设备版本
        """
        if device_identifier:
            return self._query_single_device(device_identifier, protocol, timeout)
        else:
            return self._query_all_devices(protocol, timeout)

    def _query_single_device(self, device_identifier: str, protocol: str, timeout: int) -> int:
        """查询单台设备版本"""
        device = self.get_device_info(device_identifier, protocol, timeout)
        if not device:
            logger.error(f"未找到设备: {device_identifier}")
            return 1

        proto = self._get_protocol(device.protocol or protocol, timeout)

        try:
            if not proto.connect(device):
                logger.error(f"连接设备失败: {device.device_id}")
                return 1

            result = proto.query_version()

            if result.success:
                version = result.data.get("version", "unknown") if isinstance(result.data, dict) else str(result.data)
                model = result.data.get("model", "unknown") if isinstance(result.data, dict) else "unknown"
                print(f"设备: {device.device_id}")
                print(f"  IP: {device.ip or '-'}")
                print(f"  型号: {model}")
                print(f"  固件版本: {version}")
                print(f"  响应时间: {result.response_time:.2f}s")
                return 0
            else:
                logger.error(f"查询失败: {result.error}")
                return 1

        finally:
            proto.disconnect()

    def _query_all_devices(self, protocol: str, timeout: int) -> int:
        """查询所有设备版本"""
        import os
        from .utils.common import load_json

        device_config = self.config.get("device_config", "./devices.json")
        if not os.path.exists(device_config):
            logger.error("未找到设备配置文件")
            return 1

        devices = load_json(device_config)
        if not devices:
            logger.info("暂无设备")
            return 0

        success_count = 0
        print(f"{'ID':<20} {'IP':<15} {'Model':<15} {'Version':<15} {'Status':<10}")
        print("-" * 75)

        for dev_cfg in devices:
            device = DeviceInfo(
                device_id=dev_cfg.get("id", dev_cfg.get("device_id", str(dev_cfg.get("ip", "unknown")))),
                ip=dev_cfg.get("ip"),
                port=dev_cfg.get("port", 1883),
                protocol=dev_cfg.get("protocol", protocol),
                model=dev_cfg.get("model")
            )

            proto = self._get_protocol(device.protocol, timeout)

            try:
                if not proto.connect(device):
                    print(f"{device.device_id:<20} {device.ip or '-':<15} {'-':<15} {'-':<15} {'连接失败':<10}")
                    continue

                result = proto.query_version()

                if result.success:
                    version = result.data.get("version", "unknown") if isinstance(result.data, dict) else str(result.data)
                    model = result.data.get("model", device.model or "unknown") if isinstance(result.data, dict) else device.model or "unknown"
                    print(f"{device.device_id:<20} {device.ip or '-':<15} {model:<15} {version:<15} {'在线':<10}")
                    success_count += 1
                else:
                    print(f"{device.device_id:<20} {device.ip or '-':<15} {'-':<15} {'-':<15} {'查询失败':<10}")

            except Exception as e:
                print(f"{device.device_id:<20} {device.ip or '-':<15} {'-':<15} {'-':<15} {'错误':<10}")
                logger.error(f"查询设备 {device.device_id} 失败: {e}")
            finally:
                proto.disconnect()

        print(f"\n查询完成: {success_count}/{len(devices)} 台设备成功")
        return 0 if success_count == len(devices) else 1

    def upgrade_device(self, device_identifier: str, firmware_path: str, protocol: str = "mqtt",
                       timeout: int = 30, retry_count: int = 3, progress_callback=None) -> CommunicationResult:
        """
        升级设备 - 支持断点续传
        """
        import os

        if not os.path.exists(firmware_path):
            return CommunicationResult(
                success=False,
                error=f"固件文件不存在: {firmware_path}"
            )

        with open(firmware_path, 'rb') as f:
            firmware_data = f.read()

        device = self.get_device_info(device_identifier, protocol, timeout)
        if not device:
            return CommunicationResult(
                success=False,
                error=f"未找到设备: {device_identifier}"
            )

        last_error = None
        for attempt in range(retry_count):
            proto = self._get_protocol(device.protocol or protocol, timeout)

            try:
                if not proto.connect(device):
                    last_error = "连接设备失败"
                    logger.warning(f"升级尝试 {attempt + 1}/{retry_count} 失败: {last_error}")
                    continue

                if self._enable_keepalive:
                    def on_connection_lost():
                        logger.error(f"[{device.device_id}] 连接丢失")
                    proto.start_keepalive(device, on_connection_lost)

                logger.info(f"开始升级设备 {device.device_id}, 固件大小: {len(firmware_data)} 字节")

                resume_state = proto._load_transfer_state(device.device_id)
                result = proto.send_firmware(firmware_data, progress_callback, resume_state)

                if result.success:
                    logger.info(f"设备 {device.device_id} 升级成功")
                    return result
                else:
                    last_error = result.error
                    logger.warning(f"升级尝试 {attempt + 1}/{retry_count} 失败: {last_error}")

            except Exception as e:
                last_error = str(e)
                logger.warning(f"升级尝试 {attempt + 1}/{retry_count} 异常: {e}")
            finally:
                proto.stop_keepalive()
                proto.disconnect()

            if attempt < retry_count - 1:
                time.sleep(self.config.get("retry_interval", 5))

        return CommunicationResult(
            success=False,
            error=f"升级失败，已重试 {retry_count} 次: {last_error}"
        )

    def send_firmware(self, device_id: str, firmware_data: bytes, firmware_version: str,
                      protocol: str = "mqtt", timeout: int = 30,
                      is_rollback: bool = False) -> CommunicationResult:
        """
        发送固件数据到设备（用于回滚）

        Args:
            device_id: 设备ID
            firmware_data: 固件数据
            firmware_version: 固件版本
            protocol: 通信协议
            timeout: 超时时间
            is_rollback: 是否为回滚操作

        Returns:
            通信结果
        """
        device = self.get_device_info(device_id, protocol, timeout)
        if not device:
            return CommunicationResult(
                success=False,
                error=f"未找到设备: {device_id}"
            )

        proto = self._get_protocol(device.protocol or protocol, timeout)

        try:
            if not proto.connect(device):
                return CommunicationResult(
                    success=False,
                    error="连接设备失败"
                )

            if is_rollback:
                logger.info(f"开始回滚设备 {device_id} 到版本 {firmware_version}")

            result = proto.send_firmware(firmware_data)

            if result.success:
                logger.info(f"设备 {device_id} 固件发送成功")
                return CommunicationResult(
                    success=True,
                    data={"version": firmware_version}
                )
            else:
                return result

        except Exception as e:
            logger.error(f"发送固件失败: {e}")
            return CommunicationResult(
                success=False,
                error=str(e)
            )
        finally:
            proto.disconnect()

    def query_firmware_version(self, device_identifier: str, protocol: str = "mqtt",
                                timeout: int = 30) -> CommunicationResult:
        """
        查询设备固件版本（返回数据格式，用于备份和回滚）

        Args:
            device_identifier: 设备标识
            protocol: 通信协议
            timeout: 超时时间

        Returns:
            通信结果，包含版本信息和可选的固件数据
        """
        device = self.get_device_info(device_identifier, protocol, timeout)
        if not device:
            return CommunicationResult(
                success=False,
                error=f"未找到设备: {device_identifier}"
            )

        proto = self._get_protocol(device.protocol or protocol, timeout)

        try:
            if not proto.connect(device):
                return CommunicationResult(
                    success=False,
                    error="连接设备失败"
                )

            result = proto.query_version()

            if result.success:
                version = result.data.get("version", "unknown") if isinstance(result.data, dict) else str(result.data)

                firmware_data = None
                try:
                    read_result = proto.read_firmware()
                    if read_result.success and read_result.data:
                        firmware_data = read_result.data
                except Exception:
                    pass

                return CommunicationResult(
                    success=True,
                    data={
                        "version": version,
                        "model": result.data.get("model", "unknown") if isinstance(result.data, dict) else "unknown",
                        "firmware_data": firmware_data
                    }
                )
            else:
                return result

        except Exception as e:
            logger.error(f"查询固件版本失败: {e}")
            return CommunicationResult(
                success=False,
                error=str(e)
            )
        finally:
            proto.disconnect()
