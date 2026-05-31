from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from io import BytesIO
import pandas as pd
from datetime import datetime

from data_cleaning import cleaner
from aggregation import aggregator
from reports import report_generator
from utils.mock_data import mock_data_generator

router = APIRouter()


class ReportRequest(BaseModel):
    report_type: str
    config: Dict
    format: str = "json"


@router.get("/templates")
async def get_report_templates():
    templates = [
        {
            "id": "device_summary",
            "name": "设备汇总报表",
            "description": "展示各设备指标的统计汇总信息",
            "supported_formats": ["json", "excel", "pdf"]
        },
        {
            "id": "metric_trend",
            "name": "指标趋势报表",
            "description": "展示单个设备单个指标的趋势变化",
            "supported_formats": ["json", "excel", "pdf"]
        },
        {
            "id": "anomaly_report",
            "name": "异常分析报表",
            "description": "展示所有异常数据的详细信息",
            "supported_formats": ["json", "excel", "pdf"]
        },
        {
            "id": "custom",
            "name": "自定义报表",
            "description": "根据配置生成自定义报表",
            "supported_formats": ["json", "excel"]
        }
    ]
    
    return {"success": True, "templates": templates}


@router.post("/generate")
async def generate_report(request: ReportRequest):
    try:
        df = mock_data_generator.generate_metrics_data(24, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        report_data = report_generator.generate_report(
            cleaned_df,
            request.report_type,
            request.config
        )
        
        return {"success": True, "report": report_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成报表失败: {str(e)}")


@router.post("/export/excel")
async def export_report_excel(request: ReportRequest):
    try:
        df = mock_data_generator.generate_metrics_data(24, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        report_data = report_generator.generate_report(
            cleaned_df,
            request.report_type,
            request.config
        )
        
        excel_buffer = report_generator.export_to_excel(
            report_data,
            f"{request.report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        )
        
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename={request.report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出Excel失败: {str(e)}")


@router.post("/export/pdf")
async def export_report_pdf(request: ReportRequest):
    try:
        df = mock_data_generator.generate_metrics_data(24, interval_minutes=5)
        cleaned_df = cleaner.clean_data(df)
        
        report_data = report_generator.generate_report(
            cleaned_df,
            request.report_type,
            request.config
        )
        
        pdf_buffer = report_generator.export_to_pdf(
            report_data,
            f"{request.report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        )
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={request.report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出PDF失败: {str(e)}")


@router.get("/list")
async def get_saved_reports():
    reports = [
        {
            "report_id": "report_001",
            "report_name": "设备每日汇总报表",
            "report_type": "device_summary",
            "created_at": "2024-01-15 10:30:00",
            "created_by": "admin"
        },
        {
            "report_id": "report_002",
            "report_name": "温度异常分析",
            "report_type": "anomaly_report",
            "created_at": "2024-01-14 15:45:00",
            "created_by": "operator"
        }
    ]
    
    return {"success": True, "reports": reports}


@router.post("/save")
async def save_report(report_data: Dict):
    report_id = f"report_{int(datetime.now().timestamp())}"
    
    return {
        "success": True,
        "report_id": report_id,
        "message": "报表保存成功"
    }


@router.delete("/{report_id}")
async def delete_report(report_id: str):
    return {
        "success": True,
        "report_id": report_id,
        "message": "报表删除成功"
    }
