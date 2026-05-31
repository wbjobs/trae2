from typing import Optional, Dict, Any, List
from elasticsearch import AsyncElasticsearch
from elasticsearch.exceptions import RequestError
from .config import settings
from .logger import log


class ElasticsearchClient:
    _instance: Optional["ElasticsearchClient"] = None
    _client: Optional[AsyncElasticsearch] = None

    def __new__(cls) -> "ElasticsearchClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    async def get_client(cls) -> AsyncElasticsearch:
        if cls._instance is None:
            cls._instance = cls()
        if cls._client is None:
            await cls._instance._connect()
        return cls._client

    async def _connect(self):
        log.info(f"连接 Elasticsearch: {settings.es_hosts_list}")
        try:
            es_kwargs = {
                "hosts": settings.es_hosts_list,
                "timeout": 30,
                "max_retries": 3,
                "retry_on_timeout": True
            }
            if settings.ES_USER and settings.ES_PASSWORD:
                es_kwargs["basic_auth"] = (settings.ES_USER, settings.ES_PASSWORD)

            self._client = AsyncElasticsearch(**es_kwargs)
            if not await self._client.ping():
                raise ConnectionError("无法连接到 Elasticsearch")
            log.info("Elasticsearch 连接成功")
        except Exception as e:
            log.error(f"Elasticsearch 连接失败: {str(e)}")
            self._client = None
            raise

    async def close(self):
        if self._client:
            log.info("关闭 Elasticsearch 连接...")
            await self._client.close()
            self._client = None
            log.info("Elasticsearch 连接已关闭")

    async def create_index(self, index_name: str, mappings: Dict[str, Any]) -> bool:
        try:
            if await self._client.indices.exists(index=index_name):
                log.info(f"索引 {index_name} 已存在")
                return True
            await self._client.indices.create(
                index=index_name,
                mappings=mappings,
                settings={"number_of_shards": 1, "number_of_replicas": 0}
            )
            log.info(f"索引 {index_name} 创建成功")
            return True
        except RequestError as e:
            if e.status == 400 and "resource_already_exists" in str(e):
                return True
            log.error(f"创建索引 {index_name} 失败: {str(e)}")
            raise
        except Exception as e:
            log.error(f"创建索引 {index_name} 失败: {str(e)}")
            raise

    async def index_document(self, index_name: str, doc_id: str, document: Dict[str, Any]) -> bool:
        try:
            await self._client.index(
                index=index_name,
                id=doc_id,
                document=document
            )
            return True
        except Exception as e:
            log.error(f"索引文档失败: {str(e)}")
            return False

    async def bulk_index(self, index_name: str, documents: List[Dict[str, Any]]) -> int:
        try:
            actions = []
            for doc in documents:
                doc_id = doc.pop("id", None)
                action = {"index": {"_index": index_name}}
                if doc_id:
                    action["index"]["_id"] = str(doc_id)
                actions.append(action)
                actions.append(doc)

            response = await self._client.bulk(operations=actions, refresh=True)
            failed = sum(1 for item in response["items"] if item.get("index", {}).get("error"))
            success = len(documents) - failed
            log.info(f"批量索引完成: 成功 {success}, 失败 {failed}")
            return success
        except Exception as e:
            log.error(f"批量索引失败: {str(e)}")
            return 0

    async def search(self, index_name: str, query: Dict[str, Any], size: int = 10, from_: int = 0) -> Dict[str, Any]:
        try:
            response = await self._client.search(
                index=index_name,
                query=query,
                size=size,
                from_=from_
            )
            return self._parse_response(response)
        except Exception as e:
            log.error(f"搜索失败: {str(e)}")
            raise

    async def knn_search(self, index_name: str, vector: List[float], field: str, k: int = 10,
                         filter_query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        try:
            knn = {
                "field": field,
                "query_vector": vector,
                "k": k,
                "num_candidates": k * 10
            }
            if filter_query:
                knn["filter"] = filter_query

            response = await self._client.search(
                index=index_name,
                knn=knn,
                size=k
            )
            return self._parse_response(response)
        except Exception as e:
            log.error(f"KNN 搜索失败: {str(e)}")
            raise

    async def hybrid_search(self, index_name: str, keyword_query: Dict[str, Any],
                            vector: List[float], field: str, k: int = 10) -> Dict[str, Any]:
        try:
            knn = {
                "field": field,
                "query_vector": vector,
                "k": k,
                "num_candidates": k * 10,
                "boost": 0.5
            }
            query = {
                "bool": {
                    "should": [keyword_query],
                    "minimum_should_match": 0
                }
            }
            response = await self._client.search(
                index=index_name,
                query=query,
                knn=knn,
                size=k,
                rank={"rrf": {}}
            )
            return self._parse_response(response)
        except Exception as e:
            log.error(f"混合搜索失败: {str(e)}")
            raise

    async def delete_document(self, index_name: str, doc_id: str) -> bool:
        try:
            await self._client.delete(index=index_name, id=doc_id)
            return True
        except Exception as e:
            log.error(f"删除文档失败: {str(e)}")
            return False

    async def get_document(self, index_name: str, doc_id: str) -> Optional[Dict[str, Any]]:
        try:
            response = await self._client.get(index=index_name, id=doc_id)
            if response["found"]:
                return response["_source"]
            return None
        except Exception as e:
            log.error(f"获取文档失败: {str(e)}")
            return None

    def _parse_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        total = response["hits"]["total"]["value"] if "total" in response["hits"] else len(response["hits"]["hits"])
        hits = []
        for hit in response["hits"]["hits"]:
            item = hit["_source"]
            item["_id"] = hit["_id"]
            item["_score"] = hit.get("_score", 0.0)
            hits.append(item)
        return {
            "total": total,
            "hits": hits,
            "max_score": response["hits"].get("max_score", 0.0),
            "took": response.get("took", 0)
        }


es_client = ElasticsearchClient()


async def get_es() -> AsyncElasticsearch:
    return await ElasticsearchClient.get_client()


async def init_es():
    log.info("初始化 Elasticsearch 索引...")
    await es_client.get_client()

    law_mappings = {
        "properties": {
            "title": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "content": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "article_no": {"type": "keyword"},
            "law_type": {"type": "keyword"},
            "category": {"type": "keyword"},
            "chapter": {"type": "keyword"},
            "section": {"type": "keyword"},
            "tags": {"type": "keyword"},
            "source": {"type": "keyword"},
            "effective_date": {"type": "date"},
            "status": {"type": "keyword"},
            "embedding": {"type": "dense_vector", "dims": 1536, "index": True, "similarity": "cosine"},
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"}
        }
    }
    await es_client.create_index(settings.ES_INDEX_LAWS, law_mappings)

    case_mappings = {
        "properties": {
            "title": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "content": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "case_no": {"type": "keyword"},
            "court": {"type": "keyword"},
            "case_type": {"type": "keyword"},
            "judgment_date": {"type": "date"},
            "parties": {"type": "keyword"},
            "summary": {"type": "text", "analyzer": "ik_max_word", "search_analyzer": "ik_smart"},
            "legal_basis": {"type": "text"},
            "judgment_result": {"type": "text"},
            "tags": {"type": "keyword"},
            "embedding": {"type": "dense_vector", "dims": 1536, "index": True, "similarity": "cosine"},
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"}
        }
    }
    await es_client.create_index(settings.ES_INDEX_CASES, case_mappings)
    log.info("Elasticsearch 索引初始化完成")


async def close_es():
    await es_client.close()
