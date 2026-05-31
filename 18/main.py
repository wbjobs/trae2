import logging
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import init_db
from gateway import router

logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(settings.LOG_FILE, encoding="utf-8")
    ]
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="行业专业文档语义抽取与智能归类AI应用服务系统",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
async def startup_event():
    """服务启动事件"""
    logger.info("=" * 60)
    logger.info(f"{settings.PROJECT_NAME} 启动中...")
    logger.info(f"版本: {settings.VERSION}")
    logger.info(f"服务地址: {settings.SERVER_HOST}:{settings.SERVER_PORT}")
    logger.info(f"API文档: http://{settings.SERVER_HOST}:{settings.SERVER_PORT}/docs")
    logger.info("=" * 60)

    try:
        init_db()
        logger.info("数据库初始化成功")
    except Exception as e:
        logger.error(f"数据库初始化失败: {str(e)}")
        raise

    logger.info("服务启动完成")


@app.on_event("shutdown")
async def shutdown_event():
    """服务关闭事件"""
    logger.info(f"{settings.PROJECT_NAME} 关闭中...")
    logger.info("服务已关闭")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=False,
        workers=settings.WORKER_COUNT
    )
