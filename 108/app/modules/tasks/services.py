import asyncio
import time
from typing import Dict, Any, Optional, List, Callable, Coroutine
from collections import deque
from datetime import datetime
from abc import ABC, abstractmethod
from sqlalchemy import select, func
from app.core import settings, log, get_db
from app.models import Task, ComparisonResult, TaskLog


class TaskStatus:
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    RETRYING = "retrying"


class TaskType:
    PARSE_DOCUMENT = "parse_document"
    PARSE_BATCH = "parse_batch"
    INDEX_LAW = "index_law"
    INDEX_CASE = "index_case"
    INDEX_BATCH = "index_batch"
    COMPARE_CASE = "compare_case"
    COMPARE_BATCH = "compare_batch"
    EXPORT_RESULT = "export_result"
    INTERPRET_LAW = "interpret_law"
    REWRITE_CASE = "rewrite_case"


TASK_TIMEOUTS = {
    TaskType.PARSE_DOCUMENT: 300,
    TaskType.PARSE_BATCH: 1800,
    TaskType.INDEX_LAW: 120,
    TaskType.INDEX_CASE: 120,
    TaskType.INDEX_BATCH: 1800,
    TaskType.COMPARE_CASE: 600,
    TaskType.COMPARE_BATCH: 3600,
    TaskType.EXPORT_RESULT: 600,
    TaskType.INTERPRET_LAW: 180,
    TaskType.REWRITE_CASE: 180,
}

RETRYABLE_ERRORS = {
    "ConnectionError",
    "TimeoutError",
    "httpx.HTTPError",
    "httpx.ConnectTimeout",
    "httpx.ReadTimeout",
    "aiosqlite.Error",
}

MAX_RETRIES_DEFAULT = 3
RETRY_BACKOFF_BASE = 2


class TaskLogService:
    @staticmethod
    async def add_log(
        db,
        task_id: int,
        level: str,
        message: str,
        details: Optional[Dict] = None,
        duration_ms: float = 0.0
    ):
        task_log = TaskLog(
            task_id=task_id,
            level=level,
            message=message[:2000],
            details=details,
            duration_ms=duration_ms
        )
        db.add(task_log)
        await db.commit()

    @staticmethod
    async def add_log_safe(task_id: int, level: str, message: str, details: Optional[Dict] = None, duration_ms: float = 0.0):
        try:
            async with get_db() as db:
                await TaskLogService.add_log(db, task_id, level, message, details, duration_ms)
        except Exception as e:
            log.warning(f"写入任务日志失败 task_id={task_id}: {str(e)}")

    @staticmethod
    async def get_logs(db, task_id: int, skip: int = 0, limit: int = 100):
        query = select(TaskLog).where(TaskLog.task_id == task_id).order_by(TaskLog.id.desc())
        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar()
        result = await db.execute(query.offset(skip).limit(limit))
        logs = result.scalars().all()
        return logs, total


class BaseTask(ABC):
    def __init__(self, task_id: int, params: Dict[str, Any], task_type: str = ""):
        self.task_id = task_id
        self.params = params
        self.task_type = task_type
        self._cancelled = False
        self._start_time = None
        self._step_start_time = None

    @abstractmethod
    async def execute(self) -> Dict[str, Any]:
        pass

    def cancel(self):
        self._cancelled = True

    def get_timeout(self) -> int:
        return TASK_TIMEOUTS.get(self.task_type, 300)

    def is_retryable(self, error: Exception) -> bool:
        error_type = type(error).__name__
        if error_type in RETRYABLE_ERRORS:
            return True
        error_msg = str(error).lower()
        retryable_patterns = ["timeout", "connection", "network", "rate limit", "429", "503", "502"]
        return any(p in error_msg for p in retryable_patterns)

    async def _log_step(self, step_name: str, level: str = "info", details: Optional[Dict] = None):
        duration_ms = 0.0
        if self._step_start_time:
            duration_ms = (time.monotonic() - self._step_start_time) * 1000

        await TaskLogService.add_log_safe(
            self.task_id, level, step_name,
            details=details, duration_ms=duration_ms
        )
        self._step_start_time = time.monotonic()

    async def _update_progress(self, completed: int, total: int, failed: int = 0):
        if self._cancelled:
            return
        try:
            async with get_db() as db:
                result = await db.execute(select(Task).where(Task.id == self.task_id))
                task = result.scalar_one_or_none()
                if task:
                    task.completed = completed
                    task.failed = failed
                    task.progress = int((completed + failed) / total * 100) if total > 0 else 0
                    await db.commit()
        except Exception as e:
            log.warning(f"更新进度失败 task_id={self.task_id}: {str(e)}")


