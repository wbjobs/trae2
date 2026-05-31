import json
import sys
import time
from typing import List, Optional

import click
from colorama import init, Fore, Style

from cli import cli, load_device_list, Config
from device_comms import DeviceScanner, DeviceInfo, DeviceType
from task_manager import TaskManager, parse_device_connection, TaskStatus
from version_manager import VersionReportManager, VersionComparator, DeviceVersionReport


init(autoreset=True)


class CommandExecutor:
    def __init__(self, config: Config):
        self.config = config
        self.task_manager = TaskManager(max_workers=config.max_workers)

    def execute(self):
        command = getattr(self.config, "command", None)
        if not command:
            return

        handler = getattr(self, f"handle_{command}", None)
        if handler:
            handler()
        else:
            click.echo(f"Unknown command: {command}", err=True)

    def handle_device_scan(self):
        click.echo(f"{Fore.CYAN}Scanning for devices...{Style.RESET_ALL}")

        devices = []

        if self.config.device_type in ("serial", "all"):
            click.echo(f"{Fore.YELLOW}Scanning serial ports...{Style.RESET_ALL}")
            serial_devices = DeviceScanner.scan_serial_ports(self.config.baudrate)
            devices.extend(serial_devices)
            click.echo(f"  Found {len(serial_devices)} serial device(s)")

        if self.config.device_type in ("net", "all"):
            if self.config.ip_range:
                click.echo(f"{Fore.YELLOW}Scanning network devices...{Style.RESET_ALL}")
                net_devices = DeviceScanner.scan_network_devices(
                    self.config.ip_range, self.config.port
                )
                devices.extend(net_devices)
                click.echo(f"  Found {len(net_devices)} network device(s)")

        click.echo()
        if devices:
            click.echo(f"{Fore.GREEN}Found {len(devices)} device(s):{Style.RESET_ALL}")
            for i, dev in enumerate(devices, 1):
                type_str = f"{Fore.BLUE}[{dev.device_type.value}]{Style.RESET_ALL}"
                click.echo(f"  {i}. {type_str} {dev.name}")
                click.echo(f"     Connection: {dev.connection}")
                if dev.device_type == DeviceType.SERIAL:
                    click.echo(f"     Baudrate: {dev.baudrate}")
                elif dev.device_type == DeviceType.NETWORK:
                    click.echo(f"     Port: {dev.port}")
        else:
            click.echo(f"{Fore.YELLOW}No devices found{Style.RESET_ALL}")

    def _get_devices_from_config(self) -> List[DeviceInfo]:
        devices = []

        for conn_str in self.config.devices:
            dev = parse_device_connection(conn_str, self.config.baudrate)
            devices.append(dev)

        if self.config.device_list:
            loaded_devices = load_device_list(self.config.device_list)
            for d in loaded_devices:
                if isinstance(d, dict):
                    conn = d.get("connection", "")
                    name = d.get("name", "")
                    dev = parse_device_connection(conn, d.get("baudrate", self.config.baudrate))
                    if name:
                        dev.name = name
                    devices.append(dev)
                elif isinstance(d, DeviceInfo):
                    devices.append(d)

        if hasattr(self.config, "group_id") and self.config.group_id:
            from device_group import GroupManager
            group_manager = GroupManager()
            group_devices = group_manager.get_group_devices(self.config.group_id)
            if group_devices:
                existing_ids = {d.device_id for d in devices}
                for dev in group_devices:
                    if dev.device_id not in existing_ids:
                        devices.append(dev)
            else:
                click.echo(f"{Fore.YELLOW}Group '{self.config.group_id}' not found or empty{Style.RESET_ALL}")

        return devices

    def handle_firmware_flash(self):
        devices = self._get_devices_from_config()

        if not devices:
            click.echo(f"{Fore.RED}No devices specified{Style.RESET_ALL}", err=True)
            return

        click.echo(f"{Fore.CYAN}Starting firmware flash task...{Style.RESET_ALL}")
        click.echo(f"  Firmware: {self.config.firmware_file}")
        click.echo(f"  Devices: {len(devices)} device(s)")
        click.echo(f"  Chunk size: {self.config.chunk_size} bytes")
        click.echo(f"  Verify: {self.config.verify}")
        click.echo(f"  Erase: {self.config.erase}")
        click.echo(f"  Parallel: {self.config.parallel}")
        click.echo()

        task_id = self.task_manager.create_flash_task(
            firmware_path=self.config.firmware_file,
            devices_info=devices,
            chunk_size=self.config.chunk_size,
            max_retries=self.config.retry,
            verify=self.config.verify,
            erase=self.config.erase,
        )

        click.echo(f"Task created: {Fore.GREEN}{task_id}{Style.RESET_ALL}")
        click.echo()

        self._monitor_task(task_id)

    def handle_firmware_version(self):
        devices = self._get_devices_from_config()

        if not devices:
            click.echo(f"{Fore.RED}No devices specified{Style.RESET_ALL}", err=True)
            return

        click.echo(f"{Fore.CYAN}Querying firmware versions...{Style.RESET_ALL}")
        click.echo(f"  Devices: {len(devices)} device(s)")
        click.echo()

        task_id = self.task_manager.create_version_query_task(devices)
        click.echo(f"Task created: {Fore.GREEN}{task_id}{Style.RESET_ALL}")
        click.echo()

        task = self.task_manager.wait_for_task(task_id)

        if task:
            reports: List[DeviceVersionReport] = []
            for device_id, result in task.results.items():
                if result:
                    if isinstance(result, dict):
                        reports.append(
                            DeviceVersionReport(
                                device_id=result.get("device_id", device_id),
                                device_name=result.get("device_name", device_id),
                                connection=result.get("connection", ""),
                                current_version=result.get("current_version", ""),
                            )
                        )
                    else:
                        reports.append(result)

            self._display_version_reports(reports)

            if self.config.output:
                report_manager = VersionReportManager()
                path = report_manager.save_report(
                    reports, filename=self.config.output, format=self.config.format
                )
                click.echo()
                click.echo(f"{Fore.GREEN}Report saved to: {path}{Style.RESET_ALL}")

    def _display_version_reports(self, reports: List[DeviceVersionReport]):
        click.echo(f"{Fore.GREEN}Version Reports:{Style.RESET_ALL}")
        click.echo("-" * 70)

        for i, report in enumerate(reports, 1):
            click.echo(f"{i}. {Fore.CYAN}{report.device_name}{Style.RESET_ALL}")
            click.echo(f"   Device ID: {report.device_id}")
            click.echo(f"   Connection: {report.connection}")
            click.echo(f"   Version: {Fore.YELLOW}{report.current_version}{Style.RESET_ALL}")
            click.echo(f"   Status: {self._get_status_color(report.status)}{report.status.value}{Style.RESET_ALL}")
            if i < len(reports):
                click.echo()

        click.echo("-" * 70)

    @staticmethod
    def _get_status_color(status) -> str:
        from version_manager import VersionStatus

        if status == VersionStatus.CURRENT:
            return Fore.GREEN
        elif status == VersionStatus.OUTDATED:
            return Fore.YELLOW
        elif status == VersionStatus.INCOMPATIBLE:
            return Fore.RED
        return Fore.WHITE

    def handle_firmware_compare(self):
        click.echo(f"{Fore.CYAN}Comparing version reports...{Style.RESET_ALL}")

        report_manager = VersionReportManager()
        results = report_manager.compare_reports(
            self.config.version_file_1, self.config.version_file_2
        )

        if not results:
            click.echo(f"{Fore.YELLOW}No matching devices found in reports{Style.RESET_ALL}")
            return

        click.echo()
        click.echo(f"{Fore.GREEN}Comparison Results:{Style.RESET_ALL}")
        click.echo("-" * 70)

        outdated = 0
        newer = 0
        current = 0

        for i, result in enumerate(results, 1):
            status_symbol = ""
            if result.status.value == "outdated":
                status_symbol = "↓"
                outdated += 1
            elif result.status.value == "newer":
                status_symbol = "↑"
                newer += 1
            else:
                current += 1

            compat_str = "" if result.is_compatible else f" {Fore.RED}[INCOMPATIBLE]{Style.RESET_ALL}"

            click.echo(f"{i}. {Fore.CYAN}{result.device_name}{Style.RESET_ALL}{compat_str}")
            click.echo(
                f"   {result.old_version} {Fore.YELLOW}→{Style.RESET_ALL} {result.new_version} {status_symbol}"
            )
            if result.version_change != "none":
                click.echo(f"   Change type: {result.version_change}")
            if i < len(results):
                click.echo()

        click.echo("-" * 70)
        click.echo(f"Summary: {Fore.GREEN}{current} current{Style.RESET_ALL}, "
                   f"{Fore.YELLOW}{outdated} outdated{Style.RESET_ALL}, "
                   f"{Fore.BLUE}{newer} newer{Style.RESET_ALL}")

        if self.config.output:
            output_data = [r.to_dict() for r in results]
            with open(self.config.output, "w") as f:
                json.dump(output_data, f, indent=2)
            click.echo()
            click.echo(f"{Fore.GREEN}Comparison saved to: {self.config.output}{Style.RESET_ALL}")

    def handle_task_status(self):
        task_id = self.config.task_id

        if task_id:
            task = self.task_manager.get_task(task_id)
            if task:
                self._display_task_status(task)
                if self.config.watch:
                    self._watch_task(task_id)
            else:
                click.echo(f"{Fore.RED}Task not found: {task_id}{Style.RESET_ALL}", err=True)
        else:
            tasks = self.task_manager.list_tasks(limit=10)
            self._display_task_list(tasks)

    def handle_task_list(self):
        tasks = self.task_manager.list_tasks(
            limit=self.config.limit, status_filter=self.config.status_filter
        )
        self._display_task_list(tasks)

    def handle_task_cancel(self):
        success = self.task_manager.cancel_task(self.config.task_id, force=self.config.force)
        if success:
            click.echo(f"{Fore.GREEN}Task {self.config.task_id} cancelled{Style.RESET_ALL}")
        else:
            click.echo(f"{Fore.RED}Failed to cancel task {self.config.task_id}{Style.RESET_ALL}", err=True)

    def _display_task_list(self, tasks):
        if not tasks:
            click.echo(f"{Fore.YELLOW}No tasks found{Style.RESET_ALL}")
            return

        click.echo(f"{Fore.GREEN}Task List:{Style.RESET_ALL}")
        click.echo("-" * 80)
        click.echo(f"{'ID':<10} {'Type':<15} {'Status':<12} {'Progress':>8} {'Created'}")
        click.echo("-" * 80)

        for task in tasks:
            status_color = self._get_task_status_color(task.status)
            click.echo(
                f"{task.task_id:<10} "
                f"{task.task_type.value:<15} "
                f"{status_color}{task.status.value:<12}{Style.RESET_ALL} "
                f"{task.progress:>7.1f}% "
                f"{task.created_at.strftime('%H:%M:%S')}"
            )

        click.echo("-" * 80)

    def _display_task_status(self, task):
        click.echo(f"{Fore.GREEN}Task Status:{Style.RESET_ALL}")
        click.echo("-" * 70)
        click.echo(f"Task ID:    {Fore.CYAN}{task.task_id}{Style.RESET_ALL}")
        click.echo(f"Type:       {task.task_type.value}")
        click.echo(f"Status:     {self._get_task_status_color(task.status)}{task.status.value}{Style.RESET_ALL}")
        click.echo(f"Progress:   {task.progress:.1f}%")
        click.echo(f"Created:    {task.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        if task.started_at:
            click.echo(f"Started:    {task.started_at.strftime('%Y-%m-%d %H:%M:%S')}")
        if task.completed_at:
            click.echo(f"Completed:  {task.completed_at.strftime('%Y-%m-%d %H:%M:%S')}")

        click.echo()
        click.echo("Devices:")
        for device_id, progress in task.device_progress.items():
            if isinstance(progress, dict):
                percent = progress.get("progress_percent", 0)
                state = progress.get("state", "unknown")
            else:
                percent = progress.progress_percent
                state = progress.state.value if hasattr(progress.state, "value") else str(progress.state)
            click.echo(f"  {device_id}: {percent:>6.1f}% [{state}]")

        if task.error_message:
            click.echo()
            click.echo(f"{Fore.RED}Error: {task.error_message}{Style.RESET_ALL}")

        click.echo("-" * 70)

    def _watch_task(self, task_id: str):
        click.echo()
        click.echo(f"{Fore.CYAN}Watching task {task_id}...{Style.RESET_ALL}")
        click.echo("Press Ctrl+C to stop")
        click.echo()

        try:
            while True:
                task = self.task_manager.get_task(task_id)
                if not task:
                    break

                click.echo("\033[2K\033[G", nl=False)
                statuses = []
                for device_id, progress in task.device_progress.items():
                    if isinstance(progress, dict):
                        percent = progress.get("progress_percent", 0)
                        state = progress.get("state", "idle")
                    else:
                        percent = progress.progress_percent
                        state = progress.state.value if hasattr(progress.state, "value") else str(progress.state)
                    statuses.append(f"{device_id[:10]}: {percent:>5.1f}%")

                click.echo(" | ".join(statuses), nl=False)
                sys.stdout.flush()

                if task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
                    click.echo()
                    break

                time.sleep(self.config.interval)

            click.echo()
            self._display_task_status(task)

        except KeyboardInterrupt:
            click.echo()
            click.echo(f"{Fore.YELLOW}Stopped watching{Style.RESET_ALL}")

    @staticmethod
    def _get_task_status_color(status) -> str:
        if status == TaskStatus.COMPLETED:
            return Fore.GREEN
        elif status == TaskStatus.FAILED:
            return Fore.RED
        elif status == TaskStatus.RUNNING:
            return Fore.CYAN
        elif status == TaskStatus.CANCELLED:
            return Fore.YELLOW
        return Fore.WHITE

    def _monitor_task(self, task_id: str):
        from firmware_flasher import FlashProgress

        pbar = {}

        def progress_callback(tid: str, progress: FlashProgress):
            if tid != task_id:
                return

            device_id = progress.device_id[:15]
            if device_id not in pbar:
                pbar[device_id] = click.progressbar(
                    length=progress.total_chunks,
                    label=f"{device_id:<15}",
                    show_percent=True,
                )
                pbar[device_id].__enter__()

            pbar[device_id].pos = progress.current_chunk
            pbar[device_id].update(0)

        self.task_manager.add_progress_callback(progress_callback)

        try:
            task = self.task_manager.wait_for_task(task_id)
            for bar in pbar.values():
                bar.render_finish()
                bar.__exit__(None, None, None)

            click.echo()

            if task:
                if task.status == TaskStatus.COMPLETED:
                    click.echo(f"{Fore.GREEN}Task completed successfully!{Style.RESET_ALL}")
                    success_count = sum(
                        1 for r in task.results.values()
                        if getattr(r, "success", False) or (isinstance(r, dict) and r.get("success"))
                    )
                    click.echo(f"Success: {success_count}/{len(task.devices)} devices")
                elif task.status == TaskStatus.FAILED:
                    click.echo(f"{Fore.RED}Task failed{Style.RESET_ALL}")
                    if task.error_message:
                        click.echo(f"Error: {task.error_message}")
                elif task.status == TaskStatus.CANCELLED:
                    click.echo(f"{Fore.YELLOW}Task cancelled{Style.RESET_ALL}")

        except KeyboardInterrupt:
            click.echo()
            click.echo(f"{Fore.YELLOW}Cancelling task...{Style.RESET_ALL}")
            self.task_manager.cancel_task(task_id, force=True)

    def _get_group_manager(self):
        from device_group import GroupManager
        return GroupManager()

    def handle_device_add(self):
        gm = self._get_group_manager()
        from device_comms import DeviceType

        connection = self.config.connection
        name = self.config.device_name or connection
        device_type = None
        if self.config.device_type:
            device_type = DeviceType(self.config.device_type)

        if device_type is None:
            device_type = DeviceType.NETWORK if ":" in connection else DeviceType.SERIAL

        port = None
        if device_type == DeviceType.NETWORK and ":" in connection:
            host, port_str = connection.rsplit(":", 1)
            try:
                port = int(port_str)
            except ValueError:
                port = None

        device_id = f"{device_type.value}_{connection}"

        dev = DeviceInfo(
            device_id=device_id,
            device_type=device_type,
            connection=connection,
            name=name,
            port=port,
            baudrate=self.config.baudrate,
        )

        if gm.add_to_catalog(dev):
            click.echo(f"{Fore.GREEN}Device added: {device_id}{Style.RESET_ALL}")
            if self.config.group_id:
                if gm.add_device_to_group(self.config.group_id, device_id):
                    click.echo(f"  Added to group: {self.config.group_id}")
        else:
            click.echo(f"{Fore.YELLOW}Device already exists: {device_id}{Style.RESET_ALL}")

    def handle_device_list(self):
        gm = self._get_group_manager()
        from device_comms import DeviceType

        dt = None
        if self.config.device_type != "all":
            dt = DeviceType(self.config.device_type)

        devices = gm.list_catalog(device_type=dt)

        if not devices:
            click.echo(f"{Fore.YELLOW}No devices found in catalog{Style.RESET_ALL}")
            return

        click.echo(f"{Fore.GREEN}Device Catalog ({len(devices)} devices):{Style.RESET_ALL}")
        click.echo("-" * 80)
        click.echo(f"{'ID':<25} {'Type':<8} {'Name':<25} {'Connection'}")
        click.echo("-" * 80)

        for dev in devices:
            type_color = Fore.BLUE if dev.device_type == DeviceType.NETWORK else Fore.CYAN
            click.echo(
                f"{dev.device_id:<25} "
                f"{type_color}{dev.device_type.value:<8}{Style.RESET_ALL} "
                f"{dev.name:<25} "
                f"{dev.connection}"
            )

    def handle_device_remove(self):
        gm = self._get_group_manager()
        if gm.remove_from_catalog(self.config.device_id):
            click.echo(f"{Fore.GREEN}Device removed: {self.config.device_id}{Style.RESET_ALL}")
        else:
            click.echo(f"{Fore.RED}Device not found: {self.config.device_id}{Style.RESET_ALL}", err=True)

    def handle_device_import(self):
        gm = self._get_group_manager()
        try:
            count, ids = gm.import_devices_from_file(
                self.config.import_file,
                group_id=self.config.group_id
            )
            click.echo(f"{Fore.GREEN}Imported {count} device(s){Style.RESET_ALL}")
            if self.config.group_id:
                click.echo(f"  Added to group: {self.config.group_id}")
        except Exception as e:
            click.echo(f"{Fore.RED}Import failed: {e}{Style.RESET_ALL}", err=True)

    def handle_device_export(self):
        gm = self._get_group_manager()
        try:
            gm.export_devices_to_file(
                self.config.export_file,
                group_id=self.config.group_id
            )
            click.echo(f"{Fore.GREEN}Exported to: {self.config.export_file}{Style.RESET_ALL}")
        except Exception as e:
            click.echo(f"{Fore.RED}Export failed: {e}{Style.RESET_ALL}", err=True)

    def handle_group_create(self):
        gm = self._get_group_manager()
        group = gm.create_group(
            name=self.config.group_name,
            description=self.config.group_description
        )
        click.echo(f"{Fore.GREEN}Group created: {group.group_id}{Style.RESET_ALL}")
        click.echo(f"  Name: {group.name}")
        if group.description:
            click.echo(f"  Description: {group.description}")

    def handle_group_list(self):
        gm = self._get_group_manager()
        groups = gm.list_groups()

        if not groups:
            click.echo(f"{Fore.YELLOW}No groups found{Style.RESET_ALL}")
            return

        click.echo(f"{Fore.GREEN}Device Groups ({len(groups)} groups):{Style.RESET_ALL}")
        click.echo("-" * 80)
        click.echo(f"{'ID':<12} {'Name':<20} {'Devices':>7} {'Description'}")
        click.echo("-" * 80)

        for g in groups:
            click.echo(
                f"{g.group_id:<12} "
                f"{g.name:<20} "
                f"{len(g.devices):>7} "
                f"{g.description[:30]}"
            )

    def handle_group_show(self):
        gm = self._get_group_manager()
        group = gm.get_group(self.config.group_id)
        if not group:
            click.echo(f"{Fore.RED}Group not found: {self.config.group_id}{Style.RESET_ALL}", err=True)
            return

        click.echo(f"{Fore.GREEN}Group Details:{Style.RESET_ALL}")
        click.echo("-" * 50)
        click.echo(f"ID:          {group.group_id}")
        click.echo(f"Name:        {group.name}")
        click.echo(f"Description: {group.description}")
        click.echo(f"Created:     {group.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        click.echo(f"Updated:     {group.updated_at.strftime('%Y-%m-%d %H:%M:%S')}")
        click.echo(f"Devices:     {len(group.devices)} device(s)")
        click.echo()

        devices = gm.get_group_devices(self.config.group_id)
        if devices:
            click.echo("Devices:")
            for dev in devices:
                click.echo(f"  {Fore.CYAN}{dev.device_id}{Style.RESET_ALL} - {dev.name}")

    def handle_group_delete(self):
        gm = self._get_group_manager()
        if gm.delete_group(self.config.group_id):
            click.echo(f"{Fore.GREEN}Group deleted: {self.config.group_id}{Style.RESET_ALL}")
        else:
            click.echo(f"{Fore.RED}Group not found: {self.config.group_id}{Style.RESET_ALL}", err=True)

    def handle_group_add_device(self):
        gm = self._get_group_manager()
        if gm.add_device_to_group(self.config.group_id, self.config.device_id):
            click.echo(f"{Fore.GREEN}Device added to group{Style.RESET_ALL}")
        else:
            click.echo(f"{Fore.RED}Failed to add device{Style.RESET_ALL}", err=True)

    def handle_group_remove_device(self):
        gm = self._get_group_manager()
        if gm.remove_device_from_group(self.config.group_id, self.config.device_id):
            click.echo(f"{Fore.GREEN}Device removed from group{Style.RESET_ALL}")
        else:
            click.echo(f"{Fore.RED}Failed to remove device{Style.RESET_ALL}", err=True)


def main():
    try:
        from cli import Config
        config = Config()

        cli.main(standalone_mode=False, obj=config)

        if hasattr(config, "command") and config.command:
            executor = CommandExecutor(config)
            executor.execute()

    except click.exceptions.NoSuchCommand as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)
    except click.exceptions.ClickException as e:
        e.show()
        sys.exit(e.exit_code)
    except SystemExit:
        raise
    except Exception as e:
        import traceback
        click.echo(f"{Fore.RED}Unexpected error: {e}{Style.RESET_ALL}", err=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
