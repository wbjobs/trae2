"""
参数配置解析模块
负责解析和验证地质剖面模拟的各类参数配置
"""

import os
import yaml
import json
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Union
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class LayerConfig:
    name: str
    thickness: float
    material_id: int
    depth: float = 0.0


@dataclass
class MaterialConfig:
    id: int
    name: str
    youngs_modulus: float
    poissons_ratio: float
    density: float


@dataclass
class BoundaryCondition:
    type: str
    displacement_x: Optional[float] = None
    displacement_y: Optional[float] = None
    stress_xx: Optional[float] = None
    stress_yy: Optional[float] = None


@dataclass
class GeometryConfig:
    profile_width: float
    profile_height: float
    layer_count: int
    layers: List[LayerConfig] = field(default_factory=list)


@dataclass
class MeshConfig:
    element_type: str = "triangle"
    element_order: int = 1
    refinement_level: int = 2
    max_element_size: float = 20.0
    min_element_size: float = 5.0


@dataclass
class SolverConfig:
    type: str = "linear_elasticity"
    method: str = "newton"
    tolerance: float = 1.0e-8
    max_iterations: int = 50
    linear_solver: str = "mumps"


@dataclass
class SimulationConfig:
    project_name: str
    version: str
    geometry: GeometryConfig
    materials: List[MaterialConfig]
    boundary_conditions: Dict[str, BoundaryCondition]
    mesh: MeshConfig
    solver: SolverConfig
    gravity: float = 9.81
    horizontal_stress_ratio: float = 1.2
    output_fields: List[str] = field(default_factory=lambda: ["displacement", "stress", "strain", "von_mises"])


