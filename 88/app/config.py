from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "DocSemanticAI"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    DATABASE_URL: str = "sqlite+aiosqlite:///./data/app.db"

    REDIS_URL: str = "redis://localhost:6379/0"

    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_INDEX: str = "docsemantic"
    ELASTICSEARCH_USERNAME: str = "elastic"
    ELASTICSEARCH_PASSWORD: str = "changeme"

    AI_PROVIDER: str = "zhipu"
    AI_API_KEY: str = ""
    AI_MODEL: str = "glm-4"
    AI_BASE_URL: str = "https://open.bigmodel.cn/api/paas/v4"
    AI_MAX_TOKENS: int = 4096
    AI_TEMPERATURE: float = 0.3

    JWT_SECRET_KEY: str = "change_me_in_production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    UPLOAD_DIR: str = "./data/uploads"
    EXPORT_DIR: str = "./data/exports"
    MAX_UPLOAD_SIZE_MB: int = 100
    ALLOWED_EXTENSIONS: str = "pdf,docx,txt,md"

    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./data/logs/app.log"

    @property
    def allowed_extensions_list(self) -> list[str]:
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(",")]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": True}


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def ensure_dirs():
    s = get_settings()
    Path(s.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(s.EXPORT_DIR).mkdir(parents=True, exist_ok=True)
    Path(s.LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
    Path("./data").mkdir(parents=True, exist_ok=True)
