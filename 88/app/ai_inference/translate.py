from loguru import logger
from app.ai_inference.base import get_provider, chunk_content

TRANSLATE_SYSTEM_PROMPT = """你是一个专业的多语言语义转换助手。请将用户提供的文档内容翻译为目标语言。
要求：
1. 保持原文的语义、语调和格式不变
2. 专业术语应准确翻译，必要时在括号中保留原文
3. 确保翻译自然流畅，符合目标语言的表达习惯
4. 必须输出完整的翻译，不能在句中截断"""

SUPPORTED_LANGUAGES = {
    "zh": "中文",
    "en": "英语",
    "ja": "日语",
    "ko": "韩语",
    "fr": "法语",
    "de": "德语",
    "es": "西班牙语",
    "ru": "俄语",
    "ar": "阿拉伯语",
    "pt": "葡萄牙语",
    "it": "意大利语",
    "th": "泰语",
    "vi": "越南语",
}


def get_language_name(code: str) -> str:
    return SUPPORTED_LANGUAGES.get(code, code)


async def translate_content(content: str, target_lang: str, source_lang: str | None = None) -> str:
    provider = get_provider()
    target_name = get_language_name(target_lang)

    if source_lang:
        source_name = get_language_name(source_lang)
        lang_instruction = f"将以下{source_name}内容翻译为{target_name}"
    else:
        lang_instruction = f"将以下内容翻译为{target_name}，请先自动识别原文语言"

    chunks = chunk_content(content, max_chars=5000)

    if len(chunks) == 1:
        user_prompt = f"{lang_instruction}：\n\n{chunks[0]}"
        result = await provider.safe_chat(TRANSLATE_SYSTEM_PROMPT, user_prompt)
        return result.strip()

    logger.info(f"Document split into {len(chunks)} chunks for translation")
    translated_parts = []
    for i, chunk in enumerate(chunks):
        user_prompt = f"{lang_instruction}（第{i+1}/{len(chunks)}部分）：\n\n{chunk}"
        try:
            translated = await provider.safe_chat(TRANSLATE_SYSTEM_PROMPT, user_prompt)
            translated_parts.append(translated.strip())
        except Exception as e:
            logger.warning(f"Failed to translate chunk {i+1}: {e}")
            translated_parts.append(chunk)

    return "\n\n".join(translated_parts)


def detect_language_prompt(content: str) -> str:
    sample = content[:500] if len(content) > 500 else content
    return f"""请识别以下文本的语言，只返回语言代码（如zh/en/ja/ko/fr/de/es/ru/ar/pt/it/th/vi），不要返回其他内容：

{sample}"""
