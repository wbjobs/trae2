import logging
import json
import time
import uuid
import socket
import platform
from datetime import datetime
from typing import List, Dict, Optional, Callable
from threading import Thread, Lock
import psutil
import redis
from config import redis_config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SystemMetrics:
    @staticmethod
    def get_cpu_usage(interval: float = 1.0) -> float:
        return psutil.cpu_percent(interval=interval)

    @staticmethod
    def get_memory_info() -> Dict[str, float]:
        mem = psutil.virtual_memory()
        return {
            'total': mem.total / (1024 ** 3),
            'available': mem.available / (1024 ** 3),
            'used': mem.used / (1024 ** 3),
            'usage_percent': mem.percent
        }

    @staticmethod
    def get_disk_info() -> Dict[str, float]:
        disk = psutil.disk_usage('/')
        return {
            'total': disk.total / (1024 ** 3),
            'used': disk.used / (1024 ** 3),
            'free': disk.free / (1024 ** 3),
            'usage_percent': disk.percent
        }

    @staticmethod
    def get_network_info() -> Dict[str, float]:
        net = psutil.net_io_counters()
        return {
            'bytes_sent': net.bytes_sent / (1024 ** 2),
            'bytes_recv': net.bytes_recv / (1024 ** 2),
            'packets_sent': net.packets_sent,
            'packets_recv': net.packets_recv
        }

    @staticmethod
    def get_load_avg() -> Dict[str, float]:
        try:
            load1, load5, load15 = psutil.getloadavg()
            return {
                'load1': load1,
                'load5': load5,
                'load15': load15
            }
        except:
            return {'load1': 0, 'load5': 0, 'load15': 0}

    @staticmethod
    def get_all_metrics() -> Dict:
        return {
            'cpu_usage': SystemMetrics.get_cpu_usage(interval=0.1),
            'memory': SystemMetrics.get_memory_info(),
            'disk': SystemMetrics.get_disk_info(),
            'network': SystemMetrics.get_network_info(),
            'load_avg': SystemMetrics.get_load_avg(),
            'timestamp': datetime.utcnow().isoformat()
        }


