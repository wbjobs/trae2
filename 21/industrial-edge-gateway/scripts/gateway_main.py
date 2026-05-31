"""
网关主入口 - 启动所有微服务
支持嵌入式 Linux 与云端服务器双环境
"""
import os
import sys
import time
import signal
import threading
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from shared.src.config import load_config
from shared.src.logger import get_logger

logger = get_logger("gateway_main")


class GatewayOrchestrator:
    """网关编排器 - 管理所有微服务"""

    def __init__(self, config_path: str = None):
        self.config = load_config(config_path)
        self.services = {}
        self.processes = {}
        self.running = False

        self._service_configs = {
            "protocol_parser": {
                "module": "protocol_parser.src.service",
                "port": self.config.get("services", "protocol_parser", "port", default=8001),
            },
            "dataflow_router": {
                "module": "dataflow_router.src.service",
                "port": self.config.get("services", "dataflow_router", "port", default=8002),
            },
            "device_gateway": {
                "module": "device_gateway.src.service",
                "port": self.config.get("services", "device_gateway", "port", default=8003),
            },
            "data_storage": {
                "module": "data_storage.src.service",
                "port": self.config.get("services", "data_storage", "port", default=8004),
            },
            "cross_node": {
                "module": "cross_node_communication.src.service",
                "port": self.config.get("services", "cross_node", "port", default=8005),
            },
            "orchestration": {
                "module": "orchestration.src.service",
                "port": self.config.get("services", "orchestration", "port", default=8006),
            },
        }

    def start(self):
        self.running = True
        
        if self.config.is_edge:
            logger.info("启动边缘网关模式...")
        else:
            logger.info("启动云端网关模式...")
        
        for name, service_config in self._service_configs.items():
            if name == "orchestration":
                self._start_orchestration_service()
            else:
                self._start_service(name, service_config)
        
        self._start_web_server()
        
        logger.info("=" * 50)
        logger.info("工业边缘网关启动完成")
        logger.info(f"运行环境: {'边缘端' if self.config.is_edge else '云端'}")
        logger.info(f"前端地址: http://localhost:{self.config.get('services', 'orchestration', 'port', default=8006)}")
        logger.info("=" * 50)
        
        self._wait_for_shutdown()

    def _start_service(self, name: str, service_config: dict):
        try:
            logger.info(f"启动服务: {name} (端口: {service_config['port']})")
            process = subprocess.Popen(
                [sys.executable, "-m", service_config["module"], str(self.config._config_path or "")],
                cwd=str(BASE_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.processes[name] = process
            logger.info(f"服务 {name} 已启动 (PID: {process.pid})")
        except Exception as e:
            logger.error(f"启动服务 {name} 失败: {e}")

    def _start_orchestration_service(self):
        try:
            from http.server import HTTPServer, SimpleHTTPRequestHandler
            import urllib.parse
            
            config = self.config
            frontend_dir = config.get("services", "orchestration", "frontend_dir", default="frontend-orchestration")
            port = config.get("services", "orchestration", "port", default=8006)
            
            frontend_path = BASE_DIR / frontend_dir
            
            class OrchestrationHandler(SimpleHTTPRequestHandler):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, directory=str(frontend_path), **kwargs)
                
                def end_headers(self):
                    self.send_header('Access-Control-Allow-Origin', '*')
                    super().end_headers()
                
                def log_message(self, format, *args):
                    logger.debug(f"[前端] {args[0]}")
            
            server = HTTPServer(("0.0.0.0", port), OrchestrationHandler)
            
            server_thread = threading.Thread(target=server.serve_forever, daemon=True)
            server_thread.start()
            
            logger.info(f"前端服务已启动: http://localhost:{port}")
            self.services["orchestration"] = server
            
        except Exception as e:
            logger.error(f"启动前端服务失败: {e}")

    def _start_web_server(self):
        """启动统一的 Web 服务器，提供 API 代理和静态文件服务"""
        try:
            from http.server import HTTPServer, BaseHTTPRequestHandler
            import urllib.request
            import urllib.error
            import json
            
            config = self.config
            port = config.get("services", "orchestration", "port", default=8000)
            
            class GatewayHandler(BaseHTTPRequestHandler):
                SERVICE_PORTS = {
                    "devices": config.get("services", "device_gateway", "port", default=8003),
                    "rules": config.get("services", "dataflow_router", "port", default=8002),
                    "storage": config.get("services", "data_storage", "port", default=8004),
                    "protocols": config.get("services", "protocol_parser", "port", default=8001),
                    "canvas": config.get("services", "dataflow_router", "port", default=8002),
                    "execute": config.get("services", "dataflow_router", "port", default=8002),
                    "stats": config.get("services", "dataflow_router", "port", default=8002),
                    "history": config.get("services", "dataflow_router", "port", default=8002),
                    "health": config.get("services", "device_gateway", "port", default=8003),
                }
                
                def do_GET(self):
                    parsed = urllib.parse.urlparse(self.path)
                    path = parsed.path.lstrip("/").split("/")[0]
                    
                    if path in self.SERVICE_PORTS:
                        self._proxy_request("GET", self.SERVICE_PORTS[path])
                    else:
                        self._serve_frontend(parsed)
                
                def do_POST(self):
                    parsed = urllib.parse.urlparse(self.path)
                    path = parsed.path.lstrip("/").split("/")[0]
                    
                    if path in self.SERVICE_PORTS:
                        self._proxy_request("POST", self.SERVICE_PORTS[path])
                    else:
                        self._send_json(404, {"error": "Not Found"})
                
                def do_PUT(self):
                    parsed = urllib.parse.urlparse(self.path)
                    path = parsed.path.lstrip("/").split("/")[0]
                    
                    if path in self.SERVICE_PORTS:
                        self._proxy_request("PUT", self.SERVICE_PORTS[path])
                    else:
                        self._send_json(404, {"error": "Not Found"})
                
                def do_DELETE(self):
                    parsed = urllib.parse.urlparse(self.path)
                    path = parsed.path.lstrip("/").split("/")[0]
                    
                    if path in self.SERVICE_PORTS:
                        self._proxy_request("DELETE", self.SERVICE_PORTS[path])
                    else:
                        self._send_json(404, {"error": "Not Found"})
                
                def _proxy_request(self, method, port):
                    try:
                        content_length = int(self.headers.get("Content-Length", 0))
                        body = self.rfile.read(content_length) if content_length > 0 else None
                        
                        target_url = f"http://localhost:{port}{self.path}"
                        
                        req = urllib.request.Request(
                            target_url,
                            data=body,
                            method=method,
                        )
                        
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
                
                def _serve_frontend(self, parsed):
                    frontend_path = BASE_DIR / "frontend-orchestration"
                    path = parsed.path
                    
                    if path == "/" or path == "":
                        path = "/index.html"
                    
                    file_path = frontend_path / path.lstrip("/")
                    
                    if file_path.exists() and file_path.is_file():
                        content_type = self._get_content_type(str(file_path))
                        with open(file_path, "rb") as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header("Content-Type", content_type)
                        self.end_headers()
                        self.wfile.write(content)
                    else:
                        index_path = frontend_path / "index.html"
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
                    else:
                        return "application/octet-stream"
                
                def _send_json(self, status_code, data):
                    self.send_response(status_code)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
                
                def log_message(self, format, *args):
                    logger.debug(f"[网关] {args[0]}")
            
            server = HTTPServer(("0.0.0.0", port), GatewayHandler)
            server_thread = threading.Thread(target=server.serve_forever, daemon=True)
            server_thread.start()
            
            logger.info(f"Web 服务器已启动: http://localhost:{port}")
            self.services["web"] = server
            
        except Exception as e:
            logger.error(f"启动 Web 服务器失败: {e}")

    def _wait_for_shutdown(self):
        try:
            while self.running:
                for name, process in list(self.processes.items()):
                    if process.poll() is not None:
                        logger.warning(f"服务 {name} 意外退出 (退出码: {process.returncode})")
                        if self.running:
                            logger.info(f"重启服务 {name}...")
                            service_config = self._service_configs.get(name)
                            if service_config:
                                self._start_service(name, service_config)
                
                time.sleep(5)
        except KeyboardInterrupt:
            logger.info("收到中断信号, 正在关闭...")
        finally:
            self.stop()

    def stop(self):
        self.running = False
        
        for name, process in self.processes.items():
            try:
                logger.info(f"停止服务 {name}...")
                process.terminate()
                process.wait(timeout=5)
            except Exception as e:
                logger.error(f"停止服务 {name} 失败: {e}")
                process.kill()
        
        for name, server in self.services.items():
            try:
                if hasattr(server, "shutdown"):
                    server.shutdown()
            except Exception:
                pass
        
        logger.info("网关已完全关闭")


def main():
    config_path = None
    
    if len(sys.argv) > 1:
        config_path = sys.argv[1]
    else:
        if os.environ.get("GATEWAY_ENV") == "cloud":
            config_path = str(BASE_DIR / "config" / "cloud_config.json")
        else:
            config_path = str(BASE_DIR / "config" / "gateway_config.json")
    
    if not os.path.exists(config_path):
        config_path = None
    
    orchestrator = GatewayOrchestrator(config_path)
    
    signal.signal(signal.SIGINT, lambda sig, frame: orchestrator.stop())
    signal.signal(signal.SIGTERM, lambda sig, frame: orchestrator.stop())
    
    orchestrator.start()


if __name__ == "__main__":
    main()