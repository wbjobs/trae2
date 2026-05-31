import asyncio
import json
import os
from datetime import datetime, timedelta
from typing import Optional

import httpx

from config import get_settings
from logger import setup_logger
from models import DefectResult, RemediationResult
from data_init import REMEDIATION_TEMPLATES

logger = setup_logger("remediation_advisor")
settings = get_settings()


class RemediationTemplateEngine:
    def __init__(self, template_path: str = ""):
        self.template_path = template_path or settings.REMEDIATION_TEMPLATE_PATH
        self.templates: list[dict] = []

    def load(self) -> None:
        if os.path.exists(self.template_path):
            with open(self.template_path, "r", encoding="utf-8") as f:
                self.templates = json.load(f)
            logger.info(f"Loaded {len(self.templates)} remediation templates")
        else:
            self.templates = REMEDIATION_TEMPLATES
            logger.info(f"Using built-in templates: {len(self.templates)} entries")

        self._template_map = {t["defect_code"]: t for t in self.templates}

    def get_template(self, defect_code: str) -> Optional[dict]:
        return self._template_map.get(defect_code)

    def generate_remediation(
        self, defect_result: DefectResult, context: Optional[dict] = None
    ) -> dict:
        template = self.get_template(defect_result.defect_type)

        if not template:
            return self._generate_default_remediation(defect_result)

        measures = list(template.get("measures", []))

        if context and context.get("severity_override"):
            severity = context["severity_override"]
            if severity == "critical":
                measures.insert(0, "立即启动应急预案，组织抢修队伍")
                measures.append("每日汇报整改进度直至验收合格")
            elif severity == "major":
                measures.append("三日内完成整改并提交验收报告")

        deadline_hours = template.get("deadline_hours", 72)
        if context and context.get("deadline_adjustment"):
            deadline_hours = int(deadline_hours * context["deadline_adjustment"])

        return {
            "defect_code": defect_result.defect_type,
            "remediation_level": template.get("level", "general"),
            "remediation_measures": measures,
            "deadline_hours": deadline_hours,
            "responsible_dept": template.get("responsible_dept", "运维部"),
        }

    def _generate_default_remediation(self, defect_result: DefectResult) -> dict:
        confidence = defect_result.confidence
        if confidence >= 0.9:
            level = "critical"
            deadline = 24
        elif confidence >= 0.8:
            level = "major"
            deadline = 48
        else:
            level = "general"
            deadline = 72

        return {
            "defect_code": defect_result.defect_type,
            "remediation_level": level,
            "remediation_measures": [
                "安排专业人员现场复核确认缺陷",
                "根据复核结果制定详细整改方案",
                "按方案执行整改并做好记录",
                "整改完成后进行验收确认",
            ],
            "deadline_hours": deadline,
            "responsible_dept": "运维部",
        }


class PushService:
    def __init__(self):
        self._push_url = settings.REMEDIATION_PUSH_URL
        self._timeout = settings.REMEDIATION_PUSH_TIMEOUT
        self._client: Optional[httpx.AsyncClient] = None

    async def initialize(self) -> None:
        self._client = httpx.AsyncClient(timeout=self._timeout)
        logger.info("Push service initialized")

    async def push_http(
        self, url: str, payload: dict, headers: Optional[dict] = None
    ) -> dict:
        target_url = url or self._push_url
        if not target_url:
            logger.warning("No push URL configured, skipping HTTP push")
            return {"status": "skipped", "reason": "no_push_url"}

        try:
            default_headers = {
                "Content-Type": "application/json",
                "X-Service": "PowerInspectionAI",
            }
            if headers:
                default_headers.update(headers)

            resp = await self._client.post(
                target_url, json=payload, headers=default_headers
            )

            if resp.status_code == 200:
                logger.info(f"Push succeeded: {target_url}")
                return {"status": "success", "response_code": resp.status_code}
            else:
                logger.warning(
                    f"Push returned non-200: {resp.status_code} from {target_url}"
                )
                return {
                    "status": "failed",
                    "response_code": resp.status_code,
                    "response_body": resp.text[:500],
                }

        except httpx.TimeoutException:
            logger.error(f"Push timeout: {target_url}")
            return {"status": "timeout", "url": target_url}
        except Exception as e:
            logger.error(f"Push error: {e}")
            return {"status": "error", "error": str(e)}

    async def shutdown(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None


class RemediationAdvisorModule:
    def __init__(self):
        self._template_engine = RemediationTemplateEngine()
        self._push_service = PushService()
        self._history: dict[str, RemediationResult] = {}
        logger.info("RemediationAdvisor module initialized")

    async def initialize(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._template_engine.load)
        await self._push_service.initialize()
        logger.info("RemediationAdvisor module fully initialized")

    async def generate_and_push(
        self,
        defect_result: DefectResult,
        push_url: Optional[str] = None,
        context: Optional[dict] = None,
    ) -> RemediationResult:
        task_id = defect_result.task_id

        if not defect_result.is_defect:
            result = RemediationResult(
                task_id=task_id,
                defect_type=defect_result.defect_type,
                remediation_level="none",
                remediation_measures=["无需整改，设备运行正常"],
                deadline_hours=0,
                push_status="skipped",
            )
            logger.info(f"Task {task_id}: No defect detected, skipping remediation")
            return result

        loop = asyncio.get_event_loop()
        remediation = await loop.run_in_executor(
            None, self._template_engine.generate_remediation, defect_result, context
        )

        result = RemediationResult(
            task_id=task_id,
            defect_type=defect_result.defect_type,
            remediation_level=remediation["remediation_level"],
            remediation_measures=remediation["remediation_measures"],
            deadline_hours=remediation["deadline_hours"],
            responsible_dept=remediation["responsible_dept"],
            push_status="pending",
        )

        push_payload = {
            "task_id": task_id,
            "defect_type": defect_result.defect_type,
            "defect_name": defect_result.defect_name,
            "defect_category": defect_result.defect_category,
            "confidence": defect_result.confidence,
            "remediation_level": result.remediation_level,
            "remediation_measures": result.remediation_measures,
            "deadline_hours": result.deadline_hours,
            "responsible_dept": result.responsible_dept,
            "generated_at": datetime.now().isoformat(),
        }

        push_result = await self._push_service.push_http(push_url, push_payload)

        if push_result["status"] == "success":
            result.push_status = "pushed"
            result.push_time = datetime.now()
        elif push_result["status"] == "skipped":
            result.push_status = "skipped"
        else:
            result.push_status = "push_failed"

        self._history[task_id] = result

        logger.info(
            f"Task {task_id}: Remediation generated - "
            f"level={result.remediation_level}, measures={len(result.remediation_measures)}, "
            f"push_status={result.push_status}"
        )
        return result

    def get_result(self, task_id: str) -> Optional[RemediationResult]:
        return self._history.get(task_id)

    def get_all_results(self) -> dict[str, RemediationResult]:
        return dict(self._history)

    async def shutdown(self) -> None:
        await self._push_service.shutdown()
        logger.info("RemediationAdvisor module shut down")
