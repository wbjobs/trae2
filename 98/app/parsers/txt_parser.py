from typing import Optional
from loguru import logger

from app.parsers.base_parser import BaseParser
from app.schemas.document import DocumentParseResult


class TxtParser(BaseParser):
    def parse(self, file_path: str, password: Optional[str] = None) -> DocumentParseResult:
        try:
            encodings = ["utf-8", "gbk", "gb2312", "latin-1"]
            content = None

            for encoding in encodings:
                try:
                    with open(file_path, "r", encoding=encoding) as f:
                        content = f.read()
                    break
                except UnicodeDecodeError:
                    continue

            if content is None:
                raise ValueError("无法识别文件编码")

            if not content.strip():
                return DocumentParseResult(
                    success=False,
                    error="文本文件内容为空",
                )

            return DocumentParseResult(
                success=True,
                content=content,
                word_count=self._count_words(content),
                paragraph_count=self._count_paragraphs(content),
            )
        except PermissionError:
            return DocumentParseResult(
                success=False,
                error="无权限访问该文件",
            )
        except Exception as e:
            logger.error(f"Failed to parse TXT file {file_path}: {e}")
            return DocumentParseResult(
                success=False,
                error=f"TXT解析失败: {str(e)}",
            )
