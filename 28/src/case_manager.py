"""
工况管理模块
支持多工况定义、批量运行、结果对比分析
"""

import numpy as np
import logging
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Callable, Any
from pathlib import Path
import json
import time
from copy import deepcopy

from .config_parser import SimulationConfig, MaterialConfig, LayerConfig
from .mesh_generator import MeshGenerator, MeshData
from .fem_solver import ElasticityFEMSolver, FEMResult
from .post_processor import PostProcessor, StressStatistics

logger = logging.getLogger(__name__)


@dataclass
class CaseParameter:
    """工况参数定义"""
    name: str
    value: Any
    description: str = ""


@dataclass
class SimulationCase:
    """单个模拟工况"""
    case_id: str
    name: str
    config: SimulationConfig
    parameters: Dict[str, CaseParameter] = field(default_factory=dict)
    mesh_data: Optional[MeshData] = None
    result: Optional[FEMResult] = None
    statistics: Optional[StressStatistics] = None
    status: str = "pending"
    error_message: str = ""
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time

    def to_dict(self) -> Dict:
        return {
            'case_id': self.case_id,
            'name': self.name,
            'status': self.status,
            'duration': self.duration,
            'parameters': {k: v.value for k, v in self.parameters.items()},
            'error_message': self.error_message
        }


@dataclass
class CaseComparison:
    """工况对比结果"""
    metric_name: str
    case_values: Dict[str, float]
    best_case: str
    worst_case: str
    relative_difference: float


@dataclass
class CaseReport:
    """工况分析报告"""
    case_count: int
    successful: int = 0
    failed: int = 0
    total_time: float = 0.0
    comparisons: List[CaseComparison] = field(default_factory=list)
    case_summaries: List[Dict] = field(default_factory=list)


