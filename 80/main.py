#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
工业物联网终端增量固件升级与版本管控工具
主入口文件 v2.0.0
"""

import sys
import os
import json
import signal
import logging
from typing import List

from cli_parser import CLIParser
from device_comm import DeviceManager
from delta_generator import DeltaGenerator
from version_manager import VersionManager
from upgrade_manager import UpgradeManager, BatchUpgradeConfig, RollbackStrategy
from config import Config
from utils import setup_logging, signal_handler


class IIoTFirmwareManager:
    def __init__(self):
        self.config = Config()
        setup_logging(self.config.log_level, self.config.log_file)
        self.logger = logging.getLogger(__name__)
        
        self.device_manager = DeviceManager(self.config)
        self.delta_generator = DeltaGenerator(self.config)
        self.version_manager = VersionManager(self.config)
        self.upgrade_manager = UpgradeManager(
            self.config,
            self.device_manager,
            self.version_manager
        )
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    def run(self, args: List[str]) -> int:
        parser = CLIParser()
        cmd_args = parser.parse_args(args)
        
        try:
            if cmd_args.command == 'generate-delta':
                return self._handle_generate_delta(cmd_args)
            elif cmd_args.command == 'query-version':
                return self._handle_query_version(cmd_args)
            elif cmd_args.command == 'compare-version':
                return self._handle_compare_version(cmd_args)
            elif cmd_args.command == 'upgrade':
                return self._handle_upgrade(cmd_args)
            elif cmd_args.command == 'status':
                return self._handle_status(cmd_args)
            elif cmd_args.command == 'devices':
                return self._handle_devices(cmd_args)
            elif cmd_args.command == 'rollback':
                return self._handle_rollback(cmd_args)
            elif cmd_args.command == 'groups':
                return self._handle_groups(cmd_args)
            elif cmd_args.command == 'firmware':
                return self._handle_firmware(cmd_args)
            elif cmd_args.command == 'batch':
                return self._handle_batch(cmd_args)
            else:
                parser.print_help()
                return 1
        except Exception as e:
            self.logger.error(f"执行命令失败: {str(e)}", exc_info=True)
            return 1
    
    def _handle_generate_delta(self, args) -> int:
        if args.benchmark:
            self.logger.info("运行算法基准测试...")
            results = self.delta_generator.benchmark_algorithms(
                args.old_firmware,
                args.new_firmware
            )
            
            print("\n算法基准测试结果:")
            print("-" * 80)
            print(f"{'算法':<12} {'成功':<6} {'大小':<12} {'压缩率':<10} {'生成时间':<12} {'应用时间':<12}")
            print("-" * 80)
            
            for r in results:
                print(f"{r['algorithm']:<12} {str(r['success']):<6} "
                      f"{r['delta_size']:<12} "
                      f"{r['compression_ratio']:>8.1f}% "
                      f"{r['gen_time']:>10.2f}s "
                      f"{r['apply_time']:>10.2f}s")
            
            if results:
                best = results[0]
                print(f"\n推荐算法: {best['algorithm']} "
                      f"(压缩率 {best['compression_ratio']:.1f}%)")
            
            return 0
        
        self.logger.info(f"生成增量包: {args.old_firmware} -> {args.new_firmware}")
        
        output_path = self.delta_generator.generate_delta(
            args.old_firmware,
            args.new_firmware,
            args.output,
            args.algorithm
        )
        
        if output_path:
            info = self.delta_generator.verify_delta(output_path)
            if info:
                print(f"\n增量包生成成功: {output_path}")
                print(f"  算法: {info['algorithm']}")
                print(f"  旧版本大小: {info['old_size']} bytes")
                print(f"  新版本大小: {info['new_size']} bytes")
                print(f"  增量包大小: {info['delta_size']} bytes")
                
                if info['new_size'] > 0:
                    ratio = (1 - info['delta_size'] / info['new_size']) * 100
                    print(f"  压缩率: {ratio:.1f}%")
            
            return 0
        else:
            self.logger.error("增量包生成失败")
            return 1
    
    def _handle_query_version(self, args) -> int:
        if args.device:
            devices = [args.device]
        else:
            devices = self.device_manager.get_all_devices()
        
        if not devices:
            self.logger.warning("未发现设备")
            return 1
        
        results = self.device_manager.query_versions(devices, parallel=not args.serial)
        
        for device_id, version_info in results.items():
            if isinstance(version_info, dict):
                print(f"\n设备: {device_id}")
                print(f"  固件版本: {version_info.get('firmware_version', 'N/A')}")
                print(f"  硬件版本: {version_info.get('hardware_version', 'N/A')}")
                print(f"  序列号: {version_info.get('serial_number', 'N/A')}")
                print(f"  构建时间: {version_info.get('build_time', 'N/A')}")
            else:
                print(f"\n设备: {device_id} - 查询失败: {version_info}")
        
        return 0
    
    def _handle_compare_version(self, args) -> int:
        result = self.version_manager.compare(args.version1, args.version2)
        
        if result < 0:
            print(f"{args.version1} < {args.version2}")
        elif result > 0:
            print(f"{args.version1} > {args.version2}")
        else:
            print(f"{args.version1} == {args.version2}")
        
        if args.type:
            upgrade_type = self.version_manager.check_upgrade_type(
                args.version1, args.version2
            )
            print(f"升级类型: {upgrade_type}")
        
        if args.safe_check:
            is_safe, reason = self.version_manager.is_safe_upgrade(
                args.version1, args.version2
            )
            print(f"安全检查: {'通过' if is_safe else '未通过'} - {reason}")
        
        return 0
    
    def _create_batch_config(self, args) -> BatchUpgradeConfig:
        rollback_strategy = RollbackStrategy(args.rollback_strategy)
        if getattr(args, 'no_auto_rollback', False):
            rollback_strategy = RollbackStrategy.NONE
        
        return BatchUpgradeConfig(
            batch_size=getattr(args, 'batch_size', 5),
            batch_delay=getattr(args, 'batch_delay', 10),
            max_failure_rate=getattr(args, 'max_failure_rate', 0.2),
            continue_on_failure=not getattr(args, 'stop_on_batch_failure', False),
            stop_on_batch_failure=getattr(args, 'stop_on_batch_failure', False),
            rollback_strategy=rollback_strategy,
            pre_upgrade_check=True,
            post_upgrade_verify=True,
        )
    
    def _handle_upgrade(self, args) -> int:
        if args.devices:
            device_list = args.devices.split(',')
        else:
            device_list = self.device_manager.get_all_devices()
        
        if not device_list:
            self.logger.error("未指定升级设备")
            return 1
        
        self.logger.info(f"开始升级 {len(device_list)} 台设备")
        
        batch_config = self._create_batch_config(args)
        
        results = self.upgrade_manager.start_upgrade(
            device_list,
            args.firmware,
            delta_path=args.delta,
            parallel=not args.serial,
            force=args.force,
            batch_config=batch_config,
            rollback_strategy=RollbackStrategy(args.rollback_strategy)
        )
        
        report = self.upgrade_manager.get_batch_upgrade_report(results)
        
        print("\n" + "=" * 60)
        print("批量升级报告")
        print("=" * 60)
        print(f"总设备数: {report['total_devices']}")
        print(f"成功: {report['successful']}")
        print(f"失败: {report['failed']}")
        print(f"已回滚: {report['rolled_back']}")
        print(f"跳过: {report['skipped']}")
        print(f"成功率: {report['success_rate']}")
        print(f"平均耗时: {report['avg_duration']}")
        print(f"最长耗时: {report['max_duration']}")
        print(f"最短耗时: {report['min_duration']}")
        print(f"生成时间: {report['timestamp']}")
        
        if report['error_details']:
            print("\n错误详情:")
            for err in report['error_details']:
                print(f"  设备 {err['device_id']}: {err['error']}")
                if err['rollback_success'] is not None:
                    rb_status = "成功" if err['rollback_success'] else "失败"
                    print(f"    回滚: {rb_status}")
                    if err['rollback_error']:
                        print(f"    回滚错误: {err['rollback_error']}")
        
        if getattr(args, 'report', None):
            try:
                with open(args.report, 'w', encoding='utf-8') as f:
                    json.dump(report, f, indent=2, ensure_ascii=False)
                print(f"\n详细报告已保存到: {args.report}")
            except Exception as e:
                self.logger.error(f"保存报告失败: {e}")
        
        return 0 if report['failed'] == 0 else 1
    
    def _handle_status(self, args) -> int:
        if getattr(args, 'clean_all', False):
            self.upgrade_manager.clean_status()
            print("已清理所有状态记录")
            return 0
        
        if getattr(args, 'clean', False):
            if args.device:
                self.upgrade_manager.clean_status(args.device)
                print(f"已清理设备 {args.device} 的状态记录")
            else:
                print("请指定设备ID")
                return 1
            return 0
        
        if getattr(args, 'summary', False):
            summary = self.upgrade_manager.get_upgrade_summary()
            print("\n升级状态汇总:")
            print(f"  总设备数: {summary['total']}")
            print(f"  成功: {summary['success']}")
            print(f"  失败: {summary['failed']}")
            print(f"  已回滚: {summary['rolled_back']}")
            print(f"  进行中: {summary['in_progress']}")
            print(f"  已跳过: {summary['skipped']}")
            print(f"  空闲: {summary['idle']}")
            return 0
        
        if args.device:
            status = self.upgrade_manager.get_device_status(args.device)
            if status:
                self._print_device_status(args.device, status)
            else:
                print(f"设备 {args.device} 无升级记录")
        else:
            all_status = self.upgrade_manager.get_all_status()
            if all_status:
                for device_id, status in all_status.items():
                    self._print_device_status(device_id, status)
            else:
                print("无升级任务")
        
        return 0
    
    def _print_device_status(self, device_id: str, status: dict):
        print(f"\n设备: {device_id}")
        print(f"  状态: {status.get('status', 'N/A')}")
        print(f"  进度: {status.get('progress', 0)}%")
        print(f"  当前版本: {status.get('current_version', 'N/A')}")
        print(f"  目标版本: {status.get('target_version', 'N/A')}")
        
        if 'transferred_bytes' in status and 'total_bytes' in status:
            print(f"  已传输: {status['transferred_bytes']} / {status['total_bytes']} bytes")
        
        if 'error' in status and status['error']:
            print(f"  错误: {status['error']}")
        
        if 'rollback_success' in status:
            rb_status = "成功" if status['rollback_success'] else "失败"
            print(f"  回滚: {rb_status}")
        
        if 'last_backup' in status:
            backup = status['last_backup']
            print(f"  最后备份: {backup.get('version', 'N/A')} ({backup.get('timestamp', 'N/A')})")
    
    def _handle_devices(self, args) -> int:
        if args.action == 'list':
            devices = self.device_manager.get_all_devices()
            if devices:
                print("已注册设备:")
                for device in devices:
                    info = self.device_manager.get_device_info(device)
                    if info:
                        print(f"  - {device} ({info.get('address', 'N/A')}, "
                              f"{info.get('protocol', 'N/A')})")
                    else:
                        print(f"  - {device}")
            else:
                print("无已注册设备")
        elif args.action == 'add':
            success = self.device_manager.add_device(
                args.device_id, args.address, args.protocol
            )
            if success:
                print(f"设备 {args.device_id} 添加成功")
            else:
                print(f"设备 {args.device_id} 添加失败")
        elif args.action == 'remove':
            success = self.device_manager.remove_device(args.device_id)
            if success:
                print(f"设备 {args.device_id} 移除成功")
            else:
                print(f"设备 {args.device_id} 移除失败")
        elif args.action == 'scan':
            print("扫描网络中的设备...")
            devices = self.device_manager.scan_devices(args.timeout)
            if devices:
                print(f"发现 {len(devices)} 台设备:")
                for device in devices:
                    print(f"  - {device['id']} ({device['address']})")
            else:
                print("未发现设备")
        
        return 0
    
    def _handle_rollback(self, args) -> int:
        device_id = args.device
        
        if getattr(args, 'backup_path', None):
            print(f"将设备 {device_id} 回滚到备份文件: {args.backup_path}")
            self.logger.info(f"手动回滚到备份: {args.backup_path}")
        
        if getattr(args, 'to_version', None):
            print(f"将设备 {device_id} 回滚到版本: {args.to_version}")
        
        success = self.upgrade_manager.rollback(device_id)
        
        if success:
            print(f"设备 {device_id} 回滚成功")
            return 0
        else:
            print(f"设备 {device_id} 回滚失败")
            return 1
    
    def _handle_groups(self, args) -> int:
        if args.action == 'list':
            groups = self.upgrade_manager.get_all_groups()
            if groups:
                print("设备分组列表:")
                for g in groups:
                    print(f"  [{g.group_id}] {g.name}")
                    print(f"    设备数: {len(g.device_ids)}, 优先级: {g.priority}")
                    if g.description:
                        print(f"    描述: {g.description}")
            else:
                print("无设备分组")
        
        elif args.action == 'create':
            device_ids = []
            if getattr(args, 'devices', None):
                device_ids = [d.strip() for d in args.devices.split(',')]
            
            group = self.upgrade_manager.create_group(
                args.group_id,
                args.name,
                device_ids=device_ids,
                description=args.description,
                priority=args.priority
            )
            
            print(f"分组创建成功: {group.group_id} ({group.name})")
            print(f"  设备: {len(group.device_ids)} 台")
        
        elif args.action == 'delete':
            if self.upgrade_manager.delete_group(args.group_id):
                print(f"分组 {args.group_id} 删除成功")
            else:
                print(f"分组 {args.group_id} 删除失败或不存在")
        
        elif args.action == 'show':
            group = self.upgrade_manager.get_group(args.group_id)
            if group:
                print(f"分组: {group.group_id}")
                print(f"名称: {group.name}")
                print(f"描述: {group.description}")
                print(f"优先级: {group.priority}")
                print(f"设备列表 ({len(group.device_ids)}):")
                for device_id in group.device_ids:
                    print(f"  - {device_id}")
            else:
                print(f"分组 {args.group_id} 不存在")
        
        elif args.action == 'add-device':
            if self.upgrade_manager.add_to_group(args.group_id, args.device_id):
                print(f"设备 {args.device_id} 已添加到分组 {args.group_id}")
            else:
                print(f"添加失败，分组 {args.group_id} 不存在")
        
        elif args.action == 'remove-device':
            if self.upgrade_manager.remove_from_group(args.group_id, args.device_id):
                print(f"设备 {args.device_id} 已从分组 {args.group_id} 移除")
            else:
                print(f"移除失败，分组 {args.group_id} 不存在")
        
        elif args.action == 'upgrade':
            batch_config = self._create_batch_config(args)
            
            results = self.upgrade_manager.start_group_upgrade(
                args.group_id,
                args.firmware,
                delta_path=args.delta,
                force=args.force,
                batch_config=batch_config
            )
            
            if not results:
                print("分组升级未执行")
                return 1
            
            report = self.upgrade_manager.get_batch_upgrade_report(results)
            
            print(f"\n分组 {args.group_id} 升级完成:")
            print(f"  总计: {report['total_devices']}, 成功: {report['successful']}, "
                  f"失败: {report['failed']}, 回滚: {report['rolled_back']}")
            print(f"  成功率: {report['success_rate']}")
            
            if getattr(args, 'report', None):
                try:
                    with open(args.report, 'w', encoding='utf-8') as f:
                        json.dump(report, f, indent=2, ensure_ascii=False)
                    print(f"报告已保存: {args.report}")
                except Exception as e:
                    self.logger.error(f"保存报告失败: {e}")
            
            return 0 if report['failed'] == 0 else 1
        
        return 0
    
    def _handle_firmware(self, args) -> int:
        if args.action == 'list':
            firmware_list = self.version_manager.get_all_firmware()
            if not getattr(args, 'show_all', False):
                firmware_list = [fw for fw in firmware_list if fw.is_stable]
            
            if firmware_list:
                print("固件版本列表:")
                for fw in firmware_list:
                    status = "稳定版" if fw.is_stable else "开发版"
                    print(f"  {fw.version} ({status})")
                    print(f"    文件: {fw.file_path}")
                    print(f"    大小: {fw.file_size} bytes")
                    print(f"    发布日期: {fw.release_date}")
                    if fw.release_notes:
                        print(f"    说明: {fw.release_notes[:60]}...")
            else:
                print("无已注册固件")
        
        elif args.action == 'register':
            hardware_list = []
            if getattr(args, 'hardware', None):
                hardware_list = [h.strip() for h in args.hardware.split(',')]
            
            fw = self.version_manager.register_firmware(
                args.file,
                args.version,
                release_notes=args.notes,
                compatible_hardware=hardware_list
            )
            
            if fw:
                print(f"固件注册成功: {fw.version}")
                print(f"  哈希: {fw.file_hash[:32]}...")
                print(f"  大小: {fw.file_size} bytes")
                print(f"  类型: {'稳定版' if fw.is_stable else '开发版'}")
            else:
                print("固件注册失败")
                return 1
        
        elif args.action == 'info':
            fw = self.version_manager.get_firmware_info(args.version)
            if fw:
                print(f"固件版本: {fw.version}")
                print(f"  状态: {'稳定版' if fw.is_stable else '开发版'}")
                print(f"  文件: {fw.file_path}")
                print(f"  大小: {fw.file_size} bytes")
                print(f"  哈希: {fw.file_hash}")
                print(f"  发布日期: {fw.release_date}")
                if fw.release_notes:
                    print(f"  发布说明:\n{fw.release_notes}")
                if fw.compatible_hardware:
                    print(f"  兼容硬件: {', '.join(fw.compatible_hardware)}")
            else:
                print(f"版本 {args.version} 不存在")
                return 1
        
        elif args.action == 'latest':
            constraint = getattr(args, 'constraint', None)
            only_stable = not getattr(args, 'include_unstable', False)
            
            fw = self.version_manager.get_latest_firmware(
                constraint=constraint,
                only_stable=only_stable
            )
            
            if fw:
                print(f"最新版本: {fw.version}")
                print(f"  文件: {fw.file_path}")
                print(f"  大小: {fw.file_size} bytes")
                print(f"  类型: {'稳定版' if fw.is_stable else '开发版'}")
            else:
                print("未找到符合条件的固件")
                return 1
        
        elif args.action == 'verify':
            info = self.version_manager.parse_version(args.version)
            print(f"版本号: {info['raw']}")
            print(f"  有效: {info['valid']}")
            print(f"  主版本: {info['major']}")
            print(f"  次版本: {info['minor']}")
            print(f"  修订号: {info['patch']}")
            print(f"  构建号: {info['build']}")
            if info['prerelease']:
                print(f"  预发布: {info['prerelease']}")
            if info['metadata']:
                print(f"  元数据: {info['metadata']}")
        
        elif args.action == 'upgrade-path':
            path = self.version_manager.get_upgrade_path(
                args.from_version,
                args.to_version
            )
            
            if path:
                print(f"升级路径 ({args.from_version} -> {args.to_version}):")
                for i, v in enumerate(path, 1):
                    print(f"  {i}. {v}")
            else:
                print("无需升级或无法找到升级路径")
        
        return 0
    
    def _handle_batch(self, args) -> int:
        if args.action == 'upgrade':
            if args.devices:
                device_list = [d.strip() for d in args.devices.split(',')]
            else:
                device_list = self.device_manager.get_all_devices()
            
            if not device_list:
                print("未指定设备")
                return 1
            
            batch_config = self._create_batch_config(args)
            
            parallel = args.mode != 'sequential'
            
            results = self.upgrade_manager.start_upgrade(
                device_list,
                args.firmware,
                delta_path=None,
                parallel=parallel,
                force=args.force,
                batch_config=batch_config,
                rollback_strategy=RollbackStrategy(args.rollback_strategy)
            )
            
            report = self.upgrade_manager.get_batch_upgrade_report(results)
            
            print(f"\n批量升级完成: {report['success_rate']}")
            print(f"  总计: {report['total_devices']}, 成功: {report['successful']}, "
                  f"失败: {report['failed']}, 回滚: {report['rolled_back']}")
            
            if getattr(args, 'report', None):
                try:
                    with open(args.report, 'w', encoding='utf-8') as f:
                        json.dump(report, f, indent=2, ensure_ascii=False)
                    print(f"报告已保存: {args.report}")
                except Exception as e:
                    self.logger.error(f"保存报告失败: {e}")
            
            return 0 if report['failed'] == 0 else 1
        
        elif args.action == 'status':
            summary = self.upgrade_manager.get_upgrade_summary()
            print("批量升级状态汇总:")
            for key, value in summary.items():
                print(f"  {key}: {value}")
            return 0
        
        elif args.action == 'generate-report':
            all_status = self.upgrade_manager.get_all_status()
            results = []
            
            from upgrade_manager import UpgradeResult
            for device_id, status in all_status.items():
                success = status.get('status') == 'success'
                results.append(UpgradeResult(
                    device_id=device_id,
                    success=success,
                    status=status.get('status', 'unknown'),
                    error=status.get('error'),
                    rollback_success=status.get('rollback_success')
                ))
            
            report = self.upgrade_manager.get_batch_upgrade_report(results)
            
            if args.format == 'json':
                print(json.dumps(report, indent=2, ensure_ascii=False))
            else:
                print(f"升级报告 - {report['timestamp']}")
                print("=" * 60)
                print(f"总设备数: {report['total_devices']}")
                print(f"成功: {report['successful']}, 失败: {report['failed']}")
                print(f"回滚: {report['rolled_back']}, 跳过: {report['skipped']}")
                print(f"成功率: {report['success_rate']}")
                
                if report['error_details']:
                    print("\n错误详情:")
                    for err in report['error_details']:
                        print(f"  {err['device_id']}: {err['error']}")
        
        return 0


def main():
    app = IIoTFirmwareManager()
    sys.exit(app.run(sys.argv[1:]))


if __name__ == '__main__':
    main()
