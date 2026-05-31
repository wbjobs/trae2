import asyncio
import hashlib
import time
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import numpy as np
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential
import redis

from config import settings


@dataclass
class EmbeddingResult:
    text: str
    embedding: np.ndarray
    embedding_hash: str
    cache_hit: bool = False
    inference_time_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "embedding": self.embedding.tolist(),
            "embedding_hash": self.embedding_hash,
            "cache_hit": self.cache_hit,
            "inference_time_ms": round(self.inference_time_ms, 2),
        }


@dataclass
class PerformanceMetrics:
    total_requests: int = 0
    cache_hits: int = 0
    total_inference_time_ms: float = 0.0
    model_load_time_ms: float = 0.0
    batch_processing_count: int = 0
    average_batch_size: float = 0.0

    def cache_hit_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.cache_hits / self.total_requests

    def average_inference_time(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.total_inference_time_ms / self.total_requests


class EmbeddingService:
    _instance = None
    _model = None
    _onnx_model = None
    _tokenizer = None
    _redis_client: Optional[redis.Redis] = None
    _thread_pool: Optional[ThreadPoolExecutor] = None
    _metrics: PerformanceMetrics = PerformanceMetrics()
    _model_loaded: bool = False
    _onnx_enabled: bool = False
    _local_cache: Dict[str, np.ndarray] = {}
    _local_cache_max_size: int = 10000

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self._cache_prefix = "embedding:"
        self._local_cache_prefix = "local:"
        self._embedding_dimension = settings.EMBEDDING_DIMENSION
        self._max_seq_length = settings.MAX_SEQ_LENGTH
        self._device = settings.DEVICE
        self._batch_size = settings.EMBEDDING_BATCH_SIZE
        self._onnx_enabled = getattr(settings, 'ENABLE_ONNX_OPTIMIZATION', False)

        self._init_redis()
        self._init_thread_pool()
        logger.info(
            f"EmbeddingService initialized with model: {settings.EMBEDDING_MODEL_NAME}, "
            f"device: {self._device}, ONNX: {self._onnx_enabled}"
        )

    def _init_redis(self):
        try:
            pool = redis.ConnectionPool(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                db=settings.REDIS_DB,
                password=settings.REDIS_PASSWORD,
                decode_responses=False,
                socket_timeout=2,
                socket_connect_timeout=2,
                max_connections=50,
            )
            self._redis_client = redis.Redis(connection_pool=pool)
            self._redis_client.ping()
            logger.info("Redis connection pool established for embedding cache")
        except Exception as e:
            logger.warning(f"Failed to connect to Redis, cache disabled: {e}")
            self._redis_client = None

    def _init_thread_pool(self):
        max_workers = getattr(settings, 'EMBEDDING_THREAD_POOL_SIZE', 4)
        self._thread_pool = ThreadPoolExecutor(max_workers=max_workers)
        logger.info(f"Thread pool initialized with {max_workers} workers")

    def _load_model(self):
        if self._model is not None and self._model_loaded:
            return self._model

        load_start = time.time()
        try:
            from sentence_transformers import SentenceTransformer

            logger.info(f"Loading embedding model: {settings.EMBEDDING_MODEL_NAME}")

            model_kwargs = {
                'device': self._device,
                'trust_remote_code': True,
            }

            if self._onnx_enabled:
                try:
                    self._model = self._load_onnx_model()
                    if self._model is not None:
                        self._model_loaded = True
                        load_time = (time.time() - load_start) * 1000
                        self._metrics.model_load_time_ms = load_time
                        logger.info(f"ONNX model loaded successfully in {load_time:.2f}ms")
                        return self._model
                except Exception as e:
                    logger.warning(f"ONNX model loading failed, falling back to PyTorch: {e}")

            self._model = SentenceTransformer(
                settings.EMBEDDING_MODEL_NAME,
                **model_kwargs,
            )

            if self._device == 'cuda':
                try:
                    import torch
                    self._model = self._model.to(torch.device('cuda'))
                    logger.info("Model moved to CUDA device")
                except Exception as e:
                    logger.warning(f"Failed to move model to CUDA: {e}")

            self._model.eval()

            try:
                import torch
                if hasattr(torch, 'compile') and self._device == 'cuda':
                    self._model = torch.compile(self._model, mode='max-autotune')
                    logger.info("Model compiled with torch.compile")
            except Exception as e:
                logger.debug(f"torch.compile not available: {e}")

            self._model_loaded = True
            load_time = (time.time() - load_start) * 1000
            self._metrics.model_load_time_ms = load_time
            logger.info(f"Embedding model loaded successfully in {load_time:.2f}ms")

        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise RuntimeError(f"Failed to load embedding model: {e}")

        return self._model

    def _load_onnx_model(self):
        try:
            from optimum.onnxruntime import ORTModelForFeatureExtraction
            from transformers import AutoTokenizer

            logger.info("Attempting to load ONNX optimized model")

            self._tokenizer = AutoTokenizer.from_pretrained(settings.EMBEDDING_MODEL_NAME)
            self._onnx_model = ORTModelForFeatureExtraction.from_pretrained(
                settings.EMBEDDING_MODEL_NAME,
                export=True,
                provider="CUDAExecutionProvider" if self._device == "cuda" else "CPUExecutionProvider",
            )

            class ONNXEmbeddingModel:
                def __init__(self, tokenizer, model, max_seq_length):
                    self.tokenizer = tokenizer
                    self.model = model
                    self.max_seq_length = max_seq_length

                def encode(self, texts, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False):
                    if isinstance(texts, str):
                        texts = [texts]

                    all_embeddings = []
                    batch_size = 32

                    for i in range(0, len(texts), batch_size):
                        batch = texts[i:i + batch_size]
                        inputs = self.tokenizer(
                            batch,
                            padding=True,
                            truncation=True,
                            max_length=self.max_seq_length,
                            return_tensors="pt",
                        )
                        outputs = self.model(**inputs)
                        embeddings = outputs.last_hidden_state.mean(dim=1)
                        if normalize_embeddings:
                            embeddings = embeddings / embeddings.norm(dim=1, keepdim=True)
                        if convert_to_numpy:
                            embeddings = embeddings.cpu().numpy()
                        all_embeddings.append(embeddings)

                    import numpy as np
                    return np.concatenate(all_embeddings, axis=0) if len(all_embeddings) > 1 else all_embeddings[0]

            return ONNXEmbeddingModel(self._tokenizer, self._onnx_model, self._max_seq_length)

        except Exception as e:
            logger.warning(f"ONNX model loading failed: {e}")
            return None

    @staticmethod
    def _get_text_hash(text: str) -> str:
        return hashlib.md5(text.encode("utf-8")).hexdigest()

    def _get_from_local_cache(self, text_hash: str) -> Optional[np.ndarray]:
        return self._local_cache.get(f"{self._local_cache_prefix}{text_hash}")

    def _save_to_local_cache(self, text_hash: str, embedding: np.ndarray):
        if len(self._local_cache) >= self._local_cache_max_size:
            old_keys = list(self._local_cache.keys())[:100]
            for k in old_keys:
                del self._local_cache[k]
        self._local_cache[f"{self._local_cache_prefix}{text_hash}"] = embedding

    def _get_from_cache(self, text_hash: str) -> Optional[np.ndarray]:
        local_cached = self._get_from_local_cache(text_hash)
        if local_cached is not None:
            return local_cached

        if self._redis_client is None:
            return None
        try:
            cache_key = f"{self._cache_prefix}{text_hash}"
            cached = self._redis_client.get(cache_key)
            if cached:
                embedding = np.frombuffer(cached, dtype=np.float32)
                self._save_to_local_cache(text_hash, embedding)
                return embedding
        except Exception as e:
            logger.debug(f"Redis cache retrieval failed: {e}")
        return None

    def _save_to_cache(self, text_hash: str, embedding: np.ndarray):
        self._save_to_local_cache(text_hash, embedding)

        if self._redis_client is None:
            return
        try:
            cache_key = f"{self._cache_prefix}{text_hash}"
            self._redis_client.setex(
                cache_key,
                86400 * 7,
                embedding.astype(np.float32).tobytes(),
            )
        except Exception as e:
            logger.debug(f"Redis cache save failed: {e}")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def encode_text(self, text: str, use_cache: bool = True) -> EmbeddingResult:
        text = text.strip()
        if not text:
            raise ValueError("Empty text provided")

        self._metrics.total_requests += 1
        text_hash = self._get_text_hash(text)

        if use_cache:
            cached_embedding = self._get_from_cache(text_hash)
            if cached_embedding is not None:
                self._metrics.cache_hits += 1
                logger.debug(f"Cache hit for text hash: {text_hash}")
                return EmbeddingResult(
                    text=text,
                    embedding=cached_embedding,
                    embedding_hash=text_hash,
                    cache_hit=True,
                )

        model = self._load_model()
        start_time = time.time()

        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(
            self._thread_pool,
            lambda: model.encode(
                text,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            ),
        )

        inference_time = (time.time() - start_time) * 1000
        self._metrics.total_inference_time_ms += inference_time

        embedding = np.asarray(embedding, dtype=np.float32)
        if embedding.ndim > 1:
            embedding = embedding.reshape(-1)

        if use_cache:
            self._save_to_cache(text_hash, embedding)

        return EmbeddingResult(
            text=text,
            embedding=embedding,
            embedding_hash=text_hash,
            cache_hit=False,
            inference_time_ms=inference_time,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def encode_batch(
        self,
        texts: List[str],
        use_cache: bool = True,
        batch_size: Optional[int] = None,
    ) -> List[EmbeddingResult]:
        texts = [t.strip() for t in texts if t.strip()]
        if not texts:
            return []

        batch_size = batch_size or self._batch_size
        self._metrics.total_requests += len(texts)
        self._metrics.batch_processing_count += 1
        self._metrics.average_batch_size = (
            (self._metrics.average_batch_size * (self._metrics.batch_processing_count - 1) + len(texts))
            / self._metrics.batch_processing_count
        )

        results: List[EmbeddingResult] = []
        uncached_texts: List[str] = []
        uncached_indices: List[int] = []

        if use_cache:
            for i, text in enumerate(texts):
                text_hash = self._get_text_hash(text)
                cached_embedding = self._get_from_cache(text_hash)
                if cached_embedding is not None:
                    self._metrics.cache_hits += 1
                    results.append(
                        EmbeddingResult(
                            text=text,
                            embedding=cached_embedding,
                            embedding_hash=text_hash,
                            cache_hit=True,
                        )
                    )
                else:
                    uncached_texts.append(text)
                    uncached_indices.append(i)
        else:
            uncached_texts = texts
            uncached_indices = list(range(len(texts)))

        if uncached_texts:
            model = self._load_model()
            loop = asyncio.get_event_loop()

            new_results: List[EmbeddingResult] = []
            total_inference_time = 0.0

            for batch_start in range(0, len(uncached_texts), batch_size):
                batch_end = min(batch_start + batch_size, len(uncached_texts))
                batch = uncached_texts[batch_start:batch_end]

                batch_start_time = time.time()
                embeddings = await loop.run_in_executor(
                    self._thread_pool,
                    lambda b=batch: model.encode(
                        b,
                        convert_to_numpy=True,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    ),
                )
                batch_inference_time = (time.time() - batch_start_time) * 1000
                total_inference_time += batch_inference_time

                embeddings = np.asarray(embeddings, dtype=np.float32)

                for j in range(len(batch)):
                    text = batch[j]
                    embedding = embeddings[j]
                    text_hash = self._get_text_hash(text)

                    if use_cache:
                        self._save_to_cache(text_hash, embedding)

                    new_results.append(
                        EmbeddingResult(
                            text=text,
                            embedding=embedding,
                            embedding_hash=text_hash,
                            cache_hit=False,
                            inference_time_ms=batch_inference_time / len(batch),
                        )
                    )

            self._metrics.total_inference_time_ms += total_inference_time

            all_results = [None] * len(texts)
            for i, result in enumerate(results):
                all_results[i] = result
            for idx, result in zip(uncached_indices, new_results):
                all_results[idx] = result

            results = [r for r in all_results if r is not None]

        logger.info(
            f"Encoded {len(results)} texts, "
            f"cache hits: {sum(1 for r in results if r.cache_hit)}, "
            f"avg inference time: {self._metrics.average_inference_time():.2f}ms"
        )
        return results

    @staticmethod
    def cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
        if v1.ndim == 1:
            v1 = v1.reshape(1, -1)
        if v2.ndim == 1:
            v2 = v2.reshape(-1, 1)
        return float(np.dot(v1, v2).item())

    @staticmethod
    def cosine_similarity_matrix(v1: np.ndarray, v2: np.ndarray) -> np.ndarray:
        return np.dot(v1, v2.T)

    async def encode_paragraphs(
        self,
        paragraphs: List[str],
        use_cache: bool = True,
        max_paragraphs: Optional[int] = None,
    ) -> List[EmbeddingResult]:
        if not paragraphs:
            return []

        max_paragraphs = max_paragraphs or getattr(settings, 'MAX_PARAGRAPHS_FOR_EMBEDDING', 30)
        if len(paragraphs) > max_paragraphs:
            logger.info(
                f"Too many paragraphs ({len(paragraphs)}), "
                f"using first {max_paragraphs} for embedding"
            )
            paragraphs = paragraphs[:max_paragraphs]

        enhanced_paragraphs = []
        for para in paragraphs:
            if len(para) > self._max_seq_length * 2:
                sentences = [s.strip() for s in para.split("。") if s.strip()]
                current_chunk = ""
                for sentence in sentences:
                    if len(current_chunk) + len(sentence) < self._max_seq_length * 1.5:
                        current_chunk += sentence + "。"
                    else:
                        if current_chunk:
                            enhanced_paragraphs.append(current_chunk)
                        current_chunk = sentence + "。"
                if current_chunk:
                    enhanced_paragraphs.append(current_chunk)
            else:
                enhanced_paragraphs.append(para)

        return await self.encode_batch(enhanced_paragraphs, use_cache=use_cache)

    async def encode_document(
        self,
        title: str,
        paragraphs: List[str],
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        max_text_len = getattr(settings, 'MAX_TEXT_LENGTH_FOR_EMBEDDING', 2000)
        doc_text = f"{title}\n" + "\n".join(paragraphs[:10])
        doc_text = doc_text[:max_text_len]

        doc_embedding, paragraph_embeddings = await asyncio.gather(
            self.encode_text(doc_text, use_cache=use_cache),
            self.encode_paragraphs(paragraphs, use_cache=use_cache),
        )

        return {
            "document_embedding": doc_embedding,
            "paragraph_embeddings": paragraph_embeddings,
        }

    def warmup(self, num_samples: int = 5):
        logger.info("Warming up embedding service...")
        try:
            self._load_model()

            warmup_texts = [
                "法律条文检索系统预热",
                "合同违约损害赔偿责任认定",
                "民事诉讼证据规则适用",
                "劳动合同解除经济补偿金计算",
                "知识产权侵权损害赔偿标准",
            ] * num_samples

            import asyncio
            asyncio.run(self.encode_batch(warmup_texts, use_cache=False))

            logger.info(
                f"Embedding service warmup completed. "
                f"Model load time: {self._metrics.model_load_time_ms:.2f}ms"
            )
        except Exception as e:
            logger.error(f"Embedding service warmup failed: {e}")

    def get_performance_metrics(self) -> Dict[str, Any]:
        return {
            "total_requests": self._metrics.total_requests,
            "cache_hits": self._metrics.cache_hits,
            "cache_hit_rate": round(self._metrics.cache_hit_rate(), 4),
            "total_inference_time_ms": round(self._metrics.total_inference_time_ms, 2),
            "average_inference_time_ms": round(self._metrics.average_inference_time(), 2),
            "model_load_time_ms": round(self._metrics.model_load_time_ms, 2),
            "batch_processing_count": self._metrics.batch_processing_count,
            "average_batch_size": round(self._metrics.average_batch_size, 2),
            "local_cache_size": len(self._local_cache),
            "onnx_enabled": self._onnx_enabled,
            "device": self._device,
        }

    def clear_local_cache(self):
        self._local_cache.clear()
        logger.info("Local embedding cache cleared")

    def reset_metrics(self):
        self._metrics = PerformanceMetrics()
        logger.info("Performance metrics reset")
