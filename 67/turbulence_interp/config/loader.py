import os
import yaml
from dataclasses import dataclass, field
from typing import Optional, Dict, Any


@dataclass
class SystemConfig:
    max_workers: int = 8
    memory_limit_gb: int = 16
    log_level: str = "INFO"


@dataclass
class ParallelConfig:
    backend: str = "concurrent"
    chunk_size: int = 1000
    use_dask: bool = False


@dataclass
class InterpolationConfig:
    spatial_method: str = "kriging"
    temporal_method: str = "linear"
    noise_reduction: str = "wavelet"
    grid_resolution: float = 0.1
    search_radius: float = 5.0


@dataclass
class ClusterConfig:
    host: str = "hpc.example.com"
    port: int = 22
    username: str = "user"
    remote_workdir: str = "/home/user/turbulence_jobs"
    scheduler: str = "slurm"
    partition: str = "compute"
    nodes: int = 1
    tasks_per_node: int = 16


@dataclass
class OutputConfig:
    format: str = "netcdf"
    compression: bool = True
    compression_level: int = 4
    include_metadata: bool = True


@dataclass
class Config:
    system: SystemConfig = field(default_factory=SystemConfig)
    parallel: ParallelConfig = field(default_factory=ParallelConfig)
    interpolation: InterpolationConfig = field(default_factory=InterpolationConfig)
    cluster: ClusterConfig = field(default_factory=ClusterConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    extra: Dict[str, Any] = field(default_factory=dict)


def load_config(config_path: Optional[str] = None) -> Config:
    if config_path is None:
        config_path = os.path.join(
            os.path.dirname(__file__), "config.yaml"
        )
    
    if not os.path.exists(config_path):
        return Config()
    
    with open(config_path, "r", encoding="utf-8") as f:
        config_dict = yaml.safe_load(f) or {}
    
    system_config = SystemConfig(**config_dict.get("system", {}))
    parallel_config = ParallelConfig(**config_dict.get("parallel", {}))
    interpolation_config = InterpolationConfig(**config_dict.get("interpolation", {}))
    cluster_config = ClusterConfig(**config_dict.get("cluster", {}))
    output_config = OutputConfig(**config_dict.get("output", {}))
    
    extra = {k: v for k, v in config_dict.items() 
             if k not in ["system", "parallel", "interpolation", "cluster", "output"]}
    
    return Config(
        system=system_config,
        parallel=parallel_config,
        interpolation=interpolation_config,
        cluster=cluster_config,
        output=output_config,
        extra=extra,
    )
