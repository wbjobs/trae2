import re
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from collections import Counter

from loguru import logger

from modules.document_parser import ParsedDocument
from modules.provision_matcher import MatchedProvision
from modules.case_matcher import MatchedCase


@dataclass
class AnalysisSummary:
    document_type: str
    case_overview: str
    key_issues: List[str]
    legal_basis_summary: str
    case_reference_summary: str
    risk_assessment: str
    suggestions: List[str]
    confidence_level: str
    processing_notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_type": self.document_type,
            "case_overview": self.case_overview,
            "key_issues": self.key_issues,
            "legal_basis_summary": self.legal_basis_summary,
            "case_reference_summary": self.case_reference_summary,
            "risk_assessment": self.risk_assessment,
            "suggestions": self.suggestions,
            "confidence_level": self.confidence_level,
            "processing_notes": self.processing_notes,
        }


class SummaryGenerator:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self._document_type_patterns = {
            "民事起诉状": [r"民事起诉状", r"起诉状"],
            "民事答辩状": [r"民事答辩状", r"答辩状"],
            "民事判决书": [r"民事判决书", r"判决书"],
            "民事裁定书": [r"民事裁定书", r"裁定书"],
            "民事调解书": [r"民事调解书", r"调解书"],
            "刑事判决书": [r"刑事判决书"],
            "行政判决书": [r"行政判决书"],
            "仲裁申请书": [r"仲裁申请书"],
            "上诉状": [r"民事上诉状", r"刑事上诉状", r"行政上诉状", r"上诉状"],
            "执行申请书": [r"执行申请书", r"强制执行申请书"],
        }

        self._case_type_categories = {
            "合同纠纷": ["合同", "违约", "买卖", "租赁", "借款", "借贷", "承揽", "建设工程"],
            "侵权纠纷": ["侵权", "损害赔偿", "人身损害", "财产损害", "名誉权"],
            "劳动争议": ["劳动", "劳动合同", "工资", "工伤", "经济补偿"],
            "婚姻家庭": ["离婚", "继承", "抚养", "赡养", "收养"],
            "知识产权": ["专利", "商标", "著作权", "知识产权", "侵权"],
            "物权纠纷": ["物权", "所有权", "用益物权", "担保物权", "抵押", "质押"],
            "公司纠纷": ["公司", "股权", "股东", "董事", "清算", "破产"],
        }

        self._risk_keywords = {
            "high": ["败诉风险", "证据不足", "举证不能", "诉讼时效", "管辖异议"],
            "medium": ["需补充证据", "法律适用争议", "事实认定争议"],
            "low": ["事实清楚", "证据充分", "法律明确"],
        }

        logger.info("SummaryGenerator initialized")

    def generate_summary(
        self,
        parsed_doc: ParsedDocument,
        matched_provisions: List[MatchedProvision],
        matched_cases: List[MatchedCase],
        overall_confidence: float,
    ) -> AnalysisSummary:
        try:
            doc_type = self._identify_document_type(parsed_doc)
            case_overview = self._generate_case_overview(parsed_doc)
            key_issues = self._extract_key_issues(parsed_doc, matched_provisions)
            legal_basis = self._generate_legal_basis_summary(matched_provisions)
            case_reference = self._generate_case_reference_summary(matched_cases)
            risk_assessment = self._generate_risk_assessment(parsed_doc, matched_provisions, matched_cases)
            suggestions = self._generate_suggestions(parsed_doc, matched_provisions, matched_cases)
            confidence = self._determine_confidence_level(
                overall_confidence, len(matched_provisions), len(matched_cases)
            )

            processing_notes = []
            if parsed_doc.is_partial:
                processing_notes.append("文档内容过长，已进行部分解析")
            if parsed_doc.parse_warnings:
                processing_notes.extend(parsed_doc.parse_warnings)

            summary = AnalysisSummary(
                document_type=doc_type,
                case_overview=case_overview,
                key_issues=key_issues,
                legal_basis_summary=legal_basis,
                case_reference_summary=case_reference,
                risk_assessment=risk_assessment,
                suggestions=suggestions,
                confidence_level=confidence,
                processing_notes=processing_notes,
            )

            logger.info(f"Summary generated for document: {parsed_doc.document_id}")
            return summary

        except Exception as e:
            logger.error(f"Failed to generate summary: {e}")
            return AnalysisSummary(
                document_type="未知文档",
                case_overview="摘要生成失败",
                key_issues=[],
                legal_basis_summary="",
                case_reference_summary="",
                risk_assessment="无法评估",
                suggestions=[],
                confidence_level="低",
                processing_notes=[f"摘要生成异常: {str(e)}"],
            )

    def _identify_document_type(self, parsed_doc: ParsedDocument) -> str:
        text = parsed_doc.cleaned_text[:3000]

        for doc_type, patterns in self._document_type_patterns.items():
            for pattern in patterns:
                if re.search(pattern, text):
                    return doc_type

        if parsed_doc.case_type:
            return f"{parsed_doc.case_type}文书"

        return "法律文书"

    def _generate_case_overview(self, parsed_doc: ParsedDocument) -> str:
        overview_parts = []

        if parsed_doc.case_type:
            overview_parts.append(f"本案为{parsed_doc.case_type}案件。")

        if parsed_doc.parties:
            parties_str = "、".join(parsed_doc.parties[:4])
            overview_parts.append(f"当事人包括：{parties_str}。")

        if parsed_doc.legal_claims:
            claims = parsed_doc.legal_claims[:3]
            claims_str = "；".join(claims)
            overview_parts.append(f"主要诉求：{claims_str}。")

        if parsed_doc.court:
            overview_parts.append(f"受理法院：{parsed_doc.court}。")

        if parsed_doc.case_number:
            overview_parts.append(f"案号：{parsed_doc.case_number}。")

        if overview_parts:
            return "".join(overview_parts)

        if len(parsed_doc.cleaned_text) > 200:
            return parsed_doc.cleaned_text[:200] + "..."

        return "本案基本情况需结合全文阅读。"

    def _extract_key_issues(
        self,
        parsed_doc: ParsedDocument,
        matched_provisions: List[MatchedProvision],
    ) -> List[str]:
        issues = []

        if parsed_doc.key_phrases:
            issues.extend(parsed_doc.key_phrases[:5])

        for prov in matched_provisions[:5]:
            title = prov.provision.article_title
            if title and title not in issues and len(title) < 20:
                issues.append(title)

        if parsed_doc.legal_claims:
            for claim in parsed_doc.legal_claims[:2]:
                short_claim = claim[:30]
                if short_claim not in issues:
                    issues.append(short_claim)

        seen = set()
        unique_issues = []
        for issue in issues:
            if issue not in seen and len(issue) > 1:
                seen.add(issue)
                unique_issues.append(issue)

        return unique_issues[:8]

    def _generate_legal_basis_summary(
        self,
        matched_provisions: List[MatchedProvision],
    ) -> str:
        if not matched_provisions:
            return "未检索到直接相关的法律条文。"

        top_provisions = matched_provisions[:5]

        law_groups = {}
        for prov in top_provisions:
            law_name = prov.provision.law_name
            if law_name not in law_groups:
                law_groups[law_name] = []
            law_groups[law_name].append(
                f"{prov.provision.article_number}《{prov.provision.article_title}》"
            )

        parts = []
        for law_name, articles in law_groups.items():
            parts.append(f"根据{law_name}的{', '.join(articles)}")

        summary = "；".join(parts)

        if len(top_provisions) > 5:
            summary += f"等共计{len(matched_provisions)}条相关法律规定。"
        else:
            summary += "的相关规定。"

        return summary

    def _generate_case_reference_summary(
        self,
        matched_cases: List[MatchedCase],
    ) -> str:
        if not matched_cases:
            return "未检索到类似案例。"

        top_cases = matched_cases[:3]

        case_summaries = []
        for i, case in enumerate(top_cases, 1):
            case_data = case.case_data
            sim = f"{case.similarity_score * 100:.0f}%"
            case_summaries.append(
                f"{i}. {case_data.title}（相似度{sim}）"
            )

        summary = f"检索到{len(matched_cases)}个类似案例。其中最相关的案例包括：" + "；".join(case_summaries)

        if len(matched_cases) > 3:
            summary += f"等{len(matched_cases)}个案例可供参考。"

        return summary

    def _generate_risk_assessment(
        self,
        parsed_doc: ParsedDocument,
        matched_provisions: List[MatchedProvision],
        matched_cases: List[MatchedCase],
    ) -> str:
        text = parsed_doc.cleaned_text[:5000]

        risk_score = 0
        risk_indicators = []

        for keyword in self._risk_keywords["high"]:
            if keyword in text:
                risk_score += 2
                risk_indicators.append(keyword)

        for keyword in self._risk_keywords["medium"]:
            if keyword in text:
                risk_score += 1
                risk_indicators.append(keyword)

        if not matched_provisions:
            risk_score += 3
            risk_indicators.append("无明确法律依据")
        elif len(matched_provisions) < 3:
            risk_score += 1

        if not matched_cases:
            risk_score += 2
            risk_indicators.append("无类似案例参考")

        if parsed_doc.is_partial:
            risk_score += 1

        if risk_score >= 5:
            level = "较高"
        elif risk_score >= 3:
            level = "中等"
        else:
            level = "较低"

        if risk_indicators:
            indicators_str = "、".join(risk_indicators[:5])
            return f"本案风险评估：{level}。主要风险点：{indicators_str}。"
        else:
            return f"本案风险评估：{level}。未发现明显风险点。"

    def _generate_suggestions(
        self,
        parsed_doc: ParsedDocument,
        matched_provisions: List[MatchedProvision],
        matched_cases: List[MatchedCase],
    ) -> List[str]:
        suggestions = []

        if not matched_provisions:
            suggestions.append("建议进一步检索相关法律条文，明确请求权基础。")
        elif len(matched_provisions) < 3:
            suggestions.append("建议补充检索相关法律条文，夯实法律依据。")

        if not matched_cases:
            suggestions.append("建议检索类似案例，了解司法实践中的裁判观点。")

        if parsed_doc.case_type == "民事":
            suggestions.append("建议关注诉讼时效期间，确保在法定期限内主张权利。")
            suggestions.append("建议收集并整理相关证据，形成完整的证据链。")

        if "证据" in parsed_doc.cleaned_text[:3000]:
            suggestions.append("建议梳理案件证据，确保证据的真实性、合法性和关联性。")

        if "合同" in parsed_doc.cleaned_text[:3000]:
            suggestions.append("建议仔细审查合同条款，明确双方权利义务。")

        if len(parsed_doc.legal_claims) == 0:
            suggestions.append("建议明确具体的诉讼请求，确保诉请清晰、具体、可执行。")

        if parsed_doc.is_partial:
            suggestions.append("文档内容较长，建议结合完整文档进行分析。")

        return suggestions[:6]

    @staticmethod
    def _determine_confidence_level(
        overall_confidence: float,
        provisions_count: int,
        cases_count: int,
    ) -> str:
        score = overall_confidence

        if provisions_count >= 5:
            score += 0.1
        elif provisions_count >= 3:
            score += 0.05

        if cases_count >= 3:
            score += 0.05
        elif cases_count >= 1:
            score += 0.02

        if score >= 0.8:
            return "高"
        elif score >= 0.6:
            return "中"
        elif score >= 0.4:
            return "一般"
        else:
            return "低"

    def generate_comparative_summary(
        self,
        document_summaries: List[AnalysisSummary],
    ) -> Dict[str, Any]:
        if not document_summaries:
            return {"error": "No summaries to compare"}

        all_key_issues = Counter()
        all_suggestions = Counter()
        document_types = Counter()

        for summary in document_summaries:
            for issue in summary.key_issues:
                all_key_issues[issue] += 1
            for suggestion in summary.suggestions:
                all_suggestions[suggestion] += 1
            document_types[summary.document_type] += 1

        return {
            "total_documents": len(document_summaries),
            "document_types": dict(document_types),
            "common_key_issues": [
                {"issue": issue, "count": count}
                for issue, count in all_key_issues.most_common(10)
            ],
            "common_suggestions": [
                {"suggestion": suggestion, "count": count}
                for suggestion, count in all_suggestions.most_common(5)
            ],
            "confidence_distribution": self._count_confidence_levels(document_summaries),
        }

    @staticmethod
    def _count_confidence_levels(summaries: List[AnalysisSummary]) -> Dict[str, int]:
        levels = ["高", "中", "一般", "低"]
        counts = Counter(s.confidence_level for s in summaries)
        return {level: counts.get(level, 0) for level in levels}
