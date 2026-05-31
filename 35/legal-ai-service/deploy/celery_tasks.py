import os
import sys
import time
import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime
from enum import IntEnum
from functools import wraps

from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure
from celery.exceptions import SoftTimeLimitExceeded, TimeLimitExceeded

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from modules.document_parser import DocumentParser
from modules.embedding_service import EmbeddingService
from modules.provision_matcher import ProvisionMatcher
from modules.case_matcher import CaseMatcher
from modules.result_ranker import ResultRanker
from api.middleware import business_service_client
from loguru import logger


class TaskPriority(IntEnum):
    LOW = 0
    NORMAL = 5
    HIGH = 8
    URGENT = 10


class TaskStatus:
    PENDING = "PENDING"
    STARTED = "STARTED"
    PARSING = "PARSING"
    EMBEDDING = "EMBEDDING"
    MATCHING_PROVISIONS = "MATCHING_PROVISIONS"
    MATCHING_CASES = "MATCHING_CASES"
    RANKING = "RANKING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"


class TaskMetrics:
    _instance = None
    _metrics: Dict[str, Any] = {
        "total_tasks": 0,
        "successful_tasks": 0,
        "failed_tasks": 0,
        "timeout_tasks": 0,
        "avg_processing_time": 0.0,
        "processing_times": [],
        "current_queue_size": 0,
        "active_tasks": 0,
        "tasks_by_priority": {0: 0, 5: 0, 8: 0, 10: 0},
    }
    _lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def record_task_start(self, priority: int = 5):
        async with self._lock:
            self._metrics["total_tasks"] += 1
            self._metrics["active_tasks"] += 1
            self._metrics["tasks_by_priority"][priority] = (
                self._metrics["tasks_by_priority"].get(priority, 0) + 1
            )

    async def record_task_success(self, processing_time: float):
        async with self._lock:
            self._metrics["successful_tasks"] += 1
            self._metrics["active_tasks"] -= 1
            self._metrics["processing_times"].append(processing_time)
            if len(self._metrics["processing_times"]) > 1000:
                self._metrics["processing_times"] = self._metrics["processing_times"][-1000:]
            self._metrics["avg_processing_time"] = (
                sum(self._metrics["processing_times"]) 
                / len(self._metrics["processing_times"])
            )

    async def record_task_failure(self, is_timeout: bool = False):
        async with self._lock:
            self._metrics["failed_tasks"] += 1
            self._metrics["active_tasks"] -= 1
            if is_timeout:
                self._metrics["timeout_tasks"] += 1

    async def update_queue_size(self, size: int):
        async with self._lock:
            self._metrics["current_queue_size"] = size

    def get_metrics(self) -> Dict[str, Any]:
        return dict(self._metrics)


task_metrics = TaskMetrics()


def task_monitor(task_func):
    @wraps(task_func)
    def wrapper(self, *args, **kwargs):
        start_time = time.time()
        priority = kwargs.get('priority', TaskPriority.NORMAL)
        
        async def run_monitor():
            await task_metrics.record_task_start(priority)
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_monitor())
        finally:
            loop.close()

        try:
            result = task_func(self, *args, **kwargs)
            processing_time = time.time() - start_time
            
            async def record_success():
                await task_metrics.record_task_success(processing_time)
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(record_success())
            finally:
                loop.close()
            
            return result
            
        except (SoftTimeLimitExceeded, TimeLimitExceeded) as e:
            async def record_timeout():
                await task_metrics.record_task_failure(is_timeout=True)
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(record_timeout())
            finally:
                loop.close()
            raise
        except Exception as e:
            async def record_failure():
                await task_metrics.record_task_failure(is_timeout=False)
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(record_failure())
            finally:
                loop.close()
            raise

    return wrapper


celery_app = Celery(
    "legal_ai_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer=settings.CELERY_TASK_SERIALIZER,
    accept_content=settings.CELERY_ACCEPT_CONTENT,
    timezone=settings.CELERY_TIMEZONE,
    worker_concurrency=settings.CELERY_WORKER_CONCURRENCY,
    task_track_started=True,
    task_time_limit=600,
    task_soft_time_limit=480,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    worker_max_memory_per_child=2000000,
    task_acks_late=True,
    worker_disable_rate_limits=False,
    task_default_priority=TaskPriority.NORMAL,
    task_queue_max_priority=10,
)


