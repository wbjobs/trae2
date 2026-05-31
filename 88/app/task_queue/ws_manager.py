import asyncio
import json
from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger


class ConnectionManager:
    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, task_id: str):
        await websocket.accept()
        async with self._lock:
            if task_id not in self._connections:
                self._connections[task_id] = set()
            self._connections[task_id].add(websocket)
        logger.debug(f"WebSocket connected for task: {task_id}")

    async def disconnect(self, websocket: WebSocket, task_id: str):
        async with self._lock:
            if task_id in self._connections:
                self._connections[task_id].discard(websocket)
                if not self._connections[task_id]:
                    del self._connections[task_id]
        logger.debug(f"WebSocket disconnected for task: {task_id}")

    async def broadcast_to_task(self, task_id: str, message: dict):
        async with self._lock:
            connections = list(self._connections.get(task_id, set()))

        if not connections:
            return

        data = json.dumps(message, ensure_ascii=False)
        disconnected = []
        for ws in connections:
            try:
                await ws.send_text(data)
            except Exception:
                disconnected.append(ws)

        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    if task_id in self._connections:
                        self._connections[task_id].discard(ws)

    async def broadcast_progress(
        self,
        task_id: str,
        status: str,
        progress: int,
        completed_count: int = 0,
        failed_count: int = 0,
        total_count: int = 0,
        current_document: str | None = None,
    ):
        message = {
            "type": "progress",
            "task_id": task_id,
            "status": status,
            "progress": progress,
            "completed_count": completed_count,
            "failed_count": failed_count,
            "total_count": total_count,
            "current_document": current_document,
        }
        await self.broadcast_to_task(task_id, message)

    async def broadcast_document_result(
        self,
        task_id: str,
        document_id: str,
        document_name: str,
        status: str,
        error: str | None = None,
    ):
        message = {
            "type": "document_result",
            "task_id": task_id,
            "document_id": document_id,
            "document_name": document_name,
            "status": status,
            "error": error,
        }
        await self.broadcast_to_task(task_id, message)

    async def broadcast_task_complete(
        self,
        task_id: str,
        status: str,
        completed_count: int,
        failed_count: int,
        total_count: int,
    ):
        message = {
            "type": "task_complete",
            "task_id": task_id,
            "status": status,
            "completed_count": completed_count,
            "failed_count": failed_count,
            "total_count": total_count,
        }
        await self.broadcast_to_task(task_id, message)

    def get_active_connections_count(self, task_id: str) -> int:
        return len(self._connections.get(task_id, set()))


ws_manager = ConnectionManager()
