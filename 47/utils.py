import logging
import sys
import time
import hashlib
import json
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Union


def setup_logger(name: str = "ocean_interp", log_level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    return logger


class Timer:
    def __init__(self, name: str = "", logger: Optional[logging.Logger] = None):
        self.name = name
        self.logger = logger

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, *args):
        self.elapsed = time.perf_counter() - self.start
        if self.logger:
            self.logger.info(f"{self.name} completed in {self.elapsed:.4f}s")


def generate_task_id(prefix: str = "task") -> str:
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    random_str = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]
    return f"{prefix}_{timestamp}_{random_str}"


def ensure_directory(path: Union[str, Path]) -> Path:
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_json(data: Dict[str, Any], path: Union[str, Path]) -> None:
    path = Path(path)
    ensure_directory(path.parent)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


def load_json(path: Union[str, Path]) -> Dict[str, Any]:
    path = Path(path)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def calculate_statistics(data: np.ndarray) -> Dict[str, float]:
    if data.size == 0:
        return {"mean": 0.0, "std": 0.0, "min": 0.0, "max": 0.0, "median": 0.0}
    return {
        "mean": float(np.mean(data)),
        "std": float(np.std(data)),
        "min": float(np.min(data)),
        "max": float(np.max(data)),
        "median": float(np.median(data))
    }


def haversine_distance(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    R = 6371.0
    lon1, lat1, lon2, lat2 = map(np.radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c


def validate_coordinates(lon: np.ndarray, lat: np.ndarray) -> bool:
    valid_lon = np.all((lon >= -180) & (lon <= 180))
    valid_lat = np.all((lat >= -90) & (lat <= 90))
    return valid_lon and valid_lat


def memory_usage_mb() -> float:
    import psutil
    process = psutil.Process()
    return process.memory_info().rss / 1024 / 1024
