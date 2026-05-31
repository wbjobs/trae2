from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api import auth, data, dashboard, reports, analysis, layout
from utils.database import init_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(
    title="设备运维指标分析平台 API",
    description="基于 React + Pandas + Doris + ECharts 的设备运维指标分析可视化平台",
    version="1.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(data.router, prefix="/api/data", tags=["数据管理"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["仪表盘"])
app.include_router(reports.router, prefix="/api/reports", tags=["报表管理"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["深度分析"])
app.include_router(layout.router, prefix="/api/layout", tags=["大屏布局"])


@app.get("/")
async def root():
    return {
        "message": "设备运维指标分析平台 API",
        "version": "1.0.0",
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
