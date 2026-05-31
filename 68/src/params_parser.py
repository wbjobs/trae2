import yaml
import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Union
import numpy as np


@dataclass
class SoilLayer:
    name: str
    thickness: float
    permeability_x: float
    permeability_y: float
    porosity: float
    density: float
    saturation: float = 1.0


@dataclass
class BoundaryCondition:
    type: str
    location: str
    value: Union[float, Tuple[float, float]]
    description: str = ""


@dataclass
class DamGeometry:
    dam_height: float
    crest_width: float
    upstream_slope: float
    downstream_slope: float
    foundation_depth: float
    reservoir_water_level: float
    tailwater_level: float
    dam_length: float = 100.0


@dataclass
class SimulationParams:
    simulation_type: str = "steady_state"
    max_iterations: int = 1000
    convergence_tolerance: float = 1e-6
    time_step: float = 1.0
    total_time: float = 100.0


class ParamsParser:
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path
        self.dam_geometry: Optional[DamGeometry] = None
        self.soil_layers: List[SoilLayer] = field(default_factory=list)
        self.boundary_conditions: List[BoundaryCondition] = field(default_factory=list)
        self.simulation_params: SimulationParams = SimulationParams()
        self.mesh_params: Dict = {}
        self.output_params: Dict = {}
        self.cluster_config: Dict = {}
        
        if config_path:
            self.load_config(config_path)
    
    def load_config(self, config_path: str) -> None:
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"配置文件不存在: {config_path}")
        
        file_ext = os.path.splitext(config_path)[1].lower()
        
        if file_ext in ['.yaml', '.yml']:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
        elif file_ext == '.json':
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        else:
            raise ValueError(f"不支持的配置文件格式: {file_ext}")
        
        self._parse_dam_geometry(config.get('dam_geometry', {}))
        self._parse_soil_layers(config.get('soil_layers', []))
        self._parse_boundary_conditions(config.get('boundary_conditions', []))
        self._parse_simulation_params(config.get('simulation_params', {}))
        self._parse_mesh_params(config.get('mesh_params', {}))
        self._parse_output_params(config.get('output_params', {}))
        self._parse_cluster_config(config.get('cluster_config', {}))
    
    def _parse_dam_geometry(self, geometry_data: Dict) -> None:
        required_fields = ['dam_height', 'crest_width', 'upstream_slope', 
                          'downstream_slope', 'foundation_depth', 
                          'reservoir_water_level', 'tailwater_level']
        
        for field in required_fields:
            if field not in geometry_data:
                raise ValueError(f"缺少必要的坝体几何参数: {field}")
        
        self.dam_geometry = DamGeometry(
            dam_height=geometry_data['dam_height'],
            crest_width=geometry_data['crest_width'],
            upstream_slope=geometry_data['upstream_slope'],
            downstream_slope=geometry_data['downstream_slope'],
            foundation_depth=geometry_data['foundation_depth'],
            reservoir_water_level=geometry_data['reservoir_water_level'],
            tailwater_level=geometry_data['tailwater_level'],
            dam_length=geometry_data.get('dam_length', 100.0)
        )
    
    def _parse_soil_layers(self, layers_data: List[Dict]) -> None:
        self.soil_layers = []
        for layer_data in layers_data:
            layer = SoilLayer(
                name=layer_data.get('name', '未知土层'),
                thickness=layer_data['thickness'],
                permeability_x=layer_data['permeability_x'],
                permeability_y=layer_data['permeability_y'],
                porosity=layer_data.get('porosity', 0.35),
                density=layer_data.get('density', 2000.0),
                saturation=layer_data.get('saturation', 1.0)
            )
            self.soil_layers.append(layer)
    
    def _parse_boundary_conditions(self, bc_data: List[Dict]) -> None:
        self.boundary_conditions = []
        for bc_item in bc_data:
            bc = BoundaryCondition(
                type=bc_item['type'],
                location=bc_item['location'],
                value=bc_item['value'],
                description=bc_item.get('description', '')
            )
            self.boundary_conditions.append(bc)
    
    def _parse_simulation_params(self, sim_data: Dict) -> None:
        self.simulation_params = SimulationParams(
            simulation_type=sim_data.get('simulation_type', 'steady_state'),
            max_iterations=sim_data.get('max_iterations', 1000),
            convergence_tolerance=sim_data.get('convergence_tolerance', 1e-6),
            time_step=sim_data.get('time_step', 1.0),
            total_time=sim_data.get('total_time', 100.0)
        )
    
    def _parse_mesh_params(self, mesh_data: Dict) -> None:
        self.mesh_params = {
            'element_type': mesh_data.get('element_type', 'quad4'),
            'mesh_size': mesh_data.get('mesh_size', 1.0),
            'refinement_level': mesh_data.get('refinement_level', 1),
            'boundary_refinement': mesh_data.get('boundary_refinement', False),
            'max_aspect_ratio': mesh_data.get('max_aspect_ratio', 5.0)
        }
    
    def _parse_output_params(self, output_data: Dict) -> None:
        self.output_params = {
            'output_dir': output_data.get('output_dir', './output'),
            'save_vtk': output_data.get('save_vtk', True),
            'save_numpy': output_data.get('save_numpy', True),
            'generate_report': output_data.get('generate_report', True),
            'plot_contours': output_data.get('plot_contours', True),
            'plot_vectors': output_data.get('plot_vectors', False)
        }
    
    def _parse_cluster_config(self, cluster_data: Dict) -> None:
        self.cluster_config = {
            'enabled': cluster_data.get('enabled', False),
            'num_processes': cluster_data.get('num_processes', 1),
            'scheduler': cluster_data.get('scheduler', 'local'),
            'queue_name': cluster_data.get('queue_name', 'default'),
            'wall_time': cluster_data.get('wall_time', '02:00:00'),
            'nodes': cluster_data.get('nodes', 1),
            'tasks_per_node': cluster_data.get('tasks_per_node', 1)
        }
    
    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        
        if self.dam_geometry is None:
            errors.append("坝体几何参数未设置")
        else:
            if self.dam_geometry.dam_height <= 0:
                errors.append("坝高必须大于0")
            if self.dam_geometry.upstream_slope <= 0:
                errors.append("上游坡度必须大于0")
            if self.dam_geometry.downstream_slope <= 0:
                errors.append("下游坡度必须大于0")
        
        if not self.soil_layers:
            errors.append("至少需要定义一个土层")
        
        total_thickness = sum(layer.thickness for layer in self.soil_layers)
        if self.dam_geometry and total_thickness < self.dam_geometry.dam_height + self.dam_geometry.foundation_depth:
            errors.append("土层总厚度必须大于等于坝高加基础深度")
        
        if not self.boundary_conditions:
            errors.append("至少需要定义一个边界条件")
        
        has_head_bc = any(bc.type == 'head' for bc in self.boundary_conditions)
        has_flow_bc = any(bc.type == 'flow' for bc in self.boundary_conditions)
        if not (has_head_bc or has_flow_bc):
            errors.append("需要至少定义水头或流量边界条件")
        
        return len(errors) == 0, errors
    
    def get_permeability_at_point(self, x: float, y: float) -> Tuple[float, float]:
        current_depth = 0.0
        for layer in self.soil_layers:
            current_depth += layer.thickness
            if y <= current_depth:
                return layer.permeability_x, layer.permeability_y
        
        if self.soil_layers:
            last_layer = self.soil_layers[-1]
            return last_layer.permeability_x, last_layer.permeability_y
        
        return 1e-6, 1e-6
    
    def to_dict(self) -> Dict:
        return {
            'dam_geometry': {
                'dam_height': self.dam_geometry.dam_height,
                'crest_width': self.dam_geometry.crest_width,
                'upstream_slope': self.dam_geometry.upstream_slope,
                'downstream_slope': self.dam_geometry.downstream_slope,
                'foundation_depth': self.dam_geometry.foundation_depth,
                'reservoir_water_level': self.dam_geometry.reservoir_water_level,
                'tailwater_level': self.dam_geometry.tailwater_level,
                'dam_length': self.dam_geometry.dam_length
            } if self.dam_geometry else None,
            'soil_layers': [
                {
                    'name': layer.name,
                    'thickness': layer.thickness,
                    'permeability_x': layer.permeability_x,
                    'permeability_y': layer.permeability_y,
                    'porosity': layer.porosity,
                    'density': layer.density,
                    'saturation': layer.saturation
                }
                for layer in self.soil_layers
            ],
            'simulation_params': {
                'simulation_type': self.simulation_params.simulation_type,
                'max_iterations': self.simulation_params.max_iterations,
                'convergence_tolerance': self.simulation_params.convergence_tolerance,
                'time_step': self.simulation_params.time_step,
                'total_time': self.simulation_params.total_time
            },
            'mesh_params': self.mesh_params,
            'output_params': self.output_params,
            'cluster_config': self.cluster_config
        }
    
    def save_config(self, output_path: str) -> None:
        config_dict = self.to_dict()
        
        file_ext = os.path.splitext(output_path)[1].lower()
        
        if file_ext in ['.yaml', '.yml']:
            with open(output_path, 'w', encoding='utf-8') as f:
                yaml.dump(config_dict, f, default_flow_style=False, allow_unicode=True)
        elif file_ext == '.json':
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(config_dict, f, ensure_ascii=False, indent=2)
        else:
            raise ValueError(f"不支持的配置文件格式: {file_ext}")
