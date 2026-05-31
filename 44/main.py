import asyncio
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Request, Query, HTTPException
from fastapi.responses import JSONResponse

from config import get_config
from models import (
    SignalingMessage,
    SignalingDirection,
    SignalingType,
    SignalingPriority,
    ChannelResource,
    ChannelStatus,
    ChannelType,
    ScheduledTask,
    TaskStatus,
    TaskType,
    CallbackEventType,
    ApiResponse,
    Credential,
    UserRole,
    ServiceOperation,
    PriorityAdjustReason,
    FailureCategory,
    FailureSeverity,
)
from cache import get_cache
from auth import get_auth_manager, require_auth
from channel_manager import get_channel_manager
from task_scheduler import get_task_scheduler
from signaling import get_signaling_manager
from callback import get_callback_manager
from service_client import get_service_client
from failure_tracer import get_failure_tracer


config = get_config()

app = FastAPI(
    title="卫星地面站信令分发与任务调度系统",
    description="Ground Station Signaling Distribution & Task Scheduling API",
    version="2.1.0",
)


@app.on_event("startup")
async def startup_event():
    get_cache()
    get_auth_manager()
    get_channel_manager()
    get_task_scheduler()
    get_signaling_manager()
    get_callback_manager()
    get_service_client()
    get_failure_tracer()


@app.get("/health")
async def health_check():
    cache = get_cache()
    channel_mgr = get_channel_manager()
    task_sched = get_task_scheduler()
    signaling_mgr = get_signaling_manager()
    callback_mgr = get_callback_manager()
    failure_tracer = get_failure_tracer()
    return {
        "status": "healthy",
        "service": "ground-station-api",
        "timestamp": datetime.utcnow().isoformat(),
        "cache_stats": cache.stats(),
        "channel_stats": channel_mgr.get_allocation_stats(),
        "task_stats": task_sched.get_schedule_stats(),
        "signaling_stats": signaling_mgr.get_queue_stats(),
        "callback_stats": callback_mgr.get_callback_stats(),
        "failure_stats": failure_tracer.get_failure_stats(),
    }


# ==================== 鉴权接口 ====================

prefix = config.api_prefix


@app.post(f"{prefix}/auth/login")
async def auth_login(request: Request):
    body = await request.json()
    api_key = body.get("api_key", "")
    auth_mgr = get_auth_manager()
    token = auth_mgr.authenticate(api_key)
    if token is None:
        return JSONResponse(
            status_code=401,
            content=ApiResponse(code=401, message="Invalid API key").model_dump(),
        )
    return ApiResponse(
        code=0,
        message="Authentication successful",
        data={
            "token": token.token,
            "expires_at": token.expires_at.isoformat(),
            "role": token.role.value,
        },
    ).model_dump()


@app.post(f"{prefix}/auth/verify")
async def auth_verify(request: Request):
    body = await request.json()
    token_str = body.get("token", "")
    auth_mgr = get_auth_manager()
    token = auth_mgr.verify_token(token_str)
    if token is None:
        return ApiResponse(
            code=401, message="Invalid or expired token"
        ).model_dump()
    return ApiResponse(
        code=0,
        message="Token valid",
        data={
            "token": token.token,
            "expires_at": token.expires_at.isoformat(),
            "role": token.role.value,
        },
    ).model_dump()


@app.post(f"{prefix}/auth/credentials")
async def auth_create_credential(request: Request):
    body = await request.json()
    token_str = body.get("token", "")
    auth_mgr = get_auth_manager()
    token = auth_mgr.verify_token(token_str)
    if token is None or token.role != UserRole.ADMIN:
        return JSONResponse(
            status_code=403,
            content=ApiResponse(code=403, message="Admin access required").model_dump(),
        )
    new_key = str(uuid.uuid4()).replace("-", "")[:16]
    credential = Credential(
        api_key=new_key,
        role=UserRole(body.get("role", "monitor")),
        allowed_operations=body.get("allowed_operations", []),
        description=body.get("description", ""),
    )
    if auth_mgr.register_credential(credential):
        return ApiResponse(
            code=0, message="Credential created", data={"api_key": new_key}
        ).model_dump()
    return ApiResponse(code=1, message="Failed to create credential").model_dump()


