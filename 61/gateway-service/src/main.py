#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import threading
import signal

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.config_loader import ConfigLoader
from .sensor_collector import SensorCollector
from .data_publisher import DataPublisher
from .edge_sync import EdgeCloudSync
from .api_server import GatewayAPIServer


class GatewayService:
    def __init__(self):
        self.config_loader = ConfigLoader()
        self.config = self.config_loader.load_config()
        
        self._setup_logging()
        self.logger = logging.getLogger(__name__)
        
        self.collector = SensorCollector(self.config)
        self.publisher = DataPublisher(self.config)
        self.edge_sync = EdgeCloudSync(self.config)
        self.api_server = GatewayAPIServer(self.config, self.publisher, self.collector)
        
        self.is_running = False
        self.collection_thread = None

    def _setup_logging(self):
        log_config = self.config.get("logging", {})
        log_level = getattr(logging, log_config.get("level", "INFO"))
        log_format = log_config.get("format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        
        logging.basicConfig(
            level=log_level,
            format=log_format
        )

    def _on_data_collected(self, data_list):
        self.publisher.publish(data_list)
        for data in data_list:
            self.edge_sync.buffer_data(data)

    def start(self):
        self.logger.info("Starting Gateway Service...")
        
        self.publisher.connect()
        self.edge_sync.start()
        
        self.is_running = True
        interval_ms = self.config.get("gateway", {}).get("scan_interval", 1000)
        
        self.collection_thread = threading.Thread(
            target=self.collector.start_continuous_collection,
            args=(self._on_data_collected, interval_ms),
            daemon=True
        )
        self.collection_thread.start()
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        self.api_server.run(port=5000)

    def stop(self):
        self.logger.info("Stopping Gateway Service...")
        self.is_running = False
        self.edge_sync.stop()
        self.publisher.disconnect()
        self.logger.info("Gateway Service stopped")

    def _signal_handler(self, signum, frame):
        self.logger.info(f"Received signal {signum}")
        self.stop()
        sys.exit(0)


def main():
    service = GatewayService()
    try:
        service.start()
    except KeyboardInterrupt:
        service.stop()
    except Exception as e:
        logging.error(f"Service error: {e}")
        service.stop()
        sys.exit(1)


if __name__ == "__main__":
    main()
