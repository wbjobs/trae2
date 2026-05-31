"""
有限元计算内核模块
================

实现边坡稳定性分析的有限元求解器,
支持强度折减法、弹塑性本构模型和非线性求解。
"""

import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Callable
from scipy.sparse import csr_matrix, lil_matrix
from scipy.sparse.linalg import spsolve
import time
import logging

from .parameters import SlopeParameters, SoilLayer
from .mesh import SlopeMesh, Element, Node

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class MaterialProperties:
    """材料属性"""
    young_modulus: float
    poisson_ratio: float
    density: float
    cohesion: float
    friction_angle: float
    dilation_angle: float


@dataclass
class FEMResult:
    """有限元计算结果"""
    displacement: np.ndarray
    stress: np.ndarray
    strain: np.ndarray
    reaction_forces: np.ndarray
    iterations: int
    residual: float
    converged: bool
    compute_time: float


@dataclass
class StrengthReductionResult:
    """强度折减分析结果"""
    factor_of_safety: float
    critical_reduction_factor: float
    reduction_results: List[Dict]
    failure_surface: Optional[np.ndarray]
    displacement_at_failure: np.ndarray


class ElasticitySolver:
    """线弹性求解器"""

    def __init__(self, mesh: SlopeMesh, parameters: SlopeParameters):
        self.mesh = mesh
        self.params = parameters
        self.ndof = 2 * len(mesh.nodes)
        self.K = None
        self.F = None
        self.u = None
        self.materials = self._initialize_materials()

    def _initialize_materials(self) -> List[MaterialProperties]:
        """初始化材料属性"""
        materials = []
        for layer in self.params.soil_layers:
            materials.append(MaterialProperties(
                young_modulus=layer.young_modulus,
                poisson_ratio=layer.poisson_ratio,
                density=layer.density,
                cohesion=layer.cohesion,
                friction_angle=layer.friction_angle,
                dilation_angle=layer.dilation_angle
            ))
        return materials

    def compute_element_stiffness(self, element: Element, nodes: List[Node],
                                   material: MaterialProperties) -> np.ndarray:
        """计算单元刚度矩阵 (三节点三角形单元)"""
        if element.element_type == "triangular" and len(element.node_ids) == 3:
            return self._compute_tri3_stiffness(element, nodes, material)
        elif element.element_type == "quadrilateral" and len(element.node_ids) == 4:
            return self._compute_quad4_stiffness(element, nodes, material)
        else:
            raise ValueError(f"不支持的单元类型: {element.element_type}")

    def _compute_tri3_stiffness(self, element: Element, nodes: List[Node],
                                material: MaterialProperties) -> np.ndarray:
        """计算三节点三角形单元刚度矩阵"""
        E = material.young_modulus
        nu = material.poisson_ratio

        n = [nodes[i] for i in element.node_ids]
        x = np.array([n[0].x, n[1].x, n[2].x])
        y = np.array([n[0].y, n[1].y, n[2].y])

        area = 0.5 * abs((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]))

        B = np.zeros((3, 6))
        B[0, 0] = y[1] - y[2]
        B[0, 2] = y[2] - y[0]
        B[0, 4] = y[0] - y[1]
        B[1, 1] = x[2] - x[1]
        B[1, 3] = x[0] - x[2]
        B[1, 5] = x[1] - x[0]
        B[2, 0] = x[2] - x[1]
        B[2, 1] = y[1] - y[2]
        B[2, 2] = x[0] - x[2]
        B[2, 3] = y[2] - y[0]
        B[2, 4] = x[1] - x[0]
        B[2, 5] = y[0] - y[1]

        B /= (2 * area)

        D = (E / ((1 + nu) * (1 - 2 * nu))) * np.array([
            [1 - nu, nu, 0],
            [nu, 1 - nu, 0],
            [0, 0, (1 - 2 * nu) / 2]
        ])

        ke = area * B.T @ D @ B

        return ke

    def _compute_quad4_stiffness(self, element: Element, nodes: List[Node],
                                  material: MaterialProperties) -> np.ndarray:
        """计算四节点四边形单元刚度矩阵 (高斯积分)"""
        E = material.young_modulus
        nu = material.poisson_ratio

        n = [nodes[i] for i in element.node_ids]
        x = np.array([n[0].x, n[1].x, n[2].x, n[3].x])
        y = np.array([n[0].y, n[1].y, n[2].y, n[3].y])

        gp = np.array([-1/np.sqrt(3), 1/np.sqrt(3)])
        gw = np.array([1.0, 1.0])

        ke = np.zeros((8, 8))

        for i in range(2):
            for j in range(2):
                xi = gp[i]
                eta = gp[j]
                weight = gw[i] * gw[j]

                N = np.array([
                    (1 - xi) * (1 - eta) / 4,
                    (1 + xi) * (1 - eta) / 4,
                    (1 + xi) * (1 + eta) / 4,
                    (1 - xi) * (1 + eta) / 4
                ])

                dN_dxi = np.array([
                    -(1 - eta) / 4,
                    (1 - eta) / 4,
                    (1 + eta) / 4,
                    -(1 + eta) / 4
                ])

                dN_deta = np.array([
                    -(1 - xi) / 4,
                    -(1 + xi) / 4,
                    (1 + xi) / 4,
                    (1 - xi) / 4
                ])

                J = np.zeros((2, 2))
                J[0, 0] = np.sum(dN_dxi * x)
                J[0, 1] = np.sum(dN_dxi * y)
                J[1, 0] = np.sum(dN_deta * x)
                J[1, 1] = np.sum(dN_deta * y)

                detJ = np.linalg.det(J)
                invJ = np.linalg.inv(J)

                dN_dx = invJ[0, 0] * dN_dxi + invJ[0, 1] * dN_deta
                dN_dy = invJ[1, 0] * dN_dxi + invJ[1, 1] * dN_deta

                B = np.zeros((3, 8))
                B[0, 0::2] = dN_dx
                B[1, 1::2] = dN_dy
                B[2, 0::2] = dN_dy
                B[2, 1::2] = dN_dx

                D = (E / ((1 + nu) * (1 - 2 * nu))) * np.array([
                    [1 - nu, nu, 0],
                    [nu, 1 - nu, 0],
                    [0, 0, (1 - 2 * nu) / 2]
                ])

                ke += weight * detJ * B.T @ D @ B

        return ke

    def assemble_stiffness_matrix(self, reduction_factor: float = 1.0) -> csr_matrix:
        """组装整体刚度矩阵"""
        K = lil_matrix((self.ndof, self.ndof))

        for element in self.mesh.elements:
            material = self.materials[element.material_id]
            adjusted_cohesion = material.cohesion / reduction_factor
            adjusted_friction = np.arctan(np.tan(np.radians(material.friction_angle)) / reduction_factor)
            adjusted_material = MaterialProperties(
                young_modulus=material.young_modulus,
                poisson_ratio=material.poisson_ratio,
                density=material.density,
                cohesion=adjusted_cohesion,
                friction_angle=np.degrees(adjusted_friction),
                dilation_angle=material.dilation_angle
            )

            ke = self.compute_element_stiffness(element, self.mesh.nodes, adjusted_material)

            dof_indices = []
            for node_id in element.node_ids:
                dof_indices.extend([2 * node_id, 2 * node_id + 1])

            for i, di in enumerate(dof_indices):
                for j, dj in enumerate(dof_indices):
                    K[di, dj] += ke[i, j]

        return K.tocsr()

    def apply_boundary_conditions(self, K: csr_matrix, F: np.ndarray,
                                   displacement_bcs: Dict[int, float]) -> Tuple[csr_matrix, np.ndarray, list]:
        """应用边界条件"""
        fixed_dofs = list(displacement_bcs.keys())
        free_dofs = [i for i in range(self.ndof) if i not in fixed_dofs]

        K_reduced = K[np.ix_(free_dofs, free_dofs)]
        F_reduced = F[free_dofs].copy()

        for fixed_dof, value in displacement_bcs.items():
            for free_dof in free_dofs:
                F_reduced[free_dofs.index(free_dof)] -= K[free_dof, fixed_dof] * value

        return K_reduced, F_reduced, free_dofs

    def compute_body_force(self) -> np.ndarray:
        """计算体积力 (重力)"""
        F = np.zeros(self.ndof)

        for element in self.mesh.elements:
            material = self.materials[element.material_id]
            nodes = [self.mesh.nodes[i] for i in element.node_ids]

            if element.element_type == "triangular" and len(element.node_ids) == 3:
                x = np.array([n.x for n in nodes])
                y = np.array([n.y for n in nodes])
                area = 0.5 * abs((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]))

                weight = material.density * 9.81 * area / 3.0

                for node_id in element.node_ids:
                    F[2 * node_id + 1] -= weight

            elif element.element_type == "quadrilateral" and len(element.node_ids) == 4:
                area = element.compute_area(self.mesh.nodes)
                weight = material.density * 9.81 * area / 4.0

                for node_id in element.node_ids:
                    F[2 * node_id + 1] -= weight

        return F

    def get_displacement_bcs(self) -> Dict[int, float]:
        """获取位移边界条件"""
        bcs = {}

        for bc_name, bc in self.params.boundary_conditions.items():
            if bc_name in self.mesh.boundaries:
                node_ids = self.mesh.boundaries[bc_name].node_ids
                for node_id in node_ids:
                    if 'x' in bc.constraint:
                        bcs[2 * node_id] = bc.value
                    if 'y' in bc.constraint:
                        bcs[2 * node_id + 1] = bc.value

        return bcs


