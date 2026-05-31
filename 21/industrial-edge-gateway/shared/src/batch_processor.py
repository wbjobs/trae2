"""
批量数据处理器 - 优化大吞吐量数据传输延迟
提供批量收集、异步处理、数据压缩等功能
"""
import threading
import queue
import time
import json
import gzip
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from shared.src.models import DataPoint
from shared.src.logger import get_logger

logger = get_logger("batch_processor")


@dataclass
class BatchItem:
    """批次数据项"""
    data: Any
    timestamp: float = field(default_factory=time.time)
    priority: int = 5
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BatchResult:
    """批次处理结果"""
    success: bool
    processed_count: int
    failed_count: int
    total_latency_ms: float
    error: Optional[str] = None


class BatchCollector:
    """
    批量数据收集器
    
    根据时间窗口或数据量自动触发批次处理，优化高吞吐量场景下的传输效率。
    """

    def __init__(
        self,
        name: str,
        handler: Callable[[List[BatchItem]], BatchResult],
        max_batch_size: int = 100,
        max_wait_time: float = 0.1,
        max_queue_size: int = 10000,
    ):
        """
        初始化批量收集器
        
        Args:
            name: 收集器名称
            handler: 批次处理函数
            max_batch_size: 单批次最大数据量
            max_wait_time: 最大等待时间（秒），超时自动触发
            max_queue_size: 队列最大容量
        """
        self.name = name
        self.handler = handler
        self.max_batch_size = max_batch_size
        self.max_wait_time = max_wait_time
        self.max_queue_size = max_queue_size
        
        self._queue: queue.Queue = queue.Queue(maxsize=max_queue_size)
        self._current_batch: List[BatchItem] = []
        self._batch_lock = threading.Lock()
        self._last_flush_time: float = time.time()
        self._running = False
        self._flush_thread: Optional[threading.Thread] = None
        
        self._stats: Dict[str, Any] = {
            "total_batches": 0,
            "total_items": 0,
            "total_success": 0,
            "total_failed": 0,
            "avg_latency_ms": 0.0,
            "dropped_items": 0,
        }
        self._stats_lock = threading.Lock()

    def start(self):
        """启动批量收集器"""
        if self._running:
            return
        
        self._running = True
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()
        logger.info(f"批量收集器 [{self.name}] 已启动 (批次大小: {self.max_batch_size}, 最大等待: {self.max_wait_time}s)")

    def stop(self, flush: bool = True):
        """停止批量收集器"""
        self._running = False
        
        if flush and self._flush_thread:
            self.flush()
        
        if self._flush_thread:
            self._flush_thread.join(timeout=2.0)
        
        logger.info(f"批量收集器 [{self.name}] 已停止")

    def submit(self, data: Any, priority: int = 5, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        提交数据到批量收集器
        
        Args:
            data: 要处理的数据
            priority: 优先级 (0-9, 0最高)
            metadata: 附加元数据
            
        Returns:
            是否提交成功
        """
        if not self._running:
            logger.warning(f"批量收集器 [{self.name}] 未启动，拒绝数据")
            return False
        
        item = BatchItem(data=data, priority=priority, metadata=metadata or {})
        
        try:
            self._queue.put_nowait(item)
            return True
        except queue.Full:
            with self._stats_lock:
                self._stats["dropped_items"] += 1
            logger.warning(f"批量收集器 [{self.name}] 队列已满，丢弃数据")
            return False

    def flush(self) -> Optional[BatchResult]:
        """立即刷新当前批次"""
        with self._batch_lock:
            if self._current_batch:
                batch = self._current_batch
                self._current_batch = []
                return self._process_batch(batch)
        return None

    def _flush_loop(self):
        """定时刷新循环"""
        while self._running:
            try:
                item = self._queue.get(timeout=0.01)
                
                with self._batch_lock:
                    self._current_batch.append(item)
                    
                    batch_size_reached = len(self._current_batch) >= self.max_batch_size
                    time_reached = (time.time() - self._last_flush_time) >= self.max_wait_time
                    
                    if batch_size_reached or time_reached:
                        batch = self._current_batch
                        self._current_batch = []
                        self._last_flush_time = time.time()
                        self._process_batch(batch)
                        
            except queue.Empty:
                with self._batch_lock:
                    if self._current_batch and (time.time() - self._last_flush_time) >= self.max_wait_time:
                        batch = self._current_batch
                        self._current_batch = []
                        self._last_flush_time = time.time()
                        self._process_batch(batch)
            except Exception as e:
                logger.error(f"批量收集器 [{self.name}] 处理异常: {e}")

    def _process_batch(self, batch: List[BatchItem]) -> Optional[BatchResult]:
        """处理批次数据"""
        if not batch:
            return None
        
        start_time = time.time()
        
        try:
            result = self.handler(batch)
            
            with self._stats_lock:
                self._stats["total_batches"] += 1
                self._stats["total_items"] += len(batch)
                self._stats["total_success"] += result.processed_count
                self._stats["total_failed"] += result.failed_count
                
                total_processed = self._stats["total_success"] + self._stats["total_failed"]
                current_latency = result.total_latency_ms
                if total_processed > 0:
                    self._stats["avg_latency_ms"] = (
                        (self._stats["avg_latency_ms"] * (total_processed - len(batch)) + current_latency)
                        / total_processed
                    )
            
            logger.debug(
                f"批次处理完成 [{self.name}]: {result.processed_count}/{len(batch)} "
                f"成功, 耗时 {result.total_latency_ms:.2f}ms"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"批次处理失败 [{self.name}]: {e}")
            
            with self._stats_lock:
                self._stats["total_batches"] += 1
                self._stats["total_items"] += len(batch)
                self._stats["total_failed"] += len(batch)
            
            return BatchResult(
                success=False,
                processed_count=0,
                failed_count=len(batch),
                total_latency_ms=(time.time() - start_time) * 1000,
                error=str(e),
            )

    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        with self._stats_lock:
            stats = self._stats.copy()
            stats["queue_size"] = self._queue.qsize()
            stats["current_batch_size"] = len(self._current_batch)
            stats["running"] = self._running
            return stats

    def clear_stats(self):
        """清除统计信息"""
        with self._stats_lock:
            self._stats = {
                "total_batches": 0,
                "total_items": 0,
                "total_success": 0,
                "total_failed": 0,
                "avg_latency_ms": 0.0,
                "dropped_items": 0,
            }


class AsyncProcessor:
    """
    异步处理器 - 使用线程池处理高并发任务
    """

    def __init__(self, name: str, max_workers: int = 4, max_queue_size: int = 1000):
        """
        初始化异步处理器
        
        Args:
            name: 处理器名称
            max_workers: 最大工作线程数
            max_queue_size: 最大队列大小
        """
        self.name = name
        self.max_workers = max_workers
        self.max_queue_size = max_queue_size
        
        self._task_queue: queue.Queue = queue.Queue(maxsize=max_queue_size)
        self._workers: List[threading.Thread] = []
        self._running = False
        self._lock = threading.Lock()
        
        self._stats: Dict[str, Any] = {
            "total_tasks": 0,
            "success_tasks": 0,
            "failed_tasks": 0,
            "avg_processing_time_ms": 0.0,
        }
        self._stats_lock = threading.Lock()

    def start(self):
        """启动异步处理器"""
        if self._running:
            return
        
        self._running = True
        
        for i in range(self.max_workers):
            worker = threading.Thread(
                target=self._worker_loop,
                args=(i,),
                daemon=True,
                name=f"AsyncProcessor-{self.name}-{i}"
            )
            worker.start()
            self._workers.append(worker)
        
        logger.info(f"异步处理器 [{self.name}] 已启动 (工作线程: {self.max_workers})")

    def stop(self, wait: bool = True):
        """停止异步处理器"""
        self._running = False
        
        if wait:
            for worker in self._workers:
                worker.join(timeout=2.0)
        
        self._workers.clear()
        logger.info(f"异步处理器 [{self.name}] 已停止")

    def submit(self, func: Callable, *args, callback: Optional[Callable] = None, **kwargs) -> bool:
        """
        提交异步任务
        
        Args:
            func: 要执行的函数
            *args: 函数参数
            callback: 完成回调函数
            **kwargs: 函数关键字参数
            
        Returns:
            是否提交成功
        """
        if not self._running:
            return False
        
        task = {
            "func": func,
            "args": args,
            "kwargs": kwargs,
            "callback": callback,
            "submit_time": time.time(),
        }
        
        try:
            self._task_queue.put_nowait(task)
            return True
        except queue.Full:
            logger.warning(f"异步处理器 [{self.name}] 任务队列已满")
            return False

    def _worker_loop(self, worker_id: int):
        """工作线程主循环"""
        while self._running:
            try:
                task = self._task_queue.get(timeout=0.1)
                
                start_time = time.time()
                success = True
                result = None
                error = None
                
                try:
                    result = task["func"](*task["args"], **task["kwargs"])
                except Exception as e:
                    success = False
                    error = e
                    logger.error(f"异步任务执行失败 [{self.name}]: {e}")
                finally:
                    processing_time = (time.time() - start_time) * 1000
                    
                    with self._stats_lock:
                        self._stats["total_tasks"] += 1
                        if success:
                            self._stats["success_tasks"] += 1
                        else:
                            self._stats["failed_tasks"] += 1
                        
                        total = self._stats["success_tasks"] + self._stats["failed_tasks"]
                        if total > 0:
                            self._stats["avg_processing_time_ms"] = (
                                (self._stats["avg_processing_time_ms"] * (total - 1) + processing_time)
                                / total
                            )
                
                if task["callback"]:
                    try:
                        task["callback"](success, result, error)
                    except Exception as e:
                        logger.error(f"异步任务回调失败 [{self.name}]: {e}")
                        
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"工作线程异常 [{self.name}]: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        with self._stats_lock:
            stats = self._stats.copy()
            stats["queue_size"] = self._task_queue.qsize()
            stats["running"] = self._running
            stats["active_workers"] = sum(1 for w in self._workers if w.is_alive())
            return stats


class DataCompressor:
    """
    数据压缩器 - 减少网络传输数据量
    """

    @staticmethod
    def compress(data: Any, compression_level: int = 6) -> bytes:
        """
        压缩数据
        
        Args:
            data: 要压缩的数据（可JSON序列化）
            compression_level: 压缩级别 (1-9, 9最高)
            
        Returns:
            压缩后的字节数据
        """
        json_data = json.dumps(data, ensure_ascii=False).encode("utf-8")
        return gzip.compress(json_data, compresslevel=compression_level)

    @staticmethod
    def decompress(compressed_data: bytes) -> Any:
        """
        解压缩数据
        
        Args:
            compressed_data: 压缩的字节数据
            
        Returns:
            解压缩后的原始数据
        """
        json_data = gzip.decompress(compressed_data)
        return json.loads(json_data.decode("utf-8"))

    @staticmethod
    def get_compression_ratio(original: Any, compressed: bytes) -> float:
        """
        计算压缩比
        
        Returns:
            压缩比 (原始大小/压缩后大小)
        """
        original_size = len(json.dumps(original, ensure_ascii=False).encode("utf-8"))
        compressed_size = len(compressed)
        return original_size / compressed_size if compressed_size > 0 else 1.0


class ConnectionPool:
    """
    连接池 - 复用连接，减少连接建立开销
    """

    def __init__(
        self,
        name: str,
        connection_factory: Callable,
        max_connections: int = 10,
        max_idle_time: float = 60.0,
    ):
        """
        初始化连接池
        
        Args:
            name: 连接池名称
            connection_factory: 连接创建工厂函数
            max_connections: 最大连接数
            max_idle_time: 最大空闲时间（秒）
        """
        self.name = name
        self.connection_factory = connection_factory
        self.max_connections = max_connections
        self.max_idle_time = max_idle_time
        
        self._available: List[Any] = []
        self._in_use: Dict[int, Any] = {}
        self._last_used: Dict[int, float] = {}
        self._lock = threading.Lock()
        self._connection_counter = 0
        
        self._stats: Dict[str, Any] = {
            "total_created": 0,
            "total_reused": 0,
            "total_failed": 0,
            "current_in_use": 0,
            "current_available": 0,
        }

    def acquire(self) -> Optional[Any]:
        """获取连接"""
        with self._lock:
            now = time.time()
            
            while self._available:
                conn = self._available.pop(0)
                last_used = self._last_used.get(id(conn), 0)
                
                if now - last_used <= self.max_idle_time:
                    conn_id = id(conn)
                    self._in_use[conn_id] = conn
                    self._stats["current_in_use"] = len(self._in_use)
                    self._stats["current_available"] = len(self._available)
                    self._stats["total_reused"] += 1
                    return conn
            
            if len(self._in_use) < self.max_connections:
                try:
                    conn = self.connection_factory()
                    conn_id = id(conn)
                    self._in_use[conn_id] = conn
                    self._last_used[conn_id] = now
                    self._stats["total_created"] += 1
                    self._stats["current_in_use"] = len(self._in_use)
                    return conn
                except Exception as e:
                    logger.error(f"创建连接失败 [{self.name}]: {e}")
                    self._stats["total_failed"] += 1
                    return None
            
            logger.warning(f"连接池 [{self.name}] 已达最大连接数")
            return None

    def release(self, conn: Any):
        """释放连接"""
        with self._lock:
            conn_id = id(conn)
            
            if conn_id in self._in_use:
                del self._in_use[conn_id]
                self._last_used[conn_id] = time.time()
                self._available.append(conn)
                self._stats["current_in_use"] = len(self._in_use)
                self._stats["current_available"] = len(self._available)

    def cleanup_expired(self):
        """清理过期连接"""
        with self._lock:
            now = time.time()
            expired = []
            
            for conn in self._available:
                last_used = self._last_used.get(id(conn), 0)
                if now - last_used > self.max_idle_time:
                    expired.append(conn)
            
            for conn in expired:
                self._available.remove(conn)
                conn_id = id(conn)
                self._last_used.pop(conn_id, None)
                
                if hasattr(conn, "close"):
                    try:
                        conn.close()
                    except Exception:
                        pass
            
            self._stats["current_available"] = len(self._available)
            
            if expired:
                logger.info(f"连接池 [{self.name}] 清理了 {len(expired)} 个过期连接")

    def get_stats(self) -> Dict[str, Any]:
        """获取连接池统计"""
        with self._lock:
            return self._stats.copy()

    def close_all(self):
        """关闭所有连接"""
        with self._lock:
            all_conns = list(self._available) + list(self._in_use.values())
            
            for conn in all_conns:
                if hasattr(conn, "close"):
                    try:
                        conn.close()
                    except Exception:
                        pass
            
            self._available.clear()
            self._in_use.clear()
            self._last_used.clear()
            
            logger.info(f"连接池 [{self.name}] 已关闭所有连接")
