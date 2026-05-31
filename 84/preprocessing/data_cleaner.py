from typing import Optional, Tuple
import numpy as np
from scipy.ndimage import median_filter, gaussian_filter


def remove_outliers(data: np.ndarray, threshold: float = 3.0, 
                    replace_method: str = 'median') -> np.ndarray:
    if data.size == 0:
        return data.copy()
    median = np.median(data)
    mad = np.median(np.abs(data - median))
    if mad == 0:
        return data.copy()
    modified_z_scores = 0.6745 * (data - median) / mad
    mask = np.abs(modified_z_scores) > threshold
    cleaned = data.copy()
    if replace_method == 'median':
        cleaned[mask] = median
    elif replace_method == 'mean':
        cleaned[mask] = np.mean(data[~mask])
    elif replace_method == 'interpolate':
        coords = np.array(np.nonzero(mask)).T
        for coord in coords:
            i, j = coord
            neighbors = []
            for di, dj in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                ni, nj = i + di, j + dj
                if 0 <= ni < data.shape[0] and 0 <= nj < data.shape[1] and not mask[ni, nj]:
                    neighbors.append(data[ni, nj])
            if neighbors:
                cleaned[i, j] = np.mean(neighbors)
            else:
                cleaned[i, j] = median
    return cleaned


def fill_nan(data: np.ndarray, method: str = 'linear') -> np.ndarray:
    if not np.any(np.isnan(data)):
        return data.copy()
    filled = data.copy()
    if method == 'zero':
        filled[np.isnan(filled)] = 0.0
    elif method == 'mean':
        mean_val = np.nanmean(data)
        filled[np.isnan(filled)] = mean_val
    elif method == 'linear':
        from scipy.interpolate import griddata
        mask = ~np.isnan(data)
        if data.ndim == 2:
            x, y = np.mgrid[0:data.shape[0], 0:data.shape[1]]
            x_valid, y_valid = x[mask], y[mask]
            z_valid = data[mask]
            filled = griddata((x_valid, y_valid), z_valid, (x, y), method='linear')
            nan_mask = np.isnan(filled)
            if np.any(nan_mask):
                filled[nan_mask] = np.nanmean(data)
    return filled


def smooth_field(data: np.ndarray, method: str = 'gaussian', 
                 sigma: float = 1.0, kernel_size: int = 3) -> np.ndarray:
    if method == 'gaussian':
        return gaussian_filter(data, sigma=sigma)
    elif method == 'median':
        return median_filter(data, size=kernel_size)
    elif method == 'uniform':
        from scipy.ndimage import uniform_filter
        return uniform_filter(data, size=kernel_size)
    else:
        raise ValueError(f"Unknown smoothing method: {method}")


def normalize_field(data: np.ndarray, method: str = 'minmax', 
                    target_range: Tuple[float, float] = (0.0, 1.0),
                    return_params: bool = False) -> Tuple[np.ndarray, Optional[dict]]:
    if data.size == 0:
        return (data.copy(), None) if return_params else data.copy()
    params = {'method': method}
    if method == 'minmax':
        data_min = np.min(data)
        data_max = np.max(data)
        params['min'] = data_min
        params['max'] = data_max
        params['target_range'] = target_range
        if data_max == data_min:
            result = np.full_like(data, target_range[0])
            return (result, params) if return_params else result
        normalized = (data - data_min) / (data_max - data_min)
        result = normalized * (target_range[1] - target_range[0]) + target_range[0]
        return (result, params) if return_params else result
    elif method == 'zscore':
        mean = np.mean(data)
        std = np.std(data)
        params['mean'] = mean
        params['std'] = std
        if std == 0:
            result = np.zeros_like(data)
            return (result, params) if return_params else result
        result = (data - mean) / std
        return (result, params) if return_params else result
    elif method == 'l2':
        norm = np.linalg.norm(data)
        params['norm'] = norm
        if norm == 0:
            result = data.copy()
            return (result, params) if return_params else result
        result = data / norm
        return (result, params) if return_params else result
    else:
        raise ValueError(f"Unknown normalization method: {method}")


def denormalize_field(data: np.ndarray, params: dict) -> np.ndarray:
    if params is None:
        return data.copy()
    method = params.get('method', 'minmax')
    if method == 'minmax':
        data_min = params['min']
        data_max = params['max']
        target_min, target_max = params.get('target_range', (0.0, 1.0))
        if data_max == data_min:
            return np.full_like(data, data_min)
        normalized = (data - target_min) / (target_max - target_min)
        return normalized * (data_max - data_min) + data_min
    elif method == 'zscore':
        mean = params['mean']
        std = params['std']
        if std == 0:
            return np.full_like(data, mean)
        return data * std + mean
    elif method == 'l2':
        norm = params['norm']
        return data * norm
    else:
        raise ValueError(f"Unknown denormalization method: {method}")


