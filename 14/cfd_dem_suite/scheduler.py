import queue
import threading
import multiprocessing as mp
from multiprocessing import Process, Queue, Event
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
import time
import uuid
import logging
from datetime import datetime
import psutil
import signal
import sys

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class TaskPriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class WorkerInfo:
    worker_id: int
    pid: int = 0
    status: str = "idle"
    current_task: Optional[str] = None
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    started_at: Optional[datetime] = None


def _init_worker():
    if sys.platform != 'win32':
        signal.signal(signal.SIGINT, signal.SIG_IGN)


def _worker_process(
    worker_id: int,
    task_queue: Queue,
    result_queue: Queue,
    stop_event: Event,
    timeout: int = 3600
):
    """工作进程函数 - 避免使用Manager.dict()减少同步问题"""
    _init_worker()
    
    pid = mp.current_process().pid
    process = psutil.Process(pid)
    
    status_msg = {
        'type': 'status',
        'worker_id': worker_id,
        'pid': pid,
        'status': 'idle',
        'current_task': None
    }
    try:
        result_queue.put_nowait(status_msg)
    except:
        pass
    
    while not stop_event.is_set():
        try:
            task_msg = task_queue.get(timeout=1.0)
            if task_msg is None:
                continue
            
            task_id = task_msg['task_id']
            config_dict = task_msg['config_dict']
            task_timeout = task_msg.get('timeout', timeout)
            
            status_msg = {
                'type': 'status',
                'worker_id': worker_id,
                'pid': pid,
                'status': 'running',
                'current_task': task_id
            }
            try:
                result_queue.put_nowait(status_msg)
            except:
                pass
            
            start_time = time.time()
            
            try:
                result = _execute_simulation(
                    task_id, config_dict, worker_id, process, task_timeout
                )
                result_msg = {
                    'type': 'result',
                    'task_id': task_id,
                    'success': True,
                    'result': result
                }
            except Exception as e:
                logger.error(f"任务执行失败 [{task_id}]: {e}", exc_info=True)
                result_msg = {
                    'type': 'result',
                    'task_id': task_id,
                    'success': False,
                    'error': str(e)
                }
            
            elapsed = time.time() - start_time
            logger.info(f"任务 [{task_id}] 完成，耗时: {elapsed:.2f}s")
            
            try:
                result_queue.put_nowait(result_msg)
            except queue.Full:
                logger.warning(f"结果队列已满，尝试阻塞发送: {task_id}")
                result_queue.put(result_msg, timeout=5)
            
            status_msg = {
                'type': 'status',
                'worker_id': worker_id,
                'pid': pid,
                'status': 'idle',
                'current_task': None
            }
            try:
                result_queue.put_nowait(status_msg)
            except:
                pass
                
        except queue.Empty:
            continue
        except Exception as e:
            logger.error(f"工作进程错误 [{worker_id}]: {e}", exc_info=True)
            try:
                result_queue.put_nowait({
                    'type': 'status',
                    'worker_id': worker_id,
                    'pid': pid,
                    'status': 'error',
                    'error': str(e)
                })
            except:
                pass
            time.sleep(1)


def _execute_simulation(
    task_id: str,
    config_dict: Dict,
    worker_id: int,
    process: psutil.Process,
    timeout: int
) -> Dict:
    """在独立进程中执行仿真任务"""
    from .config import SimulationConfig
    from .kernel import CFDDEMSolver
    from .output import ResultExporter
    
    logger.info(f"开始执行任务: {task_id} (worker: {worker_id})")
    
    config = SimulationConfig()
    config.raw_config = config_dict
    config._parse_config()
    
    solver = CFDDEMSolver(config)
    
    def progress_callback(progress: float, state):
        cpu_percent = process.cpu_percent()
        memory_mb = process.memory_info().rss / (1024 * 1024)
        
        if progress > 0 and state.current_step % 100 == 0:
            logger.debug(f"任务 [{task_id}] 进度: {progress*100:.1f}%, "
                        f"CPU: {cpu_percent:.1f}%, 内存: {memory_mb:.1f}MB")
    
    start_time = time.time()
    
    state = solver.run(progress_callback=progress_callback)
    
    elapsed = time.time() - start_time
    if elapsed > timeout:
        logger.warning(f"任务 [{task_id}] 执行超时")
    
    exporter = ResultExporter(config)
    result_path = exporter.export_all(state, task_id=task_id)
    
    return {
        'result_path': result_path,
        'total_steps': state.total_steps,
        'collision_count': state.collision_count,
        'energy_kinetic': state.energy_kinetic,
        'energy_potential': state.energy_potential,
        'elapsed_time': elapsed
    }


