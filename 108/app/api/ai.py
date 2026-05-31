from sanic import Blueprint, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from app.core import success, paginated_response, get_db, NotFoundException
from app.modules.auth import login_required, permission_required
from app.modules.ai import AIService
from app.modules.search import SearchService

ai_bp = Blueprint("ai", url_prefix="/api/ai")


class CompareRequest(BaseModel):
    case_id: Optional[int] = None
    case_content: Optional[str] = None
    law_ids: Optional[List[int]] = None
    top_k: int = Field(5, ge=1, le=20)


class BatchCompareRequest(BaseModel):
    case_ids: List[int] = Field(..., description="案例ID列表")
    law_ids: Optional[List[int]] = None
    top_k: int = Field(5, ge=1, le=20)


class GenerateReportRequest(BaseModel):
    case_id: Optional[int] = None
    case_content: Optional[str] = None
    law_ids: Optional[List[int]] = None
    matched_laws: Optional[List[dict]] = None
    export_format: str = Field("pdf", description="导出格式: pdf/docx")


class InterpretLawRequest(BaseModel):
    law_title: str = Field(..., min_length=1, max_length=500, description="法条标题")
    law_content: str = Field(..., min_length=1, description="法条内容")
    article_no: str = Field("", max_length=100, description="条文编号")
    interpretation_depth: str = Field("standard", description="释义深度: brief/standard/detailed")


class RewriteCaseRequest(BaseModel):
    case_content: str = Field(..., min_length=1, description="案例内容")
    rewrite_type: str = Field("simplify", description="改写类型: simplify/formalize/summarize/expand/translate_style")
    target_audience: str = Field("general", description="目标受众: general/lawyer/judge/student")
    custom_requirements: str = Field("", max_length=500, description="自定义改写要求")


@ai_bp.post("/compare")
@login_required()
@permission_required("case:compare")
async def compare_case_with_laws(request: Request):
    user = request.ctx.user
    req = CompareRequest(**request.json)

    if not req.case_id and not req.case_content:
        raise NotFoundException("请指定案例ID或提供案例内容")

    if req.case_id:
        case_doc = await SearchService.get_case_by_id(req.case_id)
        if not case_doc:
            raise NotFoundException("案例不存在")
        case_content = case_doc.get("content", "")
    else:
        case_content = req.case_content

    if req.law_ids:
        laws = []
        for law_id in req.law_ids:
            law_doc = await SearchService.get_law_by_id(law_id)
            if law_doc:
                laws.append(law_doc)
        if not laws:
            raise NotFoundException("未找到有效的法条")
    else:
        laws = await SearchService.find_similar_laws(case_content, top_k=req.top_k * 2)
        if not laws:
            raise NotFoundException("未找到相关法条，请先建立索引")

    matched_laws = await AIService.compare_case_with_laws(
        case_content, laws, top_k=req.top_k
    )

    return success({
        "case_id": req.case_id,
        "total_matched": len(matched_laws),
        "matched_laws": matched_laws,
        "avg_similarity": int(sum(l.get("similarity_score", 0) for l in matched_laws) / max(len(matched_laws), 1))
    }, "比对完成")


@ai_bp.post("/compare-cases")
@login_required()
@permission_required("case:compare")
async def compare_case_with_cases(request: Request):
    req = CompareRequest(**request.json)

    if not req.case_id and not req.case_content:
        raise NotFoundException("请指定案例ID或提供案例内容")

    if req.case_id:
        case_doc = await SearchService.get_case_by_id(req.case_id)
        if not case_doc:
            raise NotFoundException("案例不存在")
        case_content = case_doc.get("content", "")
    else:
        case_content = req.case_content

    target_cases = await SearchService.find_similar_cases(
        case_content, top_k=req.top_k + 1
    )
    target_cases = [c for c in target_cases if int(c.get("_id", 0)) != req.case_id][:req.top_k]

    if not target_cases:
        raise NotFoundException("未找到相关案例，请先建立索引")

    matched_cases = await AIService.compare_case_with_cases(
        case_content, target_cases, top_k=req.top_k
    )

    return success({
        "case_id": req.case_id,
        "total_matched": len(matched_cases),
        "matched_cases": matched_cases
    }, "案例相似度比对完成")


@ai_bp.post("/batch-compare")
@login_required()
@permission_required("case:compare")
async def batch_compare(request: Request):
    user = request.ctx.user
    req = BatchCompareRequest(**request.json)

    async with get_db() as db:
        from app.modules.tasks import TaskService, TaskType
        task = await TaskService.create_task(
            db,
            name=f"批量比对 {len(req.case_ids)} 个案例",
            task_type=TaskType.COMPARE_BATCH,
            params={
                "case_ids": req.case_ids,
                "law_ids": req.law_ids,
                "top_k": req.top_k
            },
            creator_id=user.id
        )
        return success({"task_id": task.id}, "已提交批量比对任务")


