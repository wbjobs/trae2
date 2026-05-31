from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from enum import Enum
from datetime import datetime


class SignalingDirection(str, Enum):
    UPLINK = "uplink"
    DOWNLINK = "downlink"


class SignalingType(str, Enum):
    TELEMETRY = "telemetry"
    COMMAND = "command"
    DATA_FRAME = "data_frame"
    BEACON = "beacon"


class SignalingPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class SignalingMessage(BaseModel):
    message_id: str = Field(..., description="Unique signaling message identifier")
    satellite_id: str = Field(..., description="Satellite identifier")
    direction: SignalingDirection
    msg_type: SignalingType
    priority: SignalingPriority = SignalingPriority.NORMAL
    payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    source: str = Field(..., description="Source system identifier")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChannelStatus(str, Enum):
    IDLE = "idle"
    BUSY = "busy"
    MAINTENANCE = "maintenance"
    OFFLINE = "offline"


class ChannelType(str, Enum):
    UHF = "uhf"
    S_BAND = "s_band"
    X_BAND = "x_band"
    KA_BAND = "ka_band"


class ChannelResource(BaseModel):
    channel_id: str = Field(..., description="Channel unique identifier")
    channel_type: ChannelType
    frequency_mhz: float = Field(..., ge=0)
    bandwidth_mhz: float = Field(default=1.0, ge=0)
    antenna_id: str = Field(..., description="Associated antenna identifier")
    status: ChannelStatus = ChannelStatus.IDLE
    current_task_id: Optional[str] = None
    supported_satellites: List[str] = Field(default_factory=list)
    last_heartbeat: datetime = Field(default_factory=datetime.utcnow)


class TaskStatus(str, Enum):
    PENDING = "pending"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskType(str, Enum):
    UPLINK_TRANSMISSION = "uplink_transmission"
    DOWNLINK_RECEPTION = "downlink_reception"
    TELEMETRY_ACQUISITION = "telemetry_acquisition"
    CALIBRATION = "calibration"


class ScheduledTask(BaseModel):
    task_id: str = Field(..., description="Task unique identifier")
    task_type: TaskType
    satellite_id: str
    priority: int = Field(default=5, ge=1, le=10)
    original_priority: int = Field(default=5, ge=1, le=10)
    priority_escalation_count: int = 0
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    allocated_channel_id: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    parameters: Dict[str, Any] = Field(default_factory=dict)
    callback_url: Optional[str] = None
    failure_count: int = 0
    last_failure_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CallbackEventType(str, Enum):
    TASK_STATUS_CHANGED = "task_status_changed"
    CHANNEL_STATUS_CHANGED = "channel_status_changed"
    SIGNALING_RECEIVED = "signaling_received"
    SIGNALING_DELIVERED = "signaling_delivered"
    ERROR_OCCURRED = "error_occurred"


class CallbackEvent(BaseModel):
    event_id: str = Field(..., description="Event unique identifier")
    event_type: CallbackEventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    source_service: str
    target_url: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    retry_count: int = 0
    max_retries: int = 3


class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    MONITOR = "monitor"
    SERVICE = "service"


class Credential(BaseModel):
    api_key: str
    role: UserRole
    allowed_operations: List[str] = Field(default_factory=list)
    description: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuthToken(BaseModel):
    token: str
    expires_at: datetime
    role: UserRole


class ServiceOperation(str, Enum):
    SIGNALING_RECEIVE = "signaling:receive"
    SIGNALING_SEND = "signaling:send"
    TASK_CREATE = "task:create"
    TASK_UPDATE = "task:update"
    TASK_DELETE = "task:delete"
    TASK_QUERY = "task:query"
    TASK_PRIORITY_ADJUST = "task:priority_adjust"
    CHANNEL_ALLOCATE = "channel:allocate"
    CHANNEL_RELEASE = "channel:release"
    CHANNEL_QUERY = "channel:query"
    CALLBACK_REGISTER = "callback:register"
    CALLBACK_TRIGGER = "callback:trigger"
    FAILURE_TRACE = "failure:trace"


class ApiResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[Any] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class FailureCategory(str, Enum):
    CHANNEL_UNAVAILABLE = "channel_unavailable"
    CHANNEL_CONFLICT = "channel_conflict"
    TIMEOUT = "timeout"
    SIGNALING_ERROR = "signaling_error"
    TASK_VALIDATION = "task_validation"
    RESOURCE_EXHAUSTED = "resource_exhausted"
    EXTERNAL_SERVICE = "external_service"
    UNKNOWN = "unknown"


class FailureSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FailureRecord(BaseModel):
    failure_id: str = Field(..., description="Failure unique identifier")
    task_id: str
    failure_category: FailureCategory
    severity: FailureSeverity
    message: str
    root_cause: str = ""
    stack_trace: Dict[str, Any] = Field(default_factory=dict)
    recovery_action: str = ""
    retryable: bool = True
    retry_count: int = 0
    max_retries: int = 3
    previous_failure_ids: List[str] = Field(default_factory=list)
    channel_id: Optional[str] = None
    satellite_id: Optional[str] = None
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolution_note: str = ""


class PriorityAdjustReason(str, Enum):
    WAITING_TIMEOUT = "waiting_timeout"
    SATELLITE_PASS = "satellite_pass"
    MANUAL_ESCALATION = "manual_escalation"
    FAILURE_RECOVERY = "failure_recovery"
    DEPENDENCY_BLOCKED = "dependency_blocked"
    MANUAL_DEGRADATION = "manual_degradation"


class PriorityAdjustRecord(BaseModel):
    adjust_id: str = Field(..., description="Adjustment unique identifier")
    task_id: str
    old_priority: int
    new_priority: int
    reason: PriorityAdjustReason
    operator: str = "system"
    note: str = ""
    adjusted_at: datetime = Field(default_factory=datetime.utcnow)