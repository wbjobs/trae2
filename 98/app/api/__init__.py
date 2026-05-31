from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.documents import router as documents_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.search import router as search_router
from app.api.v1.export import router as export_router
from app.api.v1.admin import router as admin_router
from app.api.v1.polish import router as polish_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router, prefix="/auth", tags=["认证授权"])
api_router.include_router(documents_router, prefix="/documents", tags=["文档管理"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["校对任务"])
api_router.include_router(polish_router, prefix="/polish", tags=["润色对比"])
api_router.include_router(search_router, prefix="/search", tags=["搜索"])
api_router.include_router(export_router, prefix="/export", tags=["导出"])
api_router.include_router(admin_router, prefix="/admin", tags=["管理"])
