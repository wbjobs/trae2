"""
故障文本解析模块 - 优化版
负责故障描述文本的预处理、分词、关键词提取
优化点：长文本分段解析、智能截断、细粒度异常捕获、增强词典
"""

import re
import jieba
import jieba.analyse
from typing import List, Optional, Tuple
from loguru import logger

from src.models import ParsedTextResult, TextParsingRequest


class TextParser:
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.max_text_length = self.config.get("max_text_length", 2000)
        self.min_text_length = self.config.get("min_text_length", 5)
        self.segment_length = self.config.get("segment_length", 300)
        self.stop_words = self._load_stop_words()
        self._init_jieba()

    def _init_jieba(self):
        custom_words = [
            "电机过热", "轴承损坏", "传感器故障", "液压泄漏", "PLC通信",
            "驱动器报警", "输送带卡滞", "冷却系统", "润滑系统", "压力不足",
            "伺服驱动器", "变频器", "气缸", "液压油", "空压机",
            "温度传感器", "压力传感器", "编码器", "接触器", "继电器",
            "限位开关", "电磁阀", "减速器", "齿轮箱", "联轴器",
            "刹车器", "离合器", "导轨", "丝杠", "皮带轮",
            "链条", "链轮", "油封", "密封圈", "滤芯",
            "过滤网", "散热器", "换热器", "冷却塔", "真空泵",
            "离心泵", "齿轮泵", "螺杆泵", "柱塞泵", "叶片泵",
            "步进电机", "伺服电机", "异步电机", "同步电机", "直流电机",
            "PLC模块", "IO模块", "通信模块", "模拟量模块", "数字量模块",
            "触摸屏", "人机界面", "工控机", "工业电脑", "数控系统",
            "过载保护", "过流保护", "过压保护", "欠压保护", "短路保护",
            "接地故障", "绝缘故障", "断线故障", "接触不良", "接线松动"
        ]
        for word in custom_words:
            jieba.add_word(word)
        logger.info(f"自定义词典加载完成，共 {len(custom_words)} 个工业领域术语")

    def _load_stop_words(self) -> set:
        default_stop_words = {
            "的", "了", "在", "是", "我", "有", "和", "就", "不", "人",
            "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去",
            "你", "会", "着", "没有", "看", "好", "自己", "这", "他", "她",
            "它", "们", "那", "些", "什么", "怎么", "为什么", "如何",
            "可以", "可能", "应该", "需要", "但", "但是", "而", "而且",
            "如果", "因为", "所以", "虽然", "然后", "还是", "或者",
            "一下", "一些", "有点", "一些", "时候", "地方", "东西",
            "这个", "那个", "这里", "那里", "现在", "以后", "以前",
            "大概", "大约", "左右", "差不多", "可能", "大概",
            "请", "谢谢", "您好", "麻烦", "帮忙", "看看", "检查"
        }
        return default_stop_words

    def _clean_text(self, text: str) -> str:
        try:
            text = text.strip()
            text = re.sub(r'[^\u4e00-\u9fff\u0030-\u0039\u0041-\u005a\u0061-\u007a\s#\-]', '', text)
            text = re.sub(r'\s+', ' ', text)
            text = re.sub(r'[，。！？、；：""''（）《》【】\[\]【】,.;:!?()"\']', ' ', text)
            return text.strip()
        except Exception as e:
            logger.warning(f"文本清洗失败，返回原始文本: {e}")
            return text.strip()

    def _tokenize(self, text: str) -> List[str]:
        try:
            tokens = jieba.lcut(text)
            tokens = [
                token.strip() for token in tokens
                if token.strip() and token.strip() not in self.stop_words
                and len(token.strip()) >= 2
            ]
            return tokens
        except Exception as e:
            logger.warning(f"分词失败: {e}")
            return []

    def _extract_keywords(self, text: str, top_k: int = 15) -> List[str]:
        try:
            keywords = jieba.analyse.extract_tags(text, topK=top_k, withWeight=False, allowPOS=('n', 'vn', 'v'))
            return keywords
        except Exception as e:
            logger.warning(f"TF-IDF关键词提取失败: {e}")
            return []

    def _extract_textrank_keywords(self, text: str, top_k: int = 15) -> List[str]:
        try:
            keywords = jieba.analyse.textrank(text, topK=top_k, withWeight=False, allowPOS=('n', 'vn', 'v'))
            return keywords
        except Exception as e:
            logger.warning(f"TextRank关键词提取失败: {e}")
            return []

    def _extract_device_info(self, text: str, device_id: Optional[str] = None,
                              device_type: Optional[str] = None) -> dict:
        try:
            device_info = {}
            if device_id:
                device_info["device_id"] = device_id
            if device_type:
                device_info["device_type"] = device_type

            device_patterns = [
                (r'[#]([A-Za-z0-9_-]+)', 'device_id'),
                (r'设备[:：]?\s*([A-Za-z0-9\u4e00-\u9fff]{2,20})', 'device_name'),
                (r'型号[:：]?\s*([A-Za-z0-9-]{2,30})', 'model'),
                (r'工位[:：]?\s*([A-Za-z0-9\u4e00-\u9fff]{1,20})', 'station'),
                (r'编号[:：]?\s*([A-Za-z0-9-]{2,20})', 'serial_number'),
                (r'生产线[:：]?\s*([A-Za-z0-9\u4e00-\u9fff]{1,30})', 'production_line')
            ]

            for pattern, key in device_patterns:
                match = re.search(pattern, text)
                if match and key not in device_info:
                    device_info[key] = match.group(1)

            return device_info if device_info else None
        except Exception as e:
            logger.warning(f"设备信息提取失败: {e}")
            return None

    def _split_long_text(self, text: str) -> List[str]:
        if len(text) <= self.segment_length:
            return [text]

        segments = []
        sentences = re.split(r'[。！？；\n]', text)
        current_segment = ""

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            if len(current_segment) + len(sentence) + 1 <= self.segment_length:
                current_segment += sentence + " "
            else:
                if current_segment:
                    segments.append(current_segment.strip())
                current_segment = sentence + " "

        if current_segment:
            segments.append(current_segment.strip())

        logger.info(f"长文本分段完成: {len(text)}字符 -> {len(segments)}段")
        return segments

    def _parse_segment(self, text: str) -> Tuple[List[str], List[str], str]:
        try:
            cleaned = self._clean_text(text)
            tokens = self._tokenize(cleaned)
            keywords_tfidf = self._extract_keywords(cleaned)
            keywords_textrank = self._extract_textrank_keywords(cleaned)
            keywords = list(dict.fromkeys(keywords_tfidf + keywords_textrank))
            return tokens, keywords, cleaned
        except Exception as e:
            logger.warning(f"段落解析失败: {e}")
            return [], [], text

    def parse(self, request: TextParsingRequest) -> ParsedTextResult:
        try:
            original_text = request.text
            text_length = len(original_text)

            if text_length < self.min_text_length:
                logger.error(f"文本长度不足: {text_length} < {self.min_text_length}")
                raise ValueError(f"故障描述文本长度不足，至少需要{self.min_text_length}个字符")

            is_long_text = text_length > self.max_text_length
            effective_text = original_text[:self.max_text_length] if is_long_text else original_text

            if is_long_text:
                logger.warning(f"文本超过最大长度限制，截断处理: {text_length} > {self.max_text_length}")

            segments = self._split_long_text(effective_text)

            all_tokens = []
            all_keywords = []
            cleaned_segments = []

            for i, segment in enumerate(segments):
                tokens, keywords, cleaned = self._parse_segment(segment)
                all_tokens.extend(tokens)
                all_keywords.extend(keywords)
                cleaned_segments.append(cleaned)

            all_tokens = list(dict.fromkeys(all_tokens))[:50]
            all_keywords = list(dict.fromkeys(all_keywords))[:20]
            cleaned_text = " ".join(cleaned_segments)

            try:
                device_info = self._extract_device_info(original_text, request.device_id, request.device_type)
            except Exception as e:
                logger.warning(f"设备信息提取异常，继续处理: {e}")
                device_info = None

            result = ParsedTextResult(
                original_text=effective_text,
                cleaned_text=cleaned_text,
                keywords=all_keywords,
                tokens=all_tokens,
                device_info=device_info
            )

            logger.info(f"文本解析完成: 长度={text_length}, 分段={len(segments)}, "
                        f"关键词={len(all_keywords)}个, 分词={len(all_tokens)}个")
            return result

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"文本解析异常，尝试降级处理: {str(e)}")
            try:
                cleaned = self._clean_text(original_text[:self.max_text_length])
                return ParsedTextResult(
                    original_text=original_text[:self.max_text_length],
                    cleaned_text=cleaned,
                    keywords=[],
                    tokens=[],
                    device_info=None
                )
            except Exception as e2:
                logger.error(f"降级处理也失败: {str(e2)}")
                raise RuntimeError(f"文本解析失败: {str(e)}")

    async def parse_async(self, request: TextParsingRequest) -> ParsedTextResult:
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.parse, request)

    def parse_batch(self, requests: List[TextParsingRequest]) -> List[ParsedTextResult]:
        results = []
        for request in requests:
            try:
                result = self.parse(request)
                results.append(result)
            except Exception as e:
                logger.error(f"批量解析失败: {str(e)}")
                results.append(ParsedTextResult(
                    original_text=request.text[:self.max_text_length],
                    cleaned_text="",
                    keywords=[],
                    tokens=[],
                    device_info=None
                ))
        return results