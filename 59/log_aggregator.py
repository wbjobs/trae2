"""
巡检日志汇总模块
Inspection Log Aggregator Module

负责汇总所有巡检结果，生成格式化的巡检日志报告。
"""

import os
import io
import sys
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from dataclasses import dataclass, field

from config import LogConfig
from resource_checker import ResourceReport
from service_inspector import ServiceInspectionReport

logger = logging.getLogger(__name__)

DEFAULT_ENCODING = "utf-8"
UNICODE_COMPAT = True


def _safe_encode(text: str) -> str:
    """安全编码文本，处理特殊字符"""
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    if UNICODE_COMPAT:
        try:
            return text.encode(DEFAULT_ENCODING, errors="replace").decode(DEFAULT_ENCODING)
        except Exception:
            return text
    return text


def _clean_dict_for_json(data: Any) -> Any:
    """递归清理字典中的非 UTF-8 字符"""
    if isinstance(data, dict):
        return {
            _safe_encode(k): _clean_dict_for_json(v)
            for k, v in data.items()
        }
    elif isinstance(data, list):
        return [_clean_dict_for_json(item) for item in data]
    elif isinstance(data, str):
        return _safe_encode(data)
    else:
        return data


@dataclass
class NodeSummary:
    """节点汇总信息"""
    node_name: str
    host: str
    role: str
    resource_status: str
    service_status: str
    overall_status: str
    cpu_usage: float
    memory_usage: float
    disk_usage_max: float
    containers_total: int
    containers_running: int
    issues_count: int
    warnings_count: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": _safe_encode(self.node_name),
            "host": _safe_encode(self.host),
            "role": _safe_encode(self.role),
            "resource_status": _safe_encode(self.resource_status),
            "service_status": _safe_encode(self.service_status),
            "overall_status": _safe_encode(self.overall_status),
            "cpu_usage": round(self.cpu_usage, 2),
            "memory_usage": round(self.memory_usage, 2),
            "disk_usage_max": round(self.disk_usage_max, 2),
            "containers_total": self.containers_total,
            "containers_running": self.containers_running,
            "issues_count": self.issues_count,
            "warnings_count": self.warnings_count,
        }


@dataclass
class ClusterSummary:
    """集群汇总信息"""
    cluster_name: str
    timestamp: str
    total_nodes: int
    healthy_nodes: int
    warning_nodes: int
    critical_nodes: int
    unknown_nodes: int
    average_cpu_usage: float
    average_memory_usage: float
    total_containers: int
    running_containers: int
    total_issues: int
    total_warnings: int
    node_summaries: List[NodeSummary] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cluster_name": _safe_encode(self.cluster_name),
            "timestamp": _safe_encode(self.timestamp),
            "total_nodes": self.total_nodes,
            "healthy_nodes": self.healthy_nodes,
            "warning_nodes": self.warning_nodes,
            "critical_nodes": self.critical_nodes,
            "unknown_nodes": self.unknown_nodes,
            "average_cpu_usage": round(self.average_cpu_usage, 2),
            "average_memory_usage": round(self.average_memory_usage, 2),
            "total_containers": self.total_containers,
            "running_containers": self.running_containers,
            "total_issues": self.total_issues,
            "total_warnings": self.total_warnings,
            "node_summaries": [ns.to_dict() for ns in self.node_summaries],
        }


@dataclass
class InspectionLog:
    """完整巡检日志"""
    timestamp: str
    duration_seconds: float
    cluster_summary: ClusterSummary
    resource_reports: Dict[str, ResourceReport] = field(default_factory=dict)
    service_reports: Dict[str, ServiceInspectionReport] = field(default_factory=dict)
    connection_results: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": _safe_encode(self.timestamp),
            "duration_seconds": round(self.duration_seconds, 3),
            "cluster_summary": self.cluster_summary.to_dict(),
            "resource_reports": {
                _safe_encode(name): _clean_dict_for_json(report.to_dict())
                for name, report in self.resource_reports.items()
            },
            "service_reports": {
                _safe_encode(name): _clean_dict_for_json(report.to_dict())
                for name, report in self.service_reports.items()
            },
            "connection_results": _clean_dict_for_json(self.connection_results),
            "errors": [_safe_encode(e) for e in self.errors],
        }