document_parser = DocumentParser()
embedding_service = EmbeddingService()
provision_matcher = ProvisionMatcher()
case_matcher = CaseMatcher()
result_ranker = ResultRanker()


@task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, **kwargs):
    logger.info(f"Task started: {task.name} [{task_id}]")


@task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, state=None, **kwargs):
    logger.info(f"Task completed: {task.name} [{task_id}] state={state}")


@task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, **kwargs):
    logger.error(f"Task failed: {task_id}, error: {str(exception)}")


@celery_app.task(
    bind=True,
    name="analyze_document",
    autoretry_for=(Exception,),
    retry_backoff=3,
    retry_backoff_max=30,
    retry_kwargs={'max_retries': 2},
    priority=TaskPriority.NORMAL,
    rate_limit='30/m',
)
@task_monitor
def analyze_document_task(
    self,
    file_content_b64: str,
    file_name: str,
    case_type: Optional[str] = None,
    priority: int = TaskPriority.NORMAL,
):
    import base64

    task_start = time.time()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def update_progress(stage: str, progress: int):
        self.update_state(
            state=TaskStatus.STARTED,
            meta={
                "stage": stage,
                "progress": progress,
                "task_id": self.request.id,
                "started_at": datetime.utcnow().isoformat(),
            }
        )

    try:
        update_progress(TaskStatus.PARSING, 10)
        logger.info(f"Parsing document: {file_name}")

        file_content = base64.b64decode(file_content_b64)
        parsed_doc = loop.run_until_complete(
            document_parser.parse_file(file_content, file_name)
        )

        if case_type:
            parsed_doc.case_type = case_type

        update_progress(TaskStatus.EMBEDDING, 30)
        logger.info(f"Generating embeddings for: {file_name}")

        doc_embedding = loop.run_until_complete(
            embedding_service.encode_text(parsed_doc.cleaned_text[:2000])
        )
        paragraph_embeddings = loop.run_until_complete(
            embedding_service.encode_paragraphs(parsed_doc.paragraphs[:30])
        )

        update_progress(TaskStatus.MATCHING_PROVISIONS, 50)
        logger.info(f"Matching provisions for: {file_name}")

        matched_provisions = loop.run_until_complete(
            provision_matcher.match_by_paragraphs(
                paragraphs=parsed_doc.paragraphs,
                paragraph_embeddings=paragraph_embeddings,
            )
        )

        update_progress(TaskStatus.MATCHING_CASES, 70)
        logger.info(f"Matching cases for: {file_name}")

        provision_texts = [
            f"{p.provision.law_name}{p.provision.article_number}"
            for p in matched_provisions[:5]
        ]

        matched_cases = loop.run_until_complete(
            case_matcher.match_by_document(
                title=parsed_doc.file_name,
                paragraphs=parsed_doc.paragraphs,
                case_type=parsed_doc.case_type,
                matched_provisions=provision_texts,
                key_phrases=parsed_doc.key_phrases,
            )
        )

        update_progress(TaskStatus.RANKING, 85)
        logger.info(f"Ranking results for: {file_name}")

        ranked_result = result_ranker.rank_combined(
            provisions=matched_provisions,
            cases=matched_cases,
            query_text=parsed_doc.cleaned_text[:2000],
            legal_claims=parsed_doc.legal_claims,
            key_phrases=parsed_doc.key_phrases,
            case_type=parsed_doc.case_type,
        )

        ranked_provisions = result_ranker.deduplicate_provisions(
            ranked_result.matched_provisions
        )
        ranked_cases = result_ranker.deduplicate_cases(ranked_result.matched_cases)

        processing_time = (time.time() - task_start) * 1000

        result = {
            "task_id": self.request.id,
            "document_id": parsed_doc.document_id,
            "document_info": {
                "document_id": parsed_doc.document_id,
                "file_name": parsed_doc.file_name,
                "file_type": parsed_doc.file_type,
                "case_type": parsed_doc.case_type,
                "court": parsed_doc.court,
                "case_number": parsed_doc.case_number,
                "parties": parsed_doc.parties,
                "legal_claims": parsed_doc.legal_claims,
                "key_phrases": parsed_doc.key_phrases,
                "paragraph_count": len(parsed_doc.paragraphs),
                "parse_warnings": parsed_doc.parse_warnings,
                "is_partial": parsed_doc.is_partial,
            },
            "matched_provisions": [
                {
                    "provision": m.provision.to_dict(),
                    "similarity_score": m.similarity_score,
                    "matched_text": m.matched_text,
                    "match_type": m.match_type,
                    "rank": m.rank,
                }
                for m in ranked_provisions
            ],
            "matched_cases": [
                {
                    "case_data": m.case_data.to_dict(),
                    "similarity_score": m.similarity_score,
                    "similarity_details": m.similarity_details,
                    "matched_reasons": m.matched_reasons,
                    "shared_provisions": m.shared_provisions,
                    "shared_keywords": m.shared_keywords,
                    "rank": m.rank,
                }
                for m in ranked_cases
            ],
            "confidence_score": ranked_result.confidence_score,
            "ranking_strategy": ranked_result.ranking_strategy,
            "processing_time_ms": round(processing_time, 2),
            "completed_at": datetime.utcnow().isoformat(),
        }

        try:
            loop.run_until_complete(
                business_service_client.notify_analysis_complete(
                    parsed_doc.document_id, result
                )
            )
        except Exception as e:
            logger.warning(f"Failed to notify business service: {e}")

        update_progress(TaskStatus.SUCCESS, 100)
        logger.info(
            f"Document analysis completed: {file_name}, "
            f"time={processing_time:.2f}ms, "
            f"provisions={len(ranked_provisions)}, "
            f"cases={len(ranked_cases)}"
        )

        return result

    except SoftTimeLimitExceeded:
        logger.error(f"Task timeout: {file_name}")
        return {
            "error": "Task timeout",
            "stage": "timeout",
            "file_name": file_name,
        }
    except Exception as e:
        logger.error(f"Task failed: {file_name}, error: {str(e)}")
        return {
            "error": str(e),
            "stage": "failed",
            "file_name": file_name,
        }
    finally:
        loop.close()


