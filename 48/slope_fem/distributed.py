"""
分布式计算支持模块
================

提供分布式计算支持,支持MPI并行计算和任务调度,
可在本地单机和分布式计算集群上运行。
"""

import os
import sys
import time
import pickle
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Callable, Any
from enum import Enum
import numpy as np

try:
    from mpi4py import MPI
    MPI_AVAILABLE = True
except ImportError:
    MPI_AVAILABLE = False

from .parameters import SlopeParameters
from .mesh import SlopeMesh, MeshGenerator
from .fem_kernel import FEMSolver, StrengthReductionAnalysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ComputationMode(Enum):
    """计算模式"""
    LOCAL = "local"
    DISTRIBUTED = "distributed"
    CLUSTER = "cluster"


@dataclass
class Task:
    """计算任务"""
    task_id: str
    task_type: str
    parameters: Dict
    status: str = "pending"
    result: Optional[Any] = None
    error: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    worker_id: Optional[int] = None


@dataclass
class WorkerInfo:
    """工作节点信息"""
    rank: int
    name: str
    status: str = "idle"
    current_task: Optional[str] = None
    cpu_count: int = 1
    memory_available: float = 0.0


class DistributedSolver:
    """分布式求解器"""

    def __init__(self, mode: ComputationMode = ComputationMode.LOCAL):
        self.mode = mode
        self.comm = None
        self.rank = 0
        self.size = 1
        self.is_master = True
        self.workers: Dict[int, WorkerInfo] = {}
        self._initialize_mpi()

    def _initialize_mpi(self) -> None:
        """初始化MPI环境"""
        if self.mode in [ComputationMode.DISTRIBUTED, ComputationMode.CLUSTER]:
            if not MPI_AVAILABLE:
                logger.warning("MPI不可用, 切换到本地计算模式")
                self.mode = ComputationMode.LOCAL
                return

            self.comm = MPI.COMM_WORLD
            self.rank = self.comm.Get_rank()
            self.size = self.comm.Get_size()
            self.is_master = (self.rank == 0)

            if self.is_master:
                logger.info(f"MPI环境初始化完成, 共 {self.size} 个进程")
                for i in range(self.size):
                    self.workers[i] = WorkerInfo(
                        rank=i,
                        name=f"worker_{i}",
                        cpu_count=os.cpu_count() or 1
                    )

    def is_distributed_mode(self) -> bool:
        """是否为分布式模式"""
        return self.mode in [ComputationMode.DISTRIBUTED, ComputationMode.CLUSTER] and MPI_AVAILABLE

    def scatter_tasks(self, tasks: List[Task]) -> Dict[int, List[Task]]:
        """任务分配"""
        if not self.is_distributed_mode() or not self.is_master:
            return {0: tasks}

        num_workers = self.size - 1
        if num_workers <= 0:
            return {0: tasks}

        task_assignments: Dict[int, List[Task]] = {i: [] for i in range(1, self.size)}

        for i, task in enumerate(tasks):
            worker_rank = (i % num_workers) + 1
            task_assignments[worker_rank].append(task)

        return task_assignments

    def broadcast_data(self, data: Any) -> Any:
        """广播数据"""
        if not self.is_distributed_mode():
            return data

        if self.is_master:
            for i in range(1, self.size):
                self.comm.send(data, dest=i, tag=0)
            return data
        else:
            return self.comm.recv(source=0, tag=0)

    def gather_results(self, results: List[Any]) -> List[Any]:
        """收集结果"""
        if not self.is_distributed_mode() or not self.is_master:
            return results

        all_results = []
        for i in range(1, self.size):
            worker_results = self.comm.recv(source=i, tag=1)
            all_results.extend(worker_results)

        return all_results

    def execute_task(self, task: Task, params: SlopeParameters,
                      progress_callback: Optional[Callable] = None) -> Task:
        """执行单个任务"""
        task.status = "running"
        task.start_time = time.time()

        try:
            if task.task_type == "strength_reduction":
                result = self._run_strength_reduction(task, params, progress_callback)
                task.result = result
                task.status = "completed"
            elif task.task_type == "linear_elastic":
                result = self._run_linear_elastic(task, params)
                task.result = result
                task.status = "completed"
            else:
                raise ValueError(f"未知任务类型: {task.task_type}")

        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            logger.error(f"任务 {task.task_id} 执行失败: {e}")

        task.end_time = time.time()
        return task

    def _run_strength_reduction(self, task: Task, params: SlopeParameters,
                                 progress_callback: Optional[Callable]) -> Any:
        """运行强度折减分析"""
        reduction_factor = task.parameters.get("reduction_factor", 1.0)

        mesh_generator = MeshGenerator(params)
        mesh = mesh_generator.generate("delaunay")

        solver = FEMSolver(mesh, params)
        fem_result = solver.solve_nonlinear(reduction_factor)

        return {
            "reduction_factor": reduction_factor,
            "fem_result": fem_result,
            "mesh_stats": mesh.compute_statistics()
        }

    def _run_linear_elastic(self, task: Task, params: SlopeParameters) -> Any:
        """运行线弹性分析"""
        mesh_generator = MeshGenerator(params)
        mesh = mesh_generator.generate("delaunay")

        solver = FEMSolver(mesh, params)
        fem_result = solver.solve_linear()

        return {
            "fem_result": fem_result,
            "mesh_stats": mesh.compute_statistics()
        }

    def run_distributed_analysis(self, parameters: SlopeParameters,
                                  progress_callback: Optional[Callable] = None) -> Any:
        """运行分布式分析"""
        if self.is_distributed_mode():
            if self.is_master:
                return self._run_master(parameters, progress_callback)
            else:
                return self._run_worker(parameters)
        else:
            return self._run_local(parameters, progress_callback)

    def _run_master(self, parameters: SlopeParameters,
                     progress_callback: Optional[Callable]) -> Any:
        """主进程运行"""
        logger.info("主进程开始分布式分析...")

        settings = parameters.analysis_settings
        reduction_factors = np.arange(
            settings.reduction_factor_start,
            settings.reduction_factor_end + settings.reduction_step,
            settings.reduction_step
        )

        tasks = []
        for i, factor in enumerate(reduction_factors):
            task = Task(
                task_id=f"task_{i}",
                task_type="strength_reduction",
                parameters={"reduction_factor": factor}
            )
            tasks.append(task)

        task_assignments = self.scatter_tasks(tasks)

        for worker_rank, worker_tasks in task_assignments.items():
            self.comm.send(parameters, dest=worker_rank, tag=10)
            self.comm.send(worker_tasks, dest=worker_rank, tag=11)

        all_results = []
        for worker_rank in task_assignments.keys():
            worker_results = self.comm.recv(source=worker_rank, tag=20)
            all_results.extend(worker_results)

        all_results.sort(key=lambda x: x["reduction_factor"])

        return self._assemble_results(parameters, all_results)

    def _run_worker(self, parameters: SlopeParameters) -> None:
        """工作进程运行"""
        logger.info(f"工作进程 {self.rank} 启动")

        while True:
            try:
                params = self.comm.recv(source=0, tag=10)
                tasks = self.comm.recv(source=0, tag=11)

                results = []
                for task in tasks:
                    result = self.execute_task(task, params)
                    results.append(result.result)

                self.comm.send(results, dest=0, tag=20)

            except Exception as e:
                logger.error(f"工作进程 {self.rank} 错误: {e}")
                break

    def _run_local(self, parameters: SlopeParameters,
                    progress_callback: Optional[Callable]) -> Any:
        """本地运行"""
        logger.info("开始本地分析...")

        mesh_generator = MeshGenerator(parameters)
        mesh = mesh_generator.generate("delaunay")

        mesh_stats = mesh.compute_statistics()
        logger.info(f"网格生成完成: {mesh_stats.get('num_nodes', 0)} 节点, {mesh_stats.get('num_elements', 0)} 单元")

        solver = FEMSolver(mesh, parameters)
        sr_analysis = StrengthReductionAnalysis(solver, parameters)

        def local_progress(progress: float, factor: float):
            logger.info(f"分析进度: {progress:.1f}%, 当前折减系数: {factor:.2f}")
            if progress_callback:
                progress_callback(progress, factor)

        sr_result = sr_analysis.run(progress_callback=local_progress)

        return {
            "mesh": mesh,
            "solver": solver,
            "sr_result": sr_result,
            "mesh_stats": mesh_stats,
            "final_fem_result": solver.results[-1] if solver.results else None
        }

    def _assemble_results(self, parameters: SlopeParameters,
                           all_results: List[Any]) -> Any:
        """组装结果"""
        mesh_generator = MeshGenerator(parameters)
        mesh = mesh_generator.generate("delaunay")

        solver = FEMSolver(mesh, parameters)
        sr_analysis = StrengthReductionAnalysis(solver, parameters)

        for result in all_results:
            fem_result = result["fem_result"]
            solver.results.append(fem_result)

            sr_analysis.reduction_results.append({
                "reduction_factor": result["reduction_factor"],
                "converged": fem_result.converged,
                "iterations": fem_result.iterations,
                "residual": fem_result.residual,
                "max_displacement": np.max(np.abs(fem_result.displacement)),
                "compute_time": fem_result.compute_time,
                "displacement": fem_result.displacement.copy(),
                "stress": fem_result.stress.copy(),
                "strain": fem_result.strain.copy()
            })

        convergence_history = [r["converged"] for r in sr_analysis.reduction_results]
        displacement_history = [r["max_displacement"] for r in sr_analysis.reduction_results]

        sr_analysis._compute_factor_of_safety(convergence_history, displacement_history)
        sr_analysis.critical_factor = sr_analysis.fos

        failure_surface = sr_analysis._identify_failure_surface()

        from .fem_kernel import StrengthReductionResult
        final_result = StrengthReductionResult(
            factor_of_safety=sr_analysis.fos,
            critical_reduction_factor=sr_analysis.critical_factor,
            reduction_results=sr_analysis.reduction_results,
            failure_surface=failure_surface,
            displacement_at_failure=sr_analysis._get_failure_displacement()
        )

        return {
            "mesh": mesh,
            "solver": solver,
            "sr_result": final_result,
            "mesh_stats": mesh.compute_statistics(),
            "final_fem_result": solver.results[-1] if solver.results else None
        }

    def finalize(self) -> None:
        """结束计算"""
        if self.is_distributed_mode() and self.comm is not None:
            if self.is_master:
                for i in range(1, self.size):
                    self.comm.send(None, dest=i, tag=99)

            MPI.Finalize()
            logger.info("MPI环境已关闭")


