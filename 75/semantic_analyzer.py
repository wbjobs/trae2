import asyncio
import hashlib
import math
import re
from collections import Counter
from typing import Optional

import jieba
import jieba.analyse

from config import get_settings
from logger import setup_logger
from models import SemanticResult
from data_init import INTENT_PATTERNS, SEVERITY_KEYWORDS

logger = setup_logger("semantic_analyzer")
settings = get_settings()


class TextPreprocessor:
    def __init__(self):
        self._stopwords = self._load_stopwords()
        self._equipment_patterns = [
            r"变压器", r"断路器", r"隔离开关", r"互感器", r"避雷器",
            r"电容器", r"电抗器", r"母线", r"电缆", r"开关柜",
            r"GIS", r"PT", r"CT", r"接地[引下]?线",
        ]
        self._location_patterns = [
            r"\d+kV", r"\d+KV",
            r"[一二三四五六七八九十]+号",
            r"[A-Z]-\d+",
            r"[\u4e00-\u9fa5]+站",
            r"[\u4e00-\u9fa5]+室",
            r"[\u4e00-\u9fa5]+区",
        ]

    def _load_stopwords(self) -> set:
        base_stopwords = {
            "的", "了", "在", "是", "我", "有", "和", "就", "不", "人",
            "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去",
            "你", "会", "着", "没有", "看", "好", "自己", "这", "他", "她",
            "吗", "吧", "啊", "呢", "嗯", "哦", "那", "么", "什么", "这个",
            "那个", "来", "过", "把", "被", "让", "给", "从", "向", "对",
            "可以", "已经", "应该", "可能", "但是", "因为", "所以", "如果",
            "然后", "或者", "而且", "还是", "不是", "没有", "比较", "非常",
        }
        return base_stopwords

    def clean_text(self, text: str) -> str:
        text = re.sub(r"[^\u4e00-\u9fa5a-zA-Z0-9\s\-/\.]", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    def segment(self, text: str) -> list[str]:
        words = jieba.lcut(text)
        return [w.strip() for w in words if w.strip() and w not in self._stopwords]

    def extract_entities(self, text: str) -> list[dict]:
        entities = []
        for pattern in self._equipment_patterns:
            matches = re.finditer(pattern, text)
            for m in matches:
                entities.append({
                    "type": "equipment",
                    "value": m.group(),
                    "start": m.start(),
                    "end": m.end(),
                })

        for pattern in self._location_patterns:
            matches = re.finditer(pattern, text)
            for m in matches:
                entities.append({
                    "type": "location",
                    "value": m.group(),
                    "start": m.start(),
                    "end": m.end(),
                })

        number_pattern = r"\d+\.?\d*\s*[℃°度兆欧ΩkgMPa]"
        for m in re.finditer(number_pattern, text):
            entities.append({
                "type": "measurement",
                "value": m.group(),
                "start": m.start(),
                "end": m.end(),
            })

        return entities


class SemanticEngine:
    def __init__(self, embedding_dim: int = 768):
        self.embedding_dim = embedding_dim or settings.SEMANTIC_EMBEDDING_DIM
        self._preprocessor = TextPreprocessor()
        self._word_vectors: dict[str, list[float]] = {}
        self._initialized = False

    def initialize(self) -> None:
        if self._initialized:
            return
        logger.info(f"Initializing semantic engine, embedding_dim={self.embedding_dim}")
        self._initialized = True
        logger.info("Semantic engine initialized successfully")

    def extract_keywords(self, text: str, top_k: int = 10) -> list[str]:
        keywords = jieba.analyse.extract_tags(text, topK=top_k, withWeight=False)
        return list(keywords)

    def extract_keywords_with_weight(self, text: str, top_k: int = 10) -> list[dict]:
        results = jieba.analyse.extract_tags(text, topK=top_k, withWeight=True)
        return [{"word": w, "weight": round(s, 4)} for w, s in results]

    def recognize_intent(self, text: str) -> tuple[str, float]:
        intent_scores: dict[str, float] = {}

        for intent, patterns in INTENT_PATTERNS.items():
            score = 0.0
            for pattern in patterns:
                count = text.count(pattern)
                if count > 0:
                    score += count * (1.0 / len(patterns))
            intent_scores[intent] = score

        if not intent_scores or max(intent_scores.values()) == 0:
            return "general_inquiry", 0.3

        best_intent = max(intent_scores, key=intent_scores.get)
        best_score = intent_scores[best_intent]
        confidence = min(0.98, 0.5 + best_score * 0.2)

        return best_intent, round(confidence, 4)

    def determine_severity(self, text: str, keywords: list[str]) -> str:
        severity_scores: dict[str, int] = {"critical": 0, "major": 0, "minor": 0, "normal": 0}
        combined = set(keywords) | set(text)

        for severity, kws in SEVERITY_KEYWORDS.items():
            for kw in kws:
                if kw in combined:
                    severity_scores[severity] += 1

        if max(severity_scores.values()) == 0:
            return "normal"

        return max(severity_scores, key=severity_scores.get)

    def compute_embedding(self, text: str) -> list[float]:
        words = self._preprocessor.segment(text)
        if not words:
            return [0.0] * self.embedding_dim

        vec = [0.0] * self.embedding_dim
        for word in words:
            if word not in self._word_vectors:
                self._word_vectors[word] = self._hash_to_vector(word)
            wv = self._word_vectors[word]
            for i in range(self.embedding_dim):
                vec[i] += wv[i]

        count = len(words)
        vec = [v / count for v in vec]

        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]

        return vec

    def _hash_to_vector(self, word: str) -> list[float]:
        h = hashlib.sha256(word.encode("utf-8")).hexdigest()
        vector = []
        for i in range(0, min(len(h), self.embedding_dim * 2), 2):
            val = int(h[i : i + 2], 16) / 255.0 - 0.5
            vector.append(val)
        while len(vector) < self.embedding_dim:
            vector.append(0.0)
        return vector[: self.embedding_dim]

    @staticmethod
    def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
        if len(vec_a) != len(vec_b) or not vec_a:
            return 0.0
        dot = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return round(dot / (norm_a * norm_b), 6)