class ParseDocumentTask(BaseTask):
    async def execute(self) -> Dict[str, Any]:
        from app.modules.parser import DocumentService

        document_id = self.params.get("document_id")
        self._step_start_time = time.monotonic()
        await self._log_step(f"开始文档解析: document_id={document_id}")

        async with get_db() as db:
            laws, cases = await DocumentService.parse_and_extract(db, document_id)

        await self._log_step(f"文档解析完成: 提取{len(laws)}条法条, {len(cases)}个案例", details={
            "laws_extracted": len(laws),
            "cases_extracted": len(cases)
        })

        return {
            "laws_extracted": len(laws),
            "cases_extracted": len(cases),
            "law_ids": [law.id for law in laws],
            "case_ids": [case.id for case in cases]
        }


class ParseBatchTask(BaseTask):
    async def execute(self) -> Dict[str, Any]:
        from app.modules.parser import DocumentService

        document_ids = self.params.get("document_ids", [])
        total = len(document_ids)
        self._step_start_time = time.monotonic()
        await self._log_step(f"开始批量文档解析: 共{total}个文档")

        completed = 0
        failed = 0
        laws_extracted = 0
        cases_extracted = 0

        for document_id in document_ids:
            if self._cancelled:
                await self._log_step(f"批量任务被取消，已完成{completed}/{total}", level="warning")
                break

            try:
                async with get_db() as db:
                    laws, cases = await DocumentService.parse_and_extract(db, document_id)
                    laws_extracted += len(laws)
                    cases_extracted += len(cases)
                    completed += 1
                    await self._log_step(f"文档解析成功: document_id={document_id}", details={
                        "document_id": document_id, "laws": len(laws), "cases": len(cases)
                    })
            except Exception as e:
                log.error(f"文档解析失败 document_id={document_id}: {str(e)}")
                failed += 1
                await self._log_step(f"文档解析失败: document_id={document_id}", level="error", details={
                    "document_id": document_id, "error": str(e)[:500]
                })

            await self._update_progress(completed, total, failed)
            await asyncio.sleep(0.1)

        await self._log_step(f"批量解析完成: 成功{completed}, 失败{failed}", details={
            "completed": completed, "failed": failed,
            "laws_extracted": laws_extracted, "cases_extracted": cases_extracted
        })

        return {
            "total": total,
            "completed": completed,
            "failed": failed,
            "laws_extracted": laws_extracted,
            "cases_extracted": cases_extracted
        }


class IndexLawTask(BaseTask):
    async def execute(self) -> Dict[str, Any]:
        from app.modules.search import SearchService

        law_id = self.params.get("law_id")
        self._step_start_time = time.monotonic()
        await self._log_step(f"开始法条索引: law_id={law_id}")

        success = await SearchService.index_law(law_id)

        await self._log_step(f"法条索引{'成功' if success else '失败'}: law_id={law_id}", details={"law_id": law_id, "success": success})
        return {"law_id": law_id, "success": success}


