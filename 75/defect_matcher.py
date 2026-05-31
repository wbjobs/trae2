import asyncio
import json
import os
import math
import re
from typing import Optional
from collections import Counter, defaultdict

from config import get_settings
from logger import setup_logger
from models import DefectResult, SemanticResult
from data_init import DEFECT_TYPES

logger = setup_logger("defect_matcher")
settings = get_settings()


class NegationDetector:
    def __init__(self):
        self.negation_words = {
            "没有", "无", "没", "未", "不", "否", "非", "不是", "不会", "不要",
            "正常无异", "无异常", "没问题", "一切正常", "良好", "正常",
        }
        self.negation_range = 10

    def check_negation(self, text: str, keyword: str, keyword_pos: int) -> bool:
        check_start = max(0, keyword_pos - self.negation_range)
        context_before = text[check_start:keyword_pos]

        for neg_word in self.negation_words:
            if neg_word in context_before:
                return True
        return False

    def get_keyword_positions(self, text: str, keyword: str) -> list[int]:
        positions = []
        start = 0
        while True:
            pos = text.find(keyword, start)
            if pos == -1:
                break
            positions.append(pos)
            start = pos + 1
        return positions


class TfIdfCalculator:
    def __init__(self):
        self.idf_cache: dict[str, float] = {}
        self._defect_corpus: list[list[str]] = []

    def build_corpus(self, defect_types: list[dict]) -> None:
        self._defect_corpus = []
        all_keywords = []
        for d in defect_types:
            kws = d.get("keywords", [])
            self._defect_corpus.append(kws)
            all_keywords.extend(kws)

        doc_count = len(self._defect_corpus)
        for kw in set(all_keywords):
            doc_with_kw = sum(1 for doc in self._defect_corpus if kw in doc)
            self.idf_cache[kw] = math.log((doc_count + 1) / (doc_with_kw + 1)) + 1

        logger.info(f"TF-IDF corpus built: {len(self._defect_corpus)} docs, {len(self.idf_cache)} terms")

    def get_idf(self, keyword: str) -> float:
        return self.idf_cache.get(keyword, 1.0)

    def get_keyword_weight(self, keyword: str) -> float:
        base_idf = self.get_idf(keyword)
        length_factor = min(1.5, 1.0 + len(keyword) * 0.1)
        return base_idf * length_factor


class PositionWeightCalculator:
    def __init__(self):
        self.position_boost_head = 1.3
        self.position_boost_tail = 1.2
        self.head_ratio = 0.2
        self.tail_ratio = 0.2

    def get_position_weight(self, pos: int, text_len: int) -> float:
        if text_len == 0:
            return 1.0

        ratio = pos / text_len
        if ratio < self.head_ratio:
            decay = 1 - (ratio / self.head_ratio) * 0.3
            return self.position_boost_head * decay
        elif ratio > (1 - self.tail_ratio):
            decay = 1 - ((1 - ratio) / self.tail_ratio) * 0.2
            return self.position_boost_tail * decay
        return 1.0


class DeviceAssociationEngine:
    def __init__(self):
        self.device_defect_map = {
            "变压器": ["D001", "D002", "D003", "D004", "D005"],
            "断路器": ["D003", "D005", "D007", "D008"],
            "隔离开关": ["D002", "D005", "D007"],
            "电缆": ["D002", "D003", "D005", "D004"],
            "互感器": ["D001", "D002", "D003"],
            "电容器": ["D002", "D003", "D005"],
            "避雷器": ["D003", "D005", "D006"],
            "开关柜": ["D002", "D003", "D010"],
            "母线": ["D002", "D005"],
            "接地": ["D006", "D005"],
        }
        self.association_boost = 1.4

    def get_device_boost(self, device_mentions: list[str], defect_code: str) -> float:
        for device in device_mentions:
            for key, codes in self.device_defect_map.items():
                if key in device and defect_code in codes:
                    return self.association_boost
        return 1.0

    def extract_devices(self, text: str, entities: list[dict]) -> list[str]:
        devices = []
        for ent in entities:
            if ent.get("type") == "equipment":
                devices.append(ent.get("value", ""))

        for dev_key in self.device_defect_map.keys():
            if dev_key in text and dev_key not in devices:
                devices.append(dev_key)

        return devices


