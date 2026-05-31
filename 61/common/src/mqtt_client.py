#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import paho.mqtt.client as mqtt
import json
import logging
import time
import threading
import queue
from typing import Callable, Dict, Optional, List, Tuple
from .constants import MQTT_BROKER_HOST, MQTT_BROKER_PORT


class MQTTClient:
    def __init__(self, client_id: str, host: str = MQTT_BROKER_HOST, port: int = MQTT_BROKER_PORT):
        self.client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)
        self.host = host
        self.port = port
        self.callbacks: Dict[str, Callable] = {}
        self.logger = logging.getLogger(__name__)
        
        self.publish_queue: queue.Queue = queue.Queue(maxsize=10000)
        self.publish_thread: Optional[threading.Thread] = None
        self.running = False
        
        self.publish_batch_size = 20
        self.publish_interval_ms = 50
        
        self.stats = {
            "published": 0,
            "received": 0,
            "dropped": 0,
            "errors": 0,
            "reconnects": 0
        }

        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        self.client.on_publish = self._on_publish
        
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.logger.info("Connected to MQTT broker successfully")
            for topic in self.callbacks.keys():
                self.client.subscribe(topic, qos=1)
        else:
            self.logger.error(f"Failed to connect to MQTT broker, code: {rc}")

    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            self.stats["received"] += 1
            
            matched = False
            for subscribed_topic, callback in self.callbacks.items():
                if mqtt.topic_matches_sub(subscribed_topic, topic):
                    try:
                        callback(payload, topic)
                    except Exception as e:
                        self.logger.error(f"Callback error for topic {topic}: {e}")
                    matched = True
            
            if not matched and topic in self.callbacks:
                self.callbacks[topic](payload)
                
        except json.JSONDecodeError as e:
            self.logger.error(f"JSON decode error: {e}")
            self.stats["errors"] += 1
        except Exception as e:
            self.logger.error(f"Error processing message: {e}")
            self.stats["errors"] += 1

    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            self.logger.warning(f"Unexpected disconnection from MQTT broker (code: {rc})")
            self.stats["reconnects"] += 1
        else:
            self.logger.info("Disconnected from MQTT broker")

    def _on_publish(self, client, userdata, mid):
        self.stats["published"] += 1

    def connect(self):
        try:
            self.client.connect(self.host, self.port, keepalive=60)
            self.client.loop_start()
            
            self.running = True
            self.publish_thread = threading.Thread(target=self._publish_loop, daemon=True)
            self.publish_thread.start()
            
            self.logger.info(f"MQTT client connected (async publish mode, batch_size={self.publish_batch_size})")
        except Exception as e:
            self.logger.error(f"Connection error: {e}")
            raise

    def disconnect(self):
        self.running = False
        
        self._flush_publish_queue()
        
        if self.publish_thread:
            self.publish_thread.join(timeout=2)
        
        self.client.loop_stop()
        self.client.disconnect()
        
        self.logger.info(f"MQTT client disconnected. Stats: {self.stats}")

    def subscribe(self, topic: str, callback: Callable):
        self.callbacks[topic] = callback
        if self.client.is_connected():
            self.client.subscribe(topic, qos=1)
            self.logger.debug(f"Subscribed to topic: {topic}")

    def publish(self, topic: str, payload: Dict, qos: int = 0):
        try:
            message = (topic, json.dumps(payload), qos)
            self.publish_queue.put_nowait(message)
        except queue.Full:
            self.stats["dropped"] += 1
            if self.stats["dropped"] % 100 == 0:
                self.logger.warning(f"Publish queue overflow! Dropped: {self.stats['dropped']}")
        except Exception as e:
            self.logger.error(f"Publish error: {e}")
            self.stats["errors"] += 1

    def _publish_loop(self):
        batch: List[Tuple[str, str, int]] = []
        last_flush = time.time()
        
        while self.running:
            try:
                try:
                    message = self.publish_queue.get(timeout=0.05)
                    batch.append(message)
                except queue.Empty:
                    pass
                
                should_flush = (
                    len(batch) >= self.publish_batch_size or
                    (time.time() - last_flush) * 1000 >= self.publish_interval_ms
                )
                
                if should_flush and batch:
                    self._publish_batch(batch)
                    batch = []
                    last_flush = time.time()
                    
            except Exception as e:
                self.logger.error(f"Error in publish loop: {e}")
                self.stats["errors"] += 1
        
        if batch:
            self._publish_batch(batch)

    def _publish_batch(self, batch: List[Tuple[str, str, int]]):
        if not self.client.is_connected():
            self.stats["dropped"] += len(batch)
            return
        
        try:
            for topic, payload, qos in batch:
                self.client.publish(topic, payload, qos=qos)
            
            if self.stats["published"] % 1000 == 0:
                self.logger.info(
                    f"MQTT published {self.stats['published']} messages "
                    f"(queue: {self.publish_queue.qsize()}, "
                    f"dropped: {self.stats['dropped']})"
                )
        except Exception as e:
            self.logger.error(f"Batch publish error: {e}")
            self.stats["errors"] += len(batch)
            self.stats["dropped"] += len(batch)

    def _flush_publish_queue(self):
        try:
            remaining = []
            while not self.publish_queue.empty():
                try:
                    remaining.append(self.publish_queue.get_nowait())
                except queue.Empty:
                    break
            
            if remaining and self.client.is_connected():
                self._publish_batch(remaining)
                self.logger.info(f"Flushed {len(remaining)} messages on disconnect")
        except Exception as e:
            self.logger.error(f"Error flushing publish queue: {e}")

    def is_connected(self) -> bool:
        return self.client.is_connected()

    def get_stats(self) -> Dict:
        return {
            **self.stats,
            "queue_size": self.publish_queue.qsize(),
            "is_connected": self.is_connected(),
            "subscribed_topics": len(self.callbacks)
        }
