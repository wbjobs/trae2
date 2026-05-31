from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import pandas as pd
from datetime import datetime, timedelta

from data_cleaning import cleaner
from aggregation import aggregator
from utils.mock_data import mock_data_generator
from utils.cache import dashboard_cache, generate_cache_key

router = APIRouter()


@router.get("/overview")
async def get_dashboard_overview(hours: int = Query(24, ge=1, le=168)):
    try:
        cache_key = generate_cache_key("dashboard_overview", hours=hours)
        cached = dashboard_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        aggregated_df = aggregator.aggregate_metrics(cleaned_df, 'hour')
        
        total_devices = cleaned_df['device_id'].nunique()
        total_metrics = cleaned_df['metric_name'].nunique()
        total_records = len(cleaned_df)
        anomaly_count = int(cleaned_df['is_outlier'].sum())
        anomaly_rate = round(anomaly_count / total_records * 100, 2)
        
        active_devices = total_devices
        warning_devices = len(cleaned_df[cleaned_df['is_outlier']]['device_id'].unique())
        
        metrics_distribution = {}
        for metric_name, group in cleaned_df.groupby('metric_name'):
            metrics_distribution[metric_name] = {
                'avg': float(group['cleaned_value'].mean()),
                'min': float(group['cleaned_value'].min()),
                'max': float(group['cleaned_value'].max())
            }
        
        return {
            "success": True,
            "overview": {
                "total_devices": total_devices,
                "total_metrics": total_metrics,
                "total_records": total_records,
                "anomaly_count": anomaly_count,
                "anomaly_rate": anomaly_rate,
                "active_devices": active_devices,
                "warning_devices": int(warning_devices),
                "time_range": {
                    "start": str(cleaned_df['collect_time'].min()),
                    "end": str(cleaned_df['collect_time'].max())
                }
            },
            "metrics_distribution": metrics_distribution
        }
        dashboard_cache.set(cache_key, result, ttl_seconds=30)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取概览数据失败: {str(e)}")


@router.get("/device-status")
async def get_device_status(hours: int = Query(24, ge=1, le=168)):
    try:
        cache_key = generate_cache_key("device_status", hours=hours)
        cached = dashboard_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        device_status = []
        for device_id, group in cleaned_df.groupby('device_id'):
            device_info = group.iloc[0]
            anomaly_count = int(group['is_outlier'].sum())
            
            status = 'normal'
            if anomaly_count > 10:
                status = 'critical'
            elif anomaly_count > 5:
                status = 'warning'
            
            device_status.append({
                "device_id": device_id,
                "device_name": device_info['device_name'],
                "device_type": device_info['device_type'],
                "location": device_info['location'],
                "status": status,
                "anomaly_count": anomaly_count,
                "record_count": len(group),
                "last_update": str(group['collect_time'].max())
            })
        
        result = {
            "success": True,
            "devices": device_status
        }
        dashboard_cache.set(cache_key, result, ttl_seconds=30)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取设备状态失败: {str(e)}")


@router.get("/metric-trend")
async def get_metric_trend(
    device_id: str,
    metric_name: str,
    hours: int = Query(24, ge=1, le=168),
    period: str = Query("hour", regex="^(min|h|D|W)$")
):
    try:
        cache_key = generate_cache_key("metric_trend", device_id=device_id, metric_name=metric_name, hours=hours, period=period)
        cached = dashboard_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        filtered_df = cleaned_df[
            (cleaned_df['device_id'] == device_id) &
            (cleaned_df['metric_name'] == metric_name)
        ]
        
        if filtered_df.empty:
            return {"success": True, "trend_data": [], "stats": {}}
        
        agg_df = filtered_df.groupby(pd.Grouper(key='collect_time', freq=period))['cleaned_value'].agg([
            'mean', 'max', 'min', 'std', 'count'
        ]).reset_index()
        
        trend_data = []
        for _, row in agg_df.iterrows():
            trend_data.append({
                "time": str(row['collect_time']),
                "avg": float(row['mean']),
                "max": float(row['max']),
                "min": float(row['min']),
                "std": float(row['std'])
            })
        
        stats = {
            "current_value": float(filtered_df['cleaned_value'].iloc[-1]),
            "avg_value": float(filtered_df['cleaned_value'].mean()),
            "max_value": float(filtered_df['cleaned_value'].max()),
            "min_value": float(filtered_df['cleaned_value'].min()),
            "anomaly_count": int(filtered_df['is_outlier'].sum())
        }
        
        result = {
            "success": True,
            "device_id": device_id,
            "metric_name": metric_name,
            "unit": filtered_df['metric_unit'].iloc[0],
            "trend_data": trend_data,
            "stats": stats
        }
        dashboard_cache.set(cache_key, result, ttl_seconds=30)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取指标趋势失败: {str(e)}")