@app.get(prefix + "/auth/stats")
async def auth_stats(request: Request):
    token_str = request.headers.get("Authorization", "").replace("Bearer ", "")
    auth_mgr = get_auth_manager()
    token = auth_mgr.verify_token(token_str)
    if token is None or token.role != UserRole.ADMIN:
        return JSONResponse(
            status_code=403,
            content=ApiResponse(code=403, message="Admin access required").model_dump(),
        )
    return ApiResponse(code=0, message="Success", data=auth_mgr.get_auth_stats()).model_dump()


@app.get(f"{prefix}/auth/credentials")
async def auth_list_credentials(request: Request):
    token_str = request.headers.get("Authorization", "").replace("Bearer ", "")
    auth_mgr = get_auth_manager()
    token = auth_mgr.verify_token(token_str)
    if token is None or token.role != UserRole.ADMIN:
        return JSONResponse(
            status_code=403,
            content=ApiResponse(code=403, message="Admin access required").model_dump(),
        )
    return ApiResponse(
        code=0, message="Success", data=auth_mgr.list_credentials()
    ).model_dump()


# ==================== 信令接收接口 ====================


@app.post(f"{prefix}/signaling/receive")
async def signaling_receive(message: SignalingMessage):
    signaling_mgr = get_signaling_manager()
    result = signaling_mgr.receive_message(message)
    return ApiResponse(
        code=0, message="Message queued successfully", data=result
    ).model_dump()


@app.post(f"{prefix}/signaling/send")
async def signaling_send(message: SignalingMessage):
    signaling_mgr = get_signaling_manager()
    result = signaling_mgr.send_message(message)
    return ApiResponse(
        code=0, message="Message sent successfully", data=result
    ).model_dump()


@app.get(prefix + "/signaling/status/{message_id}")
async def signaling_get_status(message_id: str):
    signaling_mgr = get_signaling_manager()
    status = signaling_mgr.get_message_status(message_id)
    if status is None:
        return JSONResponse(
            status_code=404,
            content=ApiResponse(
                code=404, message=f"Message {message_id} not found"
            ).model_dump(),
        )
    return ApiResponse(code=0, message="Success", data=status).model_dump()


@app.get(f"{prefix}/signaling/queue")
async def signaling_queue_status():
    signaling_mgr = get_signaling_manager()
    return ApiResponse(
        code=0,
        message="Success",
        data={
            "queued": signaling_mgr.list_queued_messages(),
            "processing": signaling_mgr.list_processing_messages(),
        },
    ).model_dump()


@app.get(f"{prefix}/signaling/stats")
async def signaling_stats():
    signaling_mgr = get_signaling_manager()
    return ApiResponse(
        code=0, message="Success", data=signaling_mgr.get_queue_stats()
    ).model_dump()


# ==================== 信道资源管控接口 ====================


@app.post(f"{prefix}/channel/add")
async def channel_add(channel: ChannelResource):
    channel_mgr = get_channel_manager()
    if channel_mgr.add_channel(channel):
        return ApiResponse(
            code=0, message="Channel added", data={"channel_id": channel.channel_id}
        ).model_dump()
    return ApiResponse(code=1, message="Channel already exists").model_dump()


@app.delete(prefix + "/channel/{channel_id}")
async def channel_remove(channel_id: str):
    channel_mgr = get_channel_manager()
    if channel_mgr.remove_channel(channel_id):
        return ApiResponse(code=0, message="Channel removed").model_dump()
    return JSONResponse(
        status_code=404,
        content=ApiResponse(code=404, message="Channel not found").model_dump(),
    )


@app.get(prefix + "/channel/{channel_id}")
async def channel_get(channel_id: str):
    channel_mgr = get_channel_manager()
    channel = channel_mgr.get_channel(channel_id)
    if channel is None:
        return JSONResponse(
            status_code=404,
            content=ApiResponse(code=404, message="Channel not found").model_dump(),
        )
    return ApiResponse(code=0, message="Success", data=channel.model_dump()).model_dump()


@app.get(f"{prefix}/channel/list")
async def channel_list(
    status: Optional[ChannelStatus] = None,
    channel_type: Optional[ChannelType] = None,
    satellite_id: Optional[str] = None,
):
    channel_mgr = get_channel_manager()
    channels = channel_mgr.list_channels(
        status=status, channel_type=channel_type, satellite_id=satellite_id
    )
    return ApiResponse(
        code=0,
        message="Success",
        data=[ch.model_dump() for ch in channels],
    ).model_dump()


