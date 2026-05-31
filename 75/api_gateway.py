import asyncio
import time
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, Depends, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader

from config import get_settings
from logger import setup_logger
from models import (
    InspectionRequest,
    BatchInspectionRequest,
    ApiResponse,
    FullAnalysisResult,
    AudioFormat,
    HumanCorrectionRequest,
    BatchResponse,
)

logger = setup_logger("api_gateway")
settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="电力设备巡检语音描述智能分析 AI 服务系统",
    docs_url="/api/v2/docs",
    redoc_url="/api/v2/redoc",
    openapi_url="/api/v2/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key_header = APIKeyHeader(name=settings.GATEWAY_API_KEY_HEADER, auto_error=False)
_valid_api_keys = set(settings.GATEWAY_API_KEYS.split(","))


class RateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        self._requests[client_id] = [
            t for t in self._requests[client_id] if t > window_start
        ]

        if len(self._requests[client_id]) >= self.max_requests:
            return False

        self._requests[client_id].append(now)
        return True

    def get_remaining(self, client_id: str) -> int:
        now = time.time()
        window_start = now - self.window_seconds
        active = [t for t in self._requests[client_id] if t > window_start]
        return max(0, self.max_requests - len(active))


_rate_limiter = RateLimiter(max_requests=settings.GATEWAY_RATE_LIMIT)

_orchestrator = None


async def verify_api_key(api_key: str = Depends(api_key_header)) -> str:
    if not api_key:
        raise HTTPException(status_code=401, detail="API Key is required")
    if api_key not in _valid_api_keys:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return api_key


async def rate_limit_dependency(request: Request) -> None:
    client_id = request.client.host if request.client else "unknown"
    if not _rate_limiter.is_allowed(client_id):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {settings.GATEWAY_RATE_LIMIT} requests per minute",
        )


def set_orchestrator(orchestrator) -> None:
    global _orchestrator
    _orchestrator = orchestrator


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    request_id = str(uuid.uuid4())[:8]

    logger.info(f"[{request_id}] {request.method} {request.url.path}")

    response = await call_next(request)

    duration = (time.time() - start) * 1000
    logger.info(
        f"[{request_id}] Completed {response.status_code} in {duration:.1f}ms"
    )

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{duration:.1f}ms"
    response.headers["API-Version"] = "2.0"
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ApiResponse(
            code=500,
            message="Internal server error",
            data={"error": str(exc)},
        ).model_dump(mode="json"),
    )


@app.get("/health", tags=["系统监控"])
async def health_check():
    return ApiResponse(
        code=0,
        message="healthy",
        data={
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "api_version": "2.0",
            "timestamp": datetime.now().isoformat(),
        },
    )


@app.get("/api/v2/health", tags=["系统监控"])
async def health_check_v2():
    return ApiResponse(
        code=0,
        message="healthy",
        data={
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "api_version": "2.0",
            "timestamp": datetime.now().isoformat(),
        },
    )


@app.get(
    "/api/v2/status",
    tags=["系统监控"],
    dependencies=[Depends(verify_api_key)],
)
async def system_status():
    if not _orchestrator:
        return ApiResponse(code=0, message="ok", data={"status": "not_initialized"})

    status_data = await _orchestrator.get_system_status()
    return ApiResponse(code=0, message="ok", data=status_data)


@app.get(
    "/api/v2/metrics",
    tags=["系统监控"],
    dependencies=[Depends(verify_api_key)],
)
async def metrics():
    if not _orchestrator:
        return ApiResponse(code=0, data={"status": "not_initialized"})

    status = await _orchestrator.get_system_status()
    return ApiResponse(code=0, data=status)


