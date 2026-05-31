import asyncio
import hashlib
import time
from typing import Optional, Any, Callable
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from threading import Lock

from config import get_settings
from logger import setup_logger

logger = setup_logger("inference_cache")
settings = get_settings()


class LRUCache:
    def __init__(self, capacity: int = 10000, ttl_seconds: int = 3600):
        self.capacity = capacity
        self.ttl = ttl_seconds
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._lock = Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._cache:
                value, timestamp = self._cache[key]
                if time.time() - timestamp < self.ttl:
                    self._hits += 1
                    self._cache.move_to_end(key)
                    return value
                else:
                    del self._cache[key]
            self._misses += 1
            return None

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._cache[key] = (value, time.time())
            self._cache.move_to_end(key)
            while len(self._cache) > self.capacity:
                self._cache.popitem(last=False)

    def get_hit_rate(self) -> float:
        total = self._hits + self._misses
        if total == 0:
            return 0.0
        return self._hits / total

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0

    def stats(self) -> dict:
        return {
            "size": len(self._cache),
            "capacity": self.capacity,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self.get_hit_rate() * 100, 2),
        }


@dataclass
class BatchInferenceRequest:
    request_id: str
    inputs: Any
    future: asyncio.Future
    created_at: float = field(default_factory=time.time)


class BatchingInferenceEngine:
    def __init__(
        self,
        process_func: Callable[[list], list],
        max_batch_size: int = 32,
        max_wait_ms: int = 50,
    ):
        self._process_func = process_func
        self.max_batch_size = max_batch_size
        self.max_wait = max_wait_ms / 1000.0
        self._queue: list[BatchInferenceRequest] = []
        self._lock = asyncio.Lock()
        self._consumer_task: Optional[asyncio.Task] = None
        self._total_batches = 0
        self._total_items = 0

    async def start(self) -> None:
        if not self._consumer_task:
            self._consumer_task = asyncio.create_task(self._consumer_loop())
            logger.info(f"Batching engine started, max_batch={self.max_batch_size}, max_wait={self.max_wait}s")

    async def stop(self) -> None:
        if self._consumer_task:
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                pass
            self._consumer_task = None

    async def submit(self, inputs: Any, request_id: str = "") -> Any:
        future = asyncio.get_event_loop().create_future()
        req = BatchInferenceRequest(
            request_id=request_id or str(id(inputs)),
            inputs=inputs,
            future=future,
        )

        async with self._lock:
            self._queue.append(req)
            queue_len = len(self._queue)

        if queue_len >= self.max_batch_size:
            asyncio.create_task(self._process_batch())

        return await future

    async def _consumer_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.max_wait)
                await self._process_batch()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Batching consumer error: {e}")

    async def _process_batch(self) -> None:
        async with self._lock:
            if not self._queue:
                return
            batch = self._queue[: self.max_batch_size]
            self._queue = self._queue[self.max_batch_size :]

        if not batch:
            return

        try:
            loop = asyncio.get_event_loop()
            inputs = [req.inputs for req in batch]
            results = await loop.run_in_executor(None, self._process_func, inputs)

            self._total_batches += 1
            self._total_items += len(results)

            for req, result in zip(batch, results):
                if not req.future.done():
                    req.future.set_result(result)

        except Exception as e:
            logger.error(f"Batch processing error: {e}")
            for req in batch:
                if not req.future.done():
                    req.future.set_exception(e)

    def get_stats(self) -> dict:
        return {
            "total_batches": self._total_batches,
            "total_items": self._total_items,
            "avg_batch_size": round(self._total_items / max(1, self._total_batches), 2),
            "queue_size": len(self._queue),
        }


class PrecomputedVectorStore:
    def __init__(self, dim: int = 768):
        self.dim = dim
        self._store: dict[str, list[float]] = {}
        self._lock = Lock()
        self._warmup_done = False

    def precompute(self, texts: list[str], compute_func: Callable[[str], list[float]]) -> None:
        logger.info(f"Precomputing vectors for {len(texts)} texts...")
        for text in texts:
            key = self._make_key(text)
            if key not in self._store:
                self._store[key] = compute_func(text)
        self._warmup_done = True
        logger.info(f"Precomputed {len(self._store)} vectors")

    def get(self, text: str) -> Optional[list[float]]:
        key = self._make_key(text)
        with self._lock:
            return self._store.get(key)

    def put(self, text: str, vector: list[float]) -> None:
        key = self._make_key(text)
        with self._lock:
            self._store[key] = vector

    @staticmethod
    def _make_key(text: str) -> str:
        return hashlib.md5(text.strip().lower().encode("utf-8")).hexdigest()

    def get_stats(self) -> dict:
        return {
            "size": len(self._store),
            "dim": self.dim,
            "warmup_done": self._warmup_done,
        }


