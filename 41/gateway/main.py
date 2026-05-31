from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import uuid
import asyncio
import threading
import sys
import os
from collections import defaultdict

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared import (
    PVStringData, DeviceStatus, TopologyNode,
    StationSummary, Alert, AlertLevel
)
from database import get_db, init_db, PVStringDataDB, DeviceDB, StationSummaryDB, get_db_session
from mqtt_client import mqtt_client

app = FastAPI(title="PV Gateway Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_connections: List[WebSocket] = []
ws_lock = asyncio.Lock()
data_buffer: Dict[str, List[PVStringData]] = defaultdict(list)
buffer_lock = threading.Lock()
BUFFER_MAX_SIZE = 100
WS_BATCH_INTERVAL = 0.5
ws_batch_buffer: List[dict] = []
ws_batch_lock = asyncio.Lock()


@app.on_event("startup")
async def startup_event():
    init_db()
    mqtt_client.connect()
    mqtt_client.register_data_callback(store_data)
    seed_devices()
    asyncio.create_task(batch_broadcast_task())


@app.on_event("shutdown")
async def shutdown_event():
    mqtt_client.disconnect()


def seed_devices():
    with get_db_session() as db:
        if db.query(DeviceDB).count() == 0:
            devices = [
                DeviceDB(
                    device_id="station-beijing",
                    device_name="北京光伏电站",
                    device_type="station",
                    status="online",
                    location="北京市朝阳区",
                    region="beijing",
                    parent_id=None,
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="station-shanghai",
                    device_name="上海光伏电站",
                    device_type="station",
                    status="online",
                    location="上海市浦东新区",
                    region="shanghai",
                    parent_id=None,
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="inverter-001",
                    device_name="逆变器A01",
                    device_type="inverter",
                    status="online",
                    location="北京电站-1区",
                    region="beijing",
                    parent_id="station-beijing",
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="inverter-002",
                    device_name="逆变器A02",
                    device_type="inverter",
                    status="online",
                    location="北京电站-2区",
                    region="beijing",
                    parent_id="station-beijing",
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="inverter-003",
                    device_name="逆变器B01",
                    device_type="inverter",
                    status="online",
                    location="上海电站-1区",
                    region="shanghai",
                    parent_id="station-shanghai",
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="string-001",
                    device_name="组串S001",
                    device_type="string",
                    status="online",
                    location="1区-排1",
                    region="beijing",
                    parent_id="inverter-001",
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="string-002",
                    device_name="组串S002",
                    device_type="string",
                    status="online",
                    location="1区-排1",
                    region="beijing",
                    parent_id="inverter-001",
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="string-003",
                    device_name="组串S003",
                    device_type="string",
                    status="warning",
                    location="1区-排2",
                    region="beijing",
                    parent_id="inverter-002",
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="string-004",
                    device_name="组串S004",
                    device_type="string",
                    status="online",
                    location="2区-排1",
                    region="beijing",
                    parent_id="inverter-002",
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="string-005",
                    device_name="组串S005",
                    device_type="string",
                    status="online",
                    location="上海1区-排1",
                    region="shanghai",
                    parent_id="inverter-003",
                    last_seen=datetime.now()
                ),
                DeviceDB(
                    device_id="string-006",
                    device_name="组串S006",
                    device_type="string",
                    status="offline",
                    location="上海1区-排2",
                    region="shanghai",
                    parent_id="inverter-003",
                    last_seen=datetime.now()
                ),
            ]
            db.add_all(devices)


async def broadcast_data(data: PVStringData):
    if not active_connections:
        return
    
    async with ws_batch_lock:
        ws_batch_buffer.append(data.model_dump())
    
    async with ws_lock:
        dead_connections = []
        for ws in active_connections:
            try:
                await ws.send_json(data.model_dump())
            except Exception:
                dead_connections.append(ws)
        for ws in dead_connections:
            if ws in active_connections:
                active_connections.remove(ws)


async def batch_broadcast_task():
    while True:
        await asyncio.sleep(WS_BATCH_INTERVAL)
        
        async with ws_batch_lock:
            if not ws_batch_buffer:
                continue
            batch_data = list(ws_batch_buffer)
            ws_batch_buffer.clear()
        
        if batch_data and active_connections:
            batch_message = {
                "type": "batch",
                "count": len(batch_data),
                "data": batch_data[-50:]
            }
            
            async with ws_lock:
                dead_connections = []
                for ws in active_connections:
                    try:
                        await ws.send_json(batch_message)
                    except Exception:
                        dead_connections.append(ws)
                for ws in dead_connections:
                    if ws in active_connections:
                        active_connections.remove(ws)


def store_data(data: PVStringData):
    try:
        with get_db_session() as db:
            db_data = PVStringDataDB(
                id=str(uuid.uuid4()),
                string_id=data.string_id,
                timestamp=data.timestamp,
                voltage=data.voltage,
                current=data.current,
                temperature=data.temperature,
                power=data.power
            )
            db.add(db_data)
            
            device = db.query(DeviceDB).filter(DeviceDB.device_id == data.string_id).first()
            if device:
                device.last_seen = datetime.now()
                device.status = "online"
            
            if data.power and data.power > 0:
                today = datetime.now().date()
                summary = db.query(StationSummaryDB).filter(
                    StationSummaryDB.station_id == (device.parent_id if device else "unknown"),
                    StationSummaryDB.summary_date == today
                ).first()
                
                if not summary and device:
                    station = db.query(DeviceDB).filter(
                        DeviceDB.device_id == device.parent_id,
                        DeviceDB.device_type == "station"
                    ).first()
                    summary = StationSummaryDB(
                        id=str(uuid.uuid4()),
                        station_id=station.device_id if station else device.parent_id,
                        region=station.region if station else (device.region if device else "unknown"),
                        summary_date=today,
                        total_power=0,
                        total_energy=0,
                        peak_power=0,
                        device_count=0
                    )
                    db.add(summary)
                
                if summary:
                    summary.total_power = max(summary.total_power, data.power)
                    summary.peak_power = max(summary.peak_power, data.power)
                    summary.total_energy += data.power * 5 / 3600
        
        with buffer_lock:
            data_buffer[data.string_id].append(data)
            if len(data_buffer[data.string_id]) > BUFFER_MAX_SIZE:
                data_buffer[data.string_id] = data_buffer[data.string_id][-BUFFER_MAX_SIZE:]
        
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(broadcast_data(data))
        except RuntimeError:
            pass
            
    except Exception as e:
        print(f"Error storing data: {e}")


@app.get("/")
async def root():
    return {"service": "PV Gateway", "status": "running"}


@app.get("/devices", response_model=List[dict])
async def get_devices(
    type: Optional[str] = None,
    region: Optional[str] = None,
    parent_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(DeviceDB)
    if type:
        query = query.filter(DeviceDB.device_type == type)
    if region:
        query = query.filter(DeviceDB.region == region)
    if parent_id:
        query = query.filter(DeviceDB.parent_id == parent_id)
    devices = query.all()
    return [
        {
            "device_id": d.device_id,
            "device_name": d.device_name,
            "device_type": d.device_type,
            "status": d.status,
            "location": d.location,
            "region": d.region,
            "parent_id": d.parent_id,
            "last_seen": d.last_seen
        }
        for d in devices
    ]


@app.get("/devices/{device_id}")
async def get_device(device_id: str, db: Session = Depends(get_db)):
    device = db.query(DeviceDB).filter(DeviceDB.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {
        "device_id": device.device_id,
        "device_name": device.device_name,
        "device_type": device.device_type,
        "status": device.status,
        "location": device.location,
        "region": device.region,
        "parent_id": device.parent_id,
        "last_seen": device.last_seen
    }


@app.get("/data/{string_id}", response_model=List[dict])
async def get_string_data(
    string_id: str,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(PVStringDataDB).filter(PVStringDataDB.string_id == string_id)
    
    if start_time:
        query = query.filter(PVStringDataDB.timestamp >= start_time)
    if end_time:
        query = query.filter(PVStringDataDB.timestamp <= end_time)
    
    records = query.order_by(PVStringDataDB.timestamp.desc()).limit(limit).all()
    return [
        {
            "string_id": r.string_id,
            "timestamp": r.timestamp,
            "voltage": r.voltage,
            "current": r.current,
            "temperature": r.temperature,
            "power": r.power
        }
        for r in reversed(records)
    ]


@app.get("/data/latest/{string_id}")
async def get_latest_data(string_id: str, db: Session = Depends(get_db)):
    latest = db.query(PVStringDataDB).filter(
        PVStringDataDB.string_id == string_id
    ).order_by(PVStringDataDB.timestamp.desc()).first()
    
    if not latest:
        raise HTTPException(status_code=404, detail="No data found")
    
    return {
        "string_id": latest.string_id,
        "timestamp": latest.timestamp,
        "voltage": latest.voltage,
        "current": latest.current,
        "temperature": latest.temperature,
        "power": latest.power
    }


@app.post("/data")
async def receive_data(data: PVStringData, db: Session = Depends(get_db)):
    data.calculate_power()
    store_data(data)
    return {"status": "success", "message": "Data received"}


@app.get("/topology")
async def get_topology(db: Session = Depends(get_db)):
    devices = db.query(DeviceDB).all()
    device_map = {}
    
    for d in devices:
        device_map[d.device_id] = TopologyNode(
            id=d.device_id,
            name=d.device_name,
            type=d.device_type,
            status=DeviceStatus(d.status) if d.status else DeviceStatus.OFFLINE,
            parent_id=d.parent_id,
            children=[],
            data={"location": d.location}
        )
    
    root_nodes = []
    for node in device_map.values():
        if node.parent_id and node.parent_id in device_map:
            device_map[node.parent_id].children.append(node)
        else:
            root_nodes.append(node)
    
    return root_nodes[0] if root_nodes else None


@app.get("/summary")
async def get_summary(
    region: Optional[str] = None,
    station_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(DeviceDB)
    
    if region:
        query = query.filter(DeviceDB.region == region)
    if station_id:
        query = query.filter(
            (DeviceDB.device_id == station_id) | 
            (DeviceDB.parent_id == station_id)
        )
    
    devices = query.all()
    
    station_map = {}
    for d in devices:
        if d.device_type == "station":
            station_map[d.device_id] = {
                "station_id": d.device_id,
                "station_name": d.device_name,
                "region": d.region,
                "total_power": 0.0,
                "online_devices": 0,
                "offline_devices": 0,
                "alert_count": 0,
                "today_energy": 0.0
            }
    
    total_power_all = 0.0
    online_all = 0
    offline_all = 0
    
    for d in devices:
        if d.device_type == "string":
            latest = db.query(PVStringDataDB).filter(
                PVStringDataDB.string_id == d.device_id
            ).order_by(PVStringDataDB.timestamp.desc()).first()
            
            power = latest.power if latest and latest.power else 0
            total_power_all += power
            
            parent_station = None
            if d.parent_id:
                inverter = db.query(DeviceDB).filter(
                    DeviceDB.device_id == d.parent_id
                ).first()
                if inverter and inverter.parent_id:
                    parent_station = inverter.parent_id
            
            if parent_station and parent_station in station_map:
                station_map[parent_station]["total_power"] += power
        
        if d.status == "online":
            online_all += 1
        else:
            offline_all += 1
        
        if d.device_type in ["string", "inverter"]:
            parent_station = d.parent_id
            if d.device_type == "inverter" and d.parent_id:
                parent_station = d.parent_id
            elif d.device_type == "string" and d.parent_id:
                inverter = db.query(DeviceDB).filter(
                    DeviceDB.device_id == d.parent_id
                ).first()
                if inverter and inverter.parent_id:
                    parent_station = inverter.parent_id
            
            if parent_station and parent_station in station_map:
                if d.status == "online":
                    station_map[parent_station]["online_devices"] += 1
                else:
                    station_map[parent_station]["offline_devices"] += 1
    
    today = datetime.now().date()
    for station_id_key in station_map:
        summary = db.query(StationSummaryDB).filter(
            StationSummaryDB.station_id == station_id_key,
            StationSummaryDB.summary_date == today
        ).first()
        if summary:
            station_map[station_id_key]["today_energy"] = round(summary.total_energy, 2)
    
    if station_id and station_id in station_map:
        result = station_map[station_id]
        result["total_power"] = round(result["total_power"] / 1000, 2)
        return result
    
    if region:
        region_stations = [s for s in station_map.values() if s["region"] == region]
        total_power_region = sum(s["total_power"] for s in region_stations)
        return {
            "region": region,
            "station_count": len(region_stations),
            "total_power": round(total_power_region / 1000, 2),
            "online_devices": sum(s["online_devices"] for s in region_stations),
            "offline_devices": sum(s["offline_devices"] for s in region_stations),
            "today_energy": sum(s["today_energy"] for s in region_stations),
            "stations": region_stations
        }
    
    return {
        "total_power": round(total_power_all / 1000, 2),
        "online_devices": online_all,
        "offline_devices": offline_all,
        "station_count": len(station_map),
        "stations": [
            {
                **s,
                "total_power": round(s["total_power"] / 1000, 2)
            }
            for s in station_map.values()
        ]
    }


@app.get("/summary/region/{region}")
async def get_region_summary(region: str, db: Session = Depends(get_db)):
    return await get_summary(region=region, db=db)


@app.get("/summary/station/{station_id}")
async def get_station_summary(station_id: str, db: Session = Depends(get_db)):
    return await get_summary(station_id=station_id, db=db)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)


@app.post("/simulate/data")
async def simulate_data():
    import random
    string_ids = ["string-001", "string-002", "string-003", "string-004"]
    
    for sid in string_ids:
        data = PVStringData(
            string_id=sid,
            voltage=round(550 + random.uniform(-50, 50), 2),
            current=round(8 + random.uniform(-2, 2), 2),
            temperature=round(45 + random.uniform(-10, 10), 2)
        )
        store_data(data)
    
    return {"status": "success", "message": "Simulated data generated"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
