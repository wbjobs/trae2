from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from datetime import datetime
import paho.mqtt.client as mqtt
import uuid
import json
import sys
import os
from collections import OrderedDict

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared import (
    Command, CommandType, CommandResponse,
    settings
)

app = FastAPI(title="PV Command Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CommandManager:
    def __init__(self):
        self.client = mqtt.Client(client_id=f"pv-command-{uuid.uuid4().hex[:8]}")
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect
        self.pending_commands = OrderedDict()
        self.command_history = OrderedDict()
        self.MAX_HISTORY = 500
        self.PENDING_TIMEOUT = 60
        self._lock = __import__('threading').Lock()

    def on_connect(self, client, userdata, flags, rc):
        print(f"MQTT Connected with code {rc}")
        client.subscribe(f"{settings.MQTT_TOPIC_RESPONSE}/#")
        client.subscribe(f"{settings.MQTT_TOPIC_COMMAND}/+/response")

    def on_disconnect(self, client, userdata, rc):
        print(f"MQTT Disconnected with code {rc}, reconnecting...")
        if rc != 0:
            try:
                client.reconnect()
            except Exception as e:
                print(f"Reconnect failed: {e}")

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
            
            if "command_id" in payload and "success" in payload:
                response = CommandResponse(**payload)
                cmd_id = response.command_id
                
                with self._lock:
                    if cmd_id in self.pending_commands:
                        self.pending_commands[cmd_id]["status"] = "completed"
                        self.pending_commands[cmd_id]["response"] = response.model_dump()
                        self.pending_commands[cmd_id]["completed_at"] = datetime.now().isoformat()
                        print(f"Command {cmd_id} completed: {response.message}")
                    elif cmd_id in self.command_history:
                        self.command_history[cmd_id]["status"] = "completed"
                        self.command_history[cmd_id]["response"] = response.model_dump()
        except Exception as e:
            print(f"Error processing MQTT message: {e}")

    def connect(self):
        try:
            self.client.will_set(
                f"{settings.MQTT_TOPIC_COMMAND}/status",
                json.dumps({"status": "offline", "service": "command"}),
                qos=1,
                retain=True
            )
            self.client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, 60)
            self.client.loop_start()
            self.client.publish(
                f"{settings.MQTT_TOPIC_COMMAND}/status",
                json.dumps({"status": "online", "service": "command", "timestamp": datetime.now().isoformat()}),
                qos=1,
                retain=True
            )
            print("Command service connected to MQTT broker")
        except Exception as e:
            print(f"MQTT Connection error: {e}")

    def disconnect(self):
        try:
            self.client.publish(
                f"{settings.MQTT_TOPIC_COMMAND}/status",
                json.dumps({"status": "offline", "service": "command", "timestamp": datetime.now().isoformat()}),
                qos=1,
                retain=True
            )
        except:
            pass
        self.client.loop_stop()
        self.client.disconnect()

    def send_command(self, command: Command) -> tuple:
        try:
            payload = command.model_dump_json()
            topic = f"{settings.MQTT_TOPIC_COMMAND}/{command.device_id}"
            
            result = self.client.publish(topic, payload, qos=2)
            result.wait_for_publish(timeout=5)
            
            if not result.is_published():
                print(f"Failed to publish command {command.command_id}")
                return False, "MQTT publish failed"
            
            with self._lock:
                cmd_entry = {
                    "command": command.model_dump(),
                    "status": "sent",
                    "sent_at": datetime.now().isoformat(),
                    "topic": topic
                }
                self.pending_commands[command.command_id] = cmd_entry
                self.command_history[command.command_id] = cmd_entry
                
                while len(self.command_history) > self.MAX_HISTORY:
                    self.command_history.popitem(last=False)
            
            print(f"Command sent: {command.command_type} -> {command.device_id}")
            return True, command.command_id
            
        except Exception as e:
            print(f"Error sending command: {e}")
            return False, str(e)

    def get_pending_commands(self, device_id: Optional[str] = None) -> list:
        with self._lock:
            now = datetime.now()
            expired = []
            for cmd_id, cmd in self.pending_commands.items():
                if device_id and cmd["command"]["device_id"] != device_id:
                    continue
                try:
                    sent_time = datetime.fromisoformat(cmd["sent_at"])
                    if (now - sent_time).total_seconds() > self.PENDING_TIMEOUT:
                        cmd["status"] = "timeout"
                        expired.append(cmd_id)
                except:
                    pass
            
            for cmd_id in expired:
                if cmd_id in self.pending_commands:
                    self.command_history[cmd_id] = self.pending_commands[cmd_id]
                    del self.pending_commands[cmd_id]
            
            if device_id:
                return [
                    cmd for cmd in self.pending_commands.values()
                    if cmd["command"]["device_id"] == device_id
                ]
            return list(self.pending_commands.values())


