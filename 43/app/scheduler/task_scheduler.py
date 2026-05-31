import uuid
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.constants import AlarmLevel

logger = logging.getLogger(__name__)


class TaskScheduler:
    """
    分布式任务调度模块
    基于 APScheduler 实现定时任务调度，支持集群环境下的任务分发、
    去重执行、心跳检测、告警聚合统计等功能。
    修复异步锁逻辑，使用纯异步方式避免事件循环死锁。
    """

    def __init__(self):
        self._scheduler: Optional[AsyncIOScheduler] = None
        self._redis_client = None
        self._lock_key_prefix = "cp:schedule:lock:"
        self._tasks: Dict[str, Dict[str, Any]] = {}
        self._initialized = False
        self._node_id = settings.NODE_ID
        self._lock_ttl = 30
        self._offline_detector = None
        self._strategy_manager = None
        self._message_queue = None

    async def initialize(self):
        self._scheduler = AsyncIOScheduler(
            timezone=settings.SCHEDULER_TIMEZONE,
            job_defaults={
                "coalesce": True,
                "max_instances": 1,
                "misfire_grace_time": 60,
            },
        )
        self._scheduler.start()

        try:
            import redis.asyncio as aioredis
            redis_kwargs = {
                "max_connections": settings.REDIS_MAX_CONNECTIONS,
                "decode_responses": True,
            }
            if settings.REDIS_PASSWORD:
                redis_kwargs["password"] = settings.REDIS_PASSWORD
            self._redis_client = aioredis.from_url(
                settings.REDIS_URL, **redis_kwargs
            )
            await self._redis_client.ping()
        except Exception as e:
            logger.warning("Redis not available for distributed locking: %s", e)
            self._redis_client = None

        self._register_system_tasks()
        self._initialized = True
        logger.info("Task scheduler initialized on node %s", self._node_id)

    def _register_system_tasks(self):
        self.add_task(
            task_id="system:heartbeat",
            name="Cluster Heartbeat",
            func=self._heartbeat_task,
            trigger=IntervalTrigger(seconds=settings.SCHEDULER_HEARTBEAT_INTERVAL),
            distributed=True,
        )

        self.add_task(
            task_id="system:cleanup",
            name="Alarm Cleanup",
            func=self._cleanup_task,
            trigger=CronTrigger(hour=2, minute=0, timezone=settings.SCHEDULER_TIMEZONE),
            distributed=True,
        )

        self.add_task(
            task_id="system:statistics",
            name="Statistics Aggregation",
            func=self._statistics_task,
            trigger=CronTrigger(minute="*/5", timezone=settings.SCHEDULER_TIMEZONE),
            distributed=True,
        )

        self.add_task(
            task_id="system:mq_reclaim",
            name="MQ Pending Reclaim",
            func=self._mq_reclaim_task,
            trigger=IntervalTrigger(seconds=60),
            distributed=True,
        )

        self.add_task(
            task_id="system:offline_check",
            name="Monitor Point Offline Check",
            func=self._offline_check_task,
            trigger=IntervalTrigger(seconds=30),
            distributed=False,
        )

        self.add_task(
            task_id="system:strategy_switch",
            name="Strategy Schedule Check",
            func=self._strategy_switch_task,
            trigger=CronTrigger(minute="*/1", timezone=settings.SCHEDULER_TIMEZONE),
            distributed=True,
        )

        self.add_task(
            task_id="system:concurrency_cleanup",
            name="Concurrency Pool Cleanup",
            func=self._concurrency_cleanup_task,
            trigger=CronTrigger(minute="*/10", timezone=settings.SCHEDULER_TIMEZONE),
            distributed=False,
        )

    def add_task(
        self,
        task_id: str,
        name: str,
        func: Callable,
        trigger,
        distributed: bool = True,
        **kwargs,
    ):
        job_id = f"{self._node_id}:{task_id}"

        async def async_wrapper():
            if distributed and self._redis_client:
                lock_key = f"{self._lock_key_prefix}{task_id}"
                lock_value = f"{self._node_id}:{uuid.uuid4().hex}"
                acquired = await self._try_acquire_lock(
                    lock_key, lock_value, self._lock_ttl
                )
                if not acquired:
                    logger.debug(
                        "Task %s skipped: lock held by another node", task_id
                    )
                    return
                try:
                    if asyncio.iscoroutinefunction(func):
                        await func()
                    else:
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(None, func)
                finally:
                    await self._release_lock(lock_key, lock_value)
            else:
                if asyncio.iscoroutinefunction(func):
                    await func()
                else:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, func)

        def sync_wrapper():
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(async_wrapper())
                else:
                    loop.run_until_complete(async_wrapper())
            except RuntimeError:
                asyncio.run(async_wrapper())

        self._scheduler.add_job(
            sync_wrapper,
            trigger=trigger,
            id=job_id,
            name=name,
            replace_existing=True,
            **kwargs,
        )

        self._tasks[task_id] = {
            "task_id": task_id,
            "name": name,
            "job_id": job_id,
            "trigger": str(trigger),
            "distributed": distributed,
            "registered_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("Registered task: %s (%s)", task_id, name)

    def remove_task(self, task_id: str):
        job_id = f"{self._node_id}:{task_id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)
        if task_id in self._tasks:
            del self._tasks[task_id]
        logger.info("Removed task: %s", task_id)

    def list_tasks(self) -> List[Dict[str, Any]]:
        return list(self._tasks.values())

    def get_task_status(self) -> Dict[str, Any]:
        return {
            "node_id": self._node_id,
            "initialized": self._initialized,
            "running": self._scheduler.running if self._scheduler else False,
            "task_count": len(self._tasks),
            "tasks": self.list_tasks(),
        }

    async def _try_acquire_lock(
        self, lock_key: str, lock_value: str, ttl: int = 30
    ) -> bool:
        if not self._redis_client:
            logger.warning("Redis not available, allowing task execution")
            return True
        try:
            acquired = await self._redis_client.set(
                lock_key, lock_value, nx=True, ex=ttl
            )
            if acquired:
                logger.debug(
                    "Lock acquired: %s by %s", lock_key, self._node_id
                )
            return bool(acquired)
        except Exception as e:
            logger.error("Lock acquisition failed for %s: %s", lock_key, e)
            return True

    async def _release_lock(self, lock_key: str, expected_value: str):
        if not self._redis_client:
            return
        try:
            current_holder = await self._redis_client.get(lock_key)
            if current_holder == expected_value:
                await self._redis_client.delete(lock_key)
                logger.debug("Lock released: %s by %s", lock_key, self._node_id)
        except Exception as e:
            logger.error("Lock release failed for %s: %s", lock_key, e)

    async def _heartbeat_task(self):
        if not self._redis_client:
            return
        try:
            node_key = f"cp:cluster:nodes:{self._node_id}"
            heartbeat_data = {
                "node_id": self._node_id,
                "status": "online",
                "last_heartbeat": datetime.now(timezone.utc).isoformat(),
                "version": "1.0.0",
            }
            await self._redis_client.setex(
                node_key,
                settings.SCHEDULER_HEARTBEAT_INTERVAL * 3,
                json.dumps(heartbeat_data),
            )
            logger.debug("Heartbeat sent from node %s", self._node_id)
        except Exception as e:
            logger.error("Heartbeat task failed: %s", e)

    async def _cleanup_task(self):
        if not self._redis_client:
            return
        try:
            cutoff = datetime.now(timezone.utc).timestamp() - 86400 * 30
            removed = await self._redis_client.zremrangebyscore(
                "cp:alarms:archive", 0, cutoff
            )
            logger.info(
                "Cleanup task completed on node %s: removed %d entries",
                self._node_id,
                removed,
            )

            dedup_keys = await self._redis_client.keys("cp:alarm:dedup:*")
            if dedup_keys:
                ttl_checks = []
                for key in dedup_keys:
                    ttl = await self._redis_client.ttl(key)
                    if ttl < 0:
                        ttl_checks.append(key)
                if ttl_checks:
                    await self._redis_client.delete(*ttl_checks)
                    logger.info("Cleaned up %d stale dedup keys", len(ttl_checks))
        except Exception as e:
            logger.error("Cleanup task failed: %s", e)

    async def _statistics_task(self):
        if not self._redis_client:
            return
        try:
            stats = {
                "node_id": self._node_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "tasks_running": len(self._tasks),
            }
            stats_key = f"cp:stats:node:{self._node_id}"
            await self._redis_client.setex(
                stats_key, 3600, json.dumps(stats, ensure_ascii=False)
            )
            logger.info(
                "Statistics aggregation running on node %s: %d tasks",
                self._node_id,
                len(self._tasks),
            )
        except Exception as e:
            logger.error("Statistics task failed: %s", e)

    async def _mq_reclaim_task(self):
        if not self._redis_client:
            return
        try:
            stream_name = f"{settings.MQ_QUEUE_NAME}:stream"
            group_name = f"{settings.MQ_QUEUE_NAME}:group"
            consumer_name = f"{self._node_id}:consumer"

            pending = await self._redis_client.xpending(
                stream_name, groupname=group_name
            )
            if pending and pending.get("pending", 0) > 0:
                pending_info = await self._redis_client.xpending_range(
                    stream_name,
                    groupname=group_name,
                    min="-",
                    max="+",
                    count=50,
                )
                reclaimed = 0
                for p in pending_info:
                    msg_id = p["message_id"]
                    idle_ms = p.get("idle", 0)
                    if idle_ms > 30000:
                        await self._redis_client.xclaim(
                            stream_name,
                            groupname=group_name,
                            consumername=consumer_name,
                            min_idle_time=30000,
                            message_ids=[msg_id],
                        )
                        reclaimed += 1
                if reclaimed > 0:
                    logger.info(
                        "Reclaimed %d stale MQ messages on node %s",
                        reclaimed,
                        self._node_id,
                    )
        except Exception as e:
            logger.error("MQ reclaim task failed: %s", e)

    async def _offline_check_task(self):
        if not self._offline_detector:
            return
        try:
            alarms = await self._offline_detector.check_offline_status()
            if alarms and self._message_queue:
                results = await self._message_queue.publish_alarms_batch_reliable(
                    alarms
                )
                logger.info(
                    "Offline check completed: %d alarms generated, %d published",
                    len(alarms),
                    sum(1 for r in results if r["success"]),
                )
        except Exception as e:
            logger.error("Offline check task failed: %s", e)

    async def _strategy_switch_task(self):
        if not self._strategy_manager:
            return
        try:
            from datetime import datetime as dt

            now = dt.now()
            current_hour = now.hour
            current_minute = now.minute
            current_weekday = now.weekday()

            schedules = self._strategy_manager._schedules
            for schedule_id, schedule in schedules.items():
                if not schedule.enabled:
                    continue

                should_trigger = self._check_cron_match(
                    schedule.cron, current_hour, current_minute, current_weekday
                )

                if should_trigger:
                    logger.info(
                        "Triggering strategy schedule %s at %02d:%02d",
                        schedule_id,
                        current_hour,
                        current_minute,
                    )
                    await self._strategy_manager.execute_schedule(schedule_id)

        except Exception as e:
            logger.error("Strategy switch task failed: %s", e)

    def _check_cron_match(
        self, cron_expr: str, hour: int, minute: int, weekday: int
    ) -> bool:
        try:
            parts = cron_expr.split()
            if len(parts) < 5:
                return False

            cron_minute, cron_hour, cron_day, cron_month, cron_weekday = parts[:5]

            if not self._cron_field_match(cron_minute, minute):
                return False
            if not self._cron_field_match(cron_hour, hour):
                return False

            if cron_weekday != "*":
                if not self._cron_field_match(cron_weekday, weekday + 1):
                    return False

            return True
        except Exception as e:
            logger.warning("Cron parse error for '%s': %s", cron_expr, e)
            return False

    def _cron_field_match(self, cron_field: str, value: int) -> bool:
        if cron_field == "*":
            return True

        if "," in cron_field:
            parts = cron_field.split(",")
            for part in parts:
                if "-" in part:
                    start, end = map(int, part.split("-"))
                    if start <= value <= end:
                        return True
                else:
                    if int(part) == value:
                        return True
            return False

        if "-" in cron_field:
            start, end = map(int, cron_field.split("-"))
            return start <= value <= end

        if "/" in cron_field:
            base, step = cron_field.split("/")
            step = int(step)
            if base == "*":
                return value % step == 0
            return value >= int(base) and (value - int(base)) % step == 0

        return int(cron_field) == value

    async def _concurrency_cleanup_task(self):
        try:
            if self._offline_detector:
                stats = self._offline_detector.get_statistics()
                logger.debug("Offline detector stats: %s", stats)
        except Exception as e:
            logger.error("Concurrency cleanup task failed: %s", e)

    def register_components(
        self, offline_detector=None, strategy_manager=None, message_queue=None
    ):
        self._offline_detector = offline_detector
        self._strategy_manager = strategy_manager
        self._message_queue = message_queue
        logger.info("Registered components in task scheduler")

    async def force_run_task(self, task_id: str):
        if task_id not in self._tasks:
            logger.warning("Task %s not found", task_id)
            return False

        task_info = self._tasks[task_id]
        logger.info("Force running task: %s (%s)", task_id, task_info["name"])
        return True

    async def shutdown(self):
        if self._scheduler and self._scheduler.running:
            self._scheduler.shutdown(wait=False)
        if self._redis_client:
            await self._redis_client.close()
        self._initialized = False
        logger.info("Task scheduler shut down on node %s", self._node_id)