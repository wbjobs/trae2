import pytest
import sys
import os
import asyncio
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.provision_correction import (
    ProvisionCorrectionManager,
    CorrectionRequest,
    CorrectionFeedback,
    CorrectionStatus,
)
from modules.summary_generator import SummaryGenerator


@pytest.fixture
def correction_manager():
    return ProvisionCorrectionManager()


@pytest.fixture
def summary_generator():
    return SummaryGenerator()


def test_correction_manager_singleton():
    m1 = ProvisionCorrectionManager()
    m2 = ProvisionCorrectionManager()
    assert m1 is m2


@pytest.mark.asyncio
async def test_submit_correction(correction_manager):
    request = CorrectionRequest(
        document_id="test_doc_001",
        original_provision_id="law_001",
        corrected_provision_id="law_002",
        correction_reason="原法条适用错误，应适用民法典第五百八十四条",
        submitted_by="legal_expert_01",
        feedback_comment="已核对原文书，确实适用错误",
    )

    result = await correction_manager.submit_correction(request)

    assert "correction_id" in result
    assert result["status"] == CorrectionStatus.PENDING.value


@pytest.mark.asyncio
async def test_review_correction(correction_manager):
    request = CorrectionRequest(
        document_id="test_doc_002",
        original_provision_id="law_001",
        corrected_provision_id="law_003",
        correction_reason="测试校正",
        submitted_by="tester",
    )

    submit_result = await correction_manager.submit_correction(request)
    correction_id = submit_result["correction_id"]

    feedback = CorrectionFeedback(
        correction_id=correction_id,
        status=CorrectionStatus.APPROVED,
        reviewer="reviewer_01",
        review_comment="校正合理，予以批准",
    )

    review_result = await correction_manager.review_correction(feedback)

    assert review_result["status"] == CorrectionStatus.APPROVED.value
    assert review_result["reviewed_at"] is not None


def test_get_corrections(correction_manager):
    corrections = correction_manager.get_corrections(limit=10)
    assert isinstance(corrections, list)


def test_get_correction_statistics(correction_manager):
    stats = correction_manager.get_correction_statistics()

    assert "total_corrections" in stats
    assert "pending" in stats
    assert "approved" in stats
    assert "rejected" in stats
    assert "approval_rate" in stats


def test_summary_generator_singleton():
    s1 = SummaryGenerator()
    s2 = SummaryGenerator()
    assert s1 is s2


def test_generate_summary(summary_generator):
    from modules.document_parser import ParsedDocument
    from modules.provision_matcher import MatchedProvision, LegalProvision
    from modules.case_matcher import MatchedCase, CaseData

    parsed_doc = ParsedDocument(
        document_id="test_doc",
        file_name="test.txt",
        file_type=".txt",
        raw_text="测试文本",
        cleaned_text="原告与被告签订买卖合同，被告拖欠货款。",
        paragraphs=["原告与被告签订买卖合同，被告拖欠货款。"],
        case_type="民事",
        parties=["原告A公司", "被告B公司"],
        legal_claims=["支付货款", "违约金"],
        key_phrases=["买卖合同", "货款", "违约责任"],
    )

    provisions = [
        MatchedProvision(
            provision=LegalProvision(
                provision_id="law_001",
                law_name="民法典",
                article_number="第五百七十七条",
                article_title="违约责任",
                content="当事人一方不履行合同义务...",
                category="合同编",
            ),
            similarity_score=0.92,
            matched_text="当事人一方不履行合同义务",
            match_type="高相关",
            rank=1,
        )
    ]

    cases = [
        MatchedCase(
            case_data=CaseData(
                case_id="case_001",
                case_number="(2023)京01民初100号",
                title="甲公司与乙公司买卖合同纠纷案",
                court="北京市第一中级人民法院",
                case_type="民事",
                judgment_date="2023-06-15",
                summary="原告甲公司与被告乙公司签订买卖合同...",
                full_text="...",
                legal_provisions=["民法典第五百七十七条"],
                cause_of_action="买卖合同纠纷",
            ),
            similarity_score=0.85,
            matched_reasons=["案件类型相同"],
            shared_provisions=["民法典第五百七十七条"],
            rank=1,
        )
    ]

    summary = summary_generator.generate_summary(
        parsed_doc, provisions, cases, 0.85
    )

    assert summary is not None
    assert summary.document_type is not None
    assert summary.case_overview is not None
    assert len(summary.key_issues) > 0
    assert summary.legal_basis_summary is not None
    assert summary.case_reference_summary is not None
    assert summary.risk_assessment is not None
    assert len(summary.suggestions) > 0
    assert summary.confidence_level in ["高", "中", "一般", "低"]


def test_identify_document_type(summary_generator):
    from modules.document_parser import ParsedDocument

    doc = ParsedDocument(
        document_id="test",
        file_name="test.txt",
        file_type=".txt",
        raw_text="民事起诉状\n原告：张三\n被告：李四",
        cleaned_text="民事起诉状\n原告：张三\n被告：李四",
        paragraphs=[],
    )

    doc_type = summary_generator._identify_document_type(doc)
    assert doc_type == "民事起诉状"


def test_determine_confidence_level(summary_generator):
    assert summary_generator._determine_confidence_level(0.9, 5, 3) == "高"
    assert summary_generator._determine_confidence_level(0.7, 3, 2) == "中"
    assert summary_generator._determine_confidence_level(0.5, 1, 1) == "一般"
    assert summary_generator._determine_confidence_level(0.3, 0, 0) == "低"


def test_generate_comparative_summary(summary_generator):
    from modules.summary_generator import AnalysisSummary

    summaries = [
        AnalysisSummary(
            document_type="民事起诉状",
            case_overview="买卖合同纠纷...",
            key_issues=["买卖合同", "货款"],
            legal_basis_summary="根据民法典...",
            case_reference_summary="类似案例...",
            risk_assessment="风险较低",
            suggestions=["建议收集证据"],
            confidence_level="高",
        ),
        AnalysisSummary(
            document_type="民事起诉状",
            case_overview="民间借贷纠纷...",
            key_issues=["借款", "利息"],
            legal_basis_summary="根据民法典...",
            case_reference_summary="类似案例...",
            risk_assessment="风险中等",
            suggestions=["建议准备借条"],
            confidence_level="中",
        ),
    ]

    result = summary_generator.generate_comparative_summary(summaries)

    assert "total_documents" in result
    assert result["total_documents"] == 2
    assert "document_types" in result
    assert "common_key_issues" in result
    assert "confidence_distribution" in result


def test_performance_metrics():
    from modules.embedding_service import PerformanceMetrics

    metrics = PerformanceMetrics()
    metrics.total_requests = 100
    metrics.cache_hits = 75

    assert metrics.cache_hit_rate() == 0.75
    assert metrics.average_inference_time() == 0.0

    metrics.total_inference_time_ms = 50000
    assert metrics.average_inference_time() == 500.0
