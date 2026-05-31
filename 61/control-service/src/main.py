#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import signal

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.config_loader import ConfigLoader
from common.src.mqtt_client import MQTTClient
from common.src.constants import MQTT_TOPIC_ALERT, MQTT_TOPIC_CONTROL_CMD
from .device_controller import DeviceController
from .auto_trip_engine import AutoTripEngine
from .control_api import ControlAPIServer


class ControlService:
    def __init__(self):
        self.config_loader = ConfigLoader()
        self.config = self.config_loader.load_config()
        
        self._setup_logging()
        self.logger = logging.getLogger(__name__)
        
        self.device_controller = DeviceController(self.config)
        self.auto_trip_engine = AutoTripEngine(self.config, self.device_controller)
        
        mqtt_config = self.config.get("mqtt", {})
        broker_host = mqtt_config.get("broker", {}).get("host", "localhost")
        broker_port = mqtt_config.get("broker", {}).get("port", 1883)
        self.alert_topic = mqtt_config.get("topics", {}).get("alert", MQTT_TOPIC_ALERT)
        self.control_topic = mqtt_config.get("topics", {}).get("control_cmd", MQTT_TOPIC_CONTROL_CMD)
        
        self.mqtt_client = MQTTClient("control_service", broker_host, broker_port)
        
        self.api_server = ControlAPIServer(
            self.config,
            self.device_controller,
            self.auto_trip_engine,
            self.mqtt_client,
            self.control_topic
        )

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
            alert_level = payload.get("level")
            room_id = payload.get("room_id")
            device_id = payload.get("device_id")
            alert_type = payload.get("alert_type")
            value = payload.get("value")
            
            sensor_type = alert_type.replace("_threshold", "") if "_threshold" in alert_type else alert_type
            
            self.logger.debug(f"Received alert: {alert_type}, level: {alert_level}")
            
            trip_result = self.auto_trip_engine.check_and_trip(
                room_id,
                device_id,
                sensor_type,
                value or 0,
                alert_level
            )
            
            if trip_result.get("auto_trip"):
                self.logger.warning(f"Auto-trip executed: {trip_result}")
                
        except Exception as e:
            self.logger.error(f"Error processing alert: {e}")

    def _on_control_command(self, payload: dict):
        try:
            from common.src.models import ControlCommand
            command = ControlCommand(
                command_id=payload.get("command_id"),
                room_id=payload.get("room_id"),
                device_id=payload.get("device_id"),
                command_type=payload.get("command_type"),
                params=payload.get("params", {}),
                issued_by=payload.get("issued_by", "system")
            )
            
            self.logger.info(f"Received control command: {command.command_type} for {command.device_id}")
            result = self.device_controller.execute_command(command)
            self.logger.debug(f"Command result: {result}")
            
        except Exception as e:
            self.logger.error(f"Error processing command: {e}")

    def start(self):
        self.logger.info("Starting Control Service...")
        
        self.device_controller.start()
        
        self.mqtt_client.connect()
        self.mqtt_client.subscribe(self.alert_topic, self._on_alert_message)
        self.mqtt_client.subscribe(self.control_topic, self._on_control_command)
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        self.api_server.run(port=5002)

    def stop(self):
        self.logger.info("Stopping Control Service...")
        self.device_controller.stop()
        self.mqtt_client.disconnect()
        self.logger.info("Control Service stopped")

    def _signal_handler(self, signum, frame):
        self.logger.info(f"Received signal {signum}")
        self.stop()
        sys.exit(0)


def main():
    service = ControlService()
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
