import logging
import json
import uuid
import time
from typing import List, Dict, Optional, Tuple, Callable
from datetime import datetime, timedelta
from threading import Thread, Lock
import numpy as np
import redis

try:
    from dask.distributed import Client
    DASK_AVAILABLE = True
except ImportError:
    DASK_AVAILABLE = False

from config import dask_config, redis_config, grid_config, simulation_config
from data_models import SimulationTask, GridWeatherData, WeatherVariable, GridDefinition
from grid_simulator import RegionalSimulator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RedisTaskQueue:
    def __init__(self):
        self.queue_name = redis_config.task_queue_name
        self.processing_prefix = f"{self.queue_name}:processing"
        self.result_prefix = f"{self.queue_name}:results"
        self.failed_prefix = f"{self.queue_name}:failed"
        self.task_lock = Lock()
        self.max_retries = 3
        self._connect_redis()

    def _connect_redis(self):
        self.redis_client = redis.Redis(
            host=redis_config.host,
            port=redis_config.port,
            db=redis_config.db,
            password=redis_config.password if redis_config.password else None,
            decode_responses=True,
            socket_timeout=30,
            socket_connect_timeout=10,
            retry_on_timeout=True
        )

    def _ensure_redis_connection(self):
        try:
            self.redis_client.ping()
        except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError):
            logger.warning("Redis connection lost, reconnecting...")
            self._connect_redis()
            logger.info("Redis reconnected successfully")

    def push_task(self, task: SimulationTask) -> str:
        self._ensure_redis_connection()
        task_data = {
            'task_id': task.task_id,
            'grid_region': json.dumps(task.grid_region),
            'time_step': task.time_step,
            'start_time': task.start_time.isoformat(),
            'end_time': task.end_time.isoformat(),
            'variables': json.dumps([v.value for v in task.variables]),
            'priority': task.priority,
            'status': task.status,
            'retry_count': 0,
        }
        
        with self.task_lock:
            self.redis_client.hset(f"{self.queue_name}:tasks", task.task_id, json.dumps(task_data))
            self.redis_client.zadd(self.queue_name, {task.task_id: task.priority})
        
        logger.info(f"Task {task.task_id} pushed to queue")
        return task.task_id

    def pop_task(self, worker_id: str) -> Optional[Dict]:
        self._ensure_redis_connection()
        with self.task_lock:
            result = self.redis_client.zpopmax(self.queue_name, 1)
            if not result:
                return None
            
            task_id = result[0][0]
            task_data_str = self.redis_client.hget(f"{self.queue_name}:tasks", task_id)
            
            if task_data_str:
                task_data = json.loads(task_data_str)
                task_data['worker_id'] = worker_id
                task_data['status'] = 'processing'
                task_data['started_at'] = datetime.utcnow().isoformat()
                
                self.redis_client.hset(f"{self.processing_prefix}:{worker_id}", task_id, json.dumps(task_data))
                self.redis_client.hset(f"{self.queue_name}:tasks", task_id, json.dumps(task_data))
                
                logger.info(f"Task {task_id} popped by worker {worker_id}")
                return task_data
        
        return None

    def complete_task(self, task_id: str, worker_id: str, result: Dict, success: bool = True):
        self._ensure_redis_connection()
        with self.task_lock:
            task_data_str = self.redis_client.hget(f"{self.processing_prefix}:{worker_id}", task_id)
            if task_data_str:
                task_data = json.loads(task_data_str)
                task_data['status'] = 'completed' if success else 'failed'
                task_data['result'] = result
                task_data['completed_at'] = datetime.utcnow().isoformat()
                
                self.redis_client.hset(f"{self.result_prefix}:{task_id}", json.dumps(task_data))
                self.redis_client.hdel(f"{self.processing_prefix}:{worker_id}", task_id)
                self.redis_client.hset(f"{self.queue_name}:tasks", task_id, json.dumps(task_data))
                
                logger.info(f"Task {task_id} completed by worker {worker_id}")

    def retry_task(self, task_id: str, worker_id: str) -> bool:
        self._ensure_redis_connection()
        with self.task_lock:
            task_data_str = self.redis_client.hget(f"{self.processing_prefix}:{worker_id}", task_id)
            if not task_data_str:
                return False
            
            task_data = json.loads(task_data_str)
            retry_count = task_data.get('retry_count', 0) + 1
            
            if retry_count >= self.max_retries:
                logger.error(f"Task {task_id} failed after {retry_count} retries")
                task_data['status'] = 'failed'
                task_data['retry_count'] = retry_count
                self.redis_client.hset(f"{self.failed_prefix}:{task_id}", json.dumps(task_data))
                self.redis_client.hdel(f"{self.processing_prefix}:{worker_id}", task_id)
                self.redis_client.hset(f"{self.queue_name}:tasks", task_id, json.dumps(task_data))
                return False
            
            logger.info(f"Retrying task {task_id} (attempt {retry_count}/{self.max_retries})")
            task_data['status'] = 'pending'
            task_data['retry_count'] = retry_count
            task_data.pop('worker_id', None)
            task_data.pop('started_at', None)
            
            priority = task_data.get('priority', 0) + 1
            self.redis_client.hset(f"{self.queue_name}:tasks", task_id, json.dumps(task_data))
            self.redis_client.zadd(self.queue_name, {task_id: priority})
            self.redis_client.hdel(f"{self.processing_prefix}:{worker_id}", task_id)
            
            return True

    def recover_stuck_tasks(self, timeout_seconds: int = 300) -> int:
        self._ensure_redis_connection()
        recovered = 0
        with self.task_lock:
            processing_keys = self.redis_client.keys(f"{self.processing_prefix}:*")
            
            for worker_key in processing_keys:
                worker_id = worker_key.split(':')[-1]
                tasks = self.redis_client.hgetall(worker_key)
                
                for task_id, task_data_str in tasks.items():
                    try:
                        task_data = json.loads(task_data_str)
                        started_at = task_data.get('started_at')
                        
                        if started_at:
                            started_dt = datetime.fromisoformat(started_at)
                            elapsed = (datetime.utcnow() - started_dt).total_seconds()
                            
                            if elapsed > timeout_seconds:
                                logger.warning(f"Recovering stuck task {task_id} from worker {worker_id}")
                                if self.retry_task(task_id, worker_id):
                                    recovered += 1
                    except Exception as e:
                        logger.error(f"Error recovering task {task_id}: {e}")
        
        if recovered > 0:
            logger.info(f"Recovered {recovered} stuck tasks")
        return recovered

    def get_task_result(self, task_id: str) -> Optional[Dict]:
        result = self.redis_client.hget(f"{self.result_prefix}:{task_id}", task_id)
        if result:
            return json.loads(result)
        
        task_data = self.redis_client.hget(f"{self.queue_name}:tasks", task_id)
        if task_data:
            return json.loads(task_data)
        
        return None

    def get_pending_tasks(self) -> List[str]:
        return self.redis_client.zrange(self.queue_name, 0, -1)

    def get_active_tasks(self, worker_id: Optional[str] = None) -> Dict:
        if worker_id:
            return self.redis_client.hgetall(f"{self.processing_prefix}:{worker_id}")
        
        active = {}
        for key in self.redis_client.keys(f"{self.processing_prefix}:*"):
            worker = key.split(':')[-1]
            active[worker] = self.redis_client.hgetall(key)
        return active

    def clear_all(self):
        self._ensure_redis_connection()
        self.redis_client.delete(self.queue_name)
        self.redis_client.delete(f"{self.queue_name}:tasks")
        for key in self.redis_client.keys(f"{self.processing_prefix}:*"):
            self.redis_client.delete(key)
        for key in self.redis_client.keys(f"{self.result_prefix}:*"):
            self.redis_client.delete(key)
        for key in self.redis_client.keys(f"{self.failed_prefix}:*"):
            self.redis_client.delete(key)
        logger.info("All tasks cleared")


