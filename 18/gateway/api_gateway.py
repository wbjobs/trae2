import logging
import uuid
import time
import httpx
import asyncio
import signal
from typing import List, Optional, Dict, Any, Set
from collections import defaultdict
from concurrent.futures import TimeoutError as FuturesTimeoutError
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from starlette import status
from config import settings
from database import get_db, SessionLocal, BatchTaskDB
from modules import (
    document_parser,
    semantic_extractor,
    classification_store,
    ai_client,
    highlight_extractor,
    feedback_system,
)
from models import (
    Document,
    DocumentCreate,
    DocumentContent,
    HighlightInfo,
    StoredDocument,
    BatchProcessRequest,
    BatchProcessResponse,
    ProcessStatus,
    QueryRequest,
    QueryResult,
    ExternalSystemCall,
    ExternalSystemResponse,
    ClassificationFeedback,
    ClassificationFeedbackResponse,
    ExtractHighlightsRequest,
    UpdateClassificationRequest,
    PerformanceMetrics,
    BatchStatusResponse,
    ApiResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix=settings.API_V1_STR)


class PerformanceMonitor:
    """性能监控器"""

    def __init__(self):
        self._metrics: Dict[str, List[float]] = defaultdict(list)
        self._start_times: Dict[str, float] = {}
        self._total_requests = 0
        self._error_count = 0

    def start_timer(self, operation: str) -> str:
        timer_id = f"{operation}_{uuid.uuid4().hex[:8]}"
        self._start_times[timer_id] = time.time()
        return timer_id

    def end_timer(self, timer_id: str, success: bool = True):
        if timer_id not in self._start_times:
            return

        duration = (time.time() - self._start_times[timer_id]) * 1000
        operation = timer_id.rsplit('_', 1)[0]
        self._metrics[operation].append(duration)
        self._total_requests += 1

        if not success:
            self._error_count += 1

        if len(self._metrics[operation]) > 1000:
            self._metrics[operation] = self._metrics[operation][-500:]

        del self._start_times[timer_id]
        return duration

    def get_metrics(self) -> PerformanceMetrics:
        db = SessionLocal()
        try:
            from database import DocumentDB

            total_processed = db.query(DocumentDB).filter(
                DocumentDB.status == "completed"
            ).count()

            cache_stats = {}
            if settings.ENABLE_CACHE:
                try:
                    from modules import ai_cache
                    cache_stats = ai_cache.get_stats()
                except Exception:
                    pass

            error_rate = self._error_count / max(self._total_requests, 1)

            all_durations = []
            for op_durations in self._metrics.values():
                all_durations.extend(op_durations)

            avg_time = sum(all_durations) / max(len(all_durations), 1) / 1000

            return PerformanceMetrics(
                total_documents_processed=total_processed,
                avg_processing_time=round(avg_time, 3),
                throughput=round(total_processed / max((time.time() - (time.time() - 3600)), 1), 2),
                cache_hit_rate=float(cache_stats.get("memory_cache", {}).get("hit_rate", "0%").rstrip("%")),
                ai_request_count=self._total_requests,
                ai_retry_count=0,
                error_rate=round(error_rate, 4)
            )
        finally:
            db.close()


perf_monitor = PerformanceMonitor()


class TaskManager:
    """任务管理器 - 处理断点续传、异常隔离、并发控制"""

    def __init__(self):
        self._active_tasks: Set[str] = set()
        self._task_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._shutdown_flag = asyncio.Event()
        self._max_concurrent = getattr(settings, 'MAX_CONCURRENT_TASKS', 20)
        self._task_timeout = getattr(settings, 'TASK_TIMEOUT', 600)
        self._pause_between_docs = getattr(settings, 'PAUSE_BETWEEN_DOCS', 0.05)
        self._worker_count = getattr(settings, 'BATCH_WORKER_COUNT', 4)
        logger.info(
            f"任务管理器初始化完成, 最大并发: {self._max_concurrent}, "
            f"工作线程: {self._worker_count}"
        )

    async def acquire_task(self, task_id: str) -> bool:
        """获取任务执行权"""
        if len(self._active_tasks) >= self._max_concurrent:
            logger.warning(f"并发任务数已达上限: {len(self._active_tasks)}/{self._max_concurrent}")
            return False

        if task_id in self._active_tasks:
            logger.warning(f"任务已在执行中: {task_id}")
            return False

        self._active_tasks.add(task_id)
        return True

    def release_task(self, task_id: str):
        """释放任务执行权"""
        self._active_tasks.discard(task_id)

    def is_shutdown(self) -> bool:
        """检查是否收到关闭信号"""
        return self._shutdown_flag.is_set()

    async def graceful_shutdown(self):
        """优雅关闭"""
        logger.info(f"任务管理器开始关闭，等待 {len(self._active_tasks)} 个任务完成...")
        self._shutdown_flag.set()

        deadline = time.time() + 30
        while self._active_tasks and time.time() < deadline:
            await asyncio.sleep(1)

        if self._active_tasks:
            logger.warning(f"强制关闭，仍有 {len(self._active_tasks)} 个任务未完成")
            self._active_tasks.clear()

        logger.info("任务管理器关闭完成")


