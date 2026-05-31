import numpy as np
from scipy.sparse import lil_matrix, csr_matrix, coo_matrix
from scipy.sparse.linalg import spsolve
from typing import Dict, List, Tuple, Optional, Callable
from dataclasses import dataclass, field
import time
import os
import json


@dataclass
class FEMResult:
    head: np.ndarray
    pressure: np.ndarray
    velocity_x: np.ndarray
    velocity_y: np.ndarray
    velocity_magnitude: np.ndarray
    hydraulic_gradient: np.ndarray
    element_head: np.ndarray
    element_pressure: np.ndarray
    convergence_history: List[float] = field(default_factory=list)
    solve_time: float = 0.0
    num_iterations: int = 0
    converged: bool = False
    snapshots: List[Dict] = field(default_factory=list)

    def save(self, output_path: str) -> None:
        file_ext = os.path.splitext(output_path)[1].lower()

        if file_ext == '.npz':
            snapshot_data = {}
            for i, snap in enumerate(self.snapshots):
                for k, v in snap.items():
                    if isinstance(v, np.ndarray):
                        snapshot_data[f'snap_{i}_{k}'] = v
                    elif isinstance(v, (int, float)):
                        snapshot_data[f'snap_{i}_{k}'] = np.array([v])
                    elif isinstance(v, str):
                        snapshot_data[f'snap_{i}_{k}_str'] = np.array([v])

            np.savez(output_path,
                     head=self.head,
                     pressure=self.pressure,
                     velocity_x=self.velocity_x,
                     velocity_y=self.velocity_y,
                     velocity_magnitude=self.velocity_magnitude,
                     hydraulic_gradient=self.hydraulic_gradient,
                     element_head=self.element_head,
                     element_pressure=self.element_pressure,
                     convergence_history=np.array(self.convergence_history),
                     solve_time=self.solve_time,
                     num_iterations=self.num_iterations,
                     converged=self.converged,
                     num_snapshots=np.array([len(self.snapshots)]),
                     **snapshot_data)

    @classmethod
    def load(cls, input_path: str) -> 'FEMResult':
        data = np.load(input_path, allow_pickle=True)

        num_snapshots = int(data['num_snapshots'][0]) if 'num_snapshots' in data else 0
        snapshots = []
        for i in range(num_snapshots):
            snap = {}
            prefix = f'snap_{i}_'
            for key in data.files:
                if key.startswith(prefix):
                    snap_key = key[len(prefix):]
                    if snap_key.endswith('_str'):
                        continue
                    if snap_key + '_str' in data.files:
                        snap[snap_key] = str(data[key][0])
                    elif data[key].ndim == 0:
                        snap[snap_key] = float(data[key])
                    elif data[key].shape == (1,):
                        snap[snap_key] = float(data[key][0])
                    else:
                        snap[snap_key] = data[key]
            snapshots.append(snap)

        return cls(
            head=data['head'],
            pressure=data['pressure'],
            velocity_x=data['velocity_x'],
            velocity_y=data['velocity_y'],
            velocity_magnitude=data['velocity_magnitude'],
            hydraulic_gradient=data['hydraulic_gradient'],
            element_head=data['element_head'],
            element_pressure=data['element_pressure'],
            convergence_history=data['convergence_history'].tolist(),
            solve_time=float(data['solve_time']),
            num_iterations=int(data['num_iterations']),
            converged=bool(data['converged']),
            snapshots=snapshots
        )

    def to_bundle(self) -> 'SeepageResultBundle':
        return SeepageResultBundle(
            head=self.head,
            pressure=self.pressure,
            velocity_x=self.velocity_x,
            velocity_y=self.velocity_y,
            velocity_magnitude=self.velocity_magnitude,
            hydraulic_gradient=self.hydraulic_gradient,
            element_head=self.element_head,
            element_pressure=self.element_pressure,
            convergence_history=self.convergence_history,
            solve_time=self.solve_time,
            num_iterations=self.num_iterations,
            converged=self.converged
        )


