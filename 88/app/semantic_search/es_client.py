from elasticsearch import AsyncElasticsearch
from loguru import logger
from app.config import get_settings

settings = get_settings()

_es_client: AsyncElasticsearch | None = None


async def get_es_client() -> AsyncElasticsearch:
    global _es_client
    if _es_client is None:
        _es_client = AsyncElasticsearch(
            hosts=[settings.ELASTICSEARCH_URL],
            basic_auth=(settings.ELASTICSEARCH_USERNAME, settings.ELASTICSEARCH_PASSWORD),
            verify_certs=False,
            request_timeout=30,
        )
        try:
            info = await _es_client.info()
            logger.info(f"Connected to Elasticsearch: {info['version']['number']}")
        except Exception as e:
            logger.warning(f"Elasticsearch connection failed: {e}")
    return _es_client


async def close_es_client():
    global _es_client
    if _es_client:
        await _es_client.close()
        _es_client = None
