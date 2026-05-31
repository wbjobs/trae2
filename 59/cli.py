"""
主入口和指令解析模块
CLI Entry Point Module

提供多级子命令的命令行接口，整合所有巡检模块。
"""

import sys
import time
import logging
from typing import Optional, List
from datetime import datetime

import click
from colorama import init, Fore, Style

from config import ConfigLoader, AppConfig, NodeConfig
from communicator import ClusterCommunicator, ConnectionStatus
from resource_checker import ResourceChecker, ResourceReport
from service_inspector import ServiceInspector, ServiceInspectionReport
from log_aggregator import LogAggregator, InspectionLog, NodeSummary, ClusterSummary

init(autoreset=True)

logger = logging.getLogger(__name__)


def setup_logging(verbose: bool = False):
    """配置日志"""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def print_banner():
    """打印程序横幅"""
    banner = f"""
{Fore.CYAN}{Style.BRIGHT}
╔══════════════════════════════════════════════════════════════╗
║           容器集群资源水位巡检工具 v1.0.0                    ║
║           Container Cluster Inspector                        ║
╚══════════════════════════════════════════════════════════════╝
{Style.RESET_ALL}"""
    print(banner)


def print_status_icon(status: str) -> str:
    """获取状态图标"""
    icons = {
        "NORMAL": f"{Fore.GREEN}✓{Style.RESET_ALL}",
        "WARNING": f"{Fore.YELLOW}⚠{Style.RESET_ALL}",
        "CRITICAL": f"{Fore.RED}✗{Style.RESET_ALL}",
        "UNKNOWN": f"{Fore.LIGHTBLACK_EX}?{Style.RESET_ALL}",
    }
    return icons.get(status, f"{Fore.LIGHTBLACK_EX}?{Style.RESET_ALL}")


def format_status_text(status: str) -> str:
    """格式化状态文本"""
    colors = {
        "NORMAL": Fore.GREEN,
        "WARNING": Fore.YELLOW,
        "CRITICAL": Fore.RED,
        "UNKNOWN": Fore.LIGHTBLACK_EX,
    }
    color = colors.get(status, Fore.LIGHTBLACK_EX)
    return f"{color}{Style.BRIGHT}{status}{Style.RESET_ALL}"


@click.group()
@click.option("--config", "-c", type=click.Path(), help="配置文件路径")
@click.option("--verbose", "-v", is_flag=True, help="显示详细日志")
@click.option("--quiet", "-q", is_flag=True, help="静默模式，只输出错误")
@click.pass_context
def cli(ctx: click.Context, config: Optional[str], verbose: bool, quiet: bool):
    """容器集群资源水位巡检工具集"""
    ctx.ensure_object(dict)
    ctx.obj["config_path"] = config
    ctx.obj["verbose"] = verbose
    ctx.obj["quiet"] = quiet

    if not quiet:
        print_banner()

    setup_logging(verbose)


@cli.group()
@click.pass_context
def inspect(ctx: click.Context):
    """执行巡检操作"""
    pass


