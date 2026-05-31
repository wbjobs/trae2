"""
地质剖面应力场有限元模拟计算工具集
主程序入口
"""

import os
import sys
import argparse
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.config_parser import ConfigParser
from src.mesh_generator import MeshGenerator
from src.fem_solver import ElasticityFEMSolver
from src.post_processor import PostProcessor
from src.report_generator import ReportGenerator
from src.distributed_computing import DistributedSolver, create_solver_config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('simulation.log')
    ]
)
logger = logging.getLogger(__name__)


def run_simulation(config_path: str, output_dir: str, enable_visualization: bool = True,
                   enable_report: bool = True, computation_mode: str = 'local') -> dict:
    """
    运行完整的地质剖面应力场模拟流程

    Args:
        config_path: 配置文件路径
        output_dir: 输出目录
        enable_visualization: 是否启用可视化
        enable_report: 是否生成报告
        computation_mode: 计算模式 (local/distributed/cluster)

    Returns:
        模拟结果摘要
    """
    logger.info("=" * 60)
    logger.info("开始地质剖面应力场有限元模拟")
    logger.info("=" * 60)

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    config_parser = ConfigParser(config_path)
    config = config_parser.load_config()

    if not config_parser.validate_config():
        raise ValueError("配置验证失败，请检查配置文件")

    solver_config = create_solver_config(
        mode=computation_mode,
        monitoring_url=None,
        enable_monitoring=True
    )
    distributed_solver = DistributedSolver(solver_config)

    def _simulation_pipeline(progress_callback=None):
        if progress_callback:
            progress_callback(0, "开始网格生成...")

        mesh_generator = MeshGenerator(config)
        mesh_data = mesh_generator.generate()

        mesh_file = output_path / 'mesh_data.json'
        mesh_data.save(str(mesh_file))

        if progress_callback:
            progress_callback(20, "网格生成完成，开始有限元求解...")

        fem_solver = ElasticityFEMSolver(config, mesh_data)
        fem_result = fem_solver.solve()

        result_file = output_path / 'fem_results.npz'
        fem_result.save(str(result_file))

        if progress_callback:
            progress_callback(60, "有限元求解完成，开始后处理...")

        post_processor = PostProcessor(config, mesh_data, fem_result)
        statistics = post_processor.compute_statistics()

        visual_files = []
        if enable_visualization:
            visual_dir = output_path / 'visualizations'
            visual_files = post_processor.generate_visualizations(str(visual_dir))

        data_dir = output_path / 'data'
        post_processor.export_data(str(data_dir))

        if progress_callback:
            progress_callback(85, "后处理完成，生成报告...")

        report_file = None
        if enable_report:
            report_generator = ReportGenerator(config, mesh_data, fem_result, statistics, visual_files)
            report_file = report_generator.generate_report(str(output_path))

        if progress_callback:
            progress_callback(100, "模拟完成!")

        return {
            'config': config,
            'mesh_data': mesh_data,
            'fem_result': fem_result,
            'statistics': statistics,
            'visual_files': visual_files,
            'report_file': report_file
        }

    results = distributed_solver.run_distributed(
        task_name="地质剖面应力场模拟",
        solver_func=_simulation_pipeline
    )

    logger.info("=" * 60)
    logger.info("模拟完成!")
    logger.info(f"输出目录: {output_path.absolute()}")
    if results.get('report_file'):
        logger.info(f"分析报告: {results['report_file']}")
    logger.info("=" * 60)

    return results


def main():
    parser = argparse.ArgumentParser(
        description='地质剖面应力场有限元模拟计算工具集',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例用法:
  python main.py --config config/default_config.yaml --output results
  python main.py --config my_config.yaml --output results --no-visual
  python main.py --mode distributed --config config.yaml
        """
    )

    parser.add_argument(
        '--config', '-c',
        type=str,
        default='config/default_config.yaml',
        help='配置文件路径 (默认: config/default_config.yaml)'
    )

    parser.add_argument(
        '--output', '-o',
        type=str,
        default='results',
        help='输出目录路径 (默认: results)'
    )

    parser.add_argument(
        '--no-visual',
        action='store_true',
        help='禁用可视化生成'
    )

    parser.add_argument(
        '--no-report',
        action='store_true',
        help='禁用报告生成'
    )

    parser.add_argument(
        '--mode', '-m',
        type=str,
        default='local',
        choices=['local', 'distributed', 'cluster'],
        help='计算模式 (默认: local)'
    )

    parser.add_argument(
        '--validate-only',
        action='store_true',
        help='仅验证配置文件，不执行模拟'
    )

    args = parser.parse_args()

    if args.validate_only:
        logger.info("配置验证模式...")
        try:
            config_parser = ConfigParser(args.config)
            config_parser.load_config()
            if config_parser.validate_config():
                logger.info("配置文件验证通过!")
                return 0
            else:
                logger.error("配置文件验证失败!")
                return 1
        except Exception as e:
            logger.error(f"配置验证出错: {e}")
            return 1

    try:
        run_simulation(
            config_path=args.config,
            output_dir=args.output,
            enable_visualization=not args.no_visual,
            enable_report=not args.no_report,
            computation_mode=args.mode
        )
        return 0
    except Exception as e:
        logger.error(f"模拟执行失败: {e}", exc_info=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
