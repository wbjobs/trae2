"""
服务状态巡检模块
Service Status Inspector Module

负责巡检容器运行状态、Docker 服务状态、节点健康状况。
"""

import re
import json
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime

from communicator import ClusterCommunicator, CommandResult

logger = logging.getLogger(__name__)


@dataclass
class ContainerStatus:
    """容器状态信息"""
    node_name: str
    container_id: str
    name: str
    image: str
    status: str
    state: str
    restart_count: int
    cpu_usage: float
    memory_usage: float
    memory_limit: float
    network_rx: int
    network_tx: int
    started_at: str
    ports: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "container_id": self.container_id,
            "name": self.name,
            "image": self.image,
            "status": self.status,
            "state": self.state,
            "restart_count": self.restart_count,
            "cpu_usage": self.cpu_usage,
            "memory_usage": self.memory_usage,
            "memory_limit": self.memory_limit,
            "network_rx": self.network_rx,
            "network_tx": self.network_tx,
            "started_at": self.started_at,
            "ports": self.ports,
        }


@dataclass
class DockerServiceStatus:
    """Docker 服务状态"""
    node_name: str
    service_running: bool
    service_version: str
    containers_total: int
    containers_running: int
    containers_stopped: int
    containers_paused: int
    images_count: int
    volumes_count: int
    networks_count: int
    disk_usage: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "service_running": self.service_running,
            "service_version": self.service_version,
            "containers_total": self.containers_total,
            "containers_running": self.containers_running,
            "containers_stopped": self.containers_stopped,
            "containers_paused": self.containers_paused,
            "images_count": self.images_count,
            "volumes_count": self.volumes_count,
            "networks_count": self.networks_count,
            "disk_usage": self.disk_usage,
        }


@dataclass
class SystemServiceStatus:
    """系统服务状态"""
    node_name: str
    service_name: str
    loaded: bool
    active: bool
    sub_status: str
    memory_usage: str
    pid: int
    uptime: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "service_name": self.service_name,
            "loaded": self.loaded,
            "active": self.active,
            "sub_status": self.sub_status,
            "memory_usage": self.memory_usage,
            "pid": self.pid,
            "uptime": self.uptime,
        }


@dataclass
class ServiceInspectionReport:
    """服务巡检报告"""
    node_name: str
    timestamp: str
    docker_status: Optional[DockerServiceStatus] = None
    containers: List[ContainerStatus] = field(default_factory=list)
    system_services: List[SystemServiceStatus] = field(default_factory=list)
    abnormal_containers: List[str] = field(default_factory=list)
    critical_issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    overall_status: str = "NORMAL"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "timestamp": self.timestamp,
            "docker_status": self.docker_status.to_dict() if self.docker_status else None,
            "containers": [c.to_dict() for c in self.containers],
            "system_services": [s.to_dict() for s in self.system_services],
            "abnormal_containers": self.abnormal_containers,
            "critical_issues": self.critical_issues,
            "warnings": self.warnings,
            "overall_status": self.overall_status,
        }


