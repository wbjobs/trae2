import asyncio
import json
import re
import math
import time
from collections import Counter, deque
from datetime import datetime
from enum import IntEnum
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.core import settings, log, InternalErrorException


class AICallPriority(IntEnum):
    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3


class AIRateLimiter:
    def __init__(self, max_calls: int = 30, period: float = 60.0, burst: int = 5):
        self.max_calls = max_calls
        self.period = period
        self.burst = burst
        self._timestamps: deque = deque()
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            while self._timestamps and self._timestamps[0] < now - self.period:
                self._timestamps.popleft()

            if len(self._timestamps) >= self.max_calls:
                oldest = self._timestamps[0]
                wait_time = oldest + self.period - now + 0.1
                if wait_time > 0:
                    log.warning(f"AI速率限制触发，等待 {wait_time:.1f}s")
                    await asyncio.sleep(wait_time)

            self._timestamps.append(time.monotonic())

    def get_usage(self) -> Dict[str, Any]:
        now = time.monotonic()
        recent = [ts for ts in self._timestamps if ts > now - self.period]
        return {
            "calls_in_period": len(recent),
            "max_calls": self.max_calls,
            "period_seconds": self.period,
            "remaining": max(0, self.max_calls - len(recent))
        }


class AIConcurrencyManager:
    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._priority_queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._active_count = 0
        self._total_calls = 0
        self._failed_calls = 0
        self._lock = asyncio.Lock()

    async def acquire(self, priority: AICallPriority = AICallPriority.NORMAL):
        await self._priority_queue.put((priority, time.monotonic()))
        while True:
            p, ts = self._priority_queue.get_nowait() if not self._priority_queue.empty() else (priority, time.monotonic())
            break

        await self._semaphore.acquire()
        async with self._lock:
            self._active_count += 1
            self._total_calls += 1

    async def release(self, success: bool = True):
        self._semaphore.release()
        async with self._lock:
            self._active_count -= 1
            if not success:
                self._failed_calls += 1

    def get_stats(self) -> Dict[str, Any]:
        return {
            "active_count": self._active_count,
            "max_concurrent": self.max_concurrent,
            "total_calls": self._total_calls,
            "failed_calls": self._failed_calls,
            "available_slots": self._semaphore._value
        }


class AICallLogger:
    def __init__(self, max_records: int = 1000):
        self.max_records = max_records
        self._records: deque = deque(maxlen=max_records)
        self._lock = asyncio.Lock()

    async def log_call(
        self,
        call_type: str,
        model: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        duration_ms: float = 0.0,
        success: bool = True,
        error: str = "",
        task_id: Optional[int] = None
    ):
        record = {
            "timestamp": datetime.utcnow().isoformat(),
            "call_type": call_type,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "duration_ms": round(duration_ms, 2),
            "success": success,
            "error": error[:200] if error else "",
            "task_id": task_id
        }
        async with self._lock:
            self._records.append(record)

    async def get_recent_logs(self, limit: int = 100, call_type: Optional[str] = None) -> List[Dict]:
        async with self._lock:
            records = list(self._records)
        if call_type:
            records = [r for r in records if r["call_type"] == call_type]
        return records[-limit:]

    async def get_stats(self) -> Dict[str, Any]:
        async with self._lock:
            records = list(self._records)
        if not records:
            return {"total_calls": 0, "success_rate": 0.0, "avg_duration_ms": 0.0}
        success_count = sum(1 for r in records if r["success"])
        total_duration = sum(r["duration_ms"] for r in records if r["success"])
        return {
            "total_calls": len(records),
            "success_count": success_count,
            "failed_count": len(records) - success_count,
            "success_rate": round(success_count / len(records) * 100, 2),
            "avg_duration_ms": round(total_duration / max(success_count, 1), 2),
            "total_input_tokens": sum(r["input_tokens"] for r in records),
            "total_output_tokens": sum(r["output_tokens"] for r in records)
        }


ai_rate_limiter = AIRateLimiter(max_calls=30, period=60.0, burst=5)
ai_concurrency = AIConcurrencyManager(max_concurrent=5)
ai_call_logger = AICallLogger(max_records=1000)


