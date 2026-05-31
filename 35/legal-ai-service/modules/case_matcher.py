import json
import os
import re
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, field
from collections import defaultdict

import numpy as np
from loguru import logger

from config import settings
from .embedding_service import EmbeddingService, EmbeddingResult


@dataclass
class CaseData:
    case_id: str
    case_number: str
    title: str
    court: str
    court_level: str = ""
    case_type: str
    judgment_date: str
    summary: str
    full_text: str
    legal_provisions: List[str] = field(default_factory=list)
    parties: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    cause_of_action: str = ""
    judgment_result: str = ""
    embedding: Optional[np.ndarray] = None
    title_embedding: Optional[np.ndarray] = None
    summary_embedding: Optional[np.ndarray] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "case_id": self.case_id,
            "case_number": self.case_number,
            "title": self.title,
            "court": self.court,
            "court_level": self.court_level,
            "case_type": self.case_type,
            "judgment_date": self.judgment_date,
            "summary": self.summary,
            "full_text": self.full_text,
            "legal_provisions": self.legal_provisions,
            "parties": self.parties,
            "keywords": self.keywords,
            "cause_of_action": self.cause_of_action,
            "judgment_result": self.judgment_result,
        }


@dataclass
class MatchedCase:
    case_data: CaseData
    similarity_score: float
    similarity_details: Dict[str, float] = field(default_factory=dict)
    matched_reasons: List[str] = field(default_factory=list)
    shared_provisions: List[str] = field(default_factory=list)
    shared_keywords: List[str] = field(default_factory=list)
    rank: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "case_data": self.case_data.to_dict(),
            "similarity_score": round(float(self.similarity_score), 4),
            "similarity_details": {k: round(float(v), 4) for k, v in self.similarity_details.items()},
            "matched_reasons": self.matched_reasons,
            "shared_provisions": self.shared_provisions,
            "shared_keywords": self.shared_keywords,
            "rank": self.rank,
        }


