import sys
import json
import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import FastAPI, Request, Response, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.collection import router as collection_router
from app.routes.alarm import router as alarm_router
from app.routes.monitor import router as monitor_router
from app.middleware.rate_limiter import RateLimiter
from app.middleware.auth import AuthMiddleware
from app.cluster.node_manager import NodeManager
from app.cluster.load_balancer import LoadBalancer
from app.scheduler.task_scheduler import TaskScheduler
from app.db.redis_client import RedisClient
from app.messaging.message_queue import MessageQueue
from app.messaging.alert_pusher import AlertPusher
from app.threshold.threshold_engine import ThresholdEngine
from app.threshold.business_engine import BusinessEvaluationEngine
from app.validators.param_validator import ParameterValidator
from app.validators.validation_pipeline import ValidationPipeline
from app.monitoring.offline_detector import OfflineDetector
from app.monitoring.strategy_manager import StrategyManager
from app.core.concurrency import ConcurrencyManager

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("app.main")

rate_limiter = RateLimiter()
auth_middleware = AuthMiddleware()
node_manager = NodeManager()
load_balancer = LoadBalancer()
task_scheduler = TaskScheduler()
redis_client = RedisClient()
alert_pusher = AlertPusher()
threshold_engine = ThresholdEngine()
business_engine = BusinessEvaluationEngine()
param_validator = ParameterValidator()
validation_pipeline = ValidationPipeline()
message_queue = MessageQueue()
offline_detector = OfflineDetector()
strategy_manager = StrategyManager()
concurrency_manager = ConcurrencyManager()

_consume_task: asyncio.Task = None
_heartbeat_task: asyncio.Task = None


async def _consume_and_push_loop():
    logger.info("Starting alarm consume and push loop")
    while True:
        try:
            alarms = await message_queue.consume_alarms(count=20, block_ms=2000)
            if alarms:
                message_ids = []
                for alarm_data in alarms:
                    try:
                        from app.models.alarm_models import AlarmEvent
                        from app.constants import (
                            ParameterType,
                            AlarmLevel,
                            ThresholdCondition,
                            ParameterUnit,
                            AlarmStatus,
                        )

                        alarm = AlarmEvent(
                            alarm_id=alarm_data.get("alarm_id", ""),
                            device_id=alarm_data.get("device_id", ""),
                            pipeline_id=alarm_data.get("pipeline_id", ""),
                            param_type=ParameterType(alarm_data.get("param_type", "potential")),
                            alarm_level=AlarmLevel(alarm_data.get("alarm_level", 0)),
                            condition=ThresholdCondition(alarm_data.get("condition", "above")),
                            threshold_value=float(alarm_data.get("threshold_value", 0)),
                            actual_value=float(alarm_data.get("actual_value", 0)),
                            unit=ParameterUnit(alarm_data.get("unit", "mV")),
                            timestamp=datetime.fromisoformat(alarm_data.get("timestamp", datetime.now(timezone.utc).isoformat())),
                            status=AlarmStatus(alarm_data.get("status", "pending")),
                            message=alarm_data.get("message", ""),
                            metadata=alarm_data.get("metadata", {}),
                        )

                        result = await alert_pusher.push_alarm(alarm)
                        push_status = result.get("status", "unknown")
                        logger.info(
                            "Alarm %s push result: %s (channels: %d/%d)",
                            alarm.alarm_id,
                            push_status,
                            result.get("success_count", 0),
                            result.get("total_count", 0),
                        )

                        if alarm_data.get("_message_id"):
                            message_ids.append(alarm_data["_message_id"])

                    except Exception as e:
                        logger.error(
                            "Failed to process alarm %s: %s",
                            alarm_data.get("alarm_id", "unknown"),
                            e,
                        )
                        if alarm_data.get("_message_id"):
                            message_ids.append(alarm_data["_message_id"])

                if message_ids:
                    await message_queue.acknowledge(message_ids)

            await message_queue.process_pending_messages(max_idle_ms=60000)

        except asyncio.CancelledError:
            logger.info("Alarm consume loop cancelled")
            break
        except Exception as e:
            logger.error("Error in consume loop: %s", e)
            await asyncio.sleep(5)


