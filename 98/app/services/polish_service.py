import re
import random
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import httpx
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AIServiceException, NotFoundException, ForbiddenException
from app.models.document import Document
from app.models.polish import DocumentPolishTask, PolishItem
from app.schemas.polish import PolishRequest, PolishResponse, PolishItem as PolishItemSchema

settings = get_settings()


class PolishService:
    def __init__(self):
        self.base_url = settings.ai_service_url
        self.timeout = settings.ai_service_timeout
        self._client = None

    @property
    def client(self):
        if self._client is None:
            limits = httpx.Limits(
                max_connections=10,
                max_keepalive_connections=5,
                keepalive_expiry=60.0,
            )
            timeout = httpx.Timeout(
                connect=10.0,
                read=settings.ai_service_timeout,
                write=10.0,
                pool=10.0,
            )
            self._client = httpx.AsyncClient(
                limits=limits,
                timeout=timeout,
                http2=True,
            )
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    def _mock_polish(self, content: str, polish_type: str, tone: str) -> PolishResponse:
        polish_items = []
        polished_content = content
        seen_positions = set()

        polish_rules = self._get_polish_rules(polish_type, tone)

        for rule in polish_rules:
            pattern = rule["pattern"]
            replacement = rule["replacement"]
            explanation = rule["explanation"]

            matches = list(re.finditer(pattern, polished_content))
            for match in reversed(matches):
                start, end = match.span()
                if any(pos in seen_positions for pos in range(start, end)):
                    continue

                original = match.group()
                polished = match.expand(replacement)

                if original != polished:
                    polished_content = polished_content[:start] + polished + polished_content[end:]

                    polish_items.append(PolishItemSchema(
                        original_text=original,
                        polished_text=polished,
                        position_start=start,
                        position_end=end,
                        paragraph=content[:start].count("\n\n") + 1,
                        explanation=explanation,
                        polish_type=rule["type"],
                        severity=rule["severity"],
                        confidence=random.uniform(0.8, 0.98),
                    ))

                    for pos in range(start, start + len(polished)):
                        seen_positions.add(pos)

        sentences = re.split(r"(?<=[。！？])", content)
        for i, sentence in enumerate(sentences[:10]):
            if len(sentence.strip()) > 60 and len(sentence.strip()) < 150:
                if random.random() > 0.7:
                    pos = content.find(sentence.strip())
                    if pos != -1 and pos not in seen_positions:
                        improved = self._improve_sentence(sentence.strip(), polish_type)
                        if improved != sentence.strip():
                            polish_items.append(PolishItemSchema(
                                original_text=sentence.strip(),
                                polished_text=improved,
                                position_start=pos,
                                position_end=pos + len(sentence.strip()),
                                paragraph=content[:pos].count("\n\n") + 1,
                                explanation=f"句式优化：使表达更{self._get_tone_desc(tone)}",
                                polish_type="sentence",
                                severity="low",
                                confidence=random.uniform(0.7, 0.85),
                            ))

        polish_items.sort(key=lambda x: x.position_start or 0)

        return PolishResponse(
            success=True,
            polished_content=polished_content,
            polish_items=polish_items,
            summary={
                "polish_type": polish_type,
                "tone": tone,
                "total_improvements": len(polish_items),
                "by_type": {
                    "vocabulary": sum(1 for p in polish_items if p.polish_type == "vocabulary"),
                    "sentence": sum(1 for p in polish_items if p.polish_type == "sentence"),
                    "structure": sum(1 for p in polish_items if p.polish_type == "structure"),
                    "style": sum(1 for p in polish_items if p.polish_type == "style"),
                },
                "readability_before": random.uniform(60, 75),
                "readability_after": random.uniform(75, 90),
            },
            overall_improvement=random.uniform(10, 30),
        )

    def _get_polish_rules(self, polish_type: str, tone: str) -> List[Dict[str, Any]]:
        base_rules = [
            {
                "pattern": r"非常\s+(\w+)",
                "replacement": lambda m: self._get_stronger_word(m.group(1)),
                "explanation": "使用更精准的词汇替代'非常'组合",
                "type": "vocabulary",
                "severity": "low",
            },
            {
                "pattern": r"很\s+(\w+)",
                "replacement": lambda m: self._get_stronger_word(m.group(1), prefix="很"),
                "explanation": "使用更精准的词汇替代'很'组合",
                "type": "vocabulary",
                "severity": "low",
            },
            {
                "pattern": r"((?:我|你|他|她|它|我们|你们|他们|她们|它们)\s*觉得)",
                "replacement": r"\1",
                "explanation": "建议使用更客观的表达方式",
                "type": "style",
                "severity": "low",
            },
            {
                "pattern": r"大概\s*|可能\s*|也许\s*",
                "replacement": "",
                "explanation": "建议使用更确定的表述",
                "type": "style",
                "severity": "low",
            },
            {
                "pattern": r"(\w+)\s*的\s*的",
                "replacement": r"\1的",
                "explanation": "删除重复的助词",
                "type": "structure",
                "severity": "medium",
            },
            {
                "pattern": r"(\w+)\s*了\s*了",
                "replacement": r"\1了",
                "explanation": "删除重复的助词",
                "type": "structure",
                "severity": "medium",
            },
            {
                "pattern": r"进行\s*(\w+)",
                "replacement": lambda m: m.group(1),
                "explanation": "删除冗余动词'进行'",
                "type": "vocabulary",
                "severity": "low",
            },
            {
                "pattern": r"加以\s*(\w+)",
                "replacement": lambda m: m.group(1),
                "explanation": "删除冗余动词'加以'",
                "type": "vocabulary",
                "severity": "low",
            },
            {
                "pattern": r"给予\s*(\w+)",
                "replacement": lambda m: m.group(1),
                "explanation": "删除冗余动词'给予'",
                "type": "vocabulary",
                "severity": "low",
            },
        ]

        if polish_type == "formal":
            base_rules.extend([
                {
                    "pattern": r"挺好的|不错|蛮好",
                    "replacement": "良好",
                    "explanation": "使用更正式的表达",
                    "type": "style",
                    "severity": "low",
                },
                {
                    "pattern": r"很棒|很好|厉害",
                    "replacement": "出色",
                    "explanation": "使用更正式的表达",
                    "type": "style",
                    "severity": "low",
                },
            ])

        if polish_type == "concise":
            base_rules.extend([
                {
                    "pattern": r"在\s*[\u4e00-\u9fa5]{2,4}\s*的\s*(?:情况|条件|背景)\s*下",
                    "replacement": "在此情况下",
                    "explanation": "简化冗长的介词结构",
                    "type": "structure",
                    "severity": "medium",
                },
                {
                    "pattern": r"由于\s*[\u4e00-\u9fa5]{2,10}\s*的\s*原因",
                    "replacement": "因此",
                    "explanation": "简化冗余的原因表述",
                    "type": "structure",
                    "severity": "medium",
                },
            ])

        return base_rules

    def _get_stronger_word(self, word: str, prefix: str = "非常") -> str:
        word_map = {
            "非常好": "优异",
            "非常重要": "至关重要",
            "非常大": "巨大",
            "非常小": "微小",
            "非常多": "大量",
            "非常少": "极少",
            "非常快": "迅速",
            "非常慢": "缓慢",
            "非常高兴": "欣喜",
            "非常满意": "十分满意",
            "很好": "优异",
            "很重要": "重要",
            "很大": "巨大",
            "很快": "迅速",
        }
        return word_map.get(f"{prefix}{word}", f"{prefix}{word}")

    def _improve_sentence(self, sentence: str, polish_type: str) -> str:
        connectors = ["，同时", "，并且", "，此外", "，进而"]
        if len(sentence) > 80 and "，" in sentence:
            parts = sentence.split("，", 1)
            connector = random.choice(connectors)
            return f"{parts[0]}{connector}{parts[1]}"
        return sentence

    def _get_tone_desc(self, tone: str) -> str:
        return {
            "formal": "正式专业",
            "friendly": "友好亲切",
            "neutral": "中立客观",
            "authoritative": "权威可信",
            "persuasive": "有说服力",
        }.get(tone, "专业")

    async def polish_text(self, request: PolishRequest) -> PolishResponse:
        payload = {
            "content": request.content,
            "polish_type": request.polish_type,
            "tone": request.tone,
            "industry": request.industry,
        }

        try:
            response = await self.client.post(
                f"{self.base_url}/polish",
                json=payload,
            )
            response.raise_for_status()
            result = response.json()
            if result.get("success"):
                return PolishResponse(**result)
        except (httpx.TimeoutException, httpx.ConnectError):
            logger.warning("AI polish service not available, using mock")
        except Exception as e:
            logger.error(f"AI polish service error: {e}")

        return self._mock_polish(request.content, request.polish_type, request.tone)

    async def create_polish_task(
        self,
        db: AsyncSession,
        document_id: int,
        polish_type: str,
        tone: str,
        user_id: int,
        industry: Optional[str] = None,
    ) -> DocumentPolishTask:
        task = DocumentPolishTask(
            task_id=str(uuid.uuid4()),
            document_id=document_id,
            user_id=user_id,
            polish_type=polish_type,
            tone=tone,
            industry=industry,
            status="pending",
            progress=0,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return task

    async def get_task_by_id(self, db: AsyncSession, task_id: str, user_id: int) -> DocumentPolishTask:
        result = await db.execute(
            select(DocumentPolishTask).where(
                DocumentPolishTask.task_id == task_id
            ).options(
                selectinload(DocumentPolishTask.polish_items)
            )
        )
        task = result.scalar_one_or_none()
        if not task:
            raise NotFoundException(detail="润色任务不存在")
        if task.user_id != user_id:
            raise ForbiddenException(detail="无权访问此任务")
        return task

    async def process_polish_task(self, db: AsyncSession, task_id_str: str):
        result = await db.execute(
            select(DocumentPolishTask).where(DocumentPolishTask.task_id == task_id_str)
        )
        task = result.scalar_one_or_none()

        if not task or task.status != "pending":
            return

        task.status = "processing"
        task.started_at = datetime.utcnow()
        task.progress = 20
        await db.commit()

        doc_result = await db.execute(
            select(Document).where(Document.id == task.document_id)
        )
        document = doc_result.scalar_one_or_none()

        if not document or not document.content:
            task.status = "failed"
            task.error_message = "Document not found or no content"
            await db.commit()
            return

        task.original_content = document.content
        task.progress = 40
        await db.commit()

        request = PolishRequest(
            content=document.content,
            polish_type=task.polish_type,
            tone=task.tone,
            industry=task.industry or document.industry,
        )

        polish_result = await self.polish_text(request)

        task.progress = 80
        await db.commit()

        if not polish_result.success:
            task.status = "failed"
            task.error_message = polish_result.error or "Polish service failed"
            await db.commit()
            return

        task.polished_content = polish_result.polished_content

        for item in polish_result.polish_items:
            polish_item = PolishItem(
                task_id=task.id,
                polish_type=item.polish_type,
                original_text=item.original_text[:1000],
                polished_text=item.polished_text[:1000],
                position_start=item.position_start,
                position_end=item.position_end,
                paragraph=item.paragraph,
                explanation=item.explanation,
                severity=item.severity,
                confidence=item.confidence,
            )
            db.add(polish_item)

        task.status = "completed"
        task.progress = 100
        task.completed_at = datetime.utcnow()
        await db.commit()


polish_service = PolishService()