class IndexBatchTask(BaseTask):
    async def execute(self) -> Dict[str, Any]:
        from app.modules.search import SearchService

        law_ids = self.params.get("law_ids", [])
        case_ids = self.params.get("case_ids", [])
        total = len(law_ids) + len(case_ids)
        self._step_start_time = time.monotonic()
        await self._log_step(f"开始批量索引: laws={len(law_ids)}, cases={len(case_ids)}")

        results = {
            "laws_indexed": 0,
            "cases_indexed": 0,
            "total": total,
            "completed": 0,
            "failed": 0
        }

        batch_size = 20
        if law_ids:
            for i in range(0, len(law_ids), batch_size):
                if self._cancelled:
                    break
                batch = law_ids[i:i+batch_size]
                try:
                    count = await SearchService.bulk_index_laws(batch)
                    results["laws_indexed"] += count
                    results["completed"] += len(batch)
                    await self._log_step(f"法条批量索引成功: {len(batch)}条", details={"batch_size": len(batch), "indexed": count})
                except Exception as e:
                    log.error(f"批量索引法条失败: {str(e)}")
                    results["failed"] += len(batch)
                    await self._log_step(f"法条批量索引失败", level="error", details={"error": str(e)[:500]})
                await self._update_progress(results["completed"], total, results["failed"])
                await asyncio.sleep(0.1)

        if case_ids:
            for i in range(0, len(case_ids), batch_size):
                if self._cancelled:
                    break
                batch = case_ids[i:i+batch_size]
                try:
                    count = await SearchService.bulk_index_cases(batch)
                    results["cases_indexed"] += count
                    results["completed"] += len(batch)
                    await self._log_step(f"案例批量索引成功: {len(batch)}条", details={"batch_size": len(batch), "indexed": count})
                except Exception as e:
                    log.error(f"批量索引案例失败: {str(e)}")
                    results["failed"] += len(batch)
                    await self._log_step(f"案例批量索引失败", level="error", details={"error": str(e)[:500]})
                await self._update_progress(results["completed"], total, results["failed"])
                await asyncio.sleep(0.1)

        return results


class CompareCaseTask(BaseTask):
    async def execute(self) -> Dict[str, Any]:
        from app.modules.ai import AIService
        from app.modules.search import SearchService

        case_id = self.params.get("case_id")
        law_ids = self.params.get("law_ids")
        top_k = self.params.get("top_k", 5)
        self._step_start_time = time.monotonic()
        await self._log_step(f"开始案例比对: case_id={case_id}")

        case_doc = await SearchService.get_case_by_id(case_id)
        if not case_doc:
            raise ValueError(f"案例不存在: {case_id}")

        case_content = case_doc.get("content", "")
        await self._log_step("案例数据加载完成")

        if law_ids:
            laws = []
            for law_id in law_ids:
                law_doc = await SearchService.get_law_by_id(law_id)
                if law_doc:
                    laws.append(law_doc)
        else:
            laws = await SearchService.find_similar_laws(case_content, top_k=top_k * 2)
            if not laws:
                await self._log_step("未找到相关法条", level="warning")
                return {"case_id": case_id, "total_matched": 0, "matched_laws": []}

        await self._log_step(f"检索到{len(laws)}条候选法条")

        matched_laws = await AIService.compare_case_with_laws(
            case_content, laws, top_k=top_k, task_id=self.task_id
        )

        await self._log_step("AI比对完成，保存结果")

        async with get_db() as db:
            for law in matched_laws:
                try:
                    law_id_int = int(law.get("_id", 0))
                    result = ComparisonResult(
                        task_id=self.task_id,
                        case_id=case_id,
                        law_id=law_id_int,
                        similarity_score=law.get("similarity_score", 0),
                        matching_analysis=law.get("matching_analysis", ""),
                        key_points=law.get("key_points", []),
                        recommendations=law.get("recommendations", "")
                    )
                    db.add(result)
                except Exception as e:
                    log.warning(f"保存比对结果失败: {str(e)}")
            await db.commit()

        await self._log_step(f"案例比对完成: 匹配{len(matched_laws)}条法条", details={
            "matched_count": len(matched_laws),
            "top_score": matched_laws[0].get("similarity_score", 0) if matched_laws else 0
        })

        return {
            "case_id": case_id,
            "total_matched": len(matched_laws),
            "matched_laws": [
                {
                    "law_id": law.get("_id"),
                    "title": law.get("title"),
                    "similarity_score": law.get("similarity_score")
                }
                for law in matched_laws
            ]
        }


