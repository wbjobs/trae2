from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from backend.config import settings
from backend.database.clickhouse import init_clickhouse
from backend.api import auth, timeseries, dashboard, reports, cleaning, analysis
from backend.utils.logger import setup_logger

logger = setup_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Industrial IoT Analytics Platform...")
    try:
        init_clickhouse()
        logger.info("ClickHouse initialized successfully")
    except Exception as e:
        logger.error(f"ClickHouse initialization failed: {e}")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="工业时序工况数据分析与可视化平台 API",
    description="基于 ClickHouse 的工业时序数据处理与可视化平台",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["认证授权"])
app.include_router(timeseries.router, prefix="/api/timeseries", tags=["时序数据"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["仪表盘"])
app.include_router(reports.router, prefix="/api/reports", tags=["报表管理"])
app.include_router(cleaning.router, prefix="/api/cleaning", tags=["数据清洗"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["分析拓展"])

app.mount("/static", StaticFiles(directory="frontend/dist"), name="static")


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Industrial IoT Analytics Platform"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