@router.get("/anomaly-alerts")
async def get_anomaly_alerts(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(50, ge=10, le=200)
):
    try:
        cache_key = generate_cache_key("anomaly_alerts", hours=hours, limit=limit)
        cached = dashboard_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        anomaly_df = cleaned_df[cleaned_df['is_outlier']].head(limit)
        
        alerts = []
        for _, row in anomaly_df.iterrows():
            alerts.append({
                "id": f"alert_{len(alerts)}",
                "device_id": row['device_id'],
                "device_name": row['device_name'],
                "metric_name": row['metric_name'],
                "metric_value": float(row['metric_value']),
                "cleaned_value": float(row['cleaned_value']),
                "unit": row['metric_unit'],
                "time": str(row['collect_time']),
                "reason": row['outlier_reason'],
                "level": "high" if abs(row['metric_value'] - row['cleaned_value']) > row['cleaned_value'] * 0.5 else "medium"
            })
        
        result = {
            "success": True,
            "total": len(alerts),
            "alerts": alerts
        }
        dashboard_cache.set(cache_key, result, ttl_seconds=15)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取异常告警失败: {str(e)}")


@router.get("/realtime")
async def get_realtime_data(device_ids: Optional[str] = None):
    try:
        cache_key = generate_cache_key("realtime_data", device_ids=device_ids or "all")
        cached = dashboard_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours=1, interval_minutes=1)
        
        if device_ids:
            device_list = device_ids.split(',')
            df = df[df['device_id'].isin(device_list)]
        
        latest_df = df.sort_values('collect_time').groupby(['device_id', 'metric_name']).last().reset_index()
        
        realtime_data = []
        for _, row in latest_df.iterrows():
            realtime_data.append({
                "device_id": row['device_id'],
                "device_name": row['device_name'],
                "metric_name": row['metric_name'],
                "value": float(row['metric_value']),
                "unit": row['metric_unit'],
                "time": str(row['collect_time']),
                "status": "normal"
            })
        
        result = {
            "success": True,
            "update_time": datetime.now().isoformat(),
            "data": realtime_data
        }
        dashboard_cache.set(cache_key, result, ttl_seconds=5)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实时数据失败: {str(e)}")


@router.get("/comparison")
async def get_device_comparison(
    metric_name: str,
    hours: int = Query(24, ge=1, le=168)
):
    try:
        cache_key = generate_cache_key("device_comparison", metric_name=metric_name, hours=hours)
        cached = dashboard_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        metric_df = cleaned_df[cleaned_df['metric_name'] == metric_name]
        
        if metric_df.empty:
            return {"success": True, "comparison_data": []}
        
        comparison_data = []
        for device_id, group in metric_df.groupby('device_id'):
            comparison_data.append({
                "device_id": device_id,
                "device_name": group['device_name'].iloc[0],
                "avg": float(group['cleaned_value'].mean()),
                "max": float(group['cleaned_value'].max()),
                "min": float(group['cleaned_value'].min()),
                "std": float(group['cleaned_value'].std()),
                "anomaly_count": int(group['is_outlier'].sum())
            })
        
        comparison_data.sort(key=lambda x: x['avg'], reverse=True)
        
        result = {
            "success": True,
            "metric_name": metric_name,
            "unit": metric_df['metric_unit'].iloc[0],
            "comparison_data": comparison_data
        }
        dashboard_cache.set(cache_key, result, ttl_seconds=30)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取设备对比数据失败: {str(e)}")
