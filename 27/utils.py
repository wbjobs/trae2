import logging
import numpy as np
from typing import List, Tuple, Optional
import os
import json
import pickle
from datetime import datetime
from config import GlobalConfig


def setup_logger(config: GlobalConfig) -> logging.Logger:
    logger = logging.getLogger("astro_analysis")
    logger.setLevel(getattr(logging, config.output.log_level))

    if not logger.handlers:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        log_file = os.path.join(config.output.output_dir, "processing.log")
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


def estimate_noise_level(image: np.ndarray) -> float:
    image_clean = np.nan_to_num(image, nan=0.0, posinf=0.0, neginf=0.0)
    valid_data = image_clean[np.isfinite(image_clean)]

    if valid_data.size < 10:
        return 1.0

    diff = np.diff(valid_data)
    if diff.size == 0:
        return 1.0

    sigma = np.median(np.abs(diff)) / 0.6745

    if np.isnan(sigma) or np.isinf(sigma) or sigma <= 0:
        sigma = np.std(valid_data) if np.std(valid_data) > 0 else 1.0

    return float(sigma)


def calculate_snr(signal: float, noise: float) -> float:
    if noise == 0:
        return float('inf')
    return signal / noise


def gaussian_kernel(size: int, sigma: float = 1.0) -> np.ndarray:
    x = np.arange(size) - size // 2
    g = np.exp(-x ** 2 / (2 * sigma ** 2))
    kernel = np.outer(g, g)
    return kernel / kernel.sum()


def ensure_directory(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def save_json(data: dict, filepath: str) -> None:
    ensure_directory(os.path.dirname(filepath))
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=str)


def load_json(filepath: str) -> dict:
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_pickle(obj: object, filepath: str) -> None:
    ensure_directory(os.path.dirname(filepath))
    with open(filepath, 'wb') as f:
        pickle.dump(obj, f)


def load_pickle(filepath: str) -> object:
    with open(filepath, 'rb') as f:
        return pickle.load(f)


def generate_output_filename(base_dir: str, prefix: str, ext: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{prefix}_{timestamp}.{ext}"
    return os.path.join(base_dir, filename)


def normalize_image(image: np.ndarray) -> np.ndarray:
    min_val = np.min(image)
    max_val = np.max(image)
    if max_val == min_val:
        return np.zeros_like(image)
    return (image - min_val) / (max_val - min_val)


def percentile_clip(image: np.ndarray, lower: float = 1.0, upper: float = 99.0) -> np.ndarray:
    lower_val = np.percentile(image, lower)
    upper_val = np.percentile(image, upper)
    return np.clip(image, lower_val, upper_val)


def find_local_maxima(image: np.ndarray, threshold: float, min_distance: int = 5) -> List[Tuple[int, int]]:
    from scipy.ndimage import maximum_filter, label, center_of_mass

    data_max = maximum_filter(image, size=min_distance * 2 + 1)
    maxima = (image == data_max) & (image > threshold)

    labeled, num_labels = label(maxima)
    if num_labels == 0:
        return []

    peaks = []
    for i in range(1, num_labels + 1):
        mask = labeled == i
        com = center_of_mass(image, labels=labeled, index=i)
        peaks.append((int(com[0]), int(com[1])))

    return peaks


def fit_2d_gaussian(image: np.ndarray, center: Tuple[int, int], radius: int = 5) -> Optional[Tuple[float, float, float, float, float]]:
    try:
        cy, cx = center
        y_min, y_max = max(0, cy - radius), min(image.shape[0], cy + radius + 1)
        x_min, x_max = max(0, cx - radius), min(image.shape[1], cx + radius + 1)

        sub_image = image[y_min:y_max, x_min:x_max]
        if sub_image.size < 9:
            return None

        y = np.arange(y_min, y_max)
        x = np.arange(x_min, x_max)
        X, Y = np.meshgrid(x, y)

        X = X.flatten()
        Y = Y.flatten()
        Z = sub_image.flatten()

        Z_clean = np.nan_to_num(Z, nan=0.0, posinf=0.0, neginf=0.0)

        A = np.column_stack([np.ones_like(X), X, Y, X ** 2, Y ** 2, X * Y])
        coeffs, _, _, _ = np.linalg.lstsq(A, Z_clean, rcond=None)

        a, bx, by, cxx, cyy, cxy = coeffs
        denom = 4 * cxx * cyy - cxy ** 2

        if abs(denom) < 1e-10:
            return None

        x0 = (cxy * by - 2 * cyy * bx) / denom
        y0 = (cxy * bx - 2 * cxx * by) / denom

        x0 = np.clip(x0, x_min, x_max - 1)
        y0 = np.clip(y0, y_min, y_max - 1)

        amplitude = max(Z_clean) - min(Z_clean)

        cxx_safe = max(abs(cxx), 1e-8)
        cyy_safe = max(abs(cyy), 1e-8)
        sigma_x = np.sqrt(1 / (2 * cxx_safe))
        sigma_y = np.sqrt(1 / (2 * cyy_safe))

        sigma_x = np.clip(sigma_x, 0.5, 20.0)
        sigma_y = np.clip(sigma_y, 0.5, 20.0)

        return (float(x0), float(y0), float(amplitude), float(sigma_x), float(sigma_y))
    except Exception:
        return None
