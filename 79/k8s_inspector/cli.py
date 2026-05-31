import os
import sys
import logging
import signal
import click
from typing import Any, Callable, Dict, List, Optional, Tuple

from .config import ConfigLoader
from .node_communicator import NodeCommunicator
from .resource_detector import ResourceDetector
from .pod_inspector import PodInspector
from .log_aggregator import LogAggregator
from .scheduler import InspectionScheduler, CronTrigger, IntervalTrigger


def setup_logging(level: str = "INFO") -> None:
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def _filter_nodes(
    nodes: List[Dict[str, Any]], nodes_filter: Tuple[str, ...]
) -> List[Dict[str, Any]]:
    if not nodes_filter:
        return nodes
    return [
        n
        for n in nodes
        if n.get("name") in nodes_filter or n.get("address") in nodes_filter
    ]


def _get_execution_params(
    ctx: click.Context, no_parallel: bool
) -> Tuple[bool, int]:
    parallel = ctx.obj["parallel"] and not no_parallel
    max_workers = ctx.obj["max_workers"]
    return parallel, max_workers


def _output_results(
    ctx: click.Context,
    results: Dict[str, Any],
    aggregator: LogAggregator,
    use_rich: bool,
    save_json: bool,
    prefix: str,
    show_resource_summary: bool = True,
    show_pod_summary: bool = False,
) -> None:
    if use_rich:
        aggregator.format_rich_resource_results(results)
    else:
        output = aggregator.format_resource_results(results)
        click.echo(output)

    if save_json:
        filepath = aggregator.save_to_file(results, prefix=prefix)
        click.echo(click.style(f"\n结果已保存到: {filepath}", fg="green"))

    if show_resource_summary or show_pod_summary:
        aggregator.print_summary(
            resource_data=results if show_resource_summary else None,
            pod_data=results if show_pod_summary else None,
        )


def _node_detect_command(
    ctx: click.Context,
    nodes_filter: Tuple[str, ...],
    no_parallel: bool,
    save_json: bool,
    use_rich: bool,
    detect_func: Callable,
    resource_name: str,
    prefix: str,
) -> None:
    config = ctx.obj["config"]
    detector = ctx.obj["detector"]
    aggregator = ctx.obj["aggregator"]

    nodes = _filter_nodes(config.nodes, nodes_filter)
    if not nodes:
        click.echo(click.style("未找到匹配的节点", fg="yellow"))
        ctx.exit(0)

    click.echo(click.style(f"正在检测 {len(nodes)} 个节点的 {resource_name}...", fg="cyan"))
    parallel, max_workers = _get_execution_params(ctx, no_parallel)

    try:
        raw_results = detect_func(nodes, parallel, max_workers)
        results = {"nodes": raw_results, "timestamp": detector._get_timestamp()}
        _output_results(ctx, results, aggregator, use_rich, save_json, prefix)
    except Exception as e:
        click.echo(click.style(f"检测失败: {e}", fg="red"), err=True)
        ctx.exit(1)


_common_node_options = [
    click.option("-n", "--node", "nodes_filter", multiple=True, help="指定节点名称或 IP，可多次指定"),
    click.option("--no-parallel", is_flag=True, default=False, help="禁用并行执行"),
    click.option("--save-json", is_flag=True, default=False, help="保存为 JSON 文件"),
    click.option("--rich", "use_rich", is_flag=True, default=False, help="使用 Rich 美化输出"),
]


def _add_options(options: List[Callable]) -> Callable:
    def _add_options_decorator(func: Callable) -> Callable:
        for option in reversed(options):
            func = option(func)
        return func
    return _add_options_decorator


