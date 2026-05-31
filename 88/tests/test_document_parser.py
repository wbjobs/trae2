import pytest
from app.document_parser.base import parse_document, EmptyFileError, EncryptedFileError, UnsupportedFormatError
from app.document_parser.txt_parser import TxtParser
from app.document_parser.md_parser import MdParser
from app.document_parser.pdf_parser import PDFParser
from app.document_parser.docx_parser import DocxParser
from pathlib import Path
import tempfile
import os


def test_txt_parser_utf8():
    parser = TxtParser()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write("这是一个测试文档。\n包含多行内容。")
        f.flush()
        content = parser.parse(f.name)
        assert "测试文档" in content
        assert "多行内容" in content
    Path(f.name).unlink()


def test_txt_parser_bom():
    parser = TxtParser()
    with tempfile.NamedTemporaryFile(mode='wb', suffix='.txt', delete=False) as f:
        bom = b'\xef\xbb\xbf'
        text = "BOM测试内容".encode('utf-8')
        f.write(bom + text)
        f.flush()
        content = parser.parse(f.name)
        assert "BOM" in content
        assert not content.startswith('\ufeff')
    Path(f.name).unlink()


def test_txt_parser_utf16_le():
    parser = TxtParser()
    with tempfile.NamedTemporaryFile(mode='wb', suffix='.txt', delete=False) as f:
        content = "UTF16测试".encode('utf-16-le')
        bom = b'\xff\xfe'
        f.write(bom + content)
        f.flush()
        result = parser.parse(f.name)
        assert "UTF16" in result or "测试" in result
    Path(f.name).unlink()


def test_md_parser_frontmatter():
    parser = MdParser()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf-8') as f:
        f.write("---\ntitle: 测试\ndate: 2024-01-01\n---\n\n# 标题\n\n正文内容。")
        f.flush()
        content = parser.parse(f.name)
        assert "标题" in content
        assert "正文内容" in content
    Path(f.name).unlink()


def test_md_parser_without_frontmatter():
    parser = MdParser()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf-8') as f:
        f.write("# 标题\n\n这是正文内容。\n\n- 列表项1\n- 列表项2")
        f.flush()
        content = parser.parse(f.name)
        assert "标题" in content
        assert "正文内容" in content
    Path(f.name).unlink()


def test_empty_file():
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write("")
        f.flush()
        with pytest.raises(EmptyFileError):
            parse_document(f.name, "txt")
    Path(f.name).unlink()


def test_unsupported_type():
    with pytest.raises(UnsupportedFormatError):
        parse_document("test.xyz", "xyz")


def test_doc_extension_maps_to_docx_parser():
    from app.document_parser.base import get_parser
    parser = get_parser("doc")
    assert isinstance(parser, DocxParser)


def test_markdown_extension_maps_to_md_parser():
    from app.document_parser.base import get_parser
    parser = get_parser("markdown")
    assert isinstance(parser, MdParser)