class CompareBatchTask(BaseTask):
    async def execute(self) -> Dict[str, Any]:
        from app.modules.ai import AIService
        from app.modules.search import SearchService

        case_ids = self.params.get("case_ids", [])
        law_ids = self.params.get("law_ids")
        top_k = self.params.get("top_k", 5)
        total = len(case_ids)
        self._step_start_time = time.monotonic()
        await self._log_step(f"开始批量案例比对: 共{total}个案例")

        completed = 0
        failed = 0
        results = []
        scores = []

        semaphore = asyncio.Semaphore(2)

        async def process_single(case_id):
            async with semaphore:
                if self._cancelled:
                    return None
                try:
                    case_doc = await SearchService.get_case_by_id(case_id)
                    if not case_doc:
                        return None

                    case_content = case_doc.get("content", "")

                    if law_ids:
                        laws = []
                        for lid in law_ids:
                            law_doc = await SearchService.get_law_by_id(lid)
                            if law_doc:
                                laws.append(law_doc)
                    else:
                        laws = await SearchService.find_similar_laws(case_content, top_k=top_k * 2)

                    if not laws:
                        return {"case_id": case_id, "matched_count": 0, "avg_score": 0}

                    matched_laws = await AIService.compare_case_with_laws(
                        case_content, laws, top_k=top_k, task_id=self.task_id
                    )

                    async with get_db() as db:
                        for law in matched_laws:
                            try:
                                law_id_int = int(law.get("_id", 0))
                                cr = ComparisonResult(
                                    task_id=self.task_id,
                                    case_id=case_id,
                                    law_id=law_id_int,
                                    similarity_score=law.get("similarity_score", 0),
                                    matching_analysis=law.get("matching_analysis", ""),
                                    key_points=law.get("key_points", []),
                                    recommendations=law.get("recommendations", "")
                                )
                                db.add(cr)
                            except Exception:
                                pass
                        await db.commit()

                    avg_score = sum(l.get("similarity_score", 0) for l in matched_laws) / max(len(matched_laws), 1)
                    return {
                        "case_id": case_id,
                        "matched_count": len(matched_laws),
                        "avg_score": avg_score,
                        "matched_laws": [{"law_id": l.get("_id"), "score": l.get("similarity_score")} for l in matched_laws]
                    }
                except Exception as e:
                    log.error(f"案例比对失败 case_id={case_id}: {str(e)}")
                    return None

        tasks = [process_single(cid) for cid in case_ids]

        for i, task in enumerate(asyncio.as_completed(tasks), 1):
            if self._cancelled:
                for t in tasks:
                    if not t.done():
                        t.cancel()
                break
            try:
                result = await asyncio.wait_for(task, timeout=120)
                if result:
                    results.append(result)
                    completed += 1
                    scores.append(result["avg_score"])
                else:
                    failed += 1
            except asyncio.TimeoutError:
                failed += 1
                log.warning(f"案例比对超时")
            except Exception as e:
                failed += 1
                log.error(f"案例比对异常: {str(e)}")

            await self._update_progress(completed, total, failed)

        avg_score = int(sum(scores) / len(scores)) if scores else 0

        await self._log_step(f"批量比对完成: 成功{completed}, 失败{failed}", details={
            "completed": completed, "failed": failed, "avg_score": avg_score
        })

        return {
            "total": total,
            "completed": completed,
            "failed": failed,
            "avg_similarity_score": avg_score,
            "results": results[:100]
        }


class InterpretLawTask(BaseTask):
    async def execute(self) -> Dict[str, Any]:
        from app.modules.ai import AIService

        law_title = self.params.get("law_title", "")
        law_content = self.params.get("law_content", "")
        article_no = self.params.get("article_no", "")
        interpretation_depth = self.params.get("interpretation_depth", "standard")

        self._step_start_time = time.monotonic()
        await self._log_step(f"开始法条智能释义: {law_title} {article_no}")

        result = await AIService.interpret_law(
            law_title=law_title,
            law_content=law_content,
            article_no=article_no,
            interpretation_depth=interpretation_depth,
            task_id=self.task_id
        )

        await self._log_step(f"法条释义{'成功' if result.get('success') else '失败'}: {law_title}", details={
            "law_title": law_title, "success": result.get("success", False)
        })

        return result