@click.group(
    help="K8s 集群节点资源水位巡检命令行工具集\n\n"
    "用于批量检测集群节点 CPU、内存、磁盘使用率，\n"
    "巡检 Pod 运行状态，汇总输出巡检日志。",
    context_settings={"help_option_names": ["-h", "--help"]},
)
@click.option("-c", "--config", "config_path", type=click.Path(exists=False, dir_okay=False), default=None, help="指定配置文件路径")
@click.option("-v", "--verbose", is_flag=True, default=False, help="启用详细日志输出")
@click.version_option(version="1.1.0", prog_name="k8s-inspector")
@click.pass_context
def cli(ctx: click.Context, config_path: Optional[str], verbose: bool) -> None:
    ctx.ensure_object(dict)
    try:
        config = ConfigLoader(config_path)
    except FileNotFoundError as e:
        click.echo(f"{click.style('错误:', fg='red')} {e}", err=True)
        ctx.exit(1)

    ctx.obj["config"] = config
    ctx.obj["verbose"] = verbose
    ctx.obj["resource_history"] = {}

    log_level = "DEBUG" if verbose else config.global_config.get("log_level", "INFO")
    setup_logging(log_level)

    ctx.obj["output_format"] = config.global_config.get("output_format", "table")
    ctx.obj["parallel"] = config.global_config.get("parallel", True)
    ctx.obj["max_workers"] = config.global_config.get("max_workers", 10)
    ctx.obj["encoding"] = config.global_config.get("encoding", "utf-8")


@cli.group(help="节点资源检测相关命令")
@click.pass_context
def node(ctx: click.Context) -> None:
    config = ctx.obj["config"]
    ctx.obj["communicator"] = NodeCommunicator(config.ssh_config)
    ctx.obj["detector"] = ResourceDetector(ctx.obj["communicator"], config.thresholds, config.disk_paths)
    ctx.obj["aggregator"] = LogAggregator(ctx.obj["output_format"], encoding=ctx.obj["encoding"])


@node.command("cpu", help="检测节点 CPU 使用率")
@_add_options(_common_node_options)
@click.pass_context
def node_cpu(ctx: click.Context, **kwargs) -> None:
    _node_detect_command(
        ctx, kwargs["nodes_filter"], kwargs["no_parallel"],
        kwargs["save_json"], kwargs["use_rich"],
        ctx.obj["detector"].detect_cpu, "CPU 使用率", "cpu_inspection"
    )


@node.command("memory", help="检测节点内存使用率")
@_add_options(_common_node_options)
@click.pass_context
def node_memory(ctx: click.Context, **kwargs) -> None:
    _node_detect_command(
        ctx, kwargs["nodes_filter"], kwargs["no_parallel"],
        kwargs["save_json"], kwargs["use_rich"],
        ctx.obj["detector"].detect_memory, "内存使用率", "memory_inspection"
    )


@node.command("disk", help="检测节点磁盘使用率")
@_add_options(_common_node_options)
@click.pass_context
def node_disk(ctx: click.Context, **kwargs) -> None:
    _node_detect_command(
        ctx, kwargs["nodes_filter"], kwargs["no_parallel"],
        kwargs["save_json"], kwargs["use_rich"],
        ctx.obj["detector"].detect_disk, "磁盘使用率", "disk_inspection"
    )