class LLMClient:
    def __init__(self):
        self.api_base = settings.LLM_API_BASE.rstrip("/")
        self.api_key = settings.LLM_API_KEY
        self.model = settings.LLM_MODEL
        self.embedding_model = settings.LLM_EMBEDDING_MODEL
        self.timeout = settings.LLM_TIMEOUT
        self._client = httpx.AsyncClient(timeout=self.timeout)

    async def close(self):
        await self._client.aclose()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, TimeoutError)),
        reraise=True
    )
    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stream: bool = False,
        priority: AICallPriority = AICallPriority.NORMAL,
        task_id: Optional[int] = None
    ) -> Dict[str, Any]:
        await ai_rate_limiter.acquire()
        await ai_concurrency.acquire(priority)

        start_time = time.monotonic()
        success = False
        error_msg = ""
        try:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            url = f"{self.api_base}/v1/chat/completions"
            if "localhost:11434" in self.api_base or "127.0.0.1:11434" in self.api_base:
                url = f"{self.api_base}/api/chat"
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "stream": stream,
                    "options": {
                        "temperature": temperature
                    }
                }
            else:
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": stream
                }

            log.debug(f"调用 LLM API: {url}, model: {self.model}, priority: {priority.name}")
            response = await self._client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()

            if "localhost:11434" in self.api_base or "127.0.0.1:11434" in self.api_base:
                if stream:
                    success = True
                    return result
                parsed = {
                    "choices": [{
                        "message": {
                            "content": result.get("message", {}).get("content", "")
                        }
                    }],
                    "usage": result.get("eval_count", 0)
                }
                success = True
                return parsed

            success = True
            return result

        except Exception as e:
            error_msg = str(e)
            raise
        finally:
            duration_ms = (time.monotonic() - start_time) * 1000
            await ai_concurrency.release(success)
            input_tokens = sum(len(m.get("content", "")) for m in messages) // 4
            output_tokens = 0
            await ai_call_logger.log_call(
                call_type="chat_completion",
                model=self.model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_ms=duration_ms,
                success=success,
                error=error_msg,
                task_id=task_id
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, TimeoutError)),
        reraise=True
    )
    async def create_embedding(self, text: str, task_id: Optional[int] = None) -> List[float]:
        await ai_rate_limiter.acquire()
        await ai_concurrency.acquire(AICallPriority.HIGH)

        start_time = time.monotonic()
        success = False
        error_msg = ""
        try:
            if len(text) > 8000:
                text = text[:8000]

            text = self._normalize_text(text)
            if not text.strip():
                return [0.0] * 1536

            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            url = f"{self.api_base}/v1/embeddings"
            if "localhost:11434" in self.api_base or "127.0.0.1:11434" in self.api_base:
                url = f"{self.api_base}/api/embeddings"
                payload = {
                    "model": self.embedding_model,
                    "prompt": text
                }
            else:
                payload = {
                    "model": self.embedding_model,
                    "input": text
                }

            log.debug(f"调用 Embedding API: {url}, model: {self.embedding_model}")
            response = await self._client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()

            if "localhost:11434" in self.api_base or "127.0.0.1:11434" in self.api_base:
                embedding = result.get("embedding", [])
            else:
                embedding = result.get("data", [{}])[0].get("embedding", [])

            if not embedding:
                raise InternalErrorException("无法生成向量嵌入")

            embedding = self._normalize_vector(embedding)
            success = True
            return embedding

        except Exception as e:
            error_msg = str(e)
            raise
        finally:
            duration_ms = (time.monotonic() - start_time) * 1000
            await ai_concurrency.release(success)
            await ai_call_logger.log_call(
                call_type="embedding",
                model=self.embedding_model,
                input_tokens=len(text) // 4,
                duration_ms=duration_ms,
                success=success,
                error=error_msg,
                task_id=task_id
            )

    def _normalize_text(self, text: str) -> str:
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        return text

    def _normalize_vector(self, vector: List[float]) -> List[float]:
        norm = np.linalg.norm(vector)
        if norm == 0:
            return vector
        return list(np.array(vector) / norm)


llm_client = LLMClient()


class LegalKeywordExtractor:
    LEGAL_KEYWORDS = {
        "civil": ["合同", "违约", "侵权", "赔偿", "责任", "义务", "权利", "债权", "债务",
                  "所有权", "抵押权", "质权", "留置权", "善意取得", "不当得利", "无因管理",
                  "婚姻", "继承", "收养", "监护", "抚养", "赡养", "夫妻共同财产",
                  "劳动合同", "工伤", "社会保险", "工资", "经济补偿"],
        "criminal": ["犯罪", "刑罚", "量刑", "缓刑", "假释", "累犯", "自首", "立功",
                     "故意", "过失", "正当防卫", "紧急避险", "犯罪未遂", "犯罪中止",
                     "共同犯罪", "主犯", "从犯", "教唆犯", "盗窃罪", "诈骗罪", "故意伤害",
                     "贪污", "受贿", "挪用公款", "渎职"],
        "administrative": ["行政处罚", "行政复议", "行政诉讼", "行政许可", "行政强制",
                           "国家赔偿", "行政征收", "行政裁决"],
        "commercial": ["公司", "股东", "董事", "监事", "破产", "清算", "合伙", "票据",
                       "保险", "海商", "证券", "基金", "信托"],
        "procedural": ["管辖", "证据", "举证", "质证", "保全", "执行", "调解", "仲裁",
                       "起诉", "上诉", "申诉", "再审", "抗诉", "一审", "二审", "终审"],
        "ip": ["专利", "商标", "著作权", "版权", "知识产权", "侵权", "许可", "转让"],
    }

    ALL_KEYWORDS = [kw for kws in LEGAL_KEYWORDS.values() for kw in kws]

    @classmethod
    def extract_keywords(cls, text: str) -> Dict[str, float]:
        scores = {}
        for kw in cls.ALL_KEYWORDS:
            count = text.count(kw)
            if count > 0:
                scores[kw] = math.log(1 + count)
        return scores

    @classmethod
    def get_category_keywords(cls, category: str) -> List[str]:
        return cls.LEGAL_KEYWORDS.get(category, [])

    @classmethod
    def detect_category(cls, text: str) -> str:
        max_count = 0
        detected = "civil"
        for cat, kws in cls.LEGAL_KEYWORDS.items():
            count = sum(1 for kw in kws if kw in text)
            if count > max_count:
                max_count = count
                detected = cat
        return detected


