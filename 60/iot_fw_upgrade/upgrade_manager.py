#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""升级进度管理模块

管理设备升级任务，支持多设备并行升级、进度监控、任务取消、
失败自动回滚、设备分组批量升级等功能。
"""

import os
import sys
import logging
import json
import time
import threading
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, Optional, List, Callable, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class UpgradeStatus(Enum):
    """升级状态枚举"""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    ROLLING_BACK = "rolling_back"
    ROLLBACK_COMPLETED = "rollback_completed"
    ROLLBACK_FAILED = "rollback_failed"


class RollbackPolicy(Enum):
    """回滚策略"""
    NONE = "none"
    ON_FAILURE = "on_failure"
    ON_DEMAND = "on_demand"
    AUTO = "auto"


class BatchStrategy(Enum):
    """分批策略"""
    PARALLEL = "parallel"
    SERIAL = "serial"
    BATCHED = "batched"
    CANARY = "canary"


@dataclass
class RollbackState:
    """回滚状态"""
    backup_path: Optional[str] = None
    original_version: Optional[str] = None
    new_version: Optional[str] = None
    rollback_trigger: Optional[str] = None
    rollback_start_time: Optional[float] = None
    rollback_end_time: Optional[float] = None
    rollback_success: bool = False
    rollback_error: Optional[str] = None
    can_rollback: bool = True
    rollback_attempts: int = 0


@dataclass
class DeviceUpgradeProgress:
    """单设备升级进度"""
    device_id: str
    status: UpgradeStatus = UpgradeStatus.PENDING
    progress: float = 0.0
    current_step: str = "等待中"
    error_message: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    retry_count: int = 0
    speed: float = 0.0
    transferred_bytes: int = 0
    total_bytes: int = 0
    rollback: RollbackState = field(default_factory=RollbackState)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "status": self.status.value,
            "progress": round(self.progress, 2),
            "current_step": self.current_step,
            "error_message": self.error_message,
            "start_time": datetime.fromtimestamp(self.start_time).isoformat() if self.start_time else None,
            "end_time": datetime.fromtimestamp(self.end_time).isoformat() if self.end_time else None,
            "retry_count": self.retry_count,
            "speed": round(self.speed, 2),
            "transferred_bytes": self.transferred_bytes,
            "total_bytes": self.total_bytes,
            "rollback": {
                "backup_path": self.rollback.backup_path,
                "original_version": self.rollback.original_version,
                "new_version": self.rollback.new_version,
                "rollback_trigger": self.rollback.rollback_trigger,
                "rollback_start_time": datetime.fromtimestamp(self.rollback.rollback_start_time).isoformat() if self.rollback.rollback_start_time else None,
                "rollback_end_time": datetime.fromtimestamp(self.rollback.rollback_end_time).isoformat() if self.rollback.rollback_end_time else None,
                "rollback_success": self.rollback.rollback_success,
                "rollback_error": self.rollback.rollback_error,
                "can_rollback": self.rollback.can_rollback,
                "rollback_attempts": self.rollback.rollback_attempts
            }
        }


@dataclass
class DeviceGroup:
    """设备分组"""
    group_id: str
    name: str
    description: str = ""
    device_ids: List[str] = field(default_factory=list)
    priority: int = 0
    max_parallel: int = 10
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "group_id": self.group_id,
            "name": self.name,
            "description": self.description,
            "device_ids": self.device_ids,
            "priority": self.priority,
            "max_parallel": self.max_parallel,
            "tags": self.tags,
            "metadata": self.metadata
        }


@dataclass
class UpgradeTask:
    """升级任务"""
    task_id: str
    patch_path: str
    device_ids: List[str]
    status: UpgradeStatus = UpgradeStatus.PENDING
    devices: Dict[str, DeviceUpgradeProgress] = field(default_factory=dict)
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    max_parallel: int = 10
    created_at: float = field(default_factory=time.time)
    cancel_flag: threading.Event = field(default_factory=threading.Event)
    rollback_policy: RollbackPolicy = RollbackPolicy.ON_FAILURE
    batch_strategy: BatchStrategy = BatchStrategy.PARALLEL
    batch_size: int = 0
    canary_percent: float = 10.0
    canary_wait_time: int = 300
    groups: List[DeviceGroup] = field(default_factory=list)
    group_execution_mode: str = "sequential"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "patch_path": self.patch_path,
            "device_ids": self.device_ids,
            "status": self.status.value,
            "devices": {k: v.to_dict() for k, v in self.devices.items()},
            "start_time": datetime.fromtimestamp(self.start_time).isoformat() if self.start_time else None,
            "end_time": datetime.fromtimestamp(self.end_time).isoformat() if self.end_time else None,
            "max_parallel": self.max_parallel,
            "created_at": datetime.fromtimestamp(self.created_at).isoformat(),
            "completed_count": self.completed_count,
            "failed_count": self.failed_count,
            "overall_progress": self.overall_progress,
            "rollback_policy": self.rollback_policy.value,
            "batch_strategy": self.batch_strategy.value,
            "batch_size": self.batch_size,
            "canary_percent": self.canary_percent,
            "canary_wait_time": self.canary_wait_time,
            "groups": [g.to_dict() for g in self.groups],
            "group_execution_mode": self.group_execution_mode
        }

    @property
    def completed_count(self) -> int:
        return sum(1 for d in self.devices.values()
                   if d.status in (UpgradeStatus.COMPLETED,))

    @property
    def failed_count(self) -> int:
        return sum(1 for d in self.devices.values()
                   if d.status in (UpgradeStatus.FAILED, UpgradeStatus.CANCELLED,
                                   UpgradeStatus.TIMEOUT, UpgradeStatus.ROLLBACK_FAILED))

    @property
    def rollback_count(self) -> int:
        return sum(1 for d in self.devices.values()
                   if d.status in (UpgradeStatus.ROLLING_BACK,
                                   UpgradeStatus.ROLLBACK_COMPLETED,
                                   UpgradeStatus.ROLLBACK_FAILED))

    @property
    def overall_progress(self) -> float:
        if not self.devices:
            return 0.0
        total_progress = sum(d.progress for d in self.devices.values())
        return total_progress / len(self.devices)

    @property
    def success_rate(self) -> float:
        total = len(self.devices)
        if total == 0:
            return 100.0
        return (self.completed_count / total) * 100


class ProgressBar:
    """终端进度条"""

    def __init__(self, total: int = 100, width: int = 50, prefix: str = ""):
        self.total = total
        self.width = width
        self.prefix = prefix
        self.current = 0
        self.last_update = 0

    def update(self, current: float, suffix: str = ""):
        self.current = min(current, self.total)
        now = time.time()
        if now - self.last_update < 0.1 and self.current < self.total:
            return
        self.last_update = now
        self._draw(suffix)

    def _draw(self, suffix: str = ""):
        filled = int(self.width * self.current / self.total)
        bar = '█' * filled + '░' * (self.width - filled)
        percent = self.current / self.total * 100
        sys.stdout.write(f'\r{self.prefix} |{bar}| {percent:5.1f}% {suffix}')
        sys.stdout.flush()

    def finish(self, suffix: str = ""):
        self.current = self.total
        self._draw(suffix)
        sys.stdout.write('\n')
        sys.stdout.flush()


class RollbackManager:
    """回滚管理器"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._backup_dir = config.get("backup_dir", "./firmware_backups")
        os.makedirs(self._backup_dir, exist_ok=True)

    def backup_firmware(self, device_id: str, original_version: str,
                       firmware_data: bytes) -> str:
        """备份设备当前固件"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"{device_id}_{original_version}_{timestamp}.bin"
        backup_path = os.path.join(self._backup_dir, backup_filename)

        try:
            with open(backup_path, 'wb') as f:
                f.write(firmware_data)
            logger.info(f"设备 {device_id} 固件已备份: {backup_path}")
            return backup_path
        except Exception as e:
            logger.error(f"备份设备 {device_id} 固件失败: {e}")
            return ""

    def load_backup(self, backup_path: str) -> Optional[bytes]:
        """加载备份固件"""
        if not os.path.exists(backup_path):
            logger.error(f"备份文件不存在: {backup_path}")
            return None

        try:
            with open(backup_path, 'rb') as f:
                return f.read()
        except Exception as e:
            logger.error(f"加载备份文件失败: {e}")
            return None

    def delete_backup(self, backup_path: str) -> bool:
        """删除备份"""
        try:
            if os.path.exists(backup_path):
                os.remove(backup_path)
                logger.info(f"备份已删除: {backup_path}")
            return True
        except Exception as e:
            logger.warning(f"删除备份失败: {e}")
            return False

    def cleanup_old_backups(self, days: int = 7) -> int:
        """清理旧备份"""
        count = 0
        cutoff = time.time() - days * 86400

        for filename in os.listdir(self._backup_dir):
            filepath = os.path.join(self._backup_dir, filename)
            if os.path.isfile(filepath) and os.path.getmtime(filepath) < cutoff:
                try:
                    os.remove(filepath)
                    count += 1
                except Exception as e:
                    logger.warning(f"删除旧备份失败 {filepath}: {e}")

        logger.info(f"清理了 {count} 个旧备份")
        return count

    def perform_rollback(self, device_id: str, progress: DeviceUpgradeProgress,
                        communicator, protocol: str, timeout: int) -> bool:
        """执行回滚"""
        if not progress.rollback.backup_path:
            progress.rollback.rollback_error = "无备份文件，无法回滚"
            return False

        progress.rollback.rollback_start_time = time.time()
        progress.rollback.rollback_attempts += 1
        progress.status = UpgradeStatus.ROLLING_BACK
        progress.current_step = "回滚中"

        try:
            backup_data = self.load_backup(progress.rollback.backup_path)
            if not backup_data:
                progress.rollback.rollback_error = "加载备份文件失败"
                progress.status = UpgradeStatus.ROLLBACK_FAILED
                progress.rollback.rollback_end_time = time.time()
                return False

            result = communicator.send_firmware(
                device_id=device_id,
                firmware_data=backup_data,
                firmware_version=progress.rollback.original_version or "rollback",
                protocol=protocol,
                timeout=timeout,
                is_rollback=True
            )

            if result.success:
                progress.rollback.rollback_success = True
                progress.status = UpgradeStatus.ROLLBACK_COMPLETED
                progress.current_step = "回滚完成"
                progress.progress = 100.0
                logger.info(f"设备 {device_id} 回滚成功")
            else:
                progress.rollback.rollback_error = result.error or "回滚失败"
                progress.status = UpgradeStatus.ROLLBACK_FAILED
                logger.warning(f"设备 {device_id} 回滚失败: {progress.rollback.rollback_error}")

            progress.rollback.rollback_end_time = time.time()
            return progress.rollback.rollback_success

        except Exception as e:
            progress.rollback.rollback_error = f"回滚异常: {e}"
            progress.status = UpgradeStatus.ROLLBACK_FAILED
            progress.rollback.rollback_end_time = time.time()
            logger.error(f"设备 {device_id} 回滚异常: {e}")
            return False


class DeviceGroupManager:
    """设备分组管理器"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._groups: Dict[str, DeviceGroup] = {}
        self._groups_file = config.get("groups_file", "./groups.json")
        self._load_groups()

    def _load_groups(self):
        """加载分组配置"""
        if os.path.exists(self._groups_file):
            try:
                with open(self._groups_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for group_data in data:
                    group = DeviceGroup(
                        group_id=group_data["group_id"],
                        name=group_data.get("name", group_data["group_id"]),
                        description=group_data.get("description", ""),
                        device_ids=group_data.get("device_ids", []),
                        priority=group_data.get("priority", 0),
                        max_parallel=group_data.get("max_parallel", 10),
                        tags=group_data.get("tags", []),
                        metadata=group_data.get("metadata", {})
                    )
                    self._groups[group.group_id] = group
                logger.info(f"已加载 {len(self._groups)} 个设备分组")
            except Exception as e:
                logger.warning(f"加载分组配置失败: {e}")

    def _save_groups(self):
        """保存分组配置"""
        try:
            data = [g.to_dict() for g in self._groups.values()]
            with open(self._groups_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"保存分组配置失败: {e}")

    def create_group(self, group_id: str, name: str, description: str = "",
                    device_ids: List[str] = None, priority: int = 0,
                    max_parallel: int = 10, tags: List[str] = None) -> DeviceGroup:
        """创建设备分组"""
        if group_id in self._groups:
            raise ValueError(f"分组ID已存在: {group_id}")

        group = DeviceGroup(
            group_id=group_id,
            name=name,
            description=description,
            device_ids=device_ids or [],
            priority=priority,
            max_parallel=max_parallel,
            tags=tags or []
        )
        self._groups[group_id] = group
        self._save_groups()
        logger.info(f"创建设备分组: {group_id}")
        return group

    def delete_group(self, group_id: str) -> bool:
        """删除设备分组"""
        if group_id in self._groups:
            del self._groups[group_id]
            self._save_groups()
            logger.info(f"删除设备分组: {group_id}")
            return True
        return False

    def get_group(self, group_id: str) -> Optional[DeviceGroup]:
        """获取分组"""
        return self._groups.get(group_id)

    def list_groups(self) -> List[DeviceGroup]:
        """列出所有分组"""
        return sorted(self._groups.values(), key=lambda g: (-g.priority, g.group_id))

    def add_device_to_group(self, group_id: str, device_id: str) -> bool:
        """添加设备到分组"""
        group = self._groups.get(group_id)
        if not group:
            return False
        if device_id not in group.device_ids:
            group.device_ids.append(device_id)
            self._save_groups()
        return True

    def remove_device_from_group(self, group_id: str, device_id: str) -> bool:
        """从分组移除设备"""
        group = self._groups.get(group_id)
        if not group or device_id not in group.device_ids:
            return False
        group.device_ids.remove(device_id)
        self._save_groups()
        return True

    def get_devices_by_tag(self, tag: str) -> List[str]:
        """按标签获取设备"""
        devices = set()
        for group in self._groups.values():
            if tag in group.tags:
                devices.update(group.device_ids)
        return list(devices)


class UpgradeManager:
    """升级管理器"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._tasks: Dict[str, UpgradeTask] = {}
        self._tasks_lock = threading.Lock()
        self._log_dir = config.get("upgrade_log_dir", "./upgrade_logs")
        os.makedirs(self._log_dir, exist_ok=True)

        self.rollback_manager = RollbackManager(config)
        self.group_manager = DeviceGroupManager(config)

    def _generate_task_id(self) -> str:
        """生成任务ID"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"upgrade_{timestamp}"

    def upgrade_single(self, device_identifier: str, patch_path: str, protocol: str = "mqtt",
                       timeout: int = 30, retry_count: int = 3,
                       rollback_policy: str = "on_failure") -> int:
        """
        升级单台设备
        """
        if not os.path.exists(patch_path):
            logger.error(f"差分包不存在: {patch_path}")
            return 1

        task_id = self._generate_task_id()
        task = UpgradeTask(
            task_id=task_id,
            patch_path=patch_path,
            device_ids=[device_identifier],
            max_parallel=1,
            rollback_policy=RollbackPolicy(rollback_policy)
        )
        task.devices[device_identifier] = DeviceUpgradeProgress(device_id=device_identifier)

        with self._tasks_lock:
            self._tasks[task_id] = task

        logger.info(f"创建升级任务: {task_id}")
        logger.info(f"升级设备: {device_identifier}")
        logger.info(f"回滚策略: {rollback_policy}")

        result = self._execute_single_upgrade(task, device_identifier, protocol, timeout, retry_count)

        self._save_task_log(task)
        self._print_single_result(task, device_identifier)

        return 0 if result else 1

    def upgrade_batch(self, devices_file: str, patch_path: str, max_parallel: int = 10,
                      protocol: str = "mqtt", timeout: int = 30, retry_count: int = 3,
                      rollback_policy: str = "on_failure",
                      batch_strategy: str = "parallel", batch_size: int = 0,
                      canary_percent: float = 10.0, canary_wait_time: int = 300) -> int:
        """
        批量升级设备
        """
        if not os.path.exists(patch_path):
            logger.error(f"差分包不存在: {patch_path}")
            return 1

        if not os.path.exists(devices_file):
            logger.error(f"设备列表文件不存在: {devices_file}")
            return 1

        try:
            with open(devices_file, 'r', encoding='utf-8') as f:
                devices_data = json.load(f)
        except Exception as e:
            logger.error(f"读取设备列表失败: {e}")
            return 1

        if isinstance(devices_data, dict):
            devices_data = [devices_data]

        if not devices_data:
            logger.error("设备列表为空")
            return 1

        device_identifiers = []
        for dev in devices_data:
            identifier = dev.get("id") or dev.get("device_id") or dev.get("ip")
            if identifier:
                device_identifiers.append(identifier)

        if not device_identifiers:
            logger.error("未找到有效的设备标识")
            return 1

        task_id = self._generate_task_id()
        task = UpgradeTask(
            task_id=task_id,
            patch_path=patch_path,
            device_ids=device_identifiers,
            max_parallel=max_parallel,
            rollback_policy=RollbackPolicy(rollback_policy),
            batch_strategy=BatchStrategy(batch_strategy),
            batch_size=batch_size,
            canary_percent=canary_percent,
            canary_wait_time=canary_wait_time
        )

        for dev_id in device_identifiers:
            task.devices[dev_id] = DeviceUpgradeProgress(device_id=dev_id)

        with self._tasks_lock:
            self._tasks[task_id] = task

        logger.info(f"创建批量升级任务: {task_id}")
        logger.info(f"待升级设备数: {len(device_identifiers)}")
        logger.info(f"最大并行数: {max_parallel}")
        logger.info(f"分批策略: {batch_strategy}")
        logger.info(f"回滚策略: {rollback_policy}")

        task.start_time = time.time()
        task.status = UpgradeStatus.RUNNING

        self._execute_batch_upgrade(task, protocol, timeout, retry_count)

        task.end_time = time.time()
        if task.failed_count == 0:
            task.status = UpgradeStatus.COMPLETED
        elif task.completed_count > 0:
            task.status = UpgradeStatus.FAILED

        self._save_task_log(task)
        self._print_batch_result(task)

        return 0 if task.failed_count == 0 else 1

    def upgrade_by_groups(self, group_ids: List[str], patch_path: str,
                         protocol: str = "mqtt", timeout: int = 30,
                         retry_count: int = 3, rollback_policy: str = "on_failure",
                         sequential: bool = True) -> int:
        """
        按设备分组升级
        """
        if not os.path.exists(patch_path):
            logger.error(f"差分包不存在: {patch_path}")
            return 1

        groups = []
        all_device_ids = []
        for group_id in group_ids:
            group = self.group_manager.get_group(group_id)
            if not group:
                logger.warning(f"分组不存在: {group_id}")
                continue
            groups.append(group)
            all_device_ids.extend(group.device_ids)

        if not groups:
            logger.error("未找到有效的分组")
            return 1

        if not all_device_ids:
            logger.error("所有分组均无设备")
            return 1

        task_id = self._generate_task_id()
        task = UpgradeTask(
            task_id=task_id,
            patch_path=patch_path,
            device_ids=all_device_ids,
            max_parallel=max(g.max_parallel for g in groups),
            rollback_policy=RollbackPolicy(rollback_policy),
            groups=groups,
            group_execution_mode="sequential" if sequential else "parallel"
        )

        for dev_id in all_device_ids:
            task.devices[dev_id] = DeviceUpgradeProgress(device_id=dev_id)

        with self._tasks_lock:
            self._tasks[task_id] = task

        logger.info(f"创建分组升级任务: {task_id}")
        logger.info(f"分组数: {len(groups)}")
        logger.info(f"总设备数: {len(all_device_ids)}")
        logger.info(f"执行模式: {'顺序' if sequential else '并行'}")

        task.start_time = time.time()
        task.status = UpgradeStatus.RUNNING

        if sequential:
            self._execute_group_upgrade_sequential(task, groups, protocol, timeout, retry_count)
        else:
            self._execute_group_upgrade_parallel(task, groups, protocol, timeout, retry_count)

        task.end_time = time.time()
        if task.failed_count == 0:
            task.status = UpgradeStatus.COMPLETED
        elif task.completed_count > 0:
            task.status = UpgradeStatus.FAILED

        self._save_task_log(task)
        self._print_batch_result(task)

        return 0 if task.failed_count == 0 else 1

    def _execute_group_upgrade_sequential(self, task: UpgradeTask, groups: List[DeviceGroup],
                                         protocol: str, timeout: int, retry_count: int):
        """顺序执行分组升级"""
        sorted_groups = sorted(groups, key=lambda g: (-g.priority, g.group_id))

        for group in sorted_groups:
            if task.cancel_flag.is_set():
                break

            logger.info(f"开始升级分组: {group.name} ({group.group_id})")
            logger.info(f"分组设备数: {len(group.device_ids)}")

            device_queue = queue.Queue()
            for device_id in group.device_ids:
                if device_id in task.devices:
                    device_queue.put(device_id)

            if device_queue.empty():
                continue

            self._execute_device_queue(task, device_queue, group.max_parallel,
                                     protocol, timeout, retry_count)

            failed_in_group = sum(
                1 for d in task.devices.values()
                if d.device_id in group.device_ids and d.status == UpgradeStatus.FAILED
            )

            if failed_in_group > 0:
                logger.warning(f"分组 {group.name} 有 {failed_in_group} 台设备升级失败")
                if self.config.get("stop_on_group_failure", False):
                    logger.error("根据配置停止后续分组升级")
                    break

            logger.info(f"分组 {group.name} 升级完成")

    def _execute_group_upgrade_parallel(self, task: UpgradeTask, groups: List[DeviceGroup],
                                       protocol: str, timeout: int, retry_count: int):
        """并行执行分组升级"""
        def group_worker(group: DeviceGroup):
            if task.cancel_flag.is_set():
                return

            device_queue = queue.Queue()
            for device_id in group.device_ids:
                if device_id in task.devices:
                    device_queue.put(device_id)

            if device_queue.empty():
                return

            self._execute_device_queue(task, device_queue, group.max_parallel,
                                     protocol, timeout, retry_count)

        with ThreadPoolExecutor(max_workers=len(groups)) as executor:
            futures = [executor.submit(group_worker, g) for g in groups]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"分组升级异常: {e}")

    def _execute_single_upgrade(self, task: UpgradeTask, device_id: str,
                                protocol: str, timeout: int, retry_count: int) -> bool:
        """
        执行单设备升级
        """
        from .device_comm import DeviceCommunicator

        progress = task.devices[device_id]
        progress.status = UpgradeStatus.RUNNING
        progress.start_time = time.time()
        progress.total_bytes = os.path.getsize(task.patch_path)

        bar = ProgressBar(total=100, prefix=f"[{device_id}]")

        def progress_callback(percent: float):
            progress.progress = percent
            progress.current_step = f"传输中 {percent:.1f}%"
            progress.transferred_bytes = int(progress.total_bytes * percent / 100)
            if progress.start_time and percent > 0:
                elapsed = time.time() - progress.start_time
                progress.speed = progress.transferred_bytes / elapsed if elapsed > 0 else 0
            bar.update(percent, f"| {progress.speed / 1024:.1f} KB/s")

        communicator = DeviceCommunicator(self.config)

        try:
            if task.rollback_policy != RollbackPolicy.NONE:
                progress.current_step = "备份当前固件"
                bar.update(0, "| 备份中")

                backup_result = communicator.query_firmware_version(device_id, protocol, timeout)
                if backup_result.success and backup_result.data:
                    progress.rollback.original_version = backup_result.data.get("version")
                    progress.rollback.new_version = self._get_patch_version(task.patch_path)

                    firmware_data = backup_result.data.get("firmware_data")
                    if firmware_data:
                        progress.rollback.backup_path = self.rollback_manager.backup_firmware(
                            device_id,
                            progress.rollback.original_version or "unknown",
                            firmware_data
                        )
                    else:
                        logger.warning(f"设备 {device_id} 无法获取固件数据进行备份")
                        progress.rollback.can_rollback = False
                else:
                    logger.warning(f"设备 {device_id} 查询版本失败，跳过备份")
                    progress.rollback.can_rollback = False

            for attempt in range(retry_count):
                if task.cancel_flag.is_set():
                    progress.status = UpgradeStatus.CANCELLED
                    progress.error_message = "用户取消"
                    progress.end_time = time.time()
                    return False

                progress.retry_count = attempt
                progress.current_step = f"尝试 {attempt + 1}/{retry_count}: 连接设备"

                result = communicator.upgrade_device(
                    device_id,
                    task.patch_path,
                    protocol,
                    timeout,
                    retry_count=1,
                    progress_callback=progress_callback
                )

                if result.success:
                    progress.status = UpgradeStatus.COMPLETED
                    progress.progress = 100.0
                    progress.current_step = "升级完成"
                    progress.end_time = time.time()
                    bar.finish("完成")

                    if progress.rollback.backup_path and self.config.get("auto_delete_backup", True):
                        self.rollback_manager.delete_backup(progress.rollback.backup_path)

                    return True
                else:
                    progress.error_message = result.error
                    logger.warning(f"设备 {device_id} 第 {attempt + 1} 次升级失败: {result.error}")

                    if attempt < retry_count - 1:
                        wait_time = self.config.get("retry_interval", 5)
                        progress.current_step = f"等待重试 ({wait_time}s)"
                        time.sleep(wait_time)

            progress.status = UpgradeStatus.FAILED
            progress.current_step = "升级失败"
            progress.end_time = time.time()
            bar.finish("失败")

            if (task.rollback_policy == RollbackPolicy.ON_FAILURE or
                task.rollback_policy == RollbackPolicy.AUTO):
                if progress.rollback.can_rollback and progress.rollback.backup_path:
                    progress.rollback.rollback_trigger = "upgrade_failed"
                    logger.info(f"开始回滚设备 {device_id}")
                    bar.update(0, "| 回滚中")

                    rollback_success = self.rollback_manager.perform_rollback(
                        device_id, progress, communicator, protocol, timeout
                    )

                    if rollback_success:
                        bar.finish("回滚成功")
                    else:
                        bar.finish("回滚失败")

            return False

        except Exception as e:
            progress.status = UpgradeStatus.FAILED
            progress.error_message = str(e)
            progress.end_time = time.time()
            logger.error(f"设备 {device_id} 升级异常: {e}")
            bar.finish("异常")

            if (task.rollback_policy == RollbackPolicy.ON_FAILURE or
                task.rollback_policy == RollbackPolicy.AUTO):
                if progress.rollback.can_rollback and progress.rollback.backup_path:
                    progress.rollback.rollback_trigger = "upgrade_exception"
                    self.rollback_manager.perform_rollback(
                        device_id, progress, communicator, protocol, timeout
                    )

            return False

    def _execute_batch_upgrade(self, task: UpgradeTask, protocol: str,
                               timeout: int, retry_count: int):
        """
        执行批量升级
        """
        if task.batch_strategy == BatchStrategy.CANARY:
            self._execute_canary_upgrade(task, protocol, timeout, retry_count)
        elif task.batch_strategy == BatchStrategy.BATCHED:
            self._execute_batched_upgrade(task, protocol, timeout, retry_count)
        elif task.batch_strategy == BatchStrategy.SERIAL:
            self._execute_serial_upgrade(task, protocol, timeout, retry_count)
        else:
            self._execute_parallel_upgrade(task, protocol, timeout, retry_count)

    def _execute_parallel_upgrade(self, task: UpgradeTask, protocol: str,
                                  timeout: int, retry_count: int):
        """并行升级"""
        device_queue = queue.Queue()
        for device_id in task.device_ids:
            device_queue.put(device_id)

        self._display_batch_progress(task)
        self._execute_device_queue(task, device_queue, task.max_parallel,
                                   protocol, timeout, retry_count)

    def _execute_serial_upgrade(self, task: UpgradeTask, protocol: str,
                                timeout: int, retry_count: int):
        """串行升级"""
        self._display_batch_progress(task)

        for device_id in task.device_ids:
            if task.cancel_flag.is_set():
                break
            self._execute_single_upgrade(task, device_id, protocol, timeout, retry_count)

    def _execute_batched_upgrade(self, task: UpgradeTask, protocol: str,
                                 timeout: int, retry_count: int):
        """分批升级"""
        batch_size = task.batch_size or max(1, task.max_parallel)
        devices = task.device_ids[:]

        self._display_batch_progress(task)

        for i in range(0, len(devices), batch_size):
            if task.cancel_flag.is_set():
                break

            batch = devices[i:i + batch_size]
            logger.info(f"开始第 {i // batch_size + 1} 批升级，设备数: {len(batch)}")

            device_queue = queue.Queue()
            for device_id in batch:
                device_queue.put(device_id)

            self._execute_device_queue(task, device_queue, min(batch_size, task.max_parallel),
                                       protocol, timeout, retry_count)

            failed_in_batch = sum(
                1 for d in task.devices.values()
                if d.device_id in batch and d.status == UpgradeStatus.FAILED
            )

            if failed_in_batch > 0:
                logger.warning(f"本批次有 {failed_in_batch} 台设备失败")

                if failed_in_batch / len(batch) > self.config.get("batch_failure_threshold", 0.5):
                    logger.error("批次失败率过高，停止后续升级")
                    break

            if i + batch_size < len(devices):
                wait_time = self.config.get("batch_interval", 60)
                logger.info(f"等待 {wait_time} 秒后开始下一批...")
                time.sleep(wait_time)

    def _execute_canary_upgrade(self, task: UpgradeTask, protocol: str,
                                timeout: int, retry_count: int):
        """金丝雀升级"""
        canary_count = max(1, int(len(task.device_ids) * task.canary_percent / 100))
        canary_devices = task.device_ids[:canary_count]
        remaining_devices = task.device_ids[canary_count:]

        logger.info(f"金丝雀升级: 首批 {canary_count} 台设备，等待 {task.canary_wait_time} 秒观察")

        device_queue = queue.Queue()
        for device_id in canary_devices:
            device_queue.put(device_id)

        self._display_batch_progress(task)
        self._execute_device_queue(task, device_queue, task.max_parallel,
                                   protocol, timeout, retry_count)

        canary_success = sum(
            1 for d in task.devices.values()
            if d.device_id in canary_devices and d.status == UpgradeStatus.COMPLETED
        )

        success_rate = canary_success / canary_count * 100 if canary_count > 0 else 0
        logger.info(f"金丝雀批次成功率: {success_rate:.1f}% ({canary_success}/{canary_count})")

        if success_rate < self.config.get("canary_success_threshold", 90):
            logger.error("金丝雀批次成功率过低，停止后续升级")
            return

        logger.info(f"等待 {task.canary_wait_time} 秒观察运行情况...")
        time.sleep(task.canary_wait_time)

        if remaining_devices:
            logger.info(f"开始剩余 {len(remaining_devices)} 台设备升级")
            device_queue = queue.Queue()
            for device_id in remaining_devices:
                device_queue.put(device_id)

            self._execute_device_queue(task, device_queue, task.max_parallel,
                                       protocol, timeout, retry_count)

    def _execute_device_queue(self, task: UpgradeTask, device_queue: queue.Queue,
                             max_parallel: int, protocol: str, timeout: int, retry_count: int):
        """执行设备队列升级"""
        def worker():
            while not device_queue.empty():
                if task.cancel_flag.is_set():
                    break
                try:
                    device_id = device_queue.get_nowait()
                    self._execute_single_upgrade(task, device_id, protocol, timeout, retry_count)
                except queue.Empty:
                    break
                except Exception as e:
                    logger.error(f"工作线程异常: {e}")

        with ThreadPoolExecutor(max_workers=max_parallel) as executor:
            futures = [executor.submit(worker) for _ in range(max_parallel)]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"线程执行异常: {e}")

    def _display_batch_progress(self, task: UpgradeTask):
        """在独立线程中显示批量升级进度"""
        def display_worker():
            while task.status == UpgradeStatus.RUNNING:
                self._refresh_batch_display(task)
                time.sleep(1)
            self._refresh_batch_display(task)

        display_thread = threading.Thread(target=display_worker, daemon=True)
        display_thread.start()

    def _refresh_batch_display(self, task: UpgradeTask):
        """刷新批量升级显示"""
        total = len(task.devices)
        completed = task.completed_count
        failed = task.failed_count
        running = sum(1 for d in task.devices.values() if d.status == UpgradeStatus.RUNNING)
        pending = sum(1 for d in task.devices.values() if d.status == UpgradeStatus.PENDING)
        rollback = task.rollback_count

        overall_progress = task.overall_progress

        sys.stdout.write(f'\033[2K\r')
        sys.stdout.write(
            f"任务 {task.task_id} | 总进度: {overall_progress:5.1f}% | "
            f"完成: {completed}/{total} | 运行中: {running} | "
            f"失败: {failed} | 回滚: {rollback} | 等待: {pending}"
        )
        sys.stdout.flush()

        if completed + failed + rollback >= total:
            sys.stdout.write('\n')
            sys.stdout.flush()

    def rollback_device(self, device_id: str, task_id: Optional[str] = None,
                       protocol: str = "mqtt", timeout: int = 30) -> int:
        """手动触发设备回滚"""
        task = None
        if task_id:
            task = self._get_task(task_id)

        progress = None
        if task and device_id in task.devices:
            progress = task.devices[device_id]
        else:
            progress = DeviceUpgradeProgress(device_id=device_id)
            progress.rollback.backup_path = self._find_latest_backup(device_id)

        if not progress or not progress.rollback.backup_path:
            logger.error(f"未找到设备 {device_id} 的备份，无法回滚")
            return 1

        from .device_comm import DeviceCommunicator
        communicator = DeviceCommunicator(self.config)

        logger.info(f"手动回滚设备 {device_id}")
        progress.rollback.rollback_trigger = "manual"

        success = self.rollback_manager.perform_rollback(
            device_id, progress, communicator, protocol, timeout
        )

        if task:
            self._save_task_log(task)

        self._print_rollback_result(device_id, progress)

        return 0 if success else 1

    def _find_latest_backup(self, device_id: str) -> Optional[str]:
        """查找设备最新的备份"""
        if not os.path.exists(self.rollback_manager._backup_dir):
            return None

        backups = []
        for filename in os.listdir(self.rollback_manager._backup_dir):
            if filename.startswith(f"{device_id}_") and filename.endswith(".bin"):
                filepath = os.path.join(self.rollback_manager._backup_dir, filename)
                mtime = os.path.getmtime(filepath)
                backups.append((mtime, filepath))

        if not backups:
            return None

        backups.sort(reverse=True)
        return backups[0][1]

    def _get_patch_version(self, patch_path: str) -> Optional[str]:
        """从差分包获取目标版本"""
        try:
            from .diff_pkg import DiffPackageGenerator
            gen = DiffPackageGenerator(self.config)
            info, _ = gen.read_package(patch_path)
            return info.new_version
        except Exception:
            return None

    def show_status(self, task_id: Optional[str] = None, watch: bool = False, interval: int = 2) -> int:
        """显示升级状态"""
        if task_id:
            task = self._get_task(task_id)
            if not task:
                logger.error(f"任务不存在: {task_id}")
                return 1

            if watch:
                self._watch_task(task, interval)
            else:
                self._print_task_status(task)
        else:
            self._print_all_tasks()

        return 0

    def show_groups(self, group_id: Optional[str] = None) -> int:
        """显示设备分组"""
        if group_id:
            group = self.group_manager.get_group(group_id)
            if not group:
                logger.error(f"分组不存在: {group_id}")
                return 1
            self._print_group_detail(group)
        else:
            self._print_all_groups()

        return 0

    def manage_groups(self, action: str, group_id: str = None, name: str = None,
                     description: str = "", device_ids: List[str] = None,
                     priority: int = 0, max_parallel: int = 10,
                     tags: List[str] = None, device_id: str = None) -> int:
        """管理设备分组"""
        if action == "create":
            if not group_id or not name:
                logger.error("创建分组需要 group_id 和 name")
                return 1
            try:
                self.group_manager.create_group(
                    group_id=group_id,
                    name=name,
                    description=description,
                    device_ids=device_ids or [],
                    priority=priority,
                    max_parallel=max_parallel,
                    tags=tags or []
                )
                logger.info(f"分组创建成功: {group_id}")
                return 0
            except ValueError as e:
                logger.error(str(e))
                return 1

        elif action == "delete":
            if not group_id:
                logger.error("删除分组需要 group_id")
                return 1
            if self.group_manager.delete_group(group_id):
                logger.info(f"分组已删除: {group_id}")
                return 0
            logger.error(f"删除失败，分组不存在: {group_id}")
            return 1

        elif action == "add_device":
            if not group_id or not device_id:
                logger.error("添加设备需要 group_id 和 device_id")
                return 1
            if self.group_manager.add_device_to_group(group_id, device_id):
                logger.info(f"设备 {device_id} 已添加到分组 {group_id}")
                return 0
            logger.error(f"添加失败，分组不存在: {group_id}")
            return 1

        elif action == "remove_device":
            if not group_id or not device_id:
                logger.error("移除设备需要 group_id 和 device_id")
                return 1
            if self.group_manager.remove_device_from_group(group_id, device_id):
                logger.info(f"设备 {device_id} 已从分组 {group_id} 移除")
                return 0
            logger.error(f"移除失败，分组或设备不存在")
            return 1

        else:
            logger.error(f"不支持的操作: {action}")
            return 1

    def _get_task(self, task_id: str) -> Optional[UpgradeTask]:
        """获取任务"""
        with self._tasks_lock:
            task = self._tasks.get(task_id)

        if not task:
            task = self._load_task_from_log(task_id)

        return task

    def _load_task_from_log(self, task_id: str) -> Optional[UpgradeTask]:
        """从日志加载任务"""
        log_path = os.path.join(self._log_dir, f"{task_id}.json")
        if not os.path.exists(log_path):
            return None

        try:
            with open(log_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            task = UpgradeTask(
                task_id=data["task_id"],
                patch_path=data["patch_path"],
                device_ids=data["device_ids"],
                max_parallel=data.get("max_parallel", 10)
            )
            task.status = UpgradeStatus(data.get("status", "completed"))

            for dev_id, dev_data in data.get("devices", {}).items():
                rollback_data = dev_data.get("rollback", {})
                progress = DeviceUpgradeProgress(
                    device_id=dev_id,
                    status=UpgradeStatus(dev_data.get("status", "pending")),
                    progress=dev_data.get("progress", 0.0),
                    current_step=dev_data.get("current_step", ""),
                    error_message=dev_data.get("error_message"),
                    retry_count=dev_data.get("retry_count", 0),
                    speed=dev_data.get("speed", 0.0),
                    transferred_bytes=dev_data.get("transferred_bytes", 0),
                    total_bytes=dev_data.get("total_bytes", 0),
                    rollback=RollbackState(
                        backup_path=rollback_data.get("backup_path"),
                        original_version=rollback_data.get("original_version"),
                        new_version=rollback_data.get("new_version"),
                        rollback_trigger=rollback_data.get("rollback_trigger"),
                        rollback_success=rollback_data.get("rollback_success", False),
                        rollback_error=rollback_data.get("rollback_error"),
                        can_rollback=rollback_data.get("can_rollback", True),
                        rollback_attempts=rollback_data.get("rollback_attempts", 0)
                    )
                )
                task.devices[dev_id] = progress

            return task
        except Exception as e:
            logger.error(f"加载任务日志失败: {e}")
            return None

    def _watch_task(self, task: UpgradeTask, interval: int):
        """实时监控任务"""
        try:
            while True:
                os.system('cls' if os.name == 'nt' else 'clear')
                self._print_task_status(task)

                if task.status in (UpgradeStatus.COMPLETED, UpgradeStatus.FAILED,
                                   UpgradeStatus.CANCELLED):
                    break

                time.sleep(interval)
        except KeyboardInterrupt:
            logger.info("停止监控")

    def _print_task_status(self, task: UpgradeTask):
        """打印任务状态"""
        print("\n" + "=" * 80)
        print(f"升级任务: {task.task_id}")
        print("=" * 80)
        print(f"状态: {task.status.value}")
        print(f"差分包: {task.patch_path}")
        print(f"设备总数: {len(task.devices)}")
        print(f"已完成: {task.completed_count}")
        print(f"失败: {task.failed_count}")
        print(f"回滚: {task.rollback_count}")
        print(f"总进度: {task.overall_progress:.1f}%")
        print(f"成功率: {task.success_rate:.1f}%")
        print(f"回滚策略: {task.rollback_policy.value}")
        print(f"分批策略: {task.batch_strategy.value}")
        if task.groups:
            print(f"分组数: {len(task.groups)}")
        if task.start_time:
            print(f"开始时间: {datetime.fromtimestamp(task.start_time)}")
        if task.end_time:
            print(f"结束时间: {datetime.fromtimestamp(task.end_time)}")
        print("-" * 80)

        print(f"{'设备ID':<20} {'状态':<18} {'进度':<8} {'当前步骤':<20} {'回滚状态'}")
        print("-" * 80)

        for device_id, progress in task.devices.items():
            rollback_status = "-"
            if progress.status in (UpgradeStatus.ROLLING_BACK, UpgradeStatus.ROLLBACK_COMPLETED,
                                   UpgradeStatus.ROLLBACK_FAILED):
                rollback_status = progress.status.value
            elif progress.rollback.rollback_success:
                rollback_status = "已回滚"
            elif progress.rollback.backup_path:
                rollback_status = "已备份"

            print(f"{device_id:<20} {progress.status.value:<18} "
                  f"{progress.progress:6.1f}% {progress.current_step:<20} {rollback_status}")

        print("=" * 80 + "\n")

    def _print_all_tasks(self):
        """打印所有任务"""
        log_files = [f for f in os.listdir(self._log_dir) if f.endswith('.json')]

        if not log_files and not self._tasks:
            logger.info("暂无升级任务")
            return

        print("\n" + "=" * 80)
        print("升级任务列表")
        print("=" * 80)
        print(f"{'任务ID':<25} {'状态':<12} {'设备数':<8} {'完成':<6} {'失败':<6} "
              f"{'回滚':<6} {'创建时间'}")
        print("-" * 80)

        with self._tasks_lock:
            all_tasks = list(self._tasks.values())

        for log_file in log_files:
            task_id = log_file[:-5]
            if task_id not in [t.task_id for t in all_tasks]:
                task = self._load_task_from_log(task_id)
                if task:
                    all_tasks.append(task)

        all_tasks.sort(key=lambda t: t.created_at, reverse=True)

        for task in all_tasks[:20]:
            created = datetime.fromtimestamp(task.created_at).strftime("%Y-%m-%d %H:%M:%S")
            print(f"{task.task_id:<25} {task.status.value:<12} "
                  f"{len(task.devices):<8} {task.completed_count:<6} "
                  f"{task.failed_count:<6} {task.rollback_count:<6} {created}")

        print("=" * 80 + "\n")

    def _print_group_detail(self, group: DeviceGroup):
        """打印分组详情"""
        print("\n" + "=" * 60)
        print(f"设备分组: {group.name}")
        print("=" * 60)
        print(f"分组ID: {group.group_id}")
        print(f"描述: {group.description or '-'}")
        print(f"优先级: {group.priority}")
        print(f"最大并行: {group.max_parallel}")
        print(f"标签: {', '.join(group.tags) if group.tags else '-'}")
        print(f"设备数: {len(group.device_ids)}")
        print("-" * 60)
        print("设备列表:")
        for device_id in group.device_ids:
            print(f"  - {device_id}")
        print("=" * 60 + "\n")

    def _print_all_groups(self):
        """打印所有分组"""
        groups = self.group_manager.list_groups()

        if not groups:
            logger.info("暂无设备分组")
            return

        print("\n" + "=" * 80)
        print("设备分组列表")
        print("=" * 80)
        print(f"{'分组ID':<20} {'名称':<20} {'设备数':<8} {'优先级':<8} {'标签'}")
        print("-" * 80)

        for group in groups:
            tags = ', '.join(group.tags) if group.tags else '-'
            print(f"{group.group_id:<20} {group.name:<20} "
                  f"{len(group.device_ids):<8} {group.priority:<8} {tags}")

        print("=" * 80 + "\n")

    def cancel_task(self, task_id: str, force: bool = False) -> int:
        """取消升级任务"""
        task = self._get_task(task_id)
        if not task:
            logger.error(f"任务不存在: {task_id}")
            return 1

        if task.status in (UpgradeStatus.COMPLETED, UpgradeStatus.FAILED, UpgradeStatus.CANCELLED):
            logger.warning(f"任务已结束，状态: {task.status.value}")
            return 0

        logger.info(f"正在取消任务: {task_id}")
        task.cancel_flag.set()

        for progress in task.devices.values():
            if progress.status == UpgradeStatus.RUNNING:
                if force:
                    progress.status = UpgradeStatus.CANCELLED
                    progress.current_step = "已强制取消"
                    progress.end_time = time.time()
                else:
                    progress.current_step = "取消中..."

        task.status = UpgradeStatus.CANCELLED
        task.end_time = time.time()

        self._save_task_log(task)
        logger.info(f"任务已取消: {task_id}")

        return 0

    def _save_task_log(self, task: UpgradeTask):
        """保存任务日志"""
        try:
            log_path = os.path.join(self._log_dir, f"{task.task_id}.json")
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(task.to_dict(), f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"保存任务日志失败: {e}")

    def _print_single_result(self, task: UpgradeTask, device_id: str):
        """打印单设备升级结果"""
        progress = task.devices.get(device_id)
        if not progress:
            return

        print("\n" + "=" * 60)
        print("升级结果")
        print("=" * 60)
        print(f"设备ID: {device_id}")
        print(f"状态: {progress.status.value}")
        if progress.start_time:
            duration = (progress.end_time or time.time()) - progress.start_time
            print(f"耗时: {duration:.2f} 秒")
        if progress.error_message:
            print(f"错误信息: {progress.error_message}")
        if progress.rollback.backup_path:
            print(f"备份文件: {progress.rollback.backup_path}")
        if progress.status == UpgradeStatus.ROLLBACK_COMPLETED:
            print("回滚状态: 成功")
        elif progress.status == UpgradeStatus.ROLLBACK_FAILED:
            print(f"回滚状态: 失败 - {progress.rollback.rollback_error}")
        print("=" * 60 + "\n")

    def _print_rollback_result(self, device_id: str, progress: DeviceUpgradeProgress):
        """打印回滚结果"""
        print("\n" + "=" * 60)
        print("回滚结果")
        print("=" * 60)
        print(f"设备ID: {device_id}")
        print(f"回滚状态: {progress.status.value}")
        if progress.rollback.rollback_start_time and progress.rollback.rollback_end_time:
            duration = progress.rollback.rollback_end_time - progress.rollback.rollback_start_time
            print(f"耗时: {duration:.2f} 秒")
        if progress.rollback.rollback_error:
            print(f"错误信息: {progress.rollback.rollback_error}")
        print("=" * 60 + "\n")

    def _print_batch_result(self, task: UpgradeTask):
        """打印批量升级结果"""
        total = len(task.devices)
        completed = task.completed_count
        failed = task.failed_count
        rollback = task.rollback_count
        duration = (task.end_time or time.time()) - (task.start_time or time.time())

        print("\n" + "=" * 80)
        print("批量升级完成")
        print("=" * 80)
        print(f"任务ID: {task.task_id}")
        print(f"总设备数: {total}")
        print(f"成功: {completed}")
        print(f"失败: {failed}")
        print(f"回滚: {rollback}")
        print(f"成功率: {completed / total * 100:.1f}%" if total > 0 else "无设备")
        print(f"总耗时: {duration:.2f} 秒")

        if failed > 0:
            print("\n失败设备:")
            for device_id, progress in task.devices.items():
                if progress.status in (UpgradeStatus.FAILED, UpgradeStatus.TIMEOUT,
                                       UpgradeStatus.CANCELLED, UpgradeStatus.ROLLBACK_FAILED):
                    status = progress.status.value
                    error = progress.error_message or progress.rollback.rollback_error or ""
                    print(f"  - {device_id}: {status} - {error[:50] if error else ''}")

        if rollback > 0:
            print("\n回滚设备:")
            for device_id, progress in task.devices.items():
                if progress.status in (UpgradeStatus.ROLLING_BACK,
                                       UpgradeStatus.ROLLBACK_COMPLETED,
                                       UpgradeStatus.ROLLBACK_FAILED):
                    print(f"  - {device_id}: {progress.status.value}")

        print("=" * 80 + "\n")
