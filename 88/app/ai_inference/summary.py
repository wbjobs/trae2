from loguru import logger
from app.ai_inference.base import get_provider, chunk_content

SUMMARY_SYSTEM_PROMPT = """你是一个专业的文档摘要生成助手。请根据用户提供的文档内容，生成一段简洁、准确、信息完整的摘要。
要求：
1. 摘要应涵盖文档的核心观点和关键信息
2. 语言简洁明了，避免冗余
3. 保持客观中立的表述
4. 摘要长度控制在200-500字之间
5. 如果文档内容过短，摘要长度可适当缩短
6. 必须生成完整的摘要，不能在句中截断"""

MERGE_SUMMARY_SYSTEM_PROMPT = """你是一个专业的文档摘要整合助手。以下是文档各部分的摘要，请将它们整合为一段连贯、完整的整体摘要。
要求：
1. 去除各部分摘要间的重复内容
2. 保持逻辑连贯和信息完整
3. 整体摘要控制在200-500字之间
4. 必须生成完整的摘要，不能在句中截断"""


async def generate_summary(content: str) -> str:
    provider = get_provider()
    chunks = chunk_content(content, max_chars=6000)

    if len(chunks) == 1:
        user_prompt = f"请为以下文档内容生成摘要：\n\n{chunks[0]}"
        result = await provider.safe_chat(SUMMARY_SYSTEM_PROMPT, user_prompt)
        return result.strip()

    logger.info(f"Document split into {len(chunks)} chunks for summary generation")
    partial_summaries = []
    for i, chunk in enumerate(chunks):
        user_prompt = f"请为以下文档内容（第{i+1}/{len(chunks)}部分）生成摘要：\n\n{chunk}"
        try:
            partial = await provider.safe_chat(SUMMARY_SYSTEM_PROMPT, user_prompt)
            partial_summaries.append(partial.strip())
        except Exception as e:
            logger.warning(f"Failed to generate summary for chunk {i+1}: {e}")

    if not partial_summaries:
        raise RuntimeError("All chunk summary generations failed")

    if len(partial_summaries) == 1:
        return partial_summaries[0]

    combined = "\n\n".join(
        f"【第{i+1}部分摘要】\n{s}" for i, s in enumerate(partial_summaries)
    )
    merge_prompt = f"请将以下各部分摘要整合为一段完整的摘要：\n\n{combined}"
    merged = await provider.safe_chat(MERGE_SUMMARY_SYSTEM_PROMPT, merge_prompt)
    return merged.strip()
