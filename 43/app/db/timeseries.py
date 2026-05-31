import json
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from app.config import settings
from app.constants import AlarmLevel, AlarmStatus
from app.models.data_models import PipelineDataPoint
from app.models.alarm_models import AlarmEvent

logger = logging.getLogger(__name__)


class TimeSeriesDB:
    """
    时序数据库对接模块
    封装 InfluxDB 2.x 写入与查询接口，支持批量写入监测数据、
    告警事件存储、历史数据查询、统计聚合等功能。
    增加写入确认、数据完整性校验、连接池复用。
    """

    def __init__(self):
        self._client = None
        self._write_api = None
        self._query_api = None
        self._delete_api = None
        self._bucket = settings.INFLUXDB_BUCKET
        self._org = settings.INFLUXDB_ORG
        self._redis_client = None
        self._write_retry_count = 3
        self._write_retry_delay = 0.5

    async def connect(self):
        try:
            from influxdb_client_async import InfluxDBClientAsync

            self._client = InfluxDBClientAsync(
                url=settings.INFLUXDB_URL,
                token=settings.INFLUXDB_TOKEN,
                org=self._org,
                timeout=30000,
                enable_gzip=True,
            )
            self._write_api = self._client.write_api(
                batch_size=500,
                flush_interval=1000,
                jitter_interval=200,
                retry_interval=5000,
                max_retries=5,
                max_retry_delay=125000,
                exponential_base=2,
                max_close_wait=30000,
            )
            self._query_api = self._client.query_api()
            self._delete_api = self._client.delete_api()

            await self._ensure_redis_connection()

            logger.info(
                "InfluxDB connected: url=%s bucket=%s",
                settings.INFLUXDB_URL,
                self._bucket,
            )
        except ImportError:
            logger.error("influxdb-client-async package not installed")
            raise
        except Exception as e:
            logger.error("Failed to connect to InfluxDB: %s", e)
            raise

    async def _ensure_redis_connection(self):
        if self._redis_client is not None:
            return
        try:
            import redis.asyncio as aioredis
            redis_kwargs = {
                "max_connections": 20,
                "decode_responses": True,
                "socket_timeout": 5,
                "socket_connect_timeout": 5,
            }
            if settings.REDIS_PASSWORD:
                redis_kwargs["password"] = settings.REDIS_PASSWORD
            self._redis_client = aioredis.from_url(
                settings.REDIS_URL, **redis_kwargs
            )
            await self._redis_client.ping()
        except Exception as e:
            logger.warning("Redis not available for alarm status cache: %s", e)
            self._redis_client = None

    def _validate_point(self, point: PipelineDataPoint) -> bool:
        if not point.device_id or not point.pipeline_id:
            logger.warning("Invalid point: missing device_id or pipeline_id")
            return False
        if point.param_type is None:
            logger.warning("Invalid point: missing param_type")
            return False
        if not isinstance(point.value, (int, float)):
            logger.warning(
                "Invalid point value: %s (type: %s)",
                point.value,
                type(point.value).__name__,
            )
            return False
        if point.timestamp is None:
            logger.warning("Invalid point: missing timestamp")
            return False
        return True

    async def write(self, point: PipelineDataPoint):
        if not self._write_api:
            return

        if not self._validate_point(point):
            return

        try:
            influx_point = point.to_influx_point()
            await self._write_api.write(
                bucket=self._bucket, org=self._org, record=influx_point
            )
            logger.debug(
                "Data written: device=%s param=%s value=%.2f",
                point.device_id,
                point.param_type.value,
                point.value,
            )
        except Exception as e:
            logger.error("Failed to write data point: %s", e)
            raise

    async def write_batch(self, points: List[PipelineDataPoint]):
        if not self._write_api or not points:
            return

        valid_points = [p for p in points if self._validate_point(p)]
        if not valid_points:
            logger.warning("No valid points to write in batch")
            return

        influx_points = [p.to_influx_point() for p in valid_points]

        for attempt in range(1, self._write_retry_count + 1):
            try:
                await self._write_api.write(
                    bucket=self._bucket,
                    org=self._org,
                    record=influx_points,
                )
                logger.info(
                    "Batch write: %d points to bucket %s (attempt %d)",
                    len(influx_points),
                    self._bucket,
                    attempt,
                )
                return
            except Exception as e:
                logger.error(
                    "Failed to batch write (attempt %d/%d): %s",
                    attempt,
                    self._write_retry_count,
                    e,
                )
                if attempt < self._write_retry_count:
                    await asyncio.sleep(self._write_retry_delay * attempt)
                else:
                    await self._log_failed_points(valid_points, str(e))
                    raise

    async def write_batch_with_ack(
        self, points: List[PipelineDataPoint]
    ) -> Dict[str, Any]:
        if not self._write_api or not points:
            return {"success": False, "written": 0, "failed": len(points or [])}

        valid_points = [p for p in points if self._validate_point(p)]
        invalid_count = len(points) - len(valid_points)

        if invalid_count > 0:
            logger.warning(
                "Batch write: %d invalid points filtered out", invalid_count
            )

        if not valid_points:
            return {
                "success": False,
                "written": 0,
                "failed": invalid_count,
                "reason": "No valid points",
            }

        influx_points = [p.to_influx_point() for p in valid_points]

        try:
            await self._write_api.write(
                bucket=self._bucket,
                org=self._org,
                record=influx_points,
            )

            if self._redis_client:
                batch_key = f"cp:write:batch:{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"
                await self._redis_client.incrby(
                    batch_key, len(valid_points)
                )
                await self._redis_client.expire(batch_key, 3600)

            logger.info(
                "Batch write with ack: %d points written to %s",
                len(influx_points),
                self._bucket,
            )
            return {
                "success": True,
                "written": len(valid_points),
                "failed": invalid_count,
            }
        except Exception as e:
            logger.error("Batch write with ack failed: %s", e)
            await self._log_failed_points(valid_points, str(e))
            return {
                "success": False,
                "written": 0,
                "failed": len(points),
                "error": str(e),
            }

    async def _log_failed_points(
        self, points: List[PipelineDataPoint], error: str
    ):
        if not self._redis_client:
            return
        try:
            failed_key = f"cp:write:failed:{datetime.now(timezone.utc).strftime('%Y%m%d')}"
            failed_data = json.dumps({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": error,
                "point_count": len(points),
                "sample": [
                    {
                        "device": p.device_id,
                        "pipeline": p.pipeline_id,
                        "param": p.param_type.value,
                        "value": p.value,
                    }
                    for p in points[:10]
                ],
            })
            await self._redis_client.lpush(failed_key, failed_data)
            await self._redis_client.ltrim(failed_key, 0, 999)
        except Exception as e:
            logger.error("Failed to log failed points: %s", e)

    async def write_alarm(self, alarm: AlarmEvent):
        if not self._write_api:
            return

        try:
            alarm_point = {
                "measurement": "cp_alarm_events",
                "tags": {
                    "alarm_id": alarm.alarm_id,
                    "device_id": alarm.device_id,
                    "pipeline_id": alarm.pipeline_id,
                    "param_type": alarm.param_type.value,
                    "alarm_level": str(alarm.alarm_level.value),
                    "condition": alarm.condition.value,
                    "status": alarm.status.value,
                },
                "fields": {
                    "threshold_value": alarm.threshold_value,
                    "actual_value": alarm.actual_value,
                    "message": alarm.message,
                    "metadata": json.dumps(alarm.metadata, ensure_ascii=False),
                },
                "time": alarm.timestamp.isoformat(),
            }
            await self._write_api.write(
                bucket=self._bucket, org=self._org, record=alarm_point
            )
            logger.info("Alarm %s written to InfluxDB", alarm.alarm_id)
        except Exception as e:
            logger.error("Failed to write alarm: %s", e)

    async def query_data(
        self,
        device_id: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        param_type: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 1000,
    ) -> List[Dict[str, Any]]:
        if not self._query_api:
            return []

        flux_query = self._build_data_query(
            device_id, pipeline_id, param_type, start_time, end_time, limit
        )

        try:
            result = await self._query_api.query(flux_query)
            records = []
            for table in result:
                for record in table.records:
                    records.append(
                        {
                            "time": record.get_time().isoformat(),
                            "device_id": record.values.get("device_id", ""),
                            "pipeline_id": record.values.get("pipeline_id", ""),
                            "param_type": record.values.get("param_type", ""),
                            "value": record.get_value(),
                            "quality": record.values.get("quality", 0),
                            "location": record.values.get("location", ""),
                        }
                    )
            return records
        except Exception as e:
            logger.error("Failed to query data: %s", e)
            return []

    async def query_alarms(
        self,
        device_id: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        alarm_level: Optional[AlarmLevel] = None,
        status: Optional[AlarmStatus] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple:
        if not self._query_api:
            return [], 0

        flux_query = self._build_alarm_query(
            device_id, pipeline_id, alarm_level, status, start_time, end_time
        )

        try:
            result = await self._query_api.query(flux_query)
            all_records = []
            for table in result:
                for record in table.records:
                    all_records.append(
                        {
                            "alarm_id": record.values.get("alarm_id", ""),
                            "device_id": record.values.get("device_id", ""),
                            "pipeline_id": record.values.get("pipeline_id", ""),
                            "param_type": record.values.get("param_type", ""),
                            "alarm_level": int(record.values.get("alarm_level", 0)),
                            "condition": record.values.get("condition", ""),
                            "threshold_value": float(record.values.get("threshold_value", 0)),
                            "actual_value": float(record.values.get("actual_value", 0)),
                            "status": record.values.get("status", ""),
                            "message": record.values.get("message", ""),
                            "time": record.get_time().isoformat(),
                        }
                    )

            total = len(all_records)
            start = (page - 1) * page_size
            paged = all_records[start : start + page_size]

            if self._redis_client and paged:
                for alarm in paged:
                    alarm_id = alarm.get("alarm_id", "")
                    cache_key = f"cp:alarm:status:{alarm_id}"
                    cached_status = await self._redis_client.get(cache_key)
                    if cached_status:
                        status_data = json.loads(cached_status)
                        alarm["cached_status"] = status_data.get("status", alarm["status"])

            return paged, total
        except Exception as e:
            logger.error("Failed to query alarms: %s", e)
            return [], 0

    async def get_alarm_by_id(self, alarm_id: str) -> Optional[Dict[str, Any]]:
        if not self._query_api:
            return None

        flux_query = f'''
        from(bucket: "{self._bucket}")
            |> range(start: -30d)
            |> filter(fn: (r) => r._measurement == "cp_alarm_events")
            |> filter(fn: (r) => r.alarm_id == "{alarm_id}")
            |> keep(columns: ["_time", "device_id", "pipeline_id", "param_type", "alarm_level", "condition", "threshold_value", "actual_value", "status", "message", "metadata"])
            |> limit(n: 1)
        '''

        try:
            result = await self._query_api.query(flux_query)
            for table in result:
                for record in table.records:
                    alarm_data = {
                        "alarm_id": alarm_id,
                        "device_id": record.values.get("device_id", ""),
                        "pipeline_id": record.values.get("pipeline_id", ""),
                        "param_type": record.values.get("param_type", ""),
                        "alarm_level": int(record.values.get("alarm_level", 0)),
                        "condition": record.values.get("condition", ""),
                        "threshold_value": float(record.values.get("threshold_value", 0)),
                        "actual_value": float(record.values.get("actual_value", 0)),
                        "status": record.values.get("status", ""),
                        "message": record.values.get("message", ""),
                        "time": record.get_time().isoformat(),
                    }
                    if self._redis_client:
                        cache_key = f"cp:alarm:status:{alarm_id}"
                        cached = await self._redis_client.get(cache_key)
                        if cached:
                            status_data = json.loads(cached)
                            alarm_data["cached_status"] = status_data
                    return alarm_data
        except Exception as e:
            logger.error("Failed to get alarm by id: %s", e)
        return None

    async def update_alarm_status(
        self,
        alarm_id: str,
        status: AlarmStatus,
        acknowledged_by: Optional[str] = None,
        acknowledged_at: Optional[datetime] = None,
        resolved_at: Optional[datetime] = None,
    ) -> bool:
        if not self._redis_client:
            logger.warning("Redis not available, alarm status update skipped for %s", alarm_id)
            return False

        try:
            key = f"cp:alarm:status:{alarm_id}"
            existing = await self._redis_client.get(key)
            existing_data = json.loads(existing) if existing else {}

            update_data = {
                **existing_data,
                "alarm_id": alarm_id,
                "status": status.value,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if acknowledged_by:
                update_data["acknowledged_by"] = acknowledged_by
            if acknowledged_at:
                update_data["acknowledged_at"] = acknowledged_at.isoformat()
            if resolved_at:
                update_data["resolved_at"] = resolved_at.isoformat()

            await self._redis_client.setex(
                key, 86400 * 7, json.dumps(update_data, ensure_ascii=False)
            )

            status_key = f"cp:alarm:status_index:{status.value}"
            await self._redis_client.sadd(status_key, alarm_id)

            logger.info(
                "Alarm %s status updated to %s",
                alarm_id,
                status.value,
            )
            return True
        except Exception as e:
            logger.error("Failed to update alarm status: %s", e)
            return False

    async def get_alarm_statistics(self) -> Dict[str, Any]:
        if not self._query_api:
            return {}

        try:
            flux_query = f'''
            from(bucket: "{self._bucket}")
                |> range(start: -24h)
                |> filter(fn: (r) => r._measurement == "cp_alarm_events")
                |> keep(columns: ["_time", "alarm_level", "status", "device_id"])
            '''
            result = await self._query_api.query(flux_query)

            level_counts = {str(l.value): 0 for l in AlarmLevel}
            status_counts = {s.value: 0 for s in AlarmStatus}
            device_set = set()
            total = 0

            for table in result:
                for record in table.records:
                    total += 1
                    level = record.values.get("alarm_level", "0")
                    level_counts[str(level)] = level_counts.get(str(level), 0) + 1
                    status = record.values.get("status", "pending")
                    status_counts[status] = status_counts.get(status, 0) + 1
                    device_set.add(record.values.get("device_id", ""))

            redis_stats = {}
            if self._redis_client:
                for s in AlarmStatus:
                    status_key = f"cp:alarm:status_index:{s.value}"
                    count = await self._redis_client.scard(status_key)
                    redis_stats[f"redis_{s.value}"] = count

            return {
                "total_alarms_24h": total,
                "by_level": level_counts,
                "by_status": status_counts,
                "affected_devices": len(device_set),
                "redis_cached": redis_stats,
            }
        except Exception as e:
            logger.error("Failed to get alarm statistics: %s", e)
            return {}

    async def get_write_statistics(self) -> Dict[str, Any]:
        if not self._redis_client:
            return {}
        try:
            today_key = f"cp:write:batch:{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"
            hour_key = f"cp:write:batch:{datetime.now(timezone.utc).strftime('%Y%m%d%H')}"
            day_key = f"cp:write:batch:{datetime.now(timezone.utc).strftime('%Y%m%d')}"

            stats = {}
            for key, label in [
                (today_key, "current_minute"),
                (hour_key, "current_hour"),
                (day_key, "today"),
            ]:
                val = await self._redis_client.get(key)
                stats[label] = int(val) if val else 0

            failed_key = f"cp:write:failed:{datetime.now(timezone.utc).strftime('%Y%m%d')}"
            failed_count = await self._redis_client.llen(failed_key)
            stats["failed_today"] = failed_count

            return stats
        except Exception as e:
            logger.error("Failed to get write statistics: %s", e)
            return {}

    def _build_data_query(
        self,
        device_id: Optional[str],
        pipeline_id: Optional[str],
        param_type: Optional[str],
        start_time: Optional[datetime],
        end_time: Optional[datetime],
        limit: int,
    ) -> str:
        start = (start_time or datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        end = (end_time or datetime.now(timezone.utc)).isoformat()

        filters = [f'r._measurement == "cp_protection_data"']
        if device_id:
            filters.append(f'r.device_id == "{device_id}"')
        if pipeline_id:
            filters.append(f'r.pipeline_id == "{pipeline_id}"')
        if param_type:
            filters.append(f'r.param_type == "{param_type}"')

        filter_str = " and ".join(filters)

        return f'''
        from(bucket: "{self._bucket}")
            |> range(start: {start}, stop: {end})
            |> filter(fn: (r) => {filter_str})
            |> limit(n: {limit})
        '''

    def _build_alarm_query(
        self,
        device_id: Optional[str],
        pipeline_id: Optional[str],
        alarm_level: Optional[AlarmLevel],
        status: Optional[AlarmStatus],
        start_time: Optional[datetime],
        end_time: Optional[datetime],
    ) -> str:
        start = (start_time or datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        end = (end_time or datetime.now(timezone.utc)).isoformat()

        filters = [f'r._measurement == "cp_alarm_events"']
        if device_id:
            filters.append(f'r.device_id == "{device_id}"')
        if pipeline_id:
            filters.append(f'r.pipeline_id == "{pipeline_id}"')
        if alarm_level is not None:
            filters.append(f'r.alarm_level == "{alarm_level.value}"')
        if status is not None:
            filters.append(f'r.status == "{status.value}"')

        filter_str = " and ".join(filters)

        return f'''
        from(bucket: "{self._bucket}")
            |> range(start: {start}, stop: {end})
            |> filter(fn: (r) => {filter_str})
            |> keep(columns: ["_time", "alarm_id", "device_id", "pipeline_id", "param_type", "alarm_level", "condition", "threshold_value", "actual_value", "status", "message"])
        '''

    async def close(self):
        if self._write_api:
            try:
                await self._write_api.close()
            except Exception as e:
                logger.error("Error closing write API: %s", e)
        if self._client:
            try:
                await self._client.close()
            except Exception as e:
                logger.error("Error closing InfluxDB client: %s", e)
        if self._redis_client:
            try:
                await self._redis_client.close()
            except Exception as e:
                logger.error("Error closing Redis client: %s", e)
        self._redis_client = None
        logger.info("TimeSeriesDB connection closed")