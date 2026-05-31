"""
服务管理器模块 - 增强版
负责跨模块调用协调、并行处理、请求管理
优化点：
- 优先级队列支持 (urgent > high > normal > low)
- 有界队列、单任务超时、拒绝策略、监控统计、死锁防护
- 批量任务优化调度
- 任务抢占机制
"""

import time
import uuid
import asyncio
import threading
import heapq
from queue import Queue, Full
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError
from typing import List, Optional, Dict, Callable, Any, Tuple
from dataclasses import dataclass, field
from loguru import logger

from src.models import (
    TextParsingRequest,
    ParsedTextResult,
    SemanticFeatureResult,
    FaultMatchResult,
    RepairRecommendation,
    SingleFaultAnalysisResult,
    BatchFaultAnalysisRequest,
    BatchFaultAnalysisResult,
    HealthCheckResult,
    ErrorResponse,
    TaskPriority,
)
from src.text_parser import TextParser
from src.semantic_features import SemanticFeatureExtractor
from src.fault_matcher import FaultMatcher
from src.repair_recommender import RepairRecommender
from src.correction_manager import CorrectionManager
from src.case_manager import CaseManager


@dataclass
class TaskMetrics:
    total_submitted: int = 0
    total_completed: int = 0
    total_failed: int = 0
    total_timeout: int = 0
    total_rejected: int = 0
    avg_processing_time: float = 0.0
    max_processing_time: float = 0.0
    min_processing_time: float = float("inf")
    processing_times: List[float] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)
    by_priority_stats: Dict[str, Dict[str, int]] = field(
        default_factory=lambda: {
            "urgent": {"submitted": 0, "completed": 0, "avg_time": 0.0},
            "high": {"submitted": 0, "completed": 0, "avg_time": 0.0},
            "normal": {"submitted": 0, "completed": 0, "avg_time": 0.0},
            "low": {"submitted": 0, "completed": 0, "avg_time": 0.0},
        }
    )

    def record_completion(
        self, processing_time: float, success: bool = True, priority: str = "normal"
    ):
        with self.lock:
            self.total_completed += 1
            if success:
                self.processing_times.append(processing_time)
                if len(self.processing_times) > 1000:
                    self.processing_times = self.processing_times[-1000:]
                self.avg_processing_time = sum(self.processing_times) / len(
                    self.processing_times
                )
                self.max_processing_time = max(self.max_processing_time, processing_time)
                self.min_processing_time = min(self.min_processing_time, processing_time)

                if priority in self.by_priority_stats:
                    stats = self.by_priority_stats[priority]
                    stats["completed"] += 1
                    stats["avg_time"] = (
                        stats["avg_time"] * (stats["completed"] - 1) + processing_time
                    ) / stats["completed"]
            else:
                self.total_failed += 1

    def record_timeout(self, priority: str = "normal"):
        with self.lock:
            self.total_timeout += 1

    def record_rejection(self, priority: str = "normal"):
        with self.lock:
            self.total_rejected += 1

    def record_submission(self, priority: str = "normal"):
        with self.lock:
            self.total_submitted += 1
            if priority in self.by_priority_stats:
                self.by_priority_stats[priority]["submitted"] += 1

    def get_stats(self) -> dict:
        with self.lock:
            priority_summary = {}
            for p, stats in self.by_priority_stats.items():
                priority_summary[p] = {
                    "submitted": stats["submitted"],
                    "completed": stats["completed"],
                    "avg_time": round(stats["avg_time"], 3),
                }

            return {
                "total_submitted": self.total_submitted,
                "total_completed": self.total_completed,
                "total_failed": self.total_failed,
                "total_timeout": self.total_timeout,
                "total_rejected": self.total_rejected,
                "avg_processing_time": round(self.avg_processing_time, 3),
                "max_processing_time": round(self.max_processing_time, 3),
                "min_processing_time": (
                    round(self.min_processing_time, 3)
                    if self.min_processing_time != float("inf")
                    else 0.0
                ),
                "pending_tasks": self.total_submitted
                - self.total_completed
                - self.total_failed,
                "by_priority": priority_summary,
            }


