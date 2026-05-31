from fastapi import APIRouter
from app.api.v1.extraction import router as extraction_router
from app.api.v1.batch import router as batch_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(extraction_router)
api_router.include_router(batch_router)
