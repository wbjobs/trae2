from loguru import logger
from app.document_parser.base import BaseParser, ParseError, EncryptedFileError


class PDFParser(BaseParser):
    def parse(self, file_path: str) -> str:
        try:
            return self._parse_with_pdfplumber(file_path)
        except EncryptedFileError:
            raise
        except Exception as e1:
            logger.warning(f"pdfplumber failed for {file_path}: {e1}")
            try:
                return self._parse_with_pypdf2(file_path)
            except EncryptedFileError:
                raise
            except Exception as e2:
                logger.warning(f"PyPDF2 also failed for {file_path}: {e2}")
                return self._parse_ocr_fallback(file_path, str(e1), str(e2))

    def _check_encrypted(self, file_path: str) -> None:
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(file_path)
            if reader.is_encrypted:
                tried = False
                for password in ("", " ", "1", "123456"):
                    try:
                        reader.decrypt(password)
                        tried = True
                        break
                    except Exception:
                        continue
                if reader.is_encrypted:
                    raise EncryptedFileError(
                        f"PDF is encrypted and cannot be decrypted: {file_path}"
                    )
        except EncryptedFileError:
            raise
        except Exception:
            pass

    def _parse_with_pdfplumber(self, file_path: str) -> str:
        import pdfplumber

        self._check_encrypted(file_path)

        text_parts = []
        with pdfplumber.open(file_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                try:
                    page_text = page.extract_text(x_tolerance=3, y_tolerance=3)
                    if page_text:
                        text_parts.append(page_text)
                    else:
                        tables = page.extract_tables()
                        for table in tables:
                            for row in table:
                                row_text = " | ".join(
                                    str(cell).strip() if cell else "" for cell in row
                                )
                                if row_text.strip("| "):
                                    text_parts.append(row_text)
                except Exception as e:
                    logger.warning(f"Failed to extract page {page_num + 1}: {e}")
                    continue

        content = "\n\n".join(text_parts)
        if not content.strip():
            raise ParseError(f"No text content extracted from PDF: {file_path}")
        return content

    def _parse_with_pypdf2(self, file_path: str) -> str:
        from PyPDF2 import PdfReader

        self._check_encrypted(file_path)

        reader = PdfReader(file_path)
        text_parts = []
        for page_num, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            except Exception as e:
                logger.warning(f"PyPDF2 failed on page {page_num + 1}: {e}")
                continue

        content = "\n\n".join(text_parts)
        if not content.strip():
            raise ParseError(f"No text content extracted from PDF: {file_path}")
        return content

    def _parse_ocr_fallback(self, file_path: str, err1: str, err2: str) -> str:
        try:
            import pdfplumber

            with pdfplumber.open(file_path) as pdf:
                has_images = False
                for page in pdf.pages:
                    if page.images:
                        has_images = True
                        break
                if has_images and len(pdf.pages) > 0:
                    return (
                        f"[系统提示] 该PDF为扫描件/图片PDF，无法直接提取文字内容。\n"
                        f"文件: {file_path}, 共{len(pdf.pages)}页\n"
                        f"如需提取内容，请先进行OCR处理。\n"
                        f"解析错误详情: pdfplumber={err1}, PyPDF2={err2}"
                    )
        except Exception:
            pass

        raise ParseError(
            f"PDF parsing failed (all methods exhausted): pdfplumber={err1}, PyPDF2={err2}"
        )