cmd_manager = CommandManager()


@app.on_event("startup")
async def startup_event():
    cmd_manager.connect()


@app.on_event("shutdown")
async def shutdown_event():
    cmd_manager.disconnect()


@app.get("/")
async def root():
    return {"service": "PV Command", "status": "running"}


@app.post("/command/send")
async def send_command(
    device_id: str,
    command_type: CommandType,
    issued_by: str,
    parameters: Optional[dict] = None
):
    command = Command(
        command_id=str(uuid.uuid4()),
        device_id=device_id,
        command_type=command_type,
        parameters=parameters or {},
        issued_by=issued_by
    )
    
    success, result = cmd_manager.send_command(command)
    
    if success:
        return {
            "status": "success",
            "command_id": result,
            "device_id": device_id,
            "command_type": command_type.value,
            "message": f"Command {command_type.value} sent to device {device_id}"
        }
    else:
        raise HTTPException(status_code=500, detail=f"Failed to send command: {result}")


@app.post("/command/reset/{device_id}")
async def reset_device(device_id: str, issued_by: str):
    return await send_command(device_id, CommandType.RESET, issued_by)


@app.post("/command/calibrate/{device_id}")
async def calibrate_device(device_id: str, issued_by: str):
    return await send_command(device_id, CommandType.CALIBRATE, issued_by)


@app.post("/command/shutdown/{device_id}")
async def shutdown_device(device_id: str, issued_by: str):
    return await send_command(device_id, CommandType.SHUTDOWN, issued_by)


@app.post("/command/startup/{device_id}")
async def startup_device(device_id: str, issued_by: str):
    return await send_command(device_id, CommandType.STARTUP, issued_by)


@app.post("/command/set_param/{device_id}")
async def set_device_parameter(
    device_id: str,
    param_name: str,
    param_value: float,
    issued_by: str
):
    params = {param_name: param_value}
    return await send_command(device_id, CommandType.SET_PARAM, issued_by, params)


@app.get("/command/pending")
async def get_pending_commands():
    return {
        "pending_count": len(cmd_manager.pending_commands),
        "commands": list(cmd_manager.pending_commands.values())
    }


@app.get("/command/history")
async def get_command_history(limit: int = 50):
    return {
        "history_count": len(cmd_manager.command_history),
        "commands": cmd_manager.command_history[-limit:]
    }


@app.get("/command/{command_id}")
async def get_command_status(command_id: str):
    if command_id in cmd_manager.pending_commands:
        return cmd_manager.pending_commands[command_id]
    
    for cmd in cmd_manager.command_history:
        if cmd["command"]["command_id"] == command_id:
            return cmd
    
    raise HTTPException(status_code=404, detail="Command not found")


@app.post("/command/broadcast")
async def broadcast_command(
    command_type: CommandType,
    issued_by: str,
    parameters: Optional[dict] = None
):
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{settings.GATEWAY_URL}/devices?type=string")
            devices = response.json()
        
        sent_commands = []
        for device in devices:
            command = Command(
                command_id=str(uuid.uuid4()),
                device_id=device["device_id"],
                command_type=command_type,
                parameters=parameters or {},
                issued_by=issued_by
            )
            if cmd_manager.send_command(command):
                sent_commands.append(command.command_id)
        
        return {
            "status": "success",
            "broadcast_count": len(sent_commands),
            "command_ids": sent_commands
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/command/types")
async def get_command_types():
    return {
        "types": [cmd_type.value for cmd_type in CommandType],
        "descriptions": {
            "reset": "重置设备",
            "calibrate": "校准设备",
            "shutdown": "关闭设备",
            "startup": "启动设备",
            "set_param": "设置参数"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