@inspect.command("all")
@click.option("--nodes", "-n", multiple=True, help="指定节点名称，可多次指定")
@click.option("--role", "-r", help="按角色筛选节点 (master/worker)")
@click.option("--label", "-l", help="按标签筛选节点")
@click.option("--max-workers", "-w", type=int, default=10, help="最大并发数")
@click.option("--output", "-o", type=click.Choice(["text", "json"]), default="text", help="输出格式")
@click.option("--save-log/--no-save-log", default=True, help="是否保存日志文件")
@click.pass_context
def inspect_all(
    ctx: click.Context,
    nodes: tuple,
    role: Optional[str],
    label: Optional[str],
    max_workers: int,
    output: str,
    save_log: bool,
):
    """执行完整巡检 (资源 + 服务)"""
    config_path = ctx.obj.get("config_path")
    quiet = ctx.obj.get("quiet", False)

    try:
        app_config = ConfigLoader.load(config_path)
    except Exception as e:
        click.echo(f"{Fore.RED}配置加载失败: {e}{Style.RESET_ALL}", err=True)
        sys.exit(1)

    target_nodes = _filter_nodes(app_config, nodes, role, label)
    if not target_nodes:
        click.echo(f"{Fore.YELLOW}没有符合条件的节点{Style.RESET_ALL}")
        sys.exit(0)

    if not quiet:
        click.echo(f"目标节点 ({len(target_nodes)}): {', '.join(n.name for n in target_nodes)}")

    start_time = time.time()

    try:
        with ClusterCommunicator(app_config.ssh) as communicator:
            if not quiet:
                click.echo("\n[1/4] 建立 SSH 连接...")
            connection_results = communicator.connect_nodes(target_nodes, max_workers)
            _print_connection_results(connection_results)

            connected_nodes = [
                n.name for n in connection_results if n.connected
            ]
            if not connected_nodes:
                click.echo(f"{Fore.RED}没有节点连接成功{Style.RESET_ALL}", err=True)
                sys.exit(1)

            if not quiet:
                click.echo(f"\n[2/4] 检测资源水位...")
            resource_checker = ResourceChecker(
                communicator, app_config.thresholds.__dict__
            )
            resource_reports = resource_checker.check_all_resources(
                connected_nodes, "all"
            )

            if not quiet:
                click.echo(f"\n[3/4] 巡检服务状态...")
            service_inspector = ServiceInspector(
                communicator, app_config.thresholds.__dict__
            )
            service_reports = service_inspector.inspect_all(
                connected_nodes, "all"
            )

            if not quiet:
                click.echo(f"\n[4/4] 生成巡检报告...")

            duration = time.time() - start_time

            log_aggregator = LogAggregator(
                app_config.log,
                app_config.global_settings.get("cluster_name", "default-cluster"),
            )

            node_summaries = []
            for node_name in connected_nodes:
                node_config = app_config.get_node_by_name(node_name)
                summary = log_aggregator.generate_node_summary(
                    node_name,
                    node_config,
                    resource_reports.get(node_name),
                    service_reports.get(node_name),
                )
                node_summaries.append(summary)

            cluster_summary = log_aggregator.generate_cluster_summary(node_summaries)

            inspection_log = InspectionLog(
                timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                duration_seconds=duration,
                cluster_summary=cluster_summary,
                resource_reports=resource_reports,
                service_reports=service_reports,
                connection_results=[cr.__dict__ for cr in connection_results],
                errors=[],
            )

            if not quiet:
                log_aggregator.print_summary(inspection_log)

            if save_log:
                log_path = log_aggregator.save_log(inspection_log)
                if not quiet:
                    click.echo(f"\n{Fore.GREEN}巡检日志已保存: {log_path}{Style.RESET_ALL}")

            if output == "json":
                import json
                click.echo(json.dumps(inspection_log.to_dict(), indent=2, ensure_ascii=False, default=str))

            if cluster_summary.total_issues > 0:
                sys.exit(2)
            elif cluster_summary.total_warnings > 0:
                sys.exit(1)

    except Exception as e:
        click.echo(f"{Fore.RED}巡检执行失败: {e}{Style.RESET_ALL}", err=True)
        logger.exception("巡检执行失败")
        sys.exit(1)


@inspect.command("resource")
@click.option("--nodes", "-n", multiple=True, help="指定节点名称")
@click.option("--role", "-r", help="按角色筛选节点")
@click.option("--label", "-l", help="按标签筛选节点")
@click.option("--type", "-t", "check_type", type=click.Choice(["cpu", "memory", "disk", "network", "all"]), default="all", help="检测类型")
@click.option("--max-workers", "-w", type=int, default=10, help="最大并发数")
@click.pass_context
def inspect_resource(
    ctx: click.Context,
    nodes: tuple,
    role: Optional[str],
    label: Optional[str],
    check_type: str,
    max_workers: int,
):
    """检测资源水位 (CPU/内存/磁盘/网络)"""
    config_path = ctx.obj.get("config_path")
    quiet = ctx.obj.get("quiet", False)

    try:
        app_config = ConfigLoader.load(config_path)
    except Exception as e:
        click.echo(f"{Fore.RED}配置加载失败: {e}{Style.RESET_ALL}", err=True)
        sys.exit(1)

    target_nodes = _filter_nodes(app_config, nodes, role, label)
    if not target_nodes:
        click.echo(f"{Fore.YELLOW}没有符合条件的节点{Style.RESET_ALL}")
        sys.exit(0)

    with ClusterCommunicator(app_config.ssh) as communicator:
        click.echo("建立 SSH 连接...")
        connection_results = communicator.connect_nodes(target_nodes, max_workers)
        _print_connection_results(connection_results)

        connected_nodes = [n.name for n in connection_results if n.connected]
        if not connected_nodes:
            click.echo(f"{Fore.RED}没有节点连接成功{Style.RESET_ALL}", err=True)
            sys.exit(1)

        click.echo(f"\n检测资源水位 ({check_type})...")
        resource_checker = ResourceChecker(
            communicator, app_config.thresholds.__dict__
        )
        resource_reports = resource_checker.check_all_resources(
            connected_nodes, check_type
        )

        _print_resource_reports(resource_reports)