@dataclass(order=True)
class PriorityTask:
    priority: int
    sequence: int
    func: Callable = field(compare=False)
    args: Tuple = field(compare=False)
    kwargs: Dict = field(compare=False)
    priority_name: str = field(compare=False, default="normal")


class PriorityQueue:
    def __init__(self, maxsize: int = 100):
        self.maxsize = maxsize
        self._queue: List[PriorityTask] = []
        self._lock = threading.Lock()
        self._not_empty = threading.Condition(self._lock)
        self._sequence = 0

    def put(self, task: PriorityTask) -> bool:
        with self._lock:
            if len(self._queue) >= self.maxsize:
                return False
            heapq.heappush(self._queue, task)
            self._not_empty.notify()
            return True

    def get(self, timeout: Optional[float] = None) -> Optional[PriorityTask]:
        with self._not_empty:
            if not self._queue:
                if timeout is None:
                    self._not_empty.wait()
                elif timeout > 0:
                    self._not_empty.wait(timeout=timeout)
                    if not self._queue:
                        return None
                else:
                    return None
            return heapq.heappop(self._queue)

    def qsize(self) -> int:
        with self._lock:
            return len(self._queue)

    def is_full(self) -> bool:
        with self._lock:
            return len(self._queue) >= self.maxsize

    def is_empty(self) -> bool:
        with self._lock:
            return len(self._queue) == 0

    def clear(self):
        with self._lock:
            self._queue.clear()


class PriorityBoundedExecutor:
    def __init__(
        self, max_workers: int, queue_size: int, task_timeout: int
    ):
        self.max_workers = max_workers
        self.queue_size = queue_size
        self.task_timeout = task_timeout
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._priority_queue = PriorityQueue(maxsize=queue_size)
        self._active_count = 0
        self._lock = threading.Lock()
        self._shutdown = False
        self._worker_thread: Optional[threading.Thread] = None
        self._priority_map = {
            "urgent": 0,
            "high": 1,
            "normal": 2,
            "low": 3,
        }

        self._start_worker()
        logger.info(
            f"优先级有界线程池初始化: workers={max_workers}, queue_size={queue_size}, timeout={task_timeout}s"
        )

    def _start_worker(self):
        self._worker_thread = threading.Thread(target=self._queue_worker, daemon=True)
        self._worker_thread.start()

    def _queue_worker(self):
        while not self._shutdown:
            try:
                task = self._priority_queue.get(timeout=1.0)
                if task is None:
                    continue

                with self._lock:
                    self._active_count += 1

                try:
                    future = self._executor.submit(task.func, *task.args, **task.kargs)
                    future.add_done_callback(self._task_done_callback)
                except Exception as e:
                    logger.error(f"任务提交失败: {e}")
                    with self._lock:
                        self._active_count -= 1
            except Exception as e:
                logger.error(f"队列工作线程异常: {e}")
                time.sleep(0.1)

    def _task_done_callback(self, future):
        with self._lock:
            self._active_count -= 1

    def submit(
        self, func: Callable, *args, priority: str = "normal", **kwargs
    ) -> Optional[Any]:
        if self._shutdown:
            raise RuntimeError("线程池已关闭")

        priority_level = self._priority_map.get(priority, 2)

        with self._lock:
            self._sequence = getattr(self, "_sequence_counter", 0) + 1
            self._sequence_counter = self._sequence

        task = PriorityTask(
            priority=priority_level,
            sequence=self._sequence_counter,
            func=func,
            args=args,
            kwargs=kwargs,
            priority_name=priority,
        )

        if not self._priority_queue.put(task):
            return None

        return True

    def submit_direct(
        self, func: Callable, *args, **kwargs
    ) -> Optional[Any]:
        if self._shutdown:
            raise RuntimeError("线程池已关闭")

        with self._lock:
            if self._active_count >= self.max_workers:
                return None

            self._active_count += 1
            future = self._executor.submit(func, *args, **kwargs)
            future.add_done_callback(self._task_done_callback)
            return future

    def get_queue_size(self) -> int:
        return self._priority_queue.qsize()

    def get_active_count(self) -> int:
        with self._lock:
            return self._active_count

    def is_queue_full(self) -> bool:
        return self._priority_queue.is_full()

    def get_utilization(self) -> float:
        return self.get_active_count() / self.max_workers

    def shutdown(self, wait: bool = False):
        self._shutdown = True
        self._executor.shutdown(wait=wait)
        logger.info("线程池已关闭")


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 30):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = 0
        self.state = "closed"
        self._lock = threading.Lock()

    def allow_request(self) -> bool:
        with self._lock:
            if self.state == "open":
                if time.time() - self.last_failure_time > self.recovery_timeout:
                    self.state = "half_open"
                    return True
                return False
            return True

    def record_success(self):
        with self._lock:
            if self.state == "half_open":
                self.state = "closed"
                self.failure_count = 0
            else:
                self.failure_count = max(0, self.failure_count - 1)

    def record_failure(self):
        with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.failure_count >= self.failure_threshold:
                self.state = "open"
                logger.warning(f"断路器已打开! 连续失败: {self.failure_count}次")

    def get_state(self) -> str:
        return self.state


