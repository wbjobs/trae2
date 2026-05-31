import os
import json
import logging
import sys
import codecs
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import List, Optional

from disk_check import DiskHealth, DiskUsage, InodeUsage, SmartInfo
from service_check import NodeServiceReport, ServiceStatus, ProcessInfo

logger = logging.getLogger(__name__)

DEFAULT_ENCODING = "utf-8"


def _safe_encode(text: str, encoding: str = DEFAULT_ENCODING) -> str:
    if text is None:
        return ""
    try:
        encoded = text.encode(encoding, errors="replace")
        return encoded.decode(encoding, errors="replace")
    except Exception:
        try:
            return text.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
        except Exception:
            return str(text)


def _safe_print(text: str = "") -> None:
    try:
        if isinstance(text, bytes):
            text = text.decode(DEFAULT_ENCODING, errors="replace")
        print(text)
    except UnicodeEncodeError:
        try:
            encoded = text.encode(sys.stdout.encoding or DEFAULT_ENCODING, errors="replace")
            sys.stdout.buffer.write(encoded + b"\n")
        except Exception:
            print(text.encode(DEFAULT_ENCODING, errors="replace").decode(DEFAULT_ENCODING, errors="replace"))
    except Exception as e:
        logger.debug(f"输出失败: {e}")


@dataclass
class InspectionSummary:
    total_nodes: int = 0
    healthy_nodes: int = 0
    warning_nodes: int = 0
    error_nodes: int = 0
    total_disks: int = 0
    warning_disks: int = 0
    error_disks: int = 0
    total_services: int = 0
    healthy_services: int = 0
    unhealthy_services: int = 0
    total_processes: int = 0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    start_time: str = ""
    end_time: str = ""
    duration_seconds: float = 0.0


@dataclass
class NodeInspectionResult:
    host: str
    role: str = ""
    disk_health: Optional[dict] = None
    service_report: Optional[dict] = None
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    status: str = "unknown"


@dataclass
class InspectionReport:
    summary: InspectionSummary = field(default_factory=InspectionSummary)
    node_results: List[NodeInspectionResult] = field(default_factory=list)
    timestamp: str = ""
    config_source: str = ""


