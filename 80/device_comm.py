#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
设备通信模块
支持 Modbus, MQTT, HTTP, CoAP 协议
"""

import os
import json
import socket
import time
import logging
from typing import Dict, List, Optional, Tuple, Any, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from abc import ABC, abstractmethod


class DeviceProtocol(ABC):
    def __init__(self, address: str, timeout: int = 30):
        self.address = address
        self.timeout = timeout
        self._connected = False
        self._last_activity = 0
        self._reconnect_count = 0
        self._max_reconnect_attempts = 5
        self._reconnect_delay = 2
        self.logger = logging.getLogger(__name__)
    
    @abstractmethod
    def connect(self) -> bool:
        pass
    
    @abstractmethod
    def disconnect(self):
        pass
    
    def is_connected(self) -> bool:
        return self._connected
    
    def ensure_connected(self) -> bool:
        if self._check_connection():
            return True
        
        return self._reconnect()
    
    def _check_connection(self) -> bool:
        if not self._connected:
            return False
        
        try:
            if time.time() - self._last_activity > 30:
                if not self._ping():
                    self._connected = False
                    return False
                self._last_activity = time.time()
            return True
        except Exception:
            self._connected = False
            return False
    
    @abstractmethod
    def _ping(self) -> bool:
        pass
    
    def _reconnect(self) -> bool:
        self.logger.info(f"尝试重连 {self.address}...")
        
        for attempt in range(self._max_reconnect_attempts):
            try:
                self.disconnect()
                
                if self.connect():
                    self._reconnect_count = 0
                    self.logger.info(f"重连成功 {self.address} (尝试 {attempt + 1})")
                    return True
                
                self.logger.warning(
                    f"重连失败 {self.address} (尝试 {attempt + 1}/{self._max_reconnect_attempts})"
                )
                
            except Exception as e:
                self.logger.error(f"重连异常 {self.address}: {e}")
            
            if attempt < self._max_reconnect_attempts - 1:
                delay = min(self._reconnect_delay * (2 ** attempt), 30)
                time.sleep(delay)
        
        self._reconnect_count += 1
        self.logger.error(f"重连最终失败 {self.address}")
        return False
    
    def _update_activity(self):
        self._last_activity = time.time()
    
    @abstractmethod
    def query_version(self) -> Optional[Dict]:
        pass
    
    @abstractmethod
    def send_firmware_chunk(self, chunk_data: bytes, offset: int) -> bool:
        pass
    
    @abstractmethod
    def start_upgrade(self, firmware_size: int, checksum: str) -> bool:
        pass
    
    @abstractmethod
    def get_upgrade_progress(self) -> int:
        pass
    
    @abstractmethod
    def rollback(self) -> bool:
        pass
    
    def get_remote_firmware_size(self) -> int:
        return -1
    
    def get_remote_firmware_hash(self) -> Optional[str]:
        return None
    
    def _execute_with_reconnect(self, operation: Callable, *args, **kwargs):
        for attempt in range(3):
            if not self.ensure_connected():
                continue
            
            try:
                self._update_activity()
                result = operation(*args, **kwargs)
                self._reconnect_count = 0
                return result
            except Exception as e:
                self.logger.warning(
                    f"操作失败 (尝试 {attempt + 1}/3): {e}"
                )
                self._connected = False
                
                if attempt < 2:
                    time.sleep(1)
        
        return None


class ModbusProtocol(DeviceProtocol):
    def __init__(self, address: str, timeout: int = 30):
        super().__init__(address, timeout)
        self._sock = None
        self._tid_counter = 0
    
    def connect(self) -> bool:
        try:
            host, port = self._parse_address(self.address)
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._sock.settimeout(self.timeout)
            self._sock.connect((host, port))
            self._connected = True
            self._last_activity = time.time()
            return True
        except Exception as e:
            self.logger.error(f"Modbus 连接失败: {e}")
            return False
    
    def disconnect(self):
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
        self._connected = False
    
    def _ping(self) -> bool:
        try:
            request = self._build_modbus_request(0x03, 0x0000, 0x0001)
            self._sock.send(request)
            response = self._sock.recv(64)
            return len(response) >= 5
        except Exception as e:
            self.logger.debug(f"Modbus ping 失败: {e}")
            return False
    
    def query_version(self) -> Optional[Dict]:
        def _do_query():
            if not self._connected:
                return None
            
            request = self._build_modbus_request(0x03, 0x0000, 0x0020)
            self._sock.send(request)
            response = self._sock.recv(256)
            
            if len(response) >= 20:
                return {
                    'firmware_version': f"{response[3]}.{response[4]}.{response[5]}",
                    'hardware_version': f"{response[6]}.{response[7]}",
                    'serial_number': response[8:16].hex().upper(),
                    'build_time': f"20{response[16]}-{response[17]:02d}-{response[18]:02d}"
                }
            return None
        
        try:
            if not self.ensure_connected():
                return None
            return self._execute_with_reconnect(_do_query)
        except Exception as e:
            self.logger.error(f"Modbus 查询版本失败: {e}")
            return None
    
    def send_firmware_chunk(self, chunk_data: bytes, offset: int) -> bool:
        def _do_send():
            if not self._connected:
                return False
            
            chunk_size = len(chunk_data)
            header = offset.to_bytes(4, 'big') + chunk_size.to_bytes(2, 'big')
            request = self._build_modbus_request(0x10, 0x0100, (len(header) + chunk_size) // 2, header + chunk_data)
            self._sock.send(request)
            response = self._sock.recv(64)
            return len(response) >= 6
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_send)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"Modbus 发送固件失败: {e}")
            return False
    
    def start_upgrade(self, firmware_size: int, checksum: str) -> bool:
        def _do_start():
            if not self._connected:
                return False
            
            size_bytes = firmware_size.to_bytes(4, 'big')
            checksum_bytes = bytes.fromhex(checksum)[:16]
            data = size_bytes + checksum_bytes
            request = self._build_modbus_request(0x10, 0x0200, len(data) // 2, data)
            self._sock.send(request)
            response = self._sock.recv(64)
            return len(response) >= 6
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_start)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"Modbus 开始升级失败: {e}")
            return False
    
    def get_upgrade_progress(self) -> int:
        def _do_get():
            if not self._connected:
                return -1
            
            request = self._build_modbus_request(0x03, 0x0300, 0x0001)
            self._sock.send(request)
            response = self._sock.recv(64)
            if len(response) >= 5:
                return response[3]
            return -1
        
        try:
            if not self.ensure_connected():
                return -1
            result = self._execute_with_reconnect(_do_get)
            return result if result is not None else -1
        except Exception as e:
            self.logger.error(f"Modbus 获取进度失败: {e}")
            return -1
    
    def rollback(self) -> bool:
        def _do_rollback():
            if not self._connected:
                return False
            
            request = self._build_modbus_request(0x06, 0x0400, 0x0001)
            self._sock.send(request)
            response = self._sock.recv(64)
            return len(response) >= 6
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_rollback)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"Modbus 回滚失败: {e}")
            return False
    
    def get_remote_firmware_size(self) -> int:
        def _do_get_size():
            if not self._connected:
                return -1
            
            request = self._build_modbus_request(0x03, 0x0500, 0x0002)
            self._sock.send(request)
            response = self._sock.recv(64)
            if len(response) >= 9:
                return int.from_bytes(response[3:7], 'big')
            return -1
        
        try:
            if not self.ensure_connected():
                return -1
            result = self._execute_with_reconnect(_do_get_size)
            return result if result is not None else -1
        except Exception:
            return -1
    
    def get_remote_firmware_hash(self) -> Optional[str]:
        def _do_get_hash():
            if not self._connected:
                return None
            
            request = self._build_modbus_request(0x03, 0x0510, 0x0010)
            self._sock.send(request)
            response = self._sock.recv(128)
            if len(response) >= 35:
                return response[3:35].hex()
            return None
        
        try:
            if not self.ensure_connected():
                return None
            return self._execute_with_reconnect(_do_get_hash)
        except Exception:
            return None
    
    def _parse_address(self, address: str) -> Tuple[str, int]:
        if ':' in address:
            host, port = address.split(':')
            return host, int(port)
        return address, 502
    
    def _build_modbus_request(self, function_code: int, address: int, count: int, data: bytes = b'') -> bytes:
        self._tid_counter = (self._tid_counter + 1) & 0xFFFF
        tid = self._tid_counter
        request = tid.to_bytes(2, 'big') + b'\x00\x00'
        length = 6 + len(data)
        request += length.to_bytes(2, 'big')
        request += b'\x01'
        request += function_code.to_bytes(1, 'big')
        request += address.to_bytes(2, 'big')
        request += count.to_bytes(2, 'big')
        request += data
        return request


class HTTPProtocol(DeviceProtocol):
    def __init__(self, address: str, timeout: int = 30):
        super().__init__(address, timeout)
        self._base_url = f"http://{address}"
    
    def connect(self) -> bool:
        try:
            import urllib.request
            url = f"{self._base_url}/api/health"
            with urllib.request.urlopen(url, timeout=self.timeout) as response:
                if response.status == 200:
                    self._connected = True
                    self._last_activity = time.time()
                    return True
        except Exception as e:
            self.logger.error(f"HTTP 连接失败: {e}")
        
        self._connected = False
        return False
    
    def disconnect(self):
        self._connected = False
    
    def _ping(self) -> bool:
        try:
            import urllib.request
            url = f"{self._base_url}/api/health"
            with urllib.request.urlopen(url, timeout=5) as response:
                return response.status == 200
        except Exception as e:
            self.logger.debug(f"HTTP ping 失败: {e}")
            return False
    
    def query_version(self) -> Optional[Dict]:
        def _do_query():
            import urllib.request
            url = f"{self._base_url}/api/version"
            with urllib.request.urlopen(url, timeout=self.timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    return {
                        'firmware_version': data.get('firmware', 'N/A'),
                        'hardware_version': data.get('hardware', 'N/A'),
                        'serial_number': data.get('serial', 'N/A'),
                        'build_time': data.get('build_time', 'N/A')
                    }
            return None
        
        try:
            if not self.ensure_connected():
                return None
            return self._execute_with_reconnect(_do_query)
        except Exception as e:
            self.logger.error(f"HTTP 查询版本失败: {e}")
            return None
    
    def send_firmware_chunk(self, chunk_data: bytes, offset: int) -> bool:
        def _do_send():
            import urllib.request
            url = f"{self._base_url}/api/firmware/upload"
            headers = {
                'Content-Type': 'application/octet-stream',
                'X-Offset': str(offset)
            }
            request = urllib.request.Request(url, data=chunk_data, headers=headers, method='POST')
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status == 200
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_send)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"HTTP 发送固件失败: {e}")
            return False
    
    def start_upgrade(self, firmware_size: int, checksum: str) -> bool:
        def _do_start():
            import urllib.request
            url = f"{self._base_url}/api/firmware/upgrade"
            data = json.dumps({'size': firmware_size, 'checksum': checksum}).encode()
            headers = {'Content-Type': 'application/json'}
            request = urllib.request.Request(url, data=data, headers=headers, method='POST')
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status == 200
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_start)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"HTTP 开始升级失败: {e}")
            return False
    
    def get_upgrade_progress(self) -> int:
        def _do_get():
            import urllib.request
            url = f"{self._base_url}/api/firmware/progress"
            with urllib.request.urlopen(url, timeout=self.timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    return data.get('progress', 0)
            return -1
        
        try:
            if not self.ensure_connected():
                return -1
            result = self._execute_with_reconnect(_do_get)
            return result if result is not None else -1
        except Exception as e:
            self.logger.error(f"HTTP 获取进度失败: {e}")
            return -1
    
    def rollback(self) -> bool:
        def _do_rollback():
            import urllib.request
            url = f"{self._base_url}/api/firmware/rollback"
            request = urllib.request.Request(url, method='POST')
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status == 200
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_rollback)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"HTTP 回滚失败: {e}")
            return False
    
    def get_remote_firmware_size(self) -> int:
        def _do_get():
            import urllib.request
            url = f"{self._base_url}/api/firmware/size"
            with urllib.request.urlopen(url, timeout=self.timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    return data.get('size', -1)
            return -1
        
        try:
            if not self.ensure_connected():
                return -1
            result = self._execute_with_reconnect(_do_get)
            return result if result is not None else -1
        except Exception:
            return -1
    
    def get_remote_firmware_hash(self) -> Optional[str]:
        def _do_get():
            import urllib.request
            url = f"{self._base_url}/api/firmware/hash"
            with urllib.request.urlopen(url, timeout=self.timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    return data.get('hash')
            return None
        
        try:
            if not self.ensure_connected():
                return None
            return self._execute_with_reconnect(_do_get)
        except Exception:
            return None


class MQTTProtocol(DeviceProtocol):
    def __init__(self, address: str, timeout: int = 30):
        super().__init__(address, timeout)
        self._client = None
        self._responses = {}
        self._last_ping = 0
    
    def connect(self) -> bool:
        try:
            import paho.mqtt.client as mqtt
            host, port = self._parse_address(self.address)
            self._client = mqtt.Client()
            self._client.on_message = self._on_message
            self._client.on_disconnect = self._on_disconnect
            self._client.connect(host, port, keepalive=30)
            self._client.loop_start()
            self._client.subscribe("device/+/response")
            time.sleep(1)
            self._connected = True
            self._last_activity = time.time()
            return True
        except Exception as e:
            self.logger.error(f"MQTT 连接失败: {e}")
            self._connected = False
            return False
    
    def disconnect(self):
        if self._client:
            self._client.loop_stop()
            try:
                self._client.disconnect()
            except Exception:
                pass
            self._client = None
        self._connected = False
    
    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            self.logger.warning(f"MQTT 连接断开，返回码: {rc}")
            self._connected = False
    
    def _ping(self) -> bool:
        try:
            if time.time() - self._last_ping < 10:
                return True
            
            self._client.publish("device/ping", "ping")
            self._last_ping = time.time()
            return True
        except Exception as e:
            self.logger.debug(f"MQTT ping 失败: {e}")
            return False
    
    def query_version(self) -> Optional[Dict]:
        def _do_query():
            self._responses.clear()
            self._client.publish("device/all/command", json.dumps({'cmd': 'version'}))
            time.sleep(2)
            for device_id, response in self._responses.items():
                if response.get('cmd') == 'version':
                    return response.get('data')
            return None
        
        try:
            if not self.ensure_connected():
                return None
            return self._execute_with_reconnect(_do_query)
        except Exception as e:
            self.logger.error(f"MQTT 查询版本失败: {e}")
            return None
    
    def send_firmware_chunk(self, chunk_data: bytes, offset: int) -> bool:
        def _do_send():
            import base64
            payload = json.dumps({
                'cmd': 'fw_chunk',
                'offset': offset,
                'data': base64.b64encode(chunk_data).decode()
            })
            self._client.publish("device/all/command", payload)
            time.sleep(0.5)
            return True
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_send)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"MQTT 发送固件失败: {e}")
            return False
    
    def start_upgrade(self, firmware_size: int, checksum: str) -> bool:
        def _do_start():
            payload = json.dumps({
                'cmd': 'fw_upgrade',
                'size': firmware_size,
                'checksum': checksum
            })
            self._client.publish("device/all/command", payload)
            return True
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_start)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"MQTT 开始升级失败: {e}")
            return False
    
    def get_upgrade_progress(self) -> int:
        def _do_get():
            self._responses.clear()
            self._client.publish("device/all/command", json.dumps({'cmd': 'fw_progress'}))
            time.sleep(1)
            for device_id, response in self._responses.items():
                if response.get('cmd') == 'fw_progress':
                    return response.get('data', {}).get('progress', 0)
            return -1
        
        try:
            if not self.ensure_connected():
                return -1
            result = self._execute_with_reconnect(_do_get)
            return result if result is not None else -1
        except Exception as e:
            self.logger.error(f"MQTT 获取进度失败: {e}")
            return -1
    
    def rollback(self) -> bool:
        def _do_rollback():
            self._client.publish("device/all/command", json.dumps({'cmd': 'fw_rollback'}))
            return True
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_rollback)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"MQTT 回滚失败: {e}")
            return False
    
    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            device_id = topic.split('/')[1]
            self._responses[device_id] = json.loads(msg.payload.decode())
        except Exception:
            pass
    
    def _parse_address(self, address: str) -> Tuple[str, int]:
        if ':' in address:
            host, port = address.split(':')
            return host, int(port)
        return address, 1883


class CoAPProtocol(DeviceProtocol):
    def __init__(self, address: str, timeout: int = 30):
        super().__init__(address, timeout)
        self._client = None
    
    def connect(self) -> bool:
        try:
            import coapthon.client.helperclient as coap
            self._client = coap.HelperClient(server=self.address)
            self._connected = True
            self._last_activity = time.time()
            return True
        except Exception as e:
            self.logger.error(f"CoAP 连接失败: {e}")
            self._connected = False
            return False
    
    def disconnect(self):
        if self._client:
            try:
                self._client.stop()
            except Exception:
                pass
            self._client = None
        self._connected = False
    
    def _ping(self) -> bool:
        try:
            import coapthon.client.helperclient as coap
            if not self._client:
                self._client = coap.HelperClient(server=self.address)
            response = self._client.get('.well-known/core')
            return response is not None
        except Exception as e:
            self.logger.debug(f"CoAP ping 失败: {e}")
            return False
    
    def query_version(self) -> Optional[Dict]:
        def _do_query():
            response = self._client.get('version')
            if response and response.payload:
                data = json.loads(response.payload)
                return {
                    'firmware_version': data.get('fw', 'N/A'),
                    'hardware_version': data.get('hw', 'N/A'),
                    'serial_number': data.get('sn', 'N/A'),
                    'build_time': data.get('bt', 'N/A')
                }
            return None
        
        try:
            if not self.ensure_connected():
                return None
            return self._execute_with_reconnect(_do_query)
        except Exception as e:
            self.logger.error(f"CoAP 查询版本失败: {e}")
            return None
    
    def send_firmware_chunk(self, chunk_data: bytes, offset: int) -> bool:
        def _do_send():
            import base64
            payload = json.dumps({
                'offset': offset,
                'data': base64.b64encode(chunk_data).decode()
            })
            response = self._client.post('firmware/upload', payload)
            return response is not None
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_send)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"CoAP 发送固件失败: {e}")
            return False
    
    def start_upgrade(self, firmware_size: int, checksum: str) -> bool:
        def _do_start():
            payload = json.dumps({'size': firmware_size, 'checksum': checksum})
            response = self._client.post('firmware/upgrade', payload)
            return response is not None
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_start)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"CoAP 开始升级失败: {e}")
            return False
    
    def get_upgrade_progress(self) -> int:
        def _do_get():
            response = self._client.get('firmware/progress')
            if response and response.payload:
                data = json.loads(response.payload)
                return data.get('progress', 0)
            return -1
        
        try:
            if not self.ensure_connected():
                return -1
            result = self._execute_with_reconnect(_do_get)
            return result if result is not None else -1
        except Exception as e:
            self.logger.error(f"CoAP 获取进度失败: {e}")
            return -1
    
    def rollback(self) -> bool:
        def _do_rollback():
            response = self._client.post('firmware/rollback', '')
            return response is not None
        
        try:
            if not self.ensure_connected():
                return False
            result = self._execute_with_reconnect(_do_rollback)
            return result if result is not None else False
        except Exception as e:
            self.logger.error(f"CoAP 回滚失败: {e}")
            return False
    
    def get_remote_firmware_size(self) -> int:
        def _do_get():
            response = self._client.get('firmware/size')
            if response and response.payload:
                data = json.loads(response.payload)
                return data.get('size', -1)
            return -1
        
        try:
            if not self.ensure_connected():
                return -1
            result = self._execute_with_reconnect(_do_get)
            return result if result is not None else -1
        except Exception:
            return -1
    
    def get_remote_firmware_hash(self) -> Optional[str]:
        def _do_get():
            response = self._client.get('firmware/hash')
            if response and response.payload:
                data = json.loads(response.payload)
                return data.get('hash')
            return None
        
        try:
            if not self.ensure_connected():
                return None
            return self._execute_with_reconnect(_do_get)
        except Exception:
            return None


class DeviceManager:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self._devices = self._load_devices()
        self._protocols = {}
    
    def _load_devices(self) -> Dict[str, Dict]:
        devices = {}
        try:
            if os.path.exists(self.config.device_db_path):
                with open(self.config.device_db_path, 'r', encoding='utf-8') as f:
                    devices = json.load(f)
        except Exception as e:
            self.logger.warning(f"加载设备列表失败: {e}")
        
        return devices
    
    def _save_devices(self):
        try:
            os.makedirs(os.path.dirname(self.config.device_db_path), exist_ok=True)
            with open(self.config.device_db_path, 'w', encoding='utf-8') as f:
                json.dump(self._devices, f, indent=2, ensure_ascii=False)
        except Exception as e:
            self.logger.error(f"保存设备列表失败: {e}")
    
    def _create_protocol(self, protocol: str, address: str) -> DeviceProtocol:
        protocol_classes = {
            'modbus': ModbusProtocol,
            'mqtt': MQTTProtocol,
            'http': HTTPProtocol,
            'coap': CoAPProtocol,
        }
        
        if protocol not in protocol_classes:
            raise ValueError(f"不支持的协议: {protocol}")
        
        return protocol_classes[protocol](address, self.config.default_timeout)
    
    def get_all_devices(self) -> List[str]:
        return list(self._devices.keys())
    
    def get_device_info(self, device_id: str) -> Optional[Dict]:
        return self._devices.get(device_id)
    
    def add_device(self, device_id: str, address: str, protocol: str = 'modbus') -> bool:
        if device_id in self._devices:
            self.logger.warning(f"设备 {device_id} 已存在")
            return False
        
        if protocol not in self.config.supported_protocols:
            self.logger.error(f"不支持的协议: {protocol}")
            return False
        
        self._devices[device_id] = {
            'id': device_id,
            'address': address,
            'protocol': protocol,
            'added_at': time.time()
        }
        self._save_devices()
        return True
    
    def remove_device(self, device_id: str) -> bool:
        if device_id not in self._devices:
            self.logger.warning(f"设备 {device_id} 不存在")
            return False
        
        del self._devices[device_id]
        self._save_devices()
        return True
    
    def scan_devices(self, timeout: int = 5) -> List[Dict]:
        found_devices = []
        self.logger.info(f"扫描设备 (超时: {timeout}s)")
        
        try:
            local_ip = socket.gethostbyname(socket.gethostname())
            network = '.'.join(local_ip.split('.')[:3])
            
            def scan_ip(ip):
                for port in [502, 80, 1883, 5683]:
                    try:
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        sock.settimeout(0.5)
                        result = sock.connect_ex((ip, port))
                        sock.close()
                        if result == 0:
                            protocol_map = {502: 'modbus', 80: 'http', 1883: 'mqtt', 5683: 'coap'}
                            return {
                                'id': f"device_{ip.replace('.', '_')}",
                                'address': f"{ip}:{port}",
                                'protocol': protocol_map.get(port, 'unknown')
                            }
                    except Exception:
                        pass
                return None
            
            with ThreadPoolExecutor(max_workers=50) as executor:
                futures = [executor.submit(scan_ip, f"{network}.{i}") for i in range(1, 255)]
                for future in as_completed(futures, timeout=timeout):
                    result = future.result()
                    if result:
                        found_devices.append(result)
        
        except Exception as e:
            self.logger.error(f"扫描设备失败: {e}")
        
        return found_devices
    
    def query_versions(self, device_ids: List[str], parallel: bool = True) -> Dict[str, Any]:
        results = {}
        
        def query_device(device_id):
            device_info = self._devices.get(device_id)
            if not device_info:
                return device_id, "设备不存在"
            
            protocol = self._create_protocol(device_info['protocol'], device_info['address'])
            
            if not protocol.connect():
                return device_id, "连接失败"
            
            try:
                version = protocol.query_version()
                return device_id, version if version else "查询失败"
            finally:
                protocol.disconnect()
        
        if parallel:
            with ThreadPoolExecutor(max_workers=self.config.max_parallel_devices) as executor:
                futures = {executor.submit(query_device, device_id): device_id for device_id in device_ids}
                for future in as_completed(futures):
                    device_id, result = future.result()
                    results[device_id] = result
        else:
            for device_id in device_ids:
                device_id, result = query_device(device_id)
                results[device_id] = result
        
        return results
    
    def get_protocol(self, device_id: str) -> Optional[DeviceProtocol]:
        device_info = self._devices.get(device_id)
        if not device_info:
            return None
        
        return self._create_protocol(device_info['protocol'], device_info['address'])
