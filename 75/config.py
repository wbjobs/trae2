import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "PowerInspectionAI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    HOST: str = os.getenv("SERVICE_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("SERVICE_PORT", "8000"))
    WORKERS: int = int(os.getenv("WORKERS", "4"))

    SPEECH_MAX_CONCURRENT: int = int(os.getenv("SPEECH_MAX_CONCURRENT", "8"))
    SPEECH_SAMPLE_RATE: int = int(os.getenv("SPEECH_SAMPLE_RATE", "16000"))
    SPEECH_LANGUAGE: str = os.getenv("SPEECH_LANGUAGE", "zh-CN")
    SPEECH_MODEL_DIR: str = os.getenv("SPEECH_MODEL_DIR", "./models/asr")
    SPEECH_CHUNK_SECONDS: int = int(os.getenv("SPEECH_CHUNK_SECONDS", "30"))
    SPEECH_MAX_RETRIES: int = int(os.getenv("SPEECH_MAX_RETRIES", "3"))
    SPEECH_CHUNK_TIMEOUT: int = int(os.getenv("SPEECH_CHUNK_TIMEOUT", "60"))
    SPEECH_GLOBAL_TIMEOUT: int = int(os.getenv("SPEECH_GLOBAL_TIMEOUT", "300"))

    SPEECH_CACHE_SIZE: int = int(os.getenv("SPEECH_CACHE_SIZE", "5000"))
    SPEECH_CACHE_TTL: int = int(os.getenv("SPEECH_CACHE_TTL", "86400"))
    SEMANTIC_CACHE_SIZE: int = int(os.getenv("SEMANTIC_CACHE_SIZE", "20000"))
    SEMANTIC_CACHE_TTL: int = int(os.getenv("SEMANTIC_CACHE_TTL", "86400"))
    DEFECT_CACHE_SIZE: int = int(os.getenv("DEFECT_CACHE_SIZE", "20000"))
    DEFECT_CACHE_TTL: int = int(os.getenv("DEFECT_CACHE_TTL", "86400"))

    SEMANTIC_BATCH_SIZE: int = int(os.getenv("SEMANTIC_BATCH_SIZE", "32"))
    SEMANTIC_BATCH_WAIT: int = int(os.getenv("SEMANTIC_BATCH_WAIT", "50"))
    DEFECT_BATCH_SIZE: int = int(os.getenv("DEFECT_BATCH_SIZE", "64"))
    DEFECT_BATCH_WAIT: int = int(os.getenv("DEFECT_BATCH_WAIT", "30"))

    MAX_CONCURRENCY: int = int(os.getenv("MAX_CONCURRENCY", "64"))
    TARGET_LATENCY_MS: float = float(os.getenv("TARGET_LATENCY_MS", "5000.0"))
    BATCH_PROCESS_SIZE: int = int(os.getenv("BATCH_PROCESS_SIZE", "16"))
    BATCH_INTERVAL_MS: int = int(os.getenv("BATCH_INTERVAL_MS", "10"))

    DEADLOCK_THRESHOLD: int = int(os.getenv("DEADLOCK_THRESHOLD", "300"))

    CORRECTION_STORAGE_PATH: str = os.getenv(
        "CORRECTION_STORAGE_PATH", "./data/corrections.json"
    )
    AUTO_AGGREGATE_ENABLED: bool = os.getenv("AUTO_AGGREGATE_ENABLED", "true").lower() == "true"

    SEMANTIC_MODEL_DIR: str = os.getenv("SEMANTIC_MODEL_DIR", "./models/semantic")
    SEMANTIC_EMBEDDING_DIM: int = int(os.getenv("SEMANTIC_EMBEDDING_DIM", "768"))
    SEMANTIC_SIMILARITY_THRESHOLD: float = float(
        os.getenv("SEMANTIC_SIMILARITY_THRESHOLD", "0.65")
    )

    DEFECT_CONFIDENCE_THRESHOLD: float = float(
        os.getenv("DEFECT_CONFIDENCE_THRESHOLD", "0.65")
    )
    DEFECT_KNOWLEDGE_BASE_PATH: str = os.getenv(
        "DEFECT_KNOWLEDGE_BASE_PATH", "./data/defect_kb.json"
    )

    REMEDIATION_TEMPLATE_PATH: str = os.getenv(
        "REMEDIATION_TEMPLATE_PATH", "./data/remediation_templates.json"
    )
    REMEDIATION_PUSH_URL: str = os.getenv("REMEDIATION_PUSH_URL", "")
    REMEDIATION_PUSH_TIMEOUT: int = int(os.getenv("REMEDIATION_PUSH_TIMEOUT", "10"))

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    RABBITMQ_URL: str = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")

    GATEWAY_RATE_LIMIT: int = int(os.getenv("GATEWAY_RATE_LIMIT", "100"))
    GATEWAY_API_KEY_HEADER: str = os.getenv("GATEWAY_API_KEY_HEADER", "X-API-Key")
    GATEWAY_API_KEYS: str = os.getenv("GATEWAY_API_KEYS", "test-key-001,test-key-002")

    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_DIR: str = os.getenv("LOG_DIR", "./logs")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
