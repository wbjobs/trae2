import os
import sys
import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from tabulate import tabulate
from colorama import Fore, Style, init
from rich.console import Console
from rich.table import Table as RichTable
from rich.panel import Panel
from rich.text import Text

init(autoreset=True)
logger = logging.getLogger(__name__)


class LogAggregator:
    STATUS_COLORS = {
        "NORMAL": Fore.GREEN,
        "WARNING": Fore.YELLOW,
        "CRITICAL": Fore.RED,
        "UNKNOWN": Fore.MAGENTA,
    }

    RICH_STATUS_COLORS = {
        "NORMAL": "green",
        "WARNING": "yellow",
        "CRITICAL": "red",
        "UNKNOWN": "magenta",
    }

    DEFAULT_ENCODING = "utf-8"

    def __init__(
        self,
        output_format: str = "table",
        log_dir: Optional[str] = None,
        encoding: Optional[str] = None,
    ):
        self.output_format = output_format
        self.log_dir = log_dir or os.path.join(os.getcwd(), "inspection_logs")
        self.encoding = encoding or self.DEFAULT_ENCODING
        self.console = Console()
        os.makedirs(self.log_dir, exist_ok=True)
        self._setup_console_encoding()

    def _setup_console_encoding(self) -> None:
        if sys.platform.startswith("win"):
            try:
                import locale
                locale.setlocale(locale.LC_ALL, "")
            except:
                pass
            if hasattr(sys.stdout, "reconfigure"):
                try:
                    sys.stdout.reconfigure(encoding=self.encoding)
                except:
                    pass

    @classmethod
    def _clean_text(cls, text: Any) -> str:
        if text is None:
            return ""
        text_str = str(text)
        text_str = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text_str)
        text_str = text_str.replace("\r\n", "\n").replace("\r", "\n")
        return text_str

    @classmethod
    def _clean_dict(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: cls._clean_dict(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [cls._clean_dict(item) for item in data]
        elif isinstance(data, str):
            return cls._clean_text(data)
        else:
            return data

    def _get_color(self, status: str) -> str:
        return self.STATUS_COLORS.get(status.upper(), Fore.WHITE)

    def _get_rich_color(self, status: str) -> str:
        return self.RICH_STATUS_COLORS.get(status.upper(), "white")

    def format_resource_results(
        self, resource_data: Dict[str, Any], use_color: bool = True
    ) -> str:
        nodes = resource_data.get("nodes", [])
        timestamp = resource_data.get("timestamp", "")

        headers = [
            "节点名称",
            "IP 地址",
            "角色",
            "CPU 使用率",
            "CPU 状态",
            "内存使用率",
            "内存状态",
            "磁盘使用率",
            "磁盘状态",
        ]
        rows = []

        for node in nodes:
            cpu_usage = node.get("cpu", {}).get("cpu_usage", 0.0)
            cpu_status = node.get("cpu", {}).get("status", "UNKNOWN")
            mem_usage = node.get("memory", {}).get("memory_usage", 0.0)
            mem_status = node.get("memory", {}).get("status", "UNKNOWN")

            disk_info = node.get("disk", {})
            disk_usages = [d.get("usage", 0) for d in disk_info.get("disks", [])]
            max_disk_usage = max(disk_usages) if disk_usages else 0.0
            disk_status = (
                max(d.get("status", "UNKNOWN") for d in disk_info.get("disks", []))
                if disk_info.get("disks")
                else "UNKNOWN"
            )

            row = [
                node.get("node_name", ""),
                node.get("node", ""),
                node.get("role", ""),
                f"{cpu_usage:.2f}%",
                cpu_status,
                f"{mem_usage:.2f}%",
                mem_status,
                f"{max_disk_usage:.2f}%",
                disk_status,
            ]

            if use_color:
                for i, field in enumerate(row):
                    if isinstance(field, str) and field in self.STATUS_COLORS:
                        row[i] = f"{self._get_color(field)}{field}{Style.RESET_ALL}"

            rows.append(row)

        output = f"\n{'='*60}\n"
        output += f"集群节点资源巡检报告 - {timestamp}\n"
        output += f"{'='*60}\n\n"
        output += tabulate(rows, headers=headers, tablefmt="grid")
        output += "\n"

        output += self._format_disk_details(nodes, use_color)
        output += self._format_resource_summary(nodes, use_color)

        return output

    def _format_disk_details(
        self, nodes: List[Dict[str, Any]], use_color: bool
    ) -> str:
        output = f"\n{'='*60}\n"
        output += "磁盘详细信息\n"
        output += f"{'='*60}\n\n"

        headers = ["节点名称", "挂载点", "使用率", "总容量", "已使用", "状态"]
        rows = []

        for node in nodes:
            node_name = node.get("node_name", node.get("node", ""))
            disk_info = node.get("disk", {})
            for disk in disk_info.get("disks", []):
                status = disk.get("status", "UNKNOWN")
                row = [
                    node_name,
                    disk.get("mount_point", ""),
                    f"{disk.get('usage', 0):.2f}%",
                    disk.get("total", ""),
                    disk.get("used", ""),
                    status,
                ]
                if use_color:
                    row[5] = f"{self._get_color(status)}{status}{Style.RESET_ALL}"
                rows.append(row)

        if rows:
            output += tabulate(rows, headers=headers, tablefmt="grid")
            output += "\n"
        return output

    def _format_resource_summary(
        self, nodes: List[Dict[str, Any]], use_color: bool
    ) -> str:
        output = f"\n{'='*60}\n"
        output += "资源状态汇总\n"
        output += f"{'='*60}\n\n"

        summary = {
            "CPU": {"NORMAL": 0, "WARNING": 0, "CRITICAL": 0, "UNKNOWN": 0},
            "内存": {"NORMAL": 0, "WARNING": 0, "CRITICAL": 0, "UNKNOWN": 0},
            "磁盘": {"NORMAL": 0, "WARNING": 0, "CRITICAL": 0, "UNKNOWN": 0},
        }

        for node in nodes:
            cpu_status = node.get("cpu", {}).get("status", "UNKNOWN")
            mem_status = node.get("memory", {}).get("status", "UNKNOWN")
            disk_info = node.get("disk", {})
            disk_status = (
                max(
                    (d.get("status", "UNKNOWN") for d in disk_info.get("disks", [])),
                    default="UNKNOWN",
                )
                if disk_info.get("disks")
                else "UNKNOWN"
            )

            summary["CPU"][cpu_status] = summary["CPU"].get(cpu_status, 0) + 1
            summary["内存"][mem_status] = summary["内存"].get(mem_status, 0) + 1
            summary["磁盘"][disk_status] = summary["磁盘"].get(disk_status, 0) + 1

        headers = ["资源类型", "正常", "警告", "严重", "未知"]
        rows = []
        for resource, counts in summary.items():
            row = [
                resource,
                counts.get("NORMAL", 0),
                counts.get("WARNING", 0),
                counts.get("CRITICAL", 0),
                counts.get("UNKNOWN", 0),
            ]
            if use_color:
                for i in range(1, 5):
                    status = headers[i].upper() if headers[i] != "严重" else "CRITICAL"
                    status_map = {"正常": "NORMAL", "警告": "WARNING", "严重": "CRITICAL", "未知": "UNKNOWN"}
                    status_key = status_map.get(headers[i], "UNKNOWN")
                    row[i] = f"{self._get_color(status_key)}{row[i]}{Style.RESET_ALL}"
            rows.append(row)

        output += tabulate(rows, headers=headers, tablefmt="grid")
        output += "\n"
        return output

    def format_pod_results(
        self, pod_data: Dict[str, Any], use_color: bool = True
    ) -> str:
        pods = pod_data.get("pods", [])
        summary = pod_data.get("summary", {})
        timestamp = pod_data.get("timestamp", "")

        output = f"\n{'='*60}\n"
        output += f"Pod 状态巡检报告 - {timestamp}\n"
        output += f"{'='*60}\n\n"

        output += self._format_pod_summary(summary, use_color)

        headers = [
            "命名空间",
            "Pod 名称",
            "节点",
            "Phase",
            "重启次数",
            "Ready",
            "状态",
        ]
        rows = []

        for pod in pods:
            status = pod.get("status", "UNKNOWN")
            ready = "✓" if pod.get("ready") else "✗"
            row = [
                pod.get("namespace", ""),
                pod.get("name", ""),
                pod.get("node_name", ""),
                pod.get("phase", ""),
                pod.get("restart_count", 0),
                ready,
                status,
            ]
            if use_color:
                row[6] = f"{self._get_color(status)}{status}{Style.RESET_ALL}"
            rows.append(row)

        output += f"\n{'='*60}\n"
        output += "Pod 详细列表\n"
        output += f"{'='*60}\n\n"

        if rows:
            output += tabulate(rows, headers=headers, tablefmt="grid")
            output += "\n"
        else:
            output += "无异常 Pod\n\n"

        return output

    def _format_pod_summary(
        self, summary: Dict[str, Any], use_color: bool
    ) -> str:
        output = ""

        total = summary.get("total", 0)
        normal = summary.get("normal", 0)
        warning = summary.get("warning", 0)
        critical = summary.get("critical", 0)
        unknown = summary.get("unknown", 0)

        headers = ["总计", "正常", "警告", "严重", "未知"]
        row = [total, normal, warning, critical, unknown]

        if use_color:
            for i in range(1, 5):
                status_map = {"正常": "NORMAL", "警告": "WARNING", "严重": "CRITICAL", "未知": "UNKNOWN"}
                status_key = status_map.get(headers[i], "UNKNOWN")
                row[i] = f"{self._get_color(status_key)}{row[i]}{Style.RESET_ALL}"

        output += tabulate([row], headers=headers, tablefmt="grid")
        output += "\n"

        by_namespace = summary.get("by_namespace", {})
        if by_namespace:
            output += f"\n{'='*40}\n"
            output += "按命名空间统计\n"
            output += f"{'='*40}\n\n"
            headers = ["命名空间", "总计", "正常", "警告", "严重"]
            rows = []
            for ns, counts in by_namespace.items():
                rows.append(
                    [
                        ns,
                        counts.get("total", 0),
                        counts.get("normal", 0),
                        counts.get("warning", 0),
                        counts.get("critical", 0),
                    ]
                )
            output += tabulate(rows, headers=headers, tablefmt="grid")
            output += "\n"

        return output

    def format_rich_resource_results(self, resource_data: Dict[str, Any]) -> None:
        nodes = resource_data.get("nodes", [])
        timestamp = resource_data.get("timestamp", "")

        title = Text(f"集群节点资源巡检报告 - {timestamp}", style="bold cyan")
        self.console.print(Panel(title))

        table = RichTable(show_header=True, header_style="bold magenta")
        table.add_column("节点名称", style="dim")
        table.add_column("IP 地址")
        table.add_column("角色")
        table.add_column("CPU 使用率", justify="right")
        table.add_column("CPU 状态")
        table.add_column("内存使用率", justify="right")
        table.add_column("内存状态")
        table.add_column("磁盘使用率", justify="right")
        table.add_column("磁盘状态")

        for node in nodes:
            cpu_usage = node.get("cpu", {}).get("cpu_usage", 0.0)
            cpu_status = node.get("cpu", {}).get("status", "UNKNOWN")
            mem_usage = node.get("memory", {}).get("memory_usage", 0.0)
            mem_status = node.get("memory", {}).get("status", "UNKNOWN")

            disk_info = node.get("disk", {})
            disk_usages = [d.get("usage", 0) for d in disk_info.get("disks", [])]
            max_disk_usage = max(disk_usages) if disk_usages else 0.0
            disk_status = (
                max(d.get("status", "UNKNOWN") for d in disk_info.get("disks", []))
                if disk_info.get("disks")
                else "UNKNOWN"
            )

            table.add_row(
                node.get("node_name", ""),
                node.get("node", ""),
                node.get("role", ""),
                f"{cpu_usage:.2f}%",
                Text(cpu_status, style=self._get_rich_color(cpu_status)),
                f"{mem_usage:.2f}%",
                Text(mem_status, style=self._get_rich_color(mem_status)),
                f"{max_disk_usage:.2f}%",
                Text(disk_status, style=self._get_rich_color(disk_status)),
            )

        self.console.print(table)

    def save_to_file(
        self, data: Dict[str, Any], prefix: str = "inspection"
    ) -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{prefix}_{timestamp}.json"
        filepath = os.path.join(self.log_dir, filename)

        cleaned_data = self._clean_dict(data)

        with open(filepath, "w", encoding=self.encoding, errors="replace") as f:
            json.dump(cleaned_data, f, ensure_ascii=False, indent=2)

        logger.info(f"巡检日志已保存到: {filepath}")
        return filepath

    def save_text_report(
        self, report: str, prefix: str = "report"
    ) -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{prefix}_{timestamp}.txt"
        filepath = os.path.join(self.log_dir, filename)

        cleaned_report = self._clean_text(report)

        with open(filepath, "w", encoding=self.encoding, errors="replace") as f:
            f.write(cleaned_report)

        logger.info(f"文本报告已保存到: {filepath}")
        return filepath

    def generate_full_report(
        self,
        resource_data: Optional[Dict[str, Any]] = None,
        pod_data: Optional[Dict[str, Any]] = None,
        save_to_file: bool = True,
    ) -> str:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        report = f"\n{'#'*80}\n"
        report += f"# K8s 集群节点资源水位巡检完整报告\n"
        report += f"# 生成时间: {timestamp}\n"
        report += f"{'#'*80}\n"

        if resource_data:
            report += "\n" + "=" * 80 + "\n"
            report += "一、节点资源巡检\n"
            report += "=" * 80 + "\n"
            report += self.format_resource_results(resource_data, use_color=False)

        if pod_data:
            report += "\n" + "=" * 80 + "\n"
            report += "二、Pod 状态巡检\n"
            report += "=" * 80 + "\n"
            report += self.format_pod_results(pod_data, use_color=False)

        if save_to_file:
            full_data = {
                "timestamp": timestamp,
                "resource_inspection": resource_data,
                "pod_inspection": pod_data,
            }
            filepath = self.save_to_file(full_data, prefix="full_report")
            report += f"\n\n完整报告已保存到: {filepath}\n"

        return report

    def print_summary(
        self,
        resource_data: Optional[Dict[str, Any]] = None,
        pod_data: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.console.print("\n")
        title = Text("巡检完成！汇总信息如下", style="bold green")
        self.console.print(Panel(title))

        if resource_data:
            nodes = resource_data.get("nodes", [])
            cpu_issues = sum(
                1 for n in nodes
                if n.get("cpu", {}).get("status") in ["WARNING", "CRITICAL"]
            )
            mem_issues = sum(
                1 for n in nodes
                if n.get("memory", {}).get("status") in ["WARNING", "CRITICAL"]
            )
            disk_issues = sum(
                1 for n in nodes
                if any(
                    d.get("status") in ["WARNING", "CRITICAL"]
                    for d in n.get("disk", {}).get("disks", [])
                )
            )

            table = RichTable(title="节点资源", show_header=True, header_style="bold blue")
            table.add_column("检查项")
            table.add_column("节点数", justify="right")
            table.add_column("异常数", justify="right")
            table.add_row("CPU", str(len(nodes)), str(cpu_issues))
            table.add_row("内存", str(len(nodes)), str(mem_issues))
            table.add_row("磁盘", str(len(nodes)), str(disk_issues))
            self.console.print(table)

        if pod_data:
            summary = pod_data.get("summary", {})
            table = RichTable(title="Pod 状态", show_header=True, header_style="bold blue")
            table.add_column("状态")
            table.add_column("数量", justify="right")
            table.add_row("总计", str(summary.get("total", 0)))
            table.add_row(
                Text("正常", style="green"), str(summary.get("normal", 0))
            )
            table.add_row(
                Text("警告", style="yellow"), str(summary.get("warning", 0))
            )
            table.add_row(
                Text("严重", style="red"), str(summary.get("critical", 0))
            )
            self.console.print(table)
