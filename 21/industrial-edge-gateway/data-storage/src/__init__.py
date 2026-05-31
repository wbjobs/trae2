"""
数据落地存储模块
支持时序数据库分桶存储，适配多种数据库后端
"""
from .storage_engine import StorageEngine, BucketManager
from .time_series_db import TimeSeriesDB, InfluxDBAdapter, TimescaleDBAdapter
from .service import DataStorageService

__all__ = [
    "StorageEngine",
    "BucketManager",
    "TimeSeriesDB",
    "InfluxDBAdapter",
    "TimescaleDBAdapter",
    "DataStorageService",
]

__version__ = "1.0.0"