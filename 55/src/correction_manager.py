"""
人工修正管理模块
管理AI研判结果的人工修正、模型反馈学习
"""

import json
import uuid
import os
from typing import List, Optional, Dict, Any
from datetime import datetime
from collections import defaultdict
from loguru import logger
import threading

from src.models import (
    FaultCorrection,
    FaultCorrectionRequest,
    CorrectionStatus,
    ModelFeedbackRequest,
    ModelPerformanceMetrics,
)


class CorrectionManager:
    """
    人工修正管理器
    管理修正记录、反馈学习、性能统计
    """

    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.corrections_file = os.path.join(data_dir, "corrections.json")
        self.feedback_file = os.path.join(data_dir, "feedback.json")
        self._lock = threading.RLock()

        self.corrections: Dict[str, FaultCorrection] = {}
        self.feedbacks: List[dict] = []
        self.correct_predictions = 0
        self.total_predictions = 0
        self.category_stats: Dict[str, Dict[str, int]] = defaultdict(
            lambda: {"correct": 0, "total": 0}
        )
        self._load_data()

    def _load_data(self):
        os.makedirs(self.data_dir, exist_ok=True)

        if os.path.exists(self.corrections_file):
            try:
                with open(self.corrections_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        corr = FaultCorrection(**item)
                        self.corrections[corr.correction_id] = corr
                logger.info(f"已加载 {len(self.corrections)} 条修正记录")
            except Exception as e:
                logger.error(f"加载修正记录失败: {e}")

        if os.path.exists(self.feedback_file):
            try:
                with open(self.feedback_file, "r", encoding="utf-8") as f:
                    self.feedbacks = json.load(f)
                logger.info(f"已加载 {len(self.feedbacks)} 条反馈记录")
            except Exception as e:
                logger.error(f"加载反馈记录失败: {e}")

    def _save_corrections(self):
        with self._lock:
            try:
                data = [corr.model_dump() for corr in self.corrections.values()]
                with open(self.corrections_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2, default=str)
            except Exception as e:
                logger.error(f"保存修正记录失败: {e}")

    def _save_feedbacks(self):
        with self._lock:
            try:
                with open(self.feedback_file, "w", encoding="utf-8") as f:
                    json.dump(self.feedbacks, f, ensure_ascii=False, indent=2, default=str)
            except Exception as e:
                logger.error(f"保存反馈记录失败: {e}")

    def add_correction(
        self,
        request: FaultCorrectionRequest,
        original_fault_type_id: Optional[str] = None,
        original_fault_type_name: Optional[str] = None,
        original_similarity: Optional[float] = None,
    ) -> FaultCorrection:
        correction_id = f"CORR_{uuid.uuid4().hex[:12].upper()}"

        correction = FaultCorrection(
            correction_id=correction_id,
            analysis_request_id=request.analysis_request_id,
            original_text=request.original_text,
            original_fault_type_id=original_fault_type_id,
            original_fault_type_name=original_fault_type_name,
            original_similarity=original_similarity,
            correct_fault_type_id=request.correct_fault_type_id,
            correct_fault_type_name=request.correct_fault_type_name,
            operator=request.operator,
            reason=request.reason,
            repair_feedback=request.repair_feedback,
            repair_cost=request.repair_cost,
            repair_duration=request.repair_duration,
            status=CorrectionStatus.pending,
        )

        with self._lock:
            self.corrections[correction_id] = correction

        self._save_corrections()
        logger.info(
            f"新增修正记录: {correction_id}, 请求: {request.analysis_request_id}"
        )
        return correction

    def update_correction_status(
        self, correction_id: str, status: CorrectionStatus
    ) -> Optional[FaultCorrection]:
        with self._lock:
            if correction_id not in self.corrections:
                return None

            self.corrections[correction_id].status = status

            if status == CorrectionStatus.applied:
                self.corrections[correction_id].applied_at = datetime.now()
                self._apply_correction_improvement(correction_id)

        self._save_corrections()
        logger.info(f"修正记录状态更新: {correction_id} -> {status}")
        return self.corrections[correction_id]

    def _apply_correction_improvement(self, correction_id: str):
        correction = self.corrections[correction_id]

        if (
            correction.original_fault_type_id
            and correction.original_fault_type_id
            != correction.correct_fault_type_id
        ):
            self.corrections[correction_id].model_improvement = 0.05
            logger.info(
                f"模型改进应用: {correction_id}, 预计提升 +5%"
            )
        else:
            self.corrections[correction_id].model_improvement = 0.01
            logger.info(
                f"模型确认应用: {correction_id}, 确认 +1%"
            )

    def get_correction(
        self, correction_id: str
    ) -> Optional[FaultCorrection]:
        return self.corrections.get(correction_id)

    def get_corrections_by_analysis_id(
        self, analysis_request_id: str
    ) -> List[FaultCorrection]:
        return [
            corr
            for corr in self.corrections.values()
            if corr.analysis_request_id == analysis_request_id
        ]

    def get_corrections(
        self,
        status: Optional[CorrectionStatus] = None,
        operator: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[FaultCorrection], int]:
        with self._lock:
            results = list(self.corrections.values())

            if status:
                results = [c for c in results if c.status == status]
            if operator:
                results = [c for c in results if c.operator == operator]
            if start_time:
                results = [c for c in results if c.created_at >= start_time]
            if end_time:
                results = [c for c in results if c.created_at <= end_time]

            results.sort(key=lambda x: x.created_at, reverse=True)
            total = len(results)
            start = (page - 1) * page_size
            end = start + page_size
            return results[start:end], total

    def add_feedback(self, feedback: ModelFeedbackRequest) -> dict:
        feedback_data = {
            "feedback_id": f"FB_{uuid.uuid4().hex[:12].upper()}",
            "analysis_request_id": feedback.analysis_request_id,
            "is_correct": feedback.is_correct,
            "correct_fault_type_id": feedback.correct_fault_type_id,
            "feedback": feedback.feedback,
            "operator": feedback.operator,
            "created_at": datetime.now().isoformat(),
        }

        with self._lock:
            self.feedbacks.append(feedback_data)
            self.total_predictions += 1

            if feedback.is_correct:
                self.correct_predictions += 1

        self._save_feedbacks()
        logger.info(
            f"新增反馈: {feedback_data['feedback_id']}, 正确: {feedback.is_correct}"
        )
        return feedback_data

    def get_performance_metrics(self) -> ModelPerformanceMetrics:
        with self._lock:
            accuracy = (
                self.correct_predictions / self.total_predictions
                if self.total_predictions > 0
                else 0.0
            )

            by_category_accuracy = {}
            for category, stats in self.category_stats.items():
                cat_acc = stats["correct"] / stats["total"] if stats["total"] > 0 else 0.0
                by_category_accuracy[category] = round(cat_acc, 4)

            return ModelPerformanceMetrics(
                total_predictions=self.total_predictions,
                correct_predictions=self.correct_predictions,
                accuracy=round(accuracy, 4),
                by_category_accuracy=by_category_accuracy,
                total_feedback_count=len(self.feedbacks),
            )

    def get_statistics(self) -> Dict[str, Any]:
        with self._lock:
            status_counts: Dict[str, int] = defaultdict(int)
            operator_counts: Dict[str, int] = defaultdict(int)

            for corr in self.corrections.values():
                status_counts[corr.status.value] += 1
                operator_counts[corr.operator] += 1

            return {
                "total_corrections": len(self.corrections),
                "pending_count": status_counts.get("pending", 0),
                "approved_count": status_counts.get("approved", 0),
                "rejected_count": status_counts.get("rejected", 0),
                "applied_count": status_counts.get("applied", 0),
                "total_feedback": len(self.feedbacks),
                "model_accuracy": self.get_performance_metrics().accuracy,
                "top_operators": sorted(
                    operator_counts.items(), key=lambda x: x[1], reverse=True
                )[:10],
            }

    def get_training_data(self, limit: int = 1000) -> List[Dict[str, Any]]:
        with self._lock:
            training_data = []
            applied_corrections = [
                c
                for c in self.corrections.values()
                if c.status == CorrectionStatus.applied
            ]
            applied_corrections.sort(key=lambda x: x.created_at, reverse=True)

            for corr in applied_corrections[:limit]:
                training_data.append(
                    {
                        "text": corr.original_text,
                        "fault_type_id": corr.correct_fault_type_id,
                        "fault_type_name": corr.correct_fault_type_name,
                        "source": "correction",
                        "source_id": corr.correction_id,
                    }
                )

            return training_data
