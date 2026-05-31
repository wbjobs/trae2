# -*- coding: utf-8 -*-
"""
批量标定方案管理服务
Batch calibration scenario management service for multiple parameter sets comparison.
"""

import json
import os
import uuid
import hashlib
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass, field, asdict
import copy

from services.computation_service import ComputationService


@dataclass
class CalibrationScenario:
    """标定方案"""
    id: str = ""
    name: str = ""
    description: str = ""
    parameters: Dict[str, Any] = field(default_factory=dict)
    reference_lines: List[Tuple[float, float]] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    tags: List[str] = field(default_factory=list)
    result: Optional[Dict[str, Any]] = None
    status: str = "pending"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
            "reference_lines": self.reference_lines,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "tags": self.tags,
            "result": self.result,
            "status": self.status
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CalibrationScenario':
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            description=data.get("description", ""),
            parameters=data.get("parameters", {}),
            reference_lines=data.get("reference_lines", []),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            tags=data.get("tags", []),
            result=data.get("result"),
            status=data.get("status", "pending")
        )


@dataclass
class ComparisonSummary:
    """比对汇总"""
    scenario_ids: List[str] = field(default_factory=list)
    metric_names: List[str] = field(default_factory=list)
    best_scenario: Optional[str] = None
    worst_scenario: Optional[str] = None
    overall_ranking: List[str] = field(default_factory=list)
    comparison_matrix: Dict[str, Dict[str, Any]] = field(default_factory=dict)