class RewriteCaseTask(BaseTask):
    async def execute(self) -> Dict[str, Any]:
        from app.modules.ai import AIService

        case_content = self.params.get("case_content", "")
        rewrite_type = self.params.get("rewrite_type", "simplify")
        target_audience = self.params.get("target_audience", "general")
        custom_requirements = self.params.get("custom_requirements", "")

        self._step_start_time = time.monotonic()
        await self._log_step(f"开始案例改写: 类型={rewrite_type}, 受众={target_audience}")

        result = await AIService.rewrite_case(
            case_content=case_content,
            rewrite_type=rewrite_type,
            target_audience=target_audience,
            custom_requirements=custom_requirements,
            task_id=self.task_id
        )

        await self._log_step(f"案例改写{'成功' if result.get('success') else '失败'}", details={
            "rewrite_type": rewrite_type, "success": result.get("success", False),
            "original_length": result.get("original_length", 0),
            "rewritten_length": result.get("rewritten_length", 0)
        })

        return result


class TaskFactory:
    _task_map = {
        TaskType.PARSE_DOCUMENT: ParseDocumentTask,
        TaskType.PARSE_BATCH: ParseBatchTask,
        TaskType.INDEX_LAW: IndexLawTask,
        TaskType.INDEX_CASE: IndexLawTask,
        TaskType.INDEX_BATCH: IndexBatchTask,
        TaskType.COMPARE_CASE: CompareCaseTask,
        TaskType.COMPARE_BATCH: CompareBatchTask,
        TaskType.INTERPRET_LAW: InterpretLawTask,
        TaskType.REWRITE_CASE: RewriteCaseTask,
    }

    @classmethod
    def create_task(cls, task_type: str, task_id: int, params: Dict[str, Any]) -> BaseTask:
        task_class = cls._task_map.get(task_type)
        if not task_class:
            raise ValueError(f"不支持的任务类型: {task_type}")
        return task_class(task_id, params, task_type)


