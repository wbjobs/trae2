from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, date
from enum import Enum


class DeviceStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    WARNING = "warning"
    ERROR = "error"


class AlertLevel(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class CommandType(str, Enum):
    RESET = "reset"
    CALIBRATE = "calibrate"
    SHUTDOWN = "shutdown"
    STARTUP = "startup"
    SET_PARAM = "set_param"


class WorkOrderStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WorkOrderPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class PVStringData(BaseModel):
    string_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    voltage: float = Field(..., description="组串电压 (V)")
    current: float = Field(..., description="组串电流 (A)")
    temperature: float = Field(..., description="温度 (°C)")
    power: Optional[float] = None

    def calculate_power(self) -> float:
        self.power = self.voltage * self.current
        return self.power


class DeviceInfo(BaseModel):
    device_id: str
    device_name: str
    device_type: str
    status: DeviceStatus
    location: str
    install_date: Optional[datetime] = None
    last_maintenance: Optional[datetime] = None


class StringDevice(DeviceInfo):
    inverter_id: str
    panel_count: int = 20
    rated_voltage: float = 600.0
    rated_current: float = 10.0


class InverterDevice(DeviceInfo):
    station_id: str
    max_power: float = 100.0
    efficiency: float = 98.5


class PowerStation(DeviceInfo):
    region: str
    total_capacity: float
    inverter_count: int


class Alert(BaseModel):
    alert_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    level: AlertLevel
    device_id: str
    device_name: str
    message: str
    parameter: Optional[str] = None
    value: Optional[float] = None
    threshold: Optional[float] = None
    acknowledged: bool = False


class Command(BaseModel):
    command_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    device_id: str
    command_type: CommandType
    parameters: dict = {}
    issued_by: str
    status: str = "pending"


class CommandResponse(BaseModel):
    command_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    device_id: str
    success: bool
    message: str


class StringAnalysis(BaseModel):
    string_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    voltage_normal: bool
    current_normal: bool
    temp_normal: bool
    overall_status: str
    efficiency: float
    recommendations: List[str] = []


class StationSummary(BaseModel):
    station_id: str
    station_name: str
    total_power: float
    online_devices: int
    offline_devices: int
    alert_count: int
    today_energy: float


class TopologyNode(BaseModel):
    id: str
    name: str
    type: str
    status: DeviceStatus
    parent_id: Optional[str] = None
    children: List["TopologyNode"] = []
    data: Optional[dict] = {}

    class Config:
        arbitrary_types_allowed = True


class EnergyPrediction(BaseModel):
    string_id: str
    prediction_date: date
    predicted_energy: float
    confidence: float
    historical_avg: float
    trend_factor: float
    weather_factor: float
    efficiency_factor: float
    hourly_predictions: Dict[str, float] = {}


class EnergyPredictionResponse(BaseModel):
    string_id: str
    predictions: List[EnergyPrediction]
    total_predicted_energy: float
    prediction_period_days: int


class WorkOrder(BaseModel):
    work_order_id: str
    title: str
    description: str
    status: WorkOrderStatus
    priority: WorkOrderPriority
    device_id: str
    device_name: str
    alert_id: Optional[str] = None
    assigned_to: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: List[str] = []


class WorkOrderCreate(BaseModel):
    title: str
    description: str
    priority: WorkOrderPriority
    device_id: str
    alert_id: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[datetime] = None


class AggregatedData(BaseModel):
    string_id: str
    period: str
    avg_voltage: float
    avg_current: float
    avg_temperature: float
    total_energy: float
    max_power: float
    data_points: int
    efficiency: float


TopologyNode.update_forward_refs()
