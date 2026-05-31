"""
网格划分模块
负责地质剖面的自动网格生成和优化
增强版本：添加畸形单元检测、质量控制和修复机制
"""

import numpy as np
from dataclasses import dataclass, field, asdict
from typing import List, Tuple, Dict, Optional
import logging
from pathlib import Path
import json
import warnings

try:
    import meshpy.triangle as triangle
    MESHPY_AVAILABLE = True
except ImportError:
    MESHPY_AVAILABLE = False

from .config_parser import SimulationConfig

logger = logging.getLogger(__name__)
warnings.filterwarnings('ignore')


@dataclass
class MeshQualityReport:
    total_elements: int = 0
    valid_elements: int = 0
    distorted_elements: int = 0
    inverted_elements: int = 0
    zero_area_elements: int = 0
    high_aspect_ratio_elements: int = 0
    min_quality: float = 1.0
    max_quality: float = 1.0
    mean_quality: float = 1.0
    distorted_element_indices: List[int] = field(default_factory=list)

    def is_acceptable(self, threshold: float = 0.5) -> bool:
        if self.total_elements == 0:
            return False
        return (self.valid_elements / self.total_elements) >= threshold

    def summary(self) -> str:
        return (f"网格质量报告: 总单元={self.total_elements}, "
                f"有效单元={self.valid_elements}, "
                f"畸形单元={self.distorted_elements}, "
                f"反序单元={self.inverted_elements}, "
                f"零面积单元={self.zero_area_elements}, "
                f"高长宽比单元={self.high_aspect_ratio_elements}, "
                f"平均质量={self.mean_quality:.3f}")


@dataclass
class MeshData:
    nodes: np.ndarray
    elements: np.ndarray
    element_material_ids: np.ndarray
    node_count: int = 0
    element_count: int = 0
    boundary_nodes: Dict[str, List[int]] = field(default_factory=dict)
    quality_report: Optional[MeshQualityReport] = None

    def __post_init__(self):
        self.node_count = len(self.nodes) if self.nodes is not None else 0
        self.element_count = len(self.elements) if self.elements is not None else 0

    def save(self, output_path: str):
        data = {
            'nodes': self.nodes.tolist(),
            'elements': self.elements.tolist(),
            'element_material_ids': self.element_material_ids.tolist(),
            'boundary_nodes': {k: list(v) for k, v in self.boundary_nodes.items()},
            'quality_report': asdict(self.quality_report) if self.quality_report else None
        }
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info(f"网格数据已保存到: {output_path}")

    @classmethod
    def load(cls, input_path: str) -> 'MeshData':
        with open(input_path, 'r') as f:
            data = json.load(f)
        quality_report = None
        if data.get('quality_report'):
            quality_report = MeshQualityReport(**data['quality_report'])
        return cls(
            nodes=np.array(data['nodes']),
            elements=np.array(data['elements']),
            element_material_ids=np.array(data['element_material_ids']),
            boundary_nodes={k: np.array(v) for k, v in data['boundary_nodes'].items()},
            quality_report=quality_report
        )

    def get_element_centroids(self) -> np.ndarray:
        """向量化计算单元质心"""
        elem_nodes = self.nodes[self.elements]
        return np.mean(elem_nodes, axis=1)

    def get_element_areas(self) -> np.ndarray:
        """向量化计算单元面积"""
        elem_nodes = self.nodes[self.elements]
        x = elem_nodes[:, :, 0]
        y = elem_nodes[:, :, 1]
        areas = 0.5 * np.abs(
            (x[:, 1] - x[:, 0]) * (y[:, 2] - y[:, 0]) -
            (x[:, 2] - x[:, 0]) * (y[:, 1] - y[:, 0])
        )
        return areas

    def get_element_signed_areas(self) -> np.ndarray:
        """向量化计算单元有符号面积"""
        elem_nodes = self.nodes[self.elements]
        x = elem_nodes[:, :, 0]
        y = elem_nodes[:, :, 1]
        areas = 0.5 * (
            (x[:, 1] - x[:, 0]) * (y[:, 2] - y[:, 0]) -
            (x[:, 2] - x[:, 0]) * (y[:, 1] - y[:, 0])
        )
        return areas

    def get_element_aspect_ratios(self) -> np.ndarray:
        """向量化计算单元长宽比"""
        elem_nodes = self.nodes[self.elements]

        e01 = np.linalg.norm(elem_nodes[:, 1] - elem_nodes[:, 0], axis=1)
        e12 = np.linalg.norm(elem_nodes[:, 2] - elem_nodes[:, 1], axis=1)
        e20 = np.linalg.norm(elem_nodes[:, 0] - elem_nodes[:, 2], axis=1)

        edges = np.column_stack([e01, e12, e20])
        max_edges = np.max(edges, axis=1)
        min_edges = np.min(edges, axis=1)

        aspect_ratios = np.where(min_edges > 1e-10, max_edges / min_edges, np.inf)
        return aspect_ratios

    def get_element_quality(self) -> np.ndarray:
        """向量化计算单元质量系数"""
        elem_nodes = self.nodes[self.elements]
        x = elem_nodes[:, :, 0]
        y = elem_nodes[:, :, 1]

        areas = 0.5 * np.abs(
            (x[:, 1] - x[:, 0]) * (y[:, 2] - y[:, 0]) -
            (x[:, 2] - x[:, 0]) * (y[:, 1] - y[:, 0])
        )

        e01_sq = np.sum((elem_nodes[:, 1] - elem_nodes[:, 0]) ** 2, axis=1)
        e12_sq = np.sum((elem_nodes[:, 2] - elem_nodes[:, 1]) ** 2, axis=1)
        e20_sq = np.sum((elem_nodes[:, 0] - elem_nodes[:, 2]) ** 2, axis=1)
        sum_edges_sq = e01_sq + e12_sq + e20_sq

        qualities = np.where(sum_edges_sq > 1e-10,
                            4 * np.sqrt(3) * areas / sum_edges_sq,
                            0.0)
        return qualities


