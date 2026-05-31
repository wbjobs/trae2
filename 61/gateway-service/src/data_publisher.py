#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import json
import threading
import time
import queue
from typing import List, Dict, Optional
from datetime import datetime
import redis

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.models import SensorData
from common.src.mqtt_client import MQTTClient
from common.src.constants import MQTT_TOPIC_SENSOR_DATA, REDIS_HOST, REDIS_PORT, REDIS_DB


class DataPublisher:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        mqtt_config = config.get("mqtt", {})
        broker_host = mqtt_config.get("broker", {}).get("host", "localhost")
        broker_port = mqtt_config.get("broker", {}).get("port", 1883)
        self.mqtt_topic = mqtt_config.get("topics", {}).get("sensor_data", MQTT_TOPIC_SENSOR_DATA)
        
        self.mqtt_client = MQTTClient("gateway_publisher", broker_host, broker_port)
        
        redis_config = config.get("redis", {})
        self.redis_client = redis.Redis(
            host=redis_config.get("host", REDIS_HOST),
            port=redis_config.get("port", REDIS_PORT),
            db=redis_config.get("db", REDIS_DB),
            decode_responses=True
        )
        
        self.data_retention_hours = config.get("gateway", {}).get("data_retention_hours", 72)
        
        self.batch_size = config.get("gateway", {}).get("batch_size", 50)
        self.flush_interval = config.get("gateway", {}).get("flush_interval_ms", 100)
        self.max_queue_size = config.get("gateway", {}).get("max_queue_size", 10000)
        
        self.data_queue: queue.Queue = queue.Queue(maxsize=self.max_queue_size)
        self.batch_buffer: List[SensorData] = []
        self.buffer_lock = threading.Lock()
        self.last_flush_time = time.time()
        
        self.publish_thread: Optional[threading.Thread] = None
        self.running = False
        self.stats = {
            "total_published": 0,
            "total_batched": 0,
            "dropped_count": 0,
            "queue_overflow_count": 0
        }

    def connect(self):
        self.mqtt_client.connect()
        self.running = True
        self.publish_thread = threading.Thread(target=self._publish_loop, daemon=True)
        self.publish_thread.start()
        self.logger.info("Data publisher connected to MQTT broker and Redis (async batch mode)")

    def disconnect(self):
        self.running = False
        if self.publish_thread:
            self.publish_thread.join(timeout=5)
        self._flush_buffer()
        self.mqtt_client.disconnect()
        self.redis_client.close()
        self.logger.info(f"Data publisher disconnected. Stats: {self.stats}")

    def publish(self, sensor_data_list: List[SensorData]):
        for data in sensor_data_list:
            try:
                self.data_queue.put_nowait(data)
            except queue.Full:
                self.stats["queue_overflow_count"] += 1
                if self.stats["queue_overflow_count"] % 100 == 0:
                    self.logger.warning(
                        f"Data queue overflow! Dropped: {self.stats['queue_overflow_count']}"
                    )

    def _publish_loop(self):
        while self.running:
            try:
                data = self.data_queue.get(timeout=0.1)
                with self.buffer_lock:
                    self.batch_buffer.append(data)
                
                if len(self.batch_buffer) >= self.batch_size:
                    self._flush_buffer()
                elif (time.time() - self.last_flush_time) * 1000 >= self.flush_interval:
                    self._flush_buffer()
                    
            except queue.Empty:
                if self.batch_buffer:
                    self._flush_buffer()
            except Exception as e:
                self.logger.error(f"Error in publish loop: {e}")

    def _flush_buffer(self):
        with self.buffer_lock:
            if not self.batch_buffer:
                return
            
            batch = self.batch_buffer
            self.batch_buffer = []
            self.last_flush_time = time.time()
        
        if not batch:
            return
        
        self._publish_batch(batch)
        self.stats["total_batched"] += 1
        self.stats["total_published"] += len(batch)

    def _publish_batch(self, data_list: List[SensorData]):
        try:
            mqtt_messages = []
            pipeline = self.redis_client.pipeline()
            
            for data in data_list:
                data_dict = data.to_dict()
                mqtt_messages.append(
                    (f"{self.mqtt_topic}/{data.room_id}/{data.device_id}", data_dict)
                )
                mqtt_messages.append(
                    (self.mqtt_topic, data_dict)
                )
                
                key = f"sensor:{data.room_id}:{data.device_id}:latest"
                pipeline.set(key, json.dumps(data_dict))
                
                history_key = f"sensor:{data.room_id}:{data.device_id}:history"
                pipeline.zadd(history_key, {json.dumps(data_dict): data.timestamp.timestamp()})
                
                cutoff_time = data.timestamp.timestamp() - (self.data_retention_hours * 3600)
                pipeline.zremrangebyscore(history_key, 0, cutoff_time)
            
            for topic, payload in mqtt_messages:
                self.mqtt_client.publish(topic, payload, qos=0)
            
            pipeline.execute()
            
            if self.stats["total_published"] % 1000 == 0:
                self.logger.info(
                    f"Published {self.stats['total_published']} readings "
                    f"(batches: {self.stats['total_batched']}, "
                    f"queue_size: {self.data_queue.qsize()})"
                )
                
        except Exception as e:
            self.logger.error(f"Batch publish error: {e}")
            self.stats["dropped_count"] += len(data_list)

    def _publish_single(self, data: SensorData):
        data_dict = data.to_dict()
        
        self.mqtt_client.publish(
            f"{self.mqtt_topic}/{data.room_id}/{data.device_id}",
            data_dict
        )
        
        self.mqtt_client.publish(self.mqtt_topic, data_dict)
        
        self._store_in_redis(data)
        
        self.logger.debug(f"Published data: {data.device_id} = {data.value}{data.unit}")

    def _store_in_redis(self, data: SensorData):
        key = f"sensor:{data.room_id}:{data.device_id}:latest"
        self.redis_client.set(key, json.dumps(data.to_dict()))
        
        history_key = f"sensor:{data.room_id}:{data.device_id}:history"
        self.redis_client.zadd(history_key, {json.dumps(data.to_dict()): data.timestamp.timestamp()})
        
        cutoff_time = data.timestamp.timestamp() - (self.data_retention_hours * 3600)
        self.redis_client.zremrangebyscore(history_key, 0, cutoff_time)

    def get_latest_data(self, room_id: str, device_id: str) -> Dict:
        key = f"sensor:{room_id}:{device_id}:latest"
        data = self.redis_client.get(key)
        return json.loads(data) if data else None

    def get_history_data(self, room_id: str, device_id: str, start_time: float = None, end_time: float = None) -> List[Dict]:
        history_key = f"sensor:{room_id}:{device_id}:history"
        if start_time is None:
            start_time = "-inf"
        if end_time is None:
            end_time = "+inf"
        
        data_list = self.redis_client.zrangebyscore(history_key, start_time, end_time)
        return [json.loads(d) for d in data_list]

    def get_all_room_latest(self, room_id: str) -> Dict[str, Dict]:
        pattern = f"sensor:{room_id}:*:latest"
        result = {}
        for key in sorted(self.redis_client.keys(pattern)):
            device_id = key.split(":")[2]
            data = self.redis_client.get(key)
            if data:
                result[device_id] = json.loads(data)
        return result

    def get_aggregate_data(self, room_ids: List[str] = None) -> Dict:
        if room_ids is None:
            room_ids = [room["id"] for room in self.config.get("rooms", [])]
        
        aggregate = {
            "rooms": {},
            "summary": {
                "total_devices": 0,
                "total_readings": 0,
                "last_update": datetime.now().isoformat()
            }
        }
        
        for room_id in room_ids:
            room_data = self.get_all_room_latest(room_id)
            aggregate["rooms"][room_id] = {
                "device_count": len(room_data),
                "devices": room_data
            }
            aggregate["summary"]["total_devices"] += len(room_data)
            aggregate["summary"]["total_readings"] += self.stats["total_published"]
        
        return aggregate

    def get_stats(self) -> Dict:
        return {
            **self.stats,
            "queue_size": self.data_queue.qsize(),
            "buffer_size": len(self.batch_buffer),
            "batch_size": self.batch_size,
            "flush_interval_ms": self.flush_interval
        }
