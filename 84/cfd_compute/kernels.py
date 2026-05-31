import numpy as np
from numba import jit, prange, float64, int64


@jit(float64[:, :](float64[:, :], float64[:, :], float64[:, :], float64, float64),
     nopython=True, parallel=True, fastmath=True)
def compute_convective_term(u: np.ndarray, v: np.ndarray, field: np.ndarray,
                            dx: float, dy: float) -> np.ndarray:
    nx, ny = field.shape
    result = np.zeros_like(field)
    for i in prange(1, nx - 1):
        for j in range(1, ny - 1):
            u_ij = 0.25 * (u[i, j] + u[i + 1, j] + u[i, j] + u[i + 1, j])
            v_ij = 0.25 * (v[i, j] + v[i, j + 1] + v[i, j] + v[i, j + 1])
            dfield_dx = (field[i + 1, j] - field[i - 1, j]) / (2.0 * dx)
            dfield_dy = (field[i, j + 1] - field[i, j - 1]) / (2.0 * dy)
            if u_ij > 0:
                dfield_dx = (field[i, j] - field[i - 1, j]) / dx
            else:
                dfield_dx = (field[i + 1, j] - field[i, j]) / dx
            if v_ij > 0:
                dfield_dy = (field[i, j] - field[i, j - 1]) / dy
            else:
                dfield_dy = (field[i, j + 1] - field[i, j]) / dy
            result[i, j] = -(u_ij * dfield_dx + v_ij * dfield_dy)
    return result


@jit(float64[:, :](float64[:, :], float64, float64, float64),
     nopython=True, parallel=True, fastmath=True)
def compute_diffusive_term(field: np.ndarray, nu: float, dx: float, dy: float) -> np.ndarray:
    nx, ny = field.shape
    result = np.zeros_like(field)
    for i in prange(1, nx - 1):
        for j in range(1, ny - 1):
            d2field_dx2 = (field[i + 1, j] - 2.0 * field[i, j] + field[i - 1, j]) / (dx * dx)
            d2field_dy2 = (field[i, j + 1] - 2.0 * field[i, j] + field[i, j - 1]) / (dy * dy)
            result[i, j] = nu * (d2field_dx2 + d2field_dy2)
    return result


@jit(float64[:, :](float64[:, :], float64[:, :], float64, float64, float64),
     nopython=True, parallel=True, fastmath=True)
def compute_poisson_rhs(u: np.ndarray, v: np.ndarray, rho: float, dx: float, dy: float) -> np.ndarray:
    nx, ny = u.shape
    rhs = np.zeros_like(u)
    for i in prange(1, nx - 1):
        for j in range(1, ny - 1):
            du_dx = (u[i + 1, j] - u[i - 1, j]) / (2.0 * dx)
            dv_dy = (v[i, j + 1] - v[i, j - 1]) / (2.0 * dy)
            du_dy = (u[i, j + 1] - u[i, j - 1]) / (2.0 * dy)
            dv_dx = (v[i + 1, j] - v[i - 1, j]) / (2.0 * dx)
            rhs[i, j] = rho * (du_dx * du_dx + 2.0 * du_dy * dv_dx + dv_dy * dv_dy)
    return rhs


@jit(float64[:, :](float64[:, :], float64[:, :], float64, float64, int64),
     nopython=True, parallel=True, fastmath=True)
def pressure_poisson_jacobi(p: np.ndarray, rhs: np.ndarray, dx: float, dy: float,
                            max_iter: int = 50) -> np.ndarray:
    nx, ny = p.shape
    p_new = p.copy()
    dx2 = dx * dx
    dy2 = dy * dy
    for _ in range(max_iter):
        p_old = p_new.copy()
        for i in prange(1, nx - 1):
            for j in range(1, ny - 1):
                p_new[i, j] = (dy2 * (p_old[i + 1, j] + p_old[i - 1, j]) +
                               dx2 * (p_old[i, j + 1] + p_old[i, j - 1]) -
                               dx2 * dy2 * rhs[i, j]) / (2.0 * (dx2 + dy2))
        p_new[0, :] = p_new[1, :]
        p_new[-1, :] = p_new[-2, :]
        p_new[:, 0] = p_new[:, 1]
        p_new[:, -1] = p_new[:, -2]
    return p_new


@jit(float64[:, :](float64[:, :], float64[:, :], float64[:, :], float64[:, :],
                    float64, float64, float64, float64),
     nopython=True, parallel=True, fastmath=True)
def update_velocity(u: np.ndarray, v: np.ndarray, p: np.ndarray, conv: np.ndarray,
                    nu: float, rho: float, dx: float, dt: float) -> np.ndarray:
    nx, ny = u.shape
    u_new = np.zeros_like(u)
    for i in prange(1, nx - 1):
        for j in range(1, ny - 1):
            dp_dx = (p[i + 1, j] - p[i - 1, j]) / (2.0 * dx)
            viscous = nu * ((u[i + 1, j] - 2.0 * u[i, j] + u[i - 1, j]) / (dx * dx) +
                            (u[i, j + 1] - 2.0 * u[i, j] + u[i, j - 1]) / (dx * dx))
            u_new[i, j] = u[i, j] + dt * (conv[i, j] + viscous - dp_dx / rho)
    return u_new


