import numpy as np
from numba import jit, prange
from typing import Dict, List, Optional, Callable, Tuple
from dataclasses import dataclass, field
import time
import logging

from .config import SimulationConfig
from .visualization import RealtimeProgressVisualizer, RealtimeVisualizerConfig
from .validation import SimulationValidator, ValidationLevel, print_validation_report

logger = logging.getLogger(__name__)


@dataclass
class ParticleData:
    positions: np.ndarray = None
    velocities: np.ndarray = None
    accelerations: np.ndarray = None
    forces: np.ndarray = None
    torques: np.ndarray = None
    angular_velocities: np.ndarray = None
    diameters: np.ndarray = None
    densities: np.ndarray = None
    masses: np.ndarray = None
    ids: np.ndarray = None
    
    def initialize(self, count: int):
        self.positions = np.zeros((count, 3), dtype=np.float64)
        self.velocities = np.zeros((count, 3), dtype=np.float64)
        self.accelerations = np.zeros((count, 3), dtype=np.float64)
        self.forces = np.zeros((count, 3), dtype=np.float64)
        self.torques = np.zeros((count, 3), dtype=np.float64)
        self.angular_velocities = np.zeros((count, 3), dtype=np.float64)
        self.diameters = np.zeros(count, dtype=np.float64)
        self.densities = np.zeros(count, dtype=np.float64)
        self.masses = np.zeros(count, dtype=np.float64)
        self.ids = np.arange(count, dtype=np.int32)


@dataclass
class SpatialGrid:
    cell_size: float
    grid_shape: Tuple[int, int, int]
    domain_min: np.ndarray
    domain_max: np.ndarray
    cell_start: np.ndarray = None
    cell_end: np.ndarray = None
    particle_cell_ids: np.ndarray = None
    sorted_indices: np.ndarray = None


@dataclass
class FluidData:
    velocity: np.ndarray = None
    pressure: np.ndarray = None
    density: np.ndarray = None
    viscosity: np.ndarray = None
    volume_fraction: np.ndarray = None
    grid_shape: Tuple[int, int, int] = (10, 10, 10)
    
    def initialize(self, grid_shape: Tuple[int, int, int]):
        self.grid_shape = grid_shape
        nx, ny, nz = grid_shape
        self.velocity = np.zeros((nx, ny, nz, 3), dtype=np.float64)
        self.pressure = np.zeros((nx, ny, nz), dtype=np.float64)
        self.density = np.ones((nx, ny, nz), dtype=np.float64) * 1000.0
        self.viscosity = np.ones((nx, ny, nz), dtype=np.float64) * 1.0e-3
        self.volume_fraction = np.ones((nx, ny, nz), dtype=np.float64)


@dataclass
class SimulationState:
    current_time: float = 0.0
    current_step: int = 0
    total_steps: int = 0
    is_running: bool = False
    is_paused: bool = False
    particle_data: ParticleData = field(default_factory=ParticleData)
    fluid_data: FluidData = field(default_factory=FluidData)
    collision_count: int = 0
    energy_kinetic: float = 0.0
    energy_potential: float = 0.0
    config: Optional[SimulationConfig] = None


@jit(nopython=True, parallel=True)
def compute_gravity_forces_vectorized(
    masses: np.ndarray,
    gravity: np.ndarray,
    forces: np.ndarray
) -> None:
    n = len(masses)
    for i in prange(n):
        forces[i, 0] = masses[i] * gravity[0]
        forces[i, 1] = masses[i] * gravity[1]
        forces[i, 2] = masses[i] * gravity[2]


@jit(nopython=True)
def compute_drag_force_single(
    rel_vel: np.ndarray,
    diameter: float,
    viscosity: float,
    fluid_density: float,
    volume_fraction: float
) -> np.ndarray:
    rel_speed_sq = rel_vel[0]**2 + rel_vel[1]**2 + rel_vel[2]**2
    rel_speed = np.sqrt(rel_speed_sq)
    
    if rel_speed < 1e-10:
        return np.zeros(3)
    
    re = fluid_density * rel_speed * diameter / viscosity
    
    if volume_fraction > 0.99:
        cd = 24.0 / re if re > 0.1 else 240.0
    else:
        eps = volume_fraction
        re_eps = re * eps**0.687
        cd = 24.0 / (re * eps**2.65) * (1.0 + 0.15 * re_eps**0.687)
    
    area = np.pi * (diameter / 2.0)**2
    drag_mag = 0.5 * fluid_density * cd * area * rel_speed
    
    return -drag_mag * rel_vel / rel_speed