class TaskScheduler:
    def __init__(self, max_workers: Optional[int] = None, task_timeout: int = 3600):
        import multiprocessing
        multiprocessing.freeze_support()
        
        self.max_workers = max_workers or max(1, mp.cpu_count() - 1)
        self.task_timeout = task_timeout
        
        self.task_queue = Queue(maxsize=1000)
        self.result_queue = Queue(maxsize=1000)
        self.stop_event = Event()
        
        self.tasks: Dict[str, Dict] = {}
        self.worker_processes: List[Process] = []
        self.workers: Dict[int, WorkerInfo] = {}
        
        self.callbacks: Dict[str, List[Callable]] = {
            'task_started': [],
            'task_completed': [],
            'task_failed': [],
            'task_progress': [],
            'worker_status': []
        }
        
        self._monitor_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._is_running = False
        
        logger.info(f"任务调度器初始化，最大工作进程数: {self.max_workers}")
    
    def register_callback(self, event: str, callback: Callable) -> None:
        with self._lock:
            if event in self.callbacks:
                self.callbacks[event].append(callback)
    
    def _trigger_callbacks(self, event: str, **kwargs) -> None:
        with self._lock:
            callbacks = list(self.callbacks.get(event, []))
        
        for callback in callbacks:
            try:
                callback(**kwargs)
            except Exception as e:
                logger.error(f"回调执行失败 [{event}]: {e}")
    
    def start(self) -> None:
        if self._is_running:
            return
        
        self.stop_event.clear()
        
        for i in range(self.max_workers):
            p = Process(
                target=_worker_process,
                args=(i, self.task_queue, self.result_queue, 
                      self.stop_event, self.task_timeout),
                daemon=True
            )
            p.start()
            self.worker_processes.append(p)
            
            self.workers[i] = WorkerInfo(
                worker_id=i,
                status='starting'
            )
        
        self._is_running = True
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()
        
        logger.info("任务调度器已启动")
    
    def stop(self, wait: bool = True, force: bool = False) -> None:
        if not self._is_running:
            return
        
        logger.info("正在停止任务调度器...")
        
        self.stop_event.set()
        
        for _ in range(self.max_workers):
            try:
                self.task_queue.put_nowait(None)
            except:
                pass
        
        if force:
            for p in self.worker_processes:
                if p.is_alive():
                    p.terminate()
        elif wait:
            for p in self.worker_processes:
                p.join(timeout=10)
                if p.is_alive():
                    p.terminate()
        
        self.worker_processes.clear()
        self._is_running = False
        
        while not self.task_queue.empty():
            try:
                self.task_queue.get_nowait()
            except:
                break
        
        while not self.result_queue.empty():
            try:
                self.result_queue.get_nowait()
            except:
                break
        
        logger.info("任务调度器已停止")
    
    def _monitor_loop(self) -> None:
        while self._is_running:
            try:
                processed = 0
                max_process = 50
                
                while processed < max_process and not self.result_queue.empty():
                    try:
                        msg = self.result_queue.get_nowait()
                        self._handle_message(msg)
                        processed += 1
                    except queue.Empty:
                        break
                
                time.sleep(0.1)
                
            except Exception as e:
                logger.error(f"监控循环错误: {e}", exc_info=True)
                time.sleep(1)
    
    def _handle_message(self, msg: Dict) -> None:
        msg_type = msg.get('type')
        
        if msg_type == 'status':
            self._handle_status_message(msg)
        elif msg_type == 'result':
            self._handle_result_message(msg)
    
    def _handle_status_message(self, msg: Dict) -> None:
        worker_id = msg.get('worker_id')
        if worker_id not in self.workers:
            return
        
        worker = self.workers[worker_id]
        worker.pid = msg.get('pid', worker.pid)
        worker.status = msg.get('status', worker.status)
        worker.current_task = msg.get('current_task')
        
        if worker.status == 'running' and worker.current_task:
            task_id = worker.current_task
            if task_id in self.tasks:
                with self._lock:
                    self.tasks[task_id]['status'] = TaskStatus.RUNNING
                    self.tasks[task_id]['started_at'] = datetime.now()
                self._trigger_callbacks('task_started', task_id=task_id)
        
        self._trigger_callbacks('worker_status', workers=dict(self.workers))
    
    def _handle_result_message(self, msg: Dict) -> None:
        task_id = msg.get('task_id')
        
        if task_id not in self.tasks:
            return
        
        with self._lock:
            task = self.tasks[task_id]
        
        if msg.get('success'):
            task['status'] = TaskStatus.COMPLETED
            task['completed_at'] = datetime.now()
            task['result'] = msg.get('result', {})
            task['progress'] = 1.0
            self._trigger_callbacks(
                'task_completed', 
                task_id=task_id, 
                result=msg.get('result')
            )
            logger.info(f"任务完成: {task_id}")
        else:
            task['status'] = TaskStatus.FAILED
            task['completed_at'] = datetime.now()
            task['error'] = msg.get('error', 'Unknown error')
            self._trigger_callbacks(
                'task_failed', 
                task_id=task_id, 
                error=msg.get('error')
            )
            logger.error(f"任务失败: {task_id}, 错误: {msg.get('error')}")
    
    def submit_task(
        self,
        config,
        name: str = "",
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: Optional[int] = None
    ) -> str:
        task_id = str(uuid.uuid4())
        
        if hasattr(config, 'to_dict'):
            config_dict = config.to_dict()
        elif isinstance(config, dict):
            config_dict = config
        else:
            raise ValueError("config必须是SimulationConfig对象或字典")
        
        task_msg = {
            'task_id': task_id,
            'config_dict': config_dict,
            'priority': priority.value,
            'timeout': timeout or self.task_timeout
        }
        
        task_info = {
            'task_id': task_id,
            'name': name or f"task_{task_id[:8]}",
            'status': TaskStatus.QUEUED,
            'priority': priority,
            'created_at': datetime.now(),
            'started_at': None,
            'completed_at': None,
            'progress': 0.0,
            'result': None,
            'error': None
        }
        
        with self._lock:
            self.tasks[task_id] = task_info
        
        try:
            self.task_queue.put(task_msg, timeout=10)
            logger.info(f"任务已提交: {task_id}, 优先级: {priority.name}")
            return task_id
        except queue.Full:
            with self._lock:
                self.tasks[task_id]['status'] = TaskStatus.FAILED
            logger.error(f"任务队列已满，无法提交: {task_id}")
            raise RuntimeError("任务队列已满")
    
    def get_task_status(self, task_id: str) -> Optional[Dict]:
        with self._lock:
            return self.tasks.get(task_id)
    
    def get_all_tasks(self) -> List[Dict]:
        with self._lock:
            return list(self.tasks.values())
    
    def get_tasks_by_status(self, status: TaskStatus) -> List[Dict]:
        with self._lock:
            return [t for t in self.tasks.values() if t.get('status') == status]
    
    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self.tasks:
                return False
            
            task = self.tasks[task_id]
            if task['status'] in [TaskStatus.QUEUED, TaskStatus.PENDING]:
                task['status'] = TaskStatus.CANCELLED
                logger.info(f"任务已取消: {task_id}")
                return True
        
        logger.warning(f"无法取消正在运行的任务: {task_id}")
        return False
    
    def get_worker_info(self) -> List[WorkerInfo]:
        with self._lock:
            return list(self.workers.values())
    
    def get_queue_size(self) -> int:
        try:
            return self.task_queue.qsize()
        except NotImplementedError:
            return 0
    
    def wait_for_completion(
        self, 
        task_id: str, 
        timeout: Optional[float] = None,
        poll_interval: float = 0.5
    ) -> Optional[Dict]:
        start_time = time.time()
        
        while True:
            with self._lock:
                task = self.tasks.get(task_id)
            
            if not task:
                return None
            
            status = task.get('status')
            if status in [
                TaskStatus.COMPLETED,
                TaskStatus.FAILED,
                TaskStatus.CANCELLED,
                TaskStatus.TIMEOUT
            ]:
                return task
            
            if timeout is not None:
                elapsed = time.time() - start_time
                if elapsed > timeout:
                    return None
            
            time.sleep(poll_interval)
    
    def get_statistics(self) -> Dict[str, Any]:
        with self._lock:
            status_counts = {status: 0 for status in TaskStatus}
            for task in self.tasks.values():
                status = task.get('status')
                if status in status_counts:
                    status_counts[status] += 1
        
        return {
            'total_tasks': len(self.tasks),
            'status_counts': {k.name: v for k, v in status_counts.items()},
            'active_workers': sum(1 for w in self.workers.values() if w.status == 'running'),
            'idle_workers': sum(1 for w in self.workers.values() if w.status == 'idle'),
            'queue_size': self.get_queue_size()
        }
