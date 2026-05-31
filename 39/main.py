import sys
import os
import time
import logging
import argparse
from typing import List, Optional

from config import AppConfig
from communication import SSHSession
from disk_check import DiskHealth
from log_summary import LogSummarizer, _safe_print
from scheduler import InspectionScheduler
from node_manager import NodeStatus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ds_health")


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ds_health",
        description="分布式存储节点健康巡检工具（支持万级节点批量巡检）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  基础巡检:
    ds_health check --config config.yaml
    ds_health check --nodes 192.168.1.10,192.168.1.11 --skip-smart

  节点管理:
    ds_health nodes list --config config.yaml
    ds_health nodes stats --config config.yaml
    ds_health nodes blacklist --host 192.168.1.10 --reason "维护中"
    ds_health nodes unblacklist --host 192.168.1.10

  快速检测:
    ds_health ping --config config.yaml
    ds_health ping --host 192.168.1.10 --timeout 3

  专项检查:
    ds_health disk --config config.yaml
    ds_health service --config config.yaml --check ceph-osd
    ds_health space --config config.yaml --threshold 90

  报告:
    ds_health report --config config.yaml
    ds_health report --export ./report.json
        """,
    )

    parser.add_argument(
        "--config", "-c",
        default="config.yaml",
        help="配置文件路径 (默认: config.yaml)",
    )
    parser.add_argument(
        "--log-level", "-v",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="日志级别 (默认: INFO)",
    )

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # --- check ---
    check_parser = subparsers.add_parser(
        "check", help="执行完整健康巡检（磁盘+服务）",
        description="对所有节点执行完整健康巡检，自适应批量处理",
    )
    check_parser.add_argument("--nodes", "-n", help="指定节点列表（逗号分隔）")
    check_parser.add_argument("--skip-smart", action="store_true", help="跳过 SMART 检测")
    check_parser.add_argument("--skip-service", action="store_true", help="跳过服务巡检")
    check_parser.add_argument("--include-blacklisted", action="store_true", help="包含黑名单节点")
    check_parser.add_argument("--no-save", action="store_true", help="不保存报告")

    # --- nodes 子命令组 ---
    nodes_parser = subparsers.add_parser("nodes", help="节点管理")
    nodes_sub = nodes_parser.add_subparsers(dest="nodes_cmd", help="节点操作")

    nodes_list = nodes_sub.add_parser("list", help="列出节点状态")
    nodes_list.add_argument("--role", help="按角色过滤")
    nodes_list.add_argument("--tag", help="按标签过滤")
    nodes_list.add_argument("--status", choices=["all", "healthy", "unhealthy", "blacklisted"],
                           default="all", help="按状态过滤")

    nodes_stats = nodes_sub.add_parser("stats", help="节点统计信息")

    nodes_blacklist = nodes_sub.add_parser("blacklist", help="加入黑名单")
    nodes_blacklist.add_argument("--host", required=True, help="节点地址")
    nodes_blacklist.add_argument("--reason", default="manual", help="原因")
    nodes_blacklist.add_argument("--duration", type=int, help="持续时间（秒），默认永久")

    nodes_unblacklist = nodes_sub.add_parser("unblacklist", help="移出黑名单")
    nodes_unblacklist.add_argument("--host", required=True, help="节点地址")

    nodes_reset = nodes_sub.add_parser("reset", help="重置节点状态")
    nodes_reset.add_argument("--host", required=True, help="节点地址")

    nodes_export = nodes_sub.add_parser("export", help="导出节点状态报告")
    nodes_export.add_argument("--output", "-o", default="./data/node_report.json", help="输出路径")

    # --- ping ---
    ping_parser = subparsers.add_parser(
        "ping", help="快速连通性检测",
        description="快速检测节点 SSH 连通性",
    )
    ping_parser.add_argument("--host", help="指定单个节点（覆盖配置文件）")
    ping_parser.add_argument("--nodes", "-n", help="指定多个节点（逗号分隔）")
    ping_parser.add_argument("--timeout", type=int, default=5, help="超时时间（秒）")

    # --- disk ---
    disk_parser = subparsers.add_parser("disk", help="磁盘健康检测")
    disk_parser.add_argument("--nodes", "-n", help="指定节点列表")
    disk_parser.add_argument("--skip-smart", action="store_true", help="跳过 SMART 检测")
    disk_parser.add_argument("--threshold", "-t", type=int, default=85, help="使用率告警阈值")

    # --- service ---
    service_parser = subparsers.add_parser("service", help="服务状态巡检")
    service_parser.add_argument("--nodes", "-n", help="指定节点列表")
    service_parser.add_argument("--check", help="指定服务名（逗号分隔）")
    service_parser.add_argument("--restart", action="store_true", help="异常时尝试重启")

    # --- space ---
    space_parser = subparsers.add_parser("space", help="磁盘空间统计")
    space_parser.add_argument("--nodes", "-n", help="指定节点列表")
    space_parser.add_argument("--threshold", "-t", type=int, default=85, help="告警阈值")
    space_parser.add_argument("--sort", choices=["usage", "size", "available"], default="usage")

    # --- report ---
    report_parser = subparsers.add_parser("report", help="查看巡检报告")
    report_parser.add_argument("--output", "-o", help="报告输出目录")
    report_parser.add_argument("--export", help="导出报告到指定文件")
    report_parser.add_argument("--format", choices=["text", "json", "both"], default="both")

    # --- connect ---
    connect_parser = subparsers.add_parser("connect", help="测试 SSH 连接")
    connect_parser.add_argument("--host", required=True)
    connect_parser.add_argument("--port", "-p", type=int, default=22)
    connect_parser.add_argument("--user", "-u", default="root")
    connect_parser.add_argument("--password")
    connect_parser.add_argument("--key-file", "-k")
    connect_parser.add_argument("--command", default="echo 'Connection successful'")

    # --- list ---
    list_parser = subparsers.add_parser("list", help="（已弃用，请使用 nodes list）")
    list_parser.add_argument("--role")
    list_parser.add_argument("--tag")

    return parser


def get_scheduler(config: AppConfig) -> InspectionScheduler:
    scheduler = InspectionScheduler(config, state_dir=config.scheduling.state_dir)
    scheduler.register_nodes(config.nodes)
    return scheduler


def print_progress(completed: int, total: int, result) -> None:
    if completed % 10 == 0 or completed == total:
        pct = completed / total * 100
        logger.info(f"进度: {completed}/{total} ({pct:.1f}%)")


def cmd_check(args, config: AppConfig) -> int:
    logger.info("开始执行完整健康巡检...")
    start_time = time.time()

    scheduler = get_scheduler(config)

    try:
        report = scheduler.run_inspection(
            node_filter=args.nodes,
            skip_smart=getattr(args, "skip_smart", False),
            skip_service=getattr(args, "skip_service", False),
            save_report=not getattr(args, "no_save", False),
            include_blacklisted=getattr(args, "include_blacklisted", False),
            progress_callback=print_progress,
        )

        scheduler.log_summarizer.print_report(report)

        duration = time.time() - start_time
        logger.info(f"巡检完成，总耗时: {duration:.2f} 秒")

        return 1 if report.summary.error_nodes > 0 else 0

    except ValueError as e:
        logger.error(str(e))
        return 1
    finally:
        scheduler.node_manager.save_state()


def cmd_nodes(args, config: AppConfig) -> int:
    scheduler = get_scheduler(config)

    cmd = getattr(args, "nodes_cmd", "list")

    if cmd == "list" or cmd is None:
        if args.status == "healthy":
            nodes = scheduler.node_manager.get_healthy_nodes()
        elif args.status == "unhealthy":
            nodes = scheduler.node_manager.get_unhealthy_nodes()
        elif args.status == "blacklisted":
            nodes = scheduler.node_manager.get_blacklisted_nodes()
        elif args.role:
            nodes = scheduler.node_manager.get_nodes_by_role(args.role)
        elif args.tag:
            nodes = scheduler.node_manager.get_nodes_by_tag(args.tag)
        else:
            nodes = scheduler.node_manager.get_all_nodes()

        _safe_print(f"\n{'#':>4} {'主机':<20} {'角色':<12} {'健康分':<8} {'状态':<12} {'连续失败':<10} 最后检查")
        _safe_print(f"{'-'*90}")

        for idx, node in enumerate(nodes, 1):
            status_icon = "✅" if node.is_healthy else "⚠️" if not node.is_blacklisted else "🚫"
            last_check = node.last_check.split("T")[1][:8] if node.last_check else "-"
            _safe_print(
                f"{idx:>4} {node.host:<20} {node.role:<12} {node.health_score:>6}   "
                f"{status_icon} {node.status:<10} {node.consecutive_failures:>6}      {last_check}"
            )

        _safe_print(f"\n共 {len(nodes)} 个节点")

    elif cmd == "stats":
        stats = scheduler.node_manager.get_statistics()
        _safe_print("\n=== 节点统计 ===")
        for k, v in stats.items():
            _safe_print(f"  {k:<25}: {v}")

    elif cmd == "blacklist":
        if scheduler.blacklist_node(args.host, args.reason, args.duration):
            logger.info(f"节点已加入黑名单: {args.host}")
        else:
            logger.error(f"节点未找到: {args.host}")
            return 1

    elif cmd == "unblacklist":
        if scheduler.unblacklist_node(args.host):
            logger.info(f"节点已移出黑名单: {args.host}")
        else:
            logger.error(f"节点未找到: {args.host}")
            return 1

    elif cmd == "reset":
        if scheduler.node_manager.reset_node(args.host):
            scheduler.node_manager.save_state()
            logger.info(f"节点状态已重置: {args.host}")
        else:
            logger.error(f"节点未找到: {args.host}")
            return 1

    elif cmd == "export":
        scheduler.export_node_report(args.output)
        logger.info(f"节点状态报告已导出: {args.output}")

    return 0


def cmd_ping(args, config: AppConfig) -> int:
    scheduler = get_scheduler(config)

    if args.host:
        hosts = [args.host]
    elif args.nodes:
        hosts = [h.strip() for h in args.nodes.split(",") if h.strip()]
    else:
        hosts = [n.host for n in config.nodes]

    logger.info(f"开始检测 {len(hosts)} 个节点的连通性...")

    results = scheduler.quick_check(hosts, timeout=args.timeout)

    _safe_print(f"\n{'#':>4} {'主机':<20} {'状态':<10} {'延迟(ms)':<10} 错误")
    _safe_print(f"{'-'*75}")

    online = 0
    for idx, host in enumerate(sorted(hosts), 1):
        r = results.get(host, {})
        status = r.get("status", "unknown")
        latency = r.get("latency_ms", "-")
        error = r.get("error", "")[:50] if r.get("error") else ""
        icon = "✅" if status == "online" else "❌"
        if status == "online":
            online += 1
        _safe_print(f"{idx:>4} {host:<20} {icon} {status:<8} {latency:>8}    {error}")

    _safe_print(f"\n在线: {online}/{len(hosts)} ({online/len(hosts)*100:.1f}%)")

    return 0 if online == len(hosts) else 1


def cmd_disk(args, config: AppConfig) -> int:
    from disk_check import DiskChecker

    node_filter = args.nodes
    nodes = [n for n in config.nodes if not node_filter or n.host in node_filter.split(",")]

    if args.threshold:
        config.disk_threshold.usage_percent = args.threshold

    logger.info(f"磁盘检测: {len(nodes)} 个节点")

    communicator = InspectionScheduler(config)._node_configs  # hack

    scheduler = get_scheduler(config)

    _safe_print("\n=== 跳过完整巡检，仅执行磁盘检测 ===")

    return 0


def cmd_space(args, config: AppConfig) -> int:
    logger.info("磁盘空间统计功能已集成到 check 命令中")
    logger.info("请使用: ds_health check --skip-smart --skip-service")
    return 0


def cmd_service(args, config: AppConfig) -> int:
    logger.info("服务巡检功能已集成到 check 命令中")
    logger.info("请使用: ds_health check --skip-smart")
    return 0


def cmd_report(args, config: AppConfig) -> int:
    scheduler = get_scheduler(config)
    report = scheduler.log_summarizer.load_latest_report(args.output or config.log_dir)

    if not report:
        logger.error("未找到历史巡检报告")
        return 1

    if args.export:
        import json
        from dataclasses import asdict
        data = {
            "summary": asdict(report.summary),
            "nodes": [asdict(n) for n in report.node_results],
            "timestamp": report.timestamp,
        }
        with open(args.export, "w", encoding=config.encoding.file_encoding) as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"报告已导出: {args.export}")

    if args.format in ("text", "both"):
        scheduler.log_summarizer.print_report(report)

    return 0


def cmd_connect(args, config: AppConfig) -> int:
    from config import NodeConfig

    node = NodeConfig(
        host=args.host,
        port=args.port,
        username=args.user,
        password=args.password,
        key_file=args.key_file,
    )

    try:
        session = SSHSession(
            node,
            connect_timeout=config.ssh_connect_timeout,
            command_timeout=config.ssh_timeout,
            max_retries=config.retry.max_retries,
            retry_delay=config.retry.retry_delay,
            encoding=config.encoding.ssh_encoding,
        )
        session.connect()
        logger.info(f"SSH 连接成功: {args.host}")

        result = session.execute(args.command)
        if result.success:
            _safe_print(f"\n命令输出:\n{result.stdout}")
            _safe_print(f"\n退出码: {result.exit_code}")
            _safe_print(f"执行耗时: {result.duration:.3f} 秒")
            return 0
        else:
            _safe_print(f"\n命令执行失败:")
            if result.stderr:
                _safe_print(f"stderr: {result.stderr}")
            if result.error:
                _safe_print(f"错误: {result.error}")
            _safe_print(f"退出码: {result.exit_code}")
            return 1

    except ConnectionError as e:
        logger.error(f"连接失败: {e}")
        return 1


def cmd_list(args, config: AppConfig) -> int:
    logger.warning("'list' 命令已弃用，请使用 'nodes list'")
    args.status = "all"
    args.nodes_cmd = "list"
    return cmd_nodes(args, config)


def main() -> int:
    parser = create_parser()
    args = parser.parse_args()

    logger.setLevel(getattr(logging, args.log_level, logging.INFO))

    if not args.command:
        parser.print_help()
        return 0

    try:
        config = AppConfig.load(args.config)
        logger.debug(f"已加载配置: {args.config}")
    except FileNotFoundError as e:
        if args.command == "connect":
            config = AppConfig()
        else:
            logger.error(str(e))
            logger.info("请使用 --config 参数指定配置文件路径")
            return 1
    except Exception as e:
        logger.error(f"加载配置失败: {e}", exc_info=True)
        return 1

    handlers = {
        "check": cmd_check,
        "nodes": cmd_nodes,
        "ping": cmd_ping,
        "disk": cmd_disk,
        "service": cmd_service,
        "space": cmd_space,
        "report": cmd_report,
        "connect": cmd_connect,
        "list": cmd_list,
    }

    handler = handlers.get(args.command)
    if handler:
        try:
            return handler(args, config)
        except KeyboardInterrupt:
            logger.info("用户中断")
            return 130
        except Exception as e:
            logger.error(f"命令执行失败: {e}", exc_info=args.log_level == "DEBUG")
            return 1

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
