import asyncio
import json
import os
import uuid
from typing import Optional
from datetime import datetime, timedelta
from collections import Counter, defaultdict

from config import get_settings
from logger import setup_logger
from models import (
    FullAnalysisResult,
    DefectCaseSummary,
    CaseStatisticsReport,
    CaseStatus,
)

logger = setup_logger("case_aggregator")
settings = get_settings()


class CaseLibrary:
    def __init__(self, storage_path: str = "./data/case_library.json"):
        self.storage_path = storage_path
        self._cases: dict[str, DefectCaseSummary] = {}
        self._index_by_device: dict[str, list[str]] = defaultdict(list)
        self._index_by_defect: dict[str, list[str]] = defaultdict(list)
        self._index_by_time: dict[str, list[str]] = defaultdict(list)

    async def load(self) -> None:
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for case_data in data.get("cases", []):
                        case = DefectCaseSummary(**case_data)
                        self._cases[case.case_id] = case
                        self._index_case(case)
                logger.info(f"Loaded {len(self._cases)} cases from library")
            except Exception as e:
                logger.warning(f"Failed to load case library: {e}")

    async def save(self) -> None:
        try:
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            case_list = [c.model_dump(mode="json") for c in self._cases.values()]
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(
                    {"cases": case_list, "saved_at": datetime.now().isoformat()},
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
        except Exception as e:
            logger.warning(f"Failed to save case library: {e}")

    def _index_case(self, case: DefectCaseSummary) -> None:
        self._index_by_device[case.device_id].append(case.case_id)
        self._index_by_defect[case.defect_type].append(case.case_id)
        time_key = case.created_at.strftime("%Y-%m-%d")
        self._index_by_time[time_key].append(case.case_id)

    async def add_case(self, case: DefectCaseSummary) -> None:
        self._cases[case.case_id] = case
        self._index_case(case)
        if len(self._cases) % 100 == 0:
            await self.save()

    def get_case(self, case_id: str) -> Optional[DefectCaseSummary]:
        return self._cases.get(case_id)

    def search_cases(
        self,
        defect_type: Optional[str] = None,
        device_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[DefectCaseSummary]:
        candidate_ids = set(self._cases.keys())

        if defect_type:
            candidate_ids &= set(self._index_by_defect.get(defect_type, []))
        if device_id:
            candidate_ids &= set(self._index_by_device.get(device_id, []))

        results = []
        for cid in sorted(candidate_ids, reverse=True):
            case = self._cases[cid]
            if start_time and case.created_at < start_time:
                continue
            if end_time and case.created_at > end_time:
                continue
            results.append(case)
            if len(results) >= limit:
                break

        return results

    def get_all_cases(self) -> list[DefectCaseSummary]:
        return list(self._cases.values())

    def get_case_count(self) -> int:
        return len(self._cases)


class StatisticsEngine:
    def __init__(self):
        self._reports: dict[str, CaseStatisticsReport] = {}

    def generate_report(
        self,
        cases: list[DefectCaseSummary],
        period_start: datetime,
        period_end: datetime,
        correction_count: int = 0,
    ) -> CaseStatisticsReport:
        total = len(cases)
        defects = [c for c in cases if c.defect_type]

        by_category = Counter(c.defect_category for c in defects if c.defect_category)
        by_type = Counter(c.defect_type for c in defects if c.defect_type)
        by_severity = Counter(c.severity for c in defects if c.severity)

        top_types = [
            {"defect_type": k, "count": v, "name": self._get_defect_name(k)}
            for k, v in by_type.most_common(10)
        ]

        correction_rate = correction_count / total * 100 if total > 0 else 0.0
        model_accuracy = max(0.0, 100.0 - correction_rate)

        report = CaseStatisticsReport(
            report_id=f"RPT-{uuid.uuid4().hex[:10].upper()}",
            period_start=period_start,
            period_end=period_end,
            total_inspections=total,
            total_defects=len(defects),
            defect_by_category=dict(by_category),
            defect_by_type=dict(by_type),
            defect_by_severity=dict(by_severity),
            top_defect_types=top_types,
            correction_rate=round(correction_rate, 2),
            model_accuracy=round(model_accuracy, 2),
        )

        self._reports[report.report_id] = report
        logger.info(
            f"Statistics report generated: {report.report_id}, "
            f"period={period_start.date()}~{period_end.date()}, "
            f"total={total}, defects={len(defects)}"
        )

        return report

    def _get_defect_name(self, defect_type: str) -> str:
        from data_init import DEFECT_TYPES
        for d in DEFECT_TYPES:
            if d["code"] == defect_type:
                return d["name"]
        return defect_type

    def get_report(self, report_id: str) -> Optional[CaseStatisticsReport]:
        return self._reports.get(report_id)


class CaseAggregatorModule:
    def __init__(self):
        self._library = CaseLibrary()
        self._stats_engine = StatisticsEngine()
        self._task_to_case: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._auto_aggregate = getattr(settings, "AUTO_AGGREGATE_ENABLED", True)
        logger.info("CaseAggregator module initialized")

    async def initialize(self) -> None:
        await self._library.load()
        logger.info("CaseAggregator module fully initialized")

    async def aggregate_case(
        self, result: FullAnalysisResult
    ) -> Optional[DefectCaseSummary]:
        if not result.defect_result or not result.defect_result.is_defect:
            return None

        inspection_text = ""
        if result.speech_result:
            inspection_text = result.speech_result.raw_text

        location = ""
        if result.semantic_result:
            locations = [
                e["value"] for e in result.semantic_result.entities
                if e.get("type") == "location"
            ]
            location = ",".join(locations)

        remediation_measures = []
        if result.remediation_result:
            remediation_measures = result.remediation_result.remediation_measures

        case = DefectCaseSummary(
            case_id=f"CASE-{uuid.uuid4().hex[:12].upper()}",
            task_id=result.task_id,
            device_id=result.device_id,
            defect_type=result.defect_result.defect_type,
            defect_name=result.defect_result.defect_name,
            defect_category=result.defect_result.defect_category,
            severity=result.remediation_result.remediation_level
            if result.remediation_result
            else "general",
            confidence=result.defect_result.confidence,
            inspection_text=inspection_text,
            remediation_measures=remediation_measures,
            location=location,
            has_human_correction=result.has_correction,
        )

        async with self._lock:
            await self._library.add_case(case)
            self._task_to_case[result.task_id] = case.case_id

        logger.info(
            f"Case aggregated: {case.case_id} for task {result.task_id}, "
            f"defect={case.defect_name}"
        )

        return case

    async def get_case(self, case_id: str) -> Optional[DefectCaseSummary]:
        return self._library.get_case(case_id)

    async def get_case_by_task(self, task_id: str) -> Optional[DefectCaseSummary]:
        case_id = self._task_to_case.get(task_id)
        if case_id:
            return self._library.get_case(case_id)
        return None

    async def search_cases(
        self,
        defect_type: Optional[str] = None,
        device_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[DefectCaseSummary]:
        return self._library.search_cases(
            defect_type=defect_type,
            device_id=device_id,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
        )

    async def generate_statistics_report(
        self,
        period_days: int = 30,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        correction_count: int = 0,
    ) -> CaseStatisticsReport:
        if period_end is None:
            period_end = datetime.now()
        if period_start is None:
            period_start = period_end - timedelta(days=period_days)

        cases = self._library.search_cases(
            start_time=period_start, end_time=period_end, limit=10000
        )

        return self._stats_engine.generate_report(
            cases, period_start, period_end, correction_count
        )

    async def get_report(self, report_id: str) -> Optional[CaseStatisticsReport]:
        return self._stats_engine.get_report(report_id)

    async def get_summary(self) -> dict:
        return {
            "total_cases": self._library.get_case_count(),
            "by_defect_category": self._get_category_summary(),
            "recent_trend": self._get_recent_trend(),
        }

    def _get_category_summary(self) -> dict:
        cases = self._library.get_all_cases()
        by_cat = Counter(c.defect_category for c in cases if c.defect_category)
        return dict(by_cat)

    def _get_recent_trend(self, days: int = 7) -> list[dict]:
        end = datetime.now()
        trend = []
        for i in range(days - 1, -1, -1):
            day = (end - timedelta(days=i)).strftime("%Y-%m-%d")
            count = len(self._library._index_by_time.get(day, []))
            trend.append({"date": day, "count": count})
        return trend

    async def shutdown(self) -> None:
        await self._library.save()
        logger.info("CaseAggregator module shut down")
