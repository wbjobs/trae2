import asyncio
import json
import os
import uuid
from typing import Optional, Tuple
from datetime import datetime
from collections import defaultdict

from config import get_settings
from logger import setup_logger
from models import (
    HumanCorrectionRequest,
    HumanCorrectionResponse,
    FullAnalysisResult,
    CaseStatus,
    CorrectionType,
)

logger = setup_logger("human_correction")
settings = get_settings()


class CorrectionFeedbackLearner:
    def __init__(self):
        self.feedback_history: dict[str, list[dict]] = defaultdict(list)
        self._keyword_boost: dict[str, float] = defaultdict(lambda: 1.0)
        self._correction_count = 0
        self._accuracy_window: list[bool] = []
        self._max_window = 1000

    def record_feedback(
        self,
        task_id: str,
        defect_code: str,
        correction_type: str,
        is_correct: bool,
        text: str,
        keywords: list[str],
    ) -> None:
        feedback = {
            "task_id": task_id,
            "defect_code": defect_code,
            "correction_type": correction_type,
            "is_correct": is_correct,
            "text": text,
            "keywords": keywords,
            "timestamp": datetime.now().isoformat(),
        }
        self.feedback_history[defect_code].append(feedback)
        self._correction_count += 1

        if len(self._accuracy_window) >= self._max_window:
            self._accuracy_window.pop(0)
        self._accuracy_window.append(is_correct)

        if not is_correct:
            for kw in keywords:
                self._keyword_boost[kw] = min(2.0, self._keyword_boost[kw] * 1.1)
        else:
            for kw in keywords:
                self._keyword_boost[kw] = max(0.8, self._keyword_boost[kw] * 0.95)

        logger.info(
            f"Feedback recorded: task={task_id}, defect={defect_code}, "
            f"correct={is_correct}, total_feedback={self._correction_count}"
        )

    def get_keyword_boost(self, keyword: str) -> float:
        return self._keyword_boost.get(keyword, 1.0)

    def get_estimated_accuracy(self) -> float:
        if not self._accuracy_window:
            return 0.0
        return sum(self._accuracy_window) / len(self._accuracy_window)

    def get_stats(self) -> dict:
        return {
            "total_feedback": self._correction_count,
            "estimated_accuracy": round(self.get_estimated_accuracy() * 100, 2),
            "unique_defect_types": len(self.feedback_history),
            "adjusted_keywords": len(self._keyword_boost),
        }


