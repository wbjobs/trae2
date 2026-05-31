import asyncio
import os
import time
import hashlib
from datetime import datetime
from typing import Optional
from collections import deque

import httpx

from config import get_settings
from logger import setup_logger
from models import (
    InspectionRequest,
    FullAnalysisResult,
    SpeechResult,
    SemanticResult,
    DefectResult,
    RemediationResult,
    CaseStatus,
    Priority,
)
from speech_to_text import SpeechToTextModule
from semantic_analyzer import SemanticAnalyzerModule
from defect_matcher import DefectMatcherModule
from remediation_advisor import RemediationAdvisorModule
from human_correction import HumanCorrectionModule
from case_aggregator import CaseAggregatorModule
from inference_cache import InferenceCacheModule
from data_init import init_data_dir, DEFECT_TYPES

logger = setup_logger("orchestrator")
settings = get_settings()


class AdaptiveConcurrencyController:
    def __init__(
        self,
        initial_concurrency: int = 8,
        min_concurrency: int = 2,
        max_concurrency: int = 64,
        target_latency_ms: float = 5000.0,
    ):
        self.current = initial_concurrency
        self.min = min_concurrency
        self.max = max_concurrency
        self.target_latency = target_latency_ms
        self._latency_history = deque(maxlen=50)
        self._error_rate = 0.0
        self._lock = asyncio.Lock()

    def record_latency(self, latency_ms: float, success: bool = True) -> None:
        self._latency_history.append(latency_ms)
        if not success:
            self._error_rate = min(1.0, self._error_rate + 0.05)
        else:
            self._error_rate = max(0.0, self._error_rate - 0.01)

    async def adjust(self) -> int:
        async with self._lock:
            if len(self._latency_history) < 10:
                return self.current

            avg_latency = sum(self._latency_history) / len(self._latency_history)
            load_ratio = avg_latency / self.target_latency

            if self._error_rate > 0.1:
                self.current = max(self.min, int(self.current * 0.8))
            elif load_ratio < 0.7:
                self.current = min(self.max, int(self.current * 1.2))
            elif load_ratio > 1.3:
                self.current = max(self.min, int(self.current * 0.9))

            return self.current

    def get_stats(self) -> dict:
        return {
            "current": self.current,
            "min": self.min,
            "max": self.max,
            "avg_latency_ms": sum(self._latency_history) / max(1, len(self._latency_history)),
            "error_rate": round(self._error_rate, 4),
        }


class ResourceMonitor:
    def __init__(self, check_interval: int = 10):
        self.check_interval = check_interval
        self._cpu_usage = 0.0
        self._memory_usage = 0.0
        self._throughput = 0.0
        self._task_count = 0
        self._task_times: deque = deque(maxlen=100)
        self._lock = asyncio.Lock()
        self._monitor_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("Resource monitor started")

    async def stop(self) -> None:
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass

    async def _monitor_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.check_interval)
                await self._collect_metrics()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Resource monitor error: {e}")

    async def _collect_metrics(self) -> None:
        try:
            import psutil
            async with self._lock:
                self._cpu_usage = psutil.cpu_percent(interval=None)
                mem = psutil.virtual_memory()
                self._memory_usage = mem.percent
                if self._task_times:
                    time_span = max(1.0, self._task_times[-1] - self._task_times[0])
                    self._throughput = len(self._task_times) / time_span
        except ImportError:
            pass

    def record_task_completion(self) -> None:
        async def _record():
            async with self._lock:
                self._task_count += 1
                self._task_times.append(time.time())

        asyncio.create_task(_record())

    def get_metrics(self) -> dict:
        return {
            "cpu_usage": round(self._cpu_usage, 1),
            "memory_usage": round(self._memory_usage, 1),
            "throughput": round(self._throughput, 2),
            "total_tasks": self._task_count,
            "avg_latency_ms": (
                round(
                    (self._task_times[-1] - self._task_times[0])
                    / max(1, len(self._task_times))
                    * 1000,
                    1,
                )
                if len(self._task_times) > 1
                else 0.0
            ),
        }