class NodeStatus:
    def __init__(self, node_id: str, hostname: str):
        self.node_id = node_id
        self.hostname = hostname
        self.status = "active"
        self.active_tasks = 0
        self.completed_tasks = 0
        self.failed_tasks = 0
        self.last_heartbeat = datetime.utcnow()
        self.start_time = datetime.utcnow()
        self.metrics = {}

    def to_dict(self) -> Dict:
        return {
            'node_id': self.node_id,
            'hostname': self.hostname,
            'status': self.status,
            'active_tasks': self.active_tasks,
            'completed_tasks': self.completed_tasks,
            'failed_tasks': self.failed_tasks,
            'last_heartbeat': self.last_heartbeat.isoformat(),
            'start_time': self.start_time.isoformat(),
            'metrics': self.metrics
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'NodeStatus':
        node = cls(data['node_id'], data['hostname'])
        node.status = data['status']
        node.active_tasks = data['active_tasks']
        node.completed_tasks = data['completed_tasks']
        node.failed_tasks = data['failed_tasks']
        node.last_heartbeat = datetime.fromisoformat(data['last_heartbeat'])
        node.start_time = datetime.fromisoformat(data['start_time'])
        node.metrics = data.get('metrics', {})
        return node


class NodeMonitor:
    def __init__(self, node_id: Optional[str] = None):
        self.node_id = node_id or f"node_{uuid.uuid4().hex[:8]}"
        self.hostname = socket.gethostname()
        self.redis_client = redis.Redis(
            host=redis_config.host,
            port=redis_config.port,
            db=redis_config.db,
            password=redis_config.password if redis_config.password else None,
            decode_responses=True
        )
        self.node_status = NodeStatus(self.node_id, self.hostname)
        self.is_monitoring = False
        self.monitor_thread = None
        self.status_lock = Lock()
        self.heartbeat_interval = 5
        self.metrics_history_key = f"node_metrics:{self.node_id}"
        self.nodes_key = "monitor:nodes"
        self.alerts_key = "monitor:alerts"

    def start(self):
        if self.is_monitoring:
            logger.warning("Monitor is already running")
            return

        self.is_monitoring = True
        self.monitor_thread = Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        
        self._register_node()
        logger.info(f"Node monitor started: {self.node_id} on {self.hostname}")

    def stop(self):
        self.is_monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=10)
        
        self._unregister_node()
        logger.info(f"Node monitor stopped: {self.node_id}")

    def _monitor_loop(self):
        sync_counter = 0
        while self.is_monitoring:
            try:
                metrics = SystemMetrics.get_all_metrics()
                
                with self.status_lock:
                    self.node_status.metrics = metrics
                    self.node_status.last_heartbeat = datetime.utcnow()
                
                self._update_node_status()
                self._store_metrics_history(metrics)
                self._check_alerts(metrics)
                
                sync_counter += 1
                if sync_counter >= 6:
                    self._sync_active_task_count()
                    sync_counter = 0
                
            except Exception as e:
                logger.error(f"Monitor loop error: {e}")
            
            time.sleep(self.heartbeat_interval)

    def _sync_active_task_count(self):
        from config import redis_config
        queue_name = redis_config.task_queue_name
        
        try:
            self._ensure_redis_connection()
            
            worker_pattern = f"worker_*_{self.node_id.split('_')[-1] if '_' in self.node_id else ''}"
            
            total_active = 0
            processing_keys = self.redis_client.keys(f"{queue_name}:processing:*")
            for key in processing_keys:
                total_active += self.redis_client.hlen(key)
            
            with self.status_lock:
                if self.node_status.active_tasks != total_active:
                    logger.debug(f"Synced active task count: {self.node_status.active_tasks} -> {total_active}")
                    self.node_status.active_tasks = total_active
                    self._update_node_status()
        except Exception as e:
            logger.debug(f"Sync active task count error: {e}")

    def _ensure_redis_connection(self):
        try:
            self.redis_client.ping()
        except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError):
            logger.warning("Redis connection lost in monitor, reconnecting...")
            self.redis_client = redis.Redis(
                host=redis_config.host,
                port=redis_config.port,
                db=redis_config.db,
                password=redis_config.password if redis_config.password else None,
                decode_responses=True
            )
            logger.info("Redis reconnected in monitor")

    def _register_node(self):
        self.redis_client.hset(
            self.nodes_key,
            self.node_id,
            json.dumps(self.node_status.to_dict())
        )

    def _unregister_node(self):
        self.redis_client.hdel(self.nodes_key, self.node_id)
        self.node_status.status = "inactive"
        self._update_node_status()

    def _update_node_status(self):
        with self.status_lock:
            self.redis_client.hset(
                self.nodes_key,
                self.node_id,
                json.dumps(self.node_status.to_dict())
            )

    def _store_metrics_history(self, metrics: Dict):
        timestamp = metrics['timestamp']
        self.redis_client.zadd(
            self.metrics_history_key,
            {json.dumps(metrics): timestamp}
        )
        
        history = self.redis_client.zrange(self.metrics_history_key, 0, -1)
        if len(history) > 1000:
            self.redis_client.zremrangebyrank(self.metrics_history_key, 0, len(history) - 1001)

    def _check_alerts(self, metrics: Dict):
        alerts = []
        
        if metrics['cpu_usage'] > 90:
            alerts.append({
                'type': 'high_cpu',
                'severity': 'warning',
                'message': f"High CPU usage: {metrics['cpu_usage']}%",
                'value': metrics['cpu_usage'],
                'threshold': 90
            })
        
        if metrics['memory']['usage_percent'] > 90:
            alerts.append({
                'type': 'high_memory',
                'severity': 'warning',
                'message': f"High memory usage: {metrics['memory']['usage_percent']}%",
                'value': metrics['memory']['usage_percent'],
                'threshold': 90
            })
        
        if metrics['disk']['usage_percent'] > 90:
            alerts.append({
                'type': 'high_disk',
                'severity': 'critical',
                'message': f"High disk usage: {metrics['disk']['usage_percent']}%",
                'value': metrics['disk']['usage_percent'],
                'threshold': 90
            })
        
        for alert in alerts:
            alert['node_id'] = self.node_id
            alert['hostname'] = self.hostname
            alert['timestamp'] = datetime.utcnow().isoformat()
            
            self.redis_client.lpush(self.alerts_key, json.dumps(alert))
            self.redis_client.ltrim(self.alerts_key, 0, 999)
            
            logger.warning(f"Alert: {alert['message']}")

    def update_task_count(self, active_delta: int = 0, 
                          completed: int = 0, 
                          failed: int = 0,
                          active_override: Optional[int] = None):
        with self.status_lock:
            if active_override is not None:
                self.node_status.active_tasks = active_override
            else:
                self.node_status.active_tasks = max(0, self.node_status.active_tasks + active_delta)
            
            if completed > 0:
                self.node_status.completed_tasks += completed
            
            if failed > 0:
                self.node_status.failed_tasks += failed
        
        self._update_node_status()

    def get_status(self) -> Dict:
        with self.status_lock:
            return self.node_status.to_dict()

    def get_metrics_history(self, limit: int = 100) -> List[Dict]:
        history = self.redis_client.zrevrange(self.metrics_history_key, 0, limit - 1)
        return [json.loads(m) for m in history]


