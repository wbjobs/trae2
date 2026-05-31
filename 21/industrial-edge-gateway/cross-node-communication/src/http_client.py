"""
HTTP 客户端 - 用于云端 REST API 通信
"""
import json
import urllib.request
import urllib.error
from typing import Any, Dict, Optional
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("http_client")


class HTTPClient:
    """HTTP 客户端封装"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        cross_node_config = config.get("services", "cross_node")
        self._base_url = cross_node_config.get("cloud_endpoint", "")
        self._timeout = 30
        self._headers = {
            "Content-Type": "application/json",
            "X-Gateway-ID": config.get("gateway", "id", default="edge"),
        }

    def _make_request(self, method: str, endpoint: str, data: Dict = None) -> Optional[Dict]:
        url = f"{self._base_url}{endpoint}"
        
        try:
            req_data = json.dumps(data).encode("utf-8") if data else None
            req = urllib.request.Request(
                url,
                data=req_data,
                headers=self._headers,
                method=method,
            )
            
            with urllib.request.urlopen(req, timeout=self._timeout) as response:
                response_data = response.read().decode("utf-8")
                return json.loads(response_data) if response_data else None
                
        except urllib.error.HTTPError as e:
            logger.error(f"HTTP {method} {url} 失败: {e.code} {e.reason}")
            return None
        except urllib.error.URLError as e:
            logger.error(f"HTTP {method} {url} 连接失败: {e.reason}")
            return None
        except Exception as e:
            logger.error(f"HTTP {method} {url} 错误: {e}")
            return None

    def get(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        if params:
            query_string = "&".join(f"{k}={v}" for k, v in params.items())
            endpoint = f"{endpoint}?{query_string}"
        return self._make_request("GET", endpoint)

    def post(self, endpoint: str, data: Dict) -> Optional[Dict]:
        return self._make_request("POST", endpoint, data)

    def put(self, endpoint: str, data: Dict) -> Optional[Dict]:
        return self._make_request("PUT", endpoint, data)

    def delete(self, endpoint: str) -> Optional[Dict]:
        return self._make_request("DELETE", endpoint)

    def send_data(self, data: Dict) -> Optional[Dict]:
        return self.post("/api/data", data)

    def send_heartbeat(self, status: Dict) -> Optional[Dict]:
        return self.post("/api/heartbeat", status)

    def get_config(self) -> Optional[Dict]:
        return self.get("/api/config")

    def update_status(self, status: Dict) -> Optional[Dict]:
        return self.post("/api/status", status)

    def set_header(self, key: str, value: str):
        self._headers[key] = value

    def set_base_url(self, url: str):
        self._base_url = url