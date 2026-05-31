#!/usr/bin/env python3
"""
示例1: 本地运行 Taylor-Green 涡模拟
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import matplotlib.pyplot as plt
from config import (
    CFDConfig, GridConfig, SimulationConfig,
    BoundaryCondition, PriorityLevel
)
from preprocessing import DataLoader, GridSharder, DataCleaner, DataValidator
from cfd_compute import NavierStokesSolver, compute_flow_metrics, compute_vorticity


def main():
    print("=" * 60)
    print("示例: Taylor-Green 涡模拟 (本地运行)")
    print("=" * 60)
    
    nx, ny = 128, 128
    iterations = 200
    dt = 0.001
    nu = 0.01
    
    grid_config = GridConfig(
        nx=nx, ny=ny,
        bc_x=BoundaryCondition.PERIODIC,
        bc_y=BoundaryCondition.PERIODIC
    )
    sim_config = SimulationConfig(
        dt=dt, nu=nu,
        iterations=iterations,
        save_interval=20
    )
    config = CFDConfig(
        grid=grid_config,
        sim=sim_config,
        priority=PriorityLevel.HIGH,
        num_shards=2
    )
    
    print(f"\n配置:")
    print(f"  网格: {nx}x{ny}")
    print(f"  迭代次数: {iterations}")
    print(f"  时间步长: {dt}")
    print(f"  粘性系数: {nu}")
    print(f"  分片数量: {config.num_shards}")
    
    loader = DataLoader()
    u, v, p = loader.generate_initial(nx, ny, 'taylor_green')
    print(f"\n初始条件已生成: Taylor-Green 涡")
    
    cleaner = DataCleaner()
    u, v, p = cleaner.clean_velocity(u, v, p)
    print(f"数据清洗完成")
    
    validator = DataValidator(grid_config)
    validation = validator.validate_full(u, v, p, nu, dt)
    print(f"数据验证: {'通过' if validation['valid'] else '警告'}")
    
    sharder = GridSharder(grid_config, config.num_shards)
    print(f"网格分片完成: {len(sharder.shards)} 片")
    
    solver = NavierStokesSolver(config)
    print(f"\n开始计算...")
    
    import time
    start_time = time.time()
    results = solver.solve(u, v, p, iterations, save_interval=20)
    elapsed = time.time() - start_time
    
    print(f"\n计算完成!")
    print(f"  总耗时: {elapsed:.2f} 秒")
    print(f"  平均速度: {iterations/elapsed:.2f} 迭代/秒")
    
    final_u = results['final_u']
    final_v = results['final_v']
    final_p = results['final_p']
    
    metrics = compute_flow_metrics(final_u, final_v, final_p,
                                   grid_config.dx, grid_config.dy,
                                   dt, nu)
    print(f"\n最终流动指标:")
    print(f"  动能: {metrics.kinetic_energy:.6e}")
    print(f"  耗散率: {metrics.dissipation:.6e}")
    print(f"  雷诺数: {metrics.reynolds_number:.2f}")
    print(f"  最大速度: {metrics.max_velocity_magnitude:.4f}")
    print(f"  最大涡量: {metrics.max_vorticity:.4f}")
    
    print(f"\n可视化结果...")
    history = results['history']
    
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    
    for idx, frame_idx in enumerate([0, len(history)//2, -1]):
        frame = history[frame_idx]
        vort = compute_vorticity(frame['u'], frame['v'], 
                                 grid_config.dx, grid_config.dy)
        
        axes[0, idx].imshow(frame['u'].T, origin='lower', cmap='RdBu')
        axes[0, idx].set_title(f"U 速度 (迭代 {frame['iteration']})")
        
        axes[1, idx].imshow(vort.T, origin='lower', cmap='RdBu')
        axes[1, idx].set_title(f"涡量 (迭代 {frame['iteration']})")
    
    plt.tight_layout()
    output_path = os.path.join(os.path.dirname(__file__), 'taylor_green_result.png')
    plt.savefig(output_path, dpi=100)
    print(f"  结果图已保存: {output_path}")
    
    print(f"\n动能衰减曲线:")
    ke_history = [f['kinetic_energy'] for f in history]
    iterations = [f['iteration'] for f in history]
    for i, ke in enumerate(ke_history):
        if i % 2 == 0:
            print(f"  迭代 {iterations[i]:4d}: {ke:.6e}")
    
    fig2, ax = plt.subplots(figsize=(10, 5))
    ax.plot(iterations, ke_history, 'b-o', markersize=4)
    ax.set_xlabel('迭代')
    ax.set_ylabel('动能')
    ax.set_title('动能衰减曲线')
    ax.grid(True)
    output_path2 = os.path.join(os.path.dirname(__file__), 'ke_decay.png')
    plt.savefig(output_path2, dpi=100)
    print(f"  动能曲线已保存: {output_path2}")
    
    print(f"\n✅ 示例完成!")
    return results


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n用户中断")
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
