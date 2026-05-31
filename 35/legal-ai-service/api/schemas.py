from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from enum import Enum


class CorrectionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class DocumentUploadRequest(BaseModel):
    file_name: str
    file_content: str
    case_type: Optional[str] = None

    @field_validator("file_name")
    @classmethod
    def validate_file_name(cls, v: str) -> str:
        import os
        ext = os.path.splitext(v.lower())[1]
        allowed = [".txt", ".docx", ".pdf", ".doc"]
        if ext not in allowed:
            raise ValueError(f"File type {ext} not allowed. Allowed types: {allowed}")
        return v


class BatchDocumentUploadRequest(BaseModel):
    documents: List[DocumentUploadRequest] = Field(..., min_length=1, max_length=200)
    priority: Optional[int] = 5


class TextAnalysisRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=100000)
    case_type: Optional[str] = None
    top_k_provisions: Optional[int] = 10
    top_k_cases: Optional[int] = 5
    generate_summary: Optional[bool] = True
    apply_corrections: Optional[bool] = True


class CorrectionRequest(BaseModel):
    document_id: str
    original_provision_id: str
    corrected_provision_id: Optional[str] = None
    corrected_law_name: Optional[str] = None
    corrected_article_number: Optional[str] = None
    corrected_content: Optional[str] = None
    correction_reason: Optional[str] = None
    submitted_by: Optional[str] = None
    feedback_comment: Optional[str] = None


class CorrectionReviewRequest(BaseModel):
    correction_id: str
    status: CorrectionStatus
    reviewer: Optional[str] = None
    review_comment: Optional[str] = None


class AnalysisSummaryResponse(BaseModel):
    document_type: str
    case_overview: str
    key_issues: List[str]
    legal_basis_summary: str
    case_reference_summary: str
    risk_assessment: str
    suggestions: List[str]
    confidence_level: str
    processing_notes: List[str]


class ParsedDocumentResponse(BaseModel):
    document_id: str
    file_name: str
    file_type: str
    case_type: Optional[str]
    court: Optional[str]
    case_number: Optional[str]
    parties: List[str]
    legal_claims: List[str]
    key_phrases: List[str]
    paragraph_count: int
    is_partial: bool
    parse_warnings: List[str]

    @classmethod
    def from_parsed_doc(cls, parsed_doc):
        return cls(
            document_id=parsed_doc.document_id,
            file_name=parsed_doc.file_name,
            file_type=parsed_doc.file_type,
            case_type=parsed_doc.case_type,
            court=parsed_doc.court,
            case_number=parsed_doc.case_number,
            parties=parsed_doc.parties,
            legal_claims=parsed_doc.legal_claims,
            key_phrases=parsed_doc.key_phrases,
            paragraph_count=len(parsed_doc.paragraphs),
            is_partial=parsed_doc.is_partial,
            parse_warnings=parsed_doc.parse_warnings,
        )


class LegalProvisionResponse(BaseModel):
    provision_id: str
    law_name: str
    article_number: str
    article_title: str
    content: str
    category: str


class MatchedProvisionResponse(BaseModel):
    provision: LegalProvisionResponse
    similarity_score: float
    matched_text: str
    match_type: str
    rank: int


class CaseDataResponse(BaseModel):
    case_id: str
    case_number: str
    title: str
    court: str
    court_level: Optional[str]
    case_type: str
    judgment_date: str
    summary: str
    legal_provisions: List[str]
    keywords: List[str]
    cause_of_action: Optional[str]
    judgment_result: Optional[str]


class MatchedCaseResponse(BaseModel):
    case_data: CaseDataResponse
    similarity_score: float
    similarity_details: Optional[Dict[str, float]]
    matched_reasons: List[str]
    shared_provisions: List[str]
    shared_keywords: List[str]
    rank: int


class AnalysisResultResponse(BaseModel):
    request_id: str
    document_info: ParsedDocumentResponse
    matched_provisions: List[MatchedProvisionResponse]
    matched_cases: List[MatchedCaseResponse]
    confidence_score: float
    ranking_strategy: str
    processing_time_ms: float
    created_at: str
    summary: Optional[AnalysisSummaryResponse] = None
    corrections_applied: int = 0


class BatchAnalysisResultResponse(BaseModel):
    batch_id: str
    total_count: int
    success_count: int
    failed_count: int
    results: List[AnalysisResultResponse]
    errors: List[Dict[str, str]]
    processing_time_ms: float


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: float
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str


class HealthCheckResponse(BaseModel):
    status: str
    version: str
    embedding_model_loaded: bool
    provision_index_built: bool
    case_index_built: bool
    redis_connected: bool
    database_connected: bool
    onnx_enabled: bool


class ProvisionSearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 10
    threshold: Optional[float] = 0.6
    category: Optional[str] = None


class CaseSearchRequest(BaseModel):
    query: str
    case_type: Optional[str] = None
    top_k: Optional[int] = 5
    threshold: Optional[float] = 0.6


class PerformanceMetricsResponse(BaseModel):
    total_requests: int
    cache_hits: int
    cache_hit_rate: float
    total_inference_time_ms: float
    average_inference_time_ms: float
    model_load_time_ms: float
    batch_processing_count: int
    average_batch_size: float
    local_cache_size: int
    onnx_enabled: bool
    device: str


class CorrectionResponse(BaseModel):
    id: str
    document_id: str
    original_provision_id: str
    original_law_name: str
    original_article_number: str
    corrected_provision_id: Optional[str]
    corrected_law_name: Optional[str]
    corrected_article_number: Optional[str]
    corrected_content: Optional[str]
    status: str
    correction_reason: Optional[str]
    feedback_comment: Optional[str]
    submitted_by: Optional[str]
    reviewed_by: Optional[str]
    reviewed_at: Optional[str]
    created_at: str
    updated_at: str
    is_active: bool


class CorrectionStatisticsResponse(BaseModel):
    total_corrections: int
    pending: int
    approved: int
    rejected: int
    approval_rate: float


class APIResponse(BaseModel):
    code: int
    message: str
    data: Optional[Dict[str, Any]] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    request_id: Optional[str] = None

    @classmethod
    def success(cls, data: Optional[Dict[str, Any]] = None, request_id: Optional[str] = None) -> "APIResponse":
        return cls(code=0, message="success", data=data, request_id=request_id)

    @classmethod
    def error(cls, code: int, message: str, request_id: Optional[str] = None) -> "APIResponse":
        return cls(code=code, message=message, request_id=request_id)
