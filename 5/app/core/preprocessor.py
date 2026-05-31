import re
import html
import hashlib
import jieba
from typing import Optional, List, Dict, Any, Tuple, Set
from collections import OrderedDict
from bs4 import BeautifulSoup
from app.schemas import SchemaField


class TextPreprocessor:
    CHUNK_MAX_CHARS = 3000
    CHUNK_OVERLAP = 200

    def __init__(self):
        self._stopwords = self._load_stopwords()
        self._url_pattern = re.compile(
            r'https?://\S+|www\.\S+|ftp://\S+|file://\S+',
            re.IGNORECASE
        )
        self._email_pattern = re.compile(
            r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
            re.IGNORECASE
        )
        self._phone_pattern = re.compile(
            r'(?:\+?86)?1[3-9]\d{9}|(?:\d{3,4}-)?\d{7,8}'
        )
        self._html_entity_pattern = re.compile(r'&[a-zA-Z]+;|&#\d+;')
        self._special_char_pattern = re.compile(
            r'[^\u4e00-\u9fa5a-zA-Z0-9\s\.,;:!?，。；：！？、""''（）()《》【】\[\]—…\-]'
        )
        self._punctuation_pattern = re.compile(r'([。！？，；：,.!?;:)])\1+')
        self._bracket_space_pattern = re.compile(r'([（(])\s*|\s*([)）])')
        self._sentence_pattern = re.compile(r'[^。！？!?]+[。！？!?]?')
        self._whitespace_pattern = re.compile(r'\s+')
        self._chinese_char_pattern = re.compile(r'[\u4e00-\u9fa5]')
        self._english_char_pattern = re.compile(r'[a-zA-Z]')

    def _load_stopwords(self) -> set:
        default_stopwords = {
            '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
            '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
            '自己', '这', '那', '他', '她', '它', '们', '而', '与', '或', '等', '等等',
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
            'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
            'through', 'during', 'before', 'after', 'above', 'below', 'between',
            'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although',
            'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their'
        }
        return default_stopwords

    def remove_html_tags(self, text: str) -> str:
        if not text:
            return text
        if '<' not in text:
            return text
        try:
            soup = BeautifulSoup(text, 'lxml')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'noscript']):
                tag.decompose()
            for br in soup.find_all('br'):
                br.replace_with('\n')
            for p in soup.find_all(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
                p.append('\n\n')
            result = soup.get_text(separator=' ', strip=True)
            result = self._html_entity_pattern.sub(lambda m: html.unescape(m.group()), result)
            return result
        except Exception:
            return text

    def remove_urls(self, text: str) -> str:
        return self._url_pattern.sub(' ', text)

    def remove_emails(self, text: str) -> str:
        return self._email_pattern.sub(' ', text)

    def remove_phone_numbers(self, text: str) -> str:
        return self._phone_pattern.sub(' ', text)

    def remove_html_entities(self, text: str) -> str:
        return self._html_entity_pattern.sub(lambda m: html.unescape(m.group()), text)

    def remove_special_chars(self, text: str) -> str:
        return self._special_char_pattern.sub(' ', text)

    def normalize_whitespace(self, text: str) -> str:
        text = self._whitespace_pattern.sub(' ', text)
        return text.strip()

    def remove_redundant_punctuation(self, text: str) -> str:
        text = self._punctuation_pattern.sub(r'\1', text)
        text = self._bracket_space_pattern.sub(r'\1\2', text)
        return text

    def remove_duplicate_lines(self, text: str) -> str:
        lines = text.split('\n')
        seen: Set[str] = set()
        unique_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped and stripped not in seen:
                seen.add(stripped)
                unique_lines.append(line)
            elif not stripped:
                unique_lines.append(line)
        return '\n'.join(unique_lines)

    def remove_duplicate_sentences(self, text: str) -> str:
        sentences = self.get_sentences(text)
        seen: Set[str] = set()
        unique = []
        for s in sentences:
            normalized = s.strip()
            if normalized not in seen:
                seen.add(normalized)
                unique.append(s)
        return ''.join(unique)

    def detect_language(self, text: str) -> str:
        chinese_count = len(self._chinese_char_pattern.findall(text))
        english_count = len(self._english_char_pattern.findall(text))
        total = max(chinese_count + english_count, 1)
        if chinese_count / total > 0.5:
            return "zh"
        elif english_count / total > 0.5:
            return "en"
        return "mixed"

    def get_content_hash(self, text: str) -> str:
        return hashlib.md5(text.encode('utf-8')).hexdigest()

    def clean_text(self, text: str) -> str:
        text = self.remove_html_tags(text)
        text = self.remove_html_entities(text)
        text = self.remove_urls(text)
        text = self.remove_emails(text)
        text = self.remove_phone_numbers(text)
        text = self.remove_duplicate_lines(text)
        text = self.remove_special_chars(text)
        text = self.remove_redundant_punctuation(text)
        text = self.normalize_whitespace(text)
        return text

    def extract_keywords(self, text: str, top_k: int = 20) -> List[str]:
        words = jieba.cut(text)
        filtered_words = [
            word for word in words
            if len(word) > 1
            and word not in self._stopwords
            and not word.isspace()
        ]
        word_freq: "OrderedDict[str, int]" = OrderedDict()
        for word in filtered_words:
            word_freq[word] = word_freq.get(word, 0) + 1
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, freq in sorted_words[:top_k]]

    def get_sentences(self, text: str) -> List[str]:
        sentences = self._sentence_pattern.findall(text)
        return [s.strip() for s in sentences if s.strip()]

    def preprocess(self, text: str, extract_keywords: bool = False) -> Dict[str, Any]:
        cleaned_text = self.clean_text(text)
        result: Dict[str, Any] = {
            "original_length": len(text),
            "cleaned_length": len(cleaned_text),
            "cleaned_text": cleaned_text,
            "sentence_count": len(self.get_sentences(cleaned_text)),
            "language": self.detect_language(cleaned_text),
            "content_hash": self.get_content_hash(cleaned_text),
            "deduplicated": len(text) > len(cleaned_text)
        }
        if extract_keywords:
            result["keywords"] = self.extract_keywords(cleaned_text)
        return result

    def compress_by_schema(
        self,
        text: str,
        schema: List[SchemaField],
        max_chars: int = 3000
    ) -> Dict[str, Any]:
        cleaned_text = self.clean_text(text)
        if len(cleaned_text) <= max_chars:
            return {
                "compressed": False,
                "text": cleaned_text,
                "original_length": len(cleaned_text),
                "compressed_length": len(cleaned_text)
            }

        sentences = self.get_sentences(cleaned_text)
        schema_keywords = self._extract_schema_keywords(schema)

        scored_sentences = []
        for i, sentence in enumerate(sentences):
            score = self._score_sentence(sentence, schema_keywords)
            scored_sentences.append((i, score, sentence))

        scored_sentences.sort(key=lambda x: x[1], reverse=True)

        selected = []
        current_length = 0
        for idx, score, sentence in scored_sentences:
            if score == 0 and current_length > max_chars * 0.7:
                continue
            if current_length + len(sentence) + 1 > max_chars:
                break
            selected.append((idx, sentence))
            current_length += len(sentence) + 1

        selected.sort(key=lambda x: x[0])
        compressed_text = "".join(s for _, s in selected)

        return {
            "compressed": True,
            "text": compressed_text,
            "original_length": len(cleaned_text),
            "compressed_length": len(compressed_text),
            "compression_ratio": round(len(compressed_text) / len(cleaned_text), 2),
            "selected_sentences": len(selected),
            "total_sentences": len(sentences)
        }

    def _extract_schema_keywords(self, schema: List[SchemaField]) -> List[str]:
        keywords = []
        for field in schema:
            keywords.append(field.name)
            keywords.extend(self._extract_keywords_from_description(field.description))
            for word in jieba.cut(field.name):
                if len(word) > 1 and word not in self._stopwords:
                    keywords.append(word)
        return list(set(keywords))

    def _extract_keywords_from_description(self, description: str) -> List[str]:
        words = jieba.cut(description)
        return [
            word for word in words
            if len(word) > 1
            and word not in self._stopwords
            and not word.isspace()
        ]

    def _score_sentence(self, sentence: str, schema_keywords: List[str]) -> int:
        score = 0
        sentence_lower = sentence.lower()
        for keyword in schema_keywords:
            if keyword.lower() in sentence_lower:
                score += 2
        if re.search(r'\d', sentence):
            score += 1
        if re.search(r'[姓名年龄电话身份证地址邮箱公司]', sentence):
            score += 1
        return score

    def split_into_chunks(
        self,
        text: str,
        max_chars: int = 3000,
        overlap: int = 200
    ) -> List[str]:
        cleaned_text = self.clean_text(text)
        if len(cleaned_text) <= max_chars:
            return [cleaned_text]

        sentences = self.get_sentences(cleaned_text)
        chunks = []
        current_chunk = []
        current_length = 0

        for sentence in sentences:
            sentence_len = len(sentence)
            if current_length + sentence_len > max_chars and current_chunk:
                chunks.append("".join(current_chunk))
                overlap_text = "".join(current_chunk[-2:]) if len(current_chunk) >= 2 else ""
                current_chunk = [overlap_text] if overlap_text else []
                current_length = len(overlap_text)
            current_chunk.append(sentence)
            current_length += sentence_len

        if current_chunk:
            chunks.append("".join(current_chunk))

        return chunks

    def smart_truncate(
        self,
        text: str,
        max_chars: int = 3000,
        schema: Optional[List[SchemaField]] = None
    ) -> str:
        cleaned_text = self.clean_text(text)
        if len(cleaned_text) <= max_chars:
            return cleaned_text

        if schema:
            result = self.compress_by_schema(cleaned_text, schema, max_chars)
            return result["text"]

        return cleaned_text[:max_chars]


preprocessor = TextPreprocessor()