class SimilarityCalculator:
    @staticmethod
    def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        v1 = np.array(vec1, dtype=np.float64)
        v2 = np.array(vec2, dtype=np.float64)

        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        if norm1 == 0 or norm2 == 0:
            return 0.0

        sim = float(np.dot(v1, v2) / (norm1 * norm2))
        return max(0.0, min(1.0, sim))

    @staticmethod
    def cosine_similarity_normalized(vec1: List[float], vec2: List[float]) -> float:
        sim = SimilarityCalculator.cosine_similarity(vec1, vec2)
        normalized = 1 / (1 + math.exp(-10 * (sim - 0.5)))
        return normalized

    @staticmethod
    def jaccard_similarity(text1: str, text2: str) -> float:
        def get_tokens(text):
            tokens = set()
            for i in range(len(text) - 1):
                tokens.add(text[i:i+2])
            return tokens

        set1 = get_tokens(text1)
        set2 = get_tokens(text2)
        if not set1 or not set2:
            return 0.0
        return len(set1 & set2) / len(set1 | set2)

    @staticmethod
    def bm25_similarity(query: str, document: str, k1: float = 1.5, b: float = 0.75) -> float:
        avg_doc_len = 500
        doc_len = len(document)
        query_terms = LegalKeywordExtractor.extract_keywords(query)

        score = 0.0
        for term, qf in query_terms.items():
            tf = document.count(term)
            if tf == 0:
                continue

            idf = math.log(1000 / (1 + 100))
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * doc_len / avg_doc_len)
            score += qf * idf * numerator / denominator

        return 1 / (1 + math.exp(-score / 10))

    @staticmethod
    def keyword_matching_score(text1: str, text2: str) -> float:
        kw1 = LegalKeywordExtractor.extract_keywords(text1)
        kw2 = LegalKeywordExtractor.extract_keywords(text2)

        if not kw1 or not kw2:
            return 0.0

        common = set(kw1.keys()) & set(kw2.keys())
        if not common:
            return 0.0

        score = sum(min(kw1[kw], kw2[kw]) for kw in common)
        max_score = max(sum(kw1.values()), sum(kw2.values()))

        return score / max_score if max_score > 0 else 0.0

    @staticmethod
    def category_match_score(text1: str, text2: str) -> float:
        cat1 = LegalKeywordExtractor.detect_category(text1)
        cat2 = LegalKeywordExtractor.detect_category(text2)
        return 1.0 if cat1 == cat2 else 0.3

    @staticmethod
    def length_penalty(text1: str, text2: str) -> float:
        len1 = len(text1)
        len2 = len(text2)
        if len1 == 0 or len2 == 0:
            return 0.0

        ratio = min(len1, len2) / max(len1, len2)
        return math.sqrt(ratio)

    @staticmethod
    def compute_similarity_matrix(vectors: List[List[float]]) -> np.ndarray:
        n = len(vectors)
        matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(i, n):
                sim = SimilarityCalculator.cosine_similarity(vectors[i], vectors[j])
                matrix[i][j] = sim
                matrix[j][i] = sim
        return matrix


class ConfidenceEstimator:
    @staticmethod
    def estimate_confidence(
        semantic_score: float,
        keyword_score: float,
        category_score: float,
        text1_len: int,
        text2_len: int,
        embedding_quality: float = 1.0
    ) -> float:
        weights = {
            "semantic": 0.4,
            "keyword": 0.3,
            "category": 0.15,
            "length": 0.1,
            "embedding": 0.05
        }

        length_score = 1.0
        if text1_len < 100 or text2_len < 100:
            length_score = 0.5
        elif text1_len < 200 or text2_len < 200:
            length_score = 0.8

        confidence = (
            semantic_score * weights["semantic"] +
            keyword_score * weights["keyword"] +
            category_score * weights["category"] +
            length_score * weights["length"] +
            embedding_quality * weights["embedding"]
        )

        return max(0.0, min(1.0, confidence))

    @staticmethod
    def get_confidence_level(confidence: float) -> str:
        if confidence >= 0.8:
            return "高"
        elif confidence >= 0.6:
            return "中"
        elif confidence >= 0.4:
            return "低"
        else:
            return "极低"


