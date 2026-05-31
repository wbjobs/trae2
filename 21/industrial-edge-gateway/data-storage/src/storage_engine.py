"""
存储引擎 - 核心数据存储逻辑
"""
import json
import os
import time
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from .time_series_db import TimeSeriesDB
from shared.src.models import DataPoint
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("storage_engine")


class BucketManager:
    """分桶管理器 - 管理时序数据的分桶存储策略"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        storage_config = config.get("services", "data_storage")
        self._retention_days = storage_config.get("retention_days", 365)
        self._buckets: Dict[str, Dict] = {}
        self._load_buckets()

    def _load_buckets(self):
        buckets_file = "buckets.json"
        if os.path.exists(buckets_file):
            try:
                with open(buckets_file, "r", encoding="utf-8") as f:
                    self._buckets = json.load(f)
            except Exception as e:
                logger.error(f"加载分桶配置失败: {e}")

    def _save_buckets(self):
        try:
            with open("buckets.json", "w", encoding="utf-8") as f:
                json.dump(self._buckets, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"保存分桶配置失败: {e}")

    def create_bucket(self, bucket_name: str, description: str = "",
                      retention_days: int = None) -> Dict:
        bucket = {
            "name": bucket_name,
            "description": description,
            "retention_days": retention_days or self._retention_days,
            "created_at": datetime.utcnow().isoformat(),
            "measurements": {},
        }
        self._buckets[bucket_name] = bucket
        self._save_buckets()
        logger.info(f"创建分桶: {bucket_name}")
        return bucket

    def delete_bucket(self, bucket_name: str) -> bool:
        if bucket_name in self._buckets:
            del self._buckets[bucket_name]
            self._save_buckets()
            return True
        return False

    def get_bucket(self, bucket_name: str) -> Optional[Dict]:
        return self._buckets.get(bucket_name)

    def get_all_buckets(self) -> Dict:
        return dict(self._buckets)

    def add_measurement(self, bucket_name: str, measurement: str,
                        tags: Dict[str, str] = None) -> bool:
        if bucket_name not in self._buckets:
            return False
        self._buckets[bucket_name]["measurements"][measurement] = {
            "tags": tags or {},
            "created_at": datetime.utcnow().isoformat(),
        }
        self._save_buckets()
        return True

    def get_measurements(self, bucket_name: str) -> Dict:
        bucket = self._buckets.get(bucket_name)
        return bucket.get("measurements", {}) if bucket else {}


class StorageEngine:
    """存储引擎 - 数据写入和查询"""

    def __init__(self, config: GatewayConfig, db: TimeSeriesDB):
        self.config = config
        self.db = db
        self.bucket_manager = BucketManager(config)
        self._write_buffer: List[Dict] = []
        self._buffer_size = 100
        self._flush_interval = 5.0
        self._last_flush = time.time()

    def write_point(self, bucket_name: str, measurement: str,
                    point: DataPoint, tags: Dict[str, str] = None) -> bool:
        try:
            data = {
                "bucket": bucket_name,
                "measurement": measurement,
                "tags": tags or {"device_id": point.device_id, "point_id": point.point_id},
                "fields": {
                    "value": point.value,
                    "quality": point.quality,
                },
                "timestamp": point.timestamp,
            }
            self._write_buffer.append(data)
            
            if len(self._write_buffer) >= self._buffer_size or \
               time.time() - self._last_flush >= self._flush_interval:
                self.flush()
            
            return True
        except Exception as e:
            logger.error(f"写入数据点失败: {e}")
            return False

    def write_points_batch(self, bucket_name: str, measurement: str,
                          points: List[DataPoint], tags: Dict[str, str] = None) -> int:
        count = 0
        for point in points:
            if self.write_point(bucket_name, measurement, point, tags):
                count += 1
        return count

    def flush(self):
        if not self._write_buffer:
            return
        
        try:
            self.db.write_batch(self._write_buffer)
            self._write_buffer.clear()
            self._last_flush = time.time()
            logger.debug(f"刷新写入缓冲区, 写入 {len(self._write_buffer)} 条数据")
        except Exception as e:
            logger.error(f"刷新缓冲区失败: {e}")

    def query(self, bucket_name: str, measurement: str,
              start_time: datetime, end_time: datetime,
              tags: Dict[str, str] = None,
              aggregation: str = None) -> List[Dict]:
        try:
            return self.db.query(
                bucket=bucket_name,
                measurement=measurement,
                start_time=start_time,
                end_time=end_time,
                tags=tags,
                aggregation=aggregation,
            )
        except Exception as e:
            logger.error(f"查询数据失败: {e}")
            return []

    def query_latest(self, bucket_name: str, measurement: str,
                     tags: Dict[str, str] = None) -> Optional[Dict]:
        try:
            return self.db.query_latest(bucket_name, measurement, tags)
        except Exception as e:
            logger.error(f"查询最新数据失败: {e}")
            return None

    def delete_data(self, bucket_name: str, measurement: str,
                    start_time: datetime, end_time: datetime) -> bool:
        try:
            return self.db.delete(bucket_name, measurement, start_time, end_time)
        except Exception as e:
            logger.error(f"删除数据失败: {e}")
            return False

    def get_stats(self) -> Dict:
        return {
            "total_buckets": len(self.bucket_manager.get_all_buckets()),
            "buffer_size": len(self._write_buffer),
            "db_stats": self.db.get_stats() if hasattr(self.db, "get_stats") else {},
        }

    def close(self):
        self.flush()
        if hasattr(self.db, "close"):
            self.db.close()