from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from loguru import logger
from .provision_matcher import MatchedProvision
from .case_matcher import MatchedCase


@dataclass
class RankedResult:
    matched_provisions: List[MatchedProvision] = field(default_factory=list)
    matched_cases: List[MatchedCase] = field(default_factory=list)
    ranking_strategy: str = "hybrid"
    confidence_score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "matched_provisions": [p.to_dict() for p in self.matched_provisions],
            "matched_cases": [c.to_dict() for c in self.matched_cases],
            "ranking_strategy": self.ranking_strategy,
            "confidence_score": round(float(self.confidence_score), 4),
        }


class ResultRanker:
    def __init__(self):
        self._provision_weights = {
            "high_match": 1.0,
            "medium_match": 0.7,
            "semantic_match": 0.5,
        }
        self._case_weights = {
            "provision_overlap": 0.6,
            "semantic_similarity": 0.4,
        }
        logger.info("ResultRanker initialized")

    def rank_provisions(
        self,
        provisions: List[MatchedProvision],
        query_text: str,
        legal_claims: Optional[List[str]] = None,
        key_phrases: Optional[List[str]] = None,
    ) -> List[MatchedProvision]:
        if not provisions:
            return []

        scored_provisions = []
        for prov in provisions:
            base_score = prov.similarity_score
            final_score = base_score

            type_bonus = self._get_type_bonus(prov.match_type)
            final_score *= type_bonus

            if legal_claims:
                claim_bonus = self._calculate_claim_overlap(
                    prov.provision.content, legal_claims
                )
                final_score += claim_bonus * 0.15

            if key_phrases:
                phrase_bonus = self._calculate_phrase_overlap(
                    prov.provision.content, key_phrases
                )
                final_score += phrase_bonus * 0.1

            final_score = min(final_score, 1.0)

            scored_provisions.append(
                MatchedProvision(
                    provision=prov.provision,
                    similarity_score=final_score,
                    matched_text=prov.matched_text,
                    match_type=prov.match_type,
                )
            )

        scored_provisions.sort(key=lambda x: x.similarity_score, reverse=True)
        for i, p in enumerate(scored_provisions):
            p.rank = i + 1

        logger.info(f"Ranked {len(scored_provisions)} provisions")
        return scored_provisions

    def rank_cases(
        self,
        cases: List[MatchedCase],
        query_text: str,
        matched_provisions: Optional[List[MatchedProvision]] = None,
        case_type: Optional[str] = None,
    ) -> List[MatchedCase]:
        if not cases:
            return []

        matched_provision_ids = []
        if matched_provisions:
            matched_provision_ids = [
                f"{p.provision.law_name}{p.provision.article_number}"
                for p in matched_provisions
            ]

        scored_cases = []
        for case in cases:
            base_score = case.similarity_score
            final_score = base_score * self._case_weights["semantic_similarity"]

            if matched_provision_ids:
                overlap = len(set(case.case_data.legal_provisions) & set(matched_provision_ids))
                overlap_score = overlap / max(len(matched_provision_ids), 1)
                final_score += overlap_score * self._case_weights["provision_overlap"]

            if case_type and case.case_data.case_type == case_type:
                final_score += 0.05

            final_score = min(final_score, 1.0)

            updated_matched_reasons = case.matched_reasons
            if matched_provision_ids and overlap > 0:
                updated_matched_reasons.append(
                    f"与本案援引法条重合 {overlap} 条"
                )

            scored_cases.append(
                MatchedCase(
                    case_data=case.case_data,
                    similarity_score=final_score,
                    matched_reasons=updated_matched_reasons,
                    shared_provisions=case.shared_provisions,
                )
            )

        scored_cases.sort(key=lambda x: x.similarity_score, reverse=True)
        for i, c in enumerate(scored_cases):
            c.rank = i + 1

        logger.info(f"Ranked {len(scored_cases)} cases")
        return scored_cases

    def rank_combined(
        self,
        provisions: List[MatchedProvision],
        cases: List[MatchedCase],
        query_text: str,
        legal_claims: Optional[List[str]] = None,
        key_phrases: Optional[List[str]] = None,
        case_type: Optional[str] = None,
    ) -> RankedResult:
        ranked_provisions = self.rank_provisions(
            provisions, query_text, legal_claims, key_phrases
        )

        ranked_cases = self.rank_cases(
            cases, query_text, ranked_provisions, case_type
        )

        confidence = self._calculate_overall_confidence(ranked_provisions, ranked_cases)

        return RankedResult(
            matched_provisions=ranked_provisions,
            matched_cases=ranked_cases,
            ranking_strategy="hybrid",
            confidence_score=confidence,
        )

    def _get_type_bonus(self, match_type: str) -> float:
        if "高相关" in match_type:
            return 1.1
        elif "中相关" in match_type:
            return 1.0
        else:
            return 0.9

    @staticmethod
    def _calculate_claim_overlap(provision_content: str, legal_claims: List[str]) -> float:
        import jieba

        if not legal_claims:
            return 0.0

        provision_words = set(jieba.lcut(provision_content))
        total_overlap = 0.0

        for claim in legal_claims:
            claim_words = set(jieba.lcut(claim))
            if not claim_words:
                continue
            overlap = len(provision_words & claim_words)
            total_overlap += overlap / len(claim_words)

        return total_overlap / max(len(legal_claims), 1)

    @staticmethod
    def _calculate_phrase_overlap(provision_content: str, key_phrases: List[str]) -> float:
        if not key_phrases:
            return 0.0

        found = sum(1 for phrase in key_phrases if phrase in provision_content)
        return found / max(len(key_phrases), 1)

    @staticmethod
    def _calculate_overall_confidence(
        provisions: List[MatchedProvision],
        cases: List[MatchedCase],
    ) -> float:
        prov_conf = 0.0
        if provisions:
            prov_conf = sum(p.similarity_score for p in provisions) / len(provisions)

        case_conf = 0.0
        if cases:
            case_conf = sum(c.similarity_score for c in cases) / len(cases)

        if provisions and cases:
            return (prov_conf * 0.6 + case_conf * 0.4)
        elif provisions:
            return prov_conf * 0.8
        elif cases:
            return case_conf * 0.7
        else:
            return 0.0

    @staticmethod
    def filter_by_threshold(
        results: List[Any],
        threshold: float,
        score_getter: Callable[[Any], float] = lambda x: x.similarity_score,
    ) -> List[Any]:
        return [r for r in results if score_getter(r) >= threshold]

    @staticmethod
    def deduplicate_provisions(provisions: List[MatchedProvision]) -> List[MatchedProvision]:
        seen = set()
        unique = []
        for prov in provisions:
            key = (prov.provision.law_name, prov.provision.article_number)
            if key not in seen:
                seen.add(key)
                unique.append(prov)
        return unique

    @staticmethod
    def deduplicate_cases(cases: List[MatchedCase]) -> List[MatchedCase]:
        seen = set()
        unique = []
        for case in cases:
            key = case.case_data.case_id
            if key not in seen:
                seen.add(key)
                unique.append(case)
        return unique

    def explain_ranking(self, result: RankedResult) -> Dict[str, Any]:
        explanation = {
            "ranking_strategy": result.ranking_strategy,
            "overall_confidence": result.confidence_score,
            "provision_ranking_explanation": [],
            "case_ranking_explanation": [],
        }

        for prov in result.matched_provisions[:5]:
            explanation["provision_ranking_explanation"].append({
                "rank": prov.rank,
                "law": prov.provision.law_name,
                "article": prov.provision.article_number,
                "score": prov.similarity_score,
                "match_type": prov.match_type,
            })

        for case in result.matched_cases[:5]:
            explanation["case_ranking_explanation"].append({
                "rank": case.rank,
                "case_title": case.case_data.title,
                "score": case.similarity_score,
                "reasons": case.matched_reasons,
            })

        return explanation
