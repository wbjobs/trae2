from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, field_validator


class PolishRequest(BaseModel):
    content: str = Field(..., description="待润色文本内容")
    polish_type: str = Field(default="professional", description="润色类型")
    industry: Optional[str] = Field(None, description="所属行业")
    tone: Optional[str] = Field(default="formal", description="语气风格")

    @field_validator("polish_type")
    @classmethod
    def validate_polish_type(cls, v):
        allowed = ["professional", "concise", "fluent", "formal", "creative"]
        if v not in allowed:
            raise ValueError(f"polish_type must be one of {allowed}")
        return v

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, v):
        allowed = ["formal", "friendly", "neutral", "authoritative", "persuasive"]
        if v not in allowed:
            raise ValueError(f"tone must be one of {allowed}")
        return v


class PolishItem(BaseModel):
    original_text: str
    polished_text: str
    position_start: Optional[int] = None
    position_end: Optional[int] = None
    paragraph: Optional[int] = None
    explanation: Optional[str] = None
    polish_type: str
    severity: str = "medium"
    confidence: float = 0.0


class PolishResponse(BaseModel):
    success: bool
    polished_content: str
    polish_items: List[PolishItem] = Field(default_factory=list)
    summary: Dict[str, Any] = Field(default_factory=dict)
    overall_improvement: float = 0.0
    error: Optional[str] = None


class DocumentPolishTask(BaseModel):
    id: int
    document_id: int
    task_id: str
    status: str
    polish_type: str
    tone: str
    industry: Optional[str]
    original_content: Optional[str]
    polished_content: Optional[str]
    progress: int
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class VersionCompareRequest(BaseModel):
    document_id: int = Field(..., description="文档ID")
    version1_id: int = Field(..., description="版本1ID")
    version2_id: int = Field(..., description="版本2ID")
    compare_type: str = Field(default="all", description="对比类型")


class DiffItem(BaseModel):
    type: str = Field(..., description="差异类型: added/removed/modified")
    content: str = Field(..., description="差异内容")
    position: int = Field(..., description="位置")
    paragraph: Optional[int] = None
    explanation: Optional[str] = None


class VersionCompareResponse(BaseModel):
    success: bool
    document_id: int
    version1_id: int
    version2_id: int
    diff_items: List[DiffItem] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)
    similarity_score: float = 0.0
    total_changes: int = 0
    additions: int = 0
    deletions: int = 0
    modifications: int = 0


class TaskLog(BaseModel):
    id: int
    task_id: str
    task_type: str
    status: str
    message: str
    details: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
