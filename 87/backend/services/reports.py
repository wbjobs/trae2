from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.graphics.shapes import Drawing, Line
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics import renderPDF

from backend.database.clickhouse import execute_query, get_client
from backend.services.timeseries import query_timeseries, get_metric_statistics
from backend.utils.logger import setup_logger

logger = setup_logger()

REPORTS_DIR = Path("reports")
REPORTS_DIR.mkdir(exist_ok=True)


def generate_excel_report(
    factory_id: str,
    device_ids: List[str],
    metric_names: List[str],
    start_time: datetime,
    end_time: datetime,
    report_name: str
) -> Dict[str, Any]:
    ts_result = query_timeseries(
        factory_id=factory_id,
        device_ids=device_ids,
        metric_names=metric_names,
        start_time=start_time,
        end_time=end_time,
        aggregation="1hour"
    )
    
    stats_result = get_metric_statistics(
        factory_id=factory_id,
        device_ids=device_ids,
        metric_names=metric_names,
        start_time=start_time,
        end_time=end_time
    )
    
    df_timeseries = pd.DataFrame(ts_result["data"])
    df_stats = pd.DataFrame(stats_result["statistics"])
    
    file_path = REPORTS_DIR / f"{report_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    with pd.ExcelWriter(file_path, engine="xlsxwriter") as writer:
        df_timeseries.to_excel(writer, sheet_name="时序数据", index=False)
        df_stats.to_excel(writer, sheet_name="统计汇总", index=False)
        
        workbook = writer.book
        worksheet = writer.sheets["时序数据"]
        
        format_header = workbook.add_format({
            "bold": True,
            "bg_color": "#4472C4",
            "font_color": "white",
            "border": 1
        })
        
        for col_num, value in enumerate(df_timeseries.columns.values):
            worksheet.write(0, col_num, value, format_header)
    
    file_size = file_path.stat().st_size
    
    return {
        "file_path": str(file_path),
        "file_name": file_path.name,
        "file_size": file_size,
        "data_points": len(df_timeseries),
        "report_type": "excel"
    }


