"""
工程参数解析模块
==============

负责解析和验证岩土工程边坡稳定性分析的输入参数,
包括边坡几何参数、岩土材料参数、边界条件等。
"""

import json
import yaml
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Union
import numpy as np


@dataclass
class ProjectInfo:
    """项目信息"""
    name: str = "未命名项目"
    project_id: str = ""
    date: str = ""
    engineer: str = ""
    notes: str = ""


@dataclass
class SlopeGeometry:
    """边坡几何参数"""
    height: float = 10.0
    angle: float = 45.0
    crest_width: float = 10.0
    toe_width: float = 5.0
    total_width: float = 30.0
    total_height: float = 20.0

    @property
    def slope_length(self) -> float:
        """计算坡面长度"""
        return self.height / np.sin(np.radians(self.angle))

    @property
    def horizontal_projection(self) -> float:
        """计算水平投影长度"""
        return self.height / np.tan(np.radians(self.angle))


@dataclass
class SoilLayer:
    """土层参数"""
    name: str = "土层"
    thickness: float = 5.0
    density: float = 1800.0
    young_modulus: float = 20e6
    poisson_ratio: float = 0.3
    cohesion: float = 20e3
    friction_angle: float = 30.0
    dilation_angle: float = 5.0
    permeability: float = 1e-7
    unit_weight: float = 0.0

    def __post_init__(self):
        if self.unit_weight == 0.0:
            self.unit_weight = self.density * 9.81


@dataclass
class BoundaryCondition:
    """边界条件"""
    boundary_type: str = "fixed"
    constraint: str = "xy"
    value: float = 0.0


@dataclass
class AnalysisSettings:
    """分析设置"""
    analysis_type: str = "static"
    method: str = "strength_reduction"
    reduction_factor_start: float = 1.0
    reduction_factor_end: float = 3.0
    reduction_step: float = 0.1
    max_iterations: int = 500
    tolerance: float = 1e-6
    time_step: float = 0.1
    total_time: float = 10.0


@dataclass
class MeshSettings:
    """网格设置"""
    element_type: str = "triangular"
    min_element_size: float = 0.5
    max_element_size: float = 2.0
    boundary_refinement_level: int = 2
    quality_threshold: float = 0.5


@dataclass
class OutputSettings:
    """输出设置"""
    save_displacement: bool = True
    save_stress: bool = True
    save_strain: bool = True
    save_pore_pressure: bool = False
    generate_report: bool = True
    visualization: bool = True
    output_format: str = "vtk"
    save_frequency: int = 10


class ParameterValidator:
    """参数验证器"""

    @staticmethod
    def validate_geometry(geometry: SlopeGeometry) -> List[str]:
        """验证几何参数"""
        errors = []
        if geometry.height <= 0:
            errors.append("边坡高度必须大于0")
        if geometry.angle <= 0 or geometry.angle >= 90:
            errors.append("边坡角度必须在0到90度之间")
        if geometry.crest_width < 0:
            errors.append("坡顶宽度不能为负")
        if geometry.toe_width < 0:
            errors.append("坡脚宽度不能为负")
        if geometry.total_width <= 0:
            errors.append("总宽度必须大于0")
        if geometry.total_height <= geometry.height:
            errors.append("总高度必须大于边坡高度")
        return errors

    @staticmethod
    def validate_soil_layer(layer: SoilLayer) -> List[str]:
        """验证土层参数"""
        errors = []
        if layer.thickness <= 0:
            errors.append(f"土层 '{layer.name}' 厚度必须大于0")
        if layer.density <= 0:
            errors.append(f"土层 '{layer.name}' 密度必须大于0")
        if layer.young_modulus <= 0:
            errors.append(f"土层 '{layer.name}' 弹性模量必须大于0")
        if layer.poisson_ratio <= 0 or layer.poisson_ratio >= 0.5:
            errors.append(f"土层 '{layer.name}' 泊松比必须在0到0.5之间")
        if layer.cohesion < 0:
            errors.append(f"土层 '{layer.name}' 粘聚力不能为负")
        if layer.friction_angle < 0 or layer.friction_angle >= 90:
            errors.append(f"土层 '{layer.name}' 内摩擦角必须在0到90度之间")
        return errors

    @staticmethod
    def validate_analysis_settings(settings: AnalysisSettings) -> List[str]:
        """验证分析设置"""
        errors = []
        valid_methods = ["strength_reduction", "phi-c_reduction", "shear_strength_reduction"]
        if settings.method not in valid_methods:
            errors.append(f"分析方法必须是以下之一: {valid_methods}")
        if settings.reduction_factor_start <= 0:
            errors.append("折减系数起始值必须大于0")
        if settings.reduction_factor_end <= settings.reduction_factor_start:
            errors.append("折减系数终止值必须大于起始值")
        if settings.reduction_step <= 0:
            errors.append("折减步长必须大于0")
        if settings.max_iterations <= 0:
            errors.append("最大迭代次数必须大于0")
        if settings.tolerance <= 0:
            errors.append("收敛容差必须大于0")
        return errors

    @staticmethod
    def validate_mesh_settings(settings: MeshSettings) -> List[str]:
        """验证网格设置"""
        errors = []
        if settings.min_element_size <= 0:
            errors.append("最小单元尺寸必须大于0")
        if settings.max_element_size <= settings.min_element_size:
            errors.append("最大单元尺寸必须大于最小单元尺寸")
        if settings.boundary_refinement_level < 0:
            errors.append("边界加密级别不能为负")
        if settings.quality_threshold <= 0 or settings.quality_threshold > 1:
            errors.append("单元质量阈值必须在0到1之间")
        return errors