@jit(nopython=True, parallel=True)
def compute_drag_forces_vectorized(
    positions: np.ndarray,
    velocities: np.ndarray,
    diameters: np.ndarray,
    fluid_vel_grid: np.ndarray,
    viscosity: float,
    fluid_density: float,
    domain_min: np.ndarray,
    domain_max: np.ndarray,
    drag_forces: np.ndarray
) -> None:
    n = len(positions)
    grid_shape = np.array(fluid_vel_grid.shape[:3], dtype=np.int32)
    cell_size = (domain_max - domain_min) / grid_shape.astype(np.float64)
    
    for i in prange(n):
        pos = positions[i]
        vel = velocities[i]
        
        grid_idx = ((pos - domain_min) / cell_size).astype(np.int32)
        for j in range(3):
            if grid_idx[j] < 0:
                grid_idx[j] = 0
            elif grid_idx[j] >= grid_shape[j]:
                grid_idx[j] = grid_shape[j] - 1
        
        fluid_vel = fluid_vel_grid[grid_idx[0], grid_idx[1], grid_idx[2]]
        rel_vel = vel - fluid_vel
        
        df = compute_drag_force_single(
            rel_vel, diameters[i], viscosity, fluid_density, 0.98
        )
        drag_forces[i, 0] = df[0]
        drag_forces[i, 1] = df[1]
        drag_forces[i, 2] = df[2]


@jit(nopython=True)
def particle_collision_optimized(
    pos_i: np.ndarray,
    pos_j: np.ndarray,
    vel_i: np.ndarray,
    vel_j: np.ndarray,
    diameter_i: float,
    diameter_j: float,
    mass_i: float,
    mass_j: float,
    young_mod: float,
    poisson: float,
    restitution: float,
    friction: float,
    dt: float
) -> Tuple[np.ndarray, np.ndarray]:
    dx = pos_i[0] - pos_j[0]
    dy = pos_i[1] - pos_j[1]
    dz = pos_i[2] - pos_j[2]
    dist_sq = dx*dx + dy*dy + dz*dz
    min_dist = (diameter_i + diameter_j) / 2.0
    min_dist_sq = min_dist * min_dist
    
    if dist_sq > min_dist_sq or dist_sq < 1e-24:
        return np.zeros(3), np.zeros(3)
    
    dist = np.sqrt(dist_sq)
    inv_dist = 1.0 / dist
    
    nx = dx * inv_dist
    ny = dy * inv_dist
    nz = dz * inv_dist
    
    overlap = min_dist - dist
    
    dvx = vel_i[0] - vel_j[0]
    dvy = vel_i[1] - vel_j[1]
    dvz = vel_i[2] - vel_j[2]
    
    dv_dot_n = dvx * nx + dvy * ny + dvz * nz
    
    k = (4.0 / 3.0) * np.sqrt(0.5) * young_mod / (1.0 - poisson**2)
    r_eff = (diameter_i * diameter_j) / (diameter_i + diameter_j)
    kn = k * np.sqrt(r_eff)
    
    gamma = -np.log(restitution) / np.sqrt(np.log(restitution)**2 + np.pi**2)
    mass_eff = (mass_i * mass_j) / (mass_i + mass_j)
    cn = 2.0 * gamma * np.sqrt(kn * mass_eff)
    
    fn_mag = kn * overlap**1.5 + cn * dv_dot_n
    
    fnx = fn_mag * nx
    fny = fn_mag * ny
    fnz = fn_mag * nz
    
    tvx = dvx - dv_dot_n * nx
    tvy = dvy - dv_dot_n * ny
    tvz = dvz - dv_dot_n * nz
    tv_mag_sq = tvx*tvx + tvy*tvy + tvz*tvz
    
    if tv_mag_sq > 1e-24:
        tv_mag = np.sqrt(tv_mag_sq)
        inv_tv_mag = 1.0 / tv_mag
        ftx = -friction * np.abs(fn_mag) * tvx * inv_tv_mag
        fty = -friction * np.abs(fn_mag) * tvy * inv_tv_mag
        ftz = -friction * np.abs(fn_mag) * tvz * inv_tv_mag
    else:
        ftx = 0.0
        fty = 0.0
        ftz = 0.0
    
    fx = fnx + ftx
    fy = fny + fty
    fz = fnz + ftz
    
    force_i = np.array([fx, fy, fz])
    force_j = np.array([-fx, -fy, -fz])
    
    return force_i, force_j