class RuleEngine:
    def __init__(self):
        self.rules = [
            {
                "name": "combo_overheat",
                "trigger_words": ["过热", "高温", "发热", "温度"],
                "context_words": ["红外", "测温", "烫手"],
                "boost": 1.5,
                "target_defects": ["D002"],
            },
            {
                "name": "combo_discharge",
                "trigger_words": ["放电", "电弧", "火花"],
                "context_words": ["声音", "声响", "听到", "滋滋"],
                "boost": 1.5,
                "target_defects": ["D003"],
            },
            {
                "name": "combo_loose",
                "trigger_words": ["松动", "晃动"],
                "context_words": ["端子", "接线", "螺栓", "连接"],
                "boost": 1.4,
                "target_defects": ["D005", "D006"],
            },
            {
                "name": "combo_rust",
                "trigger_words": ["锈蚀", "腐蚀", "生锈"],
                "context_words": ["接地", "引线", "支架", "外壳"],
                "boost": 1.4,
                "target_defects": ["D005", "D006", "D010"],
            },
            {
                "name": "combo_oil_leak",
                "trigger_words": ["漏油", "渗油", "滴油"],
                "context_words": ["油位", "油浸", "油迹", "油污"],
                "boost": 1.5,
                "target_defects": ["D004"],
            },
        ]

    def apply_rules(self, text: str, keywords: list[str]) -> dict[str, float]:
        boosts: dict[str, float] = defaultdict(float)

        for rule in self.rules:
            trigger_found = any(w in text or w in keywords for w in rule["trigger_words"])
            context_found = any(w in text for w in rule["context_words"])

            if trigger_found and context_found:
                for defect in rule["target_defects"]:
                    boosts[defect] = max(boosts[defect], rule["boost"])

        return boosts


