"""
工况对比分析模块
===============

支持多工况边坡分析结果的对比分析，
包括参数敏感性分析、安全系数对比、
位移应力场对比、收敛性能对比等。
"""

import os
import json
import logging
import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
from enum import Enum
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.collections import PatchCollection

from .scenarios import ScenarioResult
from .data_models import AnalysisResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ComparisonMetric(Enum):
    """对比指标"""
    FACTOR_OF_SAFETY = "factor_of_safety"
    MAX_DISPLACEMENT = "max_displacement"
    MAX_SHEAR_STRESS = "max_shear_stress"
    COMPUTE_TIME = "compute_time"
    NUM_ITERATIONS = "num_iterations"
    MESH_QUALITY = "mesh_quality"


@dataclass
class ComparisonData:
    """对比数据"""
    scenario_ids: List[str]
    scenario_names: List[str]
    metrics: Dict[str, List[float]]
    baseline_index: int = 0
    differences: Dict[str, List[float]] = field(default_factory=dict)
    percentage_changes: Dict[str, List[float]] = field(default_factory=dict)


@dataclass
class SensitivityAnalysis:
    """敏感性分析结果"""
    parameter_name: str
    parameter_values: List[float]
    factor_of_safety: List[float]
    sensitivity_coefficient: float
    correlation: float


