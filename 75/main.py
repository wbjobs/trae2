import asyncio
import signal
import sys
from contextlib import asynccontextmanager

import uvicorn

from config import get_settings
from logger import setup_logger
from orchestrator import Orchestrator
from api_gateway import app, set_orchestrator
from data_init import init_data_dir

logger = setup_logger("main")
settings = get_settings()

orchestrator = Orchestrator()


@asynccontextmanager
async def lifespan(application):
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}...")
    init_data_dir()
    await orchestrator.initialize()
    set_orchestrator(orchestrator)
    logger.info("All modules initialized, service is ready")

    yield

    logger.info("Shutting down service...")
    await orchestrator.shutdown()
    logger.info("Service stopped")


app.router.lifespan_context = lifespan


def handle_signal(signum, frame):
    logger.info(f"Received signal {signum}, initiating shutdown...")
    asyncio.get_event_loop().create_task(orchestrator.shutdown())
    sys.exit(0)


signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        workers=settings.WORKERS,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=True,
        loop="uvloop" if sys.platform.startswith("linux") else "asyncio",
    )
