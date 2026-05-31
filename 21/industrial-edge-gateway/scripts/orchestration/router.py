"""
路由调度器 - 独立的请求路由与负载均衡模块
从 gateway_main.py 中解耦路由逻辑，提供更清晰的架构
"""
import json
import urllib.request
import urllib.error
import threading
from typing import Any, Callable, Dict, List, Optional, Tuple
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("router")


class RouteRule:
    """路由规则"""

    def __init__(
        self,
        path_prefix: str,
        target_port: int,
        methods: Optional[List[str]] = None,
        weight: int = 1,
        enabled: bool = True,
    ):
        self.path_prefix = path_prefix
        self.target_port = target_port
        self.methods = methods or ["GET", "POST", "PUT", "DELETE"]
        self.weight = weight
        self.enabled = enabled

    def matches(self, path: str, method: str) -> bool:
        """检查是否匹配该路由规则"""
        if not self.enabled:
            return False
        if method not in self.methods:
            return False
        return path.startswith(self.path_prefix)


class LoadBalancer:
    """负载均衡器 - 支持多实例路由"""

    def __init__(self):
        self._instances: Dict[str, List[Tuple[str, int]]] = {}
        self._counters: Dict[str, int] = {}
        self._lock = threading.Lock()

    def add_instance(self, service_name: str, host: str, port: int):
        """添加服务实例"""
        with self._lock:
            if service_name not in self._instances:
                self._instances[service_name] = []
            self._instances[service_name].append((host, port))
            self._counters[service_name] = 0
            logger.info(f"负载均衡器: 添加服务实例 {service_name} -> {host}:{port}")

    def remove_instance(self, service_name: str, host: str, port: int):
        """移除服务实例"""
        with self._lock:
            if service_name in self._instances:
                self._instances[service_name] = [
                    (h, p) for h, p in self._instances[service_name] if not (h == host and p == port)
                ]
                logger.info(f"负载均衡器: 移除服务实例 {service_name} -> {host}:{port}")

    def get_next(self, service_name: str) -> Optional[Tuple[str, int]]:
        """使用轮询算法获取下一个服务实例"""
        with self._lock:
            instances = self._instances.get(service_name, [])
            if not instances:
                return None
            self._counters[service_name] = (self._counters.get(service_name, 0) + 1) % len(instances)
            return instances[self._counters[service_name]]


class RequestRouter:
    """
    请求路由器 - 负责路由规则管理和请求转发
    
    特性:
    - 基于路径前缀的路由匹配
    - 多方法支持 (GET, POST, PUT, DELETE 等)
    - 负载均衡支持
    - 路由优先级
    - 动态路由注册/注销
    """

    def __init__(self, config: GatewayConfig):
        self.config = config
        self._routes: List[RouteRule] = []
        self._load_balancer = LoadBalancer()
        self._lock = threading.RLock()
        self._default_target: Optional[int] = None
        self._initialize_routes()

    def _initialize_routes(self):
        """从配置初始化路由规则"""
        service_ports = {
            "devices": self.config.get("services", "device_gateway", "port", default=8003),
            "rules": self.config.get("services", "dataflow_router", "port", default=8002),
            "storage": self.config.get("services", "data_storage", "port", default=8004),
            "protocols": self.config.get("services", "protocol_parser", "port", default=8001),
            "canvas": self.config.get("services", "dataflow_router", "port", default=8002),
            "execute": self.config.get("services", "dataflow_router", "port", default=8002),
            "stats": self.config.get("services", "dataflow_router", "port", default=8002),
            "history": self.config.get("services", "dataflow_router", "port", default=8002),
            "circuit-breakers": self.config.get("services", "dataflow_router", "port", default=8002),
            "health": self.config.get("services", "device_gateway", "port", default=8003),
        }

        for path_prefix, port in service_ports.items():
            self.add_route(f"/{path_prefix}", port)

        logger.info(f"路由器初始化完成，共 {len(self._routes)} 条路由规则")

    def add_route(
        self,
        path_prefix: str,
        target_port: int,
        methods: Optional[List[str]] = None,
        weight: int = 1,
    ) -> RouteRule:
        """添加路由规则"""
        with self._lock:
            existing = [r for r in self._routes if r.path_prefix == path_prefix]
            if existing:
                rule = existing[0]
                rule.target_port = target_port
                rule.enabled = True
                logger.info(f"更新路由: {path_prefix} -> port {target_port}")
                return rule
            
            rule = RouteRule(path_prefix, target_port, methods, weight)
            self._routes.append(rule)
            self._routes.sort(key=lambda r: -len(r.path_prefix))
            logger.info(f"添加路由: {path_prefix} -> port {target_port}")
            return rule

    def remove_route(self, path_prefix: str) -> bool:
        """移除路由规则"""
        with self._lock:
            original_length = len(self._routes)
            self._routes = [r for r in self._routes if r.path_prefix != path_prefix]
            removed = len(self._routes) < original_length
            if removed:
                logger.info(f"移除路由: {path_prefix}")
            return removed

    def disable_route(self, path_prefix: str) -> bool:
        """禁用路由"""
        with self._lock:
            for rule in self._routes:
                if rule.path_prefix == path_prefix:
                    rule.enabled = False
                    logger.info(f"禁用路由: {path_prefix}")
                    return True
            return False

    def enable_route(self, path_prefix: str) -> bool:
        """启用路由"""
        with self._lock:
            for rule in self._routes:
                if rule.path_prefix == path_prefix:
                    rule.enabled = True
                    logger.info(f"启用路由: {path_prefix}")
                    return True
            return False

    def find_route(self, path: str, method: str = "GET") -> Optional[RouteRule]:
        """查找匹配的路由规则（最长前缀匹配）"""
        with self._lock:
            for rule in self._routes:
                if rule.matches(path, method):
                    return rule
            return None

    def get_target(self, path: str, method: str = "GET") -> Optional[int]:
        """获取请求的目标端口"""
        route = self.find_route(path, method)
        if route:
            return route.target_port
        return self._default_target

    def proxy_request(
        self,
        method: str,
        path: str,
        body: Optional[bytes] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 10,
    ) -> Tuple[int, bytes, Dict[str, str]]:
        """
        代理请求到目标服务
        
        Args:
            method: HTTP 方法
            path: 请求路径
            body: 请求体
            headers: 请求头
            timeout: 超时时间（秒）
            
        Returns:
            (状态码, 响应体, 响应头)
        """
        target_port = self.get_target(path, method)
        if target_port is None:
            return 404, json.dumps({"error": "Not Found"}).encode("utf-8"), {"Content-Type": "application/json"}

        try:
            target_url = f"http://localhost:{target_port}{path}"
            
            req = urllib.request.Request(
                target_url,
                data=body,
                method=method,
            )
            
            if body and (headers is None or "Content-Type" not in headers):
                req.add_header("Content-Type", "application/json")
            
            if headers:
                for key, value in headers.items():
                    if key.lower() != "content-length":
                        req.add_header(key, value)

            with urllib.request.urlopen(req, timeout=timeout) as response:
                response_body = response.read()
                response_headers = {k: v for k, v in response.getheaders()}
                return response.status, response_body, response_headers

        except urllib.error.HTTPError as e:
            try:
                error_body = e.read()
            except Exception:
                error_body = json.dumps({"error": str(e)}).encode("utf-8")
            return e.code, error_body, {"Content-Type": "application/json"}
        except urllib.error.URLError as e:
            error_msg = {"error": f"服务不可用: {e.reason}"}
            return 503, json.dumps(error_msg).encode("utf-8"), {"Content-Type": "application/json"}
        except Exception as e:
            error_msg = {"error": f"代理请求失败: {str(e)}"}
            return 500, json.dumps(error_msg).encode("utf-8"), {"Content-Type": "application/json"}

    def get_all_routes(self) -> List[Dict[str, Any]]:
        """获取所有路由规则"""
        with self._lock:
            return [
                {
                    "path_prefix": rule.path_prefix,
                    "target_port": rule.target_port,
                    "methods": rule.methods,
                    "weight": rule.weight,
                    "enabled": rule.enabled,
                }
                for rule in self._routes
            ]


