#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
升级进度管理模块
支持多设备并行升级、设备分组、批次控制、进度监控、自动回滚和错误隔离
"""

import os
import json
import time
import logging
import threading
import shutil
from typing import Dict, List, Optional, Callable, Set
from concurrent.futures import ThreadPoolExecutor, as_completed
from enum import Enum
from dataclasses import dataclass, field

from utils import calculate_file_hash, ensure_dir, AtomicCounter


class UpgradeStatus(Enum):
    IDLE = "idle"
    PENDING = "pending"
    DOWNLOADING = "downloading"
    TRANSFERRING = "transferring"
    VERIFYING = "verifying"
    INSTALLING = "installing"
    REBOOTING = "rebooting"
    SUCCESS = "success"
    FAILED = "failed"
    ROLLING_BACK = "rolling_back"
    ROLLED_BACK = "rolled_back"
    SKIPPED = "skipped"


class RollbackStrategy(Enum):
    NONE = "none"
    AUTO = "auto"
    MANUAL = "manual"


class BatchUpgradeMode(Enum):
    PARALLEL = "parallel"
    SEQUENTIAL = "sequential"
    BATCHED = "batched"


@dataclass
class DeviceGroup:
    group_id: str
    name: str
    device_ids: List[str] = field(default_factory=list)
    description: str = ""
    priority: int = 0
    metadata: Dict = field(default_factory=dict)
    
    def add_device(self, device_id: str):
        if device_id not in self.device_ids:
            self.device_ids.append(device_id)
    
    def remove_device(self, device_id: str):
        if device_id in self.device_ids:
            self.device_ids.remove(device_id)
    
    def to_dict(self) -> dict:
        return {
            'group_id': self.group_id,
            'name': self.name,
            'device_ids': self.device_ids,
            'description': self.description,
            'priority': self.priority,
            'metadata': self.metadata,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'DeviceGroup':
        return cls(**data)


@dataclass
class UpgradeResult:
    device_id: str
    success: bool
    status: str
    error: Optional[str] = None
    duration: float = 0.0
    rollback_success: Optional[bool] = None
    rollback_error: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            'device_id': self.device_id,
            'success': success,
            'status': self.status,
            'error': self.error,
            'duration': self.duration,
            'rollback_success': self.rollback_success,
            'rollback_error': self.rollback_error,
        }


@dataclass
class BatchUpgradeConfig:
    batch_size: int = 5
    batch_delay: int = 10
    max_failure_rate: float = 0.2
    continue_on_failure: bool = True
    stop_on_batch_failure: bool = False
    rollback_strategy: RollbackStrategy = RollbackStrategy.AUTO
    pre_upgrade_check: bool = True
    post_upgrade_verify: bool = True
    
    def to_dict(self) -> dict:
        return {
            'batch_size': self.batch_size,
            'batch_delay': self.batch_delay,
            'max_failure_rate': self.max_failure_rate,
            'continue_on_failure': self.continue_on_failure,
            'stop_on_batch_failure': self.stop_on_batch_failure,
            'rollback_strategy': self.rollback_strategy.value,
            'pre_upgrade_check': self.pre_upgrade_check,
            'post_upgrade_verify': self.post_upgrade_verify,
        }


class UpgradeManager:
    def __init__(self, config, device_manager, version_manager=None):
        self.config = config
        self.device_manager = device_manager
        self.version_manager = version_manager
        self.logger = logging.getLogger(__name__)
        
        self._status: Dict[str, Dict] = {}
        self._status_lock = threading.Lock()
        self._upgrade_threads: Dict[str, threading.Thread] = {}
        self._stop_events: Dict[str, threading.Event] = {}
        self._groups: Dict[str, DeviceGroup] = {}
        self._groups_lock = threading.Lock()
        
        self._load_status()
        self._load_groups()
    
    def _load_status(self):
        try:
            if os.path.exists(self.config.upgrade_status_file):
                with open(self.config.upgrade_status_file, 'r', encoding='utf-8') as f:
                    self._status = json.load(f)
        except Exception as e:
            self.logger.warning(f"加载升级状态失败: {e}")
            self._status = {}
    
    def _save_status(self):
        try:
            ensure_dir(os.path.dirname(self.config.upgrade_status_file))
            with open(self.config.upgrade_status_file, 'w', encoding='utf-8') as f:
                json.dump(self._status, f, indent=2, ensure_ascii=False)
        except Exception as e:
            self.logger.error(f"保存升级状态失败: {e}")
    
    def _load_groups(self):
        groups_file = os.path.join(
            os.path.dirname(self.config.upgrade_status_file),
            'device_groups.json'
        )
        try:
            if os.path.exists(groups_file):
                with open(groups_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self._groups = {
                        gid: DeviceGroup.from_dict(gdata)
                        for gid, gdata in data.items()
                    }
        except Exception as e:
            self.logger.warning(f"加载设备分组失败: {e}")
            self._groups = {}
    
    def _save_groups(self):
        groups_file = os.path.join(
            os.path.dirname(self.config.upgrade_status_file),
            'device_groups.json'
        )
        try:
            ensure_dir(os.path.dirname(groups_file))
            data = {
                gid: g.to_dict()
                for gid, g in self._groups.items()
            }
            with open(groups_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            self.logger.error(f"保存设备分组失败: {e}")
    
    def _update_device_status(self, device_id: str, **kwargs):
        with self._status_lock:
            if device_id not in self._status:
                self._status[device_id] = {}
            
            self._status[device_id].update(kwargs)
            self._status[device_id]['updated_at'] = time.time()
            
            self._save_status()
    
    def get_device_status(self, device_id: str) -> Optional[Dict]:
        with self._status_lock:
            return self._status.get(device_id)
    
    def get_all_status(self) -> Dict[str, Dict]:
        with self._status_lock:
            return dict(self._status)
    
    def create_group(self, group_id: str, name: str,
                     device_ids: List[str] = None,
                     description: str = "",
                     priority: int = 0) -> DeviceGroup:
        with self._groups_lock:
            group = DeviceGroup(
                group_id=group_id,
                name=name,
                device_ids=device_ids or [],
                description=description,
                priority=priority
            )
            self._groups[group_id] = group
            self._save_groups()
            self.logger.info(f"创建设备分组: {group_id} ({name})")
            return group
    
    def delete_group(self, group_id: str) -> bool:
        with self._groups_lock:
            if group_id in self._groups:
                del self._groups[group_id]
                self._save_groups()
                self.logger.info(f"删除设备分组: {group_id}")
                return True
            return False
    
    def get_group(self, group_id: str) -> Optional[DeviceGroup]:
        with self._groups_lock:
            return self._groups.get(group_id)
    
    def get_all_groups(self) -> List[DeviceGroup]:
        with self._groups_lock:
            return sorted(
                self._groups.values(),
                key=lambda g: (g.priority, g.name)
            )
    
    def add_to_group(self, group_id: str, device_id: str) -> bool:
        with self._groups_lock:
            group = self._groups.get(group_id)
            if group:
                group.add_device(device_id)
                self._save_groups()
                return True
            return False
    
    def remove_from_group(self, group_id: str, device_id: str) -> bool:
        with self._groups_lock:
            group = self._groups.get(group_id)
            if group:
                group.remove_device(device_id)
                self._save_groups()
                return True
            return False
    
    def start_upgrade(self, device_ids: List[str], firmware_path: str,
                     delta_path: str = None, parallel: bool = True,
                     force: bool = False,
                     batch_config: Optional[BatchUpgradeConfig] = None,
                     rollback_strategy: RollbackStrategy = RollbackStrategy.AUTO
                     ) -> List[UpgradeResult]:
        if not os.path.exists(firmware_path):
            self.logger.error(f"固件文件不存在: {firmware_path}")
            return []
        
        firmware_hash = calculate_file_hash(firmware_path)
        firmware_size = os.path.getsize(firmware_path)
        target_version = self._extract_firmware_version(firmware_path)
        
        self.logger.info(f"开始升级 {len(device_ids)} 台设备")
        self.logger.info(f"固件版本: {target_version}")
        self.logger.info(f"固件大小: {firmware_size} bytes")
        
        if batch_config is None:
            batch_config = BatchUpgradeConfig()
        batch_config.rollback_strategy = rollback_strategy
        
        if parallel and len(device_ids) > batch_config.batch_size:
            return self._upgrade_batched(device_ids, firmware_path, firmware_hash,
                                        firmware_size, target_version, delta_path,
                                        force, batch_config)
        elif parallel:
            return self._upgrade_parallel(device_ids, firmware_path, firmware_hash,
                                         firmware_size, target_version, delta_path,
                                         force, batch_config)
        else:
            return self._upgrade_sequential(device_ids, firmware_path, firmware_hash,
                                           firmware_size, target_version, delta_path,
                                           force, batch_config)
    
    def start_group_upgrade(self, group_id: str, firmware_path: str,
                           delta_path: str = None, force: bool = False,
                           batch_config: Optional[BatchUpgradeConfig] = None
                           ) -> List[UpgradeResult]:
        group = self.get_group(group_id)
        if not group:
            self.logger.error(f"设备分组不存在: {group_id}")
            return []
        
        if not group.device_ids:
            self.logger.warning(f"设备分组为空: {group_id}")
            return []
        
        self.logger.info(f"开始升级分组: {group.name} ({group_id}), {len(group.device_ids)} 台设备")
        
        return self.start_upgrade(
            group.device_ids, firmware_path, delta_path,
            parallel=True, force=force,
            batch_config=batch_config
        )
    
    def _upgrade_parallel(self, device_ids: List[str], firmware_path: str,
                         firmware_hash: str, firmware_size: int,
                         target_version: str, delta_path: str,
                         force: bool, batch_config: BatchUpgradeConfig
                         ) -> List[UpgradeResult]:
        results: List[UpgradeResult] = []
        max_workers = min(len(device_ids), self.config.max_parallel_devices)
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self._upgrade_single_device,
                    device_id, firmware_path, firmware_hash,
                    firmware_size, target_version, delta_path,
                    force, batch_config
                ): device_id
                for device_id in device_ids
            }
            
            for future in as_completed(futures):
                device_id = futures[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    self.logger.error(f"设备 {device_id} 升级异常: {e}")
                    results.append(UpgradeResult(
                        device_id=device_id,
                        success=False,
                        status=UpgradeStatus.FAILED.value,
                        error=str(e)
                    ))
        
        self._log_upgrade_summary(results)
        return results
    
    def _upgrade_sequential(self, device_ids: List[str], firmware_path: str,
                           firmware_hash: str, firmware_size: int,
                           target_version: str, delta_path: str,
                           force: bool, batch_config: BatchUpgradeConfig
                           ) -> List[UpgradeResult]:
        results: List[UpgradeResult] = []
        failed_count = 0
        total_count = len(device_ids)
        
        for i, device_id in enumerate(device_ids):
            if batch_config.max_failure_rate > 0:
                current_failure_rate = failed_count / (i + 1) if i > 0 else 0
                if current_failure_rate > batch_config.max_failure_rate:
                    self.logger.warning(
                        f"失败率 {current_failure_rate:.1%} 超过阈值 "
                        f"{batch_config.max_failure_rate:.1%}, 停止升级"
                    )
                    for remaining_id in device_ids[i:]:
                        results.append(UpgradeResult(
                            device_id=remaining_id,
                            success=False,
                            status=UpgradeStatus.SKIPPED.value,
                            error="失败率过高，跳过升级"
                        ))
                    break
            
            try:
                result = self._upgrade_single_device(
                    device_id, firmware_path, firmware_hash,
                    firmware_size, target_version, delta_path,
                    force, batch_config
                )
                results.append(result)
                
                if not result.success:
                    failed_count += 1
                    if not batch_config.continue_on_failure:
                        self.logger.warning(
                            f"设备 {device_id} 升级失败，已配置停止后续升级"
                        )
                        for remaining_id in device_ids[i + 1:]:
                            results.append(UpgradeResult(
                                device_id=remaining_id,
                                success=False,
                                status=UpgradeStatus.SKIPPED.value,
                                error="前置设备升级失败，跳过升级"
                            ))
                        break
                
                if i < total_count - 1:
                    time.sleep(batch_config.batch_delay)
                    
            except Exception as e:
                self.logger.error(f"设备 {device_id} 升级异常: {e}")
                results.append(UpgradeResult(
                    device_id=device_id,
                    success=False,
                    status=UpgradeStatus.FAILED.value,
                    error=str(e)
                ))
                failed_count += 1
        
        self._log_upgrade_summary(results)
        return results
    
    def _upgrade_batched(self, device_ids: List[str], firmware_path: str,
                        firmware_hash: str, firmware_size: int,
                        target_version: str, delta_path: str,
                        force: bool, batch_config: BatchUpgradeConfig
                        ) -> List[UpgradeResult]:
        results: List[UpgradeResult] = []
        
        batches = [
            device_ids[i:i + batch_config.batch_size]
            for i in range(0, len(device_ids), batch_config.batch_size)
        ]
        
        self.logger.info(f"分 {len(batches)} 批升级, 每批 {batch_config.batch_size} 台设备")
        
        total_failed = 0
        total_processed = 0
        
        for batch_idx, batch_devices in enumerate(batches):
            self.logger.info(f"开始第 {batch_idx + 1}/{len(batches)} 批升级")
            
            if batch_config.max_failure_rate > 0 and total_processed > 0:
                current_failure_rate = total_failed / total_processed
                if current_failure_rate > batch_config.max_failure_rate:
                    self.logger.warning(
                        f"总体失败率 {current_failure_rate:.1%} 超过阈值, 停止剩余批次"
                    )
                    for remaining_id in [
                        did for batch in batches[batch_idx:]
                        for did in batch
                    ]:
                        results.append(UpgradeResult(
                            device_id=remaining_id,
                            success=False,
                            status=UpgradeStatus.SKIPPED.value,
                            error="总体失败率过高，跳过升级"
                        ))
                    break
            
            batch_results = self._upgrade_parallel(
                batch_devices, firmware_path, firmware_hash,
                firmware_size, target_version, delta_path,
                force, batch_config
            )
            results.extend(batch_results)
            
            batch_failed = sum(1 for r in batch_results if not r.success)
            total_failed += batch_failed
            total_processed += len(batch_devices)
            
            if batch_failed > 0 and batch_config.stop_on_batch_failure:
                self.logger.warning(
                    f"第 {batch_idx + 1} 批有 {batch_failed} 台设备升级失败, "
                    f"停止剩余批次"
                )
                for remaining_id in [
                    did for batch in batches[batch_idx + 1:]
                    for did in batch
                ]:
                    results.append(UpgradeResult(
                        device_id=remaining_id,
                        success=False,
                        status=UpgradeStatus.SKIPPED.value,
                        error="当前批次有失败设备，跳过升级"
                    ))
                break
            
            if batch_idx < len(batches) - 1:
                self.logger.info(
                    f"第 {batch_idx + 1} 批完成, 等待 {batch_config.batch_delay} 秒后继续"
                )
                time.sleep(batch_config.batch_delay)
        
        return results
    
    def _upgrade_single_device(self, device_id: str, firmware_path: str,
                              firmware_hash: str, firmware_size: int,
                              target_version: str, delta_path: str,
                              force: bool, batch_config: BatchUpgradeConfig
                              ) -> UpgradeResult:
        start_time = time.time()
        self.logger.info(f"开始升级设备: {device_id}")
        
        self._update_device_status(
            device_id,
            status=UpgradeStatus.PENDING.value,
            progress=0,
            firmware_hash=firmware_hash,
            firmware_size=firmware_size,
            target_version=target_version,
            error=None
        )
        
        stop_event = threading.Event()
        self._stop_events[device_id] = stop_event
        
        try:
            protocol = self.device_manager.get_protocol(device_id)
            if not protocol:
                raise Exception(f"无法获取设备协议")
            
            if not protocol.connect():
                raise Exception("连接设备失败")
            
            try:
                if batch_config.pre_upgrade_check:
                    if not self._pre_upgrade_check(protocol, device_id, target_version, force):
                        self._update_device_status(
                            device_id,
                            status=UpgradeStatus.SKIPPED.value,
                            progress=100
                        )
                        return UpgradeResult(
                            device_id=device_id,
                            success=True,
                            status=UpgradeStatus.SKIPPED.value,
                            duration=time.time() - start_time
                        )
                
                self._backup_current_firmware(device_id, protocol)
                
                self._update_device_status(
                    device_id,
                    status=UpgradeStatus.TRANSFERRING.value,
                    progress=10
                )
                
                if not self._transfer_firmware(protocol, firmware_path, device_id):
                    raise Exception("传输固件失败")
                
                self._update_device_status(
                    device_id,
                    status=UpgradeStatus.VERIFYING.value,
                    progress=75
                )
                
                if not self._verify_firmware_integrity(protocol, firmware_path, device_id):
                    raise Exception("固件完整性验证失败")
                
                self._update_device_status(
                    device_id,
                    status=UpgradeStatus.INSTALLING.value,
                    progress=85
                )
                
                if not protocol.start_upgrade(firmware_size, firmware_hash):
                    raise Exception("启动升级失败")
                
                if not self._wait_for_upgrade_complete(protocol, device_id, stop_event):
                    raise Exception("升级超时或失败")
                
                self._update_device_status(
                    device_id,
                    status=UpgradeStatus.REBOOTING.value,
                    progress=95
                )
                
                time.sleep(5)
                
                if batch_config.post_upgrade_verify:
                    if not self._verify_upgrade(protocol, target_version):
                        raise Exception("升级验证失败")
                
                self._update_device_status(
                    device_id,
                    status=UpgradeStatus.SUCCESS.value,
                    progress=100,
                    completed_at=time.time()
                )
                
                self.logger.info(f"设备 {device_id} 升级成功")
                return UpgradeResult(
                    device_id=device_id,
                    success=True,
                    status=UpgradeStatus.SUCCESS.value,
                    duration=time.time() - start_time
                )
                
            finally:
                protocol.disconnect()
                
        except Exception as e:
            self.logger.error(f"设备 {device_id} 升级失败: {e}")
            error_msg = str(e)
            
            rollback_success = None
            rollback_error = None
            
            if batch_config.rollback_strategy == RollbackStrategy.AUTO:
                self.logger.info(f"设备 {device_id} 开始自动回滚")
                rollback_result = self._auto_rollback(device_id, protocol)
                rollback_success = rollback_result.get('success')
                rollback_error = rollback_result.get('error')
            
            final_status = (UpgradeStatus.ROLLED_BACK.value
                           if rollback_success
                           else UpgradeStatus.FAILED.value)
            
            self._update_device_status(
                device_id,
                status=final_status,
                error=error_msg,
                rollback_success=rollback_success,
                rollback_error=rollback_error
            )
            
            return UpgradeResult(
                device_id=device_id,
                success=False,
                status=final_status,
                error=error_msg,
                duration=time.time() - start_time,
                rollback_success=rollback_success,
                rollback_error=rollback_error
            )
        finally:
            if device_id in self._stop_events:
                del self._stop_events[device_id]
    
    def _pre_upgrade_check(self, protocol, device_id: str,
                          target_version: str, force: bool) -> bool:
        try:
            version_info = protocol.query_version()
            if not version_info:
                self.logger.warning(f"设备 {device_id} 无法查询版本，跳过检查")
                return True
            
            current_version = version_info.get('firmware_version', 'unknown')
            self._update_device_status(device_id, current_version=current_version)
            
            if force:
                self.logger.info(
                    f"设备 {device_id} 强制升级 (当前: {current_version}, 目标: {target_version})"
                )
                return True
            
            if self.version_manager:
                is_safe, reason = self.version_manager.is_safe_upgrade(
                    current_version, target_version
                )
                if not is_safe:
                    self.logger.info(f"设备 {device_id} 跳过升级: {reason}")
                    return False
                
                if self.version_manager.is_equal(current_version, target_version):
                    self.logger.info(
                        f"设备 {device_id} 已是目标版本 {current_version}, 跳过升级"
                    )
                    return False
            else:
                if current_version == target_version:
                    self.logger.info(
                        f"设备 {device_id} 已是目标版本 {current_version}, 跳过升级"
                    )
                    return False
            
            return True
        except Exception as e:
            self.logger.warning(f"设备 {device_id} 升级前检查异常: {e}")
            return True
    
    def _auto_rollback(self, device_id: str, protocol=None) -> dict:
        result = {'success': False, 'error': None}
        
        try:
            status = self._status.get(device_id, {})
            last_backup = status.get('last_backup')
            
            if not last_backup:
                result['error'] = "没有可用的备份"
                return result
            
            backup_path = last_backup.get('path')
            if not os.path.exists(backup_path):
                result['error'] = f"备份文件不存在: {backup_path}"
                return result
            
            self._update_device_status(
                device_id,
                status=UpgradeStatus.ROLLING_BACK.value,
                progress=0
            )
            
            if protocol is None:
                protocol = self.device_manager.get_protocol(device_id)
                if not protocol or not protocol.connect():
                    result['error'] = "无法连接设备进行回滚"
                    return result
            
            try:
                backup_version = last_backup.get('version', 'unknown')
                self.logger.info(
                    f"设备 {device_id} 回滚到版本 {backup_version}"
                )
                
                if not protocol.rollback():
                    if not self._rollback_by_retransmit(device_id, protocol, backup_path):
                        result['error'] = "设备回滚命令失败"
                        return result
                
                time.sleep(10)
                
                version_info = protocol.query_version()
                if version_info:
                    current_version = version_info.get('firmware_version', '')
                    if current_version == backup_version or backup_version == 'unknown':
                        self._update_device_status(
                            device_id,
                            status=UpgradeStatus.ROLLED_BACK.value,
                            progress=100,
                            current_version=current_version
                        )
                        result['success'] = True
                        self.logger.info(f"设备 {device_id} 回滚成功")
                    else:
                        result['error'] = (
                            f"回滚后版本不符: expected={backup_version}, "
                            f"actual={current_version}"
                        )
                else:
                    result['error'] = "回滚后无法查询版本"
                    
            finally:
                if protocol and not last_backup:
                    protocol.disconnect()
            
        except Exception as e:
            self.logger.error(f"设备 {device_id} 自动回滚异常: {e}")
            result['error'] = str(e)
        
        return result
    
    def _rollback_by_retransmit(self, device_id: str, protocol,
                                backup_path: str) -> bool:
        try:
            self.logger.info(f"设备 {device_id} 通过重传备份固件进行回滚")
            
            backup_hash = calculate_file_hash(backup_path)
            backup_size = os.path.getsize(backup_path)
            
            if not self._transfer_firmware(protocol, backup_path, device_id):
                return False
            
            if not protocol.start_upgrade(backup_size, backup_hash):
                return False
            
            stop_event = threading.Event()
            if not self._wait_for_upgrade_complete(protocol, device_id, stop_event):
                return False
            
            return True
        except Exception as e:
            self.logger.error(f"设备 {device_id} 重传回滚失败: {e}")
            return False
    
    def rollback(self, device_id: str) -> bool:
        self.logger.info(f"手动回滚设备: {device_id}")
        
        result = self._auto_rollback(device_id)
        return result.get('success', False)
    
    def _transfer_firmware(self, protocol, firmware_path: str, device_id: str) -> bool:
        chunk_size = self.config.chunk_size
        progress_file = os.path.join(
            self.config.firmware_cache_dir,
            f"{device_id}_transfer_progress.json"
        )
        
        try:
            total_size = os.path.getsize(firmware_path)
            transferred = self._load_transfer_progress(progress_file, device_id)
            
            self.logger.info(
                f"设备 {device_id} 开始传输固件, 已传输: {transferred}/{total_size} bytes"
            )
            
            with open(firmware_path, 'rb') as f:
                f.seek(transferred)
                
                chunk_count = 0
                while transferred < total_size:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    
                    actual_offset = transferred
                    success = self._send_chunk_with_retry(
                        protocol, chunk, actual_offset, device_id,
                        max_retries=getattr(self.config, 'max_transfer_retries', 6)
                    )
                    
                    if not success:
                        self.logger.error(
                            f"设备 {device_id} 传输块失败 (offset={actual_offset}), "
                            f"已保存进度 {transferred}"
                        )
                        self._save_transfer_progress(progress_file, transferred, device_id)
                        return False
                    
                    transferred += len(chunk)
                    chunk_count += 1
                    
                    if chunk_count % 10 == 0:
                        self._save_transfer_progress(progress_file, transferred, device_id)
                    
                    progress = 10 + int((transferred / total_size) * 70)
                    self._update_device_status(
                        device_id, progress=progress,
                        transferred_bytes=transferred,
                        total_bytes=total_size
                    )
                    
                    if transferred % (chunk_size * 20) == 0:
                        self.logger.info(
                            f"设备 {device_id} 传输进度: {transferred}/{total_size} "
                            f"({progress}%)"
                        )
            
            if os.path.exists(progress_file):
                os.remove(progress_file)
            
            self.logger.info(f"设备 {device_id} 固件传输完成, 共 {transferred} bytes")
            return True
            
        except Exception as e:
            self.logger.error(f"设备 {device_id} 传输固件异常: {e}", exc_info=True)
            if 'transferred' in locals():
                self._save_transfer_progress(progress_file, transferred, device_id)
            return False
    
    def _send_chunk_with_retry(self, protocol, chunk: bytes, offset: int,
                              device_id: str, max_retries: int = 6) -> bool:
        for attempt in range(max_retries):
            try:
                if protocol.send_firmware_chunk(chunk, offset):
                    return True
                
                self.logger.warning(
                    f"设备 {device_id} 发送块失败 (offset={offset}), "
                    f"尝试 {attempt + 1}/{max_retries}"
                )
                
            except Exception as e:
                self.logger.warning(
                    f"设备 {device_id} 发送块异常 (offset={offset}): {e}, "
                    f"尝试 {attempt + 1}/{max_retries}"
                )
                
                if hasattr(protocol, 'is_connected') and not protocol.is_connected():
                    self.logger.info(f"设备 {device_id} 连接断开, 尝试重连...")
                    if hasattr(protocol, 'ensure_connected'):
                        if not protocol.ensure_connected():
                            self.logger.error(f"设备 {device_id} 重连失败")
                    else:
                        if not protocol.connect():
                            self.logger.error(f"设备 {device_id} 重连失败")
            
            if attempt < max_retries - 1:
                delay = min(self.config.retry_interval * (2 ** attempt), 30)
                time.sleep(delay)
        
        self.logger.error(
            f"设备 {device_id} 发送块最终失败 (offset={offset}, size={len(chunk)})"
        )
        return False
    
    def _load_transfer_progress(self, progress_file: str, device_id: str) -> int:
        try:
            if os.path.exists(progress_file):
                with open(progress_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if data.get('device_id') == device_id:
                        transferred = data.get('transferred', 0)
                        self.logger.info(
                            f"设备 {device_id} 恢复传输进度: {transferred} bytes"
                        )
                        return transferred
        except Exception as e:
            self.logger.warning(f"加载传输进度失败: {e}")
        
        return 0
    
    def _save_transfer_progress(self, progress_file: str, transferred: int,
                               device_id: str):
        try:
            ensure_dir(os.path.dirname(progress_file))
            data = {
                'device_id': device_id,
                'transferred': transferred,
                'updated_at': time.time()
            }
            with open(progress_file, 'w', encoding='utf-8') as f:
                json.dump(data, f)
        except Exception as e:
            self.logger.warning(f"保存传输进度失败: {e}")
    
    def _verify_firmware_integrity(self, protocol, firmware_path: str,
                                   device_id: str) -> bool:
        try:
            self.logger.info(f"设备 {device_id} 验证固件完整性...")
            
            expected_hash = calculate_file_hash(firmware_path)
            expected_size = os.path.getsize(firmware_path)
            
            for retry in range(3):
                remote_size = protocol.get_remote_firmware_size()
                if remote_size == expected_size:
                    break
                time.sleep(2)
            else:
                self.logger.error(
                    f"设备 {device_id} 固件大小不匹配: expected={expected_size}, "
                    f"actual={remote_size}"
                )
                return False
            
            remote_hash = protocol.get_remote_firmware_hash()
            if remote_hash and remote_hash.lower() != expected_hash.lower():
                self.logger.error(
                    f"设备 {device_id} 固件哈希不匹配: expected={expected_hash[:16]}..., "
                    f"actual={remote_hash[:16]}..."
                )
                return False
            
            self.logger.info(f"设备 {device_id} 固件完整性验证通过")
            return True
            
        except Exception as e:
            self.logger.warning(f"设备 {device_id} 固件完整性验证异常: {e}")
            return True
    
    def _wait_for_upgrade_complete(self, protocol, device_id: str,
                                   stop_event: threading.Event,
                                   timeout: int = 300) -> bool:
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            if stop_event.is_set():
                return False
            
            progress = protocol.get_upgrade_progress()
            
            if progress < 0:
                time.sleep(2)
                continue
            
            if progress >= 100:
                return True
            
            if progress > 90:
                display_progress = 90 + int((progress - 90) * 0.5)
                self._update_device_status(device_id, progress=display_progress)
            
            time.sleep(2)
        
        return False
    
    def _verify_upgrade(self, protocol, target_version: str) -> bool:
        try:
            version_info = protocol.query_version()
            if not version_info:
                return False
            
            new_version = version_info.get('firmware_version', '')
            
            if self.version_manager:
                return self.version_manager.is_equal(new_version, target_version) or \
                       self.version_manager.is_newer(new_version, target_version)
            else:
                return new_version == target_version
            
        except Exception as e:
            self.logger.error(f"验证升级失败: {e}")
            return False
    
    def _extract_firmware_version(self, firmware_path: str) -> str:
        filename = os.path.basename(firmware_path)
        
        import re
        match = re.search(r'v?(\d+\.\d+\.\d+)', filename)
        if match:
            return match.group(1)
        
        return filename.split('_')[0] if '_' in filename else filename
    
    def _backup_current_firmware(self, device_id: str, protocol=None):
        try:
            backup_dir = os.path.join(self.config.backup_dir, device_id)
            ensure_dir(backup_dir)
            
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            
            if protocol:
                try:
                    version_info = protocol.query_version()
                    if version_info:
                        current_version = version_info.get('firmware_version', 'unknown')
                except:
                    current_version = 'unknown'
            else:
                status = self._status.get(device_id, {})
                current_version = status.get('current_version', 'unknown')
            
            backup_path = os.path.join(
                backup_dir,
                f"firmware_{current_version}_{timestamp}.bin"
            )
            
            status = self._status.get(device_id, {})
            if 'current_firmware_path' in status:
                current_path = status['current_firmware_path']
                if os.path.exists(current_path):
                    shutil.copy2(current_path, backup_path)
                    self.logger.info(
                        f"设备 {device_id} 备份固件到: {backup_path}"
                    )
            else:
                self.logger.debug(
                    f"设备 {device_id} 无固件路径可备份, 记录版本信息"
                )
            
            backup_info = {
                'path': backup_path if os.path.exists(backup_path) else None,
                'version': current_version,
                'timestamp': timestamp
            }
            
            self._update_device_status(device_id, last_backup=backup_info)
            
        except Exception as e:
            self.logger.warning(f"备份固件失败: {e}")
    
    def cancel_upgrade(self, device_id: str) -> bool:
        if device_id in self._stop_events:
            self._stop_events[device_id].set()
            self.logger.info(f"已取消设备 {device_id} 的升级")
            return True
        return False
    
    def _log_upgrade_summary(self, results: List[UpgradeResult]):
        total = len(results)
        success = sum(1 for r in results if r.success)
        failed = sum(1 for r in results if not r.success)
        rolled_back = sum(1 for r in results if r.rollback_success)
        skipped = sum(1 for r in results if r.status == UpgradeStatus.SKIPPED.value)
        
        self.logger.info(
            f"升级批次完成: 总计 {total}, 成功 {success}, "
            f"失败 {failed}, 回滚 {rolled_back}, 跳过 {skipped}"
        )
        
        if failed > 0:
            failed_devices = [r.device_id for r in results if not r.success]
            self.logger.warning(f"失败设备列表: {', '.join(failed_devices)}")
    
    def get_upgrade_summary(self) -> Dict:
        with self._status_lock:
            total = len(self._status)
            success = sum(1 for s in self._status.values()
                         if s.get('status') == UpgradeStatus.SUCCESS.value)
            failed = sum(1 for s in self._status.values()
                        if s.get('status') == UpgradeStatus.FAILED.value)
            rolled_back = sum(1 for s in self._status.values()
                            if s.get('status') == UpgradeStatus.ROLLED_BACK.value)
            in_progress = sum(1 for s in self._status.values()
                             if s.get('status') in [
                                 UpgradeStatus.PENDING.value,
                                 UpgradeStatus.TRANSFERRING.value,
                                 UpgradeStatus.VERIFYING.value,
                                 UpgradeStatus.INSTALLING.value,
                                 UpgradeStatus.REBOOTING.value,
                                 UpgradeStatus.ROLLING_BACK.value
                             ])
            skipped = sum(1 for s in self._status.values()
                         if s.get('status') == UpgradeStatus.SKIPPED.value)
            
            return {
                'total': total,
                'success': success,
                'failed': failed,
                'rolled_back': rolled_back,
                'in_progress': in_progress,
                'skipped': skipped,
                'idle': total - success - failed - rolled_back - in_progress - skipped
            }
    
    def clean_status(self, device_id: str = None):
        with self._status_lock:
            if device_id:
                if device_id in self._status:
                    del self._status[device_id]
            else:
                self._status.clear()
            self._save_status()
    
    def get_batch_upgrade_report(self, results: List[UpgradeResult]) -> Dict:
        total = len(results)
        success = sum(1 for r in results if r.success)
        failed = sum(1 for r in results if not r.success)
        rolled_back = sum(1 for r in results if r.rollback_success)
        skipped = sum(1 for r in results if r.status == UpgradeStatus.SKIPPED.value)
        
        success_rate = (success / total * 100) if total > 0 else 0
        
        durations = [r.duration for r in results if r.duration > 0]
        avg_duration = sum(durations) / len(durations) if durations else 0
        max_duration = max(durations) if durations else 0
        min_duration = min(durations) if durations else 0
        
        error_details = [
            {
                'device_id': r.device_id,
                'error': r.error,
                'rollback_success': r.rollback_success,
                'rollback_error': r.rollback_error
            }
            for r in results if not r.success
        ]
        
        return {
            'total_devices': total,
            'successful': success,
            'failed': failed,
            'rolled_back': rolled_back,
            'skipped': skipped,
            'success_rate': f"{success_rate:.1f}%",
            'avg_duration': f"{avg_duration:.1f}s",
            'max_duration': f"{max_duration:.1f}s",
            'min_duration': f"{min_duration:.1f}s",
            'error_details': error_details,
            'timestamp': time.strftime("%Y-%m-%d %H:%M:%S")
        }