class AsyncTaskQueue:
    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers
        self._queue: deque = deque()
        self._active_tasks: Dict[int, asyncio.Task] = {}
        self._task_objects: Dict[int, BaseTask] = {}
        self._task_start_times: Dict[int, datetime] = {}
        self._running = False
        self._lock = asyncio.Lock()
        self._wake_event = asyncio.Event()

    async def start(self):
        if self._running:
            return
        self._running = True
        log.info(f"任务队列已启动，最大并发数: {self.max_workers}")
        asyncio.create_task(self._process_queue())
        asyncio.create_task(self._watchdog())

    async def stop(self):
        self._running = False
        self._wake_event.set()
        for task in list(self._active_tasks.values()):
            if not task.done():
                task.cancel()
        self._active_tasks.clear()
        self._task_objects.clear()
        self._task_start_times.clear()
        log.info("任务队列已停止")

    async def submit(self, task_type: str, task_id: int, params: Dict[str, Any]) -> bool:
        try:
            async with self._lock:
                if any(tid == task_id for tid, _ in self._queue) or task_id in self._active_tasks:
                    log.warning(f"任务已存在，跳过提交: task_id={task_id}")
                    return True

                task_obj = TaskFactory.create_task(task_type, task_id, params)
                self._queue.append((task_id, task_obj, task_type))

                async with get_db() as db:
                    result = await db.execute(select(Task).where(Task.id == task_id))
                    task = result.scalar_one_or_none()
                    if task:
                        task.status = TaskStatus.QUEUED
                        await db.commit()

            self._wake_event.set()
            log.info(f"任务已加入队列: task_id={task_id}, type={task_type}, 队列长度={len(self._queue)}")
            return True
        except Exception as e:
            log.error(f"任务提交失败: {str(e)}")
            return False

    async def cancel(self, task_id: int) -> bool:
        async with self._lock:
            if task_id in self._task_objects:
                self._task_objects[task_id].cancel()

            if task_id in self._active_tasks:
                self._active_tasks[task_id].cancel()
                self._active_tasks.pop(task_id, None)
                self._task_objects.pop(task_id, None)
                self._task_start_times.pop(task_id, None)

            original_len = len(self._queue)
            self._queue = deque([item for item in self._queue if item[0] != task_id])
            removed = original_len - len(self._queue)

            async with get_db() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()
                if task:
                    task.status = TaskStatus.CANCELLED
                    await db.commit()

        log.info(f"任务已取消: task_id={task_id}, 从队列移除={removed}")
        return True

    async def _process_queue(self):
        while self._running:
            try:
                async with self._lock:
                    while self._queue and len(self._active_tasks) < self.max_workers:
                        task_id, task_obj, task_type = self._queue.popleft()
                        asyncio.create_task(self._execute_task(task_id, task_obj, task_type))

                if not self._queue or len(self._active_tasks) >= self.max_workers:
                    self._wake_event.clear()
                    await asyncio.wait_for(self._wake_event.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                log.error(f"任务队列处理异常: {str(e)}")
                await asyncio.sleep(1)

    async def _watchdog(self):
        while self._running:
            try:
                now = datetime.utcnow()
                timed_out_tasks = []

                async with self._lock:
                    for task_id, start_time in list(self._task_start_times.items()):
                        if task_id in self._task_objects:
                            timeout = self._task_objects[task_id].get_timeout()
                            elapsed = (now - start_time).total_seconds()
                            if elapsed > timeout:
                                timed_out_tasks.append(task_id)

                for task_id in timed_out_tasks:
                    log.warning(f"任务执行超时，正在取消: task_id={task_id}")
                    await self._handle_timeout(task_id)

                await asyncio.sleep(5)
            except Exception as e:
                log.error(f"看门狗异常: {str(e)}")
                await asyncio.sleep(5)

    async def _handle_timeout(self, task_id: int):
        async with self._lock:
            if task_id in self._active_tasks:
                self._active_tasks[task_id].cancel()
                self._active_tasks.pop(task_id, None)
                self._task_objects.pop(task_id, None)
                self._task_start_times.pop(task_id, None)

            async with get_db() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()
                if task:
                    task.status = TaskStatus.TIMEOUT
                    task.error_message = "任务执行超时"
                    await db.commit()

    async def _execute_task(self, task_id: int, task_obj: BaseTask, task_type: str):
        async with self._lock:
            self._task_objects[task_id] = task_obj
            self._task_start_times[task_id] = datetime.utcnow()

        task_coro = asyncio.create_task(task_obj.execute())
        self._active_tasks[task_id] = task_coro

        try:
            async with get_db() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()
                if task:
                    task.status = TaskStatus.RUNNING
                    task.started_at = datetime.utcnow()
                    await db.commit()

            log.info(f"开始执行任务: task_id={task_id}, type={task_type}")
            await TaskLogService.add_log_safe(task_id, "info", f"任务开始执行: {task_type}")

            task_result = await asyncio.wait_for(task_coro, timeout=task_obj.get_timeout())

            async with get_db() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()
                if task:
                    task.status = TaskStatus.COMPLETED
                    task.progress = 100
                    task.completed_at = datetime.utcnow()
                    task.result_summary = task_result
                    if isinstance(task_result, dict):
                        if "total" in task_result:
                            task.total = task_result["total"]
                        if "completed" in task_result:
                            task.completed = task_result["completed"]
                        if "failed" in task_result:
                            task.failed = task_result["failed"]
                    await db.commit()

            log.info(f"任务完成: task_id={task_id}, type={task_type}")
            await TaskLogService.add_log_safe(task_id, "info", "任务执行完成", details={"result": "success"})

        except asyncio.CancelledError:
            log.info(f"任务已取消: task_id={task_id}")
            async with get_db() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()
                if task:
                    task.status = TaskStatus.CANCELLED
                    await db.commit()
            await TaskLogService.add_log_safe(task_id, "warning", "任务被取消")

        except asyncio.TimeoutError:
            log.warning(f"任务超时: task_id={task_id}")
            async with get_db() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()
                if task:
                    task.status = TaskStatus.TIMEOUT
                    task.error_message = "任务执行超时"
                    await db.commit()
            await TaskLogService.add_log_safe(task_id, "error", "任务执行超时")

        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)
            log.error(f"任务执行失败 task_id={task_id}: {str(e)}")

            should_retry = task_obj.is_retryable(e)

            async with get_db() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()
                if task:
                    current_retry = task.retry_count or 0
                    max_retries = task.max_retries or MAX_RETRIES_DEFAULT

                    if should_retry and current_retry < max_retries:
                        task.retry_count = current_retry + 1
                        task.status = TaskStatus.RETRYING
                        task.error_message = f"[重试{current_retry + 1}/{max_retries}] {error_msg[:400]}"
                        await db.commit()

                        await TaskLogService.add_log_safe(
                            task_id, "warning",
                            f"任务失败，准备重试 ({current_retry + 1}/{max_retries})",
                            details={"error_type": error_type, "error": error_msg[:500], "retry": current_retry + 1}
                        )

                        retry_delay = min(RETRY_BACKOFF_BASE ** current_retry, 60)
                        log.info(f"任务将在{retry_delay}秒后重试: task_id={task_id}, 第{current_retry + 1}次重试")
                        await asyncio.sleep(retry_delay)

                        async with self._lock:
                            new_task_obj = TaskFactory.create_task(task_type, task_id, task.params)
                            self._task_objects[task_id] = new_task_obj
                            self._task_start_times[task_id] = datetime.utcnow()

                        retry_coro = asyncio.create_task(new_task_obj.execute())
                        self._active_tasks[task_id] = retry_coro

                        try:
                            retry_result = await asyncio.wait_for(retry_coro, timeout=new_task_obj.get_timeout())

                            async with get_db() as db2:
                                result2 = await db2.execute(select(Task).where(Task.id == task_id))
                                task2 = result2.scalar_one_or_none()
                                if task2:
                                    task2.status = TaskStatus.COMPLETED
                                    task2.progress = 100
                                    task2.completed_at = datetime.utcnow()
                                    task2.result_summary = retry_result
                                    task2.error_message = None
                                    await db2.commit()

                            log.info(f"任务重试成功: task_id={task_id}")
                            await TaskLogService.add_log_safe(task_id, "info", f"任务重试成功 (第{current_retry + 1}次重试)")

                        except Exception as retry_error:
                            async with get_db() as db2:
                                result2 = await db2.execute(select(Task).where(Task.id == task_id))
                                task2 = result2.scalar_one_or_none()
                                if task2:
                                    task2.retry_count = current_retry + 1
                                    if current_retry + 1 >= max_retries:
                                        task2.status = TaskStatus.FAILED
                                        task2.error_message = f"重试{max_retries}次后仍失败: {str(retry_error)[:400]}"
                                    else:
                                        task2.status = TaskStatus.FAILED
                                        task2.error_message = f"重试失败: {str(retry_error)[:400]}"
                                    await db2.commit()

                            log.error(f"任务重试失败: task_id={task_id}, {str(retry_error)}")
                            await TaskLogService.add_log_safe(
                                task_id, "error",
                                f"任务重试失败: {str(retry_error)[:500]}",
                                details={"retry_attempt": current_retry + 1}
                            )
                    else:
                        task.status = TaskStatus.FAILED
                        task.error_message = error_msg[:500]
                        if not should_retry:
                            task.error_message = f"[不可重试] {error_msg[:400]}"
                        await db.commit()

                        await TaskLogService.add_log_safe(
                            task_id, "error",
                            f"任务最终失败: {error_type}",
                            details={"error_type": error_type, "error": error_msg[:500], "retryable": should_retry}
                        )

        finally:
            async with self._lock:
                self._active_tasks.pop(task_id, None)
                self._task_objects.pop(task_id, None)
                self._task_start_times.pop(task_id, None)
            self._wake_event.set()

    def get_active_count(self) -> int:
        return len(self._active_tasks)

    def get_queued_count(self) -> int:
        return len(self._queue)

    def is_active(self, task_id: int) -> bool:
        return task_id in self._active_tasks


