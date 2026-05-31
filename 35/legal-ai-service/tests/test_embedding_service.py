import pytest
import sys
import os
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.embedding_service import EmbeddingService


@pytest.fixture
def embedding_service():
    return EmbeddingService()


def test_singleton_pattern():
    s1 = EmbeddingService()
    s2 = EmbeddingService()
    assert s1 is s2


def test_get_text_hash(embedding_service):
    text = "法律条文智能检索"
    hash1 = embedding_service._get_text_hash(text)
    hash2 = embedding_service._get_text_hash(text)
    assert hash1 == hash2
    assert len(hash1) == 32


@pytest.mark.asyncio
async def test_encode_text(embedding_service):
    result = await embedding_service.encode_text("合同违约责任", use_cache=False)
    assert result is not None
    assert result.text == "合同违约责任"
    assert isinstance(result.embedding, np.ndarray)
    assert result.embedding.shape[0] > 0
    assert len(result.embedding_hash) == 32


@pytest.mark.asyncio
async def test_encode_batch(embedding_service):
    texts = [
        "合同违约损害赔偿",
        "侵权责任纠纷",
        "劳动合同解除",
    ]
    results = await embedding_service.encode_batch(texts, use_cache=False)
    assert len(results) == len(texts)
    for i, result in enumerate(results):
        assert result.text == texts[i]
        assert isinstance(result.embedding, np.ndarray)


@pytest.mark.asyncio
async def test_cosine_similarity(embedding_service):
    r1 = await embedding_service.encode_text("合同违约", use_cache=False)
    r2 = await embedding_service.encode_text("合同违约", use_cache=False)
    r3 = await embedding_service.encode_text("刑事犯罪", use_cache=False)

    sim_identical = embedding_service.cosine_similarity(r1.embedding, r2.embedding)
    sim_different = embedding_service.cosine_similarity(r1.embedding, r3.embedding)

    assert sim_identical > 0.99
    assert sim_identical > sim_different


@pytest.mark.asyncio
async def test_encode_paragraphs(embedding_service):
    paragraphs = [
        "当事人一方不履行合同义务的，应当承担违约责任。",
        "行为人因过错侵害他人民事权益的，应当承担侵权责任。",
    ]
    results = await embedding_service.encode_paragraphs(paragraphs, use_cache=False)
    assert len(results) == len(paragraphs)
