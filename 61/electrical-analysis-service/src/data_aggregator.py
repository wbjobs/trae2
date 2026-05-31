#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import json
import time
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict, deque
import redis

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))


class DataAggregator:
    def __init__(self, config: Dict, redis_client: redis.Redis = None):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        self.redis_client = redis_client
        self.use_redis = redis_client is not None
        
        self.aggregation_windows = {
            "1min": 60,
            "5min": 300,
            "15min": 900,
            "1hour": 3600,
            "1day": 86400
        }
        
        self.data_buffers: Dict[str, deque] = defaultdict(lambda: deque(maxlen=10000))
        self.aggregated_data: Dict[str, Dict] = defaultdict(dict)
        
        self.cache_ttl = config.get("aggregation", {}).get("cache_ttl_seconds", 300)
        self.last_cache_update: Dict[str, float] = {}
        
        self.stats = {
            "total_data_points": 0,
            "total_aggregations": 0,
            "cache_hits": 0,
            "cache_misses": 0
        }

    def add_data_point(self, room_id: str, device_id: str, sensor_type: str,
                       value: float, timestamp: float = None):
        if timestamp is None:
            timestamp = time.time()
        
        key = f"{room_id}:{device_id}:{sensor_type}"
        
        self.data_buffers[key].append((timestamp, value))
        self.stats["total_data_points"] += 1
        
        self._update_incremental_stats(key, value, timestamp)
        
        if self.use_redis:
            self._store_redis_buffer(key, timestamp, value)

    def _update_incremental_stats(self, key: str, value: float, timestamp: float):
        if key not in self.aggregated_data:
            self.aggregated_data[key] = {
                "count": 0,
                "sum": 0.0,
                "sum_sq": 0.0,
                "min": float('inf'),
                "max": float('-inf'),
                "first_timestamp": timestamp,
                "last_timestamp": timestamp,
                "last_value": value
            }
        
        stats = self.aggregated_data[key]
        stats["count"] += 1
        stats["sum"] += value
        stats["sum_sq"] += value * value
        stats["min"] = min(stats["min"], value)
        stats["max"] = max(stats["max"], value)
        stats["last_timestamp"] = timestamp
        stats["last_value"] = value

    def _store_redis_buffer(self, key: str, timestamp: float, value: float):
        try:
            redis_key = f"buffer:{key}"
            self.redis_client.zadd(redis_key, {json.dumps({"ts": timestamp, "val": value}): timestamp})
            self.redis_client.zremrangebyrank(redis_key, 0, -10001)
            self.redis_client.expire(redis_key, 3600 * 24)
        except Exception as e:
            self.logger.error(f"Redis buffer store error: {e}")

    def get_statistics(self, room_id: str, device_id: str, sensor_type: str) -> Optional[Dict]:
        key = f"{room_id}:{device_id}:{sensor_type}"
        
        if key not in self.aggregated_data or self.aggregated_data[key]["count"] == 0:
            return None
        
        stats = self.aggregated_data[key]
        mean = stats["sum"] / stats["count"]
        variance = (stats["sum_sq"] / stats["count"]) - (mean * mean)
        std_dev = abs(variance) ** 0.5
        
        return {
            "room_id": room_id,
            "device_id": device_id,
            "sensor_type": sensor_type,
            "count": stats["count"],
            "mean": round(mean, 4),
            "std_dev": round(std_dev, 4),
            "min": round(stats["min"], 4),
            "max": round(stats["max"], 4),
            "range": round(stats["max"] - stats["min"], 4),
            "first_timestamp": datetime.fromtimestamp(stats["first_timestamp"]).isoformat(),
            "last_timestamp": datetime.fromtimestamp(stats["last_timestamp"]).isoformat(),
            "last_value": round(stats["last_value"], 4)
        }

    def aggregate_time_window(self, room_id: str, device_id: str, sensor_type: str,
                              window_seconds: int, start_time: float = None,
                              end_time: float = None) -> Dict:
        cache_key = f"agg:{room_id}:{device_id}:{sensor_type}:{window_seconds}"
        
        if self._is_cache_valid(cache_key):
            self.stats["cache_hits"] += 1
            return self.aggregated_data.get(cache_key, {})
        
        self.stats["cache_misses"] += 1
        self.stats["total_aggregations"] += 1
        
        key = f"{room_id}:{device_id}:{sensor_type}"
        
        if end_time is None:
            end_time = time.time()
        if start_time is None:
            start_time = end_time - window_seconds * 100
        
        window_data = self._get_window_data(key, start_time, end_time)
        
        if not window_data:
            return {"count": 0, "error": "No data in time window"}
        
        window_start = min(start_time, window_data[0][0])
        
        buckets: Dict[float, List[float]] = defaultdict(list)
        
        for ts, val in window_data:
            bucket_key = int((ts - window_start) / window_seconds) * window_seconds + window_start
            buckets[bucket_key].append(val)
        
        result = []
        for bucket_ts in sorted(buckets.keys()):
            values = buckets[bucket_ts]
            result.append({
                "timestamp": datetime.fromtimestamp(bucket_ts).isoformat(),
                "ts": bucket_ts,
                "count": len(values),
                "mean": round(sum(values) / len(values), 4),
                "min": round(min(values), 4),
                "max": round(max(values), 4),
                "sum": round(sum(values), 4)
            })
        
        aggregated = {
            "room_id": room_id,
            "device_id": device_id,
            "sensor_type": sensor_type,
            "window_seconds": window_seconds,
            "buckets": result,
            "total_count": len(window_data),
            "bucket_count": len(result),
            "aggregated_at": datetime.now().isoformat()
        }
        
        self.aggregated_data[cache_key] = aggregated
        self.last_cache_update[cache_key] = time.time()
        
        return aggregated

    def _get_window_data(self, key: str, start_time: float, end_time: float) -> List[Tuple[float, float]]:
        if self.use_redis:
            return self._get_window_data_redis(key, start_time, end_time)
        else:
            return self._get_window_data_memory(key, start_time, end_time)

    def _get_window_data_redis(self, key: str, start_time: float, end_time: float) -> List[Tuple[float, float]]:
        try:
            redis_key = f"buffer:{key}"
            data_list = self.redis_client.zrangebyscore(redis_key, start_time, end_time)
            
            result = []
            for item in data_list:
                try:
                    data = json.loads(item)
                    result.append((data["ts"], data["val"]))
                except:
                    pass
            return result
        except Exception as e:
            self.logger.error(f"Redis window query error: {e}")
            return self._get_window_data_memory(key, start_time, end_time)

    def _get_window_data_memory(self, key: str, start_time: float, end_time: float) -> List[Tuple[float, float]]:
        buffer = self.data_buffers.get(key)
        if not buffer:
            return []
        
        return [(ts, val) for ts, val in buffer if start_time <= ts <= end_time]

    def _is_cache_valid(self, cache_key: str) -> bool:
        last_update = self.last_cache_update.get(cache_key, 0)
        return (time.time() - last_update) < self.cache_ttl

    def aggregate_room(self, room_id: str, sensor_type: str = None) -> Dict:
        cache_key = f"room_agg:{room_id}:{sensor_type or 'all'}"
        
        if self._is_cache_valid(cache_key):
            self.stats["cache_hits"] += 1
            return self.aggregated_data.get(cache_key, {})
        
        self.stats["cache_misses"] += 1
        
        result = {
            "room_id": room_id,
            "sensor_type": sensor_type or "all",
            "devices": {},
            "summary": {
                "total_devices": 0,
                "total_data_points": 0,
                "global_min": float('inf'),
                "global_max": float('-inf'),
                "global_mean": 0.0
            }
        }
        
        all_values = []
        for key, stats in self.aggregated_data.items():
            if key.startswith(f"{room_id}:"):
                parts = key.split(":")
                if len(parts) < 3:
                    continue
                d_id = parts[1]
                s_type = parts[2]
                
                if sensor_type and s_type != sensor_type:
                    continue
                
                device_stats = self.get_statistics(room_id, d_id, s_type)
                if device_stats:
                    result["devices"][d_id] = device_stats
                    result["summary"]["total_devices"] += 1
                    result["summary"]["total_data_points"] += device_stats["count"]
                    all_values.append(device_stats["last_value"])
                    result["summary"]["global_min"] = min(result["summary"]["global_min"], device_stats["min"])
                    result["summary"]["global_max"] = max(result["summary"]["global_max"], device_stats["max"])
        
        if all_values:
            result["summary"]["global_mean"] = round(sum(all_values) / len(all_values), 4)
            result["summary"]["global_min"] = round(result["summary"]["global_min"], 4)
            result["summary"]["global_max"] = round(result["summary"]["global_max"], 4)
        
        self.aggregated_data[cache_key] = result
        self.last_cache_update[cache_key] = time.time()
        
        return result

    def aggregate_all_rooms(self, sensor_type: str = None) -> Dict:
        cache_key = f"global_agg:{sensor_type or 'all'}"
        
        if self._is_cache_valid(cache_key):
            self.stats["cache_hits"] += 1
            return self.aggregated_data.get(cache_key, {})
        
        self.stats["cache_misses"] += 1
        
        rooms = self.config.get("rooms", [])
        result = {
            "sensor_type": sensor_type or "all",
            "rooms": {},
            "global_summary": {
                "total_rooms": 0,
                "total_devices": 0,
                "total_data_points": 0,
                "global_mean": 0.0
            }
        }
        
        all_means = []
        for room in rooms:
            room_id = room["id"]
            room_agg = self.aggregate_room(room_id, sensor_type)
            result["rooms"][room_id] = room_agg
            
            result["global_summary"]["total_rooms"] += 1
            result["global_summary"]["total_devices"] += room_agg["summary"]["total_devices"]
            result["global_summary"]["total_data_points"] += room_agg["summary"]["total_data_points"]
            
            if room_agg["summary"]["total_devices"] > 0:
                all_means.append(room_agg["summary"]["global_mean"])
        
        if all_means:
            result["global_summary"]["global_mean"] = round(sum(all_means) / len(all_means), 4)
        
        self.aggregated_data[cache_key] = result
        self.last_cache_update[cache_key] = time.time()
        
        return result

    def get_trend(self, room_id: str, device_id: str, sensor_type: str,
                  window_seconds: int = 300) -> Dict:
        end_time = time.time()
        start_time = end_time - window_seconds
        
        agg = self.aggregate_time_window(room_id, device_id, sensor_type, 60, start_time, end_time)
        
        if not agg or "buckets" not in agg or len(agg["buckets"]) < 2:
            return {"trend": "insufficient_data"}
        
        buckets = agg["buckets"]
        first_mean = buckets[0]["mean"]
        last_mean = buckets[-1]["mean"]
        
        if first_mean == 0:
            change_pct = 0
        else:
            change_pct = ((last_mean - first_mean) / first_mean) * 100
        
        if change_pct > 5:
            trend = "rising"
        elif change_pct < -5:
            trend = "falling"
        else:
            trend = "stable"
        
        return {
            "room_id": room_id,
            "device_id": device_id,
            "sensor_type": sensor_type,
            "trend": trend,
            "change_percent": round(change_pct, 2),
            "start_value": first_mean,
            "end_value": last_mean,
            "window_seconds": window_seconds
        }

    def get_anomalies(self, room_id: str, device_id: str, sensor_type: str,
                      z_score_threshold: float = 3.0) -> List[Dict]:
        stats = self.get_statistics(room_id, device_id, sensor_type)
        
        if not stats or stats["count"] < 10:
            return []
        
        mean = stats["mean"]
        std_dev = stats["std_dev"]
        
        if std_dev == 0:
            return []
        
        key = f"{room_id}:{device_id}:{sensor_type}"
        buffer = self.data_buffers.get(key)
        
        if not buffer:
            return []
        
        anomalies = []
        for ts, val in buffer:
            z_score = abs(val - mean) / std_dev if std_dev > 0 else 0
            if z_score > z_score_threshold:
                anomalies.append({
                    "timestamp": datetime.fromtimestamp(ts).isoformat(),
                    "ts": ts,
                    "value": val,
                    "z_score": round(z_score, 2),
                    "deviation_from_mean": round(val - mean, 4)
                })
        
        return anomalies

    def invalidate_cache(self, pattern: str = None):
        if pattern:
            keys_to_remove = [k for k in self.aggregated_data.keys() if pattern in k]
            for k in keys_to_remove:
                del self.aggregated_data[k]
                self.last_cache_update.pop(k, None)
            self.logger.info(f"Invalidated {len(keys_to_remove)} cache entries")
        else:
            self.aggregated_data.clear()
            self.last_cache_update.clear()
            self.logger.info("Invalidated all cache")

    def get_stats(self) -> Dict:
        return {
            **self.stats,
            "monitored_keys": len(self.data_buffers),
            "cached_results": len(self.aggregated_data),
            "cache_hit_rate": (
                self.stats["cache_hits"] / (self.stats["cache_hits"] + self.stats["cache_misses"]) * 100
                if (self.stats["cache_hits"] + self.stats["cache_misses"]) > 0 else 0
            )
        }
