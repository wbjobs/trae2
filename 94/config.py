import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class DaskConfig:
    scheduler_host: str = os.getenv("DASK_SCHEDULER_HOST", "localhost")
    scheduler_port: int = int(os.getenv("DASK_SCHEDULER_PORT", "8786"))

    @property
    def scheduler_address(self) -> str:
        return f"tcp://{self.scheduler_host}:{self.scheduler_port}"


@dataclass
class RedisConfig:
    host: str = os.getenv("REDIS_HOST", "localhost")
    port: int = int(os.getenv("REDIS_PORT", "6379"))
    db: int = int(os.getenv("REDIS_DB", "0"))
    password: str = os.getenv("REDIS_PASSWORD", "")
    task_queue_name: str = os.getenv("TASK_QUEUE_NAME", "weather_tasks")


@dataclass
class TimescaleDBConfig:
    host: str = os.getenv("TIMESCALEDB_HOST", "localhost")
    port: int = int(os.getenv("TIMESCALEDB_PORT", "5432"))
    database: str = os.getenv("TIMESCALEDB_DATABASE", "weather_simulation")
    user: str = os.getenv("TIMESCALEDB_USER", "postgres")
    password: str = os.getenv("TIMESCALEDB_PASSWORD", "postgres")

    @property
    def connection_string(self) -> str:
        return f"postgresql+psycopg2://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


@dataclass
class GridConfig:
    resolution: float = float(os.getenv("GRID_RESOLUTION", "0.1"))
    lat_min: float = float(os.getenv("GRID_LAT_MIN", "-90"))
    lat_max: float = float(os.getenv("GRID_LAT_MAX", "90"))
    lon_min: float = float(os.getenv("GRID_LON_MIN", "-180"))
    lon_max: float = float(os.getenv("GRID_LON_MAX", "180"))


@dataclass
class SimulationConfig:
    time_steps: int = int(os.getenv("SIMULATION_TIME_STEPS", "100"))
    dt_seconds: int = int(os.getenv("SIMULATION_DT_SECONDS", "3600"))
    parallel_workers: int = int(os.getenv("PARALLEL_WORKERS", "4"))


dask_config = DaskConfig()
redis_config = RedisConfig()
timescaledb_config = TimescaleDBConfig()
grid_config = GridConfig()
simulation_config = SimulationConfig()