def generate_pdf_report(
    factory_id: str,
    device_ids: List[str],
    metric_names: List[str],
    start_time: datetime,
    end_time: datetime,
    report_name: str
) -> Dict[str, Any]:
    ts_result = query_timeseries(
        factory_id=factory_id,
        device_ids=device_ids,
        metric_names=metric_names,
        start_time=start_time,
        end_time=end_time,
        aggregation="1hour"
    )
    
    stats_result = get_metric_statistics(
        factory_id=factory_id,
        device_ids=device_ids,
        metric_names=metric_names,
        start_time=start_time,
        end_time=end_time
    )
    
    file_path = REPORTS_DIR / f"{report_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    
    doc = SimpleDocTemplate(
        str(file_path),
        pagesize=landscape(A4),
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = getSampleStyleSheet()
    title_style = styles["Heading1"]
    title_style.alignment = 1
    normal_style = styles["Normal"]
    
    story = []
    
    story.append(Paragraph("工业时序工况数据分析报告", title_style))
    story.append(Spacer(1, 0.5*cm))
    
    info_data = [
        ["工厂ID", factory_id],
        ["报告生成时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        ["数据时间范围", f"{start_time.strftime('%Y-%m-%d %H:%M:%S')} 至 {end_time.strftime('%Y-%m-%d %H:%M:%S')}"],
        ["设备数量", len(device_ids) if device_ids else "全部"],
        ["指标数量", len(metric_names) if metric_names else "全部"]
    ]
    
    info_table = Table(info_data, colWidths=[4*cm, 10*cm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.lightblue),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.black),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("GRID", (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.5*cm))
    
    story.append(Paragraph("统计汇总", styles["Heading2"]))
    story.append(Spacer(1, 0.3*cm))
    
    if stats_result["statistics"]:
        stats_data = [["指标名称", "设备ID", "平均值", "最小值", "最大值", "标准差", "中位数"]]
        for stat in stats_result["statistics"]:
            stats_data.append([
                stat.get("metric_name", ""),
                stat.get("device_id", ""),
                f"{stat.get('avg_value', 0):.2f}",
                f"{stat.get('min_value', 0):.2f}",
                f"{stat.get('max_value', 0):.2f}",
                f"{stat.get('stddev', 0):.2f}",
                f"{stat.get('median', 0):.2f}"
            ])
        
        stats_table = Table(stats_data, colWidths=[3*cm, 3*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2.5*cm])
        stats_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.darkblue),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
            ("GRID", (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(stats_table)
    
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph("数据趋势图", styles["Heading2"]))
    story.append(Spacer(1, 0.3*cm))
    
    if ts_result["data"]:
        df = pd.DataFrame(ts_result["data"])
        
        drawing = Drawing(700, 250)
        lp = LinePlot()
        lp.x = 50
        lp.y = 50
        lp.height = 180
        lp.width = 600
        
        if "value" in df.columns:
            values = df["value"].dropna().values
            lp.data = [list(enumerate(values))]
            lp.lines[0].strokeColor = colors.blue
            lp.lines[0].strokeWidth = 1
        
        drawing.add(lp)
        story.append(drawing)
    
    doc.build(story)
    
    file_size = file_path.stat().st_size
    
    return {
        "file_path": str(file_path),
        "file_name": file_path.name,
        "file_size": file_size,
        "data_points": len(ts_result["data"]),
        "report_type": "pdf"
    }


def create_report_task(
    report_name: str,
    report_type: str,
    parameters: Dict[str, Any],
    created_by: str
) -> Dict[str, Any]:
    client = get_client()
    
    params_str = str(parameters).replace("'", '"')
    
    query = f"""
        INSERT INTO report_tasks
        (report_name, report_type, parameters, status, created_by)
        VALUES
        ('{report_name}', '{report_type}', {params_str}, 'pending', '{created_by}')
    """
    
    client.command(query)
    
    return {
        "report_name": report_name,
        "report_type": report_type,
        "status": "pending",
        "created_by": created_by
    }


def get_report_tasks(limit: int = 100) -> List[Dict[str, Any]]:
    query = """
        SELECT
            report_id,
            report_name,
            report_type,
            parameters,
            status,
            created_by,
            created_at,
            started_at,
            completed_at,
            file_path,
            file_size
        FROM report_tasks
        ORDER BY created_at DESC
        LIMIT %(limit)s
    """
    return execute_query(query, {"limit": limit})


def get_dashboard_overview(
    factory_id: str,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None
) -> Dict[str, Any]:
    if not start_time:
        start_time = datetime.now() - timedelta(days=7)
    if not end_time:
        end_time = datetime.now()
    
    stats_query = """
        SELECT
            count(DISTINCT device_id) AS device_count,
            count(DISTINCT metric_name) AS metric_count,
            count() AS total_data_points,
            countIf(quality = 1) AS good_quality_points
        FROM industrial_metrics
        WHERE factory_id = %(factory_id)s
        AND timestamp BETWEEN %(start_time)s AND %(end_time)s
    """
    
    stats = execute_query(stats_query, {
        "factory_id": factory_id,
        "start_time": start_time,
        "end_time": end_time
    })
    
    devices_query = """
        SELECT DISTINCT
            device_id,
            device_name,
            device_type,
            status
        FROM devices
        WHERE factory_id = %(factory_id)s
    """
    
    devices = execute_query(devices_query, {"factory_id": factory_id})
    
    online_devices = sum(1 for d in devices if d.get("status") == "online")
    
    recent_alerts = []
    
    return {
        "summary": {
            "device_count": stats[0]["device_count"] if stats else 0,
            "metric_count": stats[0]["metric_count"] if stats else 0,
            "total_data_points": stats[0]["total_data_points"] if stats else 0,
            "online_devices": online_devices,
            "total_devices": len(devices),
            "quality_rate": (stats[0]["good_quality_points"] / stats[0]["total_data_points"] if stats and stats[0]["total_data_points"] > 0 else 0)
        },
        "devices": devices,
        "recent_alerts": recent_alerts,
        "time_range": {
            "start": start_time.isoformat(),
            "end": end_time.isoformat()
        }
    }
