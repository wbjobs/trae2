import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.schemas import (
    AlarmQueryRequest,
    AlarmQueryResponse,
    ThresholdConfigRequest,
    ThresholdConfigResponse,
)
from app.models.alarm_models import AlarmRule
from app.constants import (
    ParameterType,
    AlarmLevel,
    AlarmStatus,
    ThresholdCondition,
    ParameterUnit,
)
from app.threshold.threshold_engine import ThresholdEngine
from app.messaging.message_queue import MessageQueue
from app.db.timeseries import TimeSeriesDB
from app.messaging.alert_pusher import AlertPusher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/alarm", tags=["告警管理"])

_threshold_engine = ThresholdEngine()
_alert_pusher = AlertPusher()
_mq = None
_tsdb = None


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


@router.get("/query", response_model=AlarmQueryResponse, summary="查询告警记录")
async def query_alarms(
    device_id: Optional[str] = None,
    pipeline_id: Optional[str] = None,
    alarm_level: Optional[AlarmLevel] = None,
    status: Optional[AlarmStatus] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
    tsdb: TimeSeriesDB = Depends(get_tsdb),
):
    alarms, total = await tsdb.query_alarms(
        device_id=device_id,
        pipeline_id=pipeline_id,
        alarm_level=alarm_level,
        status=status,
        start_time=start_time,
        end_time=end_time,
        page=page,
        page_size=page_size,
    )
    return AlarmQueryResponse(
        total=total,
        page=page,
        page_size=page_size,
        alarms=alarms,
    )


@router.get("/{alarm_id}", summary="查询单个告警详情")
async def get_alarm(
    alarm_id: str,
    tsdb: TimeSeriesDB = Depends(get_tsdb),
):
    alarm = await tsdb.get_alarm_by_id(alarm_id)
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")
    return alarm


@router.put("/{alarm_id}/acknowledge", summary="确认告警")
async def acknowledge_alarm(
    alarm_id: str,
    operator: str = Query(..., description="操作员ID"),
    tsdb: TimeSeriesDB = Depends(get_tsdb),
):
    success = await tsdb.update_alarm_status(
        alarm_id,
        AlarmStatus.ACKNOWLEDGED,
        acknowledged_by=operator,
        acknowledged_at=datetime.now(timezone.utc),
    )
    if not success:
        raise HTTPException(status_code=404, detail="Alarm not found")
    return {"success": True, "message": "Alarm acknowledged"}


@router.put("/{alarm_id}/resolve", summary="解除告警")
async def resolve_alarm(
    alarm_id: str,
    operator: str = Query(..., description="操作员ID"),
    tsdb: TimeSeriesDB = Depends(get_tsdb),
):
    success = await tsdb.update_alarm_status(
        alarm_id,
        AlarmStatus.RESOLVED,
        resolved_at=datetime.now(timezone.utc),
    )
    if not success:
        raise HTTPException(status_code=404, detail="Alarm not found")
    return {"success": True, "message": "Alarm resolved"}


@router.post("/threshold", response_model=ThresholdConfigResponse, summary="配置阈值规则")
async def configure_threshold(
    config: ThresholdConfigRequest,
    pipeline_id: str = Query(..., description="管道ID"),
):
    rule = AlarmRule(
        rule_id=f"custom_{pipeline_id}_{config.param_type.value}_{uuid.uuid4().hex[:8]}",
        param_type=config.param_type,
        alarm_level=config.alarm_level,
        condition=config.condition,
        threshold_value=config.threshold_value,
        unit=config.unit,
        upper_value=config.upper_value,
        duration_seconds=config.duration_seconds,
        enabled=config.enabled,
        description=f"Custom threshold for {pipeline_id}",
    )
    _threshold_engine.add_rule(pipeline_id, rule)
    return ThresholdConfigResponse(
        success=True,
        message="Threshold configured successfully",
        config_id=rule.rule_id,
    )


@router.delete("/threshold/{rule_id}", summary="删除阈值规则")
async def delete_threshold(
    rule_id: str,
    pipeline_id: str = Query(..., description="管道ID"),
):
    success = _threshold_engine.remove_rule(pipeline_id, rule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Threshold rule not found")
    return {"success": True, "message": "Threshold rule removed"}


@router.get("/threshold/list", summary="查询阈值规则列表")
async def list_thresholds(
    pipeline_id: Optional[str] = Query(None, description="管道ID"),
):
    rules = _threshold_engine.get_rules(pipeline_id)
    return {
        "success": True,
        "data": rules,
        "statistics": _threshold_engine.get_statistics(),
    }


@router.get("/stats/summary", summary="告警统计概览")
async def alarm_summary(
    tsdb: TimeSeriesDB = Depends(get_tsdb),
):
    stats = await tsdb.get_alarm_statistics()
    return {"success": True, "data": stats}