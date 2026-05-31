import hashlib
import hmac
import logging
import time
from typing import Optional

from fastapi import Request, HTTPException, Header

from app.config import settings

logger = logging.getLogger(__name__)


class AuthMiddleware:
    """
    鉴权中间件
    实现基于 API Key + HMAC 签名的身份认证机制，
    确保只有授权的野外监测终端能提交数据。
    """

    def __init__(self):
        self._api_keys: dict = {}
        self._nonce_cache: set = set()

    def register_device(self, device_id: str, api_key: str):
        self._api_keys[device_id] = api_key
        logger.info("Registered device %s", device_id)

    def unregister_device(self, device_id: str):
        if device_id in self._api_keys:
            del self._api_keys[device_id]
            logger.info("Unregistered device %s", device_id)

    async def verify_request(
        self,
        request: Request,
        device_id: str,
        x_api_key: Optional[str] = Header(None),
        x_signature: Optional[str] = Header(None),
        x_timestamp: Optional[str] = Header(None),
        x_nonce: Optional[str] = Header(None),
    ) -> bool:
        if not self._api_keys:
            return True

        if device_id not in self._api_keys:
            logger.warning("Unknown device: %s", device_id)
            raise HTTPException(status_code=401, detail="Unknown device")

        expected_key = self._api_keys[device_id]

        if x_api_key:
            if not hmac.compare_digest(x_api_key, expected_key):
                logger.warning("Invalid API key for device %s", device_id)
                raise HTTPException(status_code=401, detail="Invalid API key")
            return True

        if x_signature and x_timestamp and x_nonce:
            if self._verify_hmac(
                device_id,
                x_signature,
                x_timestamp,
                x_nonce,
                expected_key,
                str(request.url),
            ):
                return True
            else:
                raise HTTPException(status_code=401, detail="Invalid signature")

        if not x_api_key and not x_signature:
            logger.warning("No authentication provided for device %s", device_id)
            raise HTTPException(status_code=401, detail="Authentication required")

        return False

    def _verify_hmac(
        self,
        device_id: str,
        signature: str,
        timestamp: str,
        nonce: str,
        secret_key: str,
        request_path: str,
    ) -> bool:
        try:
            ts = float(timestamp)
            now = time.time()
            if abs(now - ts) > 300:
                logger.warning("Timestamp expired for device %s", device_id)
                return False

            if nonce in self._nonce_cache:
                logger.warning("Nonce reuse detected for device %s", device_id)
                return False
            self._nonce_cache.add(nonce)

            message = f"{device_id}{timestamp}{nonce}{request_path}"
            expected = hmac.new(
                secret_key.encode("utf-8"),
                message.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()

            return hmac.compare_digest(signature, expected)
        except (ValueError, TypeError) as e:
            logger.error("HMAC verification failed: %s", e)
            return False

    def get_status(self) -> dict:
        return {
            "registered_devices": len(self._api_keys),
            "nonce_cache_size": len(self._nonce_cache),
        }