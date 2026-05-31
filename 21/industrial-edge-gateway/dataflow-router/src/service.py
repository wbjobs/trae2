"""
数据流路由微服务
"""
import json
from typing import Dict
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
try:
    from .rule_manager import RuleManager
except ImportError:
    from rule_manager import RuleManager
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("dataflow_router_service")


class DataFlowRouterHandler(BaseHTTPRequestHandler):
    """数据流路由 HTTP 请求处理器"""

    rule_manager: RuleManager = None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            self._handle_health()
        elif path == "/rules":
            self._handle_list_rules()
        elif path.startswith("/rules/"):
            self._handle_get_rule(path)
        elif path == "/stats":
            self._handle_stats()
        elif path == "/history":
            self._handle_history()
        elif path == "/canvas":
            self._handle_get_canvas()
        elif path == "/circuit-breakers":
            self._handle_list_circuit_breakers()
        elif path == "/batch-stats":
            self._handle_batch_stats()
        elif path == "/async-stats":
            self._handle_async_stats()
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        data = json.loads(body.decode("utf-8"))

        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/rules":
            self._handle_create_rule(data)
        elif path == "/execute":
            self._handle_execute(data)
        elif path == "/execute-async":
            self._handle_execute_async(data)
        elif path == "/execute-batch":
            self._handle_execute_batch(data)
        elif path == "/canvas":
            self._handle_save_canvas(data)
        elif path == "/circuit-breakers/reset":
            self._handle_reset_circuit_breaker(data)
        elif path == "/circuit-breakers/open":
            self._handle_open_circuit_breaker(data)
        elif path == "/circuit-breakers/close":
            self._handle_close_circuit_breaker(data)
        elif path == "/flush-batch":
            self._handle_flush_batch()
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_PUT(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        data = json.loads(body.decode("utf-8"))

        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path.startswith("/rules/"):
            rule_id = path.split("/")[-1]
            self._handle_update_rule(rule_id, data)
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path.startswith("/rules/"):
            rule_id = path.split("/")[-1]
            self._handle_delete_rule(rule_id)
        else:
            self._send_json(404, {"error": "Not Found"})

    def _handle_health(self):
        self._send_json(200, {"status": "running"})

    def _handle_list_rules(self):
        rules = self.rule_manager.get_rules()
        self._send_json(200, {"rules": rules})

    def _handle_get_rule(self, path):
        rule_id = path.split("/")[-1]
        rule = self.rule_manager.get_rule(rule_id)
        if rule:
            self._send_json(200, rule.to_dict())
        else:
            self._send_json(404, {"error": "Rule not found"})

    def _handle_create_rule(self, data):
        try:
            rule = self.rule_manager.create_rule(data)
            self._send_json(201, {"status": "created", "rule": rule.to_dict()})
        except Exception as e:
            self._send_json(400, {"error": str(e)})

    def _handle_update_rule(self, rule_id: str, data):
        rule = self.rule_manager.update_rule(rule_id, data)
        if rule:
            self._send_json(200, {"status": "updated", "rule": rule.to_dict()})
        else:
            self._send_json(404, {"error": "Rule not found"})

    def _handle_delete_rule(self, rule_id: str):
        if self.rule_manager.delete_rule(rule_id):
            self._send_json(200, {"status": "deleted"})
        else:
            self._send_json(404, {"error": "Rule not found"})

    def _handle_execute(self, data):
        try:
            rule_id = data.get("rule_id")
            context = data.get("context", {})
            results = self.rule_manager.execute_rule(rule_id, context)
            self._send_json(200, {"results": results})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_stats(self):
        stats = self.rule_manager.get_stats()
        self._send_json(200, stats)

    def _handle_history(self):
        history = self.rule_manager.engine.get_execution_history()
        self._send_json(200, {"history": history})
    
    def _handle_get_canvas(self):
        canvas_data = self.rule_manager.get_canvas()
        self._send_json(200, {"canvas": canvas_data})
    
    def _handle_save_canvas(self, data):
        try:
            canvas_data = data.get("canvas", {})
            if not isinstance(canvas_data, dict):
                self._send_json(400, {"error": "Invalid canvas data format"})
                return
            success = self.rule_manager.save_canvas(canvas_data)
            if success:
                self._send_json(200, {"status": "saved", "canvas": canvas_data})
            else:
                self._send_json(500, {"error": "Failed to save canvas"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_list_circuit_breakers(self):
        """获取所有熔断器状态"""
        try:
            circuit_breakers = self.rule_manager.get_circuit_breakers()
            self._send_json(200, {"circuit_breakers": circuit_breakers})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_reset_circuit_breaker(self, data):
        """重置指定熔断器"""
        try:
            name = data.get("name")
            if not name:
                self._send_json(400, {"error": "Circuit breaker name is required"})
                return
            success = self.rule_manager.reset_circuit_breaker(name)
            if success:
                self._send_json(200, {"status": "reset", "name": name})
            else:
                self._send_json(404, {"error": "Circuit breaker not found"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_open_circuit_breaker(self, data):
        """强制打开熔断器"""
        try:
            name = data.get("name")
            if not name:
                self._send_json(400, {"error": "Circuit breaker name is required"})
                return
            success = self.rule_manager.force_open_circuit_breaker(name)
            if success:
                self._send_json(200, {"status": "opened", "name": name})
            else:
                self._send_json(404, {"error": "Circuit breaker not found"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_close_circuit_breaker(self, data):
        """强制闭合熔断器"""
        try:
            name = data.get("name")
            if not name:
                self._send_json(400, {"error": "Circuit breaker name is required"})
                return
            success = self.rule_manager.force_close_circuit_breaker(name)
            if success:
                self._send_json(200, {"status": "closed", "name": name})
            else:
                self._send_json(404, {"error": "Circuit breaker not found"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_execute_async(self, data):
        """异步执行数据点处理"""
        try:
            from shared.src.models import DataPoint
            point_data = data.get("point")
            if not point_data:
                self._send_json(400, {"error": "Point data is required"})
                return
            point = DataPoint.from_dict(point_data)
            context = data.get("context", {})
            success = self.rule_manager.engine.execute_async(point, context)
            if success:
                self._send_json(202, {"status": "queued", "message": "Task has been queued for async execution"})
            else:
                self._send_json(503, {"error": "Async queue is full or not enabled"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_execute_batch(self, data):
        """批量执行数据点处理"""
        try:
            from shared.src.models import DataPoint
            points_data = data.get("points", [])
            if not isinstance(points_data, list) or len(points_data) == 0:
                self._send_json(400, {"error": "Points data list is required"})
                return
            points = [DataPoint.from_dict(p) for p in points_data]
            context = data.get("context", {})
            success = self.rule_manager.engine.execute_batch(points, context)
            if success:
                self._send_json(202, {"status": "queued", "count": len(points), "message": "Batch has been queued for processing"})
            else:
                self._send_json(503, {"error": "Batch processing is not enabled or queue is full"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_batch_stats(self):
        """获取批量处理统计"""
        try:
            stats = self.rule_manager.engine.get_batch_stats()
            self._send_json(200, stats)
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_async_stats(self):
        """获取异步处理统计"""
        try:
            stats = self.rule_manager.engine.get_async_stats()
            self._send_json(200, stats)
        except Exception as e:
            self._send_json(500, {"error": str(e)})
    
    def _handle_flush_batch(self):
        """立即刷新批量队列"""
        try:
            self.rule_manager.engine.flush_batch()
            self._send_json(200, {"status": "flushed"})
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


class DataFlowRouterService:
    """数据流路由微服务"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        self._server: HTTPServer = None
        self.rule_manager = RuleManager(config)
        service_config = config.get("services", "dataflow_router")
        self._host = service_config.get("host", "0.0.0.0")
        self._port = service_config.get("port", 8002)

    def start(self):
        DataFlowRouterHandler.rule_manager = self.rule_manager
        self._server = HTTPServer((self._host, self._port), DataFlowRouterHandler)
        logger.info(f"数据流路由服务启动: {self._host}:{self._port}")
        self._server.serve_forever()

    def stop(self):
        if self._server:
            self._server.shutdown()
            logger.info("数据流路由服务已停止")

    def run(self):
        try:
            self.start()
        except KeyboardInterrupt:
            self.stop()


def main():
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else None
    config = GatewayConfig(config_path)
    service = DataFlowRouterService(config)
    service.run()


if __name__ == "__main__":
    main()