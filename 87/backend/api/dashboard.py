from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timedelta
from typing import Optional

from backend.services.reports import get_dashboard_overview
from backend.services.timeseries import query_timeseries
from backend.services.auth import get_current_user, check_factory_access
from backend.utils.logger import setup_logger

logger = setup_logger()
router = APIRouter()


@router.get("/overview")
async def dashboard_overview(
    factory_id: str,
    days: int = Query(7, ge=1, le=90),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)
        
        result = get_dashboard_overview(
            factory_id=factory_id,
            start_time=start_time,
            end_time=end_time
        )
        return result
    except Exception as e:
        logger.error(f"Dashboard overview error: {e}")
        raise HTTPException(status_code=500, detail=f"获取概览数据失败: {str(e)}")


@router.get("/trends")
async def dashboard_trends(
    factory_id: str,
    device_ids: Optional[str] = Query(None),
    metric_names: Optional[str] = Query(None),
    hours: int = Query(24, ge=1, le=168),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=hours)
        
        device_id_list = device_ids.split(",") if device_ids else []
        metric_name_list = metric_names.split(",") if metric_names else []
        
        result = query_timeseries(
            factory_id=factory_id,
            device_ids=device_id_list,
            metric_names=metric_name_list,
            start_time=start_time,
            end_time=end_time,
            downsample_points=500
        )
        return result
    except Exception as e:
        logger.error(f"Dashboard trends error: {e}")
        raise HTTPException(status_code=500, detail=f"获取趋势数据失败: {str(e)}")


@router.get("/realtime")
async def dashboard_realtime(
    factory_id: str,
    device_ids: Optional[str] = Query(None),
    metric_names: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(minutes=10)
        
        device_id_list = device_ids.split(",") if device_ids else []
        metric_name_list = metric_names.split(",") if metric_names else []
        
        result = query_timeseries(
            factory_id=factory_id,
            device_ids=device_id_list,
            metric_names=metric_name_list,
            start_time=start_time,
            end_time=end_time,
            aggregation="raw"
        )
        return result
    except Exception as e:
        logger.error(f"Dashboard realtime error: {e}")
        raise HTTPException(status_code=500, detail=f"获取实时数据失败: {str(e)}")