class CaseManager:
    """工况管理器"""

    def __init__(self, base_config: SimulationConfig, output_dir: str = "cases"):
        self.base_config = base_config
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.cases: Dict[str, SimulationCase] = {}
        self._case_counter = 0

    def create_case(self, name: str, parameter_modifications: Optional[Dict[str, Any]] = None) -> SimulationCase:
        """创建新工况"""
        self._case_counter += 1
        case_id = f"case_{self._case_counter:04d}"

        config = deepcopy(self.base_config)
        parameters = {}

        if parameter_modifications:
            config, parameters = self._modify_config(config, parameter_modifications)

        case = SimulationCase(
            case_id=case_id,
            name=name,
            config=config,
            parameters=parameters
        )
        self.cases[case_id] = case

        case_dir = self.output_dir / case_id
        case_dir.mkdir(parents=True, exist_ok=True)

        return case

    def _modify_config(self, config: SimulationConfig, modifications: Dict[str, Any]) -> tuple:
        """修改配置参数"""
        parameters = {}
        for key, value in modifications.items():
            parts = key.split('.')
            obj = config
            for part in parts[:-1]:
                obj = getattr(obj, part)
            old_value = getattr(obj, parts[-1])
            setattr(obj, parts[-1], value)
            parameters[key] = CaseParameter(name=key, value=value, description=f"{old_value} -> {value}")
        return config, parameters

    def create_parametric_study(self, param_name: str, param_values: List[Any],
                           base_name: str = "") -> List[SimulationCase]:
        """创建参数化研究工况组"""
        cases = []
        for i, value in enumerate(param_values):
            name = base_name or f"{param_name}_{value}"
            case = self.create_case(name, {param_name: value})
            cases.append(case)
        return cases

    def run_all(self, progress_callback: Optional[Callable] = None) -> CaseReport:
        """运行所有工况"""
        report = CaseReport(case_count=len(self.cases), successful=0, failed=0, total_time=0.0)

        for case_id, case in self.cases.items():
            logger.info(f"运行工况: {case.name} ({case_id})")
            case.start_time = time.time()

            try:
                case.status = "running"
                result = self._run_single_case(case)
                case.status = "completed" if result.is_valid() else "failed"
                if not result.is_valid():
                    case.error_message = "计算结果无效"
                    report.failed += 1
                else:
                    report.successful += 1
            except Exception as e:
                logger.error(f"工况 {case.name} 运行失败: {e}")
                case.status = "failed"
                case.error_message = str(e)
                report.failed += 1
            finally:
                case.end_time = time.time()
                report.total_time += case.duration
                report.case_summaries.append(case.to_dict())

                if progress_callback:
                    progress_callback(len(report.case_summaries), len(self.cases))

        report.comparisons = self._generate_comparisons()
        return report

    def _run_single_case(self, case: SimulationCase) -> FEMResult:
        """运行单个工况"""
        case_dir = self.output_dir / case.case_id

        mesh_gen = MeshGenerator(case.config)
        mesh_data = mesh_gen.generate()
        case.mesh_data = mesh_data
        mesh_data.save(str(case_dir / "mesh.json"))

        solver = ElasticityFEMSolver(case.config, mesh_data)
        result = solver.solve()
        case.result = result
        result.save(str(case_dir / "result.npz"))

        post = PostProcessor(case.config, mesh_data, result)
        stats = post.compute_statistics()
        case.statistics = stats

        return result

    def _generate_comparisons(self) -> List[CaseComparison]:
        """生成工况对比结果"""
        comparisons = []

        successful_cases = [c for c in self.cases.values() if c.status == "completed"]

        if len(successful_cases) < 2:
            return comparisons

        metrics = [
            ('max_von_mises', '最大Mises应力', lambda c: c.statistics.max_von_mises),
            ('mean_von_mises', '平均Mises应力', lambda c: c.statistics.mean_von_mises),
            ('max_displacement_magnitude', '最大位移', lambda c: c.statistics.max_displacement_magnitude),
            ('solve_time', '计算时间', lambda c: c.result.solve_time),
        ]

        for metric_key, metric_name, getter in metrics:
            try:
                values = {c.name: getter(c) for c in successful_cases if c.statistics}
                if not values:
                    continue

                vals = list(values.values())
                if metric_key == 'solve_time':
                    best_idx = np.argmin(vals)
                    worst_idx = np.argmax(vals)
                else:
                    best_idx = np.argmax(vals)
                    worst_idx = np.argmin(vals)

                best_case = list(values.keys())[best_idx]
                worst_case = list(values.keys())[worst_idx]
                best_val = vals[best_idx]
                worst_val = vals[worst_idx]
                rel_diff = (worst_val - best_val) / best_val * 100 if best_val != 0 else 0

                comparisons.append(CaseComparison(
                    metric_name=metric_name,
                    case_values=values,
                    best_case=best_case,
                    worst_case=worst_case,
                    relative_difference=float(rel_diff)
                ))
            except Exception as e:
                logger.warning(f"生成对比指标 {metric_name} 失败: {e}")

        return comparisons

    def get_case(self, case_id: str) -> Optional[SimulationCase]:
        """获取指定工况"""
        return self.cases.get(case_id)

    def save_report(self, report: CaseReport, filename: str = "case_report.json"):
        """保存工况报告"""
        report_data = {
            'case_count': report.case_count,
            'successful': report.successful,
            'failed': report.failed,
            'total_time': report.total_time,
            'comparisons': [asdict(c) for c in report.comparisons],
            'cases': report.case_summaries
        }

        with open(self.output_dir / filename, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        logger.info(f"工况报告已保存: {self.output_dir / filename}")

    def load_case(self, case_id: str) -> Optional[SimulationCase]:
        """从磁盘加载工况结果"""
        case_dir = self.output_dir / case_id
        if not case_dir.exists():
            case = self.cases.get(case_id)
            if case and (case_dir / "result.npz").exists():
                case.result = FEMResult.load(str(case_dir / "result.npz"))
            if case and (case_dir / "mesh.json").exists():
                case.mesh_data = MeshData.load(str(case_dir / "mesh.json"))
            return case
        return None
