#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))


class GatewayAPIServer:
    def __init__(self, config: Dict, data_publisher, collector):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.data_publisher = data_publisher
        self.collector = collector
        
        self.app = Flask(__name__)
        CORS(self.app)
        self._setup_routes()
        
        self.request_count = 0
        self.error_count = 0
        self.start_time = datetime.now()

    def _setup_routes(self):
        @self.app.route("/api/health", methods=["GET"])
        def health_check():
            return jsonify({
                "status": "ok",
                "service": "gateway",
                "uptime_seconds": (datetime.now() - self.start_time).total_seconds(),
                "requests_handled": self.request_count,
                "errors": self.error_count
            })

        @self.app.route("/api/rooms", methods=["GET"])
        def get_rooms():
            self.request_count += 1
            try:
                rooms = self.config.get("rooms", [])
                return jsonify({"rooms": rooms, "total": len(rooms)})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/sensor/latest/<room_id>", methods=["GET"])
        def get_room_sensors(room_id):
            self.request_count += 1
            try:
                data = self.data_publisher.get_all_room_latest(room_id)
                
                sorted_devices = sorted(data.items(), key=lambda x: x[0])
                sorted_data = {device_id: device_data for device_id, device_data in sorted_devices}
                
                return jsonify({
                    "room_id": room_id,
                    "data": sorted_data,
                    "device_count": len(sorted_data),
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                self.error_count += 1
                self.logger.error(f"Error getting room sensors: {e}")
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/sensor/history/<room_id>/<device_id>", methods=["GET"])
        def get_sensor_history(room_id, device_id):
            self.request_count += 1
            try:
                start_time = request.args.get("start", type=float)
                end_time = request.args.get("end", type=float)
                limit = request.args.get("limit", 1000, type=int)
                
                data = self.data_publisher.get_history_data(room_id, device_id, start_time, end_time)
                
                data.sort(key=lambda x: x.get("timestamp", ""))
                
                if len(data) > limit:
                    data = data[-limit:]
                
                return jsonify({
                    "room_id": room_id,
                    "device_id": device_id,
                    "data": data,
                    "count": len(data)
                })
            except Exception as e:
                self.error_count += 1
                self.logger.error(f"Error getting sensor history: {e}")
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/sensor/collect", methods=["POST"])
        def trigger_collection():
            self.request_count += 1
            try:
                data_list = self.collector.collect_all()
                self.data_publisher.publish(data_list)
                return jsonify({
                    "count": len(data_list),
                    "message": "Data collected and published",
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                self.error_count += 1
                self.logger.error(f"Error triggering collection: {e}")
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/sensor/aggregate", methods=["GET"])
        def get_aggregate_data():
            self.request_count += 1
            try:
                room_ids = request.args.getlist("room_ids")
                if not room_ids:
                    room_ids = None
                
                aggregate = self.data_publisher.get_aggregate_data(room_ids)
                
                sorted_rooms = dict(sorted(aggregate["rooms"].items()))
                aggregate["rooms"] = sorted_rooms
                
                return jsonify(aggregate)
            except Exception as e:
                self.error_count += 1
                self.logger.error(f"Error getting aggregate data: {e}")
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/sensor/table", methods=["GET"])
        def get_table_data():
            self.request_count += 1
            try:
                table_data = []
                rooms = self.config.get("rooms", [])
                
                for room in rooms:
                    room_id = room["id"]
                    room_name = room.get("name", room_id)
                    room_data = self.data_publisher.get_all_room_latest(room_id)
                    
                    for device_id in sorted(room_data.keys()):
                        device_data = room_data[device_id]
                        table_data.append({
                            "room_id": room_id,
                            "room_name": room_name,
                            "device_id": device_id,
                            "sensor_type": device_data.get("sensor_type", ""),
                            "value": device_data.get("value", 0),
                            "unit": device_data.get("unit", ""),
                            "timestamp": device_data.get("timestamp", ""),
                            "status": self._get_data_status(device_data)
                        })
                
                table_data.sort(key=lambda x: (x["room_id"], x["device_id"]))
                
                return jsonify({
                    "data": table_data,
                    "total": len(table_data),
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                self.error_count += 1
                self.logger.error(f"Error getting table data: {e}")
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/sensor/validate", methods=["POST"])
        def validate_data():
            self.request_count += 1
            try:
                data = request.json or {}
                issues = []
                
                if "room_id" in data and "device_id" in data:
                    latest = self.data_publisher.get_latest_data(data["room_id"], data["device_id"])
                    if latest:
                        data_time = datetime.fromisoformat(data.get("timestamp", ""))
                        latest_time = datetime.fromisoformat(latest.get("timestamp", ""))
                        
                        time_diff = abs((data_time - latest_time).total_seconds())
                        if time_diff > 300:
                            issues.append(f"Timestamp drift: {time_diff:.1f}s")
                        
                        value_diff = abs(float(data.get("value", 0)) - float(latest.get("value", 0)))
                        if value_diff > 100:
                            issues.append(f"Value anomaly: diff={value_diff:.2f}")
                
                return jsonify({
                    "valid": len(issues) == 0,
                    "issues": issues,
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/stats", methods=["GET"])
        def get_stats():
            return jsonify({
                "requests": {
                    "total": self.request_count,
                    "errors": self.error_count,
                    "success_rate": (
                        (self.request_count - self.error_count) / self.request_count * 100
                        if self.request_count > 0 else 100
                    )
                },
                "publisher": self.data_publisher.get_stats() if hasattr(self.data_publisher, 'get_stats') else {},
                "uptime_seconds": (datetime.now() - self.start_time).total_seconds()
            })

    def _get_data_status(self, data: Dict) -> str:
        try:
            sensor_type = data.get("sensor_type", "")
            value = float(data.get("value", 0))
            
            thresholds = {
                "temperature": {"warning": 40, "critical": 50},
                "humidity": {"warning": 70, "critical": 85},
                "current": {"warning": 80, "critical": 100},
                "voltage": {"warning_low": 200, "warning_high": 240},
                "smoke": {"warning": 30, "critical": 50},
                "arc": {"warning": 1, "critical": 3}
            }
            
            if sensor_type in thresholds:
                th = thresholds[sensor_type]
                if sensor_type == "voltage":
                    if value < th["warning_low"] or value > th["warning_high"]:
                        return "warning"
                elif "critical" in th and value >= th["critical"]:
                    return "critical"
                elif "warning" in th and value >= th["warning"]:
                    return "warning"
            
            return "normal"
        except Exception:
            return "unknown"

    def run(self, host: str = "0.0.0.0", port: int = 5000):
        self.logger.info(f"Starting Gateway API server on {host}:{port}")
        self.app.run(host=host, port=port, threaded=True)
