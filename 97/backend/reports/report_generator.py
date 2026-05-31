import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from io import BytesIO
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import logging

logger = logging.getLogger(__name__)


class ReportGenerator:
    def __init__(self):
        self.report_templates = {
            'device_summary': self._generate_device_summary,
            'metric_trend': self._generate_metric_trend,
            'anomaly_report': self._generate_anomaly_report,
            'custom': self._generate_custom_report
        }
        self._setup_fonts()

    def _setup_fonts(self):
        try:
            pdfmetrics.registerFont(TTFont('SimHei', 'simhei.ttf'))
        except:
            logger.warning("SimHei font not found, using default")

    def generate_report(self, df: pd.DataFrame, report_type: str, config: Dict) -> Dict:
        generator = self.report_templates.get(report_type, self._generate_custom_report)
        return generator(df, config)

    def _generate_device_summary(self, df: pd.DataFrame, config: Dict) -> Dict:
        devices = config.get('devices', df['device_id'].unique().tolist())
        metrics = config.get('metrics', df['metric_name'].unique().tolist())
        
        filtered_df = df[df['device_id'].isin(devices) & df['metric_name'].isin(metrics)]
        
        summary = {
            'report_type': 'device_summary',
            'generated_at': datetime.now().isoformat(),
            'time_range': config.get('time_range', {}),
            'devices': devices,
            'metrics': metrics,
            'summary_data': {}
        }
        
        for device_id in devices:
            device_df = filtered_df[filtered_df['device_id'] == device_id]
            summary['summary_data'][device_id] = {}
            
            for metric_name in metrics:
                metric_df = device_df[device_df['metric_name'] == metric_name]
                if not metric_df.empty:
                    summary['summary_data'][device_id][metric_name] = {
                        'avg': float(metric_df['cleaned_value'].mean()),
                        'max': float(metric_df['cleaned_value'].max()),
                        'min': float(metric_df['cleaned_value'].min()),
                        'std': float(metric_df['cleaned_value'].std()),
                        'anomaly_count': int(metric_df['is_outlier'].sum()),
                        'data_points': int(len(metric_df))
                    }
        
        return summary

    def _generate_metric_trend(self, df: pd.DataFrame, config: Dict) -> Dict:
        device_id = config.get('device_id')
        metric_name = config.get('metric_name')
        period = config.get('period', 'hour')
        
        filtered_df = df[(df['device_id'] == device_id) & (df['metric_name'] == metric_name)]
        
        if filtered_df.empty:
            return {
                'report_type': 'metric_trend',
                'device_id': device_id,
                'metric_name': metric_name,
                'trend_data': [],
                'stats': {}
            }
        
        agg_df = filtered_df.groupby(pd.Grouper(key='collect_time', freq=period))['cleaned_value'].agg([
            'mean', 'max', 'min', 'std', 'count'
        ]).reset_index()
        
        trend_data = []
        for _, row in agg_df.iterrows():
            trend_data.append({
                'time': row['collect_time'].isoformat(),
                'avg': float(row['mean']),
                'max': float(row['max']),
                'min': float(row['min']),
                'std': float(row['std'])
            })
        
        return {
            'report_type': 'metric_trend',
            'device_id': device_id,
            'metric_name': metric_name,
            'trend_data': trend_data,
            'stats': {
                'overall_avg': float(filtered_df['cleaned_value'].mean()),
                'overall_max': float(filtered_df['cleaned_value'].max()),
                'overall_min': float(filtered_df['cleaned_value'].min()),
                'anomaly_count': int(filtered_df['is_outlier'].sum()),
                'data_points': int(len(filtered_df))
            }
        }

    def _generate_anomaly_report(self, df: pd.DataFrame, config: Dict) -> Dict:
        anomaly_df = df[df['is_outlier'] == True]
        
        if anomaly_df.empty:
            return {
                'report_type': 'anomaly_report',
                'total_anomalies': 0,
                'anomalies_by_device': {},
                'anomalies_by_metric': {}
            }
        
        anomalies_by_device = anomaly_df.groupby('device_id').size().to_dict()
        anomalies_by_metric = anomaly_df.groupby('metric_name').size().to_dict()
        
        anomaly_details = []
        for _, row in anomaly_df.iterrows():
            anomaly_details.append({
                'device_id': row['device_id'],
                'metric_name': row['metric_name'],
                'value': float(row['metric_value']),
                'time': row['collect_time'].isoformat(),
                'reason': row.get('outlier_reason', 'unknown')
            })
        
        return {
            'report_type': 'anomaly_report',
            'generated_at': datetime.now().isoformat(),
            'total_anomalies': int(len(anomaly_df)),
            'anomalies_by_device': anomalies_by_device,
            'anomalies_by_metric': anomalies_by_metric,
            'anomaly_details': anomaly_details
        }

    def _generate_custom_report(self, df: pd.DataFrame, config: Dict) -> Dict:
        return {
            'report_type': 'custom',
            'generated_at': datetime.now().isoformat(),
            'config': config,
            'data': df.to_dict(orient='records')
        }

    def export_to_excel(self, report_data: Dict, filename: str) -> BytesIO:
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            self._write_report_to_excel(writer, report_data)
        
        output.seek(0)
        return output

    def _write_report_to_excel(self, writer, report_data: Dict):
        report_type = report_data.get('report_type', 'custom')
        
        if report_type == 'device_summary':
            self._write_device_summary_excel(writer, report_data)
        elif report_type == 'metric_trend':
            self._write_metric_trend_excel(writer, report_data)
        elif report_type == 'anomaly_report':
            self._write_anomaly_report_excel(writer, report_data)

    def _write_device_summary_excel(self, writer, report_data: Dict):
        summary_data = report_data.get('summary_data', {})
        
        rows = []
        for device_id, metrics in summary_data.items():
            for metric_name, stats in metrics.items():
                rows.append({
                    'device_id': device_id,
                    'metric_name': metric_name,
                    'avg': stats.get('avg', 0),
                    'max': stats.get('max', 0),
                    'min': stats.get('min', 0),
                    'std': stats.get('std', 0),
                    'anomaly_count': stats.get('anomaly_count', 0),
                    'data_points': stats.get('data_points', 0)
                })
        
        df = pd.DataFrame(rows)
        df.to_excel(writer, sheet_name='设备汇总', index=False)

    def _write_metric_trend_excel(self, writer, report_data: Dict):
        trend_data = report_data.get('trend_data', [])
        df = pd.DataFrame(trend_data)
        df.to_excel(writer, sheet_name='指标趋势', index=False)
        
        stats = report_data.get('stats', {})
        stats_df = pd.DataFrame([stats])
        stats_df.to_excel(writer, sheet_name='统计信息', index=False)

    def _write_anomaly_report_excel(self, writer, report_data: Dict):
        anomaly_details = report_data.get('anomaly_details', [])
        df = pd.DataFrame(anomaly_details)
        df.to_excel(writer, sheet_name='异常详情', index=False)
        
        summary_df = pd.DataFrame([{
            '总异常数': report_data.get('total_anomalies', 0)
        }])
        summary_df.to_excel(writer, sheet_name='异常汇总', index=False)

    def export_to_pdf(self, report_data: Dict, filename: str) -> BytesIO:
        output = BytesIO()
        
        doc = SimpleDocTemplate(
            output,
            pagesize=landscape(A4),
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        story = self._build_pdf_story(report_data)
        doc.build(story)
        
        output.seek(0)
        return output

    def _build_pdf_story(self, report_data: Dict) -> List:
        styles = getSampleStyleSheet()
        story = []
        
        title_style = styles['Title']
        story.append(Paragraph("设备运维指标分析报告", title_style))
        story.append(Spacer(1, 0.5*cm))
        
        report_type = report_data.get('report_type', 'custom')
        story.append(Paragraph(f"报告类型: {report_type}", styles['Heading2']))
        story.append(Paragraph(f"生成时间: {report_data.get('generated_at', datetime.now().isoformat())}", styles['Normal']))
        story.append(Spacer(1, 0.5*cm))
        
        if report_type == 'device_summary':
            story.extend(self._build_device_summary_pdf(report_data, styles))
        elif report_type == 'anomaly_report':
            story.extend(self._build_anomaly_report_pdf(report_data, styles))
        
        return story

    def _build_device_summary_pdf(self, report_data: Dict, styles) -> List:
        story = []
        summary_data = report_data.get('summary_data', {})
        
        data = [['设备ID', '指标名称', '平均值', '最大值', '最小值', '标准差', '异常数', '数据点']]
        
        for device_id, metrics in summary_data.items():
            for metric_name, stats in metrics.items():
                data.append([
                    device_id,
                    metric_name,
                    f"{stats.get('avg', 0):.2f}",
                    f"{stats.get('max', 0):.2f}",
                    f"{stats.get('min', 0):.2f}",
                    f"{stats.get('std', 0):.2f}",
                    str(stats.get('anomaly_count', 0)),
                    str(stats.get('data_points', 0))
                ])
        
        table = Table(data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        story.append(table)
        return story

    def _build_anomaly_report_pdf(self, report_data: Dict, styles) -> List:
        story = []
        
        story.append(Paragraph(f"总异常数: {report_data.get('total_anomalies', 0)}", styles['Heading3']))
        story.append(Spacer(1, 0.3*cm))
        
        anomaly_details = report_data.get('anomaly_details', [])
        if anomaly_details:
            data = [['设备ID', '指标名称', '异常值', '时间', '原因']]
            for detail in anomaly_details[:50]:
                data.append([
                    detail['device_id'],
                    detail['metric_name'],
                    f"{detail['value']:.2f}",
                    detail['time'],
                    detail['reason']
                ])
            
            table = Table(data)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.red),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            story.append(table)
        
        return story


report_generator = ReportGenerator()
