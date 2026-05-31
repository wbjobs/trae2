from typing import Optional, List, Tuple, Dict, Any
import numpy as np
from config import GridConfig, BoundaryCondition


def validate_grid_data(data: np.ndarray, expected_shape: Optional[Tuple[int, ...]] = None,
                       allowed_dtypes: Optional[List[type]] = None) -> Tuple[bool, List[str]]:
    errors = []
    if not isinstance(data, np.ndarray):
        errors.append(f"Data must be numpy.ndarray, got {type(data)}")
        return False, errors
    if data.ndim not in [2, 3]:
        errors.append(f"Data must be 2D or 3D array, got {data.ndim}D")
    if expected_shape is not None and data.shape != expected_shape:
        errors.append(f"Expected shape {expected_shape}, got {data.shape}")
    if allowed_dtypes is not None:
        if not any(np.issubdtype(data.dtype, dt) for dt in allowed_dtypes):
            errors.append(f"Unsupported dtype {data.dtype}, expected one of {allowed_dtypes}")
    if np.any(np.isinf(data)):
        errors.append("Data contains infinite values")
    if data.size == 0:
        errors.append("Data array is empty")
    return len(errors) == 0, errors


def validate_boundary_conditions(data: np.ndarray, bc_x: BoundaryCondition,
                                 bc_y: BoundaryCondition,
                                 bc_values: Optional[Dict[str, float]] = None) -> Tuple[bool, List[str]]:
    errors = []
    bc_values = bc_values or {}
    if bc_x == BoundaryCondition.DIRICHLET:
        left_val = bc_values.get('left', 0.0)
        right_val = bc_values.get('right', 0.0)
        if data.ndim == 2:
            if not np.allclose(data[0, :], left_val):
                errors.append("Left boundary does not match Dirichlet condition")
            if not np.allclose(data[-1, :], right_val):
                errors.append("Right boundary does not match Dirichlet condition")
        else:
            if not np.allclose(data[:, 0, :], left_val):
                errors.append("Left boundary does not match Dirichlet condition")
            if not np.allclose(data[:, -1, :], right_val):
                errors.append("Right boundary does not match Dirichlet condition")
    elif bc_x == BoundaryCondition.PERIODIC:
        if data.ndim == 2:
            if not np.allclose(data[0, :], data[-1, :]):
                errors.append("X boundaries do not match periodic condition")
        else:
            if not np.allclose(data[:, 0, :], data[:, -1, :]):
                errors.append("X boundaries do not match periodic condition")
    if bc_y == BoundaryCondition.DIRICHLET:
        bottom_val = bc_values.get('bottom', 0.0)
        top_val = bc_values.get('top', 0.0)
        if data.ndim == 2:
            if not np.allclose(data[:, 0], bottom_val):
                errors.append("Bottom boundary does not match Dirichlet condition")
            if not np.allclose(data[:, -1], top_val):
                errors.append("Top boundary does not match Dirichlet condition")
        else:
            if not np.allclose(data[:, :, 0], bottom_val):
                errors.append("Bottom boundary does not match Dirichlet condition")
            if not np.allclose(data[:, :, -1], top_val):
                errors.append("Top boundary does not match Dirichlet condition")
    elif bc_y == BoundaryCondition.PERIODIC:
        if data.ndim == 2:
            if not np.allclose(data[:, 0], data[:, -1]):
                errors.append("Y boundaries do not match periodic condition")
        else:
            if not np.allclose(data[:, :, 0], data[:, :, -1]):
                errors.append("Y boundaries do not match periodic condition")
    return len(errors) == 0, errors


def validate_velocity_field(u: np.ndarray, v: np.ndarray,
                            grid_config: Optional[GridConfig] = None) -> Tuple[bool, List[str]]:
    errors = []
    if u.shape != v.shape:
        errors.append(f"u and v shapes mismatch: {u.shape} vs {v.shape}")
    if u.ndim not in [2, 3]:
        errors.append(f"Velocity must be 2D or 3D array, got {u.ndim}D")
    if grid_config is not None:
        expected_shape = (grid_config.nx, grid_config.ny)
        actual_shape = u.shape[-2:]
        if actual_shape != expected_shape:
            errors.append(f"Expected shape {expected_shape}, got {actual_shape}")
    if np.any(np.isnan(u)) or np.any(np.isnan(v)):
        errors.append("Velocity field contains NaN values")
    if np.any(np.isinf(u)) or np.any(np.isinf(v)):
        errors.append("Velocity field contains infinite values")
    return len(errors) == 0, errors


def compute_divergence(u: np.ndarray, v: np.ndarray, dx: float, dy: float) -> np.ndarray:
    if u.ndim == 2:
        du_dx = np.gradient(u, dx, axis=0)
        dv_dy = np.gradient(v, dy, axis=1)
    else:
        du_dx = np.gradient(u, dx, axis=1)
        dv_dy = np.gradient(v, dy, axis=2)
    return du_dx + dv_dy


def check_incompressibility(u: np.ndarray, v: np.ndarray, dx: float, dy: float,
                            tolerance: float = 1e-4) -> Tuple[bool, float, List[str]]:
    errors = []
    div = compute_divergence(u, v, dx, dy)
    max_div = np.max(np.abs(div))
    avg_div = np.mean(np.abs(div))
    is_incompressible = max_div < tolerance
    if not is_incompressible:
        errors.append(f"Maximum divergence {max_div:.6e} exceeds tolerance {tolerance}")
        errors.append(f"Average divergence: {avg_div:.6e}")
    return is_incompressible, max_div, errors


