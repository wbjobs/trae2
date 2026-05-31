from sanic import Blueprint, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from app.core import success, paginated_response, get_db, NotFoundException
from app.modules.auth import login_required, permission_required
from app.modules.search import SearchService, LawService, CaseService

search_bp = Blueprint("search", url_prefix="/api/search")


class IndexBatchRequest(BaseModel):
    law_ids: Optional[List[int]] = None
    case_ids: Optional[List[int]] = None


class LawUpdateRequest(BaseModel):
    title: Optional[str] = None
    article_no: Optional[str] = None
    law_type: Optional[str] = None
    category: Optional[str] = None
    chapter: Optional[str] = None
    section: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None


class CaseUpdateRequest(BaseModel):
    title: Optional[str] = None
    case_no: Optional[str] = None
    court: Optional[str] = None
    case_type: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    legal_basis: Optional[str] = None
    judgment_result: Optional[str] = None
    tags: Optional[List[str]] = None


@search_bp.get("/laws")
@login_required()
@permission_required("law:search")
async def search_laws(request: Request):
    keyword = request.args.get("q", "")
    law_type = request.args.get("law_type")
    category = request.args.get("category")
    status = request.args.get("status", "active")
    search_type = request.args.get("search_type", "hybrid")
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))

    if search_type not in ["keyword", "semantic", "hybrid"]:
        search_type = "hybrid"

    result = await SearchService.search_laws(
        keyword=keyword,
        law_type=law_type,
        category=category,
        status=status,
        search_type=search_type,
        page=page,
        page_size=page_size
    )

    return paginated_response(
        result["hits"],
        result["total"],
        page,
        page_size,
        f"找到 {result['total']} 条相关法条，耗时 {result['took']}ms"
    )


@search_bp.get("/cases")
@login_required()
@permission_required("case:search")
async def search_cases(request: Request):
    keyword = request.args.get("q", "")
    case_type = request.args.get("case_type")
    court = request.args.get("court")
    search_type = request.args.get("search_type", "hybrid")
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))

    if search_type not in ["keyword", "semantic", "hybrid"]:
        search_type = "hybrid"

    result = await SearchService.search_cases(
        keyword=keyword,
        case_type=case_type,
        court=court,
        search_type=search_type,
        page=page,
        page_size=page_size
    )

    return paginated_response(
        result["hits"],
        result["total"],
        page,
        page_size,
        f"找到 {result['total']} 个相关案例，耗时 {result['took']}ms"
    )


@search_bp.get("/laws/<law_id:int>")
@login_required()
@permission_required("law:search")
async def get_law_detail(request: Request, law_id: int):
    law_doc = await SearchService.get_law_by_id(law_id)
    if not law_doc:
        async with get_db() as db:
            law = await LawService.get_law(db, law_id)
            if not law:
                raise NotFoundException("法条不存在")
            law_doc = {
                "id": law.id,
                "title": law.title,
                "article_no": law.article_no,
                "law_type": law.law_type,
                "category": law.category,
                "chapter": law.chapter,
                "section": law.section,
                "content": law.content,
                "source": law.source,
                "status": law.status,
                "tags": law.tags,
                "es_indexed": law.es_indexed == 1,
                "created_at": law.created_at.isoformat() if law.created_at else None
            }
    return success(law_doc)


@search_bp.get("/cases/<case_id:int>")
@login_required()
@permission_required("case:search")
async def get_case_detail(request: Request, case_id: int):
    case_doc = await SearchService.get_case_by_id(case_id)
    if not case_doc:
        async with get_db() as db:
            case = await CaseService.get_case(db, case_id)
            if not case:
                raise NotFoundException("案例不存在")
            case_doc = {
                "id": case.id,
                "title": case.title,
                "case_no": case.case_no,
                "court": case.court,
                "case_type": case.case_type,
                "summary": case.summary,
                "content": case.content,
                "legal_basis": case.legal_basis,
                "judgment_result": case.judgment_result,
                "tags": case.tags,
                "es_indexed": case.es_indexed == 1,
                "created_at": case.created_at.isoformat() if case.created_at else None
            }
    return success(case_doc)


@search_bp.post("/laws/<law_id:int>/index")
@login_required()
@permission_required("law:manage")
async def index_law(request: Request, law_id: int):
    success_flag = await SearchService.index_law(law_id)
    return success({"indexed": success_flag}, "索引成功" if success_flag else "索引失败")


@search_bp.post("/cases/<case_id:int>/index")
@login_required()
@permission_required("law:manage")
async def index_case(request: Request, case_id: int):
    success_flag = await SearchService.index_case(case_id)
    return success({"indexed": success_flag}, "索引成功" if success_flag else "索引失败")


@search_bp.post("/batch-index")
@login_required()
@permission_required("law:manage")
async def batch_index(request: Request):
    user = request.ctx.user
    req = IndexBatchRequest(**request.json)

    if not req.law_ids and not req.case_ids:
        raise NotFoundException("请指定要索引的法条或案例ID")

    async with get_db() as db:
        from app.modules.tasks import TaskService, TaskType
        task = await TaskService.create_task(
            db,
            name=f"批量索引 laws={len(req.law_ids or [])}, cases={len(req.case_ids or [])}",
            task_type=TaskType.INDEX_BATCH,
            params={"law_ids": req.law_ids or [], "case_ids": req.case_ids or []},
            creator_id=user.id
        )
        return success({"task_id": task.id}, "已提交批量索引任务")