task_manager = TaskManager()


def signal_handler(signum, frame):
    """信号处理器"""
    logger.info(f"收到信号: {signum}")
    task_manager._shutdown_flag.set()


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def create_db_session():
    """创建独立的数据库会话"""
    return SessionLocal()


async def process_single_document(
    document_id: int,
    file_path: str,
    file_type: str,
    skip_classification: bool = False,
    skip_embedding: bool = False,
    skip_highlights: bool = False
) -> bool:
    """处理单个文档的完整流程（带异常隔离和性能监控）"""
    timer_id = perf_monitor.start_timer("process_single")
    db = create_db_session()

    try:
        if task_manager.is_shutdown():
            logger.info(f"任务管理器已关闭，跳过文档: {document_id}")
            return False

        classification_store.update_document_status(db, document_id, "processing")

        parse_timer = perf_monitor.start_timer("parse_document")
        raw_text, metadata = document_parser.parse_document(file_path, file_type)
        perf_monitor.end_timer(parse_timer)

        if not raw_text:
            raise Exception("文档解析失败，未能提取文本内容")

        cleaned_text = document_parser.clean_text(raw_text)
        page_count = metadata.get("page_count") if metadata else None
        paragraph_count = len([p for p in cleaned_text.split('\n\n') if p.strip()])

        content = DocumentContent(
            document_id=document_id,
            raw_text=raw_text,
            cleaned_text=cleaned_text,
            page_count=page_count,
            paragraph_count=paragraph_count,
            metadata=metadata
        )
        classification_store.save_document_content(db, content)

        if task_manager.is_shutdown():
            logger.info(f"任务管理器已关闭，文档 {document_id} 已保存解析内容，终止后续处理")
            classification_store.update_document_status(db, document_id, "paused")
            return False

        semantic_timer = perf_monitor.start_timer("semantic_extract")
        semantic_features = await semantic_extractor.extract(
            document_id=document_id,
            text=cleaned_text or raw_text,
            extract_embedding=not skip_embedding
        )
        perf_monitor.end_timer(semantic_timer)

        classification_store.save_semantic_features(db, semantic_features)

        if not skip_highlights:
            highlight_timer = perf_monitor.start_timer("highlight_extract")
            highlights_data = await highlight_extractor.extract_highlights(
                document_id=document_id,
                text=cleaned_text or raw_text,
                summary=semantic_features.summary,
                keywords=semantic_features.keywords
            )
            perf_monitor.end_timer(highlight_timer)

            highlight_info = HighlightInfo(
                document_id=document_id,
                key_paragraphs=highlights_data.get("key_paragraphs", []),
                key_sentences=highlights_data.get("key_sentences", []),
                important_terms=highlights_data.get("important_terms", []),
                title_highlights=highlights_data.get("title_highlights", []),
                confidence_scores=highlights_data.get("confidence_scores", {}),
                extract_time=time.strftime("%Y-%m-%dT%H:%M:%S")
            )
            classification_store.save_highlights(db, highlight_info)

        if not skip_classification:
            class_timer = perf_monitor.start_timer("classification")
            classification, error = await classification_store.classify_document(
                text=cleaned_text or raw_text,
                keywords=semantic_features.keywords,
                summary=semantic_features.summary
            )
            perf_monitor.end_timer(class_timer, success=error is None)

            if classification:
                classification.document_id = document_id
                classification_store.save_classification_result(db, classification)

        classification_store.update_document_status(db, document_id, "completed")
        perf_monitor.end_timer(timer_id, success=True)
        logger.info(f"文档处理完成: ID={document_id}")
        return True

    except Exception as e:
        error_msg = f"文档处理失败: {str(e)}"
        logger.error(error_msg)
        perf_monitor.end_timer(timer_id, success=False)
        try:
            classification_store.update_document_status(db, document_id, "failed", error_msg)
        except Exception as db_error:
            logger.error(f"更新文档状态失败: {db_error}")
        return False
    finally:
        db.close()


