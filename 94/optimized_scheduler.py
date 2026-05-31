import logging
import json
import time
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from collections import defaultdict, deque
import numpy as np
import redis

from config import redis_config, simulation_config
from data_models import SimulationTask, GridDefinition
from node_monitor import ClusterMonitor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class WorkerLoad:
    worker_id: str
    cpu_usage: float
    memory_usage: float
    memory_total: float
    active_tasks: int
    pending_tasks: int
    last_heartbeat: datetime
    cpu_history: deque = field(default_factory=lambda: deque(maxlen=10))
    memory_history: deque = field(default_factory=lambda: deque(maxlen=10))
    task_completion_times: deque = field(default_factory=lambda: deque(maxlen=20))

    @property
    def memory_available(self) -> float:
        return self.memory_total - self.memory_usage

    @property
    def avg_cpu(self) -> float:
        return np.mean(self.cpu_history) if self.cpu_history else self.cpu_usage

    @property
    def avg_memory(self) -> float:
        return np.mean(self.memory_history) if self.memory_history else self.memory_usage

    @property
    def avg_task_time(self) -> float:
        return np.mean(self.task_completion_times) if self.task_completion_times else 60.0


@dataclass
class TaskResourceEstimate:
    estimated_cpu: float
    estimated_memory_mb: float
    estimated_duration: float
    priority: int


