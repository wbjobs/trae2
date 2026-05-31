from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
import numpy as np
from .kernels import compute_vorticity, compute_kinetic_energy


@dataclass
class FlowMetrics:
    kinetic_energy: float = 0.0
    enstrophy: float = 0.0
    dissipation: float = 0.0
    max_velocity_magnitude: float = 0.0
    avg_velocity_magnitude: float = 0.0
    max_vorticity: float = 0.0
    min_vorticity: float = 0.0
    reynolds_number: float = 0.0
    cfl_number: float = 0.0
    divergence_max: float = 0.0
    pressure_max: float = 0.0
    pressure_min: float = 0.0
    pressure_mean: float = 0.0
    stats: Dict[str, float] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'kinetic_energy': self.kinetic_energy,
            'enstrophy': self.enstrophy,
            'dissipation': self.dissipation,
            'max_velocity_magnitude': self.max_velocity_magnitude,
            'avg_velocity_magnitude': self.avg_velocity_magnitude,
            'max_vorticity': self.max_vorticity,
            'min_vorticity': self.min_vorticity,
            'reynolds_number': self.reynolds_number,
            'cfl_number': self.cfl_number,
            'divergence_max': self.divergence_max,
            'pressure_max': self.pressure_max,
            'pressure_min': self.pressure_min,
            'pressure_mean': self.pressure_mean,
            **self.stats
        }


def compute_enstrophy(vorticity: np.ndarray) -> float:
    return 0.5 * np.mean(vorticity ** 2)


def compute_dissipation(u: np.ndarray, v: np.ndarray, nu: float, 
                        dx: float, dy: float) -> float:
    nx, ny = u.shape
    du_dx = np.gradient(u, dx, axis=0)
    du_dy = np.gradient(u, dy, axis=1)
    dv_dx = np.gradient(v, dx, axis=0)
    dv_dy = np.gradient(v, dy, axis=1)
    s_ij = np.zeros((2, 2, nx, ny))
    s_ij[0, 0] = du_dx
    s_ij[0, 1] = 0.5 * (du_dy + dv_dx)
    s_ij[1, 0] = s_ij[0, 1]
    s_ij[1, 1] = dv_dy
    dissipation = 2.0 * nu * np.sum(s_ij ** 2) / (nx * ny)
    return dissipation


def compute_reynolds_number(u: np.ndarray, v: np.ndarray, L: float, nu: float) -> float:
    velocity_mag = np.sqrt(u ** 2 + v ** 2)
    U = np.max(velocity_mag)
    Re = U * L / nu
    return Re


def compute_cfl(u: np.ndarray, v: np.ndarray, dx: float, dy: float, dt: float) -> float:
    max_u = np.max(np.abs(u))
    max_v = np.max(np.abs(v))
    cfl = dt * (max_u / dx + max_v / dy)
    return cfl


def compute_max_divergence(u: np.ndarray, v: np.ndarray, 
                           dx: float, dy: float) -> float:
    du_dx = np.gradient(u, dx, axis=0)
    dv_dy = np.gradient(v, dy, axis=1)
    div = du_dx + dv_dy
    return np.max(np.abs(div))


def compute_flow_metrics(u: np.ndarray, v: np.ndarray, p: np.ndarray,
                         dx: float, dy: float, dt: float, nu: float,
                         L: Optional[float] = None) -> FlowMetrics:
    if L is None:
        L = dx * u.shape[0]
    vorticity = compute_vorticity(u, v, dx, dy)
    velocity_mag = np.sqrt(u ** 2 + v ** 2)
    ke = compute_kinetic_energy(u, v)
    enstrophy = compute_enstrophy(vorticity)
    dissipation = compute_dissipation(u, v, nu, dx, dy)
    Re = compute_reynolds_number(u, v, L, nu)
    cfl = compute_cfl(u, v, dx, dy, dt)
    div_max = compute_max_divergence(u, v, dx, dy)
    metrics = FlowMetrics(
        kinetic_energy=ke,
        enstrophy=enstrophy,
        dissipation=dissipation,
        max_velocity_magnitude=np.max(velocity_mag),
        avg_velocity_magnitude=np.mean(velocity_mag),
        max_vorticity=np.max(vorticity),
        min_vorticity=np.min(vorticity),
        reynolds_number=Re,
        cfl_number=cfl,
        divergence_max=div_max,
        pressure_max=np.max(p),
        pressure_min=np.min(p),
        pressure_mean=np.mean(p)
    )
    return metrics


def compute_shard_metrics(u: np.ndarray, v: np.ndarray, p: np.ndarray,
                          dx: float, dy: float, dt: float, nu: float,
                          shard_id: int, iteration: int) -> Dict[str, Any]:
    metrics = compute_flow_metrics(u, v, p, dx, dy, dt, nu)
    result = metrics.to_dict()
    result['shard_id'] = shard_id
    result['iteration'] = iteration
    return result
