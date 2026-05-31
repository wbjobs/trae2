import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import json
import os


@dataclass
class MeshData:
    nodes: np.ndarray
    elements: np.ndarray
    node_ids: np.ndarray
    element_ids: np.ndarray
    boundary_nodes: Dict[str, np.ndarray]
    element_materials: np.ndarray
    mesh_size: float
    num_nodes: int = 0
    num_elements: int = 0
    
    def __post_init__(self):
        self.num_nodes = len(self.nodes)
        self.num_elements = len(self.elements)
    
    def save(self, output_path: str) -> None:
        data = {
            'nodes': self.nodes.tolist(),
            'elements': self.elements.tolist(),
            'node_ids': self.node_ids.tolist(),
            'element_ids': self.element_ids.tolist(),
            'boundary_nodes': {k: v.tolist() for k, v in self.boundary_nodes.items()},
            'element_materials': self.element_materials.tolist(),
            'mesh_size': self.mesh_size,
            'num_nodes': self.num_nodes,
            'num_elements': self.num_elements
        }
        
        file_ext = os.path.splitext(output_path)[1].lower()
        
        if file_ext == '.json':
            with open(output_path, 'w') as f:
                json.dump(data, f, indent=2)
        elif file_ext == '.npz':
            np.savez(output_path, **{k: np.array(v) if isinstance(v, list) else v 
                                    for k, v in data.items()})
    
    @classmethod
    def load(cls, input_path: str) -> 'MeshData':
        file_ext = os.path.splitext(input_path)[1].lower()
        
        if file_ext == '.json':
            with open(input_path, 'r') as f:
                data = json.load(f)
            return cls(
                nodes=np.array(data['nodes']),
                elements=np.array(data['elements']),
                node_ids=np.array(data['node_ids']),
                element_ids=np.array(data['element_ids']),
                boundary_nodes={k: np.array(v) for k, v in data['boundary_nodes'].items()},
                element_materials=np.array(data['element_materials']),
                mesh_size=data['mesh_size']
            )
        elif file_ext == '.npz':
            data = np.load(input_path, allow_pickle=True)
            return cls(
                nodes=data['nodes'],
                elements=data['elements'],
                node_ids=data['node_ids'],
                element_ids=data['element_ids'],
                boundary_nodes=data['boundary_nodes'].item(),
                element_materials=data['element_materials'],
                mesh_size=float(data['mesh_size'])
            )
        else:
            raise ValueError(f"不支持的网格文件格式: {file_ext}")


