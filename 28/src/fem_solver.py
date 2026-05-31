"""
有限元计算内核
实现线弹性力学问题的有限元求解
增强版本：添加收敛检测、错误处理、数值稳定性机制和快照保存功能
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import logging
import time
import warnings
import pickle
from pathlib import Path
from scipy.sparse import csr_matrix, lil_matrix, issparse
from scipy.sparse.linalg import spsolve, gmres, LinearOperator
from scipy.linalg import norm

from .config_parser import SimulationConfig, MaterialConfig
from .mesh_generator import MeshData

logger = logging.getLogger(__name__)
warnings.filterwarnings('ignore')


@dataclass
class SolverSnapshot:
    """求解器快照 - 用于保存计算过程状态"""
    snapshot_id: str
    timestamp: float
    stage: str
    stiffness_matrix: Optional[csr_matrix] = None
    force_vector: Optional[np.ndarray] = None
    displacement: Optional[np.ndarray] = None
    diagnostics: Optional['SolverDiagnostics'] = None
    iteration: int = 0
    metadata: Dict = field(default_factory=dict)

    def save(self, output_path: str):
        """保存快照到文件"""
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'wb') as f:
            pickle.dump(self, f)
        logger.info(f"快照已保存: {path}")

    @classmethod
    def load(cls, input_path: str) -> 'SolverSnapshot':
        """从文件加载快照"""
        with open(input_path, 'rb') as f:
            snapshot = pickle.load(f)
        logger.info(f"快照已加载: {input_path}")
        return snapshot


@dataclass
class SolverDiagnostics:
    stiffness_matrix_condition_number: float = 0.0
    force_vector_norm: float = 0.0
    displacement_norm: float = 0.0
    residual_norm: float = 0.0
    relative_residual: float = 0.0
    matrix_nonzeros: int = 0
    zero_diagonals: int = 0
    negative_diagonals: int = 0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


@dataclass
class FEMResult:
    displacement: np.ndarray
    stress: np.ndarray
    strain: np.ndarray
    von_mises: np.ndarray
    nodal_stress: np.ndarray
    nodal_strain: np.ndarray
    solve_time: float = 0.0
    iterations: int = 0
    converged: bool = True
    diagnostics: Optional[SolverDiagnostics] = None

    def save(self, output_path: str):
        np.savez(
            output_path,
            displacement=self.displacement,
            stress=self.stress,
            strain=self.strain,
            von_mises=self.von_mises,
            nodal_stress=self.nodal_stress,
            nodal_strain=self.nodal_strain,
            solve_time=np.array([self.solve_time]),
            iterations=np.array([self.iterations]),
            converged=np.array([self.converged])
        )
        logger.info(f"计算结果已保存到: {output_path}")

    @classmethod
    def load(cls, input_path: str) -> 'FEMResult':
        data = np.load(input_path)
        return cls(
            displacement=data['displacement'],
            stress=data['stress'],
            strain=data['strain'],
            von_mises=data['von_mises'],
            nodal_stress=data['nodal_stress'],
            nodal_strain=data['nodal_strain'],
            solve_time=float(data['solve_time'][0]) if 'solve_time' in data.files else 0.0,
            iterations=int(data['iterations'][0]) if 'iterations' in data.files else 0,
            converged=bool(data['converged'][0]) if 'converged' in data.files else True
        )

    def is_valid(self) -> bool:
        if self.displacement is None or not np.all(np.isfinite(self.displacement)):
            return False
        if self.stress is None or not np.all(np.isfinite(self.stress)):
            return False
        if not self.converged:
            return False
        return True


class SolverError(Exception):
    def __init__(self, message: str, diagnostics: Optional[SolverDiagnostics] = None):
        super().__init__(message)
        self.diagnostics = diagnostics


class ElasticityFEMSolver:
    def __init__(self, config: SimulationConfig, mesh_data: MeshData,
                 snapshot_dir: Optional[str] = None, enable_snapshots: bool = False):
        self.config = config
        self.mesh = mesh_data
        self._material_cache: Dict[int, MaterialConfig] = {}
        self._K: Optional[csr_matrix] = None
        self._F: Optional[np.ndarray] = None
        self._u: Optional[np.ndarray] = None
        self._diagnostics = SolverDiagnostics()
        self._max_solve_time = 300.0
        self._condition_number_threshold = 1e12
        self._displacement_threshold = 1e6
        self._enable_snapshots = enable_snapshots
        self._snapshot_dir = Path(snapshot_dir) if snapshot_dir else Path("snapshots")
        self._snapshot_counter = 0

        for mat in config.materials:
            self._material_cache[mat.id] = mat

    def save_snapshot(self, stage: str, iteration: int = 0, metadata: Optional[Dict] = None):
        """保存当前求解状态快照"""
        if not self._enable_snapshots:
            return

        self._snapshot_counter += 1
        snapshot_id = f"snapshot_{self._snapshot_counter:04d}_{stage}"

        snapshot = SolverSnapshot(
            snapshot_id=snapshot_id,
            timestamp=time.time(),
            stage=stage,
            stiffness_matrix=self._K.copy() if self._K is not None else None,
            force_vector=self._F.copy() if self._F is not None else None,
            displacement=self._u.copy() if self._u is not None else None,
            diagnostics=self._diagnostics,
            iteration=iteration,
            metadata=metadata or {}
        )

        snapshot_path = self._snapshot_dir / f"{snapshot_id}.pkl"
        snapshot.save(str(snapshot_path))

    def load_snapshot(self, snapshot_path: str) -> bool:
        """从快照恢复求解状态"""
        try:
            snapshot = SolverSnapshot.load(snapshot_path)
            self._K = snapshot.stiffness_matrix
            self._F = snapshot.force_vector
            self._u = snapshot.displacement
            self._diagnostics = snapshot.diagnostics or SolverDiagnostics()
            logger.info(f"已从快照恢复到阶段: {snapshot.stage}")
            return True
        except Exception as e:
            logger.error(f"加载快照失败: {e}")
            return False

    def solve(self, enable_recovery: bool = True) -> FEMResult:
        logger.info("开始有限元求解...")
        start_time = time.time()

        try:
            self._check_mesh_validity()
            self._assemble_stiffness_matrix()
            self.save_snapshot("after_stiffness_assembly")
            self._check_stiffness_matrix_health()
            self._assemble_force_vector()
            self.save_snapshot("after_force_assembly")
            self._apply_boundary_conditions()
            self.save_snapshot("after_bc_application")
            self._solve_system()
            self.save_snapshot("after_solve")
            self._check_solution_validity()
            result = self._compute_stress_strain()
            self.save_snapshot("final")

            result.solve_time = time.time() - start_time
            result.diagnostics = self._diagnostics

            if not result.is_valid() and enable_recovery:
                logger.warning("初始求解结果无效，尝试恢复求解...")
                result = self._attempt_recovery()

            if result.is_valid():
                logger.info(f"有限元求解成功，耗时: {result.solve_time:.2f}秒")
            else:
                logger.error(f"有限元求解失败，结果无效")

            return result

        except SolverError as e:
            logger.error(f"求解错误: {e}")
            return self._create_failed_result(start_time, str(e))
        except Exception as e:
            logger.error(f"求解过程发生未预期错误: {e}", exc_info=True)
            return self._create_failed_result(start_time, str(e))

    def _check_mesh_validity(self):
        logger.info("检查网格有效性...")

        if self.mesh.node_count == 0:
            raise SolverError("网格节点数量为0")
        if self.mesh.element_count == 0:
            raise SolverError("网格单元数量为0")

        if self.mesh.quality_report:
            if self.mesh.quality_report.valid_elements < self.mesh.quality_report.total_elements * 0.5:
                msg = f"网格有效单元比例过低: {self.mesh.quality_report.valid_elements}/{self.mesh.quality_report.total_elements}"
                self._diagnostics.warnings.append(msg)
                logger.warning(msg)

            if self.mesh.quality_report.distorted_elements > 0:
                msg = f"网格包含 {self.mesh.quality_report.distorted_elements} 个畸形单元"
                self._diagnostics.warnings.append(msg)
                logger.warning(msg)

        if np.any(np.isnan(self.mesh.nodes)) or np.any(np.isinf(self.mesh.nodes)):
            raise SolverError("网格节点包含无效数值(NaN/Inf)")

        if np.any(self.mesh.elements < 0) or np.any(self.mesh.elements >= self.mesh.node_count):
            raise SolverError("网格单元引用了无效的节点索引")

        logger.info("网格有效性检查通过")

    def _assemble_stiffness_matrix(self):
        """优化的刚度矩阵组装 - 使用预计算和批量操作减少Python循环"""
        logger.info("组装刚度矩阵...")
        n_dof = self.mesh.node_count * 2
        n_elem = self.mesh.element_count

        elements = self.mesh.elements
        nodes = self.mesh.nodes
        material_ids = self.mesh.element_material_ids

        elem_nodes = nodes[elements]

        x = elem_nodes[:, :, 0]
        y = elem_nodes[:, :, 1]

        b = np.zeros((n_elem, 3))
        c = np.zeros((n_elem, 3))
        A = np.zeros(n_elem)

        b[:, 0] = y[:, 1] - y[:, 2]
        b[:, 1] = y[:, 2] - y[:, 0]
        b[:, 2] = y[:, 0] - y[:, 1]
        c[:, 0] = x[:, 2] - x[:, 1]
        c[:, 1] = x[:, 0] - x[:, 2]
        c[:, 2] = x[:, 1] - x[:, 0]
        A = 0.5 * (x[:, 0] * (y[:, 1] - y[:, 2]) +
                   x[:, 1] * (y[:, 2] - y[:, 0]) +
                   x[:, 2] * (y[:, 0] - y[:, 1]))

        valid_mask = np.abs(A) > 1e-12

        unique_mat_ids = np.unique(material_ids)
        D_cache = {}
        for mat_id in unique_mat_ids:
            try:
                if mat_id not in self._material_cache:
                    default_mat_id = list(self._material_cache.keys())[0]
                    self._material_cache[mat_id] = self._material_cache[default_mat_id]
                    self._diagnostics.warnings.append(f"材料ID {mat_id} 无效，使用默认材料")
                D_cache[mat_id] = self._compute_D_matrix(mat_id)
            except Exception as e:
                logger.warning(f"预计算材料 {mat_id} 的D矩阵失败: {e}")

        rows = []
        cols = []
        data = []

        for elem_idx in range(n_elem):
            if not valid_mask[elem_idx]:
                self._diagnostics.warnings.append(f"单元 {elem_idx} 面积过小，跳过刚度组装")
                continue

            mat_id = material_ids[elem_idx]
            if mat_id not in D_cache:
                continue

            D = D_cache[mat_id]

            A_elem = A[elem_idx]
            b_elem = b[elem_idx]
            c_elem = c[elem_idx]

            B = np.zeros((3, 6))
            B[0, 0] = b_elem[0]
            B[0, 2] = b_elem[1]
            B[0, 4] = b_elem[2]
            B[1, 1] = c_elem[0]
            B[1, 3] = c_elem[1]
            B[1, 5] = c_elem[2]
            B[2, 0] = c_elem[0]
            B[2, 1] = b_elem[0]
            B[2, 2] = c_elem[1]
            B[2, 3] = b_elem[1]
            B[2, 4] = c_elem[2]
            B[2, 5] = b_elem[2]
            B /= (2 * A_elem)

            if np.any(np.isnan(B)) or np.any(np.isinf(B)):
                self._diagnostics.warnings.append(f"单元 {elem_idx} 的B矩阵包含无效值")
                continue

            k_elem = A_elem * (B.T @ D @ B)

            elem = elements[elem_idx]
            dof_indices = np.array([
                2 * elem[0], 2 * elem[0] + 1,
                2 * elem[1], 2 * elem[1] + 1,
                2 * elem[2], 2 * elem[2] + 1
            ], dtype=int)

            for i in range(6):
                for j in range(6):
                    val = k_elem[i, j]
                    if abs(val) > 1e-15:
                        rows.append(dof_indices[i])
                        cols.append(dof_indices[j])
                        data.append(val)

        if len(rows) > 0:
            self._K = csr_matrix(
                (data, (rows, cols)),
                shape=(n_dof, n_dof),
                dtype=np.float64
            )
        else:
            self._K = csr_matrix((n_dof, n_dof), dtype=np.float64)

        self._diagnostics.matrix_nonzeros = self._K.nnz
        logger.info(f"刚度矩阵组装完成，大小: {self._K.shape}, 非零元素: {self._K.nnz}")

    def _compute_D_matrix(self, material_id: int) -> np.ndarray:
        mat = self._material_cache[material_id]
        E = float(mat.youngs_modulus)
        nu = float(mat.poissons_ratio)

        if E <= 0:
            raise SolverError(f"材料 {material_id} 的杨氏模量必须为正数")
        if not (0 < nu < 0.5):
            raise SolverError(f"材料 {material_id} 的泊松比必须在(0, 0.5)范围内")

        factor = E / ((1 + nu) * (1 - 2 * nu))
        D = factor * np.array([
            [1 - nu, nu, 0],
            [nu, 1 - nu, 0],
            [0, 0, (1 - 2 * nu) / 2]
        ])

        return D

    def _compute_B_matrix(self, elem_nodes: np.ndarray) -> Tuple[np.ndarray, float]:
        x = elem_nodes[:, 0]
        y = elem_nodes[:, 1]

        det_J = (
            (x[1] - x[0]) * (y[2] - y[0]) -
            (x[2] - x[0]) * (y[1] - y[0])
        )

        A = 0.5 * abs(det_J)

        if abs(det_J) < 1e-12:
            return np.zeros((3, 6)), 0.0

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

        B = B / det_J

        return B, A

    def _check_stiffness_matrix_health(self):
        logger.info("检查刚度矩阵健康状态...")

        if self._K is None:
            raise SolverError("刚度矩阵为空")

        K = self._K
        n = K.shape[0]

        diag = K.diagonal()
        self._diagnostics.zero_diagonals = int(np.sum(np.abs(diag) < 1e-12))
        self._diagnostics.negative_diagonals = int(np.sum(diag < -1e-12))

        if self._diagnostics.zero_diagonals > 0:
            msg = f"刚度矩阵包含 {self._diagnostics.zero_diagonals} 个零对角元"
            self._diagnostics.warnings.append(msg)
            logger.warning(msg)

        if self._diagnostics.negative_diagonals > 0:
            msg = f"刚度矩阵包含 {self._diagnostics.negative_diagonals} 个负对角元"
            self._diagnostics.warnings.append(msg)
            logger.warning(msg)

        try:
            max_diag = np.max(np.abs(diag))
            min_diag = np.min(np.abs(diag[np.abs(diag) > 1e-12]))
            if min_diag > 0:
                self._diagnostics.stiffness_matrix_condition_number = max_diag / min_diag
                logger.info(f"刚度矩阵条件数估计: {self._diagnostics.stiffness_matrix_condition_number:.2e}")

                if self._diagnostics.stiffness_matrix_condition_number > self._condition_number_threshold:
                    msg = f"刚度矩阵条件数过大 (> {self._condition_number_threshold:.1e})，可能导致数值不稳定"
                    self._diagnostics.warnings.append(msg)
                    logger.warning(msg)
        except Exception as e:
            logger.debug(f"无法计算条件数: {e}")

    def _assemble_force_vector(self):
        logger.info("组装载荷向量...")
        n_dof = self.mesh.node_count * 2
        F = np.zeros(n_dof, dtype=np.float64)

        F = self._apply_gravity_loads(F)
        F = self._apply_stress_boundary_conditions(F)

        self._diagnostics.force_vector_norm = float(np.linalg.norm(F))
        logger.info(f"载荷向量组装完成，范数: {self._diagnostics.force_vector_norm:.2e}")

        if self._diagnostics.force_vector_norm < 1e-12:
            msg = "载荷向量范数接近零，可能导致无意义的解"
            self._diagnostics.warnings.append(msg)
            logger.warning(msg)

        self._F = F

    def _apply_gravity_loads(self, F: np.ndarray) -> np.ndarray:
        gravity = float(self.config.gravity)

        for elem_idx, elem in enumerate(self.mesh.elements):
            try:
                elem_nodes = self.mesh.nodes[elem]
                material_id = self.mesh.element_material_ids[elem_idx]

                if material_id not in self._material_cache:
                    continue

                mat = self._material_cache[material_id]
                _, A = self._compute_B_matrix(elem_nodes)

                if A < 1e-12:
                    continue

                nodal_force = float(mat.density) * gravity * A / 3.0

                for node in elem:
                    F[2 * node + 1] -= nodal_force

            except Exception as e:
                self._diagnostics.warnings.append(f"施加重力荷载时处理单元 {elem_idx} 出错: {e}")
                continue

        return F

    def _apply_stress_boundary_conditions(self, F: np.ndarray) -> np.ndarray:
        width = float(self.config.geometry.profile_width)
        height = float(self.config.geometry.profile_height)

        for side, bc in self.config.boundary_conditions.items():
            if bc.type != 'stress':
                continue

            boundary_nodes = self.mesh.boundary_nodes.get(side, [])
            if len(boundary_nodes) < 2:
                continue

            try:
                sorted_nodes = sorted(
                    boundary_nodes,
                    key=lambda n: self.mesh.nodes[n][0] if side in ['bottom', 'top'] else self.mesh.nodes[n][1]
                )

                for i in range(len(sorted_nodes) - 1):
                    n1 = sorted_nodes[i]
                    n2 = sorted_nodes[i + 1]
                    p1 = self.mesh.nodes[n1]
                    p2 = self.mesh.nodes[n2]
                    length = np.linalg.norm(p2 - p1)

                    if length < 1e-12:
                        continue

                    if bc.stress_xx is not None:
                        force_x = float(bc.stress_xx) * length / 2.0
                        F[2 * n1] += force_x
                        F[2 * n2] += force_x

                    if bc.stress_yy is not None:
                        force_y = float(bc.stress_yy) * length / 2.0
                        F[2 * n1 + 1] += force_y
                        F[2 * n2 + 1] += force_y

            except Exception as e:
                self._diagnostics.warnings.append(f"施加应力边界条件时处理 {side} 边界出错: {e}")
                continue

        return F

    def _apply_boundary_conditions(self):
        logger.info("施加位移边界条件...")
        n_dof = self.mesh.node_count * 2
        fixed_dofs = []

        for side, bc in self.config.boundary_conditions.items():
            boundary_nodes = self.mesh.boundary_nodes.get(side, [])

            if bc.type in ['fixed', 'roller', 'symmetry']:
                for node in boundary_nodes:
                    if bc.displacement_x is not None:
                        fixed_dofs.append((2 * node, float(bc.displacement_x)))
                    if bc.displacement_y is not None:
                        fixed_dofs.append((2 * node + 1, float(bc.displacement_y)))

        if not fixed_dofs:
            msg = "没有施加任何位移约束，模型可能存在刚体位移"
            self._diagnostics.warnings.append(msg)
            logger.warning(msg)

        for dof, value in fixed_dofs:
            if dof >= n_dof:
                continue
            self._F[dof] = value
            self._K[dof, :] = 0
            self._K[:, dof] = 0
            self._K[dof, dof] = 1.0

        logger.info(f"已施加 {len(fixed_dofs)} 个位移约束")

    def _solve_system(self):
        logger.info("求解线性方程组...")

        start_time = time.time()

        try:
            self._u = spsolve(self._K, self._F)

            if np.any(np.isnan(self._u)) or np.any(np.isinf(self._u)):
                raise SolverError("解包含无效数值(NaN/Inf)")

            self._diagnostics.displacement_norm = float(np.linalg.norm(self._u))
            logger.info(f"位移范数: {self._diagnostics.displacement_norm:.2e}")

            if self._diagnostics.displacement_norm > self._displacement_threshold:
                msg = f"位移范数过大 ({self._diagnostics.displacement_norm:.2e})，可能存在问题"
                self._diagnostics.warnings.append(msg)
                logger.warning(msg)

            residual = self._K @ self._u - self._F
            self._diagnostics.residual_norm = float(np.linalg.norm(residual))

            if self._diagnostics.force_vector_norm > 1e-12:
                self._diagnostics.relative_residual = self._diagnostics.residual_norm / self._diagnostics.force_vector_norm
                logger.info(f"相对残差: {self._diagnostics.relative_residual:.2e}")

                if self._diagnostics.relative_residual > 1e-6:
                    msg = f"相对残差较大 ({self._diagnostics.relative_residual:.2e})，解的精度可能不足"
                    self._diagnostics.warnings.append(msg)
                    logger.warning(msg)

            solve_time = time.time() - start_time
            logger.info(f"线性方程组求解成功，耗时: {solve_time:.2f}秒")

        except Exception as e:
            logger.error(f"直接求解失败，尝试迭代求解: {e}")
            try:
                self._u, info = gmres(self._K, self._F, rtol=1e-8, maxiter=1000)
                if info != 0:
                    raise SolverError(f"GMRES迭代求解失败，退出码: {info}")
                logger.info("GMRES迭代求解成功")
            except Exception as e2:
                raise SolverError(f"所有求解方法均失败: {e2}")

    def _check_solution_validity(self):
        logger.info("检查解的有效性...")

        if self._u is None:
            raise SolverError("位移解为空")

        if np.any(np.isnan(self._u)):
            raise SolverError("位移解包含NaN值")

        if np.any(np.isinf(self._u)):
            raise SolverError("位移解包含Inf值")

        max_disp = np.max(np.abs(self._u))
        logger.info(f"最大位移: {max_disp:.6e}")

        if max_disp > self._displacement_threshold:
            msg = f"最大位移 ({max_disp:.2e}) 超过阈值"
            self._diagnostics.warnings.append(msg)
            logger.warning(msg)

    def _attempt_recovery(self) -> FEMResult:
        logger.info("尝试恢复求解...")

        if self._diagnostics.stiffness_matrix_condition_number > self._condition_number_threshold:
            logger.info("尝试正则化刚度矩阵...")
            self._K = self._K + 1e-6 * csr_matrix(np.eye(self._K.shape[0]))
            try:
                self._solve_system()
                result = self._compute_stress_strain()
                result.diagnostics = self._diagnostics
                result.converged = True
                if result.is_valid():
                    logger.info("正则化求解成功")
                    return result
            except Exception as e:
                logger.warning(f"正则化求解失败: {e}")

        logger.warning("所有恢复尝试均失败")
        return self._create_failed_result(time.time(), "求解恢复失败")

    def _compute_stress_strain(self) -> FEMResult:
        logger.info("计算应力应变...")

        n_elem = self.mesh.element_count
        n_nodes = self.mesh.node_count

        elem_stress = np.zeros((n_elem, 3), dtype=np.float64)
        elem_strain = np.zeros((n_elem, 3), dtype=np.float64)
        elem_von_mises = np.zeros(n_elem, dtype=np.float64)

        failed_elements = 0

        for elem_idx, elem in enumerate(self.mesh.elements):
            try:
                elem_nodes = self.mesh.nodes[elem]
                material_id = self.mesh.element_material_ids[elem_idx]

                if material_id not in self._material_cache:
                    material_id = list(self._material_cache.keys())[0]

                D = self._compute_D_matrix(material_id)
                B, A = self._compute_B_matrix(elem_nodes)

                if A < 1e-12:
                    failed_elements += 1
                    continue

                u_elem = np.zeros(6, dtype=np.float64)
                for i in range(3):
                    u_elem[2*i] = self._u[2 * elem[i]]
                    u_elem[2*i + 1] = self._u[2 * elem[i] + 1]

                strain = B @ u_elem
                stress = D @ strain

                if np.any(np.isnan(strain)) or np.any(np.isnan(stress)):
                    failed_elements += 1
                    continue

                elem_strain[elem_idx] = strain
                elem_stress[elem_idx] = stress

                s11, s22, s12 = stress
                elem_von_mises[elem_idx] = np.sqrt(s11**2 - s11*s22 + s22**2 + 3*s12**2)

            except Exception as e:
                failed_elements += 1
                continue

        if failed_elements > 0:
            msg = f"{failed_elements}/{n_elem} 个单元的应力计算失败"
            self._diagnostics.warnings.append(msg)
            logger.warning(msg)

        nodal_stress = self._extrapolate_to_nodes(elem_stress)
        nodal_strain = self._extrapolate_to_nodes(elem_strain)

        result = FEMResult(
            displacement=self._u.reshape(-1, 2),
            stress=elem_stress,
            strain=elem_strain,
            von_mises=elem_von_mises,
            nodal_stress=nodal_stress,
            nodal_strain=nodal_strain,
            converged=True
        )

        return result

    def _extrapolate_to_nodes(self, elem_data: np.ndarray) -> np.ndarray:
        n_nodes = self.mesh.node_count
        n_comp = elem_data.shape[1]

        nodal_data = np.zeros((n_nodes, n_comp), dtype=np.float64)
        node_counts = np.zeros(n_nodes, dtype=np.int32)

        for elem_idx, elem in enumerate(self.mesh.elements):
            if np.all(elem_data[elem_idx] == 0):
                continue
            for node in elem:
                nodal_data[node] += elem_data[elem_idx]
                node_counts[node] += 1

        valid_nodes = node_counts > 0
        nodal_data[valid_nodes] /= node_counts[valid_nodes, np.newaxis]

        return nodal_data

    def _create_failed_result(self, start_time: float, error_message: str) -> FEMResult:
        n_elem = self.mesh.element_count
        n_nodes = self.mesh.node_count

        self._diagnostics.errors.append(error_message)

        return FEMResult(
            displacement=np.zeros((n_nodes, 2)),
            stress=np.zeros((n_elem, 3)),
            strain=np.zeros((n_elem, 3)),
            von_mises=np.zeros(n_elem),
            nodal_stress=np.zeros((n_nodes, 3)),
            nodal_strain=np.zeros((n_nodes, 3)),
            solve_time=time.time() - start_time,
            converged=False,
            diagnostics=self._diagnostics
        )