@inspect.command("service")
@click.option("--nodes", "-n", multiple=True, help="指定节点名称")
@click.option("--role", "-r", help="按角色筛选节点")
@click.option("--label", "-l", help="按标签筛选节点")
@click.option("--type", "-t", "inspect_type", type=click.Choice(["docker", "containers", "services", "all"]), default="all", help="巡检类型")
@click.option("--max-workers", "-w", type=int, default=10, help="最大并发数")
@click.pass_context
def inspect_service(
    ctx: click.Context,
    nodes: tuple,
    role: Optional[str],
    label: Optional[str],
    inspect_type: str,
    max_workers: int,
):
    """巡检服务状态 (Docker/容器/系统服务)"""
    config_path = ctx.obj.get("config_path")
    quiet = ctx.obj.get("quiet", False)

    try:
        app_config = ConfigLoader.load(config_path)
    except Exception as e:
        click.echo(f"{Fore.RED}配置加载失败: {e}{Style.RESET_ALL}", err=True)
        sys.exit(1)

    target_nodes = _filter_nodes(app_config, nodes, role, label)
    if not target_nodes:
        click.echo(f"{Fore.YELLOW}没有符合条件的节点{Style.RESET_ALL}")
        sys.exit(0)

    with ClusterCommunicator(app_config.ssh) as communicator:
        click.echo("建立 SSH 连接...")
        connection_results = communicator.connect_nodes(target_nodes, max_workers)
        _print_connection_results(connection_results)

        connected_nodes = [n.name for n in connection_results if n.connected]
        if not connected_nodes:
            click.echo(f"{Fore.RED}没有节点连接成功{Style.RESET_ALL}", err=True)
            sys.exit(1)

        click.echo(f"\n巡检服务状态 ({inspect_type})...")
        service_inspector = ServiceInspector(
            communicator, app_config.thresholds.__dict__
        )
        service_reports = service_inspector.inspect_all(
            connected_nodes, inspect_type
        )

        _print_service_reports(service_reports)


@cli.group()
@click.pass_context
def node(ctx: click.Context):
    """节点管理操作"""
    pass


@node.command("list")
@click.option("--config", "-c", type=click.Path(), help="配置文件路径")
@click.option("--role", "-r", help="按角色筛选")
@click.option("--label", "-l", help="按标签筛选")
@click.pass_context
def node_list(
    ctx: click.Context,
    config: Optional[str],
    role: Optional[str],
    label: Optional[str],
):
    """列出配置中的所有节点"""
    try:
        config_path = config or ctx.obj.get("config_path")
        app_config = ConfigLoader.load(config_path)
    except Exception as e:
        click.echo(f"{Fore.RED}配置加载失败: {e}{Style.RESET_ALL}", err=True)
        sys.exit(1)

    target_nodes = _filter_nodes(app_config, (), role, label)

    click.echo(f"\n配置节点列表 (共 {len(target_nodes)} 个):")
    click.echo("-" * 80)
    for node in target_nodes:
        status = "启用" if node.enabled else "禁用"
        click.echo(
            f"  {print_status_icon('NORMAL' if node.enabled else 'UNKNOWN')} "
            f"{node.name:20s} | {node.host:15s}:{node.port:<5d} | "
            f"{node.role:10s} | {status}"
        )
    click.echo("-" * 80)


@node.command("test")
@click.option("--nodes", "-n", multiple=True, help="指定节点名称")
@click.option("--role", "-r", help="按角色筛选")
@click.option("--label", "-l", help="按标签筛选")
@click.option("--max-workers", "-w", type=int, default=10, help="最大并发数")
@click.pass_context
def node_test(
    ctx: click.Context,
    nodes: tuple,
    role: Optional[str],
    label: Optional[str],
    max_workers: int,
):
    """测试节点 SSH 连接"""
    config_path = ctx.obj.get("config_path")

    try:
        app_config = ConfigLoader.load(config_path)
    except Exception as e:
        click.echo(f"{Fore.RED}配置加载失败: {e}{Style.RESET_ALL}", err=True)
        sys.exit(1)

    target_nodes = _filter_nodes(app_config, nodes, role, label)
    if not target_nodes:
        click.echo(f"{Fore.YELLOW}没有符合条件的节点{Style.RESET_ALL}")
        sys.exit(0)

    click.echo(f"\n测试节点连接 ({len(target_nodes)} 个节点)...")
    click.echo("-" * 80)

    with ClusterCommunicator(app_config.ssh) as communicator:
        results = communicator.connect_nodes(target_nodes, max_workers)
        _print_connection_results(results)

    success_count = len([r for r in results if r.connected])
    fail_count = len(results) - success_count

    click.echo("-" * 80)
    click.echo(f"连接结果: {Fore.GREEN}{success_count} 成功{Style.RESET_ALL} / {Fore.RED}{fail_count} 失败{Style.RESET_ALL}")

    if fail_count > 0:
        sys.exit(1)


