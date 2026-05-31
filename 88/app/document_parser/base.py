import os
from abc import ABC, abstractmethod
from pathlib import Path
from loguru import logger

MAX_PARSE_FILE_SIZE = 200 * 1024 * 1024


class ParseError(Exception):
    pass


class EmptyFileError(ParseError):
    pass


class EncryptedFileError(ParseError):
    pass


class UnsupportedFormatError(ParseError):
    pass


class BaseParser(ABC):
    @abstractmethod
    def parse(self, file_path: str) -> str:
        pass

    def validate_file(self, file_path: str) -> bool:
        path = Path(file_path)
        if not path.exists():
            raise ParseError(f"File not found: {file_path}")
        if not path.is_file():
            raise ParseError(f"Not a file: {file_path}")

        file_size = path.stat().st_size
        if file_size == 0:
            raise EmptyFileError(f"File is empty (0 bytes): {file_path}")
        if file_size > MAX_PARSE_FILE_SIZE:
            raise ParseError(f"File too large ({file_size} bytes): {file_path}")

        return True


def get_parser(file_type: str) -> "BaseParser":
    from app.document_parser.pdf_parser import PDFParser
    from app.document_parser.docx_parser import DocxParser
    from app.document_parser.txt_parser import TxtParser
    from app.document_parser.md_parser import MdParser

    ext = file_type.lower().lstrip(".")

    parsers = {
        "pdf": PDFParser,
        "docx": DocxParser,
        "doc": DocxParser,
        "txt": TxtParser,
        "md": MdParser,
        "markdown": MdParser,
    }
    parser_cls = parsers.get(ext)
    if not parser_cls:
        raise UnsupportedFormatError(f"Unsupported file type: {ext}")
    return parser_cls()


def parse_document(file_path: str, file_type: str) -> str:
    parser = get_parser(file_type)
    parser.validate_file(file_path)
    content = parser.parse(file_path)
    logger.info(f"Parsed document: {file_path}, content length: {len(content)}")
    return content