@celery_app.task(
    bind=True,
    name="batch_analyze_documents",
    priority=TaskPriority.LOW,
)
def batch_analyze_documents_task(
    self,
    documents: List[Dict[str, str]],
    priority: int = TaskPriority.LOW,
):
    results = []
    errors = []
    total = len(documents)
    completed = 0

    logger.info(f"Starting batch analysis: {total} documents")

    for i, doc in enumerate(documents):
        try:
            doc_priority = doc.get('priority', priority)
            
            task_result = analyze_document_task.apply_async(
                args=[
                    doc["file_content"],
                    doc["file_name"],
                    doc.get("case_type"),
                    doc_priority,
                ],
                priority=doc_priority,
            )

            results.append({
                "index": i,
                "file_name": doc["file_name"],
                "task_id": task_result.id,
                "status": "queued",
            })

        except Exception as e:
            errors.append({
                "index": i,
                "file_name": doc.get("file_name", "unknown"),
                "error": str(e),
            })

        completed += 1
        progress = completed / total

        self.update_state(
            state="PROGRESS",
            meta={
                "progress": progress,
                "processed": completed,
                "total": total,
                "queued": len(results),
                "failed": len(errors),
            }
        )

        if i % 5 == 0:
            time.sleep(0.1)

    batch_id = self.request.id
    logger.info(
        f"Batch submitted: batch_id={batch_id}, "
        f"total={total}, queued={len(results)}, failed={len(errors)}"
    )

    return {
        "batch_id": batch_id,
        "total_count": total,
        "queued_count": len(results),
        "failed_count": len(errors),
        "tasks": results,
        "errors": errors,
        "submitted_at": datetime.utcnow().isoformat(),
    }


