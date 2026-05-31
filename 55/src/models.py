"""
数据模型模块 - 增强版
定义系统中所有请求/响应/故障类型等数据结构
新增：人工修正、故障案例、模型反馈相关模型
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class SeverityLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class FaultCategory(str, Enum):
    mechanical = "机械故障"
    electrical = "电气故障"
    hydraulic = "液压故障"
    pneumatic = "气动故障"
    auxiliary = "辅助系统"


class CorrectionStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    applied = "applied"


class CaseStatus(str, Enum):
    active = "active"
    archived = "archived"
    verified = "verified"


class TaskPriority(str, Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class TextParsingRequest(BaseModel):
    text: str = Field(..., min_length=5, max_length=2000, description="故障描述文本")
    device_id: Optional[str] = Field(None, description="设备ID")
    device_type: Optional[str] = Field(None, description="设备类型")
    priority: Optional[TaskPriority] = Field(TaskPriority.normal, description="任务优先级")


class ParsedTextResult(BaseModel):
    original_text: str = Field(..., description="原始文本")
    cleaned_text: str = Field(..., description="清洗后的文本")
    keywords: List[str] = Field(default_factory=list, description="提取的关键词")
    tokens: List[str] = Field(default_factory=list, description="分词结果")
    device_info: Optional[dict] = Field(None, description="提取的设备信息")


class SemanticFeatureResult(BaseModel):
    feature_vector: List[float] = Field(default_factory=list, description="语义特征向量")
    embedding_model: str = Field(..., description="使用的嵌入模型")
    vector_dimension: int = Field(..., description="向量维度")
    processing_time: Optional[float] = Field(None, description="特征提取耗时")


class FaultType(BaseModel):
    id: str = Field(..., description="故障类型ID")
    name: str = Field(..., description="故障类型名称")
    category: FaultCategory = Field(..., description="故障分类")
    description: str = Field(..., description="故障描述")
    keywords: List[str] = Field(default_factory=list, description="关键词列表")
    severity: SeverityLevel = Field(..., description="严重程度")
    use_count: Optional[int] = Field(0, description="使用次数")
    accuracy_score: Optional[float] = Field(1.0, description="准确率评分")


class FaultMatchResult(BaseModel):
    fault_type: FaultType = Field(..., description="匹配的故障类型")
    similarity_score: float = Field(..., ge=0.0, le=1.0, description="相似度得分")
    matched_keywords: List[str] = Field(default_factory=list, description="匹配的关键词")
    rank: int = Field(..., description="匹配排名")
    match_method: Optional[str] = Field(None, description="匹配方法")


class RepairStep(BaseModel):
    step_description: str = Field(..., description="步骤描述")
    step_order: int = Field(..., description="步骤顺序")


class RepairSolution(BaseModel):
    id: str = Field(..., description="方案ID")
    title: str = Field(..., description="方案标题")
    description: str = Field(..., description="方案描述")
    priority: int = Field(..., ge=1, description="优先级，1为最高")
    estimated_time: str = Field(..., description="预计耗时")
    tools: List[str] = Field(default_factory=list, description="所需工具")
    steps: List[str] = Field(default_factory=list, description="操作步骤")
    success_rate: Optional[float] = Field(None, description="成功率")
    use_count: Optional[int] = Field(0, description="使用次数")


class RepairRecommendation(BaseModel):
    fault_type_id: str = Field(..., description="故障类型ID")
    fault_type_name: str = Field(..., description="故障类型名称")
    solutions: List[RepairSolution] = Field(default_factory=list, description="推荐的维修方案")


class SingleFaultAnalysisResult(BaseModel):
    request_id: str = Field(..., description="请求ID")
    original_text: str = Field(..., description="原始故障描述")
    parsing_result: ParsedTextResult = Field(..., description="文本解析结果")
    semantic_features: SemanticFeatureResult = Field(..., description="语义特征结果")
    fault_matches: List[FaultMatchResult] = Field(default_factory=list, description="故障匹配结果")
    repair_recommendation: Optional[RepairRecommendation] = Field(None, description="维修方案推荐")
    processing_time: float = Field(..., description="处理耗时(秒)")
    timestamp: datetime = Field(default_factory=datetime.now, description="处理时间戳")
    model_version: Optional[str] = Field(None, description="模型版本")
    confidence: Optional[float] = Field(None, description="总体置信度")


class BatchFaultAnalysisRequest(BaseModel):
    texts: List[TextParsingRequest] = Field(..., min_length=1, description="故障描述文本列表")
    request_id: Optional[str] = Field(None, description="批次请求ID")
    priority: Optional[TaskPriority] = Field(TaskPriority.normal, description="批次优先级")


class BatchFaultAnalysisResult(BaseModel):
    request_id: str = Field(..., description="批次请求ID")
    total_count: int = Field(..., description="总处理数量")
    success_count: int = Field(..., description="成功处理数量")
    failed_count: int = Field(..., description="失败数量")
    timeout_count: Optional[int] = Field(0, description="超时数量")
    rejected_count: Optional[int] = Field(0, description="拒绝数量")
    results: List[SingleFaultAnalysisResult] = Field(default_factory=list, description="分析结果列表")
    errors: List[dict] = Field(default_factory=list, description="错误信息列表")
    total_processing_time: float = Field(..., description="总处理时间(秒)")
    timestamp: datetime = Field(default_factory=datetime.now, description="处理时间戳")


class FaultCorrectionRequest(BaseModel):
    analysis_request_id: str = Field(..., description="原始分析请求ID")
    original_text: str = Field(..., description="原始故障描述")
    correct_fault_type_id: str = Field(..., description="正确的故障类型ID")
    correct_fault_type_name: str = Field(..., description="正确的故障类型名称")
    operator: str = Field(..., description="操作员")
    reason: str = Field(..., description="修正原因")
    repair_feedback: Optional[str] = Field(None, description="维修效果反馈")
    repair_cost: Optional[float] = Field(None, description="维修成本")
    repair_duration: Optional[int] = Field(None, description="维修耗时(分钟)")


class FaultCorrection(BaseModel):
    correction_id: str = Field(..., description="修正记录ID")
    analysis_request_id: str = Field(..., description="原始分析请求ID")
    original_text: str = Field(..., description="原始故障描述")
    original_fault_type_id: Optional[str] = Field(None, description="原始判断的故障类型ID")
    original_fault_type_name: Optional[str] = Field(None, description="原始判断的故障类型名称")
    original_similarity: Optional[float] = Field(None, description="原始匹配相似度")
    correct_fault_type_id: str = Field(..., description="正确的故障类型ID")
    correct_fault_type_name: str = Field(..., description="正确的故障类型名称")
    operator: str = Field(..., description="操作员")
    reason: str = Field(..., description="修正原因")
    repair_feedback: Optional[str] = Field(None, description="维修效果反馈")
    repair_cost: Optional[float] = Field(None, description="维修成本")
    repair_duration: Optional[int] = Field(None, description="维修耗时(分钟)")
    status: CorrectionStatus = Field(CorrectionStatus.pending, description="修正状态")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    applied_at: Optional[datetime] = Field(None, description="应用到模型的时间")
    model_improvement: Optional[float] = Field(None, description="模型提升幅度")


class FaultCase(BaseModel):
    case_id: str = Field(..., description="案例ID")
    original_text: str = Field(..., description="故障描述")
    fault_type_id: str = Field(..., description="故障类型ID")
    fault_type_name: str = Field(..., description="故障类型名称")
    category: FaultCategory = Field(..., description="故障分类")
    severity: SeverityLevel = Field(..., description="严重程度")
    device_id: Optional[str] = Field(None, description="设备ID")
    device_type: Optional[str] = Field(None, description="设备类型")
    keywords: List[str] = Field(default_factory=list, description="关键词")
    repair_solution_id: Optional[str] = Field(None, description="使用的维修方案ID")
    repair_solution_title: Optional[str] = Field(None, description="使用的维修方案名称")
    repair_effectiveness: Optional[float] = Field(None, description="维修效果评分(0-1)")
    repair_cost: Optional[float] = Field(None, description="维修成本")
    repair_duration: Optional[int] = Field(None, description="维修耗时(分钟)")
    operator: Optional[str] = Field(None, description="操作员")
    source: str = Field(..., description="来源(analysis/correction/manual)")
    source_id: Optional[str] = Field(None, description="来源ID")
    status: CaseStatus = Field(CaseStatus.active, description="案例状态")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")
    verification_count: Optional[int] = Field(0, description="验证次数")
    is_qualified: Optional[bool] = Field(True, description="是否合格案例")


class CaseQueryRequest(BaseModel):
    fault_type_id: Optional[str] = Field(None, description="故障类型ID")
    category: Optional[FaultCategory] = Field(None, description="故障分类")
    device_id: Optional[str] = Field(None, description="设备ID")
    start_time: Optional[datetime] = Field(None, description="开始时间")
    end_time: Optional[datetime] = Field(None, description="结束时间")
    status: Optional[CaseStatus] = Field(None, description="案例状态")
    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(20, ge=1, le=100, description="每页数量")


class CaseSummary(BaseModel):
    total_cases: int = Field(..., description="总案例数")
    by_category: Dict[str, int] = Field(default_factory=dict, description="按分类统计")
    by_fault_type: Dict[str, int] = Field(default_factory=dict, description="按故障类型统计")
    by_severity: Dict[str, int] = Field(default_factory=dict, description="按严重程度统计")
    avg_repair_cost: Optional[float] = Field(None, description="平均维修成本")
    avg_repair_duration: Optional[float] = Field(None, description="平均维修耗时")
    time_range: Optional[str] = Field(None, description="统计时间范围")


class ModelFeedbackRequest(BaseModel):
    analysis_request_id: str = Field(..., description="分析请求ID")
    is_correct: bool = Field(..., description="判断是否正确")
    correct_fault_type_id: Optional[str] = Field(None, description="正确的故障类型ID")
    feedback: Optional[str] = Field(None, description="反馈说明")
    operator: Optional[str] = Field(None, description="反馈人")


class ModelPerformanceMetrics(BaseModel):
    total_predictions: int = Field(..., description="总预测数")
    correct_predictions: int = Field(..., description="正确预测数")
    accuracy: float = Field(..., description="准确率")
    top1_accuracy: Optional[float] = Field(None, description="Top-1准确率")
    top3_accuracy: Optional[float] = Field(None, description="Top-3准确率")
    by_category_accuracy: Dict[str, float] = Field(default_factory=dict, description="各分类准确率")
    avg_processing_time: Optional[float] = Field(None, description="平均处理时间")
    total_feedback_count: Optional[int] = Field(0, description="总反馈数")
    last_updated: datetime = Field(default_factory=datetime.now, description="最后更新时间")


class HealthCheckResult(BaseModel):
    status: str = Field(..., description="服务状态")
    version: str = Field(..., description="服务版本")
    modules: dict = Field(default_factory=dict, description="各模块状态")
    uptime: float = Field(..., description="运行时间(秒)")
    case_count: Optional[int] = Field(None, description="案例总数")
    correction_count: Optional[int] = Field(None, description="修正记录总数")
    model_accuracy: Optional[float] = Field(None, description="模型准确率")


class ErrorResponse(BaseModel):
    error_code: str = Field(..., description="错误代码")
    error_message: str = Field(..., description="错误信息")
    details: Optional[dict] = Field(None, description="详细信息")
    timestamp: datetime = Field(default_factory=datetime.now, description="时间戳")