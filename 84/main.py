#!/usr/bin/env python3
"""
CFD 并行计算调度系统 - 主入口
"""
import click
import sys
import logging
from typing import Optional
from datetime import datetime
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from config import (
    CFDConfig, GridConfig, SimulationConfig,
    PriorityLevel, BoundaryCondition, SimulationType
)
from preprocessing import DataLoader, GridSharder, DataCleaner, DataValidator
from cfd_compute import NavierStokesSolver, compute_flow_metrics
from monitoring import NodeMonitor, TaskMonitor, AlertManager
from storage import InfluxDBStorage, ResultWriter


@click.group()
@click.version_option(version='1.0.0')
def cli():
    """CFD 并行计算调度系统 - 流体力学离散数据并行计算"""
    pass


@cli.command()
@click.option('--nx', default=128, type=int, help='X方向网格数')
@click.option('--ny', default=128, type=int, help='Y方向网格数')
@click.option('--iterations', default=500, type=int, help='迭代次数')
@click.option('--dt', default=0.001, type=float, help='时间步长')
@click.option('--nu', default=0.01, type=float, help='粘性系数')
@click.option('--initial-condition', default='taylor_green', 
              type=click.Choice(['taylor_green', 'uniform', 'shear', 'cylinder', 'rest']),
              help='初始条件类型')
@click.option('--num-shards', default=4, type=int, help='分片数量')
@click.option('--priority', default='normal', 
              type=click.Choice(['low', 'normal', 'high', 'critical']),
              help='任务优先级')
