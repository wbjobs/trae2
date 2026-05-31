import os
import sys
import argparse
import time
import traceback
from typing import Optional, Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.params_parser import ParamsParser
from src.mesh_generator import MeshGenerator
from src.fem_solver import FEMSolver
from src.post_processor import PostProcessor
from src.report_generator import ReportGenerator
from src.task_monitor import TaskMonitor, ProgressReporter, DistributedTaskManager


class SeepageAnalysisWorkflow:
    def __init__(self, config_path: str, output_dir: str = './output', 
                 use_monitor: bool = True):
        self.config_path = config_path
        self.output_dir = output_dir
        self.use_monitor = use_monitor
        
        self.params_parser: Optional[ParamsParser] = None
        self.mesh_generator: Optional[MeshGenerator] = None
        self.fem_solver: Optional[FEMSolver] = None
        self.post_processor: Optional[PostProcessor] = None
        self.report_generator: Optional[ReportGenerator] = None
        self.task_monitor: Optional[TaskMonitor] = None
        self.progress_reporter: Optional[ProgressReporter] = None
        
        self.mesh_data = None
        self.fem_result = None
        self.plot_paths: Dict[str, str] = {}
        self.statistics: Dict[str, Any] = {}
        
        os.makedirs(output_dir, exist_ok=True)
    
    def initialize_monitor(self, project_name: str = "Seepage Analysis"):
        log_file = os.path.join(self.output_dir, 'task_log.log')
        self.task_monitor = TaskMonitor(
            project_name=project_name,
            monitor_interval=0.5,
            enable_logging=True,
            log_file=log_file
        )
        self.progress_reporter = ProgressReporter(self.task_monitor)
        self.task_monitor.start()
    
    def run(self) -> bool:
        try:
            if self.use_monitor:
                project_name = os.path.splitext(os.path.basename(self.config_path))[0]
                self.initialize_monitor(project_name)
            
            self._step1_parse_params()
            self._step2_generate_mesh()
            self._step3_solve_fem()
            self._step4_post_process()
            self._step5_generate_report()
            
            if self.use_monitor and self.task_monitor:
                self.task_monitor.complete(self._get_result_summary())
                self.task_monitor.print_status()
            
            print("\n✓ 渗流场分析完成！")
            print(f"  输出目录: {os.path.abspath(self.output_dir)}")
            return True
            
        except Exception as e:
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            
            if self.use_monitor and self.task_monitor:
                self.task_monitor.fail(str(e))
                self.task_monitor.print_status()
            
            print(f"\n✗ 分析失败: {str(e)}")
            print(traceback.format_exc())
            return False
    
    def _step1_parse_params(self):
        print("\n[1/6] 解析工程参数...")
        
        self.params_parser = ParamsParser(self.config_path)
        
        is_valid, errors = self.params_parser.validate()
        if not is_valid:
            raise ValueError(f"参数验证失败:\n" + "\n".join(f"  - {e}" for e in errors))
        
        if self.progress_reporter:
            self.progress_reporter.params_parsing()
        
        print(f"  ✓ 土层数量: {len(self.params_parser.soil_layers)}")
        print(f"  ✓ 边界条件: {len(self.params_parser.boundary_conditions)}")
    
    def _step2_generate_mesh(self):
        print("\n[2/6] 生成有限元网格...")
        
        self.mesh_generator = MeshGenerator(self.params_parser)
        self.mesh_data = self.mesh_generator.generate_structured_mesh()
        
        if self.progress_reporter:
            self.progress_reporter.mesh_generation()
        
        print(f"  ✓ 节点数: {self.mesh_data.num_nodes}")
        print(f"  ✓ 单元数: {self.mesh_data.num_elements}")
        print(f"  ✓ 网格尺寸: {self.mesh_data.mesh_size:.2f} m")
    
    def _step3_solve_fem(self):
        print("\n[3/6] 有限元求解...")
        
        self.fem_solver = FEMSolver(self.params_parser, self.mesh_data)
        
        sim_type = self.params_parser.simulation_params.simulation_type
        
        def progress_callback(current, total, progress):
            if self.progress_reporter:
                self.progress_reporter.solving(current, total)
        
        if sim_type == 'steady_state':
            print("  求解类型: 稳态渗流")
            self.fem_result = self.fem_solver.solve_steady_state(
                progress_callback=progress_callback
            )
        else:
            print("  求解类型: 瞬态渗流")
            self.fem_result = self.fem_solver.solve_transient(
                progress_callback=progress_callback
            )
        
        print(f"  ✓ 计算时间: {self.fem_result.solve_time:.2f} s")
        print(f"  ✓ 收敛状态: {'收敛' if self.fem_result.converged else '未收敛'}")
    
    def _step4_post_process(self):
        print("\n[4/6] 结果后处理...")
        
        self.post_processor = PostProcessor(
            self.params_parser,
            self.mesh_data,
            self.fem_result,
            self.output_dir
        )
        
        print("  生成可视化图表...")
        self.plot_paths = self.post_processor.generate_all_plots()
        
        print("  导出数据文件...")
        data_files = self.post_processor.export_data()
        
        print("  计算统计信息...")
        self.statistics = self.post_processor.get_statistics()
        
        if self.progress_reporter:
            self.progress_reporter.post_processing()
        
        print(f"  ✓ 生成图表: {len(self.plot_paths)} 个")
        print(f"  ✓ 导出数据: {len(data_files)} 个文件")
    
    def _step5_generate_report(self):
        print("\n[5/6] 生成分析报告...")
        
        self.report_generator = ReportGenerator(
            self.output_dir,
            project_name=os.path.splitext(os.path.basename(self.config_path))[0]
        )
        
        report_path = self.report_generator.generate_report(
            self.params_parser,
            self.mesh_data,
            self.fem_result,
            self.plot_paths,
            self.statistics
        )
        
        if self.progress_reporter:
            self.progress_reporter.report_generation()
            self.progress_reporter.finalizing()
        
        print(f"  ✓ 报告已生成: {os.path.basename(report_path)}")
    
    def _get_result_summary(self) -> Dict:
        return {
            'num_nodes': self.mesh_data.num_nodes if self.mesh_data else 0,
            'num_elements': self.mesh_data.num_elements if self.mesh_data else 0,
            'solve_time': self.fem_result.solve_time if self.fem_result else 0,
            'converged': self.fem_result.converged if self.fem_result else False,
            'max_head': self.statistics.get('hydraulic_head', {}).get('max', 0),
            'max_pressure': self.statistics.get('pressure', {}).get('max', 0),
            'max_velocity': self.statistics.get('velocity', {}).get('max', 0),
            'num_plots': len(self.plot_paths)
        }


