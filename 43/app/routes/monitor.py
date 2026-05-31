import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.schemas import ClusterStatus
from app.config import settings
from app.monitoring.offline_detector import OfflineDetector
from app.monitoring.strategy_manager import StrategyManager, StrategyType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/monitor", tags=["集群监控"])

offline_detector: Optional[OfflineDetector] = None
strategy_manager: Optional[StrategyManager] = None


def set_offline_detector(detector: OfflineDetector):
    global offline_detector
    offline_detector = detector


def set_strategy_manager(manager: StrategyManager):
    global strategy_manager
    strategy_manager = manager


@router.get("/health", summary="健康检查")
async def health_check():
    return {
        "status": "healthy",
        "node_id": settings.NODE_ID,
        "cluster": settings.CLUSTER_NAME,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }


@router.get("/cluster/status", summary="集群状态")
async def cluster_status():
    nodes = await _discover_nodes()
    return ClusterStatus(
        cluster_name=settings.CLUSTER_NAME,
        node_count=len(nodes),
        online_nodes=sum(1 for n in nodes if n.status.value == "online"),
        total_connections=sum(n.connections for n in nodes),
        total_throughput=sum(n.load for n in nodes),
        nodes=nodes,
    )


@router.get("/cluster/nodes", summary="节点列表")
async def list_nodes():
    nodes = await _discover_nodes()
    return {
        "success": True,
        "cluster": settings.CLUSTER_NAME,
        "nodes": [n.to_dict() for n in nodes],
    }


@router.get("/metrics", summary="性能指标")
async def get_metrics():
    import psutil

    try:
        cpu_percent = psutil.cpu_percent(interval=0.5)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        net = psutil.net_io_counters()

        return {
            "success": True,
            "node_id": settings.NODE_ID,
            "cpu": {
                "percent": cpu_percent,
                "count": psutil.cpu_count(),
            },
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "percent": memory.percent,
                "used": memory.used,
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": disk.percent,
            },
            "network": {
                "bytes_sent": net.bytes_sent,
                "bytes_recv": net.bytes_recv,
                "packets_sent": net.packets_sent,
                "packets_recv": net.packets_recv,
            },
        }
    except Exception as e:
        logger.error("Failed to get metrics: %s", e)
        return {"success": False, "error": str(e)}


async def _discover_nodes():
    from app.models.schemas import NodeInfo
    from app.constants import NodeStatus

    nodes = []
    try:
        import redis.asyncio as aioredis

        redis_kwargs = {
            "max_connections": 10,
            "decode_responses": True,
        }
        if settings.REDIS_PASSWORD:
            redis_kwargs["password"] = settings.REDIS_PASSWORD

        redis_client = aioredis.from_url(settings.REDIS_URL, **redis_kwargs)
        node_keys = await redis_client.keys("cp:cluster:nodes:*")

        for key in node_keys:
            data = await redis_client.get(key)
            if data:
                import json

                node_data = json.loads(data)
                node = NodeInfo(
                    node_id=node_data.get("node_id", "unknown"),
                    host=settings.HOST,
                    port=settings.PORT,
                    status=NodeStatus.ONLINE,
                    load=0.0,
                    connections=0,
                    last_heartbeat=datetime.fromisoformat(
                        node_data.get("last_heartbeat", datetime.now(timezone.utc).isoformat())
                    ),
                )
                nodes.append(node)

        await redis_client.close()
    except Exception as e:
        logger.warning("Node discovery failed: %s", e)

    return nodes


@router.get("/offline/status", summary="离线监测状态")
async def get_offline_status():
    if not offline_detector:
        raise HTTPException(status_code=503, detail="Offline detector not initialized")
    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": offline_detector.get_statistics(),
    }