async def process_batch_documents(
    task_id: str,
    document_ids: List[int],
    skip_classification: bool = False,
    skip_embedding: bool = False,
    skip_highlights: bool = False
):
    """批量处理文档（优化版：工作池、并发控制、吞吐量监控）"""
    from datetime import datetime

    if not await task_manager.acquire_task(task_id):
        logger.warning(f"无法获取任务执行权: {task_id}")
        return

    db = create_db_session()
    start_time = time.time()

    try:
        classification_store.update_batch_task(
            db, task_id, "processing", start_time=datetime.now()
        )

        pending_ids = []
        for doc_id in document_ids:
            doc = classification_store.get_document(db, doc_id)
            if not doc:
                continue
            if doc.document_info.status == "completed":
                continue
            pending_ids.append(doc_id)

        if not pending_ids:
            classification_store.update_batch_task(
                db, task_id, "completed",
                processed_count=len(document_ids),
                failed_count=0,
                end_time=datetime.now()
            )
            logger.info(f"批量任务已全部完成: {task_id}")
            return

        processed_count = sum(1 for doc_id in document_ids if doc_id not in pending_ids)
        failed_count = 0
        error_details = []
        processing_times = []

        semaphore = asyncio.Semaphore(task_manager._worker_count)

        async def process_with_semaphore(doc_id: int) -> bool:
            async with semaphore:
                doc = classification_store.get_document(db, doc_id)
                if not doc:
                    return False
                return await process_single_document(
                    document_id=doc_id,
                    file_path=doc.document_info.file_path,
                    file_type=doc.document_info.file_type,
                    skip_classification=skip_classification,
                    skip_embedding=skip_embedding,
                    skip_highlights=skip_highlights
                )

        batch_size = task_manager._worker_count * 2

        for i in range(0, len(pending_ids), batch_size):
            if task_manager.is_shutdown():
                logger.info(f"收到关闭信号，保存进度并退出")
                error_details.append("任务被中断，等待恢复")
                classification_store.update_batch_task(
                    db, task_id, "paused",
                    processed_count=processed_count,
                    failed_count=failed_count,
                    error_details=error_details
                )
                break

            batch = pending_ids[i:i + batch_size]
            doc_start_time = time.time()

            tasks = [process_with_semaphore(doc_id) for doc_id in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, Exception):
                    failed_count += 1
                    error_details.append(str(result))
                elif result:
                    processed_count += 1
                else:
                    failed_count += 1

            batch_time = time.time() - doc_start_time
            processing_times.append(batch_time / len(batch))

            throughput = len(batch) / batch_time if batch_time > 0 else 0
            avg_time = sum(processing_times) / len(processing_times)

            classification_store.update_batch_task(
                db, task_id, "processing",
                processed_count=processed_count,
                failed_count=failed_count
            )

            logger.debug(
                f"批量进度: {processed_count}/{len(pending_ids)}, "
                f"吞吐量: {throughput:.2f} doc/s, "
                f"平均: {avg_time:.3f} s/doc"
            )

            await asyncio.sleep(task_manager._pause_between_docs)

        if not task_manager.is_shutdown():
            total_time = time.time() - start_time
            throughput = processed_count / total_time if total_time > 0 else 0
            avg_processing_time = total_time / max(processed_count, 1)

            final_status = "completed" if failed_count == 0 else "completed_with_errors"
            classification_store.update_batch_task(
                db, task_id, final_status,
                processed_count=processed_count,
                failed_count=failed_count,
                error_details=error_details if error_details else None,
                end_time=datetime.now(),
                throughput=throughput,
                avg_processing_time=avg_processing_time
            )

            logger.info(
                f"批量任务结束: 任务ID={task_id}, "
                f"成功={processed_count}, 失败={failed_count}, "
                f"吞吐量={throughput:.2f} doc/s, "
                f"状态={final_status}"
            )

    except Exception as e:
        logger.error(f"批量任务执行失败: {task_id}, 错误={str(e)}")
        try:
            classification_store.update_batch_task(
                db, task_id, "failed",
                error_details=[f"批量任务执行失败: {str(e)}"],
                end_time=datetime.now()
            )
        except Exception:
            pass
    finally:
        db.close()
        task_manager.release_task(task_id)


