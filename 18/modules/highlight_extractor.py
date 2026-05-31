import logging
import json
import re
from typing import List, Dict, Any, Tuple
from collections import defaultdict
from datetime import datetime
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from config import settings
from .ai_client import ai_client

logger = logging.getLogger(__name__)


class HighlightExtractor:
    """关键信息高亮提取器 - 提取关键段落、重要句子、核心术语"""

    def __init__(self):
        self.max_paragraphs = getattr(settings, 'MAX_HIGHLIGHT_PARAGRAPHS', 5)
        self.max_sentences = getattr(settings, 'MAX_HIGHLIGHT_SENTENCES', 10)
        self.min_sentence_length = getattr(settings, 'MIN_SENTENCE_LENGTH', 20)
        self.use_ai_highlight = getattr(settings, 'USE_AI_HIGHLIGHT', True)
        logger.info(f"高亮提取器初始化完成, 最大段落数: {self.max_paragraphs}, 最大句子数: {self.max_sentences}")

    def _split_paragraphs(self, text: str) -> List[str]:
        """分割文本为段落"""
        paragraphs = re.split(r'\n\s*\n', text)
        return [p.strip() for p in paragraphs if p.strip() and len(p.strip()) > 20]

    def _split_sentences(self, text: str) -> List[str]:
        """分割文本为句子"""
        sentences = re.split(r'[。！？!?\n]+', text)
        return [s.strip() for s in sentences if s.strip() and len(s.strip()) > self.min_sentence_length]

    def _calculate_tfidf_scores(self, texts: List[str]) -> np.ndarray:
        """计算TF-IDF得分"""
        if len(texts) < 2:
            return np.array([1.0] * len(texts))

        try:
            vectorizer = TfidfVectorizer(
                max_features=1000,
                stop_words=None
            )
            tfidf_matrix = vectorizer.fit_transform(texts)
            scores = tfidf_matrix.sum(axis=1).A1
            return scores / scores.max() if scores.max() > 0 else scores
        except Exception as e:
            logger.warning(f"TF-IDF计算失败: {e}")
            return np.array([1.0] * len(texts))

    def _calculate_position_scores(self, n_items: int) -> np.ndarray:
        """计算位置权重（首段首句权重更高）"""
        scores = np.exp(-np.arange(n_items) * 0.1)
        return scores / scores.max()

    def _extract_keywords_from_text(self, text: str, top_k: int = 20) -> List[str]:
        """从文本中提取关键词"""
        try:
            from jieba import analyse
            keywords = analyse.extract_tags(text, topK=top_k, withWeight=False)
            return keywords
        except Exception:
            words = re.findall(r'[\u4e00-\u9fa5]{2,}|[a-zA-Z]+', text)
            freq = defaultdict(int)
            for word in words:
                if len(word) >= 2:
                    freq[word] += 1
            return [word for word, _ in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:top_k]]

    def _rule_based_highlights(
        self,
        text: str,
        keywords: List[str],
        max_paragraphs: int,
        max_sentences: int
    ) -> Dict[str, Any]:
        """基于规则的高亮提取"""
        result = {
            "key_paragraphs": [],
            "key_sentences": [],
            "important_terms": [],
            "title_highlights": [],
            "confidence_scores": {
                "paragraphs": 0.7,
                "sentences": 0.7,
                "terms": 0.8
            }
        }

        paragraphs = self._split_paragraphs(text)
        sentences = self._split_sentences(text)

        if paragraphs:
            tfidf_scores = self._calculate_tfidf_scores(paragraphs)
            position_scores = self._calculate_position_scores(len(paragraphs))
            combined_scores = tfidf_scores * 0.6 + position_scores * 0.4

            keyword_scores = []
            for para in paragraphs:
                kw_count = sum(1 for kw in keywords if kw in para)
                keyword_scores.append(kw_count / max(1, len(keywords)))

            combined_scores = combined_scores * 0.7 + np.array(keyword_scores) * 0.3

            top_indices = np.argsort(combined_scores)[-max_paragraphs:][::-1]
            result["key_paragraphs"] = [
                {
                    "text": paragraphs[i],
                    "score": float(combined_scores[i]),
                    "position": i + 1
                }
                for i in sorted(top_indices)
            ]

        if sentences:
            tfidf_scores = self._calculate_tfidf_scores(sentences)
            position_scores = self._calculate_position_scores(len(sentences))
            combined_scores = tfidf_scores * 0.6 + position_scores * 0.4

            keyword_scores = []
            for sent in sentences:
                kw_count = sum(1 for kw in keywords if kw in sent)
                keyword_scores.append(kw_count / max(1, len(keywords)))

            combined_scores = combined_scores * 0.7 + np.array(keyword_scores) * 0.3

            top_indices = np.argsort(combined_scores)[-max_sentences:][::-1]
            result["key_sentences"] = [
                {
                    "text": sentences[i],
                    "score": float(combined_scores[i]),
                    "position": i + 1
                }
                for i in sorted(top_indices)
            ]

        all_keywords = self._extract_keywords_from_text(text, top_k=30)
        result["important_terms"] = [
            {"term": kw, "score": 1.0 - i * 0.03}
            for i, kw in enumerate(all_keywords[:20])
        ]

        title_patterns = [
            r'##\s*([^\n]+)',
            r'第[一二三四五六七八九十百千]+[章节条款]',
            r'^[一二三四五六七八九十]+[、. ][^\n]+',
            r'^\d+\.\s*[^\n]+',
        ]

        for pattern in title_patterns:
            matches = re.findall(pattern, text, re.MULTILINE)
            result["title_highlights"].extend(matches[:5])

        result["title_highlights"] = list(dict.fromkeys(result["title_highlights"]))[:5]

        return result

    async def _ai_based_highlights(
        self,
        text: str,
        summary: str,
        keywords: List[str],
        max_paragraphs: int,
        max_sentences: int
    ) -> Optional[Dict[str, Any]]:
        """基于AI的高亮提取"""
        try:
            truncated_text = text[:6000] if len(text) > 6000 else text

            system_prompt = """你是专业的文档分析专家。请从给定的文档中提取关键信息，包括：
1. 关键段落（最能代表文档核心内容的段落）
2. 重要句子（文档中的核心观点和结论）
3. 重要术语（文档中反复出现的专业词汇）
4. 置信度评分（0-1之间，表示对提取结果的信心）

请严格按照JSON格式返回结果。"""

            user_prompt = f"""请分析以下文档并提取关键信息：

文档摘要: {summary or "无"}

文档关键词: {', '.join(keywords[:15]) if keywords else "无"}

文档内容:
{truncated_text}

返回格式要求:
{{
  "key_paragraphs": [
    {{"text": "段落内容", "score": 0.9, "reason": "提取原因"}}
  ],
  "key_sentences": [
    {{"text": "句子内容", "score": 0.85, "reason": "提取原因"}}
  ],
  "important_terms": [
    {{"term": "术语", "score": 0.9}}
  ],
  "confidence_scores": {{
    "paragraphs": 0.85,
    "sentences": 0.8,
    "terms": 0.9
  }}
}}

提取数量要求: 关键段落不超过{max_paragraphs}个，重要句子不超过{max_sentences}个，重要术语不超过20个。"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]

            response, error = await ai_client.generate_chat_completion(
                messages, temperature=0.3, max_tokens=2000, response_format="json"
            )

            if error or not response:
                return None

            result = json.loads(response)

            for para in result.get("key_paragraphs", [])[:max_paragraphs]:
                if "position" not in para:
                    para["position"] = 0

            for sent in result.get("key_sentences", [])[:max_sentences]:
                if "position" not in sent:
                    sent["position"] = 0

            logger.info(f"AI高亮提取完成, 关键段落: {len(result.get('key_paragraphs', []))}个")
            return result

        except Exception as e:
            logger.warning(f"AI高亮提取失败，回退到规则方法: {e}")
            return None

    async def extract_highlights(
        self,
        document_id: int,
        text: str,
        summary: Optional[str] = None,
        keywords: Optional[List[str]] = None,
        max_paragraphs: Optional[int] = None,
        max_sentences: Optional[int] = None
    ) -> Dict[str, Any]:
        """提取文档高亮信息"""
        if max_paragraphs is None:
            max_paragraphs = self.max_paragraphs
        if max_sentences is None:
            max_sentences = self.max_sentences

        if keywords is None:
            keywords = self._extract_keywords_from_text(text, top_k=20)

        logger.info(f"开始提取高亮信息: 文档ID={document_id}")

        rule_result = self._rule_based_highlights(
            text, keywords, max_paragraphs, max_sentences
        )

        if self.use_ai_highlight:
            ai_result = await self._ai_based_highlights(
                text, summary or "", keywords, max_paragraphs, max_sentences
            )

            if ai_result:
                final_result = self._merge_results(rule_result, ai_result)
            else:
                final_result = rule_result
        else:
            final_result = rule_result

        final_result["extract_time"] = datetime.now().isoformat()

        logger.info(
            f"高亮提取完成: 文档ID={document_id}, "
            f"关键段落: {len(final_result['key_paragraphs'])}, "
            f"重要句子: {len(final_result['key_sentences'])}"
        )

        return final_result

    def _merge_results(
        self,
        rule_result: Dict[str, Any],
        ai_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """融合规则和AI的提取结果"""
        merged = {
            "key_paragraphs": [],
            "key_sentences": [],
            "important_terms": [],
            "title_highlights": rule_result.get("title_highlights", []),
            "confidence_scores": {}
        }

        rule_paras = {p["text"][:50]: p for p in rule_result.get("key_paragraphs", [])}
        ai_paras = {p["text"][:50]: p for p in ai_result.get("key_paragraphs", [])}

        all_para_keys = set(rule_paras.keys()) | set(ai_paras.keys())
        for key in all_para_keys:
            if key in rule_paras and key in ai_paras:
                merged_para = rule_paras[key].copy()
                merged_para["score"] = (rule_paras[key]["score"] + ai_paras[key].get("score", 0.7)) / 2
                merged_para["source"] = "mixed"
                merged["key_paragraphs"].append(merged_para)
            elif key in rule_paras:
                rule_paras[key]["source"] = "rule"
                merged["key_paragraphs"].append(rule_paras[key])
            else:
                ai_paras[key]["source"] = "ai"
                merged["key_paragraphs"].append(ai_paras[key])

        merged["key_paragraphs"] = sorted(
            merged["key_paragraphs"],
            key=lambda x: x.get("score", 0),
            reverse=True
        )[:self.max_paragraphs]

        rule_sents = {s["text"][:30]: s for s in rule_result.get("key_sentences", [])}
        ai_sents = {s["text"][:30]: s for s in ai_result.get("key_sentences", [])}

        all_sent_keys = set(rule_sents.keys()) | set(ai_sents.keys())
        for key in all_sent_keys:
            if key in rule_sents and key in ai_sents:
                merged_sent = rule_sents[key].copy()
                merged_sent["score"] = (rule_sents[key]["score"] + ai_sents[key].get("score", 0.7)) / 2
                merged_sent["source"] = "mixed"
                merged["key_sentences"].append(merged_sent)
            elif key in rule_sents:
                rule_sents[key]["source"] = "rule"
                merged["key_sentences"].append(rule_sents[key])
            else:
                ai_sents[key]["source"] = "ai"
                merged["key_sentences"].append(ai_sents[key])

        merged["key_sentences"] = sorted(
            merged["key_sentences"],
            key=lambda x: x.get("score", 0),
            reverse=True
        )[:self.max_sentences]

        rule_terms = {t["term"]: t for t in rule_result.get("important_terms", [])}
        ai_terms = {t["term"]: t for t in ai_result.get("important_terms", [])}

        all_term_keys = set(rule_terms.keys()) | set(ai_terms.keys())
        for key in all_term_keys:
            if key in rule_terms and key in ai_terms:
                merged["important_terms"].append({
                    "term": key,
                    "score": (rule_terms[key]["score"] + ai_terms[key].get("score", 0.7)) / 2,
                    "source": "mixed"
                })
            elif key in rule_terms:
                merged["important_terms"].append({
                    "term": key,
                    "score": rule_terms[key]["score"],
                    "source": "rule"
                })
            else:
                merged["important_terms"].append({
                    "term": key,
                    "score": ai_terms[key].get("score", 0.7),
                    "source": "ai"
                })

        merged["important_terms"] = sorted(
            merged["important_terms"],
            key=lambda x: x["score"],
            reverse=True
        )[:20]

        rule_conf = rule_result.get("confidence_scores", {})
        ai_conf = ai_result.get("confidence_scores", {})
        merged["confidence_scores"] = {
            "paragraphs": (rule_conf.get("paragraphs", 0.7) + ai_conf.get("paragraphs", 0.7)) / 2,
            "sentences": (rule_conf.get("sentences", 0.7) + ai_conf.get("sentences", 0.7)) / 2,
            "terms": (rule_conf.get("terms", 0.8) + ai_conf.get("terms", 0.8)) / 2
        }

        return merged


highlight_extractor = HighlightExtractor()