def normalize_velocity(u: np.ndarray, v: np.ndarray, method: str = 'minmax',
                       target_range: Tuple[float, float] = (-1.0, 1.0),
                       return_params: bool = False) -> Tuple[np.ndarray, np.ndarray, Optional[dict]]:
    u_norm = np.abs(u)
    v_norm = np.abs(v)
    max_magnitude = np.max(np.sqrt(u_norm ** 2 + v_norm ** 2))
    if max_magnitude == 0:
        params = {'method': method, 'scale': 1.0, 'target_range': target_range}
        return (u.copy(), v.copy(), params) if return_params else (u.copy(), v.copy())
    target_min, target_max = target_range
    target_span = target_max - target_min
    scale = target_span / (2 * max_magnitude)
    u_normalized = u * scale + (target_min + target_max) / 2
    v_normalized = v * scale + (target_min + target_max) / 2
    params = {
        'method': method,
        'max_magnitude': max_magnitude,
        'scale': scale,
        'target_range': target_range
    }
    return (u_normalized, v_normalized, params) if return_params else (u_normalized, v_normalized)


def denormalize_velocity(u_norm: np.ndarray, v_norm: np.ndarray, params: dict) -> Tuple[np.ndarray, np.ndarray]:
    if params is None:
        return u_norm.copy(), v_norm.copy()
    target_min, target_max = params.get('target_range', (-1.0, 1.0))
    scale = params.get('scale', 1.0)
    u = (u_norm - (target_min + target_max) / 2) / scale
    v = (v_norm - (target_min + target_max) / 2) / scale
    return u, v


def clean_velocity_field(u: np.ndarray, v: np.ndarray, 
                         pressure: Optional[np.ndarray] = None,
                         config: Optional[dict] = None) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
    default_config = {
        'remove_outliers': True,
        'outlier_threshold': 3.0,
        'fill_nan': True,
        'nan_method': 'linear',
        'smooth': True,
        'smooth_method': 'gaussian',
        'smooth_sigma': 0.5,
        'check_divergence': True
    }
    if config:
        default_config.update(config)
    cfg = default_config
    u_clean = u.copy()
    v_clean = v.copy()
    p_clean = pressure.copy() if pressure is not None else None
    if cfg['fill_nan']:
        u_clean = fill_nan(u_clean, method=cfg['nan_method'])
        v_clean = fill_nan(v_clean, method=cfg['nan_method'])
        if p_clean is not None:
            p_clean = fill_nan(p_clean, method=cfg['nan_method'])
    if cfg['remove_outliers']:
        u_clean = remove_outliers(u_clean, threshold=cfg['outlier_threshold'])
        v_clean = remove_outliers(v_clean, threshold=cfg['outlier_threshold'])
        if p_clean is not None:
            p_clean = remove_outliers(p_clean, threshold=cfg['outlier_threshold'])
    if cfg['smooth']:
        u_clean = smooth_field(u_clean, method=cfg['smooth_method'], sigma=cfg['smooth_sigma'])
        v_clean = smooth_field(v_clean, method=cfg['smooth_method'], sigma=cfg['smooth_sigma'])
        if p_clean is not None:
            p_clean = smooth_field(p_clean, method=cfg['smooth_method'], sigma=cfg['smooth_sigma'])
    return u_clean, v_clean, p_clean


class DataCleaner:
    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
    
    def clean(self, data: np.ndarray) -> np.ndarray:
        result = data.copy()
        if self.config.get('fill_nan', True):
            result = fill_nan(result, method=self.config.get('nan_method', 'linear'))
        if self.config.get('remove_outliers', True):
            result = remove_outliers(result, threshold=self.config.get('outlier_threshold', 3.0))
        if self.config.get('smooth', False):
            result = smooth_field(result, 
                                  method=self.config.get('smooth_method', 'gaussian'),
                                  sigma=self.config.get('smooth_sigma', 1.0))
        if self.config.get('normalize', False):
            result = normalize_field(result, 
                                     method=self.config.get('normalize_method', 'minmax'))
        return result
    
    def clean_velocity(self, u: np.ndarray, v: np.ndarray, 
                       pressure: Optional[np.ndarray] = None) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
        return clean_velocity_field(u, v, pressure, self.config)
