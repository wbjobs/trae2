from typing import List, Dict, Optional, Any
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import APIKeyHeader
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import time
from collections import defaultdict
from loguru import logger
from config import settings


api_key_header = APIKeyHeader(name=settings.API_KEY_HEADER, auto_error=False)


class RateLimiter:
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self._client_requests: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        window_start = now - 60

        requests = self._client_requests[client_id]
        requests = [r for r in requests if r > window_start]
        self._client_requests[client_id] = requests

        if len(requests) >= self.requests_per_minute:
            return False

        requests.append(now)
        return True


rate_limiter = RateLimiter(requests_per_minute=settings.RATE_LIMIT_PER_MINUTE)


async def verify_api_key(api_key: Optional[str] = Depends(api_key_header)) -> str:
    if not settings.API_KEYS:
        return "default"

    if not api_key or api_key not in settings.API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
    return api_key


async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"

    if not rate_limiter.is_allowed(client_ip):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"code": 429, "message": "Rate limit exceeded"},
        )

    response = await call_next(request)
    return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        client_ip = request.client.host if request.client else "unknown"

        logger.info(
            f"Request started: {request.method} {request.url.path} from {client_ip}"
        )

        try:
            response = await call_next(request)
            process_time = (time.time() - start_time) * 1000

            logger.info(
                f"Request completed: {request.method} {request.url.path} "
                f"status={response.status_code} duration={process_time:.2f}ms"
            )

            response.headers["X-Process-Time"] = f"{process_time:.2f}"
            return response

        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            logger.error(
                f"Request failed: {request.method} {request.url.path} "
                f"error={str(e)} duration={process_time:.2f}ms"
            )
            raise


class ServiceUnavailableMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, service_health_check=None):
        super().__init__(app)
        self.service_health_check = service_health_check

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)

        if self.service_health_check and not self.service_health_check():
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"code": 503, "message": "Service is initializing, please try again later"},
            )

        return await call_next(request)


class BusinessServiceClient:
    def __init__(self):
        self.base_url = settings.BUSINESS_SERVICE_URL
        self.timeout = settings.BUSINESS_SERVICE_TIMEOUT

    async def notify_analysis_complete(
        self,
        document_id: str,
        result: Dict[str, Any],
    ) -> bool:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/legal/analysis/callback",
                    json={"document_id": document_id, "result": result},
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to notify business service: {e}")
            return False

    async def fetch_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/api/documents/{document_id}"
                )
                if response.status_code == 200:
                    return response.json()
                return None
        except Exception as e:
            logger.error(f"Failed to fetch document from business service: {e}")
            return None


business_service_client = BusinessServiceClient()
