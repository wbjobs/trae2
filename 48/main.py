"""
边坡稳定性有限元分析工具集 - 主入口程序
========================================

使用示例:
    # 单工况分析
    python main.py --config examples/example_params.json

    # 多工况分析
    python main.py --scenarios examples/multi_scenario_params.json --mode scenarios

    # 启用快照功能
    python main.py --config examples/example_params.json --snapshot --snapshot-interval 10

    # 从快照恢复
    python main.py --restore output/snapshots/snapshot_xxx.pkl

    # 分布式运行
    python main.py --config examples/example_params.json --mode distributed
"""

import os
import sys
import argparse
import logging
import time
from typing import Optional, List, Dict, Any

import yaml

from slope_fem import (
    SlopeParameters,
    MeshGenerator,
    FEMSolver,
    StrengthReductionAnalysis,
    ResultsProcessor,
    Visualizer,
    ReportGenerator,
    ScenarioGenerator,
    ScenarioRunner,
    ParameterType,
    ParameterVariation,
    ScenarioComparison,
    ComparisonReportGenerator,
    SnapshotManager,
    IncrementalSnapshot,
    SnapshotState,
)
from slope_fem.distributed import DistributedSolver, ComputationMode
from slope_fem.monitor import MonitorClient, AnalysisMonitor, ResourceMonitor
from slope_fem.scenarios import Scenario, ScenarioResult

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('slope_analysis.log', encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)


def load_parameters(config_path: str) -> SlopeParameters:
    """加载参数文件"""
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"配置文件不存在: {config_path}")

    ext = os.path.splitext(config_path)[1].lower()

    if ext == '.json':
        params = SlopeParameters.from_json(config_path)
    elif ext in ['.yaml', '.yml']:
        params = SlopeParameters.from_yaml(config_path)
    else:
        raise ValueError(f"不支持的配置文件格式: {ext}")

    logger.info("参数文件加载成功")

    if not params.validate():
        logger.error("参数验证失败:")
        for error in params.errors:
            logger.error(f"  - {error}")
        raise ValueError("参数验证失败")

    logger.info("参数验证通过")
    return params


def load_multi_scenario_config(config_path: str) -> Dict[str, Any]:
    """加载多工况配置文件"""
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"多工况配置文件不存在: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        if config_path.endswith('.json'):
            import json
            config = json.load(f)
        else:
            config = yaml.safe_load(f)

    return config


