import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "CP-Protection-Monitor-Cluster"
    APP_ENV: str = os.getenv("APP_ENV", "production")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 8000))
    WORKERS: int = int(os.getenv("WORKERS", 4))

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD", None)
    REDIS_MAX_CONNECTIONS: int = int(os.getenv("REDIS_MAX_CONNECTIONS", 200))

    INFLUXDB_URL: str = os.getenv("INFLUXDB_URL", "http://localhost:8086")
    INFLUXDB_TOKEN: str = os.getenv("INFLUXDB_TOKEN", "")
    INFLUXDB_ORG: str = os.getenv("INFLUXDB_ORG", "cp-org")
    INFLUXDB_BUCKET: str = os.getenv("INFLUXDB_BUCKET", "cp-monitor")

    MQ_BROKER_URL: str = os.getenv("MQ_BROKER_URL", "redis://localhost:6379/1")
    MQ_QUEUE_NAME: str = os.getenv("MQ_QUEUE_NAME", "cp_alarm_queue")

    NODE_ID: str = os.getenv("NODE_ID", "node-1")
    CLUSTER_NAME: str = os.getenv("CLUSTER_NAME", "cp-monitor-cluster")
    LOAD_BALANCE_STRATEGY: str = os.getenv("LB_STRATEGY", "round_robin")

    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT", 6000))
    MAX_CONNECTIONS: int = int(os.getenv("MAX_CONNECTIONS", 5000))
    BATCH_SIZE: int = int(os.getenv("BATCH_SIZE", 100))

    SCHEDULER_TIMEZONE: str = os.getenv("SCHEDULER_TZ", "Asia/Shanghai")
    SCHEDULER_HEARTBEAT_INTERVAL: int = int(os.getenv("HEARTBEAT", 10))

    ALARM_PUSH_CHANNELS: str = os.getenv("ALARM_CHANNELS", "email,sms,webhook")
    EMAIL_SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.example.com")
    EMAIL_SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    EMAIL_USER: str = os.getenv("SMTP_USER", "")
    EMAIL_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    WEBHOOK_URL: str = os.getenv("WEBHOOK_URL", "")
    SMS_API_URL: str = os.getenv("SMS_API_URL", "")
    SMS_API_KEY: str = os.getenv("SMS_API_KEY", "")

    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str = os.getenv("LOG_FILE", "logs/cp_monitor.log")

    class Config:
        env_file = ".env"


settings = Settings()