@cli.group()
@click.pass_context
def config(ctx: click.Context):
    """配置管理操作"""
    pass


@config.command("show")
@click.option("--config", "-c", type=click.Path(), help="配置文件路径")
@click.pass_context
def config_show(ctx: click.Context, config: Optional[str]):
    """显示当前配置"""
    import json

    try:
        config_path = config or ctx.obj.get("config_path")
        app_config = ConfigLoader.load(config_path)
    except Exception as e:
        click.echo(f"{Fore.RED}配置加载失败: {e}{Style.RESET_ALL}", err=True)
        sys.exit(1)

    click.echo(f"\n配置文件路径: {app_config.global_settings.get('_config_path', 'N/A')}")
    click.echo(f"集群名称: {app_config.global_settings.get('cluster_name', 'N/A')}")
    click.echo(f"环境: {app_config.global_settings.get('environment', 'N/A')}")
    click.echo(f"\n阈值配置:")
    click.echo(f"  CPU 警告/严重: {app_config.thresholds.cpu_warning}% / {app_config.thresholds.cpu_critical}%")
    click.echo(f"  内存 警告/严重: {app_config.thresholds.memory_warning}% / {app_config.thresholds.memory_critical}%")
    click.echo(f"  磁盘 警告/严重: {app_config.thresholds.disk_warning}% / {app_config.thresholds.disk_critical}%")
    click.echo(f"  容器重启 警告/严重: {app_config.thresholds.container_restart_warning} / {app_config.thresholds.container_restart_critical}")
    click.echo(f"\n日志配置:")
    click.echo(f"  日志目录: {app_config.log.log_dir}")
    click.echo(f"  日志格式: {app_config.log.log_format}")
    click.echo(f"\n节点数量: {len(app_config.nodes)}")


@config.command("init")
@click.option("--output", "-o", type=click.Path(), default="config.yaml", help="输出文件路径")
@click.option("--force", "-f", is_flag=True, help="覆盖已存在的文件")
@click.pass_context
def config_init(ctx: click.Context, output: str, force: bool):
    """生成示例配置文件"""
    import os

    if os.path.exists(output) and not force:
        click.echo(f"{Fore.YELLOW}文件已存在: {output}{Style.RESET_ALL}")
        click.echo("使用 --force 选项覆盖")
        sys.exit(0)

    try:
        path = ConfigLoader.generate_default_config(output)
        click.echo(f"{Fore.GREEN}配置文件已生成: {path}{Style.RESET_ALL}")
        click.echo("\n请修改配置文件中的节点信息和密码后使用。")
    except Exception as e:
        click.echo(f"{Fore.RED}生成配置文件失败: {e}{Style.RESET_ALL}", err=True)
        sys.exit(1)


@cli.command("version")
def version():
    """显示版本信息"""
    from __init__ import __version__
    click.echo(f"容器集群资源水位巡检工具 v{__version__}")


def _filter_nodes(
    app_config: AppConfig,
    nodes: tuple,
    role: Optional[str],
    label: Optional[str],
) -> List[NodeConfig]:
    """筛选节点"""
    if nodes:
        return [
            n for n in app_config.nodes
            if n.name in nodes and n.enabled
        ]
    elif role:
        return app_config.get_nodes_by_role(role)
    elif label:
        return app_config.get_nodes_by_label(label)
    else:
        return app_config.get_enabled_nodes()


def _print_connection_results(results: List[ConnectionStatus]):
    """打印连接结果"""
    for result in results:
        status = f"{Fore.GREEN}✓ 成功{Style.RESET_ALL}" if result.connected else f"{Fore.RED}✗ 失败{Style.RESET_ALL}"
        latency = f"{result.latency:.3f}s"
        error_info = f" ({result.error})" if result.error else ""
        click.echo(f"  {status} {result.node_name:20s} - {result.host:15s} [{latency}]{error_info}")


