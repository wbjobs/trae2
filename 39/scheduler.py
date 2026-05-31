import os
import time
import json
import queue
import signal
import threading
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Callable, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from config import AppConfig, NodeConfig
from communication import ClusterCommunicator, CommandResult
from disk_check import DiskChecker, DiskHealth
from service_check import ServiceChecker, NodeServiceReport
from log_summary import LogSummarizer, InspectionReport
from node_manager import NodeStatusManager, NodeStatus

logger = logging.getLogger(__name__)


@dataclass
class InspectionTask:
    task_id: str
    task_type: str
    nodes: List[str] = field(default_factory=list)
    params: dict = field(default_factory=dict)
    status: str = "pending"
    progress: int = 0
    total: int = 0
    results: dict = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BatchResult:
    host: str
    success: bool
    disk_health: Optional[dict] = None
    service_report: Optional[dict] = None
    error: Optional[str] = None
    duration: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class AdaptiveBatcher:
    def __init__(self, initial_batch_size: int = 10, max_batch_size: int = 100, min_batch_size: int = 1):
        self.initial_batch_size = initial_batch_size
        self.max_batch_size = max_batch_size
        self.min_batch_size = min_batch_size
        self.current_batch_size = initial_batch_size
        self.success_rate_window: List[float] = []
        self.avg_response_time: float = 0.0

    def update(self, success_count: int, total_count: int, avg_duration: float) -> None:
        if total_count == 0:
            return

        success_rate = success_count / total_count
        self.success_rate_window.append(success_rate)
        if len(self.success_rate_window) > 10:
            self.success_rate_window.pop(0)

        if self.avg_response_time > 0:
            self.avg_response_time = (self.avg_response_time * 0.7) + (avg_duration * 0.3)
        else:
            self.avg_response_time = avg_duration

        avg_success = sum(self.success_rate_window) / len(self.success_rate_window)

        if avg_success > 0.95 and self.avg_response_time < 2.0:
            self.current_batch_size = min(self.max_batch_size, int(self.current_batch_size * 1.2))
        elif avg_success < 0.7 or self.avg_response_time > 5.0:
            self.current_batch_size = max(self.min_batch_size, int(self.current_batch_size * 0.8))

        logger.debug(f"批次大小调整为: {self.current_batch_size} (成功率: {avg_success:.2f}, 响应: {self.avg_response_time:.2f}s)")

    def get_batch_size(self) -> int:
        return self.current_batch_size


