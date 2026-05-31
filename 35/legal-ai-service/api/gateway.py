import os
import uuid
import base64
import asyncio
import time
from datetime import datetime
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException, status, Depends, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from config import settings
from modules.document_parser import DocumentParser, ParsedDocument
from modules.embedding_service import EmbeddingService
from modules.provision_matcher import ProvisionMatcher, MatchedProvision
from modules.case_matcher import CaseMatcher, MatchedCase
from modules.result_ranker import ResultRanker, RankedResult
from modules.summary_generator import SummaryGenerator
from modules.provision_correction import (
    ProvisionCorrectionManager,
    CorrectionRequest,
    CorrectionFeedback,
)

from .schemas import (
    DocumentUploadRequest,
    BatchDocumentUploadRequest,
    TextAnalysisRequest,
    CorrectionRequest as CorrectionRequestSchema,
    CorrectionReviewRequest,
    AnalysisSummaryResponse,
    ParsedDocumentResponse,
    MatchedProvisionResponse,
    MatchedCaseResponse,
    LegalProvisionResponse,
    CaseDataResponse,
    AnalysisResultResponse,
    CorrectionResponse,
    CorrectionStatisticsResponse,
    PerformanceMetricsResponse,
    TaskStatusResponse,
    HealthCheckResponse,
    ProvisionSearchRequest,
    CaseSearchRequest,
    APIResponse,
)
from .middleware import (
    verify_api_key,
    rate_limit_middleware,
    RequestLoggingMiddleware,
    ServiceUnavailableMiddleware,
    business_service_client,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Legal AI Service v2...")

    os.makedirs(settings.LOG_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(settings.VECTOR_INDEX_PATH), exist_ok=True)
    os.makedirs("data", exist_ok=True)

    logger.add(
        f"{settings.LOG_DIR}/legal_ai_service_{{time:YYYY-MM-DD}}.log",
        rotation="00:00",
        retention="30 days",
        level=settings.LOG_LEVEL,
        enqueue=True,
    )

    try:
        await asyncio.gather(
            provision_matcher.build_vector_index(),
            case_matcher.build_vector_index(),
        )
        embedding_service.warmup(num_samples=3)
        app.state.service_initialized = True
        logger.info("Legal AI Service v2 started successfully")
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        app.state.service_initialized = False

    yield

    logger.info("Shutting down Legal AI Service...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="法律条文智能援引与类案匹配AI服务系统 v2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestLoggingMiddleware)
app.middleware("http")(rate_limit_middleware)

document_parser = DocumentParser()
embedding_service = EmbeddingService()
provision_matcher = ProvisionMatcher()
case_matcher = CaseMatcher()
result_ranker = ResultRanker()
summary_generator = SummaryGenerator()
correction_manager = ProvisionCorrectionManager()

_tasks: Dict[str, Dict[str, Any]] = {}
_service_initialized = False


def is_service_available() -> bool:
    return getattr(app.state, 'service_initialized', False)


app.add_middleware(ServiceUnavailableMiddleware, service_health_check=is_service_available)


@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    import redis

    redis_connected = False
    try:
        r = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            password=settings.REDIS_PASSWORD,
            socket_timeout=1,
        )
        redis_connected = r.ping()
    except Exception:
        pass

    db_connected = False
    try:
        session = correction_manager._get_session()
        session.execute("SELECT 1")
        db_connected = True
        session.close()
    except Exception:
        pass

    return HealthCheckResponse(
        status="healthy" if is_service_available() else "initializing",
        version=settings.APP_VERSION,
        embedding_model_loaded=embedding_service._model_loaded,
        provision_index_built=provision_matcher._provision_embeddings is not None,
        case_index_built=case_matcher._case_embeddings is not None,
        redis_connected=redis_connected,
        database_connected=db_connected,
        onnx_enabled=getattr(embedding_service, '_onnx_enabled', False),
    )


@app.get("/api/v2/metrics/embedding", response_model=APIResponse)
async def get_embedding_metrics(api_key: str = Depends(verify_api_key)):
    metrics = embedding_service.get_performance_metrics()
    return APIResponse.success(metrics)


