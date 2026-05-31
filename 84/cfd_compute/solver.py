from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import time
from config import CFDConfig, GridConfig, SimulationConfig, ShardInfo, BoundaryCondition
from .kernels import (
    compute_convective_term,
    compute_diffusive_term,
    compute_poisson_rhs,
    pressure_poisson_jacobi,
    compute_vorticity,
    compute_kinetic_energy,
    pressure_correction
)
from .boundary_conditions import apply_all_boundaries
from .checkpoint import CheckpointManager


def _apply_boundary_conditions_shard(u: np.ndarray, v: np.ndarray, p: np.ndarray,
                                     shard: ShardInfo, grid_config: GridConfig,
                                     dx: float, dy: float,
                                     bc_values: Optional[Dict[str, float]] = None) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    bc_x = grid_config.bc_x
    bc_y = grid_config.bc_y
    u_result = u.copy()
    v_result = v.copy()
    p_result = p.copy()
    if shard.has_left:
        pass
    else:
        if bc_x == BoundaryCondition.PERIODIC:
            u_result[0, :] = u_result[-2, :]
            v_result[0, :] = v_result[-2, :]
            p_result[0, :] = p_result[-2, :]
        elif bc_x == BoundaryCondition.DIRICHLET:
            bc_values = bc_values or {}
            u_left = bc_values.get('u_left', 0.0)
            v_left = bc_values.get('v_left', 0.0)
            p_left = bc_values.get('p_left', 0.0)
            u_result[0, :] = u_left
            v_result[0, :] = v_left
            p_result[0, :] = p_left
        elif bc_x == BoundaryCondition.NO_SLIP:
            u_result[0, :] = 0.0
            v_result[0, :] = 0.0
            p_result[0, :] = p_result[1, :]
        elif bc_x == BoundaryCondition.NEUMANN:
            u_result[0, :] = u_result[1, :]
            v_result[0, :] = v_result[1, :]
            p_result[0, :] = p_result[1, :]
    if shard.has_right:
        pass
    else:
        if bc_x == BoundaryCondition.PERIODIC:
            u_result[-1, :] = u_result[1, :]
            v_result[-1, :] = v_result[1, :]
            p_result[-1, :] = p_result[1, :]
        elif bc_x == BoundaryCondition.DIRICHLET:
            bc_values = bc_values or {}
            u_right = bc_values.get('u_right', 0.0)
            v_right = bc_values.get('v_right', 0.0)
            p_right = bc_values.get('p_right', 0.0)
            u_result[-1, :] = u_right
            v_result[-1, :] = v_right
            p_result[-1, :] = p_right
        elif bc_x == BoundaryCondition.NO_SLIP:
            u_result[-1, :] = 0.0
            v_result[-1, :] = 0.0
            p_result[-1, :] = p_result[-2, :]
        elif bc_x == BoundaryCondition.NEUMANN:
            u_result[-1, :] = u_result[-2, :]
            v_result[-1, :] = v_result[-2, :]
            p_result[-1, :] = p_result[-2, :]
    if not shard.has_bottom:
        if bc_y == BoundaryCondition.PERIODIC:
            u_result[:, 0] = u_result[:, -2]
            v_result[:, 0] = v_result[:, -2]
            p_result[:, 0] = p_result[:, -2]
        elif bc_y == BoundaryCondition.DIRICHLET:
            bc_values = bc_values or {}
            u_bottom = bc_values.get('u_bottom', 0.0)
            v_bottom = bc_values.get('v_bottom', 0.0)
            p_bottom = bc_values.get('p_bottom', 0.0)
            u_result[:, 0] = u_bottom
            v_result[:, 0] = v_bottom
            p_result[:, 0] = p_bottom
        elif bc_y == BoundaryCondition.NO_SLIP:
            u_result[:, 0] = 0.0
            v_result[:, 0] = 0.0
            p_result[:, 0] = p_result[:, 1]
        elif bc_y == BoundaryCondition.NEUMANN:
            u_result[:, 0] = u_result[:, 1]
            v_result[:, 0] = v_result[:, 1]
            p_result[:, 0] = p_result[:, 1]
    if not shard.has_top:
        if bc_y == BoundaryCondition.PERIODIC:
            u_result[:, -1] = u_result[:, 1]
            v_result[:, -1] = v_result[:, 1]
            p_result[:, -1] = p_result[:, 1]
        elif bc_y == BoundaryCondition.DIRICHLET:
            bc_values = bc_values or {}
            u_top = bc_values.get('u_top', 0.0)
            v_top = bc_values.get('v_top', 0.0)
            p_top = bc_values.get('p_top', 0.0)
            u_result[:, -1] = u_top
            v_result[:, -1] = v_top
            p_result[:, -1] = p_top
        elif bc_y == BoundaryCondition.NO_SLIP:
            u_result[:, -1] = 0.0
            v_result[:, -1] = 0.0
            p_result[:, -1] = p_result[:, -2]
        elif bc_y == BoundaryCondition.NEUMANN:
            u_result[:, -1] = u_result[:, -2]
            v_result[:, -1] = v_result[:, -2]
            p_result[:, -1] = p_result[:, -2]
    return u_result, v_result, p_result


