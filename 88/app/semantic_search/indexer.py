from loguru import logger
from app.config import get_settings
from app.semantic_search.es_client import get_es_client

settings = get_settings()

INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "document_id": {"type": "keyword"},
            "filename": {"type": "keyword"},
            "original_name": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "content": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "summary": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "keywords": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "classification": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "translation": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "primary_category": {"type": "keyword"},
            "tags": {"type": "keyword"},
            "file_type": {"type": "keyword"},
            "owner_id": {"type": "keyword"},
            "created_at": {"type": "date"},
        }
    }
}


async def ensure_index():
    es = await get_es_client()
    index_name = settings.ELASTICSEARCH_INDEX
    try:
        exists = await es.indices.exists(index=index_name)
        if not exists:
            try:
                await es.indices.create(index=index_name, body=INDEX_MAPPING)
                logger.info(f"Created Elasticsearch index: {index_name}")
            except Exception as e:
                if "resource_already_exists_exception" in str(e):
                    pass
                else:
                    raise
    except Exception as e:
        logger.error(f"Failed to ensure index: {e}")


async def index_document(
    document_id: str,
    filename: str,
    original_name: str,
    content: str,
    summary: str | None = None,
    keywords: str | None = None,
    file_type: str = "",
    owner_id: str = "",
    created_at: str = "",
):
    es = await get_es_client()
    doc = {
        "document_id": document_id,
        "filename": filename,
        "original_name": original_name,
        "content": content,
        "summary": summary or "",
        "keywords": keywords or "",
        "file_type": file_type,
        "owner_id": owner_id,
        "created_at": created_at,
    }
    try:
        await es.index(index=settings.ELASTICSEARCH_INDEX, id=document_id, document=doc)
        logger.info(f"Indexed document: {document_id}")
    except Exception as e:
        logger.error(f"Failed to index document {document_id}: {e}")
        raise


async def delete_document_index(document_id: str):
    es = await get_es_client()
    try:
        await es.delete(index=settings.ELASTICSEARCH_INDEX, id=document_id, ignore=[404])
        logger.info(f"Deleted document index: {document_id}")
    except Exception as e:
        logger.error(f"Failed to delete document index {document_id}: {e}")


async def update_document_index(document_id: str, **fields):
    es = await get_es_client()
    try:
        await es.update(
            index=settings.ELASTICSEARCH_INDEX,
            id=document_id,
            body={"doc": fields},
        )
        logger.info(f"Updated document index: {document_id}")
    except Exception as e:
        logger.error(f"Failed to update document index {document_id}: {e}")
