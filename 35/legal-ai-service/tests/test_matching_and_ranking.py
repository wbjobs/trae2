import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.provision_matcher import ProvisionMatcher
from modules.case_matcher import CaseMatcher
from modules.result_ranker import ResultRanker


@pytest.fixture
def provision_matcher():
    return ProvisionMatcher()


@pytest.fixture
def case_matcher():
    return CaseMatcher()


@pytest.fixture
def result_ranker():
    return ResultRanker()


def test_provision_matcher_initialization(provision_matcher):
    assert len(provision_matcher._provisions) > 0


def test_case_matcher_initialization(case_matcher):
    assert len(case_matcher._cases) > 0


@pytest.mark.asyncio
async def test_build_vector_index(provision_matcher, case_matcher):
    await provision_matcher.build_vector_index()
    assert provision_matcher._provision_embeddings is not None
    assert len(provision_matcher._provision_embeddings) == len(provision_matcher._provisions)

    await case_matcher.build_vector_index()
    assert case_matcher._case_embeddings is not None
    assert len(case_matcher._case_embeddings) == len(case_matcher._cases)


@pytest.mark.asyncio
async def test_match_provisions(provision_matcher):
    await provision_matcher.build_vector_index()
    result = await provision_matcher.match_provisions(
        "被告未按合同约定支付货款，应当承担违约责任",
        top_k=5
    )
    assert len(result) > 0
    assert all(m.similarity_score > 0 for m in result)


@pytest.mark.asyncio
async def test_match_cases(case_matcher):
    await case_matcher.build_vector_index()
    result = await case_matcher.match_cases(
        "买卖合同拖欠货款纠纷",
        case_type="民事",
        top_k=3
    )
    assert len(result) > 0
    assert all(m.similarity_score > 0 for m in result)


def test_rank_provisions(result_ranker, provision_matcher):
    from modules.provision_matcher import MatchedProvision, LegalProvision

    provisions = [
        MatchedProvision(
            provision=LegalProvision(
                provision_id="1", law_name="民法典", article_number="577条",
                article_title="违约责任", content="当事人一方不履行合同义务...",
                category="合同编"
            ),
            similarity_score=0.85,
            matched_text="当事人一方不履行合同义务",
            match_type="高相关"
        ),
        MatchedProvision(
            provision=LegalProvision(
                provision_id="2", law_name="民法典", article_number="1165条",
                article_title="过错责任", content="行为人因过错侵害他人民事权益...",
                category="侵权责任编"
            ),
            similarity_score=0.75,
            matched_text="过错侵害他人民事权益",
            match_type="中相关"
        ),
    ]

    ranked = result_ranker.rank_provisions(
        provisions,
        "被告未履行合同义务，应当承担违约责任",
        legal_claims=["支付货款", "违约金"],
        key_phrases=["违约责任", "合同"]
    )

    assert len(ranked) == 2
    assert ranked[0].similarity_score >= ranked[1].similarity_score


def test_rank_cases(result_ranker, case_matcher):
    from modules.case_matcher import MatchedCase, CaseData

    cases = [
        MatchedCase(
            case_data=CaseData(
                case_id="1", case_number="(2023)京01民初1号",
                title="买卖合同纠纷案", court="北京市第一中级人民法院",
                case_type="民事", judgment_date="2023-06-01",
                summary="买卖合同拖欠货款纠纷", full_text="...",
                legal_provisions=["民法典第五百七十七条"]
            ),
            similarity_score=0.80,
            matched_reasons=["案件类型相同"],
            shared_provisions=["民法典第五百七十七条"]
        ),
    ]

    ranked = result_ranker.rank_cases(
        cases,
        "买卖合同拖欠货款",
        case_type="民事"
    )

    assert len(ranked) == 1


def test_rank_combined(result_ranker):
    from modules.provision_matcher import MatchedProvision, LegalProvision
    from modules.case_matcher import MatchedCase, CaseData

    provisions = [
        MatchedProvision(
            provision=LegalProvision(
                provision_id="1", law_name="民法典", article_number="577条",
                article_title="违约责任", content="...", category="合同编"
            ),
            similarity_score=0.85, matched_text="...", match_type="高相关"
        )
    ]

    cases = [
        MatchedCase(
            case_data=CaseData(
                case_id="1", case_number="(2023)京01民初1号",
                title="合同纠纷案", court="法院", case_type="民事",
                judgment_date="2023-01-01", summary="...", full_text="...",
                legal_provisions=["民法典第五百七十七条"]
            ),
            similarity_score=0.80, matched_reasons=[], shared_provisions=[]
        )
    ]

    result = result_ranker.rank_combined(
        provisions, cases,
        "合同违约纠纷",
        case_type="民事"
    )

    assert result is not None
    assert len(result.matched_provisions) == 1
    assert len(result.matched_cases) == 1
    assert result.confidence_score > 0
