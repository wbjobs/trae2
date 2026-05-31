from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core import settings, log, es_client, NotFoundException, BadRequestException, async_session, get_db
from app.models import Law, Case


class SearchService:
    @staticmethod
    async def index_law(law_id: int) -> bool:
        async with get_db() as db:
            result = await db.execute(select(Law).where(Law.id == law_id))
            law = result.scalar_one_or_none()
            if not law:
                raise NotFoundException("法条不存在")

            from app.modules.ai import AIService
            embedding = await AIService.get_embedding(law.content)

            doc = {
                "id": str(law.id),
                "title": law.title,
                "content": law.content,
                "article_no": law.article_no,
                "law_type": law.law_type,
                "category": law.category,
                "chapter": law.chapter,
                "section": law.section,
                "tags": law.tags or [],
                "source": law.source,
                "effective_date": law.effective_date.isoformat() if law.effective_date else None,
                "status": law.status,
                "embedding": embedding,
                "created_at": law.created_at.isoformat() if law.created_at else None,
                "updated_at": law.updated_at.isoformat() if law.updated_at else None
            }

            success = await es_client.index_document(settings.ES_INDEX_LAWS, str(law.id), doc)
            if success:
                law.es_indexed = 1
                await db.commit()
            return success

    @staticmethod
    async def index_case(case_id: int) -> bool:
        async with get_db() as db:
            result = await db.execute(select(Case).where(Case.id == case_id))
            case = result.scalar_one_or_none()
            if not case:
                raise NotFoundException("案例不存在")

            from app.modules.ai import AIService
            content_for_embedding = case.summary or case.content
            embedding = await AIService.get_embedding(content_for_embedding)

            doc = {
                "id": str(case.id),
                "title": case.title,
                "content": case.content,
                "case_no": case.case_no,
                "court": case.court,
                "case_type": case.case_type,
                "judgment_date": case.judgment_date.isoformat() if case.judgment_date else None,
                "parties": case.parties or [],
                "summary": case.summary,
                "legal_basis": case.legal_basis,
                "judgment_result": case.judgment_result,
                "tags": case.tags or [],
                "embedding": embedding,
                "created_at": case.created_at.isoformat() if case.created_at else None,
                "updated_at": case.updated_at.isoformat() if case.updated_at else None
            }

            success = await es_client.index_document(settings.ES_INDEX_CASES, str(case.id), doc)
            if success:
                case.es_indexed = 1
                await db.commit()
            return success

    @staticmethod
    async def bulk_index_laws(law_ids: List[int]) -> int:
        async with get_db() as db:
            result = await db.execute(select(Law).where(Law.id.in_(law_ids)))
            laws = result.scalars().all()

            from app.modules.ai import AIService
            docs = []
            for law in laws:
                embedding = await AIService.get_embedding(law.content)
                doc = {
                    "id": str(law.id),
                    "title": law.title,
                    "content": law.content,
                    "article_no": law.article_no,
                    "law_type": law.law_type,
                    "category": law.category,
                    "chapter": law.chapter,
                    "section": law.section,
                    "tags": law.tags or [],
                    "source": law.source,
                    "effective_date": law.effective_date.isoformat() if law.effective_date else None,
                    "status": law.status,
                    "embedding": embedding,
                    "created_at": law.created_at.isoformat() if law.created_at else None,
                    "updated_at": law.updated_at.isoformat() if law.updated_at else None
                }
                docs.append(doc)

            success_count = await es_client.bulk_index(settings.ES_INDEX_LAWS, docs)
            if success_count > 0:
                await db.execute(Law.__table__.update().where(Law.id.in_(law_ids)).values(es_indexed=1))
                await db.commit()
            return success_count

    @staticmethod
    async def bulk_index_cases(case_ids: List[int]) -> int:
        async with get_db() as db:
            result = await db.execute(select(Case).where(Case.id.in_(case_ids)))
            cases = result.scalars().all()

            from app.modules.ai import AIService
            docs = []
            for case in cases:
                content_for_embedding = case.summary or case.content
                embedding = await AIService.get_embedding(content_for_embedding)
                doc = {
                    "id": str(case.id),
                    "title": case.title,
                    "content": case.content,
                    "case_no": case.case_no,
                    "court": case.court,
                    "case_type": case.case_type,
                    "judgment_date": case.judgment_date.isoformat() if case.judgment_date else None,
                    "parties": case.parties or [],
                    "summary": case.summary,
                    "legal_basis": case.legal_basis,
                    "judgment_result": case.judgment_result,
                    "tags": case.tags or [],
                    "embedding": embedding,
                    "created_at": case.created_at.isoformat() if case.created_at else None,
                    "updated_at": case.updated_at.isoformat() if case.updated_at else None
                }
                docs.append(doc)

            success_count = await es_client.bulk_index(settings.ES_INDEX_CASES, docs)
            if success_count > 0:
                await db.execute(Case.__table__.update().where(Case.id.in_(case_ids)).values(es_indexed=1))
                await db.commit()
            return success_count

    @staticmethod
    async def search_laws(
        keyword: str,
        law_type: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
        search_type: str = "hybrid",
        page: int = 1,
        page_size: int = 10
    ) -> Dict[str, Any]:
        from_ = (page - 1) * page_size

        if search_type == "keyword":
            query = SearchService._build_keyword_query(keyword, law_type, category, status)
            result = await es_client.search(settings.ES_INDEX_LAWS, query, page_size, from_)
        elif search_type == "semantic":
            from app.modules.ai import AIService
            embedding = await AIService.get_embedding(keyword)
            filter_query = SearchService._build_filter_query(law_type, category, status)
            result = await es_client.knn_search(
                settings.ES_INDEX_LAWS, embedding, "embedding", page_size + from_, filter_query
            )
            result["hits"] = result["hits"][from_:from_ + page_size]
        else:
            from app.modules.ai import AIService
            embedding = await AIService.get_embedding(keyword)
            keyword_query = SearchService._build_keyword_query(keyword, law_type, category, status)
            result = await es_client.hybrid_search(
                settings.ES_INDEX_LAWS, keyword_query, embedding, "embedding", page_size + from_
            )
            result["hits"] = result["hits"][from_:from_ + page_size]

        return result

    @staticmethod
    async def search_cases(
        keyword: str,
        case_type: Optional[str] = None,
        court: Optional[str] = None,
        search_type: str = "hybrid",
        page: int = 1,
        page_size: int = 10
    ) -> Dict[str, Any]:
        from_ = (page - 1) * page_size

        if search_type == "keyword":
            query = SearchService._build_case_keyword_query(keyword, case_type, court)
            result = await es_client.search(settings.ES_INDEX_CASES, query, page_size, from_)
        elif search_type == "semantic":
            from app.modules.ai import AIService
            embedding = await AIService.get_embedding(keyword)
            filter_query = SearchService._build_case_filter_query(case_type, court)
            result = await es_client.knn_search(
                settings.ES_INDEX_CASES, embedding, "embedding", page_size + from_, filter_query
            )
            result["hits"] = result["hits"][from_:from_ + page_size]
        else:
            from app.modules.ai import AIService
            embedding = await AIService.get_embedding(keyword)
            keyword_query = SearchService._build_case_keyword_query(keyword, case_type, court)
            result = await es_client.hybrid_search(
                settings.ES_INDEX_CASES, keyword_query, embedding, "embedding", page_size + from_
            )
            result["hits"] = result["hits"][from_:from_ + page_size]

        return result

    @staticmethod
    async def find_similar_laws(content: str, top_k: int = 10,
                                law_type: Optional[str] = None) -> List[Dict[str, Any]]:
        from app.modules.ai import AIService
        embedding = await AIService.get_embedding(content)

        filter_query = None
        if law_type:
            filter_query = {"term": {"law_type": law_type}}

        result = await es_client.knn_search(
            settings.ES_INDEX_LAWS, embedding, "embedding", top_k, filter_query
        )
        return result["hits"]

    @staticmethod
    async def find_similar_cases(content: str, top_k: int = 10,
                                 case_type: Optional[str] = None) -> List[Dict[str, Any]]:
        from app.modules.ai import AIService
        embedding = await AIService.get_embedding(content)

        filter_query = None
        if case_type:
            filter_query = {"term": {"case_type": case_type}}

        result = await es_client.knn_search(
            settings.ES_INDEX_CASES, embedding, "embedding", top_k, filter_query
        )
        return result["hits"]

    @staticmethod
    async def get_law_by_id(law_id: int) -> Optional[Dict[str, Any]]:
        return await es_client.get_document(settings.ES_INDEX_LAWS, str(law_id))

    @staticmethod
    async def get_case_by_id(case_id: int) -> Optional[Dict[str, Any]]:
        return await es_client.get_document(settings.ES_INDEX_CASES, str(case_id))

    @staticmethod
    async def delete_law_index(law_id: int) -> bool:
        async with get_db() as db:
            result = await db.execute(select(Law).where(Law.id == law_id))
            law = result.scalar_one_or_none()
            if law:
                law.es_indexed = 0
                await db.commit()
        return await es_client.delete_document(settings.ES_INDEX_LAWS, str(law_id))

    @staticmethod
    async def delete_case_index(case_id: int) -> bool:
        async with get_db() as db:
            result = await db.execute(select(Case).where(Case.id == case_id))
            case = result.scalar_one_or_none()
            if case:
                case.es_indexed = 0
                await db.commit()
        return await es_client.delete_document(settings.ES_INDEX_CASES, str(case_id))

    @staticmethod
    def _build_keyword_query(
        keyword: str,
        law_type: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        bool_query = {"must": [], "filter": []}

        if keyword:
            bool_query["must"].append({
                "multi_match": {
                    "query": keyword,
                    "fields": ["title^3", "content^2", "article_no^2", "chapter", "section"],
                    "type": "best_fields",
                    "minimum_should_match": "70%"
                }
            })

        if law_type:
            bool_query["filter"].append({"term": {"law_type": law_type}})
        if category:
            bool_query["filter"].append({"term": {"category": category}})
        if status:
            bool_query["filter"].append({"term": {"status": status}})

        return {"bool": bool_query}

    @staticmethod
    def _build_filter_query(
        law_type: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        filters = []
        if law_type:
            filters.append({"term": {"law_type": law_type}})
        if category:
            filters.append({"term": {"category": category}})
        if status:
            filters.append({"term": {"status": status}})

        if filters:
            return {"bool": {"filter": filters}}
        return None

    @staticmethod
    def _build_case_keyword_query(
        keyword: str,
        case_type: Optional[str] = None,
        court: Optional[str] = None
    ) -> Dict[str, Any]:
        bool_query = {"must": [], "filter": []}

        if keyword:
            bool_query["must"].append({
                "multi_match": {
                    "query": keyword,
                    "fields": ["title^3", "summary^2", "content", "legal_basis", "judgment_result"],
                    "type": "best_fields",
                    "minimum_should_match": "70%"
                }
            })

        if case_type:
            bool_query["filter"].append({"term": {"case_type": case_type}})
        if court:
            bool_query["filter"].append({"term": {"court": court}})

        return {"bool": bool_query}

    @staticmethod
    def _build_case_filter_query(
        case_type: Optional[str] = None,
        court: Optional[str] = None
    ) -> Dict[str, Any]:
        filters = []
        if case_type:
            filters.append({"term": {"case_type": case_type}})
        if court:
            filters.append({"term": {"court": court}})

        if filters:
            return {"bool": {"filter": filters}}
        return None


class LawService:
    @staticmethod
    async def get_law(db: AsyncSession, law_id: int) -> Optional[Law]:
        result = await db.execute(select(Law).where(Law.id == law_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def list_laws(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        law_type: Optional[str] = None,
        category: Optional[str] = None,
        es_indexed: Optional[int] = None,
        keyword: Optional[str] = None
    ) -> Tuple[List[Law], int]:
        query = select(Law)

        if law_type:
            query = query.where(Law.law_type == law_type)
        if category:
            query = query.where(Law.category == category)
        if es_indexed is not None:
            query = query.where(Law.es_indexed == es_indexed)
        if keyword:
            query = query.where(
                (Law.title.contains(keyword)) |
                (Law.content.contains(keyword)) |
                (Law.article_no.contains(keyword))
            )

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar()

        result = await db.execute(query.offset(skip).limit(limit).order_by(Law.id.desc()))
        laws = result.scalars().all()
        return laws, total

    @staticmethod
    async def update_law(db: AsyncSession, law_id: int, **kwargs) -> Law:
        law = await LawService.get_law(db, law_id)
        if not law:
            raise NotFoundException("法条不存在")

        for key, value in kwargs.items():
            setattr(law, key, value)

        law.es_indexed = 0
        await db.commit()
        await db.refresh(law)
        return law

    @staticmethod
    async def delete_law(db: AsyncSession, law_id: int) -> bool:
        law = await LawService.get_law(db, law_id)
        if not law:
            raise NotFoundException("法条不存在")

        await SearchService.delete_law_index(law_id)
        await db.delete(law)
        await db.commit()
        return True

    @staticmethod
    async def get_unindexed_laws(db: AsyncSession, limit: int = 100) -> List[Law]:
        result = await db.execute(
            select(Law).where(Law.es_indexed == 0).limit(limit)
        )
        return result.scalars().all()


class CaseService:
    @staticmethod
    async def get_case(db: AsyncSession, case_id: int) -> Optional[Case]:
        result = await db.execute(select(Case).where(Case.id == case_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def list_cases(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        case_type: Optional[str] = None,
        court: Optional[str] = None,
        es_indexed: Optional[int] = None,
        keyword: Optional[str] = None
    ) -> Tuple[List[Case], int]:
        query = select(Case)

        if case_type:
            query = query.where(Case.case_type == case_type)
        if court:
            query = query.where(Case.court == court)
        if es_indexed is not None:
            query = query.where(Case.es_indexed == es_indexed)
        if keyword:
            query = query.where(
                (Case.title.contains(keyword)) |
                (Case.summary.contains(keyword)) |
                (Case.case_no.contains(keyword))
            )

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar()

        result = await db.execute(query.offset(skip).limit(limit).order_by(Case.id.desc()))
        cases = result.scalars().all()
        return cases, total

    @staticmethod
    async def update_case(db: AsyncSession, case_id: int, **kwargs) -> Case:
        case = await CaseService.get_case(db, case_id)
        if not case:
            raise NotFoundException("案例不存在")

        for key, value in kwargs.items():
            setattr(case, key, value)

        case.es_indexed = 0
        await db.commit()
        await db.refresh(case)
        return case

    @staticmethod
    async def delete_case(db: AsyncSession, case_id: int) -> bool:
        case = await CaseService.get_case(db, case_id)
        if not case:
            raise NotFoundException("案例不存在")

        await SearchService.delete_case_index(case_id)
        await db.delete(case)
        await db.commit()
        return True

    @staticmethod
    async def get_unindexed_cases(db: AsyncSession, limit: int = 100) -> List[Case]:
        result = await db.execute(
            select(Case).where(Case.es_indexed == 0).limit(limit)
        )
        return result.scalars().all()
