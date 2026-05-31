from typing import List, Dict, Any, Optional
from loguru import logger

from app.search.es_client import es_client
from app.models.document import Document

INDEX_NAME = "documents"

DOCUMENT_MAPPINGS = {
    "properties": {
        "id": {"type": "integer"},
        "title": {
            "type": "text",
            "analyzer": "ik_max_word",
            "search_analyzer": "ik_smart",
        },
        "filename": {"type": "keyword"},
        "content": {
            "type": "text",
            "analyzer": "ik_max_word",
            "search_analyzer": "ik_smart",
        },
        "industry": {"type": "keyword"},
        "file_type": {"type": "keyword"},
        "owner_id": {"type": "integer"},
        "status": {"type": "keyword"},
        "created_at": {"type": "date"},
        "updated_at": {"type": "date"},
    }
}

DOCUMENT_SETTINGS = {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "analysis": {
        "analyzer": {
            "ik_max_word": {
                "type": "ik_max_word"
            },
            "ik_smart": {
                "type": "ik_smart"
            }
        }
    }
}


class DocumentIndex:
    async def init_index(self):
        return await es_client.create_index(INDEX_NAME, DOCUMENT_MAPPINGS, DOCUMENT_SETTINGS)

    async def index_document(self, document: Document):
        if not es_client.client:
            return False
        try:
            doc_data = {
                "id": document.id,
                "title": document.title,
                "filename": document.filename,
                "content": document.content or "",
                "industry": document.industry,
                "file_type": document.file_type,
                "owner_id": document.owner_id,
                "status": document.status,
                "created_at": document.created_at.isoformat() if document.created_at else None,
                "updated_at": document.updated_at.isoformat() if document.updated_at else None,
            }
            await es_client.index_document(INDEX_NAME, str(document.id), doc_data)
            return True
        except Exception as e:
            logger.error(f"Index document {document.id} failed: {e}")
            return False

    async def search_documents(
        self,
        keyword: str,
        user_id: Optional[int] = None,
        industry: Optional[str] = None,
        file_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        if not es_client.client:
            return {"total": 0, "documents": []}

        must_clauses = []
        if keyword:
            must_clauses.append({
                "multi_match": {
                    "query": keyword,
                    "fields": ["title^3", "content"],
                    "type": "best_fields",
                }
            })

        filter_clauses = []
        if user_id:
            filter_clauses.append({"term": {"owner_id": user_id}})
        if industry:
            filter_clauses.append({"term": {"industry": industry}})
        if file_type:
            filter_clauses.append({"term": {"file_type": file_type}})

        query = {}
        if must_clauses or filter_clauses:
            query = {
                "bool": {
                    "must": must_clauses if must_clauses else [{"match_all": {}}],
                    "filter": filter_clauses,
                }
            }
        else:
            query = {"match_all": {}}

        from_ = (page - 1) * page_size
        result = await es_client.search(INDEX_NAME, query, size=page_size, from_=from_)

        if not result:
            return {"total": 0, "documents": []}

        total = result["hits"]["total"]["value"]
        documents = []
        for hit in result["hits"]["hits"]:
            doc = hit["_source"]
            doc["score"] = hit["_score"]
            documents.append(doc)

        return {"total": total, "documents": documents}

    async def delete_document(self, doc_id: int):
        return await es_client.delete_document(INDEX_NAME, str(doc_id))

    async def bulk_index(self, documents: List[Document]):
        for doc in documents:
            await self.index_document(doc)


document_index = DocumentIndex()
