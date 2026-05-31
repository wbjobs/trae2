#!/usr/bin/env python3
"""
示例3: 数据预处理流水线
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from config import GridConfig, BoundaryCondition
from preprocessing import (
    DataLoader, GridSharder, DataCleaner, DataValidator
)


def main():
    print("=" * 60)
    print("示例: 数据预处理流水线")
    print("=" * 60)

    nx, ny = 256, 256
    num_shards = 4

    print(f"\n配置:")
    print(f"  网格: {nx}x{ny}")
    print(f"  分片数量: {num_shards}")

    grid_config = GridConfig(
        nx=nx, ny=ny,
        bc_x=BoundaryCondition.PERIODIC,
        bc_y=BoundaryCondition.PERIODIC
    )

    print(f"\n步骤1: 生成初始数据")
    print("-" * 40)
    loader = DataLoader()

    conditions = ['taylor_green', 'uniform', 'shear', 'cylinder', 'rest']
    for cond in conditions:
        u, v, p = loader.generate_initial(nx, ny, cond)
        print(f"  {cond:15s}: u=[{u.min():.3f}, {u.max():.3f}], "
              f"v=[{v.min():.3f}, {v.max():.3f}], "
              f"p=[{p.min():.3f}, {p.max():.3f}]")

    print(f"\n步骤2: 生成带噪声的数据用于清洗测试")
    print("-" * 40)
    u_clean, v_clean, p_clean = loader.generate_initial(nx, ny, 'taylor_green')

    u_noisy = u_clean + np.random.normal(0, 0.1, u_clean.shape)
    v_noisy = v_clean + np.random.normal(0, 0.1, v_clean.shape)
    p_noisy = p_clean.copy()

    mask = np.random.random(u_clean.shape) < 0.05
    u_noisy[mask] = np.nan
    v_noisy[mask] = np.nan
    p_noisy[mask] = np.nan

    u_noisy[0, 0] = 100.0
    u_noisy[10, 10] = -100.0

    nan_count = np.isnan(u_noisy).sum()
    print(f"  噪声数据: {nan_count} NaN 值, 2 个异常值")

    print(f"\n步骤3: 数据清洗")
    print("-" * 40)
    cleaner = DataCleaner()

    print(f"  清洗前:")
    print(f"    u: min={u_noisy[~np.isnan(u_noisy)].min():.3f}, "
          f"max={u_noisy[~np.isnan(u_noisy)].max():.3f}, "
          f"mean={np.nanmean(u_noisy):.6f}")

    u_c, v_c, p_c = cleaner.clean_velocity(u_noisy, v_noisy, p_noisy)

    print(f"  清洗后:")
    print(f"    u: min={u_c.min():.3f}, max={u_c.max():.3f}, mean={u_c.mean():.6f}")
    print(f"    NaN 数量: {np.isnan(u_c).sum()}")

    error_u = np.abs(u_c - u_clean).mean()
    error_v = np.abs(v_c - v_clean).mean()
    print(f"  与原始数据的平均误差: u={error_u:.6f}, v={error_v:.6f}")

    print(f"\n步骤4: 数据验证")
    print("-" * 40)
    validator = DataValidator(grid_config)

    dt = 0.001
    nu = 0.01

    validation = validator.validate_full(u_c, v_c, p_c, nu, dt)

    print(f"  验证结果: {'通过' if validation['valid'] else '警告'}")
    print(f"  速度场验证: {'通过' if validation['velocity_valid'] else '失败'}")
    print(f"  边界条件验证: {'通过' if validation['boundary_valid'] else '失败'}")
    print(f"  CFL验证: {'通过' if validation['cfl_valid'] else '失败'} (CFL={validation['cfl']:.4f})")
    print(f"  稳定性验证: {'通过' if validation['stable'] else '失败'} (diffusive={validation['diffusive']:.6e})")

    if validation['errors']:
        print(f"  错误/警告信息:")
        for err in validation['errors'][:5]:
            print(f"    - {err}")

    print(f"\n步骤5: 网格分片")
    print("-" * 40)
    sharder = GridSharder(grid_config, num_shards)

    print(f"  分片信息:")
    for i, shard in enumerate(sharder.shards):
        print(f"    分片 {i}:")
        print(f"      范围: x=[{shard.x_start}:{shard.x_end}], "
              f"y=[{shard.y_start}:{shard.y_end}]")
        print(f"      形状: {shard.shape}")
        print(f"      邻居: left={shard.has_left}, right={shard.has_right}, "
              f"top={shard.has_top}, bottom={shard.has_bottom}")

    print(f"\n步骤6: 数据分片与合并")
    print("-" * 40)
    shards_u = sharder.split(u_c)
    shards_v = sharder.split(v_c)
    shards_p = sharder.split(p_c)

    print(f"  分片数据:")
    for i, ((shard, su), (_, sv), (_, sp)) in enumerate(zip(shards_u, shards_v, shards_p)):
        print(f"    分片 {i}: u={su.shape}, v={sv.shape}, p={sp.shape}")
        print(f"           u=[{su.min():.3f}, {su.max():.3f}], "
              f"v=[{sv.min():.3f}, {sv.max():.3f}]")

    merged_u = sharder.merge(shards_u)
    merged_v = sharder.merge(shards_v)

    error_u = np.abs(merged_u - u_c).max()
    error_v = np.abs(merged_v - v_c).max()

    print(f"\n  合并误差 (最大):")
    print(f"    u: {error_u:.6e}")
    print(f"    v: {error_v:.6e}")
    print(f"  合并验证: {'通过' if error_u < 1e-10 and error_v < 1e-10 else '失败'}")

    print(f"\n步骤7: 边界交换 (halo exchange)")
    print("-" * 40)
    exchanged = sharder.exchange_halos(shards_u)
    print(f"  已完成 {len(exchanged)} 个分片的边界交换")
    for i, (shard, data) in enumerate(exchanged):
        print(f"    分片 {i}: shape={data.shape}")

    print(f"\n步骤8: 数据持久化")
    print("-" * 40)
    output_path = os.path.join(os.path.dirname(__file__), 'test_data.json')

    loader.save_multiple(output_path, {'u': u_c, 'v': v_c, 'p': p_c})
    print(f"  已保存数据: {output_path}")

    fields, info = loader.load_multiple(output_path)
    print(f"  已加载数据: {list(fields.keys())}")

    load_error = np.abs(fields['u'] - u_c).max()
    print(f"  加载误差: {load_error:.6e} {'通过' if load_error < 1e-10 else '失败'}")

    os.remove(output_path)
    print(f"  已清理测试文件")

    print(f"\n{'=' * 60}")
    print(f"✅ 数据预处理流水线示例完成!")
    print(f"{'=' * 60}")

    print(f"\n预处理流水线总结:")
    print(f"  1. 数据加载/生成: DataLoader")
    print(f"  2. 数据清洗: DataCleaner (去异常、填充NaN、平滑)")
    print(f"  3. 数据验证: DataValidator (CFL、不可压缩性、稳定性)")
    print(f"  4. 网格分片: GridSharder (区域分解、重叠区域)")
    print(f"  5. 边界交换: GridSharder.exchange_halos")
    print(f"  6. 数据合并: GridSharder.merge")

    return {
        'grid_config': grid_config,
        'sharder': sharder,
        'cleaner': cleaner,
        'validator': validator,
        'data': (u_c, v_c, p_c)
    }


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n用户中断")
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