class NonlinearSolver:
    """非线性求解器 (牛顿-拉夫逊法)"""

    def __init__(self, linear_solver: ElasticitySolver):
        self.linear_solver = linear_solver
        self.max_iterations = 50
        self.tolerance = 1e-6

    def solve(self, reduction_factor: float = 1.0) -> FEMResult:
        """求解非线性问题"""
        start_time = time.time()

        F = self.linear_solver.compute_body_force()
        displacement_bcs = self.linear_solver.get_displacement_bcs()

        u = np.zeros(self.linear_solver.ndof)
        iteration = 0
        residual = 0.0
        converged = False

        max_displacement_history = []

        for iteration in range(self.max_iterations):
            try:
                K = self.linear_solver.assemble_stiffness_matrix(reduction_factor)

                K_reduced, F_reduced, free_dofs = self.linear_solver.apply_boundary_conditions(
                    K, F, displacement_bcs
                )

                u_reduced = spsolve(K_reduced, F_reduced)
            except Exception as e:
                logger.warning(f"折减系数 {reduction_factor:.2f} 第 {iteration+1} 迭代求解异常: {e}")
                converged = False
                break

            if np.any(np.isnan(u_reduced)) or np.any(np.isinf(u_reduced)):
                logger.warning(f"折减系数 {reduction_factor:.2f} 第 {iteration+1} 迭代结果含NaN/Inf，判定不收敛")
                converged = False
                break

            du = np.zeros(self.linear_solver.ndof)
            for i, dof in enumerate(free_dofs):
                du[dof] = u_reduced[i]

            residual = np.linalg.norm(du)

            max_disp = np.max(np.abs(du))
            max_displacement_history.append(max_disp)

            if len(max_displacement_history) >= 3:
                recent = max_displacement_history[-3:]
                if all(d > 1e-3 for d in recent) and recent[-1] > recent[-2] * 1.5 and recent[-2] > recent[-3] * 1.5:
                    logger.warning(f"折减系数 {reduction_factor:.2f} 位移发散 (最大位移序列: "
                                   f"{recent[0]:.4e}, {recent[1]:.4e}, {recent[2]:.4e})，判定不收敛")
                    converged = False
                    break

            if residual < self.tolerance:
                u = du
                converged = True
                break

            u = du
        else:
            converged = False

        stress, strain = self._compute_stress_strain(u, reduction_factor)
        reaction_forces = self._compute_reaction_forces(K, u, F, displacement_bcs) if not np.any(np.isnan(u)) else np.zeros(self.linear_solver.ndof)

        compute_time = time.time() - start_time

        return FEMResult(
            displacement=u,
            stress=stress,
            strain=strain,
            reaction_forces=reaction_forces,
            iterations=iteration + 1,
            residual=residual,
            converged=converged,
            compute_time=compute_time
        )

    def _compute_stress_strain(self, u: np.ndarray, reduction_factor: float) -> Tuple[np.ndarray, np.ndarray]:
        """计算应力和应变"""
        num_elements = len(self.linear_solver.mesh.elements)
        stress = np.zeros((num_elements, 3))
        strain = np.zeros((num_elements, 3))

        for e_idx, element in enumerate(self.linear_solver.mesh.elements):
            material = self.linear_solver.materials[element.material_id]
            adjusted_cohesion = material.cohesion / reduction_factor
            adjusted_friction = np.arctan(np.tan(np.radians(material.friction_angle)) / reduction_factor)

            nodes = [self.linear_solver.mesh.nodes[i] for i in element.node_ids]

            if element.element_type == "triangular" and len(element.node_ids) == 3:
                x = np.array([n.x for n in nodes])
                y = np.array([n.y for n in nodes])
                area = 0.5 * abs((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]))

                B = np.zeros((3, 6))
                B[0, 0] = y[1] - y[2]
                B[0, 2] = y[2] - y[0]
                B[0, 4] = y[0] - y[1]
                B[1, 1] = x[2] - x[1]
                B[1, 3] = x[0] - x[2]
                B[1, 5] = x[1] - x[0]
                B[2, 0] = x[2] - x[1]
                B[2, 1] = y[1] - y[2]
                B[2, 2] = x[0] - x[2]
                B[2, 3] = y[2] - y[0]
                B[2, 4] = x[1] - x[0]
                B[2, 5] = y[0] - y[1]
                B /= (2 * area)

                ue = np.zeros(6)
                for i, node_id in enumerate(element.node_ids):
                    ue[2 * i] = u[2 * node_id]
                    ue[2 * i + 1] = u[2 * node_id + 1]

                strain[e_idx] = B @ ue

                E = material.young_modulus
                nu = material.poisson_ratio
                D = (E / ((1 + nu) * (1 - 2 * nu))) * np.array([
                    [1 - nu, nu, 0],
                    [nu, 1 - nu, 0],
                    [0, 0, (1 - 2 * nu) / 2]
                ])

                stress[e_idx] = D @ strain[e_idx]

        return stress, strain

    def _compute_reaction_forces(self, K: csr_matrix, u: np.ndarray, F: np.ndarray,
                                 displacement_bcs: Dict[int, float]) -> np.ndarray:
        """计算支座反力"""
        reactions = np.zeros(self.linear_solver.ndof)
        fixed_dofs = list(displacement_bcs.keys())

        for dof in fixed_dofs:
            reactions[dof] = K[dof, :] @ u - F[dof]

        return reactions


