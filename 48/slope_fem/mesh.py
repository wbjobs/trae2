"""
边坡网格剖分模块
==============

负责边坡模型的几何构建和有限元网格剖分,
支持三角形和四边形单元,可进行边界加密和质量优化。

优化特性:
- 网格缓存机制，避免重复生成
- 增量剖分，支持局部网格调整
- 向量化计算，提升大模型剖分效率
- 自适应加密，关键区域自动细化
"""

import os
import time
import hashlib
import pickle
import logging
import numpy as np
from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Optional, Callable
from scipy.spatial import Delaunay, KDTree
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.collections import PatchCollection
from .parameters import SlopeParameters, SlopeGeometry, SoilLayer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Node:
    """节点类"""
    id: int
    x: float
    y: float
    z: float = 0.0

    @property
    def coords(self) -> np.ndarray:
        """获取节点坐标数组"""
        return np.array([self.x, self.y, self.z])


@dataclass
class Element:
    """单元类"""
    id: int
    node_ids: List[int]
    element_type: str = "triangular"
    material_id: int = 0
    nodes: List[Node] = field(default_factory=list)

    @property
    def num_nodes(self) -> int:
        """获取单元节点数"""
        return len(self.node_ids)

    def compute_area(self, nodes: List[Node]) -> float:
        """计算单元面积"""
        if self.element_type == "triangular" and len(self.node_ids) == 3:
            n = [nodes[i] for i in self.node_ids]
            area = 0.5 * abs(
                (n[1].x - n[0].x) * (n[2].y - n[0].y) -
                (n[2].x - n[0].x) * (n[1].y - n[0].y)
            )
            return area
        elif self.element_type == "quadrilateral" and len(self.node_ids) == 4:
            n = [nodes[i] for i in self.node_ids]
            area1 = 0.5 * abs(
                (n[1].x - n[0].x) * (n[2].y - n[0].y) -
                (n[2].x - n[0].x) * (n[1].y - n[0].y)
            )
            area2 = 0.5 * abs(
                (n[3].x - n[2].x) * (n[0].y - n[2].y) -
                (n[0].x - n[2].x) * (n[3].y - n[2].y)
            )
            return area1 + area2
        return 0.0

    def compute_quality(self, nodes: List[Node]) -> float:
        """计算单元质量 (0-1, 越大越好)"""
        if self.element_type == "triangular" and len(self.node_ids) == 3:
            n = [nodes[i] for i in self.node_ids]
            sides = []
            for i in range(3):
                j = (i + 1) % 3
                dx = n[j].x - n[i].x
                dy = n[j].y - n[i].y
                sides.append(np.sqrt(dx**2 + dy**2))
            s = sum(sides) / 2.0
            area = self.compute_area(nodes)
            if area <= 0 or s <= 0:
                return 0.0
            R = (sides[0] * sides[1] * sides[2]) / (4 * area)
            r = area / s
            quality = 2 * r / R
            return max(0.0, min(1.0, quality))
        return 1.0


@dataclass
class Boundary:
    """边界类"""
    name: str
    node_ids: List[int]
    boundary_type: str = "dirichlet"


@dataclass
class MeshCache:
    """网格缓存"""
    params_hash: str
    mesh_type: str
    mesh: "SlopeMesh"
    timestamp: float
    generation_time: float

    def is_valid(self, params_hash: str, mesh_type: str) -> bool:
        """检查缓存是否有效"""
        return self.params_hash == params_hash and self.mesh_type == mesh_type


