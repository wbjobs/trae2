from typing import Optional, Dict, Tuple
import numpy as np
from config import BoundaryCondition


def apply_periodic_bc(field: np.ndarray, axis: int = 0) -> np.ndarray:
    result = field.copy()
    if axis == 0:
        result[0, :] = result[-2, :]
        result[-1, :] = result[1, :]
    elif axis == 1:
        result[:, 0] = result[:, -2]
        result[:, -1] = result[:, 1]
    return result


def apply_dirichlet_bc(field: np.ndarray, value: float, 
                       side: str = 'left') -> np.ndarray:
    result = field.copy()
    if side == 'left':
        result[0, :] = value
    elif side == 'right':
        result[-1, :] = value
    elif side == 'bottom':
        result[:, 0] = value
    elif side == 'top':
        result[:, -1] = value
    return result


def apply_neumann_bc(field: np.ndarray, gradient: float, dx: float,
                     side: str = 'left') -> np.ndarray:
    result = field.copy()
    if side == 'left':
        result[0, :] = result[1, :] - gradient * dx
    elif side == 'right':
        result[-1, :] = result[-2, :] + gradient * dx
    elif side == 'bottom':
        result[:, 0] = result[:, 1] - gradient * dx
    elif side == 'top':
        result[:, -1] = result[:, -2] + gradient * dx
    return result


def apply_no_slip_bc(u: np.ndarray, v: np.ndarray,
                     sides: Optional[list] = None) -> Tuple[np.ndarray, np.ndarray]:
    if sides is None:
        sides = ['left', 'right', 'bottom', 'top']
    u_result = u.copy()
    v_result = v.copy()
    for side in sides:
        if side == 'left':
            u_result[0, :] = 0.0
            v_result[0, :] = 0.0
        elif side == 'right':
            u_result[-1, :] = 0.0
            v_result[-1, :] = 0.0
        elif side == 'bottom':
            u_result[:, 0] = 0.0
            v_result[:, 0] = 0.0
        elif side == 'top':
            u_result[:, -1] = 0.0
            v_result[:, -1] = 0.0
    return u_result, v_result


def apply_velocity_inlet(u: np.ndarray, v: np.ndarray,
                         u0: float, v0: float = 0.0,
                         side: str = 'left') -> Tuple[np.ndarray, np.ndarray]:
    u_result = u.copy()
    v_result = v.copy()
    if side == 'left':
        u_result[0, :] = u0
        v_result[0, :] = v0
    elif side == 'right':
        u_result[-1, :] = u0
        v_result[-1, :] = v0
    elif side == 'bottom':
        u_result[:, 0] = u0
        v_result[:, 0] = v0
    elif side == 'top':
        u_result[:, -1] = u0
        v_result[:, -1] = v0
    return u_result, v_result


def apply_outflow_bc(field: np.ndarray, dx: float,
                     side: str = 'right') -> np.ndarray:
    result = field.copy()
    if side == 'left':
        result[0, :] = result[1, :]
    elif side == 'right':
        result[-1, :] = result[-2, :]
    elif side == 'bottom':
        result[:, 0] = result[:, 1]
    elif side == 'top':
        result[:, -1] = result[:, -2]
    return result