class SemanticAnalyzerModule:
    def __init__(self, embedding_dim: Optional[int] = None):
        self._engine = SemanticEngine(embedding_dim=embedding_dim or settings.SEMANTIC_EMBEDDING_DIM)
        self._preprocessor = TextPreprocessor()
        logger.info("SemanticAnalyzer module initialized")

    async def initialize(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._engine.initialize)
        logger.info("SemanticAnalyzer module fully initialized")

    async def analyze(self, task_id: str, text: str) -> SemanticResult:
        if not text or not text.strip():
            return SemanticResult(task_id=task_id)

        cleaned = self._preprocessor.clean_text(text)
        keywords = self._engine.extract_keywords(cleaned)
        intent, intent_confidence = self._engine.recognize_intent(cleaned)
        entities = self._preprocessor.extract_entities(text)
        embedding = self._engine.compute_embedding(cleaned)
        severity = self._engine.determine_severity(cleaned, keywords)

        result = SemanticResult(
            task_id=task_id,
            intent=intent,
            intent_confidence=intent_confidence,
            keywords=keywords,
            entities=entities,
            embedding=embedding,
            severity_level=severity,
        )

        logger.info(
            f"Task {task_id}: Semantic analysis completed, "
            f"intent={intent}, severity={severity}, "
            f"keywords_count={len(keywords)}, entities_count={len(entities)}"
        )
        return result

    async def compute_similarity(self, text_a: str, text_b: str) -> float:
        loop = asyncio.get_event_loop()
        emb_a = await loop.run_in_executor(None, self._engine.compute_embedding, text_a)
        emb_b = await loop.run_in_executor(None, self._engine.compute_embedding, text_b)
        return SemanticEngine.cosine_similarity(emb_a, emb_b)

    async def batch_analyze(self, tasks: list[dict]) -> list[SemanticResult]:
        coroutines = [
            self.analyze(task["task_id"], task["text"]) for task in tasks
        ]
        results = await asyncio.gather(*coroutines, return_exceptions=True)

        processed = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Batch semantic analysis error: {r}")
                processed.append(SemanticResult(task_id="error"))
            else:
                processed.append(r)

        return processed
