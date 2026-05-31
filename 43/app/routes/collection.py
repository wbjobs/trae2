import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Header

from app.models.schemas import (
    CollectDataRequest,
    CollectDataResponse,
)
from app.models.data_models import PipelineDataPoint
from app.validators.param_validator import ParameterValidator
from app.threshold.threshold_engine import ThresholdEngine
from app.messaging.message_queue import MessageQueue
from app.db.timeseries import TimeSeriesDB
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/collect", tags=["数据采集"])

_validator = ParameterValidator()
_threshold_engine = ThresholdEngine()
_mq = None
_tsdb = None
_redis_client = None
_offline_detector = None


def set_offline_detector(detector):
    global _offline_detector
    _offline_detector = detector

IDEMPOTENCY_KEY_TTL = 300
IDEMPOTENCY_KEY_PREFIX = "cp:idempotency:"


async def get_redis_client():
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis
            redis_kwargs = {
                "max_connections": 50,
                "decode_responses": True,
            }
            if settings.REDIS_PASSWORD:
                redis_kwargs["password"] = settings.REDIS_PASSWORD
            _redis_client = aioredis.from_url(settings.REDIS_URL, **redis_kwargs)
        except Exception as e:
            logger.warning("Redis not available for idempotency: %s", e)
            _redis_client = None
    return _redis_client


async def get_mq() -> MessageQueue:
    global _mq
    if _mq is None:
        _mq = MessageQueue()
        await _mq.connect()
    return _mq


async def get_tsdb() -> TimeSeriesDB:
    global _tsdb
    if _tsdb is None:
        _tsdb = TimeSeriesDB()
        await _tsdb.connect()
    return _tsdb