def solve_shard(u_shard: np.ndarray, v_shard: np.ndarray, p_shard: np.ndarray,
                shard: ShardInfo, grid_config: GridConfig, sim_config: SimulationConfig,
                iterations: int, start_iteration: int = 0,
                save_interval: int = 10) -> Dict[str, Any]:
    dx = grid_config.dx
    dy = grid_config.dy
    dt = sim_config.dt
    nu = sim_config.nu
    rho = sim_config.rho
    u = u_shard.copy()
    v = v_shard.copy()
    p = p_shard.copy()
    saved_data = []
    start_time = time.time()
    for iter_idx in range(iterations):
        current_iter = start_iteration + iter_idx
        u, v, p = _apply_boundary_conditions_shard(u, v, p, shard, grid_config, dx, dy)
        conv_u = compute_convective_term(u, v, u, dx, dy)
        conv_v = compute_convective_term(u, v, v, dx, dy)
        diff_u = compute_diffusive_term(u, nu, dx, dy)
        diff_v = compute_diffusive_term(v, nu, dx, dy)
        u_star = u + dt * (conv_u + diff_u)
        v_star = v + dt * (conv_v + diff_v)
        rhs = compute_poisson_rhs(u_star, v_star, rho, dx, dy)
        p = pressure_poisson_jacobi(p, rhs, dx, dy, max_iter=30)
        u_new = np.zeros_like(u)
        v_new = np.zeros_like(v)
        p_new = p.copy()
        pressure_correction(u_star, v_star, p, u_new, v_new, p_new, rho, dx, dt)
        u = u_new
        v = v_new
        u, v, p = _apply_boundary_conditions_shard(u, v, p, shard, grid_config, dx, dy)
        if (iter_idx + 1) % save_interval == 0:
            vorticity = compute_vorticity(u, v, dx, dy)
            ke = compute_kinetic_energy(u, v)
            saved_data.append({
                'iteration': current_iter + 1,
                'u': u.copy(),
                'v': v.copy(),
                'p': p.copy(),
                'vorticity': vorticity,
                'kinetic_energy': ke,
                'time': current_iter * dt
            })
    elapsed = time.time() - start_time
    return {
        'shard_id': shard.shard_id,
        'u_final': u,
        'v_final': v,
        'p_final': p,
        'saved_data': saved_data,
        'iterations': iterations,
        'start_iteration': start_iteration,
        'elapsed_time': elapsed,
        'iterations_per_second': iterations / elapsed if elapsed > 0 else 0
    }


