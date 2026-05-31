from typing import Optional
from elasticsearch import AsyncElasticsearch
from loguru import logger

from app.core.config import get_settings

settings = get_settings()


class ESClient:
    def __init__(self):
        self.client: Optional[AsyncElasticsearch] = None

    async def connect(self):
        try:
            self.client = AsyncElasticsearch(
                settings.elasticsearch_url,
                basic_auth=(settings.elasticsearch_user, settings.elasticsearch_password),
                verify_certs=False,
            )
            if await self.client.ping():
                logger.info("Elasticsearch connected successfully")
            else:
                logger.warning("Elasticsearch ping failed")
        except Exception as e:
            logger.error(f"Elasticsearch connection failed: {e}")
            self.client = None

    async def close(self):
        if self.client:
            await self.client.close()
            logger.info("Elasticsearch connection closed")

    async def create_index(self, index_name: str, mappings: dict, settings: dict = None):
        if not self.client:
            return False
        try:
            if not await self.client.indices.exists(index=index_name):
                await self.client.indices.create(
                    index=index_name,
                    mappings=mappings,
                    settings=settings or {},
                )
                logger.info(f"Index {index_name} created")
            return True
        except Exception as e:
            logger.error(f"Create index {index_name} failed: {e}")
            return False

    async def index_document(self, index_name: str, doc_id: str, document: dict):
        if not self.client:
            return None
        try:
            result = await self.client.index(
                index=index_name,
                id=doc_id,
                document=document,
            )
            return result
        except Exception as e:
            logger.error(f"Index document failed: {e}")
            return None

    async def search(self, index_name: str, query: dict, size: int = 10, from_: int = 0):
        if not self.client:
            return None
        try:
            result = await self.client.search(
                index=index_name,
                query=query,
                size=size,
                from_=from_,
            )
            return result
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return None

    async def delete_document(self, index_name: str, doc_id: str):
        if not self.client:
            return False
        try:
            await self.client.delete(index=index_name, id=doc_id)
            return True
        except Exception as e:
            logger.error(f"Delete document failed: {e}")
            return False


es_client = ESClient()


async def get_es_client() -> Optional[AsyncElasticsearch]:
    return es_client.client