def run_single_analysis(params: SlopeParameters, output_dir: str = "output",
                          computation_mode: str = "local",
                          monitor_enabled: bool = False,
                          monitor_url: str = "",
                          enable_snapshot: bool = False,
                          snapshot_interval: int = 10,
                          restore_snapshot: Optional[str] = None) -> dict:
    """运行单工况边坡稳定性分析"""

    os.makedirs(output_dir, exist_ok=True)

    snapshot_manager = None
    incremental_snapshot = None

    if enable_snapshot:
        snapshot_dir = os.path.join(output_dir, "snapshots")
        snapshot_manager = SnapshotManager(snapshot_dir=snapshot_dir)
        incremental_snapshot = IncrementalSnapshot(
            snapshot_manager,
            save_interval=snapshot_interval,
            max_snapshots=20
        )
        logger.info(f"已启用快照功能，保存间隔: {snapshot_interval} 步")

    monitor_client = None
    analysis_monitor = None
    resource_monitor = None

    if monitor_enabled and monitor_url:
        monitor_client = MonitorClient(
            server_url=monitor_url,
            enabled=True,
            update_interval=5.0
        )
        analysis_monitor = AnalysisMonitor(monitor_client)
        analysis_monitor.start_analysis(params.project_info.name)

        resource_monitor = ResourceMonitor(monitor_client)
        resource_monitor.start(interval=10.0)

    try:
        mode = ComputationMode(computation_mode)
    except ValueError:
        logger.warning(f"未知计算模式: {computation_mode}, 使用本地模式")
        mode = ComputationMode.LOCAL

    logger.info("=" * 60)
    logger.info("边坡稳定性有限元分析开始")
    logger.info("=" * 60)
    logger.info(params.summary())
    logger.info("=" * 60)

    start_time = time.time()

    solver = DistributedSolver(mode=mode)

    def progress_callback(progress: float, factor: float):
        logger.info(f"分析进度: {progress:.1f}%, 当前折减系数: {factor:.2f}")
        if analysis_monitor:
            analysis_monitor.update_progress(
                progress,
                f"强度折减分析 (F={factor:.2f})",
                f"当前折减系数: {factor:.2f}"
            )

    if analysis_monitor:
        analysis_monitor.update_progress(5.0, "网格生成", "正在生成有限元网格...")

    results = solver.run_distributed_analysis(params, progress_callback=progress_callback)

    if analysis_monitor:
        analysis_monitor.update_progress(70.0, "结果后处理", "正在处理计算结果...")

    mesh = results["mesh"]
    fem_result = results["final_fem_result"]
    sr_result = results["sr_result"]

    processor = ResultsProcessor(mesh, params)
    processed = processor.process_results(fem_result)

    stats = processor.compute_statistics(processed)
    logger.info("=" * 60)
    logger.info("计算结果统计:")
    logger.info(f"  安全系数 (FOS): {sr_result.factor_of_safety:.3f}")
    logger.info(f"  临界折减系数: {sr_result.critical_reduction_factor:.3f}")
    logger.info(f"  最大位移: {stats['displacement']['max_magnitude'] * 1000:.3f} mm")
    logger.info(f"  最大剪应力: {stats['stress']['max_shear'] / 1e6:.3f} MPa")
    logger.info("=" * 60)

    if analysis_monitor:
        analysis_monitor.update_progress(85.0, "可视化", "正在生成可视化结果...")

    visualizer = Visualizer(mesh, params)
    visualizer.output_dir = output_dir

    plot_files = visualizer.generate_all_plots(processed, sr_result, save=True)
    logger.info(f"已生成 {len(plot_files)} 个可视化结果")

    visualizer.export_to_vtk(processed, filename="results.vtk")
    logger.info("已导出VTK结果文件")

    if analysis_monitor:
        analysis_monitor.update_progress(95.0, "报告生成", "正在生成分析报告...")

    report_generator = ReportGenerator(output_dir=output_dir)
    report_data = report_generator.prepare_report_data(
        params, mesh, fem_result, processed, sr_result, processor
    )

    html_report = report_generator.generate_html_report(report_data, plot_files)
    json_report = report_generator.generate_json_report(report_data)

    summary = report_generator.generate_summary_text(report_data)
    logger.info("\n" + summary)

    logger.info(f"HTML报告已生成: {html_report}")
    logger.info(f"JSON报告已生成: {json_report}")

    total_time = time.time() - start_time
    logger.info("=" * 60)
    logger.info(f"分析完成, 总耗时: {total_time:.2f} 秒")
    logger.info(f"结果保存在: {os.path.abspath(output_dir)}")
    logger.info("=" * 60)

    if analysis_monitor:
        analysis_monitor.complete_analysis({
            "factor_of_safety": sr_result.factor_of_safety,
            "critical_reduction_factor": sr_result.critical_reduction_factor,
            "compute_time": total_time,
            "output_dir": os.path.abspath(output_dir)
        })

    if resource_monitor:
        resource_monitor.stop()

    return {
        "factor_of_safety": sr_result.factor_of_safety,
        "critical_reduction_factor": sr_result.critical_reduction_factor,
        "total_time": total_time,
        "output_dir": os.path.abspath(output_dir),
        "html_report": html_report,
        "json_report": json_report,
        "plot_files": plot_files,
        "mesh": mesh,
        "processed_results": processed,
        "sr_result": sr_result
    }


