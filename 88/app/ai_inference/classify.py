from loguru import logger
from app.ai_inference.base import get_provider, chunk_content, extract_json_from_response

CLASSIFY_SYSTEM_PROMPT = """你是一个专业的文档分类打标助手。请根据用户提供的文档内容，对文档进行分类并打上标签。
要求：
1. 分析文档的主题、领域和内容类型
2. 返回以下JSON格式，不要包含任何其他文字：
{
  "primary_category": "主分类（如：技术/金融/医疗/教育/法律/科技/商业/文化/其他）",
  "sub_categories": ["子分类1", "子分类2"],
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "confidence": 0.95,
  "language": "文档主要语言（如zh/en/ja等）",
  "content_type": "内容类型（如：论文/报告/新闻/教程/手册/合同/简历/其他）"
}
3. 主分类必须是给定的选项之一
4. 子分类2-3个，更细粒度的领域分类
5. 标签3-8个，涵盖文档核心主题
6. confidence为分类置信度，0-1之间
7. 确保返回完整的JSON"""


async def classify_document(content: str) -> dict:
    provider = get_provider()
    chunks = chunk_content(content, max_chars=6000)

    if len(chunks) == 1:
        return await _classify_single(provider, chunks[0])

    logger.info(f"Document split into {len(chunks)} chunks for classification")
    first_result = await _classify_single(provider, chunks[0])
    return first_result


async def _classify_single(provider, content: str) -> dict:
    user_prompt = f"请对以下文档内容进行分类打标：\n\n{content}"
    result = await provider.safe_chat(CLASSIFY_SYSTEM_PROMPT, user_prompt, allow_truncated=True)

    parsed = extract_json_from_response(result)
    if parsed and isinstance(parsed, dict) and "primary_category" in parsed:
        return _validate_classification(parsed)

    import json
    try:
        direct = json.loads(result.strip())
        if isinstance(direct, dict) and "primary_category" in direct:
            return _validate_classification(direct)
    except json.JSONDecodeError:
        pass

    logger.warning("Classification JSON parsing failed, returning fallback")
    return {
        "primary_category": "其他",
        "sub_categories": [],
        "tags": [],
        "confidence": 0.0,
        "language": "unknown",
        "content_type": "其他",
    }


def _validate_classification(result: dict) -> dict:
    valid_categories = {"技术", "金融", "医疗", "教育", "法律", "科技", "商业", "文化", "其他"}
    if result.get("primary_category") not in valid_categories:
        result["primary_category"] = "其他"

    for key in ("sub_categories", "tags"):
        if not isinstance(result.get(key), list):
            result[key] = []

    try:
        result["confidence"] = float(result.get("confidence", 0.5))
        result["confidence"] = max(0.0, min(1.0, result["confidence"]))
    except (ValueError, TypeError):
        result["confidence"] = 0.5

    if not isinstance(result.get("language"), str) or not result["language"]:
        result["language"] = "unknown"
    if not isinstance(result.get("content_type"), str) or not result["content_type"]:
        result["content_type"] = "其他"

    return result