@jit(nopython=True)
def build_spatial_grid(
    positions: np.ndarray,
    diameters: np.ndarray,
    domain_min: np.ndarray,
    domain_max: np.ndarray,
    cell_size: float
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    n = len(positions)
    domain_size = domain_max - domain_min
    grid_shape = np.ceil(domain_size / cell_size).astype(np.int32)
    n_cells = grid_shape[0] * grid_shape[1] * grid_shape[2]
    
    cell_ids = np.zeros(n, dtype=np.int32)
    for i in range(n):
        gx = int((positions[i, 0] - domain_min[0]) / cell_size)
        gy = int((positions[i, 1] - domain_min[1]) / cell_size)
        gz = int((positions[i, 2] - domain_min[2]) / cell_size)
        
        if gx < 0: gx = 0
        if gy < 0: gy = 0
        if gz < 0: gz = 0
        if gx >= grid_shape[0]: gx = grid_shape[0] - 1
        if gy >= grid_shape[1]: gy = grid_shape[1] - 1
        if gz >= grid_shape[2]: gz = grid_shape[2] - 1
        
        cell_ids[i] = gx + gy * grid_shape[0] + gz * grid_shape[0] * grid_shape[1]
    
    sorted_indices = np.argsort(cell_ids)
    sorted_cell_ids = cell_ids[sorted_indices]
    
    cell_start = np.zeros(n_cells + 1, dtype=np.int32)
    cell_end = np.zeros(n_cells + 1, dtype=np.int32)
    
    current_cell = -1
    for i in range(n):
        cid = sorted_cell_ids[i]
        if cid != current_cell:
            if current_cell >= 0:
                cell_end[current_cell] = i
            cell_start[cid] = i
            current_cell = cid
    if current_cell >= 0:
        cell_end[current_cell] = n
    
    return sorted_indices, cell_start, cell_end


@jit(nopython=True, parallel=True)
def compute_collision_forces_spatial_grid(
    positions: np.ndarray,
    velocities: np.ndarray,
    diameters: np.ndarray,
    masses: np.ndarray,
    young_mod: float,
    poisson: float,
    restitution: float,
    friction: float,
    dt: float,
    domain_min: np.ndarray,
    domain_max: np.ndarray,
    collision_forces: np.ndarray
) -> int:
    n = len(positions)
    if n == 0:
        return 0
    
    max_diameter = np.max(diameters)
    cell_size = max_diameter * 1.5
    
    sorted_indices, cell_start, cell_end = build_spatial_grid(
        positions, diameters, domain_min, domain_max, cell_size
    )
    
    domain_size = domain_max - domain_min
    grid_shape = np.ceil(domain_size / cell_size).astype(np.int32)
    
    collision_count = 0
    
    for i in prange(n):
        pos_i = positions[i]
        vel_i = velocities[i]
        diam_i = diameters[i]
        mass_i = masses[i]
        
        gx = int((pos_i[0] - domain_min[0]) / cell_size)
        gy = int((pos_i[1] - domain_min[1]) / cell_size)
        gz = int((pos_i[2] - domain_min[2]) / cell_size)
        
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                for dz in [-1, 0, 1]:
                    cx = gx + dx
                    cy = gy + dy
                    cz = gz + dz
                    
                    if cx < 0 or cy < 0 or cz < 0:
                        continue
                    if cx >= grid_shape[0] or cy >= grid_shape[1] or cz >= grid_shape[2]:
                        continue
                    
                    cell_id = cx + cy * grid_shape[0] + cz * grid_shape[0] * grid_shape[1]
                    start = cell_start[cell_id]
                    end = cell_end[cell_id]
                    
                    for idx in range(start, end):
                        j = sorted_indices[idx]
                        if j <= i:
                            continue
                        
                        pos_j = positions[j]
                        vel_j = velocities[j]
                        diam_j = diameters[j]
                        mass_j = masses[j]
                        
                        force_i, force_j = particle_collision_optimized(
                            pos_i, pos_j, vel_i, vel_j,
                            diam_i, diam_j, mass_i, mass_j,
                            young_mod, poisson, restitution, friction, dt
                        )
                        
                        if np.abs(force_i[0]) > 1e-10 or np.abs(force_i[1]) > 1e-10 or np.abs(force_i[2]) > 1e-10:
                            collision_forces[i, 0] += force_i[0]
                            collision_forces[i, 1] += force_i[1]
                            collision_forces[i, 2] += force_i[2]
                            collision_forces[j, 0] += force_j[0]
                            collision_forces[j, 1] += force_j[1]
                            collision_forces[j, 2] += force_j[2]
                            collision_count += 1
    
    return collision_count


@jit(nopython=True, parallel=True)
def apply_boundary_conditions_vectorized(
    positions: np.ndarray,
    velocities: np.ndarray,
    diameters: np.ndarray,
    domain_min: np.ndarray,
    domain_max: np.ndarray,
    restitution: float
) -> None:
    n = len(positions)
    for i in prange(n):
        r = diameters[i] / 2.0
        
        for dim in range(3):
            if positions[i, dim] - r < domain_min[dim]:
                positions[i, dim] = domain_min[dim] + r
                velocities[i, dim] = -restitution * velocities[i, dim]
            elif positions[i, dim] + r > domain_max[dim]:
                positions[i, dim] = domain_max[dim] - r
                velocities[i, dim] = -restitution * velocities[i, dim]


@jit(nopython=True, parallel=True)
def integrate_verlet_vectorized(
    positions: np.ndarray,
    velocities: np.ndarray,
    accelerations: np.ndarray,
    forces: np.ndarray,
    masses: np.ndarray,
    dt: float
) -> None:
    n = len(positions)
    dt_sq = dt * dt
    
    for i in prange(n):
        m = masses[i]
        if m > 0:
            inv_m = 1.0 / m
            
            ax = forces[i, 0] * inv_m
            ay = forces[i, 1] * inv_m
            az = forces[i, 2] * inv_m
            
            positions[i, 0] += velocities[i, 0] * dt + 0.5 * accelerations[i, 0] * dt_sq
            positions[i, 1] += velocities[i, 1] * dt + 0.5 * accelerations[i, 1] * dt_sq
            positions[i, 2] += velocities[i, 2] * dt + 0.5 * accelerations[i, 2] * dt_sq
            
            velocities[i, 0] += 0.5 * (accelerations[i, 0] + ax) * dt
            velocities[i, 1] += 0.5 * (accelerations[i, 1] + ay) * dt
            velocities[i, 2] += 0.5 * (accelerations[i, 2] + az) * dt
            
            accelerations[i, 0] = ax
            accelerations[i, 1] = ay
            accelerations[i, 2] = az


class CFDDEMSolver:
    def __init__(
        self,
        config: SimulationConfig,
        enable_visualization: bool = True,
        validation_level: ValidationLevel = ValidationLevel.STANDARD
    ):
        self.config = config
        self.state = SimulationState()
        self.state.config = config
        self.callbacks: Dict[str, List[Callable]] = {
            'step_start': [],
            'step_end': [],
            'save_interval': [],
            'simulation_complete': []
        }
        
        self.enable_visualization = enable_visualization
        self.visualizer: Optional[RealtimeProgressVisualizer] = None
        self.validator = SimulationValidator(level=validation_level)
        
        self.validation_reports: List = []
        self.performance_metrics: Dict[str, List] = {
            'force_compute_time': [],
            'collision_detect_time': [],
            'integration_time': []
        }
        
        self._initialize_particles()
        self._initialize_fluid()
        self._calculate_total_steps()
    
    def _initialize_particles(self) -> None:
        p = self.config.particle
        d = self.config.domain
        
        self.state.particle_data.initialize(p.count)
        self.state.particle_data.diameters[:] = p.diameter
        self.state.particle_data.densities[:] = p.density
        
        volume = (4.0 / 3.0) * np.pi * (p.diameter / 2.0)**3
        self.state.particle_data.masses[:] = p.density * volume
        
        rng = np.random.default_rng(42)
        self.state.particle_data.positions[:, 0] = rng.uniform(
            d.x_min + p.diameter, d.x_max - p.diameter, p.count
        )
        self.state.particle_data.positions[:, 1] = rng.uniform(
            d.y_min + p.diameter, d.y_max - p.diameter, p.count
        )
        self.state.particle_data.positions[:, 2] = rng.uniform(
            d.z_min + p.diameter, d.z_max - p.diameter, p.count
        )
        
        logger.info(f"已初始化 {p.count} 个颗粒")
    
    def _initialize_fluid(self) -> None:
        grid_shape = (20, 20, 20)
        self.state.fluid_data.initialize(grid_shape)
        
        f = self.config.fluid
        self.state.fluid_data.density[:] = f.density
        self.state.fluid_data.viscosity[:] = f.viscosity
        
        logger.info(f"流体场已初始化，网格尺寸: {grid_shape}")
    
    def _calculate_total_steps(self) -> None:
        s = self.config.simulation
        self.state.total_steps = int(np.ceil(s.total_time / s.time_step))
        logger.info(f"总时间步数: {self.state.total_steps}")
    
    def register_callback(self, event: str, callback: Callable) -> None:
        if event in self.callbacks:
            self.callbacks[event].append(callback)
    
    def _trigger_callbacks(self, event: str, **kwargs) -> None:
        for callback in self.callbacks.get(event, []):
            try:
                callback(self.state, **kwargs)
            except Exception as e:
                logger.error(f"回调执行失败 [{event}]: {e}")
    
    def _compute_forces(self) -> int:
        p_data = self.state.particle_data
        f_data = self.state.fluid_data
        s = self.config.simulation
        p = self.config.particle
        d = self.config.domain
        
        n = p_data.ids.shape[0]
        collision_count = 0
        
        t0 = time.perf_counter()
        gravity_forces = np.zeros((n, 3), dtype=np.float64)
        compute_gravity_forces_vectorized(
            p_data.masses,
            np.array(s.gravity, dtype=np.float64),
            gravity_forces
        )
        t_gravity = time.perf_counter() - t0
        
        t0 = time.perf_counter()
        drag_forces = np.zeros((n, 3), dtype=np.float64)
        domain_min = np.array([d.x_min, d.y_min, d.z_min], dtype=np.float64)
        domain_max = np.array([d.x_max, d.y_max, d.z_max], dtype=np.float64)
        
        compute_drag_forces_vectorized(
            p_data.positions,
            p_data.velocities,
            p_data.diameters,
            f_data.velocity,
            self.config.fluid.viscosity,
            self.config.fluid.density,
            domain_min,
            domain_max,
            drag_forces
        )
        t_drag = time.perf_counter() - t0
        
        t0 = time.perf_counter()
        collision_forces = np.zeros((n, 3), dtype=np.float64)
        collision_count = compute_collision_forces_spatial_grid(
            p_data.positions,
            p_data.velocities,
            p_data.diameters,
            p_data.masses,
            p.young_modulus,
            p.poisson_ratio,
            p.restitution_coeff,
            p.friction_coeff,
            s.time_step,
            domain_min,
            domain_max,
            collision_forces
        )
        t_collision = time.perf_counter() - t0
        
        p_data.forces[:] = gravity_forces + drag_forces + collision_forces
        
        self.performance_metrics['force_compute_time'].append(t_gravity + t_drag)
        self.performance_metrics['collision_detect_time'].append(t_collision)
        
        return collision_count
    
    def _update_fluid_field(self) -> None:
        pass
    
    def _update_energy(self) -> None:
        p_data = self.state.particle_data
        s = self.config.simulation
        
        v_squared = np.sum(p_data.velocities**2, axis=1)
        self.state.energy_kinetic = 0.5 * np.sum(p_data.masses * v_squared)
        
        height = p_data.positions[:, 1]
        self.state.energy_potential = np.sum(p_data.masses * (-s.gravity[1]) * height)
    
    def step(self) -> bool:
        if self.state.current_step >= self.state.total_steps:
            return False
        
        self._trigger_callbacks('step_start')
        
        t0 = time.perf_counter()
        collision_count = self._compute_forces()
        self.state.collision_count += collision_count
        t_force = time.perf_counter() - t0
        
        t0 = time.perf_counter()
        d = self.config.domain
        apply_boundary_conditions_vectorized(
            self.state.particle_data.positions,
            self.state.particle_data.velocities,
            self.state.particle_data.diameters,
            np.array([d.x_min, d.y_min, d.z_min], dtype=np.float64),
            np.array([d.x_max, d.y_max, d.z_max], dtype=np.float64),
            self.config.particle.restitution_coeff
        )
        
        integrate_verlet_vectorized(
            self.state.particle_data.positions,
            self.state.particle_data.velocities,
            self.state.particle_data.accelerations,
            self.state.particle_data.forces,
            self.state.particle_data.masses,
            self.config.simulation.time_step
        )
        t_integrate = time.perf_counter() - t0
        self.performance_metrics['integration_time'].append(t_integrate)
        
        self._update_fluid_field()
        self._update_energy()
        
        self.state.current_time += self.config.simulation.time_step
        self.state.current_step += 1
        
        if self.state.current_step % self.config.simulation.save_interval == 0:
            self._trigger_callbacks('save_interval')
        
        if self.enable_visualization and self.visualizer:
            self.visualizer.update(
                current_step=self.state.current_step,
                collision_count=self.state.collision_count,
                energy_kinetic=self.state.energy_kinetic,
                energy_potential=self.state.energy_potential
            )
        
        if self.validator.level != ValidationLevel.DISABLED:
            if self.state.current_step % 10 == 0:
                report = self.validator.validate_step(self.state, self.state.current_step)
                if report.has_errors:
                    logger.warning(f"Step {self.state.current_step} validation errors detected")
                self.validation_reports.append(report)
        
        self._trigger_callbacks('step_end')
        
        return True
    
    def run(self, progress_callback: Optional[Callable] = None) -> SimulationState:
        logger.info("开始仿真计算...")
        self.state.is_running = True
        
        if self.enable_visualization:
            viz_config = RealtimeVisualizerConfig(update_interval=0.2)
            self.visualizer = RealtimeProgressVisualizer(viz_config)
            self.visualizer.start(self.state.total_steps)
        
        if self.validator.level != ValidationLevel.DISABLED:
            self.validator.set_initial_state(self.state)
        
        start_time = time.time()
        
        try:
            while self.state.is_running and self.step():
                if progress_callback:
                    progress = self.state.current_step / self.state.total_steps
                    progress_callback(self.state)
        
        except KeyboardInterrupt:
            logger.info("仿真被用户中断")
            self.state.is_running = False
        
        elapsed = time.time() - start_time
        
        self.state.is_running = False
        
        if self.enable_visualization and self.visualizer:
            self.visualizer.complete()
        
        if self.validator.level != ValidationLevel.DISABLED:
            final_report = self.validator.final_validation(self.state)
            self.validation_reports.append(final_report)
            logger.info(f"Validation: {final_report.passed_checks}/{final_report.total_checks} checks passed")
        
        self._trigger_callbacks('simulation_complete')
        
        logger.info(f"仿真完成，耗时: {elapsed:.2f}秒")
        logger.info(f"总碰撞次数: {self.state.collision_count}")
        
        if len(self.performance_metrics['collision_detect_time']) > 0:
            avg_collision = np.mean(self.performance_metrics['collision_detect_time']) * 1000
            avg_force = np.mean(self.performance_metrics['force_compute_time']) * 1000
            avg_integrate = np.mean(self.performance_metrics['integration_time']) * 1000
            logger.info(f"性能统计 (ms/step): 碰撞检测={avg_collision:.2f}, 力计算={avg_force:.2f}, 积分={avg_integrate:.2f}")
        
        return self.state
    
    def pause(self) -> None:
        self.state.is_paused = True
    
    def resume(self) -> None:
        self.state.is_paused = False
    
    def stop(self) -> None:
        self.state.is_running = False
    
    def get_state(self) -> SimulationState:
        return self.state
    
    def get_performance_summary(self) -> Dict:
        if len(self.performance_metrics['collision_detect_time']) == 0:
            return {}
        
        return {
            'avg_collision_time_ms': np.mean(self.performance_metrics['collision_detect_time']) * 1000,
            'avg_force_time_ms': np.mean(self.performance_metrics['force_compute_time']) * 1000,
            'avg_integration_time_ms': np.mean(self.performance_metrics['integration_time']) * 1000,
            'total_steps': self.state.current_step,
            'collisions_per_second': self.state.collision_count / self.state.current_time if self.state.current_time > 0 else 0
        }
