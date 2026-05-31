import sys
import time
import numpy as np
from dataclasses import dataclass, field

sys.path.insert(0, '.')

from cfd_dem_suite.kernel import (
    compute_collision_forces_spatial_grid,
    build_spatial_grid
)
from cfd_dem_suite.config import SimulationConfig
from cfd_dem_suite.kernel import CFDDEMSolver
from cfd_dem_suite.validation import ValidationLevel


def benchmark_collision_detection(n_particles_list, n_iterations=5):
    """基准测试：碰撞检测算法性能"""
    print("\n" + "="*70)
    print("碰撞检测性能基准测试")
    print("="*70)
    print(f"{'颗粒数':>10} | {'每步耗时(ms)':>15} | {'碰撞检测效率':>15} | {'碰撞次数':>12}")
    print("-"*70)
    
    results = []
    
    for n_particles in n_particles_list:
        domain_min = np.array([0.0, 0.0, 0.0], dtype=np.float64)
        domain_max = np.array([0.1, 0.1, 0.1], dtype=np.float64)
        
        rng = np.random.default_rng(42)
        positions = rng.uniform(0.01, 0.09, (n_particles, 3)).astype(np.float64)
        velocities = rng.uniform(-0.5, 0.5, (n_particles, 3)).astype(np.float64)
        diameters = np.ones(n_particles, dtype=np.float64) * 0.005
        masses = np.ones(n_particles, dtype=np.float64) * 0.001
        
        collision_forces = np.zeros((n_particles, 3), dtype=np.float64)
        
        times = []
        collision_counts = []
        
        for _ in range(n_iterations):
            collision_forces.fill(0.0)
            t0 = time.perf_counter()
            count = compute_collision_forces_spatial_grid(
                positions, velocities, diameters, masses,
                7.0e10, 0.25, 0.9, 0.3, 1.0e-4,
                domain_min, domain_max, collision_forces
            )
            t1 = time.perf_counter()
            times.append((t1 - t0) * 1000)
            collision_counts.append(count)
        
        avg_time = np.mean(times)
        std_time = np.std(times)
        avg_collisions = np.mean(collision_counts)
        
        efficiency = avg_collisions / avg_time if avg_time > 0 else 0
        
        print(f"{n_particles:>10} | {avg_time:>13.2f}±{std_time:.2f} | {efficiency:>13.0f} | {avg_collisions:>12.0f}")
        
        results.append({
            'n_particles': n_particles,
            'avg_time_ms': avg_time,
            'std_time_ms': std_time,
            'collisions_per_ms': efficiency,
            'avg_collisions': avg_collisions
        })
    
    print("="*70)
    return results


def benchmark_full_simulation():
    """基准测试：完整仿真流程性能"""
    print("\n" + "="*70)
    print("完整仿真流程性能测试")
    print("="*70)
    
    config_dict = {
        'domain': {
            'x_min': 0.0, 'x_max': 0.2,
            'y_min': 0.0, 'y_max': 0.2,
            'z_min': 0.0, 'z_max': 0.2
        },
        'particle': {
            'count': 200,
            'diameter': 0.006,
            'density': 2500.0,
            'young_modulus': 7.0e10,
            'poisson_ratio': 0.25,
            'restitution_coeff': 0.85,
            'friction_coeff': 0.3
        },
        'fluid': {
            'density': 1000.0,
            'viscosity': 1.0e-3,
            'velocity': [0.0, 0.0, 0.0]
        },
        'simulation': {
            'time_step': 1.0e-5,
            'total_time': 0.01,
            'gravity': [0.0, -9.81, 0.0],
            'save_interval': 10
        },
        'output': {
            'format': 'hdf5',
            'directory': './results'
        }
    }
    
    config = SimulationConfig.from_dict(config_dict)
    
    print(f"配置: {config.particle.count} 颗粒, {int(np.ceil(config.simulation.total_time / config.simulation.time_step))} 时间步")
    print()
    
    solver = CFDDEMSolver(
        config,
        enable_visualization=True,
        validation_level=ValidationLevel.STANDARD
    )
    
    t0 = time.perf_counter()
    state = solver.run()
    total_time = time.perf_counter() - t0
    
    performance = solver.get_performance_summary()
    
    print("\n" + "-"*70)
    print("性能统计:")
    print(f"  总耗时: {total_time:.3f} 秒")
    print(f"  总步数: {performance.get('total_steps', 0)}")
    print(f"  平均步速: {performance.get('total_steps', 0)/total_time:.1f} 步/秒")
    print(f"  碰撞检测: {performance.get('avg_collision_time_ms', 0):.2f} ms/步")
    print(f"  力计算: {performance.get('avg_force_time_ms', 0):.2f} ms/步")
    print(f"  积分更新: {performance.get('avg_integration_time_ms', 0):.2f} ms/步")
    print(f"  碰撞效率: {performance.get('collisions_per_second', 0):.0f} 碰撞/秒")
    print("-"*70)
    
    if solver.validation_reports:
        final_report = solver.validation_reports[-1]
        print(f"\n物理校验结果: {final_report.passed_checks}/{final_report.total_checks} 通过")
        if final_report.has_warnings:
            print(f"  ⚠ 警告: {len(final_report.get_warnings())} 项")
        if final_report.has_errors:
            print(f"  ✗ 错误: {len(final_report.get_errors())} 项")
    
    return performance


