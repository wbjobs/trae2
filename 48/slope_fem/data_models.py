"""
数据模型模块
============

定义解耦的数据结构，使计算内核与后处理模块独立运行。
使用标准化的数据接口，便于模块间数据交换和扩展。
"""

import numpy as np
from dataclasses import dataclass, field, asdict
from typing import Dict, Optional, List, Any, Tuple
from enum import Enum
import json
import pickle


class AnalysisStatus(Enum):
    """分析状态"""
    PENDING = "pending"
    RUNNING = "running"
    CONVERGED = "converged"
    FAILED = "failed"
    INTERRUPTED = "interrupted"


@dataclass
class MeshInfo:
    """网格信息（独立于具体网格对象）"""
    num_nodes: int
    num_elements: int
    node_coords: np.ndarray
    element_connectivity: np.ndarray
    element_materials: np.ndarray
    boundaries: Dict[str, List[int]]
    statistics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "num_nodes": self.num_nodes,
            "num_elements": self.num_elements,
            "node_coords": self.node_coords.tolist(),
            "element_connectivity": self.element_connectivity.tolist(),
            "element_materials": self.element_materials.tolist(),
            "boundaries": self.boundaries,
            "statistics": self.statistics
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "MeshInfo":
        """从字典创建"""
        return cls(
            num_nodes=data["num_nodes"],
            num_elements=data["num_elements"],
            node_coords=np.array(data["node_coords"]),
            element_connectivity=np.array(data["element_connectivity"]),
            element_materials=np.array(data["element_materials"]),
            boundaries=data["boundaries"],
            statistics=data.get("statistics", {})
        )