class LogSummarizer:
    def __init__(self, log_dir: str = "./logs", encoding: str = DEFAULT_ENCODING):
        self.log_dir = log_dir
        self.encoding = encoding
        self._ensure_log_dir()

    def _ensure_log_dir(self):
        try:
            os.makedirs(self.log_dir, exist_ok=True)
        except Exception as e:
            logger.error(f"创建日志目录失败: {self.log_dir} - {e}")

    def _timestamp_str(self) -> str:
        return datetime.now().strftime("%Y%m%d_%H%M%S")

    def _format_datetime(self) -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _write_file(self, path: str, content: str) -> None:
        try:
            with open(path, "w", encoding=self.encoding, errors="replace") as f:
                f.write(_safe_encode(content, self.encoding))
        except UnicodeEncodeError:
            with open(path, "w", encoding="utf-8", errors="replace") as f:
                f.write(_safe_encode(content, "utf-8"))
        except Exception as e:
            logger.error(f"写入文件失败 {path}: {e}")
            backup_path = path + ".bak"
            try:
                with open(backup_path, "wb") as f:
                    f.write(content.encode("utf-8", errors="replace"))
                logger.info(f"已备份写入: {backup_path}")
            except Exception as e2:
                logger.error(f"备份写入也失败 {backup_path}: {e2}")

    def format_disk_report(self, health: DiskHealth) -> str:
        lines = []
        lines.append(f"{'='*60}")
        lines.append(f"磁盘健康报告 - 节点: {health.host}")
        lines.append(f"{'='*60}")

        if health.error:
            lines.append(f"  [错误] {_safe_encode(health.error, self.encoding)}")
            return "\n".join(lines)

        if health.disk_usages:
            lines.append(f"\n  磁盘空间使用情况:")
            lines.append(f"  {'-'*56}")
            lines.append(f"  {'文件系统':<20} {'类型':<8} {'容量':>8} {'已用':>8} {'可用':>8} {'使用率':>6}  挂载点")
            lines.append(f"  {'-'*56}")
            for du in health.disk_usages:
                marker = " ⚠" if du.usage_percent >= 85 else ""
                fs_type = du.type if du.type else "-"
                lines.append(
                    f"  {_safe_encode(du.filesystem, self.encoding):<20} "
                    f"{_safe_encode(fs_type, self.encoding):<8} "
                    f"{_safe_encode(du.size, self.encoding):>8} "
                    f"{_safe_encode(du.used, self.encoding):>8} "
                    f"{_safe_encode(du.available, self.encoding):>8} "
                    f"{du.usage_percent:>5}%{marker}  "
                    f"{_safe_encode(du.mounted_on, self.encoding)}"
                )

        if health.inode_usages:
            lines.append(f"\n  Inode 使用情况:")
            lines.append(f"  {'-'*56}")
            lines.append(f"  {'文件系统':<20} {'类型':<8} {'总数':>10} {'已用':>10} {'可用':>10} {'使用率':>6}  挂载点")
            lines.append(f"  {'-'*56}")
            for iu in health.inode_usages:
                marker = " ⚠" if iu.inode_percent >= 85 else ""
                fs_type = iu.type if iu.type else "-"
                lines.append(
                    f"  {_safe_encode(iu.filesystem, self.encoding):<20} "
                    f"{_safe_encode(fs_type, self.encoding):<8} "
                    f"{iu.inodes_total:>10,} "
                    f"{iu.inodes_used:>10,} "
                    f"{iu.inodes_free:>10,} "
                    f"{iu.inode_percent:>5}%{marker}  "
                    f"{_safe_encode(iu.mounted_on, self.encoding)}"
                )

        if health.smart_infos:
            lines.append(f"\n  SMART 信息:")
            for si in health.smart_infos:
                if not si.smart_supported:
                    status_icon = "ℹ️"
                    lines.append(f"\n    设备: {si.device_path} {status_icon} SMART 不支持")
                    continue

                if not si.smart_enabled:
                    status_icon = "⚠️"
                    lines.append(f"\n    设备: {si.device_path} {status_icon} SMART 未启用")
                    continue

                if si.passed is None:
                    status_icon = "❓"
                elif si.has_failed:
                    status_icon = "❌"
                elif si.passed:
                    status_icon = "✅"
                else:
                    status_icon = "⚠️"

                lines.append(f"\n    设备: {si.device_path} {status_icon}")
                if si.model:
                    lines.append(f"    型号: {_safe_encode(si.model, self.encoding)}")
                if si.serial:
                    lines.append(f"    序列号: {_safe_encode(si.serial, self.encoding)}")
                if si.firmware:
                    lines.append(f"    固件: {_safe_encode(si.firmware, self.encoding)}")
                if si.capacity:
                    lines.append(f"    容量: {_safe_encode(si.capacity, self.encoding)}")
                if si.critical_attributes:
                    lines.append(f"    关键属性:")
                    for attr in si.critical_attributes:
                        warn = " ⚠" if attr.threshold > 0 and attr.value <= attr.threshold else ""
                        lines.append(
                            f"      [{attr.id:3d}] "
                            f"{_safe_encode(attr.name, self.encoding):<25} "
                            f"当前:{attr.value:>4} "
                            f"最差:{attr.worst:>4} "
                            f"阈值:{attr.threshold:>4}{warn}"
                        )

        if health.command_errors:
            lines.append(f"\n  命令执行警告:")
            for err in health.command_errors:
                lines.append(f"    ⚠ {_safe_encode(err, self.encoding)}")

        return "\n".join(lines)

    def format_service_report(self, report: NodeServiceReport) -> str:
        lines = []
        lines.append(f"{'='*60}")
        lines.append(f"服务巡检报告 - 节点: {report.host}")
        lines.append(f"{'='*60}")

        if report.error:
            lines.append(f"  [错误] {_safe_encode(report.error, self.encoding)}")
            return "\n".join(lines)

        init_info = "systemd" if report.systemd_available else "sysvinit"
        lines.append(f"  初始化系统: {init_info}")

        if report.service_statuses:
            lines.append(f"\n  服务状态:")
            lines.append(f"  {'-'*56}")
            lines.append(f"  {'服务名':<25} {'状态':<8} {'PID':<8} {'内存':<12}  启动时间")
            lines.append(f"  {'-'*56}")
            for ss in report.service_statuses:
                status_icon = "✅" if ss.is_healthy else "❌"
                pid_str = str(ss.pid) if ss.pid else "N/A"
                mem_str = _safe_encode(ss.memory, self.encoding) if ss.memory else "N/A"
                since_str = _safe_encode(ss.since, self.encoding) if ss.since else "N/A"
                lines.append(
                    f"  {_safe_encode(ss.name, self.encoding):<25} "
                    f"{status_icon} "
                    f"{pid_str:<8} "
                    f"{mem_str:<12}  "
                    f"{since_str}"
                )
                if ss.error:
                    lines.append(f"      错误: {_safe_encode(ss.error, self.encoding)}")

        if report.process_infos:
            lines.append(f"\n  进程资源占用 TOP 10:")
            lines.append(f"  {'-'*56}")
            lines.append(f"  {'PID':<8} {'用户':<10} {'CPU%':<6} {'MEM%':<6} {'内存(MB)':<10}  命令")
            lines.append(f"  {'-'*56}")
            for pi in report.process_infos[:10]:
                lines.append(
                    f"  {pi.pid:<8} "
                    f"{_safe_encode(pi.user, self.encoding):<10} "
                    f"{pi.cpu_percent:>5.1f}  "
                    f"{pi.mem_percent:>5.1f}  "
                    f"{pi.memory_mb:>8.1f}    "
                    f"{_safe_encode(pi.command, self.encoding)}"
                )

        return "\n".join(lines)

    def format_summary(self, report: InspectionReport) -> str:
        lines = []
        lines.append(f"{'#'*60}")
        lines.append(f"#  分布式存储节点巡检汇总报告")
        lines.append(f"#  生成时间: {_safe_encode(report.timestamp, self.encoding)}")
        if report.config_source:
            lines.append(f"#  配置文件: {_safe_encode(report.config_source, self.encoding)}")
        lines.append(f"{'#'*60}")

        s = report.summary
        lines.append(f"\n  巡检概要:")
        lines.append(f"  {'-'*56}")
        lines.append(f"  总节点数:       {s.total_nodes}")
        lines.append(f"  健康节点数:     {s.healthy_nodes}")
        lines.append(f"  告警节点数:     {s.warning_nodes}")
        lines.append(f"  错误节点数:     {s.error_nodes}")
        lines.append(f"  总磁盘数:       {s.total_disks}")
        lines.append(f"  告警磁盘数:     {s.warning_disks}")
        lines.append(f"  错误磁盘数:     {s.error_disks}")
        lines.append(f"  总服务数:       {s.total_services}")
        lines.append(f"  健康服务数:     {s.healthy_services}")
        lines.append(f"  异常服务数:     {s.unhealthy_services}")
        lines.append(f"  总进程数:       {s.total_processes}")
        lines.append(f"  巡检耗时:       {s.duration_seconds:.2f} 秒")

        if s.warnings:
            lines.append(f"\n  告警列表 ({len(s.warnings)} 条):")
            for w in s.warnings:
                lines.append(f"    ⚠ {_safe_encode(w, self.encoding)}")

        if s.errors:
            lines.append(f"\n  错误列表 ({len(s.errors)} 条):")
            for e in s.errors:
                lines.append(f"    ❌ {_safe_encode(e, self.encoding)}")

        overall = "HEALTHY" if s.error_nodes == 0 and s.warning_nodes == 0 else "WARNING" if s.error_nodes == 0 else "ERROR"
        overall_icon = "✅" if overall == "HEALTHY" else "⚠️" if overall == "WARNING" else "❌"
        lines.append(f"\n  总体状态: {overall_icon} {overall}")

        return "\n".join(lines)

    def format_full_report(self, report: InspectionReport) -> str:
        parts = []
        parts.append(self.format_summary(report))

        for nr in report.node_results:
            parts.append("")
            parts.append(f"\n{'#'*60}")
            parts.append(f"# 节点: {_safe_encode(nr.host, self.encoding)} (角色: {_safe_encode(nr.role, self.encoding)})")
            parts.append(f"# 状态: {nr.status}")
            if nr.warnings:
                parts.append(f"# 告警: {len(nr.warnings)} 条")
            if nr.errors:
                parts.append(f"# 错误: {len(nr.errors)} 条")

            if nr.disk_health:
                try:
                    dh = DiskHealth(**nr.disk_health)
                    parts.append(self.format_disk_report(dh))
                except Exception as e:
                    logger.debug(f"格式化磁盘报告失败: {e}")
                    parts.append(f"  [警告] 磁盘数据格式化失败")

            if nr.service_report:
                try:
                    nsr = NodeServiceReport(**nr.service_report)
                    parts.append(self.format_service_report(nsr))
                except Exception as e:
                    logger.debug(f"格式化服务报告失败: {e}")
                    parts.append(f"  [警告] 服务数据格式化失败")

        return "\n".join(parts)

    def save_report(self, report: InspectionReport, prefix: str = "inspection") -> str:
        ts = self._timestamp_str()
        json_path = os.path.join(self.log_dir, f"{prefix}_{ts}.json")
        txt_path = os.path.join(self.log_dir, f"{prefix}_{ts}.txt")

        try:
            report_dict = {
                "summary": asdict(report.summary),
                "node_results": [asdict(nr) for nr in report.node_results],
                "timestamp": report.timestamp,
                "config_source": report.config_source,
            }

            json_content = json.dumps(report_dict, ensure_ascii=False, indent=2)
            self._write_file(json_path, json_content)

            txt_content = self.format_full_report(report)
            self._write_file(txt_path, txt_content)

            logger.info(f"巡检报告已保存: {json_path}, {txt_path}")
            return txt_path

        except Exception as e:
            logger.error(f"保存报告失败: {e}")
            raise

    def build_report(
        self,
        disk_results: List[DiskHealth],
        service_results: List[NodeServiceReport],
        nodes_meta: dict,
        config_source: str = "",
        duration: float = 0.0,
    ) -> InspectionReport:
        summary = InspectionSummary(
            total_nodes=len(disk_results),
            start_time=self._format_datetime(),
            end_time=self._format_datetime(),
            duration_seconds=duration,
        )

        node_results = []

        for dh in disk_results:
            nr = NodeInspectionResult(
                host=dh.host,
                role=nodes_meta.get(dh.host, {}).get("role", "unknown"),
                disk_health=asdict(dh),
            )

            warnings = []
            errors = []

            if dh.error:
                errors.append(dh.error)

            for du in dh.disk_usages:
                if du.usage_percent >= 85:
                    warnings.append(f"磁盘 {du.filesystem}({du.type}) 使用率 {du.usage_percent}%")
            for iu in dh.inode_usages:
                if iu.inode_percent >= 85:
                    warnings.append(f"Inode {iu.filesystem}({iu.type}) 使用率 {iu.inode_percent}%")
            for si in dh.smart_infos:
                if not si.smart_supported:
                    continue
                if si.has_failed:
                    errors.append(f"SMART 自检失败: {si.device_path}")
                elif si.passed is False:
                    errors.append(f"SMART 健康状态失败: {si.device_path}")
                if si.has_warning:
                    warnings.append(f"SMART 关键属性告警: {si.device_path}")

            summary.total_disks += len(dh.smart_infos)
            if any(du.usage_percent >= 85 for du in dh.disk_usages):
                summary.warning_disks += 1
            if any(si.has_failed for si in dh.smart_infos if si.smart_supported):
                summary.error_disks += 1

            nr.warnings = warnings
            nr.errors = errors
            node_results.append(nr)

        for sr in service_results:
            host_found = False
            for nr in node_results:
                if nr.host == sr.host:
                    nr.service_report = asdict(sr)
                    host_found = True
                    break

            if not host_found:
                nr = NodeInspectionResult(
                    host=sr.host,
                    role=nodes_meta.get(sr.host, {}).get("role", "unknown"),
                    service_report=asdict(sr),
                )
                node_results.append(nr)

            for ss in sr.service_statuses:
                summary.total_services += 1
                if ss.is_healthy:
                    summary.healthy_services += 1
                else:
                    summary.unhealthy_services += 1

            summary.total_processes += len(sr.process_infos)

        for nr in node_results:
            has_error = len(nr.errors) > 0
            has_warning = len(nr.warnings) > 0

            if has_error:
                nr.status = "ERROR"
                summary.error_nodes += 1
                summary.errors.extend(nr.errors)
            elif has_warning:
                nr.status = "WARNING"
                summary.warning_nodes += 1
                summary.warnings.extend(nr.warnings)
            else:
                nr.status = "HEALTHY"
                summary.healthy_nodes += 1

        report = InspectionReport(
            summary=summary,
            node_results=node_results,
            timestamp=self._format_datetime(),
            config_source=config_source,
        )

        return report

    def print_report(self, report: InspectionReport):
        content = self.format_full_report(report)
        for line in content.split("\n"):
            _safe_print(line)

    def load_latest_report(self, log_dir: Optional[str] = None) -> Optional[InspectionReport]:
        import glob

        search_dir = log_dir or self.log_dir
        pattern = os.path.join(search_dir, "inspection_*.json")

        reports = glob.glob(pattern)
        if not reports:
            return None

        latest_report = max(reports, key=os.path.getmtime)
        logger.info(f"加载最新报告: {latest_report}")

        try:
            with open(latest_report, "r", encoding=self.encoding, errors="replace") as f:
                report_data = json.load(f)

            summary = InspectionSummary(**report_data["summary"])
            node_results = [NodeInspectionResult(**nr) for nr in report_data["node_results"]]

            return InspectionReport(
                summary=summary,
                node_results=node_results,
                timestamp=report_data["timestamp"],
                config_source=report_data["config_source"],
            )
        except Exception as e:
            logger.error(f"加载报告失败: {e}")
            return None