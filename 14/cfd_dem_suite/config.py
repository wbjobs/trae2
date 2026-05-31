import os
import yaml
import json
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List, Union
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


@dataclass
class FluidParams:
    density: float = 1000.0
    viscosity: float = 1.0e-3
    temperature: float = 293.15


@dataclass
class ParticleParams:
    diameter: float = 1.0e-3
    density: float = 2500.0
    young_modulus: float = 1.0e9
    poisson_ratio: float = 0.3
    restitution_coeff: float = 0.7
    friction_coeff: float = 0.3
    count: int = 1000


@dataclass
class DomainParams:
    x_min: float = 0.0
    x_max: float = 0.1
    y_min: float = 0.0
    y_max: float = 0.1
    z_min: float = 0.0
    z_max: float = 0.1
    periodic_x: bool = False
    periodic_y: bool = False
    periodic_z: bool = False


@dataclass
class SimulationParams:
    time_step: float = 1.0e-5
    total_time: float = 1.0
    save_interval: int = 100
    gravity: List[float] = field(default_factory=lambda: [0.0, -9.81, 0.0])
    solver_type: str = "CFD-DEM"
    coupling_method: str = "Eulerian-Lagrangian"
    subcycling_steps: int = 10


@dataclass
class BoundaryCondition:
    type: str
    location: str
    value: Union[float, List[float]]
    condition_id: str = ""


@dataclass
class ParallelConfig:
    enable_parallel: bool = True
    num_processes: int = 4
    use_mpi: bool = False
    thread_per_process: int = 1
    chunk_size: int = 100


@dataclass
class OutputConfig:
    output_dir: str = "./results"
    format: str = "hdf5"
    save_particle_data: bool = True
    save_fluid_data: bool = True
    save_force_data: bool = True
    compression: bool = True
    compression_level: int = 4


@dataclass
class BackendConfig:
    enable_backend: bool = False
    api_url: str = "http://localhost:8080/api"
    api_key: str = ""
    task_id: str = ""
    status_update_interval: int = 10
    node_id: str = "local-node-01"
    distributed_mode: bool = False