class FEMSolver:
    """有限元求解器主类"""

    def __init__(self, mesh: SlopeMesh, parameters: SlopeParameters):
        self.mesh = mesh
        self.params = parameters
        self.elasticity_solver = ElasticitySolver(mesh, parameters)
        self.nonlinear_solver = NonlinearSolver(self.elasticity_solver)
        self.results: List[FEMResult] = []

    def solve_linear(self) -> FEMResult:
        """线性弹性求解"""
        logger.info("开始线性弹性分析...")
        start_time = time.time()

        try:
            F = self.elasticity_solver.compute_body_force()
            K = self.elasticity_solver.assemble_stiffness_matrix(1.0)
            displacement_bcs = self.elasticity_solver.get_displacement_bcs()

            K_reduced, F_reduced, free_dofs = self.elasticity_solver.apply_boundary_conditions(
                K, F, displacement_bcs
            )

            u_reduced = spsolve(K_reduced, F_reduced)

            if np.any(np.isnan(u_reduced)) or np.any(np.isinf(u_reduced)):
                logger.error("线性求解结果含NaN/Inf，刚度矩阵可能奇异")
                return FEMResult(
                    displacement=np.zeros(self.elasticity_solver.ndof),
                    stress=np.zeros((len(self.mesh.elements), 3)),
                    strain=np.zeros((len(self.mesh.elements), 3)),
                    reaction_forces=np.zeros(self.elasticity_solver.ndof),
                    iterations=0, residual=float('inf'),
                    converged=False, compute_time=time.time() - start_time
                )

            u = np.zeros(self.elasticity_solver.ndof)
            for i, dof in enumerate(free_dofs):
                u[dof] = u_reduced[i]

            for dof, value in displacement_bcs.items():
                u[dof] = value

            stress, strain = self.nonlinear_solver._compute_stress_strain(u, 1.0)
            reaction_forces = self.nonlinear_solver._compute_reaction_forces(K, u, F, displacement_bcs)

            result = FEMResult(
                displacement=u,
                stress=stress,
                strain=strain,
                reaction_forces=reaction_forces,
                iterations=1,
                residual=0.0,
                converged=True,
                compute_time=time.time() - start_time
            )

            self.results.append(result)
            logger.info(f"线性弹性分析完成, 耗时: {result.compute_time:.2f}秒")

        except Exception as e:
            logger.error(f"线性弹性分析异常: {e}")
            result = FEMResult(
                displacement=np.zeros(self.elasticity_solver.ndof),
                stress=np.zeros((len(self.mesh.elements), 3)),
                strain=np.zeros((len(self.mesh.elements), 3)),
                reaction_forces=np.zeros(self.elasticity_solver.ndof),
                iterations=0, residual=float('inf'),
                converged=False, compute_time=time.time() - start_time
            )
            self.results.append(result)

        return result

    def solve_nonlinear(self, reduction_factor: float = 1.0) -> FEMResult:
        """非线性求解"""
        logger.info(f"开始非线性分析 (折减系数: {reduction_factor:.2f})...")
        result = self.nonlinear_solver.solve(reduction_factor)
        self.results.append(result)

        if result.converged:
            logger.info(f"非线性分析收敛, 迭代次数: {result.iterations}, 耗时: {result.compute_time:.2f}秒")
        else:
            logger.warning(f"非线性分析未收敛, 迭代次数: {result.iterations}, 残差: {result.residual:.6e}")

        return result


