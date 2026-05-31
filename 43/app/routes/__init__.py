from app.routes.collection import router as collection_router
from app.routes.alarm import router as alarm_router
from app.routes.monitor import router as monitor_router

__all__ = ["collection_router", "alarm_router", "monitor_router"]