@click.option('--save-interval', default=10, type=int, help='保存间隔')
@click.option('--store/--no-store', default=False, help='是否存储结果到InfluxDB')
@click.option('--monitor/--no-monitor', default=True, help='是否启用节点监控')
def run_local(nx, ny, iterations, dt, nu, initial_condition, 
              num_shards, priority, save_interval, store, monitor):
    """本地运行 CFD 模拟（单节点）"""
    click.echo(f"🚀 启动本地 CFD 模拟")
    click.echo(f"   网格: {nx}x{ny}, 迭代: {iterations}, dt: {dt}, nu: {nu}")
    click.echo(f"   初始条件: {initial_condition}, 分片: {num_shards}")
    
    priority_map = {
        'low': PriorityLevel.LOW,
        'normal': PriorityLevel.NORMAL,
        'high': PriorityLevel.HIGH,
        'critical': PriorityLevel.CRITICAL
    }
    
    grid_config = GridConfig(
        nx=nx, ny=ny,
        bc_x=BoundaryCondition.PERIODIC,
        bc_y=BoundaryCondition.PERIODIC
    )
    sim_config = SimulationConfig(
        dt=dt, nu=nu,
        iterations=iterations,
        save_interval=save_interval
    )
    cfd_config = CFDConfig(
        grid=grid_config,
        sim=sim_config,
        priority=priority_map[priority],
        num_shards=num_shards
    )
    
    node_monitor = None
    if monitor:
        node_monitor = NodeMonitor(interval=2.0)
        node_monitor.start()
        click.echo("   节点监控已启动")
    
    task_monitor = TaskMonitor()
    alert_manager = AlertManager()
    
    if node_monitor:
        def on_metrics(metrics):
            alert_manager.check_system_metrics(metrics)
        node_monitor.add_callback(on_metrics)
    
    try:
        loader = DataLoader()
        u, v, p = loader.generate_initial(
            nx, ny, condition_type=initial_condition
        )
        click.echo(f"   ✓ 初始条件已生成")
        
        cleaner = DataCleaner()
        u, v, p = cleaner.clean_velocity(u, v, p)
        click.echo(f"   ✓ 数据已清洗")
        
        validator = DataValidator(grid_config)
        validation = validator.validate_full(u, v, p, nu, dt)
        if not validation['valid']:
            click.echo(f"   ⚠️  数据验证警告:")
            for err in validation['errors'][:5]:
                click.echo(f"      - {err}")
        else:
            click.echo(f"   ✓ 数据验证通过")
        
        sharder = GridSharder(grid_config, num_shards)
        click.echo(f"   ✓ 网格分片完成 ({num_shards} 片)")
        
        solver = NavierStokesSolver(cfd_config)
        click.echo(f"   开始计算...")
        
        start_time = datetime.now()
        results = solver.solve(u, v, p, iterations, save_interval)
        elapsed = (datetime.now() - start_time).total_seconds()
        
        click.echo(f"\n✅ 计算完成!")
        click.echo(f"   总耗时: {elapsed:.2f} 秒")
        click.echo(f"   迭代速度: {iterations/elapsed:.2f} 迭代/秒")
        
        final_u = results['final_u']
        final_v = results['final_v']
        final_p = results['final_p']
        
        metrics = compute_flow_metrics(
            final_u, final_v, final_p,
            grid_config.dx, grid_config.dy, dt, nu
        )
        click.echo(f"\n📊 最终流动指标:")
        click.echo(f"   动能: {metrics.kinetic_energy:.6e}")
        click.echo(f"   耗散率: {metrics.dissipation:.6e}")
        click.echo(f"   雷诺数: {metrics.reynolds_number:.2f}")
        click.echo(f"   CFL数: {metrics.cfl_number:.4f}")
        click.echo(f"   最大涡量: {metrics.max_vorticity:.4f}")
        click.echo(f"   最大速度: {metrics.max_velocity_magnitude:.4f}")
        
        if store:
            click.echo(f"\n💾 存储结果到 InfluxDB...")
            storage = InfluxDBStorage(use_v2=False)
            writer = ResultWriter(storage=storage)
            
            task_tags = {
                'task_id': 'local_run',
                'initial_condition': initial_condition,
                'nx': str(nx),
                'ny': str(ny)
            }
            
            for frame in results['history']:
                metrics_frame = compute_flow_metrics(
                    frame['u'], frame['v'], frame['p'],
                    grid_config.dx, grid_config.dy, dt, nu
                )
                writer.write_flow_metrics(
                    metrics=metrics_frame.to_dict(),
                    iteration=frame['iteration'],
                    time_val=frame['time'],
                    tags=task_tags
                )
            writer.flush()
            writer.close()
            click.echo(f"   ✓ 已存储 {len(results['history'])} 帧数据")
        
        return results
        
    except KeyboardInterrupt:
        click.echo("\n⏹️  用户中断")
    except Exception as e:
        click.echo(f"\n❌ 错误: {e}")
        logger.exception("模拟失败")
        sys.exit(1)
    finally:
        if node_monitor and node_monitor.is_running():
            node_monitor.stop()
            click.echo("   节点监控已停止")
        
        stats = task_monitor.get_stats()
        click.echo(f"\n📈 任务统计:")
        for key, value in stats.items():
            if isinstance(value, float):
                click.echo(f"   {key}: {value:.4f}")
            else:
                click.echo(f"   {key}: {value}")


@cli.command()
@click.option('--host', default='localhost', help='Redis主机')
@click.option('--port', default=6379, type=int, help='Redis端口')
@click.option('--queue', default='celery', help='队列名称')
@click.option('--concurrency', default=4, type=int, help='并发数')
def start_worker(host, port, queue, concurrency):
    """启动 Celery 计算节点"""
    click.echo(f"🚀 启动 Celery Worker")
    click.echo(f"   Broker: redis://{host}:{port}/0")
    click.echo(f"   队列: {queue}, 并发: {concurrency}")
    
    import subprocess
    import sys
    
    cmd = [
        sys.executable, '-m', 'celery',
        '-A', 'scheduler.celery_app',
        'worker',
        '--loglevel=info',
        f'--concurrency={concurrency}',
        f'--queues={queue}'
    ]
    
    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        click.echo("\n⏹️  Worker 已停止")
    except subprocess.CalledProcessError as e:
        click.echo(f"❌ Worker 启动失败: {e}")
        sys.exit(1)