class BatchCalibrationService:
    """批量标定方案管理器"""

    def __init__(self, storage_dir: str = "scenarios"):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)
        self.scenarios: Dict[str, CalibrationScenario] = {}
        self.computation = ComputationService()
        self._load_scenarios()

    def _load_scenarios(self) -> None:
        """从磁盘加载所有方案"""
        try:
            for filename in os.listdir(self.storage_dir):
                if filename.endswith('.json'):
                    filepath = os.path.join(self.storage_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        scenario = CalibrationScenario.from_dict(data)
                        if scenario.id:
                            self.scenarios[scenario.id] = scenario
                    except Exception:
                        continue
        except Exception:
            pass

    def _save_scenario(self, scenario: CalibrationScenario) -> None:
        """保存方案到磁盘"""
        try:
            filename = f"scenario_{scenario.id}.json"
            filepath = os.path.join(self.storage_dir, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(scenario.to_dict(), f, indent=2, ensure_ascii=False)
        except Exception as e:
            raise IOError(f"保存方案失败: {str(e)}")

    def _generate_id(self, name: str, parameters: Dict[str, Any]) -> str:
        """生成唯一方案ID"""
        content = f"{name}_{json.dumps(parameters, sort_keys=True)}"
        hash_str = hashlib.md5(content.encode()).hexdigest()[:8]
        return f"SC-{hash_str.upper()}"

    def create_scenario(
        self,
        name: str,
        parameters: Dict[str, Any],
        description: str = "",
        reference_lines: Optional[List[Tuple[float, float]]] = None,
        tags: Optional[List[str]] = None
    ) -> CalibrationScenario:
        """创建新标定方案"""
        scenario_id = self._generate_id(name, parameters)

        if scenario_id in self.scenarios:
            raise ValueError(f"方案已存在: {self.scenarios[scenario_id].name}")

        now = datetime.now().isoformat()
        scenario = CalibrationScenario(
            id=scenario_id,
            name=name,
            description=description,
            parameters=copy.deepcopy(parameters),
            reference_lines=reference_lines or [],
            created_at=now,
            updated_at=now,
            tags=tags or [],
            status="pending"
        )

        self.scenarios[scenario_id] = scenario
        self._save_scenario(scenario)
        return scenario

    def update_scenario(
        self,
        scenario_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
        reference_lines: Optional[List[Tuple[float, float]]] = None,
        tags: Optional[List[str]] = None
    ) -> Optional[CalibrationScenario]:
        """更新方案"""
        scenario = self.scenarios.get(scenario_id)
        if not scenario:
            return None

        if name is not None:
            scenario.name = name
        if description is not None:
            scenario.description = description
        if parameters is not None:
            scenario.parameters = copy.deepcopy(parameters)
        if reference_lines is not None:
            scenario.reference_lines = reference_lines
        if tags is not None:
            scenario.tags = tags

        scenario.updated_at = datetime.now().isoformat()
        scenario.status = "pending"
        scenario.result = None
        self._save_scenario(scenario)
        return scenario

    def delete_scenario(self, scenario_id: str) -> bool:
        """删除方案"""
        if scenario_id not in self.scenarios:
            return False

        del self.scenarios[scenario_id]
        try:
            filepath = os.path.join(self.storage_dir, f"scenario_{scenario_id}.json")
            if os.path.exists(filepath):
                os.remove(filepath)
        except Exception:
            pass
        return True

    def get_scenario(self, scenario_id: str) -> Optional[CalibrationScenario]:
        """获取单个方案"""
        return self.scenarios.get(scenario_id)

    def list_scenarios(
        self,
        tag_filter: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> List[CalibrationScenario]:
        """列出所有方案，支持过滤"""
        results = list(self.scenarios.values())

        if tag_filter:
            results = [s for s in results if tag_filter in s.tags]

        if status_filter:
            results = [s for s in results if s.status == status_filter]

        results.sort(key=lambda s: s.updated_at, reverse=True)
        return results

    def duplicate_scenario(self, scenario_id: str, new_name: str) -> Optional[CalibrationScenario]:
        """复制方案"""
        source = self.scenarios.get(scenario_id)
        if not source:
            return None

        return self.create_scenario(
            name=new_name,
            parameters=source.parameters,
            description=f"{source.description} (副本)",
            reference_lines=source.reference_lines,
            tags=source.tags
        )

    def run_scenario(self, scenario_id: str) -> Dict[str, Any]:
        """执行单个方案"""
        scenario = self.scenarios.get(scenario_id)
        if not scenario:
            return {"error": "方案不存在", "status": "error"}

        try:
            scenario.status = "running"
            scenario.updated_at = datetime.now().isoformat()

            params = scenario.parameters
            ref_lines = scenario.reference_lines

            self.computation.reset()

            sim_result = self.computation.simulate_full_spectrum(
                params=params,
                source_type=params.get("optical", {}).get("light_source_type", "White_LED"),
                add_emission_lines=True
            )

            if sim_result.get("status") != "success":
                scenario.status = "failed"
                scenario.result = {"error": sim_result.get("error", "仿真失败")}
                self._save_scenario(scenario)
                return {"error": sim_result.get("error", "仿真失败"), "status": "failed"}

            cal_result = self.computation.run_full_calibration(ref_lines)

            scenario.result = {
                "simulation": sim_result,
                "calibration": cal_result,
                "metrics": cal_result.get("metrics", {})
            }
            scenario.status = "completed"
            scenario.updated_at = datetime.now().isoformat()
            self._save_scenario(scenario)

            return {
                "status": "success",
                "scenario_id": scenario_id,
                "result": scenario.result
            }

        except Exception as e:
            scenario.status = "failed"
            scenario.result = {"error": str(e)}
            scenario.updated_at = datetime.now().isoformat()
            self._save_scenario(scenario)
            return {"error": str(e), "status": "failed"}

    def run_batch(
        self,
        scenario_ids: List[str],
        stop_on_error: bool = False
    ) -> Dict[str, Any]:
        """批量执行方案"""
        results = {
            "completed": [],
            "failed": [],
            "total": len(scenario_ids),
            "start_time": datetime.now().isoformat()
        }

        for scenario_id in scenario_ids:
            result = self.run_scenario(scenario_id)
            if result.get("status") == "success":
                results["completed"].append(scenario_id)
            else:
                results["failed"].append({
                    "scenario_id": scenario_id,
                    "error": result.get("error", "未知错误")
                })
                if stop_on_error:
                    break

        results["end_time"] = datetime.now().isoformat()
        return results

    def compare_scenarios(
        self,
        scenario_ids: List[str],
        metric_names: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """比对多个方案的标定结果"""
        default_metrics = [
            "wavelength_accuracy_nm",
            "wavelength_rmse",
            "intensity_accuracy_pct",
            "linearity_r2",
            "snr"
        ]
        metrics_to_compare = metric_names or default_metrics

        comparison = {
            "scenarios": {},
            "summary": {
                "best": {},
                "worst": {},
                "ranking": {}
            }
        }

        valid_scenarios = []
        for sid in scenario_ids:
            scenario = self.scenarios.get(sid)
            if scenario and scenario.status == "completed" and scenario.result:
                valid_scenarios.append(scenario)
                metrics = scenario.result.get("metrics", {})
                comparison["scenarios"][sid] = {
                    "name": scenario.name,
                    "metrics": {m: metrics.get(m, 0) for m in metrics_to_compare}
                }

        if not valid_scenarios:
            return {"error": "没有可比对的有效方案", "status": "error"}

        for metric in metrics_to_compare:
            values = []
            for scenario in valid_scenarios:
                val = scenario.result.get("metrics", {}).get(metric, 0)
                values.append((scenario.id, val))

            if "accuracy" in metric or "error" in metric or "rmse" in metric:
                values.sort(key=lambda x: x[1])
                best_id, best_val = values[0]
                worst_id, worst_val = values[-1]
            else:
                values.sort(key=lambda x: x[1], reverse=True)
                best_id, best_val = values[0]
                worst_id, worst_val = values[-1]

            comparison["summary"]["best"][metric] = {
                "scenario_id": best_id,
                "value": best_val
            }
            comparison["summary"]["worst"][metric] = {
                "scenario_id": worst_id,
                "value": worst_val
            }
            comparison["summary"]["ranking"][metric] = [v[0] for v in values]

        comparison["summary"]["scenario_names"] = {
            s.id: s.name for s in valid_scenarios
        }

        return {
            "status": "success",
            "comparison": comparison
        }

    def export_comparison_report(
        self,
        scenario_ids: List[str],
        format: str = "json"
    ) -> Dict[str, Any]:
        """导出比对报告"""
        compare_result = self.compare_scenarios(scenario_ids)
        if compare_result.get("status") != "success":
            return compare_result

        report = {
            "report_type": "batch_calibration_comparison",
            "generated_at": datetime.now().isoformat(),
            "scenario_count": len(scenario_ids),
            "comparison": compare_result.get("comparison", {}),
            "scenarios": []
        }

        for sid in scenario_ids:
            scenario = self.scenarios.get(sid)
            if scenario:
                report["scenarios"].append(scenario.to_dict())

        if format == "json":
            return {
                "status": "success",
                "format": "json",
                "report": report
            }

        return {"status": "success", "format": format, "report": report}

    def import_scenario_from_dict(self, data: Dict[str, Any]) -> CalibrationScenario:
        """从字典导入方案"""
        scenario = CalibrationScenario.from_dict(data)
        if not scenario.id:
            scenario.id = self._generate_id(scenario.name, scenario.parameters)
        if not scenario.created_at:
            scenario.created_at = datetime.now().isoformat()
        scenario.updated_at = datetime.now().isoformat()

        self.scenarios[scenario.id] = scenario
        self._save_scenario(scenario)
        return scenario

    def clear_results(self, scenario_ids: Optional[List[str]] = None) -> int:
        """清除方案结果，重置为待执行状态"""
        count = 0
        target_ids = scenario_ids or list(self.scenarios.keys())
        for sid in target_ids:
            scenario = self.scenarios.get(sid)
            if scenario:
                scenario.result = None
                scenario.status = "pending"
                scenario.updated_at = datetime.now().isoformat()
                self._save_scenario(scenario)
                count += 1
        return count