@dataclass
class MaterialInfo:
    """材料信息"""
    num_materials: int
    properties: List[Dict[str, float]]

    def to_dict(self) -> Dict:
        return {
            "num_materials": self.num_materials,
            "properties": self.properties
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "MaterialInfo":
        return cls(
            num_materials=data["num_materials"],
            properties=data["properties"]
        )


@dataclass
class FEMResultData:
    """有限元计算结果数据（标准化接口）"""
    displacement: np.ndarray
    stress: np.ndarray
    strain: np.ndarray
    reaction_forces: Optional[np.ndarray] = None
    element_stresses: Optional[np.ndarray] = None
    element_strains: Optional[np.ndarray] = None

    def to_dict(self) -> Dict:
        return {
            "displacement": self.displacement.tolist(),
            "stress": self.stress.tolist(),
            "strain": self.strain.tolist(),
            "reaction_forces": self.reaction_forces.tolist() if self.reaction_forces is not None else None,
            "element_stresses": self.element_stresses.tolist() if self.element_stresses is not None else None,
            "element_strains": self.element_strains.tolist() if self.element_strains is not None else None
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "FEMResultData":
        return cls(
            displacement=np.array(data["displacement"]),
            stress=np.array(data["stress"]),
            strain=np.array(data["strain"]),
            reaction_forces=np.array(data["reaction_forces"]) if data["reaction_forces"] else None,
            element_stresses=np.array(data["element_stresses"]) if data["element_stresses"] else None,
            element_strains=np.array(data["element_strains"]) if data["element_strains"] else None
        )


@dataclass
class ConvergenceInfo:
    """收敛信息"""
    num_iterations: int
    residual_norms: List[float]
    increment_norms: List[float]
    converged: bool
    final_residual: float
    final_increment: float
    tolerance: float

    def to_dict(self) -> Dict:
        return {
            "num_iterations": self.num_iterations,
            "residual_norms": self.residual_norms,
            "increment_norms": self.increment_norms,
            "converged": self.converged,
            "final_residual": self.final_residual,
            "final_increment": self.final_increment,
            "tolerance": self.tolerance
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "ConvergenceInfo":
        return cls(
            num_iterations=data["num_iterations"],
            residual_norms=data["residual_norms"],
            increment_norms=data["increment_norms"],
            converged=data["converged"],
            final_residual=data["final_residual"],
            final_increment=data["final_increment"],
            tolerance=data["tolerance"]
        )


@dataclass
class StrengthReductionResult:
    """强度折减结果"""
    factor_of_safety: float
    reduction_factors: List[float]
    convergence_status: List[bool]
    critical_reduction_factor: float
    iterations_per_reduction: List[int]

    def to_dict(self) -> Dict:
        return {
            "factor_of_safety": self.factor_of_safety,
            "reduction_factors": self.reduction_factors,
            "convergence_status": self.convergence_status,
            "critical_reduction_factor": self.critical_reduction_factor,
            "iterations_per_reduction": self.iterations_per_reduction
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "StrengthReductionResult":
        return cls(
            factor_of_safety=data["factor_of_safety"],
            reduction_factors=data["reduction_factors"],
            convergence_status=data["convergence_status"],
            critical_reduction_factor=data["critical_reduction_factor"],
            iterations_per_reduction=data["iterations_per_reduction"]
        )


@dataclass
class AnalysisSummary:
    """分析摘要"""
    project_name: str
    status: AnalysisStatus
    total_time: float
    mesh_generation_time: float
    assembly_time: float
    solve_time: float
    post_process_time: float
    peak_memory_mb: float

    def to_dict(self) -> Dict:
        return {
            "project_name": self.project_name,
            "status": self.status.value,
            "total_time": self.total_time,
            "mesh_generation_time": self.mesh_generation_time,
            "assembly_time": self.assembly_time,
            "solve_time": self.solve_time,
            "post_process_time": self.post_process_time,
            "peak_memory_mb": self.peak_memory_mb
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "AnalysisSummary":
        return cls(
            project_name=data["project_name"],
            status=AnalysisStatus(data["status"]),
            total_time=data["total_time"],
            mesh_generation_time=data["mesh_generation_time"],
            assembly_time=data["assembly_time"],
            solve_time=data["solve_time"],
            post_process_time=data["post_process_time"],
            peak_memory_mb=data["peak_memory_mb"]
        )


@dataclass
class FailureSurfaceInfo:
    """滑动面信息"""
    surface_points: np.ndarray
    slip_zone_elements: List[int]
    max_shear_stress: float
    average_shear_stress: float
    safety_margin: float

    def to_dict(self) -> Dict:
        return {
            "surface_points": self.surface_points.tolist(),
            "slip_zone_elements": self.slip_zone_elements,
            "max_shear_stress": self.max_shear_stress,
            "average_shear_stress": self.average_shear_stress,
            "safety_margin": self.safety_margin
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "FailureSurfaceInfo":
        return cls(
            surface_points=np.array(data["surface_points"]),
            slip_zone_elements=data["slip_zone_elements"],
            max_shear_stress=data["max_shear_stress"],
            average_shear_stress=data["average_shear_stress"],
            safety_margin=data["safety_margin"]
        )


@dataclass
class AnalysisResult:
    """完整的分析结果（标准化数据对象）

    这个对象是计算内核和后处理之间的接口，
    包含所有必要的数据，使后处理可以独立于计算内核运行。
    """
    mesh_info: MeshInfo
    material_info: MaterialInfo
    fem_result: FEMResultData
    convergence: Optional[ConvergenceInfo] = None
    strength_reduction: Optional[StrengthReductionResult] = None
    failure_surface: Optional[FailureSurfaceInfo] = None
    summary: Optional[AnalysisSummary] = None
    custom_data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "mesh_info": self.mesh_info.to_dict(),
            "material_info": self.material_info.to_dict(),
            "fem_result": self.fem_result.to_dict(),
            "convergence": self.convergence.to_dict() if self.convergence else None,
            "strength_reduction": self.strength_reduction.to_dict() if self.strength_reduction else None,
            "failure_surface": self.failure_surface.to_dict() if self.failure_surface else None,
            "summary": self.summary.to_dict() if self.summary else None,
            "custom_data": self.custom_data
        }

    def to_json(self, filepath: str) -> None:
        """保存为JSON文件"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=4)

    @classmethod
    def from_dict(cls, data: Dict) -> "AnalysisResult":
        """从字典创建"""
        return cls(
            mesh_info=MeshInfo.from_dict(data["mesh_info"]),
            material_info=MaterialInfo.from_dict(data["material_info"]),
            fem_result=FEMResultData.from_dict(data["fem_result"]),
            convergence=ConvergenceInfo.from_dict(data["convergence"]) if data["convergence"] else None,
            strength_reduction=StrengthReductionResult.from_dict(data["strength_reduction"]) if data["strength_reduction"] else None,
            failure_surface=FailureSurfaceInfo.from_dict(data["failure_surface"]) if data["failure_surface"] else None,
            summary=AnalysisSummary.from_dict(data["summary"]) if data["summary"] else None,
            custom_data=data.get("custom_data", {})
        )

    @classmethod
    def from_json(cls, filepath: str) -> "AnalysisResult":
        """从JSON文件加载"""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return cls.from_dict(data)

    def to_pickle(self, filepath: str) -> None:
        """保存为Pickle文件"""
        with open(filepath, 'wb') as f:
            pickle.dump(self, f, protocol=pickle.HIGHEST_PROTOCOL)

    @classmethod
    def from_pickle(cls, filepath: str) -> "AnalysisResult":
        """从Pickle文件加载"""
        with open(filepath, 'rb') as f:
            return pickle.load(f)

    def validate(self) -> bool:
        """验证数据完整性"""
        if self.mesh_info.num_nodes <= 0:
            return False
        if self.mesh_info.num_elements <= 0:
            return False
        if len(self.fem_result.displacement) != self.mesh_info.num_nodes * 2:
            return False
        return True


class ResultDataBuilder:
    """结果数据构建器"""

    def __init__(self):
        self.mesh_info: Optional[MeshInfo] = None
        self.material_info: Optional[MaterialInfo] = None
        self.fem_result: Optional[FEMResultData] = None
        self.convergence: Optional[ConvergenceInfo] = None
        self.strength_reduction: Optional[StrengthReductionResult] = None
        self.failure_surface: Optional[FailureSurfaceInfo] = None
        self.summary: Optional[AnalysisSummary] = None
        self.custom_data: Dict[str, Any] = {}

    def set_mesh_info(self, mesh_info: MeshInfo) -> "ResultDataBuilder":
        self.mesh_info = mesh_info
        return self

    def set_material_info(self, material_info: MaterialInfo) -> "ResultDataBuilder":
        self.material_info = material_info
        return self

    def set_fem_result(self, fem_result: FEMResultData) -> "ResultDataBuilder":
        self.fem_result = fem_result
        return self

    def set_convergence(self, convergence: ConvergenceInfo) -> "ResultDataBuilder":
        self.convergence = convergence
        return self

    def set_strength_reduction(self, sr: StrengthReductionResult) -> "ResultDataBuilder":
        self.strength_reduction = sr
        return self

    def set_failure_surface(self, fs: FailureSurfaceInfo) -> "ResultDataBuilder":
        self.failure_surface = fs
        return self

    def set_summary(self, summary: AnalysisSummary) -> "ResultDataBuilder":
        self.summary = summary
        return self

    def add_custom_data(self, key: str, value: Any) -> "ResultDataBuilder":
        self.custom_data[key] = value
        return self

    def build(self) -> AnalysisResult:
        """构建结果对象"""
        if self.mesh_info is None:
            raise ValueError("MeshInfo is required")
        if self.material_info is None:
            raise ValueError("MaterialInfo is required")
        if self.fem_result is None:
            raise ValueError("FEMResultData is required")

        return AnalysisResult(
            mesh_info=self.mesh_info,
            material_info=self.material_info,
            fem_result=self.fem_result,
            convergence=self.convergence,
            strength_reduction=self.strength_reduction,
            failure_surface=self.failure_surface,
            summary=self.summary,
            custom_data=self.custom_data
        )
