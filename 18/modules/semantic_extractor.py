import logging
import json
import re
from typing import List, Dict, Any, Optional, Tuple
import jieba
from jieba import analyse
from sklearn.feature_extraction.text import TfidfVectorizer
from config import settings
from .ai_client import ai_client
from models import SemanticFeature

logger = logging.getLogger(__name__)


class SemanticExtractor:
    """语义抽取模块 - 提取文本的语义特征"""

    def __init__(self):
        self.allowed_categories = settings.DEFAULT_CATEGORIES
        self._init_jieba()
        logger.info("语义抽取模块初始化完成")

    def _init_jieba(self):
        """初始化结巴分词"""
        analyse.set_stop_words("stop_words.txt")
        jieba.initialize()

    def extract_keywords_tfidf(self, text: str, top_k: int = 20) -> List[str]:
        """使用TF-IDF提取关键词"""
        try:
            keywords = analyse.extract_tags(text, topK=top_k, withWeight=False)
            logger.debug(f"TF-IDF关键词提取完成: {len(keywords)}个关键词")
            return keywords
        except Exception as e:
            logger.error(f"TF-IDF关键词提取失败: {str(e)}")
            return []

    def extract_keywords_textrank(self, text: str, top_k: int = 20) -> List[str]:
        """使用TextRank提取关键词"""
        try:
            keywords = analyse.textrank(text, topK=top_k, withWeight=False)
            logger.debug(f"TextRank关键词提取完成: {len(keywords)}个关键词")
            return keywords
        except Exception as e:
            logger.error(f"TextRank关键词提取失败: {str(e)}")
            return []

    async def extract_keywords_ai(self, text: str, top_k: int = 20) -> List[str]:
        """使用AI提取关键词"""
        try:
            messages = [
                {
                    "role": "system",
                    "content": "你是专业的文档分析助手。请从给定的文档文本中提取最重要的关键词，以JSON格式返回。"
                },
                {
                    "role": "user",
                    "content": f"请从以下文档文本中提取前{top_k}个最重要的关键词，按重要性排序。\n\n文档内容:\n{text[:4000]}\n\n请以JSON格式返回: {{\"keywords\": [\"关键词1\", \"关键词2\", ...]}}"
                }
            ]

            response, error = await ai_client.generate_chat_completion(
                messages, temperature=0.3, max_tokens=500, response_format="json"
            )

            if error or not response:
                return self.extract_keywords_tfidf(text, top_k)

            result = json.loads(response)
            keywords = result.get("keywords", [])
            logger.info(f"AI关键词提取完成: {len(keywords)}个关键词")
            return keywords[:top_k]

        except Exception as e:
            logger.error(f"AI关键词提取失败: {str(e)}")
            return self.extract_keywords_tfidf(text, top_k)

    async def generate_summary_ai(self, text: str, max_length: int = 300) -> Optional[str]:
        """使用AI生成文档摘要"""
        try:
            truncated_text = text[:8000] if len(text) > 8000 else text

            messages = [
                {
                    "role": "system",
                    "content": "你是专业的文档摘要助手。请为给定的文档生成简洁准确的中文摘要。"
                },
                {
                    "role": "user",
                    "content": f"请为以下文档生成摘要，长度不超过{max_length}字，要求准确概括文档的核心内容和要点。\n\n文档内容:\n{truncated_text}"
                }
            ]

            response, error = await ai_client.generate_chat_completion(
                messages, temperature=0.5, max_tokens=max_length
            )

            if error or not response:
                return self._generate_summary_extractive(text, max_length)

            logger.info(f"AI摘要生成完成，长度: {len(response)}")
            return response.strip()

        except Exception as e:
            logger.error(f"AI摘要生成失败: {str(e)}")
            return self._generate_summary_extractive(text, max_length)

    def _generate_summary_extractive(self, text: str, max_length: int = 300) -> str:
        """抽取式摘要（ fallback 方法）"""
        sentences = re.split(r'[。！？\n]', text)
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            return text[:max_length]

        vectorizer = TfidfVectorizer()
        try:
            tfidf_matrix = vectorizer.fit_transform(sentences)
            sentence_scores = tfidf_matrix.sum(axis=1).A1
            top_indices = sentence_scores.argsort()[-3:][::-1]
            top_sentences = [sentences[i] for i in sorted(top_indices)]
            summary = "。".join(top_sentences) + "。"
            return summary[:max_length]
        except Exception as e:
            logger.error(f"抽取式摘要生成失败: {str(e)}")
            return text[:max_length]

    async def extract_topics(self, text: str, keywords: List[str]) -> List[str]:
        """提取文档主题"""
        try:
            if not keywords:
                return []

            messages = [
                {
                    "role": "system",
                    "content": "你是专业的主题分析助手。请根据给定的关键词列表归纳出文档的主题。"
                },
                {
                    "role": "user",
                    "content": f"请根据以下关键词归纳文档的2-5个主题，以JSON格式返回。\n\n关键词: {', '.join(keywords)}\n\n返回格式: {{\"topics\": [\"主题1\", \"主题2\", ...]}}"
                }
            ]

            response, error = await ai_client.generate_chat_completion(
                messages, temperature=0.3, max_tokens=300, response_format="json"
            )

            if error or not response:
                return keywords[:5]

            result = json.loads(response)
            topics = result.get("topics", [])
            logger.info(f"主题提取完成: {topics}")
            return topics

        except Exception as e:
            logger.error(f"主题提取失败: {str(e)}")
            return keywords[:5]

    async def extract_entities(self, text: str) -> List[Dict[str, Any]]:
        """提取命名实体"""
        try:
            truncated_text = text[:8000] if len(text) > 8000 else text

            messages = [
                {
                    "role": "system",
                    "content": "你是专业的实体提取助手。请从文档中提取命名实体，包括人名、组织名、地名、日期、金额等。"
                },
                {
                    "role": "user",
                    "content": f"请从以下文档中提取命名实体，以JSON格式返回。\n\n文档内容:\n{truncated_text}\n\n返回格式: {{\"entities\": [{{\"text\": \"实体文本\", \"type\": \"实体类型\"}}]}}"
                }
            ]

            response, error = await ai_client.generate_chat_completion(
                messages, temperature=0.2, max_tokens=1000, response_format="json"
            )

            if error or not response:
                return self._extract_entities_rule_based(text)

            result = json.loads(response)
            entities = result.get("entities", [])
            logger.info(f"实体提取完成: {len(entities)}个实体")
            return entities

        except Exception as e:
            logger.error(f"实体提取失败: {str(e)}")
            return self._extract_entities_rule_based(text)

    def _extract_entities_rule_based(self, text: str) -> List[Dict[str, Any]]:
        """基于规则的实体提取（ fallback 方法）"""
        entities = []

        date_pattern = r'\d{4}年\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}'
        dates = re.findall(date_pattern, text)
        for date in dates[:10]:
            entities.append({"text": date, "type": "DATE"})

        org_pattern = r'[A-Z][a-zA-Z]*公司|[\u4e00-\u9fa5]{2,}(公司|集团|有限公司|股份有限公司|大学|学院|研究院)'
        orgs = re.findall(org_pattern, text)
        for org in orgs[:10]:
            if isinstance(org, tuple):
                org = org[0]
            entities.append({"text": org, "type": "ORG"})

        return entities

    async def analyze_sentiment(self, text: str) -> float:
        """分析文本情感倾向"""
        try:
            truncated_text = text[:4000] if len(text) > 4000 else text

            messages = [
                {
                    "role": "system",
                    "content": "你是专业的情感分析助手。请分析文档的情感倾向，返回-1到1之间的数值，-1表示非常负面，0表示中性，1表示非常正面。"
                },
                {
                    "role": "user",
                    "content": f"请分析以下文档的情感倾向，只返回一个数值。\n\n文档内容:\n{truncated_text}\n\n返回格式: {{\"sentiment\": 0.5}}"
                }
            ]

            response, error = await ai_client.generate_chat_completion(
                messages, temperature=0.1, max_tokens=100, response_format="json"
            )

            if error or not response:
                return 0.0

            result = json.loads(response)
            sentiment = float(result.get("sentiment", 0.0))
            sentiment = max(-1.0, min(1.0, sentiment))
            logger.info(f"情感分析完成: {sentiment}")
            return sentiment

        except Exception as e:
            logger.error(f"情感分析失败: {str(e)}")
            return 0.0

    async def extract(
        self,
        document_id: int,
        text: str,
        extract_embedding: bool = True
    ) -> SemanticFeature:
        """执行完整的语义抽取流程"""
        logger.info(f"开始语义抽取: 文档ID={document_id}")

        keywords = await self.extract_keywords_ai(text, top_k=20)
        if not keywords:
            keywords = self.extract_keywords_tfidf(text, top_k=20)

        summary = await self.generate_summary_ai(text)
        topics = await self.extract_topics(text, keywords)
        entities = await self.extract_entities(text)
        sentiment = await self.analyze_sentiment(text)

        embedding = None
        if extract_embedding:
            embedding, error = await ai_client.generate_embedding(text)
            if error:
                logger.warning(f"向量生成失败，将跳过: {error}")

        feature = SemanticFeature(
            document_id=document_id,
            keywords=keywords,
            summary=summary,
            topics=topics,
            entities=entities,
            embedding=embedding,
            sentiment=sentiment
        )

        logger.info(f"语义抽取完成: 文档ID={document_id}, 关键词数={len(keywords)}")
        return feature


semantic_extractor = SemanticExtractor()
