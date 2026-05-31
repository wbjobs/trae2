"""
MQTT 客户端 - 用于边缘端与云端消息通信
"""
import json
import threading
import time
from typing import Callable, Dict, List, Optional
from datetime import datetime
from shared.src.models import Message
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("mqtt_client")


class MQTTClient:
    """MQTT 客户端封装"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        cross_node_config = config.get("services", "cross_node")
        self._broker_url = cross_node_config.get("mqtt_broker", "mqtt://localhost:1883")
        self._client_id = f"gateway-{config.get('gateway', 'id', default='edge')}"
        self._client = None
        self._connected = False
        self._subscriptions: Dict[str, List[Callable]] = {}
        self._message_queue: List[Message] = []
        self._lock = threading.Lock()

    def connect(self) -> bool:
        try:
            try:
                import paho.mqtt.client as mqtt
                
                self._client = mqtt.Client(client_id=self._client_id)
                self._client.on_connect = self._on_connect
                self._client.on_message = self._on_message
                self._client.on_disconnect = self._on_disconnect
                
                broker_parts = self._broker_url.replace("mqtt://", "").split(":")
                host = broker_parts[0]
                port = int(broker_parts[1]) if len(broker_parts) > 1 else 1883
                
                self._client.connect(host, port, keepalive=60)
                self._client.loop_start()
                
                logger.info(f"MQTT 连接成功: {self._broker_url}")
                return True
            except ImportError:
                logger.warning("paho-mqtt 未安装, 使用模拟模式")
                self._client = _MockMQTTClient(self._broker_url)
                self._connected = True
                return True
        except Exception as e:
            logger.error(f"MQTT 连接失败: {e}")
            self._connected = False
            return False

    def disconnect(self):
        try:
            if self._client:
                if hasattr(self._client, "loop_stop"):
                    self._client.loop_stop()
                if hasattr(self._client, "disconnect"):
                    self._client.disconnect()
            self._connected = False
            logger.info("MQTT 已断开连接")
        except Exception as e:
            logger.error(f"MQTT 断开失败: {e}")

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            logger.info("MQTT 连接建立成功")
            for topic in self._subscriptions:
                client.subscribe(topic)
        else:
            self._connected = False
            logger.error(f"MQTT 连接失败, 错误码: {rc}")

    def _on_message(self, client, userdata, msg):
        try:
            message = Message.from_json(msg.payload.decode("utf-8"))
            callbacks = self._subscriptions.get(msg.topic, [])
            for callback in callbacks:
                try:
                    callback(message)
                except Exception as e:
                    logger.error(f"消息回调执行失败: {e}")
        except Exception as e:
            logger.error(f"消息解析失败: {e}")

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        if rc != 0:
            logger.warning("MQTT 意外断开连接")
            self._reconnect()

    def _reconnect(self):
        retry_count = 0
        while not self._connected and retry_count < 5:
            retry_count += 1
            logger.info(f"尝试重连 ({retry_count}/5)...")
            try:
                self.connect()
            except Exception:
                time.sleep(5)

    def subscribe(self, topic: str, callback: Callable):
        if topic not in self._subscriptions:
            self._subscriptions[topic] = []
        self._subscriptions[topic].append(callback)
        
        if self._connected and self._client:
            self._client.subscribe(topic)
        
        logger.info(f"订阅主题: {topic}")

    def unsubscribe(self, topic: str, callback: Callable = None):
        if topic in self._subscriptions:
            if callback:
                self._subscriptions[topic] = [c for c in self._subscriptions[topic] if c != callback]
            else:
                del self._subscriptions[topic]
            
            if self._client and self._connected:
                self._client.unsubscribe(topic)
            
            logger.info(f"取消订阅主题: {topic}")

    def publish(self, topic: str, message: Message) -> bool:
        try:
            if self._client and self._connected:
                payload = message.to_json()
                if hasattr(self._client, "publish"):
                    self._client.publish(topic, payload, qos=1)
                else:
                    self._client.publish(topic, payload)
                logger.debug(f"发布消息到 {topic}")
                return True
            else:
                with self._lock:
                    self._message_queue.append((topic, message))
                logger.warning(f"MQTT 未连接, 消息已加入队列: {topic}")
                return False
        except Exception as e:
            logger.error(f"发布消息失败: {e}")
            return False

    def publish_data(self, topic: str, data: Dict) -> bool:
        message = Message(
            msg_type="data",
            source=self._client_id,
            target="cloud",
            payload=data,
        )
        return self.publish(topic, message)

    def publish_heartbeat(self) -> bool:
        message = Message(
            msg_type="heartbeat",
            source=self._client_id,
            target="cloud",
            payload={
                "timestamp": datetime.utcnow().isoformat(),
                "status": "alive",
            },
        )
        return self.publish("gateway/heartbeat", message)

    def get_queued_messages(self) -> List[tuple]:
        with self._lock:
            messages = list(self._message_queue)
            self._message_queue.clear()
        return messages

    def flush_queued_messages(self):
        messages = self.get_queued_messages()
        for topic, message in messages:
            self.publish(topic, message)

    @property
    def is_connected(self) -> bool:
        return self._connected


class _MockMQTTClient:
    """模拟 MQTT 客户端"""

    def __init__(self, broker_url: str):
        self.broker_url = broker_url
        self._subscriptions = {}
        self._messages = []

    def connect(self, host, port, keepalive=60):
        pass

    def loop_start(self):
        pass

    def loop_stop(self):
        pass

    def disconnect(self):
        pass

    def subscribe(self, topic):
        self._subscriptions[topic] = True

    def unsubscribe(self, topic):
        self._subscriptions.pop(topic, None)

    def publish(self, topic, payload, qos=1):
        self._messages.append((topic, payload))