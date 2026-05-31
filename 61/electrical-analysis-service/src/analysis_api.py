#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
from typing import Dict
from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))


class AnalysisAPIServer:
    def __init__(self, config: Dict, threshold_detector, data_processor, arc_detector,
                 load_forecaster=None, data_aggregator=None):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.threshold_detector = threshold_detector
        self.data_processor = data_processor
        self.arc_detector = arc_detector
        self.load_forecaster = load_forecaster
        self.data_aggregator = data_aggregator
        
        self.app = Flask(__name__)
        CORS(self.app)
        self._setup_routes()
        
        self.request_count = 0
        self.error_count = 0

    def _setup_routes(self):
        @self.app.route("/api/health", methods=["GET"])
        def health_check():
            return jsonify({
                "status": "ok",
                "service": "electrical-analysis",
                "requests_handled": self.request_count,
                "errors": self.error_count
            })

        @self.app.route("/api/thresholds", methods=["GET"])
        def get_thresholds():
            self.request_count += 1
            try:
                sensor_type = request.args.get("type")
                if sensor_type:
                    config = self.threshold_detector.get_threshold_config(sensor_type)
                    return jsonify({"sensor_type": sensor_type, "thresholds": config})
                return jsonify({"thresholds": self.threshold_detector.thresholds})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/thresholds/<sensor_type>", methods=["PUT"])
        def update_thresholds(sensor_type):
            self.request_count += 1
            try:
                data = request.json
                if sensor_type in self.threshold_detector.thresholds:
                    self.threshold_detector.thresholds[sensor_type].update(data)
                    return jsonify({"message": "Thresholds updated", "thresholds": self.threshold_detector.thresholds[sensor_type]})
                return jsonify({"error": "Sensor type not found"}), 404
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/arc/status/<room_id>/<device_id>", methods=["GET"])
        def get_arc_status(room_id, device_id):
            self.request_count += 1
            try:
                status = self.arc_detector.get_arc_status(room_id, device_id)
                return jsonify(status)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/arc/reset/<room_id>/<device_id>", methods=["POST"])
        def reset_arc_events(room_id, device_id):
            self.request_count += 1
            try:
                self.arc_detector.reset_arc_events(room_id, device_id)
                return jsonify({"message": "Arc events reset"})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/stats/<room_id>/<device_id>", methods=["GET"])
        def get_stats(room_id, device_id):
            self.request_count += 1
            try:
                count = request.args.get("count", 10, type=int)
                recent_data = self.data_processor.get_recent_data(room_id, device_id, count)
                return jsonify({
                    "room_id": room_id,
                    "device_id": device_id,
                    "recent_data": recent_data
                })
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/analyze", methods=["POST"])
        def analyze_data():
            self.request_count += 1
            try:
                from common.src.models import SensorData
                data = request.json
                sensor_data = SensorData.from_dict(data)
                
                processed = self.data_processor.process(sensor_data)
                is_alert, level, threshold = self.threshold_detector.check_threshold(sensor_data)
                is_anomaly = self.data_processor.detect_anomaly(sensor_data)
                
                if self.data_aggregator:
                    self.data_aggregator.add_data_point(
                        sensor_data.room_id,
                        sensor_data.device_id,
                        sensor_data.sensor_type,
                        sensor_data.value
                    )
                
                if self.load_forecaster:
                    self.load_forecaster.add_data(
                        sensor_data.room_id,
                        sensor_data.device_id,
                        sensor_data.value
                    )
                
                arc_result = None
                if sensor_data.sensor_type == "arc" and sensor_data.value > 0:
                    arc_result = self.arc_detector.report_arc(
                        sensor_data.room_id,
                        sensor_data.device_id,
                        int(sensor_data.value)
                    )
                
                return jsonify({
                    "processed": processed,
                    "threshold_check": {
                        "is_alert": is_alert,
                        "level": level,
                        "threshold": threshold
                    },
                    "is_anomaly": is_anomaly,
                    "arc_analysis": arc_result
                })
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/forecast/<room_id>/<device_id>", methods=["GET"])
        def get_load_forecast(room_id, device_id):
            self.request_count += 1
            try:
                if not self.load_forecaster:
                    return jsonify({"error": "Load forecasting not enabled"}), 503
                
                steps = request.args.get("steps", 30, type=int)
                prediction = self.load_forecaster.predict_ensemble(room_id, device_id, steps)
                return jsonify(prediction)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/forecast/peaks", methods=["GET"])
        def get_peak_alerts():
            self.request_count += 1
            try:
                if not self.load_forecaster:
                    return jsonify({"error": "Load forecasting not enabled"}), 503
                
                alerts = self.load_forecaster.get_peak_alerts()
                return jsonify({"count": len(alerts), "alerts": alerts})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/forecast/summary", methods=["GET"])
        def get_forecast_summary():
            self.request_count += 1
            try:
                if not self.load_forecaster:
                    return jsonify({"error": "Load forecasting not enabled"}), 503
                
                room_id = request.args.get("room_id")
                summary = self.load_forecaster.get_load_summary(room_id)
                return jsonify(summary)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/aggregate/stats/<room_id>/<device_id>/<sensor_type>", methods=["GET"])
        def get_aggregation_stats(room_id, device_id, sensor_type):
            self.request_count += 1
            try:
                if not self.data_aggregator:
                    return jsonify({"error": "Data aggregation not enabled"}), 503
                
                stats = self.data_aggregator.get_statistics(room_id, device_id, sensor_type)
                if stats:
                    return jsonify(stats)
                return jsonify({"error": "No data available"}), 404
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/aggregate/window/<room_id>/<device_id>/<sensor_type>", methods=["GET"])
        def get_window_aggregation(room_id, device_id, sensor_type):
            self.request_count += 1
            try:
                if not self.data_aggregator:
                    return jsonify({"error": "Data aggregation not enabled"}), 503
                
                window = request.args.get("window", 300, type=int)
                start = request.args.get("start", type=float)
                end = request.args.get("end", type=float)
                
                aggregation = self.data_aggregator.aggregate_time_window(
                    room_id, device_id, sensor_type, window, start, end
                )
                return jsonify(aggregation)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/aggregate/room/<room_id>", methods=["GET"])
        def get_room_aggregation(room_id):
            self.request_count += 1
            try:
                if not self.data_aggregator:
                    return jsonify({"error": "Data aggregation not enabled"}), 503
                
                sensor_type = request.args.get("sensor_type")
                aggregation = self.data_aggregator.aggregate_room(room_id, sensor_type)
                return jsonify(aggregation)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/aggregate/global", methods=["GET"])
        def get_global_aggregation():
            self.request_count += 1
            try:
                if not self.data_aggregator:
                    return jsonify({"error": "Data aggregation not enabled"}), 503
                
                sensor_type = request.args.get("sensor_type")
                aggregation = self.data_aggregator.aggregate_all_rooms(sensor_type)
                return jsonify(aggregation)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/aggregate/trend/<room_id>/<device_id>/<sensor_type>", methods=["GET"])
        def get_trend_analysis(room_id, device_id, sensor_type):
            self.request_count += 1
            try:
                if not self.data_aggregator:
                    return jsonify({"error": "Data aggregation not enabled"}), 503
                
                window = request.args.get("window", 300, type=int)
                trend = self.data_aggregator.get_trend(room_id, device_id, sensor_type, window)
                return jsonify(trend)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/aggregate/anomalies/<room_id>/<device_id>/<sensor_type>", methods=["GET"])
        def get_anomalies(room_id, device_id, sensor_type):
            self.request_count += 1
            try:
                if not self.data_aggregator:
                    return jsonify({"error": "Data aggregation not enabled"}), 503
                
                threshold = request.args.get("threshold", 3.0, type=float)
                anomalies = self.data_aggregator.get_anomalies(room_id, device_id, sensor_type, threshold)
                return jsonify({"count": len(anomalies), "anomalies": anomalies})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/aggregate/cache/clear", methods=["POST"])
        def clear_cache():
            self.request_count += 1
            try:
                if not self.data_aggregator:
                    return jsonify({"error": "Data aggregation not enabled"}), 503
                
                pattern = request.json.get("pattern") if request.is_json else None
                self.data_aggregator.invalidate_cache(pattern)
                return jsonify({"message": "Cache cleared"})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/stats", methods=["GET"])
        def get_service_stats():
            return jsonify({
                "requests": {
                    "total": self.request_count,
                    "errors": self.error_count
                },
                "forecaster": self.load_forecaster.get_stats() if self.load_forecaster else {},
                "aggregator": self.data_aggregator.get_stats() if self.data_aggregator else {}
            })

    def run(self, host: str = "0.0.0.0", port: int = 5001):
        self.logger.info(f"Starting Analysis API server on {host}:{port}")
        self.app.run(host=host, port=port, threaded=True)