@node.command("all", help="检测节点所有资源 (CPU/内存/磁盘)")
@_add_options(_common_node_options)
@click.option("--optimized", is_flag=True, default=False, help="使用优化轮询策略，优先巡检高负载节点")
@click.option("--mark-high-load", is_flag=True, default=True, help="自动标记高负载节点")
@click.pass_context
def node_all(ctx: click.Context, optimized: bool, mark_high_load: bool, **kwargs) -> None:
    config = ctx.obj["config"]
    detector = ctx.obj["detector"]
    aggregator = ctx.obj["aggregator"]

    nodes = _filter_nodes(config.nodes, kwargs["nodes_filter"])
    if not nodes:
        click.echo(click.style("未找到匹配的节点", fg="yellow"))
        ctx.exit(0)

    click.echo(click.style(f"正在检测 {len(nodes)} 个节点的所有资源...", fg="cyan"))
    parallel, max_workers = _get_execution_params(ctx, kwargs["no_parallel"])

    try:
        if optimized:
            click.echo(click.style("使用优化轮询策略...", fg="blue"))
            results = detector.detect_all_optimized(
                nodes,
                resource_history=ctx.obj["resource_history"],
                parallel=parallel,
                max_workers=max_workers,
                mark_high_load=mark_high_load,
            )
            for node_result in results.get("nodes", []):
                addr = node_result.get("node")
                if addr:
                    if addr not in ctx.obj["resource_history"]:
                        ctx.obj["resource_history"][addr] = []
                    ctx.obj["resource_history"][addr].append(node_result)
        else:
            results = detector.detect_all(nodes, parallel, max_workers)
            if mark_high_load:
                results = detector.mark_high_load_nodes(results, ctx.obj["resource_history"])

        _output_results(
            ctx, results, aggregator, kwargs["use_rich"],
            kwargs["save_json"], "resource_inspection"
        )

        high_load_count = results.get("high_load_count", 0)
        if high_load_count > 0:
            click.echo(click.style(f"\n⚠️  发现 {high_load_count} 个高负载节点！", fg="yellow", bold=True))
            for hl_node in results.get("high_load_nodes", []):
                tags = ", ".join(hl_node.get("high_load_tags", []))
                click.echo(click.style(f"  - {hl_node['node_name']} ({hl_node['node']}): {tags}", fg="red"))

    except Exception as e:
        click.echo(click.style(f"检测失败: {e}", fg="red"), err=True)
        ctx.exit(1)


@cli.group(help="Pod 状态巡检相关命令")
@click.pass_context
def pod(ctx: click.Context) -> None:
    config = ctx.obj["config"]
    ctx.obj["inspector"] = PodInspector(
        kubeconfig=config.k8s_config.get("kubeconfig"),
        context=config.k8s_config.get("context"),
        thresholds=config.thresholds,
    )
    ctx.obj["aggregator"] = LogAggregator(ctx.obj["output_format"], encoding=ctx.obj["encoding"])


@pod.command("inspect", help="巡检指定命名空间的 Pod 状态")
@click.option("-ns", "--namespace", "namespaces", multiple=True, help="指定命名空间，可多次指定")
@click.option("-l", "--label", "label_selector", default=None, help="按标签过滤 Pod")
@click.option("--abnormal-only", is_flag=True, default=False, help="仅显示异常 Pod")
@click.option("--save-json", is_flag=True, default=False, help="保存为 JSON 文件")
@click.option("--rich", "use_rich", is_flag=True, default=False, help="使用 Rich 美化输出")
@click.pass_context
def pod_inspect(ctx: click.Context, **kwargs) -> None:
    config = ctx.obj["config"]
    inspector = ctx.obj["inspector"]
    aggregator = ctx.obj["aggregator"]

    ns_list = list(kwargs["namespaces"]) if kwargs["namespaces"] else config.namespaces
    click.echo(click.style(f"正在巡检 Pod 状态，命名空间: {ns_list}", fg="cyan"))

    try:
        if kwargs["abnormal_only"]:
            results = inspector.inspect_abnormal_pods(ns_list)
        else:
            results = inspector.inspect_pods(ns_list, label_selector=kwargs["label_selector"])

        output = aggregator.format_pod_results(results)
        click.echo(output)

        if kwargs["save_json"]:
            filepath = aggregator.save_to_file(results, prefix="pod_inspection")
            click.echo(click.style(f"\n结果已保存到: {filepath}", fg="green"))

        aggregator.print_summary(pod_data=results)

    except Exception as e:
        click.echo(click.style(f"巡检失败: {e}", fg="red"), err=True)
        ctx.exit(1)


@cli.group(help="定时巡检调度相关命令")
@click.pass_context
def schedule(ctx: click.Context) -> None:
    config = ctx.obj["config"]
    state_file = os.path.join(os.getcwd(), "inspection_logs", "scheduler_state.json")
    ctx.obj["scheduler"] = InspectionScheduler(
        max_workers=config.global_config.get("max_workers", 5),
        state_file=state_file,
    )
    ctx.obj["communicator"] = NodeCommunicator(config.ssh_config)
    ctx.obj["detector"] = ResourceDetector(ctx.obj["communicator"], config.thresholds, config.disk_paths)
    ctx.obj["aggregator"] = LogAggregator(ctx.obj["output_format"], encoding=ctx.obj["encoding"])


