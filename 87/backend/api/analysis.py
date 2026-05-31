from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from backend.services.analysis import (
    query_yoy_mom_analysis,
    get_multi_period_comparison,
    get_threshold_config,
    save_threshold_config,
    delete_threshold_config,
    detect_threshold_violations,
    get_alert_analysis,
    get_alert_records,
    acknowledge_alert,
    resolve_alert,
    get_dashboard_layout,
    save_dashboard_layout,
    delete_dashboard_layout
)
from backend.services.auth import get_current_user, check_factory_access, check_permission
from backend.utils.logger import setup_logger

logger = setup_logger()
router = APIRouter()


class ThresholdConfig(BaseModel):
    factory_id: str
    device_id: Optional[str] = ""
    metric_name: str
    threshold_type: str = "range"
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    warning_value: Optional[float] = None
    critical_value: Optional[float] = None
    severity: str = "warning"
    enabled: bool = True
    notification_channels: List[str] = []
    duration_threshold: int = 60


class LayoutConfig(BaseModel):
    layout_id: Optional[str] = None
    layout_name: str = "自定义布局"
    factory_id: Optional[str] = ""
    layout_type: str = "dashboard"
    layout_config: Dict[str, Any]
    is_default: bool = False
    is_public: bool = False


@router.get("/comparison/yoy-mom")
async def get_yoy_mom_analysis(
    factory_id: str,
    device_ids: Optional[str] = Query(None),
    metric_names: Optional[str] = Query(None),
    compare_type: str = Query("mom", regex="^(yoy|qoq|mom|wow|dod)$"),
    period_type: str = Query("day", regex="^(day|week|month)$"),
    metric_type: str = Query("avg_value", regex="^(avg_value|sum_value|max_value|min_value)$"),
    periods: int = Query(12, ge=1, le=60),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")

    device_id_list = device_ids.split(",") if device_ids else []
    metric_name_list = metric_names.split(",") if metric_names else []

    try:
        result = query_yoy_mom_analysis(
            factory_id=factory_id,
            device_ids=device_id_list,
            metric_names=metric_name_list,
            compare_type=compare_type,
            period_type=period_type,
            metric_type=metric_type,
            periods=periods
        )
        return result
    except Exception as e:
        logger.error(f"YoY/MoM analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"同比环比分析失败: {str(e)}")


@router.get("/comparison/multi-period")
async def get_multi_period(
    factory_id: str,
    device_ids: Optional[str] = Query(None),
    metric_names: Optional[str] = Query(None),
    metric_type: str = Query("avg_value", regex="^(avg_value|sum_value|max_value|min_value)$"),
    periods: int = Query(6, ge=1, le=24),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")

    device_id_list = device_ids.split(",") if device_ids else []
    metric_name_list = metric_names.split(",") if metric_names else []

    try:
        result = get_multi_period_comparison(
            factory_id=factory_id,
            device_ids=device_id_list,
            metric_names=metric_name_list,
            metric_type=metric_type,
            periods=periods
        )
        return result
    except Exception as e:
        logger.error(f"Multi-period comparison error: {e}")
        raise HTTPException(status_code=500, detail=f"多周期对比分析失败: {str(e)}")


@router.get("/thresholds")
async def list_thresholds(
    factory_id: str,
    device_id: Optional[str] = None,
    metric_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")

    try:
        result = get_threshold_config(
            factory_id=factory_id,
            device_id=device_id,
            metric_name=metric_name
        )
        return {"thresholds": result}
    except Exception as e:
        logger.error(f"List thresholds error: {e}")
        raise HTTPException(status_code=500, detail=f"获取阈值配置失败: {str(e)}")


@router.post("/thresholds")
async def create_threshold(
    config: ThresholdConfig,
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, config.factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")

    if not check_permission(current_user, "write"):
        raise HTTPException(status_code=403, detail="没有配置阈值的权限")

    try:
        result = save_threshold_config(
            config=config.model_dump(),
            created_by=current_user["username"]
        )
        return result
    except Exception as e:
        logger.error(f"Create threshold error: {e}")
        raise HTTPException(status_code=500, detail=f"保存阈值配置失败: {str(e)}")


@router.delete("/thresholds/{threshold_id}")
async def remove_threshold(
    threshold_id: str,
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "write"):
        raise HTTPException(status_code=403, detail="没有删除阈值配置的权限")

    try:
        result = delete_threshold_config(threshold_id)
        return result
    except Exception as e:
        logger.error(f"Delete threshold error: {e}")
        raise HTTPException(status_code=500, detail=f"删除阈值配置失败: {str(e)}")


@router.get("/thresholds/detect")
async def detect_alerts(
    factory_id: str,
    lookback_minutes: int = Query(5, ge=1, le=60),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")

    try:
        violations = detect_threshold_violations(
            factory_id=factory_id,
            lookback_minutes=lookback_minutes
        )
        return {"violations": violations, "detected_at": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Detect alerts error: {e}")
        raise HTTPException(status_code=500, detail=f"阈值检测失败: {str(e)}")


@router.get("/alerts/summary")
async def get_alert_summary(
    factory_id: str,
    metric_names: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")

    end_time = datetime.now()
    start_time = end_time - timedelta(days=days)
    metric_name_list = metric_names.split(",") if metric_names else None

    try:
        result = get_alert_analysis(
            factory_id=factory_id,
            metric_names=metric_name_list,
            start_time=start_time,
            end_time=end_time
        )
        return result
    except Exception as e:
        logger.error(f"Alert summary error: {e}")
        raise HTTPException(status_code=500, detail=f"获取告警统计失败: {str(e)}")


@router.get("/alerts/records")
async def list_alert_records(
    factory_id: str,
    status: Optional[str] = Query(None, regex="^(active|acknowledged|resolved)$"),
    severity: Optional[str] = Query(None, regex="^(info|warning|critical)$"),
    days: int = Query(7, ge=1, le=365),
    limit: int = Query(100, ge=1, le=1000),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")

    end_time = datetime.now()
    start_time = end_time - timedelta(days=days)

    try:
        records = get_alert_records(
            factory_id=factory_id,
            status=status,
            severity=severity,
            start_time=start_time,
            end_time=end_time,
            limit=limit
        )
        return {"records": records}
    except Exception as e:
        logger.error(f"List alert records error: {e}")
        raise HTTPException(status_code=500, detail=f"获取告警记录失败: {str(e)}")


@router.post("/alerts/{alert_id}/acknowledge")
async def ack_alert(
    alert_id: str,
    notes: Optional[str] = Body(None, embed=True),
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "write"):
        raise HTTPException(status_code=403, detail="没有确认告警的权限")

    try:
        result = acknowledge_alert(
            alert_id=alert_id,
            acknowledged_by=current_user["username"],
            notes=notes
        )
        return result
    except Exception as e:
        logger.error(f"Acknowledge alert error: {e}")
        raise HTTPException(status_code=500, detail=f"确认告警失败: {str(e)}")


@router.post("/alerts/{alert_id}/resolve")
async def res_alert(
    alert_id: str,
    notes: Optional[str] = Body(None, embed=True),
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "write"):
        raise HTTPException(status_code=403, detail="没有解决告警的权限")

    try:
        result = resolve_alert(
            alert_id=alert_id,
            resolved_by=current_user["username"],
            notes=notes
        )
        return result
    except Exception as e:
        logger.error(f"Resolve alert error: {e}")
        raise HTTPException(status_code=500, detail=f"解决告警失败: {str(e)}")


@router.get("/layouts")
async def list_layouts(
    layout_type: str = Query("dashboard", regex="^(dashboard|trend|analysis)$"),
    factory_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    try:
        layouts = get_dashboard_layout(
            user_id=current_user["user_id"],
            layout_type=layout_type,
            factory_id=factory_id
        )
        return {"layouts": layouts}
    except Exception as e:
        logger.error(f"List layouts error: {e}")
        raise HTTPException(status_code=500, detail=f"获取大屏布局失败: {str(e)}")


@router.post("/layouts")
async def create_layout(
    layout: LayoutConfig,
    current_user: dict = Depends(get_current_user)
):
    try:
        result = save_dashboard_layout(
            user_id=current_user["user_id"],
            layout_data=layout.model_dump()
        )
        return result
    except Exception as e:
        logger.error(f"Save layout error: {e}")
        raise HTTPException(status_code=500, detail=f"保存大屏布局失败: {str(e)}")


@router.delete("/layouts/{layout_id}")
async def remove_layout(
    layout_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        result = delete_dashboard_layout(
            user_id=current_user["user_id"],
            layout_id=layout_id
        )
        return result
    except Exception as e:
        logger.error(f"Delete layout error: {e}")
        raise HTTPException(status_code=500, detail=f"删除大屏布局失败: {str(e)}")