class EnsembleClassifier:
    def __init__(self):
        self.weights = {
            "keyword_exact": 0.35,
            "keyword_fuzzy": 0.20,
            "semantic_similarity": 0.25,
            "rule_engine": 0.20,
        }
        self._confidence_boost = 1.8
        self.negation_detector = NegationDetector()
        self.tfidf = TfIdfCalculator()
        self.position_calc = PositionWeightCalculator()
        self.device_engine = DeviceAssociationEngine()
        self.rule_engine = RuleEngine()

    def initialize(self, defect_types: list[dict]) -> None:
        self.tfidf.build_corpus(defect_types)
        logger.info("Ensemble classifier initialized with weighted components")

    def _compute_keyword_exact_score(
        self,
        text: str,
        keywords: list[str],
        entities: list[dict],
        defect: dict,
    ) -> tuple[float, list[dict]]:
        defect_keywords = defect.get("keywords", [])
        matched_details = []
        total_weight = 0.0
        text_len = len(text)

        device_mentions = self.device_engine.extract_devices(text, entities)
        device_boost = self.device_engine.get_device_boost(
            device_mentions, defect["code"]
        )

        for kw in defect_keywords:
            if kw not in text and kw not in keywords:
                continue

            positions = self.negation_detector.get_keyword_positions(text, kw)
            if not positions:
                positions = [0]

            negated = False
            for pos in positions:
                if self.negation_detector.check_negation(text, kw, pos):
                    negated = True
                    break

            if negated:
                continue

            kw_weight = self.tfidf.get_keyword_weight(kw)
            pos_weight = self.position_calc.get_position_weight(positions[0], text_len)
            final_weight = kw_weight * pos_weight * device_boost

            total_weight += final_weight
            matched_details.append({
                "keyword": kw,
                "tfidf_weight": round(kw_weight, 4),
                "position_weight": round(pos_weight, 4),
                "device_boost": round(device_boost, 4),
                "final_weight": round(final_weight, 4),
                "position": positions[0],
            })

        max_possible = sum(self.tfidf.get_keyword_weight(kw) for kw in defect_keywords)
        if max_possible == 0:
            return 0.0, []

        normalized = min(1.0, total_weight / max_possible)
        return round(normalized, 6), matched_details

    def _compute_keyword_fuzzy_score(
        self, keywords: list[str], defect: dict
    ) -> float:
        defect_keywords = set(defect.get("keywords", []))
        input_keywords = set(keywords)

        if not defect_keywords:
            return 0.0

        intersection = defect_keywords & input_keywords
        union = defect_keywords | input_keywords

        jaccard = len(intersection) / len(union) if union else 0.0

        recall = len(intersection) / len(defect_keywords) if defect_keywords else 0.0
        precision = len(intersection) / len(input_keywords) if input_keywords else 0.0

        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        final_score = 0.5 * jaccard + 0.5 * f1

        return round(final_score, 6)

    def _compute_semantic_score(
        self, text: str, intent: str, severity: str, defect: dict
    ) -> float:
        category = defect.get("category", "")
        category_keywords_map = {
            "绝缘缺陷": ["绝缘", "老化", "碳化"],
            "热缺陷": ["发热", "过热", "高温", "温度"],
            "电气缺陷": ["放电", "电弧", "击穿", "火花"],
            "密封缺陷": ["漏油", "渗油", "油位", "密封"],
            "结构缺陷": ["变形", "断裂", "松动", "脱落", "锈蚀"],
            "接地缺陷": ["接地", "接地线", "接地电阻"],
            "操作缺陷": ["拒动", "拒合", "拒分", "卡涩"],
            "保护缺陷": ["误动", "误跳", "误报"],
            "测量缺陷": ["表计", "指示", "读数", "偏差"],
            "外观缺陷": ["变色", "生锈", "腐蚀", "脏污", "破损"],
        }

        cat_keywords = category_keywords_map.get(category, [])
        if not cat_keywords:
            return 0.3

        match_count = sum(1 for kw in cat_keywords if kw in text)
        category_score = match_count / len(cat_keywords) if cat_keywords else 0.0

        intent_boost = 1.0
        if intent in ["defect_report", "alarm_report"]:
            intent_boost = 1.3
        elif intent == "maintenance_request":
            intent_boost = 1.2

        severity_boost = 1.0
        if severity == "critical":
            severity_boost = 1.4
        elif severity == "major":
            severity_boost = 1.2

        final_score = category_score * intent_boost * severity_boost
        return round(min(1.0, final_score), 6)

    def classify(
        self,
        text: str,
        keywords: list[str],
        entities: list[dict],
        intent: str,
        severity: str,
        defect_types: list[dict],
    ) -> list[tuple[dict, float, list[dict]]]:
        results = []
        rule_boosts = self.rule_engine.apply_rules(text, keywords)

        for defect in defect_types:
            code = defect["code"]

            exact_score, details = self._compute_keyword_exact_score(
                text, keywords, entities, defect
            )
            fuzzy_score = self._compute_keyword_fuzzy_score(keywords, defect)
            semantic_score = self._compute_semantic_score(text, intent, severity, defect)
            rule_boost = rule_boosts.get(code, 1.0)

            weighted_score = (
                exact_score * self.weights["keyword_exact"]
                + fuzzy_score * self.weights["keyword_fuzzy"]
                + semantic_score * self.weights["semantic_similarity"]
            ) * rule_boost * self._confidence_boost

            weighted_score = min(1.0, weighted_score)

            rule_contrib = {
                "method": "rule_engine",
                "exact_score": exact_score,
                "fuzzy_score": fuzzy_score,
                "semantic_score": semantic_score,
                "rule_boost": round(rule_boost, 4),
                "weighted_score": round(weighted_score, 4),
                "matched_keywords": [d["keyword"] for d in details],
            }

            results.append((defect, round(weighted_score, 6), [rule_contrib]))

        results.sort(key=lambda x: x[1], reverse=True)
        return results


