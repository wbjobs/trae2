from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user
from app.models import User
from app.schemas import SearchQuery, SearchResponse
from app.semantic_search.searcher import semantic_search, keyword_search, hybrid_search

router = APIRouter(prefix="/search", tags=["语义检索"])


@router.post("", response_model=SearchResponse)
async def search_documents(
    query: SearchQuery,
    current_user: User = Depends(get_current_user),
):
    if query.search_type == "semantic":
        return await semantic_search(query.query, top_k=query.top_k, owner_id=current_user.id)
    elif query.search_type == "keyword":
        return await keyword_search(query.query, top_k=query.top_k, owner_id=current_user.id)
    elif query.search_type == "hybrid":
        return await hybrid_search(query.query, top_k=query.top_k, owner_id=current_user.id)
    else:
        return await semantic_search(query.query, top_k=query.top_k, owner_id=current_user.id)


@router.post("/global", response_model=SearchResponse)
async def search_global(
    query: SearchQuery,
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only for global search")

    if query.search_type == "semantic":
        return await semantic_search(query.query, top_k=query.top_k)
    elif query.search_type == "keyword":
        return await keyword_search(query.query, top_k=query.top_k)
    else:
        return await hybrid_search(query.query, top_k=query.top_k)
