import json
import uuid
from datetime import datetime
from app.export.base import BaseExporter


class JsonExporter(BaseExporter):
    async def export(self, documents: list[dict], options: dict) -> str:
        export_dir = self._ensure_export_dir()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"export_{timestamp}_{uuid.uuid4().hex[:8]}.json"
        filepath = export_dir / filename

        export_data = {
            "export_time": datetime.now().isoformat(),
            "total": len(documents),
            "documents": documents,
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2, default=str)

        return str(filepath)
