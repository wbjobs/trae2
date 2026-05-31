"""
结果后处理与可视化模块
负责计算结果的分析、可视化和数据导出
解耦版本：通过标准接口PostProcessingInput接收数据
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.tri as tri
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Union
import logging
from pathlib import Path
import pandas as pd

from .interfaces import PostProcessingInput

logger = logging.getLogger(__name__)


@dataclass
class StressStatistics:
    max_sigma_xx: float
    min_sigma_xx: float
    mean_sigma_xx: float
    max_sigma_yy: float
    min_sigma_yy: float
    mean_sigma_yy: float
    max_sigma_xy: float
    min_sigma_xy: float
    mean_sigma_xy: float
    max_von_mises: float
    min_von_mises: float
    mean_von_mises: float
    max_displacement_magnitude: float
    layer_statistics: Dict[str, Dict] = field(default_factory=dict)


class PostProcessor:
    """后处理器

    可以通过两种方式初始化：
    1. 新标准方式：传入 PostProcessingInput 对象（推荐）
    2. 兼容方式：传入 config, mesh_data, fem_result（向后兼容）
    """

    def __init__(self, *args, **kwargs):
        if len(args) == 1 and isinstance(args[0], PostProcessingInput):
            self._init_from_input(args[0])
        elif len(args) == 3:
            self._init_from_components(*args)
        elif 'post_input' in kwargs:
            self._init_from_input(kwargs['post_input'])
        elif all(k in kwargs for k in ['config', 'mesh_data', 'fem_result']):
            self._init_from_components(kwargs['config'], kwargs['mesh_data'], kwargs['fem_result'])
        else:
            raise ValueError("初始化参数错误，请传入PostProcessingInput或(config, mesh_data, fem_result)")

        self._statistics: Optional[StressStatistics] = None

    def _init_from_input(self, post_input: PostProcessingInput):
        """从标准接口初始化"""
        self._post_input = post_input
        self.nodes = post_input.nodes
        self.elements = post_input.elements
        self.element_material_ids = post_input.element_material_ids
        self.displacement = post_input.displacement
        self.stress = post_input.stress
        self.strain = post_input.strain
        self.von_mises = post_input.von_mises
        self.nodal_stress = post_input.nodal_stress
        self.nodal_strain = post_input.nodal_strain
        self.node_count = post_input.node_count
        self.element_count = post_input.element_count
        self.solve_time = post_input.solve_time
        self.converged = post_input.converged
        self.layer_info = post_input.layer_info or []
        self.metadata = post_input.metadata

        profile_height = max(self.nodes[:, 1]) if len(self.nodes) > 0 else 0.0
        profile_width = max(self.nodes[:, 0]) if len(self.nodes) > 0 else 0.0
        self._geometry = type('Geometry', (), {
            'profile_height': profile_height,
            'profile_width': profile_width
        })()

    def _init_from_components(self, config, mesh_data, fem_result):
        """从传统组件初始化（向后兼容）"""
        post_input = PostProcessingInput.from_components(mesh_data, fem_result, config)
        self._init_from_input(post_input)

    def get_element_centroids(self) -> np.ndarray:
        """获取单元质心"""
        return self._post_input.get_element_centroids()

    def get_element_areas(self) -> np.ndarray:
        """获取单元面积"""
        return self._post_input.get_element_areas()

    def compute_statistics(self) -> StressStatistics:
        logger.info("计算应力统计信息...")

        stress = self.nodal_stress
        von_mises = self.von_mises
        displacement = self.displacement

        disp_magnitude = np.linalg.norm(displacement, axis=1)

        stats = StressStatistics(
            max_sigma_xx=float(np.max(stress[:, 0])),
            min_sigma_xx=float(np.min(stress[:, 0])),
            mean_sigma_xx=float(np.mean(stress[:, 0])),
            max_sigma_yy=float(np.max(stress[:, 1])),
            min_sigma_yy=float(np.min(stress[:, 1])),
            mean_sigma_yy=float(np.mean(stress[:, 1])),
            max_sigma_xy=float(np.max(stress[:, 2])),
            min_sigma_xy=float(np.min(stress[:, 2])),
            mean_sigma_xy=float(np.mean(stress[:, 2])),
            max_von_mises=float(np.max(von_mises)),
            min_von_mises=float(np.min(von_mises)),
            mean_von_mises=float(np.mean(von_mises)),
            max_displacement_magnitude=float(np.max(disp_magnitude))
        )

        stats.layer_statistics = self._compute_layer_statistics()

        self._statistics = stats
        return stats

    def _compute_layer_statistics(self) -> Dict[str, Dict]:
        layer_stats = {}

        if not self.layer_info:
            return layer_stats

        centroids = self.get_element_centroids()

        for layer in self.layer_info:
            layer_top = self._geometry.profile_height - layer['depth']
            layer_bottom = layer_top - layer['thickness']

            mask = (centroids[:, 1] >= layer_bottom) & (centroids[:, 1] < layer_top)

            if np.any(mask):
                layer_von_mises = self.von_mises[mask]
                layer_stress = self.stress[mask]

                layer_stats[layer['name']] = {
                    'element_count': int(np.sum(mask)),
                    'max_von_mises': float(np.max(layer_von_mises)),
                    'min_von_mises': float(np.min(layer_von_mises)),
                    'mean_von_mises': float(np.mean(layer_von_mises)),
                    'max_sigma_xx': float(np.max(layer_stress[:, 0])),
                    'min_sigma_xx': float(np.min(layer_stress[:, 0])),
                    'mean_sigma_xx': float(np.mean(layer_stress[:, 0])),
                    'max_sigma_yy': float(np.max(layer_stress[:, 1])),
                    'min_sigma_yy': float(np.min(layer_stress[:, 1])),
                    'mean_sigma_yy': float(np.mean(layer_stress[:, 1]))
                }

        return layer_stats

    def generate_visualizations(self, output_dir: str, dpi: int = 300) -> List[str]:
        logger.info("生成可视化结果...")
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        generated_files = []

        generated_files.append(self._plot_mesh(output_path, dpi))
        generated_files.append(self._plot_displacement(output_path, dpi))
        generated_files.append(self._plot_stress_xx(output_path, dpi))
        generated_files.append(self._plot_stress_yy(output_path, dpi))
        generated_files.append(self._plot_stress_xy(output_path, dpi))
        generated_files.append(self._plot_von_mises(output_path, dpi))
        generated_files.append(self._plot_layer_stress_distribution(output_path, dpi))
        generated_files.append(self._plot_stress_profile(output_path, dpi))

        logger.info(f"已生成 {len(generated_files)} 个可视化文件")
        return generated_files

    def _create_triangulation(self) -> tri.Triangulation:
        return tri.Triangulation(self.nodes[:, 0], self.nodes[:, 1], self.elements)

    def _plot_mesh(self, output_path: Path, dpi: int) -> str:
        fig, ax = plt.subplots(figsize=(12, 8))
        triang = self._create_triangulation()

        ax.triplot(triang, 'k-', linewidth=0.5)

        for layer in self.layer_info:
            y_pos = self._geometry.profile_height - layer['depth']
            ax.axhline(y=y_pos, color='r', linestyle='--', linewidth=1.5, alpha=0.7)
            ax.text(self._geometry.profile_width * 0.02, y_pos + 5,
                    layer['name'], fontsize=10, color='r')

        ax.set_xlabel('X坐标 (m)', fontsize=12)
        ax.set_ylabel('Y坐标 (m)', fontsize=12)
        ax.set_title('有限元网格模型', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        ax.grid(True, alpha=0.3)

        filename = output_path / 'mesh_model.png'
        plt.tight_layout()
        plt.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close()

        return str(filename)

    def _plot_displacement(self, output_path: Path, dpi: int) -> str:
        fig, axes = plt.subplots(1, 2, figsize=(16, 6))
        triang = self._create_triangulation()

        disp_x = self.displacement[:, 0]
        disp_y = self.displacement[:, 1]

        contour1 = axes[0].tricontourf(triang, disp_x, levels=20, cmap='viridis')
        axes[0].set_title('X方向位移', fontsize=12, fontweight='bold')
        axes[0].set_xlabel('X坐标 (m)')
        axes[0].set_ylabel('Y坐标 (m)')
        axes[0].set_aspect('equal')
        plt.colorbar(contour1, ax=axes[0], label='位移 (m)')

        contour2 = axes[1].tricontourf(triang, disp_y, levels=20, cmap='viridis')
        axes[1].set_title('Y方向位移', fontsize=12, fontweight='bold')
        axes[1].set_xlabel('X坐标 (m)')
        axes[1].set_ylabel('Y坐标 (m)')
        axes[1].set_aspect('equal')
        plt.colorbar(contour2, ax=axes[1], label='位移 (m)')

        plt.tight_layout()
        filename = output_path / 'displacement.png'
        plt.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close()

        return str(filename)

    def _plot_stress_xx(self, output_path: Path, dpi: int) -> str:
        fig, ax = plt.subplots(figsize=(12, 8))
        triang = self._create_triangulation()

        stress_xx = self.nodal_stress[:, 0] / 1e6

        contour = ax.tricontourf(triang, stress_xx, levels=20, cmap='jet')
        ax.tricontour(triang, stress_xx, levels=10, colors='k', linewidths=0.5)

        ax.set_xlabel('X坐标 (m)', fontsize=12)
        ax.set_ylabel('Y坐标 (m)', fontsize=12)
        ax.set_title('水平应力 σ_xx 分布', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        plt.colorbar(contour, ax=ax, label='应力 (MPa)')

        filename = output_path / 'stress_xx.png'
        plt.tight_layout()
        plt.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close()

        return str(filename)

    def _plot_stress_yy(self, output_path: Path, dpi: int) -> str:
        fig, ax = plt.subplots(figsize=(12, 8))
        triang = self._create_triangulation()

        stress_yy = self.nodal_stress[:, 1] / 1e6

        contour = ax.tricontourf(triang, stress_yy, levels=20, cmap='jet')
        ax.tricontour(triang, stress_yy, levels=10, colors='k', linewidths=0.5)

        ax.set_xlabel('X坐标 (m)', fontsize=12)
        ax.set_ylabel('Y坐标 (m)', fontsize=12)
        ax.set_title('垂直应力 σ_yy 分布', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        plt.colorbar(contour, ax=ax, label='应力 (MPa)')

        filename = output_path / 'stress_yy.png'
        plt.tight_layout()
        plt.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close()

        return str(filename)

    def _plot_stress_xy(self, output_path: Path, dpi: int) -> str:
        fig, ax = plt.subplots(figsize=(12, 8))
        triang = self._create_triangulation()

        stress_xy = self.nodal_stress[:, 2] / 1e6

        contour = ax.tricontourf(triang, stress_xy, levels=20, cmap='RdBu_r')
        ax.tricontour(triang, stress_xy, levels=10, colors='k', linewidths=0.5)

        ax.set_xlabel('X坐标 (m)', fontsize=12)
        ax.set_ylabel('Y坐标 (m)', fontsize=12)
        ax.set_title('剪应力 τ_xy 分布', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        plt.colorbar(contour, ax=ax, label='应力 (MPa)')

        filename = output_path / 'stress_xy.png'
        plt.tight_layout()
        plt.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close()

        return str(filename)

    def _plot_von_mises(self, output_path: Path, dpi: int) -> str:
        fig, ax = plt.subplots(figsize=(12, 8))

        centroids = self.get_element_centroids()
        von_mises_mpa = self.von_mises / 1e6

        contour = ax.tricontourf(
            centroids[:, 0], centroids[:, 1], self.elements,
            von_mises_mpa, levels=20, cmap='hot'
        )
        ax.tricontour(
            centroids[:, 0], centroids[:, 1], self.elements,
            von_mises_mpa, levels=10, colors='k', linewidths=0.5
        )

        ax.set_xlabel('X坐标 (m)', fontsize=12)
        ax.set_ylabel('Y坐标 (m)', fontsize=12)
        ax.set_title('Von Mises等效应力分布', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        plt.colorbar(contour, ax=ax, label='应力 (MPa)')

        filename = output_path / 'von_mises.png'
        plt.tight_layout()
        plt.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close()

        return str(filename)

    def _plot_layer_stress_distribution(self, output_path: Path, dpi: int) -> str:
        fig, ax = plt.subplots(figsize=(10, 6))

        layer_stats = self._compute_layer_statistics()
        layer_names = list(layer_stats.keys())
        mean_stresses = [s['mean_von_mises'] / 1e6 for s in layer_stats.values()]
        min_stresses = [s['min_von_mises'] / 1e6 for s in layer_stats.values()]
        max_stresses = [s['max_von_mises'] / 1e6 for s in layer_stats.values()]

        x_pos = np.arange(len(layer_names))
        width = 0.6

        bars = ax.bar(x_pos, mean_stresses, width, alpha=0.7, label='平均应力', color='steelblue')
        ax.errorbar(x_pos, mean_stresses,
                    yerr=[np.subtract(mean_stresses, min_stresses),
                          np.subtract(max_stresses, mean_stresses)],
                    fmt='none', color='black', capsize=5)

        ax.set_xlabel('岩层', fontsize=12)
        ax.set_ylabel('Von Mises应力 (MPa)', fontsize=12)
        ax.set_title('各岩层应力分布', fontsize=14, fontweight='bold')
        ax.set_xticks(x_pos)
        ax.set_xticklabels(layer_names, rotation=15)
        ax.legend()
        ax.grid(True, alpha=0.3, axis='y')

        for i, bar in enumerate(bars):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                    f'{height:.2f}', ha='center', va='bottom')

        plt.tight_layout()
        filename = output_path / 'layer_stress_distribution.png'
        plt.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close()

        return str(filename)

    def _plot_stress_profile(self, output_path: Path, dpi: int) -> str:
        fig, axes = plt.subplots(1, 2, figsize=(14, 6))

        x_mid = self._geometry.profile_width / 2
        y_coords = np.linspace(0, self._geometry.profile_height, 100)

        sigma_xx_profile = []
        sigma_yy_profile = []

        for y in y_coords:
            distances = np.sqrt((self.nodes[:, 0] - x_mid)**2 +
                               (self.nodes[:, 1] - y)**2)
            nearest_idx = np.argmin(distances)
            sigma_xx_profile.append(self.nodal_stress[nearest_idx, 0] / 1e6)
            sigma_yy_profile.append(self.nodal_stress[nearest_idx, 1] / 1e6)

        axes[0].plot(sigma_xx_profile, y_coords, 'b-', linewidth=2)
        axes[0].set_xlabel('σ_xx (MPa)', fontsize=12)
        axes[0].set_ylabel('深度 (m)', fontsize=12)
        axes[0].set_title('剖面中心水平应力分布', fontsize=12, fontweight='bold')
        axes[0].grid(True, alpha=0.3)
        axes[0].invert_yaxis()

        axes[1].plot(sigma_yy_profile, y_coords, 'r-', linewidth=2)
        axes[1].set_xlabel('σ_yy (MPa)', fontsize=12)
        axes[1].set_ylabel('深度 (m)', fontsize=12)
        axes[1].set_title('剖面中心垂直应力分布', fontsize=12, fontweight='bold')
        axes[1].grid(True, alpha=0.3)
        axes[1].invert_yaxis()

        plt.tight_layout()
        filename = output_path / 'stress_profile.png'
        plt.savefig(filename, dpi=dpi, bbox_inches='tight')
        plt.close()

        return str(filename)

    def export_data(self, output_dir: str) -> List[str]:
        logger.info("导出计算数据...")
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        exported_files = []

        nodal_data = pd.DataFrame({
            'node_id': np.arange(len(self.nodes)),
            'x': self.nodes[:, 0],
            'y': self.nodes[:, 1],
            'disp_x': self.displacement[:, 0],
            'disp_y': self.displacement[:, 1],
            'sigma_xx': self.nodal_stress[:, 0],
            'sigma_yy': self.nodal_stress[:, 1],
            'sigma_xy': self.nodal_stress[:, 2]
        })
        nodal_file = output_path / 'nodal_data.csv'
        nodal_data.to_csv(nodal_file, index=False)
        exported_files.append(str(nodal_file))

        centroids = self.get_element_centroids()
        element_data = pd.DataFrame({
            'element_id': np.arange(len(self.elements)),
            'centroid_x': centroids[:, 0],
            'centroid_y': centroids[:, 1],
            'material_id': self.element_material_ids,
            'von_mises': self.von_mises,
            'sigma_xx': self.stress[:, 0],
            'sigma_yy': self.stress[:, 1],
            'sigma_xy': self.stress[:, 2]
        })
        element_file = output_path / 'element_data.csv'
        element_data.to_csv(element_file, index=False)
        exported_files.append(str(element_file))

        if self._statistics:
            stats_dict = {
                'max_sigma_xx (MPa)': [self._statistics.max_sigma_xx / 1e6],
                'min_sigma_xx (MPa)': [self._statistics.min_sigma_xx / 1e6],
                'mean_sigma_xx (MPa)': [self._statistics.mean_sigma_xx / 1e6],
                'max_sigma_yy (MPa)': [self._statistics.max_sigma_yy / 1e6],
                'min_sigma_yy (MPa)': [self._statistics.min_sigma_yy / 1e6],
                'mean_sigma_yy (MPa)': [self._statistics.mean_sigma_yy / 1e6],
                'max_von_mises (MPa)': [self._statistics.max_von_mises / 1e6],
                'min_von_mises (MPa)': [self._statistics.min_von_mises / 1e6],
                'mean_von_mises (MPa)': [self._statistics.mean_von_mises / 1e6],
                'max_displacement (m)': [self._statistics.max_displacement_magnitude]
            }
            stats_file = output_path / 'statistics.csv'
            pd.DataFrame(stats_dict).T.to_csv(stats_file, header=['value'])
            exported_files.append(str(stats_file))

        logger.info(f"已导出 {len(exported_files)} 个数据文件")
        return exported_files
