from enum import Enum
from typing import Dict, Tuple


class ParameterType(str, Enum):
    POTENTIAL = "potential"
    CURRENT = "current"
    RESISTIVITY = "resistivity"
    TEMPERATURE = "temperature"
    PH = "ph"


class ParameterUnit(str, Enum):
    MILLIVOLT = "mV"
    MILLIAMPERE = "mA"
    OHM_METER = "Ω·m"
    CELSIUS = "°C"
    PH_UNIT = "pH"


class AlarmLevel(int, Enum):
    INFO = 0
    WARNING = 1
    CRITICAL = 2
    EMERGENCY = 3


class AlarmStatus(str, Enum):
    PENDING = "pending"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    ESCALATED = "escalated"


class NodeStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"


class ThresholdCondition(str, Enum):
    ABOVE = "above"
    BELOW = "below"
    RANGE = "range"
    OUT_OF_RANGE = "out_of_range"
    RAPID_CHANGE = "rapid_change"


VALID_PARAM_RANGES: Dict[ParameterType, Tuple[float, float]] = {
    ParameterType.POTENTIAL: (-2500.0, 0.0),
    ParameterType.CURRENT: (-5000.0, 5000.0),
    ParameterType.RESISTIVITY: (0.0, 100000.0),
    ParameterType.TEMPERATURE: (-40.0, 120.0),
    ParameterType.PH: (0.0, 14.0),
}

DEFAULT_THRESHOLDS: Dict[ParameterType, Dict[AlarmLevel, Dict]] = {
    ParameterType.POTENTIAL: {
        AlarmLevel.WARNING: {
            "condition": ThresholdCondition.BELOW,
            "value": -850.0,
            "unit": ParameterUnit.MILLIVOLT,
        },
        AlarmLevel.CRITICAL: {
            "condition": ThresholdCondition.BELOW,
            "value": -1100.0,
            "unit": ParameterUnit.MILLIVOLT,
        },
        AlarmLevel.EMERGENCY: {
            "condition": ThresholdCondition.BELOW,
            "value": -1500.0,
            "unit": ParameterUnit.MILLIVOLT,
        },
    },
    ParameterType.CURRENT: {
        AlarmLevel.WARNING: {
            "condition": ThresholdCondition.ABOVE,
            "value": 3000.0,
            "unit": ParameterUnit.MILLIAMPERE,
        },
        AlarmLevel.CRITICAL: {
            "condition": ThresholdCondition.ABOVE,
            "value": 4000.0,
            "unit": ParameterUnit.MILLIAMPERE,
        },
        AlarmLevel.EMERGENCY: {
            "condition": ThresholdCondition.ABOVE,
            "value": 4500.0,
            "unit": ParameterUnit.MILLIAMPERE,
        },
    },
}

ALARM_LEVEL_NAMES: Dict[AlarmLevel, str] = {
    AlarmLevel.INFO: "信息",
    AlarmLevel.WARNING: "警告",
    AlarmLevel.CRITICAL: "严重",
    AlarmLevel.EMERGENCY: "紧急",
}

ALARM_LEVEL_COLORS: Dict[AlarmLevel, str] = {
    AlarmLevel.INFO: "#17a2b8",
    AlarmLevel.WARNING: "#ffc107",
    AlarmLevel.CRITICAL: "#fd7e14",
    AlarmLevel.EMERGENCY: "#dc3545",
}

COLLECTION_ENDPOINT = "/api/v1/collect"
ALARM_ENDPOINT = "/api/v1/alarm"
HEALTH_ENDPOINT = "/api/v1/health"
MONITOR_ENDPOINT = "/api/v1/monitor"