@app.post("/api/v2/analyze/upload", response_model=APIResponse)
async def analyze_document_upload_v2(
    file: UploadFile = File(...),
    case_type: Optional[str] = None,
    generate_summary: bool = True,
    apply_corrections: bool = True,
    api_key: str = Depends(verify_api_key),
):
    start_time = time.time()
    request_id = f"req_{uuid.uuid4().hex[:16]}"

    try:
        file_content = await file.read()

        if len(file_content) > settings.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds limit of {settings.MAX_FILE_SIZE} bytes",
            )

        parsed_doc = await document_parser.parse_file(file_content, file.filename)
        if case_type:
            parsed_doc.case_type = case_type

        result = await _process_analysis_v2(
            parsed_doc, start_time, request_id,
            generate_summary=generate_summary,
            apply_corrections=apply_corrections,
        )

        return APIResponse.success(result, request_id=request_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.post("/api/v2/analyze/text", response_model=APIResponse)
async def analyze_text_v2(
    request: TextAnalysisRequest,
    api_key: str = Depends(verify_api_key),
):
    start_time = time.time()
    request_id = f"req_{uuid.uuid4().hex[:16]}"

    try:
        parsed_doc = ParsedDocument(
            document_id=f"doc_{uuid.uuid4().hex[:16]}",
            file_name="text_input.txt",
            file_type=".txt",
            raw_text=request.text,
            cleaned_text=document_parser._clean_text(request.text),
            paragraphs=document_parser._split_paragraphs_smart(request.text),
            case_type=request.case_type,
        )
        document_parser._extract_metadata_safe(parsed_doc)
        document_parser._extract_legal_claims_safe(parsed_doc)
        document_parser._extract_key_phrases_smart(parsed_doc)

        result = await _process_analysis_v2(
            parsed_doc, start_time, request_id,
            top_k_provisions=request.top_k_provisions,
            top_k_cases=request.top_k_cases,
            generate_summary=request.generate_summary,
            apply_corrections=request.apply_corrections,
        )

        return APIResponse.success(result, request_id=request_id)

    except Exception as e:
        logger.error(f"Text analysis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.post("/api/v2/analyze/batch", response_model=APIResponse)
async def analyze_batch_v2(
    request: BatchDocumentUploadRequest,
    background_tasks: BackgroundTasks,
    api_key: str = Depends(verify_api_key),
):
    batch_id = f"batch_{uuid.uuid4().hex[:16]}"
    _tasks[batch_id] = {
        "status": "processing",
        "progress": 0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }

    background_tasks.add_task(_process_batch_analysis_v2, batch_id, request)

    return APIResponse.success({
        "batch_id": batch_id,
        "status": "processing",
        "total_documents": len(request.documents),
    }, request_id=batch_id)


@app.post("/api/v2/corrections", response_model=APIResponse)
async def submit_correction(
    request: CorrectionRequestSchema,
    api_key: str = Depends(verify_api_key),
):
    try:
        from modules.provision_correction import CorrectionRequest as InternalCorrectionRequest

        correction_request = InternalCorrectionRequest(
            document_id=request.document_id,
            original_provision_id=request.original_provision_id,
            corrected_provision_id=request.corrected_provision_id,
            corrected_law_name=request.corrected_law_name,
            corrected_article_number=request.corrected_article_number,
            corrected_content=request.corrected_content,
            correction_reason=request.correction_reason,
            submitted_by=request.submitted_by,
            feedback_comment=request.feedback_comment,
        )

        result = await correction_manager.submit_correction(correction_request)
        return APIResponse.success(result)

    except Exception as e:
        logger.error(f"Failed to submit correction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.post("/api/v2/corrections/review", response_model=APIResponse)
async def review_correction(
    request: CorrectionReviewRequest,
    api_key: str = Depends(verify_api_key),
):
    try:
        from modules.provision_correction import CorrectionFeedback

        feedback = CorrectionFeedback(
            correction_id=request.correction_id,
            status=request.status,
            reviewer=request.reviewer,
            review_comment=request.review_comment,
        )

        result = await correction_manager.review_correction(feedback)
        return APIResponse.success(result)

    except Exception as e:
        logger.error(f"Failed to review correction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.get("/api/v2/corrections", response_model=APIResponse)
async def get_corrections(
    document_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    api_key: str = Depends(verify_api_key),
):
    try:
        from modules.provision_correction import CorrectionStatus

        status_enum = CorrectionStatus(status) if status else None
        corrections = correction_manager.get_corrections(
            document_id=document_id,
            status=status_enum,
            skip=skip,
            limit=limit,
        )
        return APIResponse.success({
            "total": len(corrections),
            "corrections": corrections,
        })

    except Exception as e:
        logger.error(f"Failed to get corrections: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.get("/api/v2/corrections/statistics", response_model=APIResponse)
async def get_correction_statistics(api_key: str = Depends(verify_api_key)):
    try:
        stats = correction_manager.get_correction_statistics()
        return APIResponse.success(stats)
    except Exception as e:
        logger.error(f"Failed to get correction statistics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.delete("/api/v2/corrections/{correction_id}", response_model=APIResponse)
async def delete_correction(
    correction_id: str,
    api_key: str = Depends(verify_api_key),
):
    try:
        success = correction_manager.delete_correction(correction_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Correction not found",
            )
        return APIResponse.success({"deleted": True, "correction_id": correction_id})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete correction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.get("/api/v2/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status_v2(task_id: str, api_key: str = Depends(verify_api_key)):
    if task_id not in _tasks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    task = _tasks[task_id]
    return TaskStatusResponse(
        task_id=task_id,
        status=task["status"],
        progress=task["progress"],
        result=task.get("result"),
        error=task.get("error"),
        created_at=task["created_at"],
        updated_at=task["updated_at"],
    )


@app.post("/api/v2/search/provisions", response_model=APIResponse)
async def search_provisions_v2(
    request: ProvisionSearchRequest,
    api_key: str = Depends(verify_api_key),
):
    try:
        matched = await provision_matcher.match_provisions(
            query_text=request.query,
            top_k=request.top_k,
            threshold=request.threshold,
        )

        if request.category:
            matched = [m for m in matched if m.provision.category == request.category]

        return APIResponse.success({
            "total": len(matched),
            "provisions": [
                {
                    "provision": m.provision.to_dict(),
                    "similarity_score": m.similarity_score,
                    "matched_text": m.matched_text,
                    "match_type": m.match_type,
                    "rank": m.rank,
                }
                for m in matched
            ],
        })

    except Exception as e:
        logger.error(f"Provision search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.post("/api/v2/search/cases", response_model=APIResponse)
async def search_cases_v2(
    request: CaseSearchRequest,
    api_key: str = Depends(verify_api_key),
):
    try:
        matched = await case_matcher.match_cases(
            query_text=request.query,
            case_type=request.case_type,
            top_k=request.top_k,
            threshold=request.threshold,
        )

        return APIResponse.success({
            "total": len(matched),
            "cases": [
                {
                    "case_data": m.case_data.to_dict(),
                    "similarity_score": m.similarity_score,
                    "similarity_details": m.similarity_details,
                    "matched_reasons": m.matched_reasons,
                    "shared_provisions": m.shared_provisions,
                    "shared_keywords": m.shared_keywords,
                    "rank": m.rank,
                }
                for m in matched
            ],
        })

    except Exception as e:
        logger.error(f"Case search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.get("/api/v2/provisions", response_model=APIResponse)
async def list_provisions_v2(
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    api_key: str = Depends(verify_api_key),
):
    try:
        if category:
            provisions = provision_matcher.get_provisions_by_category(category)
        else:
            provisions = provision_matcher.get_all_provisions()

        total = len(provisions)
        provisions = provisions[skip : skip + limit]

        return APIResponse.success({
            "total": total,
            "skip": skip,
            "limit": limit,
            "provisions": [p.to_dict() for p in provisions],
        })

    except Exception as e:
        logger.error(f"List provisions failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.get("/api/v2/cases", response_model=APIResponse)
async def list_cases_v2(
    case_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    api_key: str = Depends(verify_api_key),
):
    try:
        if case_type:
            cases = case_matcher.get_cases_by_type(case_type)
        else:
            cases = case_matcher.get_all_cases()

        total = len(cases)
        cases = cases[skip : skip + limit]

        return APIResponse.success({
            "total": total,
            "skip": skip,
            "limit": limit,
            "cases": [c.to_dict() for c in cases],
        })

    except Exception as e:
        logger.error(f"List cases failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.get("/api/v2/cases/cause_of_actions", response_model=APIResponse)
async def get_cause_of_actions_v2(api_key: str = Depends(verify_api_key)):
    try:
        causes = case_matcher.get_cause_of_actions()
        return APIResponse.success({
            "cause_of_actions": causes,
            "total": len(causes),
        })
    except Exception as e:
        logger.error(f"Failed to get cause of actions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@app.get("/api/v2/provisions/{provision_id}", response_model=APIResponse)
async def get_provision_v2(
    provision_id: str,
    api_key: str = Depends(verify_api_key),
):
    provision = provision_matcher.get_provision_by_id(provision_id)
    if not provision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provision not found",
        )
    return APIResponse.success(provision.to_dict())


@app.get("/api/v2/cases/{case_id}", response_model=APIResponse)
async def get_case_v2(
    case_id: str,
    api_key: str = Depends(verify_api_key),
):
    case = case_matcher.get_case_by_id(case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found",
        )
    return APIResponse.success(case.to_dict())


async def _process_analysis_v2(
    parsed_doc: ParsedDocument,
    start_time: float,
    request_id: str,
    top_k_provisions: Optional[int] = None,
    top_k_cases: Optional[int] = None,
    generate_summary: bool = True,
    apply_corrections: bool = True,
) -> Dict[str, Any]:
    doc_text = f"{parsed_doc.case_type or ''} {parsed_doc.cleaned_text[:2000]}"

    doc_embedding_task = embedding_service.encode_text(doc_text)
    paragraph_embeddings_task = embedding_service.encode_paragraphs(
        parsed_doc.paragraphs[:30]
    )

    doc_embedding_result, paragraph_embeddings = await asyncio.gather(
        doc_embedding_task, paragraph_embeddings_task
    )

    provisions_task = provision_matcher.match_by_paragraphs(
        paragraphs=parsed_doc.paragraphs,
        paragraph_embeddings=paragraph_embeddings,
        top_k=top_k_provisions,
    )

    matched_provisions = await provisions_task

    corrections_applied = 0
    if apply_corrections:
        original_count = len(matched_provisions)
        matched_provisions = correction_manager.apply_corrections_to_result(
            matched_provisions, parsed_doc.document_id
        )
        corrections_applied = original_count - len([
            p for p in matched_provisions if p.match_type != "人工校正"
        ])

    matched_cases = await case_matcher.match_by_document(
        title=parsed_doc.file_name,
        paragraphs=parsed_doc.paragraphs,
        case_type=parsed_doc.case_type,
        top_k=top_k_cases,
        matched_provisions=[
            f"{p.provision.law_name}{p.provision.article_number}"
            for p in matched_provisions[:5]
        ],
        key_phrases=parsed_doc.key_phrases,
    )

    ranked_result = result_ranker.rank_combined(
        provisions=matched_provisions,
        cases=matched_cases,
        query_text=parsed_doc.cleaned_text[:2000],
        legal_claims=parsed_doc.legal_claims,
        key_phrases=parsed_doc.key_phrases,
        case_type=parsed_doc.case_type,
    )

    ranked_provisions = result_ranker.deduplicate_provisions(
        ranked_result.matched_provisions
    )
    ranked_cases = result_ranker.deduplicate_cases(ranked_result.matched_cases)

    summary = None
    if generate_summary:
        analysis_summary = summary_generator.generate_summary(
            parsed_doc,
            ranked_provisions,
            ranked_cases,
            ranked_result.confidence_score,
        )
        summary = AnalysisSummaryResponse(**analysis_summary.to_dict())

    processing_time = (time.time() - start_time) * 1000

    result = {
        "request_id": request_id,
        "document_info": ParsedDocumentResponse.from_parsed_doc(parsed_doc).model_dump(),
        "matched_provisions": [
            {
                "provision": m.provision.to_dict(),
                "similarity_score": m.similarity_score,
                "matched_text": m.matched_text,
                "match_type": m.match_type,
                "rank": m.rank,
            }
            for m in ranked_provisions
        ],
        "matched_cases": [
            {
                "case_data": m.case_data.to_dict(),
                "similarity_score": m.similarity_score,
                "similarity_details": m.similarity_details,
                "matched_reasons": m.matched_reasons,
                "shared_provisions": m.shared_provisions,
                "shared_keywords": m.shared_keywords,
                "rank": m.rank,
            }
            for m in ranked_cases
        ],
        "confidence_score": ranked_result.confidence_score,
        "ranking_strategy": ranked_result.ranking_strategy,
        "processing_time_ms": round(processing_time, 2),
        "created_at": datetime.utcnow().isoformat(),
        "summary": summary.model_dump() if summary else None,
        "corrections_applied": corrections_applied,
    }

    try:
        await business_service_client.notify_analysis_complete(
            parsed_doc.document_id, result
        )
    except Exception as e:
        logger.warning(f"Failed to notify business service: {e}")

    return result


async def _process_batch_analysis_v2(
    batch_id: str,
    request: BatchDocumentUploadRequest,
):
    start_time = time.time()
    results = []
    errors = []
    total = len(request.documents)
    priority = request.priority or 5

    try:
        semaphore = asyncio.Semaphore(settings.BATCH_PROCESSING_MAX_WORKERS)

        async def process_single(doc_req: DocumentUploadRequest, idx: int) -> Dict[str, Any]:
            async with semaphore:
                try:
                    file_content = base64.b64decode(doc_req.file_content)
                    parsed_doc = await document_parser.parse_file(
                        file_content, doc_req.file_name
                    )

                    if doc_req.case_type:
                        parsed_doc.case_type = doc_req.case_type

                    result = await _process_analysis_v2(
                        parsed_doc,
                        time.time(),
                        f"req_{uuid.uuid4().hex[:16]}",
                    )
                    return {"success": True, "result": result, "index": idx}
                except Exception as e:
                    logger.error(f"Batch item failed {doc_req.file_name}: {e}")
                    return {
                        "success": False,
                        "error": str(e),
                        "file_name": doc_req.file_name,
                        "index": idx,
                    }

        tasks = [
            process_single(doc, i) for i, doc in enumerate(request.documents)
        ]

        completed = 0
        for coro in asyncio.as_completed(tasks):
            result = await coro
            if result["success"]:
                results.append(result["result"])
            else:
                errors.append({
                    "file_name": result["file_name"],
                    "error": result["error"],
                })

            completed += 1
            _tasks[batch_id]["progress"] = completed / total
            _tasks[batch_id]["updated_at"] = datetime.utcnow().isoformat()

        processing_time = (time.time() - start_time) * 1000

        _tasks[batch_id]["status"] = "completed"
        _tasks[batch_id]["progress"] = 1.0
        _tasks[batch_id]["result"] = {
            "batch_id": batch_id,
            "total_count": total,
            "success_count": len(results),
            "failed_count": len(errors),
            "results": results,
            "errors": errors,
            "processing_time_ms": round(processing_time, 2),
        }

        logger.info(
            f"Batch v2 processing completed: batch_id={batch_id}, "
            f"success={len(results)}, failed={len(errors)}, "
            f"time={processing_time:.2f}ms"
        )

    except Exception as e:
        logger.error(f"Batch v2 processing failed: {e}")
        _tasks[batch_id]["status"] = "failed"
        _tasks[batch_id]["error"] = str(e)
        _tasks[batch_id]["updated_at"] = datetime.utcnow().isoformat()


def start_server():
    import uvicorn

    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=True,
        workers=getattr(settings, 'UVICORN_WORKERS', 1),
    )


if __name__ == "__main__":
    start_server()
