from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import pandas as pd
import numpy as np
import json
from datetime import datetime

from data_cleaning import cleaner
from aggregation import aggregator
from aggregation.anomaly_trend import trend_analyzer
from aggregation.drill_down import drill_down_analyzer, DrillDownDimension
from utils.mock_data import mock_data_generator
from utils.cache import query_cache, generate_cache_key

router = APIRouter()


class DrillDownRequest(BaseModel):
    dimension: str
    current_level: Optional[str] = None
    drill_path: Optional[List[Dict]] = None
    filters: Optional[Dict] = None
    hours: int = 24


class TrendAnalysisRequest(BaseModel):
    device_id: str
    metric_name: str
    hours: int = 72
    window: int = 7
    threshold: float = 2.0


class AnomalyDetectionRequest(BaseModel):
    device_id: str
    metric_name: str
    hours: int = 24
    lookback_periods: int = 12
    alert_threshold: float = 2.0


@router.get("/trend-analysis")
async def get_trend_analysis(
    device_id: str = Query(..., description="设备ID"),
    metric_name: str = Query(..., description="指标名称"),
    hours: int = Query(72, ge=12, le=720, description="分析时长（小时）"),
    window: int = Query(7, ge=3, le=30, description="滚动窗口大小"),
    threshold: float = Query(2.0, ge=1.0, le=5.0, description="异常检测阈值")
):
    try:
        cache_key = generate_cache_key(
            "trend_analysis",
            device_id=device_id,
            metric_name=metric_name,
            hours=hours,
            window=window,
            threshold=threshold
        )
        cached = query_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        filtered_df = cleaned_df[
            (cleaned_df['device_id'] == device_id) &
            (cleaned_df['metric_name'] == metric_name)
        ]
        
        if filtered_df.empty:
            return {
                "success": True,
                "device_id": device_id,
                "metric_name": metric_name,
                "has_changes": False,
                "message": "无数据可分析"
            }
        
        trend_result = trend_analyzer.analyze_trend_changes(
            filtered_df,
            value_col='cleaned_value',
            time_col='collect_time',
            window=window,
            threshold=threshold
        )
        
        anomaly_result = trend_analyzer.detect_abnormal_trend(
            filtered_df,
            value_col='cleaned_value',
            time_col='collect_time',
            lookback_periods=min(24, hours),
            alert_threshold=threshold
        )
        
        metric_anomaly = trend_analyzer.analyze_metric_anomaly(
            filtered_df,
            value_col='cleaned_value',
            time_col='collect_time'
        )
        
        result = {
            "success": True,
            "device_id": device_id,
            "metric_name": metric_name,
            "unit": filtered_df['metric_unit'].iloc[0] if 'metric_unit' in filtered_df.columns else '',
            "time_range": {
                "start": str(filtered_df['collect_time'].min()),
                "end": str(filtered_df['collect_time'].max())
            },
            "data_points": len(filtered_df),
            "trend_analysis": trend_result,
            "anomaly_detection": anomaly_result,
            "metric_health": metric_anomaly
        }
        
        query_cache.set(cache_key, result, ttl_seconds=60)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"趋势分析失败: {str(e)}")


@router.get("/trend/changes")
async def get_trend_changes(
    device_id: str = Query(..., description="设备ID"),
    metric_name: str = Query(..., description="指标名称"),
    hours: int = Query(72, ge=12, le=720),
    method: str = Query("rolling_slope", regex="^(cusum|pettitt|rolling_slope)$")
):
    try:
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        filtered_df = cleaned_df[
            (cleaned_df['device_id'] == device_id) &
            (cleaned_df['metric_name'] == metric_name)
        ]
        
        if filtered_df.empty or len(filtered_df) < 20:
            return {"success": True, "change_points": [], "message": "数据不足"}
        
        values = filtered_df['cleaned_value'].values
        times = filtered_df['collect_time'].values
        
        if method == 'cusum':
            change_indices = trend_analyzer._cusum_change_point(values)
        elif method == 'pettitt':
            cp_idx = trend_analyzer._pettitt_test(values)
            change_indices = [cp_idx] if cp_idx > 0 else []
        else:
            change_indices = trend_analyzer._rolling_slope_change(values)
        
        change_points = []
        for idx in change_indices:
            if 0 < idx < len(values) - 1:
                change_points.append({
                    "time": str(times[idx]),
                    "value": float(values[idx]),
                    "before_avg": float(np.mean(values[max(0, idx-10):idx])),
                    "after_avg": float(np.mean(values[idx:min(len(values), idx+10)])),
                    "method": method
                })
        
        return {
            "success": True,
            "method": method,
            "change_points": change_points,
            "total_changes": len(change_points)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"突变点检测失败: {str(e)}")


