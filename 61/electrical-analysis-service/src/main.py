#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import threading
import signal
import uuid

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.config_loader import ConfigLoader
from common.src.mqtt_client import MQTTClient
from common.src.models import SensorData, AlertMessage
from common.src.constants import MQTT_TOPIC_SENSOR_DATA, MQTT_TOPIC_ALERT
from .threshold_detector import ThresholdDetector
from .data_processor import DataProcessor
from .arc_detector import ArcDetector
from .load_forecaster import LoadForecaster
from .data_aggregator import DataAggregator
from .analysis_api import AnalysisAPIServer


class ElectricalAnalysisService:
    def __init__(self):
        self.config_loader = ConfigLoader()
        self.config = self.config_loader.load_config()
        
        self._setup_logging()
        self.logger = logging.getLogger(__name__)
        
        self.threshold_detector = ThresholdDetector(self.config)
        self.data_processor = DataProcessor(self.config)
        self.arc_detector = ArcDetector(self.config)
        self.load_forecaster = LoadForecaster(self.config)
        self.data_aggregator = DataAggregator(self.config)
        
        mqtt_config = self.config.get("mqtt", {})
        broker_host = mqtt_config.get("broker", {}).get("host", "localhost")
        broker_port = mqtt_config.get("broker", {}).get("port", 1883)
        self.alert_topic = mqtt_config.get("topics", {}).get("alert", MQTT_TOPIC_ALERT)
        
        self.mqtt_client = MQTTClient("analysis_service", broker_host, broker_port)
        
        self.api_server = AnalysisAPIServer(
            self.config,
            self.threshold_detector,
            self.data_processor,
            self.arc_detector,
            self.load_forecaster,
            self.data_aggregator
        )

    def _setup_logging(self):
        log_config = self.config.get("logging", {})
        log_level = getattr(logging, log_config.get("level", "INFO"))
        log_format = log_config.get("format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        
        logging.basicConfig(
            level=log_level,
            format=log_format
        )

    def _on_sensor_data(self, payload: dict):
        try:
            sensor_data = SensorData.from_dict(payload)
            self._analyze_data(sensor_data)
        except Exception as e:
            self.logger.error(f"Error processing sensor data: {e}")

    def _analyze_data(self, sensor_data: SensorData):
        processed = self.data_processor.process(sensor_data)
        is_alert, level, threshold = self.threshold_detector.check_threshold(sensor_data)
        
        self.data_aggregator.add_data_point(
            sensor_data.room_id,
            sensor_data.device_id,
            sensor_data.sensor_type,
            sensor_data.value
        )
        
        if sensor_data.sensor_type in ["current", "voltage"]:
            self.load_forecaster.add_data(
                sensor_data.room_id,
                sensor_data.device_id,
                sensor_data.value
            )
        
        if is_alert:
            self._send_alert(sensor_data, level, threshold)
        
        if sensor_data.sensor_type == "arc" and sensor_data.value > 0:
            arc_result = self.arc_detector.report_arc(
                sensor_data.room_id,
                sensor_data.device_id,
                int(sensor_data.value)
            )
            if arc_result["needs_trip"]:
                self._send_arc_critical_alert(sensor_data, arc_result)
        
        self.logger.debug(f"Analyzed {sensor_data.device_id}: value={sensor_data.value}, alert={is_alert}")

    def _send_alert(self, sensor_data: SensorData, level: str, threshold: float):
        alert = AlertMessage(
            alert_id=str(uuid.uuid4()),
            room_id=sensor_data.room_id,
            device_id=sensor_data.device_id,
            alert_type=f"{sensor_data.sensor_type}_threshold",
            level=level,
            message=f"{sensor_data.sensor_type}异常: 当前值 {sensor_data.value}{sensor_data.unit}, 阈值 {threshold}{sensor_data.unit}",
            value=sensor_data.value,
            threshold=threshold
        )
        
        self.mqtt_client.publish(
            f"{self.alert_topic}/{sensor_data.room_id}",
            alert.to_dict()
        )
        self.mqtt_client.publish(self.alert_topic, alert.to_dict())
        
        self.logger.warning(f"Alert sent: {alert.message}")

    def _send_arc_critical_alert(self, sensor_data: SensorData, arc_result: Dict):
        alert = AlertMessage(
            alert_id=str(uuid.uuid4()),
            room_id=sensor_data.room_id,
            device_id=sensor_data.device_id,
            alert_type="arc_critical",
            level="emergency",
            message=f"电弧故障紧急告警: 10分钟内检测到 {arc_result['arc_count']} 次电弧, 建议立即跳闸",
            value=arc_result['arc_count'],
            threshold=self.arc_detector.critical_threshold
        )
        
        self.mqtt_client.publish(
            f"{self.alert_topic}/{sensor_data.room_id}",
            alert.to_dict()
        )
        self.mqtt_client.publish(self.alert_topic, alert.to_dict())
        
        self.logger.critical(f"Critical arc alert: {sensor_data.device_id}, count={arc_result['arc_count']}")

    def start(self):
        self.logger.info("Starting Electrical Analysis Service...")
        
        self.mqtt_client.connect()
        self.mqtt_client.subscribe(MQTT_TOPIC_SENSOR_DATA, self._on_sensor_data)
        
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        self.api_server.run(port=5001)

    def stop(self):
        self.logger.info("Stopping Electrical Analysis Service...")
        self.mqtt_client.disconnect()
        self.logger.info("Electrical Analysis Service stopped")

    def _signal_handler(self, signum, frame):
        self.logger.info(f"Received signal {signum}")
        self.stop()
        sys.exit(0)


def main():
    service = ElectricalAnalysisService()
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
