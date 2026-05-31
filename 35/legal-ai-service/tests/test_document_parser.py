import pytest
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.document_parser import DocumentParser, ParsedDocument


@pytest.fixture
def document_parser():
    return DocumentParser()


@pytest.fixture
def long_contract_text():
    base_text = """
    民事起诉状
    
    原告：甲科技有限公司
    被告：乙贸易有限公司
    
    诉讼请求：
    1. 请求判令被告支付货款人民币50万元；
    2. 请求判令被告支付违约金人民币5万元；
    3. 请求判令被告承担本案诉讼费用。
    
    事实与理由：
    原被告于2023年1月1日签订《货物买卖合同》，约定原告向被告供应电子设备，总价款50万元。
    原告已按合同约定履行供货义务，但被告至今未支付货款。被告的行为已构成违约，
    根据《民法典》第五百七十七条的规定，应当承担违约责任。
    """
    
    long_text = base_text
    for i in range(100):
        long_text += f"\n\n第{i+1}条补充条款：本合同未尽事宜，双方可另行签订补充协议。"
        long_text += f"补充协议与本合同具有同等法律效力。"
    
    return long_text


def test_singleton_pattern(document_parser):
    parser1 = DocumentParser()
    parser2 = DocumentParser()
    assert parser1 is parser2


def test_safe_decode():
    test_content = "测试文本编码".encode('utf-8')
    result = DocumentParser._safe_decode(test_content)
    assert "测试文本编码" in result
    
    gbk_content = "测试GBK编码".encode('gbk')
    result = DocumentParser._safe_decode(gbk_content)
    assert "测试GBK编码" in result


def test_split_paragraphs_smart(document_parser, long_contract_text):
    cleaned = document_parser._clean_text(long_contract_text)
    paragraphs = document_parser._split_paragraphs_smart(cleaned)
    
    assert len(paragraphs) > 0
    for para in paragraphs:
        assert len(para) < 2500


def test_extract_metadata_safe(document_parser):
    sample_text = """
    民事判决书
    (2023)京01民初100号
    
    原告：甲科技有限公司
    被告：乙贸易有限公司
    
    北京市第一中级人民法院
    """
    
    doc = ParsedDocument(
        document_id="test_001",
        file_name="test.txt",
        file_type=".txt",
        raw_text=sample_text,
        cleaned_text=sample_text,
        paragraphs=[],
    )
    
    document_parser._extract_metadata_safe(doc)
    
    assert doc.court == "北京市第一中级人民法院"
    assert doc.case_number == "(2023)京01民初100号"
    assert doc.case_type == "民事"
    assert len(doc.parties) > 0


def test_extract_key_phrases_smart(document_parser):
    sample_text = """
    被告未按合同约定支付货款，已构成违约，应当承担违约责任。
    原告主张被告支付违约金及损害赔偿金。
    本案诉讼时效未届满。
    """
    
    doc = ParsedDocument(
        document_id="test_001",
        file_name="test.txt",
        file_type=".txt",
        raw_text=sample_text,
        cleaned_text=sample_text,
        paragraphs=[sample_text],
    )
    
    document_parser._extract_key_phrases_smart(doc)
    
    assert len(doc.key_phrases) > 0
    assert "违约责任" in doc.key_phrases


@pytest.mark.asyncio
async def test_parse_long_document(document_parser, long_contract_text):
    result = await document_parser.parse_file(
        long_contract_text.encode('utf-8'),
        'long_contract.txt'
    )
    
    assert result is not None
    assert result.document_id.startswith("doc_")
    assert len(result.paragraphs) > 0
    assert result.case_type == "民事"
    assert len(result.key_phrases) > 0


@pytest.mark.asyncio
async def test_parse_with_retry(document_parser):
    text = "原告与被告签订买卖合同，被告违约。"
    
    result = await document_parser.parse_file(
        text.encode('utf-8'),
        'test.txt',
        max_retries=3
    )
    
    assert result is not None
    assert result.case_type == "民事"


def test_parse_warnings(document_parser):
    broken_text = "一些无法完全解析的内容..."
    
    doc = ParsedDocument(
        document_id="test_001",
        file_name="test.txt",
        file_type=".txt",
        raw_text=broken_text,
        cleaned_text=broken_text,
        paragraphs=[],
    )
    
    assert len(doc.parse_warnings) == 0
    
    doc.parse_warnings.append("Some warning")
    assert len(doc.parse_warnings) == 1


def test_partial_parse_flag():
    doc = ParsedDocument(
        document_id="test_001",
        file_name="test.txt",
        file_type=".txt",
        raw_text="short text",
        cleaned_text="short text",
        is_partial=False,
    )
    
    assert doc.is_partial == False
    
    doc.is_partial = True
    assert doc.is_partial == True
