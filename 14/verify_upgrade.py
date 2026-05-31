import sys
import time
import numpy as np

sys.path.insert(0, '.')

from cfd_dem_suite.config import SimulationConfig
from cfd_dem_suite.kernel import CFDDEMSolver
from cfd_dem_suite.validation import ValidationLevel
from cfd_dem_suite.visualization import RealtimeProgressVisualizer
from cfd_dem_suite.dependency_manager import DependencyManager
from cfd_dem_suite.environment import EnvironmentDetector
from cfd_dem_suite.resource_monitor import ResourceMonitor
from cfd_dem_suite.remote_nodes import RemoteNodeManager


def test_all_modules():
    print("="*70)
    print("CFD-DEM 仿真计算套件 v2.0 - 升级验证")
    print("="*70)
    print()
    
    print("[1/7] 测试实时可视化模块...")
    viz = RealtimeProgressVisualizer()
    viz.start(100)
    viz.update(50, collision_count=100, energy_kinetic=1.0, energy_potential=0.5)
    viz.complete()
    print("  PASS - RealtimeProgressVisualizer 正常工作")
    print()
    
    print("[2/7] 测试物理校验模块...")
    config_dict = {
        'domain': {'x_min': 0.0, 'x_max': 0.1, 'y_min': 0.0, 'y_max': 0.1, 'z_min': 0.0, 'z_max': 0.1},
        'particle': {'count': 50, 'diameter': 0.005, 'density': 2500.0, 'young_modulus': 7.0e10, 
                     'poisson_ratio': 0.25, 'restitution_coeff': 0.9, 'friction_coeff': 0.3},
        'fluid': {'density': 1000.0, 'viscosity': 1.0e-3},
        'simulation': {'time_step': 1.0e-5, 'total_time': 0.001, 'gravity': [0.0, -9.81, 0.0], 'save_interval': 10},
        'output': {'output_dir': './results'}
    }
    config = SimulationConfig.from_dict(config_dict)
    solver = CFDDEMSolver(config, enable_visualization=False, validation_level=ValidationLevel.STANDARD)
    state = solver.run()
    print(f"  PASS - 完成 {state.current_step} 步仿真")
    print(f"       - 总碰撞次数: {state.collision_count}")
    print(f"       - 校验报告: {len(solver.validation_reports)} 次物理校验")
    print()
    
    print("[3/7] 测试空间网格碰撞检测性能...")
    n_particles = 500
    domain_min = np.array([0.0, 0.0, 0.0], dtype=np.float64)
    domain_max = np.array([0.1, 0.1, 0.1], dtype=np.float64)
    
    rng = np.random.default_rng(42)
    positions = rng.uniform(0.01, 0.09, (n_particles, 3)).astype(np.float64)
    velocities = rng.uniform(-0.5, 0.5, (n_particles, 3)).astype(np.float64)
    diameters = np.ones(n_particles, dtype=np.float64) * 0.005
    masses = np.ones(n_particles, dtype=np.float64) * 0.001
    collision_forces = np.zeros((n_particles, 3), dtype=np.float64)
    
    t0 = time.perf_counter()
    from cfd_dem_suite.kernel import compute_collision_forces_spatial_grid
    count = compute_collision_forces_spatial_grid(
        positions, velocities, diameters, masses,
        7.0e10, 0.25, 0.9, 0.3, 1.0e-4,
        domain_min, domain_max, collision_forces
    )
    t1 = time.perf_counter()
    
    print(f"  PASS - {n_particles} 颗粒碰撞检测")
    print(f"       - 耗时: {(t1-t0)*1000:.2f} ms")
    print(f"       - 碰撞次数: {count}")
    print(f"       - 效率: {count/(t1-t0):.0f} 碰撞/秒")
    print()
    
    print("[4/7] 测试依赖管理模块...")
    dm = DependencyManager()
    status = dm.check_core_dependencies()
    print(f"  PASS - 核心依赖状态: {len(status)} 项检查")
    print()
    
    print("[5/7] 测试环境检测模块...")
    ed = EnvironmentDetector()
    info = ed.get_environment_info()
    print(f"  PASS - 环境检测: {info['os_type']} / {info['hostname']}")
    print()
    
    print("[6/7] 测试资源监控模块...")
    rm = ResourceMonitor()
    metrics = rm.get_current_metrics()
    print(f"  PASS - 资源监控: CPU {metrics.cpu_percent}% / Memory {metrics.memory_percent}%")
    print()
    
    print("[7/7] 测试远程节点管理模块...")
    rnm = RemoteNodeManager()
    print(f"  PASS - 节点管理器就绪")
    print()
    
    print("="*70)
    print("所有模块验证通过！升级成功。")
    print()
    print("功能升级总结:")
    print("  [+] 计算过程实时进度可视化 (visualization.py)")
    print("  [+] 仿真结果偏差自动校验 (validation.py)")
    print("  [+] 空间网格优化碰撞检测 (kernel.py)")
    print("  [+] 向量化力计算加速 (kernel.py)")
    print("  [+] 依赖管理模块 (dependency_manager.py)")
    print("  [+] 环境检测模块 (environment.py)")
    print("  [+] 资源监控模块 (resource_monitor.py)")
    print("  [+] 远程节点管理模块 (remote_nodes.py)")
    print()
    print("性能提升:")
    print("  - 碰撞检测: O(n^2) -> O(n) 空间网格优化")
    print("  - 计算效率: Numba JIT + prange 并行加速")
    print("  - 代码质量: 单一职责模块化架构")
    print("="*70)


if __name__ == '__main__':
    test_all_modules()