class MeshGenerator:
    def __init__(self, params_parser):
        self.params = params_parser
        self.mesh_data: Optional[MeshData] = None
    
    def generate_dam_geometry_points(self) -> Tuple[np.ndarray, Dict[str, List[int]]]:
        geom = self.params.dam_geometry
        if geom is None:
            raise ValueError("坝体几何参数未设置")
        
        H = geom.dam_height
        B = geom.crest_width
        m1 = geom.upstream_slope
        m2 = geom.downstream_slope
        D = geom.foundation_depth
        
        upstream_foot_x = 0.0
        upstream_crest_x = m1 * H
        downstream_crest_x = upstream_crest_x + B
        downstream_foot_x = downstream_crest_x + m2 * H
        
        foundation_left = -D * 2
        foundation_right = downstream_foot_x + D * 2
        foundation_bottom = -D
        
        points = []
        boundary_markers = {}
        
        bottom_points = self._generate_edge_points(
            (foundation_left, foundation_bottom),
            (foundation_right, foundation_bottom)
        )
        bottom_start = len(points)
        points.extend(bottom_points)
        boundary_markers['bottom'] = list(range(bottom_start, len(points)))
        
        left_points = self._generate_edge_points(
            (foundation_left, foundation_bottom),
            (foundation_left, 0)
        )
        left_start = len(points)
        points.extend(left_points[1:])
        boundary_markers['left'] = list(range(left_start, len(points)))
        
        upstream_slope_points = self._generate_edge_points(
            (upstream_foot_x, 0),
            (upstream_crest_x, H)
        )
        upstream_start = len(points)
        points.extend(upstream_slope_points[1:])
        boundary_markers['upstream_slope'] = list(range(upstream_start, len(points)))
        
        crest_points = self._generate_edge_points(
            (upstream_crest_x, H),
            (downstream_crest_x, H)
        )
        crest_start = len(points)
        points.extend(crest_points[1:])
        boundary_markers['crest'] = list(range(crest_start, len(points)))
        
        downstream_slope_points = self._generate_edge_points(
            (downstream_crest_x, H),
            (downstream_foot_x, 0)
        )
        downstream_start = len(points)
        points.extend(downstream_slope_points[1:])
        boundary_markers['downstream_slope'] = list(range(downstream_start, len(points)))
        
        right_points = self._generate_edge_points(
            (foundation_right, 0),
            (foundation_right, foundation_bottom)
        )
        right_start = len(points)
        points.extend(right_points[1:-1])
        boundary_markers['right'] = list(range(right_start, len(points)))
        
        unique_points = []
        seen = set()
        for p in points:
            key = (round(p[0], 6), round(p[1], 6))
            if key not in seen:
                seen.add(key)
                unique_points.append(p)
        
        return np.array(unique_points), boundary_markers
    
    def _generate_edge_points(self, p1: Tuple[float, float], 
                              p2: Tuple[float, float]) -> List[Tuple[float, float]]:
        mesh_size = self.params.mesh_params.get('mesh_size', 1.0)
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = np.sqrt(dx * dx + dy * dy)
        
        n_points = max(2, int(np.ceil(length / mesh_size)) + 1)
        
        points = []
        for i in range(n_points):
            t = i / (n_points - 1)
            x = p1[0] + t * dx
            y = p1[1] + t * dy
            points.append((x, y))
        
        return points
    
    def generate_structured_mesh(self) -> MeshData:
        geom = self.params.dam_geometry
        if geom is None:
            raise ValueError("坝体几何参数未设置")
        
        mesh_size = self.params.mesh_params.get('mesh_size', 1.0)
        refinement = self.params.mesh_params.get('refinement_level', 1)
        actual_mesh_size = mesh_size / refinement
        
        H = geom.dam_height
        B = geom.crest_width
        m1 = geom.upstream_slope
        m2 = geom.downstream_slope
        D = geom.foundation_depth
        
        upstream_crest_x = m1 * H
        downstream_crest_x = upstream_crest_x + B
        downstream_foot_x = downstream_crest_x + m2 * H
        
        foundation_left = -D * 2
        foundation_right = downstream_foot_x + D * 2
        foundation_bottom = -D
        
        x_min, x_max = foundation_left, foundation_right
        y_min, y_max = foundation_bottom, H
        
        y_levels = self._generate_adaptive_y_levels(y_min, y_max, H, actual_mesh_size)
        
        nodes = []
        node_id = 0
        node_ids = []
        
        for y in y_levels:
            x_bounds = self._get_x_bounds_at_y(y, geom)
            if x_bounds is None:
                continue
            x_left, x_right = x_bounds
            x_coords = self._generate_adaptive_x_coords(x_left, x_right, y, H, m1, m2, upstream_crest_x, downstream_crest_x, actual_mesh_size)
            for x in x_coords:
                nodes.append((x, y))
                node_ids.append(node_id)
                node_id += 1
        
        nodes = np.array(nodes)
        node_ids = np.array(node_ids)
        
        node_to_idx = {(round(n[0], 6), round(n[1], 6)): i for i, n in enumerate(nodes)}
        
        elements = []
        element_materials = []
        
        for y_idx in range(len(y_levels) - 1):
            y1, y2 = y_levels[y_idx], y_levels[y_idx + 1]
            
            x_bounds1 = self._get_x_bounds_at_y(y1, geom)
            x_bounds2 = self._get_x_bounds_at_y(y2, geom)
            
            if x_bounds1 is None or x_bounds2 is None:
                continue
            
            x1_left, x1_right = x_bounds1
            x2_left, x2_right = x_bounds2
            
            x_coords1 = self._generate_adaptive_x_coords(x1_left, x1_right, y1, H, m1, m2, upstream_crest_x, downstream_crest_x, actual_mesh_size)
            x_coords2 = self._generate_adaptive_x_coords(x2_left, x2_right, y2, H, m1, m2, upstream_crest_x, downstream_crest_x, actual_mesh_size)
            
            n1 = len(x_coords1)
            n2 = len(x_coords2)
            
            if n1 < 2 or n2 < 2:
                continue
            
            min_n = min(n1, n2)
            ratio1 = (n1 - 1) / max(1, (min_n - 1))
            ratio2 = (n2 - 1) / max(1, (min_n - 1))
            
            for i in range(min_n - 1):
                idx1_low = min(int(i * ratio1), n1 - 2)
                idx1_high = min(int((i + 1) * ratio1), n1 - 1)
                idx2_low = min(int(i * ratio2), n2 - 2)
                idx2_high = min(int((i + 1) * ratio2), n2 - 1)
                
                x1a, x1b = x_coords1[idx1_low], x_coords1[idx1_high]
                x2a, x2b = x_coords2[idx2_low], x_coords2[idx2_high]
                
                corners = [(x1a, y1), (x1b, y1), (x2b, y2), (x2a, y2)]
                
                element_nodes = []
                for corner in corners:
                    key = (round(corner[0], 6), round(corner[1], 6))
                    if key in node_to_idx:
                        element_nodes.append(node_to_idx[key])
                
                if len(element_nodes) == 4:
                    elements.append(element_nodes)
                    cx = (x1a + x1b + x2a + x2b) / 4
                    cy = (y1 + y2) / 2
                    element_materials.append(self._get_material_id(cx, cy))
        
        elements = np.array(elements)
        element_materials = np.array(element_materials)
        element_ids = np.arange(len(elements))
        
        elements, element_materials = self._filter_deformed_elements(nodes, elements, element_materials)
        
        boundary_nodes = self._identify_boundary_nodes(nodes, elements)
        
        self.mesh_data = MeshData(
            nodes=nodes,
            elements=elements,
            node_ids=node_ids,
            element_ids=element_ids,
            boundary_nodes=boundary_nodes,
            element_materials=element_materials,
            mesh_size=actual_mesh_size
        )
        
        return self.mesh_data
    
    def _generate_adaptive_y_levels(self, y_min, y_max, H, mesh_size):
        y_levels = [y_min]
        current_y = y_min
        
        while current_y < y_max:
            if current_y < 0:
                dy = min(mesh_size * 1.5, -current_y)
            elif current_y < H * 0.3:
                dy = mesh_size * 0.7
            elif current_y < H * 0.7:
                dy = mesh_size
            elif current_y < H:
                dy = mesh_size * 0.8
            else:
                dy = mesh_size
            
            next_y = current_y + dy
            if next_y > y_max:
                next_y = y_max
            y_levels.append(next_y)
            current_y = next_y
        
        return y_levels
    
    def _generate_adaptive_x_coords(self, x_left, x_right, y, H, m1, m2, upstream_crest_x, downstream_crest_x, mesh_size):
        if abs(x_right - x_left) < mesh_size * 0.5:
            return [x_left, x_right]
        
        n_points = max(2, int(abs(x_right - x_left) / mesh_size) + 1)
        
        refinement_zones = []
        if y > 0 and y <= H:
            upstream_boundary = m1 * y
            downstream_boundary = downstream_crest_x + m2 * (H - y)
            
            if abs(x_left - upstream_boundary) < mesh_size * 2:
                refinement_zones.append((upstream_boundary, mesh_size * 0.5))
            if abs(x_right - downstream_boundary) < mesh_size * 2:
                refinement_zones.append((downstream_boundary, mesh_size * 0.5))
        
        if not refinement_zones:
            return np.linspace(x_left, x_right, n_points).tolist()
        
        x_coords = [x_left]
        current_x = x_left
        
        while current_x < x_right:
            min_dx = mesh_size
            for zone_x, zone_dx in refinement_zones:
                if abs(current_x - zone_x) < mesh_size * 3:
                    min_dx = min(min_dx, zone_dx)
            
            next_x = min(current_x + min_dx, x_right)
            x_coords.append(next_x)
            current_x = next_x
        
        return sorted(set(x_coords))
    
    def _get_x_bounds_at_y(self, y, geom):
        H = geom.dam_height
        D = geom.foundation_depth
        m1 = geom.upstream_slope
        m2 = geom.downstream_slope
        B = geom.crest_width
        
        downstream_crest_x = m1 * H + B
        foundation_left = -D * 2
        foundation_right = downstream_crest_x + m2 * H + D * 2
        
        if y <= 0:
            return (foundation_left, foundation_right)
        elif y <= H:
            x_left = m1 * y
            x_right = downstream_crest_x + m2 * (H - y)
            return (x_left, x_right)
        else:
            return None
    
    def _filter_deformed_elements(self, nodes, elements, element_materials):
        if len(elements) == 0:
            return elements, element_materials

        max_aspect_ratio = 5.0
        max_angle_deviation = 60.0

        pts = nodes[elements]

        edges = np.stack([
            np.linalg.norm(pts[:, (i+1) % 4] - pts[:, i], axis=1)
            for i in range(4)
        ], axis=1)

        aspect_ratios = np.max(edges, axis=1) / np.maximum(np.min(edges, axis=1), 1e-10)

        v1 = pts[:, 1] - pts[:, 0]
        v2 = pts[:, 2] - pts[:, 1]
        v3 = pts[:, 3] - pts[:, 2]
        v4 = pts[:, 0] - pts[:, 3]

        def compute_angles(a, b):
            cos_a = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-10)
            cos_a = np.clip(cos_a, -1.0, 1.0)
            return 180 - np.degrees(np.arccos(cos_a))

        angles = np.stack([
            compute_angles(v1, v2),
            compute_angles(v2, v3),
            compute_angles(v3, v4),
            compute_angles(v4, v1)
        ], axis=1)

        valid_mask = (aspect_ratios <= max_aspect_ratio) & np.all(np.abs(angles - 90) <= max_angle_deviation, axis=1)

        valid_indices = np.where(valid_mask)[0]

        if len(valid_indices) > 0:
            return elements[valid_indices], element_materials[valid_indices]

        return elements, element_materials
    
    def _is_inside_dam(self, x: float, y: float) -> bool:
        geom = self.params.dam_geometry
        if geom is None:
            return False
        
        H = geom.dam_height
        B = geom.crest_width
        m1 = geom.upstream_slope
        m2 = geom.downstream_slope
        D = geom.foundation_depth
        
        upstream_crest_x = m1 * H
        downstream_crest_x = upstream_crest_x + B
        
        if y < -D or y > H:
            return False
        
        if y <= 0:
            return True
        
        y_dam = min(y, H)
        x_left = m1 * y_dam
        x_right = downstream_crest_x + m2 * (H - y_dam)
        
        return x >= x_left - 1e-6 and x <= x_right + 1e-6
    
    def _get_material_id(self, x: float, y: float) -> int:
        layers = self.params.soil_layers
        if not layers:
            return 0
        
        current_depth = 0.0
        for i, layer in enumerate(layers):
            current_depth += layer.thickness
            if y <= current_depth:
                return i
        
        return len(layers) - 1
    
    def _identify_boundary_nodes(self, nodes: np.ndarray, elements: np.ndarray) -> Dict[str, np.ndarray]:
        geom = self.params.dam_geometry
        if geom is None:
            return {}

        H = geom.dam_height
        D = geom.foundation_depth
        mesh_size = self.params.mesh_params.get('mesh_size', 1.0)
        tolerance = mesh_size * 0.6

        boundary_nodes = {
            'bottom': [],
            'left': [],
            'right': [],
            'upstream': [],
            'downstream': [],
            'crest': []
        }

        x_coords = nodes[:, 0]
        y_coords = nodes[:, 1]
        y_keys = np.round(y_coords / (mesh_size / 2)) * (mesh_size / 2)

        unique_y = np.unique(y_keys)

        for y_key in unique_y:
            mask = np.abs(y_keys - y_key) < 1e-6
            indices = np.where(mask)[0]

            if len(indices) < 2:
                continue

            x_at_y = x_coords[indices]
            sorted_pos = np.argsort(x_at_y)
            sorted_indices = indices[sorted_pos]

            min_idx = sorted_indices[0]
            max_idx = sorted_indices[-1]

            if abs(y_key + D) < tolerance:
                boundary_nodes['bottom'].extend(sorted_indices.tolist())
            elif y_key > tolerance and y_key <= H + tolerance:
                boundary_nodes['upstream'].append(min_idx)
                boundary_nodes['downstream'].append(max_idx)

            if abs(y_key - H) < tolerance:
                boundary_nodes['crest'].extend(sorted_indices.tolist())

        y_near_zero = np.abs(y_coords) < tolerance
        x_neg = x_coords < 0
        x_pos = x_coords > 0
        boundary_nodes['left'].extend(np.where(y_near_zero & x_neg)[0].tolist())
        boundary_nodes['right'].extend(np.where(y_near_zero & x_pos)[0].tolist())

        return {k: np.array(list(set(v))) for k, v in boundary_nodes.items() if len(v) > 0}
    
    def refine_mesh(self, refinement_level: int = 2) -> MeshData:
        if self.mesh_data is None:
            self.generate_structured_mesh()
        
        if self.mesh_data is None:
            raise ValueError("网格数据未生成")
        
        old_nodes = self.mesh_data.nodes
        old_elements = self.mesh_data.elements
        
        new_nodes = old_nodes.tolist()
        new_elements = []
        edge_to_node = {}
        node_remap = {i: i for i in range(len(old_nodes))}
        
        def get_edge_node(n1: int, n2: int) -> int:
            key = tuple(sorted((n1, n2)))
            if key not in edge_to_node:
                p1 = old_nodes[n1]
                p2 = old_nodes[n2]
                mid = (p1 + p2) / 2
                new_nodes.append(mid)
                edge_to_node[key] = len(new_nodes) - 1
            return edge_to_node[key]
        
        for elem in old_elements:
            n0, n1, n2, n3 = elem
            
            n4 = get_edge_node(n0, n1)
            n5 = get_edge_node(n1, n2)
            n6 = get_edge_node(n2, n3)
            n7 = get_edge_node(n3, n0)
            
            p0 = old_nodes[n0]
            p1_ = old_nodes[n1]
            p2_ = old_nodes[n2]
            p3 = old_nodes[n3]
            center = (p0 + p1_ + p2_ + p3) / 4
            new_nodes.append(center)
            n8 = len(new_nodes) - 1
            
            new_elements.append([n0, n4, n8, n7])
            new_elements.append([n4, n1, n5, n8])
            new_elements.append([n8, n5, n2, n6])
            new_elements.append([n7, n8, n6, n3])
        
        new_nodes = np.array(new_nodes)
        new_elements = np.array(new_elements)
        
        new_element_materials = np.repeat(self.mesh_data.element_materials, 4)
        new_node_ids = np.arange(len(new_nodes))
        new_element_ids = np.arange(len(new_elements))
        
        boundary_nodes = self._identify_boundary_nodes(new_nodes, new_elements)
        
        self.mesh_data = MeshData(
            nodes=new_nodes,
            elements=new_elements,
            node_ids=new_node_ids,
            element_ids=new_element_ids,
            boundary_nodes=boundary_nodes,
            element_materials=new_element_materials,
            mesh_size=self.mesh_data.mesh_size / refinement_level
        )
        
        return self.mesh_data
    
    def get_mesh_quality(self) -> Dict[str, float]:
        if self.mesh_data is None:
            raise ValueError("网格数据未生成")
        
        nodes = self.mesh_data.nodes
        elements = self.mesh_data.elements
        
        aspect_ratios = []
        areas = []
        
        for elem in elements:
            pts = nodes[elem]
            
            edges = []
            for i in range(4):
                p1 = pts[i]
                p2 = pts[(i + 1) % 4]
                edges.append(np.linalg.norm(p2 - p1))
            
            aspect_ratio = max(edges) / min(edges)
            aspect_ratios.append(aspect_ratio)
            
            v1 = pts[1] - pts[0]
            v2 = pts[3] - pts[0]
            area = abs(v1[0] * v2[1] - v1[1] * v2[0])
            areas.append(area)
        
        return {
            'num_nodes': len(nodes),
            'num_elements': len(elements),
            'max_aspect_ratio': max(aspect_ratios),
            'min_aspect_ratio': min(aspect_ratios),
            'avg_aspect_ratio': np.mean(aspect_ratios),
            'max_area': max(areas),
            'min_area': min(areas),
            'avg_area': np.mean(areas),
            'total_area': sum(areas)
        }
    
    def export_to_vtk(self, output_path: str) -> None:
        if self.mesh_data is None:
            raise ValueError("网格数据未生成")
        
        nodes = self.mesh_data.nodes
        elements = self.mesh_data.elements
        
        with open(output_path, 'w') as f:
            f.write("# vtk DataFile Version 3.0\n")
            f.write("Dam Seepage Mesh\n")
            f.write("ASCII\n")
            f.write("DATASET UNSTRUCTURED_GRID\n")
            
            f.write(f"POINTS {len(nodes)} float\n")
            for node in nodes:
                f.write(f"{node[0]} {node[1]} 0.0\n")
            
            f.write(f"CELLS {len(elements)} {len(elements) * 5}\n")
            for elem in elements:
                f.write(f"4 {elem[0]} {elem[1]} {elem[2]} {elem[3]}\n")
            
            f.write(f"CELL_TYPES {len(elements)}\n")
            for _ in elements:
                f.write("9\n")
            
            f.write(f"CELL_DATA {len(elements)}\n")
            f.write("SCALARS material_id int 1\n")
            f.write("LOOKUP_TABLE default\n")
            for mat_id in self.mesh_data.element_materials:
                f.write(f"{int(mat_id)}\n")