class MeshGenerator:
    def __init__(self, config: SimulationConfig):
        self.config = config
        self.mesh_data: Optional[MeshData] = None
        self.max_attempts = 3
        self.quality_threshold = 0.3
        self.max_aspect_ratio = 10.0

    def generate(self, auto_repair: bool = True) -> MeshData:
        logger.info("开始生成网格...")
        
        attempt = 0
        while attempt < self.max_attempts:
            attempt += 1
            logger.info(f"网格生成尝试 {attempt}/{self.max_attempts}")

            if MESHPY_AVAILABLE:
                self.mesh_data = self._generate_with_meshpy()
            else:
                logger.warning("MeshPy不可用，使用结构化网格生成")
                self.mesh_data = self._generate_structured()

            self._assign_material_ids()
            self._identify_boundary_nodes()
            
            quality_report = self._check_mesh_quality()
            self.mesh_data.quality_report = quality_report

            logger.info(quality_report.summary())

            if quality_report.is_acceptable(self.quality_threshold):
                if auto_repair and quality_report.distorted_elements > 0:
                    logger.info(f"发现 {quality_report.distorted_elements} 个畸形单元，尝试修复...")
                    self._repair_distorted_elements(quality_report)
                    quality_report = self._check_mesh_quality()
                    self.mesh_data.quality_report = quality_report
                    logger.info(f"修复后: {quality_report.summary()}")
                break
            else:
                logger.warning(f"网格质量不满足要求，调整参数重新生成...")
                self._adjust_mesh_parameters(attempt)

        if not self.mesh_data.quality_report.is_acceptable(self.quality_threshold):
            logger.warning(f"经过 {self.max_attempts} 次尝试，网格质量仍不满足要求，但继续执行")

        logger.info(f"网格生成完成: {self.mesh_data.node_count} 节点, {self.mesh_data.element_count} 单元")
        return self.mesh_data

    def _generate_with_meshpy(self) -> MeshData:
        width = float(self.config.geometry.profile_width)
        height = float(self.config.geometry.profile_height)
        max_area = float(self.config.mesh.max_element_size) ** 2
        min_angle = max(20.0, 30.0 - 5.0 * (self.max_attempts - 1))

        points = [
            (0.0, 0.0),
            (width, 0.0),
            (width, height),
            (0.0, height)
        ]
        facets = [(0, 1), (1, 2), (2, 3), (3, 0)]

        current_y = 0.0
        for layer in self.config.geometry.layers:
            current_y += float(layer.thickness)
            if current_y < height - 1e-6:
                n_points = len(points)
                points.append((0.0, current_y))
                points.append((width, current_y))
                facets.append((n_points, n_points + 1))

        info = triangle.MeshInfo()
        info.set_points(points)
        info.set_facets(facets)

        try:
            mesh = triangle.build(
                info,
                max_volume=max_area,
                min_angle=min_angle,
                refinement_level=int(self.config.mesh.refinement_level),
                quality_meshing=True
            )
        except Exception as e:
            logger.warning(f"MeshPy生成失败，使用备用参数: {e}")
            mesh = triangle.build(
                info,
                max_volume=max_area * 1.5,
                min_angle=15.0,
                refinement_level=int(self.config.mesh.refinement_level),
                quality_meshing=True
            )

        nodes = np.array(mesh.points, dtype=np.float64)
        elements = np.array(mesh.elements, dtype=np.int64)

        nodes = self._snap_boundary_nodes(nodes, width, height)

        return MeshData(
            nodes=nodes,
            elements=elements,
            element_material_ids=np.zeros(len(elements), dtype=int),
            boundary_nodes={}
        )

    def _generate_structured(self) -> MeshData:
        """向量化的结构化网格生成 - 性能优化版本"""
        width = float(self.config.geometry.profile_width)
        height = float(self.config.geometry.profile_height)
        elem_size = float(self.config.mesh.max_element_size)

        nx = max(2, int(np.ceil(width / elem_size)) + 1)
        ny = max(2, int(np.ceil(height / elem_size)) + 1)

        x = np.linspace(0, width, nx)
        y = np.linspace(0, height, ny)
        xv, yv = np.meshgrid(x, y)

        nodes = np.column_stack((xv.flatten(), yv.flatten())).astype(np.float64)

        n_quads = (nx - 1) * (ny - 1)
        elements = np.zeros((n_quads * 2, 3), dtype=np.int64)

        i = np.arange(nx - 1)
        j = np.arange(ny - 1)
        iv, jv = np.meshgrid(i, j)

        n0 = jv * nx + iv
        n1 = jv * nx + iv + 1
        n2 = (jv + 1) * nx + iv
        n3 = (jv + 1) * nx + iv + 1

        n0_flat = n0.flatten()
        n1_flat = n1.flatten()
        n2_flat = n2.flatten()
        n3_flat = n3.flatten()

        elements[0::2, 0] = n0_flat
        elements[0::2, 1] = n1_flat
        elements[0::2, 2] = n3_flat

        elements[1::2, 0] = n0_flat
        elements[1::2, 1] = n3_flat
        elements[1::2, 2] = n2_flat

        mesh_data = MeshData(
            nodes=nodes,
            elements=elements,
            element_material_ids=np.zeros(len(elements), dtype=int),
            boundary_nodes={}
        )

        return mesh_data

    def _snap_boundary_nodes(self, nodes: np.ndarray, width: float, height: float, 
                             tol: float = 1e-6) -> np.ndarray:
        """向量化的边界节点吸附 - 性能优化版本"""
        mask_x0 = np.abs(nodes[:, 0]) < tol
        mask_xw = np.abs(nodes[:, 0] - width) < tol
        mask_y0 = np.abs(nodes[:, 1]) < tol
        mask_yh = np.abs(nodes[:, 1] - height) < tol

        nodes[mask_x0, 0] = 0.0
        nodes[mask_xw, 0] = width
        nodes[mask_y0, 1] = 0.0
        nodes[mask_yh, 1] = height

        return nodes

    def _check_mesh_quality(self) -> MeshQualityReport:
        report = MeshQualityReport()
        report.total_elements = self.mesh_data.element_count

        signed_areas = self.mesh_data.get_element_signed_areas()
        aspect_ratios = self.mesh_data.get_element_aspect_ratios()
        qualities = self.mesh_data.get_element_quality()

        report.inverted_elements = int(np.sum(signed_areas < -1e-10))
        report.zero_area_elements = int(np.sum(np.abs(signed_areas) < 1e-12))
        report.high_aspect_ratio_elements = int(np.sum(aspect_ratios > self.max_aspect_ratio))
        report.distorted_elements = (report.inverted_elements + 
                                     report.zero_area_elements + 
                                     report.high_aspect_ratio_elements)
        report.valid_elements = report.total_elements - report.distorted_elements

        valid_mask = (np.abs(signed_areas) > 1e-12) & (aspect_ratios < self.max_aspect_ratio)
        if np.any(valid_mask):
            report.min_quality = float(np.min(qualities[valid_mask]))
            report.max_quality = float(np.max(qualities[valid_mask]))
            report.mean_quality = float(np.mean(qualities[valid_mask]))
        else:
            report.min_quality = 0.0
            report.max_quality = 0.0
            report.mean_quality = 0.0

        distorted_mask = ~valid_mask
        report.distorted_element_indices = np.where(distorted_mask)[0].tolist()

        return report

    def _repair_distorted_elements(self, quality_report: MeshQualityReport):
        if not quality_report.distorted_element_indices:
            return

        nodes = self.mesh_data.nodes.copy()
        elements = self.mesh_data.elements
        material_ids = self.mesh_data.element_material_ids

        node_elems = [[] for _ in range(len(nodes))]
        for i, elem in enumerate(elements):
            for n in elem:
                node_elems[n].append(i)

        boundary_set = set()
        for bnodes in self.mesh_data.boundary_nodes.values():
            boundary_set.update(bnodes)

        elements_to_remove = set()

        for elem_idx in quality_report.distorted_element_indices:
            elem = elements[elem_idx]
            signed_area = 0.5 * (
                (nodes[elem[1], 0] - nodes[elem[0], 0]) * (nodes[elem[2], 1] - nodes[elem[0], 1]) -
                (nodes[elem[2], 0] - nodes[elem[0], 0]) * (nodes[elem[1], 1] - nodes[elem[0], 1])
            )

            if signed_area < -1e-10:
                elements[elem_idx] = [elem[0], elem[2], elem[1]]
                logger.debug(f"修复反序单元 {elem_idx}: 交换节点顺序")

            elif abs(signed_area) < 1e-12:
                elements_to_remove.add(elem_idx)
                logger.debug(f"标记零面积单元 {elem_idx} 待删除")

        if elements_to_remove:
            keep_mask = np.ones(len(elements), dtype=bool)
            keep_mask[list(elements_to_remove)] = False
            self.mesh_data.elements = elements[keep_mask]
            self.mesh_data.element_material_ids = material_ids[keep_mask]
            self.mesh_data.element_count = len(self.mesh_data.elements)
            logger.info(f"删除了 {len(elements_to_remove)} 个畸形单元")

        for _ in range(3):
            new_nodes = nodes.copy()
            updated = False
            for i in range(len(nodes)):
                if i in boundary_set:
                    continue
                neighbor_nodes = set()
                for elem_idx in node_elems[i]:
                    if elem_idx not in elements_to_remove:
                        for n in elements[elem_idx]:
                            if n != i:
                                neighbor_nodes.add(n)
                if neighbor_nodes:
                    new_pos = np.mean(nodes[list(neighbor_nodes)], axis=0)
                    if np.linalg.norm(new_pos - nodes[i]) > 1e-6:
                        new_nodes[i] = new_pos
                        updated = True
            nodes = new_nodes
            if not updated:
                break

        self.mesh_data.nodes = nodes

    def _adjust_mesh_parameters(self, attempt: int):
        factor = 1.0 + 0.2 * attempt
        self.config.mesh.max_element_size = float(self.config.mesh.max_element_size) * factor
        self.config.mesh.min_element_size = float(self.config.mesh.min_element_size) * factor
        if hasattr(self.config.mesh, 'refinement_level'):
            self.config.mesh.refinement_level = max(1, int(self.config.mesh.refinement_level) - 1)
        logger.info(f"调整网格参数: max_element_size={self.config.mesh.max_element_size:.1f}")

    def _assign_material_ids(self):
        if self.mesh_data is None:
            return

        centroids = self.mesh_data.get_element_centroids()
        heights = centroids[:, 1]
        height_total = float(self.config.geometry.profile_height)

        for i, height in enumerate(heights):
            for layer in self.config.geometry.layers:
                layer_top = height_total - float(layer.depth)
                layer_bottom = layer_top - float(layer.thickness)
                if layer_bottom - 1e-6 <= height < layer_top + 1e-6:
                    self.mesh_data.element_material_ids[i] = int(layer.material_id)
                    break

    def _identify_boundary_nodes(self):
        if self.mesh_data is None:
            return

        width = float(self.config.geometry.profile_width)
        height = float(self.config.geometry.profile_height)
        tol = 1e-6

        boundaries = {
            'left': [],
            'right': [],
            'bottom': [],
            'top': []
        }

        for i, (x, y) in enumerate(self.mesh_data.nodes):
            if abs(x - 0) < tol:
                boundaries['left'].append(i)
            if abs(x - width) < tol:
                boundaries['right'].append(i)
            if abs(y - 0) < tol:
                boundaries['bottom'].append(i)
            if abs(y - height) < tol:
                boundaries['top'].append(i)

        self.mesh_data.boundary_nodes = {
            k: np.array(v, dtype=int) for k, v in boundaries.items()
        }

    def refine_region(self, x_min: float, x_max: float, y_min: float, y_max: float, 
                      factor: float = 2.0) -> MeshData:
        logger.info(f"细化区域: x=[{x_min}, {x_max}], y=[{y_min}, {y_max}]")
        
        if self.mesh_data is None:
            self.generate()

        original_config = self.config.mesh.max_element_size
        self.config.mesh.max_element_size = float(self.config.mesh.max_element_size) / factor

        refined_mesh = self.generate()

        self.config.mesh.max_element_size = original_config

        return refined_mesh

    def get_mesh_quality(self) -> Dict:
        if self.mesh_data is None:
            return {}

        areas = self.mesh_data.get_element_areas()
        quality_metrics = {}

        aspect_ratios = []
        for elem in self.mesh_data.elements:
            pts = self.mesh_data.nodes[elem]
            edges = []
            for i in range(3):
                j = (i + 1) % 3
                edges.append(np.linalg.norm(pts[i] - pts[j]))
            aspect_ratios.append(max(edges) / min(edges) if min(edges) > 1e-10 else np.inf)

        quality_metrics = {
            'min_area': float(np.min(areas)),
            'max_area': float(np.max(areas)),
            'mean_area': float(np.mean(areas)),
            'min_aspect_ratio': float(np.min(aspect_ratios)),
            'max_aspect_ratio': float(np.max(aspect_ratios)),
            'mean_aspect_ratio': float(np.mean(aspect_ratios)),
            'node_count': self.mesh_data.node_count,
            'element_count': self.mesh_data.element_count
        }

        return quality_metrics

    def smooth_mesh(self, iterations: int = 5) -> MeshData:
        if self.mesh_data is None:
            self.generate()

        logger.info(f"开始网格光顺，迭代次数: {iterations}")
        
        nodes = self.mesh_data.nodes.copy()
        elements = self.mesh_data.elements

        node_elems = [[] for _ in range(len(nodes))]
        for i, elem in enumerate(elements):
            for n in elem:
                node_elems[n].append(i)

        boundary_set = set()
        for bnodes in self.mesh_data.boundary_nodes.values():
            boundary_set.update(bnodes)

        for _ in range(iterations):
            new_nodes = nodes.copy()
            for i in range(len(nodes)):
                if i in boundary_set:
                    continue
                neighbor_nodes = set()
                for elem_idx in node_elems[i]:
                    for n in elements[elem_idx]:
                        if n != i:
                            neighbor_nodes.add(n)
                if neighbor_nodes:
                    new_nodes[i] = np.mean(nodes[list(neighbor_nodes)], axis=0)
            nodes = new_nodes

        self.mesh_data.nodes = nodes
        return self.mesh_data
