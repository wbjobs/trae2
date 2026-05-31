#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""命令行解析模块"""

import argparse
import sys
import logging
from typing import List, Dict, Any
from . import __version__


class CLI:
    """命令行接口类"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.parser = self._create_parser()

    def _create_parser(self) -> argparse.ArgumentParser:
        """创建命令行解析器"""
        parser = argparse.ArgumentParser(
            prog="iot-fw-upgrade",
            description="物联网终端固件差分升级与版本管控工具",
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
示例:
  # 生成差分包
  iot-fw-upgrade diff --old v1.0.0.bin --new v1.1.0.bin --output v1.0.0_to_v1.1.0.patch

  # 查询设备版本
  iot-fw-upgrade query --device 192.168.1.100

  # 版本比对
  iot-fw-upgrade compare --old v1.0.0 --new v1.1.0

  # 升级设备（自动回滚）
  iot-fw-upgrade upgrade --device 192.168.1.100 --patch v1.0.0_to_v1.1.0.patch --rollback on_failure

  # 批量升级（金丝雀发布）
  iot-fw-upgrade batch-upgrade --devices devices.json --patch v1.0.0_to_v1.1.0.patch --strategy canary --canary-percent 10

  # 分批升级
  iot-fw-upgrade batch-upgrade --devices devices.json --patch v1.0.0_to_v1.1.0.patch --strategy batched --batch-size 20

  # 设备分组管理
  iot-fw-upgrade group --create --group-id production --name "生产环境"
  iot-fw-upgrade group --add-device --group-id production --device dev_001
  iot-fw-upgrade group --list

  # 按分组升级
  iot-fw-upgrade group-upgrade --groups production,test --patch v1.0.0_to_v1.1.0.patch

  # 手动回滚
  iot-fw-upgrade rollback --device 192.168.1.100

  # 查看升级进度
  iot-fw-upgrade status --task upgrade_20240101_001

  # 查看设备列表
  iot-fw-upgrade devices
            """
        )

        parser.add_argument(
            "-v", "--version",
            action="version",
            version=f"iot-fw-upgrade {__version__}"
        )

        parser.add_argument(
            "-c", "--config",
            help="配置文件路径",
            default=None
        )

        parser.add_argument(
            "-d", "--debug",
            action="store_true",
            help="启用调试模式"
        )

        subparsers = parser.add_subparsers(
            dest="command",
            title="子命令",
            metavar="COMMAND"
        )

        self._add_diff_parser(subparsers)
        self._add_query_parser(subparsers)
        self._add_compare_parser(subparsers)
        self._add_upgrade_parser(subparsers)
        self._add_batch_upgrade_parser(subparsers)
        self._add_rollback_parser(subparsers)
        self._add_group_parser(subparsers)
        self._add_group_upgrade_parser(subparsers)
        self._add_status_parser(subparsers)
        self._add_devices_parser(subparsers)
        self._add_cancel_parser(subparsers)

        return parser

    def _add_diff_parser(self, subparsers):
        """添加差分包生成子命令"""
        parser = subparsers.add_parser(
            "diff",
            help="生成固件差分升级包",
            description="基于新旧固件版本生成差分升级包"
        )

        parser.add_argument(
            "--old", "-o",
            required=True,
            help="旧版本固件文件路径"
        )

        parser.add_argument(
            "--new", "-n",
            required=True,
            help="新版本固件文件路径"
        )

        parser.add_argument(
            "--output", "-p",
            required=True,
            help="输出差分包文件路径"
        )

        parser.add_argument(
            "--algorithm", "-a",
            choices=["bsdiff", "hdiff", "bsdiff4", "simple", "optimized", "fast"],
            default=self.config.get("diff_algorithm", "optimized"),
            help="差分算法 (默认: optimized)"
        )

        parser.add_argument(
            "--metadata", "-m",
            help="差分包元数据JSON文件路径"
        )

        parser.add_argument(
            "--verify",
            action="store_true",
            help="生成后自动验证差分包"
        )

    def _add_query_parser(self, subparsers):
        """添加版本查询子命令"""
        parser = subparsers.add_parser(
            "query",
            help="查询设备固件版本",
            description="查询指定设备的当前固件版本信息"
        )

        parser.add_argument(
            "--device", "-d",
            help="设备IP地址或ID（不指定则查询所有设备）"
        )

        parser.add_argument(
            "--timeout", "-t",
            type=int,
            default=self.config.get("device_timeout", 30),
            help="连接超时时间（秒）"
        )

        parser.add_argument(
            "--protocol",
            choices=["mqtt", "http", "coap", "modbus", "custom"],
            default="mqtt",
            help="通信协议"
        )

    def _add_compare_parser(self, subparsers):
        """添加版本比对子命令"""
        parser = subparsers.add_parser(
            "compare",
            help="新旧版本比对",
            description="比对两个固件版本的差异"
        )

        parser.add_argument(
            "--old", "-o",
            required=True,
            help="旧版本号或固件文件路径"
        )

        parser.add_argument(
            "--new", "-n",
            required=True,
            help="新版本号或固件文件路径"
        )

        parser.add_argument(
            "--detail", "-v",
            action="store_true",
            help="显示详细差异"
        )

        parser.add_argument(
            "--output", "-O",
            help="输出比对报告文件路径"
        )

    def _add_upgrade_parser(self, subparsers):
        """添加设备升级子命令"""
        parser = subparsers.add_parser(
            "upgrade",
            help="升级单台设备",
            description="对指定设备执行固件升级"
        )

        parser.add_argument(
            "--device", "-d",
            required=True,
            help="设备IP地址或ID"
        )

        parser.add_argument(
            "--patch", "-p",
            required=True,
            help="差分包文件路径"
        )

        parser.add_argument(
            "--timeout", "-t",
            type=int,
            default=self.config.get("device_timeout", 30),
            help="连接超时时间（秒）"
        )

        parser.add_argument(
            "--retry", "-r",
            type=int,
            default=self.config.get("retry_count", 3),
            help="失败重试次数"
        )

        parser.add_argument(
            "--protocol",
            choices=["mqtt", "http", "coap", "modbus", "custom"],
            default="mqtt",
            help="通信协议"
        )

        parser.add_argument(
            "--rollback",
            choices=["none", "on_failure", "on_demand", "auto"],
            default=self.config.get("rollback_policy", "on_failure"),
            help="回滚策略 (默认: on_failure)"
        )

    def _add_batch_upgrade_parser(self, subparsers):
        """添加批量升级子命令"""
        parser = subparsers.add_parser(
            "batch-upgrade",
            help="批量升级多台设备",
            description="对多台设备执行固件升级，支持多种分批策略"
        )

        parser.add_argument(
            "--devices", "-d",
            required=True,
            help="设备列表JSON文件路径"
        )

        parser.add_argument(
            "--patch", "-p",
            required=True,
            help="差分包文件路径"
        )

        parser.add_argument(
            "--parallel", "-P",
            type=int,
            default=self.config.get("max_parallel_upgrades", 10),
            help="最大并行升级数量"
        )

        parser.add_argument(
            "--timeout", "-t",
            type=int,
            default=self.config.get("device_timeout", 30),
            help="单设备连接超时时间（秒）"
        )

        parser.add_argument(
            "--retry", "-r",
            type=int,
            default=self.config.get("retry_count", 3),
            help="失败重试次数"
        )

        parser.add_argument(
            "--protocol",
            choices=["mqtt", "http", "coap", "modbus", "custom"],
            default="mqtt",
            help="通信协议"
        )

        parser.add_argument(
            "--rollback",
            choices=["none", "on_failure", "on_demand", "auto"],
            default=self.config.get("rollback_policy", "on_failure"),
            help="回滚策略 (默认: on_failure)"
        )

        parser.add_argument(
            "--strategy", "-s",
            choices=["parallel", "serial", "batched", "canary"],
            default=self.config.get("batch_strategy", "parallel"),
            help="分批策略 (默认: parallel)"
        )

        parser.add_argument(
            "--batch-size",
            type=int,
            default=self.config.get("batch_size", 0),
            help="分批升级时每批的设备数量（strategy=batched时使用）"
        )

        parser.add_argument(
            "--canary-percent",
            type=float,
            default=self.config.get("canary_percent", 10.0),
            help="金丝雀发布首批设备百分比（strategy=canary时使用）"
        )

        parser.add_argument(
            "--canary-wait",
            type=int,
            default=self.config.get("canary_wait_time", 300),
            help="金丝雀发布观察等待时间（秒）"
        )

    def _add_rollback_parser(self, subparsers):
        """添加回滚子命令"""
        parser = subparsers.add_parser(
            "rollback",
            help="回滚设备固件",
            description="将设备固件回滚到之前的版本"
        )

        parser.add_argument(
            "--device", "-d",
            required=True,
            help="设备IP地址或ID"
        )

        parser.add_argument(
            "--task", "-t",
            help="关联的升级任务ID（用于获取备份）"
        )

        parser.add_argument(
            "--timeout",
            type=int,
            default=self.config.get("device_timeout", 30),
            help="连接超时时间（秒）"
        )

        parser.add_argument(
            "--protocol",
            choices=["mqtt", "http", "coap", "modbus", "custom"],
            default="mqtt",
            help="通信协议"
        )

    def _add_group_parser(self, subparsers):
        """添加设备分组子命令"""
        parser = subparsers.add_parser(
            "group",
            help="管理设备分组",
            description="创建、删除、修改设备分组"
        )

        group_action = parser.add_mutually_exclusive_group(required=True)

        group_action.add_argument(
            "--create",
            action="store_true",
            help="创建新分组"
        )

        group_action.add_argument(
            "--delete",
            action="store_true",
            help="删除分组"
        )

        group_action.add_argument(
            "--list",
            action="store_true",
            help="列出所有分组"
        )

        group_action.add_argument(
            "--show",
            action="store_true",
            help="显示分组详情"
        )

        group_action.add_argument(
            "--add-device",
            action="store_true",
            help="添加设备到分组"
        )

        group_action.add_argument(
            "--remove-device",
            action="store_true",
            help="从分组移除设备"
        )

        parser.add_argument(
            "--group-id",
            help="分组ID"
        )

        parser.add_argument(
            "--name",
            help="分组名称（创建时使用）"
        )

        parser.add_argument(
            "--description",
            default="",
            help="分组描述（创建时使用）"
        )

        parser.add_argument(
            "--priority",
            type=int,
            default=0,
            help="分组优先级（创建时使用，数字越大优先级越高）"
        )

        parser.add_argument(
            "--max-parallel",
            type=int,
            default=10,
            help="分组最大并行升级数（创建时使用）"
        )

        parser.add_argument(
            "--tags",
            help="分组标签，逗号分隔（创建时使用）"
        )

        parser.add_argument(
            "--device",
            help="设备ID（添加/移除设备时使用）"
        )

        parser.add_argument(
            "--devices",
            help="设备ID列表，逗号分隔（创建时添加多个设备）"
        )

    def _add_group_upgrade_parser(self, subparsers):
        """添加分组升级子命令"""
        parser = subparsers.add_parser(
            "group-upgrade",
            help="按设备分组升级",
            description="对一个或多个设备分组执行固件升级"
        )

        parser.add_argument(
            "--groups", "-g",
            required=True,
            help="分组ID列表，逗号分隔"
        )

        parser.add_argument(
            "--patch", "-p",
            required=True,
            help="差分包文件路径"
        )

        parser.add_argument(
            "--timeout", "-t",
            type=int,
            default=self.config.get("device_timeout", 30),
            help="单设备连接超时时间（秒）"
        )

        parser.add_argument(
            "--retry", "-r",
            type=int,
            default=self.config.get("retry_count", 3),
            help="失败重试次数"
        )

        parser.add_argument(
            "--protocol",
            choices=["mqtt", "http", "coap", "modbus", "custom"],
            default="mqtt",
            help="通信协议"
        )

        parser.add_argument(
            "--rollback",
            choices=["none", "on_failure", "on_demand", "auto"],
            default=self.config.get("rollback_policy", "on_failure"),
            help="回滚策略"
        )

        parser.add_argument(
            "--parallel-groups",
            action="store_true",
            help="并行执行多分组升级（默认顺序执行）"
        )

    def _add_status_parser(self, subparsers):
        """添加升级状态查询子命令"""
        parser = subparsers.add_parser(
            "status",
            help="查看升级进度",
            description="查看升级任务的执行进度和状态"
        )

        parser.add_argument(
            "--task", "-t",
            help="任务ID（不指定则查看所有任务）"
        )

        parser.add_argument(
            "--watch", "-w",
            action="store_true",
            help="实时监控升级进度"
        )

        parser.add_argument(
            "--interval", "-i",
            type=int,
            default=2,
            help="监控刷新间隔（秒）"
        )

    def _add_devices_parser(self, subparsers):
        """添加设备列表子命令"""
        parser = subparsers.add_parser(
            "devices",
            help="管理设备列表",
            description="查看和管理已配置的设备列表"
        )

        parser.add_argument(
            "--add", "-a",
            help="添加设备（JSON格式或JSON文件路径）"
        )

        parser.add_argument(
            "--remove", "-r",
            help="移除设备ID"
        )

        parser.add_argument(
            "--list", "-l",
            action="store_true",
            help="列出所有设备"
        )

    def _add_cancel_parser(self, subparsers):
        """添加取消升级子命令"""
        parser = subparsers.add_parser(
            "cancel",
            help="取消升级任务",
            description="取消正在执行的升级任务"
        )

        parser.add_argument(
            "--task", "-t",
            required=True,
            help="任务ID"
        )

        parser.add_argument(
            "--force", "-f",
            action="store_true",
            help="强制取消"
        )

    def run(self, argv: List[str] = None) -> int:
        """
        执行命令行解析
        """
        try:
            args = self.parser.parse_args(argv)

            if not args.command:
                self.parser.print_help()
                return 1

            if args.debug:
                logging.getLogger().setLevel(logging.DEBUG)

            return self._execute_command(args)

        except KeyboardInterrupt:
            logging.info("用户中断操作")
            return 130
        except Exception as e:
            logging.error(f"执行失败: {e}")
            if args and getattr(args, 'debug', False):
                import traceback
                traceback.print_exc()
            return 1

    def _execute_command(self, args) -> int:
        """
        执行具体命令
        """
        from .device_comm import DeviceCommunicator
        from .diff_pkg import DiffPackageGenerator
        from .version_compare import VersionComparator
        from .upgrade_manager import UpgradeManager

        command = args.command

        if command == "diff":
            generator = DiffPackageGenerator(self.config)
            result = generator.generate(args.old, args.new, args.output, args.algorithm, args.metadata)
            if result == 0 and args.verify:
                result = generator.verify_package(args.output, args.old)
            return result

        elif command == "query":
            communicator = DeviceCommunicator(self.config)
            return communicator.query_version(args.device, args.protocol, args.timeout)

        elif command == "compare":
            comparator = VersionComparator(self.config)
            return comparator.compare(args.old, args.new, args.detail, args.output)

        elif command == "upgrade":
            manager = UpgradeManager(self.config)
            return manager.upgrade_single(
                args.device, args.patch, args.protocol,
                args.timeout, args.retry, args.rollback
            )

        elif command == "batch-upgrade":
            manager = UpgradeManager(self.config)
            return manager.upgrade_batch(
                args.devices, args.patch, args.parallel,
                args.protocol, args.timeout, args.retry,
                args.rollback, args.strategy, args.batch_size,
                args.canary_percent, args.canary_wait
            )

        elif command == "rollback":
            manager = UpgradeManager(self.config)
            return manager.rollback_device(
                args.device, args.task, args.protocol, args.timeout
            )

        elif command == "group":
            return self._handle_group_command(args)

        elif command == "group-upgrade":
            manager = UpgradeManager(self.config)
            group_ids = [g.strip() for g in args.groups.split(",")]
            return manager.upgrade_by_groups(
                group_ids, args.patch, args.protocol,
                args.timeout, args.retry, args.rollback,
                not args.parallel_groups
            )

        elif command == "status":
            manager = UpgradeManager(self.config)
            return manager.show_status(args.task, args.watch, args.interval)

        elif command == "devices":
            return self._handle_devices_command(args)

        elif command == "cancel":
            manager = UpgradeManager(self.config)
            return manager.cancel_task(args.task, args.force)

        else:
            self.parser.print_help()
            return 1

    def _handle_group_command(self, args) -> int:
        """处理设备分组命令"""
        from .upgrade_manager import UpgradeManager

        manager = UpgradeManager(self.config)

        if args.create:
            device_ids = []
            if args.devices:
                device_ids = [d.strip() for d in args.devices.split(",")]

            tags = []
            if args.tags:
                tags = [t.strip() for t in args.tags.split(",")]

            return manager.manage_groups(
                action="create",
                group_id=args.group_id,
                name=args.name,
                description=args.description,
                device_ids=device_ids,
                priority=args.priority,
                max_parallel=args.max_parallel,
                tags=tags
            )

        elif args.delete:
            return manager.manage_groups(
                action="delete",
                group_id=args.group_id
            )

        elif args.list:
            return manager.show_groups()

        elif args.show:
            return manager.show_groups(args.group_id)

        elif args.add_device:
            return manager.manage_groups(
                action="add_device",
                group_id=args.group_id,
                device_id=args.device
            )

        elif args.remove_device:
            return manager.manage_groups(
                action="remove_device",
                group_id=args.group_id,
                device_id=args.device
            )

        else:
            return 1

    def _handle_devices_command(self, args) -> int:
        """处理设备管理命令"""
        import os
        from .utils.common import load_json, save_json

        device_config = self.config.get("device_config", "./devices.json")

        if args.add:
            if os.path.exists(args.add):
                new_device = load_json(args.add)
            else:
                import json
                new_device = json.loads(args.add)

            devices = load_json(device_config) if os.path.exists(device_config) else []
            devices.append(new_device)
            save_json(devices, device_config)
            logging.info(f"设备添加成功: {new_device.get('id', new_device.get('ip'))}")

        elif args.remove:
            if os.path.exists(device_config):
                devices = load_json(device_config)
                devices = [d for d in devices if d.get("id") != args.remove and d.get("ip") != args.remove]
                save_json(devices, device_config)
                logging.info(f"设备移除成功: {args.remove}")

        else:
            if os.path.exists(device_config):
                devices = load_json(device_config)
                print(f"{'ID':<20} {'IP':<15} {'Model':<15} {'Version':<10} {'Status':<10}")
                print("-" * 70)
                for dev in devices:
                    print(f"{dev.get('id', '-'):<20} {dev.get('ip', '-'):<15} "
                          f"{dev.get('model', '-'):<15} {dev.get('version', '-'):<10} "
                          f"{dev.get('status', '-'):<10}")
            else:
                logging.info("暂无设备配置")

        return 0