@app.post(prefix + "/channel/{channel_id}/status")
async def channel_update_status(channel_id: str, request: Request):
    body = await request.json()
    new_status = ChannelStatus(body.get("status", "idle"))
    channel_mgr = get_channel_manager()
    if channel_mgr.update_channel_status(channel_id, new_status):
        return ApiResponse(code=0, message="Status updated").model_dump()
    return JSONResponse(
        status_code=404,
        content=ApiResponse(code=404, message="Channel not found").model_dump(),
    )


@app.post(prefix + "/channel/{channel_id}/heartbeat")
async def channel_heartbeat(channel_id: str):
    channel_mgr = get_channel_manager()
    if channel_mgr.heartbeat(channel_id):
        return ApiResponse(code=0, message="Heartbeat acknowledged").model_dump()
    return JSONResponse(
        status_code=404,
        content=ApiResponse(code=404, message="Channel not found").model_dump(),
    )


@app.get(f"{prefix}/channel/stats")
async def channel_stats():
    channel_mgr = get_channel_manager()
    return ApiResponse(
        code=0, message="Success", data=channel_mgr.get_allocation_stats()
    ).model_dump()


# ==================== 任务分配接口 ====================


@app.post(f"{prefix}/task/create")
async def task_create(task: ScheduledTask):
    task_sched = get_task_scheduler()
    if task_sched.create_task(task):
        return ApiResponse(
            code=0, message="Task created", data={"task_id": task.task_id}
        ).model_dump()
    return ApiResponse(code=1, message="Task ID already exists").model_dump()


@app.get(prefix + "/task/{task_id}")
async def task_get(task_id: str):
    task_sched = get_task_scheduler()
    task = task_sched.get_task(task_id)
    if task is None:
        return JSONResponse(
            status_code=404,
            content=ApiResponse(code=404, message="Task not found").model_dump(),
        )
    return ApiResponse(code=0, message="Success", data=task.model_dump()).model_dump()


@app.get(f"{prefix}/task/list")
async def task_list(
    status: Optional[TaskStatus] = None,
    satellite_id: Optional[str] = None,
    task_type: Optional[TaskType] = None,
):
    task_sched = get_task_scheduler()
    tasks = task_sched.list_tasks(
        status=status, satellite_id=satellite_id, task_type=task_type
    )
    return ApiResponse(
        code=0,
        message="Success",
        data=[t.model_dump() for t in tasks],
    ).model_dump()


@app.post(prefix + "/task/{task_id}/start")
async def task_start(task_id: str):
    task_sched = get_task_scheduler()
    if task_sched.start_task(task_id):
        return ApiResponse(code=0, message="Task started").model_dump()
    return ApiResponse(code=1, message="Cannot start task").model_dump()


@app.post(prefix + "/task/{task_id}/pause")
async def task_pause(task_id: str):
    task_sched = get_task_scheduler()
    if task_sched.pause_task(task_id):
        return ApiResponse(code=0, message="Task paused").model_dump()
    return ApiResponse(code=1, message="Cannot pause task").model_dump()


@app.post(prefix + "/task/{task_id}/resume")
async def task_resume(task_id: str):
    task_sched = get_task_scheduler()
    if task_sched.resume_task(task_id):
        return ApiResponse(code=0, message="Task resumed").model_dump()
    return ApiResponse(code=1, message="Cannot resume task").model_dump()


@app.post(prefix + "/task/{task_id}/complete")
async def task_complete(task_id: str, request: Request):
    body = await request.json()
    message = body.get("message", "")
    task_sched = get_task_scheduler()
    if task_sched.complete_task(task_id, message):
        return ApiResponse(code=0, message="Task completed").model_dump()
    return ApiResponse(code=1, message="Cannot complete task").model_dump()


@app.post(prefix + "/task/{task_id}/fail")
async def task_fail(task_id: str, request: Request):
    body = await request.json()
    error = body.get("error", "Unknown error")
    task_sched = get_task_scheduler()
    if task_sched.fail_task(task_id, error):
        return ApiResponse(code=0, message="Task marked as failed").model_dump()
    return ApiResponse(code=1, message="Cannot fail task").model_dump()


