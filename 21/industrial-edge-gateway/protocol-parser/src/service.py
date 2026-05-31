"""
协议解析微服务
提供 REST API 接口供其他服务调用
"""
import json
from typing import Dict, List
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
try:
    from .base import ProtocolFactory
    from .protocol_detector import ProtocolDetector, ProtocolCompatibilityChecker
except ImportError:
    from base import ProtocolFactory
    from protocol_detector import ProtocolDetector, ProtocolCompatibilityChecker
from shared.src.models import DataPoint, DeviceInfo, ProtocolType, Message
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("protocol_parser_service")


class ProtocolParserHandler(BaseHTTPRequestHandler):
    """协议解析 HTTP 请求处理器"""

    config: GatewayConfig = None
    parser_instances: Dict[str, any] = {}
    protocol_detector = ProtocolDetector()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            self._handle_health()
        elif path == "/protocols":
            self._handle_list_protocols()
        elif path == "/protocol/features":
            self._handle_protocol_features(parsed)
        elif path.startswith("/devices"):
            self._handle_get_device(path)
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        data = json.loads(body.decode("utf-8"))

        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/devices":
            self._handle_add_device(data)
        elif path == "/devices/connect":
            self._handle_connect_device(data)
        elif path == "/devices/disconnect":
            self._handle_disconnect_device(data)
        elif path == "/read":
            self._handle_read_points(data)
        elif path == "/write":
            self._handle_write_points(data)
        elif path == "/convert":
            self._handle_convert(data)
        elif path == "/protocol/detect":
            self._handle_detect_protocol(data)
        elif path == "/protocol/auto-configure":
            self._handle_auto_configure(data)
        elif path == "/protocol/check-port":
            self._handle_check_port(data)
        else:
            self._send_json(404, {"error": "Not Found"})

    def _handle_health(self):
        status = {
            "status": "running",
            "supported_protocols": ProtocolFactory.get_supported_protocols(),
            "active_connections": len(self.parser_instances),
        }
        self._send_json(200, status)

    def _handle_list_protocols(self):
        protocols = ProtocolFactory.get_supported_protocols()
        self._send_json(200, {"protocols": protocols})

    def _handle_add_device(self, data):
        try:
            device = DeviceInfo(
                device_id=data.get("device_id", ""),
                device_name=data.get("device_name", ""),
                device_type=data.get("device_type", ""),
                protocol=ProtocolType(data.get("protocol", "modbus_tcp")),
                ip_address=data.get("ip_address", ""),
                port=data.get("port", 502),
                slave_id=data.get("slave_id", 1),
            )
            self._send_json(200, {"status": "success", "device": device.to_dict()})
        except Exception as e:
            self._send_json(400, {"error": str(e)})

    def _handle_connect_device(self, data):
        try:
            device_id = data.get("device_id")
            device = DeviceInfo(
                device_id=device_id,
                protocol=ProtocolType(data.get("protocol", "modbus_tcp")),
                ip_address=data.get("ip_address", ""),
                port=data.get("port", 502),
                slave_id=data.get("slave_id", 1),
            )
            parser = ProtocolFactory.create(device.protocol)
            parser.connect(device)
            self.parser_instances[device_id] = {"parser": parser, "device": device}
            self._send_json(200, {"status": "connected", "device_id": device_id})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_disconnect_device(self, data):
        device_id = data.get("device_id")
        if device_id in self.parser_instances:
            self.parser_instances[device_id]["parser"].disconnect()
            del self.parser_instances[device_id]
            self._send_json(200, {"status": "disconnected"})
        else:
            self._send_json(404, {"error": "Device not found"})

    def _handle_read_points(self, data):
        try:
            device_id = data.get("device_id")
            if device_id not in self.parser_instances:
                self._send_json(404, {"error": "Device not connected"})
                return

            instance = self.parser_instances[device_id]
            parser = instance["parser"]
            points_data = data.get("points", [])
            points = [DataPoint(**p) for p in points_data]

            if len(points) == 1:
                result = parser.read_point(points[0])
                self._send_json(200, {"points": [result.to_dict()]})
            else:
                results = parser.read_points(points)
                self._send_json(200, {"points": [r.to_dict() for r in results]})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_write_points(self, data):
        try:
            device_id = data.get("device_id")
            if device_id not in self.parser_instances:
                self._send_json(404, {"error": "Device not connected"})
                return

            instance = self.parser_instances[device_id]
            parser = instance["parser"]
            points_data = data.get("points", [])

            for p in points_data:
                point = DataPoint(
                    point_id=p.get("point_id"),
                    address=p.get("address"),
                    data_type=p.get("data_type", "float32"),
                    value=p.get("value")
                )
                parser.write_point(point, point.value)

            self._send_json(200, {"status": "success"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_convert(self, data):
        source_protocol = data.get("source_protocol")
        target_protocol = data.get("target_protocol")
        source_data = data.get("data")

        result = {
            "source_protocol": source_protocol,
            "target_protocol": target_protocol,
            "converted_data": source_data,
            "timestamp": self._get_timestamp(),
        }
        self._send_json(200, result)

    def _handle_get_device(self, path):
        device_id = path.split("/")[-1]
        if device_id in self.parser_instances:
            instance = self.parser_instances[device_id]
            device = instance["device"]
            self._send_json(200, device.to_dict())
        else:
            self._send_json(404, {"error": "Device not found"})

    def _handle_detect_protocol(self, data):
        """检测设备支持的协议"""
        try:
            ip_address = data.get("ip_address")
            if not ip_address:
                self._send_json(400, {"error": "Missing ip_address"})
                return
            
            results = self.protocol_detector.detect_all(ip_address)
            results_dict = [r.to_dict() for r in results]
            
            best_result = self.protocol_detector.detect_best(ip_address)
            best = best_result.to_dict() if best_result else None
            
            self._send_json(200, {
                "results": results_dict,
                "best_match": best,
            })
        except Exception as e:
            logger.error(f"协议检测失败: {e}")
            self._send_json(500, {"error": str(e)})

    def _handle_auto_configure(self, data):
        """自动检测并配置设备协议"""
        try:
            device_data = data.get("device", {})
            device = DeviceInfo(
                device_id=device_data.get("device_id", ""),
                device_name=device_data.get("device_name", ""),
                device_type=device_data.get("device_type", ""),
                protocol=ProtocolType(device_data.get("protocol", "modbus_tcp")) if device_data.get("protocol") else None,
                ip_address=device_data.get("ip_address", ""),
                port=device_data.get("port", 502),
                slave_id=device_data.get("slave_id", 1),
            )
            
            configured = self.protocol_detector.auto_configure_device(device)
            self._send_json(200, {
                "status": "success",
                "device": configured.to_dict(),
            })
        except Exception as e:
            logger.error(f"自动配置失败: {e}")
            self._send_json(500, {"error": str(e)})

    def _handle_check_port(self, data):
        """检查端口是否开放"""
        try:
            ip_address = data.get("ip_address")
            port = data.get("port")
            timeout = data.get("timeout")
            
            if not ip_address or port is None:
                self._send_json(400, {"error": "Missing ip_address or port"})
                return
            
            is_open = self.protocol_detector.check_port_open(ip_address, int(port), timeout)
            self._send_json(200, {
                "ip_address": ip_address,
                "port": port,
                "open": is_open,
            })
        except Exception as e:
            logger.error(f"端口检查失败: {e}")
            self._send_json(500, {"error": str(e)})

    def _handle_protocol_features(self, parsed):
        """获取协议特性"""
        try:
            query_params = parse_qs(parsed.query)
            protocol_value = query_params.get("protocol", [None])[0]
            
            if protocol_value:
                protocol = ProtocolType(protocol_value)
                features = ProtocolCompatibilityChecker.get_protocol_features(protocol)
                self._send_json(200, {"protocol": protocol_value, "features": features})
            else:
                all_features = {
                    p.value: ProtocolCompatibilityChecker.get_protocol_features(p)
                    for p in ProtocolType
                }
                self._send_json(200, {"features": all_features})
        except Exception as e:
            logger.error(f"获取协议特性失败: {e}")
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    @staticmethod
    def _get_timestamp():
        from datetime import datetime
        return datetime.utcnow().isoformat()

    def log_message(self, format, *args):
        logger.debug(f"[{self.command}] {args[0]}")


class ProtocolParserService:
    """协议解析微服务"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        self._server: HTTPServer = None
        service_config = config.get("services", "protocol_parser")
        self._host = service_config.get("host", "0.0.0.0")
        self._port = service_config.get("port", 8001)

    def start(self):
        ProtocolParserHandler.config = self.config
        self._server = HTTPServer((self._host, self._port), ProtocolParserHandler)
        logger.info(f"协议解析服务启动: {self._host}:{self._port}")
        self._server.serve_forever()

    def stop(self):
        if self._server:
            self._server.shutdown()
            logger.info("协议解析服务已停止")

    def run(self):
        try:
            self.start()
        except KeyboardInterrupt:
            self.stop()


def main():
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else None
    config = GatewayConfig(config_path)
    service = ProtocolParserService(config)
    service.run()


if __name__ == "__main__":
    main()