@search_bp.get("/laws/similar/<law_id:int>")
@login_required()
@permission_required("law:search")
async def get_similar_laws(request: Request, law_id: int):
    top_k = int(request.args.get("top_k", 10))

    async with get_db() as db:
        law = await LawService.get_law(db, law_id)
        if not law:
            raise NotFoundException("法条不存在")

    similar_laws = await SearchService.find_similar_laws(law.content, top_k=top_k)
    similar_laws = [l for l in similar_laws if int(l.get("_id", 0)) != law_id]

    return success(similar_laws, f"找到 {len(similar_laws)} 条相似法条")


@search_bp.get("/cases/similar/<case_id:int>")
@login_required()
@permission_required("case:search")
async def get_similar_cases(request: Request, case_id: int):
    top_k = int(request.args.get("top_k", 10))

    async with get_db() as db:
        case = await CaseService.get_case(db, case_id)
        if not case:
            raise NotFoundException("案例不存在")

    content_for_search = case.summary or case.content
    similar_cases = await SearchService.find_similar_cases(content_for_search, top_k=top_k)
    similar_cases = [c for c in similar_cases if int(c.get("_id", 0)) != case_id]

    return success(similar_cases, f"找到 {len(similar_cases)} 个相似案例")


@search_bp.get("/manage/laws")
@login_required()
@permission_required("law:manage")
async def list_manage_laws(request: Request):
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    law_type = request.args.get("law_type")
    category = request.args.get("category")
    es_indexed = request.args.get("es_indexed")
    keyword = request.args.get("keyword")

    es_indexed_val = None
    if es_indexed is not None:
        es_indexed_val = 1 if es_indexed.lower() in ["1", "true", "yes"] else 0

    async with get_db() as db:
        laws, total = await LawService.list_laws(
            db,
            skip=(page - 1) * page_size,
            limit=page_size,
            law_type=law_type,
            category=category,
            es_indexed=es_indexed_val,
            keyword=keyword
        )

        law_list = [{
            "id": l.id,
            "title": l.title,
            "article_no": l.article_no,
            "law_type": l.law_type,
            "category": l.category,
            "chapter": l.chapter,
            "status": l.status,
            "es_indexed": l.es_indexed == 1,
            "created_at": l.created_at.isoformat() if l.created_at else None
        } for l in laws]

        return paginated_response(law_list, total, page, page_size)


@search_bp.get("/manage/cases")
@login_required()
@permission_required("law:manage")
async def list_manage_cases(request: Request):
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    case_type = request.args.get("case_type")
    court = request.args.get("court")
    es_indexed = request.args.get("es_indexed")
    keyword = request.args.get("keyword")

    es_indexed_val = None
    if es_indexed is not None:
        es_indexed_val = 1 if es_indexed.lower() in ["1", "true", "yes"] else 0

    async with get_db() as db:
        cases, total = await CaseService.list_cases(
            db,
            skip=(page - 1) * page_size,
            limit=page_size,
            case_type=case_type,
            court=court,
            es_indexed=es_indexed_val,
            keyword=keyword
        )

        case_list = [{
            "id": c.id,
            "title": c.title,
            "case_no": c.case_no,
            "court": c.court,
            "case_type": c.case_type,
            "es_indexed": c.es_indexed == 1,
            "created_at": c.created_at.isoformat() if c.created_at else None
        } for c in cases]

        return paginated_response(case_list, total, page, page_size)


@search_bp.put("/laws/<law_id:int>")
@login_required()
@permission_required("law:manage")
async def update_law(request: Request, law_id: int):
    req = LawUpdateRequest(**request.json)
    async with get_db() as db:
        law = await LawService.update_law(
            db,
            law_id,
            **req.model_dump(exclude_unset=True)
        )
        return success({
            "id": law.id,
            "title": law.title,
            "es_indexed": False
        }, "更新成功，需要重新索引")


@search_bp.put("/cases/<case_id:int>")
@login_required()
@permission_required("law:manage")
async def update_case(request: Request, case_id: int):
    req = CaseUpdateRequest(**request.json)
    async with get_db() as db:
        case = await CaseService.update_case(
            db,
            case_id,
            **req.model_dump(exclude_unset=True)
        )
        return success({
            "id": case.id,
            "title": case.title,
            "es_indexed": False
        }, "更新成功，需要重新索引")


@search_bp.delete("/laws/<law_id:int>")
@login_required()
@permission_required("law:manage")
async def delete_law(request: Request, law_id: int):
    async with get_db() as db:
        await LawService.delete_law(db, law_id)
        return success(message="删除成功")


@search_bp.delete("/cases/<case_id:int>")
@login_required()
@permission_required("law:manage")
async def delete_case(request: Request, case_id: int):
    async with get_db() as db:
        await CaseService.delete_case(db, case_id)
        return success(message="删除成功")
