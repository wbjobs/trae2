from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, field_validator


class TaskBase(BaseModel):
    document_id: int = Field(..., description="文档ID")
    task_type: str = Field(default="full", description="任务类型: full/spelling/grammar/terminology/format")
    industry: Optional[str] = Field(None, description="所属行业")
    priority: int = Field(default=5, ge=1, le=10, description="优先级")

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, v):
        allowed_types = ["full", "spelling", "grammar", "terminology", "format"]
        if v not in allowed_types:
            raise ValueError(f"task_type must be one of {allowed_types}")
        return v


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None
    error_message: Optional[str] = None


class ProofreadTask(BaseModel):
    id: int
    task_id: str
    document_id: int
    user_id: int
    task_type: str
    industry: Optional[str]
    status: str
    priority: int
    progress: int
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CorrectionItem(BaseModel):
    id: int
    correction_type: str
    original_text: str
    corrected_text: str
    position_start: Optional[int]
    position_end: Optional[int]
    paragraph: Optional[int]
    line_number: Optional[int]
    explanation: Optional[str]
    severity: str
    confidence: float
    accepted: int

    model_config = ConfigDict(from_attributes=True)


class TaskResult(BaseModel):
    id: int
    task_id: int
    original_content: Optional[str]
    corrected_content: Optional[str]
    summary: Optional[Dict[str, Any]]
    total_corrections: int
    spelling_errors: int
    grammar_errors: int
    terminology_errors: int
    format_errors: int
    confidence_score: float
    created_at: datetime
    corrections: List[CorrectionItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class TaskStatus(BaseModel):
    task_id: str
    status: str
    progress: int
    result: Optional[TaskResult] = None
    error_message: Optional[str] = None


class ProofreadRequest(BaseModel):
    content: str = Field(..., description="待校对文本内容")
    task_type: str = Field(default="full", description="校对类型")
    industry: Optional[str] = Field(None, description="行业领域")
    custom_terminology: Optional[List[str]] = Field(None, description="自定义专业术语")


class AICorrectionResponse(BaseModel):
    success: bool
    corrected_content: str
    corrections: List[Dict[str, Any]] = Field(default_factory=list)
    summary: Dict[str, Any] = Field(default_factory=dict)
    confidence_score: float = 0.0
    error: Optional[str] = None