class ClusterMonitor:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=redis_config.host,
            port=redis_config.port,
            db=redis_config.db,
            password=redis_config.password if redis_config.password else None,
            decode_responses=True
        )
        self.nodes_key = "monitor:nodes"
        self.alerts_key = "monitor:alerts"
        self.node_timeout = 30

    def get_all_nodes(self) -> Dict[str, NodeStatus]:
        nodes = {}
        node_data = self.redis_client.hgetall(self.nodes_key)
        
        for node_id, data_str in node_data.items():
            try:
                data = json.loads(data_str)
                node = NodeStatus.from_dict(data)
                
                if not self._is_node_alive(node):
                    node.status = "offline"
                
                nodes[node_id] = node
            except Exception as e:
                logger.error(f"Error parsing node data: {e}")
        
        return nodes

    def _is_node_alive(self, node: NodeStatus) -> bool:
        time_since_heartbeat = (datetime.utcnow() - node.last_heartbeat).total_seconds()
        return time_since_heartbeat < self.node_timeout

    def get_active_nodes(self) -> Dict[str, NodeStatus]:
        return {
            node_id: node 
            for node_id, node in self.get_all_nodes().items() 
            if node.status == "active"
        }

    def get_task_queue_stats(self) -> Dict:
        from config import redis_config
        queue_name = redis_config.task_queue_name
        
        try:
            pending_count = self.redis_client.zcard(queue_name)
            processing_count = 0
            result_count = 0
            failed_count = 0
            
            processing_keys = self.redis_client.keys(f"{queue_name}:processing:*")
            for key in processing_keys:
                processing_count += self.redis_client.hlen(key)
            
            result_keys = self.redis_client.keys(f"{queue_name}:results:*")
            result_count = len(result_keys)
            
            failed_keys = self.redis_client.keys(f"{queue_name}:failed:*")
            failed_count = len(failed_keys)
            
            return {
                'pending_tasks': pending_count,
                'processing_tasks': processing_count,
                'completed_tasks': result_count,
                'failed_tasks': failed_count,
                'total_tasks': pending_count + processing_count + result_count + failed_count
            }
        except Exception as e:
            logger.error(f"Error getting task queue stats: {e}")
            return {
                'pending_tasks': 0,
                'processing_tasks': 0,
                'completed_tasks': 0,
                'failed_tasks': 0,
                'total_tasks': 0
            }

    def get_worker_task_distribution(self) -> Dict:
        from config import redis_config
        queue_name = redis_config.task_queue_name
        
        distribution = {}
        try:
            processing_keys = self.redis_client.keys(f"{queue_name}:processing:*")
            for key in processing_keys:
                worker_id = key.split(':')[-1]
                task_count = self.redis_client.hlen(key)
                distribution[worker_id] = task_count
        except Exception as e:
            logger.error(f"Error getting worker task distribution: {e}")
        
        return distribution

    def get_cluster_summary(self) -> Dict:
        nodes = self.get_all_nodes()
        active_nodes = {k: v for k, v in nodes.items() if v.status == "active"}
        
        total_cpu = sum(n.metrics.get('cpu_usage', 0) for n in active_nodes.values())
        total_memory_used = sum(n.metrics.get('memory', {}).get('used', 0) for n in active_nodes.values())
        total_memory_total = sum(n.metrics.get('memory', {}).get('total', 0) for n in active_nodes.values())
        
        avg_cpu = total_cpu / len(active_nodes) if active_nodes else 0
        avg_memory = (total_memory_used / total_memory_total * 100) if total_memory_total > 0 else 0
        
        active_tasks = sum(n.active_tasks for n in active_nodes.values())
        completed_tasks = sum(n.completed_tasks for n in active_nodes.values())
        failed_tasks = sum(n.failed_tasks for n in active_nodes.values())
        
        task_queue_stats = self.get_task_queue_stats()
        worker_distribution = self.get_worker_task_distribution()
        
        total_active_from_queue = task_queue_stats['processing_tasks']
        if total_active_from_queue > 0 and active_tasks != total_active_from_queue:
            logger.info(f"Active task count mismatch: nodes report {active_tasks}, queue reports {total_active_from_queue}")
            active_tasks = max(active_tasks, total_active_from_queue)
        
        return {
            'total_nodes': len(nodes),
            'active_nodes': len(active_nodes),
            'offline_nodes': len(nodes) - len(active_nodes),
            'avg_cpu_usage': avg_cpu,
            'avg_memory_usage': avg_memory,
            'total_memory_used_gb': total_memory_used,
            'total_memory_total_gb': total_memory_total,
            'active_tasks': active_tasks,
            'completed_tasks': completed_tasks,
            'failed_tasks': failed_tasks,
            'task_queue': task_queue_stats,
            'worker_distribution': worker_distribution,
            'timestamp': datetime.utcnow().isoformat()
        }

    def get_alerts(self, limit: int = 100) -> List[Dict]:
        alerts = self.redis_client.lrange(self.alerts_key, 0, limit - 1)
        return [json.loads(a) for a in alerts]

    def clear_alerts(self):
        self.redis_client.delete(self.alerts_key)
        logger.info("Alerts cleared")

    def get_node_metrics(self, node_id: str, limit: int = 100) -> List[Dict]:
        metrics_key = f"node_metrics:{node_id}"
        history = self.redis_client.zrevrange(metrics_key, 0, limit - 1)
        return [json.loads(m) for m in history]

    def remove_dead_nodes(self) -> List[str]:
        nodes = self.get_all_nodes()
        dead_nodes = []
        
        for node_id, node in nodes.items():
            if not self._is_node_alive(node):
                self.redis_client.hdel(self.nodes_key, node_id)
                dead_nodes.append(node_id)
                logger.info(f"Removed dead node: {node_id}")
        
        return dead_nodes

    def sync_active_task_count(self, node_id: str) -> int:
        from config import redis_config
        queue_name = redis_config.task_queue_name
        
        try:
            processing_key = f"{queue_name}:processing:{node_id}"
            actual_count = self.redis_client.hlen(processing_key)
            
            node_data_str = self.redis_client.hget(self.nodes_key, node_id)
            if node_data_str:
                node_data = json.loads(node_data_str)
                node_data['active_tasks'] = actual_count
                self.redis_client.hset(self.nodes_key, node_id, json.dumps(node_data))
            
            return actual_count
        except Exception as e:
            logger.error(f"Error syncing active task count for node {node_id}: {e}")
            return 0