async def _heartbeat_update_loop():
    logger.info("Starting monitor point heartbeat loop")
    while True:
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            logger.info("Heartbeat loop cancelled")
            break
        except Exception as e:
            logger.error("Error in heartbeat loop: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consume_task, _heartbeat_task

    logger.info("Starting CP Monitor API Cluster - Node %s", settings.NODE_ID)

    try:
        await redis_client.connect()
        logger.info("Redis client initialized")
    except Exception as e:
        logger.warning("Redis not available: %s", e)

    try:
        await concurrency_manager.initialize()
        await concurrency_manager.create_connection_pool(
            name="redis_operations",
            max_size=20,
            min_idle=5,
        )
        logger.info("Concurrency manager initialized")
    except Exception as e:
        logger.warning("Concurrency manager init failed: %s", e)

    try:
        validation_pipeline = ValidationPipeline(redis_client._client)
        validation_pipeline.set_node_id(settings.NODE_ID)
        logger.info("Validation pipeline initialized")
    except Exception as e:
        logger.warning("Validation pipeline init failed: %s", e)

    try:
        await node_manager.initialize()
        await node_manager.register_node(
            host=settings.HOST, port=settings.PORT
        )
        logger.info("Node registered in cluster")
    except Exception as e:
        logger.warning("Node manager init failed: %s", e)

    try:
        await message_queue.connect()
        logger.info("Message queue initialized")
    except Exception as e:
        logger.warning("Message queue not available: %s", e)

    try:
        await offline_detector.initialize(redis_client._client)

        from app.routes.collection import set_offline_detector as set_collection_offline
        set_collection_offline(offline_detector)

        logger.info("Offline detector initialized")
    except Exception as e:
        logger.warning("Offline detector init failed: %s", e)

    try:
        strategy_manager._threshold_engine = business_engine
        await strategy_manager.initialize(redis_client._client)

        from app.routes.monitor import set_offline_detector, set_strategy_manager
        set_offline_detector(offline_detector)
        set_strategy_manager(strategy_manager)

        logger.info("Strategy manager initialized")
    except Exception as e:
        logger.warning("Strategy manager init failed: %s", e)

    try:
        await task_scheduler.initialize()
        task_scheduler.register_components(
            offline_detector=offline_detector,
            strategy_manager=strategy_manager,
            message_queue=message_queue,
        )
        logger.info("Task scheduler started")
    except Exception as e:
        logger.warning("Scheduler init failed: %s", e)

    try:
        _consume_task = asyncio.create_task(_consume_and_push_loop())
        logger.info("Alarm consume and push loop started")
    except Exception as e:
        logger.warning("Failed to start consume loop: %s", e)

    try:
        _heartbeat_task = asyncio.create_task(_heartbeat_update_loop())
        logger.info("Heartbeat update loop started")
    except Exception as e:
        logger.warning("Failed to start heartbeat loop: %s", e)

    logger.info(
        "CP Monitor API Cluster started - Node %s on %s:%d",
        settings.NODE_ID,
        settings.HOST,
        settings.PORT,
    )

    yield

    logger.info("Shutting down CP Monitor API Cluster...")

    if _consume_task and not _consume_task.done():
        _consume_task.cancel()
        try:
            await _consume_task
        except asyncio.CancelledError:
            pass

    if _heartbeat_task and not _heartbeat_task.done():
        _heartbeat_task.cancel()
        try:
            await _heartbeat_task
        except asyncio.CancelledError:
            pass

    try:
        await task_scheduler.shutdown()
        await node_manager.close()
        await message_queue.close()
        await alert_pusher.close()
        await redis_client.close()
    except Exception as e:
        logger.error("Error during shutdown: %s", e)

    logger.info("CP Monitor API Cluster shut down complete")


app = FastAPI(
    title="油气管道阴极保护参数采集与阈值告警 API 服务集群",
    description="接收野外监测终端传回的电位、电流参数，实现数据校验、多级阈值判定、告警消息分级推送、集群负载均衡调度",
    version="1.2.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path in ["/docs", "/openapi.json", "/redoc", "/api/v1/monitor/health"]:
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    device_id = request.headers.get("X-Device-ID", client_ip)

    allowed, current, limit, retry_after = await rate_limiter.is_allowed_async(
        f"{client_ip}:{device_id}"
    )

    if not allowed:
        return Response(
            content=json.dumps({
                "detail": "Rate limit exceeded",
                "retry_after": retry_after,
            }, ensure_ascii=False),
            status_code=429,
            headers={
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "Retry-After": str(int(retry_after)),
            },
        )

    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(limit - current)
    response.headers["X-Node-ID"] = settings.NODE_ID
    return response


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    import time

    start = time.time()
    response = await call_next(request)
    duration = time.time() - start

    if redis_client._connected:
        try:
            await redis_client.set_cache(
                f"cp:metrics:{settings.NODE_ID}:last_request_time",
                duration,
                ttl=60,
            )
        except Exception:
            pass

    response.headers["X-Response-Time"] = f"{duration:.3f}s"
    return response


@app.get("/", summary="API 首页")
async def root():
    offline_stats = offline_detector.get_statistics()
    strategy_stats = strategy_manager.get_statistics()
    concurrency_stats = concurrency_manager.get_all_stats()

    return {
        "service": "油气管道阴极保护参数采集与阈值告警 API 服务集群",
        "version": "1.2.0",
        "node_id": settings.NODE_ID,
        "cluster": settings.CLUSTER_NAME,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "endpoints": {
            "data_collection": {
                "submit": "POST /api/v1/collect",
                "batch_submit": "POST /api/v1/collect/batch",
            },
            "alarm_management": {
                "query": "GET /api/v1/alarm/query",
                "detail": "GET /api/v1/alarm/{alarm_id}",
                "acknowledge": "PUT /api/v1/alarm/{alarm_id}/acknowledge",
                "resolve": "PUT /api/v1/alarm/{alarm_id}/resolve",
                "threshold_config": "POST /api/v1/alarm/threshold",
                "threshold_list": "GET /api/v1/alarm/threshold/list",
                "statistics": "GET /api/v1/alarm/stats/summary",
                "strategies": "GET /api/v1/monitor/strategies",
            },
            "cluster_monitoring": {
                "health": "GET /api/v1/monitor/health",
                "cluster_status": "GET /api/v1/monitor/cluster/status",
                "nodes": "GET /api/v1/monitor/cluster/nodes",
                "metrics": "GET /api/v1/monitor/metrics",
                "offline_status": "GET /api/v1/monitor/offline/status",
                "offline_points": "GET /api/v1/monitor/offline/points",
            },
        },
        "monitoring": {
            "offline_detection": {
                "total_points": offline_stats.get("total_monitor_points", 0),
                "online": offline_stats.get("online", 0),
                "offline": offline_stats.get("offline", 0),
                "offline_rate": offline_stats.get("offline_rate", 0),
            },
            "strategy_management": {
                "total_strategies": strategy_stats.get("total_strategies", 0),
                "total_schedules": strategy_stats.get("total_schedules", 0),
                "enabled_schedules": strategy_stats.get("enabled_schedules", 0),
            },
        },
        "concurrency": {
            "circuit_breakers": len(concurrency_stats.get("circuit_breakers", {})),
            "connection_pools": len(concurrency_stats.get("connection_pools", {})),
            "semaphores": len(concurrency_stats.get("semaphores", {})),
        },
        "features": {
            "idempotency": "Supported via X-Request-ID header or auto-generated",
            "duplicate_prevention": "Alarm dedup via alarm_id + cooldown",
            "reliable_messaging": "Redis Stream with DLQ + retry",
            "distributed_scheduling": "APScheduler + Redis distributed lock",
            "data_consistency": "Write ack + validation + integrity check",
            "offline_detection": "Monitor point heartbeat tracking + auto-alert",
            "strategy_switch": "Scheduled threshold strategy switching",
            "hybrid_rate_limit": "Token bucket + sliding window rate limiting",
            "validation_pipeline": "Decoupled validation with multiple phases",
            "circuit_breaker": "Automatic failure detection and recovery",
            "connection_pooling": "Resource pooling for external services",
        },
    }


app.include_router(collection_router)
app.include_router(alarm_router)
app.include_router(monitor_router)