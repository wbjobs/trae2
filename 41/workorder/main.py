from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import uuid
import json
import httpx
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared import (
    WorkOrder, WorkOrderCreate, WorkOrderStatus, WorkOrderPriority,
    Alert, AlertLevel, settings
)
from database import get_db, init_db, WorkOrderDB, get_db_session

app = FastAPI(title="PV WorkOrder Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WorkOrderManager:
    def __init__(self):
        self.auto_generation_enabled = True
        self.alert_cooldown: dict = {}
        self.COOLDOWN_HOURS = 24

    def create_work_order(self, work_order: WorkOrderCreate) -> WorkOrder:
        with get_db_session() as db:
            db_order = WorkOrderDB(
                work_order_id=str(uuid.uuid4()),
                title=work_order.title,
                description=work_order.description,
                status=work_order.status.value if isinstance(work_order.status, WorkOrderStatus) else WorkOrderStatus.PENDING.value,
                priority=work_order.priority.value if isinstance(work_order.priority, WorkOrderPriority) else WorkOrderPriority.MEDIUM.value,
                device_id=work_order.device_id,
                device_name=work_order.device_name or work_order.device_id,
                alert_id=work_order.alert_id,
                assigned_to=work_order.assigned_to,
                created_at=datetime.now(),
                due_date=work_order.due_date or (datetime.now() + timedelta(days=7)),
                notes="[]"
            )
            db.add(db_order)
        
        return WorkOrder(
            work_order_id=db_order.work_order_id,
            title=db_order.title,
            description=db_order.description,
            status=WorkOrderStatus(db_order.status),
            priority=WorkOrderPriority(db_order.priority),
            device_id=db_order.device_id,
            device_name=db_order.device_name,
            alert_id=db_order.alert_id,
            assigned_to=db_order.assigned_to,
            created_at=db_order.created_at,
            due_date=db_order.due_date,
            completed_at=db_order.completed_at,
            notes=json.loads(db_order.notes) if db_order.notes else []
        )

    def auto_generate_from_alert(self, alert: Alert) -> Optional[WorkOrder]:
        if not self.auto_generation_enabled:
            return None
        
        cooldown_key = f"{alert.device_id}_{alert.parameter}"
        now = datetime.now()
        
        if cooldown_key in self.alert_cooldown:
            last_time = self.alert_cooldown[cooldown_key]
            if (now - last_time).total_seconds() < self.COOLDOWN_HOURS * 3600:
                return None
        
        self.alert_cooldown[cooldown_key] = now
        
        priority_map = {
            AlertLevel.INFO: WorkOrderPriority.LOW,
            AlertLevel.WARNING: WorkOrderPriority.MEDIUM,
            AlertLevel.ERROR: WorkOrderPriority.HIGH,
            AlertLevel.CRITICAL: WorkOrderPriority.CRITICAL,
        }
        
        title_map = {
            "voltage": f"电压异常检修 - {alert.device_name}",
            "current": f"电流异常检修 - {alert.device_name}",
            "temperature": f"温度异常检修 - {alert.device_name}",
            "efficiency": f"效率低下检修 - {alert.device_name}",
        }
        
        description_map = {
            "voltage": f"检测到{alert.device_name}电压异常，当前值: {alert.value}V，阈值: {alert.threshold}V。请检查组串连接和组件遮挡情况。",
            "current": f"检测到{alert.device_name}电流异常，当前值: {alert.value}A，阈值: {alert.threshold}A。请检查逆变器MPPT跟踪状态。",
            "temperature": f"检测到{alert.device_name}温度异常，当前值: {alert.value}°C，阈值: {alert.threshold}°C。请检查散热情况并清洁组件。",
            "efficiency": f"检测到{alert.device_name}发电效率异常，当前效率: {alert.value}，阈值: {alert.threshold}。建议进行组件性能测试。",
        }
        
        work_order_create = WorkOrderCreate(
            title=title_map.get(alert.parameter, f"设备告警 - {alert.device_name}"),
            description=description_map.get(alert.parameter, alert.message),
            priority=priority_map.get(alert.level, WorkOrderPriority.MEDIUM),
            device_id=alert.device_id,
            alert_id=alert.alert_id,
            due_date=datetime.now() + timedelta(days=3 if alert.level in [AlertLevel.ERROR, AlertLevel.CRITICAL] else 7)
        )
        
        return self.create_work_order(work_order_create)

    def get_work_orders(
        self,
        status: Optional[WorkOrderStatus] = None,
        priority: Optional[WorkOrderPriority] = None,
        device_id: Optional[str] = None,
        assigned_to: Optional[str] = None,
        limit: int = 50
    ) -> List[WorkOrder]:
        with get_db_session() as db:
            query = db.query(WorkOrderDB)
            
            if status:
                query = query.filter(WorkOrderDB.status == status.value)
            if priority:
                query = query.filter(WorkOrderDB.priority == priority.value)
            if device_id:
                query = query.filter(WorkOrderDB.device_id == device_id)
            if assigned_to:
                query = query.filter(WorkOrderDB.assigned_to == assigned_to)
            
            orders = query.order_by(WorkOrderDB.created_at.desc()).limit(limit).all()
            
            return [
                WorkOrder(
                    work_order_id=o.work_order_id,
                    title=o.title,
                    description=o.description,
                    status=WorkOrderStatus(o.status),
                    priority=WorkOrderPriority(o.priority),
                    device_id=o.device_id,
                    device_name=o.device_name,
                    alert_id=o.alert_id,
                    assigned_to=o.assigned_to,
                    created_at=o.created_at,
                    due_date=o.due_date,
                    completed_at=o.completed_at,
                    notes=json.loads(o.notes) if o.notes else []
                )
                for o in orders
            ]

    def get_work_order(self, work_order_id: str) -> Optional[WorkOrder]:
        with get_db_session() as db:
            order = db.query(WorkOrderDB).filter(
                WorkOrderDB.work_order_id == work_order_id
            ).first()
            
            if not order:
                return None
            
            return WorkOrder(
                work_order_id=order.work_order_id,
                title=order.title,
                description=order.description,
                status=WorkOrderStatus(order.status),
                priority=WorkOrderPriority(order.priority),
                device_id=order.device_id,
                device_name=order.device_name,
                alert_id=order.alert_id,
                assigned_to=order.assigned_to,
                created_at=order.created_at,
                due_date=order.due_date,
                completed_at=order.completed_at,
                notes=json.loads(order.notes) if order.notes else []
            )

    def update_work_order(
        self,
        work_order_id: str,
        status: Optional[WorkOrderStatus] = None,
        assigned_to: Optional[str] = None,
        note: Optional[str] = None
    ) -> Optional[WorkOrder]:
        with get_db_session() as db:
            order = db.query(WorkOrderDB).filter(
                WorkOrderDB.work_order_id == work_order_id
            ).first()
            
            if not order:
                return None
            
            if status:
                order.status = status.value
                if status == WorkOrderStatus.COMPLETED:
                    order.completed_at = datetime.now()
            
            if assigned_to:
                order.assigned_to = assigned_to
            
            if note:
                notes = json.loads(order.notes) if order.notes else []
                notes.append(f"[{datetime.now().isoformat()}] {note}")
                order.notes = json.dumps(notes)
            
            updated_order = order
        
        return WorkOrder(
            work_order_id=updated_order.work_order_id,
            title=updated_order.title,
            description=updated_order.description,
            status=WorkOrderStatus(updated_order.status),
            priority=WorkOrderPriority(updated_order.priority),
            device_id=updated_order.device_id,
            device_name=updated_order.device_name,
            alert_id=updated_order.alert_id,
            assigned_to=updated_order.assigned_to,
            created_at=updated_order.created_at,
            due_date=updated_order.due_date,
            completed_at=updated_order.completed_at,
            notes=json.loads(updated_order.notes) if updated_order.notes else []
        )

    def get_statistics(self) -> dict:
        with get_db_session() as db:
            total = db.query(WorkOrderDB).count()
            pending = db.query(WorkOrderDB).filter(
                WorkOrderDB.status == WorkOrderStatus.PENDING.value
            ).count()
            in_progress = db.query(WorkOrderDB).filter(
                WorkOrderDB.status == WorkOrderStatus.IN_PROGRESS.value
            ).count()
            completed = db.query(WorkOrderDB).filter(
                WorkOrderDB.status == WorkOrderStatus.COMPLETED.value
            ).count()
            critical = db.query(WorkOrderDB).filter(
                WorkOrderDB.priority == WorkOrderPriority.CRITICAL.value
            ).count()
            overdue = db.query(WorkOrderDB).filter(
                WorkOrderDB.due_date < datetime.now(),
                WorkOrderDB.status.in_([WorkOrderStatus.PENDING.value, WorkOrderStatus.IN_PROGRESS.value])
            ).count()
            
            return {
                "total": total,
                "pending": pending,
                "in_progress": in_progress,
                "completed": completed,
                "critical": critical,
                "overdue": overdue
            }


work_order_manager = WorkOrderManager()


@app.on_event("startup")
async def startup_event():
    init_db()


@app.get("/")
async def root():
    return {"service": "PV WorkOrder", "status": "running"}


@app.post("/workorders", response_model=WorkOrder)
async def create_work_order(work_order: WorkOrderCreate):
    return work_order_manager.create_work_order(work_order)


@app.post("/workorders/from-alert")
async def create_from_alert(alert: Alert):
    work_order = work_order_manager.auto_generate_from_alert(alert)
    if work_order:
        return work_order
    return {"status": "skipped", "message": "Work order generation skipped due to cooldown"}


@app.get("/workorders", response_model=List[WorkOrder])
async def get_work_orders(
    status: Optional[WorkOrderStatus] = None,
    priority: Optional[WorkOrderPriority] = None,
    device_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    limit: int = 50
):
    return work_order_manager.get_work_orders(status, priority, device_id, assigned_to, limit)


@app.get("/workorders/{work_order_id}", response_model=WorkOrder)
async def get_work_order(work_order_id: str):
    order = work_order_manager.get_work_order(work_order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return order


@app.put("/workorders/{work_order_id}/status")
async def update_work_order_status(
    work_order_id: str,
    status: WorkOrderStatus,
    note: Optional[str] = None
):
    order = work_order_manager.update_work_order(work_order_id, status=status, note=note)
    if not order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return order


@app.put("/workorders/{work_order_id}/assign")
async def assign_work_order(work_order_id: str, assigned_to: str):
    order = work_order_manager.update_work_order(work_order_id, assigned_to=assigned_to)
    if not order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return order


@app.post("/workorders/{work_order_id}/notes")
async def add_work_order_note(work_order_id: str, note: str):
    order = work_order_manager.update_work_order(work_order_id, note=note)
    if not order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return order


@app.get("/statistics")
async def get_statistics():
    return work_order_manager.get_statistics()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
