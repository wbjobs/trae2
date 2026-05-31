from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from loguru import logger
from app.task_queue.ws_manager import ws_manager
from app.auth.jwt_handler import decode_token

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/tasks/{task_id}/progress")
async def task_progress_websocket(
    websocket: WebSocket,
    task_id: str,
    token: str = Query(default=""),
):
    if token:
        try:
            payload = decode_token(token)
            if not payload:
                await websocket.close(code=4001, reason="Invalid token")
                return
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return

    await ws_manager.connect(websocket, task_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            elif data == "status":
                count = ws_manager.get_active_connections_count(task_id)
                await websocket.send_text(f'{{"type":"status","connections":{count}}}')
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, task_id)
    except Exception as e:
        logger.error(f"WebSocket error for task {task_id}: {e}")
        await ws_manager.disconnect(websocket, task_id)
