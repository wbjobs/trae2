import re
from pathlib import Path
from loguru import logger
from app.document_parser.base import BaseParser, ParseError

FRONTMATTER_PATTERN = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


class MdParser(BaseParser):
    def parse(self, file_path: str) -> str:
        try:
            raw_content = self._read_file(file_path)
        except Exception as e:
            raise ParseError(f"Cannot read markdown file: {e}")

        if not raw_content.strip():
            raise ParseError(f"Markdown file is empty: {file_path}")

        content_without_frontmatter, frontmatter_text = self._strip_frontmatter(raw_content)

        extensions = self._get_safe_extensions()
        try:
            import markdown
            html = markdown.markdown(content_without_frontmatter, extensions=extensions)
        except Exception as e:
            logger.warning(f"Markdown conversion with extensions failed: {e}, trying plain")
            try:
                import markdown
                html = markdown.markdown(content_without_frontmatter)
            except Exception as e2:
                logger.warning(f"Plain markdown also failed: {e2}")
                return content_without_frontmatter.strip()

        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            text = soup.get_text(separator="\n", strip=True)
        except ImportError:
            text = self._html_to_text_fallback(html)

        parts = []
        if frontmatter_text:
            parts.append(f"[元数据]\n{frontmatter_text}")

        if not text.strip():
            text = content_without_frontmatter.strip()

        if text.strip():
            parts.append(text)

        content = "\n\n".join(parts)
        if not content.strip():
            raise ParseError(f"No text content extracted from Markdown: {file_path}")
        return content

    def _read_file(self, file_path: str) -> str:
        for encoding in ("utf-8-sig", "utf-8", "gbk", "gb18030", "latin-1"):
            try:
                with open(file_path, "r", encoding=encoding) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue
        raise ParseError(f"Cannot decode markdown file: {file_path}")

    def _strip_frontmatter(self, content: str) -> tuple[str, str | None]:
        match = FRONTMATTER_PATTERN.match(content)
        if match:
            frontmatter = match.group(1).strip()
            remaining = content[match.end():]
            return remaining, frontmatter
        return content, None

    def _get_safe_extensions(self) -> list[str]:
        extensions = ["extra", "toc", "nl2br"]
        try:
            import pygments
            extensions.append("codehilite")
        except ImportError:
            pass
        return extensions

    def _html_to_text_fallback(self, html: str) -> str:
        text = re.sub(r"<br\s*/?>", "\n", html)
        text = re.sub(r"</p>", "\n\n", text)
        text = re.sub(r"</h[1-6]>", "\n\n", text)
        text = re.sub(r"</li>", "\n", text)
        text = re.sub(r"<[^>]+>", "", text)
        import html as html_lib
        text = html_lib.unescape(text)
        return text.strip()