class InferenceCacheModule:
    def __init__(self):
        self._speech_cache = LRUCache(
            capacity=getattr(settings, "SPEECH_CACHE_SIZE", 5000),
            ttl_seconds=getattr(settings, "SPEECH_CACHE_TTL", 86400),
        )
        self._semantic_cache = LRUCache(
            capacity=getattr(settings, "SEMANTIC_CACHE_SIZE", 20000),
            ttl_seconds=getattr(settings, "SEMANTIC_CACHE_TTL", 86400),
        )
        self._defect_cache = LRUCache(
            capacity=getattr(settings, "DEFECT_CACHE_SIZE", 20000),
            ttl_seconds=getattr(settings, "DEFECT_CACHE_TTL", 86400),
        )
        self._vector_store = PrecomputedVectorStore(
            dim=getattr(settings, "SEMANTIC_EMBEDDING_DIM", 768)
        )
        self._semantic_batcher: Optional[BatchingInferenceEngine] = None
        self._defect_batcher: Optional[BatchingInferenceEngine] = None
        self._initialized = False
        logger.info("InferenceCache module initialized")

    def initialize(
        self,
        semantic_batch_func: Optional[Callable] = None,
        defect_batch_func: Optional[Callable] = None,
        precompute_texts: Optional[list[str]] = None,
        vector_compute_func: Optional[Callable] = None,
    ) -> None:
        if semantic_batch_func:
            self._semantic_batcher = BatchingInferenceEngine(
                process_func=semantic_batch_func,
                max_batch_size=getattr(settings, "SEMANTIC_BATCH_SIZE", 32),
                max_wait_ms=getattr(settings, "SEMANTIC_BATCH_WAIT", 50),
            )
            asyncio.create_task(self._semantic_batcher.start())

        if defect_batch_func:
            self._defect_batcher = BatchingInferenceEngine(
                process_func=defect_batch_func,
                max_batch_size=getattr(settings, "DEFECT_BATCH_SIZE", 64),
                max_wait_ms=getattr(settings, "DEFECT_BATCH_WAIT", 30),
            )
            asyncio.create_task(self._defect_batcher.start())

        if precompute_texts and vector_compute_func:
            self._vector_store.precompute(precompute_texts, vector_compute_func)

        self._initialized = True
        logger.info("InferenceCache module fully initialized")

    @staticmethod
    def _make_cache_key(prefix: str, data: Any) -> str:
        data_str = str(data) if not isinstance(data, bytes) else hashlib.md5(data).hexdigest()
        return f"{prefix}:{hashlib.md5(data_str.encode('utf-8')).hexdigest()}"

    def get_speech_cache(self, audio_hash: str):
        key = self._make_cache_key("speech", audio_hash)
        value = self._speech_cache.get(key)
        if value:
            value = dict(value)
            value["cache_hit"] = True
        return value

    def put_speech_cache(self, audio_hash: str, result: dict) -> None:
        key = self._make_cache_key("speech", audio_hash)
        self._speech_cache.put(key, result)

    def get_semantic_cache(self, text: str):
        key = self._make_cache_key("semantic", text)
        value = self._semantic_cache.get(key)
        if value:
            value = dict(value)
            value["cache_hit"] = True
        return value

    def put_semantic_cache(self, text: str, result: dict) -> None:
        key = self._make_cache_key("semantic", text)
        self._semantic_cache.put(key, result)

    def get_defect_cache(self, text: str, context: str = ""):
        key = self._make_cache_key("defect", f"{text}:{context}")
        value = self._defect_cache.get(key)
        if value:
            value = dict(value)
            value["cache_hit"] = True
        return value

    def put_defect_cache(self, text: str, result: dict, context: str = "") -> None:
        key = self._make_cache_key("defect", f"{text}:{context}")
        self._defect_cache.put(key, result)

    def get_precomputed_vector(self, text: str):
        return self._vector_store.get(text)

    def put_precomputed_vector(self, text: str, vector: list[float]) -> None:
        self._vector_store.put(text, vector)

    async def batch_semantic_inference(self, text: str, request_id: str = ""):
        if self._semantic_batcher:
            return await self._semantic_batcher.submit(text, request_id)
        return None

    async def batch_defect_inference(self, data: Any, request_id: str = ""):
        if self._defect_batcher:
            return await self._defect_batcher.submit(data, request_id)
        return None

    def get_stats(self) -> dict:
        return {
            "speech_cache": self._speech_cache.stats(),
            "semantic_cache": self._semantic_cache.stats(),
            "defect_cache": self._defect_cache.stats(),
            "vector_store": self._vector_store.get_stats(),
            "semantic_batcher": self._semantic_batcher.get_stats() if self._semantic_batcher else {},
            "defect_batcher": self._defect_batcher.get_stats() if self._defect_batcher else {},
        }

    def get_overall_hit_rate(self) -> float:
        rates = [
            self._speech_cache.get_hit_rate(),
            self._semantic_cache.get_hit_rate(),
            self._defect_cache.get_hit_rate(),
        ]
        rates = [r for r in rates if r > 0]
        return sum(rates) / len(rates) if rates else 0.0

    async def shutdown(self) -> None:
        if self._semantic_batcher:
            await self._semantic_batcher.stop()
        if self._defect_batcher:
            await self._defect_batcher.stop()
        logger.info("InferenceCache module shut down")
