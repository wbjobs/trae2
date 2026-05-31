from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
import threading
import queue
import logging
from .influxdb_storage import InfluxDBStorage
from .serializer import ResultSerializer

logger = logging.getLogger(__name__)


@dataclass
class WriteBatch:
    points: List[Dict[str, Any]] = field(default_factory=list)
    max_size: int = 1000
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def add(self, point: Dict[str, Any]) -> bool:
        self.points.append(point)
        return len(self.points) >= self.max_size
    
    def is_full(self) -> bool:
        return len(self.points) >= self.max_size
    
    def is_empty(self) -> bool:
        return len(self.points) == 0
    
    def size(self) -> int:
        return len(self.points)
    
    def clear(self) -> None:
        self.points.clear()
        self.created_at = datetime.utcnow()


class ResultWriter:
    def __init__(self, storage: Optional[InfluxDBStorage] = None,
                 serializer: Optional[ResultSerializer] = None,
                 batch_size: int = 1000,
                 flush_interval: float = 5.0):
        self.storage = storage or InfluxDBStorage()
        self.serializer = serializer or ResultSerializer()
        self._batch = WriteBatch(max_size=batch_size)
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._last_flush = datetime.utcnow()
        self._lock = threading.RLock()
        self._total_written = 0
        self._total_batches = 0
        self._write_errors = 0
    
    def write_flow_metrics(self, metrics: Dict[str, Any],
                           iteration: int, time_val: float,
                           tags: Optional[Dict[str, str]] = None,
                           shard_id: Optional[int] = None) -> bool:
        point = self.serializer.create_flow_metrics_point(
            metrics=metrics,
            iteration=iteration,
            time_val=time_val,
            tags=tags,
            shard_id=shard_id
        )
        return self.write_point(point)
    
    def write_field_stats(self, field_data: Dict[str, Any],
                          tags: Optional[Dict[str, str]] = None) -> bool:
        point = self.serializer.create_field_stats_point(
            field_data=field_data,
            tags=tags
        )
        return self.write_point(point)
    
    def write_task_event(self, task_id: str, event_type: str,
                         status: str, metadata: Optional[Dict[str, Any]] = None,
                         tags: Optional[Dict[str, str]] = None) -> bool:
        point = self.serializer.create_task_event_point(
            task_id=task_id,
            event_type=event_type,
            status=status,
            metadata=metadata,
            tags=tags
        )
        return self.write_point(point)
    
    def write_node_metrics(self, node_name: str, cpu_percent: float,
                           memory_percent: float, memory_available_gb: float,
                           active_tasks: int = 0,
                           additional_metrics: Optional[Dict[str, float]] = None,
                           tags: Optional[Dict[str, str]] = None) -> bool:
        point = self.serializer.create_node_metrics_point(
            node_name=node_name,
            cpu_percent=cpu_percent,
            memory_percent=memory_percent,
            memory_available_gb=memory_available_gb,
            active_tasks=active_tasks,
            additional_metrics=additional_metrics,
            tags=tags
        )
        return self.write_point(point)
    
    def write_point(self, point: Dict[str, Any]) -> bool:
        with self._lock:
            is_full = self._batch.add(point)
            if is_full:
                return self._flush_batch()
            return True
    
    def write_points(self, points: List[Dict[str, Any]]) -> bool:
        success = True
        for point in points:
            if not self.write_point(point):
                success = False
        return success
    
    def should_flush(self) -> bool:
        with self._lock:
            if self._batch.is_full():
                return True
            elapsed = (datetime.utcnow() - self._last_flush).total_seconds()
            return elapsed >= self._flush_interval and not self._batch.is_empty()
    
    def _flush_batch(self) -> bool:
        if self._batch.is_empty():
            return True
        try:
            points = self._batch.points
            success = self.storage.write_points(points)
            if success:
                self._total_written += len(points)
                self._total_batches += 1
            else:
                self._write_errors += 1
            self._batch.clear()
            self._last_flush = datetime.utcnow()
            return success
        except Exception as e:
            logger.error(f"Error flushing batch: {e}")
            self._write_errors += 1
            return False
    
    def flush(self) -> bool:
        with self._lock:
            return self._flush_batch()
    
    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                'total_written': self._total_written,
                'total_batches': self._total_batches,
                'write_errors': self._write_errors,
                'current_batch_size': self._batch.size(),
                'batch_max_size': self._batch_size,
                'last_flush': self._last_flush.isoformat(),
                'connected': self.storage.is_connected()
            }
    
    def close(self) -> None:
        self.flush()
        self.storage.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class AsyncResultWriter(ResultWriter):
    def __init__(self, storage: Optional[InfluxDBStorage] = None,
                 serializer: Optional[ResultSerializer] = None,
                 batch_size: int = 1000,
                 flush_interval: float = 5.0,
                 max_queue_size: int = 100000):
        super().__init__(storage, serializer, batch_size, flush_interval)
        self._queue: queue.Queue = queue.Queue(maxsize=max_queue_size)
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._on_write_error: Optional[Callable] = None
    
    def _worker(self) -> None:
        while not self._stop_event.is_set():
            try:
                point = self._queue.get(timeout=0.1)
                super().write_point(point)
                if self.should_flush():
                    self.flush()
            except queue.Empty:
                if self.should_flush():
                    self.flush()
                continue
            except Exception as e:
                logger.error(f"Error in async writer worker: {e}")
                if self._on_write_error:
                    try:
                        self._on_write_error(e)
                    except Exception:
                        pass
    
    def start(self) -> None:
        if self._worker_thread is not None and self._worker_thread.is_alive():
            return
        self._stop_event.clear()
        self._worker_thread = threading.Thread(target=self._worker, daemon=True)
        self._worker_thread.start()
        logger.info("AsyncResultWriter started")
    
    def stop(self) -> None:
        self._stop_event.set()
        if self._worker_thread:
            self._worker_thread.join(timeout=30)
            self._worker_thread = None
        self.flush()
        logger.info("AsyncResultWriter stopped")
    
    def write_point(self, point: Dict[str, Any]) -> bool:
        try:
            self._queue.put_nowait(point)
            return True
        except queue.Full:
            logger.warning("Async writer queue is full, dropping point")
            return False
    
    def write_points(self, points: List[Dict[str, Any]]) -> bool:
        success = True
        for point in points:
            if not self.write_point(point):
                success = False
        return success
    
    def flush(self) -> bool:
        result = super().flush()
        return result
    
    def get_stats(self) -> Dict[str, Any]:
        stats = super().get_stats()
        stats.update({
            'queue_size': self._queue.qsize(),
            'worker_alive': self._worker_thread.is_alive() if self._worker_thread else False,
            'stopped': self._stop_event.is_set()
        })
        return stats
    
    def close(self) -> None:
        self.stop()
        super().close()
    
    def __enter__(self):
        self.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