class ConfigParser:
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or Path(__file__).parent.parent / "config" / "default_config.yaml"
        self._config: Optional[SimulationConfig] = None

    def load_config(self) -> SimulationConfig:
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"配置文件不存在: {self.config_path}")

        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config_data = yaml.safe_load(f)
            self._config = self._parse_config(config_data)
            logger.info(f"配置文件加载成功: {self.config_path}")
            return self._config
        except yaml.YAMLError as e:
            logger.error(f"YAML解析错误: {e}")
            raise
        except Exception as e:
            logger.error(f"配置加载失败: {e}")
            raise

    def _parse_config(self, config_data: Dict) -> SimulationConfig:
        project = config_data.get('project', {})
        geometry_data = config_data.get('geometry', {})
        material_data = config_data.get('material', {})
        bc_data = config_data.get('boundary_conditions', {})
        mesh_data = config_data.get('mesh', {})
        solver_data = config_data.get('solver', {})
        initial_data = config_data.get('initial_conditions', {})
        post_data = config_data.get('post_processing', {})

        layers = []
        current_depth = 0.0
        for layer_data in geometry_data.get('layers', []):
            layer = LayerConfig(
                name=layer_data['name'],
                thickness=layer_data['thickness'],
                material_id=layer_data['material_id'],
                depth=current_depth
            )
            layers.append(layer)
            current_depth += layer_data['thickness']

        geometry = GeometryConfig(
            profile_width=geometry_data.get('profile_width', 1000.0),
            profile_height=geometry_data.get('profile_height', 500.0),
            layer_count=len(layers),
            layers=layers
        )

        materials = []
        for mat_data in material_data.get('materials', []):
            materials.append(MaterialConfig(
                id=int(mat_data['id']),
                name=str(mat_data['name']),
                youngs_modulus=float(mat_data['youngs_modulus']),
                poissons_ratio=float(mat_data['poissons_ratio']),
                density=float(mat_data['density'])
            ))

        boundary_conditions = {}
        for side, bc in bc_data.items():
            boundary_conditions[side] = BoundaryCondition(
                type=str(bc.get('type', 'free')),
                displacement_x=float(bc['displacement_x']) if bc.get('displacement_x') is not None else None,
                displacement_y=float(bc['displacement_y']) if bc.get('displacement_y') is not None else None,
                stress_xx=float(bc['stress_xx']) if bc.get('stress_xx') is not None else None,
                stress_yy=float(bc['stress_yy']) if bc.get('stress_yy') is not None else None
            )

        mesh = MeshConfig(
            element_type=str(mesh_data.get('element_type', 'triangle')),
            element_order=int(mesh_data.get('element_order', 1)),
            refinement_level=int(mesh_data.get('refinement_level', 2)),
            max_element_size=float(mesh_data.get('max_element_size', 20.0)),
            min_element_size=float(mesh_data.get('min_element_size', 5.0))
        )

        solver = SolverConfig(
            type=str(solver_data.get('type', 'linear_elasticity')),
            method=str(solver_data.get('method', 'newton')),
            tolerance=float(solver_data.get('tolerance', 1.0e-8)),
            max_iterations=int(solver_data.get('max_iterations', 50)),
            linear_solver=str(solver_data.get('linear_solver', 'mumps'))
        )

        return SimulationConfig(
            project_name=project.get('name', 'geological_stress_simulation'),
            version=project.get('version', '1.0.0'),
            geometry=geometry,
            materials=materials,
            boundary_conditions=boundary_conditions,
            mesh=mesh,
            solver=solver,
            gravity=initial_data.get('gravity', 9.81),
            horizontal_stress_ratio=initial_data.get('horizontal_stress_ratio', 1.2),
            output_fields=post_data.get('output_fields', ["displacement", "stress", "strain", "von_mises"])
        )

    def validate_config(self, config: Optional[SimulationConfig] = None) -> bool:
        cfg = config or self._config
        if not cfg:
            raise ValueError("没有可验证的配置，请先加载配置文件")

        errors = []

        try:
            profile_width = float(cfg.geometry.profile_width)
            profile_height = float(cfg.geometry.profile_height)
            max_element_size = float(cfg.mesh.max_element_size)
            min_element_size = float(cfg.mesh.min_element_size)
            tolerance = float(cfg.solver.tolerance)
            max_iterations = int(cfg.solver.max_iterations)
        except (ValueError, TypeError) as e:
            errors.append(f"配置参数类型转换失败: {e}")
            for error in errors:
                logger.error(f"配置验证错误: {error}")
            return False

        if profile_width <= 0:
            errors.append("剖面宽度必须为正数")

        if profile_height <= 0:
            errors.append("剖面高度必须为正数")

        total_thickness = sum(float(layer.thickness) for layer in cfg.geometry.layers)
        if abs(total_thickness - profile_height) > 1e-6:
            errors.append(f"岩层总厚度({total_thickness})与剖面高度({profile_height})不匹配")

        material_ids = {int(mat.id) for mat in cfg.materials}
        for layer in cfg.geometry.layers:
            if int(layer.material_id) not in material_ids:
                errors.append(f"岩层'{layer.name}'引用的材料ID {layer.material_id} 不存在")

        for mat in cfg.materials:
            if float(mat.youngs_modulus) <= 0:
                errors.append(f"材料'{mat.name}'的杨氏模量必须为正数")
            if not (0 < float(mat.poissons_ratio) < 0.5):
                errors.append(f"材料'{mat.name}'的泊松比必须在(0, 0.5)范围内")
            if float(mat.density) <= 0:
                errors.append(f"材料'{mat.name}'的密度必须为正数")

        if max_element_size <= min_element_size:
            errors.append("最大单元尺寸必须大于最小单元尺寸")

        if tolerance <= 0:
            errors.append("求解器容差必须为正数")

        if max_iterations <= 0:
            errors.append("最大迭代次数必须为正数")

        if errors:
            for error in errors:
                logger.error(f"配置验证错误: {error}")
            return False

        logger.info("配置验证通过")
        return True

    def to_dict(self) -> Dict:
        if not self._config:
            return {}
        return asdict(self._config)

    def save_config(self, output_path: str, config: Optional[SimulationConfig] = None):
        cfg = config or self._config
        if not cfg:
            raise ValueError("没有可保存的配置")

        config_dict = asdict(cfg)
        with open(output_path, 'w', encoding='utf-8') as f:
            yaml.dump(config_dict, f, default_flow_style=False, allow_unicode=True)
        logger.info(f"配置已保存到: {output_path}")

    def get_material_by_id(self, material_id: int) -> Optional[MaterialConfig]:
        if not self._config:
            return None
        for mat in self._config.materials:
            if mat.id == material_id:
                return mat
        return None

    def get_layer_at_depth(self, depth: float) -> Optional[LayerConfig]:
        if not self._config:
            return None
        for layer in self._config.geometry.layers:
            if layer.depth <= depth < layer.depth + layer.thickness:
                return layer
        return None
