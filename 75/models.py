from pydantic import BaseModel, Field
from typing import Optional, Union
from enum import Enum
from datetime import datetime


class AudioFormat(str, Enum):
    WAV = "wav"
    PCM = "pcm"
    MP3 = "mp3"
    OGG = "ogg"


class CorrectionType(str, Enum):
    DEFECT_TYPE = "defect_type"
    DEFECT_SEVERITY = "defect_severity"
    REMEDIATION = "remediation"
    TRANSCRIPTION = "transcription"
    OTHER = "other"


class CaseStatus(str, Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    CORRECTED = "corrected"
    CLOSED = "closed"


class Priority(str, Enum):
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class InspectionRequest(BaseModel):
    task_id: str = Field(..., description="任务唯一标识")
    audio_data: Optional[bytes] = Field(None, description="音频二进制数据")
    audio_url: Optional[str] = Field(None, description="音频下载URL")
    audio_format: AudioFormat = Field(AudioFormat.WAV, description="音频格式")
    sample_rate: int = Field(16000, description="采样率")
    device_id: str = Field(..., description="设备编号")
    inspector_id: str = Field(..., description="巡检人员编号")
    inspection_time: datetime = Field(default_factory=datetime.now, description="巡检时间")
    priority: Priority = Field(Priority.NORMAL, description="任务优先级")
    metadata: Optional[dict] = Field(None, description="附加元数据")


class BatchInspectionRequest(BaseModel):
    tasks: list[InspectionRequest] = Field(..., description="批量巡检任务列表")
    priority: Priority = Field(Priority.NORMAL, description="批次优先级")


class SpeechResult(BaseModel):
    task_id: str
    raw_text: str = Field("", description="原始转写文本")
    confidence: float = Field(0.0, description="转写置信度")
    segments: list[dict] = Field(default_factory=list, description="分段转写结果")
    duration: float = Field(0.0, description="音频时长(秒)")
    processing_time: float = Field(0.0, description="处理耗时(秒)")
    cache_hit: bool = Field(False, description="是否命中缓存")


class SemanticResult(BaseModel):
    task_id: str
    intent: str = Field("", description="识别意图")
    intent_confidence: float = Field(0.0, description="意图置信度")
    keywords: list[str] = Field(default_factory=list, description="提取关键词")
    entities: list[dict] = Field(default_factory=list, description="实体识别结果")
    embedding: list[float] = Field(default_factory=list, description="语义向量")
    severity_level: str = Field("normal", description="严重程度")
    cache_hit: bool = Field(False, description="是否命中缓存")


class DefectResult(BaseModel):
    task_id: str
    defect_type: str = Field("", description="缺陷类型编码")
    defect_name: str = Field("", description="缺陷类型名称")
    defect_category: str = Field("", description="缺陷大类")
    confidence: float = Field(0.0, description="匹配置信度")
    matched_rules: list[dict] = Field(default_factory=list, description="命中规则详情")
    is_defect: bool = Field(False, description="是否判定为缺陷")
    cache_hit: bool = Field(False, description="是否命中缓存")
    top_candidates: list[dict] = Field(default_factory=list, description="前3候选类型")


class RemediationResult(BaseModel):
    task_id: str
    defect_type: str
    remediation_level: str = Field("general", description="整改级别")
    remediation_measures: list[str] = Field(default_factory=list, description="整改措施")
    deadline_hours: int = Field(72, description="整改时限(小时)")
    responsible_dept: str = Field("", description="责任部门")
    push_status: str = Field("pending", description="推送状态")
    push_time: Optional[datetime] = Field(None, description="推送时间")


class FullAnalysisResult(BaseModel):
    task_id: str
    device_id: str
    inspector_id: str
    inspection_time: datetime
    speech_result: Optional[SpeechResult] = None
    semantic_result: Optional[SemanticResult] = None
    defect_result: Optional[DefectResult] = None
    remediation_result: Optional[RemediationResult] = None
    overall_status: str = Field("processing", description="总体状态")
    priority: Priority = Field(Priority.NORMAL, description="任务优先级")
    case_status: CaseStatus = Field(CaseStatus.PENDING, description="案例状态")
    has_correction: bool = Field(False, description="是否经过人工修正")
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None


class HumanCorrectionRequest(BaseModel):
    task_id: str = Field(..., description="任务ID")
    correction_type: CorrectionType = Field(..., description="修正类型")
    operator_id: str = Field(..., description="操作人ID")
    original_value: str = Field("", description="原值")
    corrected_value: str = Field(..., description="修正值")
    reason: str = Field("", description="修正原因")
    comment: Optional[str] = Field(None, description="备注")


class HumanCorrectionResponse(BaseModel):
    correction_id: str = Field(..., description="修正记录ID")
    task_id: str = Field(..., description="任务ID")
    correction_type: CorrectionType = Field(..., description="修正类型")
    operator_id: str = Field(..., description="操作人ID")
    applied: bool = Field(True, description="是否已应用")
    feedback_to_model: bool = Field(True, description="是否已反馈到模型")
    created_at: datetime = Field(default_factory=datetime.now)


class DefectCaseSummary(BaseModel):
    case_id: str = Field(..., description="案例ID")
    task_id: str = Field(..., description="任务ID")
    device_id: str = Field(..., description="设备ID")
    defect_type: str = Field(..., description="缺陷类型")
    defect_name: str = Field(..., description="缺陷名称")
    defect_category: str = Field(..., description="缺陷大类")
    severity: str = Field("general", description="严重程度")
    confidence: float = Field(0.0, description="识别置信度")
    inspection_text: str = Field("", description="巡检描述文本")
    remediation_measures: list[str] = Field(default_factory=list, description="整改措施")
    location: str = Field("", description="位置信息")
    has_human_correction: bool = Field(False, description="是否人工修正")
    created_at: datetime = Field(default_factory=datetime.now)


class CaseStatisticsReport(BaseModel):
    report_id: str = Field(..., description="报表ID")
    period_start: datetime = Field(..., description="统计周期开始")
    period_end: datetime = Field(..., description="统计周期结束")
    total_inspections: int = Field(0, description="总巡检次数")
    total_defects: int = Field(0, description="总缺陷数")
    defect_by_category: dict[str, int] = Field(default_factory=dict, description="按大类统计")
    defect_by_type: dict[str, int] = Field(default_factory=dict, description="按类型统计")
    defect_by_severity: dict[str, int] = Field(default_factory=dict, description="按严重程度统计")
    top_defect_types: list[dict] = Field(default_factory=list, description="TopN缺陷类型")
    correction_rate: float = Field(0.0, description="人工修正率")
    model_accuracy: float = Field(0.0, description="模型准确率")
    generated_at: datetime = Field(default_factory=datetime.now)


class BatchResponse(BaseModel):
    batch_id: str = Field(..., description="批次ID")
    total_tasks: int = Field(0, description="总任务数")
    completed_tasks: int = Field(0, description="已完成数")
    failed_tasks: int = Field(0, description="失败数")
    results: list[dict] = Field(default_factory=list, description="结果列表")


class SystemMetrics(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.now)
    cpu_usage: float = Field(0.0, description="CPU使用率")
    memory_usage: float = Field(0.0, description="内存使用率")
    active_tasks: int = Field(0, description="活跃任务数")
    queue_size: dict = Field(default_factory=dict, description="队列大小")
    throughput: float = Field(0.0, description="吞吐量(tasks/s)")
    avg_latency: float = Field(0.0, description="平均延迟(ms)")
    cache_hit_rate: float = Field(0.0, description="缓存命中率")
    adaptive_concurrency: int = Field(0, description="当前自适应并发数")


class ApiResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[Union[dict, list]] = None
    errors: Optional[list] = None
    timestamp: datetime = Field(default_factory=datetime.now)