class PipelineMetrics:
    def __init__(self):
        self.total_tasks = 0
        self.success_tasks = 0
        self.failed_tasks = 0
        self.stage_times: dict[str, list[float]] = {
            "speech": [],
            "semantic": [],
            "defect": [],
            "remediation": [],
        }
        self._lock = asyncio.Lock()

    async def record_success(self, stage_times: dict[str, float]) -> None:
        async with self._lock:
            self.total_tasks += 1
            self.success_tasks += 1
            for stage, t in stage_times.items():
                if stage in self.stage_times:
                    self.stage_times[stage].append(t)

    async def record_failure(self) -> None:
        async with self._lock:
            self.total_tasks += 1
            self.failed_tasks += 1

    def get_stats(self) -> dict:
        stats = {
            "total_tasks": self.total_tasks,
            "success_tasks": self.success_tasks,
            "failed_tasks": self.failed_tasks,
            "success_rate": round(
                self.success_tasks / self.total_tasks * 100, 2
            ) if self.total_tasks > 0 else 0.0,
        }

        for stage, times in self.stage_times.items():
            if times:
                stats[f"{stage}_avg_ms"] = round(sum(times) / len(times) * 1000, 1)
                stats[f"{stage}_count"] = len(times)
            else:
                stats[f"{stage}_avg_ms"] = 0.0
                stats[f"{stage}_count"] = 0

        return stats


class BusinessServiceClient:
    def __init__(self):
        self._base_url = os.getenv("BUSINESS_SERVICE_URL", "http://localhost:8001")
        self._client: Optional[httpx.AsyncClient] = None

    async def initialize(self) -> None:
        self._client = httpx.AsyncClient(timeout=30.0)
        logger.info(f"Business service client initialized, base_url={self._base_url}")

    async def notify_task_created(self, task_id: str, device_id: str) -> dict:
        try:
            resp = await self._client.post(
                f"{self._base_url}/api/internal/task/created",
                json={"task_id": task_id, "device_id": device_id},
            )
            return {"status": "ok", "code": resp.status_code}
        except Exception as e:
            logger.warning(f"Failed to notify business service (task_created): {e}")
            return {"status": "unavailable", "error": str(e)}

    async def notify_defect_found(self, task_id: str, defect: dict) -> dict:
        try:
            resp = await self._client.post(
                f"{self._base_url}/api/internal/defect/found",
                json={"task_id": task_id, "defect": defect},
            )
            return {"status": "ok", "code": resp.status_code}
        except Exception as e:
            logger.warning(f"Failed to notify business service (defect_found): {e}")
            return {"status": "unavailable", "error": str(e)}

    async def notify_task_completed(self, task_id: str, result: dict) -> dict:
        try:
            resp = await self._client.post(
                f"{self._base_url}/api/internal/task/completed",
                json={"task_id": task_id, "result": result},
            )
            return {"status": "ok", "code": resp.status_code}
        except Exception as e:
            logger.warning(f"Failed to notify business service (task_completed): {e}")
            return {"status": "unavailable", "error": str(e)}

    async def batch_notify_completed(self, items: list[dict]) -> dict:
        if len(items) == 1:
            return await self.notify_task_completed(items[0]["task_id"], items[0]["result"])

        try:
            resp = await self._client.post(
                f"{self._base_url}/api/internal/task/batch_completed",
                json={"items": items},
            )
            return {"status": "ok", "code": resp.status_code, "batch_size": len(items)}
        except Exception as e:
            logger.warning(f"Failed batch notify: {e}")
            return {"status": "unavailable", "error": str(e)}

    async def shutdown(self) -> None:
        if self._client:
            await self._client.aclose()


