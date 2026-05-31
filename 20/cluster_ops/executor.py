import time
import json
from typing import List, Dict, Any, Optional, Callable
from pathlib import Path
from dataclasses import dataclass, field

from .config import ServerConfig, config_manager
from .ssh_client import SSHCluster, SSHResult, _clean_console_text
from .logger import execution_logger, output_formatter


@dataclass
class ExecutionResult:
    success: bool
    results: Dict[str, Any] = field(default_factory=dict)
    duration: float = 0.0
    error: Optional[str] = None


class CommandExecutor:
    def __init__(self, servers: Optional[List[ServerConfig]] = None):
        self.servers = servers or config_manager.get_all_servers()
        self.logger = execution_logger.get_logger("executor")

    def _run_with_progress(
        self,
        description: str,
        target_servers: List[ServerConfig],
        operation: Callable[[SSHCluster, List[ServerConfig]], Dict[str, Any]],
        log_command: str,
        result_processor: Optional[Callable[[str, Any, Path], None]] = None,
        parallel: Optional[int] = None
    ) -> ExecutionResult:
        start_time = time.time()
        server_names_list = [s.name for s in target_servers]
        log_file = execution_logger.create_execution_log(log_command, server_names_list)

        progress = execution_logger.create_progress(len(target_servers), description)
        progress.set_pending(server_names_list)

        results: Dict[str, Any] = {}
        success_count = 0

        with SSHCluster(target_servers) as cluster:
            raw_results = operation(cluster, target_servers)

        for server_name, result in raw_results.items():
            is_success = getattr(result, 'success', bool(result))
            progress.update(server_name, is_success)

            if result_processor:
                result_processor(server_name, result, log_file)

            results[server_name] = result
            if is_success:
                success_count += 1

        progress.finish()

        for server_name in sorted(results.keys()):
            result = results[server_name]
            is_success = getattr(result, 'success', bool(result))
            message = ""
            if hasattr(result, 'stderr') and result.stderr and not is_success:
                message = _clean_console_text(result.stderr).strip() or getattr(result, 'error', '')

            output_formatter.print_server_result(
                server_name,
                is_success,
                message[:500] if message else ""
            )

        duration = time.time() - start_time
        output_formatter.print_summary(success_count, len(target_servers), duration)

        return ExecutionResult(
            success=success_count == len(target_servers),
            results={name: self._result_to_dict(r) for name, r in results.items()},
            duration=duration
        )

    def execute_command(
        self,
        command: str,
        server_names: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        parallel: Optional[int] = None,
        verbose: bool = False
    ) -> ExecutionResult:
        target_servers = self._filter_servers(server_names, tags)
        if not target_servers:
            return ExecutionResult(success=False, error="No servers matched the criteria")

        output_formatter.print_header(f"Executing: {command[:120]}")
        output_formatter.print_table(
            ["Server", "Host", "Status"],
            [[s.name, s.host, "Queued"] for s in target_servers]
        )

        def _operation(cluster: SSHCluster, servers: list) -> Dict[str, SSHResult]:
            return cluster.execute(command, servers=servers, parallel=parallel)

        def _processor(server_name: str, result: SSHResult, log_file: Path) -> None:
            execution_logger.log_execution_result(
                log_file, server_name, command,
                result.stdout, result.stderr,
                result.exit_code, result.duration
            )
            if verbose:
                message = ""
                if result.stdout:
                    message += f"STDOUT:\n{_clean_console_text(result.stdout).strip()[:1000]}\n"
                if result.stderr:
                    message += f"STDERR:\n{_clean_console_text(result.stderr).strip()[:1000]}"
                output_formatter.print_server_result(
                    server_name + " (detail)", result.success,
                    message[:500] if message else ""
                )

        return self._run_with_progress(
            "Executing", target_servers, _operation,
            command, _processor, parallel
        )

    def health_check(
        self,
        server_names: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        parallel: Optional[int] = None
    ) -> ExecutionResult:
        start_time = time.time()
        target_servers = self._filter_servers(server_names, tags)

        if not target_servers:
            return ExecutionResult(success=False, error="No servers matched the criteria")

        output_formatter.print_header("Running Health Check")

        health_checks = {
            "uptime": "uptime | awk '{print $3,$4}' | sed 's/,//'",
            "cpu_load": "cat /proc/loadavg | awk '{print $1,$2,$3}'",
            "memory": "free -m | awk 'NR==2{printf \"%.1f%%\", $3*100/$2}'",
            "disk_root": "df -h / | awk 'NR==2{print $5}'",
            "processes": "ps aux | wc -l",
            "swap": "free -m | awk 'NR==3{printf \"%.1f%%\", $3*100/$2}'",
        }

        check_results: Dict[str, Dict[str, str]] = {}
        total_checks = len(health_checks) * len(target_servers)
        progress = execution_logger.create_progress(total_checks, "Health Check")

        with SSHCluster(target_servers) as cluster:
            for check_idx, (check_name, check_cmd) in enumerate(health_checks.items()):
                results = cluster.execute(check_cmd, parallel=parallel)
                for server_name, result in results.items():
                    progress.update(f"{server_name}_{check_name}", result.success)
                    if server_name not in check_results:
                        check_results[server_name] = {}
                    check_results[server_name][check_name] = (
                        result.stdout.strip() if result.success else "N/A"
                    )

        progress.finish()

        table_rows = []
        all_healthy = True
        for server_name in sorted(check_results.keys()):
            checks = check_results[server_name]
            memory_usage = 0.0
            disk_usage = 0.0
            try:
                memory_usage = float(checks["memory"].replace("%", "")) if checks["memory"] != "N/A" else 0
            except (ValueError, TypeError):
                pass
            try:
                disk_usage = float(checks["disk_root"].replace("%", "")) if checks["disk_root"] != "N/A" else 0
            except (ValueError, TypeError):
                pass

            healthy = memory_usage < 80 and disk_usage < 80
            if not healthy:
                all_healthy = False

            status = "✓ Healthy" if healthy else "⚠ Warning"
            table_rows.append([
                server_name,
                checks["uptime"],
                checks["cpu_load"],
                checks["memory"],
                checks["disk_root"],
                checks["swap"],
                status
            ])

        output_formatter.print_table(
            ["Server", "Uptime", "Load", "Memory", "Disk /", "Swap", "Status"],
            table_rows
        )

        duration = time.time() - start_time
        output_formatter.print_summary(
            sum(1 for r in check_results.values() if True),
            len(check_results),
            duration
        )

        return ExecutionResult(
            success=all_healthy,
            results=check_results,
            duration=duration
        )

    def service_status(
        self,
        service_name: str,
        server_names: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        parallel: Optional[int] = None
    ) -> ExecutionResult:
        target_servers = self._filter_servers(server_names, tags)
        if not target_servers:
            return ExecutionResult(success=False, error="No servers matched the criteria")

        output_formatter.print_header(f"Checking Service: {service_name}")
        command = f"systemctl is-active {service_name} 2>/dev/null || service {service_name} status 2>/dev/null | head -1"

        status_results: Dict[str, str] = {}

        def _operation(cluster: SSHCluster, servers: list) -> Dict[str, SSHResult]:
            return cluster.execute(command, servers=servers, parallel=parallel)

        def _processor(server_name: str, result: SSHResult, log_file: Path) -> None:
            status_results[server_name] = result.stdout.strip() if result.success else "unknown"

        exec_result = self._run_with_progress(
            "Checking", target_servers, _operation,
            f"service status {service_name}", _processor, parallel
        )

        table_rows = []
        all_running = True
        for server_name in sorted(status_results.keys()):
            status = _clean_console_text(status_results[server_name]).strip().lower()
            is_running = "active" in status or "running" in status
            if not is_running:
                all_running = False
            status_display = "✓ Running" if is_running else "✗ Stopped"
            table_rows.append([server_name, status_display])

        output_formatter.print_table(["Server", "Status"], table_rows)

        return ExecutionResult(
            success=all_running,
            results=status_results,
            duration=exec_result.duration
        )

    def service_manage(
        self,
        service_name: str,
        action: str,
        server_names: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        parallel: Optional[int] = None
    ) -> ExecutionResult:
        valid_actions = ["start", "stop", "restart", "reload", "enable", "disable"]
        if action not in valid_actions:
            return ExecutionResult(
                success=False,
                error=f"Invalid action: {action}. Valid actions: {', '.join(valid_actions)}"
            )

        target_servers = self._filter_servers(server_names, tags)
        if not target_servers:
            return ExecutionResult(success=False, error="No servers matched the criteria")

        output_formatter.print_header(f"Service {action.capitalize()}: {service_name}")
        command = f"systemctl {action} {service_name} 2>/dev/null || service {service_name} {action} 2>/dev/null"

        def _operation(cluster: SSHCluster, servers: list) -> Dict[str, SSHResult]:
            return cluster.execute(command, servers=servers, parallel=parallel)

        def _processor(server_name: str, result: SSHResult, log_file: Path) -> None:
            pass

        return self._run_with_progress(
            f"Service {action}", target_servers, _operation,
            f"service {action} {service_name}", _processor, parallel
        )

    def deploy_config(
        self,
        local_path: str,
        remote_path: str,
        server_names: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        parallel: Optional[int] = None,
        backup: bool = True
    ) -> ExecutionResult:
        target_servers = self._filter_servers(server_names, tags)
        if not target_servers:
            return ExecutionResult(success=False, error="No servers matched the criteria")

        local_file = Path(local_path)
        if not local_file.exists():
            return ExecutionResult(success=False, error=f"Local file not found: {local_path}")

        file_size = local_file.stat().st_size
        output_formatter.print_header(
            f"Deploying Config: {local_path} ({file_size} bytes) -> {remote_path}"
        )

        if backup:
            backup_cmd = (
                f"if [ -f {remote_path} ]; then "
                f"cp {remote_path} {remote_path}.backup.$(date +%Y%m%d_%H%M%S); "
                f"fi"
            )
            with SSHCluster(target_servers) as backup_cluster:
                backup_results = backup_cluster.execute(backup_cmd, parallel=parallel)
            backup_success = sum(1 for r in backup_results.values() if r.success)
            self.logger.info(f"Backup completed: {backup_success}/{len(target_servers)} succeeded")

        def _operation(cluster: SSHCluster, servers: list) -> Dict[str, bool]:
            return cluster.upload(local_path, remote_path, servers=servers, parallel=parallel)

        def _processor(server_name: str, result: Any, log_file: Path) -> None:
            pass

        return self._run_with_progress(
            "Uploading", target_servers, _operation,
            f"deploy {local_path} -> {remote_path}", _processor, parallel
        )

    def run_script(
        self,
        script_path: str,
        server_names: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        parallel: Optional[int] = None,
        args: Optional[str] = ""
    ) -> ExecutionResult:
        target_servers = self._filter_servers(server_names, tags)
        if not target_servers:
            return ExecutionResult(success=False, error="No servers matched the criteria")

        script_file = Path(script_path)
        if not script_file.exists():
            return ExecutionResult(success=False, error=f"Script file not found: {script_path}")

        script_size = script_file.stat().st_size
        output_formatter.print_header(
            f"Running Script: {script_path} ({script_size} bytes)"
        )

        remote_script = f"/tmp/cluster_ops_script_{int(time.time())}.sh"

        def _operation(cluster: SSHCluster, servers: list) -> Dict[str, SSHResult]:
            upload_results = cluster.upload(script_path, remote_script, servers=servers, parallel=parallel)
            upload_success_servers = [s for s in servers if upload_results.get(s.name, False)]

            results: Dict[str, SSHResult] = {}
            for s in servers:
                if not upload_results.get(s.name, False):
                    results[s.name] = SSHResult(
                        server_name=s.name,
                        command="script upload",
                        stdout="",
                        stderr="Failed to upload script",
                        exit_code=-1,
                        success=False,
                        duration=0,
                        error="Upload failed"
                    )

            if upload_success_servers:
                execute_cmd = f"chmod +x {remote_script} && {remote_script} {args}; rm -f {remote_script}"
                exec_results = cluster.execute(execute_cmd, servers=upload_success_servers, parallel=parallel)
                results.update(exec_results)

            return results

        def _processor(server_name: str, result: SSHResult, log_file: Path) -> None:
            pass

        return self._run_with_progress(
            "Running", target_servers, _operation,
            f"script {script_path} {args}", _processor, parallel
        )

    def disk_usage(
        self,
        path: str = "/",
        server_names: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        parallel: Optional[int] = None
    ) -> ExecutionResult:
        target_servers = self._filter_servers(server_names, tags)
        if not target_servers:
            return ExecutionResult(success=False, error="No servers matched the criteria")

        output_formatter.print_header(f"Disk Usage: {path}")
        command = f"df -h {path} | tail -1"

        disk_results: Dict[str, list] = {}

        def _operation(cluster: SSHCluster, servers: list) -> Dict[str, SSHResult]:
            return cluster.execute(command, servers=servers, parallel=parallel)

        def _processor(server_name: str, result: SSHResult, log_file: Path) -> None:
            if result.success and result.stdout.strip():
                cleaned = _clean_console_text(result.stdout)
                parts = cleaned.strip().split()
                if len(parts) >= 6:
                    disk_results[server_name] = parts
                else:
                    disk_results[server_name] = ["N/A"] * 6
            else:
                disk_results[server_name] = ["N/A"] * 6

        exec_result = self._run_with_progress(
            "Checking", target_servers, _operation,
            f"disk usage {path}", _processor, parallel
        )

        table_rows = []
        for server_name in sorted(disk_results.keys()):
            parts = disk_results[server_name]
            if parts[0] == "N/A":
                table_rows.append([server_name, "N/A", "N/A", "N/A", "N/A", "N/A", "Error"])
            else:
                table_rows.append([
                    server_name, parts[0], parts[1], parts[2],
                    parts[3], parts[4], parts[5]
                ])

        output_formatter.print_table(
            ["Server", "Filesystem", "Size", "Used", "Avail", "Use%", "Mount"],
            table_rows
        )

        return ExecutionResult(
            success=all(r[0] != "N/A" for r in disk_results.values()),
            results={name: " ".join(v) for name, v in disk_results.items()},
            duration=exec_result.duration
        )

    def _filter_servers(
        self,
        server_names: Optional[List[str]] = None,
        tags: Optional[List[str]] = None
    ) -> List[ServerConfig]:
        if server_names:
            servers = []
            for name in server_names:
                server = config_manager.get_server(name)
                if server:
                    servers.append(server)
            return servers
        elif tags:
            return config_manager.get_servers_by_tags(tags)
        else:
            return self.servers.copy()

    @staticmethod
    def _result_to_dict(result: Any) -> Dict[str, Any]:
        if hasattr(result, 'success'):
            return {
                "success": result.success,
                "stdout": _clean_console_text(result.stdout) if hasattr(result, 'stdout') else "",
                "stderr": _clean_console_text(result.stderr) if hasattr(result, 'stderr') else "",
                "exit_code": getattr(result, 'exit_code', -1),
                "duration": getattr(result, 'duration', 0),
                "error": getattr(result, 'error', None)
            }
        return {"success": bool(result)}