class DefectKnowledgeBase:
    def __init__(self, kb_path: str = ""):
        self.kb_path = kb_path or settings.DEFECT_KNOWLEDGE_BASE_PATH
        self.defect_types: list[dict] = []
        self._category_index: dict[str, list[dict]] = {}

    def load(self) -> None:
        if os.path.exists(self.kb_path):
            with open(self.kb_path, "r", encoding="utf-8") as f:
                self.defect_types = json.load(f)
            logger.info(f"Loaded {len(self.defect_types)} defect types from {self.kb_path}")
        else:
            self.defect_types = DEFECT_TYPES
            logger.info(f"Using built-in defect types: {len(self.defect_types)} entries")

        self._build_index()

    def _build_index(self) -> None:
        self._category_index.clear()
        for defect in self.defect_types:
            category = defect.get("category", "")
            if category not in self._category_index:
                self._category_index[category] = []
            self._category_index[category].append(defect)

        logger.info(f"Knowledge base indexed: {len(self._category_index)} categories")

    def get_all_defect_types(self) -> list[dict]:
        return self.defect_types

    def get_defect_by_code(self, code: str) -> Optional[dict]:
        for d in self.defect_types:
            if d["code"] == code:
                return d
        return None


class DefectMatcherModule:
    def __init__(self):
        self._kb = DefectKnowledgeBase()
        self._classifier = EnsembleClassifier()
        self._confidence_threshold = getattr(settings, "DEFECT_CONFIDENCE_THRESHOLD", 0.65)
        logger.info("DefectMatcher module initialized with ensemble classifier")

    async def initialize(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._kb.load)
        await loop.run_in_executor(None, self._classifier.initialize, self._kb.defect_types)
        logger.info("DefectMatcher module fully initialized")

    async def match(
        self, task_id: str, text: str, semantic_result: SemanticResult
    ) -> DefectResult:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            self._classifier.classify,
            text,
            semantic_result.keywords,
            semantic_result.entities,
            semantic_result.intent,
            semantic_result.severity_level,
            self._kb.defect_types,
        )

        if not results:
            logger.info(f"Task {task_id}: No defect matched")
            return DefectResult(task_id=task_id, is_defect=False)

        best_defect, best_confidence, matched_rules = results[0]
        is_defect = best_confidence >= self._confidence_threshold

        top_n = min(3, len(results))
        top_candidates = [
            {
                "code": r[0]["code"],
                "name": r[0]["name"],
                "confidence": r[1],
            }
            for r in results[:top_n]
        ]

        result = DefectResult(
            task_id=task_id,
            defect_type=best_defect["code"],
            defect_name=best_defect["name"],
            defect_category=best_defect["category"],
            confidence=best_confidence,
            matched_rules=matched_rules + [{"top_candidates": top_candidates}],
            is_defect=is_defect,
        )

        logger.info(
            f"Task {task_id}: Defect matched - {best_defect['name']} "
            f"({best_defect['code']}), confidence={best_confidence:.4f}, "
            f"is_defect={is_defect}, top_candidates={top_candidates}"
        )
        return result

    async def get_all_defect_types(self) -> list[dict]:
        return self._kb.get_all_defect_types()

    async def get_defect_by_code(self, code: str) -> Optional[dict]:
        return self._kb.get_defect_by_code(code)

    async def batch_match(
        self, tasks: list[dict]
    ) -> list[DefectResult]:
        coroutines = [
            self.match(t["task_id"], t["text"], t["semantic_result"])
            for t in tasks
        ]
        results = await asyncio.gather(*coroutines, return_exceptions=True)

        processed = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Batch defect match error: {r}")
                processed.append(DefectResult(task_id="error"))
            else:
                processed.append(r)

        return processed