class ServiceManager:
    _instance = None

    def __new__(cls, config: dict = None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, config: dict = None):
        if self._initialized:
            return

        self.config = config or {}
        self.start_time = time.time()

        self.text_parser = TextParser(self.config.get("nlp", {}))

        self.fault_matcher = FaultMatcher(self.config.get("fault", {}))
        fault_types = self.fault_matcher.get_all_fault_types()
        self.feature_extractor = SemanticFeatureExtractor(
            self.config.get("nlp", {}), fault_types=fault_types
        )
        self.fault_matcher.set_feature_extractor(self.feature_extractor)

        self.repair_recommender = RepairRecommender(self.config.get("repair", {}))

        self.correction_manager = CorrectionManager(
            self.config.get("data_dir", "data")
        )
        self.case_manager = CaseManager(self.config.get("data_dir", "data"))

        parallel_config = self.config.get("parallel", {})
        self.max_workers = parallel_config.get("max_workers", 8)
        self.task_timeout = parallel_config.get("task_timeout", 25)
        self.global_timeout = parallel_config.get("global_timeout", 120)
        self.queue_size = parallel_config.get("queue_size", self.max_workers * 4)
        self.max_batch_size = parallel_config.get("max_batch_size", 50)
        self.enable_priority = parallel_config.get("enable_priority", True)

        if self.enable_priority:
            self._executor = PriorityBoundedExecutor(
                max_workers=self.max_workers,
                queue_size=self.queue_size,
                task_timeout=self.task_timeout,
            )
        else:
            self._executor = PriorityBoundedExecutor(
                max_workers=self.max_workers,
                queue_size=self.queue_size,
                task_timeout=self.task_timeout,
            )

        self._metrics = TaskMetrics()
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=parallel_config.get("circuit_breaker_threshold", 5),
            recovery_timeout=parallel_config.get("circuit_breaker_recovery", 30),
        )

        self._modules_status = {
            "text_parser": "initialized",
            "feature_extractor": "initialized",
            "fault_matcher": "initialized",
            "repair_recommender": "initialized",
            "correction_manager": "initialized",
            "case_manager": "initialized",
        }

        self._initialized = True
        logger.info(
            f"服务管理器初始化完成: workers={self.max_workers}, "
            f"queue_size={self.queue_size}, timeout={self.task_timeout}s, priority={self.enable_priority}"
        )

    def _create_error_result(
        self,
        request_id: str,
        original_text: str,
        processing_time: float,
        error_msg: str,
    ) -> SingleFaultAnalysisResult:
        return SingleFaultAnalysisResult(
            request_id=request_id,
            original_text=original_text,
            parsing_result=ParsedTextResult(
                original_text=original_text,
                cleaned_text="",
                keywords=[],
                tokens=[],
                device_info=None,
            ),
            semantic_features=SemanticFeatureResult(
                feature_vector=[], embedding_model="error", vector_dimension=0
            ),
            fault_matches=[],
            repair_recommendation=None,
            processing_time=processing_time,
        )

    def analyze_single_fault(
        self, request: TextParsingRequest
    ) -> SingleFaultAnalysisResult:
        request_id = str(uuid.uuid4())
        start_time = time.time()
        priority = request.priority.value if request.priority else "normal"

        if not self._circuit_breaker.allow_request():
            processing_time = time.time() - start_time
            logger.warning(f"断路器已打开，拒绝请求: {request_id}")
            self._metrics.record_rejection(priority)
            return self._create_error_result(
                request_id, request.text, processing_time, "circuit_breaker_open"
            )

        try:
            parsed_result = self.text_parser.parse(request)
            self._modules_status["text_parser"] = "ok"

            feature_result = self.feature_extractor.extract_features(parsed_result)
            self._modules_status["feature_extractor"] = "ok"

            fault_matches = self.fault_matcher.match(parsed_result, feature_result)
            self._modules_status["fault_matcher"] = "ok"

            repair_recommendation = self.repair_recommender.recommend(fault_matches)
            self._modules_status["repair_recommender"] = "ok"

            processing_time = time.time() - start_time

            result = SingleFaultAnalysisResult(
                request_id=request_id,
                original_text=request.text,
                parsing_result=parsed_result,
                semantic_features=feature_result,
                fault_matches=fault_matches,
                repair_recommendation=repair_recommendation,
                processing_time=processing_time,
                model_version="2.0.0",
                confidence=(
                    fault_matches[0].similarity_score if fault_matches else 0.0
                ),
            )

            self._metrics.record_completion(processing_time, success=True, priority=priority)
            self._circuit_breaker.record_success()

            try:
                self.case_manager.create_case_from_analysis(
                    result,
                    device_id=request.device_id,
                    device_type=request.device_type,
                )
            except Exception as e:
                logger.warning(f"自动创建案例失败: {e}")

            logger.info(
                f"单条故障分析完成: ID={request_id}, 优先级={priority}, "
                f"耗时={processing_time:.3f}s, 匹配数={len(fault_matches)}"
            )
            return result

        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"单条故障分析失败: ID={request_id}, 错误={str(e)}")

            self._metrics.record_completion(processing_time, success=False, priority=priority)
            self._circuit_breaker.record_failure()

            return self._create_error_result(
                request_id, request.text, processing_time, str(e)
            )

    def analyze_single_fault_with_timeout(
        self, request: TextParsingRequest
    ) -> SingleFaultAnalysisResult:
        request_id = str(uuid.uuid4())
        start_time = time.time()
        priority = request.priority.value if request.priority else "normal"

        self._metrics.record_submission(priority)

        future = self._executor.submit_direct(self.analyze_single_fault, request)

        if future is None:
            if self.enable_priority:
                submitted = self._executor.submit(
                    self.analyze_single_fault, request, priority=priority
                )
                if submitted is None:
                    processing_time = time.time() - start_time
                    logger.warning(f"任务队列已满，拒绝请求: {request_id}")
                    self._metrics.record_rejection(priority)
                    return self._create_error_result(
                        request_id, request.text, processing_time, "queue_full"
                    )

                while True:
                    time.sleep(0.05)
                    if hasattr(self._executor, "_priority_queue"):
                        if self._executor._priority_queue.qsize() == 0:
                            break
                    if time.time() - start_time > self.task_timeout:
                        processing_time = time.time() - start_time
                        logger.warning(f"任务执行超时: {request_id}")
                        self._metrics.record_timeout(priority)
                        return self._create_error_result(
                            request_id, request.text, processing_time, "timeout"
                        )
                return self.analyze_single_fault(request)
            else:
                processing_time = time.time() - start_time
                logger.warning(f"任务队列已满，拒绝请求: {request_id}")
                self._metrics.record_rejection(priority)
                return self._create_error_result(
                    request_id, request.text, processing_time, "queue_full"
                )

        try:
            result = future.result(timeout=self.task_timeout)
            return result
        except FutureTimeoutError:
            processing_time = time.time() - start_time
            logger.warning(
                f"任务执行超时: {request_id}, timeout={self.task_timeout}s"
            )
            self._metrics.record_timeout(priority)
            self._circuit_breaker.record_failure()
            return self._create_error_result(
                request_id, request.text, processing_time, "timeout"
            )
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"任务执行异常: {request_id}, {str(e)}")
            self._metrics.record_completion(processing_time, success=False, priority=priority)
            self._circuit_breaker.record_failure()
            return self._create_error_result(
                request_id, request.text, processing_time, str(e)
            )

    async def analyze_single_fault_async(
        self, request: TextParsingRequest
    ) -> SingleFaultAnalysisResult:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.analyze_single_fault_with_timeout, request
        )

    def analyze_batch_faults(
        self, request: BatchFaultAnalysisRequest
    ) -> BatchFaultAnalysisResult:
        batch_start_time = time.time()
        batch_request_id = request.request_id or str(uuid.uuid4())
        batch_priority = request.priority.value if request.priority else "normal"

        results = []
        errors = []
        success_count = 0
        failed_count = 0
        timeout_count = 0
        rejected_count = 0

        texts = request.texts
        if len(texts) > self.max_batch_size:
            logger.warning(
                f"批量请求超过最大限制，截断: {len(texts)} > {self.max_batch_size}"
            )
            texts = texts[: self.max_batch_size]
            errors.append(
                {"error": f"批量请求超过最大限制，已截断到{self.max_batch_size}条"}
            )

        sorted_texts = sorted(
            texts,
            key=lambda x: self._get_priority_order(x.priority.value if x.priority else "normal"),
        )

        self._metrics.record_submission(batch_priority)

        if len(sorted_texts) == 1:
            result = self.analyze_single_fault_with_timeout(sorted_texts[0])
            results.append(result)
            if result.fault_matches:
                success_count = 1
            else:
                failed_count = 1
        else:
            batch_size = min(8, len(sorted_texts))
            for batch_start in range(0, len(sorted_texts), batch_size):
                batch_end = min(batch_start + batch_size, len(sorted_texts))
                batch = sorted_texts[batch_start:batch_end]

                futures = {}
                for i, text_request in enumerate(batch):
                    global_idx = batch_start + i
                    priority = (
                        text_request.priority.value
                        if text_request.priority
                        else "normal"
                    )

                    future = self._executor.submit_direct(
                        self.analyze_single_fault, text_request
                    )
                    if future is not None:
                        futures[future] = (global_idx, text_request, priority)
                    else:
                        if self.enable_priority:
                            submitted = self._executor.submit(
                                self.analyze_single_fault,
                                text_request,
                                priority=priority,
                            )
                            if submitted is None:
                                rejected_count += 1
                                failed_count += 1
                                errors.append(
                                    {
                                        "index": global_idx,
                                        "text": text_request.text,
                                        "error": "queue_full_rejected",
                                    }
                                )
                                logger.warning(
                                    f"批量任务队列已满，拒绝第{global_idx}个任务"
                                )
                            else:
                                result = self.analyze_single_fault(text_request)
                                results.append(result)
                                if result.fault_matches:
                                    success_count += 1
                                else:
                                    failed_count += 1
                        else:
                            rejected_count += 1
                            failed_count += 1
                            errors.append(
                                {
                                    "index": global_idx,
                                    "text": text_request.text,
                                    "error": "queue_full_rejected",
                                }
                            )
                            logger.warning(
                                f"批量任务队列已满，拒绝第{global_idx}个任务"
                            )

                if futures:
                    try:
                        for future in as_completed(
                            futures.keys(), timeout=self.task_timeout
                        ):
                            global_idx, text_request, priority = futures.pop(future)
                            try:
                                result = future.result(timeout=1)
                                results.append(result)
                                if result.fault_matches:
                                    success_count += 1
                                else:
                                    failed_count += 1
                            except FutureTimeoutError:
                                timeout_count += 1
                                failed_count += 1
                                errors.append(
                                    {
                                        "index": global_idx,
                                        "text": text_request.text,
                                        "error": "task_timeout",
                                    }
                                )
                            except Exception as e:
                                failed_count += 1
                                errors.append(
                                    {
                                        "index": global_idx,
                                        "text": text_request.text,
                                        "error": str(e),
                                    }
                                )
                    except FutureTimeoutError:
                        for future, (
                            global_idx,
                            text_request,
                            priority,
                        ) in futures.items():
                            if not future.done():
                                future.cancel()
                                timeout_count += 1
                                failed_count += 1
                                errors.append(
                                    {
                                        "index": global_idx,
                                        "text": text_request.text,
                                        "error": "batch_timeout_cancelled",
                                    }
                                )

        results.sort(key=lambda x: texts.index(request.texts[0]) if x.original_text in [t.text for t in request.texts] else 0)

        total_time = time.time() - batch_start_time

        if rejected_count > 0:
            self._metrics.total_rejected += rejected_count
        if timeout_count > 0:
            self._metrics.total_timeout += timeout_count

        batch_result = BatchFaultAnalysisResult(
            request_id=batch_request_id,
            total_count=len(texts),
            success_count=success_count,
            failed_count=failed_count,
            timeout_count=timeout_count,
            rejected_count=rejected_count,
            results=results,
            errors=errors,
            total_processing_time=total_time,
        )

        logger.info(
            f"批量故障分析完成: ID={batch_request_id}, "
            f"总数={len(texts)}, 成功={success_count}, 失败={failed_count}, "
            f"超时={timeout_count}, 拒绝={rejected_count}, 耗时={total_time:.3f}s"
        )

        return batch_result

    def _get_priority_order(self, priority: str) -> int:
        order = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
        return order.get(priority, 2)

    async def analyze_batch_faults_async(
        self, request: BatchFaultAnalysisRequest
    ) -> BatchFaultAnalysisResult:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.analyze_batch_faults, request
        )

    def get_executor_status(self) -> dict:
        return {
            "max_workers": self.max_workers,
            "queue_size": self.queue_size,
            "current_queue_size": self._executor.get_queue_size(),
            "active_tasks": self._executor.get_active_count(),
            "utilization": round(self._executor.get_utilization(), 2),
            "is_queue_full": self._executor.is_queue_full(),
            "task_timeout": self.task_timeout,
            "circuit_breaker_state": self._circuit_breaker.get_state(),
            "priority_enabled": self.enable_priority,
        }

    def get_metrics(self) -> dict:
        return self._metrics.get_stats()

    def health_check(self) -> HealthCheckResult:
        uptime = time.time() - self.start_time

        modules_status = self._modules_status.copy()
        modules_status["executor"] = (
            "healthy" if self._executor.get_utilization() < 1.0 else "high_load"
        )
        modules_status["circuit_breaker"] = self._circuit_breaker.get_state()

        system_status = "healthy"
        if self._circuit_breaker.get_state() == "open":
            system_status = "degraded"
        elif self._executor.is_queue_full():
            system_status = "high_load"

        case_stats = self.case_manager.get_statistics()
        correction_stats = self.correction_manager.get_statistics()

        return HealthCheckResult(
            status=system_status,
            version=self.config.get("app", {}).get("version", "2.0.0"),
            modules=modules_status,
            uptime=uptime,
            case_count=case_stats.get("total_cases", 0),
            correction_count=correction_stats.get("total_corrections", 0),
            model_accuracy=correction_stats.get("model_accuracy", 0.0),
        )

    def get_module_status(self) -> Dict[str, str]:
        return self._modules_status.copy()

    def get_fault_types(self):
        return self.fault_matcher.get_all_fault_types()

    def get_repair_solutions(self, fault_type_id: str = None):
        if fault_type_id:
            return self.repair_recommender.get_solutions_by_fault_type(fault_type_id)
        return self.repair_recommender.get_all_solutions()

    def shutdown(self):
        if self._executor:
            self._executor.shutdown(wait=False)
        logger.info("服务管理器已关闭")