class LoadAwareScheduler:
    def __init__(self, grid_def: GridDefinition):
        self.grid_def = grid_def
        self.redis_client = redis.Redis(
            host=redis_config.host,
            port=redis_config.port,
            db=redis_config.db,
            password=redis_config.password if redis_config.password else None,
            decode_responses=True
        )
        self.cluster_monitor = ClusterMonitor()
        self.workers: Dict[str, WorkerLoad] = {}
        self.task_estimates: Dict[str, TaskResourceEstimate] = {}
        self.scheduling_history: List[Dict] = []
        self.task_queue_name = redis_config.task_queue_name
        self.worker_stats_key = "scheduler:worker_stats"
        self.optimal_load_threshold = 0.7
        self.max_load_threshold = 0.9
        self.min_load_threshold = 0.3

    def update_worker_status(self):
        cluster_summary = self.cluster_monitor.get_cluster_summary()
        nodes = self.cluster_monitor.get_all_nodes()
        
        for node_id, node_status in nodes.items():
            if node_status.status != "active":
                continue
            
            if node_id not in self.workers:
                self.workers[node_id] = WorkerLoad(
                    worker_id=node_id,
                    cpu_usage=0,
                    memory_usage=0,
                    memory_total=16,
                    active_tasks=0,
                    pending_tasks=0,
                    last_heartbeat=datetime.utcnow()
                )
            
            worker = self.workers[node_id]
            metrics = node_status.metrics
            
            cpu_usage = metrics.get('cpu_usage', 0) / 100
            memory_usage = metrics.get('memory', {}).get('used', 0)
            memory_total = metrics.get('memory', {}).get('total', 16)
            
            worker.cpu_usage = cpu_usage
            worker.memory_usage = memory_usage
            worker.memory_total = memory_total
            worker.active_tasks = node_status.active_tasks
            worker.last_heartbeat = node_status.last_heartbeat
            
            worker.cpu_history.append(cpu_usage)
            worker.memory_history.append(memory_usage)
        
        dead_workers = [wid for wid in self.workers 
                       if (datetime.utcnow() - self.workers[wid].last_heartbeat).total_seconds() > 60]
        for wid in dead_workers:
            del self.workers[wid]
            logger.info(f"Removed dead worker {wid} from scheduler")

    def estimate_task_resources(self, task: SimulationTask) -> TaskResourceEstimate:
        if task.task_id in self.task_estimates:
            return self.task_estimates[task.task_id]
        
        grid_points = self.grid_def.shape[0] * self.grid_def.shape[1]
        region_size = (task.grid_region[1] - task.grid_region[0]) * (task.grid_region[3] - task.grid_region[2])
        total_size = (self.grid_def.lat_max - self.grid_def.lat_min) * (self.grid_def.lon_max - self.grid_def.lon_min)
        
        region_ratio = region_size / total_size
        
        base_cpu = 0.3
        base_memory_mb = 512
        base_duration = 30
        
        estimated_cpu = base_cpu + region_ratio * 0.5
        estimated_memory = base_memory_mb + grid_points * 0.01
        estimated_duration = base_duration + task.time_step * 2
        
        avg_worker_time = np.mean([w.avg_task_time for w in self.workers.values()]) if self.workers else 60
        estimated_duration = estimated_duration * (avg_worker_time / 60)
        
        estimate = TaskResourceEstimate(
            estimated_cpu=estimated_cpu,
            estimated_memory_mb=estimated_memory,
            estimated_duration=estimated_duration,
            priority=task.priority
        )
        
        self.task_estimates[task.task_id] = estimate
        return estimate

    def calculate_worker_score(self, worker: WorkerLoad, task_estimate: TaskResourceEstimate) -> float:
        cpu_available = 1.0 - worker.avg_cpu
        memory_available_gb = worker.memory_available
        memory_needed_gb = task_estimate.estimated_memory_mb / 1024
        
        if memory_available_gb < memory_needed_gb:
            return float('-inf')
        
        if worker.avg_cpu > self.max_load_threshold:
            return float('-inf')
        
        cpu_score = cpu_available * 0.4
        memory_score = (memory_available_gb / worker.memory_total) * 0.3
        
        task_load = task_estimate.estimated_cpu
        current_load = worker.avg_cpu
        expected_load = current_load + task_load
        
        if expected_load <= self.optimal_load_threshold:
            load_score = 1.0
        elif expected_load <= self.max_load_threshold:
            load_score = 1.0 - (expected_load - self.optimal_load_threshold) / (self.max_load_threshold - self.optimal_load_threshold)
        else:
            load_score = 0.1
        
        load_score *= 0.2
        
        tasks_pending_score = 1.0 / (1.0 + worker.pending_tasks) * 0.1
        
        total_score = cpu_score + memory_score + load_score + tasks_pending_score
        
        return total_score

    def select_best_worker(self, task: SimulationTask) -> Optional[str]:
        self.update_worker_status()
        
        if not self.workers:
            logger.warning("No active workers available")
            return None
        
        task_estimate = self.estimate_task_resources(task)
        
        best_worker = None
        best_score = float('-inf')
        
        for worker_id, worker in self.workers.items():
            score = self.calculate_worker_score(worker, task_estimate)
            
            if score > best_score:
                best_score = score
                best_worker = worker_id
        
        if best_worker:
            logger.info(f"Selected worker {best_worker} for task {task.task_id} (score: {best_score:.3f})")
            self._record_scheduling(task, best_worker, task_estimate)
        
        return best_worker

    def _record_scheduling(self, task: SimulationTask, worker_id: str, estimate: TaskResourceEstimate):
        record = {
            'timestamp': datetime.utcnow().isoformat(),
            'task_id': task.task_id,
            'worker_id': worker_id,
            'estimated_cpu': estimate.estimated_cpu,
            'estimated_memory_mb': estimate.estimated_memory_mb,
            'estimated_duration': estimate.estimated_duration,
            'priority': task.priority
        }
        self.scheduling_history.append(record)
        
        if len(self.scheduling_history) > 1000:
            self.scheduling_history = self.scheduling_history[-1000:]

    def predict_worker_load(self, worker_id: str, horizon_seconds: int = 300) -> Dict:
        if worker_id not in self.workers:
            return {}
        
        worker = self.workers[worker_id]
        
        if len(worker.cpu_history) < 3:
            return {
                'predicted_cpu': worker.cpu_usage,
                'predicted_memory': worker.memory_usage,
                'confidence': 0.5
            }
        
        cpu_series = list(worker.cpu_history)
        memory_series = list(worker.memory_history)
        
        cpu_trend = np.polyfit(range(len(cpu_series)), cpu_series, 1)[0]
        memory_trend = np.polyfit(range(len(memory_series)), memory_series, 1)[0]
        
        steps = horizon_seconds / 5
        
        predicted_cpu = min(1.0, max(0.0, cpu_series[-1] + cpu_trend * steps))
        predicted_memory = min(worker.memory_total, max(0, memory_series[-1] + memory_trend * steps))
        
        cpu_std = np.std(cpu_series[-5:]) if len(cpu_series) >= 5 else np.std(cpu_series)
        memory_std = np.std(memory_series[-5:]) if len(memory_series) >= 5 else np.std(memory_series)
        
        confidence = 1.0 - min(1.0, (cpu_std + memory_std) / 2)
        
        return {
            'predicted_cpu': float(predicted_cpu),
            'predicted_memory_gb': float(predicted_memory),
            'cpu_trend': float(cpu_trend),
            'memory_trend': float(memory_trend),
            'confidence': float(confidence)
        }

    def rebalance_tasks(self) -> List[Dict]:
        self.update_worker_status()
        
        rebalance_actions = []
        
        overloaded = []
        underloaded = []
        
        for worker_id, worker in self.workers.items():
            if worker.avg_cpu > self.max_load_threshold:
                overloaded.append((worker_id, worker))
            elif worker.avg_cpu < self.min_load_threshold and worker.active_tasks > 0:
                underloaded.append((worker_id, worker))
        
        if len(overloaded) == 0 or len(underloaded) == 0:
            return rebalance_actions
        
        processing_prefix = f"{self.task_queue_name}:processing"
        
        for over_id, over_worker in overloaded:
            processing_key = f"{processing_prefix}:{over_id}"
            tasks = self.redis_client.hgetall(processing_key)
            
            for task_id, task_data_str in list(tasks.items())[:len(tasks) // 2]:
                for under_id, under_worker in underloaded:
                    if under_worker.avg_cpu < self.optimal_load_threshold:
                        action = {
                            'from_worker': over_id,
                            'to_worker': under_id,
                            'task_id': task_id,
                            'reason': f"Overloaded {over_worker.avg_cpu:.2f} -> Underloaded {under_worker.avg_cpu:.2f}"
                        }
                        rebalance_actions.append(action)
                        logger.info(f"Rebalance plan: {action['reason']}")
                        break
        
        return rebalance_actions

    def get_optimal_worker_count(self, pending_tasks: int, avg_task_duration: float = 60) -> int:
        if pending_tasks == 0:
            return 0
        
        self.update_worker_status()
        
        if not self.workers:
            return min(simulation_config.parallel_workers, pending_tasks)
        
        avg_worker_capacity = 1.0 / self.optimal_load_threshold
        tasks_per_worker_per_hour = 3600 / avg_task_duration
        
        total_capacity = len(self.workers) * avg_worker_capacity * tasks_per_worker_per_hour
        required_capacity = pending_tasks
        
        optimal_workers = max(1, min(
            simulation_config.parallel_workers,
            int(np.ceil(required_capacity / tasks_per_worker_per_hour / avg_worker_capacity))
        ))
        
        return optimal_workers

    def optimize_task_batch(self, tasks: List[SimulationTask]) -> List[SimulationTask]:
        self.update_worker_status()
        
        if not self.workers:
            return tasks
        
        worker_count = len(self.workers)
        avg_cpu = np.mean([w.avg_cpu for w in self.workers.values()])
        
        if avg_cpu < self.min_load_threshold:
            batch_size = worker_count * 2
        elif avg_cpu < self.optimal_load_threshold:
            batch_size = worker_count
        else:
            batch_size = max(1, int(worker_count * (1.0 - avg_cpu)))
        
        sorted_tasks = sorted(tasks, key=lambda t: t.priority, reverse=True)
        
        return sorted_tasks[:batch_size]

    def get_resource_utilization_report(self) -> Dict:
        self.update_worker_status()
        
        if not self.workers:
            return {'error': 'No active workers'}
        
        cpu_usages = [w.avg_cpu for w in self.workers.values()]
        memory_usages = [w.memory_usage for w in self.workers.values()]
        active_tasks_list = [w.active_tasks for w in self.workers.values()]
        
        report = {
            'total_workers': len(self.workers),
            'avg_cpu_usage': float(np.mean(cpu_usages)),
            'max_cpu_usage': float(np.max(cpu_usages)),
            'min_cpu_usage': float(np.min(cpu_usages)),
            'cpu_std': float(np.std(cpu_usages)),
            'avg_memory_usage_gb': float(np.mean(memory_usages)),
            'total_memory_gb': float(sum(w.memory_total for w in self.workers.values())),
            'total_active_tasks': sum(active_tasks_list),
            'avg_tasks_per_worker': float(np.mean(active_tasks_list)),
            'load_balance_score': float(1.0 - np.std(cpu_usages) / np.mean(cpu_usages) if np.mean(cpu_usages) > 0 else 1.0),
            'efficiency_score': float(np.mean([
                1.0 - abs(w.avg_cpu - self.optimal_load_threshold) / self.optimal_load_threshold
                for w in self.workers.values()
            ])),
            'workers': {
                wid: {
                    'cpu_usage': w.avg_cpu,
                    'memory_usage_gb': w.memory_usage,
                    'active_tasks': w.active_tasks,
                    'avg_task_time': w.avg_task_time
                }
                for wid, w in self.workers.items()
            }
        }
        
        return report

    def record_task_completion(self, worker_id: str, task_id: str, duration_seconds: float):
        if worker_id in self.workers:
            self.workers[worker_id].task_completion_times.append(duration_seconds)
            logger.info(f"Worker {worker_id} completed task {task_id} in {duration_seconds:.1f}s")
        
        if task_id in self.task_estimates:
            estimate = self.task_estimates[task_id]
            error_percent = abs(duration_seconds - estimate.estimated_duration) / estimate.estimated_duration * 100
            logger.info(f"Task {task_id} duration estimate error: {error_percent:.1f}%")

    def save_state(self):
        state = {
            'timestamp': datetime.utcnow().isoformat(),
            'task_estimates': {
                tid: asdict(est) for tid, est in self.task_estimates.items()
            },
            'scheduling_history': self.scheduling_history[-100:]
        }
        
        self.redis_client.set(self.worker_stats_key, json.dumps(state))
        logger.info("Scheduler state saved")

    def load_state(self):
        data = self.redis_client.get(self.worker_stats_key)
        if data:
            try:
                state = json.loads(data)
                for tid, est_data in state.get('task_estimates', {}).items():
                    self.task_estimates[tid] = TaskResourceEstimate(**est_data)
                self.scheduling_history = state.get('scheduling_history', [])
                logger.info("Scheduler state loaded")
            except Exception as e:
                logger.error(f"Failed to load scheduler state: {e}")


from dataclasses import asdict


class DynamicTaskAllocator:
    def __init__(self, grid_def: GridDefinition):
        self.load_scheduler = LoadAwareScheduler(grid_def)
        self.grid_def = grid_def
        self.task_queue: List[SimulationTask] = []
        self.allocation_history: List[Dict] = []

    def add_tasks(self, tasks: List[SimulationTask]):
        self.task_queue.extend(tasks)
        logger.info(f"Added {len(tasks)} tasks to allocation queue")

    def allocate_next_batch(self) -> List[Tuple[SimulationTask, Optional[str]]]:
        if not self.task_queue:
            return []
        
        optimized_tasks = self.load_scheduler.optimize_task_batch(self.task_queue)
        
        allocations = []
        for task in optimized_tasks:
            worker_id = self.load_scheduler.select_best_worker(task)
            allocations.append((task, worker_id))
            
            if worker_id:
                self.allocation_history.append({
                    'task_id': task.task_id,
                    'worker_id': worker_id,
                    'timestamp': datetime.utcnow().isoformat()
                })
        
        self.task_queue = [t for t in self.task_queue if t not in optimized_tasks]
        
        logger.info(f"Allocated {len(allocations)} tasks")
        return allocations

    def get_allocation_efficiency(self) -> Dict:
        utilization = self.load_scheduler.get_resource_utilization_report()
        
        if 'error' in utilization:
            return utilization
        
        return {
            'resource_utilization': utilization,
            'pending_tasks': len(self.task_queue),
            'allocation_count': len(self.allocation_history),
            'timestamp': datetime.utcnow().isoformat()
        }

    def run_rebalance_check(self) -> List[Dict]:
        return self.load_scheduler.rebalance_tasks()
