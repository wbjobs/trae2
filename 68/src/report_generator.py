import os
from datetime import datetime
from typing import Dict, List, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY


class ReportGenerator:
    def __init__(self, output_dir: str = './output', project_name: str = 'Seepage Analysis'):
        self.output_dir = output_dir
        self.project_name = project_name
        os.makedirs(output_dir, exist_ok=True)
        
        self.styles = getSampleStyleSheet()
        self._setup_styles()
    
    def _setup_styles(self):
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=20,
            alignment=TA_CENTER,
            spaceAfter=20,
            textColor=colors.darkblue
        )
        
        self.subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=self.styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=14,
            alignment=TA_CENTER,
            spaceAfter=15,
            textColor=colors.grey
        )
        
        self.heading_style = ParagraphStyle(
            'CustomHeading',
            parent=self.styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=14,
            spaceBefore=15,
            spaceAfter=10,
            textColor=colors.darkblue,
            borderWidth=0,
            borderPadding=0,
            borderColor=None
        )
        
        self.subheading_style = ParagraphStyle(
            'CustomSubheading',
            parent=self.styles['Heading3'],
            fontName='Helvetica-Bold',
            fontSize=12,
            spaceBefore=10,
            spaceAfter=8,
            textColor=colors.darkslategray
        )
        
        self.body_style = ParagraphStyle(
            'CustomBody',
            parent=self.styles['BodyText'],
            fontName='Helvetica',
            fontSize=10,
            leading=14,
            alignment=TA_JUSTIFY,
            spaceAfter=8
        )
        
        self.normal_style = ParagraphStyle(
            'CustomNormal',
            parent=self.styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=12
        )
        
        self.table_header_style = ParagraphStyle(
            'TableHeader',
            parent=self.styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            textColor=colors.white,
            alignment=TA_CENTER
        )
        
        self.table_content_style = ParagraphStyle(
            'TableContent',
            parent=self.styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            alignment=TA_CENTER
        )
    
    def generate_report(self, params_parser, mesh_data, fem_result, 
                       plot_paths: Dict[str, str], 
                       statistics: Dict, filename: str = 'seepage_analysis_report.pdf') -> str:
        output_path = os.path.join(self.output_dir, filename)
        
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        story = []
        story.extend(self._generate_cover_page())
        story.extend(self._generate_summary_section(params_parser, mesh_data, fem_result, statistics))
        story.extend(self._generate_geometry_section(params_parser))
        story.extend(self._generate_mesh_section(mesh_data))
        story.extend(self._generate_results_section(plot_paths, statistics))
        story.extend(self._generate_conclusions_section(fem_result, statistics))
        
        doc.build(story, onFirstPage=self._add_page_number, onLaterPages=self._add_page_number)
        
        return output_path
    
    def _generate_cover_page(self) -> List:
        story = []
        
        story.append(Spacer(1, 3*cm))
        
        story.append(Paragraph("尾矿库坝体渗流场", self.title_style))
        story.append(Paragraph("有限元分析报告", self.title_style))
        
        story.append(Spacer(1, 2*cm))
        
        current_time = datetime.now().strftime("%Y年%m月%d日 %H:%M")
        story.append(Paragraph(f"生成时间：{current_time}", self.subtitle_style))
        
        story.append(Spacer(1, 1*cm))
        story.append(Paragraph(self.project_name, self.subtitle_style))
        
        story.append(Spacer(1, 4*cm))
        
        report_info = [
            ['项目名称:', self.project_name],
            ['报告类型:', '渗流场有限元分析'],
            ['生成时间:', datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
            ['软件版本:', 'Seepage FEM v1.0.0']
        ]
        
        info_table = Table(report_info, colWidths=[4*cm, 8*cm])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(info_table)
        
        story.append(PageBreak())
        return story
    
    def _safe_get_stat(self, statistics, category, key, default='N/A', fmt=None):
        try:
            if statistics is None or category not in statistics or key not in statistics[category]:
                return default
            value = statistics[category][key]
            if fmt is not None:
                return fmt.format(value)
            return str(value)
        except Exception:
            return default
    
    def _generate_summary_section(self, params_parser, mesh_data, fem_result, statistics) -> List:
        story = []
        
        story.append(Paragraph("1. 执行摘要", self.heading_style))
        story.append(Spacer(1, 0.3*cm))
        
        summary_text = """
        本报告基于有限元方法对尾矿库坝体进行了渗流场数值模拟分析。计算采用稳定渗流模型，
        考虑了坝体分层材料的渗透特性，获得了坝体内部的水头分布、孔隙水压力、渗流速度及水力梯度等关键参数。
        """
        story.append(Paragraph(summary_text.strip(), self.body_style))
        
        story.append(Paragraph("1.1 计算结果汇总", self.subheading_style))
        
        summary_data = [
            ['参数', '最大值', '最小值', '平均值', '单位'],
            ['水头', 
             self._safe_get_stat(statistics, 'hydraulic_head', 'max', fmt='{:.2f}'), 
             self._safe_get_stat(statistics, 'hydraulic_head', 'min', fmt='{:.2f}'), 
             self._safe_get_stat(statistics, 'hydraulic_head', 'mean', fmt='{:.2f}'), 'm'],
            ['孔隙水压力', 
             self._safe_get_stat(statistics, 'pressure', 'max', fmt='{:.2f}'), 
             self._safe_get_stat(statistics, 'pressure', 'min', fmt='{:.2f}'), 
             self._safe_get_stat(statistics, 'pressure', 'mean', fmt='{:.2f}'), 'kPa'],
            ['渗流速度', 
             self._safe_get_stat(statistics, 'velocity', 'max', fmt='{:.2e}'), 
             self._safe_get_stat(statistics, 'velocity', 'min', fmt='{:.2e}'), 
             self._safe_get_stat(statistics, 'velocity', 'mean', fmt='{:.2e}'), 'm/s'],
            ['水力梯度', 
             self._safe_get_stat(statistics, 'hydraulic_gradient', 'max', fmt='{:.4f}'), 
             self._safe_get_stat(statistics, 'hydraulic_gradient', 'min', fmt='{:.4f}'), 
             self._safe_get_stat(statistics, 'hydraulic_gradient', 'mean', fmt='{:.4f}'), '-']
        ]
        
        summary_table = Table(summary_data, colWidths=[3*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2*cm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(summary_table)
        
        story.append(Spacer(1, 0.5*cm))
        
        story.append(Paragraph("1.2 计算信息", self.subheading_style))
        
        sim_type = params_parser.simulation_params.simulation_type if hasattr(params_parser, 'simulation_params') else '稳态'
        
        calc_data = [
            ['计算类型', sim_type],
            ['网格节点数', f"{mesh_data.num_nodes}"],
            ['网格单元数', f"{mesh_data.num_elements}"],
            ['迭代次数', f"{fem_result.num_iterations if hasattr(fem_result, 'num_iterations') else 0}"],
            ['计算时间', f"{fem_result.solve_time if hasattr(fem_result, 'solve_time') else 0:.2f} s"],
            ['收敛状态', '收敛' if (hasattr(fem_result, 'converged') and fem_result.converged) else '未收敛']
        ]
        
        calc_table = Table(calc_data, colWidths=[4*cm, 6*cm])
        calc_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(calc_table)
        
        story.append(PageBreak())
        return story
    
    def _generate_geometry_section(self, params_parser) -> List:
        story = []
        
        story.append(Paragraph("2. 坝体几何与材料参数", self.heading_style))
        story.append(Spacer(1, 0.3*cm))
        
        geom = params_parser.dam_geometry
        if geom:
            story.append(Paragraph("2.1 坝体几何参数", self.subheading_style))
            
            geom_data = [
                ['参数', '数值', '单位'],
                ['坝高', f"{geom.dam_height:.2f}", 'm'],
                ['坝顶宽度', f"{geom.crest_width:.2f}", 'm'],
                ['上游坡度', f"1:{geom.upstream_slope:.2f}", ''],
                ['下游坡度', f"1:{geom.downstream_slope:.2f}", ''],
                ['基础深度', f"{geom.foundation_depth:.2f}", 'm'],
                ['库水位', f"{geom.reservoir_water_level:.2f}", 'm'],
                ['下游水位', f"{geom.tailwater_level:.2f}", 'm'],
                ['坝长', f"{geom.dam_length:.2f}", 'm']
            ]
            
            geom_table = Table(geom_data, colWidths=[4*cm, 3*cm, 2*cm])
            geom_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(geom_table)
            
            story.append(Spacer(1, 0.5*cm))
        
        story.append(Paragraph("2.2 土层材料参数", self.subheading_style))
        
        soil_data = [
            ['土层编号', '名称', '厚度', '水平渗透系数', '垂直渗透系数', '孔隙率'],
        ]
        
        for i, layer in enumerate(params_parser.soil_layers):
            soil_data.append([
                f"{i+1}",
                layer.name,
                f"{layer.thickness:.2f} m",
                f"{layer.permeability_x:.2e} m/s",
                f"{layer.permeability_y:.2e} m/s",
                f"{layer.porosity:.3f}"
            ])
        
        soil_table = Table(soil_data, colWidths=[2*cm, 3*cm, 2*cm, 2.8*cm, 2.8*cm, 2*cm])
        soil_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(soil_table)
        
        story.append(PageBreak())
        return story
    
    def _generate_mesh_section(self, mesh_data) -> List:
        story = []
        
        story.append(Paragraph("3. 有限元网格", self.heading_style))
        story.append(Spacer(1, 0.3*cm))
        
        mesh_text = f"""
        计算采用结构化四边形网格，共包含 {mesh_data.num_nodes} 个节点和 {mesh_data.num_elements} 个单元。
        网格尺寸为 {mesh_data.mesh_size:.2f} m，能够较好地捕捉坝体渗流场的空间分布特征。
        """
        story.append(Paragraph(mesh_text.strip(), self.body_style))
        
        if 'mesh' in mesh_data.boundary_nodes:
            pass
        
        story.append(Spacer(1, 0.5*cm))
        
        mesh_quality_data = [
            ['网格质量指标', '数值'],
            ['节点总数', f"{mesh_data.num_nodes}"],
            ['单元总数', f"{mesh_data.num_elements}"],
            ['网格尺寸', f"{mesh_data.mesh_size:.2f} m"],
            ['边界数量', f"{len(mesh_data.boundary_nodes)}"],
        ]
        
        mesh_quality_table = Table(mesh_quality_data, colWidths=[5*cm, 5*cm])
        mesh_quality_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(mesh_quality_table)
        
        story.append(PageBreak())
        return story
    
    def _generate_results_section(self, plot_paths: Dict[str, str], statistics) -> List:
        story = []
        
        story.append(Paragraph("4. 计算结果分析", self.heading_style))
        story.append(Spacer(1, 0.3*cm))
        
        sections = [
            ('4.1 水头分布', 'hydraulic_head', '水头分布云图显示了坝体内部总水头的空间变化。等水头线的分布特征反映了渗流的主要方向和强度。'),
            ('4.2 孔隙水压力分布', 'pressure', '孔隙水压力分布反映了坝体内部的静水压力分布，是评估坝体稳定性的重要参数。'),
            ('4.3 渗流速度场', 'velocity_field', '渗流速度场展示了坝体内部水流的运动状态。高流速区域通常出现在渗透系数较大的材料或水力梯度较大的位置。'),
            ('4.4 水力梯度分布', 'hydraulic_gradient', '水力梯度是渗流力的来源，过高的水力梯度可能导致渗透破坏。'),
            ('4.5 浸润线位置', 'phreatic_line', '浸润线是坝体内自由水面的位置，其上方为非饱和区，下方为饱和区。')
        ]
        
        max_width = 15 * cm
        max_height = 10 * cm
        
        for title, key, description in sections:
            story.append(Paragraph(title, self.subheading_style))
            story.append(Paragraph(description, self.body_style))
            
            if plot_paths and key in plot_paths and plot_paths[key] and os.path.exists(plot_paths[key]):
                try:
                    from PIL import Image as PILImage
                    with PILImage.open(plot_paths[key]) as img_pil:
                        original_width, original_height = img_pil.size
                        
                        aspect_ratio = original_width / original_height
                        
                        if aspect_ratio > (max_width / max_height):
                            display_width = max_width
                            display_height = max_width / aspect_ratio
                        else:
                            display_height = max_height
                            display_width = max_height * aspect_ratio
                        
                        display_width = min(display_width, max_width)
                        display_height = min(display_height, max_height)
                    
                    img = Image(plot_paths[key], width=display_width, height=display_height)
                    story.append(img)
                except Exception as e:
                    story.append(Paragraph(f"（图表加载失败：{str(e)}）", self.body_style))
            else:
                story.append(Paragraph("（暂无图表）", self.body_style))
            
            story.append(Spacer(1, 0.5*cm))
        
        story.append(PageBreak())
        return story
    
    def _generate_conclusions_section(self, fem_result, statistics) -> List:
        story = []
        
        story.append(Paragraph("5. 结论与建议", self.heading_style))
        story.append(Spacer(1, 0.3*cm))
        
        max_head = self._safe_get_stat(statistics, 'hydraulic_head', 'max', 'N/A', '{:.2f}')
        min_head = self._safe_get_stat(statistics, 'hydraulic_head', 'min', 'N/A', '{:.2f}')
        max_pressure = self._safe_get_stat(statistics, 'pressure', 'max', 'N/A', '{:.2f}')
        max_velocity = self._safe_get_stat(statistics, 'velocity', 'max', 'N/A', '{:.2e}')
        max_gradient = self._safe_get_stat(statistics, 'hydraulic_gradient', 'max', 'N/A', '{:.4f}')
        
        conclusion_lines = [
            "根据本次渗流场有限元分析结果，可得出以下主要结论：",
            "",
            f"1. 水头分布：坝体内部水头从上游到下游逐渐降低，符合一般渗流规律。最大水头为 {max_head} m，最小水头为 {min_head} m。",
            "",
            f"2. 孔隙水压力：最大孔隙水压力为 {max_pressure} kPa，出现在坝体基础部位。",
            "",
            f"3. 渗流速度：最大渗流速度为 {max_velocity} m/s，整体渗流场稳定。",
            "",
            f"4. 水力梯度：最大水力梯度为 {max_gradient}，需关注高梯度区域的渗透稳定性。"
        ]
        
        for line in conclusion_lines:
            if line.strip():
                story.append(Paragraph(line.strip(), self.body_style))
            else:
                story.append(Spacer(1, 0.2*cm))
        
        story.append(Spacer(1, 0.5*cm))
        
        story.append(Paragraph("5.1 建议", self.subheading_style))
        
        suggestion_lines = [
            "基于分析结果，提出以下建议：",
            "",
            "1. 对于水力梯度较高的区域，建议加强监测，防止发生渗透破坏。",
            "",
            "2. 建议定期进行渗流监测，对比数值模拟结果与实际监测数据。",
            "",
            "3. 在坝体下游设置有效的排水系统，降低浸润线位置，提高坝体稳定性。",
            "",
            "4. 建议进行坝体稳定性分析，结合渗流场结果评估坝体的抗滑和抗渗稳定性。"
        ]
        
        for line in suggestion_lines:
            if line.strip():
                story.append(Paragraph(line.strip(), self.body_style))
            else:
                story.append(Spacer(1, 0.2*cm))
        
        return story
    
    def _add_page_number(self, canvas, doc):
        canvas.saveState()
        
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.grey)
        
        page_num = canvas.getPageNumber()
        canvas.drawCentredString(A4[0] / 2, 1.5 * cm, f"第 {page_num} 页")
        
        canvas.drawString(2 * cm, 1.5 * cm, "尾矿库坝体渗流场有限元分析报告")
        canvas.drawRightString(A4[0] - 2 * cm, 1.5 * cm, "Seepage FEM v1.0.0")
        
        canvas.restoreState()