def main():
    parser = argparse.ArgumentParser(
        description='尾矿库坝体渗流场有限元分析工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python main.py --config config/example_config.yaml
  python main.py --config config/example_config.yaml --output ./results
  python main.py --config config/example_config.yaml --no-monitor
        """
    )
    
    parser.add_argument(
        '--config', '-c',
        type=str,
        required=False,
        help='配置文件路径 (YAML/JSON)'
    )
    
    parser.add_argument(
        '--output', '-o',
        type=str,
        default='./output',
        help='输出目录 (默认: ./output)'
    )
    
    parser.add_argument(
        '--no-monitor',
        action='store_true',
        help='禁用任务监控'
    )
    
    parser.add_argument(
        '--example',
        type=str,
        nargs='?',
        const='config/example_config.yaml',
        help='生成示例配置文件 (可选: 指定输出路径)'
    )
    
    args = parser.parse_args()
    
    if args.example:
        generate_example_config(args.example)
        return
    
    if not args.config:
        print("错误: 必须指定配置文件 (--config)")
        print("使用 --example 生成示例配置文件")
        print("使用 -h 查看帮助信息")
        sys.exit(1)
    
    if not os.path.exists(args.config):
        print(f"错误: 配置文件不存在: {args.config}")
        print("使用 --example 生成示例配置文件")
        sys.exit(1)
    
    workflow = SeepageAnalysisWorkflow(
        config_path=args.config,
        output_dir=args.output,
        use_monitor=not args.no_monitor
    )
    
    success = workflow.run()
    sys.exit(0 if success else 1)


def generate_example_config(output_path: str):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    example_config = """# 尾矿库坝体渗流场有限元分析配置文件示例

# 坝体几何参数
dam_geometry:
  dam_height: 30.0           # 坝高 (m)
  crest_width: 8.0            # 坝顶宽度 (m)
  upstream_slope: 2.5         # 上游坡度 (1:m)
  downstream_slope: 2.0       # 下游坡度 (1:m)
  foundation_depth: 10.0      # 基础深度 (m)
  reservoir_water_level: 28.0 # 库水位 (m)
  tailwater_level: 2.0        # 下游水位 (m)
  dam_length: 100.0           # 坝长 (m)

# 土层材料参数
soil_layers:
  - name: "坝体填土"
    thickness: 30.0
    permeability_x: 1.0e-5
    permeability_y: 5.0e-6
    porosity: 0.35
    density: 2000.0
    saturation: 1.0
  
  - name: "基础层"
    thickness: 15.0
    permeability_x: 1.0e-6
    permeability_y: 1.0e-6
    porosity: 0.30
    density: 2100.0
    saturation: 1.0

# 边界条件
boundary_conditions:
  - type: "head"
    location: "upstream"
    value: 28.0
    description: "上游库水位边界"
  
  - type: "head"
    location: "downstream"
    value: 2.0
    description: "下游水位边界"
  
  - type: "flow"
    location: "bottom"
    value: 0.0
    description: "底部不透水边界"

# 计算参数
simulation_params:
  simulation_type: "steady_state"  # steady_state 或 transient
  max_iterations: 1000
  convergence_tolerance: 1.0e-6
  time_step: 1.0
  total_time: 100.0

# 网格参数
mesh_params:
  element_type: "quad4"
  mesh_size: 2.0
  refinement_level: 1
  boundary_refinement: false
  max_aspect_ratio: 5.0

# 输出参数
output_params:
  output_dir: "./output"
  save_vtk: true
  save_numpy: true
  generate_report: true
  plot_contours: true
  plot_vectors: false

# 集群配置 (可选)
cluster_config:
  enabled: false
  num_processes: 4
  scheduler: "local"
  queue_name: "default"
  wall_time: "02:00:00"
  nodes: 1
  tasks_per_node: 1
"""
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(example_config)
    
    print(f"✓ 示例配置文件已生成: {output_path}")


if __name__ == '__main__':
    main()
