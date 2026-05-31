"""
容器资源检测模块
Container Resource Checker Module

负责检测集群节点的 CPU、内存、磁盘等资源水位。
"""

import re
import os
import json
import time
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime

from communicator import ClusterCommunicator, CommandResult

logger = logging.getLogger(__name__)


@dataclass
class ResourceStatus:
    """资源状态"""
    level: str
    value: float
    warning_threshold: float
    critical_threshold: float

    def __post_init__(self):
        if self.value >= self.critical_threshold:
            self.level = "CRITICAL"
        elif self.value >= self.warning_threshold:
            self.level = "WARNING"
        else:
            self.level = "NORMAL"


@dataclass
class CPUInfo:
    """CPU 信息"""
    node_name: str
    usage_percent: float
    cores: int
    load_avg_1m: float
    load_avg_5m: float
    load_avg_15m: float
    user_percent: float
    system_percent: float
    idle_percent: float
    wait_percent: float
    status: ResourceStatus

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "usage_percent": round(self.usage_percent, 2),
            "cores": self.cores,
            "load_avg_1m": self.load_avg_1m,
            "load_avg_5m": self.load_avg_5m,
            "load_avg_15m": self.load_avg_15m,
            "user_percent": round(self.user_percent, 2),
            "system_percent": round(self.system_percent, 2),
            "idle_percent": round(self.idle_percent, 2),
            "wait_percent": round(self.wait_percent, 2),
            "status": self.status.level,
        }


@dataclass
class MemoryInfo:
    """内存信息"""
    node_name: str
    total_mb: float
    used_mb: float
    free_mb: float
    available_mb: float
    buffers_mb: float
    cached_mb: float
    usage_percent: float
    swap_total_mb: float
    swap_used_mb: float
    swap_free_mb: float
    swap_usage_percent: float
    status: ResourceStatus

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "total_mb": round(self.total_mb, 2),
            "used_mb": round(self.used_mb, 2),
            "free_mb": round(self.free_mb, 2),
            "available_mb": round(self.available_mb, 2),
            "buffers_mb": round(self.buffers_mb, 2),
            "cached_mb": round(self.cached_mb, 2),
            "usage_percent": round(self.usage_percent, 2),
            "swap_total_mb": round(self.swap_total_mb, 2),
            "swap_used_mb": round(self.swap_used_mb, 2),
            "swap_free_mb": round(self.swap_free_mb, 2),
            "swap_usage_percent": round(self.swap_usage_percent, 2),
            "status": self.status.level,
        }


@dataclass
class DiskInfo:
    """磁盘信息"""
    node_name: str
    filesystem: str
    fstype: str
    mount_point: str
    total_gb: float
    used_gb: float
    available_gb: float
    usage_percent: float
    inodes_total: int
    inodes_used: int
    inodes_available: int
    inodes_usage_percent: float
    status: ResourceStatus

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "filesystem": self.filesystem,
            "fstype": self.fstype,
            "mount_point": self.mount_point,
            "total_gb": round(self.total_gb, 2),
            "used_gb": round(self.used_gb, 2),
            "available_gb": round(self.available_gb, 2),
            "usage_percent": round(self.usage_percent, 2),
            "inodes_total": self.inodes_total,
            "inodes_used": self.inodes_used,
            "inodes_available": self.inodes_available,
            "inodes_usage_percent": round(self.inodes_usage_percent, 2),
            "status": self.status.level,
        }


@dataclass
class NetworkInfo:
    """网络信息"""
    node_name: str
    interface: str
    ip_address: str
    rx_bytes: int
    tx_bytes: int
    rx_packets: int
    tx_packets: int
    rx_errors: int
    tx_errors: int
    rx_dropped: int
    tx_dropped: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "interface": self.interface,
            "ip_address": self.ip_address,
            "rx_bytes": self.rx_bytes,
            "tx_bytes": self.tx_bytes,
            "rx_packets": self.rx_packets,
            "tx_packets": self.tx_packets,
            "rx_errors": self.rx_errors,
            "tx_errors": self.tx_errors,
            "rx_dropped": self.rx_dropped,
            "tx_dropped": self.tx_dropped,
        }