class LogAggregator:
    """日志汇总器"""

    def __init__(self, log_config: LogConfig, cluster_name: str = "default-cluster"):
        self.log_config = log_config
        self.cluster_name = cluster_name
        self.encoding = getattr(log_config, "encoding", DEFAULT_ENCODING) or DEFAULT_ENCODING
        logger.info(f"日志汇总器初始化完成，编码: {self.encoding}")

    def generate_node_summary(
        self,
        node_name: str,
        node_config: Any,
        resource_report: Optional[ResourceReport],
        service_report: Optional[ServiceInspectionReport],
    ) -> NodeSummary:
        """生成节点汇总

        Args:
            node_name: 节点名称
            node_config: 节点配置
            resource_report: 资源检测报告
            service_report: 服务巡检报告

        Returns:
            NodeSummary 节点汇总对象
        """
        resource_status = "UNKNOWN"
        service_status = "UNKNOWN"
        cpu_usage = 0.0
        memory_usage = 0.0
        disk_usage_max = 0.0
        containers_total = 0
        containers_running = 0
        issues_count = 0
        warnings_count = 0

        if resource_report:
            resource_status = resource_report.overall_status
            if resource_report.cpu:
                cpu_usage = resource_report.cpu.usage_percent
            if resource_report.memory:
                memory_usage = resource_report.memory.usage_percent
            if resource_report.disks:
                disk_usage_max = max(
                    (d.usage_percent for d in resource_report.disks), default=0.0
                )

        if service_report:
            service_status = service_report.overall_status
            containers_total = len(service_report.containers)
            containers_running = len(
                [c for c in service_report.containers if c.state == "running"]
            )
            issues_count = len(service_report.critical_issues)
            warnings_count = len(service_report.warnings)

        overall_status = self._determine_node_status(resource_status, service_status)

        return NodeSummary(
            node_name=node_name,
            host=node_config.host if node_config else "",
            role=node_config.role if node_config else "unknown",
            resource_status=resource_status,
            service_status=service_status,
            overall_status=overall_status,
            cpu_usage=cpu_usage,
            memory_usage=memory_usage,
            disk_usage_max=disk_usage_max,
            containers_total=containers_total,
            containers_running=containers_running,
            issues_count=issues_count,
            warnings_count=warnings_count,
        )

    def generate_cluster_summary(
        self,
        node_summaries: List[NodeSummary],
    ) -> ClusterSummary:
        """生成集群汇总

        Args:
            node_summaries: 节点汇总列表

        Returns:
            ClusterSummary 集群汇总对象
        """
        total_nodes = len(node_summaries)
        healthy_nodes = len([n for n in node_summaries if n.overall_status == "NORMAL"])
        warning_nodes = len([n for n in node_summaries if n.overall_status == "WARNING"])
        critical_nodes = len([n for n in node_summaries if n.overall_status == "CRITICAL"])
        unknown_nodes = len([n for n in node_summaries if n.overall_status == "UNKNOWN"])

        avg_cpu = (
            sum(n.cpu_usage for n in node_summaries) / total_nodes
            if total_nodes > 0
            else 0.0
        )
        avg_memory = (
            sum(n.memory_usage for n in node_summaries) / total_nodes
            if total_nodes > 0
            else 0.0
        )

        total_containers = sum(n.containers_total for n in node_summaries)
        running_containers = sum(n.containers_running for n in node_summaries)
        total_issues = sum(n.issues_count for n in node_summaries)
        total_warnings = sum(n.warnings_count for n in node_summaries)

        return ClusterSummary(
            cluster_name=self.cluster_name,
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            total_nodes=total_nodes,
            healthy_nodes=healthy_nodes,
            warning_nodes=warning_nodes,
            critical_nodes=critical_nodes,
            unknown_nodes=unknown_nodes,
            average_cpu_usage=avg_cpu,
            average_memory_usage=avg_memory,
            total_containers=total_containers,
            running_containers=running_containers,
            total_issues=total_issues,
            total_warnings=total_warnings,
            node_summaries=node_summaries,
        )

    def save_log(self, inspection_log: InspectionLog) -> str:
        """保存巡检日志到文件

        Args:
            inspection_log: 巡检日志对象

        Returns:
            保存的文件路径
        """
        log_dir = self.log_config.log_dir
        os.makedirs(log_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if self.log_config.separate_by_node:
            return self._save_separated_logs(inspection_log, log_dir, timestamp)
        else:
            return self._save_single_log(inspection_log, log_dir, timestamp)

    def _save_single_log(
        self, inspection_log: InspectionLog, log_dir: str, timestamp: str
    ) -> str:
        """保存单个日志文件"""
        if self.log_config.log_format == "json":
            filename = f"inspection_log_{timestamp}.json"
            filepath = os.path.join(log_dir, filename)
            data = inspection_log.to_dict()
            with io.open(filepath, "w", encoding=self.encoding) as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        else:
            filename = f"inspection_log_{timestamp}.txt"
            filepath = os.path.join(log_dir, filename)
            content = self._format_text_report(inspection_log)
            with io.open(filepath, "w", encoding=self.encoding) as f:
                f.write(content)

        logger.info(f"巡检日志已保存: {filepath}")
        return filepath

    def _save_separated_logs(
        self, inspection_log: InspectionLog, log_dir: str, timestamp: str
    ) -> str:
        """按节点分开保存日志"""
        summary_path = self._save_cluster_summary(
            inspection_log.cluster_summary, log_dir, timestamp
        )

        for node_name, report in inspection_log.resource_reports.items():
            safe_node_name = _safe_encode(node_name).replace("/", "_").replace("\\", "_")
            node_dir = os.path.join(log_dir, "nodes", safe_node_name)
            os.makedirs(node_dir, exist_ok=True)

            if self.log_config.log_format == "json":
                filepath = os.path.join(node_dir, f"resource_{timestamp}.json")
                data = _clean_dict_for_json(report.to_dict())
                with io.open(filepath, "w", encoding=self.encoding) as f:
                    json.dump(data, f, indent=2, ensure_ascii=False, default=str)
            else:
                filepath = os.path.join(node_dir, f"resource_{timestamp}.txt")
                content = self._format_resource_report(report)
                with io.open(filepath, "w", encoding=self.encoding) as f:
                    f.write(content)

        for node_name, report in inspection_log.service_reports.items():
            safe_node_name = _safe_encode(node_name).replace("/", "_").replace("\\", "_")
            node_dir = os.path.join(log_dir, "nodes", safe_node_name)
            os.makedirs(node_dir, exist_ok=True)

            if self.log_config.log_format == "json":
                filepath = os.path.join(node_dir, f"service_{timestamp}.json")
                data = _clean_dict_for_json(report.to_dict())
                with io.open(filepath, "w", encoding=self.encoding) as f:
                    json.dump(data, f, indent=2, ensure_ascii=False, default=str)
            else:
                filepath = os.path.join(node_dir, f"service_{timestamp}.txt")
                content = self._format_service_report(report)
                with io.open(filepath, "w", encoding=self.encoding) as f:
                    f.write(content)

        logger.info(f"巡检日志已保存到: {log_dir}")
        return summary_path

    def _save_cluster_summary(
        self, summary: ClusterSummary, log_dir: str, timestamp: str
    ) -> str:
        """保存集群汇总"""
        if self.log_config.log_format == "json":
            filepath = os.path.join(log_dir, f"cluster_summary_{timestamp}.json")
            data = _clean_dict_for_json(summary.to_dict())
            with io.open(filepath, "w", encoding=self.encoding) as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        else:
            filepath = os.path.join(log_dir, f"cluster_summary_{timestamp}.txt")
            content = self._format_cluster_summary(summary)
            with io.open(filepath, "w", encoding=self.encoding) as f:
                f.write(content)

        return filepath

    def _format_text_report(self, inspection_log: InspectionLog) -> str:
        """格式化文本报告"""
        lines = []
        lines.append("=" * 80)
        lines.append("容器集群资源水位巡检报告")
        lines.append("=" * 80)
        lines.append(f"报告时间: {inspection_log.timestamp}")
        lines.append(f"执行时长: {inspection_log.duration_seconds:.2f} 秒")
        lines.append(f"编码格式: {self.encoding}")
        lines.append("")

        lines.append(self._format_cluster_summary(inspection_log.cluster_summary))

        lines.append("\n" + "=" * 80)
        lines.append("节点资源详情")
        lines.append("=" * 80)
        for node_name, report in inspection_log.resource_reports.items():
            lines.append(f"\n--- {_safe_encode(node_name)} ---")
            lines.append(self._format_resource_report(report))

        lines.append("\n" + "=" * 80)
        lines.append("节点服务详情")
        lines.append("=" * 80)
        for node_name, report in inspection_log.service_reports.items():
            lines.append(f"\n--- {_safe_encode(node_name)} ---")
            lines.append(self._format_service_report(report))

        if inspection_log.errors:
            lines.append("\n" + "=" * 80)
            lines.append("错误信息")
            lines.append("=" * 80)
            for error in inspection_log.errors:
                lines.append(f"  - {_safe_encode(error)}")

        return _safe_encode("\n".join(lines))

    def _format_cluster_summary(self, summary: ClusterSummary) -> str:
        """格式化集群汇总"""
        lines = []
        lines.append(f"\n集群名称: {_safe_encode(summary.cluster_name)}")
        lines.append(f"汇总时间: {summary.timestamp}")
        lines.append("")
        lines.append("节点状态统计:")
        lines.append(f"  总节点数: {summary.total_nodes}")
        lines.append(f"  健康节点: {summary.healthy_nodes}")
        lines.append(f"  警告节点: {summary.warning_nodes}")
        lines.append(f"  严重节点: {summary.critical_nodes}")
        lines.append(f"  未知状态: {summary.unknown_nodes}")
        lines.append("")
        lines.append("资源使用概况:")
        lines.append(f"  平均 CPU 使用率: {summary.average_cpu_usage:.2f}%")
        lines.append(f"  平均内存使用率: {summary.average_memory_usage:.2f}%")
        lines.append(f"  容器总数: {summary.total_containers}")
        lines.append(f"  运行中容器: {summary.running_containers}")
        lines.append(f"  问题总数: {summary.total_issues}")
        lines.append(f"  警告总数: {summary.total_warnings}")

        if summary.node_summaries:
            lines.append("\n节点详情:")
            lines.append("-" * 60)
            for ns in summary.node_summaries:
                status_icon = {"NORMAL": "✓", "WARNING": "⚠", "CRITICAL": "✗", "UNKNOWN": "?"}.get(
                    ns.overall_status, "?"
                )
                lines.append(
                    f"  [{status_icon}] {_safe_encode(ns.node_name)} ({_safe_encode(ns.role)}) "
                    f"- CPU: {ns.cpu_usage:.1f}% | 内存: {ns.memory_usage:.1f}% | "
                    f"容器: {ns.containers_running}/{ns.containers_total} | "
                    f"状态: {ns.overall_status}"
                )

        return "\n".join(lines)

    def _format_resource_report(self, report: ResourceReport) -> str:
        """格式化资源报告"""
        lines = []

        if report.cpu:
            lines.append(f"  CPU 使用率: {report.cpu.usage_percent:.1f}% [{report.cpu.status.level}]")
            lines.append(f"  CPU 核心数: {report.cpu.cores}")
            lines.append(f"  用户态: {report.cpu.user_percent:.1f}% | 系统态: {report.cpu.system_percent:.1f}% | 空闲: {report.cpu.idle_percent:.1f}%")
            lines.append(f"  负载 (1/5/15min): {report.cpu.load_avg_1m}/{report.cpu.load_avg_5m}/{report.cpu.load_avg_15m}")

        if report.memory:
            lines.append(f"  内存使用率: {report.memory.usage_percent:.1f}% [{report.memory.status.level}]")
            lines.append(
                f"  内存使用: {report.memory.used_mb:.0f}MB / {report.memory.total_mb:.0f}MB "
                f"(缓存: {report.memory.buffers_mb + report.memory.cached_mb:.0f}MB)"
            )
            lines.append(f"  可用内存: {report.memory.available_mb:.0f}MB")
            if report.memory.swap_total_mb > 0:
                lines.append(
                    f"  Swap: {report.memory.swap_used_mb:.0f}MB / {report.memory.swap_total_mb:.0f}MB "
                    f"({report.memory.swap_usage_percent:.1f}%)"
                )

        if report.disks:
            lines.append("  磁盘使用:")
            for disk in report.disks:
                lines.append(
                    f"    {_safe_encode(disk.mount_point)} ({_safe_encode(disk.fstype)}): "
                    f"{disk.used_gb:.1f}GB / {disk.total_gb:.1f}GB "
                    f"({disk.usage_percent:.1f}%) [{disk.status.level}]"
                )
                if disk.inodes_total > 0:
                    lines.append(
                        f"      Inodes: {disk.inodes_used}/{disk.inodes_total} "
                        f"({disk.inodes_usage_percent:.1f}%)"
                    )

        if report.networks:
            lines.append("  网络接口:")
            for net in report.networks:
                rx_mb = net.rx_bytes / (1024 * 1024)
                tx_mb = net.tx_bytes / (1024 * 1024)
                lines.append(
                    f"    {_safe_encode(net.interface)} ({_safe_encode(net.ip_address)}): "
                    f"RX: {rx_mb:.2f}MB | TX: {tx_mb:.2f}MB"
                )
                if net.rx_errors > 0 or net.tx_errors > 0 or net.rx_dropped > 0 or net.tx_dropped > 0:
                    lines.append(
                        f"      错误: RX {net.rx_errors} TX {net.tx_errors} | "
                        f"丢包: RX {net.rx_dropped} TX {net.tx_dropped}"
                    )

        if report.error:
            lines.append(f"  错误: {_safe_encode(report.error)}")

        lines.append(f"  整体状态: {report.overall_status}")
        return "\n".join(lines)

    def _format_service_report(self, report: ServiceInspectionReport) -> str:
        """格式化服务报告"""
        lines = []

        if report.docker_status:
            ds = report.docker_status
            lines.append(f"  Docker 服务: {'运行中' if ds.service_running else '未运行'}")
            lines.append(f"  Docker 版本: {_safe_encode(ds.service_version)}")
            lines.append(
                f"  容器统计: {ds.containers_running}运行 / "
                f"{ds.containers_stopped}停止 / {ds.containers_total}总数"
            )
            if ds.disk_usage and ds.disk_usage != "N/A":
                lines.append(f"  磁盘使用: {_safe_encode(ds.disk_usage)}")

        if report.containers:
            lines.append(f"\n  容器列表 ({len(report.containers)}):")
            for container in report.containers:
                status_icon = {
                    "running": "●",
                    "exited": "○",
                    "paused": "⏸",
                }.get(container.state, "?")
                lines.append(
                    f"    {status_icon} {_safe_encode(container.name):30s} "
                    f"[{_safe_encode(container.state):10s}] "
                    f"重启: {container.restart_count}次"
                )

        if report.system_services:
            lines.append(f"\n  系统服务:")
            for svc in report.system_services:
                status = "运行中" if svc.active else "未运行"
                lines.append(
                    f"    {_safe_encode(svc.service_name):20s}: {status} "
                    f"({_safe_encode(svc.sub_status)})"
                )

        if report.abnormal_containers:
            lines.append(f"\n  异常容器 ({len(report.abnormal_containers)}):")
            for abnormal in report.abnormal_containers:
                lines.append(f"    ⚠ {_safe_encode(abnormal)}")

        if report.critical_issues:
            lines.append(f"\n  严重问题 ({len(report.critical_issues)}):")
            for issue in report.critical_issues:
                lines.append(f"    ✗ {_safe_encode(issue)}")

        if report.warnings:
            lines.append(f"\n  警告信息 ({len(report.warnings)}):")
            for warning in report.warnings:
                lines.append(f"    ⚠ {_safe_encode(warning)}")

        lines.append(f"\n  整体状态: {report.overall_status}")
        return "\n".join(lines)

    def _determine_node_status(self, resource_status: str, service_status: str) -> str:
        """确定节点整体状态"""
        statuses = [resource_status, service_status]
        if "CRITICAL" in statuses:
            return "CRITICAL"
        elif "WARNING" in statuses:
            return "WARNING"
        elif "UNKNOWN" in statuses:
            return "UNKNOWN"
        else:
            return "NORMAL"

    def print_summary(self, inspection_log: InspectionLog):
        """打印汇总信息到控制台"""
        try:
            print("\n" + "=" * 80)
            print("容器集群资源水位巡检汇总")
            print("=" * 80)
            print(f"报告时间: {inspection_log.timestamp}")
            print(f"执行时长: {inspection_log.duration_seconds:.2f} 秒")
            print(self._format_cluster_summary(inspection_log.cluster_summary))

            if inspection_log.errors:
                print(f"\n执行过程中的错误 ({len(inspection_log.errors)}):")
                for error in inspection_log.errors:
                    print(f"  - {_safe_encode(error)}")

            print("=" * 80)
        except Exception as e:
            logger.warning(f"打印汇总信息时出现编码问题: {e}")
            try:
                encoded = _safe_encode(self._format_cluster_summary(inspection_log.cluster_summary))
                print(encoded)
            except Exception:
                print("无法显示汇总信息，请查看日志文件")
