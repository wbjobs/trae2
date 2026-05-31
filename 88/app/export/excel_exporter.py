import uuid
from datetime import datetime
from app.export.base import BaseExporter


class ExcelExporter(BaseExporter):
    async def export(self, documents: list[dict], options: dict) -> str:
        import pandas as pd

        export_dir = self._ensure_export_dir()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"export_{timestamp}_{uuid.uuid4().hex[:8]}.xlsx"
        filepath = export_dir / filename

        rows = []
        for doc in documents:
            row = {
                "ID": doc.get("id", ""),
                "文件名": doc.get("original_name", ""),
                "文件类型": doc.get("file_type", ""),
                "状态": doc.get("status", ""),
            }
            if options.get("include_summary"):
                row["摘要"] = doc.get("summary", "")
            if options.get("include_keywords"):
                row["关键词"] = doc.get("keywords", "")
            if options.get("include_correction"):
                row["纠错结果"] = doc.get("correction", "")
            if options.get("include_classification"):
                row["分类标签"] = doc.get("classification", "")
            if options.get("include_translation"):
                row["翻译结果"] = doc.get("translation", "")
            if options.get("include_content"):
                row["内容"] = doc.get("content", "")
            row["创建时间"] = doc.get("created_at", "")
            rows.append(row)

        df = pd.DataFrame(rows)
        df.to_excel(filepath, index=False, engine="openpyxl")

        return str(filepath)