class NavierStokesSolver:
    def __init__(self, config: CFDConfig, checkpoint_manager: Optional[CheckpointManager] = None,
                 checkpoint_interval: int = 50):
        self.config = config
        self.grid_config = config.grid
        self.sim_config = config.sim
        self.dx = self.grid_config.dx
        self.dy = self.grid_config.dy
        self.checkpoint_manager = checkpoint_manager or CheckpointManager(save_interval=checkpoint_interval)

    def step(self, u: np.ndarray, v: np.ndarray, p: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        dt = self.sim_config.dt
        nu = self.sim_config.nu
        rho = self.sim_config.rho
        u, v, p = apply_all_boundaries(u, v, p, 
                                       self.grid_config.bc_x, self.grid_config.bc_y,
                                       self.dx, self.dy)
        conv_u = compute_convective_term(u, v, u, self.dx, self.dy)
        conv_v = compute_convective_term(u, v, v, self.dx, self.dy)
        diff_u = compute_diffusive_term(u, nu, self.dx, self.dy)
        diff_v = compute_diffusive_term(v, nu, self.dx, self.dy)
        u_star = u + dt * (conv_u + diff_u)
        v_star = v + dt * (conv_v + diff_v)
        rhs = compute_poisson_rhs(u_star, v_star, rho, self.dx, self.dy)
        p = pressure_poisson_jacobi(p, rhs, self.dx, self.dy, max_iter=30)
        u_new = np.zeros_like(u)
        v_new = np.zeros_like(v)
        p_new = p.copy()
        pressure_correction(u_star, v_star, p, u_new, v_new, p_new, rho, self.dx, dt)
        u_new, v_new, p = apply_all_boundaries(u_new, v_new, p,
                                                self.grid_config.bc_x, self.grid_config.bc_y,
                                                self.dx, self.dy)
        return u_new, v_new, p

    def solve(self, u: np.ndarray, v: np.ndarray, p: np.ndarray,
              n_iterations: int, save_interval: int = 10,
              task_id: Optional[str] = None,
              resume_from: int = 0) -> Dict[str, Any]:
        results = {
            'final_u': u.copy(),
            'final_v': v.copy(),
            'final_p': p.copy(),
            'history': [],
            'total_time': 0.0,
            'iterations': n_iterations,
            'resumed_from': resume_from
        }
        start_time = time.time()
        current_u = u.copy()
        current_v = v.copy()
        current_p = p.copy()
        for iteration in range(resume_from, n_iterations):
            current_u, current_v, current_p = self.step(current_u, current_v, current_p)
            if (iteration + 1) % save_interval == 0:
                vorticity = compute_vorticity(current_u, current_v, self.dx, self.dy)
                ke = compute_kinetic_energy(current_u, current_v)
                results['history'].append({
                    'iteration': iteration + 1,
                    'u': current_u.copy(),
                    'v': current_v.copy(),
                    'p': current_p.copy(),
                    'vorticity': vorticity,
                    'kinetic_energy': ke,
                    'time': (iteration + 1) * self.sim_config.dt
                })
            if task_id and self.checkpoint_manager.should_checkpoint(iteration + 1):
                self.checkpoint_manager.save(
                    task_id=task_id, iteration=iteration + 1,
                    total_iterations=n_iterations,
                    u=current_u, v=current_v, p=current_p,
                    elapsed_time=time.time() - start_time,
                    dt=self.sim_config.dt, nu=self.sim_config.nu,
                    grid_nx=self.grid_config.nx, grid_ny=self.grid_config.ny,
                    metrics={'kinetic_energy': float(compute_kinetic_energy(current_u, current_v))}
                )
        results['final_u'] = current_u
        results['final_v'] = current_v
        results['final_p'] = current_p
        results['total_time'] = time.time() - start_time
        if task_id:
            self.checkpoint_manager.mark_completed(task_id)
        return results

    def resume(self, task_id: str, n_iterations: Optional[int] = None,
               save_interval: int = 10) -> Optional[Dict[str, Any]]:
        checkpoint = self.checkpoint_manager.load(task_id)
        if checkpoint is None:
            return None
        meta = checkpoint['metadata']
        total = n_iterations or meta.total_iterations
        return self.solve(
            u=checkpoint['u'], v=checkpoint['v'], p=checkpoint['p'],
            n_iterations=total, save_interval=save_interval,
            task_id=task_id, resume_from=checkpoint['resume_from']
        )