def _safe_text(text: str) -> str:
    """安全处理文本，避免编码问题"""
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    try:
        return text.encode("utf-8", errors="replace").decode("utf-8")
    except Exception:
        return text


def _print_resource_reports(reports: dict):
    """打印资源报告"""
    click.echo("\n" + "=" * 80)
    click.echo("资源检测结果")
    click.echo("=" * 80)

    for node_name, report in reports.items():
        if report is None:
            click.echo(f"\n{_safe_text(node_name)}: {Fore.RED}检测失败{Style.RESET_ALL}")
            continue

        click.echo(f"\n{'─' * 40}")
        click.echo(
            f"{print_status_icon(report.overall_status)} {_safe_text(node_name)} "
            f"[整体: {format_status_text(report.overall_status)}]"
        )
        click.echo(f"{'─' * 40}")

        if report.cpu:
            cpu = report.cpu
            click.echo(
                f"  CPU: {cpu.usage_percent:.1f}% [{format_status_text(cpu.status.level)}] "
                f"(负载: {cpu.load_avg_1m}/{cpu.load_avg_5m}/{cpu.load_avg_15m})"
            )
            click.echo(
                f"       用户态: {cpu.user_percent:.1f}% | 系统态: {cpu.system_percent:.1f}% | "
                f"空闲: {cpu.idle_percent:.1f}% | IO等待: {cpu.wait_percent:.1f}%"
            )

        if report.memory:
            mem = report.memory
            click.echo(
                f"  内存: {mem.usage_percent:.1f}% [{format_status_text(mem.status.level)}] "
                f"({mem.used_mb:.0f}/{mem.total_mb:.0f} MB)"
            )
            click.echo(
                f"       可用: {mem.available_mb:.0f}MB | 缓存: {mem.buffers_mb + mem.cached_mb:.0f}MB"
            )
            if mem.swap_total_mb > 0:
                click.echo(
                    f"       Swap: {mem.swap_used_mb:.0f}/{mem.swap_total_mb:.0f}MB "
                    f"({mem.swap_usage_percent:.1f}%)"
                )

        if report.disks:
            click.echo("  磁盘:")
            for disk in report.disks:
                click.echo(
                    f"    {_safe_text(disk.mount_point)} ({_safe_text(disk.fstype)}): "
                    f"{disk.usage_percent:.1f}% [{format_status_text(disk.status.level)}] "
                    f"({disk.used_gb:.1f}/{disk.total_gb:.1f} GB)"
                )
                if disk.inodes_total > 0:
                    click.echo(
                        f"      Inodes: {disk.inodes_used}/{disk.inodes_total} "
                        f"({disk.inodes_usage_percent:.1f}%)"
                    )

        if report.networks:
            click.echo("  网络:")
            for net in report.networks:
                rx_mb = net.rx_bytes / (1024 * 1024)
                tx_mb = net.tx_bytes / (1024 * 1024)
                click.echo(
                    f"    {_safe_text(net.interface)} ({_safe_text(net.ip_address)}): "
                    f"RX: {rx_mb:.2f}MB | TX: {tx_mb:.2f}MB"
                )
                error_count = net.rx_errors + net.tx_errors + net.rx_dropped + net.tx_dropped
                if error_count > 0:
                    click.echo(
                        f"      异常: 错误 {net.rx_errors + net.tx_errors}, "
                        f"丢包 {net.rx_dropped + net.tx_dropped}"
                    )

        if report.error:
            click.echo(f"  错误: {Fore.RED}{_safe_text(report.error)}{Style.RESET_ALL}")


