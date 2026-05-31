import logging
import asyncio
import json
import time
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from openai import AsyncOpenAI, APIError, APITimeoutError, APIConnectionError, RateLimitError
from config import settings

logger = logging.getLogger(__name__)


@dataclass
class RetryConfig:
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0
    backoff_factor: float = 2.0
    retryable_errors = (APIError, APITimeoutError, APIConnectionError, RateLimitError, TimeoutError, ConnectionError)


class AIModelClient:
    """AI模型调用模块（优化版）- 支持重试、指数退避、请求队列"""

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.base_url = settings.OPENAI_BASE_URL
        self.llm_model = settings.LLM_MODEL
        self.embedding_model = settings.EMBEDDING_MODEL
        self.use_local_model = settings.USE_LOCAL_MODEL
        self.local_model_path = settings.LOCAL_MODEL_PATH

        self.retry_config = RetryConfig(
            max_retries=getattr(settings, 'AI_MAX_RETRIES', 3),
            base_delay=getattr(settings, 'AI_RETRY_BASE_DELAY', 1.0),
            max_delay=getattr(settings, 'AI_RETRY_MAX_DELAY', 30.0),
        )

        self.request_timeout = getattr(settings, 'AI_REQUEST_TIMEOUT', 120)
        self.max_concurrent_requests = getattr(settings, 'AI_MAX_CONCURRENT', 5)

        self._request_semaphore = asyncio.Semaphore(self.max_concurrent_requests)
        self.client = None
        self.local_embedding_model = None
        self._initialize_client()

        logger.info(
            f"AI模型调用模块初始化完成, 使用模型: {self.llm_model}, "
            f"最大重试: {self.retry_config.max_retries}, "
            f"最大并发: {self.max_concurrent_requests}"
        )

    def _initialize_client(self):
        """初始化AI客户端"""
        if not self.use_local_model and self.api_key:
            self.client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                timeout=self.request_timeout,
                max_retries=0
            )
            logger.info("已初始化OpenAI API客户端")
        elif self.use_local_model and self.local_model_path:
            self._initialize_local_model()
        else:
            logger.warning("未配置有效的AI模型，将使用模拟模式")

    def _initialize_local_model(self):
        """初始化本地模型"""
        try:
            from sentence_transformers import SentenceTransformer
            self.local_embedding_model = SentenceTransformer(self.local_model_path)
            logger.info(f"本地模型加载成功: {self.local_model_path}")
        except Exception as e:
            logger.error(f"本地模型加载失败: {str(e)}")
            self.local_embedding_model = None

    async def _execute_with_retry(self, func, *args, **kwargs):
        """带重试机制的函数执行"""
        last_exception = None

        for attempt in range(self.retry_config.max_retries + 1):
            try:
                if attempt > 0:
                    delay = min(
                        self.retry_config.base_delay * (self.retry_config.backoff_factor ** (attempt - 1)),
                        self.retry_config.max_delay
                    )
                    logger.warning(f"AI调用重试 {attempt}/{self.retry_config.max_retries}, 等待 {delay:.1f}s")
                    await asyncio.sleep(delay)

                async with self._request_semaphore:
                    result = await func(*args, **kwargs)
                    return result, None

            except self.retry_config.retryable_errors as e:
                last_exception = e
                logger.warning(f"AI调用可重试错误: {type(e).__name__} - {str(e)}")
                continue
            except Exception as e:
                logger.error(f"AI调用不可重试错误: {type(e).__name__} - {str(e)}")
                return None, str(e)

        return None, f"重试{self.retry_config.max_retries}次后仍失败: {last_exception}"

    async def _chat_completion_request(
        self,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: Optional[str]
    ) -> Optional[str]:
        """执行聊天补全请求"""
        kwargs = {
            "model": self.llm_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_format == "json":
            kwargs["response_format"] = {"type": "json_object"}

        response = await self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    async def generate_chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
        response_format: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str]]:
        """生成聊天补全（带重试和并发控制）"""
        if self.client is None:
            return self._mock_chat_completion(messages), None

        result, error = await self._execute_with_retry(
            self._chat_completion_request,
            messages, temperature, max_tokens, response_format
        )
        return result, error

    async def _embedding_request(self, text: str) -> List[float]:
        """执行嵌入请求"""
        response = await self.client.embeddings.create(
            model=self.embedding_model,
            input=text
        )
        return response.data[0].embedding

    async def generate_embedding(self, text: str) -> Tuple[Optional[List[float]], Optional[str]]:
        """生成文本向量嵌入（带重试）"""
        if self.use_local_model and self.local_embedding_model:
            try:
                loop = asyncio.get_event_loop()
                embedding = await loop.run_in_executor(
                    None,
                    lambda: self.local_embedding_model.encode(text).tolist()
                )
                return embedding, None
            except Exception as e:
                error_msg = f"本地嵌入生成失败: {str(e)}"
                logger.error(error_msg)
                return None, error_msg

        if self.client is None:
            return self._mock_embedding(text), None

        result, error = await self._execute_with_retry(
            self._embedding_request, text
        )
        return result, error

    async def batch_generate_embeddings(
        self,
        texts: List[str],
        batch_size: Optional[int] = None
    ) -> Tuple[List[Optional[List[float]]], List[str]]:
        """批量生成文本向量（并发控制）"""
        if batch_size is None:
            batch_size = self.max_concurrent_requests

        embeddings = []
        errors = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            tasks = [self.generate_embedding(text) for text in batch]
            batch_results = await asyncio.gather(*tasks, return_exceptions=False)

            for embedding, error in batch_results:
                embeddings.append(embedding)
                if error:
                    errors.append(error)

        return embeddings, errors

    async def batch_generate_chat_completions(
        self,
        batch_messages: List[List[Dict[str, str]]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
        response_format: Optional[str] = None
    ) -> List[Tuple[Optional[str], Optional[str]]]:
        """批量生成聊天补全"""
        tasks = [
            self.generate_chat_completion(messages, temperature, max_tokens, response_format)
            for messages in batch_messages
        ]
        return await asyncio.gather(*tasks, return_exceptions=False)

    def _mock_chat_completion(self, messages: List[Dict[str, str]]) -> str:
        """模拟AI响应（开发测试用）"""
        last_message = messages[-1]["content"] if messages else ""

        if "关键词" in last_message:
            return json.dumps({
                "keywords": ["合同", "技术", "项目", "协议", "服务"],
                "summary": "这是一份技术服务合同，涉及双方权利义务约定。",
                "topics": ["合同协议", "技术服务"]
            }, ensure_ascii=False)
        elif "分类" in last_message:
            return json.dumps({
                "primary_category": "合同协议",
                "secondary_categories": ["技术文档"],
                "confidence": 0.85,
                "category_scores": {
                    "合同协议": 0.85,
                    "技术文档": 0.12,
                    "其他": 0.03
                }
            }, ensure_ascii=False)
        elif "实体" in last_message:
            return json.dumps({
                "entities": [
                    {"text": "甲方公司", "type": "ORG", "start": 0, "end": 4},
                    {"text": "2024年1月1日", "type": "DATE", "start": 10, "end": 20}
                ]
            }, ensure_ascii=False)

        return "这是模拟的AI响应内容。"

    def _mock_embedding(self, text: str) -> List[float]:
        """模拟向量生成（开发测试用）"""
        import hashlib
        import numpy as np

        hash_bytes = hashlib.md5(text.encode('utf-8')).digest()
        np.random.seed(int.from_bytes(hash_bytes[:4], 'big'))
        embedding = np.random.randn(1536).astype(float)
        norm = np.linalg.norm(embedding)
        return (embedding / norm).tolist()


ai_client = AIModelClient()
