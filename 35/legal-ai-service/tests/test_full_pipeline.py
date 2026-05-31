import sys
import os
import base64
import asyncio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from modules.document_parser import DocumentParser
from modules.embedding_service import EmbeddingService
from modules.provision_matcher import ProvisionMatcher
from modules.case_matcher import CaseMatcher
from modules.result_ranker import ResultRanker


async def test_full_pipeline():
    print("=== Legal AI Service - Full Pipeline Test ===")

    sample_text = """
    民事起诉状
    原告：甲科技有限公司
    被告：乙贸易有限公司
    
    诉讼请求：
    1. 请求判令被告支付货款人民币50万元；
    2. 请求判令被告支付违约金人民币5万元。
    
    事实与理由：
    原被告于2023年1月1日签订《货物买卖合同》，约定原告向被告供应电子设备。
    原告已按合同约定履行供货义务，但被告至今未支付货款。根据民法典相关规定，
    被告应当承担继续履行、赔偿损失等违约责任。
    """

    print("\n1. Document Parser Test:")
    parser = DocumentParser()
    parsed_doc = await parser.parse_file(sample_text.encode("utf-8"), "test_case.txt")
    print(f"   ✓ Document ID: {parsed_doc.document_id}")
    print(f"   ✓ Case Type: {parsed_doc.case_type}")
    print(f"   ✓ Key Phrases: {parsed_doc.key_phrases[:5]}")
    print(f"   ✓ Legal Claims: {parsed_doc.legal_claims[:3]}")

    print("\n2. Embedding Service Test:")
    embedding_service = EmbeddingService()
    doc_embedding = await embedding_service.encode_text(parsed_doc.cleaned_text[:1000])
    print(f"   ✓ Embedding dimension: {doc_embedding.embedding.shape}")
    print(f"   ✓ Embedding hash: {doc_embedding.embedding_hash}")

    print("\n3. Provision Matcher Test:")
    provision_matcher = ProvisionMatcher()
    await provision_matcher.build_vector_index()
    matched_provisions = await provision_matcher.match_by_paragraphs(
        parsed_doc.paragraphs,
        top_k=5
    )
    print(f"   ✓ Matched provisions: {len(matched_provisions)}")
    for i, mp in enumerate(matched_provisions[:3]):
        print(f"     {i+1}. [{mp.similarity_score:.4f}] {mp.provision.law_name} {mp.provision.article_number}")

    print("\n4. Case Matcher Test:")
    case_matcher = CaseMatcher()
    await case_matcher.build_vector_index()
    matched_cases = await case_matcher.match_by_document(
        parsed_doc.file_name,
        parsed_doc.paragraphs,
        case_type=parsed_doc.case_type,
        top_k=3
    )
    print(f"   ✓ Matched cases: {len(matched_cases)}")
    for i, mc in enumerate(matched_cases[:3]):
        print(f"     {i+1}. [{mc.similarity_score:.4f}] {mc.case_data.title}")

    print("\n5. Result Ranker Test:")
    result_ranker = ResultRanker()
    ranked_result = result_ranker.rank_combined(
        matched_provisions,
        matched_cases,
        parsed_doc.cleaned_text[:2000],
        legal_claims=parsed_doc.legal_claims,
        key_phrases=parsed_doc.key_phrases,
        case_type=parsed_doc.case_type,
    )
    print(f"   ✓ Overall confidence: {ranked_result.confidence_score:.4f}")
    print(f"   ✓ Final provisions: {len(ranked_result.matched_provisions)}")
    print(f"   ✓ Final cases: {len(ranked_result.matched_cases)}")

    print("\n=== Full Pipeline Test Completed Successfully! ===")


if __name__ == "__main__":
    asyncio.run(test_full_pipeline())