def apply_all_boundaries(u: np.ndarray, v: np.ndarray, p: np.ndarray,
                         bc_x: BoundaryCondition, bc_y: BoundaryCondition,
                         dx: float, dy: float,
                         bc_values: Optional[Dict[str, float]] = None) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    bc_values = bc_values or {}
    u_result = u.copy()
    v_result = v.copy()
    p_result = p.copy()
    
    if bc_x == BoundaryCondition.PERIODIC:
        u_result = apply_periodic_bc(u_result, axis=0)
        v_result = apply_periodic_bc(v_result, axis=0)
        p_result = apply_periodic_bc(p_result, axis=0)
    elif bc_x == BoundaryCondition.DIRICHLET:
        u_left = bc_values.get('u_left', 0.0)
        u_right = bc_values.get('u_right', 0.0)
        v_left = bc_values.get('v_left', 0.0)
        v_right = bc_values.get('v_right', 0.0)
        p_left = bc_values.get('p_left', 0.0)
        p_right = bc_values.get('p_right', 0.0)
        u_result = apply_dirichlet_bc(u_result, u_left, 'left')
        u_result = apply_dirichlet_bc(u_result, u_right, 'right')
        v_result = apply_dirichlet_bc(v_result, v_left, 'left')
        v_result = apply_dirichlet_bc(v_result, v_right, 'right')
        p_result = apply_dirichlet_bc(p_result, p_left, 'left')
        p_result = apply_dirichlet_bc(p_result, p_right, 'right')
    elif bc_x == BoundaryCondition.NO_SLIP:
        u_result, v_result = apply_no_slip_bc(u_result, v_result, ['left', 'right'])
        p_result = apply_neumann_bc(p_result, 0.0, dx, 'left')
        p_result = apply_neumann_bc(p_result, 0.0, dx, 'right')
    elif bc_x == BoundaryCondition.NEUMANN:
        dp_dx_left = bc_values.get('dp_dx_left', 0.0)
        dp_dx_right = bc_values.get('dp_dx_right', 0.0)
        p_result = apply_neumann_bc(p_result, dp_dx_left, dx, 'left')
        p_result = apply_neumann_bc(p_result, dp_dx_right, dx, 'right')
        u_result = apply_outflow_bc(u_result, dx, 'left')
        u_result = apply_outflow_bc(u_result, dx, 'right')
        v_result = apply_outflow_bc(v_result, dx, 'left')
        v_result = apply_outflow_bc(v_result, dx, 'right')
    
    if bc_y == BoundaryCondition.PERIODIC:
        u_result = apply_periodic_bc(u_result, axis=1)
        v_result = apply_periodic_bc(v_result, axis=1)
        p_result = apply_periodic_bc(p_result, axis=1)
    elif bc_y == BoundaryCondition.DIRICHLET:
        u_bottom = bc_values.get('u_bottom', 0.0)
        u_top = bc_values.get('u_top', 0.0)
        v_bottom = bc_values.get('v_bottom', 0.0)
        v_top = bc_values.get('v_top', 0.0)
        p_bottom = bc_values.get('p_bottom', 0.0)
        p_top = bc_values.get('p_top', 0.0)
        u_result = apply_dirichlet_bc(u_result, u_bottom, 'bottom')
        u_result = apply_dirichlet_bc(u_result, u_top, 'top')
        v_result = apply_dirichlet_bc(v_result, v_bottom, 'bottom')
        v_result = apply_dirichlet_bc(v_result, v_top, 'top')
        p_result = apply_dirichlet_bc(p_result, p_bottom, 'bottom')
        p_result = apply_dirichlet_bc(p_result, p_top, 'top')
    elif bc_y == BoundaryCondition.NO_SLIP:
        u_result, v_result = apply_no_slip_bc(u_result, v_result, ['bottom', 'top'])
        p_result = apply_neumann_bc(p_result, 0.0, dy, 'bottom')
        p_result = apply_neumann_bc(p_result, 0.0, dy, 'top')
    elif bc_y == BoundaryCondition.NEUMANN:
        dp_dy_bottom = bc_values.get('dp_dy_bottom', 0.0)
        dp_dy_top = bc_values.get('dp_dy_top', 0.0)
        p_result = apply_neumann_bc(p_result, dp_dy_bottom, dy, 'bottom')
        p_result = apply_neumann_bc(p_result, dp_dy_top, dy, 'top')
        u_result = apply_outflow_bc(u_result, dy, 'bottom')
        u_result = apply_outflow_bc(u_result, dy, 'top')
        v_result = apply_outflow_bc(v_result, dy, 'bottom')
        v_result = apply_outflow_bc(v_result, dy, 'top')
    
    return u_result, v_result, p_result