class SlopeMesh:
    """边坡网格类"""

    def __init__(self):
        self.nodes: List[Node] = []
        self.elements: List[Element] = []
        self.boundaries: Dict[str, Boundary] = {}
        self.node_id_counter: int = 0
        self.element_id_counter: int = 0
        self._node_map: Dict[Tuple[float, float, float], int] = {}
        self._node_coords_cache: Optional[np.ndarray] = None
        self._adjacency_cache: Optional[Dict[int, List[int]]] = None

    def add_node(self, x: float, y: float, z: float = 0.0) -> int:
        """添加节点"""
        key = (round(x, 6), round(y, 6), round(z, 6))
        if key in self._node_map:
            return self._node_map[key]

        node_id = self.node_id_counter
        self.nodes.append(Node(node_id, x, y, z))
        self._node_map[key] = node_id
        self.node_id_counter += 1
        self._node_coords_cache = None
        return node_id

    def add_element(self, node_ids: List[int], element_type: str = "triangular",
                    material_id: int = 0) -> int:
        """添加单元"""
        element_id = self.element_id_counter
        self.elements.append(Element(element_id, node_ids, element_type, material_id))
        self.element_id_counter += 1
        return element_id

    def add_boundary(self, name: str, node_ids: List[int],
                     boundary_type: str = "dirichlet") -> None:
        """添加边界"""
        self.boundaries[name] = Boundary(name, node_ids, boundary_type)

    def get_node_coords(self) -> np.ndarray:
        """获取所有节点坐标数组（使用缓存）"""
        if self._node_coords_cache is None:
            self._node_coords_cache = np.array([[n.x, n.y, n.z] for n in self.nodes])
        return self._node_coords_cache

    def get_element_connectivity(self) -> np.ndarray:
        """获取单元连接关系（numpy数组）"""
        return np.array([e.node_ids for e in self.elements], dtype=np.int64)

    def get_element_materials(self) -> np.ndarray:
        """获取单元材料ID数组"""
        return np.array([e.material_id for e in self.elements], dtype=np.int64)

    def get_adjacency(self) -> Dict[int, List[int]]:
        """获取节点邻接关系（使用缓存）"""
        if self._adjacency_cache is None:
            adjacency: Dict[int, List[int]] = {i: [] for i in range(len(self.nodes))}
            for elem in self.elements:
                for i, nid in enumerate(elem.node_ids):
                    for j, onid in enumerate(elem.node_ids):
                        if i != j and onid not in adjacency[nid]:
                            adjacency[nid].append(onid)
            self._adjacency_cache = adjacency
        return self._adjacency_cache

    def compute_statistics(self) -> Dict:
        """计算网格统计信息（向量化优化）"""
        if not self.elements:
            return {}

        coords = self.get_node_coords()
        conn = self.get_element_connectivity()

        if self.elements[0].element_type == "triangular":
            n0 = coords[conn[:, 0], :2]
            n1 = coords[conn[:, 1], :2]
            n2 = coords[conn[:, 2], :2]

            cross = (n1[:, 0] - n0[:, 0]) * (n2[:, 1] - n0[:, 1]) - \
                    (n2[:, 0] - n0[:, 0]) * (n1[:, 1] - n0[:, 1])
            areas = 0.5 * np.abs(cross)

            sides0 = np.linalg.norm(n1 - n0, axis=1)
            sides1 = np.linalg.norm(n2 - n1, axis=1)
            sides2 = np.linalg.norm(n0 - n2, axis=1)
            s = (sides0 + sides1 + sides2) / 2.0

            valid = (areas > 0) & (s > 0)
            R = np.zeros_like(areas)
            r = np.zeros_like(areas)
            R[valid] = (sides0[valid] * sides1[valid] * sides2[valid]) / (4 * areas[valid])
            r[valid] = areas[valid] / s[valid]

            qualities = np.zeros_like(areas)
            qualities[valid] = 2 * r[valid] / R[valid]
            qualities = np.clip(qualities, 0, 1)

            areas_mean = areas.mean() if len(areas) > 0 else 0.0
            qualities_mean = qualities.mean() if len(qualities) > 0 else 0.0

            stats = {
                "num_nodes": len(self.nodes),
                "num_elements": len(self.elements),
                "total_area": float(areas.sum()),
                "min_area": float(areas.min()) if len(areas) > 0 else 0.0,
                "max_area": float(areas.max()) if len(areas) > 0 else 0.0,
                "mean_area": float(areas_mean),
                "min_quality": float(qualities.min()) if len(qualities) > 0 else 0.0,
                "max_quality": float(qualities.max()) if len(qualities) > 0 else 1.0,
                "mean_quality": float(qualities_mean),
                "element_types": {"triangular": len(self.elements)},
            }
        else:
            areas = np.array([e.compute_area(self.nodes) for e in self.elements])
            qualities = np.array([e.compute_quality(self.nodes) for e in self.elements])

            stats = {
                "num_nodes": len(self.nodes),
                "num_elements": len(self.elements),
                "total_area": float(areas.sum()),
                "min_area": float(areas.min()),
                "max_area": float(areas.max()),
                "mean_area": float(areas.mean()),
                "min_quality": float(qualities.min()),
                "max_quality": float(qualities.max()),
                "mean_quality": float(qualities.mean()),
                "element_types": {},
            }

            for e in self.elements:
                et = e.element_type
                stats["element_types"][et] = stats["element_types"].get(et, 0) + 1

        return stats

    def get_boundary_nodes(self, boundary_name: str) -> List[int]:
        """获取边界节点ID"""
        if boundary_name in self.boundaries:
            return self.boundaries[boundary_name].node_ids
        return []

    def find_elements_in_region(self, x_min: float, y_min: float,
                                x_max: float, y_max: float) -> List[int]:
        """查找指定区域内的单元"""
        coords = self.get_node_coords()
        conn = self.get_element_connectivity()

        elem_centers = np.mean(coords[conn, :2], axis=1)
        in_region = (elem_centers[:, 0] >= x_min) & (elem_centers[:, 0] <= x_max) & \
                    (elem_centers[:, 1] >= y_min) & (elem_centers[:, 1] <= y_max)

        return np.where(in_region)[0].tolist()

    def save_vtk(self, filename: str) -> None:
        """保存为VTK格式"""
        with open(filename, 'w') as f:
            f.write("# vtk DataFile Version 3.0\n")
            f.write("Slope Mesh\n")
            f.write("ASCII\n")
            f.write("DATASET UNSTRUCTURED_GRID\n")

            f.write(f"POINTS {len(self.nodes)} float\n")
            for node in self.nodes:
                f.write(f"{node.x} {node.y} {node.z}\n")

            total_size = sum(len(e.node_ids) + 1 for e in self.elements)
            f.write(f"CELLS {len(self.elements)} {total_size}\n")
            for e in self.elements:
                f.write(f"{len(e.node_ids)} {' '.join(map(str, e.node_ids))}\n")

            f.write(f"CELL_TYPES {len(self.elements)}\n")
            for e in self.elements:
                if e.element_type == "triangular":
                    f.write("5\n")
                elif e.element_type == "quadrilateral":
                    f.write("9\n")

            f.write(f"CELL_DATA {len(self.elements)}\n")
            f.write("SCALARS material_id int 1\n")
            f.write("LOOKUP_TABLE default\n")
            for e in self.elements:
                f.write(f"{e.material_id}\n")

    def plot(self, show: bool = True, ax: Optional[plt.Axes] = None,
             title: str = "边坡网格") -> plt.Axes:
        """绘制网格"""
        if ax is None:
            fig, ax = plt.subplots(figsize=(12, 8))

        patches = []
        for e in self.elements:
            nodes = [self.nodes[i] for i in e.node_ids]
            coords = [[n.x, n.y] for n in nodes]
            patches.append(Polygon(coords, closed=True, fill=False))

        pc = PatchCollection(patches, facecolors='none', edgecolors='black', linewidth=0.5)
        ax.add_collection(pc)

        xs = [n.x for n in self.nodes]
        ys = [n.y for n in self.nodes]
        ax.scatter(xs, ys, s=2, color='red')

        for name, boundary in self.boundaries.items():
            bnodes = [self.nodes[i] for i in boundary.node_ids]
            bxs = [n.x for n in bnodes]
            bys = [n.y for n in bnodes]
            ax.scatter(bxs, bys, s=10, label=name)

        ax.set_aspect('equal')
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title(title)
        ax.legend()
        ax.autoscale()

        if show:
            plt.show()

        return ax