def _create_inspection_task(ctx: click.Context, task_name: str) -> Callable:
    config = ctx.obj["config"]
    detector = ctx.obj["detector"]
    aggregator = ctx.obj["aggregator"]
    inspector = PodInspector(
        kubeconfig=config.k8s_config.get("kubeconfig"),
        context=config.k8s_config.get("context"),
        thresholds=config.thresholds,
    )

    def _task():
        logger = logging.getLogger(__name__)
        logger.info(f"执行定时巡检任务: {task_name}")
        try:
            resource_results = detector.detect_all_optimized(
                config.nodes,
                resource_history=ctx.obj["resource_history"],
                parallel=ctx.obj["parallel"],
                max_workers=ctx.obj["max_workers"],
            )
            for node_result in resource_results.get("nodes", []):
                addr = node_result.get("node")
                if addr:
                    if addr not in ctx.obj["resource_history"]:
                        ctx.obj["resource_history"][addr] = []
                    ctx.obj["resource_history"][addr].append(node_result)

            pod_results = inspector.inspect_pods(config.namespaces)
            report = aggregator.generate_full_report(resource_results, pod_results, save_to_file=True)
            high_load_count = resource_results.get("high_load_count", 0)
            pod_critical = pod_results.get("summary", {}).get("critical", 0)
            logger.info(f"定时巡检完成 - 高负载节点: {high_load_count}, 严重Pod: {pod_critical}")
            return report
        except Exception as e:
            logger.error(f"定时巡检任务失败: {e}")
            raise

    return _task


@schedule.command("add", help="添加定时巡检任务")
@click.argument("name")
@click.option("--interval", type=int, default=None, help="执行间隔（秒），与 cron 二选一")
@click.option("--cron", "cron_expr", type=str, default=None, help='Cron 表达式，如 "*/5 * * * *"')
@click.option("--enabled/--disabled", default=True, help="是否立即启用")
@click.option("--max-retries", type=int, default=0, help="失败重试次数")
@click.pass_context
def schedule_add(ctx: click.Context, name: str, interval: Optional[int], cron_expr: Optional[str], enabled: bool, max_retries: int) -> None:
    scheduler = ctx.obj["scheduler"]

    if interval is None and cron_expr is None:
        click.echo(click.style("必须指定 --interval 或 --cron 参数", fg="red"))
        ctx.exit(1)

    try:
        if interval is not None:
            trigger = IntervalTrigger(seconds=interval)
            trigger_desc = f"每 {interval} 秒"
        else:
            parts = cron_expr.strip().split()
            if len(parts) != 5:
                raise ValueError("Cron 表达式必须包含 5 个字段")
            trigger = CronTrigger(
                minute=parts[0], hour=parts[1], day=parts[2], month=parts[3], day_of_week=parts[4]
            )
            trigger_desc = f"cron: {cron_expr}"

        task_func = _create_inspection_task(ctx, name)
        scheduler.add_task(
            name=name,
            task_func=task_func,
            trigger=trigger,
            enabled=enabled,
            max_retries=max_retries,
        )
        next_run = scheduler.get_task(name).next_run
        click.echo(click.style(f"任务 [{name}] 已添加 ({trigger_desc})", fg="green"))
        if next_run:
            click.echo(f"下次运行时间: {next_run.strftime('%Y-%m-%d %H:%M:%S')}")

    except Exception as e:
        click.echo(click.style(f"添加任务失败: {e}", fg="red"), err=True)
        ctx.exit(1)


