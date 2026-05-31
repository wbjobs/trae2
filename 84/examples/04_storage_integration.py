#!/usr/bin/env python3
"""
示例4: InfluxDB 结果存储集成
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from datetime import datetime
from config import (
    CFDConfig, GridConfig, SimulationConfig,
    BoundaryCondition, PriorityLevel
)
from preprocessing import DataLoader, DataCleaner
from cfd_compute import NavierStokesSolver, compute_flow_metrics
from storage import InfluxDBStorage, ResultWriter, ResultSerializer


def main():
    print("=" * 60)
    print("示例: InfluxDB 结果存储集成")
    print("=" * 60)

    nx, ny = 64, 64
    iterations = 100
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
        save_interval=10
    )
    config = CFDConfig(
        grid=grid_config,
        sim=sim_config,
        priority=PriorityLevel.NORMAL,
        num_shards=2
    )

    print(f"\n配置:")
    print(f"  网格: {nx}x{ny}")
    print(f"  迭代: {iterations}")

    loader = DataLoader()
    u, v, p = loader.generate_initial(nx, ny, 'taylor_green')

    cleaner = DataCleaner()
    u, v, p = cleaner.clean_velocity(u, v, p)

    solver = NavierStokesSolver(config)
    results = solver.solve(u, v, p, iterations, save_interval=10)

    print(f"\n计算完成, 共 {len(results['history'])} 帧历史数据")

    print(f"\n步骤1: 直接使用 InfluxDBStorage 写入")
    print("-" * 40)
    storage = InfluxDBStorage(use_v2=False)
    connected = storage.is_connected()

    if connected:
        print(f"  InfluxDB: 已连接")
        point = storage.create_point(
            measurement='cfd_test',
            tags={'task_id': 'example_04', 'nx': str(nx), 'ny': str(ny)},
            fields={
                'kinetic_energy': 0.0,
                'max_velocity': 0.0,
                'iteration': 0
            },
            time=datetime.utcnow()
        )
        storage.write_point(point)
        storage.flush()
        print(f"  写入测试数据点成功")
    else:
        print(f"  InfluxDB: 未连接 (mock 模式)")
        print(f"  数据将被缓冲, 等待连接后写入")

    print(f"\n步骤2: 使用 ResultWriter 批量写入")
    print("-" * 40)
    writer = ResultWriter(storage=storage, batch_size=500, flush_interval=3.0)

    task_tags = {
        'task_id': 'example_04',
        'initial_condition': 'taylor_green',
        'nx': str(nx),
        'ny': str(ny)
    }

    for frame in results['history']:
        metrics = compute_flow_metrics(
            frame['u'], frame['v'], frame['p'],
            grid_config.dx, grid_config.dy, dt, nu
        )
        writer.write_flow_metrics(
            metrics=metrics.to_dict(),
            iteration=frame['iteration'],
            time_val=frame['time'],
            tags=task_tags
        )

    writer.flush()
    stats = writer.get_stats()
    print(f"  写入统计:")
    print(f"    总写入: {stats['total_written']}")
    print(f"    批次数: {stats['total_batches']}")
    print(f"    错误数: {stats['write_errors']}")
    print(f"    连接状态: {'已连接' if stats['connected'] else 'mock 模式'}")

    print(f"\n步骤3: 使用 ResultSerializer 序列化")
    print("-" * 40)
    serializer = ResultSerializer()

    final_u = results['final_u']
    final_v = results['final_v']
    final_p = results['final_p']
    final_metrics = compute_flow_metrics(
        final_u, final_v, final_p,
        grid_config.dx, grid_config.dy, dt, nu
    )

    point = serializer.create_flow_metrics_point(
        metrics=final_metrics.to_dict(),
        iteration=iterations,
        time_val=iterations * dt,
        tags=task_tags
    )
    print(f"  序列化结果:")
    print(f"    measurement: {point['measurement']}")
    print(f"    tags: {point['tags']}")
    print(f"    fields 数量: {len(point['fields'])}")

    task_event_point = serializer.create_task_event_point(
        task_id='example_04',
        event_type='completion',
        status='success',
        metadata={
            'iterations_completed': iterations,
            'name': 'taylor_green_example'
        },
        tags=task_tags
    )
    print(f"  任务事件点:")
    print(f"    measurement: {task_event_point['measurement']}")

    print(f"\n步骤4: 节点监控数据写入")
    print("-" * 40)
    node_point = serializer.create_node_metrics_point(
        node_name='compute-node-01',
        cpu_percent=45.2,
        memory_percent=62.8,
        memory_available_gb=6.1,
        active_tasks=2,
        additional_metrics={
            'network_in_mbps': 12.5,
            'network_out_mbps': 3.2
        }
    )
    writer.write_point(node_point)
    writer.flush()
    print(f"  节点监控数据已写入")

    writer.close()
    storage.close()

    print(f"\n步骤5: 查询示例 (InfluxQL)")
    print("-" * 40)
    if connected:
        query = (
            f"SELECT mean(kinetic_energy), max(max_velocity_magnitude) "
            f"FROM cfd_flow_metrics "
            f"WHERE task_id='example_04' "
            f"GROUP BY time(10m)"
        )
        result = storage.query(query)
        print(f"  查询结果: {len(list(result))} 条记录")
    else:
        print(f"  InfluxDB 未连接, 跳过查询")
        print(f"  查询示例:")
        print(f'    SELECT mean(kinetic_energy) FROM cfd_flow_metrics')
        print(f'    WHERE task_id=\'example_04\' GROUP BY time(10m)')

    print(f"\n{'=' * 60}")
    print(f"✅ InfluxDB 结果存储集成示例完成!")
    print(f"{'=' * 60}")

    print(f"\n存储模块总结:")
    print(f"  1. InfluxDBStorage: 支持 v1/v2 双版本, 自动缓冲")
    print(f"  2. ResultWriter: 批量写入, 定时刷新, 线程安全")
    print(f"  3. AsyncResultWriter: 异步队列写入, 后台线程")
    print(f"  4. ResultSerializer: 流动指标/场统计/任务事件/节点监控")
    print(f"\n注意事项:")
    print(f"  - 确保已安装 influxdb 或 influxdb-client")
    print(f"  - v1: pip install influxdb")
    print(f"  - v2: pip install influxdb-client")
    print(f"  - 在 .env 文件中配置连接参数")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n用户中断")
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
