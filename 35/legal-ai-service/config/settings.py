import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )

    APP_NAME: str = "Legal AI Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "logs"

    EMBEDDING_MODEL_NAME: str = "shibing624/text2vec-base-chinese"
    EMBEDDING_DIMENSION: int = 768
    EMBEDDING_BATCH_SIZE: int = 32
    MAX_SEQ_LENGTH: int = 512
    DEVICE: str = "cuda" if os.getenv("CUDA_VISIBLE_DEVICES") else "cpu"

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None

    VECTOR_INDEX_PATH: str = "data/vector_index"
    LEGAL_PROVISIONS_PATH: str = "data/legal_provisions.json"
    CASE_DATA_PATH: str = "data/cases.json"

    TOP_K_PROVISIONS: int = 10
    TOP_K_CASES: int = 5
    SIMILARITY_THRESHOLD: float = 0.6

    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    CELERY_TASK_SERIALIZER: str = "json"
    CELERY_ACCEPT_CONTENT: List[str] = ["json"]
    CELERY_TIMEZONE: str = "Asia/Shanghai"
    CELERY_WORKER_CONCURRENCY: int = 4

    MAX_FILE_SIZE: int = 10 * 1024 * 1024
    ALLOWED_EXTENSIONS: List[str] = [".txt", ".docx", ".pdf", ".doc"]

    BUSINESS_SERVICE_URL: str = "http://localhost:8080"
    BUSINESS_SERVICE_TIMEOUT: int = 30

    RATE_LIMIT_PER_MINUTE: int = 60
    API_KEY_HEADER: str = "X-API-Key"
    API_KEYS: List[str] = []

    BATCH_PROCESSING_MAX_WORKERS: int = 8
    BATCH_PROCESSING_CHUNK_SIZE: int = 10

    TASK_TIMEOUT_SOFT: int = 480
    TASK_TIMEOUT_HARD: int = 600
    TASK_MAX_RETRIES: int = 2
    TASK_RETRY_BACKOFF: int = 3

    SIMILARITY_WEIGHT_SEMANTIC: float = 0.35
    SIMILARITY_WEIGHT_TITLE: float = 0.15
    SIMILARITY_WEIGHT_SUMMARY: float = 0.20
    SIMILARITY_WEIGHT_PROVISIONS: float = 0.20
    SIMILARITY_WEIGHT_KEYWORDS: float = 0.05
    SIMILARITY_WEIGHT_CASE_TYPE: float = 0.03
    SIMILARITY_WEIGHT_COURT_LEVEL: float = 0.02

    MAX_PARAGRAPHS_FOR_EMBEDDING: int = 30
    MAX_TEXT_LENGTH_FOR_EMBEDDING: int = 2000

    ENABLE_ONNX_OPTIMIZATION: bool = False
    EMBEDDING_THREAD_POOL_SIZE: int = 4

    UVICORN_WORKERS: int = 1

    DATABASE_URL: str = "sqlite:///data/corrections.db"

    SUMMARY_GENERATION_ENABLED: bool = True
    CORRECTION_SYSTEM_ENABLED: bool = True


settings = Settings()