class MonitorAPI:
    def __init__(self):
        self.cluster_monitor = ClusterMonitor()

    def get_cluster_status(self) -> Dict:
        return {
            'summary': self.cluster_monitor.get_cluster_summary(),
            'nodes': {
                node_id: node.to_dict() 
                for node_id, node in self.cluster_monitor.get_all_nodes().items()
            }
        }

    def get_node_status(self, node_id: str) -> Optional[Dict]:
        nodes = self.cluster_monitor.get_all_nodes()
        node = nodes.get(node_id)
        return node.to_dict() if node else None

    def get_node_metrics_history(self, node_id: str, limit: int = 100) -> List[Dict]:
        return self.cluster_monitor.get_node_metrics(node_id, limit)

    def get_recent_alerts(self, limit: int = 100) -> List[Dict]:
        return self.cluster_monitor.get_alerts(limit)

    def get_system_health(self) -> Dict:
        summary = self.cluster_monitor.get_cluster_summary()
        
        health_status = "healthy"
        issues = []
        
        if summary['active_nodes'] == 0:
            health_status = "critical"
            issues.append("No active nodes in cluster")
        
        if summary['avg_cpu_usage'] > 80:
            health_status = "warning" if health_status == "healthy" else health_status
            issues.append(f"High average CPU usage: {summary['avg_cpu_usage']:.1f}%")
        
        if summary['avg_memory_usage'] > 80:
            health_status = "warning" if health_status == "healthy" else health_status
            issues.append(f"High average memory usage: {summary['avg_memory_usage']:.1f}%")
        
        if summary['failed_tasks'] > summary['completed_tasks'] * 0.1:
            health_status = "warning" if health_status == "healthy" else health_status
            issues.append("High task failure rate")
        
        return {
            'status': health_status,
            'issues': issues,
            'summary': summary,
            'timestamp': datetime.utcnow().isoformat()
        }