@dataclass
class SeepageResultBundle:
    head: np.ndarray
    pressure: np.ndarray
    velocity_x: np.ndarray
    velocity_y: np.ndarray
    velocity_magnitude: np.ndarray
    hydraulic_gradient: np.ndarray
    element_head: np.ndarray
    element_pressure: np.ndarray
    convergence_history: List[float] = field(default_factory=list)
    solve_time: float = 0.0
    num_iterations: int = 0
    converged: bool = False

    def get_statistics(self) -> Dict[str, Dict[str, float]]:
        valid_head = self.head[np.isfinite(self.head)]
        valid_pressure = self.pressure[np.isfinite(self.pressure)]
        valid_vel = self.velocity_magnitude[np.isfinite(self.velocity_magnitude)]
        valid_grad = self.hydraulic_gradient[np.isfinite(self.hydraulic_gradient)]

        return {
            'hydraulic_head': {
                'max': float(np.max(valid_head)) if len(valid_head) > 0 else 0,
                'min': float(np.min(valid_head)) if len(valid_head) > 0 else 0,
                'mean': float(np.mean(valid_head)) if len(valid_head) > 0 else 0,
                'std': float(np.std(valid_head)) if len(valid_head) > 0 else 0
            },
            'pressure': {
                'max': float(np.max(valid_pressure) / 1000) if len(valid_pressure) > 0 else 0,
                'min': float(np.min(valid_pressure) / 1000) if len(valid_pressure) > 0 else 0,
                'mean': float(np.mean(valid_pressure) / 1000) if len(valid_pressure) > 0 else 0,
                'std': float(np.std(valid_pressure) / 1000) if len(valid_pressure) > 0 else 0
            },
            'velocity': {
                'max': float(np.max(valid_vel)) if len(valid_vel) > 0 else 0,
                'min': float(np.min(valid_vel)) if len(valid_vel) > 0 else 0,
                'mean': float(np.mean(valid_vel)) if len(valid_vel) > 0 else 0,
                'std': float(np.std(valid_vel)) if len(valid_vel) > 0 else 0
            },
            'hydraulic_gradient': {
                'max': float(np.max(valid_grad)) if len(valid_grad) > 0 else 0,
                'min': float(np.min(valid_grad)) if len(valid_grad) > 0 else 0,
                'mean': float(np.mean(valid_grad)) if len(valid_grad) > 0 else 0,
                'std': float(np.std(valid_grad)) if len(valid_grad) > 0 else 0
            }
        }

    def save(self, output_path: str) -> None:
        np.savez(output_path,
                 head=self.head,
                 pressure=self.pressure,
                 velocity_x=self.velocity_x,
                 velocity_y=self.velocity_y,
                 velocity_magnitude=self.velocity_magnitude,
                 hydraulic_gradient=self.hydraulic_gradient,
                 element_head=self.element_head,
                 element_pressure=self.element_pressure,
                 convergence_history=np.array(self.convergence_history),
                 solve_time=self.solve_time,
                 num_iterations=self.num_iterations,
                 converged=self.converged)

    @classmethod
    def load(cls, input_path: str) -> 'SeepageResultBundle':
        data = np.load(input_path, allow_pickle=True)
        return cls(
            head=data['head'],
            pressure=data['pressure'],
            velocity_x=data['velocity_x'],
            velocity_y=data['velocity_y'],
            velocity_magnitude=data['velocity_magnitude'],
            hydraulic_gradient=data['hydraulic_gradient'],
            element_head=data['element_head'],
            element_pressure=data['element_pressure'],
            convergence_history=data['convergence_history'].tolist(),
            solve_time=float(data['solve_time']),
            num_iterations=int(data['num_iterations']),
            converged=bool(data['converged'])
        )