def _print_service_reports(reports: dict):
    """打印服务报告"""
    click.echo("\n" + "=" * 80)
    click.echo("服务巡检结果")
    click.echo("=" * 80)

    for node_name, report in reports.items():
        if report is None:
            click.echo(f"\n{_safe_text(node_name)}: {Fore.RED}巡检失败{Style.RESET_ALL}")
            continue

        click.echo(f"\n{'─' * 40}")
        click.echo(
            f"{print_status_icon(report.overall_status)} {_safe_text(node_name)} "
            f"[整体: {format_status_text(report.overall_status)}]"
        )
        click.echo(f"{'─' * 40}")

        if report.docker_status:
            ds = report.docker_status
            docker_status = f"{Fore.GREEN}运行中{Style.RESET_ALL}" if ds.service_running else f"{Fore.RED}未运行{Style.RESET_ALL}"
            click.echo(f"  Docker: {docker_status} ({_safe_text(ds.service_version)})")
            click.echo(
                f"  容器: {ds.containers_running}运行 / "
                f"{ds.containers_stopped}停止 / {ds.containers_total}总数"
            )

        if report.containers:
            click.echo(f"\n  容器列表:")
            for container in report.containers:
                state_icon = {
                    "running": f"{Fore.GREEN}●{Style.RESET_ALL}",
                    "exited": f"{Fore.LIGHTBLACK_EX}●{Style.RESET_ALL}",
                    "paused": f"{Fore.YELLOW}●{Style.RESET_ALL}",
                }.get(container.state, f"{Fore.RED}●{Style.RESET_ALL}")
                click.echo(
                    f"    {state_icon} {_safe_text(container.name):30s} "
                    f"[{_safe_text(container.state):10s}] "
                    f"重启: {container.restart_count}次"
                )
                if container.status_message:
                    click.echo(
                        f"      状态: {_safe_text(container.status_message)}"
                    )

        if report.system_services:
            click.echo(f"\n  系统服务:")
            for svc in report.system_services:
                svc_status = f"{Fore.GREEN}运行中{Style.RESET_ALL}" if svc.active else f"{Fore.RED}未运行{Style.RESET_ALL}"
                click.echo(f"    {_safe_text(svc.service_name):20s}: {svc_status}")

        if report.critical_issues:
            click.echo(f"\n  {Fore.RED}严重问题 ({len(report.critical_issues)}):{Style.RESET_ALL}")
            for issue in report.critical_issues:
                click.echo(f"    ✗ {_safe_text(issue)}")

        if report.warnings:
            click.echo(f"\n  {Fore.YELLOW}警告 ({len(report.warnings)}):{Style.RESET_ALL}")
            for warning in report.warnings:
                click.echo(f"    ⚠ {_safe_text(warning)}")


@cli.group()
@click.pass_context
def schedule(ctx: click.Context):
    """定时任务调度操作"""
    pass


@schedule.command("list")
@click.pass_context
def schedule_list(ctx: click.Context):
    """列出所有定时任务"""
    from scheduler import TaskScheduler

    scheduler = TaskScheduler()
    tasks = scheduler.list_tasks()

    if not tasks:
        click.echo(f"{Fore.YELLOW}暂无定时任务{Style.RESET_ALL}")
        return

    click.echo(f"\n定时任务列表 ({len(tasks)} 个):")
    click.echo("-" * 100)
    click.echo(f"{'任务ID':<25} {'名称':<20} {'状态':<10} {'类型':<10} {'执行次数':<10}")
    click.echo("-" * 100)

    for task in tasks:
        next_run = task.next_run_at.strftime("%H:%M:%S") if task.next_run_at else "N/A"
        click.echo(
            f"{task.task_id:<25} {task.name:<20} "
            f"{format_status_text(task.status.value.upper()):<10} "
            f"{task.config.schedule_type.value:<10} {task.run_count:<10}"
        )

    click.echo("-" * 100)


@schedule.command("add")
@click.option("--name", required=True, help="任务名称")
@click.option("--type", "-t", "schedule_type", type=click.Choice(["interval", "once"]), default="interval", help="调度类型")
@click.option("--interval", "-i", type=int, default=300, help="执行间隔（秒），仅 interval 类型")
@click.option("--node", "-n", "target_nodes", multiple=True, help="指定节点名称，可多次指定")
@click.option("--check-type", "-c", multiple=True, default=["all"], help="检查类型")
@click.pass_context
def schedule_add(
    ctx: click.Context,
    name: str,
    schedule_type: str,
    interval: int,
    target_nodes: tuple,
    check_type: tuple,
):
    """添加定时巡检任务"""
    from scheduler import TaskScheduler, ScheduleConfig, ScheduleType

    scheduler = TaskScheduler()

    stype = ScheduleType.INTERVAL if schedule_type == "interval" else ScheduleType.ONCE
    config = ScheduleConfig(
        schedule_type=stype,
        interval_seconds=interval,
    )

    task_id = scheduler.add_task(
        name=name,
        schedule_config=config,
        target_nodes=list(target_nodes) if target_nodes else [],
        check_types=list(check_type),
    )

    click.echo(f"{Fore.GREEN}定时任务已添加{Style.RESET_ALL}")
    click.echo(f"  任务ID: {task_id}")
    click.echo(f"  名称: {name}")
    click.echo(f"  类型: {schedule_type}")
    if schedule_type == "interval":
        click.echo(f"  间隔: {interval} 秒")