@ai_bp.post("/report")
@login_required()
@permission_required("case:compare")
async def generate_report(request: Request):
    req = GenerateReportRequest(**request.json)

    if not req.case_id and not req.case_content:
        raise NotFoundException("请指定案例ID或提供案例内容")

    if req.case_id:
        case_doc = await SearchService.get_case_by_id(req.case_id)
        if not case_doc:
            raise NotFoundException("案例不存在")
        case_content = case_doc.get("content", "")
    else:
        case_content = req.case_content

    if req.matched_laws:
        matched_laws = req.matched_laws
    else:
        if req.law_ids:
            matched_laws = []
            for law_id in req.law_ids:
                law_doc = await SearchService.get_law_by_id(law_id)
                if law_doc:
                    matched_laws.append(law_doc)
        else:
            matched_laws = await SearchService.find_similar_laws(case_content, top_k=5)

        matched_laws = await AIService.compare_case_with_laws(
            case_content, matched_laws, top_k=5
        )

    if req.export_format in ["pdf", "docx"]:
        from app.modules.export import ExportService
        filename = await ExportService.generate_comparison_report(
            case_content=case_content,
            matched_laws=matched_laws,
            export_format=req.export_format
        )
        return success({
            "download_url": f"/api/export/download/{filename}",
            "filename": filename
        }, "报告生成成功")
    else:
        report_data = await AIService.generate_comparison_report(case_content, matched_laws)
        return success({
            **report_data,
            "matched_laws": matched_laws
        }, "报告生成完成")


@ai_bp.post("/interpret-law")
@login_required()
@permission_required("case:compare")
async def interpret_law(request: Request):
    user = request.ctx.user
    req = InterpretLawRequest(**request.json)

    result = await AIService.interpret_law(
        law_title=req.law_title,
        law_content=req.law_content,
        article_no=req.article_no,
        interpretation_depth=req.interpretation_depth
    )

    return success(result, "法条释义完成" if result.get("success") else "法条释义失败")


@ai_bp.post("/interpret-law-async")
@login_required()
@permission_required("case:compare")
async def interpret_law_async(request: Request):
    user = request.ctx.user
    req = InterpretLawRequest(**request.json)

    async with get_db() as db:
        from app.modules.tasks import TaskService, TaskType
        task = await TaskService.create_task(
            db,
            name=f"法条释义: {req.law_title}",
            task_type=TaskType.INTERPRET_LAW,
            params={
                "law_title": req.law_title,
                "law_content": req.law_content,
                "article_no": req.article_no,
                "interpretation_depth": req.interpretation_depth
            },
            creator_id=user.id
        )
        return success({"task_id": task.id}, "已提交法条释义任务")


@ai_bp.post("/rewrite-case")
@login_required()
@permission_required("case:compare")
async def rewrite_case(request: Request):
    user = request.ctx.user
    req = RewriteCaseRequest(**request.json)

    result = await AIService.rewrite_case(
        case_content=req.case_content,
        rewrite_type=req.rewrite_type,
        target_audience=req.target_audience,
        custom_requirements=req.custom_requirements
    )

    return success(result, "案例改写完成" if result.get("success") else "案例改写失败")


@ai_bp.post("/rewrite-case-async")
@login_required()
@permission_required("case:compare")
async def rewrite_case_async(request: Request):
    user = request.ctx.user
    req = RewriteCaseRequest(**request.json)

    async with get_db() as db:
        from app.modules.tasks import TaskService, TaskType
        task = await TaskService.create_task(
            db,
            name=f"案例改写: {req.rewrite_type}",
            task_type=TaskType.REWRITE_CASE,
            params={
                "case_content": req.case_content,
                "rewrite_type": req.rewrite_type,
                "target_audience": req.target_audience,
                "custom_requirements": req.custom_requirements
            },
            creator_id=user.id
        )
        return success({"task_id": task.id}, "已提交案例改写任务")


@ai_bp.get("/ai-stats")
@login_required()
async def get_ai_stats(request: Request):
    stats = await AIService.get_ai_stats()
    return success(stats, "AI调用统计")


@ai_bp.get("/ai-logs")
@login_required()
async def get_ai_logs(request: Request):
    limit = int(request.args.get("limit", 100))
    call_type = request.args.get("call_type", None)
    logs = await AIService.get_ai_logs(limit=limit, call_type=call_type)
    return success({
        "logs": logs,
        "total": len(logs)
    }, "AI调用日志")


@ai_bp.get("/embedding")
@login_required()
async def get_embedding(request: Request):
    text = request.args.get("text", "")
    if not text:
        raise NotFoundException("请提供文本内容")

    embedding = await AIService.get_embedding(text)
    return success({
        "dimension": len(embedding),
        "embedding": embedding[:10]
    })
