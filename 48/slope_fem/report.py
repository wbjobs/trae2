"""
分析报告生成模块
==============

负责生成专业的边坡稳定性分析报告,
支持HTML和PDF格式输出,包含计算结果、图表和分析结论。
"""

import os
import json
import base64
import datetime
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from jinja2 import Template, Environment, FileSystemLoader
import numpy as np

from .parameters import SlopeParameters
from .mesh import SlopeMesh
from .fem_kernel import FEMResult, StrengthReductionResult
from .post_process import ProcessedResults, ResultsProcessor


@dataclass
class ReportData:
    """报告数据"""
    project_info: Dict = field(default_factory=dict)
    geometry: Dict = field(default_factory=dict)
    soil_layers: List[Dict] = field(default_factory=list)
    mesh_stats: Dict = field(default_factory=dict)
    result_stats: Dict = field(default_factory=dict)
    factor_of_safety: float = 0.0
    critical_reduction_factor: float = 0.0
    failure_analysis: Dict = field(default_factory=dict)
    convergence_data: Dict = field(default_factory=dict)
    plot_files: Dict = field(default_factory=dict)
    compute_time: float = 0.0
    report_date: str = ""


class ReportGenerator:
    """报告生成器"""

    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        self.template_dir = os.path.join(os.path.dirname(__file__), "templates")
        os.makedirs(self.template_dir, exist_ok=True)
        self._create_default_templates()

    def _create_default_templates(self) -> None:
        """创建默认报告模板（仅在模板不存在时创建）"""
        template_path = os.path.join(self.template_dir, "report_template.html")
        if os.path.exists(template_path):
            return
        self._write_default_template(template_path)

    def _write_default_template(self, template_path: str) -> None:
        """写入默认模板文件"""
        html_template = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>边坡稳定性有限元分析报告</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Microsoft YaHei', 'SimHei', sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #2c5aa0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #2c5aa0;
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header .subtitle {
            color: #666;
            font-size: 16px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section h2 {
            color: #2c5aa0;
            font-size: 20px;
            border-left: 4px solid #2c5aa0;
            padding-left: 10px;
            margin-bottom: 15px;
        }
        .section h3 {
            color: #444;
            font-size: 16px;
            margin-top: 15px;
            margin-bottom: 10px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .info-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border-left: 3px solid #2c5aa0;
        }
        .info-card .label {
            color: #666;
            font-size: 14px;
            margin-bottom: 5px;
        }
        .info-card .value {
            color: #333;
            font-size: 18px;
            font-weight: bold;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border: 1px solid #ddd;
        }
        th {
            background: #2c5aa0;
            color: white;
            font-weight: bold;
        }
        tr:nth-child(even) {
            background: #f8f9fa;
        }
        tr:hover {
            background: #e9ecef;
        }
        .fos-box {
            background: linear-gradient(135deg, #2c5aa0, #1a3a6c);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            margin: 20px 0;
        }
        .fos-box .fos-label {
            font-size: 18px;
            margin-bottom: 10px;
            opacity: 0.9;
        }
        .fos-box .fos-value {
            font-size: 48px;
            font-weight: bold;
        }
        .fos-box .fos-status {
            margin-top: 10px;
            font-size: 16px;
            padding: 5px 15px;
            border-radius: 20px;
            display: inline-block;
        }
        .status-safe {
            background: #28a745;
        }
        .status-warning {
            background: #ffc107;
            color: #333;
        }
        .status-danger {
            background: #dc3545;
        }
        .plot-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .plot-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
        }
        .plot-item img {
            width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 3px;
        }
        .plot-item .caption {
            text-align: center;
            margin-top: 10px;
            font-weight: bold;
            color: #444;
        }
        .convergence-table {
            margin-top: 15px;
        }
        .conclusion {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 20px;
            border-radius: 5px;
            margin-top: 20px;
        }
        .conclusion h3 {
            color: #856404;
            margin-bottom: 10px;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 14px;
        }
        .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: bold;
        }
        .badge-success {
            background: #d4edda;
            color: #155724;
        }
        .badge-warning {
            background: #fff3cd;
            color: #856404;
        }
        .badge-danger {
            background: #f8d7da;
            color: #721c24;
        }
        .empty-note {
            color: #999;
            font-style: italic;
            padding: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>边坡稳定性有限元分析报告</h1>
            <div class="subtitle">Slope Stability Finite Element Analysis Report</div>
        </div>

        <div class="section">
            <h2>一、项目信息</h2>
            <div class="info-grid">
                <div class="info-card">
                    <div class="label">项目名称</div>
                    <div class="value">{{ project_info.name | default('未命名项目') }}</div>
                </div>
                <div class="info-card">
                    <div class="label">项目编号</div>
                    <div class="value">{{ project_info.project_id | default('-') }}</div>
                </div>
                <div class="info-card">
                    <div class="label">分析日期</div>
                    <div class="value">{{ report_date }}</div>
                </div>
                <div class="info-card">
                    <div class="label">工程师</div>
                    <div class="value">{{ project_info.engineer | default('-') }}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>二、边坡几何参数</h2>
            <div class="info-grid">
                <div class="info-card">
                    <div class="label">边坡高度</div>
                    <div class="value">{{ geometry.height | default(0) }} m</div>
                </div>
                <div class="info-card">
                    <div class="label">边坡角度</div>
                    <div class="value">{{ geometry.angle | default(0) }}°</div>
                </div>
                {% if geometry.slope_length is defined %}
                <div class="info-card">
                    <div class="label">坡面长度</div>
                    <div class="value">{{ "%.2f"|format(geometry.slope_length) }} m</div>
                </div>
                {% endif %}
                <div class="info-card">
                    <div class="label">模型总宽度</div>
                    <div class="value">{{ geometry.total_width | default(0) }} m</div>
                </div>
                <div class="info-card">
                    <div class="label">模型总高度</div>
                    <div class="value">{{ geometry.total_height | default(0) }} m</div>
                </div>
                <div class="info-card">
                    <div class="label">坡顶宽度</div>
                    <div class="value">{{ geometry.crest_width | default(0) }} m</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>三、土层参数</h2>
            {% if soil_layers %}
            <table>
                <thead>
                    <tr>
                        <th>层号</th>
                        <th>土层名称</th>
                        <th>厚度 (m)</th>
                        <th>密度 (kg/m³)</th>
                        <th>弹性模量 (MPa)</th>
                        <th>泊松比</th>
                        <th>粘聚力 (kPa)</th>
                        <th>内摩擦角 (°)</th>
                    </tr>
                </thead>
                <tbody>
                    {% for layer in soil_layers %}
                    <tr>
                        <td>{{ loop.index }}</td>
                        <td>{{ layer.name | default('土层') }}</td>
                        <td>{{ layer.thickness | default(0) }}</td>
                        <td>{{ "%.0f"|format(layer.density | default(0)) }}</td>
                        <td>{{ "%.1f"|format(layer.young_modulus / 1e6) }}</td>
                        <td>{{ "%.2f"|format(layer.poisson_ratio | default(0.3)) }}</td>
                        <td>{{ "%.1f"|format(layer.cohesion / 1e3) }}</td>
                        <td>{{ "%.1f"|format(layer.friction_angle | default(0)) }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
            {% else %}
            <p class="empty-note">未定义土层参数</p>
            {% endif %}
        </div>

        <div class="section">
            <h2>四、网格信息</h2>
            {% if mesh_stats and mesh_stats.num_elements is defined and mesh_stats.num_elements > 0 %}
            <div class="info-grid">
                <div class="info-card">
                    <div class="label">节点数量</div>
                    <div class="value">{{ mesh_stats.num_nodes }}</div>
                </div>
                <div class="info-card">
                    <div class="label">单元数量</div>
                    <div class="value">{{ mesh_stats.num_elements }}</div>
                </div>
                <div class="info-card">
                    <div class="label">最小单元质量</div>
                    <div class="value">{{ "%.3f"|format(mesh_stats.min_quality | default(0)) }}</div>
                </div>
                <div class="info-card">
                    <div class="label">平均单元质量</div>
                    <div class="value">{{ "%.3f"|format(mesh_stats.mean_quality | default(0)) }}</div>
                </div>
            </div>
            {% else %}
            <p class="empty-note">网格信息不可用</p>
            {% endif %}
        </div>

        <div class="section">
            <h2>五、稳定性分析结果</h2>
            <div class="fos-box">
                <div class="fos-label">安全系数 Factor of Safety</div>
                <div class="fos-value">{{ "%.3f"|format(factor_of_safety) }}</div>
                {% if factor_of_safety >= 1.5 %}
                <div class="fos-status status-safe">✓ 稳定</div>
                {% elif factor_of_safety >= 1.2 %}
                <div class="fos-status status-warning">⚠ 基本稳定</div>
                {% elif factor_of_safety > 0 %}
                <div class="fos-status status-danger">✗ 不稳定</div>
                {% else %}
                <div class="fos-status status-danger">✗ 分析未完成</div>
                {% endif %}
            </div>

            <div class="info-grid">
                <div class="info-card">
                    <div class="label">临界折减系数</div>
                    <div class="value">{{ "%.3f"|format(critical_reduction_factor) }}</div>
                </div>
                <div class="info-card">
                    <div class="label">计算耗时</div>
                    <div class="value">{{ "%.2f"|format(compute_time) }} s</div>
                </div>
            </div>

            {% if result_stats and result_stats.displacement is defined %}
            <h3>计算结果统计</h3>
            <table>
                <thead>
                    <tr>
                        <th>指标</th>
                        <th>最大值</th>
                        <th>最小值</th>
                        <th>单位</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>位移大小</td>
                        <td>{{ "%.3f"|format(result_stats.displacement.max_magnitude * 1000) }}</td>
                        <td>-</td>
                        <td>mm</td>
                    </tr>
                    <tr>
                        <td>水平位移</td>
                        <td>{{ "%.3f"|format(result_stats.displacement.max_x * 1000) }}</td>
                        <td>-</td>
                        <td>mm</td>
                    </tr>
                    <tr>
                        <td>竖向位移</td>
                        <td>{{ "%.3f"|format(result_stats.displacement.max_y * 1000) }}</td>
                        <td>-</td>
                        <td>mm</td>
                    </tr>
                    {% if result_stats.stress is defined %}
                    <tr>
                        <td>水平正应力 σ_x</td>
                        <td>{{ "%.3f"|format(result_stats.stress.max_sigma_x / 1e6) }}</td>
                        <td>{{ "%.3f"|format(result_stats.stress.min_sigma_x / 1e6) }}</td>
                        <td>MPa</td>
                    </tr>
                    <tr>
                        <td>竖向正应力 σ_y</td>
                        <td>{{ "%.3f"|format(result_stats.stress.max_sigma_y / 1e6) }}</td>
                        <td>{{ "%.3f"|format(result_stats.stress.min_sigma_y / 1e6) }}</td>
                        <td>MPa</td>
                    </tr>
                    <tr>
                        <td>最大剪应力 τ_max</td>
                        <td>{{ "%.3f"|format(result_stats.stress.max_shear / 1e6) }}</td>
                        <td>-</td>
                        <td>MPa</td>
                    </tr>
                    {% endif %}
                </tbody>
            </table>
            {% else %}
            <p class="empty-note">计算结果统计数据不可用</p>
            {% endif %}
        </div>

        <div class="section">
            <h2>六、滑动面分析</h2>
            {% if failure_analysis and failure_analysis.min_x is defined %}
            <div class="info-grid">
                <div class="info-card">
                    <div class="label">滑动面范围 X</div>
                    <div class="value">{{ "%.2f"|format(failure_analysis.min_x) }} - {{ "%.2f"|format(failure_analysis.max_x) }} m</div>
                </div>
                <div class="info-card">
                    <div class="label">滑动面范围 Y</div>
                    <div class="value">{{ "%.2f"|format(failure_analysis.min_y) }} - {{ "%.2f"|format(failure_analysis.max_y) }} m</div>
                </div>
                <div class="info-card">
                    <div class="label">滑动深度</div>
                    <div class="value">{{ "%.2f"|format(failure_analysis.slope_depth) }} m</div>
                </div>
                {% if failure_analysis.approximate_length %}
                <div class="info-card">
                    <div class="label">滑动面近似长度</div>
                    <div class="value">{{ "%.2f"|format(failure_analysis.approximate_length) }} m</div>
                </div>
                {% endif %}
            </div>
            {% else %}
            <p class="empty-note">未识别到明显的滑动面。</p>
            {% endif %}
        </div>

        {% if convergence_data and convergence_data.factors is defined and convergence_data.factors | length > 0 %}
        <div class="section">
            <h2>七、收敛过程</h2>
            <table class="convergence-table">
                <thead>
                    <tr>
                        <th>折减系数</th>
                        <th>最大位移 (mm)</th>
                        <th>收敛状态</th>
                    </tr>
                </thead>
                <tbody>
                    {% for i in range(convergence_data.factors | length) %}
                    <tr>
                        <td>{{ "%.2f"|format(convergence_data.factors[i]) }}</td>
                        <td>{{ "%.4f"|format(convergence_data.displacements[i] * 1000) }}</td>
                        <td>
                            {% if convergence_data.displacements[i] < 1e10 %}
                            <span class="badge badge-success">收敛</span>
                            {% else %}
                            <span class="badge badge-danger">不收敛</span>
                            {% endif %}
                        </td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
        {% endif %}

        <div class="section">
            <h2>{% if convergence_data and convergence_data.factors is defined %}八{% else %}七{% endif %}、结果可视化</h2>
            {% if plot_files and plot_files | length > 0 %}
            <div class="plot-grid">
                {% for name, file in plot_files.items() %}
                <div class="plot-item">
                    <img src="{{ file }}" alt="{{ name }}" onerror="this.alt='图片加载失败: {{ name }}'; this.style.display='none'; this.parentElement.innerHTML += '<p class=empty-note>图片不可用: {{ name }}</p>';">
                    <div class="caption">{{ name }}</div>
                </div>
                {% endfor %}
            </div>
            {% else %}
            <p class="empty-note">无可视化图表</p>
            {% endif %}
        </div>

        <div class="section">
            <h2>{% if convergence_data and convergence_data.factors is defined %}九{% else %}八{% endif %}、分析结论</h2>
            <div class="conclusion">
                <h3>结论摘要</h3>
                <p>
                    {% if factor_of_safety >= 1.5 %}
                    本边坡安全系数为 <strong>{{ "%.3f"|format(factor_of_safety) }}</strong>，大于规范要求的1.5，边坡处于<strong>稳定状态</strong>。
                    {% elif factor_of_safety >= 1.2 %}
                    本边坡安全系数为 <strong>{{ "%.3f"|format(factor_of_safety) }}</strong>，介于1.2和1.5之间，边坡处于<strong>基本稳定状态</strong>，建议采取适当的加固措施。
                    {% elif factor_of_safety > 0 %}
                    本边坡安全系数为 <strong>{{ "%.3f"|format(factor_of_safety) }}</strong>，小于规范要求的1.2，边坡处于<strong>不稳定状态</strong>，必须立即采取加固处理措施。
                    {% else %}
                    边坡分析<strong>未完成</strong>，无法给出稳定性评价，请检查输入参数和计算过程。
                    {% endif %}
                </p>
                <h3>建议</h3>
                <ul>
                    {% if factor_of_safety < 1.5 and factor_of_safety > 0 %}
                    <li>建议对边坡进行加固处理，可采用锚杆、土钉墙或抗滑桩等加固方案</li>
                    <li>加强边坡监测，包括位移监测和应力监测</li>
                    <li>做好边坡排水系统，防止雨水渗入软化土体</li>
                    {% endif %}
                    {% if factor_of_safety < 1.2 and factor_of_safety > 0 %}
                    <li>立即启动应急预案，必要时疏散边坡附近人员</li>
                    <li>组织专家论证，制定专项加固方案</li>
                    {% endif %}
                    {% if factor_of_safety >= 1.5 %}
                    <li>边坡稳定性满足规范要求，可正常使用</li>
                    <li>建议定期进行边坡巡检</li>
                    {% endif %}
                    {% if factor_of_safety <= 0 %}
                    <li>请检查边坡几何参数和材料参数是否合理</li>
                    <li>请检查网格质量是否满足要求</li>
                    <li>请检查边界条件是否正确施加</li>
                    {% endif %}
                </ul>
            </div>
        </div>

        <div class="footer">
            <p>本报告由边坡稳定性有限元分析系统自动生成</p>
            <p>报告生成时间: {{ report_date }}</p>
            <p>© 2024 岩土工程分析软件</p>
        </div>
    </div>
</body>
</html>
        """

        with open(template_path, 'w', encoding='utf-8') as f:
            f.write(html_template)

    def prepare_report_data(self, parameters: SlopeParameters, mesh: SlopeMesh,
                            fem_result: FEMResult, processed_results: ProcessedResults,
                            sr_result: Optional[StrengthReductionResult] = None,
                            processor: Optional[ResultsProcessor] = None) -> ReportData:
        """准备报告数据"""
        report_data = ReportData()

        report_data.project_info = {
            "name": parameters.project_info.name,
            "project_id": parameters.project_info.project_id,
            "engineer": parameters.project_info.engineer,
            "notes": parameters.project_info.notes,
        }

        report_data.geometry = {
            "height": parameters.geometry.height,
            "angle": parameters.geometry.angle,
            "crest_width": parameters.geometry.crest_width,
            "toe_width": parameters.geometry.toe_width,
            "total_width": parameters.geometry.total_width,
            "total_height": parameters.geometry.total_height,
            "slope_length": parameters.geometry.slope_length,
        }

        report_data.soil_layers = [
            {
                "name": layer.name,
                "thickness": layer.thickness,
                "density": layer.density,
                "young_modulus": layer.young_modulus,
                "poisson_ratio": layer.poisson_ratio,
                "cohesion": layer.cohesion,
                "friction_angle": layer.friction_angle,
            }
            for layer in parameters.soil_layers
        ]

        mesh_stats = mesh.compute_statistics()
        report_data.mesh_stats = mesh_stats

        if processor is not None:
            report_data.result_stats = processor.compute_statistics(processed_results)

        if sr_result is not None:
            report_data.factor_of_safety = sr_result.factor_of_safety
            report_data.critical_reduction_factor = sr_result.critical_reduction_factor
            if processor is not None:
                report_data.failure_analysis = processor.analyze_failure_surface(sr_result)

            factors, displacements = sr_result.get_convergence_curve()
            report_data.convergence_data = {
                "factors": factors.tolist(),
                "displacements": displacements.tolist(),
            }

        report_data.compute_time = fem_result.compute_time if fem_result else 0.0

        report_data.report_date = datetime.datetime.now().strftime("%Y年%m月%d日 %H:%M:%S")

        return report_data

    def _embed_image_as_base64(self, image_path: str) -> str:
        """将图片文件编码为base64 data URI"""
        abs_path = os.path.abspath(image_path)
        if not os.path.exists(abs_path):
            candidate = os.path.join(self.output_dir, image_path)
            if os.path.exists(candidate):
                abs_path = candidate
            else:
                return image_path

        ext = os.path.splitext(abs_path)[1].lower()
        mime_map = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif', '.svg': 'image/svg+xml'}
        mime = mime_map.get(ext, 'image/png')

        try:
            with open(abs_path, 'rb') as f:
                data = base64.b64encode(f.read()).decode('utf-8')
            return f"data:{mime};base64,{data}"
        except Exception:
            return image_path

    def generate_html_report(self, report_data: ReportData,
                              plot_files: Optional[Dict[str, str]] = None,
                              filename: str = "slope_analysis_report.html",
                              embed_images: bool = True) -> str:
        """生成HTML报告"""
        if plot_files:
            report_data.plot_files = plot_files

        if embed_images and report_data.plot_files:
            embedded = {}
            for name, path in report_data.plot_files.items():
                embedded[name] = self._embed_image_as_base64(path)
            report_data.plot_files = embedded

        safe_result_stats = report_data.result_stats if report_data.result_stats else {
            "displacement": {"max_magnitude": 0, "max_x": 0, "max_y": 0},
            "stress": {"max_sigma_x": 0, "min_sigma_x": 0, "max_sigma_y": 0,
                       "min_sigma_y": 0, "max_shear": 0},
            "strain": {}
        }

        template_path = os.path.join(self.template_dir, "report_template.html")
        if not os.path.exists(template_path):
            self._write_default_template(template_path)

        env = Environment(loader=FileSystemLoader(self.template_dir))
        template = env.get_template("report_template.html")

        html_content = template.render(
            project_info=report_data.project_info,
            geometry=report_data.geometry,
            soil_layers=report_data.soil_layers,
            mesh_stats=report_data.mesh_stats,
            result_stats=safe_result_stats,
            factor_of_safety=report_data.factor_of_safety,
            critical_reduction_factor=report_data.critical_reduction_factor,
            failure_analysis=report_data.failure_analysis,
            convergence_data=report_data.convergence_data,
            plot_files=report_data.plot_files,
            compute_time=report_data.compute_time,
            report_date=report_data.report_date,
        )

        filepath = os.path.join(self.output_dir, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html_content)

        return filepath

    def generate_json_report(self, report_data: ReportData,
                              filename: str = "slope_analysis_report.json") -> str:
        """生成JSON格式报告"""
        data = {
            "project_info": report_data.project_info,
            "geometry": report_data.geometry,
            "soil_layers": report_data.soil_layers,
            "mesh_stats": report_data.mesh_stats,
            "result_stats": report_data.result_stats,
            "factor_of_safety": report_data.factor_of_safety,
            "critical_reduction_factor": report_data.critical_reduction_factor,
            "failure_analysis": report_data.failure_analysis,
            "convergence_data": report_data.convergence_data,
            "compute_time": report_data.compute_time,
            "report_date": report_data.report_date,
        }

        filepath = os.path.join(self.output_dir, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

        return filepath

    def generate_summary_text(self, report_data: ReportData) -> str:
        """生成文本摘要"""
        lines = [
            "=" * 60,
            "边坡稳定性分析报告摘要",
            "=" * 60,
            "",
            f"项目名称: {report_data.project_info.get('name', '未知')}",
            f"报告日期: {report_data.report_date}",
            "",
            "-" * 40,
            "分析结果:",
            f"  安全系数 (FOS): {report_data.factor_of_safety:.3f}",
            f"  临界折减系数: {report_data.critical_reduction_factor:.3f}",
        ]

        if report_data.factor_of_safety >= 1.5:
            status = "稳定"
        elif report_data.factor_of_safety >= 1.2:
            status = "基本稳定"
        else:
            status = "不稳定"

        lines.append(f"  稳定性评价: {status}")
        lines.append("")

        if report_data.result_stats:
            lines.append("-" * 40)
            lines.append("主要结果统计:")
            disp = report_data.result_stats.get("displacement", {})
            stress = report_data.result_stats.get("stress", {})
            lines.append(f"  最大位移: {disp.get('max_magnitude', 0) * 1000:.3f} mm")
            lines.append(f"  最大水平位移: {disp.get('max_x', 0) * 1000:.3f} mm")
            lines.append(f"  最大竖向位移: {disp.get('max_y', 0) * 1000:.3f} mm")
            lines.append(f"  最大剪应力: {stress.get('max_shear', 0) / 1e6:.3f} MPa")

        lines.append("")
        lines.append(f"计算耗时: {report_data.compute_time:.2f} 秒")
        lines.append("=" * 60)

        return "\n".join(lines)
