import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

from app.config import settings
from app.constants import NodeStatus
from app.models.schemas import NodeInfo

logger = logging.getLogger(__name__)


class NodeManager:
    """
    集群节点管理模块
    负责节点注册、心跳检测、状态维护、故障转移等功能，
    确保集群高可用，支持数千个监测点同时接入时的横向扩展。
    """

    def __init__(self):
        self._redis_client = None
        self._node_id = settings.NODE_ID
        self._node_key = f"cp:cluster:nodes:{self._node_id}"
        self._node_prefix = "cp:cluster:nodes:"

    async def initialize(self):
        try:
            import redis.asyncio as aioredis

            redis_kwargs = {
                "max_connections": 10,
                "decode_responses": True,
            }
            if settings.REDIS_PASSWORD:
                redis_kwargs["password"] = settings.REDIS_PASSWORD

            self._redis_client = aioredis.from_url(
                settings.REDIS_URL, **redis_kwargs
            )
            await self._redis_client.ping()
            logger.info("Node manager initialized for node %s", self._node_id)
        except Exception as e:
            logger.error("Failed to initialize node manager: %s", e)
            raise

    async def register_node(
        self,
        host: str,
        port: int,
        weight: float = 1.0,
    ) -> NodeInfo:
        node = NodeInfo(
            node_id=self._node_id,
            host=host,
            port=port,
            status=NodeStatus.ONLINE,
            load=0.0,
            connections=0,
            last_heartbeat=datetime.now(timezone.utc),
        )

        node_data = {
            "node_id": node.node_id,
            "host": node.host,
            "port": node.port,
            "status": node.status.value,
            "load": node.load,
            "connections": node.connections,
            "weight": weight,
            "last_heartbeat": node.last_heartbeat.isoformat(),
            "version": node.version,
        }

        if self._redis_client:
            await self._redis_client.setex(
                self._node_key,
                settings.SCHEDULER_HEARTBEAT_INTERVAL * 3,
                json.dumps(node_data, ensure_ascii=False),
            )

        logger.info(
            "Node registered: %s at %s:%d (weight=%.2f)",
            node.node_id,
            host,
            port,
            weight,
        )
        return node

    async def heartbeat(self):
        if not self._redis_client:
            return

        try:
            node_data_str = await self._redis_client.get(self._node_key)
            if node_data_str:
                node_data = json.loads(node_data_str)
                node_data["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
                node_data["status"] = NodeStatus.ONLINE.value
                await self._redis_client.setex(
                    self._node_key,
                    settings.SCHEDULER_HEARTBEAT_INTERVAL * 3,
                    json.dumps(node_data, ensure_ascii=False),
                )
        except Exception as e:
            logger.error("Heartbeat update failed: %s", e)

    async def update_metrics(self, load: float, connections: int):
        if not self._redis_client:
            return

        try:
            node_data_str = await self._redis_client.get(self._node_key)
            if node_data_str:
                node_data = json.loads(node_data_str)
                node_data["load"] = load
                node_data["connections"] = connections
                node_data["last_heartbeat"] = datetime.now(timezone.utc).isoformat()
                await self._redis_client.setex(
                    self._node_key,
                    settings.SCHEDULER_HEARTBEAT_INTERVAL * 3,
                    json.dumps(node_data, ensure_ascii=False),
                )
        except Exception as e:
            logger.error("Metrics update failed: %s", e)

    async def get_all_nodes(self) -> List[NodeInfo]:
        nodes: List[NodeInfo] = []
        if not self._redis_client:
            return nodes

        try:
            keys = await self._redis_client.keys(f"{self._node_prefix}*")
            for key in keys:
                data = await self._redis_client.get(key)
                if data:
                    node_data = json.loads(data)
                    node = NodeInfo(
                        node_id=node_data.get("node_id", "unknown"),
                        host=node_data.get("host", "0.0.0.0"),
                        port=node_data.get("port", 8000),
                        status=NodeStatus(node_data.get("status", "offline")),
                        load=node_data.get("load", 0.0),
                        connections=node_data.get("connections", 0),
                        last_heartbeat=datetime.fromisoformat(
                            node_data.get(
                                "last_heartbeat",
                                datetime.now(timezone.utc).isoformat(),
                            )
                        ),
                        version=node_data.get("version", "1.0.0"),
                    )
                    nodes.append(node)
        except Exception as e:
            logger.error("Failed to get nodes: %s", e)

        return nodes

    async def get_online_nodes(self) -> List[NodeInfo]:
        all_nodes = await self.get_all_nodes()
        return [n for n in all_nodes if n.status == NodeStatus.ONLINE]

    async def deregister_node(self):
        if self._redis_client:
            try:
                await self._redis_client.delete(self._node_key)
                logger.info("Node %s deregistered", self._node_id)
            except Exception as e:
                logger.error("Failed to deregister node: %s", e)

    async def close(self):
        if self._redis_client:
            await self.deregister_node()
            await self._redis_client.close()
            logger.info("Node manager closed for node %s", self._node_id)