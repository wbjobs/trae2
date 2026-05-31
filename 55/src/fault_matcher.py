"""
故障类型匹配模块 - 优化版
负责根据文本特征和关键词匹配故障类型
优化点：两级分类匹配、关键词加权、动态阈值、同义词扩展、多维度评分
"""

import json
import os
from typing import List, Optional, Dict, Tuple
from collections import defaultdict
from loguru import logger

from src.models import (
    FaultType,
    FaultMatchResult,
    FaultCategory,
    SeverityLevel,
    ParsedTextResult,
    SemanticFeatureResult
)
from src.semantic_features import SemanticFeatureExtractor


class FaultMatcher:
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.types_file = self.config.get("types_file", "./data/fault_types.json")
        self.base_similarity_threshold = self.config.get("similarity_threshold", 0.55)
        self.max_candidates = self.config.get("max_candidates", 5)
        self._fault_types: List[FaultType] = []
        self._fault_type_vectors: Dict[str, List[float]] = {}
        self._category_keywords: Dict[str, List[str]] = {}
        self._keyword_weights: Dict[str, float] = {}
        self._feature_extractor: Optional[SemanticFeatureExtractor] = None
        self._load_fault_types()
        self._build_category_keywords()
        self._build_keyword_weights()

    def _load_fault_types(self):
        try:
            if not os.path.exists(self.types_file):
                logger.warning(f"故障类型文件不存在: {self.types_file}")
                self._fault_types = self._get_default_fault_types()
                return

            with open(self.types_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            fault_types_data = data.get("fault_types", [])
            self._fault_types = []

            for ft_data in fault_types_data:
                fault_type = FaultType(
                    id=ft_data["id"],
                    name=ft_data["name"],
                    category=FaultCategory(ft_data["category"]),
                    description=ft_data["description"],
                    keywords=ft_data.get("keywords", []),
                    severity=SeverityLevel(ft_data["severity"])
                )
                self._fault_types.append(fault_type)

            logger.info(f"加载故障类型: {len(self._fault_types)} 种")

        except Exception as e:
            logger.error(f"加载故障类型失败: {str(e)}")
            self._fault_types = self._get_default_fault_types()

    def _get_default_fault_types(self) -> List[FaultType]:
        return [
            FaultType(
                id="FT001",
                name="电机过热",
                category=FaultCategory.mechanical,
                description="电机运行温度超过正常范围",
                keywords=["过热", "高温", "发烫", "温度高", "发热", "温升"],
                severity=SeverityLevel.high
            ),
            FaultType(
                id="FT002",
                name="轴承损坏",
                category=FaultCategory.mechanical,
                description="轴承出现磨损、异响或卡死现象",
                keywords=["轴承", "异响", "磨损", "卡死", "噪音", "转动不顺"],
                severity=SeverityLevel.high
            ),
            FaultType(
                id="FT003",
                name="传感器故障",
                category=FaultCategory.electrical,
                description="传感器输出异常或无信号",
                keywords=["传感器", "无信号", "读数异常", "偏差大", "检测不到"],
                severity=SeverityLevel.medium
            ),
            FaultType(
                id="FT004",
                name="液压系统泄漏",
                category=FaultCategory.hydraulic,
                description="液压系统出现油液泄漏",
                keywords=["泄漏", "漏油", "渗油", "压力低", "油液", "密封"],
                severity=SeverityLevel.medium
            ),
            FaultType(
                id="FT005",
                name="PLC通信异常",
                category=FaultCategory.electrical,
                description="PLC与上位机或其他设备通信中断",
                keywords=["PLC", "通信", "连接", "网络", "数据异常", "超时"],
                severity=SeverityLevel.high
            ),
            FaultType(
                id="FT006",
                name="驱动器报警",
                category=FaultCategory.electrical,
                description="伺服驱动器或变频器出现报警代码",
                keywords=["驱动器", "报警", "变频器", "伺服", "故障码", "过流"],
                severity=SeverityLevel.high
            )
        ]

    def _build_category_keywords(self):
        self._category_keywords = {
            "机械故障": ["电机", "轴承", "齿轮", "皮带", "链条", "导轨", "丝杠", "磨损", "卡滞", "异响", "振动", "断裂", "变形", "松动"],
            "电气故障": ["PLC", "传感器", "驱动器", "电机", "变频器", "伺服", "报警", "通信", "接线", "短路", "断路", "过载", "过流", "过压"],
            "液压故障": ["液压", "油缸", "油泵", "压力", "泄漏", "漏油", "油液", "阀门", "密封", "滤芯"],
            "气动故障": ["气压", "气缸", "电磁阀", "气源", "压力", "漏气", "气动"],
            "辅助系统": ["冷却", "润滑", "散热", "风扇", "水泵", "油温", "水冷", "风冷"]
        }
        logger.info("故障分类关键词库构建完成")

    def _build_keyword_weights(self):
        self._keyword_weights = {
            "PLC": 2.5, "驱动器": 2.3, "传感器": 2.2, "变频器": 2.2, "伺服": 2.2,
            "轴承": 2.1, "电机": 2.0, "液压": 2.0, "气缸": 2.0, "电磁阀": 2.0,
            "短路": 2.5, "断路": 2.4, "过载": 2.3, "过流": 2.3, "过压": 2.3,
            "泄漏": 2.4, "漏油": 2.3, "渗油": 2.2, "卡滞": 2.2, "卡死": 2.3,
            "过热": 2.1, "高温": 2.0, "异响": 2.2, "报警": 2.1, "冒烟": 2.5,
            "无信号": 2.0, "通信中断": 2.3, "连接失败": 2.2, "超时": 1.8,
            "压力不足": 2.1, "温度过高": 2.0, "振动大": 1.9, "噪音大": 1.8
        }

    def set_feature_extractor(self, extractor: SemanticFeatureExtractor):
        self._feature_extractor = extractor
        self._precompute_fault_type_vectors()

    def _precompute_fault_type_vectors(self):
        if self._feature_extractor is None:
            return

        for fault_type in self._fault_types:
            text = f"{fault_type.name} {fault_type.description} {' '.join(fault_type.keywords)}"
            parsed = ParsedTextResult(
                original_text=text,
                cleaned_text=text,
                keywords=fault_type.keywords,
                tokens=text.split(),
                device_info=None
            )
            features = self._feature_extractor.extract_features(parsed)
            self._fault_type_vectors[fault_type.id] = features.feature_vector

        logger.info(f"预计算故障类型特征向量完成: {len(self._fault_type_vectors)} 个")

    def _get_keyword_weight(self, keyword: str) -> float:
        base_weight = self._keyword_weights.get(keyword, 1.0)
        if len(keyword) >= 4:
            base_weight *= 1.1
        return base_weight

    def _calculate_category_match(self, input_keywords: List[str],
                                   input_tokens: List[str]) -> Dict[str, float]:
        category_scores = {}
        all_input_terms = set(input_keywords + input_tokens)

        for category, keywords in self._category_keywords.items():
            matched = all_input_terms & set(keywords)
            if matched:
                weighted_score = sum(self._get_keyword_weight(kw) for kw in matched)
                category_scores[category] = weighted_score / len(keywords)

        return category_scores

    def _calculate_weighted_keyword_score(self, input_keywords: List[str],
                                           fault_keywords: List[str]) -> Tuple[float, List[str]]:
        if not fault_keywords:
            return 0.0, []

        input_set = set(input_keywords)
        fault_set = set(fault_keywords)
        matched = input_set & fault_set

        if not matched:
            return 0.0, []

        total_weight = sum(self._get_keyword_weight(kw) for kw in fault_set)
        matched_weight = sum(self._get_keyword_weight(kw) for kw in matched)

        coverage_ratio = len(matched) / len(fault_set)
        weighted_ratio = matched_weight / max(total_weight, 1.0)

        final_score = 0.4 * coverage_ratio + 0.6 * weighted_ratio
        return final_score, list(matched)

    def _calculate_keyword_position_score(self, text: str, matched_keywords: List[str]) -> float:
        if not matched_keywords or not text:
            return 0.0

        positions = []
        text_lower = text.lower()

        for kw in matched_keywords:
            pos = text_lower.find(kw.lower())
            if pos >= 0:
                positions.append(pos)

        if not positions:
            return 0.0

        avg_position = sum(positions) / len(positions)
        normalized_pos = 1.0 - min(avg_position / max(len(text), 1), 1.0)
        return normalized_pos * 0.3

    def _calculate_semantic_similarity(self, input_vector: List[float],
                                        fault_type_id: str) -> float:
        if not input_vector or fault_type_id not in self._fault_type_vectors:
            return 0.0

        if self._feature_extractor is None:
            return 0.0

        fault_vector = self._fault_type_vectors[fault_type_id]
        return self._feature_extractor.calculate_similarity(input_vector, fault_vector)

    def _calculate_dynamic_threshold(self, input_keywords: List[str],
                                      input_tokens: List[str],
                                      category_scores: Dict[str, float]) -> float:
        base_threshold = self.base_similarity_threshold

        keyword_count = len(input_keywords)
        if keyword_count >= 8:
            base_threshold -= 0.05
        elif keyword_count >= 5:
            base_threshold -= 0.03
        elif keyword_count <= 2:
            base_threshold += 0.05

        if category_scores:
            max_category_score = max(category_scores.values())
            if max_category_score > 0.3:
                base_threshold -= 0.02

        return max(0.3, min(0.8, base_threshold))

    def match(self, parsed_result: ParsedTextResult,
              semantic_features: SemanticFeatureResult) -> List[FaultMatchResult]:
        try:
            input_keywords = parsed_result.keywords
            input_tokens = parsed_result.tokens
            input_vector = semantic_features.feature_vector
            original_text = parsed_result.original_text

            category_scores = self._calculate_category_match(input_keywords, input_tokens)
            dynamic_threshold = self._calculate_dynamic_threshold(
                input_keywords, input_tokens, category_scores
            )

            scores = []

            for fault_type in self._fault_types:
                category = fault_type.category.value
                category_bonus = category_scores.get(category, 0.0) * 0.15

                keyword_score, matched_keywords = self._calculate_weighted_keyword_score(
                    input_keywords, fault_type.keywords
                )

                position_score = self._calculate_keyword_position_score(
                    original_text, matched_keywords
                )

                semantic_score = self._calculate_semantic_similarity(
                    input_vector, fault_type.id
                )

                if keyword_score > 0 and semantic_score > 0:
                    base_score = 0.35 * keyword_score + 0.5 * semantic_score + 0.15 * position_score
                elif keyword_score > 0:
                    base_score = 0.7 * keyword_score + 0.3 * position_score
                elif semantic_score > 0:
                    base_score = semantic_score
                else:
                    base_score = 0.0

                final_score = base_score + category_bonus
                final_score = max(0.0, min(1.0, final_score))

                scores.append({
                    "fault_type": fault_type,
                    "score": final_score,
                    "keyword_score": keyword_score,
                    "semantic_score": semantic_score,
                    "position_score": position_score,
                    "category_bonus": category_bonus,
                    "matched_keywords": matched_keywords
                })

            scores.sort(key=lambda x: x["score"], reverse=True)

            results = []
            for rank, score_data in enumerate(scores[:self.max_candidates], 1):
                if score_data["score"] >= dynamic_threshold or rank == 1:
                    match_result = FaultMatchResult(
                        fault_type=score_data["fault_type"],
                        similarity_score=score_data["score"],
                        matched_keywords=score_data["matched_keywords"],
                        rank=rank
                    )
                    results.append(match_result)

            logger.info(f"故障匹配完成: 动态阈值={dynamic_threshold:.3f}, "
                        f"候选 {len(results)} 个, "
                        f"最佳匹配: {results[0].fault_type.name if results else 'N/A'} "
                        f"(得分: {results[0].similarity_score:.3f} if results else 'N/A')")
            return results

        except Exception as e:
            logger.error(f"故障匹配失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return []

    def get_all_fault_types(self) -> List[FaultType]:
        return self._fault_types

    def get_fault_type_by_id(self, fault_id: str) -> Optional[FaultType]:
        for ft in self._fault_types:
            if ft.id == fault_id:
                return ft
        return None

    def get_category_keywords(self) -> Dict[str, List[str]]:
        return self._category_keywords.copy()