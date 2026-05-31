import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger
from pathlib import Path

from app.config import get_settings, ensure_dirs
from app.database import init_db
from app.semantic_search.es_client import close_es_client
from app.semantic_search.indexer import ensure_index


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    ensure_dirs()
    logger.add(settings.LOG_FILE, rotation="10 MB", retention="7 days", level=settings.LOG_LEVEL)
    logger.info("Starting DocSemanticAI...")

    await init_db()
    logger.info("Database initialized")

    try:
        await ensure_index()
        logger.info("Elasticsearch index ensured")
    except Exception as e:
        logger.warning(f"Elasticsearch index setup skipped: {e}")

    yield

    await close_es_client()
    logger.info("DocSemanticAI shutdown complete")


app = FastAPI(
    title="DocSemanticAI - 文档语义批量处理系统",
    description="基于 FastAPI + 开源大模型 + Elasticsearch 的文档语义批量处理 AI 应用系统",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import auth, documents, tasks, search, export
from app.routers import ws as ws_router

app.include_router(auth.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")
app.include_router(ws_router.router)

frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")


@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy", "service": "DocSemanticAI", "version": "2.0.0"}
