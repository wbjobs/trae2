from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from backend.services.timeseries import (
    query_timeseries,
    get_metric_statistics,
    get_devices,
    get_metrics,
    get_factories,
    insert_metrics_data,
    generate_sample_data
)
from backend.services.auth import get_current_user, check_factory_access
from backend.utils.logger import setup_logger

logger = setup_logger()
router = APIRouter()


class MetricData(BaseModel):
    timestamp: datetime
    device_id: str
    device_type: str
    factory_id: str
    metric_name: str
    metric_value: float
    unit: str
    quality: int = 1
    tags: Dict[str, str] = {}


@router.get("/factories")
async def list_factories(current_user: dict = Depends(get_current_user)):
    factories = get_factories()
    return {"factories": factories}


@router.get("/devices")
async def list_devices(
    factory_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if factory_id and not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    devices = get_devices(factory_id)
    return {"devices": devices}


@router.get("/metrics")
async def list_metrics(
    factory_id: Optional[str] = None,
    device_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if factory_id and not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    metrics = get_metrics(factory_id, device_id)
    return {"metrics": metrics}


@router.post("/query")
async def query_metrics(
    factory_id: str,
    device_ids: Optional[List[str]] = Query(None),
    metric_names: Optional[List[str]] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    aggregation: Optional[str] = Query(None, regex="^(raw|1min|1hour|1day)$"),
    downsample_points: int = Query(1000, ge=100, le=10000),
    page: int = Query(1, ge=1),
    page_size: int = Query(0, ge=0, le=50000),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    if not start_time:
        start_time = datetime.now() - timedelta(days=1)
    if not end_time:
        end_time = datetime.now()
    
    try:
        result = query_timeseries(
            factory_id=factory_id,
            device_ids=device_ids or [],
            metric_names=metric_names or [],
            start_time=start_time,
            end_time=end_time,
            aggregation=aggregation,
            downsample_points=downsample_points,
            page=page,
            page_size=page_size
        )
        return result
    except TimeoutError as e:
        logger.error(f"Query timeout: {e}")
        raise HTTPException(status_code=408, detail=str(e))
    except Exception as e:
        logger.error(f"Query error: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.post("/statistics")
async def get_statistics(
    factory_id: str,
    device_ids: Optional[List[str]] = Body(None),
    metric_names: Optional[List[str]] = Body(None),
    start_time: Optional[datetime] = Body(None),
    end_time: Optional[datetime] = Body(None),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    if not start_time:
        start_time = datetime.now() - timedelta(days=7)
    if not end_time:
        end_time = datetime.now()
    
    try:
        result = get_metric_statistics(
            factory_id=factory_id,
            device_ids=device_ids or [],
            metric_names=metric_names or [],
            start_time=start_time,
            end_time=end_time
        )
        return result
    except Exception as e:
        logger.error(f"Statistics error: {e}")
        raise HTTPException(status_code=500, detail=f"统计失败: {str(e)}")


@router.post("/ingest")
async def ingest_data(
    data: List[MetricData],
    current_user: dict = Depends(get_current_user)
):
    if not current_user.get("permissions") or "write" not in current_user["permissions"]:
        raise HTTPException(status_code=403, detail="没有写入数据的权限")
    
    try:
        data_dicts = [item.model_dump() for item in data]
        result = insert_metrics_data(data_dicts)
        return result
    except Exception as e:
        logger.error(f"Ingest error: {e}")
        raise HTTPException(status_code=500, detail=f"数据写入失败: {str(e)}")


@router.post("/generate-sample")
async def generate_sample(
    factory_id: str,
    device_id: str,
    metric_name: str,
    days: int = Query(7, ge=1, le=365),
    interval_seconds: int = Query(60, ge=1, le=3600),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    if not current_user.get("permissions") or "write" not in current_user["permissions"]:
        raise HTTPException(status_code=403, detail="没有写入数据的权限")
    
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)
        
        sample_data = generate_sample_data(
            factory_id=factory_id,
            device_id=device_id,
            metric_name=metric_name,
            start_time=start_time,
            end_time=end_time,
            interval_seconds=interval_seconds
        )
        
        result = insert_metrics_data(sample_data)
        return {
            "message": "样本数据生成成功",
            "inserted": result["inserted"],
            "time_range": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat()
            }
        }
    except Exception as e:
        logger.error(f"Sample generation error: {e}")
        raise HTTPException(status_code=500, detail=f"样本数据生成失败: {str(e)}")
