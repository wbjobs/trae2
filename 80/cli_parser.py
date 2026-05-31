#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
命令行解析模块
"""

import argparse
import sys


class CLIParser:
    def __init__(self):
        self.parser = argparse.ArgumentParser(
            prog='iiot-fw-mgr',
            description='工业物联网终端增量固件升级与版本管控工具',
            formatter_class=argparse.RawDescriptionHelpFormatter
        )
        
        self.parser.add_argument(
            '-V', '--version',
            action='version',
            version='%(prog)s 2.0.0'
        )
        
        self._build_subparsers()
    
    def _build_subparsers(self):
        subparsers = self.parser.add_subparsers(dest='command', required=True)
        
        self._build_generate_delta_parser(subparsers)
        self._build_query_version_parser(subparsers)
        self._build_compare_version_parser(subparsers)
        self._build_upgrade_parser(subparsers)
        self._build_status_parser(subparsers)
        self._build_devices_parser(subparsers)
        self._build_rollback_parser(subparsers)
        self._build_groups_parser(subparsers)
        self._build_firmware_parser(subparsers)
        self._build_batch_parser(subparsers)
    
    def _build_generate_delta_parser(self, subparsers):
        parser = subparsers.add_parser(
            'generate-delta',
            help='生成增量升级包'
        )
        parser.add_argument(
            '-o', '--old',
            dest='old_firmware',
            required=True,
            help='旧固件文件路径'
        )
        parser.add_argument(
            '-n', '--new',
            dest='new_firmware',
            required=True,
            help='新固件文件路径'
        )
        parser.add_argument(
            '-O', '--output',
            help='输出增量包路径 (默认: delta_<old>_<new>.bin)'
        )
        parser.add_argument(
            '-a', '--algorithm',
            choices=['auto', 'bsdiff', 'xdelta', 'lzdiff', 'zstd', 'vcdiff', 'chunked'],
            default='auto',
            help='增量算法 (默认: auto 自动选择)'
        )
        parser.add_argument(
            '--benchmark',
            action='store_true',
            help='运行所有算法基准测试'
        )
    
    def _build_query_version_parser(self, subparsers):
        parser = subparsers.add_parser(
            'query-version',
            help='查询设备固件版本'
        )
        parser.add_argument(
            '-d', '--device',
            help='设备ID (不指定则查询所有设备)'
        )
        parser.add_argument(
            '--serial',
            action='store_true',
            help='串行查询 (默认: 并行)'
        )
    
    def _build_compare_version_parser(self, subparsers):
        parser = subparsers.add_parser(
            'compare-version',
            help='比对版本号'
        )
        parser.add_argument(
            'version1',
            help='第一个版本号'
        )
        parser.add_argument(
            'version2',
            help='第二个版本号'
        )
        parser.add_argument(
            '--type',
            action='store_true',
            help='显示升级类型'
        )
        parser.add_argument(
            '--safe-check',
            action='store_true',
            help='进行安全升级检查'
        )
    
    def _build_upgrade_parser(self, subparsers):
        parser = subparsers.add_parser(
            'upgrade',
            help='升级设备固件'
        )
        parser.add_argument(
            '-d', '--devices',
            help='设备ID列表，逗号分隔 (不指定则升级所有设备)'
        )
        parser.add_argument(
            '-f', '--firmware',
            required=True,
            help='新固件文件路径'
        )
        parser.add_argument(
            '--delta',
            help='增量包路径 (自动生成则不指定)'
        )
        parser.add_argument(
            '--serial',
            action='store_true',
            help='串行升级 (默认: 并行)'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='强制升级 (忽略版本检查)'
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=5,
            help='批量升级时每批设备数 (默认: 5)'
        )
        parser.add_argument(
            '--batch-delay',
            type=int,
            default=10,
            help='批次之间延迟秒数 (默认: 10)'
        )
        parser.add_argument(
            '--max-failure-rate',
            type=float,
            default=0.2,
            help='允许的最大失败率 (默认: 0.2，超过则停止)'
        )
        parser.add_argument(
            '--rollback-strategy',
            choices=['none', 'auto', 'manual'],
            default='auto',
            help='失败回滚策略 (默认: auto 自动回滚)'
        )
        parser.add_argument(
            '--no-auto-rollback',
            action='store_true',
            help='禁用自动回滚'
        )
        parser.add_argument(
            '--stop-on-batch-failure',
            action='store_true',
            help='单批有失败设备时停止后续批次'
        )
        parser.add_argument(
            '--allow-major',
            action='store_true',
            help='允许跨主版本升级'
        )
        parser.add_argument(
            '--allow-downgrade',
            action='store_true',
            help='允许降级'
        )
        parser.add_argument(
            '--report',
            help='批量升级报告输出文件路径 (JSON格式)'
        )
    
    def _build_status_parser(self, subparsers):
        parser = subparsers.add_parser(
            'status',
            help='查看升级状态'
        )
        parser.add_argument(
            '-d', '--device',
            help='设备ID (不指定则查看所有设备)'
        )
        parser.add_argument(
            '--summary',
            action='store_true',
            help='只显示汇总信息'
        )
        parser.add_argument(
            '--clean',
            action='store_true',
            help='清理指定设备的状态记录'
        )
        parser.add_argument(
            '--clean-all',
            action='store_true',
            help='清理所有状态记录'
        )
    
    def _build_devices_parser(self, subparsers):
        parser = subparsers.add_parser(
            'devices',
            help='设备管理'
        )
        device_subparsers = parser.add_subparsers(dest='action', required=True)
        
        list_parser = device_subparsers.add_parser('list', help='列出所有设备')
        
        add_parser = device_subparsers.add_parser('add', help='添加设备')
        add_parser.add_argument('device_id', help='设备ID')
        add_parser.add_argument('address', help='设备地址 (IP:Port)')
        add_parser.add_argument(
            '-p', '--protocol',
            choices=['modbus', 'mqtt', 'http', 'coap'],
            default='modbus',
            help='通信协议 (默认: modbus)'
        )
        
        remove_parser = device_subparsers.add_parser('remove', help='移除设备')
        remove_parser.add_argument('device_id', help='设备ID')
        
        scan_parser = device_subparsers.add_parser('scan', help='扫描设备')
        scan_parser.add_argument(
            '-t', '--timeout',
            type=int,
            default=5,
            help='超时时间(秒) (默认: 5)'
        )
    
    def _build_rollback_parser(self, subparsers):
        parser = subparsers.add_parser(
            'rollback',
            help='回滚设备固件'
        )
        parser.add_argument(
            'device',
            help='设备ID'
        )
        parser.add_argument(
            '--to-version',
            help='回滚到指定版本'
        )
        parser.add_argument(
            '--backup-path',
            help='指定备份文件路径'
        )
    
    def _build_groups_parser(self, subparsers):
        parser = subparsers.add_parser(
            'groups',
            help='设备分组管理'
        )
        group_subparsers = parser.add_subparsers(dest='action', required=True)
        
        list_parser = group_subparsers.add_parser('list', help='列出所有分组')
        
        create_parser = group_subparsers.add_parser('create', help='创建设备分组')
        create_parser.add_argument('group_id', help='分组ID')
        create_parser.add_argument('name', help='分组名称')
        create_parser.add_argument(
            '-d', '--devices',
            help='设备ID列表，逗号分隔'
        )
        create_parser.add_argument(
            '--description',
            default='',
            help='分组描述'
        )
        create_parser.add_argument(
            '--priority',
            type=int,
            default=0,
            help='升级优先级 (数字越大优先级越高)'
        )
        
        delete_parser = group_subparsers.add_parser('delete', help='删除设备分组')
        delete_parser.add_argument('group_id', help='分组ID')
        
        show_parser = group_subparsers.add_parser('show', help='显示分组详情')
        show_parser.add_argument('group_id', help='分组ID')
        
        add_device_parser = group_subparsers.add_parser('add-device', help='添加设备到分组')
        add_device_parser.add_argument('group_id', help='分组ID')
        add_device_parser.add_argument('device_id', help='设备ID')
        
        remove_device_parser = group_subparsers.add_parser('remove-device', help='从分组移除设备')
        remove_device_parser.add_argument('group_id', help='分组ID')
        remove_device_parser.add_argument('device_id', help='设备ID')
        
        upgrade_parser = group_subparsers.add_parser('upgrade', help='升级整个分组')
        upgrade_parser.add_argument('group_id', help='分组ID')
        upgrade_parser.add_argument(
            '-f', '--firmware',
            required=True,
            help='新固件文件路径'
        )
        upgrade_parser.add_argument(
            '--delta',
            help='增量包路径'
        )
        upgrade_parser.add_argument(
            '--force',
            action='store_true',
            help='强制升级'
        )
        upgrade_parser.add_argument(
            '--batch-size',
            type=int,
            default=5,
            help='每批设备数'
        )
        upgrade_parser.add_argument(
            '--rollback-strategy',
            choices=['none', 'auto', 'manual'],
            default='auto',
            help='失败回滚策略'
        )
        upgrade_parser.add_argument(
            '--report',
            help='升级报告输出路径'
        )
    
    def _build_firmware_parser(self, subparsers):
        parser = subparsers.add_parser(
            'firmware',
            help='固件版本管理'
        )
        fw_subparsers = parser.add_subparsers(dest='action', required=True)
        
        list_parser = fw_subparsers.add_parser('list', help='列出所有固件版本')
        list_parser.add_argument(
            '--show-all',
            action='store_true',
            help='显示包括不稳定版本'
        )
        
        register_parser = fw_subparsers.add_parser('register', help='注册固件版本')
        register_parser.add_argument(
            '-f', '--file',
            required=True,
            help='固件文件路径'
        )
        register_parser.add_argument(
            '-v', '--version',
            required=True,
            help='版本号'
        )
        register_parser.add_argument(
            '--notes',
            default='',
            help='发布说明'
        )
        register_parser.add_argument(
            '--hardware',
            help='兼容的硬件型号，逗号分隔'
        )
        
        info_parser = fw_subparsers.add_parser('info', help='查看固件详情')
        info_parser.add_argument('version', help='版本号')
        
        latest_parser = fw_subparsers.add_parser('latest', help='获取最新稳定版本')
        latest_parser.add_argument(
            '--constraint',
            help='版本约束，例如 ">=1.0.0,<2.0.0"'
        )
        latest_parser.add_argument(
            '--include-unstable',
            action='store_true',
            help='包含不稳定版本'
        )
        
        verify_parser = fw_subparsers.add_parser('verify', help='验证版本格式')
        verify_parser.add_argument('version', help='版本号')
        
        path_parser = fw_subparsers.add_parser('upgrade-path', help='计算升级路径')
        path_parser.add_argument('from_version', help='起始版本')
        path_parser.add_argument('to_version', help='目标版本')
    
    def _build_batch_parser(self, subparsers):
        parser = subparsers.add_parser(
            'batch',
            help='批量升级管理'
        )
        batch_subparsers = parser.add_subparsers(dest='action', required=True)
        
        upgrade_parser = batch_subparsers.add_parser('upgrade', help='批量升级多个设备')
        upgrade_parser.add_argument(
            '-d', '--devices',
            help='设备ID列表，逗号分隔'
        )
        upgrade_parser.add_argument(
            '-f', '--firmware',
            required=True,
            help='固件文件路径'
        )
        upgrade_parser.add_argument(
            '--mode',
            choices=['parallel', 'sequential', 'batched'],
            default='batched',
            help='升级模式 (默认: batched 分批次)'
        )
        upgrade_parser.add_argument(
            '--batch-size',
            type=int,
            default=5,
            help='每批设备数'
        )
        upgrade_parser.add_argument(
            '--batch-delay',
            type=int,
            default=10,
            help='批次间延迟秒数'
        )
        upgrade_parser.add_argument(
            '--max-failure-rate',
            type=float,
            default=0.2,
            help='最大失败率阈值'
        )
        upgrade_parser.add_argument(
            '--rollback-strategy',
            choices=['none', 'auto', 'manual'],
            default='auto',
            help='失败回滚策略'
        )
        upgrade_parser.add_argument(
            '--report',
            help='升级报告输出路径'
        )
        upgrade_parser.add_argument(
            '--force',
            action='store_true',
            help='强制升级'
        )
        
        status_parser = batch_subparsers.add_parser('status', help='查看批量升级状态')
        
        report_parser = batch_subparsers.add_parser('generate-report', help='生成升级报告')
        report_parser.add_argument(
            '--format',
            choices=['json', 'text'],
            default='text',
            help='报告格式'
        )
    
    def parse_args(self, args=None):
        if args is None:
            args = sys.argv[1:]
        
        if not args:
            self.parser.print_help()
            sys.exit(1)
        
        return self.parser.parse_args(args)
    
    def print_help(self):
        self.parser.print_help()
