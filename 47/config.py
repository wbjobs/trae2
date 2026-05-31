import os
from dataclasses import dataclass, field
from typing import List, Tuple, Optional


@dataclass
class InterpolationConfig:
    method: str = "idw"
    grid_resolution: Tuple[float, float, float] = (0.1, 0.1, 1.0)
    lon_range: Tuple[float, float] = (110.0, 130.0)
    lat_range: Tuple[float, float] = (20.0, 40.0)
    depth_range: Tuple[float, float] = (0.0, 5000.0)
    variogram_model: str = "spherical"
    n_neighbors: int = 15
    return_std: bool = False
    idw_power: float = 2.0
    rbf_kernel: str = "thin_plate_spline"
    rbf_smoothing: float = 0.01
    svr_kernel: str = "rbf"
    svr_C: float = 100.0
    svr_epsilon: float = 0.1
    svr_gamma: str = "scale"
    use_depth_slices: bool = False
    ensemble_methods: List[str] = field(default_factory=lambda: ["idw", "rbf", "linear"])


@dataclass
class DenoiseConfig:
    window_size: int = 5
    sigma: float = 2.0
    method: str = "median"
    remove_outliers: bool = True
    outlier_threshold: float = 3.0


@dataclass
class ParallelConfig:
    n_workers: int = -1
    backend: str = "multiprocessing"
    chunk_size: int = 1000
    task_timeout: int = 3600
    retry_count: int = 3


@dataclass
class HPCConfig:
    host: str = "hpc.example.com"
    port: int = 22
    username: str = ""
    remote_workdir: str = "~/ocean_interpolation"
    scheduler: str = "slurm"
    nodes: int = 1
    ntasks_per_node: int = 16
    walltime: str = "02:00:00"
    memory: str = "32G"
    ssh_key_path: Optional[str] = None


@dataclass
class OutputConfig:
    formats: List[str] = field(default_factory=lambda: ["netcdf", "json", "csv"])
    output_dir: str = "output"
    filename_prefix: str = "ocean_interp"
    include_metadata: bool = True
    compression: bool = True


@dataclass
class AppConfig:
    interpolation: InterpolationConfig = field(default_factory=InterpolationConfig)
    denoise: DenoiseConfig = field(default_factory=DenoiseConfig)
    parallel: ParallelConfig = field(default_factory=ParallelConfig)
    hpc: HPCConfig = field(default_factory=HPCConfig)
    output: OutputConfig = field(default_factory=OutputConfig)
    log_level: str = "INFO"
    temp_dir: str = "tmp"

    def __post_init__(self):
        os.makedirs(self.output.output_dir, exist_ok=True)
        os.makedirs(self.temp_dir, exist_ok=True)