@router.post("/drill-down")
async def execute_drill_down(request: DrillDownRequest):
    try:
        df = mock_data_generator.generate_metrics_data(request.hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        try:
            dimension = DrillDownDimension(request.dimension)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"无效的维度: {request.dimension}")
        
        result = drill_down_analyzer.drill_down(
            cleaned_df,
            dimension=dimension,
            current_level=request.current_level,
            drill_path=request.drill_path,
            filters=request.filters
        )
        
        summary = drill_down_analyzer.get_drill_down_summary(cleaned_df)
        
        return {
            "success": True,
            "dimension": request.dimension,
            "summary": summary,
            **result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下钻查询失败: {str(e)}")


@router.get("/drill-down/summary")
async def get_drill_down_summary(hours: int = Query(24, ge=1, le=168)):
    try:
        cache_key = generate_cache_key("drill_down_summary", hours=hours)
        cached = query_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        summary = drill_down_analyzer.get_drill_down_summary(cleaned_df)
        
        result = {
            "success": True,
            "summary": summary,
            "available_dimensions": ["time", "device", "metric", "location", "device_type"]
        }
        
        query_cache.set(cache_key, result, ttl_seconds=120)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取下钻摘要失败: {str(e)}")


@router.get("/drill-down/time")
async def time_drill_down(
    hours: int = Query(24, ge=1, le=720),
    current_level: Optional[str] = Query(None, description="当前层级: year/month/week/day/hour/minute/raw"),
    device_ids: Optional[str] = None,
    metric_names: Optional[str] = None
):
    try:
        cache_key = generate_cache_key(
            "time_drill_down",
            hours=hours,
            current_level=current_level or 'none',
            device_ids=device_ids or 'all',
            metric_names=metric_names or 'all'
        )
        cached = query_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        filters = {}
        if device_ids:
            filters['device_ids'] = device_ids.split(',')
        if metric_names:
            filters['metric_names'] = metric_names.split(',')
        
        result = drill_down_analyzer.drill_down(
            cleaned_df,
            dimension=DrillDownDimension.TIME,
            current_level=current_level,
            filters=filters
        )
        
        query_cache.set(cache_key, result, ttl_seconds=60)
        return {"success": True, **result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"时间维度下钻失败: {str(e)}")


@router.get("/drill-down/device")
async def device_drill_down(
    hours: int = Query(24, ge=1, le=168),
    current_level: Optional[str] = Query(None, description="当前层级: all/device_type/location/device/metric"),
    locations: Optional[str] = None,
    device_types: Optional[str] = None
):
    try:
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        filters = {}
        if locations:
            filters['locations'] = locations.split(',')
        if device_types:
            filters['device_types'] = device_types.split(',')
        
        result = drill_down_analyzer.drill_down(
            cleaned_df,
            dimension=DrillDownDimension.DEVICE,
            current_level=current_level,
            filters=filters
        )
        
        return {"success": True, **result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"设备维度下钻失败: {str(e)}")


@router.get("/drill-down/metric")
async def metric_drill_down(
    hours: int = Query(24, ge=1, le=168),
    current_level: Optional[str] = Query(None, description="当前层级: all/metric_category/metric/device/raw"),
    device_ids: Optional[str] = None
):
    try:
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        filters = {}
        if device_ids:
            filters['device_ids'] = device_ids.split(',')
        
        result = drill_down_analyzer.drill_down(
            cleaned_df,
            dimension=DrillDownDimension.METRIC,
            current_level=current_level,
            filters=filters
        )
        
        return {"success": True, **result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"指标维度下钻失败: {str(e)}")


@router.post("/anomaly/detect")
async def detect_anomalies(request: AnomalyDetectionRequest):
    try:
        df = mock_data_generator.generate_metrics_data(request.hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        filtered_df = cleaned_df[
            (cleaned_df['device_id'] == request.device_id) &
            (cleaned_df['metric_name'] == request.metric_name)
        ]
        
        if filtered_df.empty:
            return {"success": True, "is_abnormal": False, "alerts": []}
        
        result = trend_analyzer.detect_abnormal_trend(
            filtered_df,
            value_col='cleaned_value',
            time_col='collect_time',
            lookback_periods=request.lookback_periods,
            alert_threshold=request.alert_threshold
        )
        
        return {
            "success": True,
            "device_id": request.device_id,
            "metric_name": request.metric_name,
            **result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"异常检测失败: {str(e)}")


@router.get("/metrics/health")
async def get_metrics_health(
    hours: int = Query(24, ge=1, le=168),
    device_ids: Optional[str] = None
):
    try:
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        if device_ids:
            cleaned_df = cleaned_df[cleaned_df['device_id'].isin(device_ids.split(','))]
        
        health_scores = []
        
        for (device_id, metric_name), group in cleaned_df.groupby(['device_id', 'metric_name']):
            if len(group) >= 10:
                health = trend_analyzer.analyze_metric_anomaly(
                    group,
                    value_col='cleaned_value',
                    time_col='collect_time'
                )
                health_scores.append({
                    "device_id": device_id,
                    "device_name": group['device_name'].iloc[0],
                    "metric_name": metric_name,
                    "metric_unit": group['metric_unit'].iloc[0] if 'metric_unit' in group.columns else '',
                    **health
                })
        
        health_scores.sort(key=lambda x: x['anomaly_score'], reverse=True)
        
        return {
            "success": True,
            "total_metrics": len(health_scores),
            "critical_count": sum(1 for h in health_scores if h['risk_level'] == 'critical'),
            "high_count": sum(1 for h in health_scores if h['risk_level'] == 'high'),
            "medium_count": sum(1 for h in health_scores if h['risk_level'] == 'medium'),
            "low_count": sum(1 for h in health_scores if h['risk_level'] == 'low'),
            "normal_count": sum(1 for h in health_scores if h['risk_level'] == 'normal'),
            "health_scores": health_scores
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取健康评分失败: {str(e)}")
