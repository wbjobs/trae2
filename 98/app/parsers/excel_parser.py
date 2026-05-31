import pandas as pd
from openpyxl.utils.exceptions import InvalidFileException
from loguru import logger

from app.parsers.base_parser import BaseParser
from app.schemas.document import DocumentParseResult


class ExcelParser(BaseParser):
    def parse(self, file_path: str, password: Optional[str] = None) -> DocumentParseResult:
        try:
            try:
                excel_file = pd.ExcelFile(file_path)
            except InvalidFileException:
                return DocumentParseResult(
                    success=False,
                    error="文件不是有效的Excel文档",
                )
            except Exception as e:
                error_str = str(e).lower()
                if "password" in error_str or "encrypt" in error_str or "protected" in error_str:
                    return DocumentParseResult(
                        success=False,
                        error="Excel文档已加密或受保护，请先解密文档后再上传",
                    )
                elif "corrupt" in error_str or "damaged" in error_str:
                    return DocumentParseResult(
                        success=False,
                        error="Excel文档已损坏",
                    )
                raise

            content_parts = []
            sheet_count = len(excel_file.sheet_names)

            if sheet_count == 0:
                return DocumentParseResult(
                    success=False,
                    error="Excel文档没有工作表",
                )

            for sheet_name in excel_file.sheet_names:
                try:
                    content_parts.append(f"=== 工作表: {sheet_name} ===")
                    df = pd.read_excel(file_path, sheet_name=sheet_name)

                    if df.empty:
                        content_parts.append("[空工作表]")
                        content_parts.append("")
                        continue

                    headers = " | ".join(str(col) for col in df.columns)
                    content_parts.append(headers)
                    content_parts.append("-" * min(100, len(headers)))

                    row_count = 0
                    for _, row in df.iterrows():
                        row_content = " | ".join(str(val) if pd.notna(val) else "" for val in row.values)
                        if row_content.strip():
                            content_parts.append(row_content)
                            row_count += 1

                    content_parts.append("")

                except Exception as sheet_e:
                    logger.warning(f"Failed to read sheet {sheet_name}: {sheet_e}")
                    content_parts.append(f"[工作表 {sheet_name} 读取失败]")
                    content_parts.append("")

            content = "\n".join(content_parts)

            if not content.strip() or all("===" in part or "[空" in part or "[工作" in part for part in content_parts):
                return DocumentParseResult(
                    success=False,
                    error="Excel文档内容为空或无法读取数据",
                )

            return DocumentParseResult(
                success=True,
                content=content,
                word_count=self._count_words(content),
                paragraph_count=sheet_count,
            )

        except Exception as e:
            logger.error(f"Failed to parse Excel file {file_path}: {e}")
            error_msg = str(e)
            if "password" in error_msg.lower() or "protect" in error_msg.lower():
                error_msg = "Excel文档已加密或受保护，请先解密文档后再上传"
            return DocumentParseResult(
                success=False,
                error=f"Excel解析失败: {error_msg}",
            )
