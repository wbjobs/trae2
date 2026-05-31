"""
多工况管理模块
=============

支持多工况边坡对比模拟，包括参数敏感性分析、
不同设计方案对比、参数批量调整等功能。
"""

import os
import copy
import json
import yaml
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any, Callable
from enum import Enum
import numpy as np

from .parameters import SlopeParameters, SoilLayer, BoundaryCondition, SlopeGeometry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ParameterType(Enum):
    """参数类型"""
    GEOMETRY = "geometry"
    SOIL_LAYER = "soil_layer"
    BOUNDARY = "boundary"
    ANALYSIS = "analysis"
    MESH = "mesh"


@dataclass
class ParameterVariation:
    """参数变化定义"""
    param_path: str
    param_type: ParameterType
    values: List[Any]
    description: str = ""
    layer_index: Optional[int] = None
    boundary_name: Optional[str] = None


@dataclass
class Scenario:
    """工况定义"""
    scenario_id: str
    name: str
    parameters: SlopeParameters
    description: str = ""
    tags: List[str] = field(default_factory=list)
    is_baseline: bool = False
    result: Optional[Dict] = None
    status: str = "pending"
    error: Optional[str] = None


@dataclass
class ScenarioResult:
    """工况结果"""
    scenario_id: str
    name: str
    factor_of_safety: float
    max_displacement: float
    max_shear_stress: float
    compute_time: float
    mesh_stats: Dict
    result_data: Dict
    status: str = "completed"
    error: Optional[str] = None


class ScenarioGenerator:
    """工况生成器"""

    def __init__(self, baseline_params: SlopeParameters):
        self.baseline_params = baseline_params
        self.scenarios: List[Scenario] = []
        self.variations: List[ParameterVariation] = []

    def add_variation(self, variation: ParameterVariation) -> None:
        """添加参数变化"""
        self.variations.append(variation)
        logger.info(f"添加参数变化: {variation.param_path} -> {variation.values}")

    def generate_scenarios(self) -> List[Scenario]:
        """生成所有工况组合"""
        self.scenarios = []

        baseline_scenario = Scenario(
            scenario_id="baseline",
            name="基准工况",
            parameters=copy.deepcopy(self.baseline_params),
            description="原始设计参数",
            is_baseline=True,
            tags=["baseline"]
        )
        self.scenarios.append(baseline_scenario)

        if not self.variations:
            return self.scenarios

        scenario_count = 0
        for variation in self.variations:
            for i, value in enumerate(variation.values):
                scenario_id = f"{variation.param_path.replace('.', '_')}_{i}"
                scenario_name = f"{variation.description or variation.param_path} = {value}"

                new_params = copy.deepcopy(self.baseline_params)
                self._apply_variation(new_params, variation, value)

                scenario = Scenario(
                    scenario_id=scenario_id,
                    name=scenario_name,
                    parameters=new_params,
                    description=f"{variation.description}: {value}",
                    tags=[variation.param_path],
                    is_baseline=False
                )
                self.scenarios.append(scenario)
                scenario_count += 1

        logger.info(f"生成了 {scenario_count + 1} 个工况 (1个基准 + {scenario_count}个变化)")
        return self.scenarios

    def _apply_variation(self, params: SlopeParameters, variation: ParameterVariation, value: Any) -> None:
        """应用参数变化"""
        path_parts = variation.param_path.split('.')

        if variation.param_type == ParameterType.GEOMETRY:
            obj = params.geometry
        elif variation.param_type == ParameterType.ANALYSIS:
            obj = params.analysis_settings
        elif variation.param_type == ParameterType.MESH:
            obj = params.mesh_settings
        elif variation.param_type == ParameterType.SOIL_LAYER:
            if variation.layer_index is not None and variation.layer_index < len(params.soil_layers):
                obj = params.soil_layers[variation.layer_index]
            else:
                logger.warning(f"土层索引无效: {variation.layer_index}")
                return
        elif variation.param_type == ParameterType.BOUNDARY:
            if variation.boundary_name and variation.boundary_name in params.boundary_conditions:
                obj = params.boundary_conditions[variation.boundary_name]
            else:
                logger.warning(f"边界名称无效: {variation.boundary_name}")
                return
        else:
            logger.warning(f"未知参数类型: {variation.param_type}")
            return

        current = obj
        for part in path_parts[:-1]:
            if hasattr(current, part):
                current = getattr(current, part)
            else:
                logger.warning(f"属性不存在: {part}")
                return

        if hasattr(current, path_parts[-1]):
            setattr(current, path_parts[-1], value)
            logger.debug(f"设置参数 {variation.param_path} = {value}")
        else:
            logger.warning(f"属性不存在: {path_parts[-1]}")

    def generate_sensitivity_analysis(self, param_path: str, param_type: ParameterType,
                                       base_value: float, variations: List[float],
                                       description: str = "",
                                       layer_index: Optional[int] = None,
                                       boundary_name: Optional[str] = None) -> List[Scenario]:
        """生成敏感性分析工况"""
        scenarios = []

        baseline_scenario = Scenario(
            scenario_id=f"{param_path}_baseline",
            name=f"{description or param_path} = {base_value} (基准)",
            parameters=copy.deepcopy(self.baseline_params),
            description=f"基准值: {base_value}",
            is_baseline=True,
            tags=["sensitivity", param_path]
        )
        scenarios.append(baseline_scenario)

        for i, delta in enumerate(variations):
            new_value = base_value + delta
            if new_value <= 0:
                continue

            scenario_id = f"{param_path.replace('.', '_')}_{i}"
            scenario_name = f"{description or param_path} = {new_value:.3f}"

            new_params = copy.deepcopy(self.baseline_params)
            variation = ParameterVariation(
                param_path=param_path,
                param_type=param_type,
                values=[new_value],
                description=description,
                layer_index=layer_index,
                boundary_name=boundary_name
            )
            self._apply_variation(new_params, variation, new_value)

            scenario = Scenario(
                scenario_id=scenario_id,
                name=scenario_name,
                parameters=new_params,
                description=f"变化量: {delta:+.3f}",
                tags=["sensitivity", param_path],
                is_baseline=False
            )
            scenarios.append(scenario)

        logger.info(f"生成了 {len(scenarios)} 个敏感性分析工况")
        return scenarios

    def generate_parametric_study(self, param_definitions: List[Dict]) -> List[Scenario]:
        """生成参数化研究工况"""
        scenarios = []

        for param_def in param_definitions:
            param_path = param_def["param_path"]
            param_type = ParameterType(param_def["param_type"])
            values = param_def["values"]
            description = param_def.get("description", "")
            layer_index = param_def.get("layer_index")
            boundary_name = param_def.get("boundary_name")

            for i, value in enumerate(values):
                scenario_id = f"param_{param_path.replace('.', '_')}_{i}"
                scenario_name = f"{description or param_path} = {value}"

                new_params = copy.deepcopy(self.baseline_params)
                variation = ParameterVariation(
                    param_path=param_path,
                    param_type=param_type,
                    values=[value],
                    description=description,
                    layer_index=layer_index,
                    boundary_name=boundary_name
                )
                self._apply_variation(new_params, variation, value)

                scenario = Scenario(
                    scenario_id=scenario_id,
                    name=scenario_name,
                    parameters=new_params,
                    description=scenario_name,
                    tags=["parametric", param_path],
                    is_baseline=False
                )
                scenarios.append(scenario)

        logger.info(f"生成了 {len(scenarios)} 个参数化研究工况")
        return scenarios


