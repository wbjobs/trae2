import re
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Set, Tuple

from communication import ClusterCommunicator, CommandResult

logger = logging.getLogger(__name__)

VIRTUAL_FILESYSTEMS: Set[str] = {
    "tmpfs", "devtmpfs", "sysfs", "proc", "devpts", "cgroup",
    "cgroup2", "pstore", "bpf", "tracefs", "configfs", "securityfs",
    "squashfs", "overlay", "mqueue", "hugetlbfs", "debugfs",
    "fusectl", "autofs", "rpc_pipefs", "nfsd", "selinuxfs",
}


@dataclass
class DiskUsage:
    filesystem: str
    type: str
    size: str
    used: str
    available: str
    usage_percent: int
    mounted_on: str
    size_bytes: int = 0
    used_bytes: int = 0
    available_bytes: int = 0

    @property
    def is_warning(self, threshold: int = 85) -> bool:
        return self.usage_percent >= threshold

    @property
    def is_virtual(self) -> bool:
        return self.type in VIRTUAL_FILESYSTEMS


@dataclass
class InodeUsage:
    filesystem: str
    type: str
    inodes_total: int
    inodes_used: int
    inodes_free: int
    inode_percent: int
    mounted_on: str

    @property
    def is_warning(self, threshold: int = 85) -> bool:
        return self.inode_percent >= threshold

    @property
    def is_virtual(self) -> bool:
        return self.type in VIRTUAL_FILESYSTEMS


@dataclass
class SmartAttribute:
    id: int
    name: str
    flag: str
    value: int
    worst: int
    threshold: int
    raw_value: str
    raw_int: Optional[int] = None

    @property
    def is_critical(self) -> bool:
        return self.id in {1, 5, 10, 187, 196, 197, 198, 201}


@dataclass
class SmartInfo:
    device: str
    device_path: str
    model: str
    serial: str
    firmware: str
    capacity: str
    capacity_bytes: int = 0
    passed: Optional[bool] = None
    smart_supported: bool = True
    smart_enabled: bool = True
    attributes: List[SmartAttribute] = field(default_factory=list)
    raw_output: str = ""
    error_message: str = ""

    @property
    def critical_attributes(self) -> List[SmartAttribute]:
        return [a for a in self.attributes if a.is_critical]

    @property
    def has_warning(self) -> bool:
        for attr in self.critical_attributes:
            if attr.threshold > 0 and attr.value <= attr.threshold:
                return True
            if attr.worst > 0 and attr.value <= attr.worst and attr.value < 100:
                return True
        return False

    @property
    def has_failed(self) -> bool:
        if self.passed is False:
            return True
        for attr in self.critical_attributes:
            if attr.threshold > 0 and attr.value <= attr.threshold:
                return True
        return False


@dataclass
class DiskHealth:
    host: str
    disk_usages: List[DiskUsage] = field(default_factory=list)
    inode_usages: List[InodeUsage] = field(default_factory=list)
    smart_infos: List[SmartInfo] = field(default_factory=list)
    raw_df: str = ""
    raw_df_t: str = ""
    raw_i: str = ""
    raw_smart: str = ""
    error: Optional[str] = None
    command_errors: List[str] = field(default_factory=list)