class Orchestrator:
    def __init__(self):
        self.speech_module = SpeechToTextModule()
        self.semantic_module = SemanticAnalyzerModule()
        self.defect_module = DefectMatcherModule()
        self.remediation_module = RemediationAdvisorModule()
        self.correction_module = HumanCorrectionModule()
        self.case_aggregator = CaseAggregatorModule()
        self.cache_module = InferenceCacheModule()
        self._business_client = BusinessServiceClient()
        self._metrics = PipelineMetrics()
        self._concurrency_controller = AdaptiveConcurrencyController(
            initial_concurrency=settings.SPEECH_MAX_CONCURRENT,
            min_concurrency=2,
            max_concurrency=getattr(settings, "MAX_CONCURRENCY", 64),
            target_latency_ms=getattr(settings, "TARGET_LATENCY_MS", 5000),
        )
        self._resource_monitor = ResourceMonitor()
        self._task_results: dict[str, FullAnalysisResult] = {}
        self._websocket_clients: set = set()
        self._initialized = False

    async def initialize(self) -> None:
        logger.info("Initializing Orchestrator and all sub-modules...")
        init_data_dir()

        await asyncio.gather(
            self.speech_module.initialize(),
            self.semantic_module.initialize(),
            self.defect_module.initialize(),
            self.remediation_module.initialize(),
            self.correction_module.initialize(),
            self.case_aggregator.initialize(),
        )

        self._init_cache_module()

        await self._business_client.initialize()
        await self._resource_monitor.start()

        self._initialized = True
        logger.info("Orchestrator initialization complete, all modules ready")

    def _init_cache_module(self) -> None:
        def batch_semantic(texts: list[str]) -> list[dict]:
            results = []
            for text in texts:
                engine = self.semantic_module._engine
                kw = engine.extract_keywords(text)
                intent, intent_conf = engine.recognize_intent(text)
                severity = engine.determine_severity(text, kw)
                emb = engine.compute_embedding(text)
                results.append({
                    "keywords": kw,
                    "intent": intent,
                    "intent_confidence": intent_conf,
                    "severity_level": severity,
                    "embedding": emb,
                })
            return results

        def batch_defect(items: list[tuple]) -> list[dict]:
            results = []
            for text, keywords, entities, intent, severity in items:
                classifier = self.defect_module._classifier
                matches = classifier.classify(
                    text, keywords, entities, intent, severity,
                    self.defect_module._kb.defect_types,
                )
                if matches:
                    defect, conf, rules = matches[0]
                    is_defect = conf >= self.defect_module._confidence_threshold
                    results.append({
                        "defect_type": defect["code"],
                        "defect_name": defect["name"],
                        "defect_category": defect["category"],
                        "confidence": conf,
                        "is_defect": is_defect,
                        "matched_rules": rules,
                    })
                else:
                    results.append({
                        "defect_type": "", "defect_name": "",
                        "defect_category": "", "confidence": 0.0,
                        "is_defect": False, "matched_rules": [],
                    })
            return results

        precompute_texts = [
            d["name"] + " ".join(d["keywords"]) for d in DEFECT_TYPES
        ]
        for d in DEFECT_TYPES:
            precompute_texts.extend(d["keywords"])

        self.cache_module.initialize(
            semantic_batch_func=batch_semantic,
            defect_batch_func=batch_defect,
            precompute_texts=list(set(precompute_texts)),
            vector_compute_func=self.semantic_module._engine.compute_embedding,
        )

    async def _fetch_audio(self, url: str) -> bytes:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content

    async def process_full_pipeline(
        self, request: InspectionRequest
    ) -> Optional[FullAnalysisResult]:
        if not self._initialized:
            logger.error("Orchestrator not initialized")
            return None

        task_id = request.task_id
        stage_times: dict[str, float] = {}
        pipeline_start = time.time()

        result = FullAnalysisResult(
            task_id=task_id,
            device_id=request.device_id,
            inspector_id=request.inspector_id,
            inspection_time=request.inspection_time,
            priority=request.priority or Priority.NORMAL,
            overall_status="processing",
        )
        self._task_results[task_id] = result

        await self._business_client.notify_task_created(task_id, request.device_id)
        await self._broadcast_ws({"event": "task_started", "task_id": task_id})

        try:
            audio_data = request.audio_data
            if not audio_data and request.audio_url:
                audio_data = await self._fetch_audio(request.audio_url)
            audio_hash = hashlib.md5(audio_data).hexdigest() if audio_data else ""

            t0 = time.time()
            cached_speech = self.cache_module.get_speech_cache(audio_hash)

            if cached_speech:
                speech_result = SpeechResult(**cached_speech)
                speech_result.task_id = task_id
                logger.info(f"Task {task_id}: Speech result from cache")
            else:
                speech_result = await self.speech_module.transcribe(
                    task_id=task_id,
                    audio_data=audio_data or b"",
                    audio_format=request.audio_format,
                    sample_rate=request.sample_rate,
                    priority=request.priority.value if request.priority else "normal",
                )
                self.cache_module.put_speech_cache(
                    audio_hash, speech_result.model_dump(exclude={"task_id"})
                )

            result.speech_result = speech_result
            stage_times["speech"] = time.time() - t0

            if not speech_result.raw_text:
                result.overall_status = "completed_no_speech"
                result.completed_at = datetime.now()
                await self._metrics.record_failure()
                logger.warning(f"Task {task_id}: No speech detected")
                return result

            t0 = time.time()
            text = speech_result.raw_text
            cached_sem = self.cache_module.get_semantic_cache(text)

            if cached_sem:
                semantic_result = SemanticResult(**cached_sem)
                semantic_result.task_id = task_id
                logger.debug(f"Task {task_id}: Semantic result from cache")
            else:
                semantic_result = await self.semantic_module.analyze(
                    task_id=task_id, text=text
                )
                self.cache_module.put_semantic_cache(
                    text, semantic_result.model_dump(exclude={"task_id"})
                )

            result.semantic_result = semantic_result
            stage_times["semantic"] = time.time() - t0

            t0 = time.time()
            cache_context = f"{semantic_result.intent}:{semantic_result.severity_level}"
            cached_defect = self.cache_module.get_defect_cache(text, cache_context)

            if cached_defect:
                defect_result = DefectResult(**cached_defect)
                defect_result.task_id = task_id
                logger.debug(f"Task {task_id}: Defect result from cache")
            else:
                defect_result = await self.defect_module.match(
                    task_id=task_id,
                    text=text,
                    semantic_result=semantic_result,
                )
                self.cache_module.put_defect_cache(
                    text, defect_result.model_dump(exclude={"task_id"}), cache_context
                )

            result.defect_result = defect_result
            stage_times["defect"] = time.time() - t0

            if defect_result.is_defect:
                await self._business_client.notify_defect_found(
                    task_id,
                    {
                        "defect_type": defect_result.defect_type,
                        "defect_name": defect_result.defect_name,
                        "confidence": defect_result.confidence,
                    },
                )
                await self.correction_module.add_pending_review(result)

            t0 = time.time()
            remediation_result = await self.remediation_module.generate_and_push(
                defect_result=defect_result,
                context={"severity_override": semantic_result.severity_level},
            )
            result.remediation_result = remediation_result
            stage_times["remediation"] = time.time() - t0

            if defect_result.is_defect:
                await self.case_aggregator.aggregate_case(result)

            result.overall_status = "completed"
            result.completed_at = datetime.now()
            await self._metrics.record_success(stage_times)

            await self._business_client.notify_task_completed(
                task_id, result.model_dump(mode="json")
            )

            total_latency = (time.time() - pipeline_start) * 1000
            self._concurrency_controller.record_latency(total_latency, success=True)
            self._resource_monitor.record_task_completion()
            await self._concurrency_controller.adjust()

            await self._broadcast_ws({
                "event": "task_completed",
                "task_id": task_id,
                "result": result.model_dump(mode="json"),
            })

            total = sum(stage_times.values())
            logger.info(
                f"Task {task_id}: Pipeline completed in {total:.3f}s, "
                f"defect={defect_result.is_defect}, "
                f"severity={semantic_result.severity_level}, "
                f"cache_hit={speech_result.cache_hit or semantic_result.cache_hit or defect_result.cache_hit}"
            )

        except Exception as e:
            result.overall_status = "failed"
            result.completed_at = datetime.now()
            await self._metrics.record_failure()
            total_latency = (time.time() - pipeline_start) * 1000
            self._concurrency_controller.record_latency(total_latency, success=False)
            logger.error(f"Task {task_id}: Pipeline failed: {e}", exc_info=True)
            await self._broadcast_ws({"event": "task_failed", "task_id": task_id, "error": str(e)})

        return result

    async def process_batch(
        self, requests: list[InspectionRequest]
    ) -> list[Optional[FullAnalysisResult]]:
        batch_size = getattr(settings, "BATCH_PROCESS_SIZE", 16)

        batches = [
            requests[i:i + batch_size]
            for i in range(0, len(requests), batch_size)
        ]

        logger.info(f"Processing {len(requests)} tasks in {len(batches)} batches")

        all_results = []
        for batch in batches:
            coroutines = [self.process_full_pipeline(req) for req in batch]
            results = await asyncio.gather(*coroutines, return_exceptions=True)

            for r in results:
                if isinstance(r, Exception):
                    logger.error(f"Batch pipeline error: {r}")
                    all_results.append(None)
                else:
                    all_results.append(r)

            await asyncio.sleep(getattr(settings, "BATCH_INTERVAL_MS", 10) / 1000)

        return all_results

    def get_task_result(self, task_id: str) -> Optional[FullAnalysisResult]:
        return self._task_results.get(task_id)

    async def get_system_status(self) -> dict:
        cache_stats = self.cache_module.get_stats()
        resource_metrics = self._resource_monitor.get_metrics()
        speech_status = self.speech_module.get_queue_status()
        correction_stats = self.correction_module.get_feedback_stats()
        concurrency_stats = self._concurrency_controller.get_stats()

        return {
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running" if self._initialized else "initializing",
            "queue": speech_status,
            "active_speech_tasks": self.speech_module.get_active_task_count(),
            "cached_results": len(self._task_results),
            "metrics": self._metrics.get_stats(),
            "cache": cache_stats,
            "cache_hit_rate": round(self.cache_module.get_overall_hit_rate() * 100, 2),
            "resource": resource_metrics,
            "adaptive_concurrency": concurrency_stats,
            "corrections": correction_stats,
            "timestamp": datetime.now().isoformat(),
        }

    async def register_websocket(self, ws) -> None:
        self._websocket_clients.add(ws)
        logger.info(f"WebSocket client registered, total={len(self._websocket_clients)}")

    async def unregister_websocket(self, ws) -> None:
        self._websocket_clients.discard(ws)
        logger.info(f"WebSocket client unregistered, total={len(self._websocket_clients)}")

    async def _broadcast_ws(self, message: dict) -> None:
        if not self._websocket_clients:
            return

        for ws in list(self._websocket_clients):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.debug(f"WebSocket send failed: {e}")
                await self.unregister_websocket(ws)

    async def shutdown(self) -> None:
        logger.info("Orchestrator shutting down...")
        await asyncio.gather(
            self.speech_module.shutdown(),
            self.remediation_module.shutdown(),
            self.correction_module.shutdown(),
            self.case_aggregator.shutdown(),
            self.cache_module.shutdown(),
            self._business_client.shutdown(),
            self._resource_monitor.stop(),
        )
        self._initialized = False
        logger.info("Orchestrator shut down complete")
