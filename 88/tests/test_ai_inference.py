import pytest
from app.ai_inference.base import chunk_content, extract_json_from_response
from app.ai_inference.rate_limiter import AdaptiveRateLimiter


def test_chunk_content_short():
    content = "短内容"
    chunks = chunk_content(content, max_chars=6000)
    assert len(chunks) == 1
    assert chunks[0] == "短内容"


def test_chunk_content_long_split_at_paragraph():
    content = "第一段内容" + "。" * 100 + "\n\n" + "第二段内容" + "。" * 100
    chunks = chunk_content(content, max_chars=200)
    assert len(chunks) >= 2


def test_chunk_content_preserves_content():
    content = "A" * 300
    chunks = chunk_content(content, max_chars=150)
    reconstructed = "".join(chunks)
    assert reconstructed == content


def test_extract_json_from_response_clean():
    text = '{"keywords": ["AI", "文档", "语义"]}'
    result = extract_json_from_response(text)
    assert result is not None
    assert result["keywords"] == ["AI", "文档", "语义"]


def test_extract_json_from_response_markdown_wrapped():
    text = '```json\n{"keywords": ["测试", "关键词"]}\n```'
    result = extract_json_from_response(text)
    assert result is not None
    assert result["keywords"] == ["测试", "关键词"]


def test_extract_json_from_response_with_surrounding_text():
    text = '以下是提取的关键词：\n{"keywords": ["Python", "FastAPI"]}\n以上是结果。'
    result = extract_json_from_response(text)
    assert result is not None
    assert result["keywords"] == ["Python", "FastAPI"]


def test_extract_json_from_response_correction_format():
    text = '```json\n{"has_errors": true, "corrections": [{"original": "错字", "corrected": "正确", "type": "错别字", "explanation": "修正说明"}], "corrected_text": "修正后的文本"}\n```'
    result = extract_json_from_response(text)
    assert result is not None
    assert result["has_errors"] is True
    assert len(result["corrections"]) == 1


def test_extract_json_from_response_empty():
    assert extract_json_from_response("") is None
    assert extract_json_from_response("   ") is None


def test_extract_json_from_response_no_json():
    assert extract_json_from_response("这是一段普通文字，没有JSON") is None


def test_extract_json_from_response_list():
    text = '["关键词1", "关键词2", "关键词3"]'
    result = extract_json_from_response(text)
    assert result is not None
    assert isinstance(result, list)
    assert len(result) == 3


def test_rate_limiter_creation():
    limiter = AdaptiveRateLimiter(max_concurrency=5, requests_per_minute=30, burst_size=10)
    assert limiter._max_concurrency == 5
    assert limiter._rpm == 30
    assert limiter._tokens == 10.0


def test_rate_limiter_backoff():
    limiter = AdaptiveRateLimiter()
    assert limiter._backoff_factor == 1.0
    limiter.report_failure(is_rate_limit=True)
    assert limiter._backoff_factor == 2.0
    limiter.report_failure(is_rate_limit=True)
    assert limiter._backoff_factor == 4.0


def test_rate_limiter_recovery():
    limiter = AdaptiveRateLimiter()
    limiter._backoff_factor = 4.0
    for _ in range(5):
        limiter.report_success()
    assert limiter._backoff_factor < 4.0


def test_classify_validation():
    from app.ai_inference.classify import _validate_classification
    result = _validate_classification({"primary_category": "技术", "sub_categories": ["AI"], "tags": ["ML"], "confidence": 0.9, "language": "zh", "content_type": "论文"})
    assert result["primary_category"] == "技术"
    assert result["confidence"] == 0.9


def test_classify_validation_invalid_category():
    from app.ai_inference.classify import _validate_classification
    result = _validate_classification({"primary_category": "不存在的分类", "confidence": 1.5, "language": "", "content_type": ""})
    assert result["primary_category"] == "其他"
    assert result["confidence"] == 1.0
    assert result["language"] == "unknown"


def test_translate_supported_languages():
    from app.ai_inference.translate import SUPPORTED_LANGUAGES, get_language_name
    assert "zh" in SUPPORTED_LANGUAGES
    assert "en" in SUPPORTED_LANGUAGES
    assert get_language_name("zh") == "中文"
    assert get_language_name("unknown") == "unknown"


def test_transient_error_detection():
    from app.task_queue.tasks import _is_transient_error
    assert _is_transient_error("Connection timeout") is True
    assert _is_transient_error("429 rate limit exceeded") is True
    assert _is_transient_error("Internal server error 503") is True
    assert _is_transient_error("Document not found") is False
    assert _is_transient_error("Invalid JSON format") is False


def test_retry_delay():
    from app.task_queue.tasks import _get_retry_delay
    assert _get_retry_delay(0) == 30
    assert _get_retry_delay(1) == 120
    assert _get_retry_delay(2) == 600
    assert _get_retry_delay(5) == 600