class AIService:
    @staticmethod
    async def get_embedding(text: str, task_id: Optional[int] = None) -> List[float]:
        try:
            return await llm_client.create_embedding(text, task_id=task_id)
        except Exception as e:
            log.error(f"生成 embedding 失败: {str(e)}")
            return [0.0] * 1536

    @staticmethod
    async def get_embeddings(texts: List[str], task_id: Optional[int] = None) -> List[List[float]]:
        embeddings = []
        for text in texts:
            emb = await AIService.get_embedding(text, task_id=task_id)
            embeddings.append(emb)
        return embeddings

    @staticmethod
    async def interpret_law(
        law_title: str,
        law_content: str,
        article_no: str = "",
        interpretation_depth: str = "standard",
        task_id: Optional[int] = None
    ) -> Dict[str, Any]:
        log.info(f"开始法条智能释义: {law_title} {article_no}")

        depth_configs = {
            "brief": {"max_tokens": 800, "sections": 3},
            "standard": {"max_tokens": 2000, "sections": 5},
            "detailed": {"max_tokens": 3500, "sections": 7}
        }
        config = depth_configs.get(interpretation_depth, depth_configs["standard"])

        system_prompt = f"""你是一位资深法律专家和法学教授，精通中国法律体系。你的任务是对法律条文进行专业、全面的释义解读。

请严格按照以下JSON格式输出释义结果，包含以下{config['sections']}个部分：
1. "plain_meaning": 通俗解释 - 用普通人能理解的语言解释该法条的含义（100-200字）
2. "legal_analysis": 法律分析 - 从法理角度深入分析条文的构成要件、适用范围（200-400字）
3. "key_elements": 关键要素 - 提取法条中的核心要素和条件（数组，3-6个要素）
4. "applicable_scenarios": 适用场景 - 说明该法条适用的典型场景（数组，3-5个场景）
5. "related_articles": 关联法条 - 推测可能相关的其他法律条文（数组，2-4个关联）
6. "judicial_interpretation": 司法解释 - 相关司法解释或裁判要点（200-300字，如为standard/detailed深度）
7. "practical_notes": 实务要点 - 法律实务中需要注意的问题（200-300字，如为detailed深度）

输出必须是严格的JSON格式，不要包含任何其他内容。"""

        user_prompt = f"""
【法律条文】
标题: {law_title}
条文编号: {article_no}
内容: {law_content[:2000]}

请对该法律条文进行深度释义解读，输出JSON格式。"""

        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            response = await llm_client.chat_completion(
                messages,
                temperature=0.3,
                max_tokens=config["max_tokens"],
                priority=AICallPriority.HIGH,
                task_id=task_id
            )
            content = response["choices"][0]["message"]["content"]

            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]

            result = json.loads(content.strip())

            category = LegalKeywordExtractor.detect_category(law_content)
            keywords = LegalKeywordExtractor.extract_keywords(law_content)

            interpretation = {
                "law_title": law_title,
                "article_no": article_no,
                "law_content": law_content[:500],
                "plain_meaning": result.get("plain_meaning", ""),
                "legal_analysis": result.get("legal_analysis", ""),
                "key_elements": result.get("key_elements", []),
                "applicable_scenarios": result.get("applicable_scenarios", []),
                "related_articles": result.get("related_articles", []),
                "judicial_interpretation": result.get("judicial_interpretation", ""),
                "practical_notes": result.get("practical_notes", ""),
                "category": category,
                "keywords": list(keywords.keys())[:10],
                "interpretation_depth": interpretation_depth,
                "success": True
            }

            log.info(f"法条释义完成: {law_title} {article_no}")
            return interpretation

        except json.JSONDecodeError as e:
            log.error(f"法条释义JSON解析失败: {str(e)}")
            return {
                "law_title": law_title,
                "article_no": article_no,
                "law_content": law_content[:500],
                "plain_meaning": "释义生成失败，无法解析AI响应",
                "legal_analysis": "",
                "key_elements": [],
                "applicable_scenarios": [],
                "related_articles": [],
                "judicial_interpretation": "",
                "practical_notes": "",
                "category": LegalKeywordExtractor.detect_category(law_content),
                "keywords": list(LegalKeywordExtractor.extract_keywords(law_content).keys())[:10],
                "interpretation_depth": interpretation_depth,
                "success": False,
                "error": "AI响应格式解析失败"
            }
        except Exception as e:
            log.error(f"法条智能释义失败: {str(e)}")
            return {
                "law_title": law_title,
                "article_no": article_no,
                "law_content": law_content[:500],
                "plain_meaning": f"释义生成失败: {str(e)}",
                "legal_analysis": "",
                "key_elements": [],
                "applicable_scenarios": [],
                "related_articles": [],
                "judicial_interpretation": "",
                "practical_notes": "",
                "category": LegalKeywordExtractor.detect_category(law_content),
                "keywords": list(LegalKeywordExtractor.extract_keywords(law_content).keys())[:10],
                "interpretation_depth": interpretation_depth,
                "success": False,
                "error": str(e)
            }

    @staticmethod
    async def rewrite_case(
        case_content: str,
        rewrite_type: str = "simplify",
        target_audience: str = "general",
        custom_requirements: str = "",
        task_id: Optional[int] = None
    ) -> Dict[str, Any]:
        log.info(f"开始案例改写辅助: 类型={rewrite_type}, 目标受众={target_audience}")

        rewrite_configs = {
            "simplify": {
                "name": "简化改写",
                "instruction": "将案例内容简化为通俗易懂的版本，去除冗余法律术语，保留核心事实和法律关系",
                "max_tokens": 1500
            },
            "formalize": {
                "name": "规范化改写",
                "instruction": "将案例内容改写为规范的法律文书格式，使用标准法律术语和表述",
                "max_tokens": 2500
            },
            "summarize": {
                "name": "摘要改写",
                "instruction": "提取案例的核心要素，生成简洁的案例摘要，包含案由、事实、判决要点",
                "max_tokens": 1000
            },
            "expand": {
                "name": "扩展改写",
                "instruction": "在保持原意的基础上，扩展案例的法律分析、事实细节和法理依据",
                "max_tokens": 3000
            },
            "translate_style": {
                "name": "风格转换",
                "instruction": "将案例内容转换为指定受众容易理解的表达风格",
                "max_tokens": 2000
            }
        }

        config = rewrite_configs.get(rewrite_type, rewrite_configs["simplify"])

        audience_instructions = {
            "general": "面向普通公众，使用通俗易懂的语言",
            "lawyer": "面向律师，保留专业法律术语和分析",
            "judge": "面向法官，侧重裁判要点和法律适用",
            "student": "面向法学生，兼顾通俗与专业，便于学习理解"
        }
        audience_desc = audience_instructions.get(target_audience, audience_instructions["general"])

        system_prompt = f"""你是一位专业的法律文书编辑和案例分析师。你的任务是按照指定方式改写法律案例。

改写类型: {config['name']}
改写要求: {config['instruction']}
目标受众: {audience_desc}

请严格按照以下JSON格式输出改写结果：
1. "rewritten_content": 改写后的案例内容（主体部分）
2. "changes_summary": 改写变更摘要，简要说明做了哪些修改（100字以内）
3. "key_facts": 提取的关键事实列表（数组，3-8个事实点）
4. "legal_issues": 涉及的法律问题列表（数组，2-5个问题）
5. "quality_check": 质量自检结果，包含 "accuracy"(准确性1-10), "readability"(可读性1-10), "completeness"(完整性1-10)

输出必须是严格的JSON格式，不要包含任何其他内容。"""

        user_prompt = f"""
【原始案例内容】
{case_content[:3000]}

【改写类型】{config['name']}
【目标受众】{target_audience}
{"【额外要求】" + custom_requirements if custom_requirements else ""}

请按照上述要求改写案例，并输出JSON格式结果。"""

        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            response = await llm_client.chat_completion(
                messages,
                temperature=0.4,
                max_tokens=config["max_tokens"],
                priority=AICallPriority.NORMAL,
                task_id=task_id
            )
            content = response["choices"][0]["message"]["content"]

            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]

            result = json.loads(content.strip())

            rewrite_result = {
                "rewritten_content": result.get("rewritten_content", ""),
                "original_length": len(case_content),
                "rewritten_length": len(result.get("rewritten_content", "")),
                "rewrite_type": rewrite_type,
                "rewrite_type_name": config["name"],
                "target_audience": target_audience,
                "changes_summary": result.get("changes_summary", ""),
                "key_facts": result.get("key_facts", []),
                "legal_issues": result.get("legal_issues", []),
                "quality_check": result.get("quality_check", {}),
                "success": True
            }

            log.info(f"案例改写完成: 类型={rewrite_type}, 原始{len(case_content)}字→改写{rewrite_result['rewritten_length']}字")
            return rewrite_result

        except json.JSONDecodeError as e:
            log.error(f"案例改写JSON解析失败: {str(e)}")
            return {
                "rewritten_content": "改写生成失败，无法解析AI响应",
                "original_length": len(case_content),
                "rewritten_length": 0,
                "rewrite_type": rewrite_type,
                "rewrite_type_name": config["name"],
                "target_audience": target_audience,
                "changes_summary": "",
                "key_facts": [],
                "legal_issues": [],
                "quality_check": {},
                "success": False,
                "error": "AI响应格式解析失败"
            }
        except Exception as e:
            log.error(f"案例改写辅助失败: {str(e)}")
            return {
                "rewritten_content": f"改写生成失败: {str(e)}",
                "original_length": len(case_content),
                "rewritten_length": 0,
                "rewrite_type": rewrite_type,
                "rewrite_type_name": config["name"],
                "target_audience": target_audience,
                "changes_summary": "",
                "key_facts": [],
                "legal_issues": [],
                "quality_check": {},
                "success": False,
                "error": str(e)
            }

    @staticmethod
    async def compare_case_with_laws(
        case_content: str,
        laws: List[Dict[str, Any]],
        top_k: int = 5,
        task_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        log.info(f"开始案例比对，候选法条数量: {len(laws)}")

        if not laws:
            return []

        case_content_clean = AIService._clean_text(case_content)
        case_embedding = await AIService.get_embedding(case_content_clean, task_id=task_id)

        embedding_quality = AIService._assess_embedding_quality(case_embedding)
        log.debug(f"案例 embedding 质量: {embedding_quality:.2f}")

        scored_laws = []
        for law in laws:
            law_content = law.get("content", "")
            law_content_clean = AIService._clean_text(law_content)

            law_embedding = law.get("embedding")
            if law_embedding is None:
                law_embedding = await AIService.get_embedding(law_content_clean, task_id=task_id)

            semantic_raw = SimilarityCalculator.cosine_similarity(case_embedding, law_embedding)
            semantic_score = SimilarityCalculator.cosine_similarity_normalized(case_embedding, law_embedding)

            jaccard_score = SimilarityCalculator.jaccard_similarity(case_content_clean, law_content_clean)
            bm25_score = SimilarityCalculator.bm25_similarity(case_content_clean, law_content_clean)
            keyword_score = SimilarityCalculator.keyword_matching_score(case_content_clean, law_content_clean)
            category_score = SimilarityCalculator.category_match_score(case_content_clean, law_content_clean)
            length_penalty = SimilarityCalculator.length_penalty(case_content_clean, law_content_clean)

            combined_keyword_score = jaccard_score * 0.2 + bm25_score * 0.4 + keyword_score * 0.4

            alpha = AIService._calculate_alpha(case_content_clean, law_content_clean)
            combined_score = (
                semantic_score * alpha +
                combined_keyword_score * (1 - alpha)
            ) * length_penalty

            confidence = ConfidenceEstimator.estimate_confidence(
                semantic_score=semantic_score,
                keyword_score=combined_keyword_score,
                category_score=category_score,
                text1_len=len(case_content_clean),
                text2_len=len(law_content_clean),
                embedding_quality=embedding_quality
            )

            final_score = AIService._apply_confidence_calibration(combined_score, confidence)

            scored_laws.append({
                **law,
                "similarity_score": int(final_score * 100),
                "semantic_score": int(semantic_score * 100),
                "semantic_raw": round(semantic_raw * 100, 2),
                "keyword_score": int(combined_keyword_score * 100),
                "jaccard_score": int(jaccard_score * 100),
                "bm25_score": int(bm25_score * 100),
                "category_score": int(category_score * 100),
                "confidence": round(confidence * 100, 2),
                "confidence_level": ConfidenceEstimator.get_confidence_level(confidence),
                "length_penalty": round(length_penalty, 2),
                "alpha": round(alpha, 2)
            })

        scored_laws.sort(key=lambda x: x["similarity_score"], reverse=True)

        scored_laws = AIService._normalize_scores(scored_laws)
        top_laws = scored_laws[:top_k]

        for law in top_laws:
            if law["confidence"] >= 40:
                try:
                    analysis = await AIService._generate_matching_analysis(case_content, law, task_id=task_id)
                    law["matching_analysis"] = analysis.get("analysis", "")
                    law["key_points"] = analysis.get("key_points", [])
                    law["recommendations"] = analysis.get("recommendations", "")
                except Exception as e:
                    log.warning(f"生成匹配分析失败: {str(e)}")
                    law["matching_analysis"] = "AI分析暂不可用"
                    law["key_points"] = []
                    law["recommendations"] = ""

        log.info(f"案例比对完成，最高相似度: {top_laws[0]['similarity_score'] if top_laws else 0}%")
        return top_laws

    @staticmethod
    async def compare_case_with_cases(
        case_content: str,
        target_cases: List[Dict[str, Any]],
        top_k: int = 5,
        task_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        log.info(f"开始案例相似度比对，候选案例数量: {len(target_cases)}")

        if not target_cases:
            return []

        case_content_clean = AIService._clean_text(case_content)
        case_embedding = await AIService.get_embedding(case_content_clean, task_id=task_id)

        scored_cases = []
        for target_case in target_cases:
            target_content = target_case.get("summary", "") or target_case.get("content", "")
            target_content_clean = AIService._clean_text(target_content)

            target_embedding = target_case.get("embedding")
            if target_embedding is None:
                target_embedding = await AIService.get_embedding(target_content_clean, task_id=task_id)

            semantic_score = SimilarityCalculator.cosine_similarity_normalized(case_embedding, target_embedding)
            keyword_score = SimilarityCalculator.keyword_matching_score(case_content_clean, target_content_clean)
            category_score = SimilarityCalculator.category_match_score(case_content_clean, target_content_clean)
            length_penalty = SimilarityCalculator.length_penalty(case_content_clean, target_content_clean)

            combined_score = (semantic_score * 0.7 + keyword_score * 0.2 + category_score * 0.1) * length_penalty
            final_score = int(combined_score * 100)

            scored_cases.append({
                **target_case,
                "similarity_score": final_score,
                "semantic_score": int(semantic_score * 100),
                "keyword_score": int(keyword_score * 100),
                "length_penalty": round(length_penalty, 2)
            })

        scored_cases.sort(key=lambda x: x["similarity_score"], reverse=True)
        return scored_cases[:top_k]

    @staticmethod
    async def _generate_matching_analysis(
        case_content: str,
        law: Dict[str, Any],
        task_id: Optional[int] = None
    ) -> Dict[str, Any]:
        system_prompt = """你是一位专业的法律AI助手，精通中国法律体系。你的任务是分析案例与法律条文的匹配度，
并提供专业的法律分析。请严格按照以下要求输出JSON格式的结果：

1. analysis: 详细分析案例与法条的匹配程度，包括事实认定、法律适用等方面（100-300字）
2. key_points: 匹配的关键点列表，每个点用简短的语言描述（3-5个要点）
3. recommendations: 针对该案例的法律建议（100-200字）

输出必须是严格的JSON格式，不要包含任何其他内容。"""

        case_summary = case_content[:1500] if len(case_content) > 1500 else case_content
        law_content = law.get("content", "")[:1000]

        user_prompt = f"""
【案例摘要】
{case_summary}

【法律条文】
标题: {law.get('title', '')}
条文编号: {law.get('article_no', '')}
内容: {law_content}

相似度得分: {law.get('similarity_score', 0)}%
置信度: {law.get('confidence_level', '未知')}

请分析上述案例与法律条文的匹配情况，并输出JSON格式的分析结果。"""

        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            response = await llm_client.chat_completion(
                messages,
                temperature=0.3,
                max_tokens=1500,
                priority=AICallPriority.NORMAL,
                task_id=task_id
            )
            content = response["choices"][0]["message"]["content"]

            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]

            result = json.loads(content.strip())
            return {
                "analysis": result.get("analysis", ""),
                "key_points": result.get("key_points", []),
                "recommendations": result.get("recommendations", "")
            }
        except Exception as e:
            log.error(f"生成匹配分析失败: {str(e)}")
            return {
                "analysis": f"AI分析生成失败，请根据相似度分数和法条内容自行判断",
                "key_points": [],
                "recommendations": "建议咨询专业法律人士"
            }

    @staticmethod
    async def generate_comparison_report(
        case_content: str,
        matched_laws: List[Dict[str, Any]],
        matched_cases: Optional[List[Dict[str, Any]]] = None,
        task_id: Optional[int] = None
    ) -> Dict[str, Any]:
        log.info("生成比对报告...")

        system_prompt = """你是一位专业的法律AI助手，精通中国法律体系。你的任务是基于案例比对结果生成一份专业的法律分析报告。
报告应包含以下部分：
1. 案例摘要
2. 相关法条分析
3. 类似案例参考（如有）
4. 法律风险评估
5. 处理建议

请用中文，专业、客观、详细地撰写报告。"""

        laws_text = "\n\n".join([
            f"【法条{idx+1}】\n标题: {law.get('title', '')}\n相似度: {law.get('similarity_score', 0)}% (置信度: {law.get('confidence_level', '未知')})\n分析: {law.get('matching_analysis', '')[:500]}"
            for idx, law in enumerate(matched_laws[:5])
        ])

        cases_text = ""
        if matched_cases:
            cases_text = "\n\n".join([
                f"【案例{idx+1}】\n标题: {case.get('title', '')}\n相似度: {case.get('similarity_score', 0)}%"
                for idx, case in enumerate(matched_cases[:3])
            ])

        user_prompt = f"""
【待分析案例】
{case_content[:2000]}

【匹配法条】
{laws_text}

【类似案例】
{cases_text if cases_text else '无'}

请基于以上信息，生成一份专业的法律分析报告。"""

        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            response = await llm_client.chat_completion(
                messages,
                temperature=0.5,
                max_tokens=3000,
                priority=AICallPriority.HIGH,
                task_id=task_id
            )
            report_content = response["choices"][0]["message"]["content"]

            return {
                "report": report_content,
                "summary": AIService._extract_summary(report_content),
                "risk_level": AIService._assess_risk_level(case_content, matched_laws)
            }
        except Exception as e:
            log.error(f"生成比对报告失败: {str(e)}")
            return {
                "report": f"报告生成失败: {str(e)}",
                "summary": "",
                "risk_level": "未知"
            }

    @staticmethod
    def _clean_text(text: str) -> str:
        if not text:
            return ""
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n\s*\n', '\n', text)
        text = text.strip()
        return text

    @staticmethod
    def _assess_embedding_quality(embedding: List[float]) -> float:
        arr = np.array(embedding)
        mean_val = np.mean(arr)
        std_val = np.std(arr)
        norm = np.linalg.norm(arr)

        quality = 1.0
        if abs(mean_val) > 0.1:
            quality *= 0.9
        if std_val < 0.05:
            quality *= 0.8
        if abs(norm - 1.0) > 0.1:
            quality *= 0.9

        return max(0.0, quality)

    @staticmethod
    def _calculate_alpha(text1: str, text2: str) -> float:
        len1 = len(text1)
        len2 = len(text2)

        keywords1 = LegalKeywordExtractor.extract_keywords(text1)
        keywords2 = LegalKeywordExtractor.extract_keywords(text2)

        has_rich_keywords = len(keywords1) > 5 and len(keywords2) > 5
        has_sufficient_length = len1 > 300 and len2 > 300

        if has_rich_keywords and has_sufficient_length:
            return 0.6
        elif has_rich_keywords or has_sufficient_length:
            return 0.65
        else:
            return 0.75

    @staticmethod
    def _apply_confidence_calibration(score: float, confidence: float) -> float:
        if confidence >= 0.8:
            return score
        elif confidence >= 0.6:
            return score * 0.9
        elif confidence >= 0.4:
            return score * 0.8
        else:
            return score * 0.7

    @staticmethod
    def _normalize_scores(scored_laws: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not scored_laws:
            return scored_laws

        scores = [law["similarity_score"] for law in scored_laws]
        max_score = max(scores)
        min_score = min(scores)

        if max_score == min_score:
            return scored_laws

        normalized = []
        for law in scored_laws:
            if law["confidence"] >= 60:
                normalized_score = law["similarity_score"]
            else:
                range_ratio = (law["similarity_score"] - min_score) / (max_score - min_score)
                normalized_score = min_score + range_ratio * (max_score - min_score) * 0.8

            law["similarity_score"] = int(max(0, min(100, normalized_score)))
            normalized.append(law)

        return normalized

    @staticmethod
    def _extract_summary(report: str) -> str:
        lines = report.split("\n")
        summary_lines = []
        for line in lines[:10]:
            if line.strip():
                summary_lines.append(line.strip())
                if len(summary_lines) >= 3:
                    break
        return "\n".join(summary_lines)

    @staticmethod
    def _assess_risk_level(case_content: str, matched_laws: List[Dict[str, Any]]) -> str:
        high_risk_keywords = ["刑事", "犯罪", "违法", "处罚", "赔偿", "违约金", "解除", "严重"]
        score = 0

        for kw in high_risk_keywords:
            if kw in case_content:
                score += 1

        high_conf_matches = [law for law in matched_laws if law.get("confidence", 0) >= 60 and law.get("similarity_score", 0) >= 70]
        score += len(high_conf_matches) * 2

        if score >= 8:
            return "高风险"
        elif score >= 5:
            return "中风险"
        else:
            return "低风险"

    @staticmethod
    async def batch_compare_cases(
        case_ids: List[int],
        law_ids: Optional[List[int]] = None,
        top_k: int = 5,
        task_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        from app.modules.search import SearchService

        results = []
        for case_id in case_ids:
            case_doc = await SearchService.get_case_by_id(case_id)
            if not case_doc:
                continue

            if law_ids:
                laws = []
                for law_id in law_ids:
                    law_doc = await SearchService.get_law_by_id(law_id)
                    if law_doc:
                        laws.append(law_doc)
            else:
                case_content = case_doc.get("content", "")
                laws = await SearchService.find_similar_laws(case_content, top_k=top_k * 2)

            matched_laws = await AIService.compare_case_with_laws(
                case_doc.get("content", ""), laws, top_k=top_k, task_id=task_id
            )

            results.append({
                "case_id": case_id,
                "case_title": case_doc.get("title", ""),
                "matched_laws": matched_laws,
                "total_matched": len(matched_laws)
            })

        return results

    @staticmethod
    async def get_ai_stats() -> Dict[str, Any]:
        concurrency_stats = ai_concurrency.get_stats()
        rate_limiter_usage = ai_rate_limiter.get_usage()
        call_stats = await ai_call_logger.get_stats()
        return {
            "concurrency": concurrency_stats,
            "rate_limiter": rate_limiter_usage,
            "call_stats": call_stats
        }

    @staticmethod
    async def get_ai_logs(limit: int = 100, call_type: Optional[str] = None) -> List[Dict]:
        return await ai_call_logger.get_recent_logs(limit=limit, call_type=call_type)

    @staticmethod
    async def close():
        await llm_client.close()
