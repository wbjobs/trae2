"""
设备接入网关微服务
"""
import json
from typing import Dict
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from .device_manager import DeviceManager
from .data_collector import DataCollector
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("device_gateway_service")


class DeviceGatewayHandler(BaseHTTPRequestHandler):
    """设备网关 HTTP 请求处理器"""

    device_manager: DeviceManager = None
    data_collector: DataCollector = None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            self._handle_health()
        elif path == "/devices":
            self._handle_list_devices()
        elif path.startswith("/devices/"):
            self._handle_get_device(path)
        elif path == "/stats":
            self._handle_stats()
        elif path == "/schedules":
            self._handle_list_schedules()
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        data = json.loads(body.decode("utf-8"))

        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/devices":
            self._handle_register_device(data)
        elif path == "/devices/connect":
            self._handle_connect_device(data)
        elif path == "/devices/disconnect":
            self._handle_disconnect_device(data)
        elif path == "/devices/read":
            self._handle_read_points(data)
        elif path == "/devices/write":
            self._handle_write_points(data)
        elif path == "/schedules":
            self._handle_add_schedule(data)
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path.startswith("/devices/"):
            device_id = path.split("/")[-1]
            self._handle_unregister_device(device_id)
        elif path.startswith("/schedules/"):
            device_id = path.split("/")[-1]
            self._handle_remove_schedule(device_id)
        else:
            self._send_json(404, {"error": "Not Found"})

    def _handle_health(self):
        self._send_json(200, {"status": "running"})

    def _handle_list_devices(self):
        devices = self.device_manager.get_all_devices()
        self._send_json(200, {"devices": [d.to_dict() for d in devices]})

    def _handle_get_device(self, path):
        device_id = path.split("/")[-1]
        device = self.device_manager.get_device(device_id)
        if device:
            self._send_json(200, device.to_dict())
        else:
            self._send_json(404, {"error": "Device not found"})

    def _handle_register_device(self, data):
        try:
            device = self.device_manager.register_device(data)
            self._send_json(201, {"status": "registered", "device": device.to_dict()})
        except Exception as e:
            self._send_json(400, {"error": str(e)})

    def _handle_unregister_device(self, device_id: str):
        if self.device_manager.unregister_device(device_id):
            self._send_json(200, {"status": "unregistered"})
        else:
            self._send_json(404, {"error": "Device not found"})

    def _handle_connect_device(self, data):
        device_id = data.get("device_id")
        if self.device_manager.connect_device(device_id):
            self._send_json(200, {"status": "connected"})
        else:
            self._send_json(500, {"error": "Failed to connect"})

    def _handle_disconnect_device(self, data):
        device_id = data.get("device_id")
        if self.device_manager.disconnect_device(device_id):
            self._send_json(200, {"status": "disconnected"})
        else:
            self._send_json(404, {"error": "Device not found"})

    def _handle_read_points(self, data):
        try:
            device_id = data.get("device_id")
            points = data.get("points", [])
            results = self.device_manager.read_device_points(device_id, points)
            self._send_json(200, {"points": results})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_write_points(self, data):
        try:
            device_id = data.get("device_id")
            points = data.get("points", [])
            self.device_manager.write_device_points(device_id, points)
            self._send_json(200, {"status": "success"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_add_schedule(self, data):
        try:
            device_id = data.get("device_id")
            points = data.get("points", [])
            interval = data.get("interval", 1.0)
            self.data_collector.add_schedule(device_id, points, interval)
            self._send_json(200, {"status": "scheduled"})
        except Exception as e:
            self._send_json(400, {"error": str(e)})

    def _handle_remove_schedule(self, device_id: str):
        self.data_collector.remove_schedule(device_id)
        self._send_json(200, {"status": "removed"})

    def _handle_list_schedules(self):
        schedules = self.data_collector.get_schedules()
        self._send_json(200, {"schedules": schedules})

    def _handle_stats(self):
        stats = self.device_manager.get_stats()
        self._send_json(200, stats)

    def _send_json(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        logger.debug(f"[{self.command}] {args[0]}")


class DeviceGatewayService:
    """设备接入网关微服务"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        self._server: HTTPServer = None
        self.device_manager = DeviceManager(config)
        self.data_collector = DataCollector(self.device_manager)
        
        service_config = config.get("services", "device_gateway")
        self._host = service_config.get("host", "0.0.0.0")
        self._port = service_config.get("port", 8003)

    def start(self):
        DeviceGatewayHandler.device_manager = self.device_manager
        DeviceGatewayHandler.data_collector = self.data_collector
        self.data_collector.start()
        self._server = HTTPServer((self._host, self._port), DeviceGatewayHandler)
        logger.info(f"设备网关服务启动: {self._host}:{self._port}")
        self._server.serve_forever()

    def stop(self):
        self.data_collector.stop()
        if self._server:
            self._server.shutdown()
            logger.info("设备网关服务已停止")

    def run(self):
        try:
            self.start()
        except KeyboardInterrupt:
            self.stop()


def main():
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else None
    config = GatewayConfig(config_path)
    service = DeviceGatewayService(config)
    service.run()


if __name__ == "__main__":
    main()