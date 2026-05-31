import csv
import uuid
from datetime import datetime
from app.export.base import BaseExporter


class CsvExporter(BaseExporter):
    async def export(self, documents: list[dict], options: dict) -> str:
        export_dir = self._ensure_export_dir()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"export_{timestamp}_{uuid.uuid4().hex[:8]}.csv"
        filepath = export_dir / filename

        fieldnames = ["id", "original_name", "file_type", "status"]
        if options.get("include_summary"):
            fieldnames.append("summary")
        if options.get("include_keywords"):
            fieldnames.append("keywords")
        if options.get("include_correction"):
            fieldnames.append("correction")
        if options.get("include_classification"):
            fieldnames.append("classification")
        if options.get("include_translation"):
            fieldnames.append("translation")
        if options.get("include_content"):
            fieldnames.append("content")
        fieldnames.extend(["created_at"])

        with open(filepath, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for doc in documents:
                row = {}
                for field in fieldnames:
                    row[field] = str(doc.get(field, ""))[:5000]
                writer.writerow(row)

        return str(filepath)
