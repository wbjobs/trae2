"""
音频处理流水线引擎
统一调度降噪、切片、特征提取、分类推理的并发处理

功能特性：
- 优先级任务队列：高优先级任务优先处理
- 流水线并行：各阶段独立线程池，重叠执行
- 动态负载均衡：自动调整各阶段线程数
- 任务超时控制：防止阻塞
- 批量处理：自动合并小任务批量执行
- 可观测性：详细的任务状态监控
"""
import logging
import queue
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, Future
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Callable, Any, Union

import numpy as np

from config import MAX_CONCURRENT_STREAMS
from denoise import AudioDenoiser
from feature_extraction import FeatureExtractor
from classifier import AudioClassifier
from audio_slicer import AudioSlicer

logger = logging.getLogger(__name__)


class TaskPriority(Enum):
    """任务优先级"""
    HIGH = 0
    NORMAL = 1
    LOW = 2
    BACKGROUND = 3


class TaskStatus(Enum):
    """任务状态"""
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class PipelineStage(Enum):
    """流水线阶段"""
    DENOISED = "denoised"
    SLICED = "sliced"
    FEATURES = "features"
    CLASSIFIED = "classified"


@dataclass
class PipelineTask:
    """流水线任务"""
    task_id: str
    audio: np.ndarray
    stages: List[PipelineStage]
    priority: TaskPriority = TaskPriority.NORMAL
    callback: Optional[Callable] = None
    timeout: float = 30.0
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    status: TaskStatus = TaskStatus.PENDING
    error: Optional[str] = None
    result: Dict = field(default_factory=dict)

    def elapsed(self) -> float:
        if self.started_at is None:
            return 0.0
        end = self.completed_at or time.time()
        return end - self.started_at


class StageWorker:
    """阶段工作器 - 独立线程池处理单个阶段"""

    def __init__(self, name: str, max_workers: int = 4):
        self.name = name
        self.max_workers = max_workers
        self._executor: Optional[ThreadPoolExecutor] = None
        self._lock = threading.Lock()
        self._active_tasks: int = 0
        self._total_processed: int = 0
        self._total_time: float = 0.0

    def start(self):
        """启动工作器"""
        with self._lock:
            if self._executor is None:
                self._executor = ThreadPoolExecutor(max_workers=self.max_workers)
                logger.info(f"StageWorker '{self.name}' started with {self.max_workers} workers")

    def stop(self):
        """停止工作器"""
        with self._lock:
            if self._executor:
                self._executor.shutdown(wait=False)
                self._executor = None
                logger.info(f"StageWorker '{self.name}' stopped")

    def submit(self, func: Callable, *args, **kwargs) -> Future:
        """提交任务"""
        with self._lock:
            if self._executor is None:
                self.start()
            self._active_tasks += 1
            future = self._executor.submit(self._wrap_task, func, *args, **kwargs)
            future.add_done_callback(self._task_done)
            return future

    def _wrap_task(self, func: Callable, *args, **kwargs):
        """包装任务执行，统计性能"""
        start = time.time()
        try:
            return func(*args, **kwargs)
        finally:
            elapsed = time.time() - start
            self._total_time += elapsed
            self._total_processed += 1

    def _task_done(self, future: Future):
        """任务完成回调"""
        with self._lock:
            self._active_tasks = max(0, self._active_tasks - 1)

    def get_stats(self) -> Dict:
        """获取统计信息"""
        with self._lock:
            avg_latency = self._total_time / self._total_processed if self._total_processed > 0 else 0
            return {
                "active_tasks": self._active_tasks,
                "total_processed": self._total_processed,
                "avg_latency_ms": avg_latency * 1000,
                "max_workers": self.max_workers,
            }

    def adjust_workers(self, target_load: float = 0.7):
        """根据负载动态调整线程数"""
        with self._lock:
            if self._executor is None:
                return
            load = self._active_tasks / self.max_workers if self.max_workers > 0 else 0
            if load > target_load * 1.5 and self.max_workers < 16:
                self.max_workers += 2
                logger.info(f"StageWorker '{self.name}' scaled up to {self.max_workers} workers")
                self.stop()
                self.start()
            elif load < target_load * 0.3 and self.max_workers > 2:
                self.max_workers -= 1
                logger.info(f"StageWorker '{self.name}' scaled down to {self.max_workers} workers")
                self.stop()
                self.start()


