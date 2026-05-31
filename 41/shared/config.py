import os
from typing import Optional


class Settings:
    MQTT_BROKER: str = os.getenv("MQTT_BROKER", "localhost")
    MQTT_PORT: int = int(os.getenv("MQTT_PORT", "1883"))
    MQTT_TOPIC_DATA: str = "pv/string/data"
    MQTT_TOPIC_COMMAND: str = "pv/command"
    MQTT_TOPIC_RESPONSE: str = "pv/response"

    GATEWAY_URL: str = os.getenv("GATEWAY_URL", "http://localhost:8000")
    ANALYSIS_URL: str = os.getenv("ANALYSIS_URL", "http://localhost:8001")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./pv_system.db")

    VOLTAGE_MIN: float = 400.0
    VOLTAGE_MAX: float = 800.0
    CURRENT_MIN: float = 0.0
    CURRENT_MAX: float = 15.0
    TEMP_MIN: float = -20.0
    TEMP_MAX: float = 85.0

    ALERT_CHECK_INTERVAL: int = 60
    DATA_RETENTION_DAYS: int = 90

    @property
    def is_embedded(self) -> bool:
        return os.getenv("EMBEDDED_ENV", "false").lower() == "true"


settings = Settings()