def execute_simulation_task(task_data: Dict, initial_grid_data: GridWeatherData, 
                            dt_seconds: int = 3600) -> Dict:
    try:
        grid_region = tuple(json.loads(task_data['grid_region']))
        num_steps = task_data['time_step']
        variables = [WeatherVariable(v) for v in json.loads(task_data['variables'])]
        
        grid_def = initial_grid_data.grid_def
        simulator = RegionalSimulator(grid_def, dt_seconds)
        
        result = simulator.simulate_region(initial_grid_data, grid_region, num_steps)
        
        return {
            'success': True,
            'task_id': task_data['task_id'],
            'data': result,
            'error': None
        }
    except Exception as e:
        logger.error(f"Task execution failed: {e}")
        return {
            'success': False,
            'task_id': task_data['task_id'],
            'data': None,
            'error': str(e)
        }


class TaskScheduler:
    def __init__(self, use_dask: bool = True):
        self.use_dask = use_dask
        self.task_queue = RedisTaskQueue()
        self.dask_client = None
        self.workers = {}
        self.is_running = False
        self._initialize_dask()

    def _initialize_dask(self):
        if self.use_dask and DASK_AVAILABLE:
            try:
                self.dask_client = Client(dask_config.scheduler_address, timeout=10)
                logger.info(f"Connected to Dask scheduler at {dask_config.scheduler_address}")
            except Exception as e:
                logger.warning(f"Failed to connect to Dask scheduler: {e}. Using local execution.")
                self.use_dask = False
        elif self.use_dask and not DASK_AVAILABLE:
            logger.warning("Dask not available. Using local execution.")
            self.use_dask = False

    def create_tasks(self, grid_def: GridDefinition, num_time_steps: int,
                     variables: List[WeatherVariable], num_regions: int = 4) -> List[SimulationTask]:
        regions = self._split_grid_regions(grid_def, num_regions)
        
        tasks = []
        for i, region in enumerate(regions):
            task = SimulationTask(
                task_id=str(uuid.uuid4()),
                grid_region=region,
                time_step=num_time_steps,
                start_time=datetime.utcnow(),
                end_time=datetime.utcnow() + timedelta(seconds=num_time_steps * simulation_config.dt_seconds),
                variables=variables,
                priority=100 - i
            )
            tasks.append(task)
        
        logger.info(f"Created {len(tasks)} simulation tasks")
        return tasks

    def _split_grid_regions(self, grid_def: GridDefinition, num_regions: int) -> List[Tuple[float, float, float, float]]:
        lat_range = grid_def.lat_max - grid_def.lat_min
        lon_range = grid_def.lon_max - grid_def.lon_min
        
        num_lat = int(np.ceil(np.sqrt(num_regions)))
        num_lon = int(np.ceil(num_regions / num_lat))
        
        regions = []
        for i in range(num_lat):
            lat_min = grid_def.lat_min + (i * lat_range / num_lat)
            lat_max = grid_def.lat_min + ((i + 1) * lat_range / num_lat)
            
            for j in range(num_lon):
                if len(regions) >= num_regions:
                    break
                    
                lon_min = grid_def.lon_min + (j * lon_range / num_lon)
                lon_max = grid_def.lon_min + ((j + 1) * lon_range / num_lon)
                
                regions.append((lat_min, lat_max, lon_min, lon_max))
        
        return regions

    def submit_tasks(self, tasks: List[SimulationTask]) -> List[str]:
        task_ids = []
        for task in tasks:
            task_id = self.task_queue.push_task(task)
            task_ids.append(task_id)
        return task_ids

    def execute_distributed(self, initial_grid_data: GridWeatherData, 
                           num_workers: Optional[int] = None) -> List[Dict]:
        num_workers = num_workers or simulation_config.parallel_workers
        pending_tasks = self.task_queue.get_pending_tasks()
        
        if not pending_tasks:
            logger.warning("No pending tasks to execute")
            return []
        
        logger.info(f"Executing {len(pending_tasks)} tasks with {num_workers} workers")
        
        results = []
        worker_id = f"worker_{uuid.uuid4().hex[:8]}"
        
        while True:
            pending = self.task_queue.get_pending_tasks()
            if not pending:
                break
                
            for task_id in pending[:num_workers]:
                task_data = self.task_queue.pop_task(worker_id)
                if not task_data:
                    continue
                    
                try:
                    if self.use_dask and self.dask_client:
                        future = self.dask_client.submit(
                            execute_simulation_task,
                            task_data,
                            initial_grid_data,
                            simulation_config.dt_seconds
                        )
                        result = future.result(timeout=300)
                    else:
                        result = execute_simulation_task(task_data, initial_grid_data, simulation_config.dt_seconds)
                    
                    if result['success']:
                        self.task_queue.complete_task(
                            task_data['task_id'],
                            worker_id,
                            result,
                            True
                        )
                        results.append(result)
                    else:
                        logger.warning(f"Task {task_data['task_id']} failed, retrying...")
                        self.task_queue.retry_task(task_data['task_id'], worker_id)
                except Exception as e:
                    logger.error(f"Task {task_data['task_id']} execution error: {e}")
                    self.task_queue.retry_task(task_data['task_id'], worker_id)
                    
                    import traceback
                    traceback.print_exc()
        
        logger.info(f"Completed {len(results)} tasks successfully")
        return results

    def run_worker(self, worker_id: str, initial_grid_data: GridWeatherData):
        logger.info(f"Worker {worker_id} started")
        
        consecutive_errors = 0
        
        while self.is_running:
            try:
                self.task_queue._ensure_redis_connection()
                task_data = self.task_queue.pop_task(worker_id)
                
                if task_data:
                    consecutive_errors = 0
                    if self.monitor:
                        self.monitor.update_task_count(active_delta=1)
                    
                    try:
                        result = execute_simulation_task(task_data, initial_grid_data, simulation_config.dt_seconds)
                        
                        if result['success']:
                            self.task_queue.complete_task(
                                task_data['task_id'],
                                worker_id,
                                result,
                                True
                            )
                            if self.monitor:
                                self.monitor.update_task_count(active_delta=-1, completed=1)
                        else:
                            logger.warning(f"Task {task_data['task_id']} failed, retrying...")
                            retried = self.task_queue.retry_task(task_data['task_id'], worker_id)
                            if self.monitor:
                                if retried:
                                    self.monitor.update_task_count(active_delta=-1)
                                else:
                                    self.monitor.update_task_count(active_delta=-1, failed=1)
                    except Exception as e:
                        logger.error(f"Worker {worker_id} task exception: {e}")
                        retried = self.task_queue.retry_task(task_data['task_id'], worker_id)
                        if self.monitor:
                            if retried:
                                self.monitor.update_task_count(active_delta=-1)
                            else:
                                self.monitor.update_task_count(active_delta=-1, failed=1)
                        
                        import traceback
                        traceback.print_exc()
                else:
                    time.sleep(0.5)
                    
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"Worker {worker_id} loop error (count={consecutive_errors}): {e}")
                
                import traceback
                traceback.print_exc()
                
                if consecutive_errors > 10:
                    logger.critical(f"Worker {worker_id} too many errors, sleeping 30s")
                    time.sleep(30)
                    consecutive_errors = 0
                else:
                    time.sleep(1)
        
        logger.info(f"Worker {worker_id} stopped")

    def start_worker_pool(self, initial_grid_data: GridWeatherData, num_workers: int = 4, 
                          monitor: Optional['NodeMonitor'] = None):
        self.is_running = True
        self.workers = {}
        self.monitor = monitor
        
        for i in range(num_workers):
            worker_id = f"worker_{i}_{uuid.uuid4().hex[:8]}"
            thread = Thread(target=self.run_worker, args=(worker_id, initial_grid_data))
            thread.daemon = False
            thread.start()
            self.workers[worker_id] = thread
        
        logger.info(f"Started {num_workers} workers")

    def stop_worker_pool(self):
        logger.info("Stopping worker pool...")
        self.is_running = False
        
        for worker_id, thread in self.workers.items():
            if thread.is_alive():
                logger.info(f"Waiting for worker {worker_id} to finish...")
                thread.join(timeout=30)
                if thread.is_alive():
                    logger.warning(f"Worker {worker_id} did not exit gracefully")
        
        self.workers = {}
        logger.info("Worker pool stopped")

    def wait_for_completion(self, timeout: int = 3600, stuck_check_interval: int = 60) -> bool:
        start_time = time.time()
        last_stuck_check = start_time
        
        while time.time() - start_time < timeout:
            try:
                self.task_queue._ensure_redis_connection()
                
                pending = self.task_queue.get_pending_tasks()
                active = self.task_queue.get_active_tasks()
                
                active_count = sum(len(tasks) for tasks in active.values()) if isinstance(active, dict) else 0
                
                if time.time() - last_stuck_check > stuck_check_interval:
                    recovered = self.task_queue.recover_stuck_tasks(timeout_seconds=300)
                    last_stuck_check = time.time()
                    if recovered > 0:
                        logger.info(f"Recovered {recovered} stuck tasks during wait")
                
                if not pending and active_count == 0:
                    logger.info("All tasks completed")
                    return True
                
                time.sleep(1)
            except Exception as e:
                logger.error(f"Error in wait_for_completion: {e}")
                time.sleep(5)
        
        logger.warning("Timeout waiting for tasks to complete")
        return False

    def get_all_results(self, task_ids: List[str]) -> List[Dict]:
        results = []
        for task_id in task_ids:
            result = self.task_queue.get_task_result(task_id)
            if result:
                results.append(result)
        return results

    def shutdown(self):
        self.stop_worker_pool()
        if self.dask_client:
            self.dask_client.close()
        logger.info("Scheduler shutdown complete")
