import json
import logging
from typing import Optional, Any, Dict, List

from app.config import settings

logger = logging.getLogger(__name__)


class RedisClient:
    """
    Redis 客户端封装
    提供缓存、分布式锁、设备状态管理等通用 Redis 操作，
    支持集群环境下的高并发访问。
    """

    def __init__(self):
        self._client = None
        self._connected = False

    async def connect(self):
        try:
            import redis.asyncio as aioredis

            redis_kwargs = {
                "max_connections": settings.REDIS_MAX_CONNECTIONS,
                "decode_responses": True,
                "socket_timeout": 5,
                "socket_connect_timeout": 5,
            }
            if settings.REDIS_PASSWORD:
                redis_kwargs["password"] = settings.REDIS_PASSWORD

            self._client = aioredis.from_url(
                settings.REDIS_URL, **redis_kwargs
            )
            await self._client.ping()
            self._connected = True
            logger.info("Redis connected: %s", settings.REDIS_URL)
        except ImportError:
            logger.error("redis-py package not installed")
            raise
        except Exception as e:
            logger.error("Failed to connect to Redis: %s", e)
            raise

    async def set_cache(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
    ) -> bool:
        if not self._connected:
            return False
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            if ttl:
                await self._client.setex(key, ttl, str(value))
            else:
                await self._client.set(key, str(value))
            return True
        except Exception as e:
            logger.error("Redis set_cache failed: %s", e)
            return False

    async def get_cache(self, key: str) -> Optional[str]:
        if not self._connected:
            return None
        try:
            return await self._client.get(key)
        except Exception as e:
            logger.error("Redis get_cache failed: %s", e)
            return None

    async def delete_cache(self, key: str) -> bool:
        if not self._connected:
            return False
        try:
            await self._client.delete(key)
            return True
        except Exception as e:
            logger.error("Redis delete_cache failed: %s", e)
            return False

    async def acquire_lock(
        self,
        lock_key: str,
        value: str,
        ttl: int = 30,
    ) -> bool:
        if not self._connected:
            return True
        try:
            result = await self._client.set(lock_key, value, nx=True, ex=ttl)
            return bool(result)
        except Exception as e:
            logger.error("Redis acquire_lock failed: %s", e)
            return True

    async def release_lock(self, lock_key: str, expected_value: str):
        if not self._connected:
            return
        try:
            current = await self._client.get(lock_key)
            if current == expected_value:
                await self._client.delete(lock_key)
        except Exception as e:
            logger.error("Redis release_lock failed: %s", e)

    async def update_device_status(
        self, device_id: str, status: str, metadata: Optional[Dict] = None
    ):
        if not self._connected:
            return
        try:
            import time

            key = f"cp:device:status:{device_id}"
            data = {
                "device_id": device_id,
                "status": status,
                "last_seen": time.time(),
            }
            if metadata:
                data.update(metadata)
            await self._client.setex(
                key, 3600, json.dumps(data, ensure_ascii=False)
            )
        except Exception as e:
            logger.error("Redis update_device_status failed: %s", e)

    async def get_device_status(self, device_id: str) -> Optional[Dict]:
        if not self._connected:
            return None
        try:
            key = f"cp:device:status:{device_id}"
            data = await self._client.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            logger.error("Redis get_device_status failed: %s", e)
            return None

    async def get_status(self) -> Dict[str, Any]:
        if not self._connected:
            return {"connected": False}
        try:
            info = await self._client.info("stats")
            return {
                "connected": True,
                "total_connections_received": info.get(
                    "total_connections_received", 0
                ),
                "total_commands_processed": info.get(
                    "total_commands_processed", 0
                ),
                "used_memory_human": info.get("used_memory_human", "unknown"),
                "connected_clients": info.get("connected_clients", 0),
            }
        except Exception as e:
            return {"connected": False, "error": str(e)}

    async def close(self):
        if self._client:
            await self._client.close()
            self._connected = False
            logger.info("Redis connection closed")