task_queue = AsyncTaskQueue(max_workers=settings.TASK_MAX_WORKERS)


class TaskService:
    @staticmethod
    async def create_task(
        db,
        name: str,
        task_type: str,
        params: Dict[str, Any],
        creator_id: int,
        max_retries: int = MAX_RETRIES_DEFAULT
    ) -> Task:
        task = Task(
            name=name,
            task_type=task_type,
            status=TaskStatus.PENDING,
            params=params,
            creator_id=creator_id,
            max_retries=max_retries
        )

        if task_type in [TaskType.COMPARE_BATCH, TaskType.PARSE_BATCH, TaskType.INDEX_BATCH]:
            if task_type == TaskType.COMPARE_BATCH and "case_ids" in params:
                task.total = len(params["case_ids"])
            elif task_type == TaskType.PARSE_BATCH and "document_ids" in params:
                task.total = len(params["document_ids"])
            elif task_type == TaskType.INDEX_BATCH:
                task.total = len(params.get("law_ids", [])) + len(params.get("case_ids", []))

        db.add(task)
        await db.commit()
        await db.refresh(task)

        await task_queue.submit(task_type, task.id, params)

        log.info(f"任务创建成功: task_id={task.id}, type={task_type}")
        return task

    @staticmethod
    async def get_task(db, task_id: int) -> Optional[Task]:
        from sqlalchemy.orm import selectinload
        from sqlalchemy import select

        result = await db.execute(
            select(Task)
            .options(selectinload(Task.results))
            .where(Task.id == task_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_tasks(
        db,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        task_type: Optional[str] = None,
        creator_id: Optional[int] = None
    ):
        from sqlalchemy import select, func

        query = select(Task)

        if status:
            query = query.where(Task.status == status)
        if task_type:
            query = query.where(Task.task_type == task_type)
        if creator_id:
            query = query.where(Task.creator_id == creator_id)

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar()

        result = await db.execute(query.offset(skip).limit(limit).order_by(Task.id.desc()))
        tasks = result.scalars().all()
        return tasks, total

    @staticmethod
    async def cancel_task(db, task_id: int) -> bool:
        task = await TaskService.get_task(db, task_id)
        if not task:
            raise ValueError("任务不存在")

        if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.TIMEOUT]:
            raise ValueError(f"无法取消已{task.status}的任务")

        return await task_queue.cancel(task_id)

    @staticmethod
    async def get_task_results(db, task_id: int, skip: int = 0, limit: int = 100):
        from sqlalchemy import select, func
        from app.models import ComparisonResult, Law, Case

        query = select(ComparisonResult).where(ComparisonResult.task_id == task_id)
        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar()

        result = await db.execute(
            query.offset(skip).limit(limit).order_by(ComparisonResult.similarity_score.desc())
        )
        results = result.scalars().all()

        result_list = []
        for res in results:
            law_result = await db.execute(select(Law).where(Law.id == res.law_id))
            law = law_result.scalar_one_or_none()
            case_result = await db.execute(select(Case).where(Case.id == res.case_id))
            case = case_result.scalar_one_or_none()

            result_list.append({
                "id": res.id,
                "case_id": res.case_id,
                "case_title": case.title if case else "",
                "law_id": res.law_id,
                "law_title": law.title if law else "",
                "law_article_no": law.article_no if law else "",
                "similarity_score": res.similarity_score,
                "matching_analysis": res.matching_analysis,
                "key_points": res.key_points,
                "recommendations": res.recommendations,
                "created_at": res.created_at.isoformat() if res.created_at else None
            })

        return result_list, total

    @staticmethod
    async def get_task_logs(db, task_id: int, skip: int = 0, limit: int = 100):
        return await TaskLogService.get_logs(db, task_id, skip=skip, limit=limit)

    @staticmethod
    def get_queue_status() -> Dict[str, Any]:
        return {
            "active_count": task_queue.get_active_count(),
            "queued_count": task_queue.get_queued_count(),
            "max_workers": task_queue.max_workers
        }
