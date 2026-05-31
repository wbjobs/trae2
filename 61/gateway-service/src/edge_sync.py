#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import json
import time
import threading
from typing import Dict, List
import redis
import requests

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.models import SensorData


class EdgeCloudSync:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.sync_interval = config.get("gateway", {}).get("edge_sync_interval", 30)
        self.is_running = False
        self.sync_thread = None
        
        redis_config = config.get("redis", {})
        self.redis_client = redis.Redis(
            host=redis_config.get("host", "localhost"),
            port=redis_config.get("port", 6379),
            db=redis_config.get("db", 0),
            decode_responses=True
        )
        
        self.cloud_api_url = config.get("cloud", {}).get("api_url", "http://localhost:8000/api")
        self.cloud_api_key = config.get("cloud", {}).get("api_key", "")
        
        self.local_data_buffer = []

    def start(self):
        self.is_running = True
        self.sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self.sync_thread.start()
        self.logger.info("Edge-cloud synchronization started")

    def stop(self):
        self.is_running = False
        if self.sync_thread:
            self.sync_thread.join()
        self.logger.info("Edge-cloud synchronization stopped")

    def _sync_loop(self):
        while self.is_running:
            try:
                self._sync_data_to_cloud()
                self._receive_cloud_commands()
            except Exception as e:
                self.logger.error(f"Sync error: {e}")
            time.sleep(self.sync_interval)

    def _sync_data_to_cloud(self):
        unsynced_keys = self.redis_client.keys("sensor:*:history")
        synced_count = 0
        
        for key in unsynced_keys:
            last_sync_key = f"{key}:last_sync"
            last_sync = float(self.redis_client.get(last_sync_key) or 0)
            
            data_list = self.redis_client.zrangebyscore(key, last_sync + 0.001, "+inf")
            
            if data_list:
                try:
                    self._send_to_cloud([json.loads(d) for d in data_list])
                    latest_score = self.redis_client.zrange(key, -1, -1, withscores=True)[0][1]
                    self.redis_client.set(last_sync_key, latest_score)
                    synced_count += len(data_list)
                except Exception as e:
                    self.logger.warning(f"Failed to sync {key}: {e}")
                    break
        
        if synced_count > 0:
            self.logger.info(f"Synced {synced_count} records to cloud")

    def _send_to_cloud(self, data_list: List[Dict]):
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.cloud_api_key
        }
        
        response = requests.post(
            f"{self.cloud_api_url}/sensor/batch",
            json={"data": data_list},
            headers=headers,
            timeout=10
        )
        
        if response.status_code != 200:
            raise Exception(f"Cloud API returned {response.status_code}")

    def _receive_cloud_commands(self):
        try:
            headers = {"X-API-Key": self.cloud_api_key}
            response = requests.get(
                f"{self.cloud_api_url}/commands/pending",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                commands = response.json().get("commands", [])
                for cmd in commands:
                    self._process_cloud_command(cmd)
        except Exception as e:
            self.logger.debug(f"No pending commands or error: {e}")

    def _process_cloud_command(self, cmd: Dict):
        self.logger.info(f"Processing cloud command: {cmd}")
        command_key = f"command:{cmd['command_id']}"
        self.redis_client.set(command_key, json.dumps(cmd), ex=3600)

    def buffer_data(self, data: SensorData):
        self.local_data_buffer.append(data)
        if len(self.local_data_buffer) > 1000:
            self.local_data_buffer = self.local_data_buffer[-500:]
