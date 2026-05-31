#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import uuid
import time
from typing import Dict, Optional
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.models import ControlCommand
from .device_controller import CommandPriority


class ControlAPIServer:
    def __init__(self, config: Dict, device_controller, auto_trip_engine, mqtt_client, control_topic):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.device_controller = device_controller
        self.auto_trip_engine = auto_trip_engine
        self.mqtt_client = mqtt_client
        self.control_topic = control_topic
        
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
                "service": "control",
                "uptime_seconds": (datetime.now() - self.start_time).total_seconds(),
                "requests_handled": self.request_count,
                "errors": self.error_count
            })

        @self.app.route("/api/device/<device_id>/state", methods=["GET"])
        def get_device_state(device_id):
            self.request_count += 1
            try:
                state = self.device_controller.get_device_state(device_id)
                return jsonify({"device_id": device_id, "state": state})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/room/<room_id>/devices", methods=["GET"])
        def get_room_devices(room_id):
            self.request_count += 1
            try:
                devices = self.device_controller.get_room_devices(room_id)
                return jsonify({
                    "room_id": room_id,
                    "devices": devices,
                    "count": len(devices)
                })
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/devices/summary", methods=["GET"])
        def get_devices_summary():
            self.request_count += 1
            try:
                summary = self.device_controller.get_all_devices_summary()
                return jsonify(summary)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/command", methods=["POST"])
        def send_command():
            self.request_count += 1
            try:
                data = request.json
                async_mode = data.pop("async", False)
                priority_str = data.pop("priority", "normal").lower()
                
                priority_map = {
                    "emergency": CommandPriority.EMERGENCY,
                    "high": CommandPriority.HIGH,
                    "normal": CommandPriority.NORMAL,
                    "low": CommandPriority.LOW
                }
                priority = priority_map.get(priority_str, CommandPriority.NORMAL)
                
                command = ControlCommand(
                    command_id=data.get("command_id", str(uuid.uuid4())),
                    room_id=data["room_id"],
                    device_id=data["device_id"],
                    command_type=data["command_type"],
                    params=data.get("params", {}),
                    issued_by=data.get("issued_by", "user")
                )
                
                if async_mode or priority == CommandPriority.EMERGENCY:
                    command_id = self.device_controller.execute_command_async(
                        command, priority
                    )
                    
                    self.mqtt_client.publish(
                        f"{self.control_topic}/{command.room_id}/{command.device_id}",
                        command.to_dict()
                    )
                    self.mqtt_client.publish(self.control_topic, command.to_dict())
                    
                    return jsonify({
                        "status": "queued",
                        "command_id": command_id,
                        "priority": priority_str,
                        "command": command.to_dict()
                    }), 202
                else:
                    self.mqtt_client.publish(
                        f"{self.control_topic}/{command.room_id}/{command.device_id}",
                        command.to_dict()
                    )
                    self.mqtt_client.publish(self.control_topic, command.to_dict())
                    
                    result = self.device_controller.execute_command(command)
                    
                    return jsonify({
                        "status": "executed",
                        "command": command.to_dict(),
                        "result": result
                    })
            except Exception as e:
                self.error_count += 1
                self.logger.error(f"Error sending command: {e}")
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/command/<command_id>/status", methods=["GET"])
        def get_command_status(command_id):
            self.request_count += 1
            try:
                status = self.device_controller.get_command_status(command_id)
                if status:
                    return jsonify({"command_id": command_id, "status": status})
                return jsonify({"command_id": command_id, "status": "not_found"}), 404
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/device/<device_id>/trip", methods=["POST"])
        def trip_device(device_id):
            self.request_count += 1
            try:
                data = request.json or {}
                room_id = data.get("room_id", "default")
                reason = data.get("reason", "manual")
                is_emergency = data.get("emergency", False)
                
                command = ControlCommand(
                    command_id=str(uuid.uuid4()),
                    room_id=room_id,
                    device_id=device_id,
                    command_type="emergency_trip" if is_emergency else "trip",
                    params={"reason": reason},
                    issued_by="user"
                )
                
                priority = CommandPriority.EMERGENCY if is_emergency else CommandPriority.HIGH
                
                self.mqtt_client.publish(f"{self.control_topic}/{room_id}/{device_id}", command.to_dict())
                
                if is_emergency:
                    result = self.device_controller.execute_command(command)
                else:
                    command_id = self.device_controller.execute_command_async(command, priority)
                    return jsonify({
                        "status": "queued",
                        "command_id": command_id,
                        "device_id": device_id
                    }), 202
                
                return jsonify(result)
            except Exception as e:
                self.error_count += 1
                self.logger.error(f"Error tripping device: {e}")
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/device/<device_id>/close", methods=["POST"])
        def close_device(device_id):
            self.request_count += 1
            try:
                data = request.json or {}
                room_id = data.get("room_id", "default")
                
                command = ControlCommand(
                    command_id=str(uuid.uuid4()),
                    room_id=room_id,
                    device_id=device_id,
                    command_type="close",
                    params={},
                    issued_by="user"
                )
                
                self.mqtt_client.publish(f"{self.control_topic}/{room_id}/{device_id}", command.to_dict())
                result = self.device_controller.execute_command(command)
                
                return jsonify(result)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/device/<device_id>/config", methods=["PUT"])
        def config_device(device_id):
            self.request_count += 1
            try:
                data = request.json
                room_id = data.pop("room_id", "default")
                
                command = ControlCommand(
                    command_id=str(uuid.uuid4()),
                    room_id=room_id,
                    device_id=device_id,
                    command_type="config",
                    params=data,
                    issued_by="user"
                )
                
                self.mqtt_client.publish(f"{self.control_topic}/{room_id}/{device_id}", command.to_dict())
                result = self.device_controller.execute_command(command)
                
                return jsonify(result)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/device/<device_id>/history", methods=["GET"])
        def get_command_history(device_id):
            self.request_count += 1
            try:
                limit = request.args.get("limit", 10, type=int)
                history = self.device_controller.get_command_history(device_id, limit)
                return jsonify({"device_id": device_id, "history": history})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/autotrip/status", methods=["GET"])
        def get_autotrip_status():
            self.request_count += 1
            try:
                status = self.auto_trip_engine.get_status()
                return jsonify(status)
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/autotrip/enable", methods=["POST"])
        def enable_autotrip():
            self.request_count += 1
            try:
                self.auto_trip_engine.enable_auto_trip()
                return jsonify({"message": "Auto-trip enabled"})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/autotrip/disable", methods=["POST"])
        def disable_autotrip():
            self.request_count += 1
            try:
                self.auto_trip_engine.disable_auto_trip()
                return jsonify({"message": "Auto-trip disabled"})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/autotrip/cooldown", methods=["PUT"])
        def set_cooldown():
            self.request_count += 1
            try:
                data = request.json
                minutes = data.get("minutes", 5)
                self.auto_trip_engine.set_cooldown(minutes)
                return jsonify({"message": f"Cooldown set to {minutes} minutes"})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/stats", methods=["GET"])
        def get_stats():
            return jsonify({
                "requests": {
                    "total": self.request_count,
                    "errors": self.error_count
                },
                "controller": self.device_controller.get_stats(),
                "mqtt": self.mqtt_client.get_stats() if hasattr(self.mqtt_client, 'get_stats') else {},
                "uptime_seconds": (datetime.now() - self.start_time).total_seconds()
            })

    def run(self, host: str = "0.0.0.0", port: int = 5002):
        self.logger.info(f"Starting Control API server on {host}:{port}")
        self.app.run(host=host, port=port, threaded=True)
