"""
结果后处理模块
============

负责有限元计算结果的后处理、可视化和数据分析,
包括位移场、应力场、应变场的渲染和统计分析。
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.collections import PatchCollection, LineCollection
from matplotlib import cm
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import os

from .mesh import SlopeMesh, Element
from .fem_kernel import FEMResult, StrengthReductionResult
from .parameters import SlopeParameters


@dataclass
class ProcessedResults:
    """后处理结果"""
    displacement_magnitude: np.ndarray
    displacement_x: np.ndarray
    displacement_y: np.ndarray
    stress_sigma_x: np.ndarray
    stress_sigma_y: np.ndarray
    stress_sigma_xy: np.ndarray
    principal_stress_1: np.ndarray
    principal_stress_2: np.ndarray
    maximum_shear_stress: np.ndarray
    strain_epsilon_x: np.ndarray
    strain_epsilon_y: np.ndarray
    strain_epsilon_xy: np.ndarray
    element_centroids: np.ndarray


class ResultsProcessor:
    """结果处理器"""

    def __init__(self, mesh: SlopeMesh, parameters: SlopeParameters):
        self.mesh = mesh
        self.params = parameters

    def process_results(self, fem_result: FEMResult) -> ProcessedResults:
        """处理有限元结果"""
        num_nodes = len(self.mesh.nodes)
        num_elements = len(self.mesh.elements)

        disp_x = fem_result.displacement[0::2]
        disp_y = fem_result.displacement[1::2]
        disp_mag = np.sqrt(disp_x**2 + disp_y**2)

        stress = fem_result.stress
        sigma_x = stress[:, 0] if stress.shape[1] > 0 else np.zeros(num_elements)
        sigma_y = stress[:, 1] if stress.shape[1] > 1 else np.zeros(num_elements)
        sigma_xy = stress[:, 2] if stress.shape[1] > 2 else np.zeros(num_elements)

        principal_1, principal_2, max_shear = self._compute_principal_stresses(sigma_x, sigma_y, sigma_xy)

        strain = fem_result.strain
        epsilon_x = strain[:, 0] if strain.shape[1] > 0 else np.zeros(num_elements)
        epsilon_y = strain[:, 1] if strain.shape[1] > 1 else np.zeros(num_elements)
        epsilon_xy = strain[:, 2] if strain.shape[2] > 2 else np.zeros(num_elements)

        centroids = self._compute_element_centroids()

        return ProcessedResults(
            displacement_magnitude=disp_mag,
            displacement_x=disp_x,
            displacement_y=disp_y,
            stress_sigma_x=sigma_x,
            stress_sigma_y=sigma_y,
            stress_sigma_xy=sigma_xy,
            principal_stress_1=principal_1,
            principal_stress_2=principal_2,
            maximum_shear_stress=max_shear,
            strain_epsilon_x=epsilon_x,
            strain_epsilon_y=epsilon_y,
            strain_epsilon_xy=epsilon_xy,
            element_centroids=centroids
        )

    def _compute_principal_stresses(self, sigma_x: np.ndarray, sigma_y: np.ndarray,
                                     sigma_xy: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """计算主应力和最大剪应力"""
        mean_stress = (sigma_x + sigma_y) / 2.0
        deviatoric = np.sqrt(((sigma_x - sigma_y) / 2.0)**2 + sigma_xy**2)

        principal_1 = mean_stress + deviatoric
        principal_2 = mean_stress - deviatoric
        max_shear = deviatoric

        return principal_1, principal_2, max_shear

    def _compute_element_centroids(self) -> np.ndarray:
        """计算单元形心"""
        centroids = np.zeros((len(self.mesh.elements), 2))

        for i, element in enumerate(self.mesh.elements):
            nodes = [self.mesh.nodes[nid] for nid in element.node_ids]
            centroids[i, 0] = np.mean([n.x for n in nodes])
            centroids[i, 1] = np.mean([n.y for n in nodes])

        return centroids

    def interpolate_to_nodes(self, element_values: np.ndarray) -> np.ndarray:
        """将单元值插值到节点"""
        num_nodes = len(self.mesh.nodes)
        node_values = np.zeros(num_nodes)
        node_count = np.zeros(num_nodes)

        for i, element in enumerate(self.mesh.elements):
            for nid in element.node_ids:
                node_values[nid] += element_values[i]
                node_count[nid] += 1

        mask = node_count > 0
        node_values[mask] /= node_count[mask]

        return node_values

    def compute_statistics(self, processed: ProcessedResults) -> Dict:
        """计算结果统计信息"""
        stats = {
            "displacement": {
                "max_magnitude": float(np.max(processed.displacement_magnitude)),
                "max_x": float(np.max(np.abs(processed.displacement_x))),
                "max_y": float(np.max(np.abs(processed.displacement_y))),
                "mean_magnitude": float(np.mean(processed.displacement_magnitude)),
            },
            "stress": {
                "max_sigma_x": float(np.max(processed.stress_sigma_x)),
                "min_sigma_x": float(np.min(processed.stress_sigma_x)),
                "max_sigma_y": float(np.max(processed.stress_sigma_y)),
                "min_sigma_y": float(np.min(processed.stress_sigma_y)),
                "max_shear": float(np.max(processed.maximum_shear_stress)),
                "max_principal_1": float(np.max(processed.principal_stress_1)),
                "min_principal_2": float(np.min(processed.principal_stress_2)),
            },
            "strain": {
                "max_epsilon_x": float(np.max(processed.strain_epsilon_x)),
                "max_epsilon_y": float(np.max(processed.strain_epsilon_y)),
                "max_shear_strain": float(np.max(processed.strain_epsilon_xy)),
            }
        }
        return stats

    def analyze_failure_surface(self, sr_result: StrengthReductionResult) -> Dict:
        """分析滑动面"""
        analysis = {}

        if sr_result.failure_surface is not None and len(sr_result.failure_surface) > 0:
            points = sr_result.failure_surface

            analysis["num_points"] = len(points)
            analysis["min_x"] = float(np.min(points[:, 0]))
            analysis["max_x"] = float(np.max(points[:, 0]))
            analysis["min_y"] = float(np.min(points[:, 1]))
            analysis["max_y"] = float(np.max(points[:, 1]))
            analysis["slope_depth"] = float(np.max(points[:, 1]) - np.min(points[:, 1]))

            if len(points) > 1:
                dx = np.diff(points[:, 0])
                dy = np.diff(points[:, 1])
                length = np.sum(np.sqrt(dx**2 + dy**2))
                analysis["approximate_length"] = float(length)

        analysis["factor_of_safety"] = sr_result.factor_of_safety
        analysis["critical_reduction_factor"] = sr_result.critical_reduction_factor

        return analysis


class Visualizer:
    """可视化器"""

    def __init__(self, mesh: SlopeMesh, parameters: SlopeParameters):
        self.mesh = mesh
        self.params = parameters
        self.output_dir = "output"
        os.makedirs(self.output_dir, exist_ok=True)

    def _create_element_collection(self, values: np.ndarray, cmap: str = 'viridis',
                                   title: str = '', label: str = '',
                                   show_nodes: bool = False) -> Tuple[plt.Figure, plt.Axes]:
        """创建单元云图"""
        fig, ax = plt.subplots(figsize=(14, 8))

        patches = []
        for element in self.mesh.elements:
            nodes = [self.mesh.nodes[nid] for nid in element.node_ids]
            coords = [[n.x, n.y] for n in nodes]
            patches.append(Polygon(coords, closed=True))

        pc = PatchCollection(patches, cmap=cmap)
        pc.set_array(values)
        ax.add_collection(pc)

        cbar = plt.colorbar(pc, ax=ax)
        cbar.set_label(label)

        for name, boundary in self.mesh.boundaries.items():
            bnodes = [self.mesh.nodes[i] for i in boundary.node_ids]
            if bnodes:
                bxs = [n.x for n in bnodes]
                bys = [n.y for n in bnodes]
                ax.plot(bxs, bys, 'k-', linewidth=1.5, label=name)

        if show_nodes:
            xs = [n.x for n in self.mesh.nodes]
            ys = [n.y for n in self.mesh.nodes]
            ax.scatter(xs, ys, s=3, color='black', alpha=0.5)

        ax.set_aspect('equal')
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title(title)
        ax.legend(loc='best')
        ax.autoscale()

        return fig, ax

    def plot_displacement_magnitude(self, processed: ProcessedResults,
                                     save: bool = False, filename: str = 'displacement_magnitude.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制位移场"""
        values = processed.displacement_magnitude * 1000
        fig, ax = self._create_element_collection(
            self._average_to_elements(values),
            cmap='jet',
            title='位移场 (mm)',
            label='位移大小 (mm)'
        )

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_displacement_x(self, processed: ProcessedResults,
                            save: bool = False, filename: str = 'displacement_x.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制水平位移场"""
        values = processed.displacement_x * 1000
        fig, ax = self._create_element_collection(
            self._average_to_elements(values),
            cmap='RdBu',
            title='水平位移 (mm)',
            label='X方向位移 (mm)'
        )

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_displacement_y(self, processed: ProcessedResults,
                            save: bool = False, filename: str = 'displacement_y.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制竖向位移场"""
        values = processed.displacement_y * 1000
        fig, ax = self._create_element_collection(
            self._average_to_elements(values),
            cmap='RdBu',
            title='竖向位移 (mm)',
            label='Y方向位移 (mm)'
        )

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_displacement_vectors(self, processed: ProcessedResults,
                                   scale: float = 10.0,
                                   save: bool = False, filename: str = 'displacement_vectors.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制位移矢量"""
        fig, ax = plt.subplots(figsize=(14, 8))

        xs = [n.x for n in self.mesh.nodes]
        ys = [n.y for n in self.mesh.nodes]
        dx = processed.displacement_x * scale
        dy = processed.displacement_y * scale

        ax.quiver(xs, ys, dx, dy, scale=1, scale_units='xy', angles='xy',
                  color='red', width=0.002, headwidth=3, headlength=4)

        for name, boundary in self.mesh.boundaries.items():
            bnodes = [self.mesh.nodes[i] for i in boundary.node_ids]
            if bnodes:
                bxs = [n.x for n in bnodes]
                bys = [n.y for n in bnodes]
                ax.plot(bxs, bys, 'k-', linewidth=1.5, label=name)

        ax.set_aspect('equal')
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title(f'位移矢量图 (放大{scale}倍)')
        ax.legend(loc='best')
        ax.autoscale()

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_sigma_x(self, processed: ProcessedResults,
                     save: bool = False, filename: str = 'sigma_x.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制水平正应力"""
        values = processed.stress_sigma_x / 1e6
        fig, ax = self._create_element_collection(
            values,
            cmap='RdBu',
            title='水平正应力 σ_x (MPa)',
            label='σ_x (MPa)'
        )

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_sigma_y(self, processed: ProcessedResults,
                     save: bool = False, filename: str = 'sigma_y.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制竖向正应力"""
        values = processed.stress_sigma_y / 1e6
        fig, ax = self._create_element_collection(
            values,
            cmap='RdBu',
            title='竖向正应力 σ_y (MPa)',
            label='σ_y (MPa)'
        )

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_shear_stress(self, processed: ProcessedResults,
                          save: bool = False, filename: str = 'shear_stress.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制剪应力"""
        values = processed.maximum_shear_stress / 1e6
        fig, ax = self._create_element_collection(
            values,
            cmap='hot',
            title='最大剪应力 τ_max (MPa)',
            label='τ_max (MPa)'
        )

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_principal_stresses(self, processed: ProcessedResults,
                                 save: bool = False, filename: str = 'principal_stresses.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制主应力"""
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 7))

        values1 = processed.principal_stress_1 / 1e6
        patches1 = []
        for element in self.mesh.elements:
            nodes = [self.mesh.nodes[nid] for nid in element.node_ids]
            coords = [[n.x, n.y] for n in nodes]
            patches1.append(Polygon(coords, closed=True))
        pc1 = PatchCollection(patches1, cmap='RdBu')
        pc1.set_array(values1)
        ax1.add_collection(pc1)
        plt.colorbar(pc1, ax=ax1, label='σ_1 (MPa)')
        ax1.set_aspect('equal')
        ax1.set_title('第一主应力 σ_1 (MPa)')
        ax1.set_xlabel('X (m)')
        ax1.set_ylabel('Y (m)')
        ax1.autoscale()

        values2 = processed.principal_stress_2 / 1e6
        patches2 = []
        for element in self.mesh.elements:
            nodes = [self.mesh.nodes[nid] for nid in element.node_ids]
            coords = [[n.x, n.y] for n in nodes]
            patches2.append(Polygon(coords, closed=True))
        pc2 = PatchCollection(patches2, cmap='RdBu')
        pc2.set_array(values2)
        ax2.add_collection(pc2)
        plt.colorbar(pc2, ax=ax2, label='σ_2 (MPa)')
        ax2.set_aspect('equal')
        ax2.set_title('第二主应力 σ_2 (MPa)')
        ax2.set_xlabel('X (m)')
        ax2.set_ylabel('Y (m)')
        ax2.autoscale()

        plt.tight_layout()

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, (ax1, ax2)

    def plot_convergence_curve(self, sr_result: StrengthReductionResult,
                               save: bool = False, filename: str = 'convergence_curve.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制收敛曲线"""
        factors, displacements = sr_result.get_convergence_curve()

        fig, ax = plt.subplots(figsize=(10, 6))

        ax.plot(factors, displacements * 1000, 'b-o', linewidth=2, markersize=6, label='最大位移')

        ax.axvline(x=sr_result.factor_of_safety, color='r', linestyle='--', linewidth=2,
                   label=f'安全系数 FOS = {sr_result.factor_of_safety:.3f}')

        ax.set_xlabel('强度折减系数')
        ax.set_ylabel('最大位移 (mm)')
        ax.set_title('强度折减收敛曲线')
        ax.grid(True, alpha=0.3)
        ax.legend()

        for i, (factor, disp) in enumerate(zip(factors, displacements)):
            result = sr_result.reduction_results[i]
            color = 'g' if result["converged"] else 'r'
            marker = 'o' if result["converged"] else 'x'
            ax.plot(factor, disp * 1000, color=color, marker=marker, markersize=8)

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_failure_surface(self, sr_result: StrengthReductionResult,
                             processed: Optional[ProcessedResults] = None,
                             save: bool = False, filename: str = 'failure_surface.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制滑动面"""
        fig, ax = plt.subplots(figsize=(14, 8))

        if processed is not None:
            values = processed.maximum_shear_stress / 1e6
            patches = []
            for element in self.mesh.elements:
                nodes = [self.mesh.nodes[nid] for nid in element.node_ids]
                coords = [[n.x, n.y] for n in nodes]
                patches.append(Polygon(coords, closed=True))
            pc = PatchCollection(patches, cmap='YlOrRd', alpha=0.6)
            pc.set_array(values)
            ax.add_collection(pc)
            plt.colorbar(pc, ax=ax, label='最大剪应力 (MPa)')

        if sr_result.failure_surface is not None and len(sr_result.failure_surface) > 0:
            points = sr_result.failure_surface
            ax.scatter(points[:, 0], points[:, 1], c='red', s=50, alpha=0.8, label='滑动面区域')

            if len(points) > 1:
                sorted_idx = np.argsort(points[:, 0])
                sorted_points = points[sorted_idx]
                ax.plot(sorted_points[:, 0], sorted_points[:, 1], 'r--', linewidth=2.5, label='潜在滑动面')

        for name, boundary in self.mesh.boundaries.items():
            bnodes = [self.mesh.nodes[i] for i in boundary.node_ids]
            if bnodes:
                bxs = [n.x for n in bnodes]
                bys = [n.y for n in bnodes]
                ax.plot(bxs, bys, 'k-', linewidth=1.5, label=name)

        ax.set_aspect('equal')
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title(f'潜在滑动面 (安全系数 FOS = {sr_result.factor_of_safety:.3f})')
        ax.legend(loc='best')
        ax.autoscale()

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def plot_mesh(self, save: bool = False, filename: str = 'mesh.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制网格"""
        ax = self.mesh.plot(show=False, title='有限元网格')
        fig = ax.get_figure()
        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)
        return fig, ax

    def plot_deformed_mesh(self, processed: ProcessedResults, scale: float = 10.0,
                           save: bool = False, filename: str = 'deformed_mesh.png') -> Tuple[plt.Figure, plt.Axes]:
        """绘制变形后网格"""
        fig, ax = plt.subplots(figsize=(14, 8))

        original_patches = []
        deformed_patches = []

        for element in self.mesh.elements:
            orig_nodes = [self.mesh.nodes[nid] for nid in element.node_ids]
            orig_coords = [[n.x, n.y] for n in orig_nodes]
            original_patches.append(Polygon(orig_coords, closed=True))

            def_coords = []
            for nid in element.node_ids:
                node = self.mesh.nodes[nid]
                dx = processed.displacement_x[nid] * scale
                dy = processed.displacement_y[nid] * scale
                def_coords.append([node.x + dx, node.y + dy])
            deformed_patches.append(Polygon(def_coords, closed=True))

        pc_orig = PatchCollection(original_patches, facecolors='none', edgecolors='gray',
                                  linewidth=0.5, alpha=0.5, label='原始网格')
        ax.add_collection(pc_orig)

        pc_def = PatchCollection(deformed_patches, facecolors='none', edgecolors='red',
                                 linewidth=1.0, label=f'变形网格 (放大{scale}倍)')
        ax.add_collection(pc_def)

        ax.set_aspect('equal')
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title(f'变形前后网格对比 (放大{scale}倍)')
        ax.legend()
        ax.autoscale()

        if save:
            fig.savefig(os.path.join(self.output_dir, filename), dpi=300, bbox_inches='tight')
            plt.close(fig)

        return fig, ax

    def generate_all_plots(self, processed: ProcessedResults,
                            sr_result: Optional[StrengthReductionResult] = None,
                            save: bool = True) -> Dict[str, str]:
        """生成所有图形，返回绝对路径"""
        plot_files = {}

        self.plot_displacement_magnitude(processed, save=save)
        plot_files['位移场'] = os.path.abspath(os.path.join(self.output_dir, 'displacement_magnitude.png'))

        self.plot_displacement_x(processed, save=save)
        plot_files['水平位移'] = os.path.abspath(os.path.join(self.output_dir, 'displacement_x.png'))

        self.plot_displacement_y(processed, save=save)
        plot_files['竖向位移'] = os.path.abspath(os.path.join(self.output_dir, 'displacement_y.png'))

        self.plot_displacement_vectors(processed, save=save)
        plot_files['位移矢量'] = os.path.abspath(os.path.join(self.output_dir, 'displacement_vectors.png'))

        self.plot_sigma_x(processed, save=save)
        plot_files['水平正应力'] = os.path.abspath(os.path.join(self.output_dir, 'sigma_x.png'))

        self.plot_sigma_y(processed, save=save)
        plot_files['竖向正应力'] = os.path.abspath(os.path.join(self.output_dir, 'sigma_y.png'))

        self.plot_shear_stress(processed, save=save)
        plot_files['最大剪应力'] = os.path.abspath(os.path.join(self.output_dir, 'shear_stress.png'))

        self.plot_principal_stresses(processed, save=save)
        plot_files['主应力'] = os.path.abspath(os.path.join(self.output_dir, 'principal_stresses.png'))

        self.plot_deformed_mesh(processed, save=save)
        plot_files['变形网格'] = os.path.abspath(os.path.join(self.output_dir, 'deformed_mesh.png'))

        if sr_result is not None:
            self.plot_convergence_curve(sr_result, save=save)
            plot_files['收敛曲线'] = os.path.abspath(os.path.join(self.output_dir, 'convergence_curve.png'))

            self.plot_failure_surface(sr_result, processed, save=save)
            plot_files['滑动面'] = os.path.abspath(os.path.join(self.output_dir, 'failure_surface.png'))

        self.plot_mesh(save=save)
        plot_files['网格'] = os.path.abspath(os.path.join(self.output_dir, 'mesh.png'))

        return plot_files

    def _average_to_elements(self, node_values: np.ndarray) -> np.ndarray:
        """将节点值平均到单元"""
        element_values = np.zeros(len(self.mesh.elements))
        for i, element in enumerate(self.mesh.elements):
            element_values[i] = np.mean([node_values[nid] for nid in element.node_ids])
        return element_values

    def export_to_vtk(self, processed: ProcessedResults, filename: str = 'results.vtk') -> None:
        """导出结果为VTK格式"""
        filepath = os.path.join(self.output_dir, filename)

        with open(filepath, 'w') as f:
            f.write("# vtk DataFile Version 3.0\n")
            f.write("Slope FEM Results\n")
            f.write("ASCII\n")
            f.write("DATASET UNSTRUCTURED_GRID\n")

            f.write(f"POINTS {len(self.mesh.nodes)} float\n")
            for node in self.mesh.nodes:
                f.write(f"{node.x} {node.y} {node.z}\n")

            total_size = sum(len(e.node_ids) + 1 for e in self.mesh.elements)
            f.write(f"CELLS {len(self.mesh.elements)} {total_size}\n")
            for e in self.mesh.elements:
                f.write(f"{len(e.node_ids)} {' '.join(map(str, e.node_ids))}\n")

            f.write(f"CELL_TYPES {len(self.mesh.elements)}\n")
            for e in self.mesh.elements:
                if e.element_type == "triangular":
                    f.write("5\n")
                elif e.element_type == "quadrilateral":
                    f.write("9\n")

            f.write(f"POINT_DATA {len(self.mesh.nodes)}\n")
            f.write("VECTORS displacement float\n")
            for i in range(len(self.mesh.nodes)):
                f.write(f"{processed.displacement_x[i]} {processed.displacement_y[i]} 0.0\n")

            f.write("SCALARS displacement_magnitude float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for val in processed.displacement_magnitude:
                f.write(f"{val}\n")

            f.write(f"CELL_DATA {len(self.mesh.elements)}\n")
            f.write("SCALARS sigma_x float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for val in processed.stress_sigma_x:
                f.write(f"{val}\n")

            f.write("SCALARS sigma_y float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for val in processed.stress_sigma_y:
                f.write(f"{val}\n")

            f.write("SCALARS tau_max float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for val in processed.maximum_shear_stress:
                f.write(f"{val}\n")

            f.write("SCALARS sigma_1 float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for val in processed.principal_stress_1:
                f.write(f"{val}\n")

            f.write("SCALARS sigma_2 float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for val in processed.principal_stress_2:
                f.write(f"{val}\n")
