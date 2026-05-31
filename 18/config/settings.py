import os
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "文档语义抽取与智能归类AI系统"
    VERSION: str = "2.1.0"

    SERVER_HOST: str = Field(default="0.0.0.0", env="SERVER_HOST")
    SERVER_PORT: int = Field(default=8000, env="SERVER_PORT")

    OPENAI_API_KEY: Optional[str] = Field(default=None, env="OPENAI_API_KEY")
    OPENAI_BASE_URL: Optional[str] = Field(default="https://api.openai.com/v1", env="OPENAI_BASE_URL")
    LLM_MODEL: str = Field(default="gpt-3.5-turbo", env="LLM_MODEL")
    EMBEDDING_MODEL: str = Field(default="text-embedding-3-small", env="EMBEDDING_MODEL")

    LOCAL_MODEL_PATH: Optional[str] = Field(default=None, env="LOCAL_MODEL_PATH")
    USE_LOCAL_MODEL: bool = Field(default=False, env="USE_LOCAL_MODEL")

    AI_MAX_RETRIES: int = Field(default=3, env="AI_MAX_RETRIES")
    AI_RETRY_BASE_DELAY: float = Field(default=1.0, env="AI_RETRY_BASE_DELAY")
    AI_RETRY_MAX_DELAY: float = Field(default=30.0, env="AI_RETRY_MAX_DELAY")
    AI_REQUEST_TIMEOUT: int = Field(default=120, env="AI_REQUEST_TIMEOUT")
    AI_MAX_CONCURRENT: int = Field(default=10, env="AI_MAX_CONCURRENT")

    DATABASE_URL: str = Field(default="postgresql://user:password@localhost:5432/doc_ai", env="DATABASE_URL")
    DATABASE_ECHO: bool = Field(default=False, env="DATABASE_ECHO")

    REDIS_URL: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")

    UPLOAD_DIR: str = Field(default="./uploads", env="UPLOAD_DIR")
    MAX_UPLOAD_SIZE: int = Field(default=200 * 1024 * 1024, env="MAX_UPLOAD_SIZE")
    ALLOWED_EXTENSIONS: List[str] = Field(default_factory=lambda: [".pdf", ".docx", ".doc"])

    PARSE_TIMEOUT: int = Field(default=300, env="PARSE_TIMEOUT")
    MAX_PAGES_PER_CHUNK: int = Field(default=50, env="MAX_PAGES_PER_CHUNK")
    MAX_TEXT_LENGTH: int = Field(default=100000, env="MAX_TEXT_LENGTH")

    MAX_HIGHLIGHT_PARAGRAPHS: int = Field(default=5, env="MAX_HIGHLIGHT_PARAGRAPHS")
    MAX_HIGHLIGHT_SENTENCES: int = Field(default=10, env="MAX_HIGHLIGHT_SENTENCES")
    MIN_SENTENCE_LENGTH: int = Field(default=20, env="MIN_SENTENCE_LENGTH")
    USE_AI_HIGHLIGHT: bool = Field(default=True, env="USE_AI_HIGHLIGHT")

    BATCH_PROCESSING_LIMIT: int = Field(default=500, env="BATCH_PROCESSING_LIMIT")
    MAX_CONCURRENT_TASKS: int = Field(default=20, env="MAX_CONCURRENT_TASKS")
    TASK_TIMEOUT: int = Field(default=600, env="TASK_TIMEOUT")
    PAUSE_BETWEEN_DOCS: float = Field(default=0.05, env="PAUSE_BETWEEN_DOCS")
    BATCH_WORKER_COUNT: int = Field(default=4, env="BATCH_WORKER_COUNT")
    ENABLE_CACHE: bool = Field(default=True, env="ENABLE_CACHE")

    CLASSIFICATION_THRESHOLD: float = Field(default=0.6, env="CLASSIFICATION_THRESHOLD")
    MAX_TEXT_FOR_AI: int = Field(default=8000, env="MAX_TEXT_FOR_AI")

    WORKER_COUNT: int = Field(default=4, env="WORKER_COUNT")

    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    LOG_FILE: str = Field(default="./logs/doc_ai.log", env="LOG_FILE")

    DEFAULT_CATEGORIES: List[str] = Field(default_factory=lambda: [
        "合同协议", "技术文档", "财务报表", "会议纪要",
        "项目报告", "规章制度", "培训材料", "其他"
    ])

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.dirname(settings.LOG_FILE), exist_ok=True)
