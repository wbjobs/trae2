from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from backend.services.cleaning import (
    clean_data,
    get_cleaning_tasks,
    get_data_quality_report,
    create_cleaning_task
)
from backend.services.auth import get_current_user, check_factory_access, check_permission
from backend.utils.logger import setup_logger

logger = setup_logger()
router = APIRouter()


@router.post("/execute")
async def execute_cleaning(
    source_query: str,
    cleaning_rules: List[Dict[str, Any]],
    target_table: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "write"):
        raise HTTPException(status_code=403, detail="没有数据清洗的权限")
    
    try:
        result = clean_data(
            source_query=source_query,
            cleaning_rules=cleaning_rules,
            target_table=target_table
        )
        return result
    except Exception as e:
        logger.error(f"Data cleaning error: {e}")
        raise HTTPException(status_code=500, detail=f"数据清洗失败: {str(e)}")


@router.get("/quality")
async def data_quality(
    factory_id: str,
    device_id: Optional[str] = None,
    metric_name: Optional[str] = None,
    days: int = Query(7, ge=1, le=90),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)
        
        result = get_data_quality_report(
            factory_id=factory_id,
            device_id=device_id,
            metric_name=metric_name,
            start_time=start_time,
            end_time=end_time
        )
        return result
    except Exception as e:
        logger.error(f"Data quality report error: {e}")
        raise HTTPException(status_code=500, detail=f"数据质量报告生成失败: {str(e)}")


@router.get("/tasks")
async def list_cleaning_tasks(
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "read"):
        raise HTTPException(status_code=403, detail="没有查看清洗任务的权限")
    
    try:
        tasks = get_cleaning_tasks(limit=limit)
        return {"tasks": tasks}
    except Exception as e:
        logger.error(f"Get cleaning tasks error: {e}")
        raise HTTPException(status_code=500, detail=f"获取清洗任务列表失败: {str(e)}")


@router.post("/tasks")
async def create_cleaning_task_endpoint(
    task_name: str,
    source_table: str,
    target_table: str,
    cleaning_rules: List[str],
    current_user: dict = Depends(get_current_user)
):
    if not check_permission(current_user, "write"):
        raise HTTPException(status_code=403, detail="没有创建清洗任务的权限")
    
    try:
        result = create_cleaning_task(
            task_name=task_name,
            source_table=source_table,
            target_table=target_table,
            cleaning_rules=cleaning_rules,
            created_by=current_user["username"]
        )
        return result
    except Exception as e:
        logger.error(f"Create cleaning task error: {e}")
        raise HTTPException(status_code=500, detail=f"创建清洗任务失败: {str(e)}")


@router.get("/rules")
async def list_cleaning_rules(
    current_user: dict = Depends(get_current_user)
):
    rules = [
        {
            "name": "remove_duplicates",
            "description": "移除重复数据",
            "params": {"subset": ["timestamp", "device_id", "metric_name"]}
        },
        {
            "name": "handle_missing",
            "description": "处理缺失值",
            "params": {"method": "ffill"}
        },
        {
            "name": "remove_outliers_zscore",
            "description": "Z-score方法移除异常值",
            "params": {"threshold": 3.0}
        },
        {
            "name": "remove_outliers_iqr",
            "description": "IQR方法移除异常值",
            "params": {}
        },
        {
            "name": "smooth_moving_average",
            "description": "移动平均平滑",
            "params": {"window": 5}
        },
        {
            "name": "normalize_minmax",
            "description": "Min-Max归一化",
            "params": {}
        },
        {
            "name": "normalize_standard",
            "description": "标准化处理",
            "params": {}
        },
        {
            "name": "interpolate_linear",
            "description": "线性插值",
            "params": {}
        },
        {
            "name": "filter_quality",
            "description": "按质量过滤（含NaN/Inf清除）",
            "params": {"min_quality": 1, "drop_null_values": True}
        },
        {
            "name": "remove_infinite_values",
            "description": "移除无穷大/无穷小值",
            "params": {}
        },
        {
            "name": "remove_extreme_values",
            "description": "移除极端值（5σ自动检测）",
            "params": {"auto_detect": True, "lower_bound": None, "upper_bound": None}
        },
        {
            "name": "remove_spike_noise",
            "description": "移除毛刺噪声（突变检测）",
            "params": {"threshold": 0.5}
        },
        {
            "name": "fill_grouped_missing",
            "description": "按设备分组填充缺失值",
            "params": {"method": "ffill", "max_gap": None}
        }
    ]
    
    return {"rules": rules}
