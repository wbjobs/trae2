import hashlib
import logging
from typing import List, Optional, Dict, Any

from app.config import settings
from app.models.schemas import NodeInfo

logger = logging.getLogger(__name__)


class LoadBalancer:
    """
    集群负载均衡调度模块
    支持轮询、权重、一致性哈希、最少连接数等多种负载均衡策略，
    根据监测点 ID 进行请求分发，实现数千个监测点的均匀负载。
    """

    STRATEGY_ROUND_ROBIN = "round_robin"
    STRATEGY_WEIGHTED = "weighted"
    STRATEGY_CONSISTENT_HASH = "consistent_hash"
    STRATEGY_LEAST_CONNECTIONS = "least_connections"

    def __init__(self):
        self._nodes: List[NodeInfo] = []
        self._rr_counter: int = 0
        self._weights: Dict[str, float] = {}
        self._hash_ring: List[str] = []
        self._virtual_nodes = 150

    def register_node(self, node: NodeInfo, weight: float = 1.0):
        existing_ids = {n.node_id for n in self._nodes}
        if node.node_id not in existing_ids:
            self._nodes.append(node)
            self._weights[node.node_id] = weight
            self._rebuild_hash_ring()
            logger.info(
                "Registered node %s (weight=%.2f) - total: %d",
                node.node_id,
                weight,
                len(self._nodes),
            )

    def unregister_node(self, node_id: str):
        self._nodes = [n for n in self._nodes if n.node_id != node_id]
        if node_id in self._weights:
            del self._weights[node_id]
        self._rebuild_hash_ring()
        logger.info("Unregistered node %s - total: %d", node_id, len(self._nodes))

    def update_node(self, node: NodeInfo):
        for i, n in enumerate(self._nodes):
            if n.node_id == node.node_id:
                self._nodes[i] = node
                break

    def select_node(
        self,
        key: Optional[str] = None,
        strategy: Optional[str] = None,
    ) -> Optional[NodeInfo]:
        if not self._nodes:
            return None

        active_strategy = strategy or settings.LOAD_BALANCE_STRATEGY

        if active_strategy == self.STRATEGY_ROUND_ROBIN:
            return self._round_robin()
        elif active_strategy == self.STRATEGY_WEIGHTED:
            return self._weighted()
        elif active_strategy == self.STRATEGY_CONSISTENT_HASH:
            return self._consistent_hash(key)
        elif active_strategy == self.STRATEGY_LEAST_CONNECTIONS:
            return self._least_connections()
        else:
            return self._round_robin()

    def select_nodes(
        self,
        count: int,
        key: Optional[str] = None,
        strategy: Optional[str] = None,
    ) -> List[NodeInfo]:
        selected: List[NodeInfo] = []
        used_ids: set = set()

        for _ in range(min(count, len(self._nodes))):
            node = self.select_node(key=key, strategy=strategy)
            if node and node.node_id not in used_ids:
                selected.append(node)
                used_ids.add(node.node_id)
                key = None

        return selected

    def _round_robin(self) -> Optional[NodeInfo]:
        if not self._nodes:
            return None
        node = self._nodes[self._rr_counter % len(self._nodes)]
        self._rr_counter = (self._rr_counter + 1) % len(self._nodes)
        return node

    def _weighted(self) -> Optional[NodeInfo]:
        import random

        if not self._nodes:
            return None

        total_weight = sum(
            self._weights.get(n.node_id, 1.0) for n in self._nodes
        )
        if total_weight == 0:
            return self._round_robin()

        r = random.uniform(0, total_weight)
        cumulative = 0.0
        for node in self._nodes:
            cumulative += self._weights.get(node.node_id, 1.0)
            if r <= cumulative:
                return node

        return self._nodes[-1]

    def _consistent_hash(self, key: Optional[str]) -> Optional[NodeInfo]:
        if not self._nodes or not key:
            return self._round_robin()

        hash_val = self._hash(key)
        if not self._hash_ring:
            return self._round_robin()

        for node_hash in self._hash_ring:
            if hash_val <= node_hash:
                node_id = node_hash.rsplit(":", 1)[0]
                for node in self._nodes:
                    if node.node_id == node_id:
                        return node

        return self._nodes[0]

    def _least_connections(self) -> Optional[NodeInfo]:
        if not self._nodes:
            return None
        return min(self._nodes, key=lambda n: n.connections)

    def _rebuild_hash_ring(self):
        self._hash_ring = []
        for node in self._nodes:
            for i in range(self._virtual_nodes):
                vnode_key = f"{node.node_id}:vnode:{i}"
                hash_val = self._hash(vnode_key)
                self._hash_ring.append(hash_val)
        self._hash_ring.sort()

    def _hash(self, key: str) -> str:
        return hashlib.md5(key.encode("utf-8")).hexdigest()

    def get_status(self) -> Dict[str, Any]:
        return {
            "strategy": settings.LOAD_BALANCE_STRATEGY,
            "node_count": len(self._nodes),
            "nodes": [
                {
                    "node_id": n.node_id,
                    "host": n.host,
                    "port": n.port,
                    "status": n.status.value,
                    "load": n.load,
                    "connections": n.connections,
                    "weight": self._weights.get(n.node_id, 1.0),
                }
                for n in self._nodes
            ],
            "rr_counter": self._rr_counter,
        }