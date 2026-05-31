import numpy as np
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import copy
import os
import time

from .params_parser import ParamsParser, DamGeometry, SoilLayer, BoundaryCondition
from .mesh_generator import MeshGenerator, MeshData
from .fem_solver import FEMSolver, FEMResult


@dataclass
class ScenarioConfig:
    name: str
    param_overrides: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScenarioResult:
    scenario_name: str
    fem_result: FEMResult
    mesh_data: MeshData
    params_parser: ParamsParser
    solve_time: float = 0.0
    statistics: Dict[str, Dict[str, float]] = field(default_factory=dict)


@dataclass
class ComparisonMetric:
    name: str
    values: Dict[str, float] = field(default_factory=dict)
    unit: str = ''


class MultiScenarioRunner:
    def __init__(self, base_config_path: str, output_dir: str = './output'):
        self.base_config_path = base_config_path
        self.output_dir = output_dir
        self.scenarios: List[ScenarioConfig] = []
        self.results: List[ScenarioResult] = []
        self.comparison_metrics: List[ComparisonMetric] = []

    def add_scenario(self, name: str, param_overrides: Dict[str, Any] = None) -> 'MultiScenarioRunner':
        self.scenarios.append(ScenarioConfig(name=name, param_overrides=param_overrides or {}))
        return self

    def add_water_level_scenarios(self, levels: List[float], name_prefix: str = 'WL') -> 'MultiScenarioRunner':
        for level in levels:
            self.add_scenario(
                f'{name_prefix}_{level:.1f}m',
                {'dam_geometry.reservoir_water_level': level}
            )
        return self

    def add_permeability_scenarios(self, factors: List[float], name_prefix: str = 'K') -> 'MultiScenarioRunner':
        for factor in factors:
            self.add_scenario(
                f'{name_prefix}_x{factor:.1f}',
                {'permeability_factor': factor}
            )
        return self

    def _build_params(self, scenario: ScenarioConfig) -> ParamsParser:
        base = ParamsParser(self.base_config_path)
        overrides = scenario.param_overrides

        if 'permeability_factor' in overrides:
            factor = overrides.pop('permeability_factor')
            for layer in base.soil_layers:
                layer.permeability_x *= factor
                layer.permeability_y *= factor

        for key, value in overrides.items():
            parts = key.split('.')
            obj = base
            for part in parts[:-1]:
                if hasattr(obj, part):
                    obj = getattr(obj, part)
                else:
                    break
            else:
                if hasattr(obj, parts[-1]):
                    setattr(obj, parts[-1], value)

        return base

    def run_all(self, progress_callback: Optional[callable] = None) -> List[ScenarioResult]:
        self.results = []
        total = len(self.scenarios)

        for idx, scenario in enumerate(self.scenarios):
            if progress_callback:
                progress_callback(idx, total, idx / total)

            scenario_dir = os.path.join(self.output_dir, f'scenario_{scenario.name}')
            os.makedirs(scenario_dir, exist_ok=True)

            params = self._build_params(scenario)

            generator = MeshGenerator(params)
            mesh_data = generator.generate_structured_mesh()

            solver = FEMSolver(params, mesh_data)
            start_time = time.time()

            sim_type = params.simulation_params.simulation_type if hasattr(params, 'simulation_params') else 'steady'
            if sim_type == 'transient':
                fem_result = solver.solve_transient()
            else:
                fem_result = solver.solve_steady_state()

            solve_time = time.time() - start_time

            statistics = self._compute_statistics(fem_result)

            scenario_result = ScenarioResult(
                scenario_name=scenario.name,
                fem_result=fem_result,
                mesh_data=mesh_data,
                params_parser=params,
                solve_time=solve_time,
                statistics=statistics
            )
            self.results.append(scenario_result)

            fem_result.save(os.path.join(scenario_dir, 'result.npz'))

        self._build_comparison_metrics()

        if progress_callback:
            progress_callback(total, total, 1.0)

        return self.results

    def _compute_statistics(self, result: FEMResult) -> Dict[str, Dict[str, float]]:
        valid_head = result.head[np.isfinite(result.head)]
        valid_pressure = result.pressure[np.isfinite(result.pressure)]
        valid_vel = result.velocity_magnitude[np.isfinite(result.velocity_magnitude)]
        valid_grad = result.hydraulic_gradient[np.isfinite(result.hydraulic_gradient)]

        return {
            'hydraulic_head': {
                'max': float(np.max(valid_head)) if len(valid_head) > 0 else 0,
                'min': float(np.min(valid_head)) if len(valid_head) > 0 else 0,
                'mean': float(np.mean(valid_head)) if len(valid_head) > 0 else 0
            },
            'pressure': {
                'max': float(np.max(valid_pressure) / 1000) if len(valid_pressure) > 0 else 0,
                'min': float(np.min(valid_pressure) / 1000) if len(valid_pressure) > 0 else 0,
                'mean': float(np.mean(valid_pressure) / 1000) if len(valid_pressure) > 0 else 0
            },
            'velocity': {
                'max': float(np.max(valid_vel)) if len(valid_vel) > 0 else 0,
                'min': float(np.min(valid_vel)) if len(valid_vel) > 0 else 0,
                'mean': float(np.mean(valid_vel)) if len(valid_vel) > 0 else 0
            },
            'hydraulic_gradient': {
                'max': float(np.max(valid_grad)) if len(valid_grad) > 0 else 0,
                'min': float(np.min(valid_grad)) if len(valid_grad) > 0 else 0,
                'mean': float(np.mean(valid_grad)) if len(valid_grad) > 0 else 0
            }
        }

    def _build_comparison_metrics(self):
        self.comparison_metrics = []

        metric_defs = [
            ('hydraulic_head', 'max', 'Max Head', 'm'),
            ('hydraulic_head', 'mean', 'Mean Head', 'm'),
            ('pressure', 'max', 'Max Pressure', 'kPa'),
            ('velocity', 'max', 'Max Velocity', 'm/s'),
            ('hydraulic_gradient', 'max', 'Max Gradient', '-'),
        ]

        for category, key, name, unit in metric_defs:
            metric = ComparisonMetric(name=name, unit=unit)
            for sr in self.results:
                if category in sr.statistics and key in sr.statistics[category]:
                    metric.values[sr.scenario_name] = sr.statistics[category][key]
            self.comparison_metrics.append(metric)

    def get_comparison_table(self) -> Dict[str, Dict[str, float]]:
        table = {}
        for metric in self.comparison_metrics:
            table[metric.name] = dict(metric.values)
        return table

    def compute_head_difference(self, scenario_name_1: str, scenario_name_2: str) -> Optional[np.ndarray]:
        r1 = self._find_result(scenario_name_1)
        r2 = self._find_result(scenario_name_2)
        if r1 is None or r2 is None:
            return None
        if r1.mesh_data.num_nodes != r2.mesh_data.num_nodes:
            return None
        return r1.fem_result.head - r2.fem_result.head

    def _find_result(self, name: str) -> Optional[ScenarioResult]:
        for sr in self.results:
            if sr.scenario_name == name:
                return sr
        return None
