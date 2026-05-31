from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "法律条文智能检索比对系统"
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = True

    DATABASE_URL: str = "sqlite+aiosqlite:///./data/legal_ai.db"

    ES_HOSTS: str = "http://localhost:9200"
    ES_USER: Optional[str] = None
    ES_PASSWORD: Optional[str] = None
    ES_INDEX_LAWS: str = "laws"
    ES_INDEX_CASES: str = "cases"

    JWT_SECRET_KEY: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    LLM_API_BASE: str = "http://localhost:11434"
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: str = "qwen2:7b"
    LLM_EMBEDDING_MODEL: str = "text-embedding-3-small"
    LLM_TIMEOUT: int = 60

    TASK_MAX_WORKERS: int = 4
    TASK_BATCH_SIZE: int = 10

    UPLOAD_DIR: str = "./uploads"
    EXPORT_DIR: str = "./exports"
    MAX_FILE_SIZE: int = 52428800
    ALLOWED_EXTENSIONS: str = ".pdf,.docx,.doc,.txt"

    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./logs/app.log"

    @property
    def es_hosts_list(self) -> List[str]:
        return [h.strip() for h in self.ES_HOSTS.split(",") if h.strip()]

    @property
    def allowed_extensions_list(self) -> List[str]:
        return [e.strip().lower() for e in self.ALLOWED_EXTENSIONS.split(",") if e.strip()]


settings = Settings()
