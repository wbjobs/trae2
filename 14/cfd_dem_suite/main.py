import argparse
import sys
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from typing import Optional

from .config import SimulationConfig
from .scheduler import TaskScheduler, TaskPriority
from .kernel import CFDDEMSolver
from .adapter import CrossEnvironmentAdapter
from .backend import BackendIntegration

__version__ = "1.0.0"


def setup_logging(log_level: str = "INFO", log_file: Optional[str] = None) -> None:
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    handlers = [logging.StreamHandler()]
    
    if log_file:
        handlers.append(logging.FileHandler(log_file))
    
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format=log_format,
        handlers=handlers
    )


def print_banner() -> None:
    banner = """
    ╔══════════════════════════════════════════════════════════════╗
    ║                                                              ║
    ║   CFD-DEM 流体力学离散元数值仿真科学计算服务套件               ║
    ║   Computational Fluid Dynamics - Discrete Element Method      ║
    ║                                                              ║
    ║   Version: {version}                                         ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
    """.format(version=__version__)
    print(banner)


def check_environment(args) -> bool:
    print("\n[1/5] 环境检查...")
    
    adapter = CrossEnvironmentAdapter()
    validation = adapter.validate_environment()
    
    print(f"  环境类型: {validation['environment_type']}")
    print(f"  操作系统: {validation['system_info']['os']}")
    print(f"  Python版本: {validation['system_info']['python_version']}")
    print(f"  CPU核心: {validation['resources']['cpu_count']}")
    print(f"  可用内存: {validation['resources']['available_memory_gb']:.2f} GB")
    print(f"  GPU数量: {validation['resources']['gpu_count']}")
    
    if not validation['dependencies_ok']:
        print("\n  ⚠️  依赖检查失败:")
        if validation['missing_dependencies']:
            print(f"    缺失: {', '.join(validation['missing_dependencies'])}")
        if validation['version_mismatches']:
            print(f"    版本不匹配: {', '.join(validation['version_mismatches'])}")
        
        if args.auto_fix:
            print("\n  正在自动修复...")
            return adapter.setup_environment(auto_fix=True)
        return False
    
    print("  ✓ 环境检查通过")
    return True


def load_configuration(config_path: str) -> Optional[SimulationConfig]:
    print(f"\n[2/5] 加载配置: {config_path}")
    
    try:
        config = SimulationConfig(config_path)
        print("  ✓ 配置加载成功")
        print(f"    颗粒数量: {config.particle.count}")
        print(f"    时间步长: {config.simulation.time_step} s")
        print(f"    总时间: {config.simulation.total_time} s")
        print(f"    总步数: {int(config.simulation.total_time / config.simulation.time_step)}")
        return config
    except Exception as e:
        print(f"  ✗ 配置加载失败: {e}")
        return None