@dataclass
class ResourceReport:
    """资源检测报告"""
    node_name: str
    timestamp: str
    cpu: Optional[CPUInfo] = None
    memory: Optional[MemoryInfo] = None
    disks: List[DiskInfo] = field(default_factory=list)
    networks: List[NetworkInfo] = field(default_factory=list)
    overall_status: str = "NORMAL"
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "timestamp": self.timestamp,
            "cpu": self.cpu.to_dict() if self.cpu else None,
            "memory": self.memory.to_dict() if self.memory else None,
            "disks": [d.to_dict() for d in self.disks],
            "networks": [n.to_dict() for n in self.networks],
            "overall_status": self.overall_status,
            "error": self.error,
        }


class ResourceChecker:
    """资源检测器"""

    DISABLED_FS_TYPES = {
        "tmpfs", "devtmpfs", "sysfs", "proc", "cgroup",
        "cgroup2", "pstore", "efivarfs", "bpf", "mqueue",
        "hugetlbfs", "debugfs", "tracefs", "securityfs",
        "binfmt_misc", "autofs", "fuse", "fuse.gvfsd-fuse",
        "overlay", "nsfs", "rpc_pipefs",
    }

    def __init__(self, communicator: ClusterCommunicator, thresholds: dict):
        self.communicator = communicator
        self.thresholds = thresholds

    def check_cpu(self, node_names: List[str]) -> Dict[str, Optional[CPUInfo]]:
        """检测 CPU 使用率（使用 /proc/stat 两次采样，准确率更高）

        Args:
            node_names: 节点名称列表

        Returns:
            节点名称到 CPU 信息的映射
        """
        results: Dict[str, Optional[CPUInfo]] = {}

        stat_command = "cat /proc/stat | grep '^cpu ' ; nproc ; cat /proc/loadavg"

        first_sample = self.communicator.execute_on_nodes(node_names, stat_command)
        time.sleep(1)
        second_sample = self.communicator.execute_on_nodes(node_names, stat_command)

        for node_name in node_names:
            first = first_sample.get(node_name)
            second = second_sample.get(node_name)

            if first is None or second is None or not first.success or not second.success:
                results[node_name] = None
                continue

            try:
                cpu_info = self._parse_cpu_output_accurate(
                    node_name, first.stdout, second.stdout
                )
                results[node_name] = cpu_info
            except Exception as e:
                logger.error(f"解析节点 {node_name} CPU 信息失败: {e}")
                results[node_name] = None

        return results

    def check_memory(self, node_names: List[str]) -> Dict[str, Optional[MemoryInfo]]:
        """检测内存使用率（使用 /proc/meminfo，更准确）

        Args:
            node_names: 节点名称列表

        Returns:
            节点名称到内存信息的映射
        """
        results: Dict[str, Optional[MemoryInfo]] = {}
        command = "cat /proc/meminfo"

        command_results = self.communicator.execute_on_nodes(node_names, command)

        for node_name, result in command_results.items():
            if result is None or not result.success:
                results[node_name] = None
                continue

            try:
                memory_info = self._parse_meminfo_output(node_name, result.stdout)
                results[node_name] = memory_info
            except Exception as e:
                logger.error(f"解析节点 {node_name} 内存信息失败: {e}")
                results[node_name] = None

        return results

    def check_disk(self, node_names: List[str]) -> Dict[str, List[DiskInfo]]:
        """检测磁盘使用率（排除虚拟文件系统）

        Args:
            node_names: 节点名称列表

        Returns:
            节点名称到磁盘信息列表的映射
        """
        results: Dict[str, List[DiskInfo]] = {}

        disk_command = (
            "df -PkT --exclude-type=tmpfs --exclude-type=devtmpfs "
            "--exclude-type=sysfs --exclude-type=proc --exclude-type=cgroup "
            "--exclude-type=cgroup2 --exclude-type=pstore --exclude-type=efivarfs "
            "--exclude-type=bpf --exclude-type=mqueue --exclude-type=hugetlbfs "
            "--exclude-type=debugfs --exclude-type=tracefs --exclude-type=securityfs "
            "--exclude-type=binfmt_misc --exclude-type=autofs --exclude-type=fuse "
            "--exclude-type=overlay --exclude-type=nsfs --exclude-type=rpc_pipefs "
            "2>/dev/null"
        )
        inodes_command = (
            "df -PiT --exclude-type=tmpfs --exclude-type=devtmpfs "
            "--exclude-type=sysfs --exclude-type=proc --exclude-type=cgroup "
            "--exclude-type=cgroup2 --exclude-type=pstore --exclude-type=efivarfs "
            "--exclude-type=bpf --exclude-type=mqueue --exclude-type=hugetlbfs "
            "--exclude-type=debugfs --exclude-type=tracefs --exclude-type=securityfs "
            "--exclude-type=binfmt_misc --exclude-type=autofs --exclude-type=fuse "
            "--exclude-type=overlay --exclude-type=nsfs --exclude-type=rpc_pipefs "
            "2>/dev/null"
        )

        disk_results = self.communicator.execute_on_nodes(node_names, disk_command)
        inodes_results = self.communicator.execute_on_nodes(node_names, inodes_command)

        for node_name in node_names:
            disk_result = disk_results.get(node_name)
            inodes_result = inodes_results.get(node_name)

            if disk_result is None or not disk_result.success:
                results[node_name] = []
                continue

            try:
                disk_infos = self._parse_disk_output_accurate(
                    node_name,
                    disk_result.stdout,
                    inodes_result.stdout if inodes_result and inodes_result.success else "",
                )
                results[node_name] = disk_infos
            except Exception as e:
                logger.error(f"解析节点 {node_name} 磁盘信息失败: {e}")
                results[node_name] = []

        return results

    def check_network(self, node_names: List[str]) -> Dict[str, List[NetworkInfo]]:
        """检测网络信息

        Args:
            node_names: 节点名称列表

        Returns:
            节点名称到网络信息列表的映射
        """
        results: Dict[str, List[NetworkInfo]] = {}

        command = (
            "echo '===NET_DEV===' && cat /proc/net/dev && "
            "echo '===IP_ADDR===' && ip -4 addr show 2>/dev/null || ifconfig 2>/dev/null"
        )

        command_results = self.communicator.execute_on_nodes(node_names, command)

        for node_name, result in command_results.items():
            if result is None or not result.success:
                results[node_name] = []
                continue

            try:
                network_infos = self._parse_network_output_accurate(
                    node_name, result.stdout
                )
                results[node_name] = network_infos
            except Exception as e:
                logger.error(f"解析节点 {node_name} 网络信息失败: {e}")
                results[node_name] = []

        return results

    def check_all_resources(
        self, node_names: List[str], check_type: str = "all"
    ) -> Dict[str, ResourceReport]:
        """检测所有资源

        Args:
            node_names: 节点名称列表
            check_type: 检测类型 (cpu, memory, disk, network, all)

        Returns:
            节点名称到资源报告的映射
        """
        reports: Dict[str, ResourceReport] = {}
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        check_cpu_flag = check_type in ("all", "cpu")
        check_memory_flag = check_type in ("all", "memory")
        check_disk_flag = check_type in ("all", "disk")
        check_network_flag = check_type in ("all", "network")

        if check_cpu_flag:
            cpu_results = self.check_cpu(node_names)
        if check_memory_flag:
            memory_results = self.check_memory(node_names)
        if check_disk_flag:
            disk_results = self.check_disk(node_names)
        if check_network_flag:
            network_results = self.check_network(node_names)

        for node_name in node_names:
            report = ResourceReport(
                node_name=node_name,
                timestamp=timestamp,
            )

            errors = []
            if check_cpu_flag:
                cpu = cpu_results.get(node_name)
                report.cpu = cpu
                if cpu is None:
                    errors.append("CPU 检测失败")
            if check_memory_flag:
                memory = memory_results.get(node_name)
                report.memory = memory
                if memory is None:
                    errors.append("内存检测失败")
            if check_disk_flag:
                report.disks = disk_results.get(node_name, [])
            if check_network_flag:
                report.networks = network_results.get(node_name, [])

            if errors:
                report.error = "; ".join(errors)

            report.overall_status = self._determine_overall_status(report)
            reports[node_name] = report

        return reports

    def _parse_cpu_output_accurate(
        self, node_name: str, first_output: str, second_output: str
    ) -> CPUInfo:
        """使用两次 /proc/stat 采样解析 CPU 使用率（更准确）"""
        def parse_stat_line(line: str) -> List[int]:
            parts = line.split()
            return [int(p) for p in parts[1:8]]

        def parse_loadavg(line: str) -> List[float]:
            parts = line.split()
            return [float(p) for p in parts[:3]]

        first_lines = first_output.strip().split("\n")
        second_lines = second_output.strip().split("\n")

        first_cpu_line = None
        second_cpu_line = None
        cores_line = None
        loadavg_line = None

        for line in first_lines:
            if line.startswith("cpu "):
                first_cpu_line = line
            elif line.strip().isdigit():
                cores_line = line

        for line in second_lines:
            if line.startswith("cpu "):
                second_cpu_line = line
            elif re.match(r"^\d+\.\d+\s+\d+\.\d+\s+\d+\.\d+", line):
                loadavg_line = line

        if not first_cpu_line or not second_cpu_line:
            raise ValueError("无法获取 CPU 统计信息")

        first_stats = parse_stat_line(first_cpu_line)
        second_stats = parse_stat_line(second_cpu_line)

        first_total = sum(first_stats)
        second_total = sum(second_stats)

        total_diff = second_total - first_total
        user_diff = second_stats[0] - first_stats[0]
        nice_diff = second_stats[1] - first_stats[1]
        system_diff = second_stats[2] - first_stats[2]
        idle_diff = second_stats[3] - first_stats[3]
        iowait_diff = second_stats[4] - first_stats[4]

        if total_diff <= 0:
            total_diff = 1

        user_percent = (user_diff + nice_diff) / total_diff * 100
        system_percent = system_diff / total_diff * 100
        idle_percent = idle_diff / total_diff * 100
        wait_percent = iowait_diff / total_diff * 100
        usage_percent = 100 - idle_percent

        cores = 0
        if cores_line:
            try:
                cores = int(cores_line.strip())
            except ValueError:
                cores = 0

        load_1m, load_5m, load_15m = 0.0, 0.0, 0.0
        if loadavg_line:
            try:
                loads = parse_loadavg(loadavg_line)
                load_1m, load_5m, load_15m = loads[0], loads[1], loads[2]
            except Exception:
                pass

        status = ResourceStatus(
            level="NORMAL",
            value=usage_percent,
            warning_threshold=self.thresholds.get("cpu_warning", 70),
            critical_threshold=self.thresholds.get("cpu_critical", 90),
        )

        return CPUInfo(
            node_name=node_name,
            usage_percent=usage_percent,
            cores=cores,
            load_avg_1m=load_1m,
            load_avg_5m=load_5m,
            load_avg_15m=load_15m,
            user_percent=user_percent,
            system_percent=system_percent,
            idle_percent=idle_percent,
            wait_percent=wait_percent,
            status=status,
        )

    def _parse_meminfo_output(self, node_name: str, output: str) -> MemoryInfo:
        """解析 /proc/meminfo 输出（更准确）"""
        meminfo = {}
        for line in output.strip().split("\n"):
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip()
                value = value.strip().split()[0] if value.strip() else "0"
                try:
                    meminfo[key] = float(value)
                except ValueError:
                    meminfo[key] = 0.0

        total_kb = meminfo.get("MemTotal", 0)
        free_kb = meminfo.get("MemFree", 0)
        buffers_kb = meminfo.get("Buffers", 0)
        cached_kb = meminfo.get("Cached", 0)
        available_kb = meminfo.get("MemAvailable", 0)

        if available_kb == 0:
            available_kb = free_kb + buffers_kb + cached_kb

        used_kb = total_kb - free_kb - buffers_kb - cached_kb
        if used_kb < 0:
            used_kb = total_kb - available_kb

        total_mb = total_kb / 1024.0
        used_mb = used_kb / 1024.0
        free_mb = free_kb / 1024.0
        available_mb = available_kb / 1024.0
        buffers_mb = buffers_kb / 1024.0
        cached_mb = cached_kb / 1024.0

        usage_percent = (used_mb / total_mb * 100) if total_mb > 0 else 0.0

        swap_total_kb = meminfo.get("SwapTotal", 0)
        swap_free_kb = meminfo.get("SwapFree", 0)
        swap_used_kb = swap_total_kb - swap_free_kb

        swap_total_mb = swap_total_kb / 1024.0
        swap_used_mb = swap_used_kb / 1024.0
        swap_free_mb = swap_free_kb / 1024.0
        swap_usage_percent = (
            swap_used_mb / swap_total_mb * 100
        ) if swap_total_mb > 0 else 0.0

        status = ResourceStatus(
            level="NORMAL",
            value=usage_percent,
            warning_threshold=self.thresholds.get("memory_warning", 75),
            critical_threshold=self.thresholds.get("memory_critical", 90),
        )

        return MemoryInfo(
            node_name=node_name,
            total_mb=total_mb,
            used_mb=used_mb,
            free_mb=free_mb,
            available_mb=available_mb,
            buffers_mb=buffers_mb,
            cached_mb=cached_mb,
            usage_percent=usage_percent,
            swap_total_mb=swap_total_mb,
            swap_used_mb=swap_used_mb,
            swap_free_mb=swap_free_mb,
            swap_usage_percent=swap_usage_percent,
            status=status,
        )

    def _parse_disk_output_accurate(
        self, node_name: str, disk_output: str, inodes_output: str
    ) -> List[DiskInfo]:
        """解析磁盘输出（排除虚拟文件系统，使用 KB 单位更准确）"""
        disk_infos = []

        disk_data = {}
        disk_lines = disk_output.strip().split("\n")
        if len(disk_lines) <= 1:
            return disk_infos

        for line in disk_lines[1:]:
            parts = line.split()
            if len(parts) < 7:
                continue

            filesystem = parts[0]
            fstype = parts[1]
            try:
                total_kb = float(parts[2])
                used_kb = float(parts[3])
                available_kb = float(parts[4])
                usage_percent = float(parts[5].replace("%", ""))
                mount_point = parts[6]
            except (ValueError, IndexError):
                continue

            if total_kb <= 0:
                continue

            disk_data[mount_point] = {
                "filesystem": filesystem,
                "fstype": fstype,
                "total_gb": total_kb / (1024 * 1024),
                "used_gb": used_kb / (1024 * 1024),
                "available_gb": available_kb / (1024 * 1024),
                "usage_percent": usage_percent,
            }

        inodes_data = {}
        if inodes_output:
            inodes_lines = inodes_output.strip().split("\n")
            if len(inodes_lines) > 1:
                for line in inodes_lines[1:]:
                    parts = line.split()
                    if len(parts) < 7:
                        continue
                    try:
                        mount_point = parts[6]
                        inodes_data[mount_point] = {
                            "inodes_total": int(parts[2]),
                            "inodes_used": int(parts[3]),
                            "inodes_available": int(parts[4]),
                            "inodes_usage_percent": float(parts[5].replace("%", "")),
                        }
                    except (ValueError, IndexError):
                        continue

        for mount_point, data in disk_data.items():
            inodes = inodes_data.get(mount_point, {})
            status = ResourceStatus(
                level="NORMAL",
                value=data["usage_percent"],
                warning_threshold=self.thresholds.get("disk_warning", 80),
                critical_threshold=self.thresholds.get("disk_critical", 95),
            )

            disk_infos.append(DiskInfo(
                node_name=node_name,
                filesystem=data["filesystem"],
                fstype=data["fstype"],
                mount_point=mount_point,
                total_gb=data["total_gb"],
                used_gb=data["used_gb"],
                available_gb=data["available_gb"],
                usage_percent=data["usage_percent"],
                inodes_total=inodes.get("inodes_total", 0),
                inodes_used=inodes.get("inodes_used", 0),
                inodes_available=inodes.get("inodes_available", 0),
                inodes_usage_percent=inodes.get("inodes_usage_percent", 0.0),
                status=status,
            ))

        return disk_infos

    def _parse_network_output_accurate(
        self, node_name: str, output: str
    ) -> List[NetworkInfo]:
        """解析网络输出"""
        network_infos = []

        sections = output.split("===IP_ADDR===")
        if len(sections) < 2:
            return network_infos

        net_dev_section = sections[0].replace("===NET_DEV===", "").strip()
        ip_section = sections[1].strip()

        ip_map = {}
        current_iface = None
        for line in ip_section.split("\n"):
            line = line.strip()
            iface_match = re.match(r"^\d+:\s+(\w+):", line)
            if iface_match:
                current_iface = iface_match.group(1)
            elif current_iface and "inet " in line:
                parts = line.split()
                for i, part in enumerate(parts):
                    if part == "inet" and i + 1 < len(parts):
                        ip_map[current_iface] = parts[i + 1].split("/")[0]
                        break

        net_dev_lines = net_dev_section.split("\n")
        if len(net_dev_lines) <= 2:
            return network_infos

        for line in net_dev_lines[2:]:
            if ":" not in line:
                continue

            iface, stats = line.split(":", 1)
            iface = iface.strip()

            if iface == "lo":
                continue

            parts = stats.split()
            if len(parts) < 16:
                continue

            try:
                rx_bytes = int(parts[0])
                rx_packets = int(parts[1])
                rx_errors = int(parts[2])
                rx_dropped = int(parts[3])
                tx_bytes = int(parts[8])
                tx_packets = int(parts[9])
                tx_errors = int(parts[10])
                tx_dropped = int(parts[11])
            except (ValueError, IndexError):
                continue

            network_infos.append(NetworkInfo(
                node_name=node_name,
                interface=iface,
                ip_address=ip_map.get(iface, ""),
                rx_bytes=rx_bytes,
                tx_bytes=tx_bytes,
                rx_packets=rx_packets,
                tx_packets=tx_packets,
                rx_errors=rx_errors,
                tx_errors=tx_errors,
                rx_dropped=rx_dropped,
                tx_dropped=tx_dropped,
            ))

        return network_infos

    def _determine_overall_status(self, report: ResourceReport) -> str:
        """确定整体状态"""
        statuses = []

        if report.cpu:
            statuses.append(report.cpu.status.level)
        if report.memory:
            statuses.append(report.memory.status.level)
        for disk in report.disks:
            statuses.append(disk.status.level)

        if report.error:
            return "UNKNOWN"

        if "CRITICAL" in statuses:
            return "CRITICAL"
        elif "WARNING" in statuses:
            return "WARNING"
        elif not statuses:
            return "UNKNOWN"
        else:
            return "NORMAL"