@celery_app.task(
    bind=True,
    name="analyze_text",
    priority=TaskPriority.HIGH,
    rate_limit='60/m',
)
@task_monitor
def analyze_text_task(
    self,
    text: str,
    case_type: Optional[str] = None,
    top_k_provisions: int = 10,
    top_k_cases: int = 5,
    priority: int = TaskPriority.HIGH,
):
    task_start = time.time()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def update_progress(stage: str, progress: int):
        self.update_state(
            state=TaskStatus.STARTED,
            meta={"stage": stage, "progress": progress}
        )

    try:
        update_progress(TaskStatus.PARSING, 20)

        cleaned_text = document_parser._clean_text(text)
        paragraphs = document_parser._split_paragraphs_smart(cleaned_text)

        update_progress(TaskStatus.EMBEDDING, 40)

        doc_embedding = loop.run_until_complete(
            embedding_service.encode_text(cleaned_text[:2000])
        )
        paragraph_embeddings = loop.run_until_complete(
            embedding_service.encode_paragraphs(paragraphs[:20])
        )

        update_progress(TaskStatus.MATCHING_PROVISIONS, 60)

        matched_provisions = loop.run_until_complete(
            provision_matcher.match_by_paragraphs(
                paragraphs=paragraphs,
                paragraph_embeddings=paragraph_embeddings,
                top_k=top_k_provisions,
            )
        )

        update_progress(TaskStatus.MATCHING_CASES, 80)

        provision_texts = [
            f"{p.provision.law_name}{p.provision.article_number}"
            for p in matched_provisions[:5]
        ]

        matched_cases = loop.run_until_complete(
            case_matcher.match_cases(
                query_text=cleaned_text[:2000],
                query_embedding=doc_embedding,
                case_type=case_type,
                top_k=top_k_cases,
                legal_provisions=provision_texts,
            )
        )

        update_progress(TaskStatus.SUCCESS, 100)

        processing_time = (time.time() - task_start) * 1000

        return {
            "matched_provisions": [
                {
                    "provision": m.provision.to_dict(),
                    "similarity_score": m.similarity_score,
                    "matched_text": m.matched_text,
                    "match_type": m.match_type,
                    "rank": m.rank,
                }
                for m in matched_provisions
            ],
            "matched_cases": [
                {
                    "case_data": m.case_data.to_dict(),
                    "similarity_score": m.similarity_score,
                    "similarity_details": m.similarity_details,
                    "matched_reasons": m.matched_reasons,
                    "rank": m.rank,
                }
                for m in matched_cases
            ],
            "processing_time_ms": round(processing_time, 2),
        }

    except Exception as e:
        logger.error(f"Text analysis failed: {str(e)}")
        return {"error": str(e)}
    finally:
        loop.close()


@celery_app.task(name="rebuild_vector_indexes")
def rebuild_vector_indexes_task():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        logger.info("Rebuilding vector indexes...")
        loop.run_until_complete(provision_matcher.build_vector_index())
        loop.run_until_complete(case_matcher.build_vector_index())
        logger.info("Vector indexes rebuilt successfully")
        return {"status": "success", "message": "Vector indexes rebuilt successfully"}
    except Exception as e:
        logger.error(f"Failed to rebuild vector indexes: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        loop.close()


@celery_app.task(name="get_task_metrics")
def get_task_metrics_task():
    return task_metrics.get_metrics()


@celery_app.task(name="get_queue_status")
def get_queue_status_task():
    try:
        with celery_app.connection() as connection:
            inspector = celery_app.control.inspect()
            
            active = inspector.active() or {}
            scheduled = inspector.scheduled() or {}
            reserved = inspector.reserved() or {}

            active_count = sum(len(tasks) for tasks in active.values())
            scheduled_count = sum(len(tasks) for tasks in scheduled.values())
            reserved_count = sum(len(tasks) for tasks in reserved.values())

            return {
                "active_tasks": active_count,
                "scheduled_tasks": scheduled_count,
                "reserved_tasks": reserved_count,
                "total_pending": scheduled_count + reserved_count,
                "workers": list(active.keys()),
                "metrics": task_metrics.get_metrics(),
            }
    except Exception as e:
        logger.error(f"Failed to get queue status: {e}")
        return {"error": str(e)}


@celery_app.task(name="search_provisions")
def search_provisions_task(query: str, top_k: int = 10, threshold: float = 0.6):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        matched = loop.run_until_complete(
            provision_matcher.match_provisions(
                query_text=query,
                top_k=top_k,
                threshold=threshold,
            )
        )
        return {
            "total": len(matched),
            "provisions": [
                {
                    "provision": m.provision.to_dict(),
                    "similarity_score": m.similarity_score,
                    "matched_text": m.matched_text,
                    "match_type": m.match_type,
                    "rank": m.rank,
                }
                for m in matched
            ],
        }
    finally:
        loop.close()
