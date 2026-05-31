from loguru import logger
from app.ai_inference.base import get_provider, chunk_content, extract_json_from_response

KEYWORDS_SYSTEM_PROMPT = """你是一个专业的关键词标注助手。请根据用户提供的文档内容，提取出最重要的关键词和短语。
要求：
1. 提取5-15个最核心的关键词
2. 关键词应覆盖文档的主要主题和概念
3. 按重要性从高到低排序
4. 严格按以下JSON格式返回，不要包含任何其他文字：
{"keywords": ["关键词1", "关键词2", "关键词3"]}
5. 关键词必须是简短的词或短语，不要包含解释或描述
6. 确保JSON格式完整，不要截断"""


async def extract_keywords(content: str) -> list[str]:
    provider = get_provider()
    chunks = chunk_content(content, max_chars=6000)

    if len(chunks) == 1:
        return await _extract_from_single(provider, chunks[0])

    logger.info(f"Document split into {len(chunks)} chunks for keyword extraction")
    all_keywords = []
    seen = set()
    for i, chunk in enumerate(chunks):
        try:
            kws = await _extract_from_single(provider, chunk)
            for kw in kws:
                kw_lower = kw.lower()
                if kw_lower not in seen:
                    seen.add(kw_lower)
                    all_keywords.append(kw)
        except Exception as e:
            logger.warning(f"Failed to extract keywords from chunk {i+1}: {e}")

    return all_keywords[:15]


async def _extract_from_single(provider, content: str) -> list[str]:
    user_prompt = f"请从以下文档内容中提取关键词：\n\n{content}"
    result = await provider.safe_chat(KEYWORDS_SYSTEM_PROMPT, user_prompt, allow_truncated=True)

    parsed = extract_json_from_response(result)
    if parsed and isinstance(parsed, dict) and "keywords" in parsed:
        keywords = parsed["keywords"]
        if isinstance(keywords, list):
            return [str(k).strip() for k in keywords if str(k).strip()]

    if parsed and isinstance(parsed, list):
        return [str(k).strip() for k in parsed if str(k).strip()]

    import json
    try:
        direct = json.loads(result.strip())
        if isinstance(direct, dict) and "keywords" in direct:
            return [str(k).strip() for k in direct["keywords"] if str(k).strip()]
        if isinstance(direct, list):
            return [str(k).strip() for k in direct if str(k).strip()]
    except json.JSONDecodeError:
        pass

    import re
    items = re.findall(r'["\']([^"\']+?)["\']', result)
    if items:
        return [k.strip() for k in items if k.strip()]

    logger.warning("All keyword parsing methods failed, returning empty list")
    return []