def validate_cfl(u: np.ndarray, v: np.ndarray, dx: float, dy: float,
                 dt: float, cfl_max: float = 0.5) -> Tuple[bool, float, List[str]]:
    errors = []
    max_u = np.max(np.abs(u))
    max_v = np.max(np.abs(v))
    cfl = dt * (max_u / dx + max_v / dy)
    is_valid = cfl <= cfl_max
    if not is_valid:
        errors.append(f"CFL number {cfl:.6f} exceeds maximum {cfl_max}")
        errors.append(f"Max u: {max_u:.6f}, Max v: {max_v:.6f}")
        errors.append(f"Suggested dt: {cfl_max / (max_u / dx + max_v / dy):.6e}")
    return is_valid, cfl, errors


def check_stability(nu: float, dt: float, dx: float, dy: float) -> Tuple[bool, float, List[str]]:
    errors = []
    diffusive = nu * dt * (1.0 / dx ** 2 + 1.0 / dy ** 2)
    is_stable = diffusive <= 0.25
    if not is_stable:
        errors.append(f"Diffusive stability condition violated: {diffusive:.6f} > 0.25")
        errors.append(f"Suggested dt: {0.25 / (nu * (1.0 / dx ** 2 + 1.0 / dy ** 2)):.6e}")
    return is_stable, diffusive, errors


class DataValidator:
    def __init__(self, grid_config: Optional[GridConfig] = None):
        self.grid_config = grid_config
    
    def validate(self, data: np.ndarray, expected_shape: Optional[Tuple[int, ...]] = None) -> Tuple[bool, List[str]]:
        return validate_grid_data(data, expected_shape)
    
    def validate_velocity(self, u: np.ndarray, v: np.ndarray) -> Tuple[bool, List[str]]:
        return validate_velocity_field(u, v, self.grid_config)
    
    def validate_bc(self, data: np.ndarray, bc_x: BoundaryCondition, bc_y: BoundaryCondition,
                    bc_values: Optional[Dict[str, float]] = None) -> Tuple[bool, List[str]]:
        return validate_boundary_conditions(data, bc_x, bc_y, bc_values)
    
    def check_incompressibility(self, u: np.ndarray, v: np.ndarray, tolerance: float = 1e-4) -> Tuple[bool, float, List[str]]:
        if self.grid_config is None:
            raise ValueError("GridConfig required for incompressibility check")
        return check_incompressibility(u, v, self.grid_config.dx, self.grid_config.dy, tolerance)
    
    def check_cfl(self, u: np.ndarray, v: np.ndarray, dt: float, cfl_max: float = 0.5) -> Tuple[bool, float, List[str]]:
        if self.grid_config is None:
            raise ValueError("GridConfig required for CFL check")
        return validate_cfl(u, v, self.grid_config.dx, self.grid_config.dy, dt, cfl_max)
    
    def check_stability(self, nu: float, dt: float) -> Tuple[bool, float, List[str]]:
        if self.grid_config is None:
            raise ValueError("GridConfig required for stability check")
        return check_stability(nu, dt, self.grid_config.dx, self.grid_config.dy)
    
    def validate_full(self, u: np.ndarray, v: np.ndarray, p: Optional[np.ndarray],
                      nu: float, dt: float, cfl_max: float = 0.5,
                      incompressibility_tol: float = 1e-4) -> Dict[str, Any]:
        results = {
            'valid': True,
            'velocity_valid': False,
            'boundary_valid': False,
            'incompressible': False,
            'cfl_valid': False,
            'stable': False,
            'max_divergence': 0.0,
            'cfl': 0.0,
            'diffusive': 0.0,
            'errors': []
        }
        vel_ok, vel_errors = self.validate_velocity(u, v)
        results['velocity_valid'] = vel_ok
        results['errors'].extend(vel_errors)
        if self.grid_config is not None:
            bc_ok, bc_errors = self.validate_bc(u, self.grid_config.bc_x, self.grid_config.bc_y)
            results['boundary_valid'] = bc_ok
            results['errors'].extend(bc_errors)
            try:
                incomp_ok, max_div, inc_errors = self.check_incompressibility(u, v, incompressibility_tol)
                results['incompressible'] = incomp_ok
                results['max_divergence'] = max_div
                results['errors'].extend(inc_errors)
            except Exception as e:
                results['errors'].append(f"Incompressibility check failed: {e}")
            try:
                cfl_ok, cfl, cfl_errors = self.check_cfl(u, v, dt, cfl_max)
                results['cfl_valid'] = cfl_ok
                results['cfl'] = cfl
                results['errors'].extend(cfl_errors)
            except Exception as e:
                results['errors'].append(f"CFL check failed: {e}")
            try:
                stab_ok, diff, stab_errors = self.check_stability(nu, dt)
                results['stable'] = stab_ok
                results['diffusive'] = diff
                results['errors'].extend(stab_errors)
            except Exception as e:
                results['errors'].append(f"Stability check failed: {e}")
        results['valid'] = all([
            results['velocity_valid'],
            results['boundary_valid'],
            results['incompressible'],
            results['cfl_valid'],
            results['stable']
        ])
        return results