@app.post(prefix + "/task/{task_id}/cancel")
async def task_cancel(task_id: str):
    task_sched = get_task_scheduler()
    if task_sched.cancel_task(task_id):
        return ApiResponse(code=0, message="Task cancelled").model_dump()
    return ApiResponse(code=1, message="Cannot cancel task").model_dump()


@app.delete(prefix + "/task/{task_id}")
async def task_delete(task_id: str):
    task_sched = get_task_scheduler()
    if task_sched.delete_task(task_id):
        return ApiResponse(code=0, message="Task deleted").model_dump()
    return JSONResponse(
        status_code=404,
        content=ApiResponse(code=404, message="Task not found").model_dump(),
    )


@app.get(f"{prefix}/task/stats")
async def task_stats():
    task_sched = get_task_scheduler()
    return ApiResponse(
        code=0, message="Success", data=task_sched.get_schedule_stats()
    ).model_dump()


@app.post(prefix + "/task/{task_id}/priority")
async def task_adjust_priority(task_id: str, request: Request):
    body = await request.json()
    new_priority = body.get("priority", 5)
    reason_str = body.get("reason", "manual_escalation")
    operator = body.get("operator", "admin")
    note = body.get("note", "")
    try:
        reason = PriorityAdjustReason(reason_str)
    except ValueError:
        reason = PriorityAdjustReason.MANUAL_ESCALATION
    task_sched = get_task_scheduler()
    if task_sched.adjust_priority(task_id, new_priority, reason, operator, note):
        return ApiResponse(code=0, message="Priority adjusted").model_dump()
    return ApiResponse(code=1, message="Cannot adjust priority").model_dump()


@app.get(prefix + "/task/{task_id}/priority-history")
async def task_priority_history(task_id: str):
    task_sched = get_task_scheduler()
    history = task_sched.get_priority_history(task_id)
    return ApiResponse(code=0, message="Success", data=history).model_dump()


@app.get(prefix + "/failure/{failure_id}")
async def failure_get(failure_id: str):
    tracer = get_failure_tracer()
    record = tracer.get_failure(failure_id)
    if record is None:
        return JSONResponse(
            status_code=404,
            content=ApiResponse(code=404, message="Failure not found").model_dump(),
        )
    return ApiResponse(code=0, message="Success", data=record.model_dump()).model_dump()


@app.get(prefix + "/failure/task/{task_id}")
async def failure_list_by_task(task_id: str):
    tracer = get_failure_tracer()
    records = tracer.get_failures_for_task(task_id)
    return ApiResponse(
        code=0, message="Success",
        data=[r.model_dump() for r in records],
    ).model_dump()


@app.get(prefix + "/failure/category/{category}")
async def failure_list_by_category(category: str):
    try:
        cat = FailureCategory(category)
    except ValueError:
        return JSONResponse(
            status_code=400,
            content=ApiResponse(code=400, message="Invalid category").model_dump(),
        )
    tracer = get_failure_tracer()
    records = tracer.get_failures_by_category(cat)
    return ApiResponse(
        code=0, message="Success",
        data=[r.model_dump() for r in records],
    ).model_dump()


@app.get(prefix + "/failure/satellite/{satellite_id}")
async def failure_list_by_satellite(satellite_id: str):
    tracer = get_failure_tracer()
    records = tracer.get_failures_by_satellite(satellite_id)
    return ApiResponse(
        code=0, message="Success",
        data=[r.model_dump() for r in records],
    ).model_dump()


@app.get(prefix + "/failure/chain/{failure_id}")
async def failure_chain(failure_id: str):
    tracer = get_failure_tracer()
    chain = tracer.get_failure_chain(failure_id)
    return ApiResponse(
        code=0, message="Success",
        data=[r.model_dump() for r in chain],
    ).model_dump()


@app.get(prefix + "/failure/unresolved")
async def failure_unresolved():
    tracer = get_failure_tracer()
    records = tracer.get_unresolved_failures()
    return ApiResponse(
        code=0, message="Success",
        data=[r.model_dump() for r in records],
    ).model_dump()


