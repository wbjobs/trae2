from typing import Optional
from app.parsers.base_parser import BaseParser
from app.parsers.docx_parser import DocxParser
from app.parsers.pdf_parser import PdfParser
from app.parsers.excel_parser import ExcelParser
from app.parsers.txt_parser import TxtParser
from app.parsers.md_parser import MdParser


class ParserFactory:
    def __init__(self):
        self._parsers = {
            ".docx": DocxParser,
            ".doc": DocxParser,
            ".pdf": PdfParser,
            ".xlsx": ExcelParser,
            ".xls": ExcelParser,
            ".txt": TxtParser,
            ".md": MdParser,
        }

    def get_parser(self, file_extension: str) -> Optional[BaseParser]:
        parser_class = self._parsers.get(file_extension.lower())
        if parser_class:
            return parser_class()
        return None

    def supports(self, file_extension: str) -> bool:
        return file_extension.lower() in self._parsers


parser_factory = ParserFactory()


def get_parser(file_extension: str) -> Optional[BaseParser]:
    return parser_factory.get_parser(file_extension)
