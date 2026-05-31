import logging
from fastapi import APIRouter, Depends, Request, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.schemas import (
    ExtractionRequest,
    ExtractionResponse,
    TaskQueryResponse,
    TaskListResponse,
    SchemaField
)
from app.models import TaskStatus, ExtractionTask
from app.crud import create_task, get_task_by_id, get_tasks, update_task_status, update_task_result
from app.core.preprocessor import preprocessor
from app.core.llm_client import llm_client
from app.core.formatter import formatter
from app.core.rate_limiter import limiter
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/extraction", tags=["信息抽取"])


@router.post(
    "/extract",
    response_model=ExtractionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="提交信息抽取任务"
)
@limiter.limit("30/minute")
async def extract(
    request: Request,
    extraction_request: ExtractionRequest,
    db: Session = Depends(get_db)
):
    task = create_task(db, extraction_request)

    try:
        update_task_status(db, task.task_id, TaskStatus.PROCESSING)

        schema_fields = [SchemaField(**f) for f in task.schema_definition]

        preprocess_result = preprocessor.preprocess(extraction_request.text, extract_keywords=True)
        cleaned_text = preprocess_result["cleaned_text"]

        if len(cleaned_text) > settings.LLM_MAX_INPUT_CHARS:
            compressed = preprocessor.compress_by_schema(
                cleaned_text, schema_fields, max_chars=settings.LLM_MAX_INPUT_CHARS
            )
            logger.info(
                f"文本压缩: {compressed['original_length']} -> {compressed['compressed_length']} "
                f"(压缩比: {compressed['compression_ratio']})"
            )
            cleaned_text = compressed["text"]

        llm_result = await llm_client.extract(cleaned_text, schema_fields)
        formatted_result = llm_result["result"]
        raw_response = llm_result["raw_response"]

        validation = formatter.validate_result(formatted_result, schema_fields)
        if not validation["valid"]:
            logger.warning(f"结果验证有警告: {validation['errors']}，但结果已包含所有字段")

        update_task_result(
            db,
            task.task_id,
            formatted_result,
            preprocessed_text=cleaned_text,
            llm_response=raw_response
        )

        task = get_task_by_id(db, task.task_id)

    except Exception as e:
        logger.error(f"抽取任务 {task.task_id} 失败: {str(e)}", exc_info=True)
        update_task_status(
            db,
            task.task_id,
            TaskStatus.FAILED,
            error_message=str(e)
        )
        task = get_task_by_id(db, task.task_id)

    return ExtractionResponse(
        task_id=task.task_id,
        status=task.status,
        result=task.result,
        error_message=task.error_message,
        created_at=task.created_at
    )


@router.post(
    "/async-extract",
    response_model=ExtractionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="异步提交信息抽取任务"
)
@limiter.limit("60/minute")
async def async_extract(
    request: Request,
    extraction_request: ExtractionRequest,
    db: Session = Depends(get_db)
):
    task = create_task(db, extraction_request)
    return ExtractionResponse(
        task_id=task.task_id,
        status=task.status,
        result=None,
        error_message=None,
        created_at=task.created_at
    )


@router.get(
    "/task/{task_id}",
    response_model=TaskQueryResponse,
    summary="查询抽取任务状态和结果"
)
@limiter.limit("120/minute")
async def get_task(
    request: Request,
    task_id: str,
    db: Session = Depends(get_db)
):
    task = get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"任务 {task_id} 不存在"
        )

    truncated_text = task.original_text[:200] + "..." if len(task.original_text) > 200 else task.original_text
    schema_fields = [SchemaField(**f) for f in task.schema_definition]

    return TaskQueryResponse(
        task_id=task.task_id,
        batch_id=task.batch_id,
        status=task.status,
        original_text=truncated_text,
        schema_definition=schema_fields,
        result=task.result,
        error_message=task.error_message,
        created_at=task.created_at,
        completed_at=task.completed_at
    )


@router.get(
    "/tasks",
    response_model=TaskListResponse,
    summary="获取抽取任务列表"
)
@limiter.limit("60/minute")
async def list_tasks(
    request: Request,
    status: Optional[TaskStatus] = Query(None, description="任务状态过滤"),
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db)
):
    total, tasks = get_tasks(db, status=status, skip=skip, limit=limit)

    items = []
    for task in tasks:
        truncated_text = task.original_text[:200] + "..." if len(task.original_text) > 200 else task.original_text
        schema_fields = [SchemaField(**f) for f in task.schema_definition]
        items.append(TaskQueryResponse(
            task_id=task.task_id,
            batch_id=task.batch_id,
            status=task.status,
            original_text=truncated_text,
            schema_definition=schema_fields,
            result=task.result,
            error_message=task.error_message,
            created_at=task.created_at,
            completed_at=task.completed_at
        ))

    return TaskListResponse(
        total=total,
        items=items
    )


@router.post(
    "/preprocess",
    summary="文本预处理测试接口"
)
@limiter.limit("120/minute")
async def preprocess_text(
    request: Request,
    body: dict,
    extract_keywords: bool = Query(False, description="是否提取关键词"),
    show_compression: bool = Query(False, description="是否显示Schema压缩结果")
):
    text = body.get("text", "")
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="text字段不能为空"
        )

    schema_data = body.get("schema")

    result = preprocessor.preprocess(text, extract_keywords=extract_keywords)

    if show_compression and schema_data:
        try:
            schema_fields = [SchemaField(**f) for f in schema_data]
            compressed = preprocessor.compress_by_schema(
                result["cleaned_text"], schema_fields, max_chars=settings.LLM_MAX_INPUT_CHARS
            )
            result["compression"] = compressed

            chunks = preprocessor.split_into_chunks(
                result["cleaned_text"], max_chars=settings.LLM_MAX_INPUT_CHARS
            )
            result["chunk_count"] = len(chunks)
        except Exception as e:
            result["compression_error"] = str(e)

    return result