def _compute_idempotency_key(request: CollectDataRequest) -> str:
    payload = {
        "device_id": request.device_id,
        "pipeline_id": request.pipeline_id,
        "batch_id": request.batch_id,
        "params": sorted(
            (p.param_type.value, p.value, p.timestamp.isoformat())
            for p in request.parameters
        ),
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _check_idempotency(key: str) -> Optional[dict]:
    redis = await get_redis_client()
    if redis is None:
        return None
    try:
        cached = await redis.get(f"{IDEMPOTENCY_KEY_PREFIX}{key}")
        if cached:
            return json.loads(cached)
        return None
    except Exception as e:
        logger.warning("Idempotency check failed: %s", e)
        return None


async def _store_idempotency_result(key: str, result: dict):
    redis = await get_redis_client()
    if redis is None:
        return
    try:
        await redis.setex(
            f"{IDEMPOTENCY_KEY_PREFIX}{key}",
            IDEMPOTENCY_KEY_TTL,
            json.dumps(result, ensure_ascii=False),
        )
    except Exception as e:
        logger.warning("Idempotency store failed: %s", e)


@router.post("", response_model=CollectDataResponse, summary="提交监测数据")
async def collect_data(
    request: CollectDataRequest,
    x_request_id: Optional[str] = Header(None, description="请求唯一ID，用于幂等性"),
    mq: MessageQueue = Depends(get_mq),
    tsdb: TimeSeriesDB = Depends(get_tsdb),
):
    idem_key = x_request_id or _compute_idempotency_key(request)

    cached = await _check_idempotency(idem_key)
    if cached is not None:
        logger.info(
            "Duplicate request detected for device=%s batch=%s, returning cached result",
            request.device_id,
            request.batch_id,
        )
        return CollectDataResponse(
            success=cached.get("success", True),
            message=cached.get("message", "Duplicate request, result from cache"),
            received_count=cached.get("received_count", 0),
            alarms_generated=cached.get("alarms_generated", 0),
            batch_id=request.batch_id,
        )

    ok, errors, points = _validator.validate_collect_request(request)

    if not ok and not points:
        raise HTTPException(
            status_code=400,
            detail={"message": "Data validation failed", "errors": errors},
        )

    if _offline_detector and points:
        _offline_detector.register_heartbeat(
            device_id=request.device_id,
            pipeline_id=request.pipeline_id,
            location=request.location or "",
        )

    alarms = _threshold_engine.evaluate_batch(points)

    if points:
        try:
            await tsdb.write_batch_with_ack(points)
        except Exception as e:
            logger.error("Critical: Failed to write data to InfluxDB: %s", e)
            raise HTTPException(
                status_code=507,
                detail={
                    "message": "Failed to persist data, please retry",
                    "error": str(e),
                },
            )

    alarm_publish_results = []
    if alarms:
        try:
            alarm_publish_results = await mq.publish_alarms_batch_reliable(alarms)
            failed_publishes = [
                r for r in alarm_publish_results if not r.get("success", False)
            ]
            if failed_publishes:
                logger.warning(
                    "Partial alarm publish failure: %d/%d alarms failed",
                    len(failed_publishes),
                    len(alarms),
                )
        except Exception as e:
            logger.error("Critical: Failed to publish alarms: %s", e)

    if errors:
        logger.warning(
            "Partial validation errors for device %s: %s",
            request.device_id,
            errors,
        )

    result_data = {
        "success": len(points) > 0,
        "message": "Data received successfully" if not errors else "Partial data received with warnings",
        "received_count": len(points),
        "alarms_generated": len(alarms),
    }
    await _store_idempotency_result(idem_key, result_data)

    return CollectDataResponse(
        success=result_data["success"],
        message=result_data["message"],
        received_count=result_data["received_count"],
        alarms_generated=result_data["alarms_generated"],
        batch_id=request.batch_id,
    )


@router.post("/batch", response_model=CollectDataResponse, summary="批量提交监测数据")
async def collect_batch(
    requests: List[CollectDataRequest],
    x_batch_id: Optional[str] = Header(None, description="批量请求唯一ID，用于幂等性"),
    mq: MessageQueue = Depends(get_mq),
    tsdb: TimeSeriesDB = Depends(get_tsdb),
):
    if x_batch_id:
        cached = await _check_idempotency(x_batch_id)
        if cached is not None:
            logger.info("Duplicate batch request detected: %s", x_batch_id)
            return CollectDataResponse(
                success=cached.get("success", True),
                message="Duplicate batch request, result from cache",
                received_count=cached.get("received_count", 0),
                alarms_generated=cached.get("alarms_generated", 0),
            )

    success, failed, all_points, all_errors = _validator.batch_validate(requests)

    if not all_points:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "All data validation failed",
                "errors": all_errors,
                "success_count": success,
                "failed_count": failed,
            },
        )

    if _offline_detector:
        seen_devices = set()
        for req in requests:
            device_key = f"{req.pipeline_id}:{req.device_id}"
            if device_key not in seen_devices:
                _offline_detector.register_heartbeat(
                    device_id=req.device_id,
                    pipeline_id=req.pipeline_id,
                    location=req.location or "",
                )
                seen_devices.add(device_key)

    alarms = _threshold_engine.evaluate_batch(all_points)

    if all_points:
        try:
            await tsdb.write_batch_with_ack(all_points)
        except Exception as e:
            logger.error("Critical: Failed to batch write to InfluxDB: %s", e)
            raise HTTPException(
                status_code=507,
                detail={
                    "message": "Failed to persist batch data, please retry",
                    "error": str(e),
                },
            )

    if alarms:
        try:
            await mq.publish_alarms_batch_reliable(alarms)
        except Exception as e:
            logger.error("Critical: Failed to publish batch alarms: %s", e)

    result_data = {
        "success": True,
        "message": f"Batch processed: {success} success, {failed} failed",
        "received_count": len(all_points),
        "alarms_generated": len(alarms),
    }

    if x_batch_id:
        await _store_idempotency_result(x_batch_id, result_data)

    return CollectDataResponse(**result_data)