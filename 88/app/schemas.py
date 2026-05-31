from datetime import datetime
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: str = Field(..., max_length=128)
    password: str = Field(..., min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class DocumentOut(BaseModel):
    id: str
    filename: str
    original_name: str
    file_type: str
    file_size: int
    status: str
    summary: str | None = None
    keywords: str | None = None
    correction: str | None = None
    classification: str | None = None
    translation: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentDetailOut(DocumentOut):
    content: str | None = None
    updated_at: datetime


class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    task_type: str = Field(..., pattern="^(summary|keywords|correction|classify|translate|full)$")
    document_ids: list[str] = Field(..., min_length=1)
    target_lang: str | None = Field(default=None, description="Target language for translation")
    source_lang: str | None = Field(default=None, description="Source language for translation")


class TaskOut(BaseModel):
    id: str
    name: str
    task_type: str
    status: str
    progress: float
    total_count: int
    completed_count: int
    failed_count: int
    retry_count: int = 0
    max_retries: int = 3
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskDetailOut(TaskOut):
    result: str | None = None
    error_message: str | None = None
    celery_task_id: str | None = None
    updated_at: datetime


class TaskRetryRequest(BaseModel):
    task_id: str


class SearchQuery(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=10, ge=1, le=100)
    search_type: str = Field(default="semantic", pattern="^(semantic|keyword|hybrid)$")


class SearchResult(BaseModel):
    document_id: str
    filename: str
    original_name: str
    score: float
    highlight: str | None = None
    summary: str | None = None


class SearchResponse(BaseModel):
    total: int
    results: list[SearchResult]


class ExportRequest(BaseModel):
    document_ids: list[str] = Field(..., min_length=1)
    export_format: str = Field(default="json", pattern="^(json|csv|excel)$")
    include_content: bool = Field(default=False)
    include_summary: bool = Field(default=True)
    include_keywords: bool = Field(default=True)
    include_correction: bool = Field(default=True)
    include_classification: bool = Field(default=True)
    include_translation: bool = Field(default=False)


class BatchUploadResponse(BaseModel):
    uploaded: list[DocumentOut]
    errors: list[dict]


class APIResponse(BaseModel):
    success: bool
    message: str = ""
    data: dict | list | None = None
