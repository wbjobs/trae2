"""
故障案例管理模块
自动汇总故障案例、统计分析、案例查询
"""

import json
import uuid
import os
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from collections import defaultdict
from loguru import logger
import threading

from src.models import (
    FaultCase,
    CaseStatus,
    FaultCategory,
    SeverityLevel,
    SingleFaultAnalysisResult,
    FaultCorrection,
    CaseSummary,
)


class CaseManager:
    """
    故障案例管理器
    自动收集、汇总、查询故障案例
    """

    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.cases_file = os.path.join(data_dir, "fault_cases.json")
        self._lock = threading.RLock()

        self.cases: Dict[str, FaultCase] = {}
        self._load_cases()

    def _load_cases(self):
        os.makedirs(self.data_dir, exist_ok=True)

        if os.path.exists(self.cases_file):
            try:
                with open(self.cases_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        case = FaultCase(**item)
                        self.cases[case.case_id] = case
                logger.info(f"已加载 {len(self.cases)} 条故障案例")
            except Exception as e:
                logger.error(f"加载故障案例失败: {e}")

    def _save_cases(self):
        with self._lock:
            try:
                data = [case.model_dump() for case in self.cases.values()]
                with open(self.cases_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2, default=str)
            except Exception as e:
                logger.error(f"保存故障案例失败: {e}")

    def create_case_from_analysis(
        self,
        analysis_result: SingleFaultAnalysisResult,
        device_id: Optional[str] = None,
        device_type: Optional[str] = None,
        repair_effectiveness: Optional[float] = None,
        operator: Optional[str] = None,
    ) -> Optional[FaultCase]:
        if not analysis_result.fault_matches:
            return None

        top_match = analysis_result.fault_matches[0]

        case_id = f"CASE_{uuid.uuid4().hex[:12].upper()}"

        repair_solution = None
        repair_solution_title = None
        if analysis_result.repair_recommendation and analysis_result.repair_recommendation.solutions:
            top_solution = analysis_result.repair_recommendation.solutions[0]
            repair_solution = top_solution.id
            repair_solution_title = top_solution.title

        case = FaultCase(
            case_id=case_id,
            original_text=analysis_result.original_text,
            fault_type_id=top_match.fault_type.id,
            fault_type_name=top_match.fault_type.name,
            category=top_match.fault_type.category,
            severity=top_match.fault_type.severity,
            device_id=device_id,
            device_type=device_type,
            keywords=analysis_result.parsing_result.keywords,
            repair_solution_id=repair_solution,
            repair_solution_title=repair_solution_title,
            repair_effectiveness=repair_effectiveness,
            operator=operator,
            source="analysis",
            source_id=analysis_result.request_id,
            status=CaseStatus.active,
        )

        with self._lock:
            self.cases[case_id] = case

        self._save_cases()
        logger.info(f"从分析结果创建案例: {case_id}")
        return case

    def create_case_from_correction(
        self,
        correction: FaultCorrection,
        category: FaultCategory,
        severity: SeverityLevel,
        keywords: Optional[List[str]] = None,
    ) -> FaultCase:
        case_id = f"CASE_{uuid.uuid4().hex[:12].upper()}"

        case = FaultCase(
            case_id=case_id,
            original_text=correction.original_text,
            fault_type_id=correction.correct_fault_type_id,
            fault_type_name=correction.correct_fault_type_name,
            category=category,
            severity=severity,
            keywords=keywords or [],
            repair_cost=correction.repair_cost,
            repair_duration=correction.repair_duration,
            operator=correction.operator,
            source="correction",
            source_id=correction.correction_id,
            status=CaseStatus.verified,
            verification_count=1,
        )

        with self._lock:
            self.cases[case_id] = case

        self._save_cases()
        logger.info(f"从修正记录创建案例: {case_id}")
        return case

    def create_manual_case(
        self,
        original_text: str,
        fault_type_id: str,
        fault_type_name: str,
        category: FaultCategory,
        severity: SeverityLevel,
        device_id: Optional[str] = None,
        device_type: Optional[str] = None,
        keywords: Optional[List[str]] = None,
        repair_effectiveness: Optional[float] = None,
        repair_cost: Optional[float] = None,
        repair_duration: Optional[int] = None,
        operator: Optional[str] = None,
    ) -> FaultCase:
        case_id = f"CASE_{uuid.uuid4().hex[:12].upper()}"

        case = FaultCase(
            case_id=case_id,
            original_text=original_text,
            fault_type_id=fault_type_id,
            fault_type_name=fault_type_name,
            category=category,
            severity=severity,
            device_id=device_id,
            device_type=device_type,
            keywords=keywords or [],
            repair_effectiveness=repair_effectiveness,
            repair_cost=repair_cost,
            repair_duration=repair_duration,
            operator=operator,
            source="manual",
            status=CaseStatus.verified,
            verification_count=1,
        )

        with self._lock:
            self.cases[case_id] = case

        self._save_cases()
        logger.info(f"手动创建案例: {case_id}")
        return case

    def get_case(self, case_id: str) -> Optional[FaultCase]:
        return self.cases.get(case_id)

    def update_case(
        self,
        case_id: str,
        repair_effectiveness: Optional[float] = None,
        repair_cost: Optional[float] = None,
        repair_duration: Optional[int] = None,
        status: Optional[CaseStatus] = None,
        is_qualified: Optional[bool] = None,
    ) -> Optional[FaultCase]:
        with self._lock:
            if case_id not in self.cases:
                return None

            case = self.cases[case_id]

            if repair_effectiveness is not None:
                case.repair_effectiveness = repair_effectiveness
            if repair_cost is not None:
                case.repair_cost = repair_cost
            if repair_duration is not None:
                case.repair_duration = repair_duration
            if status is not None:
                case.status = status
            if is_qualified is not None:
                case.is_qualified = is_qualified

            case.updated_at = datetime.now()
            if status == CaseStatus.verified:
                case.verification_count = (case.verification_count or 0) + 1

        self._save_cases()
        logger.info(f"更新案例: {case_id}")
        return self.cases[case_id]

    def query_cases(
        self,
        fault_type_id: Optional[str] = None,
        category: Optional[FaultCategory] = None,
        device_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        status: Optional[CaseStatus] = None,
        severity: Optional[SeverityLevel] = None,
        is_qualified: Optional[bool] = None,
        keyword: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[FaultCase], int]:
        with self._lock:
            results = list(self.cases.values())

            if fault_type_id:
                results = [c for c in results if c.fault_type_id == fault_type_id]
            if category:
                results = [c for c in results if c.category == category]
            if device_id:
                results = [c for c in results if c.device_id == device_id]
            if status:
                results = [c for c in results if c.status == status]
            if severity:
                results = [c for c in results if c.severity == severity]
            if is_qualified is not None:
                results = [c for c in results if c.is_qualified == is_qualified]
            if start_time:
                results = [c for c in results if c.created_at >= start_time]
            if end_time:
                results = [c for c in results if c.created_at <= end_time]
            if keyword:
                keyword_lower = keyword.lower()
                results = [
                    c
                    for c in results
                    if keyword_lower in c.original_text.lower()
                    or any(keyword_lower in kw.lower() for kw in c.keywords)
                ]

            results.sort(key=lambda x: x.created_at, reverse=True)
            total = len(results)
            start = (page - 1) * page_size
            end = start + page_size
            return results[start:end], total

    def get_summary(
        self,
        days: Optional[int] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> CaseSummary:
        with self._lock:
            cases = list(self.cases.values())

            if start_time is None and days:
                start_time = datetime.now() - timedelta(days=days)

            if start_time:
                cases = [c for c in cases if c.created_at >= start_time]
            if end_time:
                cases = [c for c in cases if c.created_at <= end_time]

            by_category: Dict[str, int] = defaultdict(int)
            by_fault_type: Dict[str, int] = defaultdict(int)
            by_severity: Dict[str, int] = defaultdict(int)
            total_cost = 0.0
            total_duration = 0
            cost_count = 0
            duration_count = 0

            for case in cases:
                by_category[case.category.value] += 1
                by_fault_type[case.fault_type_name] += 1
                by_severity[case.severity.value] += 1

                if case.repair_cost is not None:
                    total_cost += case.repair_cost
                    cost_count += 1
                if case.repair_duration is not None:
                    total_duration += case.repair_duration
                    duration_count += 1

            time_range = None
            if start_time and end_time:
                time_range = f"{start_time.date()} ~ {end_time.date()}"
            elif start_time:
                time_range = f"{start_time.date()} ~ 至今"

            return CaseSummary(
                total_cases=len(cases),
                by_category=dict(by_category),
                by_fault_type=dict(by_fault_type),
                by_severity=dict(by_severity),
                avg_repair_cost=total_cost / cost_count if cost_count > 0 else None,
                avg_repair_duration=total_duration / duration_count if duration_count > 0 else None,
                time_range=time_range,
            )

    def get_statistics(self) -> Dict[str, Any]:
        with self._lock:
            status_counts: Dict[str, int] = defaultdict(int)
            source_counts: Dict[str, int] = defaultdict(int)

            for case in self.cases.values():
                status_counts[case.status.value] += 1
                source_counts[case.source] += 1

            return {
                "total_cases": len(self.cases),
                "active_count": status_counts.get("active", 0),
                "verified_count": status_counts.get("verified", 0),
                "archived_count": status_counts.get("archived", 0),
                "from_analysis": source_counts.get("analysis", 0),
                "from_correction": source_counts.get("correction", 0),
                "from_manual": source_counts.get("manual", 0),
                "qualified_rate": (
                    sum(1 for c in self.cases.values() if c.is_qualified) / len(self.cases)
                    if self.cases
                    else 0.0
                ),
            }

    def get_frequent_faults(
        self, top_n: int = 10, days: Optional[int] = 30
    ) -> List[Dict[str, Any]]:
        with self._lock:
            start_time = datetime.now() - timedelta(days=days) if days else None
            cases = list(self.cases.values())

            if start_time:
                cases = [c for c in cases if c.created_at >= start_time]

            fault_count: Dict[str, Dict[str, Any]] = defaultdict(
                lambda: {"count": 0, "category": "", "severity": ""}
            )

            for case in cases:
                key = case.fault_type_id
                fault_count[key]["count"] += 1
                fault_count[key]["fault_type_name"] = case.fault_type_name
                fault_count[key]["category"] = case.category.value
                fault_count[key]["severity"] = case.severity.value

            sorted_faults = sorted(
                fault_count.items(), key=lambda x: x[1]["count"], reverse=True
            )

            result = []
            for fault_id, data in sorted_faults[:top_n]:
                result.append(
                    {
                        "fault_type_id": fault_id,
                        "fault_type_name": data["fault_type_name"],
                        "count": data["count"],
                        "category": data["category"],
                        "severity": data["severity"],
                    }
                )

            return result

    def get_training_data(self, limit: int = 5000) -> List[Dict[str, Any]]:
        with self._lock:
            training_data = []
            qualified_cases = [
                c
                for c in self.cases.values()
                if c.is_qualified and c.status != CaseStatus.archived
            ]
            qualified_cases.sort(key=lambda x: x.created_at, reverse=True)

            for case in qualified_cases[:limit]:
                training_data.append(
                    {
                        "text": case.original_text,
                        "fault_type_id": case.fault_type_id,
                        "fault_type_name": case.fault_type_name,
                        "category": case.category.value,
                        "keywords": case.keywords,
                        "source": case.source,
                        "source_id": case.case_id,
                    }
                )

            return training_data

    def delete_case(self, case_id: str) -> bool:
        with self._lock:
            if case_id not in self.cases:
                return False

            del self.cases[case_id]

        self._save_cases()
        logger.info(f"删除案例: {case_id}")
        return True
