import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, Future
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import List, Optional, Dict, Any, Callable, Tuple
import queue
import copy

from device_comms import DeviceInfo, DeviceConnectionFactory, DeviceType
from firmware_flasher import FirmwareLoader, FirmwareFlasher, FlashProgress, FlashResult
from version_manager import VersionQuery, DeviceVersionReport, FirmwareVersion, VersionStatus


class TaskType(Enum):
    FLASH = "flash"
    VERSION_QUERY = "version_query"
    SCAN = "scan"


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RECOVERING = "recovering"


@dataclass
class TaskCheckpoint:
    task_id: str
    timestamp: datetime
    device_progress: Dict[str, Any] = field(default_factory=dict)
    successful_devices: List[str] = field(default_factory=list)
    failed_devices: List[str] = field(default_factory=list)


@dataclass
class TaskInfo:
    task_id: str
    task_type: TaskType
    status: TaskStatus = TaskStatus.PENDING
    devices: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: str = ""
    progress: float = 0.0
    results: Dict[str, Any] = field(default_factory=dict)
    device_progress: Dict[str, FlashProgress] = field(default_factory=dict)
    task_params: Dict[str, Any] = field(default_factory=dict)
    retry_count: int = 0
    max_retries: int = 3
    last_checkpoint: Optional[TaskCheckpoint] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type.value,
            "status": self.status.value,
            "devices": self.devices,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
            "progress": self.progress,
            "results": self._serialize_results(),
            "device_progress": {k: self._progress_to_dict(v) for k, v in self.device_progress.items()},
            "task_params": self.task_params,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
        }

    def _serialize_results(self) -> Dict[str, Any]:
        serialized = {}
        for k, v in self.results.items():
            if hasattr(v, "to_dict"):
                serialized[k] = v.to_dict()
            elif isinstance(v, dict):
                serialized[k] = v
            else:
                serialized[k] = str(v)
        return serialized

    @staticmethod
    def _progress_to_dict(progress: FlashProgress) -> Dict[str, Any]:
        return {
            "device_id": progress.device_id,
            "state": progress.state.value if hasattr(progress.state, "value") else str(progress.state),
            "total_chunks": progress.total_chunks,
            "current_chunk": progress.current_chunk,
            "bytes_written": progress.bytes_written,
            "total_bytes": progress.total_bytes,
            "error_message": progress.error_message,
            "progress_percent": progress.progress_percent,
            "elapsed_time": progress.elapsed_time,
            "speed_bps": progress.speed_bps,
            "verify_success": progress.verify_success,
            "retry_count": progress.retry_count,
            "last_successful_chunk": progress.last_successful_chunk,
        }


