from abc import ABC, abstractmethod
from typing import Optional
from app.schemas.document import DocumentParseResult


class BaseParser(ABC):
    @abstractmethod
    def parse(self, file_path: str, password: Optional[str] = None) -> DocumentParseResult:
        pass

    def _count_words(self, content: str) -> int:
        if not content:
            return 0
        return len(content)

    def _count_paragraphs(self, content: str) -> int:
        if not content:
            return 0
        paragraphs = [p for p in content.split("\n\n") if p.strip()]
        return len(paragraphs)
