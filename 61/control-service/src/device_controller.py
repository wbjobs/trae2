#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import logging
import sys
import os
import time
import threading
import queue
import uuid
from typing import Dict, Optional, Callable
from datetime import datetime
from collections import defaultdict

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
from common.src.models import ControlCommand


class CommandPriority:
    EMERGENCY = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3


class DeviceController:
    def __init__(self, config: Dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.trip_delay = config.get("control", {}).get("trip_delay_seconds", 2)
        self.auto_recovery = config.get("control", {}).get("auto_recovery", False)
        self.max_retry = config.get("control", {}).get("max_retry_attempts", 3)
        self.worker_count = config.get("control", {}).get("worker_count", 4)
        self.max_queue_size = config.get("control", {}).get("max_queue_size", 1000)
        
        self.device_states: Dict[str, Dict] = {}
        self.pending_commands: Dict[str, ControlCommand] = {}
        self.command_history: Dict[str, list] = {}
        self.command_callbacks: Dict[str, Callable] = {}
        
        self.command_queue: queue.PriorityQueue = queue.PriorityQueue(maxsize=self.max_queue_size)
        self.worker_threads: list = []
        self.running = False
        
        self.stats = {
            "total_commands": 0,
            "emergency_count": 0,
            "high_count": 0,
            "normal_count": 0,
            "low_count": 0,
            "dropped_count": 0,
            "avg_execution_time_ms": 0,
            "total_execution_time_ms": 0
        }

    def start(self):
        if self.running:
            return
        
        self.running = True
        for i in range(self.worker_count):
            thread = threading.Thread(target=self._worker_loop, args=(i,), daemon=True)
            thread.start()
            self.worker_threads.append(thread)
        
        self.logger.info(f"Device controller started with {self.worker_count} workers")

    def stop(self):
        self.running = False
        for thread in self.worker_threads:
            thread.join(timeout=5)
        self.logger.info(f"Device controller stopped. Stats: {self.stats}")

    def _init_device_state(self, device_id: str, room_id: str):
        if device_id not in self.device_states:
            self.device_states[device_id] = {
                "device_id": device_id,
                "room_id": room_id,
                "status": "online",
                "breaker_status": "closed",
                "last_trip_time": None,
                "trip_count": 0,
                "config": {}
            }

    def execute_command(self, command: ControlCommand) -> Dict:
        device_id = command.device_id
        room_id = command.room_id
        self._init_device_state(device_id, room_id)
        
        cmd_type = command.command_type
        
        handlers = {
            "trip": self._handle_trip,
            "close": self._handle_close,
            "config": self._handle_config,
            "reset": self._handle_reset
        }
        
        if cmd_type in handlers:
            start_time = time.time()
            result = handlers[cmd_type](command)
            execution_time = (time.time() - start_time) * 1000
            
            self.stats["total_execution_time_ms"] += execution_time
            self.stats["avg_execution_time_ms"] = (
                self.stats["total_execution_time_ms"] / self.stats["total_commands"]
                if self.stats["total_commands"] > 0 else 0
            )
            
            self._record_command(command, result)
            return result
        
        return {"success": False, "error": f"Unknown command type: {cmd_type}"}

    def execute_command_async(self, command: ControlCommand, priority: int = CommandPriority.NORMAL,
                              callback: Optional[Callable] = None) -> str:
        command_id = command.command_id or str(uuid.uuid4())
        if command.command_id is None:
            command.command_id = command_id
        
        if callback:
            self.command_callbacks[command_id] = callback
        
        try:
            self.command_queue.put_nowait((priority, time.time(), command))
            
            if priority == CommandPriority.EMERGENCY:
                self.stats["emergency_count"] += 1
            elif priority == CommandPriority.HIGH:
                self.stats["high_count"] += 1
            elif priority == CommandPriority.LOW:
                self.stats["low_count"] += 1
            else:
                self.stats["normal_count"] += 1
            
            self.stats["total_commands"] += 1
            
            return command_id
        except queue.Full:
            self.stats["dropped_count"] += 1
            self.logger.error(f"Command queue full! Dropping command: {command_id}")
            return ""

    def _worker_loop(self, worker_id: int):
        self.logger.debug(f"Worker {worker_id} started")
        while self.running:
            try:
                priority, enqueue_time, command = self.command_queue.get(timeout=0.5)
                
                wait_time = (time.time() - enqueue_time) * 1000
                if wait_time > 100:
                    self.logger.warning(
                        f"Command {command.command_id} waited {wait_time:.0f}ms in queue"
                    )
                
                result = self.execute_command(command)
                
                callback = self.command_callbacks.pop(command.command_id, None)
                if callback:
                    try:
                        callback(command, result)
                    except Exception as e:
                        self.logger.error(f"Callback error: {e}")
                        
            except queue.Empty:
                continue
            except Exception as e:
                self.logger.error(f"Worker {worker_id} error: {e}")

    def _handle_trip(self, command: ControlCommand) -> Dict:
        device_id = command.device_id
        state = self.device_states[device_id]
        
        if state["breaker_status"] == "tripped":
            return {"success": True, "message": "Device already tripped", "status": "tripped"}
        
        reason = command.params.get("reason", "manual")
        is_emergency = reason == "emergency" or command.command_type == "emergency_trip"
        
        if self.trip_delay > 0 and not is_emergency:
            self.logger.info(f"Delaying trip for {device_id} by {self.trip_delay}s (async)")
            state["breaker_status"] = "pending_trip"
            
            def delayed_trip():
                try:
                    time.sleep(self.trip_delay)
                    if device_id in self.device_states and self.device_states[device_id]["breaker_status"] == "pending_trip":
                        self._perform_trip(device_id, reason)
                except Exception as e:
                    self.logger.error(f"Delayed trip error for {device_id}: {e}")
            
            threading.Thread(target=delayed_trip, daemon=True).start()
            
            return {
                "success": True,
                "command": "trip",
                "device_id": device_id,
                "status": "pending_trip",
                "delay_seconds": self.trip_delay,
                "reason": reason,
                "timestamp": datetime.now().isoformat()
            }
        
        return self._perform_trip(device_id, reason)

    def _perform_trip(self, device_id: str, reason: str) -> Dict:
        if device_id not in self.device_states:
            return {"success": False, "error": f"Device {device_id} not found"}
        
        state = self.device_states[device_id]
        state["breaker_status"] = "tripped"
        state["last_trip_time"] = datetime.now()
        state["trip_count"] += 1
        
        self.logger.warning(f"Device {device_id} tripped. Reason: {reason}")
        
        if self.auto_recovery and reason != "emergency":
            threading.Timer(60, self._auto_recovery, args=[device_id]).start()
        
        return {
            "success": True,
            "command": "trip",
            "device_id": device_id,
            "status": "tripped",
            "reason": reason,
            "timestamp": datetime.now().isoformat()
        }

    def _handle_close(self, command: ControlCommand) -> Dict:
        device_id = command.device_id
        state = self.device_states[device_id]
        
        if state["breaker_status"] == "closed":
            return {"success": True, "message": "Device already closed", "status": "closed"}
        
        state["breaker_status"] = "closed"
        
        self.logger.info(f"Device {device_id} closed")
        
        return {
            "success": True,
            "command": "close",
            "device_id": device_id,
            "status": "closed",
            "timestamp": datetime.now().isoformat()
        }

    def _handle_config(self, command: ControlCommand) -> Dict:
        device_id = command.device_id
        state = self.device_states[device_id]
        
        config_params = command.params
        state["config"].update(config_params)
        
        self.logger.info(f"Device {device_id} config updated: {config_params}")
        
        return {
            "success": True,
            "command": "config",
            "device_id": device_id,
            "config": state["config"],
            "timestamp": datetime.now().isoformat()
        }

    def _handle_reset(self, command: ControlCommand) -> Dict:
        device_id = command.device_id
        state = self.device_states[device_id]
        
        state["breaker_status"] = "closed"
        state["trip_count"] = 0
        
        self.logger.info(f"Device {device_id} reset")
        
        return {
            "success": True,
            "command": "reset",
            "device_id": device_id,
            "status": "closed",
            "trip_count": 0,
            "timestamp": datetime.now().isoformat()
        }

    def _auto_recovery(self, device_id: str):
        if device_id in self.device_states:
            state = self.device_states[device_id]
            if state["breaker_status"] == "tripped":
                self.logger.info(f"Auto-recovering device {device_id}")
                state["breaker_status"] = "closed"

    def _record_command(self, command: ControlCommand, result: Dict):
        device_id = command.device_id
        if device_id not in self.command_history:
            self.command_history[device_id] = []
        
        self.command_history[device_id].append({
            "command": command.to_dict(),
            "result": result,
            "timestamp": datetime.now().isoformat()
        })
        
        if len(self.command_history[device_id]) > 100:
            self.command_history[device_id] = self.command_history[device_id][-100:]

    def get_device_state(self, device_id: str) -> Dict:
        return self.device_states.get(device_id, {})

    def get_room_devices(self, room_id: str) -> Dict[str, Dict]:
        return {
            device_id: state
            for device_id, state in self.device_states.items()
            if state["room_id"] == room_id
        }

    def get_command_history(self, device_id: str, limit: int = 10) -> list:
        history = self.command_history.get(device_id, [])
        return history[-limit:]

    def get_all_devices_summary(self) -> Dict:
        summary = {
            "total_devices": len(self.device_states),
            "by_room": defaultdict(lambda: {"total": 0, "tripped": 0, "closed": 0}),
            "by_status": {"online": 0, "offline": 0, "tripped": 0}
        }
        
        for device_id, state in self.device_states.items():
            room_id = state["room_id"]
            summary["by_room"][room_id]["total"] += 1
            
            if state["breaker_status"] == "tripped":
                summary["by_room"][room_id]["tripped"] += 1
                summary["by_status"]["tripped"] += 1
            else:
                summary["by_room"][room_id]["closed"] += 1
            
            if state["status"] == "online":
                summary["by_status"]["online"] += 1
            else:
                summary["by_status"]["offline"] += 1
        
        return summary

    def get_stats(self) -> Dict:
        return {
            **self.stats,
            "queue_size": self.command_queue.qsize(),
            "worker_count": self.worker_count,
            "device_states_count": len(self.device_states),
            "pending_callbacks": len(self.command_callbacks)
        }

    def get_command_status(self, command_id: str) -> Optional[Dict]:
        for device_id, history in self.command_history.items():
            for entry in history:
                if entry["command"].get("command_id") == command_id:
                    return entry
        return None