class ScenarioComparison:
    """工况对比分析器"""

    def __init__(self, results: List[ScenarioResult]):
        self.results = results
        self.comparison_data: Optional[ComparisonData] = None
        self.baseline_index = 0

        for i, result in enumerate(results):
            if result.status == "completed":
                self.baseline_index = i
                break

    def compute_comparison(self) -> ComparisonData:
        """计算对比数据"""
        scenario_ids = [r.scenario_id for r in self.results]
        scenario_names = [r.name for r in self.results]

        metrics = {
            "factor_of_safety": [r.factor_of_safety for r in self.results],
            "max_displacement": [r.max_displacement for r in self.results],
            "max_shear_stress": [r.max_shear_stress for r in self.results],
            "compute_time": [r.compute_time for r in self.results],
        }

        baseline_fos = metrics["factor_of_safety"][self.baseline_index]
        baseline_disp = metrics["max_displacement"][self.baseline_index]
        baseline_stress = metrics["max_shear_stress"][self.baseline_index]
        baseline_time = metrics["compute_time"][self.baseline_index]

        differences = {
            "factor_of_safety": [fos - baseline_fos for fos in metrics["factor_of_safety"]],
            "max_displacement": [d - baseline_disp for d in metrics["max_displacement"]],
            "max_shear_stress": [s - baseline_stress for s in metrics["max_shear_stress"]],
            "compute_time": [t - baseline_time for t in metrics["compute_time"]],
        }

        percentage_changes = {
            "factor_of_safety": [
                (fos - baseline_fos) / baseline_fos * 100 if baseline_fos != 0 else 0.0
                for fos in metrics["factor_of_safety"]
            ],
            "max_displacement": [
                (d - baseline_disp) / baseline_disp * 100 if baseline_disp != 0 else 0.0
                for d in metrics["max_displacement"]
            ],
            "max_shear_stress": [
                (s - baseline_stress) / baseline_stress * 100 if baseline_stress != 0 else 0.0
                for s in metrics["max_shear_stress"]
            ],
            "compute_time": [
                (t - baseline_time) / baseline_time * 100 if baseline_time != 0 else 0.0
                for t in metrics["compute_time"]
            ],
        }

        self.comparison_data = ComparisonData(
            scenario_ids=scenario_ids,
            scenario_names=scenario_names,
            metrics=metrics,
            baseline_index=self.baseline_index,
            differences=differences,
            percentage_changes=percentage_changes
        )

        return self.comparison_data

    def find_best_scenario(self, metric: ComparisonMetric = ComparisonMetric.FACTOR_OF_SAFETY,
                            maximize: bool = True) -> Tuple[int, ScenarioResult]:
        """查找最优工况"""
        metric_key = metric.value
        valid_results = [(i, r) for i, r in enumerate(self.results) if r.status == "completed"]

        if not valid_results:
            raise ValueError("没有有效的工况结果")

        if maximize:
            best_idx, best_result = max(valid_results, key=lambda x: getattr(x[1], metric_key))
        else:
            best_idx, best_result = min(valid_results, key=lambda x: getattr(x[1], metric_key))

        return best_idx, best_result

    def get_summary_table(self) -> str:
        """生成汇总表格（文本格式）"""
        if self.comparison_data is None:
            self.compute_comparison()

        lines = []
        lines.append("=" * 100)
        lines.append("工况对比汇总表")
        lines.append("=" * 100)
        lines.append(f"{'工况名称':<30} {'FOS':>8} {'ΔFOS':>8} {'ΔFOS%':>8} {'最大位移(m)':>10} {'最大剪应力(Pa)':>12} {'计算时间(s)':>10}")
        lines.append("-" * 100)

        for i, name in enumerate(self.comparison_data.scenario_names):
            fos = self.comparison_data.metrics["factor_of_safety"][i]
            delta_fos = self.comparison_data.differences["factor_of_safety"][i]
            delta_fos_pct = self.comparison_data.percentage_changes["factor_of_safety"][i]
            disp = self.comparison_data.metrics["max_displacement"][i]
            stress = self.comparison_data.metrics["max_shear_stress"][i]
            time = self.comparison_data.metrics["compute_time"][i]

            baseline_marker = " (基准)" if i == self.baseline_index else ""

            lines.append(
                f"{name[:28] + '...' if len(name) > 30 else name:<30} "
                f"{fos:>8.3f} "
                f"{delta_fos:>+8.3f} "
                f"{delta_fos_pct:>+7.1f}% "
                f"{disp:>10.6f} "
                f"{stress:>12.2e} "
                f"{time:>10.2f}{baseline_marker}"
            )

        lines.append("=" * 100)
        return "\n".join(lines)

    def plot_factor_of_safety_comparison(self, output_path: str) -> None:
        """绘制安全系数对比图"""
        if self.comparison_data is None:
            self.compute_comparison()

        fig, ax = plt.subplots(figsize=(12, 6))

        x = range(len(self.comparison_data.scenario_names))
        fos_values = self.comparison_data.metrics["factor_of_safety"]
        colors = ['#2196F3' if i != self.baseline_index else '#4CAF50' for i in x]

        bars = ax.bar(x, fos_values, color=colors, edgecolor='black', linewidth=0.5)

        for i, (bar, fos) in enumerate(zip(bars, fos_values)):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height + 0.01,
                    f'{fos:.3f}', ha='center', va='bottom', fontsize=9)

        ax.set_xlabel('工况', fontsize=12)
        ax.set_ylabel('安全系数 (FOS)', fontsize=12)
        ax.set_title('各工况安全系数对比', fontsize=14, fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels(self.comparison_data.scenario_names, rotation=45, ha='right', fontsize=9)
        ax.grid(axis='y', alpha=0.3)
        ax.axhline(y=1.0, color='red', linestyle='--', linewidth=1, label='安全阈值 (FOS=1.0)')
        ax.legend()

        plt.tight_layout()
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"安全系数对比图已保存: {output_path}")

    def plot_sensitivity_curve(self, parameter_values: List[float],
                                fos_values: List[float],
                                parameter_name: str,
                                output_path: str) -> None:
        """绘制敏感性曲线"""
        fig, ax = plt.subplots(figsize=(10, 6))

        ax.plot(parameter_values, fos_values, 'o-', color='#2196F3', linewidth=2, markersize=8)

        for x, y in zip(parameter_values, fos_values):
            ax.annotate(f'{y:.3f}', (x, y), textcoords="offset points",
                       xytext=(0, 10), ha='center', fontsize=9)

        ax.set_xlabel(parameter_name, fontsize=12)
        ax.set_ylabel('安全系数 (FOS)', fontsize=12)
        ax.set_title(f'安全系数对 {parameter_name} 的敏感性曲线', fontsize=14, fontweight='bold')
        ax.grid(True, alpha=0.3)
        ax.axhline(y=1.0, color='red', linestyle='--', linewidth=1, label='安全阈值 (FOS=1.0)')
        ax.legend()

        plt.tight_layout()
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"敏感性曲线已保存: {output_path}")

    def plot_displacement_comparison(self, output_path: str) -> None:
        """绘制位移对比图"""
        if self.comparison_data is None:
            self.compute_comparison()

        fig, ax = plt.subplots(figsize=(12, 6))

        x = range(len(self.comparison_data.scenario_names))
        disp_values = np.array(self.comparison_data.metrics["max_displacement"]) * 1000

        bars = ax.bar(x, disp_values, color='#FF9800', edgecolor='black', linewidth=0.5)

        for i, (bar, disp) in enumerate(zip(bars, disp_values)):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height + 0.1,
                    f'{disp:.2f}', ha='center', va='bottom', fontsize=9)

        ax.set_xlabel('工况', fontsize=12)
        ax.set_ylabel('最大位移 (mm)', fontsize=12)
        ax.set_title('各工况最大位移对比', fontsize=14, fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels(self.comparison_data.scenario_names, rotation=45, ha='right', fontsize=9)
        ax.grid(axis='y', alpha=0.3)

        plt.tight_layout()
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"位移对比图已保存: {output_path}")

    def plot_performance_radar(self, output_path: str) -> None:
        """绘制性能雷达图"""
        if self.comparison_data is None:
            self.compute_comparison()

        metrics = ['factor_of_safety', 'max_displacement', 'max_shear_stress', 'compute_time']
        labels = ['安全系数', '位移(逆)', '剪应力(逆)', '计算效率(逆)']

        values = []
        for metric in metrics:
            data = np.array(self.comparison_data.metrics[metric])
            if metric in ['max_displacement', 'max_shear_stress', 'compute_time']:
                normalized = 1 - (data - data.min()) / (data.max() - data.min() + 1e-10)
            else:
                normalized = (data - data.min()) / (data.max() - data.min() + 1e-10)
            values.append(normalized)

        values = np.array(values).T
        angles = np.linspace(0, 2 * np.pi, len(metrics), endpoint=False)

        fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(projection='polar'))

        colors = plt.cm.tab10(np.linspace(0, 1, len(self.results)))

        for i, (name, color) in enumerate(zip(self.comparison_data.scenario_names, colors)):
            ax.plot(angles, values[i], 'o-', linewidth=2, label=name, color=color)
            ax.fill(angles, values[i], alpha=0.1, color=color)

        ax.set_xticks(angles)
        ax.set_xticklabels(labels, fontsize=10)
        ax.set_ylim(0, 1)
        ax.set_title('工况综合性能雷达图', fontsize=14, fontweight='bold', pad=20)
        ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.1), fontsize=9)
        ax.grid(True, alpha=0.3)

        plt.tight_layout()
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"性能雷达图已保存: {output_path}")

    def generate_all_plots(self, output_dir: str) -> Dict[str, str]:
        """生成所有对比图表"""
        os.makedirs(output_dir, exist_ok=True)

        plots = {}

        fos_path = os.path.join(output_dir, "factor_of_safety_comparison.png")
        self.plot_factor_of_safety_comparison(fos_path)
        plots["factor_of_safety"] = fos_path

        disp_path = os.path.join(output_dir, "displacement_comparison.png")
        self.plot_displacement_comparison(disp_path)
        plots["displacement"] = disp_path

        radar_path = os.path.join(output_dir, "performance_radar.png")
        self.plot_performance_radar(radar_path)
        plots["radar"] = radar_path

        return plots

    def to_dict(self) -> Dict:
        """转换为字典"""
        if self.comparison_data is None:
            self.compute_comparison()

        return {
            "num_scenarios": len(self.results),
            "baseline_index": self.baseline_index,
            "scenarios": [
                {
                    "scenario_id": r.scenario_id,
                    "name": r.name,
                    "factor_of_safety": r.factor_of_safety,
                    "max_displacement": r.max_displacement,
                    "max_shear_stress": r.max_shear_stress,
                    "compute_time": r.compute_time,
                    "status": r.status,
                    "is_baseline": i == self.baseline_index,
                    "differences": {
                        k: v[i] for k, v in self.comparison_data.differences.items()
                    },
                    "percentage_changes": {
                        k: v[i] for k, v in self.comparison_data.percentage_changes.items()
                    }
                }
                for i, r in enumerate(self.results)
            ]
        }

    def to_json(self, filepath: str) -> None:
        """保存为JSON"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=4)
        logger.info(f"对比分析结果已保存: {filepath}")


class ComparisonReportGenerator:
    """对比报告生成器"""

    def __init__(self, comparison: ScenarioComparison):
        self.comparison = comparison

    def generate_html_report(self, output_path: str, plots: Optional[Dict[str, str]] = None) -> str:
        """生成HTML对比报告"""
        data = self.comparison.to_dict()
        summary_table = self.comparison.get_summary_table()

        best_idx, best_result = self.comparison.find_best_scenario()

        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>多工况边坡稳定性对比分析报告</title>
    <style>
        body {{ font-family: 'Microsoft YaHei', Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }}
        .header h1 {{ margin: 0; font-size: 28px; }}
        .header p {{ margin: 10px 0 0 0; opacity: 0.9; }}
        .section {{ background: white; padding: 25px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .section h2 {{ color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th {{ background: #667eea; color: white; padding: 12px; text-align: left; }}
        td {{ padding: 12px; border-bottom: 1px solid #ddd; }}
        tr:hover {{ background-color: #f9f9f9; }}
        .best {{ background-color: #d4edda !important; }}
        .baseline {{ background-color: #d1ecf1 !important; }}
        .metric-card {{ display: inline-block; width: 22%; margin: 10px; padding: 20px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; border-radius: 10px; text-align: center; }}
        .metric-card h3 {{ margin: 0 0 10px 0; font-size: 16px; opacity: 0.9; }}
        .metric-card .value {{ font-size: 32px; font-weight: bold; }}
        .plots {{ display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }}
        .plot-container {{ background: white; padding: 15px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .plot-container img {{ max-width: 100%; height: auto; border-radius: 5px; }}
        pre {{ background: #f4f4f4; padding: 20px; border-radius: 5px; overflow-x: auto; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>多工况边坡稳定性对比分析报告</h1>
        <p>共 {data['num_scenarios']} 个工况参与对比分析</p>
    </div>

    <div class="section">
        <h2>最优工况分析</h2>
        <div style="text-align: center;">
            <div class="metric-card">
                <h3>最优工况</h3>
                <div class="value" style="font-size: 20px;">{best_result.name}</div>
            </div>
            <div class="metric-card">
                <h3>最优安全系数</h3>
                <div class="value">{best_result.factor_of_safety:.3f}</div>
            </div>
            <div class="metric-card">
                <h3>最大位移</h3>
                <div class="value">{best_result.max_displacement*1000:.2f} mm</div>
            </div>
            <div class="metric-card">
                <h3>计算时间</h3>
                <div class="value">{best_result.compute_time:.2f} s</div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>工况对比汇总</h2>
        <pre>{summary_table}</pre>
    </div>

    <div class="section">
        <h2>详细对比数据</h2>
        <table>
            <thead>
                <tr>
                    <th>工况名称</th>
                    <th>安全系数</th>
                    <th>ΔFOS</th>
                    <th>ΔFOS%</th>
                    <th>最大位移 (m)</th>
                    <th>最大剪应力 (Pa)</th>
                    <th>计算时间 (s)</th>
                    <th>状态</th>
                </tr>
            </thead>
            <tbody>
"""

        for scenario in data["scenarios"]:
            row_class = "best" if scenario["factor_of_safety"] == max(s["factor_of_safety"] for s in data["scenarios"]) else ""
            row_class += " baseline" if scenario["is_baseline"] else ""

            html += f"""
                <tr class="{row_class}">
                    <td><strong>{scenario['name']}</strong></td>
                    <td>{scenario['factor_of_safety']:.3f}</td>
                    <td>{scenario['differences']['factor_of_safety']:+.3f}</td>
                    <td>{scenario['percentage_changes']['factor_of_safety']:+.1f}%</td>
                    <td>{scenario['max_displacement']:.6f}</td>
                    <td>{scenario['max_shear_stress']:.2e}</td>
                    <td>{scenario['compute_time']:.2f}</td>
                    <td>{scenario['status']}</td>
                </tr>
"""

        html += f"""
            </tbody>
        </table>
    </div>
"""

        if plots:
            html += """
    <div class="section">
        <h2>可视化对比</h2>
        <div class="plots">
"""
            for name, path in plots.items():
                rel_path = os.path.relpath(path, os.path.dirname(output_path))
                html += f"""
            <div class="plot-container">
                <img src="{rel_path}" alt="{name}">
            </div>
"""
            html += """
        </div>
    </div>
"""

        html += f"""
    <div class="section">
        <h2>工程建议</h2>
        <ul>
            <li>建议采用 <strong>{best_result.name}</strong> 作为设计方案，其安全系数最高（{best_result.factor_of_safety:.3f}）</li>
            <li>所有工况中，安全系数范围为 {min(s['factor_of_safety'] for s in data['scenarios']):.3f} ~ {max(s['factor_of_safety'] for s in data['scenarios']):.3f}</li>
"""
        if all(s['factor_of_safety'] >= 1.3 for s in data['scenarios']):
            html += """
            <li>所有工况均满足规范要求（FOS ≥ 1.3），设计方案安全可靠</li>
"""
        elif any(s['factor_of_safety'] < 1.0 for s in data['scenarios']):
            html += """
            <li><strong>警告</strong>：部分工况安全系数低于1.0，存在失稳风险，需采取加固措施</li>
"""
        else:
            html += """
            <li>部分工况安全系数接近规范限值，建议进一步优化设计参数</li>
"""

        html += """
        </ul>
    </div>

    <div style="text-align: center; color: #666; margin-top: 40px; padding: 20px; border-top: 1px solid #ddd;">
        <p>报告生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p>岩土工程边坡稳定性有限元分析工具集 v2.0</p>
    </div>
</body>
</html>
"""
        import time
        html = html.replace("{time.strftime('%Y-%m-%d %H:%M:%S')}", time.strftime('%Y-%m-%d %H:%M:%S'))

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)

        logger.info(f"对比分析报告已生成: {output_path}")
        return output_path