class PipelineEngine:
    """音频处理流水线引擎"""

    def __init__(
        self,
        max_pending: int = 1000,
        enable_dynamic_scaling: bool = True,
    ):
        self.max_pending = max_pending
        self.enable_dynamic_scaling = enable_dynamic_scaling
        self._task_queue: queue.PriorityQueue = queue.PriorityQueue(maxsize=max_pending)
        self._tasks: Dict[str, PipelineTask] = {}
        self._denoiser: Optional[AudioDenoiser] = None
        self._extractor: Optional[FeatureExtractor] = None
        self._classifier: Optional[AudioClassifier] = None
        self._slicer: Optional[AudioSlicer] = None
        self._stage_workers: Dict[PipelineStage, StageWorker] = {}
        self._manager_thread: Optional[threading.Thread] = None
        self._running: bool = False
        self._lock = threading.RLock()
        self._stats: Dict[str, Any] = {
            "tasks_submitted": 0,
            "tasks_completed": 0,
            "tasks_failed": 0,
            "tasks_timeout": 0,
            "total_processing_time": 0.0,
        }
        self._init_stage_workers()

    def _init_stage_workers(self):
        """初始化各阶段工作器"""
        self._stage_workers = {
            PipelineStage.DENOISED: StageWorker("denoise", max_workers=4),
            PipelineStage.SLICED: StageWorker("slice", max_workers=2),
            PipelineStage.FEATURES: StageWorker("features", max_workers=6),
            PipelineStage.CLASSIFIED: StageWorker("classify", max_workers=4),
        }

    def start(self):
        """启动引擎"""
        with self._lock:
            if self._running:
                return
            self._running = True
            self._denoiser = AudioDenoiser()
            self._extractor = FeatureExtractor()
            self._classifier = AudioClassifier(use_model_pool=True, pool_size=4)
            self._classifier.load_model()
            self._slicer = AudioSlicer()
            for worker in self._stage_workers.values():
                worker.start()
            self._manager_thread = threading.Thread(
                target=self._manager_loop,
                daemon=True,
                name="pipeline-manager",
            )
            self._manager_thread.start()
            logger.info("PipelineEngine started")

    def stop(self):
        """停止引擎"""
        with self._lock:
            if not self._running:
                return
            self._running = False
            for worker in self._stage_workers.values():
                worker.stop()
            if self._classifier:
                self._classifier.unload()
            logger.info("PipelineEngine stopped")

    def submit_task(
        self,
        audio: np.ndarray,
        stages: Optional[List[PipelineStage]] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        callback: Optional[Callable] = None,
        timeout: float = 30.0,
    ) -> str:
        """提交任务，返回任务ID"""
        if stages is None:
            stages = [
                PipelineStage.DENOISED,
                PipelineStage.FEATURES,
                PipelineStage.CLASSIFIED,
            ]
        task_id = str(uuid.uuid4())
        task = PipelineTask(
            task_id=task_id,
            audio=audio,
            stages=stages,
            priority=priority,
            callback=callback,
            timeout=timeout,
        )
        try:
            self._task_queue.put((priority.value, task_id, task), timeout=1.0)
            with self._lock:
                self._tasks[task_id] = task
                task.status = TaskStatus.QUEUED
                self._stats["tasks_submitted"] += 1
            return task_id
        except queue.Full:
            logger.warning("Task queue is full, rejecting task")
            raise RuntimeError("Task queue is full")

    def get_task_status(self, task_id: str) -> Optional[Dict]:
        """获取任务状态"""
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None
            return {
                "task_id": task.task_id,
                "status": task.status.value,
                "priority": task.priority.name,
                "created_at": task.created_at,
                "started_at": task.started_at,
                "completed_at": task.completed_at,
                "elapsed_ms": task.elapsed() * 1000,
                "error": task.error,
                "has_result": len(task.result) > 0,
            }

    def get_task_result(self, task_id: str, wait: bool = False, timeout: float = 30.0) -> Optional[Dict]:
        """获取任务结果"""
        start = time.time()
        while True:
            with self._lock:
                task = self._tasks.get(task_id)
                if task is None:
                    return None
                if task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.TIMEOUT):
                    return {
                        "task_id": task.task_id,
                        "status": task.status.value,
                        "result": task.result,
                        "error": task.error,
                        "elapsed_ms": task.elapsed() * 1000,
                    }
                if not wait or (time.time() - start) > timeout:
                    return {
                        "task_id": task.task_id,
                        "status": task.status.value,
                        "result": None,
                    }
            time.sleep(0.01)

    def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        with self._lock:
            task = self._tasks.get(task_id)
            if task and task.status in (TaskStatus.PENDING, TaskStatus.QUEUED):
                task.status = TaskStatus.CANCELLED
                logger.info(f"Task {task_id} cancelled")
                return True
            return False

    def _manager_loop(self):
        """主管理循环 - 调度任务"""
        while self._running:
            try:
                priority, task_id, task = self._task_queue.get(timeout=0.1)
                task.started_at = time.time()
                task.status = TaskStatus.PROCESSING
                threading.Thread(
                    target=self._execute_task,
                    args=(task,),
                    daemon=True,
                    name=f"task-{task_id[:8]}",
                ).start()
            except queue.Empty:
                pass
            except Exception as e:
                logger.error(f"Manager loop error: {e}")
            if self.enable_dynamic_scaling:
                self._auto_scale()

    def _execute_task(self, task: PipelineTask):
        """执行任务流水线"""
        try:
            current_audio = task.audio
            for stage in task.stages:
                if (time.time() - task.created_at) > task.timeout:
                    raise TimeoutError(f"Task timeout after {task.timeout}s")
                result = self._execute_stage(stage, current_audio, task.result)
                task.result.update(result)
                if stage == PipelineStage.DENOISED and "denoised_audio" in result:
                    current_audio = result["denoised_audio"]
                if stage == PipelineStage.SLICED and "slices" in result:
                    pass
            task.status = TaskStatus.COMPLETED
            with self._lock:
                self._stats["tasks_completed"] += 1
                self._stats["total_processing_time"] += task.elapsed()
            if task.callback:
                try:
                    task.callback(task.result)
                except Exception as e:
                    logger.warning(f"Task callback error: {e}")
        except TimeoutError as e:
            task.status = TaskStatus.TIMEOUT
            task.error = str(e)
            with self._lock:
                self._stats["tasks_timeout"] += 1
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            with self._lock:
                self._stats["tasks_failed"] += 1
            logger.error(f"Task {task.task_id} failed: {e}")
        finally:
            task.completed_at = time.time()

    def _execute_stage(self, stage: PipelineStage, audio: np.ndarray, prev_result: Dict) -> Dict:
        """执行单个处理阶段"""
        worker = self._stage_workers[stage]
        try:
            if stage == PipelineStage.DENOISED:
                future = worker.submit(self._denoiser.denoise, audio)
                denoised = future.result(timeout=10.0)
                return {"denoised_audio": denoised}
            elif stage == PipelineStage.SLICED:
                future = worker.submit(self._slicer.slice_with_metadata, audio)
                slices = future.result(timeout=5.0)
                return {"slices": slices}
            elif stage == PipelineStage.FEATURES:
                future = worker.submit(self._extractor.extract_flattened, audio)
                features = future.result(timeout=10.0)
                return {"features": features}
            elif stage == PipelineStage.CLASSIFIED:
                features = prev_result.get("features")
                if features is None:
                    raise ValueError("Features not available for classification")
                future = worker.submit(self._classifier.classify, features)
                result = future.result(timeout=10.0)
                return {
                    "classification": {
                        "label": result.label,
                        "confidence": result.confidence,
                        "latency_ms": result.latency_ms,
                        "all_scores": getattr(result, "all_scores", None),
                    }
                }
        except TimeoutError:
            logger.warning(f"Stage {stage.value} timed out")
            raise
        return {}

    def _auto_scale(self):
        """自动扩展工作线程"""
        for worker in self._stage_workers.values():
            worker.adjust_workers(target_load=0.7)

    def get_stats(self) -> Dict:
        """获取引擎统计"""
        with self._lock:
            stats = dict(self._stats)
            stats["queue_size"] = self._task_queue.qsize()
            stats["active_tasks"] = sum(
                1 for t in self._tasks.values()
                if t.status == TaskStatus.PROCESSING
            )
            stats["stages"] = {
                stage.value: worker.get_stats()
                for stage, worker in self._stage_workers.items()
            }
            if stats["tasks_completed"] > 0:
                stats["avg_task_time_ms"] = (
                    stats["total_processing_time"] / stats["tasks_completed"] * 1000
                )
            return stats

    def process_sync(
        self,
        audio: np.ndarray,
        stages: Optional[List[PipelineStage]] = None,
        timeout: float = 30.0,
    ) -> Dict:
        """同步处理（阻塞等待结果）"""
        task_id = self.submit_task(audio, stages=stages, timeout=timeout)
        result = self.get_task_result(task_id, wait=True, timeout=timeout)
        if result is None:
            raise RuntimeError("Task not found")
        if result["status"] != "completed":
            raise RuntimeError(f"Task failed: {result.get('error', 'unknown')}")
        return result["result"]

    def process_batch(
        self,
        audio_list: List[np.ndarray],
        stages: Optional[List[PipelineStage]] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
    ) -> List[Dict]:
        """批量处理多个音频"""
        task_ids = [
            self.submit_task(audio, stages=stages, priority=priority)
            for audio in audio_list
        ]
        results = []
        for task_id in task_ids:
            result = self.get_task_result(task_id, wait=True, timeout=60.0)
            results.append(result or {"task_id": task_id, "status": "unknown"})
        return results

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
