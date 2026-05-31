from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
import numpy as np
from datetime import datetime
import asyncio

from data_cleaning import cleaner
from aggregation import aggregator
from utils.mock_data import mock_data_generator
from utils.cache import query_cache, generate_cache_key
from auth.permission import permission_manager

router = APIRouter()


class DataCleaningRequest(BaseModel):
    data: list
    config: Optional[dict] = None


class AggregationRequest(BaseModel):
    period: str = "hour"
    data: list


@router.get("/devices")
async def get_devices():
    cache_key = generate_cache_key("devices")
    cached = query_cache.get(cache_key)
    if cached:
        return cached
    
    result = {"devices": mock_data_generator.get_devices_list()}
    query_cache.set(cache_key, result, ttl_seconds=300)
    return result


@router.get("/metrics")
async def get_metrics():
    cache_key = generate_cache_key("metrics")
    cached = query_cache.get(cache_key)
    if cached:
        return cached
    
    result = {"metrics": mock_data_generator.get_metrics_list()}
    query_cache.set(cache_key, result, ttl_seconds=300)
    return result


@router.post("/clean")
async def clean_data(request: DataCleaningRequest):
    try:
        df = pd.DataFrame(request.data)
        
        if len(df) > 50000:
            chunk_size = 10000
            chunks = [df[i:i+chunk_size] for i in range(0, len(df), chunk_size)]
            
            cleaned_chunks = []
            for chunk in chunks:
                cleaned_chunk = cleaner.clean_data(chunk, request.config)
                cleaned_chunks.append(cleaned_chunk)
            
            cleaned_df = pd.concat(cleaned_chunks, ignore_index=True)
        else:
            cleaned_df = cleaner.clean_data(df, request.config)
        
        quality_report = cleaner.get_data_quality_report(cleaned_df)
        
        return {
            "success": True,
            "original_count": len(df),
            "cleaned_count": len(cleaned_df),
            "quality_report": quality_report,
            "data": cleaned_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据清洗失败: {str(e)}")


@router.post("/aggregate")
async def aggregate_data(request: AggregationRequest):
    try:
        df = pd.DataFrame(request.data)
        
        if len(df) > 100000:
            chunk_size = 20000
            chunks = [df[i:i+chunk_size] for i in range(0, len(df), chunk_size)]
            
            aggregated_chunks = []
            for chunk in chunks:
                agg_chunk = aggregator.aggregate_metrics(chunk, request.period)
                aggregated_chunks.append(agg_chunk)
            
            aggregated_df = pd.concat(aggregated_chunks, ignore_index=True)
        else:
            aggregated_df = aggregator.aggregate_metrics(df, request.period)
        
        dashboard_stats = aggregator.get_dashboard_stats(aggregated_df)
        
        return {
            "success": True,
            "original_count": len(df),
            "aggregated_count": len(aggregated_df),
            "period": request.period,
            "stats": dashboard_stats,
            "data": aggregated_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据聚合失败: {str(e)}")


@router.get("/sample")
async def get_sample_data(
    hours: int = Query(24, ge=1, le=168),
    interval_minutes: int = Query(5, ge=1, le=60),
    page: int = Query(1, ge=1),
    page_size: int = Query(1000, ge=100, le=10000)
):
    try:
        cache_key = generate_cache_key("sample_data", hours=hours, interval=interval_minutes)
        cached_df = query_cache.get(cache_key)
        
        if cached_df is None:
            df = mock_data_generator.generate_metrics_data(hours, interval_minutes)
            query_cache.set(cache_key, df, ttl_seconds=120)
        else:
            df = cached_df
        
        total = len(df)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_df = df.iloc[start_idx:end_idx]
        
        return {
            "success": True,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "count": len(paginated_df),
            "data": paginated_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成模拟数据失败: {str(e)}")


@router.get("/sample/cleaned")
async def get_cleaned_sample(
    hours: int = Query(24, ge=1, le=72),
    interval_minutes: int = Query(5, ge=1, le=60),
    page: int = Query(1, ge=1),
    page_size: int = Query(1000, ge=100, le=5000)
):
    try:
        cache_key = generate_cache_key("cleaned_sample", hours=hours, interval=interval_minutes)
        cached_df = query_cache.get(cache_key)
        
        if cached_df is None:
            df = mock_data_generator.generate_metrics_data(hours, interval_minutes)
            cleaned_df = cleaner.clean_data(df)
            query_cache.set(cache_key, cleaned_df, ttl_seconds=180)
        else:
            cleaned_df = cached_df
        
        total = len(cleaned_df)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_df = cleaned_df.iloc[start_idx:end_idx]
        
        return {
            "success": True,
            "original_count": len(cleaned_df),
            "cleaned_count": len(cleaned_df),
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "data": paginated_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成清洗数据失败: {str(e)}")


@router.get("/sample/aggregated")
async def get_aggregated_sample(
    hours: int = Query(24, ge=1, le=168),
    period: str = Query("hour", regex="^(minute|5_minute|15_minute|hour|4_hour|day|week)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=50, le=2000)
):
    try:
        cache_key = generate_cache_key("aggregated_sample", hours=hours, period=period)
        cached_df = query_cache.get(cache_key)
        
        if cached_df is None:
            df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
            cleaned_df = cleaner.clean_data(df)
            aggregated_df = aggregator.aggregate_metrics(cleaned_df, period)
            query_cache.set(cache_key, aggregated_df, ttl_seconds=180)
        else:
            aggregated_df = cached_df
        
        total = len(aggregated_df)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_df = aggregated_df.iloc[start_idx:end_idx]
        
        return {
            "success": True,
            "original_count": int(total * 60 / 5) if period == 'hour' else total,
            "cleaned_count": total,
            "aggregated_count": len(paginated_df),
            "period": period,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "data": paginated_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成聚合数据失败: {str(e)}")


@router.get("/quality-report")
async def get_data_quality_report(hours: int = Query(24, ge=1, le=168)):
    try:
        cache_key = generate_cache_key("quality_report", hours=hours)
        cached = query_cache.get(cache_key)
        if cached:
            return cached
        
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        report = cleaner.get_data_quality_report(cleaned_df)
        device_summary = aggregator.get_device_summary(cleaned_df)
        
        result = {
            "success": True,
            "quality_report": report,
            "device_summary": device_summary
        }
        query_cache.set(cache_key, result, ttl_seconds=120)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成质量报告失败: {str(e)}")


@router.get("/export")
async def export_data(
    hours: int = Query(24, ge=1, le=72),
    format: str = Query("json", regex="^(json|csv|excel)$"),
    device_ids: Optional[str] = None,
    metric_names: Optional[str] = None
):
    try:
        df = mock_data_generator.generate_metrics_data(hours, interval_minutes=5)
        
        if device_ids:
            device_list = device_ids.split(',')
            df = df[df['device_id'].isin(device_list)]
        
        if metric_names:
            metric_list = metric_names.split(',')
            df = df[df['metric_name'].isin(metric_list)]
        
        cleaned_df = cleaner.clean_data(df)
        
        if format == 'json':
            return {
                "success": True,
                "count": len(cleaned_df),
                "data": cleaned_df.to_dict(orient="records")
            }
        elif format == 'csv':
            csv_data = cleaned_df.to_csv(index=False)
            return {
                "success": True,
                "count": len(cleaned_df),
                "csv_data": csv_data
            }
        else:
            return {
                "success": True,
                "count": len(cleaned_df),
                "data": cleaned_df.to_dict(orient="records")
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据导出失败: {str(e)}")