@schedule.command("list", help="列出所有定时任务")
@click.pass_context
def schedule_list(ctx: click.Context) -> None:
    scheduler = ctx.obj["scheduler"]
    tasks = scheduler.list_tasks()

    if not tasks:
        click.echo(click.style("暂无定时任务", fg="yellow"))
        return

    from tabulate import tabulate
    headers = ["名称", "状态", "上次运行", "下次运行", "执行次数", "成功/失败"]
    rows = []
    for task in tasks:
        status_parts = []
        if not task["enabled"]:
            status_parts.append(click.style("已禁用", fg="yellow"))
        if task["running"]:
            status_parts.append(click.style("运行中", fg="green"))
        status = ", ".join(status_parts) if status_parts else click.style("正常", fg="cyan")

        rows.append([
            task["name"],
            status,
            task["last_run"] or "-",
            task["next_run"] or "-",
            task["execution_count"],
            f"{task['success_count']}/{task['failure_count']}",
        ])

    click.echo(tabulate(rows, headers=headers, tablefmt="grid"))


@schedule.command("remove", help="删除定时任务")
@click.argument("name")
@click.pass_context
def schedule_remove(ctx: click.Context, name: str) -> None:
    scheduler = ctx.obj["scheduler"]
    if scheduler.remove_task(name):
        click.echo(click.style(f"任务 [{name}] 已删除", fg="green"))
    else:
        click.echo(click.style(f"任务 [{name}] 不存在", fg="yellow"))


@schedule.command("start", help="启动调度器（阻塞运行）")
@click.option("--once", is_flag=True, default=False, help="只运行一次所有就绪任务，不进入循环")
@click.pass_context
def schedule_start(ctx: click.Context, once: bool) -> None:
    scheduler = ctx.obj["scheduler"]

    if not scheduler.tasks:
        click.echo(click.style("没有可执行的任务，请先使用 schedule add 添加任务", fg="yellow"))
        ctx.exit(1)

    def _signal_handler(signum, frame):
        click.echo("\n" + click.style("收到停止信号，正在关闭调度器...", fg="yellow"))
        scheduler.stop()
        click.echo(click.style("调度器已停止", fg="green"))
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    if once:
        click.echo(click.style("运行一次所有就绪任务...", fg="cyan"))
        for name in scheduler.tasks:
            try:
                scheduler.run_task(name)
            except Exception as e:
                click.echo(click.style(f"任务 [{name}] 执行失败: {e}", fg="red"))
        click.echo(click.style("所有任务执行完成", fg="green"))
    else:
        click.echo(click.style(f"调度器已启动，共 {len(scheduler.tasks)} 个任务", fg="green"))
        click.echo(click.style("按 Ctrl+C 停止调度器", fg="cyan"))
        try:
            scheduler.start(block=True)
        except KeyboardInterrupt:
            scheduler.stop()
            click.echo(click.style("调度器已停止", fg="green"))


@schedule.command("run", help="立即运行指定任务")
@click.argument("name")
@click.pass_context
def schedule_run(ctx: click.Context, name: str) -> None:
    scheduler = ctx.obj["scheduler"]
    try:
        click.echo(click.style(f"立即运行任务 [{name}]...", fg="cyan"))
        result = scheduler.run_task(name)
        click.echo(click.style(f"任务 [{name}] 执行成功", fg="green"))
        if result:
            click.echo(result[:500] + "..." if len(result) > 500 else result)
    except Exception as e:
        click.echo(click.style(f"任务执行失败: {e}", fg="red"), err=True)
        ctx.exit(1)


