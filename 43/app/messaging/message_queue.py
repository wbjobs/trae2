import json
import logging
import asyncio
import uuid
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime, timezone

from app.config import settings
from app.models.alarm_models import AlarmEvent

logger = logging.getLogger(__name__)


class MessageQueue:
    """
    消息队列对接模块
    封装 Redis Stream 作为消息队列，支持告警事件的异步发布与消费，
    实现生产消费解耦，支持数千个监测点的高并发场景。
    增加可靠发布、死信队列、消息去重、重试机制。
    """

    def __init__(self):
        self._redis_client = None
        self._stream_name = f"{settings.MQ_QUEUE_NAME}:stream"
        self._consumer_group = f"{settings.MQ_QUEUE_NAME}:group"
        self._consumer_name = f"{settings.NODE_ID}:consumer"
        self._dlq_stream_name = f"{settings.MQ_QUEUE_NAME}:dlq"
        self._pending_alarm_set = f"cp:alarms:pending:{settings.NODE_ID}"
        self._connected = False
        self._callbacks: List[Callable] = []
        self._publish_retry_count = 3
        self._publish_retry_delay = 0.5

    async def connect(self):
        try:
            import redis.asyncio as aioredis

            redis_kwargs = {
                "max_connections": settings.REDIS_MAX_CONNECTIONS,
                "decode_responses": True,
            }
            if settings.REDIS_PASSWORD:
                redis_kwargs["password"] = settings.REDIS_PASSWORD

            self._redis_client = aioredis.from_url(
                settings.MQ_BROKER_URL, **redis_kwargs
            )
            await self._redis_client.ping()

            try:
                await self._redis_client.xgroup_create(
                    self._stream_name, self._consumer_group, id="0", mkstream=True
                )
            except Exception:
                pass

            try:
                await self._redis_client.xgroup_create(
                    self._dlq_stream_name, self._consumer_group, id="0", mkstream=True
                )
            except Exception:
                pass

            self._connected = True
            logger.info(
                "Message queue connected: stream=%s group=%s",
                self._stream_name,
                self._consumer_group,
            )
        except ImportError:
            logger.error("redis-py package not installed")
            raise
        except Exception as e:
            logger.error("Failed to connect to message queue: %s", e)
            raise

    async def _is_alarm_duplicate(self, alarm_id: str) -> bool:
        if not self._connected:
            return False
        dedup_key = f"cp:alarm:dedup:{alarm_id}"
        try:
            exists = await self._redis_client.exists(dedup_key)
            if exists:
                logger.warning("Duplicate alarm detected: %s", alarm_id)
                return True
            await self._redis_client.setex(dedup_key, 3600, "1")
            return False
        except Exception as e:
            logger.warning("Alarm dedup check failed: %s", e)
            return False

    async def publish_alarm(self, alarm: AlarmEvent) -> str:
        if not self._connected:
            await self.connect()

        if await self._is_alarm_duplicate(alarm.alarm_id):
            logger.info("Skipping duplicate alarm: %s", alarm.alarm_id)
            return "duplicate"

        payload = {
            "alarm_id": alarm.alarm_id,
            "device_id": alarm.device_id,
            "pipeline_id": alarm.pipeline_id,
            "param_type": alarm.param_type.value,
            "alarm_level": str(alarm.alarm_level.value),
            "condition": alarm.condition.value,
            "threshold_value": str(alarm.threshold_value),
            "actual_value": str(alarm.actual_value),
            "unit": alarm.unit.value,
            "timestamp": alarm.timestamp.isoformat(),
            "status": alarm.status.value,
            "message": alarm.message,
            "metadata": json.dumps(alarm.metadata, ensure_ascii=False),
            "publish_attempt": "1",
            "first_publish_time": datetime.now(timezone.utc).isoformat(),
        }

        for attempt in range(1, self._publish_retry_count + 1):
            try:
                message_id = await self._redis_client.xadd(
                    self._stream_name, payload, maxlen=100000
                )
                logger.debug(
                    "Alarm published to queue: %s -> %s (attempt %d)",
                    alarm.alarm_id,
                    message_id,
                    attempt,
                )
                return message_id
            except Exception as e:
                logger.error(
                    "Failed to publish alarm %s (attempt %d/%d): %s",
                    alarm.alarm_id,
                    attempt,
                    self._publish_retry_count,
                    e,
                )
                if attempt < self._publish_retry_count:
                    await asyncio.sleep(self._publish_retry_delay * attempt)
                else:
                    await self._move_to_dlq(alarm, str(e))
                    raise

    async def publish_alarms_batch(self, alarms: List[AlarmEvent]) -> List[str]:
        message_ids = []
        for alarm in alarms:
            try:
                mid = await self.publish_alarm(alarm)
                message_ids.append(mid)
            except Exception as e:
                logger.error("Failed to publish alarm %s: %s", alarm.alarm_id, e)
        return message_ids

    async def publish_alarms_batch_reliable(
        self, alarms: List[AlarmEvent]
    ) -> List[Dict[str, Any]]:
        results = []
        for alarm in alarms:
            try:
                mid = await self.publish_alarm(alarm)
                results.append({
                    "alarm_id": alarm.alarm_id,
                    "message_id": mid,
                    "success": mid != "duplicate",
                    "status": "duplicate" if mid == "duplicate" else "published",
                })
            except Exception as e:
                results.append({
                    "alarm_id": alarm.alarm_id,
                    "message_id": None,
                    "success": False,
                    "status": "failed",
                    "error": str(e),
                })
        return results

    async def _move_to_dlq(self, alarm: AlarmEvent, error: str):
        if not self._connected:
            return
        dlq_payload = {
            "alarm_id": alarm.alarm_id,
            "device_id": alarm.device_id,
            "pipeline_id": alarm.pipeline_id,
            "param_type": alarm.param_type.value,
            "alarm_level": str(alarm.alarm_level.value),
            "condition": alarm.condition.value,
            "threshold_value": str(alarm.threshold_value),
            "actual_value": str(alarm.actual_value),
            "unit": alarm.unit.value,
            "timestamp": alarm.timestamp.isoformat(),
            "status": "dlq",
            "message": alarm.message,
            "metadata": json.dumps(alarm.metadata, ensure_ascii=False),
            "error": error,
            "dlq_timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await self._redis_client.xadd(
                self._dlq_stream_name, dlq_payload, maxlen=50000
            )
            logger.warning("Alarm %s moved to DLQ: %s", alarm.alarm_id, error)
        except Exception as dlq_error:
            logger.critical(
                "Failed to move alarm %s to DLQ: %s (original error: %s)",
                alarm.alarm_id,
                dlq_error,
                error,
            )

    async def consume_alarms(
        self,
        count: int = 10,
        block_ms: int = 1000,
    ) -> List[Dict[str, Any]]:
        if not self._connected:
            await self.connect()

        try:
            messages = await self._redis_client.xreadgroup(
                groupname=self._consumer_group,
                consumername=self._consumer_name,
                streams={self._stream_name: ">"},
                count=count,
                block=block_ms,
            )

            alarms = []
            for stream_name, stream_messages in messages:
                for msg_id, data in stream_messages:
                    try:
                        alarm = self._parse_message(data)
                        alarm["_message_id"] = msg_id
                        alarms.append(alarm)
                    except Exception as e:
                        logger.error(
                            "Failed to parse message %s: %s - moving to DLQ",
                            msg_id,
                            e,
                        )
                        await self._move_parsed_to_dlq(data, str(e))
                        await self._redis_client.xack(
                            self._stream_name, self._consumer_group, msg_id
                        )

            return alarms
        except Exception as e:
            logger.error("Failed to consume alarms: %s", e)
            return []

    async def _move_parsed_to_dlq(self, data: Dict, error: str):
        if not self._connected:
            return
        dlq_data = dict(data)
        dlq_data["error"] = error
        dlq_data["dlq_timestamp"] = datetime.now(timezone.utc).isoformat()
        dlq_data["original_status"] = data.get("status", "unknown")
        try:
            await self._redis_client.xadd(
                self._dlq_stream_name, dlq_data, maxlen=50000
            )
        except Exception as e:
            logger.critical("Failed to move parsed message to DLQ: %s", e)

    async def acknowledge(self, message_ids: List[str]):
        if not message_ids or not self._connected:
            return
        try:
            await self._redis_client.xack(
                self._stream_name, self._consumer_group, *message_ids
            )
            logger.debug("Acknowledged %d messages", len(message_ids))
        except Exception as e:
            logger.error("Failed to acknowledge messages: %s", e)

    async def process_pending_messages(self, max_idle_ms: int = 30000):
        if not self._connected:
            return
        try:
            pending = await self._redis_client.xpending(
                self._stream_name,
                groupname=self._consumer_group,
            )
            if pending and pending.get("pending", 0) > 0:
                pending_info = await self._redis_client.xpending_range(
                    self._stream_name,
                    groupname=self._consumer_group,
                    min="-",
                    max="+",
                    count=50,
                )
                for p in pending_info:
                    msg_id = p["message_id"]
                    idle_ms = p.get("idle", 0)
                    if idle_ms > max_idle_ms:
                        logger.warning(
                            "Reclaiming stale message %s (idle %dms)",
                            msg_id,
                            idle_ms,
                        )
                        await self._redis_client.xclaim(
                            self._stream_name,
                            groupname=self._consumer_group,
                            consumername=self._consumer_name,
                            min_idle_time=max_idle_ms,
                            message_ids=[msg_id],
                        )
        except Exception as e:
            logger.error("Failed to process pending messages: %s", e)

    async def consume_dlq(
        self, count: int = 10
    ) -> List[Dict[str, Any]]:
        if not self._connected:
            return []
        try:
            messages = await self._redis_client.xread(
                streams={self._dlq_stream_name: "0"},
                count=count,
                block=100,
            )
            dlq_items = []
            for stream_name, stream_messages in messages:
                for msg_id, data in stream_messages:
                    try:
                        item = self._parse_message(data)
                        item["_message_id"] = msg_id
                        item["_dlq_error"] = data.get("error", "")
                        dlq_items.append(item)
                    except Exception as e:
                        logger.error("Failed to parse DLQ message %s: %s", msg_id, e)
            return dlq_items
        except Exception as e:
            logger.error("Failed to consume DLQ: %s", e)
            return []

    async def get_stream_info(self) -> Dict[str, Any]:
        if not self._connected:
            return {"status": "disconnected"}
        try:
            info = await self._redis_client.xinfo_stream(self._stream_name)
            groups_info = await self._redis_client.xinfo_groups(self._stream_name)
            dlq_info = await self._redis_client.xinfo_stream(self._dlq_stream_name)
            return {
                "status": "connected",
                "stream": self._stream_name,
                "length": info.get("length", 0),
                "groups": info.get("groups", 0),
                "last_generated_id": info.get("last-generated-id", ""),
                "consumers": [
                    {"name": g.get("name", ""), "pending": g.get("pending", 0)}
                    for g in groups_info
                ],
                "dlq_length": dlq_info.get("length", 0) if dlq_info else 0,
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def _parse_message(self, data: Dict) -> Dict[str, Any]:
        return {
            "alarm_id": data.get("alarm_id", ""),
            "device_id": data.get("device_id", ""),
            "pipeline_id": data.get("pipeline_id", ""),
            "param_type": data.get("param_type", ""),
            "alarm_level": int(data.get("alarm_level", 0)),
            "condition": data.get("condition", ""),
            "threshold_value": float(data.get("threshold_value", 0)),
            "actual_value": float(data.get("actual_value", 0)),
            "unit": data.get("unit", ""),
            "timestamp": data.get("timestamp", ""),
            "status": data.get("status", ""),
            "message": data.get("message", ""),
            "metadata": json.loads(data.get("metadata", "{}")),
        }

    def register_callback(self, callback: Callable):
        self._callbacks.append(callback)

    async def close(self):
        if self._redis_client:
            await self._redis_client.close()
            self._connected = False
            logger.info("Message queue connection closed")