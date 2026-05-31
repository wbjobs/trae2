import re
import difflib
from typing import List, Dict, Any, Optional
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.exceptions import NotFoundException, ForbiddenException
from app.models.document import Document, DocumentVersion
from app.schemas.polish import VersionCompareResponse, DiffItem


class CompareService:
    def __init__(self):
        self.similarity_threshold = 0.3

    def _preprocess(self, text: str) -> str:
        text = re.sub(r"\s+", "", text)
        text = re.sub(r"[\r\n]+", "\n", text)
        return text.strip()

    def _tokenize(self, text: str) -> List[str]:
        tokens = []
        current = ""
        for char in text:
            if re.match(r"[\u4e00-\u9fa5]", char):
                if current:
                    tokens.append(current)
                    current = ""
                tokens.append(char)
            elif re.match(r"[a-zA-Z0-9]", char):
                current += char
            else:
                if current:
                    tokens.append(current)
                    current = ""
                tokens.append(char)
        if current:
            tokens.append(current)
        return tokens

    def _compute_similarity(self, text1: str, text2: str) -> float:
        if not text1 or not text2:
            return 0.0

        processed1 = self._preprocess(text1)
        processed2 = self._preprocess(text2)

        if processed1 == processed2:
            return 1.0

        ratio = difflib.SequenceMatcher(None, processed1, processed2).ratio()
        return round(ratio, 4)

    def _diff_texts(self, text1: str, text2: str) -> List[DiffItem]:
        diff_items = []

        lines1 = text1.split("\n")
        lines2 = text2.split("\n")

        diff = list(difflib.unified_diff(
            lines1,
            lines2,
            fromfile="v1",
            tofile="v2",
            n=0,
            lineterm="",
        ))

        current_pos = 0
        for line in diff:
            if line.startswith("@@"):
                match = re.match(r"@@ -(\d+),(\d+) \+(\d+),(\d+) @@", line)
                if match:
                    line_num = int(match.group(1))
                    current_pos = sum(len(lines[i]) + 1 for i in range(min(line_num - 1, len(lines1))))
            elif line.startswith("+") and not line.startswith("+++"):
                content = line[1:]
                if content.strip():
                    diff_items.append(DiffItem(
                        type="added",
                        content=content,
                        position=current_pos,
                        paragraph=line_num,
                        explanation="新增内容",
                    ))
            elif line.startswith("-") and not line.startswith("---"):
                content = line[1:]
                if content.strip():
                    diff_items.append(DiffItem(
                        type="removed",
                        content=content,
                        position=current_pos,
                        paragraph=line_num,
                        explanation="删除内容",
                    ))

        return diff_items

    def _compare_paragraphs(
        self,
        para1: str,
        para2: str,
        paragraph_index: int,
    ) -> List[DiffItem]:
        items = []

        if para1 == para2:
            return items

        tokens1 = self._tokenize(para1)
        tokens2 = self._tokenize(para2)

        matcher = difflib.SequenceMatcher(None, tokens1, tokens2)

        pos = 0
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            original = "".join(tokens1[i1:i2])
            modified = "".join(tokens2[j1:j2])

            if tag == "replace":
                if original and modified:
                    items.append(DiffItem(
                        type="modified",
                        content=f"「{original}」 → 「{modified}」",
                        position=pos,
                        paragraph=paragraph_index + 1,
                        explanation="内容修改",
                    ))
            elif tag == "delete":
                if original.strip():
                    items.append(DiffItem(
                        type="removed",
                        content=original,
                        position=pos,
                        paragraph=paragraph_index + 1,
                        explanation="删除内容",
                    ))
            elif tag == "insert":
                if modified.strip():
                    items.append(DiffItem(
                        type="added",
                        content=modified,
                        position=pos,
                        paragraph=paragraph_index + 1,
                        explanation="新增内容",
                    ))

            pos += len(original) if original else len(modified)

        return items

    def _compare_documents(
        self,
        content1: str,
        content2: str,
        compare_type: str = "all",
    ) -> VersionCompareResponse:
        diff_items = []

        paragraphs1 = [p for p in content1.split("\n\n") if p.strip()]
        paragraphs2 = [p for p in content2.split("\n\n") if p.strip()]

        max_paragraphs = max(len(paragraphs1), len(paragraphs2))

        for i in range(max_paragraphs):
            para1 = paragraphs1[i] if i < len(paragraphs1) else ""
            para2 = paragraphs2[i] if i < len(paragraphs2) else ""

            if compare_type in ["all", "content"]:
                if not para1 and para2:
                    diff_items.append(DiffItem(
                        type="added",
                        content=para2[:200] + ("..." if len(para2) > 200 else ""),
                        position=0,
                        paragraph=i + 1,
                        explanation="新增段落",
                    ))
                elif para1 and not para2:
                    diff_items.append(DiffItem(
                        type="removed",
                        content=para1[:200] + ("..." if len(para1) > 200 else ""),
                        position=0,
                        paragraph=i + 1,
                        explanation="删除段落",
                    ))
                else:
                    para_diffs = self._compare_paragraphs(para1, para2, i)
                    diff_items.extend(para_diffs)

        similarity = self._compute_similarity(content1, content2)

        additions = sum(1 for d in diff_items if d.type == "added")
        deletions = sum(1 for d in diff_items if d.type == "removed")
        modifications = sum(1 for d in diff_items if d.type == "modified")

        return VersionCompareResponse(
            success=True,
            document_id=0,
            version1_id=0,
            version2_id=0,
            diff_items=diff_items,
            stats={
                "total_paragraphs_v1": len(paragraphs1),
                "total_paragraphs_v2": len(paragraphs2),
                "avg_paragraph_length_v1": sum(len(p) for p in paragraphs1) / max(len(paragraphs1), 1),
                "avg_paragraph_length_v2": sum(len(p) for p in paragraphs2) / max(len(paragraphs2), 1),
                "total_chars_v1": len(content1),
                "total_chars_v2": len(content2),
            },
            similarity_score=similarity,
            total_changes=len(diff_items),
            additions=additions,
            deletions=deletions,
            modifications=modifications,
        )

    async def compare_versions(
        self,
        db: AsyncSession,
        document_id: int,
        version1_id: int,
        version2_id: int,
        user_id: int,
        compare_type: str = "all",
    ) -> VersionCompareResponse:
        doc_result = await db.execute(
            select(Document).where(Document.id == document_id)
        )
        document = doc_result.scalar_one_or_none()

        if not document:
            raise NotFoundException(detail="文档不存在")
        if document.owner_id != user_id:
            raise ForbiddenException(detail="无权访问此文档")

        v1_result = await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.id == version1_id,
                DocumentVersion.document_id == document_id,
            )
        )
        v1 = v1_result.scalar_one_or_none()

        v2_result = await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.id == version2_id,
                DocumentVersion.document_id == document_id,
            )
        )
        v2 = v2_result.scalar_one_or_none()

        if not v1 or not v2:
            raise NotFoundException(detail="指定的版本不存在")

        result = self._compare_documents(
            v1.content or "",
            v2.content or "",
            compare_type,
        )

        result.document_id = document_id
        result.version1_id = version1_id
        result.version2_id = version2_id

        return result

    async def compare_with_original(
        self,
        db: AsyncSession,
        document_id: int,
        user_id: int,
        compare_type: str = "all",
    ) -> VersionCompareResponse:
        doc_result = await db.execute(
            select(Document).where(Document.id == document_id)
        )
        document = doc_result.scalar_one_or_none()

        if not document:
            raise NotFoundException(detail="文档不存在")
        if document.owner_id != user_id:
            raise ForbiddenException(detail="无权访问此文档")

        versions_result = await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == document_id
            ).order_by(DocumentVersion.version.asc())
        )
        versions = versions_result.scalars().all()

        if len(versions) < 2:
            raise NotFoundException(detail="文档版本不足，无法对比")

        return await self.compare_versions(
            db=db,
            document_id=document_id,
            version1_id=versions[0].id,
            version2_id=versions[-1].id,
            user_id=user_id,
            compare_type=compare_type,
        )

    def highlight_diff_html(self, content1: str, content2: str) -> str:
        diff_items = self._compare_documents(content1, content2)
        html_parts = []

        current_content = content1

        for item in sorted(diff_items.diff_items, key=lambda x: x.position, reverse=True):
            pos = item.position
            if item.type == "added":
                html = f'<ins style="background:#e6ffec;color:#22863a;text-decoration:none;">{item.content}</ins>'
            elif item.type == "removed":
                html = f'<del style="background:#ffeef0;color:#b31d28;">{item.content}</del>'
            elif item.type == "modified":
                html = f'<span style="background:#fff8c5;">{item.content}</span>'
            else:
                continue

            current_content = current_content[:pos] + html + current_content[pos + len(item.content):]

        return current_content


compare_service = CompareService()
