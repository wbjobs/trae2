from abc import ABC, abstractmethod
from pathlib import Path
from app.config import get_settings

settings = get_settings()


class BaseExporter(ABC):
    @abstractmethod
    async def export(self, documents: list[dict], options: dict) -> str:
        pass

    def _ensure_export_dir(self) -> Path:
        export_dir = Path(settings.EXPORT_DIR)
        export_dir.mkdir(parents=True, exist_ok=True)
        return export_dir
