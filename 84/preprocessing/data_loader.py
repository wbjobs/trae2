from typing import Optional, Tuple, Dict, Any
import numpy as np
import json
from pathlib import Path


def generate_taylor_green_vortex(nx: int, ny: int, lx: float = 1.0, ly: float = 1.0,
                                 t: float = 0.0, nu: float = 0.01) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    x = np.linspace(0, lx, nx, endpoint=False)
    y = np.linspace(0, ly, ny, endpoint=False)
    X, Y = np.meshgrid(x, y, indexing='ij')
    decay = np.exp(-2.0 * nu * np.pi ** 2 * t / (lx ** 2 + ly ** 2))
    u = -np.cos(2.0 * np.pi * X / lx) * np.sin(2.0 * np.pi * Y / ly) * decay
    v = np.sin(2.0 * np.pi * X / lx) * np.cos(2.0 * np.pi * Y / ly) * decay
    p = 0.25 * (np.cos(4.0 * np.pi * X / lx) + np.cos(4.0 * np.pi * Y / ly)) * decay ** 2
    return u, v, p


def generate_uniform_flow(nx: int, ny: int, u0: float = 1.0, v0: float = 0.0) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    u = np.full((nx, ny), u0)
    v = np.full((nx, ny), v0)
    p = np.zeros((nx, ny))
    return u, v, p


def generate_shear_flow(nx: int, ny: int, lx: float = 1.0, ly: float = 1.0,
                        shear_strength: float = 1.0) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    y = np.linspace(0, ly, ny, endpoint=False)
    u = np.outer(np.ones(nx), shear_strength * y / ly)
    v = np.zeros((nx, ny))
    p = np.zeros((nx, ny))
    return u, v, p


def generate_cylinder_flow(nx: int, ny: int, lx: float = 1.0, ly: float = 1.0,
                           u0: float = 1.0, radius: float = 0.1,
                           cx: float = 0.3, cy: float = 0.5) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    x = np.linspace(0, lx, nx, endpoint=False)
    y = np.linspace(0, ly, ny, endpoint=False)
    X, Y = np.meshgrid(x, y, indexing='ij')
    dx = X - cx
    dy = Y - cy
    r = np.sqrt(dx ** 2 + dy ** 2)
    mask = r < radius
    u = np.full((nx, ny), u0)
    v = np.zeros((nx, ny))
    theta = np.arctan2(dy, dx)
    inv_r2 = 1.0 / (r ** 2 + 1e-10)
    u_pot = u0 * (1 - radius ** 2 * inv_r2 * np.cos(2 * theta))
    v_pot = -u0 * radius ** 2 * inv_r2 * np.sin(2 * theta)
    outside = ~mask
    u[outside] = u_pot[outside]
    v[outside] = v_pot[outside]
    u[mask] = 0
    v[mask] = 0
    p = 0.5 * (u0 ** 2 - (u ** 2 + v ** 2))
    return u, v, p


def generate_random_noise(nx: int, ny: int, amplitude: float = 0.1) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    u = np.random.normal(0, amplitude, (nx, ny))
    v = np.random.normal(0, amplitude, (nx, ny))
    p = np.random.normal(0, amplitude * 0.1, (nx, ny))
    return u, v, p


def generate_initial_conditions(nx: int, ny: int, condition_type: str = 'taylor_green',
                                **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    condition_type = condition_type.lower()
    if condition_type == 'taylor_green':
        return generate_taylor_green_vortex(nx, ny, **kwargs)
    elif condition_type == 'uniform':
        return generate_uniform_flow(nx, ny, **kwargs)
    elif condition_type == 'shear':
        return generate_shear_flow(nx, ny, **kwargs)
    elif condition_type == 'cylinder':
        return generate_cylinder_flow(nx, ny, **kwargs)
    elif condition_type == 'noise':
        return generate_random_noise(nx, ny, **kwargs)
    elif condition_type == 'rest':
        return np.zeros((nx, ny)), np.zeros((nx, ny)), np.zeros((nx, ny))
    else:
        raise ValueError(f"Unknown initial condition type: {condition_type}")


def save_field(filepath: str, data: np.ndarray, field_name: str,
               additional_info: Optional[Dict[str, Any]] = None) -> None:
    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)
    data_dict = {
        'data': data.tolist(),
        'shape': list(data.shape),
        'dtype': str(data.dtype),
        'field_name': field_name,
    }
    if additional_info:
        data_dict.update(additional_info)
    with open(path, 'w') as f:
        json.dump(data_dict, f)


def load_field(filepath: str) -> Tuple[np.ndarray, Dict[str, Any]]:
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")
    with open(path, 'r') as f:
        data_dict = json.load(f)
    data = np.array(data_dict['data'], dtype=data_dict.get('dtype', 'float64'))
    return data, data_dict


def save_fields(filepath: str, fields: Dict[str, np.ndarray],
                additional_info: Optional[Dict[str, Any]] = None) -> None:
    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)
    data_dict = {
        'fields': {
            name: {
                'data': field.tolist(),
                'shape': list(field.shape),
                'dtype': str(field.dtype)
            }
            for name, field in fields.items()
        },
        'field_names': list(fields.keys()),
    }
    if additional_info:
        data_dict.update(additional_info)
    with open(path, 'w') as f:
        json.dump(data_dict, f)


def load_fields(filepath: str) -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")
    with open(path, 'r') as f:
        data_dict = json.load(f)
    fields = {}
    for name, field_info in data_dict['fields'].items():
        fields[name] = np.array(field_info['data'], dtype=field_info.get('dtype', 'float64'))
    return fields, data_dict


class DataLoader:
    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir) if base_dir else Path.cwd() / 'data'
        self.base_dir.mkdir(parents=True, exist_ok=True)
    
    def generate_initial(self, nx: int, ny: int, condition_type: str = 'taylor_green',
                         **kwargs) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        return generate_initial_conditions(nx, ny, condition_type, **kwargs)
    
    def save(self, filename: str, data: np.ndarray, field_name: str,
             additional_info: Optional[Dict[str, Any]] = None) -> None:
        filepath = self.base_dir / filename
        save_field(str(filepath), data, field_name, additional_info)
    
    def load(self, filename: str) -> Tuple[np.ndarray, Dict[str, Any]]:
        filepath = self.base_dir / filename
        return load_field(str(filepath))
    
    def save_multiple(self, filename: str, fields: Dict[str, np.ndarray],
                      additional_info: Optional[Dict[str, Any]] = None) -> None:
        filepath = self.base_dir / filename
        save_fields(str(filepath), fields, additional_info)
    
    def load_multiple(self, filename: str) -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
        filepath = self.base_dir / filename
        return load_fields(str(filepath))
