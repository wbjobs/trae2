"""
编排服务 - 提供前端界面和 API 代理
"""
import json
import urllib.request
import urllib.error
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler, SimpleHTTPRequestHandler
from typing import Dict
from pathlib import Path
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("orchestration_service")


class OrchestrationHandler(BaseHTTPRequestHandler):
    """编排服务 HTTP 处理器"""

    config: GatewayConfig = None
    frontend_dir: str = ""
    
    SERVICE_ENDPOINTS = {
        "devices": "device_gateway",
        "rules": "dataflow_router",
        "storage": "data_storage",
        "protocols": "protocol_parser",
        "health": "device_gateway",
    }

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path_parts = parsed.path.lstrip("/").split("/")
        endpoint = path_parts[0] if path_parts else ""

        if endpoint in self.SERVICE_ENDPOINTS:
            self._proxy_request("GET", endpoint)
        else:
            self._serve_static(parsed)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path_parts = parsed.path.lstrip("/").split("/")
        endpoint = path_parts[0] if path_parts else ""

        if endpoint in self.SERVICE_ENDPOINTS:
            self._proxy_request("POST", endpoint)
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_PUT(self):
        self.do_POST()

    def do_DELETE(self):
        self.do_POST()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _proxy_request(self, method, endpoint):
        try:
            service_name = self.SERVICE_ENDPOINTS[endpoint]
            service_port = self.config.get("services", service_name, "port", default=8000)
            
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else None

            target_url = f"http://localhost:{service_port}{self.path}"
            
            req = urllib.request.Request(target_url, data=body, method=method)
            if body:
                req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=10) as response:
                response_data = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(response_data)

        except urllib.error.HTTPError as e:
            self._send_json(e.code, {"error": str(e)})
        except Exception as e:
            self._send_json(502, {"error": f"代理请求失败: {str(e)}"})

    def _serve_static(self, parsed):
        path = parsed.path
        if path == "/" or path == "":
            path = "/index.html"

        file_path = Path(self.frontend_dir) / path.lstrip("/")

        if file_path.exists() and file_path.is_file():
            content_type = self._get_content_type(str(file_path))
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.end_headers()
            self.wfile.write(content)
        else:
            index_path = Path(self.frontend_dir) / "index.html"
            with open(index_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(content)

    @staticmethod
    def _get_content_type(file_path):
        if file_path.endswith(".html"):
            return "text/html"
        elif file_path.endswith(".css"):
            return "text/css"
        elif file_path.endswith(".js"):
            return "application/javascript"
        elif file_path.endswith(".json"):
            return "application/json"
        elif file_path.endswith(".svg"):
            return "image/svg+xml"
        elif file_path.endswith(".png"):
            return "image/png"
        elif file_path.endswith(".ico"):
            return "image/x-icon"
        else:
            return "application/octet-stream"

    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        logger.debug(f"[{self.command}] {args[0]}")


class OrchestrationService:
    """编排微服务"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        self._server: HTTPServer = None
        
        service_config = config.get("services", "orchestration")
        self._host = service_config.get("host", "0.0.0.0")
        self._port = service_config.get("port", 8006)
        self._frontend_dir = config.get("services", "orchestration", "frontend_dir", default="frontend-orchestration")

    def start(self):
        OrchestrationHandler.config = self.config
        OrchestrationHandler.frontend_dir = self._frontend_dir
        
        self._server = HTTPServer((self._host, self._port), OrchestrationHandler)
        logger.info(f"编排服务启动: {self._host}:{self._port}")
        logger.info(f"前端界面: http://localhost:{self._port}")
        self._server.serve_forever()

    def stop(self):
        if self._server:
            self._server.shutdown()
            logger.info("编排服务已停止")

    def run(self):
        try:
            self.start()
        except KeyboardInterrupt:
            self.stop()


def main():
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else None
    config = GatewayConfig(config_path)
    service = OrchestrationService(config)
    service.run()


if __name__ == "__main__":
    main()