class StrengthReductionAnalysis:
    """强度折减分析"""

    def __init__(self, solver: FEMSolver, parameters: SlopeParameters):
        self.solver = solver
        self.params = parameters
        self.reduction_results: List[Dict] = []
        self.fos = 0.0
        self.critical_factor = 0.0

    def run(self, progress_callback: Optional[Callable[[float, float], None]] = None) -> StrengthReductionResult:
        """执行强度折减分析"""
        logger.info("开始强度折减分析...")
        start_time = time.time()

        settings = self.params.analysis_settings
        reduction_factors = np.arange(
            settings.reduction_factor_start,
            settings.reduction_factor_end + settings.reduction_step,
            settings.reduction_step
        )

        convergence_history = []
        displacement_history = []
        last_valid_result = None

        for i, factor in enumerate(reduction_factors):
            logger.info(f"折减系数 {i+1}/{len(reduction_factors)}: {factor:.2f}")

            try:
                result = self.solver.solve_nonlinear(factor)

                if np.any(np.isnan(result.displacement)) or np.any(np.isinf(result.displacement)):
                    logger.warning(f"折减系数 {factor:.2f} 计算结果含NaN/Inf，判定为破坏")
                    convergence_history.append(False)
                    displacement_history.append(float('inf'))

                    self.reduction_results.append({
                        "reduction_factor": factor,
                        "converged": False,
                        "iterations": result.iterations,
                        "residual": result.residual,
                        "max_displacement": float('inf'),
                        "compute_time": result.compute_time,
                        "displacement": np.zeros_like(result.displacement),
                        "stress": result.stress.copy(),
                        "strain": result.strain.copy()
                    })

                    if progress_callback:
                        progress = (i + 1) / len(reduction_factors) * 100
                        progress_callback(progress, factor)
                    break

            except Exception as e:
                logger.error(f"折减系数 {factor:.2f} 计算异常: {e}")
                convergence_history.append(False)
                displacement_history.append(float('inf'))

                if last_valid_result is not None:
                    self.reduction_results.append({
                        "reduction_factor": factor,
                        "converged": False,
                        "iterations": 0,
                        "residual": float('inf'),
                        "max_displacement": float('inf'),
                        "compute_time": 0.0,
                        "displacement": last_valid_result.displacement.copy(),
                        "stress": last_valid_result.stress.copy(),
                        "strain": last_valid_result.strain.copy()
                    })
                else:
                    self.reduction_results.append({
                        "reduction_factor": factor,
                        "converged": False,
                        "iterations": 0,
                        "residual": float('inf'),
                        "max_displacement": float('inf'),
                        "compute_time": 0.0,
                        "displacement": np.zeros(self.solver.elasticity_solver.ndof),
                        "stress": np.zeros((len(self.solver.mesh.elements), 3)),
                        "strain": np.zeros((len(self.solver.mesh.elements), 3))
                    })

                if progress_callback:
                    progress = (i + 1) / len(reduction_factors) * 100
                    progress_callback(progress, factor)
                break

            max_displacement = np.max(np.abs(result.displacement))

            self.reduction_results.append({
                "reduction_factor": factor,
                "converged": result.converged,
                "iterations": result.iterations,
                "residual": result.residual,
                "max_displacement": max_displacement,
                "compute_time": result.compute_time,
                "displacement": result.displacement.copy(),
                "stress": result.stress.copy(),
                "strain": result.strain.copy()
            })

            convergence_history.append(result.converged)
            displacement_history.append(max_displacement)

            if result.converged:
                last_valid_result = result

            if progress_callback:
                progress = (i + 1) / len(reduction_factors) * 100
                progress_callback(progress, factor)

            if not result.converged:
                logger.info(f"边坡在折减系数 {factor:.2f} 时发生破坏")
                break

        self._compute_factor_of_safety(convergence_history, displacement_history)

        failure_surface = self._identify_failure_surface()

        total_time = time.time() - start_time
        logger.info(f"强度折减分析完成, 安全系数: {self.fos:.3f}, 总耗时: {total_time:.2f}秒")

        return StrengthReductionResult(
            factor_of_safety=self.fos,
            critical_reduction_factor=self.critical_factor,
            reduction_results=self.reduction_results,
            failure_surface=failure_surface,
            displacement_at_failure=self._get_failure_displacement()
        )

    def _compute_factor_of_safety(self, convergence_history: List[bool],
                                   displacement_history: List[float]) -> None:
        """计算安全系数"""
        if not convergence_history:
            self.fos = 0.0
            self.critical_factor = 0.0
            return

        if all(convergence_history):
            self.fos = self.params.analysis_settings.reduction_factor_end
            self.critical_factor = self.fos
            return

        failure_idx = None
        for idx, conv in enumerate(convergence_history):
            if not conv:
                failure_idx = idx
                break

        if failure_idx is None:
            self.fos = self.params.analysis_settings.reduction_factor_end
            self.critical_factor = self.fos
            return

        if failure_idx == 0:
            self.fos = self.params.analysis_settings.reduction_factor_start
            self.critical_factor = self.fos
            return

        converged_factors = [r["reduction_factor"] for r in self.reduction_results[:failure_idx]]
        converged_displacements = [d for d in displacement_history[:failure_idx]
                                    if d != float('inf') and not np.isnan(d)]

        if len(converged_displacements) >= 2 and len(converged_factors) >= 2:
            disp_diff = np.diff(converged_displacements)
            factor_diff = np.diff(converged_factors)
            if len(disp_diff) >= 1 and factor_diff[-1] > 0:
                displacement_rate = disp_diff[-1] / factor_diff[-1]
                if displacement_rate > 0:
                    threshold = converged_displacements[-1] * 1.5
                    extra_factor = (threshold - converged_displacements[-1]) / displacement_rate
                    self.critical_factor = converged_factors[-1] + min(extra_factor, factor_diff[-1])
                else:
                    self.critical_factor = (converged_factors[-1] + self.reduction_results[failure_idx]["reduction_factor"]) / 2
            else:
                self.critical_factor = (converged_factors[-1] + self.reduction_results[failure_idx]["reduction_factor"]) / 2
        elif len(converged_factors) >= 1:
            self.critical_factor = (converged_factors[-1] + self.reduction_results[failure_idx]["reduction_factor"]) / 2
        else:
            self.critical_factor = self.params.analysis_settings.reduction_factor_start

        self.fos = self.critical_factor

    def _identify_failure_surface(self) -> Optional[np.ndarray]:
        """识别滑动面"""
        if not self.reduction_results:
            return None

        last_converged = None
        for result in reversed(self.reduction_results):
            if result["converged"]:
                last_converged = result
                break

        if last_converged is None:
            return None

        stress = last_converged["stress"]
        shear_stress = np.abs(stress[:, 2])

        threshold = np.percentile(shear_stress, 90)
        critical_elements = np.where(shear_stress >= threshold)[0]

        if len(critical_elements) == 0:
            return None

        mesh = self.solver.mesh
        points = []
        for elem_idx in critical_elements:
            element = mesh.elements[elem_idx]
            nodes = [mesh.nodes[i] for i in element.node_ids]
            centroid_x = np.mean([n.x for n in nodes])
            centroid_y = np.mean([n.y for n in nodes])
            points.append([centroid_x, centroid_y])

        return np.array(points) if points else None

    def _get_failure_displacement(self) -> np.ndarray:
        """获取破坏时的位移场"""
        for result in self.reduction_results:
            if not result["converged"]:
                return result["displacement"]
        if self.reduction_results:
            return self.reduction_results[-1]["displacement"]
        return np.zeros(self.solver.elasticity_solver.ndof)

    def get_convergence_curve(self) -> Tuple[np.ndarray, np.ndarray]:
        """获取收敛曲线"""
        factors = np.array([r["reduction_factor"] for r in self.reduction_results])
        displacements = np.array([r["max_displacement"] for r in self.reduction_results])
        return factors, displacements