class SimulationConfig:
    def __init__(self, config_path: Optional[str] = None):
        self.fluid = FluidParams()
        self.particle = ParticleParams()
        self.domain = DomainParams()
        self.simulation = SimulationParams()
        self.boundary_conditions: List[BoundaryCondition] = []
        self.parallel = ParallelConfig()
        self.output = OutputConfig()
        self.backend = BackendConfig()
        self.raw_config: Dict = {}
        
        if config_path:
            self.load_from_file(config_path)
    
    def load_from_file(self, config_path: str) -> None:
        path = Path(config_path)
        if not path.exists():
            raise FileNotFoundError(f"配置文件不存在: {config_path}")
        
        suffix = path.suffix.lower()
        if suffix in ['.yaml', '.yml']:
            self._load_yaml(config_path)
        elif suffix == '.json':
            self._load_json(config_path)
        else:
            raise ValueError(f"不支持的配置文件格式: {suffix}")
        
        logger.info(f"配置文件已加载: {config_path}")
    
    def _load_yaml(self, config_path: str) -> None:
        with open(config_path, 'r', encoding='utf-8') as f:
            self.raw_config = yaml.safe_load(f) or {}
        self._parse_config()
    
    def _load_json(self, config_path: str) -> None:
        with open(config_path, 'r', encoding='utf-8') as f:
            self.raw_config = json.load(f) or {}
        self._parse_config()
    
    def _parse_config(self) -> None:
        self.unknown_params = []
        
        if 'fluid' in self.raw_config:
            self._update_dataclass(self.fluid, self.raw_config['fluid'], 'fluid')
        
        if 'particle' in self.raw_config:
            self._update_dataclass(self.particle, self.raw_config['particle'], 'particle')
        
        if 'domain' in self.raw_config:
            self._update_dataclass(self.domain, self.raw_config['domain'], 'domain')
        
        if 'simulation' in self.raw_config:
            self._update_dataclass(self.simulation, self.raw_config['simulation'], 'simulation')
        
        if 'boundary_conditions' in self.raw_config:
            for bc_data in self.raw_config['boundary_conditions']:
                bc = BoundaryCondition(**bc_data)
                self.boundary_conditions.append(bc)
        
        if 'parallel' in self.raw_config:
            self._update_dataclass(self.parallel, self.raw_config['parallel'], 'parallel')
        
        if 'output' in self.raw_config:
            self._update_dataclass(self.output, self.raw_config['output'], 'output')
        
        if 'backend' in self.raw_config:
            self._update_dataclass(self.backend, self.raw_config['backend'], 'backend')
        
        expected_sections = {'fluid', 'particle', 'domain', 'simulation', 
                           'boundary_conditions', 'parallel', 'output', 'backend'}
        for key in self.raw_config:
            if key not in expected_sections:
                self.unknown_params.append(f"root.{key}")
                logger.warning(f"未知配置项 [root.{key}] 将被忽略")
        
        self._load_env_overrides()
        self.validate()
    
    def _update_dataclass(self, obj, data: Dict, section: str) -> None:
        import dataclasses
        
        fields = {f.name: f.type for f in dataclasses.fields(obj)}
        
        for key, value in data.items():
            if key in fields:
                target_type = fields[key]
                try:
                    converted_value = self._convert_type(value, target_type, key)
                    setattr(obj, key, converted_value)
                except (TypeError, ValueError) as e:
                    logger.error(f"配置项类型转换失败 [{section}.{key}]: {e}")
                    raise
            else:
                unknown_key = f"{section}.{key}"
                self.unknown_params.append(unknown_key)
                logger.warning(f"未知配置项 [{unknown_key}] 将被忽略")
    
    def _convert_type(self, value, target_type, field_name: str):
        if target_type is float:
            if isinstance(value, (int, float)):
                return float(value)
            elif isinstance(value, str):
                try:
                    return float(value)
                except ValueError:
                    raise ValueError(f"无法将字符串 '{value}' 转换为浮点数")
        elif target_type is int:
            if isinstance(value, int):
                return value
            elif isinstance(value, float):
                if value.is_integer():
                    return int(value)
                else:
                    raise ValueError(f"浮点值 {value} 无法无损转换为整数")
            elif isinstance(value, str):
                try:
                    return int(value)
                except ValueError:
                    raise ValueError(f"无法将字符串 '{value}' 转换为整数")
        elif target_type is bool:
            if isinstance(value, bool):
                return value
            elif isinstance(value, str):
                lower_val = value.lower()
                if lower_val in ('true', 'yes', '1', 'on'):
                    return True
                elif lower_val in ('false', 'no', '0', 'off'):
                    return False
                else:
                    raise ValueError(f"无法将字符串 '{value}' 转换为布尔值")
            elif isinstance(value, (int, float)):
                return bool(value)
        elif hasattr(target_type, '__origin__') and target_type.__origin__ is list:
            if isinstance(value, list):
                if hasattr(target_type, '__args__') and target_type.__args__:
                    item_type = target_type.__args__[0]
                    return [self._convert_type(item, item_type, f"{field_name}[{i}]") 
                           for i, item in enumerate(value)]
                return value
            else:
                raise ValueError(f"期望列表类型，实际为 {type(value).__name__}")
        elif target_type is str:
            return str(value)
        
        return value
    
    def _load_env_overrides(self) -> None:
        if os.getenv('BACKEND_API_URL'):
            self.backend.api_url = os.getenv('BACKEND_API_URL')
        if os.getenv('BACKEND_API_KEY'):
            self.backend.api_key = os.getenv('BACKEND_API_KEY')
        if os.getenv('COMPUTE_NODE_ID'):
            self.backend.node_id = os.getenv('COMPUTE_NODE_ID')
        if os.getenv('ENABLE_DISTRIBUTED', 'false').lower() == 'true':
            self.backend.distributed_mode = True
        if os.getenv('MAX_PARALLEL_TASKS'):
            self.parallel.num_processes = int(os.getenv('MAX_PARALLEL_TASKS'))
    
    def validate(self) -> bool:
        errors = []
        
        if self.simulation.time_step <= 0:
            errors.append("时间步长必须大于0")
        
        if self.simulation.total_time <= 0:
            errors.append("总仿真时间必须大于0")
        
        if self.particle.count <= 0:
            errors.append("颗粒数量必须大于0")
        
        if self.domain.x_max <= self.domain.x_min:
            errors.append("X方向范围无效")
        if self.domain.y_max <= self.domain.y_min:
            errors.append("Y方向范围无效")
        if self.domain.z_max <= self.domain.z_min:
            errors.append("Z方向范围无效")
        
        if self.parallel.num_processes <= 0:
            errors.append("并行进程数必须大于0")
        
        if errors:
            raise ValueError(f"配置验证失败: {'; '.join(errors)}")
        
        return True
    
    def to_dict(self) -> Dict:
        return {
            'fluid': asdict(self.fluid),
            'particle': asdict(self.particle),
            'domain': asdict(self.domain),
            'simulation': asdict(self.simulation),
            'boundary_conditions': [asdict(bc) for bc in self.boundary_conditions],
            'parallel': asdict(self.parallel),
            'output': asdict(self.output),
            'backend': asdict(self.backend),
        }
    
    @staticmethod
    def from_dict(config_dict: Dict) -> 'SimulationConfig':
        config = SimulationConfig()
        config.raw_config = config_dict
        config._parse_config()
        return config
    
    def save(self, output_path: str) -> None:
        path = Path(output_path)
        data = self.to_dict()
        
        if path.suffix.lower() in ['.yaml', '.yml']:
            with open(path, 'w', encoding='utf-8') as f:
                yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
        elif path.suffix.lower() == '.json':
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        else:
            raise ValueError(f"不支持的输出格式: {path.suffix}")
        
        logger.info(f"配置已保存到: {output_path}")
