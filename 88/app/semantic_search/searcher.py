from loguru import logger
from app.config import get_settings
from app.semantic_search.es_client import get_es_client
from app.schemas import SearchResult, SearchResponse

settings = get_settings()


async def semantic_search(query: str, top_k: int = 10, owner_id: str | None = None) -> SearchResponse:
    es = await get_es_client()
    must = [
        {
            "multi_match": {
                "query": query,
                "fields": ["content^3", "summary^2", "keywords^2", "original_name^1"],
                "type": "best_fields",
                "fuzziness": "AUTO",
            }
        }
    ]
    if owner_id:
        must.append({"term": {"owner_id": owner_id}})

    body = {
        "size": top_k,
        "query": {"bool": {"must": must}},
        "highlight": {
            "pre_tags": ["<em>"],
            "post_tags": ["</em>"],
            "fields": {
                "content": {"fragment_size": 200, "number_of_fragments": 3},
                "summary": {"fragment_size": 200, "number_of_fragments": 1},
            },
        },
    }
    try:
        resp = await es.search(index=settings.ELASTICSEARCH_INDEX, body=body)
        results = []
        for hit in resp["hits"]["hits"]:
            source = hit["_source"]
            highlight_parts = []
            if "highlight" in hit:
                for field_highlights in hit["highlight"].values():
                    highlight_parts.extend(field_highlights)
            results.append(
                SearchResult(
                    document_id=source.get("document_id", hit["_id"]),
                    filename=source.get("filename", ""),
                    original_name=source.get("original_name", ""),
                    score=hit["_score"],
                    highlight="...".join(highlight_parts) if highlight_parts else None,
                    summary=source.get("summary") or None,
                )
            )
        total = resp["hits"]["total"]["value"]
        return SearchResponse(total=total, results=results)
    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        return SearchResponse(total=0, results=[])


async def keyword_search(query: str, top_k: int = 10, owner_id: str | None = None) -> SearchResponse:
    es = await get_es_client()
    must = [{"match_phrase": {"content": {"query": query}}}]
    if owner_id:
        must.append({"term": {"owner_id": owner_id}})

    body = {
        "size": top_k,
        "query": {"bool": {"must": must}},
        "highlight": {
            "pre_tags": ["<em>"],
            "post_tags": ["</em>"],
            "fields": {"content": {"fragment_size": 200, "number_of_fragments": 3}},
        },
    }
    try:
        resp = await es.search(index=settings.ELASTICSEARCH_INDEX, body=body)
        results = []
        for hit in resp["hits"]["hits"]:
            source = hit["_source"]
            highlight_parts = []
            if "highlight" in hit:
                for field_highlights in hit["highlight"].values():
                    highlight_parts.extend(field_highlights)
            results.append(
                SearchResult(
                    document_id=source.get("document_id", hit["_id"]),
                    filename=source.get("filename", ""),
                    original_name=source.get("original_name", ""),
                    score=hit["_score"],
                    highlight="...".join(highlight_parts) if highlight_parts else None,
                    summary=source.get("summary") or None,
                )
            )
        total = resp["hits"]["total"]["value"]
        return SearchResponse(total=total, results=results)
    except Exception as e:
        logger.error(f"Keyword search failed: {e}")
        return SearchResponse(total=0, results=[])


async def hybrid_search(query: str, top_k: int = 10, owner_id: str | None = None) -> SearchResponse:
    semantic_resp = await semantic_search(query, top_k=top_k, owner_id=owner_id)
    keyword_resp = await keyword_search(query, top_k=top_k, owner_id=owner_id)

    seen = set()
    merged = []
    for r in semantic_resp.results:
        if r.document_id not in seen:
            seen.add(r.document_id)
            merged.append(r)
    for r in keyword_resp.results:
        if r.document_id not in seen:
            seen.add(r.document_id)
            merged.append(r)

    merged.sort(key=lambda x: x.score, reverse=True)
    return SearchResponse(total=len(merged), results=merged[:top_k])
