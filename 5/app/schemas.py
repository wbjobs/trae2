from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any, List
from datetime import datetime
from app.models import TaskStatus, BatchStatus
from app.config import settings


class SchemaField(BaseModel):
    name: str = Field(..., description="字段名称")
    type: str = Field(..., description="字段类型: string, number, boolean, array, object")
    description: str = Field(..., description="字段描述，用于指导AI抽取")
    required: bool = Field(default=False, description="是否必填")


class ExtractionRequest(BaseModel):
    text: str = Field(..., description="待抽取的原始文本")
    schema: List[SchemaField] = Field(..., description="抽取的Schema定义")

    @field_validator("text")
    @classmethod
    def check_text_length(cls, v: str) -> str:
        if len(v) > settings.MAX_TEXT_LENGTH:
            raise ValueError(f"文本长度不能超过 {settings.MAX_TEXT_LENGTH} 字符")
        if not v.strip():
            raise ValueError("文本不能为空")
        return v

    @field_validator("schema")
    @classmethod
    def check_schema(cls, v: List[SchemaField]) -> List[SchemaField]:
        if not v:
            raise ValueError("Schema不能为空")
        if len(v) > 50:
            raise ValueError("Schema字段不能超过50个")
        return v


class ExtractionResponse(BaseModel):
    task_id: str = Field(..., description="任务ID")
    status: TaskStatus = Field(..., description="任务状态")
    result: Optional[Dict[str, Any]] = Field(None, description="抽取结果")
    error_message: Optional[str] = Field(None, description="错误信息")
    created_at: datetime = Field(..., description="创建时间")


class TaskQueryResponse(BaseModel):
    task_id: str = Field(..., description="任务ID")
    batch_id: Optional[str] = Field(None, description="所属批量任务ID")
    status: TaskStatus = Field(..., description="任务状态")
    original_text: Optional[str] = Field(None, description="原始文本（截断）")
    schema_definition: List[SchemaField] = Field(..., description="Schema定义")
    result: Optional[Dict[str, Any]] = Field(None, description="抽取结果")
    error_message: Optional[str] = Field(None, description="错误信息")
    created_at: datetime = Field(..., description="创建时间")
    completed_at: Optional[datetime] = Field(None, description="完成时间")


class TaskListResponse(BaseModel):
    total: int = Field(..., description="总数")
    items: List[TaskQueryResponse] = Field(..., description="任务列表")


class BatchTextItem(BaseModel):
    text: str = Field(..., description="待抽取文本")
    metadata: Optional[Dict[str, Any]] = Field(None, description="业务元数据，用于关联")


class BatchExtractionRequest(BaseModel):
    texts: List[BatchTextItem] = Field(..., description="待批量抽取的文本列表")
    schema: List[SchemaField] = Field(..., description="统一的Schema定义")
    priority: Optional[str] = Field("normal", description="优先级: low, normal, high")
    dedup: bool = Field(True, description="是否对重复内容去重")

    @field_validator("texts")
    @classmethod
    def check_texts(cls, v: List[BatchTextItem]) -> List[BatchTextItem]:
        if not v:
            raise ValueError("文本列表不能为空")
        if len(v) > 500:
            raise ValueError("批量抽取不能超过500条")
        return v

    @field_validator("schema")
    @classmethod
    def check_batch_schema(cls, v: List[SchemaField]) -> List[SchemaField]:
        if not v:
            raise ValueError("Schema不能为空")
        if len(v) > 50:
            raise ValueError("Schema字段不能超过50个")
        return v


class BatchExtractionResponse(BaseModel):
    batch_id: str = Field(..., description="批量任务ID")
    total_count: int = Field(..., description="总任务数")
    status: BatchStatus = Field(..., description="批量任务状态")
    created_at: datetime = Field(..., description="创建时间")


class BatchTaskResultItem(BaseModel):
    task_id: str = Field(..., description="任务ID")
    status: TaskStatus = Field(..., description="任务状态")
    result: Optional[Dict[str, Any]] = Field(None, description="抽取结果")
    error_message: Optional[str] = Field(None, description="错误信息")
    text_index: Optional[int] = Field(None, description="原始文本索引（批量中的位置）")
    metadata: Optional[Dict[str, Any]] = Field(None, description="业务元数据")


class BatchProgressResponse(BaseModel):
    batch_id: str = Field(..., description="批量任务ID")
    status: BatchStatus = Field(..., description="批量任务状态")
    total_count: int = Field(..., description="总任务数")
    completed_count: int = Field(..., description="已完成数")
    failed_count: int = Field(..., description="失败数")
    processing_count: int = Field(..., description="处理中数")
    pending_count: int = Field(..., description="待处理数")
    progress_percent: float = Field(..., description="进度百分比(0-100)")
    error_message: Optional[str] = Field(None, description="批量错误信息")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    completed_at: Optional[datetime] = Field(None, description="完成时间")


class BatchResultsResponse(BaseModel):
    batch_id: str = Field(..., description="批量任务ID")
    status: BatchStatus = Field(..., description="批量任务状态")
    total_count: int = Field(..., description="总任务数")
    completed_count: int = Field(..., description="已完成数")
    failed_count: int = Field(..., description="失败数")
    progress_percent: float = Field(..., description="进度百分比(0-100)")
    results: List[BatchTaskResultItem] = Field(..., description="任务结果列表")


class BatchListResponse(BaseModel):
    total: int = Field(..., description="总数")
    items: List[BatchProgressResponse] = Field(..., description="批量任务列表")


class HealthResponse(BaseModel):
    status: str = "healthy"
    version: str
    timestamp: datetime