def api_response(data: Any = None, message: str = "success", code: int = 200) -> Dict[str, Any]:
    """统一API响应格式"""
    return {
        "success": code < 400,
        "code": code,
        "message": message,
        "data": data,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S")
    }


@router.post("/documents/upload", response_model=Dict)
async def upload_document(
    file: UploadFile = File(...),
    priority: int = Query(0, description="处理优先级"),
    db: Session = Depends(get_db)
):
    """上传文档"""
    timer_id = perf_monitor.start_timer("upload_document")

    try:
        import os
        import aiofiles

        filename = file.filename or ""
        file_size = 0
        ext = os.path.splitext(filename)[1].lower()

        valid, error = document_parser.validate_file(filename, file_size)
        if not valid:
            raise HTTPException(status_code=400, detail=error)

        file_id = str(uuid.uuid4())
        saved_filename = f"{file_id}{ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, saved_filename)

        async with aiofiles.open(file_path, 'wb') as out_file:
            while content := await file.read(1024 * 1024):
                file_size += len(content)
                await out_file.write(content)

        valid, error = document_parser.validate_file(filename, file_size)
        if not valid:
            os.remove(file_path)
            raise HTTPException(status_code=400, detail=error)

        file_type = ext.lstrip(".")
        doc_create = DocumentCreate(
            filename=filename,
            file_type=file_type,
            file_size=file_size,
            file_path=file_path,
            priority=priority
        )

        db_doc = classification_store.create_document(db, doc_create)

        perf_monitor.end_timer(timer_id, success=True)
        logger.info(f"文档上传成功: ID={db_doc.id}, 文件名={filename}")

        return api_response(
            data=Document(
                id=db_doc.id,
                filename=db_doc.filename,
                file_type=db_doc.file_type,
                file_size=db_doc.file_size,
                file_path=db_doc.file_path,
                upload_time=db_doc.upload_time,
                status=db_doc.status,
                error_message=db_doc.error_message,
                priority=db_doc.priority
            ),
            message="文档上传成功"
        )

    except HTTPException:
        perf_monitor.end_timer(timer_id, success=False)
        raise
    except Exception as e:
        perf_monitor.end_timer(timer_id, success=False)
        logger.error(f"文档上传失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"文档上传失败: {str(e)}")


@router.post("/documents/{document_id}/process", response_model=Dict)
async def process_document(
    document_id: int,
    background_tasks: BackgroundTasks,
    skip_classification: bool = Query(False, description="是否跳过分类"),
    skip_embedding: bool = Query(False, description="是否跳过向量生成"),
    skip_highlights: bool = Query(False, description="是否跳过高亮提取"),
    db: Session = Depends(get_db)
):
    """处理单个文档"""
    doc = classification_store.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if doc.document_info.status in ["processing"]:
        raise HTTPException(status_code=400, detail="文档正在处理中，请稍后查看结果")

    if doc.document_info.status == "completed":
        return api_response(data=doc.document_info, message="文档已处理完成")

    if doc.document_info.status == "failed":
        logger.info(f"重新处理失败的文档: {document_id}")

    background_tasks.add_task(
        process_single_document,
        document_id=document_id,
        file_path=doc.document_info.file_path,
        file_type=doc.document_info.file_type,
        skip_classification=skip_classification,
        skip_embedding=skip_embedding,
        skip_highlights=skip_highlights
    )

    classification_store.update_document_status(db, document_id, "processing")

    updated_doc = classification_store.get_document(db, document_id)
    return api_response(data=updated_doc.document_info, message="文档处理任务已启动")


@router.post("/documents/{document_id}/highlights", response_model=Dict)
async def extract_document_highlights(
    document_id: int,
    request: ExtractHighlightsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """提取文档高亮信息"""
    doc = classification_store.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if not doc.content:
        raise HTTPException(status_code=400, detail="文档内容尚未解析，请先处理文档")

    if doc.highlights:
        return api_response(data=doc.highlights, message="高亮信息已存在")

    async def extract_and_save():
        db_local = create_db_session()
        try:
            highlights_data = await highlight_extractor.extract_highlights(
                document_id=document_id,
                text=doc.content.cleaned_text or doc.content.raw_text,
                summary=doc.semantic_features.summary if doc.semantic_features else None,
                keywords=doc.semantic_features.keywords if doc.semantic_features else None,
                max_paragraphs=request.max_paragraphs,
                max_sentences=request.max_sentences
            )

            highlight_info = HighlightInfo(
                document_id=document_id,
                key_paragraphs=highlights_data.get("key_paragraphs", []),
                key_sentences=highlights_data.get("key_sentences", []),
                important_terms=highlights_data.get("important_terms", []),
                title_highlights=highlights_data.get("title_highlights", []),
                confidence_scores=highlights_data.get("confidence_scores", {}),
                extract_time=time.strftime("%Y-%m-%dT%H:%M:%S")
            )

            classification_store.save_highlights(db_local, highlight_info)
            logger.info(f"高亮提取完成: 文档ID={document_id}")
        finally:
            db_local.close()

    background_tasks.add_task(extract_and_save)

    return api_response(message="高亮提取任务已启动")


@router.get("/documents/{document_id}/highlights", response_model=Dict)
async def get_document_highlights(
    document_id: int,
    db: Session = Depends(get_db)
):
    """获取文档高亮信息"""
    doc = classification_store.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    return api_response(data=doc.highlights)


@router.post("/documents/batch/process", response_model=Dict)
async def batch_process_documents(
    request: BatchProcessRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """批量处理文档"""
    if len(request.document_ids) > settings.BATCH_PROCESSING_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"批量处理文档数超过限制: {len(request.document_ids)} > {settings.BATCH_PROCESSING_LIMIT}"
        )

    valid_ids = []
    for doc_id in request.document_ids:
        doc = classification_store.get_document(db, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail=f"文档ID={doc_id}不存在")
        valid_ids.append(doc_id)

    task_id = f"batch_{uuid.uuid4().hex[:12]}"
    classification_store.create_batch_task(db, task_id, valid_ids)

    background_tasks.add_task(
        process_batch_documents,
        task_id=task_id,
        document_ids=valid_ids,
        skip_classification=request.skip_classification,
        skip_embedding=request.skip_embedding,
        skip_highlights=request.skip_highlights
    )

    estimated_time = len(valid_ids) * 5.0

    return api_response(
        data=BatchProcessResponse(
            task_id=task_id,
            total_count=len(valid_ids),
            status="pending",
            estimated_time=estimated_time
        ),
        message="批量处理任务已创建"
    )


@router.post("/documents/batch/{task_id}/resume", response_model=Dict)
async def resume_batch_task(
    task_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """恢复中断的批量任务"""
    task_status = classification_store.get_batch_task_status(db, task_id)
    if not task_status:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task_status.status not in ["paused", "failed", "completed_with_errors"]:
        raise HTTPException(
            status_code=400,
            detail=f"任务状态不支持恢复: {task_status.status}"
        )

    from database import BatchTaskDB
    db_task = db.query(BatchTaskDB).filter(BatchTaskDB.task_id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="任务不存在")

    pending_ids = [
        doc_id for doc_id in db_task.document_ids
        if not classification_store.get_document(db, doc_id) or
        classification_store.get_document(db, doc_id).document_info.status != "completed"
    ]

    if not pending_ids:
        return api_response(message="所有文档已处理完成", data={"task_id": task_id})

    logger.info(f"恢复批量任务: {task_id}, 待处理文档数: {len(pending_ids)}")

    background_tasks.add_task(
        process_batch_documents,
        task_id=task_id,
        document_ids=pending_ids,
        skip_classification=False,
        skip_embedding=False,
        skip_highlights=False
    )

    return api_response(
        data={"task_id": task_id, "pending_count": len(pending_ids)},
        message=f"任务已恢复，待处理 {len(pending_ids)} 个文档"
    )


@router.get("/documents/batch/status", response_model=Dict)
async def get_all_batch_status(
    db: Session = Depends(get_db)
):
    """获取所有批量任务状态汇总"""
    from database import BatchTaskDB

    pending = db.query(BatchTaskDB).filter(BatchTaskDB.status == "pending").count()
    processing = db.query(BatchTaskDB).filter(BatchTaskDB.status == "processing").count()
    completed = db.query(BatchTaskDB).filter(
        BatchTaskDB.status.in_(["completed", "completed_with_errors"])
    ).count()
    failed = db.query(BatchTaskDB).filter(BatchTaskDB.status == "failed").count()

    return api_response(data=BatchStatusResponse(
        pending_count=pending,
        processing_count=processing,
        completed_count=completed,
        failed_count=failed,
        total_tasks=pending + processing + completed + failed
    ))


@router.get("/documents/batch/{task_id}/status", response_model=Dict)
async def get_batch_process_status(
    task_id: str,
    db: Session = Depends(get_db)
):
    """获取批量处理任务状态"""
    status_info = classification_store.get_batch_task_status(db, task_id)
    if not status_info:
        raise HTTPException(status_code=404, detail="任务不存在")
    return api_response(data=status_info)


@router.get("/documents", response_model=Dict)
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    category: Optional[str] = Query(None, description="按分类过滤"),
    status: Optional[str] = Query(None, description="按状态过滤"),
    db: Session = Depends(get_db)
):
    """获取文档列表"""
    documents = classification_store.list_documents(db, skip, limit, category, status)
    total = db.query(func.count('*')).select_from(DocumentDB).scalar()

    return api_response(data={
        "items": documents,
        "total": total,
        "page": skip // limit + 1,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit
    })


@router.get("/documents/{document_id}", response_model=Dict)
async def get_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """获取文档详情"""
    doc = classification_store.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return api_response(data=doc)


@router.post("/documents/{document_id}/feedback", response_model=Dict)
async def submit_feedback(
    document_id: int,
    feedback: ClassificationFeedback,
    db: Session = Depends(get_db)
):
    """提交分类反馈"""
    doc = classification_store.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if not doc.classification:
        raise HTTPException(status_code=400, detail="文档尚未分类，无法提交反馈")

    feedback.document_id = document_id
    feedback.original_category = doc.classification.primary_category

    result = feedback_system.submit_feedback(db, feedback)
    if not result:
        raise HTTPException(status_code=500, detail="提交反馈失败")

    return api_response(data=result, message="反馈提交成功")


@router.get("/documents/{document_id}/feedback", response_model=Dict)
async def get_document_feedback(
    document_id: int,
    db: Session = Depends(get_db)
):
    """获取文档反馈"""
    feedback = feedback_system.get_document_feedback(db, document_id)
    return api_response(data=feedback)


@router.get("/feedback", response_model=Dict)
async def list_feedback(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    only_unused: bool = Query(False, description="只显示未用于训练的反馈"),
    db: Session = Depends(get_db)
):
    """获取所有反馈"""
    feedback_list = feedback_system.get_all_feedback(db, skip, limit, only_unused)
    return api_response(data=feedback_list)


@router.get("/feedback/statistics", response_model=Dict)
async def get_feedback_statistics(
    db: Session = Depends(get_db)
):
    """获取反馈统计信息"""
    stats = feedback_system.get_feedback_statistics(db)
    return api_response(data=stats)


@router.get("/feedback/suggestions", response_model=Dict)
async def get_rule_suggestions(
    db: Session = Depends(get_db)
):
    """获取规则调整建议"""
    suggestions = feedback_system.suggest_rule_adjustments(db)
    return api_response(data=suggestions)


@router.post("/documents/search", response_model=Dict)
async def search_documents(
    request: QueryRequest,
    db: Session = Depends(get_db)
):
    """语义搜索文档"""
    try:
        timer_id = perf_monitor.start_timer("semantic_search")

        query_embedding, error = await ai_client.generate_embedding(request.query)
        if error or not query_embedding:
            raise HTTPException(status_code=500, detail=f"生成查询向量失败: {error}")

        search_results = classification_store.semantic_search(
            db, query_embedding, request.top_k, request.categories
        )

        results = []
        for doc_id, score in search_results:
            doc = classification_store.get_document(db, doc_id)
            if not doc:
                continue

            if request.start_date and doc.created_at < request.start_date:
                continue
            if request.end_date and doc.created_at > request.end_date:
                continue

            if doc.classification and doc.classification.confidence < request.min_confidence:
                continue

            matched_keywords = []
            if doc.semantic_features and doc.semantic_features.keywords:
                query_words = set(request.query.lower().split())
                matched_keywords = [
                    kw for kw in doc.semantic_features.keywords
                    if kw.lower() in query_words
                ]

            highlights = []
            if doc.highlights and doc.highlights.key_sentences:
                highlights = [s.get("text", "") for s in doc.highlights.key_sentences[:3]]

            results.append(QueryResult(
                document_id=doc_id,
                filename=doc.document_info.filename,
                category=doc.classification.primary_category if doc.classification else "未分类",
                similarity_score=score,
                summary=doc.semantic_features.summary if doc.semantic_features else None,
                matched_keywords=matched_keywords,
                highlights=highlights
            ))

        perf_monitor.end_timer(timer_id, success=True)
        return api_response(data=results, message=f"找到 {len(results)} 个相关文档")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"语义搜索失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")


@router.post("/external/call", response_model=Dict)
async def call_external_system(request: ExternalSystemCall):
    """调用外部系统接口"""
    start_time = time.time()

    try:
        async with httpx.AsyncClient(timeout=request.timeout) as client:
            if request.method.upper() == "GET":
                response = await client.get(
                    request.endpoint,
                    headers=request.headers,
                    params=request.payload
                )
            elif request.method.upper() == "POST":
                response = await client.post(
                    request.endpoint,
                    headers=request.headers,
                    json=request.payload
                )
            elif request.method.upper() == "PUT":
                response = await client.put(
                    request.endpoint,
                    headers=request.headers,
                    json=request.payload
                )
            elif request.method.upper() == "DELETE":
                response = await client.delete(
                    request.endpoint,
                    headers=request.headers
                )
            else:
                raise HTTPException(status_code=400, detail=f"不支持的请求方法: {request.method}")

            response_time = time.time() - start_time

            try:
                response_data = response.json()
            except Exception:
                response_data = {"text": response.text}

            logger.info(
                f"外部系统调用完成: 系统={request.system_name}, "
                f"方法={request.method}, 状态码={response.status_code}, "
                f"耗时={response_time:.3f}s"
            )

            return api_response(data=ExternalSystemResponse(
                success=response.status_code < 400,
                status_code=response.status_code,
                response_data=response_data,
                response_time=response_time
            ))

    except httpx.TimeoutException:
        response_time = time.time() - start_time
        error_msg = f"调用外部系统超时: {request.timeout}s"
        logger.error(error_msg)
        return api_response(
            data=ExternalSystemResponse(success=False, error_message=error_msg, response_time=response_time),
            message=error_msg,
            code=504
        )
    except Exception as e:
        response_time = time.time() - start_time
        error_msg = f"调用外部系统失败: {str(e)}"
        logger.error(error_msg)
        return api_response(
            data=ExternalSystemResponse(success=False, error_message=error_msg, response_time=response_time),
            message=error_msg,
            code=500
        )


@router.get("/categories")
async def get_categories():
    """获取支持的分类列表"""
    return api_response(data={"categories": settings.DEFAULT_CATEGORIES})


@router.get("/metrics", response_model=Dict)
async def get_performance_metrics():
    """获取性能指标"""
    metrics = perf_monitor.get_metrics()
    return api_response(data=metrics)


@router.get("/cache/stats", response_model=Dict)
async def get_cache_stats():
    """获取缓存统计信息"""
    if not settings.ENABLE_CACHE:
        return api_response(data={"enabled": False})

    from modules import ai_cache
    stats = ai_cache.get_stats()
    return api_response(data=stats)


@router.get("/health")
async def health_check():
    """健康检查"""
    return api_response(data={
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "active_tasks": len(task_manager._active_tasks),
        "max_concurrent": task_manager._max_concurrent
    })


@router.post("/admin/shutdown")
async def admin_shutdown():
    """管理员触发优雅关闭"""
    asyncio.create_task(task_manager.graceful_shutdown())
    return api_response(message="正在优雅关闭，等待任务完成...")