class ServiceInspector:
    """服务巡检器"""

    DEFAULT_SYSTEM_SERVICES = [
        "docker",
        "kubelet",
        "containerd",
        "systemd-resolved",
    ]

    def __init__(
        self,
        communicator: ClusterCommunicator,
        thresholds: dict,
        check_services: Optional[List[str]] = None,
    ):
        self.communicator = communicator
        self.thresholds = thresholds
        self.check_services = check_services or self.DEFAULT_SYSTEM_SERVICES

    def inspect_docker_service(
        self, node_names: List[str]
    ) -> Dict[str, Optional[DockerServiceStatus]]:
        """巡检 Docker 服务状态

        Args:
            node_names: 节点名称列表

        Returns:
            节点名称到 Docker 状态的映射
        """
        results: Dict[str, Optional[DockerServiceStatus]] = {}

        command = (
            "echo '===DOCKER_STATUS===' && systemctl is-active docker 2>/dev/null || echo 'inactive' && "
            "echo '===DOCKER_VERSION===' && docker --version 2>/dev/null || echo 'N/A' && "
            "echo '===CONTAINERS===' && docker ps -a --format '{{.Status}}' 2>/dev/null | wc -l && "
            "echo '===RUNNING===' && docker ps --format '{{.ID}}' 2>/dev/null | wc -l && "
            "echo '===STOPPED===' && docker ps -a --filter 'status=exited' --format '{{.ID}}' 2>/dev/null | wc -l && "
            "echo '===PAUSED===' && docker ps -a --filter 'status=paused' --format '{{.ID}}' 2>/dev/null | wc -l && "
            "echo '===IMAGES===' && docker images -q 2>/dev/null | wc -l && "
            "echo '===VOLUMES===' && docker volume ls -q 2>/dev/null | wc -l && "
            "echo '===NETWORKS===' && docker network ls -q 2>/dev/null | wc -l && "
            "echo '===DISK_USAGE===' && docker system df --format '{{.Type}} {{.Size}} {{.Reclaimable}}' 2>/dev/null || echo 'N/A'"
        )

        command_results = self.communicator.execute_on_nodes(node_names, command)

        for node_name, result in command_results.items():
            if result is None or not result.success:
                results[node_name] = None
                continue

            try:
                docker_status = self._parse_docker_status(node_name, result.stdout)
                results[node_name] = docker_status
            except Exception as e:
                logger.error(f"解析节点 {node_name} Docker 状态失败: {e}")
                results[node_name] = None

        return results

    def inspect_containers(
        self, node_names: List[str]
    ) -> Dict[str, List[ContainerStatus]]:
        """巡检容器状态

        Args:
            node_names: 节点名称列表

        Returns:
            节点名称到容器状态列表的映射
        """
        results: Dict[str, List[ContainerStatus]] = {}

        command = (
            "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}' 2>/dev/null"
        )

        command_results = self.communicator.execute_on_nodes(node_names, command)

        for node_name, result in command_results.items():
            containers = []
            if result is None or not result.success:
                results[node_name] = containers
                continue

            try:
                containers = self._parse_container_list(node_name, result.stdout)
            except Exception as e:
                logger.error(f"解析节点 {node_name} 容器列表失败: {e}")

            if containers:
                stats_command = (
                    "docker stats --no-stream --format "
                    "'{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}' 2>/dev/null"
                )
                stats_result = self.communicator.execute_on_node(
                    node_name, stats_command
                )
                if stats_result and stats_result.success:
                    containers = self._enrich_container_stats(
                        containers, stats_result.stdout
                    )

            restart_command = (
                "docker inspect $(docker ps -aq) --format "
                "'{{.Name}}|{{.RestartCount}}|{{.State.StartedAt}}' 2>/dev/null"
            )
            restart_result = self.communicator.execute_on_node(
                node_name, restart_command
            )
            if restart_result and restart_result.success:
                containers = self._enrich_container_restarts(
                    containers, restart_result.stdout
                )

            results[node_name] = containers

        return results

    def inspect_system_services(
        self, node_names: List[str]
    ) -> Dict[str, List[SystemServiceStatus]]:
        """巡检系统服务状态

        Args:
            node_names: 节点名称列表

        Returns:
            节点名称到系统服务状态列表的映射
        """
        results: Dict[str, List[SystemServiceStatus]] = {}

        for service in self.check_services:
            command = (
                f"echo '===SERVICE:{service}===' && "
                f"systemctl is-enabled {service} 2>/dev/null; "
                f"systemctl is-active {service} 2>/dev/null; "
                f"systemctl status {service} --no-pager 2>/dev/null | "
                f"grep -E 'Active:|Memory:|Main PID:|since' || echo 'N/A'"
            )

            command_results = self.communicator.execute_on_nodes(node_names, command)

            for node_name, result in command_results.items():
                if node_name not in results:
                    results[node_name] = []

                if result is None or not result.success:
                    continue

                try:
                    service_status = self._parse_system_service(
                        node_name, service, result.stdout
                    )
                    results[node_name].append(service_status)
                except Exception as e:
                    logger.error(f"解析节点 {node_name} 服务 {service} 状态失败: {e}")

        return results

    def inspect_all(
        self,
        node_names: List[str],
        inspect_type: str = "all",
    ) -> Dict[str, ServiceInspectionReport]:
        """执行完整巡检

        Args:
            node_names: 节点名称列表
            inspect_type: 巡检类型 (docker, containers, services, all)

        Returns:
            节点名称到巡检报告的映射
        """
        reports: Dict[str, ServiceInspectionReport] = {}
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        check_docker = inspect_type in ("all", "docker")
        check_containers = inspect_type in ("all", "containers")
        check_services = inspect_type in ("all", "services")

        if check_docker:
            docker_results = self.inspect_docker_service(node_names)
        if check_containers:
            container_results = self.inspect_containers(node_names)
        if check_services:
            service_results = self.inspect_system_services(node_names)

        for node_name in node_names:
            report = ServiceInspectionReport(
                node_name=node_name,
                timestamp=timestamp,
            )

            if check_docker:
                report.docker_status = docker_results.get(node_name)
            if check_containers:
                report.containers = container_results.get(node_name, [])
            if check_services:
                report.system_services = service_results.get(node_name, [])

            self._analyze_report(report)
            reports[node_name] = report

        return reports

    def _parse_docker_status(
        self, node_name: str, output: str
    ) -> DockerServiceStatus:
        """解析 Docker 状态输出"""
        lines = output.strip().split("\n")
        service_running = False
        service_version = "N/A"
        containers_total = 0
        containers_running = 0
        containers_stopped = 0
        containers_paused = 0
        images_count = 0
        volumes_count = 0
        networks_count = 0
        disk_usage = "N/A"

        current_section = ""
        for line in lines:
            line = line.strip()
            if "===DOCKER_STATUS===" in line:
                current_section = "status"
                continue
            elif "===DOCKER_VERSION===" in line:
                current_section = "version"
                continue
            elif "===CONTAINERS===" in line:
                current_section = "containers"
                continue
            elif "===RUNNING===" in line:
                current_section = "running"
                continue
            elif "===STOPPED===" in line:
                current_section = "stopped"
                continue
            elif "===PAUSED===" in line:
                current_section = "paused"
                continue
            elif "===IMAGES===" in line:
                current_section = "images"
                continue
            elif "===VOLUMES===" in line:
                current_section = "volumes"
                continue
            elif "===NETWORKS===" in line:
                current_section = "networks"
                continue
            elif "===DISK_USAGE===" in line:
                current_section = "disk"
                continue

            if not line:
                continue

            if current_section == "status":
                service_running = line == "active"
            elif current_section == "version":
                service_version = line
            elif current_section == "containers":
                try:
                    containers_total = int(line)
                except ValueError:
                    pass
            elif current_section == "running":
                try:
                    containers_running = int(line)
                except ValueError:
                    pass
            elif current_section == "stopped":
                try:
                    containers_stopped = int(line)
                except ValueError:
                    pass
            elif current_section == "paused":
                try:
                    containers_paused = int(line)
                except ValueError:
                    pass
            elif current_section == "images":
                try:
                    images_count = int(line)
                except ValueError:
                    pass
            elif current_section == "volumes":
                try:
                    volumes_count = int(line)
                except ValueError:
                    pass
            elif current_section == "networks":
                try:
                    networks_count = int(line)
                except ValueError:
                    pass
            elif current_section == "disk":
                disk_usage = line

        return DockerServiceStatus(
            node_name=node_name,
            service_running=service_running,
            service_version=service_version,
            containers_total=containers_total,
            containers_running=containers_running,
            containers_stopped=containers_stopped,
            containers_paused=containers_paused,
            images_count=images_count,
            volumes_count=volumes_count,
            networks_count=networks_count,
            disk_usage=disk_usage,
        )

    def _parse_container_list(
        self, node_name: str, output: str
    ) -> List[ContainerStatus]:
        """解析容器列表输出"""
        containers = []

        for line in output.strip().split("\n"):
            if not line.strip():
                continue

            parts = line.split("|")
            if len(parts) >= 6:
                container_id = parts[0].strip()
                name = parts[1].strip()
                image = parts[2].strip()
                status = parts[3].strip()
                state = parts[4].strip()
                ports = [p.strip() for p in parts[5].split(",") if p.strip()]

                containers.append(ContainerStatus(
                    node_name=node_name,
                    container_id=container_id,
                    name=name,
                    image=image,
                    status=status,
                    state=state,
                    restart_count=0,
                    cpu_usage=0.0,
                    memory_usage=0.0,
                    memory_limit=0.0,
                    network_rx=0,
                    network_tx=0,
                    started_at="",
                    ports=ports,
                ))

        return containers

    def _enrich_container_stats(
        self, containers: List[ContainerStatus], stats_output: str
    ) -> List[ContainerStatus]:
        """丰富容器统计信息"""
        stats_map = {}

        for line in stats_output.strip().split("\n"):
            if not line.strip():
                continue

            parts = line.split("|")
            if len(parts) >= 4:
                name = parts[0].strip()
                try:
                    cpu_usage = float(parts[1].replace("%", "").strip())
                except ValueError:
                    cpu_usage = 0.0

                mem_parts = parts[2].split("/")
                try:
                    memory_usage = self._parse_size_to_mb(mem_parts[0].strip())
                except ValueError:
                    memory_usage = 0.0

                try:
                    memory_limit = self._parse_size_to_mb(mem_parts[1].strip()) if len(mem_parts) > 1 else 0.0
                except ValueError:
                    memory_limit = 0.0

                net_parts = parts[3].split("/")
                try:
                    network_rx = self._parse_size_to_bytes(net_parts[0].strip())
                except ValueError:
                    network_rx = 0

                try:
                    network_tx = self._parse_size_to_bytes(net_parts[1].strip()) if len(net_parts) > 1 else 0
                except ValueError:
                    network_tx = 0

                stats_map[name] = {
                    "cpu_usage": cpu_usage,
                    "memory_usage": memory_usage,
                    "memory_limit": memory_limit,
                    "network_rx": network_rx,
                    "network_tx": network_tx,
                }

        for container in containers:
            if container.name in stats_map:
                stats = stats_map[container.name]
                container.cpu_usage = stats["cpu_usage"]
                container.memory_usage = stats["memory_usage"]
                container.memory_limit = stats["memory_limit"]
                container.network_rx = stats["network_rx"]
                container.network_tx = stats["network_tx"]

        return containers

    def _enrich_container_restarts(
        self, containers: List[ContainerStatus], restart_output: str
    ) -> List[ContainerStatus]:
        """丰富容器重启信息"""
        restart_map = {}

        for line in restart_output.strip().split("\n"):
            if not line.strip():
                continue

            parts = line.split("|")
            if len(parts) >= 3:
                name = parts[0].strip().lstrip("/")
                try:
                    restart_count = int(parts[1].strip())
                except ValueError:
                    restart_count = 0
                started_at = parts[2].strip()

                restart_map[name] = {
                    "restart_count": restart_count,
                    "started_at": started_at,
                }

        for container in containers:
            if container.name in restart_map:
                info = restart_map[container.name]
                container.restart_count = info["restart_count"]
                container.started_at = info["started_at"]

        return containers

    def _parse_system_service(
        self, node_name: str, service_name: str, output: str
    ) -> SystemServiceStatus:
        """解析系统服务状态"""
        lines = output.strip().split("\n")
        loaded = False
        active = False
        sub_status = "unknown"
        memory_usage = "N/A"
        pid = 0
        uptime = "N/A"

        for line in lines:
            line = line.strip()
            if "enabled" in line or "disabled" in line or "alias" in line:
                loaded = "enabled" in line or "alias" in line
            elif "active" in line or "inactive" in line or "failed" in line:
                if line in ("active", "inactive", "failed", "activating", "deactivating"):
                    active = line == "active"
                    sub_status = line
            elif line.startswith("Active:"):
                active = "active (running)" in line
                match = re.search(r"Active:\s+(\S+)", line)
                if match:
                    sub_status = match.group(1)
                uptime_match = re.search(r";\s+(.+?)\s+ago", line)
                if uptime_match:
                    uptime = uptime_match.group(1)
            elif line.startswith("Memory:"):
                memory_usage = line.replace("Memory:", "").strip()
            elif line.startswith("Main PID:"):
                pid_match = re.search(r"Main PID:\s+(\d+)", line)
                if pid_match:
                    pid = int(pid_match.group(1))

        return SystemServiceStatus(
            node_name=node_name,
            service_name=service_name,
            loaded=loaded,
            active=active,
            sub_status=sub_status,
            memory_usage=memory_usage,
            pid=pid,
            uptime=uptime,
        )

    def _parse_size_to_mb(self, size_str: str) -> float:
        """解析大小字符串为 MB"""
        size_str = size_str.strip().upper()
        if "GB" in size_str:
            return float(size_str.replace("GB", "").strip()) * 1024
        elif "MB" in size_str:
            return float(size_str.replace("MB", "").strip())
        elif "KB" in size_str:
            return float(size_str.replace("KB", "").strip()) / 1024
        elif "B" in size_str:
            return float(size_str.replace("B", "").strip()) / (1024 * 1024)
        else:
            return float(size_str)

    def _parse_size_to_bytes(self, size_str: str) -> int:
        """解析大小字符串为 bytes"""
        size_str = size_str.strip().upper()
        if "GB" in size_str:
            return int(float(size_str.replace("GB", "").strip()) * 1024 * 1024 * 1024)
        elif "MB" in size_str:
            return int(float(size_str.replace("MB", "").strip()) * 1024 * 1024)
        elif "KB" in size_str:
            return int(float(size_str.replace("KB", "").strip()) * 1024)
        elif "B" in size_str:
            return int(float(size_str.replace("B", "").strip()))
        else:
            return int(float(size_str))

    def _analyze_report(self, report: ServiceInspectionReport):
        """分析巡检报告，识别问题"""
        critical_restart = self.thresholds.get("container_restart_critical", 5)
        warning_restart = self.thresholds.get("container_restart_warning", 3)

        for container in report.containers:
            if container.state not in ("running", "exited"):
                report.abnormal_containers.append(
                    f"{container.name}: 状态异常 ({container.state})"
                )

            if container.restart_count >= critical_restart:
                report.critical_issues.append(
                    f"容器 {container.name} 重启次数过多 ({container.restart_count}次)"
                )
            elif container.restart_count >= warning_restart:
                report.warnings.append(
                    f"容器 {container.name} 重启次数警告 ({container.restart_count}次)"
                )

            if container.state == "running" and container.cpu_usage > 90:
                report.warnings.append(
                    f"容器 {container.name} CPU 使用率过高 ({container.cpu_usage:.1f}%)"
                )

        for service in report.system_services:
            if not service.active:
                report.critical_issues.append(
                    f"系统服务 {service.service_name} 未运行"
                )

        if report.docker_status and not report.docker_status.service_running:
            report.critical_issues.append("Docker 服务未运行")

        if report.critical_issues:
            report.overall_status = "CRITICAL"
        elif report.warnings or report.abnormal_containers:
            report.overall_status = "WARNING"
        else:
            report.overall_status = "NORMAL"