class OptimizedMeshGenerator:
    """优化的网格生成器"""

    def __init__(self, parameters: SlopeParameters, cache_dir: str = "cache/mesh"):
        self.params = parameters
        self.mesh = SlopeMesh()
        self.cache_dir = cache_dir
        self.cache: Optional[MeshCache] = None
        os.makedirs(cache_dir, exist_ok=True)
        self._load_cache()

    def _compute_params_hash(self) -> str:
        """计算参数哈希"""
        param_str = f"{self.params.geometry.height}_{self.params.geometry.angle}_" \
                    f"{self.params.geometry.total_width}_{self.params.geometry.total_height}_" \
                    f"{self.params.mesh_settings.min_element_size}_" \
                    f"{self.params.mesh_settings.max_element_size}_" \
                    f"{len(self.params.soil_layers)}"
        for layer in self.params.soil_layers:
            param_str += f"_{layer.thickness}"
        return hashlib.md5(param_str.encode()).hexdigest()

    def _load_cache(self) -> None:
        """加载缓存"""
        cache_file = os.path.join(self.cache_dir, "mesh_cache.pkl")
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'rb') as f:
                    self.cache = pickle.load(f)
                logger.info("已加载网格缓存")
            except Exception as e:
                logger.warning(f"加载缓存失败: {e}")
                self.cache = None

    def _save_cache(self, mesh_type: str, mesh: SlopeMesh, generation_time: float) -> None:
        """保存缓存"""
        params_hash = self._compute_params_hash()
        self.cache = MeshCache(
            params_hash=params_hash,
            mesh_type=mesh_type,
            mesh=mesh,
            timestamp=time.time(),
            generation_time=generation_time
        )
        try:
            cache_file = os.path.join(self.cache_dir, "mesh_cache.pkl")
            with open(cache_file, 'wb') as f:
                pickle.dump(self.cache, f, protocol=pickle.HIGHEST_PROTOCOL)
            logger.info("网格缓存已保存")
        except Exception as e:
            logger.warning(f"保存缓存失败: {e}")

    def _check_cache(self, mesh_type: str) -> Optional[SlopeMesh]:
        """检查缓存"""
        if self.cache is None:
            return None

        params_hash = self._compute_params_hash()
        if self.cache.is_valid(params_hash, mesh_type):
            logger.info(f"使用缓存网格 (生成时间: {self.cache.generation_time:.2f}s)")
            return self.cache.mesh
        return None

    def generate_boundary_nodes(self) -> np.ndarray:
        """生成边界节点（向量化）"""
        geom = self.params.geometry
        mesh_settings = self.params.mesh_settings

        nodes_list = []

        left_x = 0.0
        right_x = geom.total_width
        bottom_y = 0.0
        top_y = geom.total_height

        crest_start_x = geom.toe_width + geom.horizontal_projection
        crest_end_x = geom.toe_width + geom.horizontal_projection + geom.crest_width

        num_bottom = max(3, int(geom.total_width / mesh_settings.max_element_size))
        bottom_x = np.linspace(left_x, right_x, num_bottom + 1)
        for x in bottom_x:
            nodes_list.append([x, bottom_y, 0.0])

        num_left = max(2, int((geom.total_height - geom.height) / mesh_settings.max_element_size))
        left_y = np.linspace(bottom_y, geom.total_height - geom.height, num_left + 1)[1:]
        for y in left_y:
            nodes_list.append([left_x, y, 0.0])

        slope_start_y = geom.total_height - geom.height
        num_slope = max(5, int(geom.slope_length / mesh_settings.max_element_size))
        slope_t = np.linspace(0, 1, num_slope + 1)[1:]
        slope_x = geom.toe_width + geom.horizontal_projection * slope_t
        slope_y = slope_start_y + geom.height * slope_t
        for x, y in zip(slope_x, slope_y):
            nodes_list.append([x, y, 0.0])

        num_crest = max(2, int(geom.crest_width / mesh_settings.max_element_size))
        crest_x = np.linspace(crest_start_x, crest_end_x, num_crest + 1)[1:]
        for x in crest_x:
            nodes_list.append([x, top_y, 0.0])

        num_right = max(2, int(geom.total_height / mesh_settings.max_element_size))
        right_y = np.linspace(top_y, bottom_y, num_right + 1)[1:-1]
        for y in right_y:
            nodes_list.append([right_x, y, 0.0])

        return np.array(nodes_list)

    def generate_internal_nodes_fast(self) -> np.ndarray:
        """快速生成内部节点（向量化，支持复杂边坡形态）"""
        geom = self.params.geometry
        mesh_settings = self.params.mesh_settings

        dx = mesh_settings.min_element_size
        dy = mesh_settings.min_element_size

        left_x = 0.0
        right_x = geom.total_width
        bottom_y = 0.0
        top_y = geom.total_height

        slope_start_y = geom.total_height - geom.height
        slope_end_x = geom.toe_width + geom.horizontal_projection
        crest_end_x = slope_end_x + geom.crest_width

        x_range = np.arange(left_x + dx, right_x, dx)
        y_range = np.arange(bottom_y + dy, top_y, dy)

        xv, yv = np.meshgrid(x_range, y_range)
        xv = xv.flatten()
        yv = yv.flatten()

        below_slope = (xv <= geom.toe_width) | (xv >= slope_end_x)
        above_toe_below_crest = (xv > geom.toe_width) & (xv < slope_end_x)
        slope_ratio = geom.height / geom.horizontal_projection if geom.horizontal_projection > 1e-10 else 1e10
        slope_y_at_x = slope_start_y + (xv - geom.toe_width) * slope_ratio
        above_crest = (xv >= slope_end_x) & (xv <= crest_end_x)

        valid_below = below_slope & (yv >= bottom_y) & (yv <= top_y)
        valid_slope = above_toe_below_crest & (yv >= bottom_y) & (yv <= slope_y_at_x)
        valid_crest = above_crest & (yv >= bottom_y) & (yv <= top_y)
        valid_above_toe = above_toe_below_crest & (yv > slope_y_at_x) & (yv <= top_y)

        valid = valid_below | valid_slope | valid_crest | valid_above_toe

        internal_nodes = np.column_stack([xv[valid], yv[valid], np.zeros_like(xv[valid])])
        return internal_nodes

    def generate_delaunay_mesh_optimized(self) -> SlopeMesh:
        """使用优化的Delaunay三角剖分生成网格"""
        start_time = time.time()

        boundary_nodes = self.generate_boundary_nodes()
        internal_nodes = self.generate_internal_nodes_fast()

        all_nodes = np.vstack([boundary_nodes, internal_nodes])

        unique_nodes = {}
        coords_list = []
        for i, (x, y, z) in enumerate(all_nodes):
            key = (round(x, 6), round(y, 6), round(z, 6))
            if key not in unique_nodes:
                unique_nodes[key] = len(coords_list)
                coords_list.append([x, y, z])

        coords_array = np.array(coords_list)
        coords_2d = coords_array[:, :2]

        for x, y, z in coords_array:
            self.mesh.add_node(x, y, z)

        logger.info(f"Delaunay三角剖分: {len(coords_array)} 个节点...")
        tri = Delaunay(coords_2d, qhull_options="QJ Pp")
        logger.info(f"三角剖分完成: {len(tri.simplices)} 个原始三角形")

        geom = self.params.geometry
        model_scale = min(geom.total_width, geom.total_height)
        rel_tol = model_scale * 1e-4

        slope_start_y = geom.total_height - geom.height
        slope_ratio = geom.height / geom.horizontal_projection if geom.horizontal_projection > 1e-10 else 1e10
        slope_intercept = slope_start_y - geom.toe_width * slope_ratio

        simplices = tri.simplices
        pts = coords_2d

        n0 = pts[simplices[:, 0]]
        n1 = pts[simplices[:, 1]]
        n2 = pts[simplices[:, 2]]

        cross = (n1[:, 0] - n0[:, 0]) * (n2[:, 1] - n0[:, 1]) - \
                (n2[:, 0] - n0[:, 0]) * (n1[:, 1] - n0[:, 1])
        areas = 0.5 * cross

        positive_area = areas > 1e-14

        sides_a = np.linalg.norm(n1 - n0, axis=1)
        sides_b = np.linalg.norm(n2 - n1, axis=1)
        sides_c = np.linalg.norm(n0 - n2, axis=1)
        perimeters = sides_a + sides_b + sides_c
        min_side = np.minimum(np.minimum(sides_a, sides_b), sides_c)

        aspect_ratio = np.zeros_like(sides_a)
        valid_perim = perimeters > 1e-14
        aspect_ratio[valid_perim] = sides_a[valid_perim] / min_side[valid_perim]

        centroids = np.mean(pts[simplices], axis=1)
        cx, cy = centroids[:, 0], centroids[:, 1]

        in_bbox = (cx >= -rel_tol) & (cx <= geom.total_width + rel_tol) & \
                  (cy >= -rel_tol) & (cy <= geom.total_height + rel_tol)

        slope_y_at_cx = slope_intercept + cx * slope_ratio
        slope_end_x = geom.toe_width + geom.horizontal_projection
        crest_end_x = slope_end_x + geom.crest_width

        in_slope_region = (cx >= geom.toe_width - rel_tol) & (cx <= slope_end_x + rel_tol)
        above_slope_in_slope_region = in_slope_region & (cy > slope_y_at_cx + rel_tol)

        in_crest_region = (cx >= slope_end_x - rel_tol) & (cx <= crest_end_x + rel_tol)
        above_crest_in_crest_region = in_crest_region & (cy > geom.total_height + rel_tol)

        outside_domain = above_slope_in_slope_region | above_crest_in_crest_region

        quality_threshold = self.params.mesh_settings.quality_threshold
        max_aspect = 1.0 / max(quality_threshold, 0.01)

        valid_mask = positive_area & in_bbox & ~outside_domain & (aspect_ratio <= max_aspect)

        valid_triangles = simplices[valid_mask]
        valid_areas = np.abs(areas[valid_mask])

        logger.info(f"过滤后保留 {len(valid_triangles)} 个有效三角形 "
                     f"(移除 {len(simplices) - len(valid_triangles)} 个畸形/越界单元)")

        if len(valid_triangles) == 0:
            logger.error("所有三角形均被过滤，网格生成失败！请检查边坡几何参数。")
            return self.mesh

        for tri_nodes in valid_triangles:
            self.mesh.add_element(tri_nodes.tolist(), "triangular", 0)

        self._assign_material_ids_vectorized()
        self._identify_boundaries_fast()

        self._validate_and_repair_mesh()

        generation_time = time.time() - start_time
        logger.info(f"网格生成完成，耗时: {generation_time:.2f}s")
        logger.info(f"最终网格: {len(self.mesh.nodes)} 节点, {len(self.mesh.elements)} 单元")

        return self.mesh

    def _validate_and_repair_mesh(self) -> None:
        """验证并修复网格质量：移除退化单元和低质量单元"""
        if not self.mesh.elements:
            return

        coords = self.mesh.get_node_coords()
        conn = self.mesh.get_element_connectivity()
        min_quality = self.params.mesh_settings.quality_threshold

        n0 = coords[conn[:, 0], :2]
        n1 = coords[conn[:, 1], :2]
        n2 = coords[conn[:, 2], :2]

        cross = (n1[:, 0] - n0[:, 0]) * (n2[:, 1] - n0[:, 1]) - \
                (n2[:, 0] - n0[:, 0]) * (n1[:, 1] - n0[:, 1])
        areas = 0.5 * np.abs(cross)

        sides0 = np.linalg.norm(n1 - n0, axis=1)
        sides1 = np.linalg.norm(n2 - n1, axis=1)
        sides2 = np.linalg.norm(n0 - n2, axis=1)
        s = (sides0 + sides1 + sides2) / 2.0

        valid = (areas > 1e-14) & (s > 1e-14)
        R = np.zeros_like(areas)
        r = np.zeros_like(areas)
        R[valid] = (sides0[valid] * sides1[valid] * sides2[valid]) / (4 * areas[valid])
        r[valid] = areas[valid] / s[valid]

        qualities = np.zeros_like(areas)
        qualities[valid] = 2 * r[valid] / R[valid]
        qualities = np.clip(qualities, 0, 1)

        degenerate_mask = (areas < 1e-14) | (qualities < min_quality * 0.1)
        degenerate_indices = np.where(degenerate_mask)[0]

        if len(degenerate_indices) > 0:
            logger.warning(f"发现 {len(degenerate_indices)} 个退化/极低质量单元，正在移除...")
            keep_mask = ~degenerate_mask
            self.mesh.elements = [e for e, k in zip(self.mesh.elements, keep_mask) if k]
            for i, elem in enumerate(self.mesh.elements):
                elem.id = i
            self.mesh.element_id_counter = len(self.mesh.elements)
            self.mesh._node_coords_cache = None
            self.mesh._adjacency_cache = None

        poor_quality_mask = (qualities >= min_quality * 0.1) & (qualities < min_quality) & ~degenerate_mask
        poor_count = np.sum(poor_quality_mask)
        if poor_count > 0:
            logger.warning(f"发现 {poor_count} 个低质量单元 (质量 < {min_quality:.3f})，建议加密或优化")

    def _assign_material_ids_vectorized(self) -> None:
        """向量化分配材料ID"""
        if not self.params.soil_layers:
            return

        geom = self.params.geometry
        coords = self.mesh.get_node_coords()
        conn = self.mesh.get_element_connectivity()

        elem_centers_y = np.mean(coords[conn, 1], axis=1)

        layer_boundaries = []
        current_y = geom.total_height
        for layer in self.params.soil_layers:
            current_y -= layer.thickness
            layer_boundaries.append(current_y)

        material_ids = np.zeros(len(self.mesh.elements), dtype=np.int64)
        for i, boundary in enumerate(layer_boundaries):
            material_ids[elem_centers_y >= boundary] = i

        for elem, mid in zip(self.mesh.elements, material_ids):
            elem.material_id = int(mid)

    def _identify_boundaries_fast(self) -> None:
        """快速识别边界节点（使用模型相对容差）"""
        geom = self.params.geometry
        model_scale = min(geom.total_width, geom.total_height)
        tolerance = model_scale * 1e-4
        coords = self.mesh.get_node_coords()

        x = coords[:, 0]
        y = coords[:, 1]

        left_mask = np.abs(x - 0.0) < tolerance
        right_mask = np.abs(x - geom.total_width) < tolerance
        bottom_mask = np.abs(y - 0.0) < tolerance
        top_mask = np.abs(y - geom.total_height) < tolerance

        slope_start_y = geom.total_height - geom.height
        slope_ratio = geom.height / geom.horizontal_projection if geom.horizontal_projection > 1e-10 else 1e10
        slope_intercept = slope_start_y - geom.toe_width * slope_ratio
        slope_y = slope_intercept + x * slope_ratio
        slope_end_x = geom.toe_width + geom.horizontal_projection
        slope_mask = (np.abs(y - slope_y) < tolerance * 5) & \
                     (x >= geom.toe_width - tolerance) & \
                     (x <= slope_end_x + tolerance)

        self.mesh.add_boundary("left", np.where(left_mask)[0].tolist(), "dirichlet")
        self.mesh.add_boundary("right", np.where(right_mask)[0].tolist(), "dirichlet")
        self.mesh.add_boundary("bottom", np.where(bottom_mask)[0].tolist(), "dirichlet")
        self.mesh.add_boundary("top", np.where(top_mask)[0].tolist(), "neumann")
        self.mesh.add_boundary("slope", np.where(slope_mask)[0].tolist(), "free")

    def refine_region(self, x_min: float, y_min: float,
                      x_max: float, y_max: float,
                      refinement_level: int = 1) -> None:
        """区域加密"""
        elements_to_refine = self.mesh.find_elements_in_region(x_min, y_min, x_max, y_max)
        logger.info(f"区域加密: 找到 {len(elements_to_refine)} 个单元需要细化")

        for _ in range(refinement_level):
            new_elements = []
            new_nodes = {}

            for elem_id in elements_to_refine:
                elem = self.mesh.elements[elem_id]
                if elem.element_type != "triangular":
                    continue

                nodes = [self.mesh.nodes[nid] for nid in elem.node_ids]
                mid_nodes = []

                for i in range(3):
                    j = (i + 1) % 3
                    key = (min(elem.node_ids[i], elem.node_ids[j]),
                           max(elem.node_ids[i], elem.node_ids[j]))
                    if key not in new_nodes:
                        n1, n2 = nodes[i], nodes[j]
                        mid_x = (n1.x + n2.x) / 2.0
                        mid_y = (n1.y + n2.y) / 2.0
                        new_node_id = self.mesh.add_node(mid_x, mid_y)
                        new_nodes[key] = new_node_id
                    mid_nodes.append(new_nodes[key])

                n0, n1, n2 = elem.node_ids
                m01, m12, m20 = mid_nodes

                self.mesh.elements[elem_id].node_ids = [n0, m01, m20]
                new_elements.append([m01, n1, m12])
                new_elements.append([m20, m12, n2])
                new_elements.append([m01, m12, m20])

            for node_ids in new_elements:
                self.mesh.add_element(node_ids, "triangular", 0)

        self._assign_material_ids_vectorized()
        self._identify_boundaries_fast()

    def optimize_mesh_laplacian(self, num_iterations: int = 5) -> None:
        """优化网格质量 (Laplacian平滑，向量化)"""
        adjacency = self.mesh.get_adjacency()
        coords = self.mesh.get_node_coords()

        boundary_nodes = set()
        for boundary in self.mesh.boundaries.values():
            boundary_nodes.update(boundary.node_ids)

        for _ in range(num_iterations):
            new_coords = coords.copy()

            for node_id in range(len(self.mesh.nodes)):
                if node_id in boundary_nodes:
                    continue

                neighbors = adjacency[node_id]
                if not neighbors:
                    continue

                new_coords[node_id, :2] = np.mean(coords[neighbors, :2], axis=0)

            for node_id in range(len(self.mesh.nodes)):
                self.mesh.nodes[node_id].x = new_coords[node_id, 0]
                self.mesh.nodes[node_id].y = new_coords[node_id, 1]

            coords = new_coords

    def generate(self, mesh_type: str = "delaunay", use_cache: bool = True,
                  optimize: bool = True) -> SlopeMesh:
        """生成网格"""
        if use_cache:
            cached_mesh = self._check_cache(mesh_type)
            if cached_mesh is not None:
                return cached_mesh

        start_time = time.time()

        if mesh_type == "delaunay":
            mesh = self.generate_delaunay_mesh_optimized()
        elif mesh_type == "structured":
            mesh = self.generate_structured_mesh()
        else:
            raise ValueError(f"不支持的网格类型: {mesh_type}")

        if self.params.mesh_settings.boundary_refinement_level > 0:
            self.refine_boundary("slope", self.params.mesh_settings.boundary_refinement_level)

        if optimize:
            self.optimize_mesh_laplacian()

        generation_time = time.time() - start_time

        if use_cache:
            self._save_cache(mesh_type, mesh, generation_time)

        return mesh

    def refine_boundary(self, boundary_name: str, refinement_level: int = 1) -> None:
        """边界加密"""
        if boundary_name not in self.mesh.boundaries:
            return

        boundary = self.mesh.boundaries[boundary_name]
        for _ in range(refinement_level):
            new_nodes = []
            for i in range(len(boundary.node_ids) - 1):
                n1 = self.mesh.nodes[boundary.node_ids[i]]
                n2 = self.mesh.nodes[boundary.node_ids[i + 1]]
                mid_x = (n1.x + n2.x) / 2.0
                mid_y = (n1.y + n2.y) / 2.0
                new_node_id = self.mesh.add_node(mid_x, mid_y)
                new_nodes.append(new_node_id)

            all_nodes = []
            for i, nid in enumerate(boundary.node_ids):
                all_nodes.append(nid)
                if i < len(new_nodes):
                    all_nodes.append(new_nodes[i])
            boundary.node_ids = all_nodes

    def generate_structured_mesh(self) -> SlopeMesh:
        """生成结构化网格"""
        geom = self.params.geometry
        mesh_settings = self.params.mesh_settings

        nx = max(10, int(geom.total_width / mesh_settings.min_element_size))
        ny = max(10, int(geom.total_height / mesh_settings.min_element_size))

        x_coords = np.linspace(0, geom.total_width, nx)
        y_coords = np.linspace(0, geom.total_height, ny)

        for y in y_coords:
            for x in x_coords:
                self.mesh.add_node(x, y)

        for j in range(ny - 1):
            for i in range(nx - 1):
                n1 = j * nx + i
                n2 = j * nx + i + 1
                n3 = (j + 1) * nx + i + 1
                n4 = (j + 1) * nx + i
                self.mesh.add_element([n1, n2, n3, n4], "quadrilateral", 0)

        self._assign_material_ids_vectorized()
        self._identify_boundaries_fast()

        return self.mesh


