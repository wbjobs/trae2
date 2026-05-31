import os
from typing import Optional
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

env_path = Path(__file__).parent.parent / '.env'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=env_path if env_path.exists() else None, extra='ignore')

    celery_broker_url: str = Field(default='redis://localhost:6379/0')
    celery_result_backend: str = Field(default='redis://localhost:6379/0')

    influxdb_host: str = Field(default='localhost')
    influxdb_port: int = Field(default=8086)
    influxdb_org: str = Field(default='cfd_org')
    influxdb_bucket: str = Field(default='cfd_results')
    influxdb_token: Optional[str] = Field(default=None)

    influxdb_v1_database: str = Field(default='cfd_db')
    influxdb_v1_username: Optional[str] = Field(default=None)
    influxdb_v1_password: Optional[str] = Field(default=None)

    cfd_default_nx: int = Field(default=256)
    cfd_default_ny: int = Field(default=256)
    cfd_default_dt: float = Field(default=0.001)
    cfd_default_nu: float = Field(default=0.01)
    cfd_default_ro: float = Field(default=1.0)
    cfd_default_iterations: int = Field(default=1000)

    node_name: str = Field(default='compute-node-01')
    node_max_workers: int = Field(default=4)

    monitoring_interval: float = Field(default=5.0)
    monitoring_retention_days: int = Field(default=30)

    @property
    def influxdb_url(self) -> str:
        return f'http://{self.influxdb_host}:{self.influxdb_port}'


settings = Settings()
