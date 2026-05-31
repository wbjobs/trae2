import numpy as np
from typing import Dict, Optional, Tuple
from scipy.sparse import diags
from scipy.sparse.linalg import spsolve


class SeepageSolver:

    def __init__(
        self,
        nx: int = 50,
        ny: int = 50,
        dx: float = 10.0,
        dy: float = 10.0,
        dt: float = 1.0,
    ):
        self.nx = nx
        self.ny = ny
        self.dx = dx
        self.dy = dy
        self.dt = dt

    def steady_state(
        self,
        k_field: np.ndarray,
        boundary_top: np.ndarray,
        boundary_bottom: np.ndarray,
        boundary_left: Optional[np.ndarray] = None,
        boundary_right: Optional[np.ndarray] = None,
        recharge: float = 0.0,
    ) -> np.ndarray:
        n = self.nx * self.ny
        h = np.zeros(n)

        row, col, val = [], [], []
        rhs = np.zeros(n)

        for j in range(self.ny):
            for i in range(self.nx):
                idx = j * self.nx + i
                k_center = k_field[j, i]

                if j == 0:
                    row.append(idx)
                    col.append(idx)
                    val.append(1.0)
                    rhs[idx] = boundary_bottom[i] if boundary_bottom is not None else 0.0
                elif j == self.ny - 1:
                    row.append(idx)
                    col.append(idx)
                    val.append(1.0)
                    rhs[idx] = boundary_top[i] if boundary_top is not None else 0.0
                elif i == 0:
                    row.append(idx)
                    col.append(idx)
                    val.append(1.0)
                    rhs[idx] = boundary_left[j] if boundary_left is not None else boundary_bottom[j]
                elif i == self.nx - 1:
                    row.append(idx)
                    col.append(idx)
                    val.append(1.0)
                    rhs[idx] = boundary_right[j] if boundary_right is not None else boundary_top[j]
                else:
                    k_e = 2.0 * k_center * k_field[j, i + 1] / (k_center + k_field[j, i + 1]) if k_center + k_field[j, i + 1] > 0 else 0
                    k_w = 2.0 * k_center * k_field[j, i - 1] / (k_center + k_field[j, i - 1]) if k_center + k_field[j, i - 1] > 0 else 0
                    k_n = 2.0 * k_center * k_field[j + 1, i] / (k_center + k_field[j + 1, i]) if k_center + k_field[j + 1, i] > 0 else 0
                    k_s = 2.0 * k_center * k_field[j - 1, i] / (k_center + k_field[j - 1, i]) if k_center + k_field[j - 1, i] > 0 else 0

                    coeff_e = k_e / self.dx**2
                    coeff_w = k_w / self.dx**2
                    coeff_n = k_n / self.dy**2
                    coeff_s = k_s / self.dy**2
                    coeff_c = -(coeff_e + coeff_w + coeff_n + coeff_s)

                    row.append(idx); col.append(idx); val.append(coeff_c)
                    if i + 1 < self.nx:
                        row.append(idx); col.append(idx + 1); val.append(coeff_e)
                    if i - 1 >= 0:
                        row.append(idx); col.append(idx - 1); val.append(coeff_w)
                    if j + 1 < self.ny:
                        row.append(idx); col.append(idx + self.nx); val.append(coeff_n)
                    if j - 1 >= 0:
                        row.append(idx); col.append(idx - self.nx); val.append(coeff_s)

                    rhs[idx] = -recharge

        from scipy.sparse import coo_matrix
        A = coo_matrix((val, (row, col)), shape=(n, n)).tocsr()
        h = spsolve(A, rhs)
        return h.reshape(self.ny, self.nx)

    def transient(
        self,
        k_field: np.ndarray,
        s_field: np.ndarray,
        h_initial: np.ndarray,
        boundary_top: np.ndarray,
        boundary_bottom: np.ndarray,
        n_steps: int = 100,
        recharge: float = 0.0,
    ) -> Tuple[np.ndarray, list]:
        h = h_initial.copy()
        results = [h.copy()]

        for step in range(n_steps):
            h_new = h.copy()
            for j in range(1, self.ny - 1):
                for i in range(1, self.nx - 1):
                    k_c = k_field[j, i]
                    k_e = 2.0 * k_c * k_field[j, i + 1] / (k_c + k_field[j, i + 1] + 1e-30)
                    k_w = 2.0 * k_c * k_field[j, i - 1] / (k_c + k_field[j, i - 1] + 1e-30)
                    k_n = 2.0 * k_c * k_field[j + 1, i] / (k_c + k_field[j + 1, i] + 1e-30)
                    k_s = 2.0 * k_c * k_field[j - 1, i] / (k_c + k_field[j - 1, i] + 1e-30)

                    s_c = s_field[j, i]
                    laplacian = (
                        k_e * (h[j, i + 1] - h[j, i]) - k_w * (h[j, i] - h[j, i - 1])
                    ) / self.dx**2 + (
                        k_n * (h[j + 1, i] - h[j, i]) - k_s * (h[j, i] - h[j - 1, i])
                    ) / self.dy**2

                    h_new[j, i] = h[j, i] + self.dt / s_c * (laplacian + recharge)

            h_new[0, :] = boundary_bottom
            h_new[-1, :] = boundary_top
            h = h_new
            results.append(h.copy())

        return h, results

    def compute_velocity(self, h: np.ndarray, k_field: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        vx = np.zeros_like(h)
        vy = np.zeros_like(h)
        vx[:, 1:-1] = -k_field[:, 1:-1] * (h[:, 2:] - h[:, :-2]) / (2 * self.dx)
        vy[1:-1, :] = -k_field[1:-1, :] * (h[2:, :] - h[:-2, :]) / (2 * self.dy)
        vx[:, 0] = -k_field[:, 0] * (h[:, 1] - h[:, 0]) / self.dx
        vx[:, -1] = -k_field[:, -1] * (h[:, -1] - h[:, -2]) / self.dx
        vy[0, :] = -k_field[0, :] * (h[1, :] - h[0, :]) / self.dy
        vy[-1, :] = -k_field[-1, :] * (h[-1, :] - h[-2, :]) / self.dy
        return vx, vy
