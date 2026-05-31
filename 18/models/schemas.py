from datetime import datetime
from typing import List, Optional, Dict, Any, Generic, TypeVar
from pydantic import BaseModel, Field, ConfigDict

T = TypeVar('T')


class ApiResponse(BaseModel, Generic[T]):
    """统一API响应格式"""
    success: bool = True
    code: int = 200
    message: str = "success"
    data: Optional[T] = None
    timestamp: datetime = Field(default_factory=datetime.now)


class PaginatedResponse(BaseModel, Generic[T]):
    """分页响应格式"""
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class DocumentBase(BaseModel):
    filename: str = Field(..., description="文件名")
    file_type: str = Field(..., description="文件类型: pdf/docx/doc")
    file_size: int = Field(..., description="文件大小(字节)")


class DocumentCreate(DocumentBase):
    file_path: str = Field(..., description="文件存储路径")
    priority: int = Field(default=0, description="处理优先级")


class Document(DocumentBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    file_path: str
    upload_time: datetime
    status: str = Field(default="pending", description="处理状态: pending/processing/completed/failed/paused")
    error_message: Optional[str] = None
    priority: int = 0


class DocumentContent(BaseModel):
    document_id: int
    raw_text: str = Field(..., description="原始文本内容")
    cleaned_text: Optional[str] = Field(None, description="清洗后的文本")
    page_count: Optional[int] = Field(None, description="页数")
    paragraph_count: Optional[int] = Field(None, description="段落数")
    metadata: Optional[Dict[str, Any]] = Field(None, description="文档元数据")


class HighlightInfo(BaseModel):
    """关键信息高亮"""
    document_id: int
    key_paragraphs: List[Dict[str, Any]] = Field(default_factory=list, description="关键段落")
    key_sentences: List[Dict[str, Any]] = Field(default_factory=list, description="关键句子")
    important_terms: List[Dict[str, Any]] = Field(default_factory=list, description="重要术语")
    title_highlights: List[str] = Field(default_factory=list, description="标题高亮")
    confidence_scores: Dict[str, float] = Field(default_factory=dict, description="置信度得分")
    extract_time: Optional[datetime] = None


class SemanticFeature(BaseModel):
    document_id: int
    keywords: List[str] = Field(default_factory=list, description="关键词列表")
    summary: Optional[str] = Field(None, description="文档摘要")
    topics: List[str] = Field(default_factory=list, description="主题列表")
    entities: List[Dict[str, Any]] = Field(default_factory=list, description="命名实体")
    embedding: Optional[List[float]] = Field(None, description="文本向量嵌入")
    sentiment: Optional[float] = Field(None, description="情感倾向: -1到1之间")
    key_phrases: List[str] = Field(default_factory=list, description="关键短语")


class ClassificationResult(BaseModel):
    document_id: int
    primary_category: str = Field(..., description="主分类")
    secondary_categories: List[str] = Field(default_factory=list, description="次要分类")
    confidence: float = Field(..., ge=0.0, le=1.0, description="分类置信度")
    category_scores: Dict[str, float] = Field(default_factory=dict, description="各分类得分")
    model_version: Optional[str] = None
    classification_time: Optional[datetime] = Field(default_factory=datetime.now)


class ClassificationFeedback(BaseModel):
    """分类反馈"""
    document_id: int = Field(..., description="文档ID")
    original_category: str = Field(..., description="原始分类")
    corrected_category: str = Field(..., description="修正分类")
    feedback_text: Optional[str] = Field(None, description="反馈说明")
    user_id: Optional[str] = Field(None, description="用户ID")


class ClassificationFeedbackResponse(ClassificationFeedback):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_used_for_training: bool
    feedback_time: datetime


class StoredDocument(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    document_info: Document
    content: Optional[DocumentContent] = None
    semantic_features: Optional[SemanticFeature] = None
    highlights: Optional[HighlightInfo] = None
    classification: Optional[ClassificationResult] = None
    feedback: Optional[ClassificationFeedbackResponse] = None
    created_at: datetime
    updated_at: datetime


class BatchProcessRequest(BaseModel):
    document_ids: List[int] = Field(..., description="待处理文档ID列表")
    skip_classification: bool = Field(default=False, description="是否跳过分类")
    skip_embedding: bool = Field(default=False, description="是否跳过向量生成")
    skip_highlights: bool = Field(default=False, description="是否跳过高亮提取")
    priority: int = Field(default=0, description="任务优先级")


class BatchProcessResponse(BaseModel):
    task_id: str = Field(..., description="任务ID")
    total_count: int = Field(..., description="总文档数")
    status: str = Field(..., description="任务状态")
    estimated_time: Optional[float] = Field(None, description="预计剩余时间(秒)")


class ProcessStatus(BaseModel):
    task_id: str
    status: str = Field(..., description="pending/processing/completed/failed/paused/completed_with_errors")
    processed_count: int = 0
    total_count: int
    failed_count: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    throughput: Optional[float] = Field(None, description="吞吐量(文档/秒)")
    avg_processing_time: Optional[float] = Field(None, description="平均处理时间(秒)")
    error_details: List[str] = Field(default_factory=list)


class QueryRequest(BaseModel):
    query: str = Field(..., description="查询文本")
    top_k: int = Field(default=10, ge=1, le=100, description="返回结果数量")
    categories: Optional[List[str]] = Field(default=None, description="分类过滤")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    min_confidence: Optional[float] = Field(default=0.0, ge=0.0, le=1.0)


class QueryResult(BaseModel):
    document_id: int
    filename: str
    category: str
    similarity_score: float
    summary: Optional[str] = None
    matched_keywords: List[str] = Field(default_factory=list)
    highlights: Optional[List[str]] = Field(default=None, description="高亮片段")


class ExternalSystemCall(BaseModel):
    system_name: str = Field(..., description="外部系统名称")
    endpoint: str = Field(..., description="接口地址")
    method: str = Field(default="POST", description="请求方法: GET/POST/PUT/DELETE")
    payload: Dict[str, Any] = Field(default_factory=dict, description="请求数据")
    headers: Optional[Dict[str, str]] = Field(default=None, description="请求头")
    timeout: int = Field(default=30, description="超时时间(秒)")


class ExternalSystemResponse(BaseModel):
    success: bool
    status_code: Optional[int] = None
    response_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    response_time: float


class PerformanceMetrics(BaseModel):
    """性能指标"""
    total_documents_processed: int = 0
    avg_processing_time: float = 0.0
    throughput: float = 0.0
    cache_hit_rate: float = 0.0
    ai_request_count: int = 0
    ai_retry_count: int = 0
    error_rate: float = 0.0


class ExtractHighlightsRequest(BaseModel):
    """高亮提取请求"""
    document_id: int = Field(..., description="文档ID")
    max_paragraphs: int = Field(default=5, ge=1, le=20, description="最大关键段落数")
    max_sentences: int = Field(default=10, ge=1, le=50, description="最大关键句子数")


class UpdateClassificationRequest(BaseModel):
    """更新分类请求"""
    document_id: int = Field(..., description="文档ID")
    new_category: str = Field(..., description="新分类")
    reason: Optional[str] = Field(None, description="修改原因")


class BatchStatusResponse(BaseModel):
    """批量任务状态汇总"""
    pending_count: int = 0
    processing_count: int = 0
    completed_count: int = 0
    failed_count: int = 0
    total_tasks: int = 0