@schedule.command("remove")
@click.argument("task_id")
@click.pass_context
def schedule_remove(ctx: click.Context, task_id: str):
    """移除定时任务"""
    from scheduler import TaskScheduler

    scheduler = TaskScheduler()
    if scheduler.remove_task(task_id):
        click.echo(f"{Fore.GREEN}任务已移除: {task_id}{Style.RESET_ALL}")
    else:
        click.echo(f"{Fore.RED}任务不存在: {task_id}{Style.RESET_ALL}")
        sys.exit(1)


@schedule.command("run")
@click.argument("task_id")
@click.pass_context
def schedule_run(ctx: click.Context, task_id: str):
    """立即执行一次任务"""
    from scheduler import TaskScheduler

    scheduler = TaskScheduler()
    if scheduler.run_once(task_id):
        click.echo(f"{Fore.GREEN}任务已执行: {task_id}{Style.RESET_ALL}")
    else:
        click.echo(f"{Fore.RED}任务不存在: {task_id}{Style.RESET_ALL}")
        sys.exit(1)


@cli.group()
@click.pass_context
def mark(ctx: click.Context):
    """高水位节点标记操作"""
    pass


@mark.command("list")
@click.option("--level", "-l", type=click.Choice(["all", "warning", "critical"]), default="all", help="按级别筛选")
@click.option("--include-resolved", "-r", is_flag=True, help="包含已解决的标记")
@click.pass_context
def mark_list(ctx: click.Context, level: str, include_resolved: bool):
    """列出高水位标记"""
    from node_marker import HighWaterMarker, WaterLevel

    marker = HighWaterMarker()

    filter_level = None
    if level == "warning":
        filter_level = WaterLevel.WARNING
    elif level == "critical":
        filter_level = WaterLevel.CRITICAL

    marks = marker.get_all_marks(level=filter_level, include_resolved=include_resolved)

    if not marks:
        click.echo(f"{Fore.GREEN}暂无高水位标记{Style.RESET_ALL}")
        return

    click.echo(f"\n高水位标记列表 ({len(marks)} 个):")
    click.echo("-" * 100)
    click.echo(f"{'节点':<20} {'类型':<18} {'级别':<10} {'值':<12} {'状态':<12}")
    click.echo("-" * 100)

    for mark in marks:
        status = "已解决" if mark.resolved else "进行中"
        status_color = Fore.GREEN if mark.resolved else Fore.RED
        click.echo(
            f"{mark.node_name:<20} {mark.mark_type.value:<18} "
            f"{format_status_text(mark.level.value.upper()):<10} "
            f"{mark.value:<6.1f}/{mark.threshold:<5.1f} "
            f"{status_color}{status:<10}{Style.RESET_ALL}"
        )

    click.echo("-" * 100)

    summary = marker.get_summary()
    click.echo(
        f"\n统计: 活跃节点 {summary['active_nodes']} | "
        f"严重 {Fore.RED}{summary['critical_marks']}{Style.RESET_ALL} | "
        f"警告 {Fore.YELLOW}{summary['warning_marks']}{Style.RESET_ALL}"
    )


@mark.command("nodes")
@click.pass_context
def mark_nodes(ctx: click.Context):
    """查看有高水位问题的节点"""
    from node_marker import HighWaterMarker

    marker = HighWaterMarker()
    nodes = marker.get_high_water_nodes()

    if not nodes:
        click.echo(f"{Fore.GREEN}所有节点正常{Style.RESET_ALL}")
        return

    click.echo(f"\n存在高水位问题的节点 ({len(nodes)} 个):")
    click.echo("-" * 80)

    for node_name, marks in nodes.items():
        critical = len([m for m in marks if m.level.value == "critical"])
        warning = len([m for m in marks if m.level.value == "warning"])
        click.echo(
            f"{print_status_icon('CRITICAL' if critical > 0 else 'WARNING')} "
            f"{node_name:<20} "
            f"严重: {Fore.RED}{critical}{Style.RESET_ALL} | "
            f"警告: {Fore.YELLOW}{warning}{Style.RESET_ALL}"
        )

    click.echo("-" * 80)


