from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from datetime import datetime, timedelta
from typing import Optional, List
from pathlib import Path

from backend.services.reports import (
    generate_excel_report,
    generate_pdf_report,
    get_report_tasks,
    create_report_task
)
from backend.services.auth import get_current_user, check_factory_access
from backend.utils.logger import setup_logger

logger = setup_logger()
router = APIRouter()


@router.post("/generate/excel")
async def generate_excel(
    factory_id: str,
    report_name: str,
    device_ids: Optional[str] = Query(None),
    metric_names: Optional[str] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    if not start_time:
        start_time = datetime.now() - timedelta(days=7)
    if not end_time:
        end_time = datetime.now()
    
    try:
        device_id_list = device_ids.split(",") if device_ids else []
        metric_name_list = metric_names.split(",") if metric_names else []
        
        result = generate_excel_report(
            factory_id=factory_id,
            device_ids=device_id_list,
            metric_names=metric_name_list,
            start_time=start_time,
            end_time=end_time,
            report_name=report_name
        )
        
        return result
    except Exception as e:
        logger.error(f"Excel report generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Excel报表生成失败: {str(e)}")


@router.post("/generate/pdf")
async def generate_pdf(
    factory_id: str,
    report_name: str,
    device_ids: Optional[str] = Query(None),
    metric_names: Optional[str] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if not check_factory_access(current_user, factory_id):
        raise HTTPException(status_code=403, detail="没有访问该工厂的权限")
    
    if not start_time:
        start_time = datetime.now() - timedelta(days=7)
    if not end_time:
        end_time = datetime.now()
    
    try:
        device_id_list = device_ids.split(",") if device_ids else []
        metric_name_list = metric_names.split(",") if metric_names else []
        
        result = generate_pdf_report(
            factory_id=factory_id,
            device_ids=device_id_list,
            metric_names=metric_name_list,
            start_time=start_time,
            end_time=end_time,
            report_name=report_name
        )
        
        return result
    except Exception as e:
        logger.error(f"PDF report generation error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF报表生成失败: {str(e)}")


@router.get("/download/{file_name}")
async def download_report(
    file_name: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        file_path = Path("reports") / file_name
        if not file_path.exists():
            return FileResponse(
                path=str(file_path),
                filename=file_name,
                media_type="application/octet-stream"
            )
        else:
            raise HTTPException(status_code=404, detail="文件不存在")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report download error: {e}")
        raise HTTPException(status_code=500, detail=f"文件下载失败: {str(e)}")


@router.get("/tasks")
async def list_report_tasks(
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    try:
        tasks = get_report_tasks(limit=limit)
        return {"tasks": tasks}
    except Exception as e:
        logger.error(f"Get report tasks error: {e}")
        raise HTTPException(status_code=500, detail=f"获取报表任务列表失败: {str(e)}")


@router.post("/tasks")
async def create_report_task_endpoint(
    report_name: str,
    report_type: str,
    parameters: dict,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    try:
        result = create_report_task(
            report_name=report_name,
            report_type=report_type,
            parameters=parameters,
            created_by=current_user["username"]
        )
        return result
    except Exception as e:
        logger.error(f"Create report task error: {e}")
        raise HTTPException(status_code=500, detail=f"创建报表任务失败: {str(e)}")