class PathRewriter:
    """路径重写器"""

    def __init__(self):
        self._rewrite_rules: List[Tuple[str, str]] = []
        self._lock = threading.Lock()

    def add_rule(self, pattern: str, replacement: str):
        """添加路径重写规则"""
        with self._lock:
            self._rewrite_rules.append((pattern, replacement))

    def rewrite(self, path: str) -> str:
        """重写路径"""
        with self._lock:
            for pattern, replacement in self._rewrite_rules:
                if path.startswith(pattern):
                    return path.replace(pattern, replacement, 1)
        return path


class RouterManager:
    """
    路由管理器 - 统一管理路由、负载均衡和路径重写
    
    这是 gateway_main.py 中路由逻辑的重构版本，提供更清晰的架构和更好的可维护性。
    """

    def __init__(self, config: GatewayConfig):
        self.router = RequestRouter(config)
        self.path_rewriter = PathRewriter()
        self.config = config
        self._request_stats: Dict[str, Dict[str, Any]] = {}
        self._stats_lock = threading.Lock()

    def handle_request(
        self,
        method: str,
        path: str,
        body: Optional[bytes] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Tuple[int, bytes, Dict[str, str]]:
        """处理请求（完整流程）"""
        rewritten_path = self.path_rewriter.rewrite(path)
        
        self._record_request(method, rewritten_path)
        
        status, body, resp_headers = self.router.proxy_request(
            method,
            rewritten_path,
            body,
            headers,
        )
        
        self._record_response(method, rewritten_path, status)
        
        return status, body, resp_headers

    def _record_request(self, method: str, path: str):
        """记录请求统计"""
        with self._stats_lock:
            key = f"{method}:{path.split('/')[1] if '/' in path else path}"
            if key not in self._request_stats:
                self._request_stats[key] = {
                    "total_requests": 0,
                    "successful_requests": 0,
                    "failed_requests": 0,
                    "total_latency": 0.0,
                    "last_request": None,
                }
            self._request_stats[key]["total_requests"] += 1
            self._request_stats[key]["last_request"] = __import__("datetime").datetime.utcnow().isoformat()

    def _record_response(self, method: str, path: str, status: int):
        """记录响应统计"""
        with self._stats_lock:
            key = f"{method}:{path.split('/')[1] if '/' in path else path}"
            if key in self._request_stats:
                if 200 <= status < 400:
                    self._request_stats[key]["successful_requests"] += 1
                else:
                    self._request_stats[key]["failed_requests"] += 1

    def get_stats(self) -> Dict[str, Any]:
        """获取路由统计信息"""
        with self._stats_lock:
            return {
                "routes": self.router.get_all_routes(),
                "request_stats": self._request_stats,
            }

    def register_service(self, service_name: str, port: int):
        """注册服务（便捷方法）"""
        self.router.add_route(f"/{service_name}", port)
        self.router._load_balancer.add_instance(service_name, "localhost", port)

    def unregister_service(self, service_name: str):
        """注销服务（便捷方法）"""
        self.router.remove_route(f"/{service_name}")