def run_scenarios_analysis(scenario_config: Dict[str, Any], output_dir: str = "output",
                            parallel: bool = False, max_workers: int = 4) -> Dict[str, Any]:
    """运行多工况分析"""

    os.makedirs(output_dir, exist_ok=True)

    logger.info("=" * 60)
    logger.info("多工况边坡稳定性对比分析开始")
    logger.info("=" * 60)

    baseline_config_path = scenario_config.get("baseline_config")
    if not baseline_config_path:
        raise ValueError("多工况配置中缺少 baseline_config")

    baseline_params = load_parameters(baseline_config_path)
    logger.info(f"基准工况配置已加载: {baseline_config_path}")

    scenario_generator = ScenarioGenerator(baseline_params)

    variations = scenario_config.get("variations", [])
    scenarios = []

    for var_config in variations:
        param_type = ParameterType(var_config["param_type"])
        variation = ParameterVariation(
            param_path=var_config["param_path"],
            param_type=param_type,
            values=var_config["values"],
            description=var_config.get("description", ""),
            layer_index=var_config.get("layer_index"),
            boundary_name=var_config.get("boundary_name")
        )
        scenario_generator.add_variation(variation)
        logger.info(f"已添加参数变化: {var_config['param_path']} -> {var_config['values']}")

    scenarios = scenario_generator.generate_scenarios()
    logger.info(f"共生成 {len(scenarios)} 个工况")

    scenario_runner = ScenarioRunner(output_dir=os.path.join(output_dir, "scenarios"))

    def compute_func(params: SlopeParameters) -> Dict:
        """工况计算函数"""
        try:
            result = run_single_analysis(
                params=params,
                output_dir=os.path.join(output_dir, "scenarios", "temp_" + str(id(params))),
                computation_mode="local",
                monitor_enabled=False,
                enable_snapshot=False
            )

            mesh_stats = params.mesh_settings.to_dict() if hasattr(params.mesh_settings, 'to_dict') else {}

            return {
                "factor_of_safety": result["factor_of_safety"],
                "max_displacement": result.get("processed_results", {}).get("displacement", {}).get("max_magnitude", 0.0),
                "max_shear_stress": result.get("processed_results", {}).get("stress", {}).get("max_shear", 0.0),
                "compute_time": result["total_time"],
                "mesh_stats": mesh_stats
            }
        except Exception as e:
            logger.error(f"工况计算失败: {e}")
            return {
                "factor_of_safety": 0.0,
                "max_displacement": 0.0,
                "max_shear_stress": 0.0,
                "compute_time": 0.0,
                "mesh_stats": {},
                "error": str(e)
            }

    logger.info(f"开始运行 {len(scenarios)} 个工况，并行模式: {parallel}")
    results = scenario_runner.run_all(
        scenarios=scenarios,
        compute_func=compute_func,
        parallel=parallel,
        max_workers=max_workers
    )

    logger.info(f"工况运行完成，成功: {len([r for r in results if r.status == 'completed'])}, "
                f"失败: {len([r for r in results if r.status == 'failed'])}")

    comparison = ScenarioComparison(results)
    comparison_data = comparison.compute_comparison()

    summary_table = comparison.get_summary_table()
    logger.info("\n" + summary_table)

    plots_output_dir = os.path.join(output_dir, "comparison_plots")
    plots = comparison.generate_all_plots(plots_output_dir)

    comparison_json_path = os.path.join(output_dir, "comparison_results.json")
    comparison.to_json(comparison_json_path)

    report_generator = ComparisonReportGenerator(comparison)
    html_report_path = os.path.join(output_dir, "comparison_report.html")
    report_generator.generate_html_report(html_report_path, plots)

    summary_path = scenario_runner.save_summary("scenarios_summary.json")

    logger.info("=" * 60)
    logger.info("多工况分析完成")
    logger.info(f"对比报告: {os.path.abspath(html_report_path)}")
    logger.info(f"对比数据: {os.path.abspath(comparison_json_path)}")
    logger.info("=" * 60)

    return {
        "num_scenarios": len(scenarios),
        "results": results,
        "comparison": comparison,
        "plots": plots,
        "html_report": html_report_path,
        "json_report": comparison_json_path,
        "summary": summary_path
    }


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="边坡稳定性有限元分析工具集 v2.0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 单工况分析
  python main.py --config examples/example_params.json

  # 多工况分析
  python main.py --scenarios examples/multi_scenario_params.json --mode scenarios

  # 多工况并行分析
  python main.py --scenarios examples/multi_scenario_params.json --mode scenarios --parallel --max-workers 4

  # 启用快照功能
  python main.py --config examples/example_params.json --snapshot --snapshot-interval 10

  # 从快照恢复
  python main.py --restore output/snapshots/snapshot_xxx_data.pkl

  # 分布式运行
  python main.py --config examples/example_params.json --mode distributed

  # 启用监控
  python main.py --config examples/example_params.json --monitor --monitor-url http://localhost:8080
        """
    )

    config_group = parser.add_mutually_exclusive_group(required=True)
    config_group.add_argument(
        "--config", "-c",
        type=str,
        help="单工况参数配置文件路径 (JSON或YAML格式)"
    )
    config_group.add_argument(
        "--scenarios", "-s",
        type=str,
        help="多工况配置文件路径 (JSON或YAML格式)"
    )
    config_group.add_argument(
        "--restore",
        type=str,
        help="从快照文件恢复计算"
    )

    parser.add_argument(
        "--output", "-o",
        type=str,
        default="output",
        help="输出目录路径"
    )

    parser.add_argument(
        "--mode", "-m",
        type=str,
        choices=["local", "distributed", "cluster", "scenarios"],
        default="local",
        help="计算模式: local(本地), distributed(分布式), cluster(集群), scenarios(多工况)"
    )

    parser.add_argument(
        "--parallel",
        action="store_true",
        help="启用多工况并行计算"
    )

    parser.add_argument(
        "--max-workers",
        type=int,
        default=4,
        help="并行计算最大工作进程数 (默认: 4)"
    )

    parser.add_argument(
        "--monitor",
        action="store_true",
        help="启用任务监控"
    )

    parser.add_argument(
        "--monitor-url",
        type=str,
        default="http://localhost:8080",
        help="监控服务器URL"
    )

    parser.add_argument(
        "--snapshot",
        action="store_true",
        help="启用计算状态快照保存"
    )

    parser.add_argument(
        "--snapshot-interval",
        type=int,
        default=10,
        help="快照保存间隔 (迭代步数，默认: 10)"
    )

    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="启用详细日志输出"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        if args.restore:
            logger.info(f"从快照恢复计算: {args.restore}")
            print("快照恢复功能：请在代码中自定义恢复逻辑")
            return 0

        if args.scenarios or args.mode == "scenarios":
            if not args.scenarios:
                parser.error("多工况模式需要指定 --scenarios 参数")
            scenario_config = load_multi_scenario_config(args.scenarios)
            results = run_scenarios_analysis(
                scenario_config=scenario_config,
                output_dir=args.output,
                parallel=args.parallel,
                max_workers=args.max_workers
            )

            logger.info("多工况分析成功完成!")
            print(f"\n工况数量: {results['num_scenarios']}")
            print(f"对比报告: {results['html_report']}")
            return 0

        params = load_parameters(args.config)
        results = run_single_analysis(
            params=params,
            output_dir=args.output,
            computation_mode=args.mode,
            monitor_enabled=args.monitor,
            monitor_url=args.monitor_url,
            enable_snapshot=args.snapshot,
            snapshot_interval=args.snapshot_interval
        )

        logger.info("分析成功完成!")
        print(f"\n安全系数 FOS = {results['factor_of_safety']:.3f}")
        print(f"总计算时间: {results['total_time']:.2f} 秒")
        print(f"结果目录: {results['output_dir']}")
        print(f"HTML报告: {results['html_report']}")

        return 0

    except Exception as e:
        logger.error(f"分析失败: {e}", exc_info=True)
        print(f"\n错误: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
