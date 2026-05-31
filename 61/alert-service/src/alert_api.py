#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
from typing import Dict
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from .task_dispatcher import TaskPriority, TaskStatus, TaskType


class AlertAPIServer:
    def __init__(self, config: Dict, alert_manager, task_dispatcher=None):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.alert_manager = alert_manager
        self.task_dispatcher = task_dispatcher
        
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
                "service": "alert",
                "requests_handled": self.request_count,
                "errors": self.error_count
            })

        @self.app.route("/api/alerts/active", methods=["GET"])
        def get_active_alerts():
            self.request_count += 1
            try:
                room_id = request.args.get("room_id")
                level = request.args.get("level")
                alerts = self.alert_manager.get_active_alerts(room_id, level)
                return jsonify({"count": len(alerts), "alerts": alerts})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/alerts/history", methods=["GET"])
        def get_alert_history():
            self.request_count += 1
            try:
                limit = request.args.get("limit", 100, type=int)
                alerts = self.alert_manager.get_alert_history(limit)
                return jsonify({"count": len(alerts), "alerts": alerts})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/alerts/<alert_id>/acknowledge", methods=["POST"])
        def acknowledge_alert(alert_id):
            self.request_count += 1
            try:
                success = self.alert_manager.acknowledge_alert(alert_id)
                if success:
                    return jsonify({"message": "Alert acknowledged", "alert_id": alert_id})
                return jsonify({"error": "Alert not found"}), 404
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/alerts/clear", methods=["POST"])
        def clear_alerts():
            self.request_count += 1
            try:
                data = request.json or {}
                room_id = data.get("room_id")
                self.alert_manager.clear_active_alerts(room_id)
                return jsonify({"message": "Active alerts cleared"})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/alerts/channels", methods=["GET"])
        def get_channels():
            self.request_count += 1
            try:
                return jsonify({
                    "channels": list(self.alert_manager.channels.keys())
                })
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/alerts/suppression", methods=["GET"])
        def get_suppression():
            self.request_count += 1
            try:
                return jsonify({
                    "suppression_window_minutes": self.alert_manager.suppression_window.total_seconds() / 60,
                    "last_sent": {
                        k: v.isoformat()
                        for k, v in self.alert_manager.last_sent.items()
                    }
                })
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/alerts/suppression", methods=["PUT"])
        def set_suppression():
            self.request_count += 1
            try:
                data = request.json
                minutes = data.get("minutes", 5)
                self.alert_manager.suppression_window = timedelta(minutes=minutes)
                return jsonify({"message": f"Suppression window set to {minutes} minutes"})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/alerts/test", methods=["POST"])
        def test_alert():
            self.request_count += 1
            try:
                data = request.json or {}
                test_alert = {
                    "alert_id": "test_" + str(int(datetime.now().timestamp())),
                    "room_id": data.get("room_id", "test_room"),
                    "device_id": data.get("device_id", "test_device"),
                    "alert_type": "test",
                    "level": data.get("level", "warning"),
                    "message": data.get("message", "Test alert message"),
                    "timestamp": datetime.now().isoformat()
                }
                
                result = self.alert_manager.process_alert(test_alert)
                return jsonify({"alert": test_alert, "result": result})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks", methods=["GET"])
        def get_tasks():
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                status = request.args.get("status")
                room_id = request.args.get("room_id")
                priority = request.args.get("priority")
                assigned_to = request.args.get("assigned_to")
                
                status_enum = TaskStatus(status) if status else None
                priority_enum = TaskPriority(priority) if priority else None
                
                tasks = self.task_dispatcher.get_tasks(status_enum, room_id, priority_enum, assigned_to)
                task_dicts = [t.to_dict() for t in tasks]
                
                return jsonify({"count": len(task_dicts), "tasks": task_dicts})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks", methods=["POST"])
        def create_task():
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                data = request.json
                task_type = TaskType(data.get("task_type", "investigation"))
                priority = TaskPriority(data.get("priority", "normal"))
                
                task = self.task_dispatcher.create_task(
                    task_type=task_type,
                    title=data["title"],
                    description=data.get("description", ""),
                    room_id=data["room_id"],
                    device_id=data["device_id"],
                    priority=priority,
                    auto_assign=data.get("auto_assign", True)
                )
                
                return jsonify({"task_id": task.task_id, "task": task.to_dict()}), 201
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks/<task_id>", methods=["GET"])
        def get_task(task_id):
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                task = self.task_dispatcher.get_task(task_id)
                if task:
                    return jsonify(task.to_dict())
                return jsonify({"error": "Task not found"}), 404
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks/<task_id>/assign", methods=["POST"])
        def assign_task(task_id):
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                data = request.json or {}
                worker_id = data.get("worker_id")
                
                success = self.task_dispatcher.assign_task(task_id, worker_id)
                if success:
                    return jsonify({"message": "Task assigned", "task_id": task_id})
                return jsonify({"error": "Failed to assign task"}), 400
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks/<task_id>/start", methods=["POST"])
        def start_task(task_id):
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                data = request.json or {}
                worker_id = data.get("worker_id")
                
                success = self.task_dispatcher.start_task(task_id, worker_id)
                if success:
                    return jsonify({"message": "Task started", "task_id": task_id})
                return jsonify({"error": "Failed to start task"}), 400
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks/<task_id>/complete", methods=["POST"])
        def complete_task(task_id):
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                data = request.json or {}
                notes = data.get("notes")
                
                success = self.task_dispatcher.complete_task(task_id, notes)
                if success:
                    return jsonify({"message": "Task completed", "task_id": task_id})
                return jsonify({"error": "Failed to complete task"}), 400
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks/<task_id>/escalate", methods=["POST"])
        def escalate_task(task_id):
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                data = request.json or {}
                reason = data.get("reason")
                
                success = self.task_dispatcher.escalate_task(task_id, reason)
                if success:
                    return jsonify({"message": "Task escalated", "task_id": task_id})
                return jsonify({"error": "Failed to escalate task"}), 400
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks/<task_id>/cancel", methods=["POST"])
        def cancel_task(task_id):
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                data = request.json or {}
                reason = data.get("reason")
                
                success = self.task_dispatcher.cancel_task(task_id, reason)
                if success:
                    return jsonify({"message": "Task cancelled", "task_id": task_id})
                return jsonify({"error": "Failed to cancel task"}), 400
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks/from-alert/<alert_id>", methods=["POST"])
        def create_task_from_alert(alert_id):
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                active_alerts = self.task_dispatcher.config.get("active_alerts", []) if hasattr(self.task_dispatcher, 'config') else []
                alert = None
                
                all_alerts = self.alert_manager.get_active_alerts()
                for a in all_alerts:
                    if a.get("alert_id") == alert_id:
                        alert = a
                        break
                
                if not alert:
                    return jsonify({"error": "Alert not found"}), 404
                
                task = self.task_dispatcher.create_task_from_alert(alert)
                return jsonify({"task_id": task.task_id, "task": task.to_dict()}), 201
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/workers", methods=["GET"])
        def get_workers():
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                workers = self.task_dispatcher.get_workers()
                worker_dicts = [w.to_dict() for w in workers]
                
                return jsonify({"count": len(worker_dicts), "workers": worker_dicts})
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/workers/<worker_id>/tasks", methods=["GET"])
        def get_worker_tasks(worker_id):
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                tasks = self.task_dispatcher.get_worker_tasks(worker_id)
                return jsonify({
                    "worker_id": worker_id,
                    "active": [t.to_dict() for t in tasks["active"]],
                    "history": [t.to_dict() for t in tasks["history"]]
                })
            except Exception as e:
                self.error_count += 1
                return jsonify({"error": str(e)}), 500

        @self.app.route("/api/tasks/stats", methods=["GET"])
        def get_task_stats():
            self.request_count += 1
            try:
                if not self.task_dispatcher:
                    return jsonify({"error": "Task dispatcher not enabled"}), 503
                
                stats = self.task_dispatcher.get_stats()
                return jsonify(stats)
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
                "tasks": self.task_dispatcher.get_stats() if self.task_dispatcher else {}
            })

    def run(self, host: str = "0.0.0.0", port: int = 5003):
        self.logger.info(f"Starting Alert API server on {host}:{port}")
        self.app.run(host=host, port=port, threaded=True)
