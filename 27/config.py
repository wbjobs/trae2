import os
from dataclasses import dataclass, field
from typing import List, Tuple, Optional


@dataclass
class ProcessingConfig:
    num_workers: int = os.cpu_count() or 4
    chunk_size: int = 1000
    noise_threshold: float = 3.0
    min_signal_intensity: float = 10.0
    max_iterations: int = 1000
    convergence_epsilon: float = 1e-6
    polynomial_degree: int = 3
    use_gpu: bool = False
    gpu_device_id: int = 0


@dataclass
class SupercomputeConfig:
    enabled: bool = False
    remote_host: str = "supercompute.example.com"
    remote_port: int = 22
    username: str = "user"
    private_key_path: Optional[str] = None
    remote_work_dir: str = "/home/user/jobs"
    max_parallel_jobs: int = 10
    job_poll_interval: int = 30
    ssh_timeout: int = 60


@dataclass
class OutputConfig:
    output_dir: str = "./results"
    save_trajectory_data: bool = True
    save_visualization: bool = True
    visualization_format: str = "png"
    visualization_dpi: int = 300
    generate_report: bool = True
    log_level: str = "INFO"


@dataclass
class GlobalConfig:
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)
    supercompute: SupercomputeConfig = field(default_factory=SupercomputeConfig)
    output: OutputConfig = field(default_factory=OutputConfig)

    def __post_init__(self):
        os.makedirs(self.output.output_dir, exist_ok=True)