@app.websocket("/api/v2/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    if not _orchestrator:
        await websocket.send_json(
            {"event": "error", "message": "Service not initialized"}
        )
        await websocket.close()
        return

    await _orchestrator.register_websocket(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "ping":
                await websocket.send_json({"event": "pong", "timestamp": datetime.now().isoformat()})
            elif action == "subscribe":
                await websocket.send_json(
                    {"event": "subscribed", "tasks": data.get("task_ids", [])}
                )

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    finally:
        await _orchestrator.unregister_websocket(websocket)


@app.post(
    "/api/v2/inspection/analyze",
    tags=["巡检分析"],
    dependencies=[Depends(verify_api_key), Depends(rate_limit_dependency)],
)
async def submit_inspection(
    request: InspectionRequest,
    background_tasks: BackgroundTasks,
):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    task_id = request.task_id
    priority = request.priority.value if request.priority else "normal"
    logger.info(f"New inspection task: {task_id}, device={request.device_id}, priority={priority}")

    background_tasks.add_task(_orchestrator.process_full_pipeline, request)

    return ApiResponse(
        code=0,
        message="Task accepted, processing in background",
        data={
            "task_id": task_id,
            "priority": priority,
            "status": "processing",
            "poll_url": f"/api/v2/inspection/result/{task_id}",
            "ws_url": f"/api/v2/ws/stream",
        },
    )


@app.post(
    "/api/v2/inspection/analyze/sync",
    tags=["巡检分析"],
    dependencies=[Depends(verify_api_key), Depends(rate_limit_dependency)],
)
async def submit_inspection_sync(request: InspectionRequest):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    task_id = request.task_id
    logger.info(f"New sync inspection task: {task_id}, device={request.device_id}")

    result = await _orchestrator.process_full_pipeline(request)

    return ApiResponse(
        code=0,
        message="Analysis completed",
        data=result.model_dump(mode="json") if result else None,
    )


@app.post(
    "/api/v2/inspection/batch",
    tags=["巡检分析"],
    dependencies=[Depends(verify_api_key), Depends(rate_limit_dependency)],
)
async def submit_inspection_batch(
    request: BatchInspectionRequest,
    background_tasks: BackgroundTasks,
):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    batch_id = f"BATCH-{uuid.uuid4().hex[:10].upper()}"
    priority = request.priority.value if request.priority else "normal"
    total = len(request.tasks)

    logger.info(f"New batch inspection: {batch_id}, tasks={total}, priority={priority}")

    for task in request.tasks:
        task.priority = request.priority

    background_tasks.add_task(_orchestrator.process_batch, request.tasks)

    return ApiResponse(
        code=0,
        message=f"Batch of {total} tasks accepted",
        data={
            "batch_id": batch_id,
            "total_tasks": total,
            "priority": priority,
            "status": "processing",
            "task_ids": [t.task_id for t in request.tasks],
        },
    )


@app.post(
    "/api/v2/inspection/batch/sync",
    tags=["巡检分析"],
    dependencies=[Depends(verify_api_key), Depends(rate_limit_dependency)],
)
async def submit_inspection_batch_sync(request: BatchInspectionRequest):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    batch_id = f"BATCH-{uuid.uuid4().hex[:10].upper()}"
    total = len(request.tasks)

    logger.info(f"Sync batch inspection: {batch_id}, tasks={total}")

    for task in request.tasks:
        task.priority = request.priority

    results = await _orchestrator.process_batch(request.tasks)

    success = sum(1 for r in results if r is not None)
    failed = total - success

    response = BatchResponse(
        batch_id=batch_id,
        total_tasks=total,
        completed_tasks=success,
        failed_tasks=failed,
        results=[r.model_dump(mode="json") if r else None for r in results],
    )

    return ApiResponse(code=0, message="Batch analysis completed", data=response.model_dump(mode="json"))


@app.get(
    "/api/v2/inspection/result/{task_id}",
    tags=["巡检分析"],
    dependencies=[Depends(verify_api_key)],
)
async def get_inspection_result(task_id: str):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    result = _orchestrator.get_task_result(task_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    return ApiResponse(code=0, message="ok", data=result.model_dump(mode="json"))


@app.get(
    "/api/v2/inspection/results",
    tags=["巡检分析"],
    dependencies=[Depends(verify_api_key)],
)
async def list_inspection_results(limit: int = 100, offset: int = 0):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    results = list(_orchestrator._task_results.values())
    results = sorted(
        results,
        key=lambda r: r.created_at or datetime.min,
        reverse=True,
    )
    paginated = results[offset : offset + limit]

    return ApiResponse(
        code=0,
        message="ok",
        data={
            "items": [r.model_dump(mode="json") for r in paginated],
            "total": len(results),
            "limit": limit,
            "offset": offset,
        },
    )


@app.post(
    "/api/v2/speech/transcribe",
    tags=["语音转写"],
    dependencies=[Depends(verify_api_key)],
)
async def speech_transcribe(
    task_id: str,
    audio_data: bytes,
    audio_format: AudioFormat = AudioFormat.WAV,
    sample_rate: int = 16000,
    priority: str = "normal",
):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    result = await _orchestrator.speech_module.transcribe(
        task_id=task_id,
        audio_data=audio_data,
        audio_format=audio_format,
        sample_rate=sample_rate,
        priority=priority,
    )
    return ApiResponse(code=0, message="ok", data=result.model_dump())


@app.post(
    "/api/v2/semantic/analyze",
    tags=["语义分析"],
    dependencies=[Depends(verify_api_key)],
)
async def semantic_analyze(task_id: str, text: str):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    result = await _orchestrator.semantic_module.analyze(task_id=task_id, text=text)
    return ApiResponse(code=0, message="ok", data=result.model_dump())


@app.post(
    "/api/v2/defect/match",
    tags=["缺陷匹配"],
    dependencies=[Depends(verify_api_key)],
)
async def defect_match(task_id: str, text: str):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    semantic_result = await _orchestrator.semantic_module.analyze(task_id=task_id, text=text)
    result = await _orchestrator.defect_module.match(
        task_id=task_id, text=text, semantic_result=semantic_result
    )
    return ApiResponse(code=0, message="ok", data=result.model_dump())


@app.get(
    "/api/v2/defect/types",
    tags=["缺陷匹配"],
    dependencies=[Depends(verify_api_key)],
)
async def get_defect_types():
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    types = await _orchestrator.defect_module.get_all_defect_types()
    return ApiResponse(code=0, message="ok", data=types)


@app.post(
    "/api/v2/correction/submit",
    tags=["人工修正"],
    dependencies=[Depends(verify_api_key)],
)
async def submit_correction(request: HumanCorrectionRequest):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    current_result = _orchestrator.get_task_result(request.task_id)
    if not current_result:
        raise HTTPException(status_code=404, detail=f"Task {request.task_id} not found")

    response, updated = await _orchestrator.correction_module.submit_correction(
        request, current_result
    )

    if response and updated:
        _orchestrator._task_results[request.task_id] = updated

    return ApiResponse(
        code=0,
        message="Correction applied successfully",
        data=response.model_dump() if response else None,
    )


@app.get(
    "/api/v2/correction/pending",
    tags=["人工修正"],
    dependencies=[Depends(verify_api_key)],
)
async def get_pending_corrections(limit: int = 100):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    pending = await _orchestrator.correction_module.get_pending_reviews(limit=limit)
    return ApiResponse(
        code=0,
        message="ok",
        data={"count": len(pending), "items": pending},
    )


@app.get(
    "/api/v2/correction/list",
    tags=["人工修正"],
    dependencies=[Depends(verify_api_key)],
)
async def list_corrections(
    operator_id: Optional[str] = None,
    limit: int = 100,
):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    corrections = await _orchestrator.correction_module.list_corrections(
        operator_id=operator_id, limit=limit
    )
    return ApiResponse(
        code=0,
        message="ok",
        data={"count": len(corrections), "items": corrections},
    )


@app.get(
    "/api/v2/correction/stats",
    tags=["人工修正"],
    dependencies=[Depends(verify_api_key)],
)
async def get_correction_stats():
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    stats = _orchestrator.correction_module.get_feedback_stats()
    return ApiResponse(code=0, message="ok", data=stats)


@app.get(
    "/api/v2/cases/search",
    tags=["案例汇总"],
    dependencies=[Depends(verify_api_key)],
)
async def search_cases(
    defect_type: Optional[str] = None,
    device_id: Optional[str] = None,
    limit: int = 100,
):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    cases = await _orchestrator.case_aggregator.search_cases(
        defect_type=defect_type,
        device_id=device_id,
        limit=limit,
    )
    return ApiResponse(
        code=0,
        message="ok",
        data={
            "count": len(cases),
            "items": [c.model_dump(mode="json") for c in cases],
        },
    )


@app.get(
    "/api/v2/cases/{case_id}",
    tags=["案例汇总"],
    dependencies=[Depends(verify_api_key)],
)
async def get_case(case_id: str):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    case = await _orchestrator.case_aggregator.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    return ApiResponse(code=0, message="ok", data=case.model_dump(mode="json"))


@app.get(
    "/api/v2/cases/statistics",
    tags=["案例汇总"],
    dependencies=[Depends(verify_api_key)],
)
async def get_case_statistics(period_days: int = 30):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    correction_stats = _orchestrator.correction_module.get_feedback_stats()
    report = await _orchestrator.case_aggregator.generate_statistics_report(
        period_days=period_days,
        correction_count=correction_stats.get("total_feedback", 0),
    )
    return ApiResponse(code=0, message="ok", data=report.model_dump(mode="json"))


@app.get(
    "/api/v2/cases/summary",
    tags=["案例汇总"],
    dependencies=[Depends(verify_api_key)],
)
async def get_case_summary():
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    summary = await _orchestrator.case_aggregator.get_summary()
    return ApiResponse(code=0, message="ok", data=summary)


@app.post(
    "/api/v2/remediation/generate",
    tags=["整改建议"],
    dependencies=[Depends(verify_api_key)],
)
async def generate_remediation(task_id: str, text: str, push_url: Optional[str] = None):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    semantic_result = await _orchestrator.semantic_module.analyze(task_id=task_id, text=text)
    defect_result = await _orchestrator.defect_module.match(
        task_id=task_id, text=text, semantic_result=semantic_result
    )
    result = await _orchestrator.remediation_module.generate_and_push(
        defect_result=defect_result, push_url=push_url
    )
    return ApiResponse(code=0, message="ok", data=result.model_dump())


@app.get(
    "/api/v2/remediation/result/{task_id}",
    tags=["整改建议"],
    dependencies=[Depends(verify_api_key)],
)
async def get_remediation_result(task_id: str):
    if not _orchestrator:
        raise HTTPException(status_code=503, detail="Service not initialized")

    result = _orchestrator.remediation_module.get_result(task_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Result for {task_id} not found")
    return ApiResponse(code=0, message="ok", data=result.model_dump())


@app.get("/", tags=["系统监控"])
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "api_version": "2.0",
        "endpoints": {
            "docs": "/api/v2/docs",
            "health": "/health",
            "api_v2_prefix": "/api/v2",
        },
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/v1/{path:path}", tags=["版本兼容"])
async def v1_compat(path: str, request: Request):
    return ApiResponse(
        code=301,
        message="API v1 deprecated, please use v2",
        data={"new_path": f"/api/v2/{path}"},
    )