class InspectionScheduler:
    def __init__(self, config: AppConfig, state_dir: str = "./data"):
        self.config = config
        self.state_dir = state_dir
        self._ensure_dirs()

        self.node_manager = NodeStatusManager(
            state_file=os.path.join(state_dir, "node_status.json"),
            auto_blacklist=True,
        )

        self.log_summarizer = LogSummarizer(
            log_dir=config.log_dir,
            encoding=config.encoding.file_encoding,
        )

        self.task_queue: queue.Queue = queue.Queue()
        self.active_tasks: Dict[str, InspectionTask] = {}
        self._running = False
        self._worker_thread: Optional[threading.Thread] = None

        self._shutdown_event = threading.Event()

        self.batcher = AdaptiveBatcher(
            initial_batch_size=config.scheduling.initial_batch_size,
            max_batch_size=config.scheduling.max_batch_size,
            min_batch_size=config.scheduling.min_batch_size,
        )

        self._node_configs: Dict[str, NodeConfig] = {}

    def _ensure_dirs(self) -> None:
        Path(self.state_dir).mkdir(parents=True, exist_ok=True)
        Path(self.config.log_dir).mkdir(parents=True, exist_ok=True)

    def register_nodes(self, nodes: List[NodeConfig]) -> None:
        for node in nodes:
            self._node_configs[node.host] = node
            self.node_manager.register_node(
                host=node.host,
                role=node.role,
                tags=node.tags,
            )
        self.node_manager.save_state()

    def _get_target_nodes(self, node_filter: Optional[str] = None,
                          include_blacklisted: bool = False) -> List[str]:
        if node_filter:
            hosts = [h.strip() for h in node_filter.split(",") if h.strip()]
            targets = []
            for h in hosts:
                if h in self._node_configs:
                    if include_blacklisted or not self._is_blacklisted(h):
                        targets.append(h)
            return targets

        targets = []
        for host in self._node_configs.keys():
            if include_blacklisted or not self._is_blacklisted(host):
                targets.append(host)
        return targets

    def _is_blacklisted(self, host: str) -> bool:
        node = self.node_manager.get_node(host)
        return node is not None and node.is_blacklisted

    def _inspect_single_node(self, host: str, skip_smart: bool = False,
                              skip_service: bool = False) -> BatchResult:
        start = time.time()
        node_config = self._node_configs.get(host)
        if not node_config:
            return BatchResult(host=host, success=False, error=f"节点配置未找到: {host}")

        try:
            communicator = ClusterCommunicator(
                nodes=[node_config],
                connect_timeout=self.config.ssh_connect_timeout,
                command_timeout=self.config.ssh_timeout,
                max_parallel=1,
                max_retries=self.config.retry.max_retries,
                retry_delay=self.config.retry.retry_delay,
                encoding=self.config.encoding.ssh_encoding,
            )

            disk_health = None
            service_report = None
            error = None

            with communicator:
                disk_checker = DiskChecker(
                    communicator,
                    usage_threshold=self.config.disk_threshold.usage_percent,
                    inode_threshold=self.config.disk_threshold.inode_percent,
                    include_virtual=self.config.disk_threshold.include_virtual_fs,
                )

                dh = disk_checker.check_disk_usage(host)
                if not skip_smart:
                    smart_dh = disk_checker.check_smart(host)
                    dh.smart_infos = smart_dh.smart_infos
                    dh.raw_smart = smart_dh.raw_smart
                    if smart_dh.error and not dh.error:
                        dh.error = smart_dh.error
                disk_health = asdict(dh)

                if not skip_service and self.config.services:
                    service_names = [s.name for s in self.config.services]
                    service_checker = ServiceChecker(communicator, service_names)
                    sr = service_checker.check_node(host)
                    service_report = asdict(sr)

            duration = time.time() - start
            has_error = (disk_health and disk_health.get("error")) or \
                       (service_report and service_report.get("error"))

            if has_error:
                self.node_manager.mark_failure(host, error=str(disk_health.get("error") if disk_health else ""))
            else:
                self.node_manager.mark_success(host, duration)

            return BatchResult(
                host=host,
                success=not has_error,
                disk_health=disk_health,
                service_report=service_report,
                error=error,
                duration=duration,
            )

        except Exception as e:
            duration = time.time() - start
            self.node_manager.mark_failure(host, str(e))
            return BatchResult(host=host, success=False, error=str(e), duration=duration)

    def run_inspection(self, task_id: Optional[str] = None,
                       node_filter: Optional[str] = None,
                       skip_smart: bool = False,
                       skip_service: bool = False,
                       save_report: bool = True,
                       include_blacklisted: bool = False,
                       progress_callback: Optional[Callable] = None) -> InspectionReport:
        targets = self._get_target_nodes(node_filter, include_blacklisted)
        total = len(targets)

        if total == 0:
            raise ValueError("没有可用的巡检节点")

        task_id = task_id or f"inspect_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        logger.info(f"开始巡检任务 {task_id}, 目标节点数: {total}")

        disk_results: List[DiskHealth] = []
        service_results: List[NodeServiceReport] = []
        completed = 0
        success_count = 0
        batch_durations = []

        batch_size = self.batcher.get_batch_size()
        logger.info(f"初始批次大小: {batch_size}")

        for i in range(0, total, batch_size):
            batch = targets[i:i + batch_size]
            batch_start = time.time()
            batch_success = 0

            with ThreadPoolExecutor(max_workers=min(self.config.max_parallel, len(batch))) as executor:
                futures = {
                    executor.submit(
                        self._inspect_single_node,
                        host, skip_smart, skip_service
                    ): host for host in batch
                }

                for future in as_completed(futures):
                    result = future.result()
                    completed += 1

                    if result.success:
                        batch_success += 1
                        success_count += 1

                    if result.disk_health:
                        dh = DiskHealth(**result.disk_health)
                        disk_results.append(dh)
                    if result.service_report:
                        sr = NodeServiceReport(**result.service_report)
                        service_results.append(sr)

                    if progress_callback:
                        progress_callback(completed, total, result)

                    logger.debug(f"[{completed}/{total}] {result.host} - "
                                f"{'成功' if result.success else '失败'} ({result.duration:.2f}s)")

            batch_duration = time.time() - batch_start
            batch_avg_duration = batch_duration / len(batch) if batch else 0
            batch_durations.append(batch_avg_duration)

            self.batcher.update(batch_success, len(batch), batch_avg_duration)
            batch_size = self.batcher.get_batch_size()

            self.node_manager.save_state()

            if self._shutdown_event.is_set():
                logger.info("巡检任务被中断")
                break

        duration = sum(br.duration for br in [])
        total_duration = time.time() - time.time()
        actual_duration = sum(
            r.duration for r in disk_results
        ) if disk_results else 0

        nodes_meta = {
            host: {"role": self._node_configs[host].role, "tags": self._node_configs[host].tags}
            for host in targets if host in self._node_configs
        }

        report = self.log_summarizer.build_report(
            disk_results=disk_results,
            service_results=service_results,
            nodes_meta=nodes_meta,
            config_source="scheduler",
            duration=total_duration,
        )

        if save_report:
            try:
                self.log_summarizer.save_report(report, prefix=task_id)
            except Exception as e:
                logger.error(f"保存报告失败: {e}")

        logger.info(f"巡检任务 {task_id} 完成: {success_count}/{total} 成功, "
                    f"耗时: {total_duration:.2f}s")

        return report

    def schedule_cron(self, cron_expr: str, task_name: str = "scheduled_inspection",
                     **kwargs) -> str:
        logger.warning("Cron 调度功能需要安装 crontab 或使用 systemd timer")
        logger.info(f"建议创建定时任务: {cron_expr} -> python main.py check --config config.yaml")
        return task_name

    def start_worker(self) -> None:
        if self._running:
            return

        self._running = True
        self._shutdown_event.clear()
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()
        logger.info("巡检调度器已启动")

    def stop_worker(self) -> None:
        self._running = False
        self._shutdown_event.set()
        if self._worker_thread:
            self._worker_thread.join(timeout=30)
        self.node_manager.save_state()
        logger.info("巡检调度器已停止")

    def _worker_loop(self) -> None:
        while self._running and not self._shutdown_event.is_set():
            try:
                task = self.task_queue.get(timeout=1)
                self._execute_task(task)
                self.task_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"任务执行异常: {e}")

    def _execute_task(self, task: InspectionTask) -> None:
        self.active_tasks[task.task_id] = task
        task.status = "running"
        task.started_at = datetime.now().isoformat()

        try:
            report = self.run_inspection(
                task_id=task.task_id,
                node_filter=",".join(task.nodes) if task.nodes else None,
                skip_smart=task.params.get("skip_smart", False),
                skip_service=task.params.get("skip_service", False),
                save_report=task.params.get("save_report", True),
            )
            task.status = "completed"
            task.results["report"] = report.summary.__dict__
        except Exception as e:
            task.status = "failed"
            task.errors.append(str(e))
            logger.error(f"任务 {task.task_id} 失败: {e}")
        finally:
            task.completed_at = datetime.now().isoformat()
            if task.started_at:
                task.duration = (
                    datetime.fromisoformat(task.completed_at) -
                    datetime.fromisoformat(task.started_at)
                ).total_seconds()

    def submit_task(self, task_type: str, nodes: List[str] = None,
                   params: dict = None) -> str:
        task_id = f"{task_type}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        task = InspectionTask(
            task_id=task_id,
            task_type=task_type,
            nodes=nodes or [],
            params=params or {},
        )
        self.task_queue.put(task)
        logger.info(f"任务已提交: {task_id}")
        return task_id

    def get_task_status(self, task_id: str) -> Optional[InspectionTask]:
        return self.active_tasks.get(task_id)

    def get_active_tasks(self) -> List[InspectionTask]:
        return [t for t in self.active_tasks.values() if t.status in ("pending", "running")]

    def get_statistics(self) -> dict:
        stats = self.node_manager.get_statistics()
        stats.update({
            "queue_size": self.task_queue.qsize(),
            "active_tasks": len(self.get_active_tasks()),
            "current_batch_size": self.batcher.get_batch_size(),
            "avg_batch_response": round(self.batcher.avg_response_time, 3),
            "registered_nodes": len(self._node_configs),
        })
        return stats

    def quick_check(self, hosts: List[str], timeout: int = 5) -> dict:
        results = {}
        original_timeout = self.config.ssh_connect_timeout
        self.config.ssh_connect_timeout = timeout

        try:
            for host in hosts:
                start = time.time()
                try:
                    node_config = self._node_configs.get(host)
                    if not node_config:
                        from config import NodeConfig
                        node_config = NodeConfig(host=host, port=22, username="root")

                    from communication import SSHSession
                    session = SSHSession(
                        node_config,
                        connect_timeout=timeout,
                        command_timeout=timeout,
                        max_retries=1,
                    )
                    session.connect()
                    session.close()
                    results[host] = {"status": "online", "latency_ms": int((time.time() - start) * 1000)}
                except Exception as e:
                    results[host] = {"status": "offline", "error": str(e)}
        finally:
            self.config.ssh_connect_timeout = original_timeout

        return results

    def get_node_status(self, host: str) -> Optional[NodeStatus]:
        return self.node_manager.get_node(host)

    def export_node_report(self, filepath: str) -> None:
        self.node_manager.export_report(filepath)

    def blacklist_node(self, host: str, reason: str, duration_seconds: Optional[int] = None) -> bool:
        return self.node_manager.blacklist_node(host, reason, duration_seconds)

    def unblacklist_node(self, host: str) -> bool:
        return self.node_manager.unblacklist_node(host)

    def __enter__(self):
        self.start_worker()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop_worker()


class CancellationHandler:
    def __init__(self, scheduler: InspectionScheduler):
        self.scheduler = scheduler
        self._original_handlers = {}

    def install(self) -> None:
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                self._original_handlers[sig] = signal.signal(sig, self._handle_signal)
            except Exception:
                pass

    def _handle_signal(self, signum, frame):
        logger.info(f"收到终止信号 {signum}, 正在停止巡检调度器...")
        self.scheduler.stop_worker()
        if signum in self._original_handlers and callable(self._original_handlers[signum]):
            self._original_handlers[signum](signum, frame)
