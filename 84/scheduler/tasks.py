from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import uuid
from datetime import datetime
from celery import group, chord, chain
from .celery_app import app
from config import CFDConfig, ShardInfo, GridConfig, SimulationConfig, PriorityLevel
from cfd_compute import solve_shard, compute_flow_metrics
from preprocessing import GridSharder, DataCleaner, DataValidator, generate_initial_conditions
from storage import InfluxDBStorage, ResultSerializer


@app.task(bind=True, name='scheduler.tasks.compute_shard_task', 
          max_retries=3, default_retry_delay=30,
          autoretry_for=(Exception,), retry_backoff=True)
def compute_shard_task(self, u_shard: np.ndarray, v_shard: np.ndarray, p_shard: np.ndarray,
                       shard_dict: Dict[str, Any], grid_dict: Dict[str, Any], 
                       sim_dict: Dict[str, Any], iterations: int, 
                       start_iteration: int = 0, save_interval: int = 10) -> Dict[str, Any]:
    shard = ShardInfo(**shard_dict)
    grid_config = GridConfig(**grid_dict)
    sim_config = SimulationConfig(**sim_dict)
    try:
        result = solve_shard(u_shard, v_shard, p_shard,
                             shard, grid_config, sim_config,
                             iterations, start_iteration, save_interval)
        return {
            'status': 'success',
            'task_id': self.request.id,
            'shard_id': shard.shard_id,
            'result': result,
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            'status': 'error',
            'task_id': self.request.id,
            'shard_id': shard.shard_id,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


@app.task(bind=True, name='scheduler.tasks.run_simulation_task',
          max_retries=2, default_retry_delay=60)
def run_simulation_task(self, config_dict: Dict[str, Any], 
                        initial_conditions: Optional[Dict[str, np.ndarray]] = None) -> Dict[str, Any]:
    try:
        grid_config = GridConfig(**config_dict['grid'])
        sim_config = SimulationConfig(**config_dict['sim'])
        cfd_config = CFDConfig(
            grid=grid_config,
            sim=sim_config,
            priority=PriorityLevel(config_dict.get('priority', 5)),
            task_id=config_dict.get('task_id', str(uuid.uuid4())),
            name=config_dict.get('name', 'cfd_simulation'),
            num_shards=config_dict.get('num_shards', 4)
        )
        priority = cfd_config.priority.value
        if initial_conditions is None:
            u, v, p = generate_initial_conditions(
                grid_config.nx, grid_config.ny,
                condition_type=config_dict.get('initial_condition', 'taylor_green')
            )
        else:
            u = initial_conditions['u']
            v = initial_conditions['v']
            p = initial_conditions['p']
        cleaner = DataCleaner()
        u, v, p = cleaner.clean_velocity(u, v, p)
        validator = DataValidator(grid_config)
        validation = validator.validate_full(u, v, p, sim_config.nu, sim_config.dt)
        if not validation['valid']:
            return {
                'status': 'validation_error',
                'task_id': cfd_config.task_id,
                'errors': validation['errors'],
                'timestamp': datetime.utcnow().isoformat()
            }
        sharder = GridSharder(grid_config, cfd_config.num_shards)
        u_shards = sharder.split(u)
        v_shards = sharder.split(v)
        p_shards = sharder.split(p)
        iterations_per_batch = config_dict.get('iterations_per_batch', 100)
        shard_timeout = config_dict.get('shard_timeout', 3600)
        total_iterations = sim_config.iterations
        current_iteration = 0
        all_results = []
        max_retries = config_dict.get('max_retries', 3)
        while current_iteration < total_iterations:
            batch_iterations = min(iterations_per_batch, total_iterations - current_iteration)
            tasks = []
            for i in range(cfd_config.num_shards):
                shard_info, u_shard = u_shards[i]
                _, v_shard = v_shards[i]
                _, p_shard = p_shards[i]
                task = compute_shard_task.s(
                    u_shard, v_shard, p_shard,
                    shard_info.to_dict(),
                    grid_config.to_dict(),
                    sim_config.to_dict(),
                    batch_iterations,
                    current_iteration,
                    sim_config.save_interval
                ).set(priority=priority, queue='compute')
                tasks.append(task)
            job = group(tasks)
            try:
                async_result = job.apply_async()
                batch_results = async_result.get(timeout=shard_timeout)
            except TimeoutError as e:
                async_result.revoke(terminate=True, signal='SIGKILL')
                return {
                    'status': 'timeout',
                    'task_id': cfd_config.task_id,
                    'iteration': current_iteration,
                    'error': f'Shard batch timed out after {shard_timeout}s',
                    'timestamp': datetime.utcnow().isoformat()
                }
            except Exception as e:
                return {
                    'status': 'group_error',
                    'task_id': cfd_config.task_id,
                    'iteration': current_iteration,
                    'error': str(e),
                    'timestamp': datetime.utcnow().isoformat()
                }
            shard_results = []
            failed_shards = []
            for i, res in enumerate(batch_results):
                if isinstance(res, dict) and res.get('status') == 'success':
                    shard_data = res['result']
                    shard = sharder.get_shard(i)
                    shard_results.append((shard, shard_data['u_final']))
                    u_shards[i] = (shard, shard_data['u_final'])
                    v_shards[i] = (shard, shard_data['v_final'])
                    p_shards[i] = (shard, shard_data['p_final'])
                    all_results.extend(shard_data['saved_data'])
                else:
                    failed_shards.append(i)
            if failed_shards:
                return {
                    'status': 'shard_error',
                    'task_id': cfd_config.task_id,
                    'shard_ids': failed_shards,
                    'errors': [batch_results[i].get('error', 'Unknown') for i in failed_shards],
                    'timestamp': datetime.utcnow().isoformat()
                }
            current_iteration += batch_iterations
            if current_iteration < total_iterations:
                halo_exchanged = sharder.neighbor_halo_exchange(
                    {i: u_shards[i][1] for i in range(cfd_config.num_shards)}
                )
                for i in range(cfd_config.num_shards):
                    shard = u_shards[i][0]
                    u_shards[i] = (shard, halo_exchanged[i])
                halo_exchanged_v = sharder.neighbor_halo_exchange(
                    {i: v_shards[i][1] for i in range(cfd_config.num_shards)}
                )
                for i in range(cfd_config.num_shards):
                    shard = v_shards[i][0]
                    v_shards[i] = (shard, halo_exchanged_v[i])
                halo_exchanged_p = sharder.neighbor_halo_exchange(
                    {i: p_shards[i][1] for i in range(cfd_config.num_shards)}
                )
                for i in range(cfd_config.num_shards):
                    shard = p_shards[i][0]
                    p_shards[i] = (shard, halo_exchanged_p[i])
        u_final = sharder.merge([(s, d) for s, d in u_shards])
        v_final = sharder.merge([(s, d) for s, d in v_shards])
        p_final = sharder.merge([(s, d) for s, d in p_shards])
        process_and_store_results.delay(
            config_dict,
            {'u': u_final, 'v': v_final, 'p': p_final},
            all_results
        )
        return {
            'status': 'completed',
            'task_id': cfd_config.task_id,
            'name': cfd_config.name,
            'iterations_completed': total_iterations,
            'final_velocity': {'u': u_final, 'v': v_final, 'p': p_final},
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


@app.task(bind=True, name='scheduler.tasks.process_and_store_results')
def process_and_store_results(self, config_dict: Dict[str, Any],
                              final_fields: Dict[str, np.ndarray],
                              history_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    try:
        grid_config = GridConfig(**config_dict['grid'])
        sim_config = SimulationConfig(**config_dict['sim'])
        storage = InfluxDBStorage()
        serializer = ResultSerializer()
        task_id = config_dict.get('task_id', str(uuid.uuid4()))
        task_name = config_dict.get('name', 'cfd_simulation')
        tags = {
            'task_id': task_id,
            'task_name': task_name,
            'simulation_type': sim_config.sim_type.value,
            'nx': str(grid_config.nx),
            'ny': str(grid_config.ny)
        }
        for frame in history_data:
            iteration = frame['iteration']
            time_val = frame['time']
            u = frame['u']
            v = frame['v']
            p = frame['p']
            metrics = compute_flow_metrics(u, v, p,
                                           grid_config.dx, grid_config.dy,
                                           sim_config.dt, sim_config.nu)
            metrics_dict = metrics.to_dict()
            point = serializer.create_flow_metrics_point(
                metrics=metrics_dict,
                iteration=iteration,
                time_val=time_val,
                tags=tags
            )
            storage.write_point(point)
        storage.flush()
        return {
            'status': 'success',
            'task_id': task_id,
            'frames_stored': len(history_data),
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


@app.task(bind=True, name='scheduler.tasks.monitor_node_task')
def monitor_node_task(self, node_name: str) -> Dict[str, Any]:
    try:
        import psutil
        return {
            'status': 'success',
            'node_name': node_name,
            'timestamp': datetime.utcnow().isoformat(),
            'cpu_percent': psutil.cpu_percent(interval=1),
            'memory_percent': psutil.virtual_memory().percent,
            'memory_available_gb': psutil.virtual_memory().available / (1024 ** 3),
            'disk_percent': psutil.disk_usage('/').percent if hasattr(psutil, 'disk_usage') else 0,
            'active_tasks': 0
        }
    except Exception as e:
        return {
            'status': 'error',
            'node_name': node_name,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


class TaskManager:
    def __init__(self):
        self.active_jobs: Dict[str, Any] = {}
    def submit_simulation(self, config: CFDConfig,
                          initial_conditions: Optional[Dict[str, np.ndarray]] = None,
                          queue: str = 'simulation') -> str:
        priority = config.priority.value
        task = run_simulation_task.s(
            config.to_dict(),
            initial_conditions
        ).set(priority=priority, queue=queue)
        result = task.apply_async()
        config.task_id = result.id
        self.active_jobs[result.id] = {
            'config': config,
            'result': result,
            'submitted_at': datetime.utcnow()
        }
        return result.id
    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        if job_id not in self.active_jobs:
            return None
        job = self.active_jobs[job_id]
        result = job['result']
        return {
            'job_id': job_id,
            'state': result.state,
            'status': result.status,
            'ready': result.ready(),
            'successful': result.successful() if result.ready() else None,
            'submitted_at': job['submitted_at'].isoformat(),
            'config': job['config'].to_dict()
        }
    def get_job_result(self, job_id: str, timeout: Optional[float] = None) -> Any:
        if job_id not in self.active_jobs:
            raise ValueError(f"Job {job_id} not found")
        return self.active_jobs[job_id]['result'].get(timeout=timeout)
    def cancel_job(self, job_id: str) -> bool:
        if job_id not in self.active_jobs:
            return False
        self.active_jobs[job_id]['result'].revoke(terminate=True)
        del self.active_jobs[job_id]
        return True
    def list_jobs(self) -> List[Dict[str, Any]]:
        return [self.get_job_status(jid) for jid in self.active_jobs.keys()]


task_manager = TaskManager()