class CaseMatcher:
    _instance = None
    _cases: List[CaseData] = []
    _case_embeddings: Optional[np.ndarray] = None
    _title_embeddings: Optional[np.ndarray] = None
    _summary_embeddings: Optional[np.ndarray] = None
    _case_index: Dict[str, CaseData] = {}
    _provision_inverted_index: Dict[str, List[int]] = defaultdict(list)
    _keyword_inverted_index: Dict[str, List[int]] = defaultdict(list)
    _embedding_service: Optional[EmbeddingService] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self._embedding_service = EmbeddingService()
        self._load_cases()
        
        self._similarity_weights = {
            "semantic": 0.35,
            "title": 0.15,
            "summary": 0.20,
            "provisions": 0.20,
            "keywords": 0.05,
            "case_type": 0.03,
            "court_level": 0.02,
        }
        
        logger.info(f"CaseMatcher initialized with {len(self._cases)} cases")

    def _load_cases(self):
        cases_path = settings.CASE_DATA_PATH
        if not os.path.exists(cases_path):
            logger.warning(f"Cases file not found: {cases_path}, using sample data")
            self._cases = self._create_sample_cases()
        else:
            try:
                with open(cases_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._cases = []
                for item in data:
                    case = CaseData(**item)
                    self._enrich_case_data(case)
                    self._cases.append(case)
            except Exception as e:
                logger.error(f"Failed to load cases: {e}")
                self._cases = self._create_sample_cases()

        self._case_index = {c.case_id: c for c in self._cases}
        self._build_inverted_indexes()

    def _build_inverted_indexes(self):
        for idx, case in enumerate(self._cases):
            for prov in case.legal_provisions:
                self._provision_inverted_index[prov].append(idx)
            for keyword in case.keywords:
                self._keyword_inverted_index[keyword].append(idx)

    def _enrich_case_data(self, case: CaseData):
        court_levels = {
            "最高人民法院": "supreme",
            "高级人民法院": "high",
            "中级人民法院": "intermediate",
            "基层人民法院": "primary",
        }
        for level_name, level_code in court_levels.items():
            if level_name in case.court:
                case.court_level = level_code
                break

        result_patterns = {
            "全部支持": [r"全部支持", r"予以支持"],
            "部分支持": [r"部分支持"],
            "驳回": [r"驳回", r"不予支持"],
            "调解": [r"调解", r"调解结案"],
            "撤诉": [r"撤诉", r"撤回起诉"],
        }
        for result, patterns in result_patterns.items():
            for pattern in patterns:
                if re.search(pattern, case.full_text[:5000]):
                    case.judgment_result = result
                    break
            if case.judgment_result:
                break

    @staticmethod
    def _create_sample_cases() -> List[CaseData]:
        return [
            CaseData(
                case_id="case_001",
                case_number="(2023)京01民初100号",
                title="甲科技有限公司与乙贸易有限公司买卖合同纠纷案",
                court="北京市第一中级人民法院",
                court_level="intermediate",
                case_type="民事",
                judgment_date="2023-06-15",
                summary="原告甲科技有限公司与被告乙贸易有限公司签订电子设备买卖合同，原告按约供货后，被告拖欠货款50万元未付。法院判决被告支付货款及违约金5万元。",
                full_text="本院认为，原告与被告签订的《货物买卖合同》系双方真实意思表示，内容不违反法律、行政法规的强制性规定，合法有效，双方均应恪守履行。原告已按合同约定履行供货义务，被告未按约定支付货款，已构成违约，应承担相应的违约责任。判决如下：一、被告乙贸易有限公司于本判决生效之日起十日内向原告甲科技有限公司支付货款500000元；二、被告乙贸易有限公司于本判决生效之日起十日内向原告甲科技有限公司支付违约金50000元。",
                legal_provisions=["民法典第五百七十七条", "民法典第五百八十四条", "民法典第五百八十五条"],
                parties=["甲科技有限公司", "乙贸易有限公司"],
                keywords=["买卖合同", "拖欠货款", "违约金", "逾期付款", "违约责任"],
                cause_of_action="买卖合同纠纷",
                judgment_result="全部支持",
            ),
            CaseData(
                case_id="case_002",
                case_number="(2023)沪02民初200号",
                title="张某与李某民间借贷纠纷案",
                court="上海市第二中级人民法院",
                court_level="intermediate",
                case_type="民事",
                judgment_date="2023-05-20",
                summary="原告张某借款100万元给被告李某，约定月息2%，被告到期未还本金及利息。法院判决被告返还借款本金并按LPR的4倍支付利息。",
                full_text="本院认为，合法的借贷关系受法律保护。原告提供的借条、银行转账凭证等证据足以证明双方之间存在借贷关系，且原告已实际交付借款。被告未按约定还本付息，显属违约。判决如下：一、被告李某于本判决生效之日起十日内归还原告张某借款本金1000000元；二、被告李某于本判决生效之日起十日内支付原告张某利息（以1000000元为基数，按全国银行间同业拆借中心公布的贷款市场报价利率的4倍计算）。",
                legal_provisions=["民法典第六百六十七条", "民法典第六百七十六条", "民法典第六百八十条"],
                parties=["张某", "李某"],
                keywords=["民间借贷", "借款本金", "利息", "LPR", "逾期还款"],
                cause_of_action="民间借贷纠纷",
                judgment_result="全部支持",
            ),
            CaseData(
                case_id="case_003",
                case_number="(2023)粤03民初300号",
                title="王某与深圳某科技有限公司劳动合同纠纷案",
                court="深圳市中级人民法院",
                court_level="intermediate",
                case_type="民事",
                judgment_date="2023-04-10",
                summary="原告王某在被告公司工作3年，被告违法解除劳动合同。法院判决被告支付违法解除劳动合同赔偿金24万元。",
                full_text="本院认为，用人单位解除劳动合同应当符合法律规定的条件和程序。被告以原告严重违反规章制度为由解除劳动合同，但未能提供充分证据证明原告存在违纪事实，应承担举证不能的法律后果。判决如下：一、被告深圳某科技有限公司应于本判决生效之日起三日内支付原告王某违法解除劳动合同赔偿金240000元。",
                legal_provisions=["劳动合同法第四十七条", "劳动合同法第八十七条", "劳动合同法第四十八条"],
                parties=["王某", "深圳某科技有限公司"],
                keywords=["劳动合同", "违法解除", "赔偿金", "举证责任", "规章制度"],
                cause_of_action="劳动合同纠纷",
                judgment_result="全部支持",
            ),
            CaseData(
                case_id="case_004",
                case_number="(2023)浙01民初400号",
                title="杭州某网络科技有限公司与赵某侵害作品信息网络传播权纠纷案",
                court="杭州市中级人民法院",
                court_level="intermediate",
                case_type="知识产权",
                judgment_date="2023-03-25",
                summary="原告享有某影视作品的独家信息网络传播权，被告未经许可在其经营的网站上传播该作品。法院判决被告停止侵权并赔偿经济损失15万元。",
                full_text="本院认为，原告提交的著作权登记证书、授权文件等证据足以证明其享有涉案影视作品的独家信息网络传播权。被告未经许可，擅自在其经营的网站上提供涉案作品的在线播放服务，侵害了原告的信息网络传播权。判决如下：一、被告赵某立即停止侵害原告杭州某网络科技有限公司对涉案影视作品享有的信息网络传播权；二、被告赵某于本判决生效之日起十日内赔偿原告经济损失150000元。",
                legal_provisions=["著作权法第四十八条", "著作权法第四十九条", "著作权法第十条"],
                parties=["杭州某网络科技有限公司", "赵某"],
                keywords=["著作权", "信息网络传播权", "侵权赔偿", "影视作品", "停止侵权"],
                cause_of_action="侵害作品信息网络传播权纠纷",
                judgment_result="全部支持",
            ),
            CaseData(
                case_id="case_005",
                case_number="(2023)京01民初150号",
                title="丙建筑工程有限公司与丁房地产开发有限公司建设工程施工合同纠纷案",
                court="北京市第一中级人民法院",
                court_level="intermediate",
                case_type="民事",
                judgment_date="2023-07-20",
                summary="原告承建被告开发的房地产项目，工程竣工后被告欠付工程款800万元。法院判决被告支付工程款及利息，原告享有建设工程价款优先受偿权。",
                full_text="本院认为，原被告签订的《建设工程施工合同》合法有效。原告已按约完成工程施工并通过竣工验收，被告应按约定支付工程款。判决如下：一、被告丁房地产开发有限公司于本判决生效后十五日内给付原告丙建筑工程有限公司工程款8000000元及利息；二、原告丙建筑工程有限公司在8000000元范围内对涉案工程享有建设工程价款优先受偿权。",
                legal_provisions=["民法典第八百零七条", "民法典第七百八十八条", "民法典第五百七十九条"],
                parties=["丙建筑工程有限公司", "丁房地产开发有限公司"],
                keywords=["建设工程", "工程款", "优先受偿权", "竣工验收", "逾期付款利息"],
                cause_of_action="建设工程施工合同纠纷",
                judgment_result="全部支持",
            ),
        ]

    async def build_vector_index(self):
        if not self._cases:
            logger.warning("No cases to index")
            return

        logger.info("Building enhanced case vector index with multi-level embeddings...")

        full_texts, title_texts, summary_texts = [], [], []
        for case in self._cases:
            combined_text = (
                f"{case.case_type} {case.cause_of_action} "
                f"{case.title} {case.summary} "
                f"{' '.join(case.keywords)} {' '.join(case.legal_provisions)} "
                f"{case.full_text[:1000]}"
            )
            full_texts.append(combined_text)
            title_texts.append(f"{case.cause_of_action} {case.title}")
            summary_texts.append(case.summary)

        logger.info("Generating embeddings for full texts...")
        full_embeddings = await self._embedding_service.encode_batch(full_texts)
        self._case_embeddings = np.array(
            [r.embedding for r in full_embeddings], dtype=np.float32
        )

        logger.info("Generating embeddings for titles...")
        title_embeddings = await self._embedding_service.encode_batch(title_texts)
        self._title_embeddings = np.array(
            [r.embedding for r in title_embeddings], dtype=np.float32
        )

        logger.info("Generating embeddings for summaries...")
        summary_embeddings = await self._embedding_service.encode_batch(summary_texts)
        self._summary_embeddings = np.array(
            [r.embedding for r in summary_embeddings], dtype=np.float32
        )

        for i, (full, title, summary) in enumerate(zip(full_embeddings, title_embeddings, summary_embeddings)):
            self._cases[i].embedding = full.embedding
            self._cases[i].title_embedding = title.embedding
            self._cases[i].summary_embedding = summary.embedding

        logger.info(f"Enhanced vector index built for {len(self._cases)} cases")

    async def match_cases(
        self,
        query_text: str,
        query_embedding: Optional[EmbeddingResult] = None,
        case_type: Optional[str] = None,
        top_k: Optional[int] = None,
        threshold: Optional[float] = None,
        legal_provisions: Optional[List[str]] = None,
        keywords: Optional[List[str]] = None,
    ) -> List[MatchedCase]:
        if self._case_embeddings is None:
            await self.build_vector_index()

        top_k = top_k or settings.TOP_K_CASES
        threshold = threshold or settings.SIMILARITY_THRESHOLD

        candidate_indices = self._get_candidate_indices(
            case_type=case_type,
            legal_provisions=legal_provisions,
            keywords=keywords,
        )

        if not candidate_indices:
            logger.warning("No candidate cases found")
            return []

        logger.info(f"Found {len(candidate_indices)} candidate cases")

        if query_embedding is None:
            query_embedding = await self._embedding_service.encode_text(query_text)

        title_query = await self._embedding_service.encode_text(
            query_text[:500], use_cache=True
        )

        similarities = self._calculate_multi_level_similarity(
            query_embedding.embedding,
            title_query.embedding,
            query_embedding.embedding,
            candidate_indices,
        )

        filtered_cases = []
        for idx, sim in zip(candidate_indices, similarities):
            if sim >= threshold * 0.5:
                filtered_cases.append((idx, sim))

        filtered_cases.sort(key=lambda x: x[1], reverse=True)
        filtered_cases = filtered_cases[:max(top_k * 3, 50)]

        matched_cases = []
        for idx, base_sim in filtered_cases:
            case = self._cases[idx]
            
            detailed_scores = self._calculate_detailed_scores(
                case=case,
                query_text=query_text,
                base_similarity=base_sim,
                query_legal_provisions=legal_provisions or [],
                query_keywords=keywords or [],
            )

            final_score = self._weighted_score(detailed_scores)

            if final_score < threshold:
                continue

            matched_reasons = self._generate_match_reasons_detailed(
                detailed_scores, case, query_text
            )
            shared_provisions = self._find_shared_provisions_detailed(
                legal_provisions or [], case
            )
            shared_keywords = self._find_shared_keywords(keywords or [], case)

            matched_cases.append(
                MatchedCase(
                    case_data=case,
                    similarity_score=final_score,
                    similarity_details=detailed_scores,
                    matched_reasons=matched_reasons,
                    shared_provisions=shared_provisions,
                    shared_keywords=shared_keywords,
                )
            )

        matched_cases.sort(key=lambda x: x.similarity_score, reverse=True)
        matched_cases = matched_cases[:top_k]
        for i, m in enumerate(matched_cases):
            m.rank = i + 1

        logger.info(f"Found {len(matched_cases)} matched cases after ranking")
        return matched_cases

    def _get_candidate_indices(
        self,
        case_type: Optional[str] = None,
        legal_provisions: Optional[List[str]] = None,
        keywords: Optional[List[str]] = None,
    ) -> List[int]:
        candidates = set(range(len(self._cases)))

        if case_type:
            type_candidates = {
                i for i, c in enumerate(self._cases) if c.case_type == case_type
            }
            candidates &= type_candidates

        if legal_provisions:
            provision_candidates = set()
            for prov in legal_provisions:
                if prov in self._provision_inverted_index:
                    provision_candidates.update(self._provision_inverted_index[prov])
            if provision_candidates:
                candidates &= provision_candidates

        if keywords:
            keyword_candidates = set()
            for kw in keywords:
                if kw in self._keyword_inverted_index:
                    keyword_candidates.update(self._keyword_inverted_index[kw])
            if keyword_candidates:
                candidates &= keyword_candidates

        if not candidates and case_type:
            candidates = {
                i for i, c in enumerate(self._cases) if c.case_type == case_type
            }

        return list(candidates) if candidates else list(range(len(self._cases)))

    def _calculate_multi_level_similarity(
        self,
        query_embedding: np.ndarray,
        title_query_embedding: np.ndarray,
        summary_query_embedding: np.ndarray,
        candidate_indices: List[int],
    ) -> np.ndarray:
        candidate_array = np.array(candidate_indices)
        
        full_sims = np.dot(
            self._case_embeddings[candidate_array],
            query_embedding.reshape(-1, 1),
        ).flatten()

        title_sims = np.dot(
            self._title_embeddings[candidate_array],
            title_query_embedding.reshape(-1, 1),
        ).flatten()

        summary_sims = np.dot(
            self._summary_embeddings[candidate_array],
            summary_query_embedding.reshape(-1, 1),
        ).flatten()

        combined_sims = (
            full_sims * 0.5 +
            title_sims * 0.25 +
            summary_sims * 0.25
        )

        return combined_sims

    def _calculate_detailed_scores(
        self,
        case: CaseData,
        query_text: str,
        base_similarity: float,
        query_legal_provisions: List[str],
        query_keywords: List[str],
    ) -> Dict[str, float]:
        scores = {
            "semantic": base_similarity,
            "title": self._title_similarity(query_text, case),
            "summary": self._summary_similarity(query_text, case),
        }

        if query_legal_provisions and case.legal_provisions:
            query_provs = set(query_legal_provisions)
            case_provs = set(case.legal_provisions)
            if query_provs & case_provs:
                scores["provisions"] = len(query_provs & case_provs) / max(len(query_provs), 1)
            else:
                scores["provisions"] = 0.0
        else:
            scores["provisions"] = 0.3

        if query_keywords and case.keywords:
            query_kws = set(query_keywords)
            case_kws = set(case.keywords)
            if query_kws & case_kws:
                scores["keywords"] = len(query_kws & case_kws) / max(len(query_kws), 1)
            else:
                scores["keywords"] = self._fuzzy_keyword_match(query_text, case.keywords)
        else:
            scores["keywords"] = 0.3

        scores["case_type"] = 1.0 if case.case_type in query_text else 0.5
        scores["court_level"] = self._court_level_score(case)

        return scores

    @staticmethod
    def _title_similarity(query_text: str, case: CaseData) -> float:
        import jieba

        query_words = set(jieba.lcut(query_text))
        title_words = set(jieba.lcut(case.title))
        if not query_words or not title_words:
            return 0.0
        return len(query_words & title_words) / max(len(title_words), 1)

    @staticmethod
    def _summary_similarity(query_text: str, case: CaseData) -> float:
        import jieba

        query_words = set(jieba.lcut(query_text))
        summary_words = set(jieba.lcut(case.summary))
        if not query_words or not summary_words:
            return 0.0
        return len(query_words & summary_words) / max(len(summary_words), 1)

    @staticmethod
    def _fuzzy_keyword_match(query_text: str, case_keywords: List[str]) -> float:
        matches = sum(1 for kw in case_keywords if kw in query_text)
        return matches / max(len(case_keywords), 1) if case_keywords else 0.0

    @staticmethod
    def _court_level_score(case: CaseData) -> float:
        level_scores = {
            "supreme": 1.0,
            "high": 0.8,
            "intermediate": 0.6,
            "primary": 0.4,
            "": 0.3,
        }
        return level_scores.get(case.court_level, 0.3)

    def _weighted_score(self, scores: Dict[str, float]) -> float:
        total_weight = 0.0
        weighted_sum = 0.0

        for key, weight in self._similarity_weights.items():
            score = scores.get(key, 0.0)
            weighted_sum += score * weight
            total_weight += weight

        return weighted_sum / total_weight if total_weight > 0 else 0.0

    @staticmethod
    def _generate_match_reasons_detailed(
        scores: Dict[str, float], case: CaseData, query_text: str
    ) -> List[str]:
        reasons = []

        if scores.get("semantic", 0) > 0.7:
            reasons.append(f"案情高度语义相似（相似度：{scores['semantic']:.2%}）")
        elif scores.get("semantic", 0) > 0.5:
            reasons.append(f"案情语义相似（相似度：{scores['semantic']:.2%}）")

        if scores.get("provisions", 0) > 0.3:
            reasons.append(f"适用法律条文高度重合（重合度：{scores['provisions']:.0%}）")

        if scores.get("keywords", 0) > 0.3:
            reasons.append(f"核心争议关键词高度匹配（匹配度：{scores['keywords']:.0%}）")

        if case.cause_of_action and case.cause_of_action in query_text:
            reasons.append(f"案由相同：{case.cause_of_action}")

        if case.judgment_result:
            reasons.append(f"裁判结果：{case.judgment_result}")

        if not reasons:
            reasons.append("语义相似")

        return reasons[:5]

    @staticmethod
    def _find_shared_provisions_detailed(
        query_provisions: List[str], case: CaseData
    ) -> List[str]:
        shared = []
        for prov in query_provisions:
            if prov in case.legal_provisions:
                shared.append(prov)
        return shared

    @staticmethod
    def _find_shared_keywords(query_keywords: List[str], case: CaseData) -> List[str]:
        shared = []
        for kw in query_keywords:
            if kw in case.keywords:
                shared.append(kw)
        return shared

    async def match_by_document(
        self,
        title: str,
        paragraphs: List[str],
        case_type: Optional[str] = None,
        top_k: Optional[int] = None,
        matched_provisions: Optional[List[str]] = None,
        key_phrases: Optional[List[str]] = None,
    ) -> List[MatchedCase]:
        doc_text = f"{title}\n" + "\n".join(paragraphs[:20])
        doc_embedding = await self._embedding_service.encode_text(doc_text[:3000])

        return await self.match_cases(
            query_text=doc_text,
            query_embedding=doc_embedding,
            case_type=case_type,
            top_k=top_k,
            legal_provisions=matched_provisions or [],
            keywords=key_phrases or [],
        )

    async def match_by_provisions(
        self,
        legal_provisions: List[str],
        case_type: Optional[str] = None,
        top_k: Optional[int] = None,
    ) -> List[MatchedCase]:
        if not legal_provisions:
            return []

        prov_text = " ".join(legal_provisions)
        prov_embedding = await self._embedding_service.encode_text(prov_text)

        return await self.match_cases(
            query_text=prov_text,
            query_embedding=prov_embedding,
            case_type=case_type,
            top_k=top_k,
            legal_provisions=legal_provisions,
        )

    def get_case_by_id(self, case_id: str) -> Optional[CaseData]:
        return self._case_index.get(case_id)

    def get_all_cases(self) -> List[CaseData]:
        return self._cases.copy()

    def get_cases_by_type(self, case_type: str) -> List[CaseData]:
        return [c for c in self._cases if c.case_type == case_type]

    def get_cause_of_actions(self) -> List[str]:
        causes = set()
        for case in self._cases:
            if case.cause_of_action:
                causes.add(case.cause_of_action)
        return sorted(list(causes))
