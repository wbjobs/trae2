import pdfplumber
from pdfplumber.pdf import PDFPasswordIncorrect
from loguru import logger

from app.parsers.base_parser import BaseParser
from app.schemas.document import DocumentParseResult


class PdfParser(BaseParser):
    def parse(self, file_path: str, password: Optional[str] = None) -> DocumentParseResult:
        try:
            try:
                with pdfplumber.open(file_path, password=password) as pdf:
                    content_parts = []
                    page_count = len(pdf.pages)

                    if page_count == 0:
                        return DocumentParseResult(
                            success=False,
                            error="PDF文档没有页面内容",
                        )

                    for page_num, page in enumerate(pdf.pages, 1):
                        try:
                            text = page.extract_text()
                            if text and text.strip():
                                content_parts.append(text.strip())
                            else:
                                content_parts.append(f"[第{page_num}页: 无法提取文本内容]")
                        except Exception as page_e:
                            logger.warning(f"Failed to extract page {page_num}: {page_e}")
                            content_parts.append(f"[第{page_num}页: 提取失败]")

                    content = "\n\n".join(content_parts)

                    if not content.strip() or all("[第" in part and "页:" in part for part in content_parts):
                        return DocumentParseResult(
                            success=False,
                            error="PDF文档内容为空或所有页面均无法提取文本（可能是扫描件或图片PDF）",
                        )

                    return DocumentParseResult(
                        success=True,
                        content=content,
                        word_count=self._count_words(content),
                        paragraph_count=self._count_paragraphs(content),
                    )

            except PDFPasswordIncorrect:
                if password:
                    return DocumentParseResult(
                        success=False,
                        error="PDF密码不正确",
                    )
                return DocumentParseResult(
                    success=False,
                    error="PDF文档已加密，请提供密码或先解密文档",
                )
            except Exception as e:
                error_str = str(e).lower()
                if "password" in error_str or "encrypt" in error_str:
                    return DocumentParseResult(
                        success=False,
                        error="PDF文档已加密，请提供密码或先解密文档",
                    )
                raise

        except Exception as e:
            logger.error(f"Failed to parse PDF file {file_path}: {e}")
            error_msg = str(e)
            if "corrupt" in error_msg.lower() or "damaged" in error_msg.lower():
                error_msg = "PDF文档已损坏"
            elif "not a pdf" in error_msg.lower():
                error_msg = "文件不是有效的PDF文档"
            return DocumentParseResult(
                success=False,
                error=f"PDF解析失败: {error_msg}",
            )
