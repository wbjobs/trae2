from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "文档智能校对AI系统"
    app_version: str = "1.0.0"
    debug: bool = True
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    database_url: str = "sqlite+aiosqlite:///./doc_proofread.db"

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_user: str = "elastic"
    elasticsearch_password: str = "changeme"

    ai_service_url: str = "http://localhost:8001"
    ai_service_timeout: int = 60

    upload_dir: str = "./uploads"
    export_dir: str = "./exports"
    max_file_size: int = 10485760
    allowed_extensions: str = ".docx,.pdf,.xlsx,.txt,.md"

    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @property
    def allowed_extensions_list(self) -> List[str]:
        return [ext.strip().lower() for ext in self.allowed_extensions.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