class FEMSolver:
    def __init__(self, params_parser, mesh_data):
        self.params = params_parser
        self.mesh = mesh_data
        self.result: Optional[FEMResult] = None

        self.gravity = 9.81
        self.water_density = 1000.0

        self.K_global = None
        self.F_global = None
        self.boundary_dofs = {}

        self._snapshot_interval = 0
        self._snapshot_dir = ''
        self._snapshots: List[Dict] = []

    def enable_snapshots(self, interval: int = 1, snapshot_dir: str = '') -> None:
        self._snapshot_interval = max(1, interval)
        self._snapshot_dir = snapshot_dir
        self._snapshots = []
        if snapshot_dir:
            os.makedirs(snapshot_dir, exist_ok=True)

    def _save_snapshot(self, step: int, head: np.ndarray, tag: str = '') -> None:
        snapshot = {
            'step': step,
            'head': head.copy(),
            'tag': tag,
            'time': time.time()
        }
        self._snapshots.append(snapshot)

        if self._snapshot_dir:
            path = os.path.join(self._snapshot_dir, f'snapshot_{step:06d}.npz')
            np.savez(path, head=head, step=np.array([step]))

    def _shape_function(self, xi: float, eta: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        N = np.array([
            0.25 * (1 - xi) * (1 - eta),
            0.25 * (1 + xi) * (1 - eta),
            0.25 * (1 + xi) * (1 + eta),
            0.25 * (1 - xi) * (1 + eta)
        ])

        dN_dxi = np.array([
            -0.25 * (1 - eta),
            0.25 * (1 - eta),
            0.25 * (1 + eta),
            -0.25 * (1 + eta)
        ])

        dN_deta = np.array([
            -0.25 * (1 - xi),
            -0.25 * (1 + xi),
            0.25 * (1 + xi),
            0.25 * (1 - xi)
        ])

        return N, dN_dxi, dN_deta

    def _gauss_quadrature_2d(self, order: int = 2) -> Tuple[np.ndarray, np.ndarray]:
        if order == 1:
            points = np.array([[0.0, 0.0]])
            weights = np.array([4.0])
        elif order == 2:
            xi = 1.0 / np.sqrt(3)
            points = np.array([
                [-xi, -xi],
                [xi, -xi],
                [xi, xi],
                [-xi, xi]
            ])
            weights = np.array([1.0, 1.0, 1.0, 1.0])
        elif order == 3:
            xi = np.sqrt(0.6)
            points = np.array([
                [-xi, -xi],
                [0.0, -xi],
                [xi, -xi],
                [-xi, 0.0],
                [0.0, 0.0],
                [xi, 0.0],
                [-xi, xi],
                [0.0, xi],
                [xi, xi]
            ])
            w1 = 5.0 / 9.0
            w2 = 8.0 / 9.0
            weights = np.array([w1*w1, w2*w1, w1*w1, w1*w2, w2*w2, w1*w2, w1*w1, w2*w1, w1*w1])
        else:
            raise ValueError(f"不支持的高斯积分阶数: {order}")

        return points, weights

    def _compute_element_matrix(self, element_nodes: np.ndarray,
                                kx: float, ky: float) -> Tuple[np.ndarray, np.ndarray]:
        gauss_points, gauss_weights = self._gauss_quadrature_2d(2)

        num_nodes = len(element_nodes)
        Ke = np.zeros((num_nodes, num_nodes))
        Fe = np.zeros(num_nodes)

        for gp, weight in zip(gauss_points, gauss_weights):
            xi, eta = gp
            N, dN_dxi, dN_deta = self._shape_function(xi, eta)

            J = np.zeros((2, 2))
            for i in range(num_nodes):
                J[0, 0] += dN_dxi[i] * element_nodes[i, 0]
                J[0, 1] += dN_dxi[i] * element_nodes[i, 1]
                J[1, 0] += dN_deta[i] * element_nodes[i, 0]
                J[1, 1] += dN_deta[i] * element_nodes[i, 1]

            detJ = np.linalg.det(J)
            if detJ <= 0:
                raise ValueError(f"雅可比行列式非正: {detJ}")

            J_inv = np.linalg.inv(J)

            dN_dx = np.zeros(num_nodes)
            dN_dy = np.zeros(num_nodes)
            for i in range(num_nodes):
                dN_dx[i] = J_inv[0, 0] * dN_dxi[i] + J_inv[0, 1] * dN_deta[i]
                dN_dy[i] = J_inv[1, 0] * dN_dxi[i] + J_inv[1, 1] * dN_deta[i]

            B = np.zeros((2, num_nodes))
            B[0, :] = dN_dx
            B[1, :] = dN_dy

            K_material = np.array([[kx, 0], [0, ky]])

            Ke += weight * detJ * (B.T @ K_material @ B)

        return Ke, Fe

    def _assemble_global_system(self) -> None:
        num_nodes = self.mesh.num_nodes
        num_elements = self.mesh.num_elements

        rows = []
        cols = []
        vals = []
        self.F_global = np.zeros(num_nodes)

        for elem_idx in range(num_elements):
            elem_nodes = self.mesh.elements[elem_idx]
            coords = self.mesh.nodes[elem_nodes]

            mat_idx = self.mesh.element_materials[elem_idx]
            if mat_idx < len(self.params.soil_layers):
                layer = self.params.soil_layers[mat_idx]
                kx = layer.permeability_x
                ky = layer.permeability_y
            else:
                kx, ky = 1e-6, 1e-6

            Ke, Fe = self._compute_element_matrix(coords, kx, ky)

            for i, node_i in enumerate(elem_nodes):
                self.F_global[node_i] += Fe[i]
                for j, node_j in enumerate(elem_nodes):
                    rows.append(node_i)
                    cols.append(node_j)
                    vals.append(Ke[i, j])

        self.K_global = coo_matrix((vals, (rows, cols)), shape=(num_nodes, num_nodes)).tocsr()

    def _apply_boundary_conditions(self) -> None:
        geom = self.params.dam_geometry
        if geom is None:
            return

        bc_dict = {}

        for bc in self.params.boundary_conditions:
            if bc.type == 'head':
                boundary_name = bc.location
                if boundary_name in self.mesh.boundary_nodes:
                    node_indices = self.mesh.boundary_nodes[boundary_name]
                    for node_idx in node_indices:
                        if isinstance(bc.value, (int, float)):
                            bc_dict[node_idx] = bc.value
                        else:
                            x, y = self.mesh.nodes[node_idx]
                            bc_dict[node_idx] = bc.value[0] if bc.value else y

        if len(bc_dict) == 0:
            H = geom.reservoir_water_level
            h = geom.dam_height
            m1 = geom.upstream_slope
            tolerance = self.mesh.mesh_size * 0.6

            for i, (x, y) in enumerate(self.mesh.nodes):
                expected_x = m1 * y
                if abs(x - expected_x) < tolerance and y > 0 and y <= h:
                    bc_dict[i] = H

        if len(bc_dict) == 0:
            raise ValueError("未找到任何边界条件节点，无法进行求解")

        fixed_dofs = np.array(list(bc_dict.keys()), dtype=int)
        fixed_values = np.array([bc_dict[dof] for dof in fixed_dofs], dtype=float)

        diag = self.K_global.diagonal()
        isolated_nodes = np.where(diag == 0)[0]

        for node in isolated_nodes:
            if node not in bc_dict:
                x, y = self.mesh.nodes[node]
                bc_dict[node] = y

        fixed_dofs = np.array(list(bc_dict.keys()), dtype=int)
        fixed_values = np.array([bc_dict[dof] for dof in fixed_dofs], dtype=float)

        F_modified = self.F_global.copy()
        for i, dof in enumerate(fixed_dofs):
            col = self.K_global[:, dof].toarray().flatten()
            F_modified -= col * fixed_values[i]

        all_dofs = np.arange(self.mesh.num_nodes)
        free_dofs = np.setdiff1d(all_dofs, fixed_dofs)

        if len(free_dofs) == 0:
            raise ValueError("所有节点都被约束，没有自由自由度")

        self.K_reduced = self.K_global[free_dofs][:, free_dofs]
        self.F_reduced = F_modified[free_dofs]
        self.free_dofs = free_dofs
        self.fixed_dofs = fixed_dofs
        self.fixed_values = fixed_values

    def solve_steady_state(self, progress_callback: Optional[Callable[[int, int, float], None]] = None) -> FEMResult:
        start_time = time.time()

        self._assemble_global_system()
        self._apply_boundary_conditions()

        if progress_callback:
            progress_callback(50, 100, 0.5)

        head_reduced = spsolve(self.K_reduced, self.F_reduced)

        head_full = np.zeros(self.mesh.num_nodes)
        head_full[self.free_dofs] = head_reduced

        if len(self.fixed_dofs) > 0:
            head_full[self.fixed_dofs] = self.fixed_values

        if self._snapshot_interval > 0:
            self._save_snapshot(0, head_full, 'steady_state_solved')

        pressure = self._compute_pressure(head_full)
        velocity_x, velocity_y, velocity_mag = self._compute_velocity(head_full)
        hydraulic_gradient = self._compute_hydraulic_gradient(head_full)

        element_head = self._compute_element_average(head_full)
        element_pressure = self._compute_element_average(pressure)

        solve_time = time.time() - start_time

        self.result = FEMResult(
            head=head_full,
            pressure=pressure,
            velocity_x=velocity_x,
            velocity_y=velocity_y,
            velocity_magnitude=velocity_mag,
            hydraulic_gradient=hydraulic_gradient,
            element_head=element_head,
            element_pressure=element_pressure,
            convergence_history=[0.0],
            solve_time=solve_time,
            num_iterations=1,
            converged=True,
            snapshots=list(self._snapshots)
        )

        if progress_callback:
            progress_callback(100, 100, 1.0)

        return self.result

    def solve_transient(self, progress_callback: Optional[Callable[[int, int, float], None]] = None) -> FEMResult:
        start_time = time.time()

        sim_params = self.params.simulation_params
        dt = sim_params.time_step
        total_time = sim_params.total_time
        num_steps = max(1, int(total_time / dt))
        tol = sim_params.convergence_tolerance
        max_iter = max(1, sim_params.max_iterations)

        self._assemble_global_system()
        self._apply_boundary_conditions()

        head = np.zeros(self.mesh.num_nodes)
        if len(self.fixed_dofs) > 0:
            head[self.fixed_dofs] = self.fixed_values

        convergence_history = []
        all_converged = True

        M = self._build_mass_matrix()

        M_reduced = M[self.free_dofs][:, self.free_dofs]
        K_reduced = self.K_reduced
        F_reduced = self.F_reduced

        A_system = M_reduced + dt * K_reduced

        if self._snapshot_interval > 0:
            self._save_snapshot(0, head, 'initial')

        for step in range(num_steps):
            head_old = head.copy()

            if progress_callback:
                progress = (step + 1) / num_steps
                progress_callback(step + 1, num_steps, progress)

            head_free_old = head_old[self.free_dofs]
            b_system = M_reduced @ head_free_old + dt * F_reduced

            step_converged = False

            for it in range(max_iter):
                try:
                    head_free_new = spsolve(A_system, b_system)
                except Exception as e:
                    print(f"警告: 时间步 {step+1}, 迭代 {it+1} 求解失败: {e}")
                    break

                if np.any(np.isnan(head_free_new)) or np.any(np.isinf(head_free_new)):
                    print(f"警告: 时间步 {step+1}, 迭代 {it+1} 结果包含非有限值")
                    break

                head_new = head.copy()
                head_new[self.free_dofs] = head_free_new

                if len(self.fixed_dofs) > 0:
                    head_new[self.fixed_dofs] = self.fixed_values

                residual = np.linalg.norm(head_new - head)
                rel_residual = residual / (np.linalg.norm(head_new) + 1e-10)
                convergence_history.append(float(residual))

                if rel_residual < tol:
                    head = head_new
                    step_converged = True
                    break

                head = head_new
                b_system = M_reduced @ head[self.free_dofs] + dt * F_reduced

            if not step_converged:
                all_converged = False
                print(f"警告: 时间步 {step+1} 未在 {max_iter} 次迭代内收敛")

            if self._snapshot_interval > 0 and (step + 1) % self._snapshot_interval == 0:
                self._save_snapshot(step + 1, head, f'step_{step+1}')

        pressure = self._compute_pressure(head)
        velocity_x, velocity_y, velocity_mag = self._compute_velocity(head)
        hydraulic_gradient = self._compute_hydraulic_gradient(head)

        element_head = self._compute_element_average(head)
        element_pressure = self._compute_element_average(pressure)

        solve_time = time.time() - start_time

        converged = all_converged
        if convergence_history:
            final_residual = convergence_history[-1]
            if final_residual < tol:
                converged = True

        self.result = FEMResult(
            head=head,
            pressure=pressure,
            velocity_x=velocity_x,
            velocity_y=velocity_y,
            velocity_magnitude=velocity_mag,
            hydraulic_gradient=hydraulic_gradient,
            element_head=element_head,
            element_pressure=element_pressure,
            convergence_history=convergence_history,
            solve_time=solve_time,
            num_iterations=len(convergence_history),
            converged=converged,
            snapshots=list(self._snapshots)
        )

        return self.result

    def _build_mass_matrix(self) -> csr_matrix:
        num_nodes = self.mesh.num_nodes

        gauss_points, gauss_weights = self._gauss_quadrature_2d(2)

        rows = []
        cols = []
        vals = []

        for elem_idx in range(self.mesh.num_elements):
            elem_nodes = self.mesh.elements[elem_idx]
            coords = self.mesh.nodes[elem_nodes]

            mat_idx = self.mesh.element_materials[elem_idx]
            if mat_idx < len(self.params.soil_layers):
                porosity = self.params.soil_layers[mat_idx].porosity
            else:
                porosity = 0.35

            Me = np.zeros((4, 4))

            for gp, weight in zip(gauss_points, gauss_weights):
                xi, eta = gp
                N, dN_dxi, dN_deta = self._shape_function(xi, eta)

                J = np.zeros((2, 2))
                for i in range(4):
                    J[0, 0] += dN_dxi[i] * coords[i, 0]
                    J[0, 1] += dN_dxi[i] * coords[i, 1]
                    J[1, 0] += dN_deta[i] * coords[i, 0]
                    J[1, 1] += dN_deta[i] * coords[i, 1]

                detJ = np.linalg.det(J)

                Me += weight * detJ * porosity * np.outer(N, N)

            for i, node_i in enumerate(elem_nodes):
                for j, node_j in enumerate(elem_nodes):
                    rows.append(node_i)
                    cols.append(node_j)
                    vals.append(Me[i, j])

        return coo_matrix((vals, (rows, cols)), shape=(num_nodes, num_nodes)).tocsr()

    def _compute_pressure(self, head: np.ndarray) -> np.ndarray:
        y_coords = self.mesh.nodes[:, 1]
        pressure = self.water_density * self.gravity * (head - y_coords)
        return pressure

    def _compute_velocity(self, head: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        velocity_x = np.zeros(self.mesh.num_elements)
        velocity_y = np.zeros(self.mesh.num_elements)

        all_elem_nodes = self.mesh.elements
        all_coords = self.mesh.nodes[all_elem_nodes]
        all_head = head[all_elem_nodes]

        gp = np.array([0.0, 0.0])
        _, dN_dxi, dN_deta = self._shape_function(gp[0], gp[1])

        for elem_idx in range(self.mesh.num_elements):
            coords = all_coords[elem_idx]
            head_elem = all_head[elem_idx]

            mat_idx = self.mesh.element_materials[elem_idx]
            if mat_idx < len(self.params.soil_layers):
                layer = self.params.soil_layers[mat_idx]
                kx = layer.permeability_x
                ky = layer.permeability_y
            else:
                kx, ky = 1e-6, 1e-6

            J = np.zeros((2, 2))
            for i in range(4):
                J[0, 0] += dN_dxi[i] * coords[i, 0]
                J[0, 1] += dN_dxi[i] * coords[i, 1]
                J[1, 0] += dN_deta[i] * coords[i, 0]
                J[1, 1] += dN_deta[i] * coords[i, 1]

            J_inv = np.linalg.inv(J)

            dN_dx = np.zeros(4)
            dN_dy = np.zeros(4)
            for i in range(4):
                dN_dx[i] = J_inv[0, 0] * dN_dxi[i] + J_inv[0, 1] * dN_deta[i]
                dN_dy[i] = J_inv[1, 0] * dN_dxi[i] + J_inv[1, 1] * dN_deta[i]

            dh_dx = np.sum(dN_dx * head_elem)
            dh_dy = np.sum(dN_dy * head_elem)

            velocity_x[elem_idx] = -kx * dh_dx
            velocity_y[elem_idx] = -ky * dh_dy

        velocity_mag = np.sqrt(velocity_x ** 2 + velocity_y ** 2)

        node_vx = np.zeros(self.mesh.num_nodes)
        node_vy = np.zeros(self.mesh.num_nodes)
        count = np.zeros(self.mesh.num_nodes)

        for elem_idx in range(self.mesh.num_elements):
            for node_idx in self.mesh.elements[elem_idx]:
                node_vx[node_idx] += velocity_x[elem_idx]
                node_vy[node_idx] += velocity_y[elem_idx]
                count[node_idx] += 1

        count_safe = np.where(count > 0, count, 1.0)
        node_vx = node_vx / count_safe
        node_vy = node_vy / count_safe
        node_vmag = np.sqrt(node_vx ** 2 + node_vy ** 2)

        return node_vx, node_vy, node_vmag

    def _compute_hydraulic_gradient(self, head: np.ndarray) -> np.ndarray:
        gradient = np.zeros(self.mesh.num_nodes)

        gp = np.array([0.0, 0.0])
        _, dN_dxi, dN_deta = self._shape_function(gp[0], gp[1])

        for elem_idx in range(self.mesh.num_elements):
            elem_nodes = self.mesh.elements[elem_idx]
            coords = self.mesh.nodes[elem_nodes]
            head_elem = head[elem_nodes]

            J = np.zeros((2, 2))
            for i in range(4):
                J[0, 0] += dN_dxi[i] * coords[i, 0]
                J[0, 1] += dN_dxi[i] * coords[i, 1]
                J[1, 0] += dN_deta[i] * coords[i, 0]
                J[1, 1] += dN_deta[i] * coords[i, 1]

            J_inv = np.linalg.inv(J)

            dN_dx = np.zeros(4)
            dN_dy = np.zeros(4)
            for i in range(4):
                dN_dx[i] = J_inv[0, 0] * dN_dxi[i] + J_inv[0, 1] * dN_deta[i]
                dN_dy[i] = J_inv[1, 0] * dN_dxi[i] + J_inv[1, 1] * dN_deta[i]

            dh_dx = np.sum(dN_dx * head_elem)
            dh_dy = np.sum(dN_dy * head_elem)

            grad_mag = np.sqrt(dh_dx ** 2 + dh_dy ** 2)

            for node_idx in elem_nodes:
                gradient[node_idx] += grad_mag / 4.0

        return gradient

    def _compute_element_average(self, node_values: np.ndarray) -> np.ndarray:
        element_values = np.zeros(self.mesh.num_elements)

        for elem_idx in range(self.mesh.num_elements):
            elem_nodes = self.mesh.elements[elem_idx]
            element_values[elem_idx] = np.mean(node_values[elem_nodes])

        return element_values

    def get_result_summary(self) -> Dict[str, float]:
        if self.result is None:
            raise ValueError("计算结果不存在，请先执行求解")

        return {
            'max_head': np.max(self.result.head),
            'min_head': np.min(self.result.head),
            'avg_head': np.mean(self.result.head),
            'max_pressure': np.max(self.result.pressure),
            'min_pressure': np.min(self.result.pressure),
            'avg_pressure': np.mean(self.result.pressure),
            'max_velocity': np.max(self.result.velocity_magnitude),
            'min_velocity': np.min(self.result.velocity_magnitude),
            'avg_velocity': np.mean(self.result.velocity_magnitude),
            'max_gradient': np.max(self.result.hydraulic_gradient),
            'min_gradient': np.min(self.result.hydraulic_gradient),
            'avg_gradient': np.mean(self.result.hydraulic_gradient),
            'solve_time': self.result.solve_time,
            'num_iterations': self.result.num_iterations,
            'converged': self.result.converged
        }

    def export_to_vtk(self, output_path: str) -> None:
        if self.result is None:
            raise ValueError("计算结果不存在，请先执行求解")

        nodes = self.mesh.nodes
        elements = self.mesh.elements

        with open(output_path, 'w') as f:
            f.write("# vtk DataFile Version 3.0\n")
            f.write("Dam Seepage FEM Results\n")
            f.write("ASCII\n")
            f.write("DATASET UNSTRUCTURED_GRID\n")

            f.write(f"POINTS {len(nodes)} float\n")
            for node in nodes:
                f.write(f"{node[0]} {node[1]} 0.0\n")

            f.write(f"CELLS {len(elements)} {len(elements) * 5}\n")
            for elem in elements:
                f.write(f"4 {elem[0]} {elem[1]} {elem[2]} {elem[3]}\n")

            f.write(f"CELL_TYPES {len(elements)}\n")
            for _ in elements:
                f.write("9\n")

            f.write(f"POINT_DATA {len(nodes)}\n")

            f.write("SCALARS hydraulic_head float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for h in self.result.head:
                f.write(f"{h}\n")

            f.write("SCALARS pressure float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for p in self.result.pressure:
                f.write(f"{p}\n")

            f.write("VECTORS velocity float\n")
            for vx, vy in zip(self.result.velocity_x, self.result.velocity_y):
                f.write(f"{vx} {vy} 0.0\n")

            f.write("SCALARS hydraulic_gradient float 1\n")
            f.write("LOOKUP_TABLE default\n")
            for g in self.result.hydraulic_gradient:
                f.write(f"{g}\n")
