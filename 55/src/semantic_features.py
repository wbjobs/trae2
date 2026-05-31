"""
语义特征计算模块 - 高性能优化版
负责文本的语义特征提取、向量计算、相似度计算
优化点：
- LRU缓存机制，避免重复计算
- 真正的批量推理，提升吞吐量
- 快速路径优化，短文本/高频文本加速
- 预计算故障类型特征
- 同义词预计算
- 向量维度一致性保证
"""

import numpy as np
import hashlib
import time
from typing import List, Optional, Dict, Tuple, Any
from collections import defaultdict
from functools import lru_cache
from loguru import logger
import threading

from src.models import SemanticFeatureResult, ParsedTextResult


class SemanticFeatureExtractor:
    def __init__(self, config: dict = None, fault_types: List = None):
        self.config = config or {}
        self.model_path = self.config.get("model_path", "./models")
        self.embedding_model_name = self.config.get(
            "embedding_model", "paraphrase-multilingual-MiniLM-L12-v2"
        )
        self.target_dimension = self.config.get("target_dimension", 384)
        self.enable_cache = self.config.get("enable_cache", True)
        self.cache_size = self.config.get("cache_size", 5000)

        self._model = None
        self._tfidf_vectorizer = None
        self._tfidf_is_trained = False
        self._model_lock = threading.Lock()

        self._cache: Dict[str, np.ndarray] = {}
        self._cache_lock = threading.Lock()
        self._cache_order: List[str] = []

        self._synonym_map = self._build_synonym_map()
        self._synonym_lookup = self._build_synonym_lookup()
        self._fault_type_embeddings: Dict[str, np.ndarray] = {}
        self._fault_type_keywords: Dict[str, List[str]] = {}

        self._init_tfidf(fault_types)

        if fault_types:
            self._precompute_fault_type_embeddings(fault_types)

    def _build_synonym_map(self) -> Dict[str, List[str]]:
        return {
            "过热": ["高温", "发烫", "温度高", "发热", "温升", "过热"],
            "轴承": ["轴承", "轴瓦", "滚珠轴承", "滚子轴承"],
            "传感器": ["传感器", "感应器", "检测器", "探头"],
            "泄漏": ["泄漏", "漏油", "渗油", "泄漏", "滴油"],
            "通信": ["通信", "通讯", "连接", "网络", "传输"],
            "驱动器": ["驱动器", "伺服", "变频器", "逆变器"],
            "压力": ["压力", "压强", "气压", "油压", "液压"],
            "温度": ["温度", "热度", "气温", "水温"],
            "报警": ["报警", "告警", "报错", "提示"],
            "卡死": ["卡死", "卡滞", "卡住", "锁死", "不转"],
            "磨损": ["磨损", "磨耗", "损耗", "磨损"],
            "异响": ["异响", "噪音", "噪声", "响声", "异常声音"],
            "过载": ["过载", "过负荷", "超载", "负载过大"],
            "短路": ["短路", "短接", "搭铁"],
            "接地": ["接地", "搭地", "漏电"],
            "接触不良": ["接触不良", "虚接", "松动", "接线松"],
            "振动": ["振动", "震动", "抖动", "晃荡"],
            "冒烟": ["冒烟", "冒烟", "有烟", "焦味"],
            "火花": ["火花", "打火", "电弧", "放电"],
            "堵塞": ["堵塞", "堵住", "不通", "阻塞"],
        }

    def _build_synonym_lookup(self) -> Dict[str, str]:
        lookup = {}
        for canonical, synonyms in self._synonym_map.items():
            for syn in synonyms:
                lookup[syn] = canonical
        return lookup

    def _init_tfidf(self, fault_types: List = None):
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer

            self._tfidf_vectorizer = TfidfVectorizer(
                max_features=2000,
                ngram_range=(1, 3),
                min_df=1,
                max_df=0.95,
                sublinear_tf=True,
            )

            if fault_types:
                self._pre_train_tfidf(fault_types)
            else:
                logger.info("TF-IDF向量化器初始化完成（待训练）")

        except ImportError:
            logger.warning("scikit-learn未安装，TF-IDF功能不可用")

    def _pre_train_tfidf(self, fault_types: List):
        if not self._tfidf_vectorizer or not fault_types:
            return

        train_texts = []
        for ft in fault_types:
            text = f"{ft.name} {ft.description} {' '.join(ft.keywords)}"
            train_texts.append(text)
            for kw in ft.keywords:
                synonyms = self._synonym_map.get(kw, [kw])
                train_texts.extend(synonyms)

        if train_texts:
            self._tfidf_vectorizer.fit(train_texts)
            self._tfidf_is_trained = True
            vocab_size = len(self._tfidf_vectorizer.vocabulary_)
            logger.info(f"TF-IDF预训练完成，词汇表大小: {vocab_size}")

    def _precompute_fault_type_embeddings(self, fault_types: List):
        logger.info("开始预计算故障类型特征...")
        for ft in fault_types:
            text = f"{ft.name} {ft.description} {' '.join(ft.keywords)}"
            embedding = self._compute_fast_embedding(text)
            self._fault_type_embeddings[ft.id] = embedding
            self._fault_type_keywords[ft.id] = ft.keywords
        logger.info(f"预计算完成，共 {len(self._fault_type_embeddings)} 个故障类型")

    def set_fault_types_for_training(self, fault_types: List):
        self._pre_train_tfidf(fault_types)
        self._precompute_fault_type_embeddings(fault_types)

    def _get_cache_key(self, text: str) -> str:
        return hashlib.md5(text.encode("utf-8")).hexdigest()

    def _get_from_cache(self, key: str) -> Optional[np.ndarray]:
        if not self.enable_cache:
            return None
        with self._cache_lock:
            if key in self._cache:
                self._cache_order.remove(key)
                self._cache_order.append(key)
                return self._cache[key].copy()
        return None

    def _set_to_cache(self, key: str, value: np.ndarray):
        if not self.enable_cache:
            return
        with self._cache_lock:
            if key in self._cache:
                self._cache_order.remove(key)
            elif len(self._cache) >= self.cache_size:
                oldest_key = self._cache_order.pop(0)
                del self._cache[oldest_key]
            self._cache[key] = value.copy()
            self._cache_order.append(key)

    def _load_embedding_model(self):
        if self._model is not None:
            return self._model

        with self._model_lock:
            if self._model is not None:
                return self._model

            try:
                from sentence_transformers import SentenceTransformer

                logger.info(f"正在加载嵌入模型: {self.embedding_model_name}")
                self._model = SentenceTransformer(self.embedding_model_name)
                logger.info("嵌入模型加载完成")
                return self._model
            except ImportError:
                logger.warning("sentence-transformers未安装，将使用TF-IDF作为备选方案")
                return None
            except Exception as e:
                logger.error(f"嵌入模型加载失败: {str(e)}，将使用TF-IDF作为备选方案")
                return None

    def _get_transformer_embedding(self, text: str) -> Optional[np.ndarray]:
        model = self._load_embedding_model()
        if model is None:
            return None
        try:
            embedding = model.encode(text, normalize_embeddings=True, show_progress_bar=False)
            return embedding
        except Exception as e:
            logger.error(f"Transformer嵌入计算失败: {str(e)}")
            return None

    def _get_transformer_embeddings_batch(
        self, texts: List[str]
    ) -> Optional[List[np.ndarray]]:
        model = self._load_embedding_model()
        if model is None:
            return None
        try:
            embeddings = model.encode(
                texts, normalize_embeddings=True, show_progress_bar=False, batch_size=32
            )
            return [emb for emb in embeddings]
        except Exception as e:
            logger.error(f"Transformer批量嵌入计算失败: {str(e)}")
            return None

    def _compute_fast_embedding(self, text: str) -> np.ndarray:
        tfidf_emb = self._get_tfidf_embedding(text)
        if tfidf_emb is not None:
            return tfidf_emb
        return np.zeros(self.target_dimension)

    def _get_tfidf_embedding(self, text: str) -> Optional[np.ndarray]:
        if self._tfidf_vectorizer is None:
            return None

        try:
            if not self._tfidf_is_trained:
                self._tfidf_vectorizer.fit([text])
                self._tfidf_is_trained = True

            tfidf_matrix = self._tfidf_vectorizer.transform([text])
            vector = tfidf_matrix.toarray()[0]

            if len(vector) < self.target_dimension:
                vector = np.pad(vector, (0, self.target_dimension - len(vector)))
            elif len(vector) > self.target_dimension:
                top_indices = np.argsort(vector)[-self.target_dimension :]
                vector = vector[top_indices]

            norm = np.linalg.norm(vector)
            if norm > 0:
                vector = vector / norm

            return vector
        except Exception as e:
            logger.error(f"TF-IDF计算失败: {str(e)}")
            return None

    def _get_tfidf_embeddings_batch(
        self, texts: List[str]
    ) -> Optional[List[np.ndarray]]:
        if self._tfidf_vectorizer is None:
            return None

        try:
            if not self._tfidf_is_trained:
                self._tfidf_vectorizer.fit(texts)
                self._tfidf_is_trained = True

            tfidf_matrix = self._tfidf_vectorizer.transform(texts)
            vectors = []
            for i in range(tfidf_matrix.shape[0]):
                vector = tfidf_matrix[i].toarray()[0]
                if len(vector) < self.target_dimension:
                    vector = np.pad(vector, (0, self.target_dimension - len(vector)))
                elif len(vector) > self.target_dimension:
                    top_indices = np.argsort(vector)[-self.target_dimension :]
                    vector = vector[top_indices]
                norm = np.linalg.norm(vector)
                if norm > 0:
                    vector = vector / norm
                vectors.append(vector)
            return vectors
        except Exception as e:
            logger.error(f"TF-IDF批量计算失败: {str(e)}")
            return None

    def _expand_with_synonyms(self, keywords: List[str]) -> List[str]:
        expanded = set()
        for kw in keywords:
            canonical = self._synonym_lookup.get(kw, kw)
            expanded.add(canonical)
            expanded.update(self._synonym_map.get(canonical, [canonical]))
        return list(expanded)

    def _get_enhanced_keyword_features(
        self, keywords: List[str], tokens: List[str], text: str
    ) -> np.ndarray:
        expanded_keywords = self._expand_with_synonyms(keywords)
        all_terms = list(set(tokens + expanded_keywords))

        if not all_terms:
            return np.zeros(self.target_dimension)

        term_scores = defaultdict(float)
        text_lower = text.lower()

        for term in all_terms:
            term_lower = term.lower()
            if term in keywords:
                term_scores[term_lower] += 3.0
            elif term in expanded_keywords:
                term_scores[term_lower] += 1.5

            if term in tokens:
                term_scores[term_lower] += 1.0

            count = text_lower.count(term_lower)
            term_scores[term_lower] += min(count * 0.5, 2.0)

        vocab = sorted(all_terms)
        features = np.zeros(self.target_dimension)

        for i, term in enumerate(vocab):
            if i < self.target_dimension:
                features[i] = term_scores.get(term.lower(), 0.0)

        norm = np.linalg.norm(features)
        if norm > 0:
            features = features / norm

        return features

    def _calculate_dynamic_weights(
        self, text: str, keywords: List[str], tokens: List[str]
    ) -> Tuple[float, float, float]:
        text_length = len(text)
        keyword_count = len(keywords)

        transformer_weight = 0.5
        tfidf_weight = 0.3
        keyword_weight = 0.2

        if text_length < 50:
            transformer_weight = 0.3
            tfidf_weight = 0.3
            keyword_weight = 0.4
        elif text_length < 150:
            transformer_weight = 0.4
            tfidf_weight = 0.35
            keyword_weight = 0.25
        elif text_length > 500:
            transformer_weight = 0.6
            tfidf_weight = 0.25
            keyword_weight = 0.15

        if keyword_count >= 5:
            keyword_weight += 0.1
            transformer_weight -= 0.05
            tfidf_weight -= 0.05

        total = transformer_weight + tfidf_weight + keyword_weight
        return (
            transformer_weight / total,
            tfidf_weight / total,
            keyword_weight / total,
        )

    def extract_features(self, parsed_result: ParsedTextResult) -> SemanticFeatureResult:
        start_time = time.time()
        try:
            text = parsed_result.cleaned_text
            keywords = parsed_result.keywords
            tokens = parsed_result.tokens

            if not text:
                logger.warning("清洗后文本为空，返回零向量")
                return SemanticFeatureResult(
                    feature_vector=[0.0] * self.target_dimension,
                    embedding_model="fallback_zero",
                    vector_dimension=self.target_dimension,
                    processing_time=time.time() - start_time,
                )

            cache_key = self._get_cache_key(text)
            cached = self._get_from_cache(cache_key)
            if cached is not None:
                return SemanticFeatureResult(
                    feature_vector=cached.tolist(),
                    embedding_model="cache",
                    vector_dimension=self.target_dimension,
                    processing_time=time.time() - start_time,
                )

            transformer_emb = self._get_transformer_embedding(text)
            tfidf_emb = self._get_tfidf_embedding(text)
            keyword_emb = self._get_enhanced_keyword_features(keywords, tokens, text)

            tw, fw, kw = self._calculate_dynamic_weights(text, keywords, tokens)

            combined_vector = np.zeros(self.target_dimension)
            model_used = []

            if transformer_emb is not None:
                if len(transformer_emb) > self.target_dimension:
                    transformer_emb = transformer_emb[: self.target_dimension]
                elif len(transformer_emb) < self.target_dimension:
                    transformer_emb = np.pad(
                        transformer_emb,
                        (0, self.target_dimension - len(transformer_emb)),
                    )
                combined_vector += tw * transformer_emb
                model_used.append("transformer")

            if tfidf_emb is not None:
                combined_vector += fw * tfidf_emb
                model_used.append("tfidf")

            if keyword_emb is not None:
                combined_vector += kw * keyword_emb
                model_used.append("keyword")

            norm = np.linalg.norm(combined_vector)
            if norm > 0:
                combined_vector = combined_vector / norm

            self._set_to_cache(cache_key, combined_vector)

            embedding_model = "+".join(model_used) if model_used else "fallback_zero"

            result = SemanticFeatureResult(
                feature_vector=combined_vector.tolist(),
                embedding_model=embedding_model,
                vector_dimension=len(combined_vector),
                processing_time=time.time() - start_time,
            )

            logger.debug(
                f"语义特征提取完成: 模型={embedding_model}, "
                f"权重=({tw:.2f},{fw:.2f},{kw:.2f}), "
                f"维度={len(combined_vector)}, 耗时={result.processing_time:.4f}s"
            )
            return result

        except Exception as e:
            logger.error(f"语义特征提取失败: {str(e)}，返回零向量")
            return SemanticFeatureResult(
                feature_vector=[0.0] * self.target_dimension,
                embedding_model="error_fallback",
                vector_dimension=self.target_dimension,
                processing_time=time.time() - start_time,
            )

    def batch_extract_features(
        self, parsed_results: List[ParsedTextResult]
    ) -> List[SemanticFeatureResult]:
        start_time = time.time()
        if not parsed_results:
            return []

        if len(parsed_results) == 1:
            return [self.extract_features(parsed_results[0])]

        results: List[Optional[SemanticFeatureResult]] = [None] * len(parsed_results)
        uncached_indices: List[int] = []
        uncached_texts: List[str] = []
        uncached_parsed: List[ParsedTextResult] = []

        for i, parsed in enumerate(parsed_results):
            text = parsed.cleaned_text
            if not text:
                results[i] = SemanticFeatureResult(
                    feature_vector=[0.0] * self.target_dimension,
                    embedding_model="fallback_zero",
                    vector_dimension=self.target_dimension,
                    processing_time=0.0,
                )
                continue

            cache_key = self._get_cache_key(text)
            cached = self._get_from_cache(cache_key)
            if cached is not None:
                results[i] = SemanticFeatureResult(
                    feature_vector=cached.tolist(),
                    embedding_model="cache",
                    vector_dimension=self.target_dimension,
                    processing_time=0.001,
                )
            else:
                uncached_indices.append(i)
                uncached_texts.append(text)
                uncached_parsed.append(parsed)

        if uncached_texts:
            transformer_embs = self._get_transformer_embeddings_batch(uncached_texts)
            tfidf_embs = self._get_tfidf_embeddings_batch(uncached_texts)

            for idx, (orig_idx, parsed) in enumerate(
                zip(uncached_indices, uncached_parsed)
            ):
                text = parsed.cleaned_text
                keywords = parsed.keywords
                tokens = parsed.tokens

                tw, fw, kw_w = self._calculate_dynamic_weights(text, keywords, tokens)

                combined_vector = np.zeros(self.target_dimension)
                model_used = []

                if transformer_embs and idx < len(transformer_embs):
                    emb = transformer_embs[idx]
                    if len(emb) > self.target_dimension:
                        emb = emb[: self.target_dimension]
                    elif len(emb) < self.target_dimension:
                        emb = np.pad(emb, (0, self.target_dimension - len(emb)))
                    combined_vector += tw * emb
                    model_used.append("transformer")

                if tfidf_embs and idx < len(tfidf_embs):
                    combined_vector += fw * tfidf_embs[idx]
                    model_used.append("tfidf")

                keyword_emb = self._get_enhanced_keyword_features(keywords, tokens, text)
                combined_vector += kw_w * keyword_emb
                model_used.append("keyword")

                norm = np.linalg.norm(combined_vector)
                if norm > 0:
                    combined_vector = combined_vector / norm

                cache_key = self._get_cache_key(text)
                self._set_to_cache(cache_key, combined_vector)

                embedding_model = "+".join(model_used) if model_used else "fallback_zero"

                results[orig_idx] = SemanticFeatureResult(
                    feature_vector=combined_vector.tolist(),
                    embedding_model=embedding_model,
                    vector_dimension=len(combined_vector),
                    processing_time=time.time() - start_time,
                )

        valid_results: List[SemanticFeatureResult] = []
        for r in results:
            if r is not None:
                valid_results.append(r)
            else:
                valid_results.append(
                    SemanticFeatureResult(
                        feature_vector=[0.0] * self.target_dimension,
                        embedding_model="error_fallback",
                        vector_dimension=self.target_dimension,
                        processing_time=0.0,
                    )
                )

        logger.debug(
            f"批量特征提取完成: 总数={len(parsed_results)}, "
            f"缓存命中={len(parsed_results) - len(uncached_texts)}, "
            f"总耗时={time.time() - start_time:.4f}s"
        )
        return valid_results

    def calculate_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        try:
            v1 = np.array(vec1, dtype=np.float32)
            v2 = np.array(vec2, dtype=np.float32)

            min_len = min(len(v1), len(v2))
            v1 = v1[:min_len]
            v2 = v2[:min_len]

            norm1 = np.linalg.norm(v1)
            norm2 = np.linalg.norm(v2)

            if norm1 == 0 or norm2 == 0:
                return 0.0

            cosine_sim = np.dot(v1, v2) / (norm1 * norm2)

            magnitude_sim = 1.0 - abs(norm1 - norm2) / max(norm1, norm2)

            final_sim = 0.85 * cosine_sim + 0.15 * magnitude_sim
            return float(max(0.0, min(1.0, final_sim)))

        except Exception as e:
            logger.error(f"相似度计算失败: {str(e)}")
            return 0.0

    def calculate_weighted_similarity(
        self,
        vec1: List[float],
        vec2: List[float],
        keyword_overlap: int = 0,
        total_keywords: int = 1,
    ) -> float:
        semantic_sim = self.calculate_similarity(vec1, vec2)

        if total_keywords > 0:
            keyword_ratio = keyword_overlap / total_keywords
            keyword_bonus = keyword_ratio * 0.3
            final_sim = semantic_sim * 0.7 + keyword_bonus
        else:
            final_sim = semantic_sim

        return float(max(0.0, min(1.0, final_sim)))

    def calculate_cosine_similarity_matrix(
        self, vectors: List[List[float]]
    ) -> np.ndarray:
        try:
            matrix = np.array(vectors, dtype=np.float32)
            norms = np.linalg.norm(matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1
            normalized = matrix / norms
            similarity_matrix = np.dot(normalized, normalized.T)
            return similarity_matrix
        except Exception as e:
            logger.error(f"相似度矩阵计算失败: {str(e)}")
            return np.eye(len(vectors))

    def get_fault_type_embedding(self, fault_type_id: str) -> Optional[np.ndarray]:
        return self._fault_type_embeddings.get(fault_type_id)

    def get_cache_stats(self) -> Dict[str, Any]:
        with self._cache_lock:
            return {
                "cache_size": len(self._cache),
                "max_cache_size": self.cache_size,
                "hit_rate": 0.0,
                "enabled": self.enable_cache,
            }

    def clear_cache(self):
        with self._cache_lock:
            self._cache.clear()
            self._cache_order.clear()
        logger.info("特征缓存已清空")