class DiskChecker:
    def __init__(
        self,
        communicator: ClusterCommunicator,
        usage_threshold: int = 85,
        inode_threshold: int = 85,
        include_virtual: bool = False,
    ):
        self.communicator = communicator
        self.usage_threshold = usage_threshold
        self.inode_threshold = inode_threshold
        self.include_virtual = include_virtual

    def _parse_human_size(self, size_str: str) -> int:
        size_str = size_str.strip().upper()
        if not size_str or size_str in ["-", ""]:
            return 0

        multipliers = {
            "B": 1,
            "K": 1024, "KB": 1024, "KIB": 1024,
            "M": 1024 ** 2, "MB": 1024 ** 2, "MIB": 1024 ** 2,
            "G": 1024 ** 3, "GB": 1024 ** 3, "GIB": 1024 ** 3,
            "T": 1024 ** 4, "TB": 1024 ** 4, "TIB": 1024 ** 4,
            "P": 1024 ** 5, "PB": 1024 ** 5, "PIB": 1024 ** 5,
        }

        match = re.match(r'^([\d.]+)\s*([KMGTPE]?I?B?)?$', size_str)
        if not match:
            try:
                return int(float(size_str))
            except ValueError:
                return 0

        num = float(match.group(1))
        unit = match.group(2) or "B"
        multiplier = multipliers.get(unit, 1)
        return int(num * multiplier)

    def _parse_percent(self, pct_str: str) -> int:
        if not pct_str:
            return 0
        pct_str = pct_str.strip().replace("%", "")
        try:
            val = float(pct_str)
            return int(round(val))
        except ValueError:
            return 0

    def _parse_df_output(self, output: str, df_t_output: str = "") -> List[DiskUsage]:
        usages = []
        lines = output.strip().split("\n")
        if len(lines) < 2:
            return usages

        fs_types = {}
        if df_t_output:
            t_lines = df_t_output.strip().split("\n")
            for line in t_lines[1:]:
                parts = line.split()
                if len(parts) >= 2:
                    fs_types[parts[0]] = parts[1]

        header = lines[0]
        header_cols = re.split(r'\s{2,}', header)
        use_positional = len(header_cols) >= 6 and "Mounted" in header_cols[-1]

        for line in lines[1:]:
            if not line.strip():
                continue

            try:
                if use_positional and "%" in line:
                    match = re.match(
                        r'^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%\s+(.+)$',
                        line
                    )
                    if match:
                        fs, size, used, avail, pct, mount = match.groups()
                        pct_int = int(pct)
                    else:
                        parts = line.split(None, 5)
                        if len(parts) < 6:
                            continue
                        fs, size, used, avail, pct_str, mount = parts
                        pct_int = self._parse_percent(pct_str)
                else:
                    parts = line.split(None, 5)
                    if len(parts) < 6:
                        continue
                    fs, size, used, avail, pct_str, mount = parts
                    pct_int = self._parse_percent(pct_str)

                fs_type = fs_types.get(fs, "")

                usage = DiskUsage(
                    filesystem=fs,
                    type=fs_type,
                    size=size,
                    used=used,
                    available=avail,
                    usage_percent=pct_int,
                    mounted_on=mount.strip(),
                    size_bytes=self._parse_human_size(size),
                    used_bytes=self._parse_human_size(used),
                    available_bytes=self._parse_human_size(avail),
                )

                if self.include_virtual or not usage.is_virtual:
                    usages.append(usage)

            except (ValueError, IndexError) as e:
                logger.debug(f"解析 df 行失败: {line} - {e}")
                continue

        return usages

    def _parse_df_i_output(self, output: str, df_t_output: str = "") -> List[InodeUsage]:
        usages = []
        lines = output.strip().split("\n")
        if len(lines) < 2:
            return usages

        fs_types = {}
        if df_t_output:
            t_lines = df_t_output.strip().split("\n")
            for line in t_lines[1:]:
                parts = line.split()
                if len(parts) >= 2:
                    fs_types[parts[0]] = parts[1]

        for line in lines[1:]:
            if not line.strip():
                continue

            try:
                match = re.match(
                    r'^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%\s+(.+)$',
                    line
                )
                if match:
                    fs, total_str, used_str, free_str, pct, mount = match.groups()
                    pct_int = int(pct)
                else:
                    parts = line.split(None, 5)
                    if len(parts) < 6:
                        continue
                    fs, total_str, used_str, free_str, pct_str, mount = parts
                    pct_int = self._parse_percent(pct_str)

                def safe_int(s: str) -> int:
                    s = s.strip().replace(",", "")
                    try:
                        return int(s) if s.isdigit() else 0
                    except ValueError:
                        return 0

                fs_type = fs_types.get(fs, "")

                usage = InodeUsage(
                    filesystem=fs,
                    type=fs_type,
                    inodes_total=safe_int(total_str),
                    inodes_used=safe_int(used_str),
                    inodes_free=safe_int(free_str),
                    inode_percent=pct_int,
                    mounted_on=mount.strip(),
                )

                if self.include_virtual or not usage.is_virtual:
                    usages.append(usage)

            except (ValueError, IndexError) as e:
                logger.debug(f"解析 df -i 行失败: {line} - {e}")
                continue

        return usages

    def _parse_smart_capacity(self, line: str) -> Tuple[str, int]:
        match = re.search(r'User Capacity:\s*([^\[]+)\s*\[([\d,]+)\s*bytes\]', line)
        if match:
            display = match.group(1).strip()
            bytes_str = match.group(2).replace(",", "")
            try:
                return display, int(bytes_str)
            except ValueError:
                return display, 0
        return "", 0

    def _parse_smart_output(self, output: str) -> List[SmartInfo]:
        smart_infos = []

        blocks = re.split(r'\n(?===\s*/dev/)', output)

        for block in blocks:
            block = block.strip()
            if not block:
                continue

            device_match = re.match(r'^=+\s*/dev/(\w+)\s*=+', block)
            if not device_match:
                continue

            device = device_match.group(1)
            device_path = f"/dev/{device}"

            if "smartctl not available" in block or "permission denied" in block.lower():
                smart_infos.append(SmartInfo(
                    device=device,
                    device_path=device_path,
                    model="",
                    serial="",
                    firmware="",
                    capacity="",
                    smart_supported=False,
                    smart_enabled=False,
                    raw_output=block,
                    error_message=block.strip(),
                ))
                continue

            model = serial = firmware = capacity = ""
            capacity_bytes = 0
            passed: Optional[bool] = None
            smart_supported = True
            smart_enabled = True
            attrs: List[SmartAttribute] = []
            in_attr_section = False
            error_lines: List[str] = []

            lines = block.split("\n")
            for line in lines:
                line_stripped = line.strip()

                if "SMART support is:" in line_stripped:
                    if "Unavailable" in line_stripped:
                        smart_supported = False
                    elif "Disabled" in line_stripped:
                        smart_enabled = False

                if not smart_supported:
                    continue

                if "Device Model:" in line_stripped or "Model Number:" in line_stripped or "Product:" in line_stripped:
                    model = line_stripped.split(":", 1)[1].strip()
                elif "Serial Number:" in line_stripped or "Serial:" in line_stripped:
                    serial = line_stripped.split(":", 1)[1].strip()
                elif "Firmware Version:" in line_stripped or "Revision:" in line_stripped:
                    firmware = line_stripped.split(":", 1)[1].strip()
                elif "User Capacity:" in line_stripped:
                    capacity, capacity_bytes = self._parse_smart_capacity(line_stripped)
                    if not capacity:
                        capacity = line_stripped.split(":", 1)[1].strip()
                elif "SMART overall-health self-assessment test result:" in line_stripped:
                    passed = "PASSED" in line_stripped.upper()
                elif "SMART Health Status:" in line_stripped:
                    status = line_stripped.split(":", 1)[1].strip().upper()
                    passed = status == "OK" or status == "PASSED"
                elif re.match(r'^(ID#|ID)\s+ATTRIBUTE_NAME', line_stripped):
                    in_attr_section = True
                    continue
                elif in_attr_section:
                    if not line_stripped or line_stripped.startswith("---") or re.match(r'^[A-Z]', line_stripped):
                        in_attr_section = False
                        continue

                    attr_parts = line_stripped.split()
                    if len(attr_parts) >= 8:
                        try:
                            raw_int = None
                            if len(attr_parts) >= 10:
                                raw_str = attr_parts[9]
                                if raw_str.isdigit():
                                    raw_int = int(raw_str)

                            attrs.append(SmartAttribute(
                                id=int(attr_parts[0]),
                                name=attr_parts[1],
                                flag=attr_parts[2],
                                value=int(attr_parts[3]),
                                worst=int(attr_parts[4]),
                                threshold=int(attr_parts[5]),
                                raw_value=" ".join(attr_parts[9:]) if len(attr_parts) >= 10 else attr_parts[6] if len(attr_parts) >= 7 else "",
                                raw_int=raw_int,
                            ))
                        except (ValueError, IndexError) as e:
                            logger.debug(f"解析 SMART 属性行失败: {line_stripped} - {e}")

            smart_infos.append(SmartInfo(
                device=device,
                device_path=device_path,
                model=model,
                serial=serial,
                firmware=firmware,
                capacity=capacity,
                capacity_bytes=capacity_bytes,
                passed=passed,
                smart_supported=smart_supported,
                smart_enabled=smart_enabled,
                attributes=attrs,
                raw_output=block,
                error_message="\n".join(error_lines),
            ))

        return smart_infos

    def _get_block_devices(self, host: str) -> List[str]:
        cmd = (
            "lsblk -dno NAME,TYPE 2>/dev/null | "
            "awk '$2==\"disk\" {print $1}' | "
            "grep -E '^(sd[a-z]+|vd[a-z]+|nvme[0-9]+n[0-9]+|xvd[a-z]+)$'"
        )
        result = self.communicator.execute_on_node(host, cmd)
        if result and result.success:
            devices = [d.strip() for d in result.stdout.strip().split("\n") if d.strip()]
            if devices:
                return devices

        fallback = "cat /proc/partitions 2>/dev/null | awk 'NR>2 && $3>0 {print $4}' | grep -E '^(sd[a-z]+|vd[a-z]+|nvme[0-9]+n[0-9]+|xvd[a-z]+)$'"
        result2 = self.communicator.execute_on_node(host, fallback)
        if result2 and result2.success:
            return [d.strip() for d in result2.stdout.strip().split("\n") if d.strip()]

        return []

    def check_disk_usage(self, host: str) -> DiskHealth:
        health = DiskHealth(host=host)

        df_t_cmd = "df -T --output=source,fstype 2>/dev/null | tail -n +2"
        df_t_result = self.communicator.execute_on_node(host, df_t_cmd)
        if df_t_result and df_t_result.success:
            health.raw_df_t = df_t_result.stdout
        else:
            if df_t_result and df_t_result.error:
                health.command_errors.append(f"df -T 失败: {df_t_result.error}")

        df_cmd = "df -h --output=source,size,used,avail,pcent,target 2>/dev/null || df -hP 2>/dev/null || df -h"
        df_result = self.communicator.execute_on_node(host, df_cmd)
        if df_result and df_result.success:
            health.raw_df = df_result.stdout
            health.disk_usages = self._parse_df_output(
                df_result.stdout,
                health.raw_df_t
            )
        else:
            err = df_result.error if df_result else "命令执行失败"
            health.command_errors.append(f"df 失败: {err}")

        df_i_cmd = "df -i --output=source,itotal,iused,iavail,pcent,target 2>/dev/null || df -iP 2>/dev/null || df -i"
        df_i_result = self.communicator.execute_on_node(host, df_i_cmd)
        if df_i_result and df_i_result.success:
            health.raw_i = df_i_result.stdout
            health.inode_usages = self._parse_df_i_output(
                df_i_result.stdout,
                health.raw_df_t
            )
        else:
            err = df_i_result.error if df_i_result else "命令执行失败"
            health.command_errors.append(f"df -i 失败: {err}")

        if health.command_errors and not health.disk_usages:
            health.error = "; ".join(health.command_errors)

        return health

    def check_smart(self, host: str) -> DiskHealth:
        health = DiskHealth(host=host)

        devices = self._get_block_devices(host)
        if not devices:
            health.error = "未检测到磁盘设备"
            return health

        smart_cmds = []
        for disk in devices:
            smart_cmds.append(
                f'echo "=== /dev/{disk} ==="; '
                f'smartctl -H /dev/{disk} 2>&1; '
                f'smartctl -A /dev/{disk} 2>&1'
            )

        smart_cmd = "; ".join(smart_cmds)
        smart_result = self.communicator.execute_on_node(host, smart_cmd)

        if smart_result and smart_result.stdout:
            health.raw_smart = smart_result.stdout
            health.smart_infos = self._parse_smart_output(smart_result.stdout)

            successful = sum(1 for s in health.smart_infos if s.smart_supported)
            if successful == 0 and len(devices) > 0:
                health.error = "所有磁盘均不支持 SMART 或无权限访问"
        elif smart_result:
            health.error = smart_result.error or "SMART 检查失败"

        return health

    def check_all(self, host: str) -> DiskHealth:
        logger.info(f"检查磁盘状态: {host}")

        usage_health = self.check_disk_usage(host)
        logger.debug(f"  发现 {len(usage_health.disk_usages)} 个文件系统, "
                     f"{len(usage_health.inode_usages)} 个 inode 统计")

        smart_health = self.check_smart(host)
        logger.debug(f"  SMART 检测完成: {len(smart_health.smart_infos)} 块磁盘")

        health = DiskHealth(
            host=host,
            disk_usages=usage_health.disk_usages,
            inode_usages=usage_health.inode_usages,
            smart_infos=smart_health.smart_infos,
            raw_df=usage_health.raw_df,
            raw_df_t=usage_health.raw_df_t,
            raw_i=usage_health.raw_i,
            raw_smart=smart_health.raw_smart,
        )

        if usage_health.error:
            health.command_errors.append(usage_health.error)
        if smart_health.error:
            health.command_errors.append(smart_health.error)
        health.command_errors.extend(usage_health.command_errors)

        if health.command_errors and not health.disk_usages and not health.smart_infos:
            health.error = "; ".join(health.command_errors)

        return health

    def check_all_nodes(self) -> List[DiskHealth]:
        results = []
        for node in self.communicator.nodes:
            health = self.check_all(node.host)
            results.append(health)
        return results

    def get_warnings(self, health: DiskHealth) -> List[str]:
        warnings = []
        errors = []

        for du in health.disk_usages:
            if du.is_warning(self.usage_threshold):
                warnings.append(
                    f"磁盘使用率告警: {du.filesystem}({du.type}) 挂载点 {du.mounted_on} "
                    f"使用率 {du.usage_percent}% (阈值 {self.usage_threshold}%)"
                )

        for iu in health.inode_usages:
            if iu.is_warning(self.inode_threshold):
                warnings.append(
                    f"Inode 使用率告警: {iu.filesystem}({iu.type}) 挂载点 {iu.mounted_on} "
                    f"Inode 使用率 {iu.inode_percent}% (阈值 {self.inode_threshold}%)"
                )

        for si in health.smart_infos:
            if not si.smart_supported:
                continue
            if si.has_failed:
                errors.append(f"SMART 自检失败: {si.device_path}")
            elif si.passed is False:
                errors.append(f"SMART 健康状态失败: {si.device_path}")
            if si.has_warning:
                critical_attrs = [
                    f"{a.name}(当前:{a.value},阈值:{a.threshold})"
                    for a in si.critical_attributes
                    if a.threshold > 0 and a.value <= a.threshold
                ]
                warnings.append(
                    f"SMART 关键属性告警: {si.device_path} - "
                    f"{', '.join(critical_attrs) if critical_attrs else '参数异常'}"
                )

        if health.error:
            errors.append(f"检测失败: {health.error}")

        return errors + warnings

    def get_total_stats(self, health: DiskHealth) -> dict:
        total_size = sum(du.size_bytes for du in health.disk_usages)
        total_used = sum(du.used_bytes for du in health.disk_usages)
        total_avail = sum(du.available_bytes for du in health.disk_usages)

        return {
            "total_size_bytes": total_size,
            "total_used_bytes": total_used,
            "total_available_bytes": total_avail,
            "usage_percent": round((total_used / total_size * 100), 1) if total_size > 0 else 0,
            "filesystem_count": len(health.disk_usages),
            "disk_count": len(health.smart_infos),
            "warning_count": len(self.get_warnings(health)),
        }