#!/usr/bin/env python3
"""
示例2: 分布式任务调度演示
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import numpy as np
from config import (
    CFDConfig, GridConfig, SimulationConfig,
    BoundaryCondition, PriorityLevel
)
from scheduler.tasks import task_manager, compute_shard_task, run_simulation_task
from scheduler.task_scheduler import TaskScheduler, SimulationJob, JobStatus
from preprocessing import DataLoader, GridSharder


def example_task_submission():
    """演示任务提交和管理"""
    print("=" * 60)
    print("示例: 分布式任务调度演示")
    print("=" * 60)

    nx, ny = 64, 64
    num_shards = 4

    grid_config = GridConfig(nx=nx, ny=ny)
    sim_config = SimulationConfig(dt=0.001, nu=0.01, iterations=100)
    config = CFDConfig(
        grid=grid_config, sim=sim_config,
        priority=PriorityLevel.HIGH, num_shards=num_shards
    )

    print(f"\n1. 生成初始数据...")
    loader = DataLoader()
    u, v, p = loader.generate_initial(nx, ny, 'taylor_green')

    print(f"2. 创建网格分片...")
    sharder = GridSharder(grid_config, num_shards)
    shards_u = sharder.split(u)
    shards_v = sharder.split(v)
    shards_p = sharder.split(p)

    print(f"3. 使用 TaskScheduler 提交模拟作业...")
    scheduler = TaskScheduler(max_concurrent_jobs=2)

    def on_submitted(job):
        print(f"   作业 {job.job_id[:8]}... 已提交 (优先级: {job.priority.value})")

    def on_started(job):
        print(f"   作业 {job.job_id[:8]}... 已启动")

    scheduler.on_job_submitted(on_submitted)
    scheduler.on_job_started(on_started)

    job_id = scheduler.submit(
        config=config,
        initial_conditions={'u': u, 'v': v, 'p': p}
    )
    print(f"   已提交模拟作业: {job_id[:8]}...")

    print(f"\n4. 查询作业状态...")
    job = scheduler.get_job(job_id)
    if job:
        print(f"   状态: {job.status.value}")
        print(f"   优先级: {job.priority.value}")
        print(f"   提交时间: {job.submitted_at}")

    print(f"\n5. 查看调度统计...")
    stats = scheduler.get_stats()
    for key, value in stats.items():
        if isinstance(value, dict):
            print(f"   {key}:")
            for k, v in value.items():
                print(f"     {k}: {v}")
        else:
            print(f"   {key}: {value}")

    print(f"\n6. 提交第二个低优先级作业...")
    config_low = CFDConfig(
        grid=grid_config, sim=sim_config,
        priority=PriorityLevel.LOW, num_shards=num_shards
    )
    job_id_2 = scheduler.submit(
        config=config_low,
        initial_conditions={'u': np.ones_like(u), 'v': np.zeros_like(v), 'p': p}
    )
    print(f"   已提交低优先级作业: {job_id_2[:8]}...")

    print(f"\n7. 取消低优先级作业...")
    if scheduler.cancel_job(job_id_2):
        print(f"   作业已取消")
    else:
        print(f"   作业取消失败 (可能已完成)")

    print(f"\n8. 更新所有作业状态...")
    statuses = scheduler.update_all_statuses()
    for jid, status in statuses.items():
        print(f"   作业 {jid[:8]}...: {status.value if status else 'Unknown'}")

    print(f"\n9. 列出所有作业...")
    for job_dict in scheduler.list_all_jobs():
        print(f"   {job_dict['job_id'][:8]}...: {job_dict['status']} "
              f"(优先级: {job_dict['priority']})")

    print(f"\n✅ 分布式任务调度示例完成!")
    print("\n注意: 要实际运行分布式任务，请确保:")
    print("  1. Redis 服务已运行 (redis-server)")
    print("  2. 启动 Celery Worker: python main.py start-worker")
    print("  3. 使用 run_simulation_task.delay() 提交任务")
    return scheduler


def example_celery_workflow():
    """演示 Celery 任务工作流"""
    print("\n" + "=" * 60)
    print("Celery 任务工作流演示")
    print("=" * 60)

    print("\n可用的 Celery 任务:")
    print("  1. compute_shard_task - 分片计算任务")
    print("  2. run_simulation_task - 完整模拟任务")
    print("  3. process_and_store_results - 结果存储任务")
    print("  4. monitor_node_task - 节点监控任务")

    print("\n任务优先级 (Redis 队列 x-max-priority=15):")
    print("  - LOW = 0")
    print("  - NORMAL = 5")
    print("  - HIGH = 10")
    print("  - CRITICAL = 15")

    print("\n任务路由配置:")
    print("  compute_shard_task       -> compute 队列")
    print("  run_simulation_task      -> simulation 队列")
    print("  process_and_store_results -> storage 队列")
    print("  monitor_node_task        -> monitoring 队列")

    print("\n示例代码:")
    print('''
    # 异步提交分片计算任务
    result = compute_shard_task.apply_async(
        args=[u_shard, v_shard, p_shard, shard_dict,
              grid_dict, sim_dict, iterations],
        priority=10,
        queue='compute'
    )

    # 等待结果
    task_result = result.get(timeout=60)

    # 使用 Celery group 并行执行多个分片
    from celery import group
    job = group(
        compute_shard_task.s(u1, v1, p1, shard1, grid, sim, 100),
        compute_shard_task.s(u2, v2, p2, shard2, grid, sim, 100),
    )
    result = job.apply_async()
    results = result.get(timeout=120)

    # 使用 TaskManager 提交完整模拟
    from scheduler.tasks import task_manager
    job_id = task_manager.submit_simulation(config)
    status = task_manager.get_job_status(job_id)
    ''')


if __name__ == '__main__':
    try:
        example_task_submission()
        example_celery_workflow()
    except KeyboardInterrupt:
        print("\n用户中断")
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