@mark.command("resolve")
@click.argument("node_name")
@click.option("--type", "-t", help="标记类型，不指定则解决该节点所有标记")
@click.pass_context
def mark_resolve(ctx: click.Context, node_name: str, type: Optional[str]):
    """标记为已解决"""
    from node_marker import HighWaterMarker, MarkType

    marker = HighWaterMarker()
    mark_type = MarkType(type) if type else None

    if marker.mark_resolved(node_name, mark_type):
        click.echo(f"{Fore.GREEN}节点 {node_name} 标记已解决{Style.RESET_ALL}")
    else:
        click.echo(f"{Fore.YELLOW}节点 {node_name} 无活跃标记{Style.RESET_ALL}")


@mark.command("ack")
@click.argument("node_name")
@click.option("--type", "-t", help="标记类型，不指定则确认该节点所有标记")
@click.pass_context
def mark_ack(ctx: click.Context, node_name: str, type: Optional[str]):
    """确认标记"""
    from node_marker import HighWaterMarker, MarkType

    marker = HighWaterMarker()
    mark_type = MarkType(type) if type else None

    if marker.acknowledge(node_name, mark_type):
        click.echo(f"{Fore.GREEN}节点 {node_name} 标记已确认{Style.RESET_ALL}")
    else:
        click.echo(f"{Fore.YELLOW}节点 {node_name} 无标记{Style.RESET_ALL}")


@mark.command("cleanup")
@click.option("--days", "-d", type=int, default=30, help="清理 N 天前的已解决标记")
@click.pass_context
def mark_cleanup(ctx: click.Context, days: int):
    """清理旧的已解决标记"""
    from node_marker import HighWaterMarker

    marker = HighWaterMarker()
    removed = marker.cleanup_old_marks(days)
    click.echo(f"{Fore.GREEN}已清理 {removed} 个旧标记{Style.RESET_ALL}")


@cli.group()
@click.pass_context
def perf(ctx: click.Context):
    """性能优化相关命令"""
    pass


@perf.command("fast-inspect")
@click.option("--nodes", "-n", multiple=True, help="指定节点名称")
@click.option("--role", "-r", help="按角色筛选节点")
@click.option("--batch-size", "-b", type=int, default=50, help="每批处理节点数")
@click.option("--max-workers", "-w", type=int, default=20, help="最大并发数")
@click.pass_context
def perf_fast_inspect(
    ctx: click.Context,
    nodes: tuple,
    role: Optional[str],
    batch_size: int,
    max_workers: int,
):
    """快速巡检（使用智能分片和并发优化）"""
    config_path = ctx.obj.get("config_path")

    try:
        app_config = ConfigLoader.load(config_path)
    except Exception as e:
        click.echo(f"{Fore.RED}配置加载失败: {e}{Style.RESET_ALL}", err=True)
        sys.exit(1)

    target_nodes = _filter_nodes(app_config, nodes, role, None)
    if not target_nodes:
        click.echo(f"{Fore.YELLOW}没有符合条件的节点{Style.RESET_ALL}")
        sys.exit(0)

    click.echo(f"快速巡检模式: {len(target_nodes)} 个节点, 每批 {batch_size} 个")

    import time
    start_time = time.time()

    with ClusterCommunicator(app_config.ssh) as communicator:
        click.echo("\n[1/2] 智能分片连接节点...")
        connection_results = communicator.smart_connect_nodes(
            target_nodes, max_workers, batch_size
        )

        connected_nodes = [n.node_name for n in connection_results if n.connected]
        click.echo(f"  连接成功: {len(connected_nodes)}/{len(target_nodes)}")

        if not connected_nodes:
            click.echo(f"{Fore.RED}没有节点连接成功{Style.RESET_ALL}", err=True)
            sys.exit(1)

        click.echo("\n[2/2] 快速资源检测...")
        resource_checker = ResourceChecker(
            communicator, app_config.thresholds.__dict__
        )
        resource_reports = resource_checker.check_all_resources(
            connected_nodes, "all"
        )

        _print_resource_reports(resource_reports)

        stats = communicator.get_performance_stats()
        duration = time.time() - start_time

        click.echo(f"\n{Fore.CYAN}性能统计:{Style.RESET_ALL}")
        click.echo(f"  总耗时: {duration:.2f}s")
        click.echo(f"  平均每节点: {duration / len(target_nodes):.3f}s")
        click.echo(f"  连接节点: {stats['connected_nodes']}")
        click.echo(f"  缓存大小: {stats['cache_size']}")


def main():
    """主入口函数"""
    try:
        cli(standalone_mode=False)
    except SystemExit:
        raise
    except Exception as e:
        click.echo(f"{Fore.RED}执行出错: {e}{Style.RESET_ALL}", err=True)
        logger.exception("执行出错")
        sys.exit(1)


if __name__ == "__main__":
    main()
