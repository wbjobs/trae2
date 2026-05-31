"""
模块接口定义
定义模块间的标准数据接口，实现计算内核与后处理的解耦
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Protocol, runtime_checkable


@runtime_checkable
class IMeshData(Protocol):
    """网格数据接口"""
    @property
    def nodes(self) -> np.ndarray: ...
    @property
    def elements(self) -> np.ndarray: ...
    @property
    def element_material_ids(self) -> np.ndarray: ...
    @property
    def node_count(self) -> int: ...
    @property
    def element_count(self) -> int: ...

    def get_element_centroids(self) -> np.ndarray: ...
    def get_element_areas(self) -> np.ndarray: ...


@runtime_checkable
class ISimulationResult(Protocol):
    """模拟结果接口"""
    @property
    def displacement(self) -> np.ndarray: ...
    @property
    def stress(self) -> np.ndarray: ...
    @property
    def strain(self) -> np.ndarray: ...
    @property
    def von_mises(self) -> np.ndarray: ...
    @property
    def nodal_stress(self) -> np.ndarray: ...
    @property
    def nodal_strain(self) -> np.ndarray: ...
    @property
    def solve_time(self) -> float: ...
    @property
    def converged(self) -> bool: ...

    def is_valid(self) -> bool: ...


@runtime_checkable
class ISimulationConfig(Protocol):
    """模拟配置接口"""
    @property
    def geometry(self) -> Any: ...
    @property
    def materials(self) -> List[Any]: ...


@dataclass
class PostProcessingInput:
    """后处理输入数据 - 标准化接口

    这个类作为计算内核与后处理模块之间的适配器，
    隐藏具体实现细节，只暴露后处理需要的数据。
    """
    nodes: np.ndarray
    elements: np.ndarray
    element_material_ids: np.ndarray
    displacement: np.ndarray
    stress: np.ndarray
    strain: np.ndarray
    von_mises: np.ndarray
    nodal_stress: np.ndarray
    nodal_strain: np.ndarray
    node_count: int
    element_count: int
    solve_time: float = 0.0
    converged: bool = True
    layer_info: Optional[List[Dict]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_components(cls, mesh: IMeshData, result: ISimulationResult,
                        config: Optional[ISimulationConfig] = None) -> 'PostProcessingInput':
        """从网格、结果和配置对象创建后处理输入"""
        layer_info = None
        if config and hasattr(config, 'geometry') and hasattr(config.geometry, 'layers'):
            layer_info = [
                {
                    'name': layer.name,
                    'thickness': layer.thickness,
                    'depth': layer.depth,
                    'material_id': layer.material_id
                }
                for layer in config.geometry.layers
            ]

        return cls(
            nodes=mesh.nodes.copy(),
            elements=mesh.elements.copy(),
            element_material_ids=mesh.element_material_ids.copy(),
            displacement=result.displacement.copy(),
            stress=result.stress.copy(),
            strain=result.strain.copy(),
            von_mises=result.von_mises.copy(),
            nodal_stress=result.nodal_stress.copy(),
            nodal_strain=result.nodal_strain.copy(),
            node_count=mesh.node_count,
            element_count=mesh.element_count,
            solve_time=result.solve_time,
            converged=result.converged,
            layer_info=layer_info,
            metadata={
                'result_valid': result.is_valid()
            }
        )

    def get_element_centroids(self) -> np.ndarray:
        """获取单元质心 - 便捷方法"""
        elem_nodes = self.nodes[self.elements]
        return np.mean(elem_nodes, axis=1)

    def get_element_areas(self) -> np.ndarray:
        """获取单元面积 - 便捷方法"""
        elem_nodes = self.nodes[self.elements]
        x = elem_nodes[:, :, 0]
        y = elem_nodes[:, :, 1]
        return 0.5 * np.abs(
            (x[:, 1] - x[:, 0]) * (y[:, 2] - y[:, 0]) -
            (x[:, 2] - x[:, 0]) * (y[:, 1] - y[:, 0])
        )
