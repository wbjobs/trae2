import threading
import time
import logging
from typing import Dict, List, Optional
from datetime import datetime
from .node_monitor import NodeMonitor

logger = logging.getLogger(__name__)


class ClusterMonitor:

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, metrics_interval: int = 30):
        if self._initialized:
            return
        self._initialized = True
        self.metrics_interval = metrics_interval
        self._nodes: Dict[str, NodeMonitor] = {}
        self._running = False
        self._collection_thread: Optional[threading.Thread] = None

    def register_node(self, node_id: str, heartbeat_interval: int = 10) -> NodeMonitor:
        if node_id in self._nodes:
            return self._nodes[node_id]
        monitor = NodeMonitor(node_id=node_id, heartbeat_interval=heartbeat_interval)
        self._nodes[node_id] = monitor
        logger.info(f"Registered node: {node_id}")
        return monitor

    def unregister_node(self, node_id: str):
        if node_id in self._nodes:
            self._nodes[node_id].stop_heartbeat()
            del self._nodes[node_id]
            logger.info(f"Unregistered node: {node_id}")

    def get_cluster_status(self) -> Dict:
        nodes_status = {}
        healthy_count = 0
        for node_id, monitor in self._nodes.items():
            health = monitor.get_health_report()
            nodes_status[node_id] = health
            if health["healthy"]:
                healthy_count += 1

        return {
            "total_nodes": len(self._nodes),
            "healthy_nodes": healthy_count,
            "unhealthy_nodes": len(self._nodes) - healthy_count,
            "nodes": nodes_status,
            "timestamp": datetime.utcnow().isoformat(),
        }

    def get_all_task_history(self, limit: int = 100) -> List[Dict]:
        all_tasks = []
        for node_id, monitor in self._nodes.items():
            for task in monitor.get_task_history(limit=limit):
                task["node_id"] = node_id
                all_tasks.append(task)
        all_tasks.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return all_tasks[:limit]

    def start_collection(self):
        if self._running:
            return
        self._running = True
        self._collection_thread = threading.Thread(target=self._collection_loop, daemon=True)
        self._collection_thread.start()
        logger.info("Cluster metrics collection started")

    def stop_collection(self):
        self._running = False
        for monitor in self._nodes.values():
            monitor.stop_heartbeat()
        if self._collection_thread:
            self._collection_thread.join(timeout=5)
        logger.info("Cluster metrics collection stopped")

    def _collection_loop(self):
        while self._running:
            try:
                for node_id, monitor in self._nodes.items():
                    monitor.collect_metrics()
            except Exception as e:
                logger.error(f"Cluster collection error: {e}")
            time.sleep(self.metrics_interval)
