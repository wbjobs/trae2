from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
from datetime import datetime
import asyncio
import httpx
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared import (
    Alert, AlertLevel, settings
)

app = FastAPI(title="PV Alert Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AlertManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.alerts: Dict[str, Alert] = {}
        self.acknowledged_alerts: Dict[str, Alert] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, alert: Alert):
        for connection in self.active_connections:
            try:
                await connection.send_json(alert.model_dump())
            except:
                pass

    def add_alert(self, alert: Alert):
        self.alerts[alert.alert_id] = alert
        asyncio.create_task(self.broadcast(alert))

    def acknowledge_alert(self, alert_id: str) -> bool:
        if alert_id in self.alerts:
            alert = self.alerts[alert_id]
            alert.acknowledged = True
            self.acknowledged_alerts[alert_id] = alert
            del self.alerts[alert_id]
            return True
        return False

    def get_active_alerts(self) -> List[Alert]:
        return list(self.alerts.values())

    def get_acknowledged_alerts(self, limit: int = 50) -> List[Alert]:
        return list(self.acknowledged_alerts.values())[-limit:]


alert_manager = AlertManager()


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(alert_checker())


async def alert_checker():
    while True:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{settings.GATEWAY_URL}/devices?type=string")
                devices = response.json()
            
            for device in devices:
                device_id = device["device_id"]
                try:
                    data_resp = await client.get(f"{settings.GATEWAY_URL}/data/latest/{device_id}")
                    if data_resp.status_code == 200:
                        data = data_resp.json()
                        
                        analysis_resp = await client.post(
                            f"http://localhost:8001/analyze",
                            json=data
                        )
                        if analysis_resp.status_code == 200:
                            result = analysis_resp.json()
                            for alert_data in result.get("alerts", []):
                                alert = Alert(**alert_data)
                                if alert.alert_id not in alert_manager.alerts:
                                    alert_manager.add_alert(alert)
                except Exception as e:
                    pass
            
        except Exception as e:
            print(f"Alert checker error: {e}")
        
        await asyncio.sleep(settings.ALERT_CHECK_INTERVAL)


@app.get("/")
async def root():
    return {"service": "PV Alert", "status": "running"}


@app.get("/alerts")
async def get_alerts(include_acknowledged: bool = False):
    active = [a.model_dump() for a in alert_manager.get_active_alerts()]
    
    if include_acknowledged:
        acknowledged = [a.model_dump() for a in alert_manager.get_acknowledged_alerts()]
        return {"active": active, "acknowledged": acknowledged}
    
    return {"active": active}


@app.get("/alerts/active")
async def get_active_alerts():
    alerts = [a.model_dump() for a in alert_manager.get_active_alerts()]
    return {
        "count": len(alerts),
        "alerts": alerts
    }


@app.get("/alerts/acknowledged")
async def get_acknowledged_alerts(limit: int = 50):
    alerts = [a.model_dump() for a in alert_manager.get_acknowledged_alerts(limit)]
    return {
        "count": len(alerts),
        "alerts": alerts
    }


@app.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    success = alert_manager.acknowledge_alert(alert_id)
    if success:
        return {"status": "success", "message": f"Alert {alert_id} acknowledged"}
    raise HTTPException(status_code=404, detail="Alert not found")


@app.post("/alerts/acknowledge/all")
async def acknowledge_all_alerts():
    count = 0
    for alert_id in list(alert_manager.alerts.keys()):
        alert_manager.acknowledge_alert(alert_id)
        count += 1
    return {"status": "success", "acknowledged_count": count}


@app.get("/alerts/level/{level}")
async def get_alerts_by_level(level: AlertLevel):
    filtered = [
        a.model_dump() for a in alert_manager.get_active_alerts()
        if a.level == level
    ]
    return {
        "level": level,
        "count": len(filtered),
        "alerts": filtered
    }


@app.get("/alerts/device/{device_id}")
async def get_alerts_by_device(device_id: str):
    filtered = [
        a.model_dump() for a in alert_manager.get_active_alerts()
        if a.device_id == device_id
    ]
    return {
        "device_id": device_id,
        "count": len(filtered),
        "alerts": filtered
    }


@app.get("/alerts/summary")
async def get_alerts_summary():
    active = alert_manager.get_active_alerts()
    
    summary = {
        "total_active": len(active),
        "by_level": {
            "info": 0,
            "warning": 0,
            "error": 0,
            "critical": 0
        },
        "by_device": {}
    }
    
    for alert in active:
        summary["by_level"][alert.level.value] += 1
        
        if alert.device_id not in summary["by_device"]:
            summary["by_device"][alert.device_id] = 0
        summary["by_device"][alert.device_id] += 1
    
    return summary


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await alert_manager.connect(websocket)
    try:
        for alert in alert_manager.get_active_alerts():
            await websocket.send_json(alert.model_dump())
        
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        alert_manager.disconnect(websocket)


@app.post("/alerts/test")
async def create_test_alert(
    level: AlertLevel = AlertLevel.WARNING,
    device_id: str = "test-device",
    message: str = "Test alert"
):
    import uuid
    alert = Alert(
        alert_id=f"test-{uuid.uuid4().hex[:8]}",
        level=level,
        device_id=device_id,
        device_name=f"设备{device_id}",
        message=message
    )
    alert_manager.add_alert(alert)
    return {"status": "success", "alert": alert.model_dump()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