class HumanCorrectionModule:
    def __init__(self):
        self._corrections: dict[str, dict] = {}
        self._learner = CorrectionFeedbackLearner()
        self._storage_path = getattr(settings, "CORRECTION_STORAGE_PATH", "./data/corrections.json")
        self._pending_tasks: dict[str, FullAnalysisResult] = {}
        self._lock = asyncio.Lock()
        logger.info("HumanCorrection module initialized")

    async def initialize(self) -> None:
        await self._load_corrections()
        logger.info("HumanCorrection module fully initialized")

    async def _load_corrections(self) -> None:
        if os.path.exists(self._storage_path):
            try:
                with open(self._storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._corrections = data.get("corrections", {})
                    logger.info(f"Loaded {len(self._corrections)} historical corrections")
            except Exception as e:
                logger.warning(f"Failed to load corrections: {e}")

    async def _save_corrections(self) -> None:
        try:
            os.makedirs(os.path.dirname(self._storage_path), exist_ok=True)
            with open(self._storage_path, "w", encoding="utf-8") as f:
                json.dump(
                    {"corrections": self._corrections, "saved_at": datetime.now().isoformat()},
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
        except Exception as e:
            logger.warning(f"Failed to save corrections: {e}")

    async def submit_correction(
        self,
        request: HumanCorrectionRequest,
        current_result: FullAnalysisResult,
    ) -> Tuple[Optional[HumanCorrectionResponse], Optional[FullAnalysisResult]]:
        if not current_result:
            logger.error(f"Cannot apply correction: task {request.task_id} not found")
            return None, None

        correction_id = f"CORR-{uuid.uuid4().hex[:12].upper()}"
        is_correct = request.correction_type != CorrectionType.DEFECT_TYPE

        async with self._lock:
            updated_result = current_result.model_copy()

            if request.correction_type == CorrectionType.DEFECT_TYPE:
                if updated_result.defect_result:
                    updated_result.defect_result.defect_type = request.corrected_value
                    updated_result.defect_result.confidence = 1.0
                    updated_result.defect_result.is_defect = True

            elif request.correction_type == CorrectionType.DEFECT_SEVERITY:
                if updated_result.semantic_result:
                    updated_result.semantic_result.severity_level = request.corrected_value
                if updated_result.remediation_result:
                    updated_result.remediation_result.remediation_level = request.corrected_value

            elif request.correction_type == CorrectionType.REMEDIATION:
                if updated_result.remediation_result:
                    updated_result.remediation_result.remediation_measures = request.corrected_value.split(
                        "|"
                    )

            elif request.correction_type == CorrectionType.TRANSCRIPTION:
                if updated_result.speech_result:
                    updated_result.speech_result.raw_text = request.corrected_value
                    updated_result.speech_result.confidence = 1.0

            updated_result.has_correction = True
            updated_result.case_status = CaseStatus.CORRECTED

            correction_record = {
                "correction_id": correction_id,
                "task_id": request.task_id,
                "correction_type": request.correction_type.value,
                "operator_id": request.operator_id,
                "original_value": request.original_value,
                "corrected_value": request.corrected_value,
                "reason": request.reason,
                "comment": request.comment,
                "applied": True,
                "feedback_to_model": True,
                "created_at": datetime.now().isoformat(),
            }

            self._corrections[correction_id] = correction_record
            await self._save_corrections()

            keywords = []
            text = ""
            if updated_result.speech_result:
                text = updated_result.speech_result.raw_text
            if updated_result.semantic_result:
                keywords = updated_result.semantic_result.keywords

            self._learner.record_feedback(
                task_id=request.task_id,
                defect_code=updated_result.defect_result.defect_type
                if updated_result.defect_result
                else "",
                correction_type=request.correction_type.value,
                is_correct=is_correct,
                text=text,
                keywords=keywords,
            )

            response = HumanCorrectionResponse(
                correction_id=correction_id,
                task_id=request.task_id,
                correction_type=request.correction_type,
                operator_id=request.operator_id,
                applied=True,
                feedback_to_model=True,
            )

            logger.info(
                f"Correction applied: {correction_id} for task {request.task_id}, "
                f"type={request.correction_type.value}"
            )

            return response, updated_result

    async def get_correction(self, correction_id: str) -> Optional[dict]:
        return self._corrections.get(correction_id)

    async def get_corrections_by_task(self, task_id: str) -> list[dict]:
        return [c for c in self._corrections.values() if c["task_id"] == task_id]

    async def list_corrections(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        operator_id: Optional[str] = None,
        correction_type: Optional[CorrectionType] = None,
        limit: int = 100,
    ) -> list[dict]:
        results = []
        for corr in self._corrections.values():
            if operator_id and corr["operator_id"] != operator_id:
                continue
            if correction_type and corr["correction_type"] != correction_type.value:
                continue
            if start_time:
                corr_time = datetime.fromisoformat(corr["created_at"])
                if corr_time < start_time:
                    continue
            if end_time:
                corr_time = datetime.fromisoformat(corr["created_at"])
                if corr_time > end_time:
                    continue
            results.append(corr)
            if len(results) >= limit:
                break

        return sorted(
            results,
            key=lambda x: x["created_at"],
            reverse=True,
        )

    def get_keyword_boost(self, keyword: str) -> float:
        return self._learner.get_keyword_boost(keyword)

    def get_feedback_stats(self) -> dict:
        return self._learner.get_stats()

    async def get_pending_reviews(self, limit: int = 100) -> list[dict]:
        pending = []
        for task_id, result in list(self._pending_tasks.items())[:limit]:
            if result.case_status == CaseStatus.PENDING:
                pending.append(
                    {
                        "task_id": task_id,
                        "device_id": result.device_id,
                        "defect_type": result.defect_result.defect_type
                        if result.defect_result
                        else "",
                        "defect_name": result.defect_result.defect_name
                        if result.defect_result
                        else "",
                        "confidence": result.defect_result.confidence
                        if result.defect_result
                        else 0.0,
                        "inspection_text": result.speech_result.raw_text
                        if result.speech_result
                        else "",
                        "severity": result.semantic_result.severity_level
                        if result.semantic_result
                        else "normal",
                        "created_at": result.created_at.isoformat(),
                    }
                )
        return pending

    async def add_pending_review(self, result: FullAnalysisResult) -> None:
        if result.defect_result and result.defect_result.is_defect:
            async with self._lock:
                self._pending_tasks[result.task_id] = result

    async def mark_reviewed(self, task_id: str) -> bool:
        if task_id in self._pending_tasks:
            async with self._lock:
                self._pending_tasks[task_id].case_status = CaseStatus.REVIEWED
                del self._pending_tasks[task_id]
            return True
        return False

    async def shutdown(self) -> None:
        await self._save_corrections()
        logger.info("HumanCorrection module shut down")