@jit(float64[:, :](float64[:, :], float64, float64, int64, int64),
     nopython=True, parallel=True, fastmath=True)
def apply_boundary_conditions(field: np.ndarray, bc_value: float, bc_type: int,
                              axis: int, side: int) -> np.ndarray:
    result = field.copy()
    nx, ny = field.shape
    if axis == 0:
        if side == 0:
            for j in prange(ny):
                if bc_type == 0:
                    result[0, j] = result[-2, j]
                elif bc_type == 1:
                    result[0, j] = bc_value
                elif bc_type == 2:
                    result[0, j] = 2 * bc_value - result[1, j]
        else:
            for j in prange(ny):
                if bc_type == 0:
                    result[-1, j] = result[1, j]
                elif bc_type == 1:
                    result[-1, j] = bc_value
                elif bc_type == 2:
                    result[-1, j] = 2 * bc_value - result[-2, j]
    else:
        if side == 0:
            for i in prange(nx):
                if bc_type == 0:
                    result[i, 0] = result[i, -2]
                elif bc_type == 1:
                    result[i, 0] = bc_value
                elif bc_type == 2:
                    result[i, 0] = 2 * bc_value - result[i, 1]
        else:
            for i in prange(nx):
                if bc_type == 0:
                    result[i, -1] = result[i, 1]
                elif bc_type == 1:
                    result[i, -1] = bc_value
                elif bc_type == 2:
                    result[i, -1] = 2 * bc_value - result[i, -2]
    return result


@jit(float64[:, :](float64[:, :], float64[:, :], float64, float64),
     nopython=True, parallel=True, fastmath=True)
def compute_vorticity(u: np.ndarray, v: np.ndarray, dx: float, dy: float) -> np.ndarray:
    nx, ny = u.shape
    vorticity = np.zeros_like(u)
    for i in prange(1, nx - 1):
        for j in range(1, ny - 1):
            dv_dx = (v[i + 1, j] - v[i - 1, j]) / (2.0 * dx)
            du_dy = (u[i, j + 1] - u[i, j - 1]) / (2.0 * dy)
            vorticity[i, j] = dv_dx - du_dy
    return vorticity


@jit(float64(float64[:, :], float64[:, :]),
     nopython=True, fastmath=True)
def compute_kinetic_energy(u: np.ndarray, v: np.ndarray) -> float:
    nx, ny = u.shape
    ke = 0.0
    for i in prange(nx):
        for j in range(ny):
            ke += 0.5 * (u[i, j] * u[i, j] + v[i, j] * v[i, j])
    return ke / (nx * ny)


@jit((float64[:, :], float64[:, :], float64[:, :], float64[:, :], float64[:, :],
      float64[:, :], float64[:, :], float64, float64, float64, float64),
     nopython=True, parallel=True, fastmath=True)
def update_velocity_both(u: np.ndarray, v: np.ndarray,
                         u_star: np.ndarray, v_star: np.ndarray,
                         p: np.ndarray, conv_u: np.ndarray, conv_v: np.ndarray,
                         nu: float, rho: float, dx: float, dt: float) -> None:
    nx, ny = u.shape
    for i in prange(1, nx - 1):
        for j in range(1, ny - 1):
            dp_dx = (p[i + 1, j] - p[i - 1, j]) / (2.0 * dx)
            dp_dy = (p[i, j + 1] - p[i, j - 1]) / (2.0 * dx)
            viscous_u = nu * ((u[i + 1, j] - 2.0 * u[i, j] + u[i - 1, j]) / (dx * dx) +
                              (u[i, j + 1] - 2.0 * u[i, j] + u[i, j - 1]) / (dx * dx))
            viscous_v = nu * ((v[i + 1, j] - 2.0 * v[i, j] + v[i - 1, j]) / (dx * dx) +
                              (v[i, j + 1] - 2.0 * v[i, j] + v[i, j - 1]) / (dx * dx))
            u[i, j] = u_star[i, j] + dt * (conv_u[i, j] + viscous_u - dp_dx / rho)
            v[i, j] = v_star[i, j] + dt * (conv_v[i, j] + viscous_v - dp_dy / rho)


@jit((float64[:, :], float64[:, :], float64[:, :],
      float64[:, :], float64[:, :], float64[:, :],
      float64, float64, float64),
     nopython=True, parallel=True, fastmath=True)
def pressure_correction(u_star: np.ndarray, v_star: np.ndarray, p: np.ndarray,
                        u_new: np.ndarray, v_new: np.ndarray, p_new: np.ndarray,
                        rho: float, dx: float, dt: float) -> None:
    nx, ny = u_star.shape
    for i in prange(1, nx - 1):
        for j in range(1, ny - 1):
            dp_dx = (p[i + 1, j] - p[i - 1, j]) / (2.0 * dx)
            dp_dy = (p[i, j + 1] - p[i, j - 1]) / (2.0 * dx)
            u_new[i, j] = u_star[i, j] - dt / rho * dp_dx
            v_new[i, j] = v_star[i, j] - dt / rho * dp_dy
