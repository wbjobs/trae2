import re
from abc import ABC, abstractmethod
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.config import get_settings

settings = get_settings()


class AIProviderError(Exception):
    pass


class TruncatedResponseError(AIProviderError):
    pass


class BaseAIProvider(ABC):
    def __init__(self):
        self.api_key = settings.AI_API_KEY
        self.model = settings.AI_MODEL
        self.base_url = settings.AI_BASE_URL
        self.max_tokens = settings.AI_MAX_TOKENS
        self.temperature = settings.AI_TEMPERATURE

    @abstractmethod
    async def chat(self, system_prompt: str, user_prompt: str) -> tuple[str, str]:
        pass

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((AIProviderError, TruncatedResponseError)),
        before_sleep=lambda retry_state: logger.warning(
            f"AI provider retry attempt {retry_state.attempt_number}"
        ),
    )
    async def safe_chat(self, system_prompt: str, user_prompt: str, allow_truncated: bool = False) -> str:
        from app.ai_inference.rate_limiter import get_rate_limiter
        limiter = get_rate_limiter()
        async with limiter:
            try:
                result, finish_reason = await self.chat(system_prompt, user_prompt)
                if finish_reason == "length" and not allow_truncated:
                    logger.warning("AI response truncated (finish_reason=length), will retry")
                    raise TruncatedResponseError("Response was truncated due to max_tokens limit")
                if finish_reason == "length":
                    logger.warning("AI response truncated but allowed by caller")
                return result
            except (AIProviderError, TruncatedResponseError):
                raise
            except Exception as e:
                logger.error(f"AI provider error: {e}")
                raise AIProviderError(str(e))


class ZhipuProvider(BaseAIProvider):
    async def chat(self, system_prompt: str, user_prompt: str) -> tuple[str, str]:
        import asyncio
        from zhipuai import ZhipuAI

        client = ZhipuAI(api_key=self.api_key)
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=self.max_tokens,
                temperature=self.temperature,
            ),
        )
        content = response.choices[0].message.content
        finish_reason = response.choices[0].finish_reason or "stop"
        return content, finish_reason


_openai_client = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import AsyncOpenAI
        _openai_client = AsyncOpenAI(api_key=settings.AI_API_KEY, base_url=settings.AI_BASE_URL)
    return _openai_client


class OpenAICompatibleProvider(BaseAIProvider):
    async def chat(self, system_prompt: str, user_prompt: str) -> tuple[str, str]:
        client = _get_openai_client()
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=self.max_tokens,
            temperature=self.temperature,
        )
        content = response.choices[0].message.content
        finish_reason = response.choices[0].finish_reason or "stop"
        return content, finish_reason


class DashScopeProvider(BaseAIProvider):
    async def chat(self, system_prompt: str, user_prompt: str) -> tuple[str, str]:
        import asyncio
        import dashscope
        from dashscope import Generation

        dashscope.api_key = self.api_key
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: Generation.call(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                result_format="message",
                max_tokens=self.max_tokens,
                temperature=self.temperature,
            ),
        )
        if response.status_code == 200:
            content = response.output.choices[0].message.content
            finish_reason = response.output.choices[0].finish_reason or "stop"
            return content, finish_reason
        raise AIProviderError(f"DashScope error: {response.code} - {response.message}")


PROVIDERS = {
    "zhipu": ZhipuProvider,
    "openai": OpenAICompatibleProvider,
    "dashscope": DashScopeProvider,
}


def get_provider() -> BaseAIProvider:
    provider_cls = PROVIDERS.get(settings.AI_PROVIDER, OpenAICompatibleProvider)
    return provider_cls()


def chunk_content(content: str, max_chars: int = 6000) -> list[str]:
    if len(content) <= max_chars:
        return [content]

    chunks = []
    remaining = content
    while remaining:
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break

        split_pos = max_chars
        for sep in ["\n\n", "\n", "。", ".", "！", "!", "？", "?", "；", ";"]:
            pos = remaining.rfind(sep, 0, max_chars)
            if pos > max_chars * 0.3:
                split_pos = pos + len(sep)
                break

        chunks.append(remaining[:split_pos])
        remaining = remaining[split_pos:]

    return chunks


def extract_json_from_response(text: str) -> dict | list | None:
    if not text or not text.strip():
        return None

    cleaned = text.strip()

    json_block = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", cleaned, re.DOTALL)
    if json_block:
        cleaned = json_block.group(1).strip()

    brace_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    bracket_match = re.search(r"\[.*\]", cleaned, re.DOTALL)

    candidates = []
    if brace_match:
        candidates.append(brace_match.group(0))
    if bracket_match:
        candidates.append(bracket_match.group(0))

    if not candidates and cleaned.startswith(("{", "[")):
        candidates.append(cleaned)

    for candidate in candidates:
        try:
            import json
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    return None