class TaskScheduler:
    """任务调度器"""

    def __init__(self, distributed_solver: DistributedSolver):
        self.solver = distributed_solver
        self.task_queue: List[Task] = []
        self.completed_tasks: List[Task] = []
        self.failed_tasks: List[Task] = []

    def add_task(self, task: Task) -> None:
        """添加任务"""
        self.task_queue.append(task)
        logger.info(f"任务 {task.task_id} 已加入队列")

    def add_tasks(self, tasks: List[Task]) -> None:
        """批量添加任务"""
        self.task_queue.extend(tasks)
        logger.info(f"已添加 {len(tasks)} 个任务到队列")

    def get_pending_tasks(self) -> List[Task]:
        """获取待处理任务"""
        return [t for t in self.task_queue if t.status == "pending"]

    def execute_all(self, parameters: SlopeParameters,
                     progress_callback: Optional[Callable] = None) -> List[Task]:
        """执行所有任务"""
        pending = self.get_pending_tasks()
        logger.info(f"开始执行 {len(pending)} 个任务")

        results = []
        for task in pending:
            result = self.solver.execute_task(task, parameters, progress_callback)
            results.append(result)

            if result.status == "completed":
                self.completed_tasks.append(result)
            else:
                self.failed_tasks.append(result)

        self.task_queue = [t for t in self.task_queue if t.status == "pending"]

        return results

    def get_statistics(self) -> Dict:
        """获取统计信息"""
        return {
            "total": len(self.task_queue) + len(self.completed_tasks) + len(self.failed_tasks),
            "pending": len(self.task_queue),
            "completed": len(self.completed_tasks),
            "failed": len(self.failed_tasks),
            "success_rate": len(self.completed_tasks) / max(1, len(self.completed_tasks) + len(self.failed_tasks))
        }
