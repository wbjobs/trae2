from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "info"
    sample_storage_path: str = "./data/samples"
    upload_storage_path: str = "./data/uploads"
    model_path: str = "./models"
    database_url: str = "sqlite:///./data/audio_diagnosis.db"
    max_concurrent_streams: int = 10
    sample_rate: int = 16000
    audio_channels: int = 1
    chunk_size: int = 4096
    enable_cors_origins: str = "*"

    @property
    def cors_origins(self) -> List[str]:
        if self.enable_cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.enable_cors_origins.split(",")]


settings = Settings()
