import json
import time
import uuid
from typing import Any, Dict, Optional

import httpx

from config import get_config
from auth import get_auth_manager
from models import ServiceOperation


class ServiceClient:
    _instance: Optional["ServiceClient"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._config = get_config()
        self._cluster = self._config.cluster
        self._auth_mgr = get_auth_manager()
        self._service_token: Optional[str] = None
        self._client = httpx.Client(timeout=30.0)
        self._authenticate()

    def _authenticate(self):
        auth_result = self._auth_mgr.authenticate("service-key-001")
        if auth_result:
            self._service_token = auth_result.token

    def _get_service_url(self, service_name: str) -> Optional[str]:
        service_map = {
            "signaling": self._cluster.signaling_service.url,
            "scheduler": self._cluster.scheduler_service.url,
            "channel": self._cluster.channel_service.url,
            "callback": self._cluster.callback_service.url,
            "auth": self._cluster.auth_service.url,
        }
        return service_map.get(service_name)

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "X-Request-ID": str(uuid.uuid4()),
        }
        if self._service_token:
            headers["Authorization"] = f"Bearer {self._service_token}"
        return headers

    async def async_call(
        self,
        service_name: str,
        endpoint: str,
        method: str = "POST",
        payload: Optional[Dict] = None,
        timeout: float = 10.0,
    ) -> Dict:
        base_url = self._get_service_url(service_name)
        if not base_url:
            return {"code": -1, "message": f"Unknown service: {service_name}"}

        url = f"{base_url}{self._config.api_prefix}{endpoint}"
        headers = self._get_headers()

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                if method.upper() == "GET":
                    response = await client.get(url, headers=headers, params=payload)
                elif method.upper() == "DELETE":
                    response = await client.delete(url, headers=headers)
                else:
                    response = await client.post(url, json=payload, headers=headers)

                result = response.json()
                return result
            except httpx.ConnectError:
                return {
                    "code": -2,
                    "message": f"Service {service_name} unavailable at {url}",
                }
            except httpx.TimeoutException:
                return {"code": -3, "message": f"Service {service_name} timeout"}
            except Exception as e:
                return {"code": -4, "message": str(e)}

    def sync_call(
        self,
        service_name: str,
        endpoint: str,
        method: str = "POST",
        payload: Optional[Dict] = None,
        timeout: float = 10.0,
    ) -> Dict:
        base_url = self._get_service_url(service_name)
        if not base_url:
            return {"code": -1, "message": f"Unknown service: {service_name}"}

        url = f"{base_url}{self._config.api_prefix}{endpoint}"
        headers = self._get_headers()

        try:
            if method.upper() == "GET":
                response = self._client.get(url, headers=headers, params=payload)
            elif method.upper() == "DELETE":
                response = self._client.delete(url, headers=headers)
            else:
                response = self._client.post(url, json=payload, headers=headers)
            return response.json()
        except httpx.ConnectError:
            return {
                "code": -2,
                "message": f"Service {service_name} unavailable at {url}",
            }
        except httpx.TimeoutException:
            return {"code": -3, "message": f"Service {service_name} timeout"}
        except Exception as e:
            return {"code": -4, "message": str(e)}

    async def notify_task_status(
        self, task_id: str, status: str, satellite_id: str
    ) -> Dict:
        return await self.async_call(
            "callback",
            "/callback/trigger",
            "POST",
            {
                "event_type": "task_status_changed",
                "payload": {
                    "task_id": task_id,
                    "status": status,
                    "satellite_id": satellite_id,
                },
                "source_service": "scheduler",
            },
        )

    async def forward_signaling(
        self, message: Dict, target_direction: str = "uplink"
    ) -> Dict:
        return await self.async_call(
            "signaling",
            "/signaling/receive",
            "POST",
            {
                **message,
                "direction": target_direction,
                "source": "service_client",
            },
        )

    async def request_channel_allocation(self, task_id: str, satellite_id: str) -> Dict:
        return await self.async_call(
            "channel",
            "/channel/allocate",
            "POST",
            {"task_id": task_id, "satellite_id": satellite_id},
        )

    async def release_channel(self, task_id: str) -> Dict:
        return await self.async_call(
            "channel",
            "/channel/release",
            "POST",
            {"task_id": task_id},
        )

    def health_check(self, service_name: str) -> Dict:
        base_url = self._get_service_url(service_name)
        if not base_url:
            return {"code": -1, "message": f"Unknown service: {service_name}"}
        try:
            response = self._client.get(f"{base_url}/health", timeout=5.0)
            return response.json()
        except Exception as e:
            return {"code": -1, "message": str(e), "status": "unhealthy"}

    def get_cluster_status(self) -> Dict:
        services = ["signaling", "scheduler", "channel", "callback", "auth"]
        statuses = {}
        for svc in services:
            statuses[svc] = self.health_check(svc)
        return statuses

    def close(self):
        self._client.close()


_service_client_instance: Optional[ServiceClient] = None


def get_service_client() -> ServiceClient:
    global _service_client_instance
    if _service_client_instance is None:
        _service_client_instance = ServiceClient()
    return _service_client_instance