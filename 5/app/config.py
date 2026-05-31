from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "AI Extraction Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_HOST: str = "localhost"
    DATABASE_PORT: int = 3306
    DATABASE_USER: str = "root"
    DATABASE_PASSWORD: str = "password"
    DATABASE_NAME: str = "ai_extraction"

    LLM_API_BASE: str = "https://api.openai.com/v1"
    LLM_API_KEY: str = "sk-your-api-key"
    LLM_MODEL: str = "gpt-3.5-turbo"
    LLM_TIMEOUT: int = 60
    LLM_MAX_TOKENS: int = 2000
    LLM_TEMPERATURE: float = 0.1

    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000

    MAX_TEXT_LENGTH: int = 10000
    LLM_MAX_INPUT_CHARS: int = 3000
    LLM_RETRY_COUNT: int = 3
    LLM_RETRY_DELAY: float = 1.0
    LLM_RETRY_BACKOFF: float = 2.0
    ENABLE_CHUNK_PROCESSING: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