def run_simulation(config: SimulationConfig, args) -> bool:
    print("\n[3/5] 初始化仿真...")
    
    try:
        backend = BackendIntegration(config)
        backend.initialize()
        
        solver = CFDDEMSolver(config)
        print("  ✓ 求解器初始化成功")
        
        if backend.enabled:
            print("  ✓ 后端集成已启用")
        
        print("\n[4/5] 开始仿真计算...")
        
        def progress_callback(progress: float, state):
            bar_length = 40
            filled = int(bar_length * progress)
            bar = '█' * filled + '-' * (bar_length - filled)
            percentage = progress * 100
            
            sys.stdout.write(f"\r  进度: [{bar}] {percentage:.1f}% | "
                           f"步数: {state.current_step}/{state.total_steps} | "
                           f"时间: {state.current_time:.4f}s")
            sys.stdout.flush()
            
            if backend.enabled and state.current_step % config.backend.status_update_interval == 0:
                backend.report_task_progress(
                    config.backend.task_id or "local-task",
                    progress,
                    metadata={
                        "current_step": state.current_step,
                        "collision_count": state.collision_count
                    }
                )
        
        state = solver.run(progress_callback=progress_callback)
        
        print("\n\n  ✓ 仿真完成")
        print(f"    总碰撞次数: {state.collision_count}")
        print(f"    最终动能: {state.energy_kinetic:.6e} J")
        print(f"    最终势能: {state.energy_potential:.6e} J")
        
        print("\n[5/5] 导出结果...")
        from .output import ResultExporter
        exporter = ResultExporter(config)
        result_path = exporter.export_all(
            state,
            task_id=config.backend.task_id or "simulation",
            formats=args.formats.split(',') if args.formats else None
        )
        print(f"  ✓ 结果已导出到: {result_path}")
        
        if backend.enabled:
            backend.report_task_completed(
                config.backend.task_id or "local-task",
                result_path
            )
            print("  ✓ 结果已上报到后端")
        
        backend.shutdown()
        
        return True
        
    except KeyboardInterrupt:
        print("\n\n  ⚠️  用户中断")
        return False
    except Exception as e:
        print(f"\n  ✗ 仿真失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_scheduler_mode(args) -> None:
    print("\n调度模式启动...")
    
    adapter = CrossEnvironmentAdapter()
    context = adapter.get_execution_context()
    
    scheduler = TaskScheduler(
        max_workers=args.workers or context['recommended_workers']
    )
    
    print(f"  工作进程数: {scheduler.max_workers}")
    
    if args.config:
        config = SimulationConfig(args.config)
        task_id = scheduler.submit_task(
            config=config,
            name=Path(args.config).stem,
            priority=TaskPriority.NORMAL
        )
        print(f"  已提交任务: {task_id}")
    
    scheduler.start()
    print("\n调度器已启动，等待任务...")
    print("按 Ctrl+C 停止")
    
    try:
        while True:
            stats = scheduler.get_statistics()
            print(f"\r  队列: {stats['queue_size']} | "
                  f"运行中: {stats['active_workers']} | "
                  f"空闲: {stats['idle_workers']}", end="")
            sys.stdout.flush()
            import time
            time.sleep(2)
    except KeyboardInterrupt:
        print("\n\n正在停止调度器...")
    finally:
        scheduler.stop()
        print("调度器已停止")


def run_worker_mode(args) -> None:
    print("\n计算节点模式启动...")
    print("从后端服务获取任务...")
    
    config = SimulationConfig()
    backend = BackendIntegration(config)
    
    if not backend.initialize():
        print("  ✗ 无法连接到后端服务")
        return
    
    print("  ✓ 已连接到后端服务")
    print("  等待任务分配，按 Ctrl+C 停止")
    
    try:
        while True:
            task_data = backend.fetch_remote_task()
            if task_data:
                print(f"\n  收到新任务: {task_data.get('task_id')}")
                
                config_dict = task_data.get('config', {})
                config = SimulationConfig()
                config.raw_config = config_dict
                config._parse_config()
                
                backend.report_task_started(task_data['task_id'])
                print(f"  开始执行: {task_data['task_id']}")
                
                solver = CFDDEMSolver(config)
                
                def progress_callback(progress, state):
                    backend.report_task_progress(
                        task_data['task_id'],
                        progress,
                        metadata={
                            "current_step": state.current_step,
                            "collision_count": state.collision_count
                        }
                    )
                
                state = solver.run(progress_callback=progress_callback)
                
                from .output import ResultExporter
                exporter = ResultExporter(config)
                result_path = exporter.export_all(state, task_id=task_data['task_id'])
                
                backend.report_task_completed(task_data['task_id'], result_path)
                print(f"  ✓ 任务完成: {task_data['task_id']}")
            
            import time
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\n\n正在停止...")
    finally:
        backend.shutdown()
        print("已停止")


def main():
    load_dotenv()
    
    parser = argparse.ArgumentParser(
        description="CFD-DEM 流体力学离散元数值仿真科学计算服务套件",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 单任务仿真
  python -m cfd_dem_suite.main run --config examples/config.yaml
  
  # 调度器模式
  python -m cfd_dem_suite.main scheduler --workers 4
  
  # 计算节点模式（连接后端服务）
  python -m cfd_dem_suite.main worker
        """
    )
    
    parser.add_argument(
        "--version",
        action="version",
        version=f"CFD-DEM Suite v{__version__}"
    )
    
    parser.add_argument(
        "--log-level",
        default=os.getenv("LOG_LEVEL", "INFO"),
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="日志级别"
    )
    
    parser.add_argument(
        "--log-file",
        help="日志文件路径"
    )
    
    parser.add_argument(
        "--auto-fix",
        action="store_true",
        help="自动修复缺失的依赖"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="运行模式")
    
    run_parser = subparsers.add_parser("run", help="运行单个仿真任务")
    run_parser.add_argument(
        "--config", "-c",
        required=True,
        help="配置文件路径 (YAML/JSON)"
    )
    run_parser.add_argument(
        "--formats",
        help="输出格式，逗号分隔: hdf5,csv,vtk,json"
    )
    
    scheduler_parser = subparsers.add_parser("scheduler", help="任务调度器模式")
    scheduler_parser.add_argument(
        "--workers", "-w",
        type=int,
        help="工作进程数"
    )
    scheduler_parser.add_argument(
        "--config", "-c",
        help="初始任务配置文件"
    )
    
    subparsers.add_parser("worker", help="计算节点模式（连接后端服务）")
    
    args = parser.parse_args()
    
    setup_logging(args.log_level, args.log_file)
    print_banner()
    
    if not args.command:
        parser.print_help()
        return
    
    if args.command == "run":
        if not check_environment(args):
            print("\n环境检查失败，请修复后重试")
            sys.exit(1)
        
        config = load_configuration(args.config)
        if not config:
            sys.exit(1)
        
        success = run_simulation(config, args)
        sys.exit(0 if success else 1)
        
    elif args.command == "scheduler":
        run_scheduler_mode(args)
        
    elif args.command == "worker":
        run_worker_mode(args)


if __name__ == "__main__":
    main()
