from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings
from .logger import log

Base = declarative_base()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,
    pool_recycle=3600
)

async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)


@asynccontextmanager
async def get_db() -> AsyncSession:
    session = async_session()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        log.error(f"数据库会话错误: {str(e)}")
        raise
    finally:
        await session.close()


async def init_db():
    log.info("初始化数据库...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("数据库初始化完成")


async def close_db():
    log.info("关闭数据库连接...")
    await engine.dispose()
    log.info("数据库连接已关闭")