class IncrementalMeshModifier:
    """增量网格修改器"""

    def __init__(self, mesh: SlopeMesh):
        self.mesh = mesh
        self.kdtree = KDTree(mesh.get_node_coords()[:, :2])
        self._build_element_tree()

    def _build_element_tree(self) -> None:
        """构建单元空间索引"""
        coords = self.mesh.get_node_coords()
        conn = self.mesh.get_element_connectivity()
        self.elem_centers = np.mean(coords[conn, :2], axis=1)
        self.elem_tree = KDTree(self.elem_centers)

    def find_nearest_element(self, x: float, y: float) -> int:
        """查找最近的单元"""
        dist, idx = self.elem_tree.query([x, y], k=1)
        return int(idx)

    def find_elements_within_radius(self, x: float, y: float, radius: float) -> List[int]:
        """查找半径内的单元"""
        indices = self.elem_tree.query_ball_point([x, y], radius)
        return indices

    def split_element(self, element_id: int) -> List[int]:
        """分裂单元（三角形->4个小三角形）"""
        elem = self.mesh.elements[element_id]
        if elem.element_type != "triangular":
            return []

        nodes = [self.mesh.nodes[nid] for nid in elem.node_ids]
        mid_nodes = []

        for i in range(3):
            j = (i + 1) % 3
            n1, n2 = nodes[i], nodes[j]
            mid_x = (n1.x + n2.x) / 2.0
            mid_y = (n1.y + n2.y) / 2.0
            new_node_id = self.mesh.add_node(mid_x, mid_y)
            mid_nodes.append(new_node_id)

        n0, n1, n2 = elem.node_ids
        m01, m12, m20 = mid_nodes

        elem.node_ids = [n0, m01, m20]

        new_elems = []
        new_elems.append(self.mesh.add_element([m01, n1, m12], "triangular", elem.material_id))
        new_elems.append(self.mesh.add_element([m20, m12, n2], "triangular", elem.material_id))
        new_elems.append(self.mesh.add_element([m01, m12, m20], "triangular", elem.material_id))

        self._build_element_tree()
        return new_elems

    def refine_area_around_point(self, x: float, y: float, radius: float, levels: int = 1) -> None:
        """加密点周围区域"""
        for _ in range(levels):
            elements = self.find_elements_within_radius(x, y, radius)
            for elem_id in elements:
                self.split_element(elem_id)
            radius *= 0.7

    def merge_elements(self, element_ids: List[int]) -> Optional[int]:
        """合并单元（简化实现）"""
        if len(element_ids) != 2:
            return None

        e1 = self.mesh.elements[element_ids[0]]
        e2 = self.mesh.elements[element_ids[1]]

        if e1.element_type != "triangular" or e2.element_type != "triangular":
            return None

        common_nodes = set(e1.node_ids) & set(e2.node_ids)
        if len(common_nodes) != 2:
            return None

        unique_nodes = list(set(e1.node_ids) | set(e2.node_ids))
        if len(unique_nodes) != 4:
            return None

        new_elem_id = self.mesh.add_element(unique_nodes, "quadrilateral", e1.material_id)

        for eid in sorted(element_ids, reverse=True):
            del self.mesh.elements[eid]

        for i, elem in enumerate(self.mesh.elements):
            elem.id = i
        self.mesh.element_id_counter = len(self.mesh.elements)

        self._build_element_tree()
        return new_elem_id


class MeshGenerator(OptimizedMeshGenerator):
    """兼容旧接口的网格生成器"""
    pass
