"""
对外网关接口模块 - 增强版
使用FastAPI提供REST API接口，接收运维人员提交的故障描述文本
新增功能：人工修正、案例管理、模型反馈
"""

import time
from typing import Optional, List, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from src.models import (
    TextParsingRequest,
    ParsedTextResult,
    SingleFaultAnalysisResult,
    BatchFaultAnalysisRequest,
    BatchFaultAnalysisResult,
    HealthCheckResult,
    ErrorResponse,
    FaultType,
    RepairRecommendation,
    FaultCorrectionRequest,
    FaultCorrection,
    CorrectionStatus,
    FaultCase,
    CaseStatus,
    CaseSummary,
    ModelFeedbackRequest,
    ModelPerformanceMetrics,
    FaultCategory,
    SeverityLevel,
)
from src.service_manager import ServiceManager


def create_app(config: dict = None) -> FastAPI:
    app = FastAPI(
        title=config.get("app", {}).get("name", "工业设备故障智能研判AI服务系统"),
        version=config.get("app", {}).get("version", "2.0.0"),
        description="接收运维人员提交的故障描述文本，完成文本解析、语义识别、故障分类、自动推送维修方案。支持人工修正、案例管理、模型反馈。",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    service_manager = ServiceManager(config)

    @app.get("/", tags=["系统"])
    async def root():
        return {
            "service": "工业设备故障智能研判AI服务系统",
            "version": config.get("app", {}).get("version", "2.0.0"),
            "status": "running",
            "features": [
                "故障文本智能分析",
                "批量并行处理",
                "人工修正管理",
                "故障案例库",
                "模型反馈学习",
            ],
        }

    @app.get("/health", response_model=HealthCheckResult, tags=["系统"])
    async def health_check():
        return service_manager.health_check()

    @app.post(
        "/api/v1/fault/analyze",
        response_model=SingleFaultAnalysisResult,
        tags=["故障分析"],
        summary="单条故障文本分析",
        description="提交单条故障描述文本，进行智能分析并返回故障类型和维修方案",
    )
    async def analyze_fault(request: TextParsingRequest):
        try:
            start_time = time.time()
            result = service_manager.analyze_single_fault_with_timeout(request)
            elapsed = time.time() - start_time
            logger.info(f"故障分析API调用完成: 耗时={elapsed:.3f}s")
            return result
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"故障分析API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.post(
        "/api/v1/fault/analyze/batch",
        response_model=BatchFaultAnalysisResult,
        tags=["故障分析"],
        summary="批量故障文本分析",
        description="提交多条故障描述文本，并行处理并返回所有分析结果",
    )
    async def analyze_fault_batch(request: BatchFaultAnalysisRequest):
        try:
            max_batch = service_manager.max_batch_size
            if len(request.texts) > max_batch:
                raise HTTPException(
                    status_code=400,
                    detail=f"批量请求数量超过限制，最大支持{max_batch}条，当前: {len(request.texts)}",
                )

            start_time = time.time()
            result = service_manager.analyze_batch_faults(request)
            elapsed = time.time() - start_time
            logger.info(
                f"批量故障分析API调用完成: 数量={len(request.texts)}, 耗时={elapsed:.3f}s"
            )
            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"批量故障分析API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.post(
        "/api/v1/text/parse",
        response_model=ParsedTextResult,
        tags=["文本解析"],
        summary="文本解析服务",
        description="对故障描述文本进行预处理、分词、关键词提取",
    )
    async def parse_text(request: TextParsingRequest):
        try:
            result = service_manager.text_parser.parse(request)
            return result
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"文本解析API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/fault/types",
        response_model=List[FaultType],
        tags=["故障类型"],
        summary="获取所有故障类型",
        description="获取系统支持的所有故障类型列表",
    )
    async def get_fault_types():
        try:
            fault_types = service_manager.get_fault_types()
            return fault_types
        except Exception as e:
            logger.error(f"获取故障类型API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/fault/types/{fault_type_id}",
        tags=["故障类型"],
        summary="获取指定故障类型详情",
    )
    async def get_fault_type_by_id(fault_type_id: str):
        try:
            fault_type = service_manager.fault_matcher.get_fault_type_by_id(fault_type_id)
            if fault_type is None:
                raise HTTPException(
                    status_code=404, detail=f"故障类型 {fault_type_id} 不存在"
                )
            return fault_type
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"获取故障类型详情API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/repair/solutions",
        tags=["维修方案"],
        summary="获取维修方案",
        description="根据故障类型ID获取对应的维修方案，不传参数则返回所有方案",
    )
    async def get_repair_solutions(
        fault_type_id: Optional[str] = Query(None, description="故障类型ID，如FT001")
    ):
        try:
            solutions = service_manager.get_repair_solutions(fault_type_id)
            return {"fault_type_id": fault_type_id or "all", "solutions": solutions}
        except Exception as e:
            logger.error(f"获取维修方案API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.post(
        "/api/v1/corrections",
        response_model=FaultCorrection,
        tags=["人工修正"],
        summary="提交人工修正",
        description="对AI研判结果进行人工修正，用于模型反馈学习",
    )
    async def add_correction(request: FaultCorrectionRequest):
        try:
            correction = service_manager.correction_manager.add_correction(request)
            logger.info(f"人工修正提交成功: {correction.correction_id}")
            return correction
        except Exception as e:
            logger.error(f"提交人工修正API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/corrections",
        tags=["人工修正"],
        summary="获取修正记录列表",
        description="分页获取所有修正记录，支持按状态、操作员、时间范围筛选",
    )
    async def get_corrections(
        status: Optional[CorrectionStatus] = Query(None, description="修正状态"),
        operator: Optional[str] = Query(None, description="操作员"),
        start_time: Optional[datetime] = Query(None, description="开始时间"),
        end_time: Optional[datetime] = Query(None, description="结束时间"),
        page: int = Query(1, ge=1, description="页码"),
        page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    ):
        try:
            corrections, total = service_manager.correction_manager.get_corrections(
                status=status,
                operator=operator,
                start_time=start_time,
                end_time=end_time,
                page=page,
                page_size=page_size,
            )
            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "items": corrections,
            }
        except Exception as e:
            logger.error(f"获取修正记录API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/corrections/{correction_id}",
        response_model=FaultCorrection,
        tags=["人工修正"],
        summary="获取修正记录详情",
    )
    async def get_correction(correction_id: str):
        try:
            correction = service_manager.correction_manager.get_correction(correction_id)
            if correction is None:
                raise HTTPException(
                    status_code=404, detail=f"修正记录 {correction_id} 不存在"
                )
            return correction
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"获取修正记录详情API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.put(
        "/api/v1/corrections/{correction_id}/status",
        response_model=FaultCorrection,
        tags=["人工修正"],
        summary="更新修正记录状态",
        description="审核修正记录，标记为已批准、已拒绝或已应用",
    )
    async def update_correction_status(
        correction_id: str, status: CorrectionStatus = Body(..., description="目标状态")
    ):
        try:
            correction = service_manager.correction_manager.update_correction_status(
                correction_id, status
            )
            if correction is None:
                raise HTTPException(
                    status_code=404, detail=f"修正记录 {correction_id} 不存在"
                )

            if status == CorrectionStatus.applied:
                try:
                    fault_type = service_manager.fault_matcher.get_fault_type_by_id(
                        correction.correct_fault_type_id
                    )
                    if fault_type:
                        service_manager.case_manager.create_case_from_correction(
                            correction,
                            category=fault_type.category,
                            severity=fault_type.severity,
                        )
                except Exception as e:
                    logger.warning(f"从修正记录创建案例失败: {e}")

            return correction
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"更新修正记录状态API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/corrections/analysis/{analysis_request_id}",
        tags=["人工修正"],
        summary="获取指定分析请求的所有修正记录",
    )
    async def get_corrections_by_analysis_id(analysis_request_id: str):
        try:
            corrections = (
                service_manager.correction_manager.get_corrections_by_analysis_id(
                    analysis_request_id
                )
            )
            return {"analysis_request_id": analysis_request_id, "corrections": corrections}
        except Exception as e:
            logger.error(f"获取分析请求修正记录API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/corrections/stats",
        tags=["人工修正"],
        summary="获取修正统计数据",
        description="获取修正记录的统计数据，包括各状态数量、模型准确率等",
    )
    async def get_correction_stats():
        try:
            stats = service_manager.correction_manager.get_statistics()
            return stats
        except Exception as e:
            logger.error(f"获取修正统计API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.post(
        "/api/v1/cases",
        response_model=FaultCase,
        tags=["案例管理"],
        summary="手动创建故障案例",
        description="手动添加故障案例到案例库",
    )
    async def create_manual_case(
        original_text: str = Body(..., description="故障描述"),
        fault_type_id: str = Body(..., description="故障类型ID"),
        fault_type_name: str = Body(..., description="故障类型名称"),
        category: FaultCategory = Body(..., description="故障分类"),
        severity: SeverityLevel = Body(..., description="严重程度"),
        device_id: Optional[str] = Body(None, description="设备ID"),
        device_type: Optional[str] = Body(None, description="设备类型"),
        keywords: Optional[List[str]] = Body(None, description="关键词列表"),
        repair_effectiveness: Optional[float] = Body(None, description="维修效果评分0-1"),
        repair_cost: Optional[float] = Body(None, description="维修成本"),
        repair_duration: Optional[int] = Body(None, description="维修耗时(分钟)"),
        operator: Optional[str] = Body(None, description="操作员"),
    ):
        try:
            case = service_manager.case_manager.create_manual_case(
                original_text=original_text,
                fault_type_id=fault_type_id,
                fault_type_name=fault_type_name,
                category=category,
                severity=severity,
                device_id=device_id,
                device_type=device_type,
                keywords=keywords,
                repair_effectiveness=repair_effectiveness,
                repair_cost=repair_cost,
                repair_duration=repair_duration,
                operator=operator,
            )
            logger.info(f"手动创建案例成功: {case.case_id}")
            return case
        except Exception as e:
            logger.error(f"创建案例API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/cases",
        tags=["案例管理"],
        summary="查询故障案例",
        description="多条件查询故障案例列表，支持分页",
    )
    async def query_cases(
        fault_type_id: Optional[str] = Query(None, description="故障类型ID"),
        category: Optional[FaultCategory] = Query(None, description="故障分类"),
        device_id: Optional[str] = Query(None, description="设备ID"),
        status: Optional[CaseStatus] = Query(None, description="案例状态"),
        severity: Optional[SeverityLevel] = Query(None, description="严重程度"),
        is_qualified: Optional[bool] = Query(None, description="是否合格案例"),
        keyword: Optional[str] = Query(None, description="关键词搜索"),
        start_time: Optional[datetime] = Query(None, description="开始时间"),
        end_time: Optional[datetime] = Query(None, description="结束时间"),
        page: int = Query(1, ge=1, description="页码"),
        page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    ):
        try:
            cases, total = service_manager.case_manager.query_cases(
                fault_type_id=fault_type_id,
                category=category,
                device_id=device_id,
                start_time=start_time,
                end_time=end_time,
                status=status,
                severity=severity,
                is_qualified=is_qualified,
                keyword=keyword,
                page=page,
                page_size=page_size,
            )
            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "items": cases,
            }
        except Exception as e:
            logger.error(f"查询案例API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/cases/{case_id}",
        response_model=FaultCase,
        tags=["案例管理"],
        summary="获取案例详情",
    )
    async def get_case(case_id: str):
        try:
            case = service_manager.case_manager.get_case(case_id)
            if case is None:
                raise HTTPException(status_code=404, detail=f"案例 {case_id} 不存在")
            return case
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"获取案例详情API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.put(
        "/api/v1/cases/{case_id}",
        response_model=FaultCase,
        tags=["案例管理"],
        summary="更新案例信息",
        description="更新案例的维修效果、成本、状态等信息",
    )
    async def update_case(
        case_id: str,
        repair_effectiveness: Optional[float] = Body(None, description="维修效果评分0-1"),
        repair_cost: Optional[float] = Body(None, description="维修成本"),
        repair_duration: Optional[int] = Body(None, description="维修耗时(分钟)"),
        status: Optional[CaseStatus] = Body(None, description="案例状态"),
        is_qualified: Optional[bool] = Body(None, description="是否合格案例"),
    ):
        try:
            case = service_manager.case_manager.update_case(
                case_id,
                repair_effectiveness=repair_effectiveness,
                repair_cost=repair_cost,
                repair_duration=repair_duration,
                status=status,
                is_qualified=is_qualified,
            )
            if case is None:
                raise HTTPException(status_code=404, detail=f"案例 {case_id} 不存在")
            return case
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"更新案例API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.delete(
        "/api/v1/cases/{case_id}",
        tags=["案例管理"],
        summary="删除案例",
    )
    async def delete_case(case_id: str):
        try:
            success = service_manager.case_manager.delete_case(case_id)
            if not success:
                raise HTTPException(status_code=404, detail=f"案例 {case_id} 不存在")
            return {"message": "案例删除成功", "case_id": case_id}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"删除案例API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/cases/summary",
        response_model=CaseSummary,
        tags=["案例管理"],
        summary="获取案例汇总统计",
        description="获取故障案例的统计汇总数据",
    )
    async def get_case_summary(
        days: Optional[int] = Query(None, description="统计最近N天的数据"),
        start_time: Optional[datetime] = Query(None, description="开始时间"),
        end_time: Optional[datetime] = Query(None, description="结束时间"),
    ):
        try:
            summary = service_manager.case_manager.get_summary(
                days=days, start_time=start_time, end_time=end_time
            )
            return summary
        except Exception as e:
            logger.error(f"获取案例汇总API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/cases/stats",
        tags=["案例管理"],
        summary="获取案例统计数据",
    )
    async def get_case_stats():
        try:
            stats = service_manager.case_manager.get_statistics()
            return stats
        except Exception as e:
            logger.error(f"获取案例统计API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/cases/frequent",
        tags=["案例管理"],
        summary="获取高频故障类型",
        description="获取最近一段时间内出现频率最高的故障类型",
    )
    async def get_frequent_faults(
        top_n: int = Query(10, ge=1, le=50, description="返回数量"),
        days: int = Query(30, ge=1, description="统计天数"),
    ):
        try:
            frequent = service_manager.case_manager.get_frequent_faults(
                top_n=top_n, days=days
            )
            return {"top_n": top_n, "days": days, "items": frequent}
        except Exception as e:
            logger.error(f"获取高频故障API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.post(
        "/api/v1/feedback",
        tags=["模型反馈"],
        summary="提交模型反馈",
        description="对AI研判结果进行反馈，用于模型优化",
    )
    async def add_feedback(request: ModelFeedbackRequest):
        try:
            feedback = service_manager.correction_manager.add_feedback(request)
            logger.info(f"模型反馈提交成功: {feedback['feedback_id']}")
            return feedback
        except Exception as e:
            logger.error(f"提交反馈API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/model/performance",
        response_model=ModelPerformanceMetrics,
        tags=["模型反馈"],
        summary="获取模型性能指标",
        description="获取模型的准确率、各分类表现等性能指标",
    )
    async def get_model_performance():
        try:
            metrics = service_manager.correction_manager.get_performance_metrics()
            return metrics
        except Exception as e:
            logger.error(f"获取模型性能API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/modules/status",
        tags=["系统"],
        summary="获取模块状态",
        description="获取所有服务模块的运行状态",
    )
    async def get_modules_status():
        try:
            status = service_manager.get_module_status()
            return status
        except Exception as e:
            logger.error(f"获取模块状态API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/executor/status",
        tags=["监控"],
        summary="获取线程池运行状态",
        description="获取线程池队列大小、活跃任务数、利用率等状态信息",
    )
    async def get_executor_status():
        try:
            status = service_manager.get_executor_status()
            return status
        except Exception as e:
            logger.error(f"获取线程池状态API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/metrics/tasks",
        tags=["监控"],
        summary="获取任务统计指标",
        description="获取任务提交数、完成数、失败数、超时数、平均处理时间等指标",
    )
    async def get_task_metrics():
        try:
            metrics = service_manager.get_metrics()
            return metrics
        except Exception as e:
            logger.error(f"获取任务指标API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.get(
        "/api/v1/features/cache",
        tags=["监控"],
        summary="获取特征缓存状态",
    )
    async def get_feature_cache_stats():
        try:
            stats = service_manager.feature_extractor.get_cache_stats()
            return stats
        except Exception as e:
            logger.error(f"获取缓存状态API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    @app.post(
        "/api/v1/features/cache/clear",
        tags=["监控"],
        summary="清空特征缓存",
    )
    async def clear_feature_cache():
        try:
            service_manager.feature_extractor.clear_cache()
            return {"message": "特征缓存已清空"}
        except Exception as e:
            logger.error(f"清空缓存API错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"服务内部错误: {str(e)}")

    return app
