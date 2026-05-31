import re
import logging
from dataclasses import dataclass, field
from typing import List, Optional

from communication import ClusterCommunicator, CommandResult

logger = logging.getLogger(__name__)


@dataclass
class ServiceStatus:
    name: str
    host: str
    active: bool = False
    loaded: bool = False
    enabled: bool = False
    running: bool = False
    pid: Optional[int] = None
    memory: str = ""
    uptime: str = ""
    since: str = ""
    process_count: int = 0
    raw_output: str = ""
    error: Optional[str] = None

    @property
    def is_healthy(self) -> bool:
        return self.active and self.running


@dataclass
class ProcessInfo:
    pid: int
    user: str
    cpu_percent: float
    mem_percent: float
    memory_kb: int
    command: str
    name: str
    status: str

    @property
    def memory_mb(self) -> float:
        return self.memory_kb / 1024.0


@dataclass
class NodeServiceReport:
    host: str
    service_statuses: List[ServiceStatus] = field(default_factory=list)
    process_infos: List[ProcessInfo] = field(default_factory=list)
    raw_systemd_available: bool = True
    error: Optional[str] = None


class ServiceChecker:
    def __init__(self, communicator: ClusterCommunicator, service_names: List[str] = None):
        self.communicator = communicator
        self.service_names = service_names or []

    def _detect_init_system(self, host: str) -> str:
        cmd = "ps -p 1 -o comm="
        result = self.communicator.execute_on_node(host, cmd)
        result = result.stdout.strip().lower() if result and result.success else ""
        if "systemd" in result:
            return "systemd"
        return "sysvinit"

    def _check_systemd_service(self, host: str, service_name: str) -> ServiceStatus:
        status = ServiceStatus(name=service_name, host=host)

        cmd = f"systemctl is-active {service_name} 2>/dev/null; echo '---'; systemctl is-enabled {service_name} 2>/dev/null; echo '---'; systemctl is-active {service_name} 2>/dev/null"
        result = self.communicator.execute_on_node(host, cmd)
        if not result:
            status.error = "无法获取服务状态"
            return status

        parts = result.stdout.strip()
        lines = parts.split("\n")
        if not lines:
            status.error = "无输出"
            return status

        sections = parts.split("---")
        if len(sections) >= 1:
            active_val = sections[0].strip()
            status.active = active_val == "active"
        if len(sections) >= 2:
            enabled_val = sections[1].strip()
            status.enabled = enabled_val == "enabled"
        if len(sections) >= 3:
            is_active_val = sections[2].strip()
            status.active = is_active_val == "active"

        status.loaded = True

        show_cmd = f"systemctl show {service_name} --no-pager 2>/dev/null"
        show_result = self.communicator.execute_on_node(host, show_cmd)
        if show_result and show_result.success:
            status.raw_output = show_result.stdout
            for line in show_result.stdout.split("\n"):
                if line.startswith("MainPID="):
                    pid_str = line.split("=", 1)[1].strip()
                    if pid_str.isdigit() and int(pid_str) > 0:
                        status.pid = int(pid_str)
                elif line.startswith("MemoryCurrent="):
                    mem_str = line.split("=", 1)[1].strip()
                    status.memory = mem_str
                elif line.startswith("ActiveEnterTimestamp="):
                    status.since = line.split("=", 1)[1].strip()

        if status.pid:
            status.running = True

        return status

    def _check_sysv_service(self, host: str, service_name: str) -> ServiceStatus:
        status = ServiceStatus(name=service_name, host=host)

        cmd = f"service {service_name} status 2>/dev/null; echo 'EXIT_CODE=$?"
        result = self.communicator.execute_on_node(host, cmd)
        if not result:
            status.error = "无法获取服务状态"
            return status

        output = result.stdout
        status.raw_output = output
        status.loaded = True
        status.active = ("running" in output.lower())
        status.running = ("running" in output.lower())

        pid_match = re.search(r'PID[:\s]+(\d+)', output)
        if pid_match:
            status.pid = int(pid_match.group(1))
            status.running = True

        return status

    def _check_process_by_pattern(self, host: str, pattern: str) -> ServiceStatus:
        status = ServiceStatus(name=f"process:{pattern}", host=host)

        cmd = f"ps -eo pid,user,pcpu,pmem,rss,comm,args --no-headers | grep -v grep | grep -E '{pattern}'"
        result = self.communicator.execute_on_node(host, cmd)
        if not result or not result.success:
            status.error = "进程未找到"
            return status

        lines = result.stdout.strip().split("\n")
        count = 0
        for line in lines:
            parts = line.strip()
            if parts:
                count += 1

        status.process_count = count
        status.active = count > 0
        status.running = count > 0
        status.loaded = True
        status.raw_output = result.stdout

        return status

    def check_service(self, host: str, service_name: str, pattern: Optional[str] = None) -> ServiceStatus:
        init_system = self._detect_init_system(host)

        if pattern:
            return self._check_process_by_pattern(host, pattern)

        if init_system == "systemd":
            return self._check_systemd_service(host, service_name)
        else:
            return self._check_sysv_service(host, service_name)

    def check_all_services(self, host: str) -> List[ServiceStatus]:
        statuses = []
        for svc_name in self.service_names:
            status = self.check_service(host, svc_name)
            statuses.append(status)
        return statuses

    def get_process_list(self, host: str) -> List[ProcessInfo]:
        cmd = "ps -eo pid,user,pcpu,pmem,rss,comm,args --no-headers --sort=-rss | head -50"
        result = self.communicator.execute_on_node(host, cmd)
        if not result or not result.success:
            return []

        processes = []
        for line in result.stdout.strip().split("\n"):
            parts = line.split(None, 6)
            if len(parts) >= 7:
                try:
                    processes.append(ProcessInfo(
                        pid=int(parts[0]),
                        user=parts[1],
                        cpu_percent=float(parts[2]),
                        mem_percent=float(parts[3]),
                        memory_kb=int(parts[4]),
                        command=parts[5],
                        name=parts[6],
                        status="",
                    ))
                except (ValueError, IndexError):
                    continue

        return processes

    def check_node(self, host: str) -> NodeServiceReport:
        report = NodeServiceReport(host=host)

        try:
            init_system = self._detect_init_system(host)
            report.systemd_available = (init_system == "systemd")

            if self.service_names:
                for svc_name in self.service_names:
                    status = self.check_service(host, svc_name)
                    report.service_statuses.append(status)

            report.process_infos = self.get_process_list(host)

        except Exception as e:
            report.error = str(e)

        return report

    def check_all_nodes(self) -> List[NodeServiceReport]:
        reports = []
        for node in self.communicator.nodes:
            report = self.check_node(node.host)
            reports.append(report)
        return reports

    def restart_service(self, host: str, service_name: str) -> bool:
        init_system = self._detect_init_system(host)

        if init_system == "systemd":
            cmd = f"systemctl restart {service_name}"
        else:
            cmd = f"service {service_name} restart"

        result = self.communicator.execute_on_node(host, cmd)
        return result and result.success

    def get_unhealthy_services(self, report: NodeServiceReport) -> List[ServiceStatus]:
        return [s for s in report.service_statuses if not s.is_healthy]