class SlopeParameters:
    """边坡分析参数类"""

    def __init__(self):
        self.project_info: ProjectInfo = ProjectInfo()
        self.geometry: SlopeGeometry = SlopeGeometry()
        self.soil_layers: List[SoilLayer] = []
        self.boundary_conditions: Dict[str, BoundaryCondition] = {}
        self.analysis_settings: AnalysisSettings = AnalysisSettings()
        self.mesh_settings: MeshSettings = MeshSettings()
        self.output_settings: OutputSettings = OutputSettings()
        self._valid: bool = False
        self._errors: List[str] = []

    @classmethod
    def from_json(cls, file_path: str) -> 'SlopeParameters':
        """从JSON文件加载参数"""
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        params = cls()

        if 'project_info' in data:
            params.project_info = ProjectInfo(**data['project_info'])

        if 'slope_geometry' in data:
            params.geometry = SlopeGeometry(**data['slope_geometry'])

        if 'soil_layers' in data:
            params.soil_layers = [SoilLayer(**layer) for layer in data['soil_layers']]

        if 'boundary_conditions' in data:
            for name, bc_data in data['boundary_conditions'].items():
                if 'type' in bc_data:
                    bc_data['boundary_type'] = bc_data.pop('type')
                params.boundary_conditions[name] = BoundaryCondition(**bc_data)

        if 'analysis_settings' in data:
            params.analysis_settings = AnalysisSettings(**data['analysis_settings'])

        if 'mesh_settings' in data:
            params.mesh_settings = MeshSettings(**data['mesh_settings'])

        if 'output_settings' in data:
            params.output_settings = OutputSettings(**data['output_settings'])

        return params

    @classmethod
    def from_yaml(cls, file_path: str) -> 'SlopeParameters':
        """从YAML文件加载参数"""
        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        params = cls()

        if 'project_info' in data:
            params.project_info = ProjectInfo(**data['project_info'])

        if 'slope_geometry' in data:
            params.geometry = SlopeGeometry(**data['slope_geometry'])

        if 'soil_layers' in data:
            params.soil_layers = [SoilLayer(**layer) for layer in data['soil_layers']]

        if 'boundary_conditions' in data:
            for name, bc_data in data['boundary_conditions'].items():
                if 'type' in bc_data:
                    bc_data['boundary_type'] = bc_data.pop('type')
                params.boundary_conditions[name] = BoundaryCondition(**bc_data)

        if 'analysis_settings' in data:
            params.analysis_settings = AnalysisSettings(**data['analysis_settings'])

        if 'mesh_settings' in data:
            params.mesh_settings = MeshSettings(**data['mesh_settings'])

        if 'output_settings' in data:
            params.output_settings = OutputSettings(**data['output_settings'])

        return params

    def validate(self) -> bool:
        """验证所有参数"""
        self._errors = []

        self._errors.extend(ParameterValidator.validate_geometry(self.geometry))

        for layer in self.soil_layers:
            self._errors.extend(ParameterValidator.validate_soil_layer(layer))

        self._errors.extend(ParameterValidator.validate_analysis_settings(self.analysis_settings))
        self._errors.extend(ParameterValidator.validate_mesh_settings(self.mesh_settings))

        if not self.soil_layers:
            self._errors.append("至少需要定义一个土层")

        total_thickness = sum(layer.thickness for layer in self.soil_layers)
        if total_thickness < self.geometry.total_height:
            self._errors.append(f"土层总厚度 ({total_thickness:.2f}m) 小于模型总高度 ({self.geometry.total_height:.2f}m)")

        self._valid = len(self._errors) == 0
        return self._valid

    @property
    def is_valid(self) -> bool:
        """获取验证状态"""
        return self._valid

    @property
    def errors(self) -> List[str]:
        """获取验证错误列表"""
        return self._errors.copy()

    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "project_info": {
                "name": self.project_info.name,
                "project_id": self.project_info.project_id,
                "date": self.project_info.date,
                "engineer": self.project_info.engineer,
                "notes": self.project_info.notes,
            },
            "slope_geometry": {
                "height": self.geometry.height,
                "angle": self.geometry.angle,
                "crest_width": self.geometry.crest_width,
                "toe_width": self.geometry.toe_width,
                "total_width": self.geometry.total_width,
                "total_height": self.geometry.total_height,
            },
            "soil_layers": [
                {
                    "name": layer.name,
                    "thickness": layer.thickness,
                    "density": layer.density,
                    "young_modulus": layer.young_modulus,
                    "poisson_ratio": layer.poisson_ratio,
                    "cohesion": layer.cohesion,
                    "friction_angle": layer.friction_angle,
                    "dilation_angle": layer.dilation_angle,
                    "permeability": layer.permeability,
                }
                for layer in self.soil_layers
            ],
            "boundary_conditions": {
                name: {
                    "type": bc.boundary_type,
                    "constraint": bc.constraint,
                    "value": bc.value,
                }
                for name, bc in self.boundary_conditions.items()
            },
            "analysis_settings": {
                "analysis_type": self.analysis_settings.analysis_type,
                "method": self.analysis_settings.method,
                "reduction_factor_start": self.analysis_settings.reduction_factor_start,
                "reduction_factor_end": self.analysis_settings.reduction_factor_end,
                "reduction_step": self.analysis_settings.reduction_step,
                "max_iterations": self.analysis_settings.max_iterations,
                "tolerance": self.analysis_settings.tolerance,
            },
            "mesh_settings": {
                "element_type": self.mesh_settings.element_type,
                "min_element_size": self.mesh_settings.min_element_size,
                "max_element_size": self.mesh_settings.max_element_size,
                "boundary_refinement_level": self.mesh_settings.boundary_refinement_level,
            },
        }

    def save_json(self, file_path: str) -> None:
        """保存为JSON文件"""
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=4)

    def summary(self) -> str:
        """生成参数摘要"""
        lines = ["=" * 60]
        lines.append("边坡稳定性分析参数摘要")
        lines.append("=" * 60)
        lines.append(f"项目名称: {self.project_info.name}")
        lines.append(f"项目编号: {self.project_info.project_id}")
        lines.append(f"分析日期: {self.project_info.date}")
        lines.append("-" * 60)
        lines.append("边坡几何参数:")
        lines.append(f"  边坡高度: {self.geometry.height:.2f} m")
        lines.append(f"  边坡角度: {self.geometry.angle:.1f}°")
        lines.append(f"  坡面长度: {self.geometry.slope_length:.2f} m")
        lines.append(f"  模型总宽度: {self.geometry.total_width:.2f} m")
        lines.append(f"  模型总高度: {self.geometry.total_height:.2f} m")
        lines.append("-" * 60)
        lines.append("土层信息:")
        for i, layer in enumerate(self.soil_layers, 1):
            lines.append(f"  层{i} ({layer.name}):")
            lines.append(f"    厚度: {layer.thickness:.2f} m")
            lines.append(f"    密度: {layer.density:.0f} kg/m³")
            lines.append(f"    弹性模量: {layer.young_modulus/1e6:.1f} MPa")
            lines.append(f"    泊松比: {layer.poisson_ratio:.2f}")
            lines.append(f"    粘聚力: {layer.cohesion/1e3:.1f} kPa")
            lines.append(f"    内摩擦角: {layer.friction_angle:.1f}°")
        lines.append("-" * 60)
        lines.append("分析设置:")
        lines.append(f"  分析方法: {self.analysis_settings.method}")
        lines.append(f"  折减系数范围: {self.analysis_settings.reduction_factor_start} - {self.analysis_settings.reduction_factor_end}")
        lines.append(f"  折减步长: {self.analysis_settings.reduction_step}")
        lines.append(f"  最大迭代次数: {self.analysis_settings.max_iterations}")
        lines.append(f"  收敛容差: {self.analysis_settings.tolerance}")
        lines.append("=" * 60)
        return "\n".join(lines)
