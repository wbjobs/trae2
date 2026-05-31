#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import signal
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.config_loader import ConfigLoader
from common.src.mqtt_client import MQTTClient
from common.src.constants import MQTT_TOPIC_ALERT
from .alert_manager import AlertManager
from .task_dispatcher import TaskDispatcher
from .alert_api import AlertAPIServer


class AlertService:
    def __init__(self):
        self.config_loader = ConfigLoader()
        self.config = self.config_loader.load_config()
        
        self._setup_logging()
        self.logger = logging.getLogger(__name__)
        
        self.alert_manager = AlertManager(self.config)
        self.task_dispatcher = TaskDispatcher(self.config)
        
        mqtt_config = self.config.get("mqtt", {})
        broker_host = mqtt_config.get("broker", {}).get("host", "localhost")
        broker_port = mqtt_config.get("broker", {}).get("port", 1883)
        self.alert_topic = mqtt_config.get("topics", {}).get("alert", MQTT_TOPIC_ALERT)
        
        self.mqtt_client = MQTTClient("alert_service", broker_host, broker_port)
        
        self.api_server = AlertAPIServer(self.config, self.alert_manager, self.task_dispatcher)

    def _setup_logging(self):
        log_config = self.config.get("logging", {})
        log_level = getattr(logging, log_config.get("level", "INFO"))
        log_format = log_config.get("format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        
        logging.basicConfig(
            level=log_level,
            format=log_format
        )

    def _on_alert_message(self, payload: dict):
        try:
            self.logger.debug(f"Received alert: {payload.get('alert_type')} - {payload.get('level')}")
            result = self.alert_manager.process_alert(payload)
            
            if result["status"] == "sent":
                self.logger.info(f"Alert processed and sent: {payload.get('alert_id')} to {result['channels_sent']} channels")
                
                alert_level = payload.get("level", "")
                if alert_level in ["critical", "emergency"]:
                    try:
                        task = self.task_dispatcher.create_task_from_alert(payload)
                        if task:
                            self.logger.info(f"Auto-created task {task.task_id} from alert {payload.get('alert_id')}")
                    except Exception as task_error:
                        self.logger.warning(f"Failed to create task from alert: {task_error}")
            else:
                self.logger.debug(f"Alert suppressed: {payload.get('alert_id')}")
                
        except Exception as e:
            self.logger.error(f"Error processing alert: {e}")

    def start(self):
        self.logger.info("Starting Alert Service...")
        
        self.mqtt_client.connect()
        self.mqtt_client.subscribe(self.alert_topic, self._on_alert_message)
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        self.api_server.run(port=5003)

    def stop(self):
        self.logger.info("Stopping Alert Service...")
        self.mqtt_client.disconnect()
        self.logger.info("Alert Service stopped")

    def _signal_handler(self, signum, frame):
        self.logger.info(f"Received signal {signum}")
        self.stop()
        sys.exit(0)


def main():
    service = AlertService()
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