class ScenarioRunner:
    """工况运行器"""

    def __init__(self, output_dir: str = "output/scenarios"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        self.results: List[ScenarioResult] = []

    def run_scenario(self, scenario: Scenario,
                      compute_func: Callable[[SlopeParameters], Dict],
                      save_results: bool = True) -> ScenarioResult:
        """运行单个工况"""
        logger.info(f"开始运行工况: {scenario.name} ({scenario.scenario_id})")
        scenario.status = "running"

        try:
            result = compute_func(scenario.parameters)

            scenario_result = ScenarioResult(
                scenario_id=scenario.scenario_id,
                name=scenario.name,
                factor_of_safety=result.get("factor_of_safety", 0.0),
                max_displacement=result.get("max_displacement", 0.0),
                max_shear_stress=result.get("max_shear_stress", 0.0),
                compute_time=result.get("compute_time", 0.0),
                mesh_stats=result.get("mesh_stats", {}),
                result_data=result,
                status="completed"
            )

            scenario.result = result
            scenario.status = "completed"

            if save_results:
                self._save_scenario_result(scenario, scenario_result)

            logger.info(f"工况完成: {scenario.name}, FOS = {scenario_result.factor_of_safety:.3f}")
            self.results.append(scenario_result)
            return scenario_result

        except Exception as e:
            logger.error(f"工况运行失败 {scenario.name}: {e}")
            scenario.status = "failed"
            scenario.error = str(e)

            return ScenarioResult(
                scenario_id=scenario.scenario_id,
                name=scenario.name,
                factor_of_safety=0.0,
                max_displacement=0.0,
                max_shear_stress=0.0,
                compute_time=0.0,
                mesh_stats={},
                result_data={},
                status="failed",
                error=str(e)
            )

    def run_all(self, scenarios: List[Scenario],
                compute_func: Callable[[SlopeParameters], Dict],
                parallel: bool = False,
                max_workers: int = 4) -> List[ScenarioResult]:
        """运行所有工况"""
        logger.info(f"开始运行 {len(scenarios)} 个工况")
        self.results = []

        if parallel:
            return self._run_parallel(scenarios, compute_func, max_workers)
        else:
            for scenario in scenarios:
                result = self.run_scenario(scenario, compute_func)
                self.results.append(result)
            return self.results

    def _run_parallel(self, scenarios: List[Scenario],
                       compute_func: Callable[[SlopeParameters], Dict],
                       max_workers: int) -> List[ScenarioResult]:
        """并行运行工况"""
        try:
            from concurrent.futures import ProcessPoolExecutor, as_completed
        except ImportError:
            logger.warning("并行计算不可用，使用串行模式")
            return self.run_all(scenarios, compute_func, parallel=False)

        results = []
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            future_to_scenario = {
                executor.submit(self._run_scenario_worker, scenario, compute_func): scenario
                for scenario in scenarios
            }

            for future in as_completed(future_to_scenario):
                scenario = future_to_scenario[future]
                try:
                    result = future.result()
                    results.append(result)
                    scenario.status = result.status
                    scenario.result = result.result_data
                except Exception as e:
                    logger.error(f"工况执行异常 {scenario.name}: {e}")
                    results.append(ScenarioResult(
                        scenario_id=scenario.scenario_id,
                        name=scenario.name,
                        factor_of_safety=0.0,
                        max_displacement=0.0,
                        max_shear_stress=0.0,
                        compute_time=0.0,
                        mesh_stats={},
                        result_data={},
                        status="failed",
                        error=str(e)
                    ))

        self.results = results
        return results

    def _run_scenario_worker(self, scenario: Scenario,
                              compute_func: Callable[[SlopeParameters], Dict]) -> ScenarioResult:
        """工作进程运行单个工况"""
        try:
            result = compute_func(scenario.parameters)
            return ScenarioResult(
                scenario_id=scenario.scenario_id,
                name=scenario.name,
                factor_of_safety=result.get("factor_of_safety", 0.0),
                max_displacement=result.get("max_displacement", 0.0),
                max_shear_stress=result.get("max_shear_stress", 0.0),
                compute_time=result.get("compute_time", 0.0),
                mesh_stats=result.get("mesh_stats", {}),
                result_data=result,
                status="completed"
            )
        except Exception as e:
            return ScenarioResult(
                scenario_id=scenario.scenario_id,
                name=scenario.name,
                factor_of_safety=0.0,
                max_displacement=0.0,
                max_shear_stress=0.0,
                compute_time=0.0,
                mesh_stats={},
                result_data={},
                status="failed",
                error=str(e)
            )

    def _save_scenario_result(self, scenario: Scenario, result: ScenarioResult) -> None:
        """保存工况结果"""
        scenario_dir = os.path.join(self.output_dir, scenario.scenario_id)
        os.makedirs(scenario_dir, exist_ok=True)

        result_file = os.path.join(scenario_dir, "result.json")
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump({
                "scenario_id": scenario.scenario_id,
                "name": scenario.name,
                "description": scenario.description,
                "factor_of_safety": result.factor_of_safety,
                "max_displacement": result.max_displacement,
                "max_shear_stress": result.max_shear_stress,
                "compute_time": result.compute_time,
                "mesh_stats": result.mesh_stats,
                "status": result.status,
                "error": result.error
            }, f, ensure_ascii=False, indent=4)

        params_file = os.path.join(scenario_dir, "parameters.json")
        scenario.parameters.save_json(params_file)

    def save_summary(self, filename: str = "scenarios_summary.json") -> str:
        """保存所有工况汇总"""
        filepath = os.path.join(self.output_dir, filename)

        summary = {
            "total_scenarios": len(self.results),
            "completed": len([r for r in self.results if r.status == "completed"]),
            "failed": len([r for r in self.results if r.status == "failed"]),
            "results": [
                {
                    "scenario_id": r.scenario_id,
                    "name": r.name,
                    "factor_of_safety": r.factor_of_safety,
                    "max_displacement": r.max_displacement,
                    "max_shear_stress": r.max_shear_stress,
                    "compute_time": r.compute_time,
                    "status": r.status,
                    "error": r.error
                }
                for r in self.results
            ]
        }

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=4)

        logger.info(f"工况汇总已保存: {filepath}")
        return filepath

    def get_results(self) -> List[ScenarioResult]:
        """获取所有结果"""
        return self.results.copy()
