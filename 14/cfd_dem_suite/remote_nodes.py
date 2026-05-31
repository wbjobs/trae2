import time
import subprocess
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class NodeStatus(Enum):
    OFFLINE = "offline"
    ONLINE = "online"
    BUSY = "busy"
    ERROR = "error"
    MAINTENANCE = "maintenance"


@dataclass
class RemoteNode:
    node_id: str
    host: str
    port: int = 22
    username: str = ""
    status: NodeStatus = NodeStatus.OFFLINE
    max_tasks: int = 1
    current_tasks: int = 0
    tags: List[str] = field(default_factory=list)
    cpu_count: int = 0
    total_memory_gb: float = 0.0
    available_memory_gb: float = 0.0
    gpu_count: int = 0
    last_heartbeat: float = 0.0
    priority: int = 0
    metadata: Dict = field(default_factory=dict)


@dataclass
class TaskAssignment:
    task_id: str
    node_id: str
    assigned_at: float
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    status: str = "assigned"


class RemoteNodeManager:
    def __init__(self, ping_timeout: float = 5.0):
        self.nodes: Dict[str, RemoteNode] = {}
        self.assignments: Dict[str, TaskAssignment] = {}
        self.ping_timeout = ping_timeout
        self._lock = threading.Lock()
    
    def add_node(
        self,
        node_id: str,
        host: str,
        port: int = 22,
        username: str = "",
        max_tasks: int = 1,
        tags: Optional[List[str]] = None,
        priority: int = 0
    ) -> None:
        with self._lock:
            self.nodes[node_id] = RemoteNode(
                node_id=node_id,
                host=host,
                port=port,
                username=username,
                max_tasks=max_tasks,
                tags=tags or [],
                priority=priority
            )
            logger.info(f"Added node: {node_id}@{host}")
    
    def remove_node(self, node_id: str) -> bool:
        with self._lock:
            if node_id in self.nodes:
                del self.nodes[node_id]
                logger.info(f"Removed node: {node_id}")
                return True
        return False
    
    def get_node(self, node_id: str) -> Optional[RemoteNode]:
        with self._lock:
            return self.nodes.get(node_id)
    
    def get_all_nodes(self) -> List[RemoteNode]:
        with self._lock:
            return list(self.nodes.values())
    
    def ping_node(self, node_id: str) -> bool:
        node = self.get_node(node_id)
        if not node:
            return False
        
        try:
            import platform
            if platform.system() == "Windows":
                cmd = ["ping", "-n", "1", "-w", str(int(self.ping_timeout * 1000)), node.host]
            else:
                cmd = ["ping", "-c", "1", "-W", str(int(self.ping_timeout)), node.host]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=self.ping_timeout + 1
            )
            
            with self._lock:
                if result.returncode == 0:
                    node.status = NodeStatus.ONLINE
                    node.last_heartbeat = time.time()
                else:
                    node.status = NodeStatus.OFFLINE
            
            return result.returncode == 0
            
        except subprocess.TimeoutExpired:
            with self._lock:
                node.status = NodeStatus.OFFLINE
            return False
        except Exception as e:
            logger.debug(f"Ping failed for {node_id}: {e}")
            with self._lock:
                node.status = NodeStatus.OFFLINE
            return False
    
    def ping_all_nodes(self) -> Dict[str, bool]:
        results = {}
        for node_id in list(self.nodes.keys()):
            results[node_id] = self.ping_node(node_id)
        return results
    
    def get_available_nodes(self, required_tags: Optional[List[str]] = None) -> List[RemoteNode]:
        with self._lock:
            available = []
            for node in self.nodes.values():
                if node.status != NodeStatus.ONLINE:
                    continue
                if node.current_tasks >= node.max_tasks:
                    continue
                if required_tags and not any(tag in node.tags for tag in required_tags):
                    continue
                available.append(node)
        return available
    
    def select_best_node(
        self,
        required_tags: Optional[List[str]] = None,
        require_gpu: bool = False
    ) -> Optional[RemoteNode]:
        available = self.get_available_nodes(required_tags)
        
        if not available:
            return None
        
        if require_gpu:
            available = [n for n in available if n.gpu_count > 0]
            if not available:
                return None
        
        available.sort(key=lambda n: (
            -n.priority,
            n.current_tasks / n.max_tasks,
            -n.cpu_count
        ))
        
        return available[0] if available else None
    
    def assign_task(self, task_id: str, node_id: str) -> bool:
        with self._lock:
            node = self.nodes.get(node_id)
            if not node or node.status != NodeStatus.ONLINE:
                return False
            if node.current_tasks >= node.max_tasks:
                return False
            
            node.current_tasks += 1
            if node.current_tasks >= node.max_tasks:
                node.status = NodeStatus.BUSY
            
            self.assignments[task_id] = TaskAssignment(
                task_id=task_id,
                node_id=node_id,
                assigned_at=time.time()
            )
            
            logger.info(f"Assigned task {task_id} to node {node_id}")
            return True
    
    def complete_task(self, task_id: str) -> bool:
        with self._lock:
            assignment = self.assignments.get(task_id)
            if not assignment:
                return False
            
            assignment.status = "completed"
            assignment.completed_at = time.time()
            
            node = self.nodes.get(assignment.node_id)
            if node:
                node.current_tasks = max(0, node.current_tasks - 1)
                if node.status == NodeStatus.BUSY and node.current_tasks < node.max_tasks:
                    node.status = NodeStatus.ONLINE
            
            logger.info(f"Completed task {task_id} on node {assignment.node_id}")
            return True
    
    def fail_task(self, task_id: str, error: str = "") -> bool:
        with self._lock:
            assignment = self.assignments.get(task_id)
            if not assignment:
                return False
            
            assignment.status = "failed"
            assignment.completed_at = time.time()
            
            node = self.nodes.get(assignment.node_id)
            if node:
                node.current_tasks = max(0, node.current_tasks - 1)
                if node.status == NodeStatus.BUSY and node.current_tasks < node.max_tasks:
                    node.status = NodeStatus.ONLINE
            
            logger.warning(f"Failed task {task_id} on node {assignment.node_id}: {error}")
            return True
    
    def update_node_resources(
        self,
        node_id: str,
        cpu_count: int,
        total_memory_gb: float,
        available_memory_gb: float,
        gpu_count: int = 0
    ) -> None:
        with self._lock:
            node = self.nodes.get(node_id)
            if node:
                node.cpu_count = cpu_count
                node.total_memory_gb = total_memory_gb
                node.available_memory_gb = available_memory_gb
                node.gpu_count = gpu_count
                node.last_heartbeat = time.time()
    
    def get_load_stats(self) -> Dict:
        with self._lock:
            total_nodes = len(self.nodes)
            online_nodes = sum(1 for n in self.nodes.values() if n.status == NodeStatus.ONLINE)
            busy_nodes = sum(1 for n in self.nodes.values() if n.status == NodeStatus.BUSY)
            total_tasks = sum(n.current_tasks for n in self.nodes.values())
            max_capacity = sum(n.max_tasks for n in self.nodes.values())
        
        return {
            'total_nodes': total_nodes,
            'online_nodes': online_nodes,
            'busy_nodes': busy_nodes,
            'current_tasks': total_tasks,
            'max_capacity': max_capacity,
            'utilization': total_tasks / max_capacity if max_capacity > 0 else 0.0
        }
    
    def print_status(self) -> None:
        print("=" * 80)
        print("Remote Node Status")
        print("=" * 80)
        print(f"{'Node ID':<20} {'Host':<20} {'Status':<10} {'Tasks':<10} {'CPU':<8} {'GPU':<8}")
        print("-" * 80)
        
        for node in sorted(self.nodes.values(), key=lambda n: n.node_id):
            print(
                f"{node.node_id:<20} "
                f"{node.host:<20} "
                f"{node.status.value:<10} "
                f"{node.current_tasks}/{node.max_tasks:<10} "
                f"{node.cpu_count:<8} "
                f"{node.gpu_count:<8}"
            )
        
        stats = self.get_load_stats()
        print("-" * 80)
        print(f"Utilization: {stats['utilization']*100:.1f}% "
              f"({stats['current_tasks']}/{stats['max_capacity']} tasks)")
        print("=" * 80)


class NodeHealthMonitor:
    def __init__(self, node_manager: RemoteNodeManager, check_interval: float = 30.0):
        self.node_manager = node_manager
        self.check_interval = check_interval
        self._stop_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None
    
    def start(self) -> None:
        if self._monitor_thread and self._monitor_thread.is_alive():
            return
        
        self._stop_event.clear()
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()
        logger.info("Node health monitor started")
    
    def stop(self) -> None:
        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=5.0)
        logger.info("Node health monitor stopped")
    
    def _monitor_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self.node_manager.ping_all_nodes()
                self._check_stale_nodes()
            except Exception as e:
                logger.error(f"Error in node health monitor: {e}")
            
            self._stop_event.wait(self.check_interval)
    
    def _check_stale_nodes(self) -> None:
        now = time.time()
        for node in self.node_manager.get_all_nodes():
            if node.last_heartbeat > 0:
                time_since_heartbeat = now - node.last_heartbeat
                if time_since_heartbeat > self.check_interval * 3:
                    logger.warning(f"Node {node.node_id} has stale heartbeat")