@router.get("/offline/points", summary="监测点离线详情")
async def get_offline_points(
    status: Optional[str] = Query(None, description="过滤状态: online/offline"),
    limit: int = Query(100, ge=1, le=1000),
):
    if not offline_detector:
        raise HTTPException(status_code=503, detail="Offline detector not initialized")

    all_points = offline_detector.get_all_status()

    if status == "online":
        filtered = [p for p in all_points if p["is_online"]]
    elif status == "offline":
        filtered = [p for p in all_points if not p["is_online"]]
    else:
        filtered = all_points

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total": len(filtered),
        "limit": limit,
        "points": filtered[:limit],
    }


@router.get("/offline/point/{device_id}", summary="单个监测点状态")
async def get_point_status(
    device_id: str,
    pipeline_id: str = Query(..., description="管道ID"),
):
    if not offline_detector:
        raise HTTPException(status_code=503, detail="Offline detector not initialized")

    point = offline_detector.get_monitor_point_status(device_id, pipeline_id)
    if not point:
        raise HTTPException(status_code=404, detail="Monitor point not found")

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": point,
    }


@router.get("/strategies", summary="告警策略列表")
async def list_strategies():
    if not strategy_manager:
        raise HTTPException(status_code=503, detail="Strategy manager not initialized")

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "strategies": strategy_manager.list_strategies(),
    }


@router.get("/strategies/schedules", summary="策略定时任务列表")
async def list_strategy_schedules():
    if not strategy_manager:
        raise HTTPException(status_code=503, detail="Strategy manager not initialized")

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "schedules": strategy_manager.list_schedules(),
    }


@router.post("/strategies/switch", summary="手动切换告警策略")
async def switch_strategy(
    strategy_type: str = Query(..., description="策略类型: standard/strict/relaxed/night/peak/maintenance"),
    pipeline_id: Optional[str] = Query(None, description="管道ID（留空则应用于所有管道）"),
    reason: str = Query("", description="切换原因"),
):
    if not strategy_manager:
        raise HTTPException(status_code=503, detail="Strategy manager not initialized")

    try:
        stype = StrategyType(strategy_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid strategy type: {strategy_type}")

    success = await strategy_manager.switch_strategy(stype, pipeline_id, reason)

    return {
        "success": success,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "strategy": strategy_type,
        "pipeline_id": pipeline_id,
        "reason": reason,
    }


@router.get("/strategies/active", summary="当前激活策略")
async def get_active_strategy(
    pipeline_id: str = Query(..., description="管道ID"),
):
    if not strategy_manager:
        raise HTTPException(status_code=503, detail="Strategy manager not initialized")

    active = strategy_manager.get_active_strategy(pipeline_id)

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pipeline_id": pipeline_id,
        "active_strategy": active.value if hasattr(active, "value") else str(active),
    }


@router.post("/strategies/schedules", summary="创建策略定时任务")
async def create_strategy_schedule(
    name: str = Query(..., description="任务名称"),
    strategy_type: str = Query(..., description="策略类型"),
    cron: str = Query(..., description="Cron表达式"),
    all_pipelines: bool = Query(True, description="是否应用于所有管道"),
    timezone: str = Query("Asia/Shanghai", description="时区"),
):
    if not strategy_manager:
        raise HTTPException(status_code=503, detail="Strategy manager not initialized")

    try:
        stype = StrategyType(strategy_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid strategy type: {strategy_type}")

    schedule_id = strategy_manager.add_schedule(
        name=name,
        strategy_type=stype,
        cron=cron,
        all_pipelines=all_pipelines,
        timezone=timezone,
    )

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "schedule_id": schedule_id,
        "name": name,
    }


@router.delete("/strategies/schedules/{schedule_id}", summary="删除策略定时任务")
async def delete_strategy_schedule(schedule_id: str):
    if not strategy_manager:
        raise HTTPException(status_code=503, detail="Strategy manager not initialized")

    success = strategy_manager.remove_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Schedule not found")

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "schedule_id": schedule_id,
    }


@router.get("/strategies/stats", summary="策略管理统计")
async def get_strategy_stats():
    if not strategy_manager:
        raise HTTPException(status_code=503, detail="Strategy manager not initialized")

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": strategy_manager.get_statistics(),
    }