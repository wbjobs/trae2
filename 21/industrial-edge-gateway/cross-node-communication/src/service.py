"""
跨节点通信微服务
"""
import json
import threading
import time
from typing import Dict
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from .mqtt_client import MQTTClient
from .http_client import HTTPClient
from .message_bus import MessageBus, get_message_bus
from shared.src.models import Message
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("cross_node_service")


class CrossNodeHandler(BaseHTTPRequestHandler):
    """跨节点通信 HTTP 请求处理器"""

    mqtt_client: MQTTClient = None
    http_client: HTTPClient = None
    message_bus: MessageBus = None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            self._handle_health()
        elif path == "/stats":
            self._handle_stats()
        elif path == "/topics":
            self._handle_list_topics()
        elif path == "/messages":
            self._handle_get_messages()
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        data = json.loads(body.decode("utf-8"))

        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/publish":
            self._handle_publish(data)
        elif path == "/subscribe":
            self._handle_subscribe(data)
        elif path == "/sync":
            self._handle_sync(data)
        elif path == "/send-to-cloud":
            self._handle_send_to_cloud(data)
        else:
            self._send_json(404, {"error": "Not Found"})

    def _handle_health(self):
        status = {
            "status": "running",
            "mqtt_connected": self.mqtt_client.is_connected if self.mqtt_client else False,
            "message_bus_topics": len(self.message_bus.get_stats()["topics"]),
        }
        self._send_json(200, status)

    def _handle_stats(self):
        stats = {
            "mqtt": {
                "connected": self.mqtt_client.is_connected if self.mqtt_client else False,
            },
            "message_bus": self.message_bus.get_stats() if self.message_bus else {},
        }
        self._send_json(200, stats)

    def _handle_list_topics(self):
        topics = self.message_bus.get_subscribers() if self.message_bus else {}
        self._send_json(200, {"topics": list(topics.keys())})

    def _handle_get_messages(self):
        messages = self.message_bus.get_message_history() if self.message_bus else []
        self._send_json(200, {"messages": messages[-100:]})

    def _handle_publish(self, data):
        try:
            topic = data.get("topic", "")
            message_data = data.get("message", {})
            
            message = Message(
                msg_type=message_data.get("msg_type", "data"),
                source=message_data.get("source", "gateway"),
                target=message_data.get("target", "all"),
                payload=message_data.get("payload", {}),
            )
            
            if self.mqtt_client and self.mqtt_client.is_connected:
                self.mqtt_client.publish(topic, message)
            
            if self.message_bus:
                self.message_bus.publish(topic, message)
            
            self._send_json(200, {"status": "published"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_subscribe(self, data):
        try:
            topic = data.get("topic", "")
            
            def callback(message: Message):
                logger.info(f"收到消息: {message.msg_type}")
            
            if self.mqtt_client:
                self.mqtt_client.subscribe(topic, callback)
            
            if self.message_bus:
                self.message_bus.subscribe(topic, callback)
            
            self._send_json(200, {"status": "subscribed", "topic": topic})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_sync(self, data):
        try:
            sync_type = data.get("type", "data")
            sync_data = data.get("data", {})
            
            if sync_type == "config":
                logger.info("同步配置数据到云端")
            elif sync_type == "rules":
                logger.info("同步规则数据到云端")
            elif sync_type == "status":
                logger.info("同步状态数据到云端")
            
            self._send_json(200, {"status": "synced"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_send_to_cloud(self, data):
        try:
            if self.http_client:
                result = self.http_client.send_data(data)
                if result:
                    self._send_json(200, {"status": "sent", "response": result})
                else:
                    self._send_json(500, {"error": "发送失败"})
            else:
                self._send_json(503, {"error": "HTTP 客户端未初始化"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        logger.debug(f"[{self.command}] {args[0]}")


class CrossNodeService:
    """跨节点通信微服务"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        self._server: HTTPServer = None
        self._running = False
        self._heartbeat_thread: threading.Thread = None
        
        self.mqtt_client = MQTTClient(config)
        self.http_client = HTTPClient(config)
        self.message_bus = get_message_bus()
        
        service_config = config.get("services", "cross_node")
        self._host = service_config.get("host", "0.0.0.0")
        self._port = service_config.get("port", 8005)
        self._heartbeat_interval = service_config.get("heartbeat_interval", 30)

    def start(self):
        CrossNodeHandler.mqtt_client = self.mqtt_client
        CrossNodeHandler.http_client = self.http_client
        CrossNodeHandler.message_bus = self.message_bus
        
        self.mqtt_client.connect()
        
        self._setup_internal_subscriptions()
        
        self._running = True
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        
        self._server = HTTPServer((self._host, self._port), CrossNodeHandler)
        logger.info(f"跨节点通信服务启动: {self._host}:{self._port}")
        self._server.serve_forever()

    def _setup_internal_subscriptions(self):
        self.message_bus.subscribe("data/#", self._on_internal_data)
        self.message_bus.subscribe("event/#", self._on_internal_event)

    def _on_internal_data(self, message: Message):
        if self.mqtt_client.is_connected:
            self.mqtt_client.publish("gateway/data", message)

    def _on_internal_event(self, message: Message):
        if self.mqtt_client.is_connected:
            self.mqtt_client.publish("gateway/events", message)

    def _heartbeat_loop(self):
        while self._running:
            try:
                self.mqtt_client.publish_heartbeat()
                
                if self.http_client:
                    self.http_client.send_heartbeat({
                        "gateway_id": self.config.get("gateway", "id"),
                        "status": "running",
                        "timestamp": time.time(),
                    })
                
                self.mqtt_client.flush_queued_messages()
                
            except Exception as e:
                logger.error(f"心跳发送失败: {e}")
            
            time.sleep(self._heartbeat_interval)

    def stop(self):
        self._running = False
        self.mqtt_client.disconnect()
        if self._server:
            self._server.shutdown()
            logger.info("跨节点通信服务已停止")

    def run(self):
        try:
            self.start()
        except KeyboardInterrupt:
            self.stop()


def main():
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else None
    config = GatewayConfig(config_path)
    service = CrossNodeService(config)
    service.run()


if __name__ == "__main__":
    main()