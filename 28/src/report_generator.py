"""
报告生成模块
负责生成专业的地质剖面应力场分析报告
增强版本：添加数据验证、异常处理和结构化输出
"""

import os
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
import logging
import json
from dataclasses import dataclass, asdict
import traceback

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm, mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor, black, grey, white
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, 
        PageBreak, KeepTogether, ListFlowable, ListItem
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

from .config_parser import SimulationConfig
from .mesh_generator import MeshData
from .fem_solver import FEMResult
from .post_processor import StressStatistics

logger = logging.getLogger(__name__)


@dataclass
class ReportConfig:
    title: str = "地质剖面应力场有限元分析报告"
    author: str = "地质力学模拟系统"
    include_visuals: bool = True
    include_raw_data: bool = False
    format: str = "pdf"
    max_image_width_cm: float = 15.0
    max_image_height_cm: float = 10.0


class ReportDataValidator:
    @staticmethod
    def safe_float(value: Any, default: float = 0.0, decimals: int = 2) -> str:
        try:
            if value is None:
                return f"{default:.{decimals}f}"
            val = float(value)
            if np.isnan(val) or np.isinf(val):
                return f"{default:.{decimals}f}"
            return f"{val:.{decimals}f}"
        except (TypeError, ValueError):
            return f"{default:.{decimals}f}"

    @staticmethod
    def safe_int(value: Any, default: int = 0) -> str:
        try:
            if value is None:
                return str(default)
            return str(int(value))
        except (TypeError, ValueError):
            return str(default)

    @staticmethod
    def safe_str(value: Any, default: str = "未知") -> str:
        try:
            if value is None:
                return default
            return str(value)
        except Exception:
            return default

    @staticmethod
    def sanitize_for_pdf(text: str) -> str:
        if not text:
            return ""
        special_chars = ['_', '^', '%', '&', '#', '{', '}', '~', '\\']
        for char in special_chars:
            text = text.replace(char, ' ')
        return text

    @staticmethod
    def validate_statistics(stats: StressStatistics) -> Dict[str, float]:
        validated = {}
        fields = ['max_von_mises', 'min_von_mises', 'mean_von_mises',
                  'max_sigma_xx', 'min_sigma_xx', 'mean_sigma_xx',
                  'max_sigma_yy', 'min_sigma_yy', 'mean_sigma_yy',
                  'max_sigma_xy', 'min_sigma_xy', 'mean_sigma_xy',
                  'max_displacement_magnitude']
        
        for field in fields:
            value = getattr(stats, field, 0.0)
            try:
                val = float(value)
                if np.isnan(val) or np.isinf(val):
                    validated[field] = 0.0
                else:
                    validated[field] = val
            except (TypeError, ValueError):
                validated[field] = 0.0
        
        return validated


