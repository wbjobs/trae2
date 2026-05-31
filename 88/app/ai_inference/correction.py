from loguru import logger
from app.ai_inference.base import get_provider, chunk_content, extract_json_from_response

CORRECTION_SYSTEM_PROMPT = """你是一个专业的文档内容纠错助手。请仔细检查用户提供的文档内容，找出其中的错误并提出修正建议。
需要检查的错误类型包括：
1. 错别字和拼写错误
2. 语法错误
3. 标点符号使用错误
4. 事实性错误（如果能判断）
5. 逻辑不一致的地方

严格按以下JSON格式返回，不要包含任何其他文字：
{
  "has_errors": true,
  "corrections": [
    {
      "original": "原文片段",
      "corrected": "修正后",
      "type": "错误类型",
      "explanation": "修正说明"
    }
  ],
  "corrected_text": "修正后的完整文本"
}
如果没有任何错误，返回：{"has_errors": false, "corrections": [], "corrected_text": "无错误，原文无需修正"}
注意：确保返回完整的JSON，corrected_text字段必须包含完整修正后的文本，不要截断。"""


async def correct_content(content: str) -> dict:
    provider = get_provider()
    chunks = chunk_content(content, max_chars=6000)

    if len(chunks) == 1:
        return await _correct_single(provider, chunks[0])

    logger.info(f"Document split into {len(chunks)} chunks for correction")
    all_corrections = []
    corrected_parts = []
    has_any_error = False

    for i, chunk in enumerate(chunks):
        try:
            result = await _correct_single(provider, chunk)
            if result.get("has_errors"):
                has_any_error = True
                corrections = result.get("corrections", [])
                for c in corrections:
                    c["chunk"] = i + 1
                    all_corrections.append(c)
            corrected_parts.append(result.get("corrected_text", chunk))
        except Exception as e:
            logger.warning(f"Failed to correct chunk {i+1}: {e}")
            corrected_parts.append(chunk)

    corrected_text = "\n\n".join(corrected_parts)
    return {
        "has_errors": has_any_error,
        "corrections": all_corrections,
        "corrected_text": corrected_text,
    }


async def _correct_single(provider, content: str) -> dict:
    user_prompt = f"请检查以下文档内容中的错误：\n\n{content}"
    result = await provider.safe_chat(CORRECTION_SYSTEM_PROMPT, user_prompt, allow_truncated=True)

    parsed = extract_json_from_response(result)
    if parsed and isinstance(parsed, dict):
        if "has_errors" in parsed:
            return _validate_correction_result(parsed, content)

    import json
    try:
        direct = json.loads(result.strip())
        if isinstance(direct, dict) and "has_errors" in direct:
            return _validate_correction_result(direct, content)
    except json.JSONDecodeError:
        pass

    logger.warning("Could not parse correction JSON, returning fallback result")
    return {
        "has_errors": False,
        "corrections": [],
        "corrected_text": content,
        "raw_response": result,
    }


def _validate_correction_result(result: dict, original_content: str) -> dict:
    if not isinstance(result.get("corrections"), list):
        result["corrections"] = []

    valid_corrections = []
    for c in result["corrections"]:
        if not isinstance(c, dict):
            continue
        if not c.get("original") or not c.get("corrected"):
            continue
        c.setdefault("type", "未知")
        c.setdefault("explanation", "")
        valid_corrections.append(c)
    result["corrections"] = valid_corrections

    if not result.get("corrected_text") or not isinstance(result["corrected_text"], str):
        if valid_corrections:
            corrected = original_content
            for c in reversed(valid_corrections):
                corrected = corrected.replace(c["original"], c["corrected"], 1)
            result["corrected_text"] = corrected
        else:
            result["corrected_text"] = original_content

    return result
