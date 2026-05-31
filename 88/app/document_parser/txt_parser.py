from pathlib import Path
from loguru import logger
from app.document_parser.base import BaseParser, ParseError

BOM_MARKERS = [
    (b"\xef\xbb\xbf", "utf-8-sig"),
    (b"\xff\xfe", "utf-16-le"),
    (b"\xfe\xff", "utf-16-be"),
    (b"\xff\xfe\x00\x00", "utf-32-le"),
    (b"\x00\x00\xfe\xff", "utf-32-be"),
]

ENCODINGS_TO_TRY = [
    "utf-8-sig",
    "utf-8",
    "gb18030",
    "gbk",
    "gb2312",
    "big5",
    "shift_jis",
    "euc-jp",
    "euc-kr",
    "latin-1",
]

MAX_TXT_READ_SIZE = 50 * 1024 * 1024


class TxtParser(BaseParser):
    def parse(self, file_path: str) -> str:
        try:
            encoding = self._detect_encoding(file_path)
            content = self._read_file(file_path, encoding)
            return content.strip()
        except ParseError:
            raise
        except Exception as e:
            raise ParseError(f"TXT parsing failed: {e}")

    def _detect_encoding(self, file_path: str) -> str:
        with open(file_path, "rb") as f:
            raw_head = f.read(4)

        for bom_bytes, encoding in BOM_MARKERS:
            if raw_head.startswith(bom_bytes):
                return encoding

        with open(file_path, "rb") as f:
            raw_sample = f.read(min(65536, Path(file_path).stat().st_size))

        for encoding in ENCODINGS_TO_TRY:
            try:
                raw_sample.decode(encoding)
                return encoding
            except (UnicodeDecodeError, LookupError):
                continue

        return "utf-8"

    def _read_file(self, file_path: str, encoding: str) -> str:
        file_size = Path(file_path).stat().st_size

        if file_size <= MAX_TXT_READ_SIZE:
            with open(file_path, "r", encoding=encoding, errors="replace") as f:
                return f.read()

        logger.info(f"Large text file ({file_size} bytes), reading in chunks")
        parts = []
        with open(file_path, "r", encoding=encoding, errors="replace") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                parts.append(chunk)
        return "".join(parts)