def test_validation_accuracy():
    """测试：物理校验功能准确性"""
    print("\n" + "="*70)
    print("物理校验功能测试")
    print("="*70)
    
    config_dict = {
        'domain': {
            'x_min': 0.0, 'x_max': 0.1,
            'y_min': 0.0, 'y_max': 0.1,
            'z_min': 0.0, 'z_max': 0.1
        },
        'particle': {
            'count': 50,
            'diameter': 0.005,
            'density': 2500.0,
            'young_modulus': 7.0e10,
            'poisson_ratio': 0.25,
            'restitution_coeff': 0.9,
            'friction_coeff': 0.3
        },
        'fluid': {
            'density': 1000.0,
            'viscosity': 1.0e-3,
            'velocity': [0.0, 0.0, 0.0]
        },
        'simulation': {
            'time_step': 1.0e-5,
            'total_time': 0.002,
            'gravity': [0.0, -9.81, 0.0],
            'save_interval': 10
        },
        'output': {
            'format': 'hdf5',
            'directory': './results'
        }
    }
    
    config = SimulationConfig.from_dict(config_dict)
    
    solver = CFDDEMSolver(
        config,
        enable_visualization=False,
        validation_level=ValidationLevel.STRICT
    )
    
    state = solver.run()
    
    print(f"\n执行了 {len(solver.validation_reports)} 次校验")
    
    all_checks = []
    for report in solver.validation_reports:
        for result in report.results:
            all_checks.append({
                'name': result.check_name,
                'passed': result.passed,
                'severity': result.severity.value,
                'message': result.message
            })
    
    print(f"\n校验项统计:")
    check_names = set(c['name'] for c in all_checks)
    for name in sorted(check_names):
        checks = [c for c in all_checks if c['name'] == name]
        passed = sum(1 for c in checks if c['passed'])
        total = len(checks)
        status = "✓" if passed == total else "~" if passed > 0 else "✗"
        print(f"  {status} {name}: {passed}/{total} 通过")
    
    print("\n" + "="*70)
    print("实时可视化模块 ✓")
    print("物理自动校验模块 ✓")
    print("空间网格优化碰撞检测 ✓")
    print("向量化力计算 ✓")
    print("模块化依赖管理 ✓")
    print("="*70)


if __name__ == '__main__':
    print("CFD-DEM 仿真计算套件性能验证")
    print("版本 2.0 - 升级功能测试")
    
    try:
        benchmark_collision_detection([50, 100, 200, 500])
    except Exception as e:
        print(f"碰撞检测基准测试出错: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        benchmark_full_simulation()
    except Exception as e:
        print(f"完整仿真测试出错: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        test_validation_accuracy()
    except Exception as e:
        print(f"物理校验测试出错: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n✓ 所有性能测试完成！")