@cli.command()
@click.option('--interval', default=5.0, type=float, help='监控间隔(秒)')
@click.option('--duration', default=0, type=int, help='监控时长(秒), 0表示持续')
def monitor(interval, duration):
    """监控计算节点状态"""
    click.echo(f"📡 启动节点监控 (间隔: {interval}s)")
    
    monitor = NodeMonitor(interval=interval)
    
    def print_metrics(metrics):
        click.echo(
            f"\rCPU: {metrics.cpu_percent:5.1f}% | "
            f"内存: {metrics.memory_percent:5.1f}% ({metrics.memory_used_gb:.1f}GB) | "
            f"网络: ↓{metrics.network_in_mbps:5.2f} ↑{metrics.network_out_mbps:5.2f} Mbps",
            nl=False
        )
    
    monitor.add_callback(print_metrics)
    
    try:
        monitor.start()
        click.echo("   按 Ctrl+C 停止")
        
        if duration > 0:
            import time
            time.sleep(duration)
        else:
            while True:
                import time
                time.sleep(1)
    
    except KeyboardInterrupt:
        click.echo("\n\n⏹️  监控已停止")
    finally:
        if monitor.is_running():
            monitor.stop()
        
        health = monitor.get_health_report()
        click.echo(f"\n📊 健康报告:")
        click.echo(f"   节点: {health['node_name']}")
        click.echo(f"   状态: {health['status']}")
        click.echo(f"   健康: {'✅ 是' if health['healthy'] else '❌ 否'}")
        if health.get('issues'):
            for issue in health['issues']:
                click.echo(f"   问题: {issue}")


@cli.command()
@click.option('--nx', default=64, type=int, help='X方向网格数')
@click.option('--ny', default=64, type=int, help='Y方向网格数')
@click.option('--num-shards', default=2, type=int, help='分片数量')
def test_grid(nx, ny, num_shards):
    """测试网格分片功能"""
    click.echo(f"🧪 测试网格分片")
    click.echo(f"   网格: {nx}x{ny}, 分片: {num_shards}")
    
    grid_config = GridConfig(nx=nx, ny=ny)
    sharder = GridSharder(grid_config, num_shards)
    
    for i, shard in enumerate(sharder.shards):
        click.echo(f"   分片 {i}: x=[{shard.x_start}:{shard.x_end}], "
                   f"y=[{shard.y_start}:{shard.y_end}], "
                   f"shape={shard.shape}, "
                   f"left={shard.has_left}, right={shard.has_right}")
    
    test_data = np.random.rand(nx, ny)
    shards = sharder.split(test_data)
    click.echo(f"\n   分片数据: {len(shards)} 片")
    for shard, data in shards:
        click.echo(f"   分片 {shard.shard_id}: shape={data.shape}")
    
    merged = sharder.merge(shards)
    click.echo(f"\n   合并验证: {'✅ 通过' if np.allclose(merged, test_data) else '❌ 失败'}")
    
    return sharder


@cli.command()
def status():
    """显示系统状态"""
    click.echo("📋 系统状态")
    click.echo("=" * 50)
    
    from scheduler.celery_app import get_active_tasks_count
    from config import settings
    
    click.echo(f"   节点名称: {settings.node_name}")
    click.echo(f"   最大工作线程: {settings.node_max_workers}")
    click.echo(f"   Broker: {settings.celery_broker_url}")
    click.echo(f"   InfluxDB: {settings.influxdb_url}")
    click.echo(f"   默认网格: {settings.cfd_default_nx}x{settings.cfd_default_ny}")
    click.echo(f"   默认迭代: {settings.cfd_default_iterations}")
    
    try:
        from storage import InfluxDBStorage
        storage = InfluxDBStorage(use_v2=False)
        db_status = "✅ 已连接" if storage.is_connected() else "⚠️  未连接"
        click.echo(f"   数据库状态: {db_status}")
        storage.close()
    except Exception as e:
        click.echo(f"   数据库状态: ❌ 错误 - {e}")
    
    click.echo("=" * 50)


if __name__ == '__main__':
    cli()