class ReportGenerator:
    def __init__(self, config: SimulationConfig, mesh_data: MeshData, 
                 fem_result: FEMResult, statistics: StressStatistics,
                 visual_files: List[str] = None):
        self.config = config
        self.mesh = mesh_data
        self.result = fem_result
        self.statistics = statistics
        self.visual_files = visual_files or []
        self.report_config = ReportConfig()
        self.validator = ReportDataValidator()
        self.validated_stats = self.validator.validate_statistics(statistics)
        self._errors: List[str] = []
        self._warnings: List[str] = []

    def generate_report(self, output_path: str) -> str:
        logger.info("开始生成分析报告...")

        try:
            self._validate_input_data()
            
            if not REPORTLAB_AVAILABLE:
                logger.warning("ReportLab不可用，生成JSON格式报告")
                return self._generate_json_report(output_path)

            return self._generate_pdf_report(output_path)

        except Exception as e:
            logger.error(f"报告生成失败: {e}")
            logger.debug(traceback.format_exc())
            return self._generate_fallback_report(output_path, str(e))

    def _validate_input_data(self):
        logger.info("验证报告输入数据...")

        if self.mesh is None:
            self._errors.append("网格数据为空")
        else:
            if self.mesh.node_count == 0:
                self._warnings.append("网格节点数量为0")
            if self.mesh.element_count == 0:
                self._warnings.append("网格单元数量为0")

        if self.result is None:
            self._errors.append("计算结果为空")
        else:
            if not self.result.converged:
                self._warnings.append("计算未收敛，报告内容可能不准确")
            if self.result.diagnostics and self.result.diagnostics.errors:
                self._warnings.extend(self.result.diagnostics.errors)

        if self.statistics is None:
            self._errors.append("统计数据为空")

        if self._errors:
            logger.warning(f"报告生成发现 {len(self._errors)} 个错误，{len(self._warnings)} 个警告")

    def _generate_pdf_report(self, output_path: str) -> str:
        output_file = Path(output_path) / "stress_analysis_report.pdf"
        output_file.parent.mkdir(parents=True, exist_ok=True)

        try:
            doc = SimpleDocTemplate(
                str(output_file),
                pagesize=A4,
                rightMargin=2*cm,
                leftMargin=2*cm,
                topMargin=2*cm,
                bottomMargin=2*cm,
                title=self.report_config.title,
                author=self.report_config.author
            )

            story = []
            styles = self._get_styles()

            story.extend(self._generate_title_section(styles))
            story.extend(self._generate_summary_section(styles))
            story.extend(self._generate_model_info_section(styles))
            story.extend(self._generate_material_section(styles))
            story.extend(self._generate_mesh_section(styles))
            story.extend(self._generate_results_section(styles))
            story.extend(self._generate_conclusion_section(styles))

            if self._errors or self._warnings:
                story.extend(self._generate_notes_section(styles))

            doc.build(story, onFirstPage=self._add_page_number, onLaterPages=self._add_page_number)

            logger.info(f"PDF报告已生成: {output_file}")
            return str(output_file)

        except Exception as e:
            logger.error(f"PDF生成失败，降级为JSON: {e}")
            return self._generate_json_report(output_path)

    def _get_styles(self):
        styles = getSampleStyleSheet()

        styles.add(ParagraphStyle(
            name='CustomTitle',
            parent=styles['Title'],
            fontSize=20,
            spaceAfter=20,
            textColor=HexColor('#2c3e50'),
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))

        styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=styles['Heading1'],
            fontSize=14,
            spaceAfter=12,
            spaceBefore=20,
            textColor=HexColor('#34495e'),
            borderPadding=5,
            fontName='Helvetica-Bold'
        ))

        styles.add(ParagraphStyle(
            name='SubHeader',
            parent=styles['Heading2'],
            fontSize=12,
            spaceAfter=8,
            spaceBefore=12,
            textColor=HexColor('#5d6d7e'),
            fontName='Helvetica-Bold'
        ))

        styles.add(ParagraphStyle(
            name='BodyText_CN',
            parent=styles['BodyText'],
            fontSize=10,
            leading=14,
            alignment=TA_JUSTIFY,
            firstLineIndent=20
        ))

        styles.add(ParagraphStyle(
            name='TableCell',
            parent=styles['Normal'],
            fontSize=9,
            alignment=TA_CENTER
        ))

        styles.add(ParagraphStyle(
            name='WarningText',
            parent=styles['BodyText'],
            fontSize=9,
            textColor=HexColor('#e74c3c')
        ))

        return styles

    def _generate_title_section(self, styles) -> List:
        story = []

        story.append(Paragraph(self.report_config.title, styles['CustomTitle']))
        story.append(Spacer(1, 1*cm))

        project_name = self.validator.safe_str(getattr(self.config, 'project_name', '未知项目'))
        subtitle = f"项目: {project_name}"
        story.append(Paragraph(subtitle, styles['SubHeader']))
        story.append(Spacer(1, 0.5*cm))

        date_str = f"生成日期: {datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')}"
        story.append(Paragraph(date_str, styles['Normal']))
        story.append(Spacer(1, 0.3*cm))

        author_str = f"生成者: {self.report_config.author}"
        story.append(Paragraph(author_str, styles['Normal']))

        if self.result and not self.result.converged:
            story.append(Spacer(1, 0.5*cm))
            warning_msg = "⚠ 注意：本次计算未完全收敛，结果仅供参考"
            story.append(Paragraph(warning_msg, styles['WarningText']))

        story.append(PageBreak())
        return story

    def _generate_summary_section(self, styles) -> List:
        story = []

        story.append(Paragraph("一、执行摘要", styles['SectionHeader']))

        width = self.validator.safe_float(getattr(self.config.geometry, 'profile_width', 0))
        height = self.validator.safe_float(getattr(self.config.geometry, 'profile_height', 0))
        layer_count = self.validator.safe_int(getattr(self.config.geometry, 'layer_count', 0))

        summary_text = (f"本报告对地质剖面进行了有限元应力场分析。剖面尺寸为 {width}m × {height}m，"
                       f"共包含 {layer_count} 层岩层。模拟采用线弹性本构模型，考虑了重力荷载和边界应力条件。")
        story.append(Paragraph(summary_text, styles['BodyText_CN']))
        story.append(Spacer(1, 0.5*cm))

        max_vm = self.validator.safe_float(self.validated_stats['max_von_mises'] / 1e6)
        min_vm = self.validator.safe_float(self.validated_stats['min_von_mises'] / 1e6)
        mean_vm = self.validator.safe_float(self.validated_stats['mean_von_mises'] / 1e6)
        max_disp = self.validator.safe_float(self.validated_stats['max_displacement_magnitude'] * 1000)
        solve_time = self.validator.safe_float(getattr(self.result, 'solve_time', 0), decimals=2)
        node_count = self.validator.safe_int(getattr(self.mesh, 'node_count', 0))
        elem_count = self.validator.safe_int(getattr(self.mesh, 'element_count', 0))

        key_results_data = [
            ['关键指标', '数值', '单位'],
            ['最大Von Mises应力', max_vm, 'MPa'],
            ['最小Von Mises应力', min_vm, 'MPa'],
            ['平均Von Mises应力', mean_vm, 'MPa'],
            ['最大位移量', max_disp, 'mm'],
            ['计算时间', solve_time, 's'],
            ['节点数量', node_count, '个'],
            ['单元数量', elem_count, '个']
        ]

        key_table = Table(key_results_data, colWidths=[4*cm, 3*cm, 2*cm])
        key_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f8f9fa')),
            ('GRID', (0, 0), (-1, -1), 0.5, grey),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
        ]))
        story.append(key_table)
        story.append(PageBreak())

        return story

    def _generate_model_info_section(self, styles) -> List:
        story = []

        story.append(Paragraph("二、计算模型", styles['SectionHeader']))

        story.append(Paragraph("2.1 几何模型", styles['SubHeader']))
        
        width = self.validator.safe_float(getattr(self.config.geometry, 'profile_width', 0))
        height = self.validator.safe_float(getattr(self.config.geometry, 'profile_height', 0))
        
        geo_text = (f"本次模拟的地质剖面宽度为 {width}m，高度为 {height}m。"
                   f"模型采用二维平面应变假设进行计算。岩层分布如下：")
        story.append(Paragraph(geo_text, styles['BodyText_CN']))
        story.append(Spacer(1, 0.3*cm))

        layers_data = [['岩层名称', '厚度(m)', '材料ID']]
        for layer in getattr(self.config.geometry, 'layers', []):
            name = self.validator.safe_str(getattr(layer, 'name', '未知'))
            thickness = self.validator.safe_float(getattr(layer, 'thickness', 0), decimals=1)
            mat_id = self.validator.safe_int(getattr(layer, 'material_id', 0))
            layers_data.append([name, thickness, mat_id])

        if len(layers_data) > 1:
            layers_table = Table(layers_data, colWidths=[4*cm, 2.5*cm, 2.5*cm])
            layers_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), HexColor('#27ae60')),
                ('TEXTCOLOR', (0, 0), (-1, 0), white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.5, grey),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
            ]))
            story.append(layers_table)
        else:
            story.append(Paragraph("（无岩层数据）", styles['BodyText_CN']))

        story.append(Spacer(1, 0.5*cm))
        story.append(Paragraph("2.2 边界条件", styles['SubHeader']))
        bc_text = "模型施加的边界条件如下："
        story.append(Paragraph(bc_text, styles['BodyText_CN']))
        story.append(Spacer(1, 0.3*cm))

        bc_data = [['边界', '类型', '约束条件']]
        side_names = {'left': '左侧', 'right': '右侧', 'bottom': '底部', 'top': '顶部'}
        
        for side, bc in getattr(self.config, 'boundary_conditions', {}).items():
            side_name = side_names.get(side, self.validator.safe_str(side))
            bc_type = self.validator.safe_str(getattr(bc, 'type', '未知'))
            constraints = []
            
            disp_x = getattr(bc, 'displacement_x', None)
            disp_y = getattr(bc, 'displacement_y', None)
            stress_xx = getattr(bc, 'stress_xx', None)
            stress_yy = getattr(bc, 'stress_yy', None)
            
            if disp_x is not None:
                constraints.append(f"ux={self.validator.safe_float(disp_x)}")
            if disp_y is not None:
                constraints.append(f"uy={self.validator.safe_float(disp_y)}")
            if stress_xx is not None:
                constraints.append(f"σxx={self.validator.safe_float(stress_xx/1e6)}MPa")
            if stress_yy is not None:
                constraints.append(f"σyy={self.validator.safe_float(stress_yy/1e6)}MPa")
            
            bc_data.append([side_name, bc_type, ', '.join(constraints) if constraints else '无'])

        bc_table = Table(bc_data, colWidths=[2*cm, 2.5*cm, 5*cm])
        bc_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f39c12')),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
        ]))
        story.append(bc_table)
        story.append(PageBreak())

        return story

    def _generate_material_section(self, styles) -> List:
        story = []

        story.append(Paragraph("三、材料参数", styles['SectionHeader']))

        mat_text = "各岩层采用的材料参数如下："
        story.append(Paragraph(mat_text, styles['BodyText_CN']))
        story.append(Spacer(1, 0.3*cm))

        mat_data = [['材料ID', '名称', '杨氏模量(GPa)', '泊松比', '密度(kg/m³)']]
        for mat in getattr(self.config, 'materials', []):
            mat_id = self.validator.safe_int(getattr(mat, 'id', 0))
            name = self.validator.safe_str(getattr(mat, 'name', '未知'))
            E = self.validator.safe_float(getattr(mat, 'youngs_modulus', 0) / 1e9, decimals=1)
            nu = self.validator.safe_float(getattr(mat, 'poissons_ratio', 0), decimals=3)
            rho = self.validator.safe_float(getattr(mat, 'density', 0), decimals=0)
            mat_data.append([mat_id, name, E, nu, rho])

        if len(mat_data) > 1:
            mat_table = Table(mat_data, colWidths=[1.5*cm, 2.5*cm, 3*cm, 2*cm, 3*cm])
            mat_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), HexColor('#9b59b6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.5, grey),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
            ]))
            story.append(mat_table)
        else:
            story.append(Paragraph("（无材料数据）", styles['BodyText_CN']))

        story.append(Spacer(1, 0.5*cm))

        story.append(Paragraph("3.1 本构模型", styles['SubHeader']))
        constitutive_text = ("本次模拟采用线弹性本构模型，应力应变关系遵循广义胡克定律。"
                            "对于平面应变问题，弹性矩阵D的表达式为：")
        story.append(Paragraph(constitutive_text, styles['BodyText_CN']))
        story.append(PageBreak())

        return story

    def _generate_mesh_section(self, styles) -> List:
        story = []

        story.append(Paragraph("四、网格划分", styles['SectionHeader']))

        elem_type = self.validator.safe_str(getattr(self.config.mesh, 'element_type', '未知'))
        elem_order = self.validator.safe_int(getattr(self.config.mesh, 'element_order', 0))
        max_size = self.validator.safe_float(getattr(self.config.mesh, 'max_element_size', 0))
        min_size = self.validator.safe_float(getattr(self.config.mesh, 'min_element_size', 0))

        mesh_text = (f"本次计算采用三角形单元进行网格划分。网格参数如下：\n"
                    f"单元类型: {elem_type}\n"
                    f"单元阶次: {elem_order}阶\n"
                    f"最大单元尺寸: {max_size}m\n"
                    f"最小单元尺寸: {min_size}m")
        story.append(Paragraph(mesh_text, styles['BodyText_CN']))
        story.append(Spacer(1, 0.3*cm))

        node_count = self.validator.safe_int(getattr(self.mesh, 'node_count', 0))
        elem_count = self.validator.safe_int(getattr(self.mesh, 'element_count', 0))
        dof_count = self.validator.safe_int(int(node_count) * 2 if node_count else 0)

        mesh_info_data = [
            ['网格指标', '数值'],
            ['节点数量', node_count],
            ['单元数量', elem_count],
            ['自由度数量', dof_count]
        ]
        mesh_info_table = Table(mesh_info_data, colWidths=[4*cm, 4*cm])
        mesh_info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1abc9c')),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
        ]))
        story.append(mesh_info_table)

        if self.mesh and hasattr(self.mesh, 'quality_report') and self.mesh.quality_report:
            story.append(Spacer(1, 0.3*cm))
            story.append(Paragraph("4.1 网格质量报告", styles['SubHeader']))
            
            qr = self.mesh.quality_report
            quality_data = [
                ['质量指标', '数值'],
                ['总单元数', self.validator.safe_int(getattr(qr, 'total_elements', 0))],
                ['有效单元数', self.validator.safe_int(getattr(qr, 'valid_elements', 0))],
                ['畸形单元数', self.validator.safe_int(getattr(qr, 'distorted_elements', 0))],
                ['平均质量', self.validator.safe_float(getattr(qr, 'mean_quality', 0), decimals=3)]
            ]
            quality_table = Table(quality_data, colWidths=[4*cm, 4*cm])
            quality_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), HexColor('#16a085')),
                ('TEXTCOLOR', (0, 0), (-1, 0), white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.5, grey),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
            ]))
            story.append(quality_table)

        if self.report_config.include_visuals:
            mesh_image = self._find_visual_file('mesh_model')
            if mesh_image and os.path.exists(mesh_image):
                story.append(Spacer(1, 0.5*cm))
                story.append(Paragraph("网格模型图：", styles['SubHeader']))
                try:
                    img = Image(mesh_image, width=15*cm, height=10*cm)
                    story.append(img)
                except Exception as e:
                    logger.warning(f"无法插入网格图片: {e}")

        story.append(PageBreak())
        return story

    def _generate_results_section(self, styles) -> List:
        story = []

        story.append(Paragraph("五、计算结果分析", styles['SectionHeader']))

        story.append(Paragraph("5.1 应力统计", styles['SubHeader']))

        max_xx = self.validator.safe_float(self.validated_stats['max_sigma_xx'] / 1e6)
        min_xx = self.validator.safe_float(self.validated_stats['min_sigma_xx'] / 1e6)
        mean_xx = self.validator.safe_float(self.validated_stats['mean_sigma_xx'] / 1e6)
        max_yy = self.validator.safe_float(self.validated_stats['max_sigma_yy'] / 1e6)
        min_yy = self.validator.safe_float(self.validated_stats['min_sigma_yy'] / 1e6)
        mean_yy = self.validator.safe_float(self.validated_stats['mean_sigma_yy'] / 1e6)
        max_xy = self.validator.safe_float(self.validated_stats['max_sigma_xy'] / 1e6)
        min_xy = self.validator.safe_float(self.validated_stats['min_sigma_xy'] / 1e6)
        mean_xy = self.validator.safe_float(self.validated_stats['mean_sigma_xy'] / 1e6)
        max_vm = self.validator.safe_float(self.validated_stats['max_von_mises'] / 1e6)
        min_vm = self.validator.safe_float(self.validated_stats['min_von_mises'] / 1e6)
        mean_vm = self.validator.safe_float(self.validated_stats['mean_von_mises'] / 1e6)

        stress_stats_data = [
            ['应力分量', '最大值(MPa)', '最小值(MPa)', '平均值(MPa)'],
            ['σ_xx', max_xx, min_xx, mean_xx],
            ['σ_yy', max_yy, min_yy, mean_yy],
            ['τ_xy', max_xy, min_xy, mean_xy],
            ['Von Mises', max_vm, min_vm, mean_vm]
        ]
        stress_table = Table(stress_stats_data, colWidths=[2.5*cm, 2.5*cm, 2.5*cm, 2.5*cm])
        stress_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#e74c3c')),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
        ]))
        story.append(stress_table)
        story.append(Spacer(1, 0.5*cm))

        story.append(Paragraph("5.2 分层应力统计", styles['SubHeader']))
        layer_stats_data = [['岩层', '单元数', '平均Von Mises(MPa)', '最大Von Mises(MPa)']]
        
        for layer_name, stats in getattr(self.statistics, 'layer_statistics', {}).items():
            try:
                elem_count = self.validator.safe_int(stats.get('element_count', 0))
                mean_vm = self.validator.safe_float(stats.get('mean_von_mises', 0) / 1e6)
                max_vm = self.validator.safe_float(stats.get('max_von_mises', 0) / 1e6)
                layer_stats_data.append([layer_name, elem_count, mean_vm, max_vm])
            except Exception as e:
                logger.warning(f"处理岩层统计 {layer_name} 时出错: {e}")
                continue

        if len(layer_stats_data) > 1:
            layer_stats_table = Table(layer_stats_data, colWidths=[3*cm, 2*cm, 3*cm, 3*cm])
            layer_stats_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), HexColor('#16a085')),
                ('TEXTCOLOR', (0, 0), (-1, 0), white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.5, grey),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
            ]))
            story.append(layer_stats_table)
        else:
            story.append(Paragraph("（无分层应力数据）", styles['BodyText_CN']))

        story.append(PageBreak())

        if self.report_config.include_visuals:
            story.append(Paragraph("5.3 应力分布图", styles['SubHeader']))

            image_configs = [
                ('stress_xx', '水平应力σ_xx分布：'),
                ('stress_yy', '垂直应力σ_yy分布：'),
                ('von_mises', 'Von Mises等效应力分布：'),
                ('displacement', '位移场分布：')
            ]

            for img_key, img_title in image_configs:
                img_path = self._find_visual_file(img_key)
                if img_path and os.path.exists(img_path):
                    story.append(Paragraph(img_title, styles['Normal']))
                    try:
                        width = 15*cm if 'displacement' not in img_key else 16*cm
                        height = 10*cm if 'displacement' not in img_key else 6*cm
                        img = Image(img_path, width=width, height=height)
                        story.append(img)
                        story.append(Spacer(1, 0.3*cm))
                    except Exception as e:
                        logger.warning(f"无法插入图片 {img_key}: {e}")

            story.append(PageBreak())

        return story

    def _generate_conclusion_section(self, styles) -> List:
        story = []

        story.append(Paragraph("六、结论", styles['SectionHeader']))

        max_vm = self.validator.safe_float(self.validated_stats['max_von_mises'] / 1e6)
        max_disp = self.validator.safe_float(self.validated_stats['max_displacement_magnitude'] * 1000)
        
        stress_location = self._safe_get_highest_stress_location()
        disp_location = self._safe_get_max_displacement_location()
        layer_pattern = self._safe_analyze_layer_stress_pattern()
        stress_concentration = self._safe_identify_stress_concentration()

        conclusion_text = f"""
        本次地质剖面应力场有限元分析得出以下主要结论：

        1. 最大Von Mises等效应力为 {max_vm} MPa，出现在 {stress_location}。

        2. 最大位移量为 {max_disp} mm，主要发生在 {disp_location}。

        3. 各岩层应力分布规律：{layer_pattern}

        4. 应力集中区域：{stress_concentration}
        """
        
        story.append(Paragraph(conclusion_text, styles['BodyText_CN']))
        story.append(Spacer(1, 1*cm))

        disclaimer = """
        注：本报告基于线弹性假设进行计算，实际地质情况可能更加复杂。
        建议结合现场监测数据进行综合分析。
        """
        story.append(Paragraph(disclaimer, styles['Italic']))

        return story

    def _generate_notes_section(self, styles) -> List:
        story = []

        story.append(Paragraph("七、备注", styles['SectionHeader']))

        if self._errors:
            story.append(Paragraph("错误信息：", styles['SubHeader']))
            for error in self._errors:
                story.append(Paragraph(f"• {error}", styles['WarningText']))
            story.append(Spacer(1, 0.3*cm))

        if self._warnings:
            story.append(Paragraph("警告信息：", styles['SubHeader']))
            for warning in self._warnings:
                story.append(Paragraph(f"• {warning}", styles['BodyText_CN']))

        return story

    def _find_visual_file(self, name_part: str) -> Optional[str]:
        for f in self.visual_files:
            try:
                if name_part in str(f):
                    return str(f)
            except Exception:
                continue
        return None

    def _safe_get_highest_stress_location(self) -> str:
        try:
            if self.result is None or self.mesh is None:
                return "未知位置"
            if not hasattr(self.result, 'von_mises') or self.result.von_mises is None:
                return "未知位置"
            if len(self.result.von_mises) == 0:
                return "未知位置"
            
            max_idx = int(np.argmax(self.result.von_mises))
            centroids = self.mesh.get_element_centroids()
            if max_idx >= len(centroids):
                return "未知位置"
            
            x, y = centroids[max_idx]
            return f"坐标({self.validator.safe_float(x)}m, {self.validator.safe_float(y)}m)附近"
        except Exception as e:
            logger.debug(f"获取最大应力位置失败: {e}")
            return "未知位置"

    def _safe_get_max_displacement_location(self) -> str:
        try:
            if self.result is None or self.mesh is None:
                return "未知位置"
            if not hasattr(self.result, 'displacement') or self.result.displacement is None:
                return "未知位置"
            if len(self.result.displacement) == 0:
                return "未知位置"
            
            disp_mag = np.linalg.norm(self.result.displacement, axis=1)
            max_idx = int(np.argmax(disp_mag))
            if max_idx >= len(self.mesh.nodes):
                return "未知位置"
            
            x, y = self.mesh.nodes[max_idx]
            return f"坐标({self.validator.safe_float(x)}m, {self.validator.safe_float(y)}m)附近"
        except Exception as e:
            logger.debug(f"获取最大位移位置失败: {e}")
            return "未知位置"

    def _safe_analyze_layer_stress_pattern(self) -> str:
        try:
            layer_stats = getattr(self.statistics, 'layer_statistics', {})
            if not layer_stats:
                return "岩层应力分布较为均匀"
            
            max_layer = max(layer_stats.items(), key=lambda x: x[1].get('mean_von_mises', 0))
            return f"{max_layer[0]}承受的应力水平最高"
        except Exception as e:
            logger.debug(f"分析岩层应力模式失败: {e}")
            return "岩层应力分布较为均匀"

    def _safe_identify_stress_concentration(self) -> str:
        try:
            if self.result is None:
                return "无法分析"
            if not hasattr(self.result, 'von_mises') or self.result.von_mises is None:
                return "无法分析"
            
            mean_vm = self.validated_stats['mean_von_mises']
            if mean_vm <= 0:
                return "未发现明显的应力集中区域"
            
            threshold = mean_vm * 1.5
            high_stress_count = int(np.sum(self.result.von_mises > threshold))
            if high_stress_count > 0:
                return f"存在 {high_stress_count} 个高应力集中单元，建议重点关注"
            return "未发现明显的应力集中区域"
        except Exception as e:
            logger.debug(f"识别应力集中失败: {e}")
            return "无法分析"

    def _add_page_number(self, canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 9)
        canvas.drawRightString(A4[0] - 2*cm, 1.5*cm, f"第 {doc.page} 页")
        canvas.restoreState()

    def _generate_json_report(self, output_path: str) -> str:
        output_file = Path(output_path) / "stress_analysis_report.json"
        output_file.parent.mkdir(parents=True, exist_ok=True)

        try:
            report_data = {
                'title': self.report_config.title,
                'generated_at': datetime.now().isoformat(),
                'project': self.validator.safe_str(getattr(self.config, 'project_name', '未知')),
                'converged': bool(getattr(self.result, 'converged', False)) if self.result else False,
                'summary': {
                    'max_von_mises_mpa': self.validated_stats['max_von_mises'] / 1e6,
                    'min_von_mises_mpa': self.validated_stats['min_von_mises'] / 1e6,
                    'mean_von_mises_mpa': self.validated_stats['mean_von_mises'] / 1e6,
                    'max_displacement_mm': self.validated_stats['max_displacement_magnitude'] * 1000,
                    'solve_time_s': float(getattr(self.result, 'solve_time', 0)) if self.result else 0,
                    'node_count': int(getattr(self.mesh, 'node_count', 0)) if self.mesh else 0,
                    'element_count': int(getattr(self.mesh, 'element_count', 0)) if self.mesh else 0
                },
                'geometry': {
                    'width': float(getattr(self.config.geometry, 'profile_width', 0)),
                    'height': float(getattr(self.config.geometry, 'profile_height', 0)),
                    'layer_count': int(getattr(self.config.geometry, 'layer_count', 0))
                },
                'layer_statistics': dict(getattr(self.statistics, 'layer_statistics', {})),
                'visual_files': [str(f) for f in self.visual_files],
                'errors': self._errors,
                'warnings': self._warnings
            }

            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(report_data, f, indent=2, ensure_ascii=False, default=str)

            logger.info(f"JSON报告已生成: {output_file}")
            return str(output_file)

        except Exception as e:
            logger.error(f"JSON报告生成失败: {e}")
            return self._generate_fallback_report(output_path, str(e))

    def _generate_fallback_report(self, output_path: str, error: str) -> str:
        output_file = Path(output_path) / "report_generation_failed.txt"
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("报告生成失败\n")
            f.write("=" * 50 + "\n")
            f.write(f"错误信息: {error}\n")
            f.write(f"时间: {datetime.now().isoformat()}\n")
            f.write("\n")
            f.write("基本信息:\n")
            f.write(f"  节点数: {getattr(self.mesh, 'node_count', 'N/A')}\n")
            f.write(f"  单元数: {getattr(self.mesh, 'element_count', 'N/A')}\n")
            f.write(f"  计算收敛: {getattr(self.result, 'converged', 'N/A')}\n")

        return str(output_file)