@cli.command("full", help="执行完整巡检：节点资源 + Pod 状态")
@click.option("-n", "--node", "nodes_filter", multiple=True, help="指定节点名称或 IP，可多次指定")
@click.option("-ns", "--namespace", "namespaces", multiple=True, help="指定命名空间，可多次指定")
@click.option("--no-parallel", is_flag=True, default=False, help="禁用并行执行")
@click.option("--save-json", is_flag=True, default=True, help="保存完整报告为 JSON")
@click.option("--optimized", is_flag=True, default=False, help="使用优化轮询策略")
@click.option("--mark-high-load", is_flag=True, default=True, help="自动标记高负载节点")
@click.pass_context
def full_inspection(ctx: click.Context, nodes_filter: tuple, namespaces: tuple, no_parallel: bool, save_json: bool, optimized: bool, mark_high_load: bool) -> None:
    config = ctx.obj["config"]
    communicator = NodeCommunicator(config.ssh_config)
    detector = ResourceDetector(communicator, config.thresholds, config.disk_paths)
    inspector = PodInspector(kubeconfig=config.k8s_config.get("kubeconfig"), context=config.k8s_config.get("context"), thresholds=config.thresholds)
    aggregator = LogAggregator(ctx.obj["output_format"], encoding=ctx.obj["encoding"])

    nodes = _filter_nodes(config.nodes, nodes_filter)
    ns_list = list(namespaces) if namespaces else config.namespaces

    click.echo(click.style(f"开始完整巡检: {len(nodes)} 个节点, {len(ns_list)} 个命名空间", fg="cyan", bold=True))

    parallel, max_workers = _get_execution_params(ctx, no_parallel)
    resource_results = None
    pod_results = None

    try:
        click.echo("\n" + click.style("第一步: 节点资源检测...", fg="blue", bold=True))
        if optimized:
            resource_results = detector.detect_all_optimized(
                nodes,
                resource_history=ctx.obj["resource_history"],
                parallel=parallel,
                max_workers=max_workers,
                mark_high_load=mark_high_load,
            )
        else:
            resource_results = detector.detect_all(nodes, parallel, max_workers)
            if mark_high_load:
                resource_results = detector.mark_high_load_nodes(resource_results, ctx.obj["resource_history"])

        output = aggregator.format_resource_results(resource_results)
        click.echo(output)

        high_load_count = resource_results.get("high_load_count", 0)
        if high_load_count > 0:
            click.echo(click.style(f"\n⚠️  发现 {high_load_count} 个高负载节点！", fg="yellow", bold=True))
            for hl_node in resource_results.get("high_load_nodes", []):
                tags = ", ".join(hl_node.get("high_load_tags", []))
                click.echo(click.style(f"  - {hl_node['node_name']} ({hl_node['node']}): {tags}", fg="red"))

    except Exception as e:
        click.echo(click.style(f"节点资源检测失败: {e}", fg="red"), err=True)

    try:
        click.echo("\n" + click.style("第二步: Pod 状态巡检...", fg="blue", bold=True))
        pod_results = inspector.inspect_pods(ns_list)
        output = aggregator.format_pod_results(pod_results)
        click.echo(output)
    except Exception as e:
        click.echo(click.style(f"Pod 巡检失败: {e}", fg="red"), err=True)

    click.echo("\n" + "=" * 60)
    click.echo(click.style("生成完整报告...", fg="cyan"))

    report = aggregator.generate_full_report(resource_results, pod_results, save_to_file=save_json)
    click.echo(report)

    aggregator.print_summary(resource_results, pod_results)


@cli.group(help="配置管理相关命令")
def config() -> None:
    pass


@config.command("show", help="显示当前配置")
@click.option("-c", "--config", "config_path", type=click.Path(exists=True, dir_okay=False), default=None, help="指定配置文件路径")
def config_show(config_path: Optional[str]) -> None:
    try:
        loader = ConfigLoader(config_path)
        import json
        click.echo(json.dumps(loader.config, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(click.style(f"读取配置失败: {e}", fg="red"), err=True)


@config.command("init", help="初始化默认配置文件")
@click.option("-f", "--force", is_flag=True, default=False, help="强制覆盖已存在的配置文件")
@click.argument("output_path", type=click.Path(dir_okay=False), default="config/config.yaml", required=False)
def config_init(force: bool, output_path: str) -> None:
    import shutil
    default_config = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config", "config.yaml")
    output_path = os.path.abspath(output_path)

    if os.path.exists(output_path) and not force:
        click.echo(click.style(f"配置文件已存在: {output_path}\n使用 -f 参数强制覆盖", fg="yellow"))
        return

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    shutil.copy2(default_config, output_path)
    click.echo(click.style(f"配置文件已创建: {output_path}", fg="green"))


def main() -> None:
    cli(obj={})


if __name__ == "__main__":
    main()