class TaskManager:
    def __init__(self, max_workers: int = 4, storage_dir: Optional[str] = None):
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self._tasks: Dict[str, TaskInfo] = {}
        self._futures: Dict[str, Future] = {}
        self._lock = threading.RLock()
        self._stop_events: Dict[str, threading.Event] = {}
        self._pause_events: Dict[str, threading.Event] = {}
        self._progress_queue: queue.Queue[Tuple[str, FlashProgress]] = queue.Queue()
        self._progress_listener_thread: Optional[threading.Thread] = None
        self._progress_callbacks: List[Callable[[str, FlashProgress], None]] = []
        self._checkpoint_interval: int = 30

        self.storage_dir = Path(storage_dir) if storage_dir else Path.home() / ".fw-manager" / "tasks"
        self.checkpoint_dir = self.storage_dir / "checkpoints"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self._start_progress_listener()
        self._load_saved_tasks()

    def _start_progress_listener(self):
        self._progress_listener_thread = threading.Thread(target=self._progress_listener_loop, daemon=True)
        self._progress_listener_thread.start()

    def _progress_listener_loop(self):
        while True:
            try:
                task_id, progress = self._progress_queue.get(timeout=1)
                with self._lock:
                    if task_id in self._tasks:
                        self._tasks[task_id].device_progress[progress.device_id] = progress
                        self._update_task_progress(task_id)
                        self._maybe_save_checkpoint(task_id)
                for callback in self._progress_callbacks:
                    try:
                        callback(task_id, progress)
                    except Exception:
                        pass
            except queue.Empty:
                continue
            except Exception:
                break

    def add_progress_callback(self, callback: Callable[[str, FlashProgress], None]):
        self._progress_callbacks.append(callback)

    def _update_task_progress(self, task_id: str):
        task = self._tasks[task_id]
        if task.device_progress:
            progresses = [p.progress_percent for p in task.device_progress.values()]
            task.progress = sum(progresses) / len(progresses) if progresses else 0.0

    def _maybe_save_checkpoint(self, task_id: str):
        task = self._tasks.get(task_id)
        if not task or task.status != TaskStatus.RUNNING:
            return

        now = datetime.now()
        if task.last_checkpoint:
            elapsed = (now - task.last_checkpoint.timestamp).total_seconds()
            if elapsed < self._checkpoint_interval:
                return

        checkpoint = TaskCheckpoint(
            task_id=task_id,
            timestamp=now,
            device_progress={k: TaskInfo._progress_to_dict(v) for k, v in task.device_progress.items()},
            successful_devices=[
                k for k, v in task.results.items()
                if getattr(v, "success", False) or (isinstance(v, dict) and v.get("success"))
            ],
        )

        task.last_checkpoint = checkpoint
        self._save_checkpoint(checkpoint)

    def _save_checkpoint(self, checkpoint: TaskCheckpoint):
        file_path = self.checkpoint_dir / f"checkpoint_{checkpoint.task_id}.json"
        data = {
            "task_id": checkpoint.task_id,
            "timestamp": checkpoint.timestamp.isoformat(),
            "device_progress": checkpoint.device_progress,
            "successful_devices": checkpoint.successful_devices,
            "failed_devices": checkpoint.failed_devices,
        }
        try:
            with open(file_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    def _load_checkpoint(self, task_id: str) -> Optional[TaskCheckpoint]:
        file_path = self.checkpoint_dir / f"checkpoint_{task_id}.json"
        if not file_path.exists():
            return None

        try:
            with open(file_path, "r") as f:
                data = json.load(f)

            return TaskCheckpoint(
                task_id=data["task_id"],
                timestamp=datetime.fromisoformat(data["timestamp"]),
                device_progress=data.get("device_progress", {}),
                successful_devices=data.get("successful_devices", []),
                failed_devices=data.get("failed_devices", []),
            )
        except Exception:
            return None

    def create_flash_task(
        self,
        firmware_path: str,
        devices_info: List[DeviceInfo],
        chunk_size: int = 1024,
        max_retries: int = 5,
        verify: bool = True,
        erase: bool = False,
        enable_resume: bool = True,
    ) -> str:
        task_id = str(uuid.uuid4())[:8]

        with self._lock:
            task = TaskInfo(
                task_id=task_id,
                task_type=TaskType.FLASH,
                devices=[d.device_id for d in devices_info],
                max_retries=max_retries,
            )
            task.task_params = {
                "firmware_path": firmware_path,
                "chunk_size": chunk_size,
                "verify": verify,
                "erase": erase,
                "enable_resume": enable_resume,
                "devices_info": [
                    {
                        "device_id": d.device_id,
                        "device_type": d.device_type.value,
                        "connection": d.connection,
                        "name": d.name,
                        "port": d.port,
                        "baudrate": d.baudrate,
                    }
                    for d in devices_info
                ],
            }
            self._tasks[task_id] = task
            self._stop_events[task_id] = threading.Event()
            self._pause_events[task_id] = threading.Event()

        self._futures[task_id] = self.executor.submit(
            self._execute_flash_task,
            task_id,
            firmware_path,
            devices_info,
            chunk_size,
            max_retries,
            verify,
            erase,
            enable_resume,
        )

        self._save_task(task)
        return task_id

    def retry_task(self, task_id: str) -> Optional[str]:
        with self._lock:
            if task_id not in self._tasks:
                return None

            original_task = self._tasks[task_id]
            if original_task.status not in (TaskStatus.FAILED, TaskStatus.CANCELLED):
                return None

            if original_task.retry_count >= original_task.max_retries:
                return None

            new_task_id = str(uuid.uuid4())[:8]
            new_task = TaskInfo(
                task_id=new_task_id,
                task_type=original_task.task_type,
                devices=original_task.devices.copy(),
                task_params=copy.deepcopy(original_task.task_params),
                retry_count=original_task.retry_count + 1,
                max_retries=original_task.max_retries,
            )

            self._tasks[new_task_id] = new_task
            self._stop_events[new_task_id] = threading.Event()
            self._pause_events[new_task_id] = threading.Event()

            if original_task.task_type == TaskType.FLASH:
                params = original_task.task_params
                devices_info = self._reconstruct_devices_info(params.get("devices_info", []))

                self._futures[new_task_id] = self.executor.submit(
                    self._execute_flash_task,
                    new_task_id,
                    params.get("firmware_path", ""),
                    devices_info,
                    params.get("chunk_size", 1024),
                    params.get("max_retries", 5),
                    params.get("verify", True),
                    params.get("erase", False),
                    params.get("enable_resume", True),
                    checkpoint_task_id=task_id,
                )

            self._save_task(new_task)
            return new_task_id

    def _reconstruct_devices_info(self, devices_data: List[Dict]) -> List[DeviceInfo]:
        devices = []
        for d in devices_data:
            device_info = DeviceInfo(
                device_id=d.get("device_id", ""),
                device_type=DeviceType(d.get("device_type", "serial")),
                connection=d.get("connection", ""),
                name=d.get("name", ""),
                port=d.get("port"),
                baudrate=d.get("baudrate", 115200),
            )
            devices.append(device_info)
        return devices

    def create_version_query_task(self, devices_info: List[DeviceInfo]) -> str:
        task_id = str(uuid.uuid4())[:8]

        with self._lock:
            task = TaskInfo(
                task_id=task_id,
                task_type=TaskType.VERSION_QUERY,
                devices=[d.device_id for d in devices_info],
            )
            task.task_params = {
                "devices_info": [
                    {
                        "device_id": d.device_id,
                        "device_type": d.device_type.value,
                        "connection": d.connection,
                        "name": d.name,
                        "port": d.port,
                        "baudrate": d.baudrate,
                    }
                    for d in devices_info
                ],
            }
            self._tasks[task_id] = task
            self._stop_events[task_id] = threading.Event()
            self._pause_events[task_id] = threading.Event()

        self._futures[task_id] = self.executor.submit(
            self._execute_version_query_task,
            task_id,
            devices_info,
        )

        self._save_task(task)
        return task_id

    def _execute_flash_task(
        self,
        task_id: str,
        firmware_path: str,
        devices_info: List[DeviceInfo],
        chunk_size: int,
        max_retries: int,
        verify: bool,
        erase: bool,
        enable_resume: bool,
        checkpoint_task_id: Optional[str] = None,
    ):
        stop_event = self._stop_events.get(task_id)
        pause_event = self._pause_events.get(task_id)

        with self._lock:
            task = self._tasks[task_id]
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.now()

        resume_points = {}
        if checkpoint_task_id and enable_resume:
            checkpoint = self._load_checkpoint(checkpoint_task_id)
            if checkpoint:
                resume_points = checkpoint.device_progress

        try:
            remaining_devices = devices_info.copy()
            all_results: Dict[str, FlashResult] = {}
            attempt = 0
            max_task_retries = max(2, max_retries // 2)

            while remaining_devices and attempt < max_task_retries:
                if attempt > 0:
                    task.status = TaskStatus.RECOVERING
                    self._save_task(task)
                    time.sleep(min(2.0 * (2 ** (attempt - 1)), 8.0))
                    task.status = TaskStatus.RUNNING
                    self._save_task(task)

                attempt_results = {}
                with ThreadPoolExecutor(max_workers=self.max_workers) as device_executor:
                    futures = {
                        device_executor.submit(
                            self._flash_single_device,
                            task_id,
                            device_info,
                            firmware_path,
                            chunk_size,
                            max_retries,
                            verify,
                            erase,
                            enable_resume,
                            stop_event,
                            pause_event,
                            resume_points.get(device_info.device_id),
                        ): device_info.device_id
                        for device_info in remaining_devices
                    }

                    for future in futures:
                        device_id = futures[future]
                        try:
                            result = future.result()
                            attempt_results[device_id] = result
                        except Exception as e:
                            attempt_results[device_id] = FlashResult(
                                device_id=device_id,
                                success=False,
                                error_message=str(e),
                            )

                all_results.update(attempt_results)
                with self._lock:
                    task.results = all_results
                    self._update_task_progress(task_id)

                failed_devices = [
                    d for d in remaining_devices
                    if not attempt_results.get(d.device_id, FlashResult(device_id=d.device_id, success=False)).success
                ]

                if not failed_devices:
                    break

                remaining_devices = failed_devices
                attempt += 1

                if stop_event and stop_event.is_set():
                    break

            with self._lock:
                task.results = all_results
                all_success = all(
                    r.success if hasattr(r, "success") else False for r in all_results.values()
                )
                partial_success = any(
                    r.success if hasattr(r, "success") else False for r in all_results.values()
                )

                if all_success:
                    task.status = TaskStatus.COMPLETED
                elif partial_success:
                    task.status = TaskStatus.FAILED
                    failed_count = sum(
                        1 for r in all_results.values() if not (r.success if hasattr(r, "success") else False)
                    )
                    task.error_message = f"{failed_count} devices failed after {attempt} attempts"
                else:
                    task.status = TaskStatus.FAILED
                    task.error_message = f"All devices failed after {attempt} attempts"

                task.completed_at = datetime.now()

        except Exception as e:
            with self._lock:
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
                task.completed_at = datetime.now()
        finally:
            self._save_task(task)

    def _flash_single_device(
        self,
        task_id: str,
        device_info: DeviceInfo,
        firmware_path: str,
        chunk_size: int,
        max_retries: int,
        verify: bool,
        erase: bool,
        enable_resume: bool,
        stop_event: Optional[threading.Event],
        pause_event: Optional[threading.Event],
        resume_progress: Optional[Dict] = None,
    ) -> FlashResult:
        connection = DeviceConnectionFactory.create_connection(device_info)
        flasher = FirmwareFlasher(
            connection,
            firmware_path,
            max_retries=max_retries,
            verify=verify,
            erase_before_flash=erase,
            enable_resume=enable_resume,
            chunk_size=chunk_size,
            use_smart_chunks=True,
        )

        if resume_progress and enable_resume and not erase:
            flasher.progress.current_chunk = resume_progress.get("current_chunk", 0)
            flasher.progress.last_successful_chunk = resume_progress.get("last_successful_chunk", -1)
            flasher.progress.bytes_written = resume_progress.get("bytes_written", 0)

        def progress_callback(progress: FlashProgress):
            if stop_event and stop_event.is_set():
                raise RuntimeError("Task cancelled")
            if pause_event and pause_event.is_set():
                while pause_event.is_set() and not stop_event.is_set():
                    time.sleep(0.1)
            self._progress_queue.put((task_id, progress))

        flasher.set_progress_callback(progress_callback)

        try:
            result = flasher.flash()
            connection.disconnect()
            return result
        except Exception as e:
            connection.disconnect()
            return FlashResult(
                device_id=device_info.device_id,
                success=False,
                error_message=str(e),
            )

    def _execute_version_query_task(self, task_id: str, devices_info: List[DeviceInfo]):
        stop_event = self._stop_events.get(task_id)

        with self._lock:
            task = self._tasks[task_id]
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.now()

        try:
            results = {}
            with ThreadPoolExecutor(max_workers=self.max_workers) as device_executor:
                futures = {
                    device_executor.submit(
                        self._query_single_device_version, device_info, stop_event
                    ): device_info.device_id
                    for device_info in devices_info
                }

                for future in futures:
                    device_id = futures[future]
                    try:
                        result = future.result()
                        results[device_id] = result
                    except Exception as e:
                        results[device_id] = None

            with self._lock:
                task.results = results
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.now()
                task.progress = 100.0

        except Exception as e:
            with self._lock:
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
                task.completed_at = datetime.now()
        finally:
            self._save_task(task)

    def _query_single_device_version(
        self, device_info: DeviceInfo, stop_event: Optional[threading.Event]
    ) -> Optional[DeviceVersionReport]:
        if stop_event and stop_event.is_set():
            return None

        connection = DeviceConnectionFactory.create_connection(device_info)
        version_query = VersionQuery(connection)

        try:
            version = version_query.query_version()
            if version:
                return DeviceVersionReport(
                    device_id=device_info.device_id,
                    device_name=device_info.name,
                    connection=device_info.connection,
                    current_version=version,
                    status=VersionStatus.UNKNOWN,
                )
            return None
        finally:
            connection.disconnect()

    def pause_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False

            task = self._tasks[task_id]
            if task.status != TaskStatus.RUNNING:
                return False

            if task_id in self._pause_events:
                self._pause_events[task_id].set()

            task.status = TaskStatus.PAUSED
            self._save_task(task)
            return True

    def resume_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False

            task = self._tasks[task_id]
            if task.status != TaskStatus.PAUSED:
                return False

            if task_id in self._pause_events:
                self._pause_events[task_id].clear()

            task.status = TaskStatus.RUNNING
            self._save_task(task)
            return True

    def get_task(self, task_id: str) -> Optional[TaskInfo]:
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(
        self, limit: int = 10, status_filter: str = "all"
    ) -> List[TaskInfo]:
        with self._lock:
            tasks = sorted(
                self._tasks.values(),
                key=lambda t: t.created_at,
                reverse=True,
            )

            if status_filter != "all":
                try:
                    status = TaskStatus(status_filter)
                    tasks = [t for t in tasks if t.status == status]
                except ValueError:
                    pass

            return tasks[:limit]

    def cancel_task(self, task_id: str, force: bool = False) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False

            task = self._tasks[task_id]
            if task.status not in (TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.PAUSED):
                return False

            if task_id in self._stop_events:
                self._stop_events[task_id].set()
            if task_id in self._pause_events:
                self._pause_events[task_id].clear()

            if force and task_id in self._futures:
                self._futures[task_id].cancel()

            task.status = TaskStatus.CANCELLED
            task.completed_at = datetime.now()
            self._save_task(task)
            return True

    def wait_for_task(self, task_id: str, timeout: Optional[float] = None) -> Optional[TaskInfo]:
        if task_id in self._futures:
            try:
                self._futures[task_id].result(timeout=timeout)
            except Exception:
                pass
        return self.get_task(task_id)

    def _save_task(self, task: TaskInfo):
        file_path = self.storage_dir / f"task_{task.task_id}.json"
        with open(file_path, "w") as f:
            json.dump(task.to_dict(), f, indent=2, default=str)

    def _load_saved_tasks(self):
        for file_path in self.storage_dir.glob("task_*.json"):
            try:
                with open(file_path, "r") as f:
                    data = json.load(f)
                task = self._task_from_dict(data)
                if task.status in (TaskStatus.RUNNING, TaskStatus.PAUSED):
                    task.status = TaskStatus.FAILED
                    task.error_message = "Task interrupted"
                self._tasks[task.task_id] = task
            except Exception:
                pass

    def _task_from_dict(self, data: Dict[str, Any]) -> TaskInfo:
        task = TaskInfo(
            task_id=data["task_id"],
            task_type=TaskType(data["task_type"]),
            status=TaskStatus(data["status"]),
            devices=data.get("devices", []),
            created_at=datetime.fromisoformat(data["created_at"]),
            error_message=data.get("error_message", ""),
            progress=data.get("progress", 0.0),
            results=data.get("results", {}),
            task_params=data.get("task_params", {}),
            retry_count=data.get("retry_count", 0),
            max_retries=data.get("max_retries", 3),
        )
        if data.get("started_at"):
            task.started_at = datetime.fromisoformat(data["started_at"])
        if data.get("completed_at"):
            task.completed_at = datetime.fromisoformat(data["completed_at"])
        return task

    def cleanup_old_tasks(self, days: int = 7):
        cutoff = datetime.now().timestamp() - (days * 86400)
        with self._lock:
            to_remove = []
            for task_id, task in self._tasks.items():
                if task.created_at.timestamp() < cutoff:
                    to_remove.append(task_id)

            for task_id in to_remove:
                del self._tasks[task_id]
                task_file = self.storage_dir / f"task_{task_id}.json"
                if task_file.exists():
                    task_file.unlink()
                checkpoint_file = self.checkpoint_dir / f"checkpoint_{task_id}.json"
                if checkpoint_file.exists():
                    checkpoint_file.unlink()

    def shutdown(self):
        self.executor.shutdown(wait=False)


def parse_device_connection(connection_str: str, baudrate: int = 115200) -> DeviceInfo:
    if ":" in connection_str:
        host, port_str = connection_str.rsplit(":", 1)
        try:
            port = int(port_str)
            return DeviceInfo(
                device_id=f"net_{host}_{port}",
                device_type=DeviceType.NETWORK,
                connection=host,
                name=f"Network {host}:{port}",
                port=port,
            )
        except ValueError:
            pass

    return DeviceInfo(
        device_id=f"serial_{connection_str}",
        device_type=DeviceType.SERIAL,
        connection=connection_str,
        name=f"Serial {connection_str}",
        baudrate=baudrate,
    )