@app.post(prefix + "/failure/{failure_id}/resolve")
async def failure_resolve(failure_id: str, request: Request):
    body = await request.json()
    note = body.get("note", "")
    tracer = get_failure_tracer()
    if tracer.resolve_failure(failure_id, note):
        return ApiResponse(code=0, message="Failure resolved").model_dump()
    return JSONResponse(
        status_code=404,
        content=ApiResponse(code=404, message="Failure not found").model_dump(),
    )


@app.get(prefix + "/failure/stats")
async def failure_stats():
    tracer = get_failure_tracer()
    return ApiResponse(
        code=0, message="Success", data=tracer.get_failure_stats()
    ).model_dump()


# ==================== 任务状态回调接口 ====================


@app.post(f"{prefix}/callback/register")
async def callback_register(request: Request):
    body = await request.json()
    event_type = CallbackEventType(body.get("event_type", ""))
    url = body.get("url", "")
    description = body.get("description", "")
    filter_conditions = body.get("filter_conditions")
    callback_mgr = get_callback_manager()
    reg_id = callback_mgr.register_callback(
        event_type, url, description, filter_conditions
    )
    return ApiResponse(
        code=0, message="Callback registered", data={"registration_id": reg_id}
    ).model_dump()


@app.delete(prefix + "/callback/{registration_id}")
async def callback_unregister(registration_id: str):
    callback_mgr = get_callback_manager()
    if callback_mgr.unregister_callback(registration_id):
        return ApiResponse(code=0, message="Callback unregistered").model_dump()
    return JSONResponse(
        status_code=404,
        content=ApiResponse(code=404, message="Registration not found").model_dump(),
    )


@app.post(f"{prefix}/callback/trigger")
async def callback_trigger(request: Request):
    body = await request.json()
    event_type = CallbackEventType(body.get("event_type", ""))
    payload = body.get("payload", {})
    source = body.get("source_service", "unknown")
    callback_mgr = get_callback_manager()
    event_id = callback_mgr.trigger_event(event_type, payload, source)
    return ApiResponse(
        code=0, message="Event triggered", data={"event_id": event_id}
    ).model_dump()


@app.get(f"{prefix}/callback/registrations")
async def callback_list_registrations(
    event_type: Optional[CallbackEventType] = None,
):
    callback_mgr = get_callback_manager()
    return ApiResponse(
        code=0,
        message="Success",
        data=callback_mgr.list_registrations(event_type),
    ).model_dump()


@app.get(f"{prefix}/callback/log")
async def callback_delivery_log(
    event_type: Optional[CallbackEventType] = None,
    limit: int = Query(default=50, ge=1, le=500),
):
    callback_mgr = get_callback_manager()
    logs = callback_mgr.get_delivery_log(event_type, limit)
    return ApiResponse(code=0, message="Success", data=logs).model_dump()


@app.get(f"{prefix}/callback/dlq")
async def callback_dlq(limit: int = Query(default=50, ge=1, le=500)):
    callback_mgr = get_callback_manager()
    return ApiResponse(
        code=0,
        message="Success",
        data=callback_mgr.get_dead_letter_queue(limit),
    ).model_dump()


@app.post(prefix + "/callback/dlq/{event_id}/replay")
async def callback_replay_dlq(event_id: str):
    callback_mgr = get_callback_manager()
    if callback_mgr.replay_dead_letter(event_id):
        return ApiResponse(code=0, message="Replayed successfully").model_dump()
    return JSONResponse(
        status_code=404,
        content=ApiResponse(code=404, message="Event not found in DLQ").model_dump(),
    )


@app.get(f"{prefix}/callback/stats")
async def callback_stats():
    callback_mgr = get_callback_manager()
    return ApiResponse(
        code=0, message="Success", data=callback_mgr.get_callback_stats()
    ).model_dump()


# ==================== 服务间调用测试接口 ====================


@app.get(f"{prefix}/cluster/status")
async def cluster_status():
    client = get_service_client()
    return ApiResponse(
        code=0,
        message="Success",
        data=client.get_cluster_status(),
    ).model_dump()


@app.get(f"{prefix}/cache/stats")
async def cache_stats():
    cache = get_cache()
    return ApiResponse(
        code=0, message="Success", data=cache.stats()
    ).model_dump()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=config.server.host,
        port=config.server.port,
        workers=config.server.workers,
        log_level="info",
    )