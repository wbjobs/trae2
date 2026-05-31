import logging
import re
from typing import Any, Dict, List, Optional

from .node_communicator import NodeCommunicator

logger = logging.getLogger(__name__)


class ResourceDetector:
    def __init__(
        self,
        communicator: NodeCommunicator,
        thresholds: Dict[str, Any],
        disk_paths: Optional[List[str]] = None,
    ):
        self.communicator = communicator
        self.thresholds = thresholds
        self.disk_paths = disk_paths or ["/"]

    @staticmethod
    def _get_status(usage: float, warning: float, critical: float) -> str:
        if usage >= critical:
            return "CRITICAL"
        elif usage >= warning:
            return "WARNING"
        return "NORMAL"

    @staticmethod
    def _safe_float(value: Any, default: float = 0.0) -> float:
        if value is None:
            return default
        try:
            value_str = str(value)
            cleaned = re.sub(r"[^\d.]", "", value_str.strip())
            return float(cleaned) if cleaned else default
        except (ValueError, TypeError):
            return default

    def detect_cpu(self, nodes: List[Dict[str, Any]], parallel: bool = True, max_workers: int = 10) -> List[Dict[str, Any]]:
        command = (
            "LC_ALL=C awk 'NR==1 {prev_idle=$5; prev_total=$1+$2+$3+$4+$5+$6+$7} "
            "END {idle=$5-prev_idle; total=($1+$2+$3+$4+$5+$6+$7)-prev_total; "
            "printf \"%.2f\", (100*(1-idle/total))}' "
            "/proc/stat /proc/stat"
        )
        results = self.communicator.batch_execute(nodes, command, parallel, max_workers)
        parsed_results = []

        for result in results:
            node_info = next((n for n in nodes if n.get("address") == result["node"]), {})
            parsed = {
                "node": result["node"],
                "node_name": node_info.get("name", result["node"]),
                "role": node_info.get("role", "unknown"),
                "success": result["success"],
                "cpu_usage": 0.0,
                "cpu_user": 0.0,
                "cpu_system": 0.0,
                "cpu_iowait": 0.0,
                "status": "UNKNOWN",
                "error": result["error"],
                "raw_output": result.get("output", ""),
            }
            if result["success"] and result["output"]:
                try:
                    cpu_usage = self._safe_float(result["output"].strip())
                    if cpu_usage > 0 and cpu_usage <= 100:
                        parsed["cpu_usage"] = round(cpu_usage, 2)
                        parsed["status"] = self._get_status(
                            cpu_usage,
                            self.thresholds.get("cpu_warning", 70),
                            self.thresholds.get("cpu_critical", 90),
                        )
                    else:
                        parsed["error"] = f"CPU 使用率异常: {cpu_usage}%，使用备用方法重试"
                        logger.warning(f"节点 {result['node']} {parsed['error']}")
                        parsed["cpu_usage"], parsed["status"] = self._detect_cpu_fallback(
                            result["node"], node_info
                        )
                except Exception as e:
                    parsed["error"] = f"解析 CPU 数据失败: {e}, output: {result['output']}"
                    logger.error(parsed["error"])
            parsed_results.append(parsed)
        return parsed_results

    def _detect_cpu_fallback(
        self, node_address: str, node_info: Dict[str, Any]
    ) -> tuple:
        try:
            command = "LC_ALL=C top -bn3 -d1 | awk '/Cpu\\(s\\)/ {cpu=$8} END {printf \"%.2f\", 100-cpu}'"
            result = self.communicator.execute_on_node(node_address, command)
            if result["success"] and result["output"]:
                cpu_usage = self._safe_float(result["output"].strip())
                if cpu_usage > 0 and cpu_usage <= 100:
                    status = self._get_status(
                        cpu_usage,
                        self.thresholds.get("cpu_warning", 70),
                        self.thresholds.get("cpu_critical", 90),
                    )
                    return round(cpu_usage, 2), status
        except Exception as e:
            logger.error(f"备用 CPU 检测方法失败: {e}")
        return 0.0, "UNKNOWN"

    def detect_memory(self, nodes: List[Dict[str, Any]], parallel: bool = True, max_workers: int = 10) -> List[Dict[str, Any]]:
        command = (
            "LC_ALL=C free -b | awk 'NR==2 { "
            "total=$2; used=$3; free=$4; buff=$6; cache=$7; "
            "available=$7; "
            "if ($7==\"\" && NF>=7) available=$7; "
            "used_actual=total-free-buff-cache; "
            "if (available>0) usage_pct=100*(1-available/total); "
            "else usage_pct=100*used_actual/total; "
            "printf \"%.2f|%d|%d|%d|%d\", usage_pct, total, used, buff, cache "
            "}'"
        )
        results = self.communicator.batch_execute(nodes, command, parallel, max_workers)
        parsed_results = []

        for result in results:
            node_info = next((n for n in nodes if n.get("address") == result["node"]), {})
            parsed = {
                "node": result["node"],
                "node_name": node_info.get("name", result["node"]),
                "role": node_info.get("role", "unknown"),
                "success": result["success"],
                "memory_usage": 0.0,
                "memory_total_bytes": 0,
                "memory_used_bytes": 0,
                "memory_buffers": 0,
                "memory_cached": 0,
                "status": "UNKNOWN",
                "error": result["error"],
                "raw_output": result.get("output", ""),
            }
            if result["success"] and result["output"]:
                try:
                    parts = result["output"].strip().split("|")
                    if len(parts) >= 5:
                        mem_usage = self._safe_float(parts[0])
                        total = int(self._safe_float(parts[1]))
                        used = int(self._safe_float(parts[2]))
                        buff = int(self._safe_float(parts[3]))
                        cache = int(self._safe_float(parts[4]))

                        if mem_usage > 0 and mem_usage <= 100:
                            parsed["memory_usage"] = round(mem_usage, 2)
                            parsed["memory_total_bytes"] = total
                            parsed["memory_used_bytes"] = used
                            parsed["memory_buffers"] = buff
                            parsed["memory_cached"] = cache
                            parsed["status"] = self._get_status(
                                mem_usage,
                                self.thresholds.get("memory_warning", 75),
                                self.thresholds.get("memory_critical", 90),
                            )
                        else:
                            parsed["error"] = f"内存使用率异常: {mem_usage}%"
                            logger.warning(f"节点 {result['node']} {parsed['error']}")
                except Exception as e:
                    parsed["error"] = f"解析内存数据失败: {e}, output: {result['output']}"
                    logger.error(parsed["error"])
            parsed_results.append(parsed)
        return parsed_results

    def detect_disk(self, nodes: List[Dict[str, Any]], parallel: bool = True, max_workers: int = 10) -> List[Dict[str, Any]]:
        disk_paths_str = " ".join(self.disk_paths)
        command = (
            f"LC_ALL=C df -P -B1 {disk_paths_str} 2>/dev/null | "
            "awk 'NR>1 {printf \"%s|%d|%d|%d|%s\\n\", $6, $2, $3, $4, $5}'"
        )

        def _command_generator(node: Dict[str, Any]) -> str:
            return command

        results = self.communicator.batch_execute_with_context(
            nodes, _command_generator, parallel, max_workers
        )
        parsed_results = []

        for result in results:
            node_info = result.get("node_info", {})
            parsed = {
                "node": result["node"],
                "node_name": node_info.get("name", result["node"]),
                "role": node_info.get("role", "unknown"),
                "success": result["success"],
                "disks": [],
                "error": result["error"],
                "raw_output": result.get("output", ""),
            }
            if result["success"] and result["output"]:
                try:
                    for line in result["output"].split("\n"):
                        line = line.strip()
                        if not line or "|" not in line:
                            continue
                        parts = line.split("|")
                        if len(parts) >= 5:
                            mount_point = parts[0].strip()
                            total_bytes = int(self._safe_float(parts[1]))
                            used_bytes = int(self._safe_float(parts[2]))
                            avail_bytes = int(self._safe_float(parts[3]))
                            usage_pct_str = parts[4].rstrip("%").strip()

                            if total_bytes > 0:
                                usage = (used_bytes / total_bytes) * 100
                            else:
                                usage = self._safe_float(usage_pct_str)

                            usage = max(0.0, min(100.0, usage))
                            status = self._get_status(
                                usage,
                                self.thresholds.get("disk_warning", 80),
                                self.thresholds.get("disk_critical", 95),
                            )

                            def _format_bytes(bytes_val: int) -> str:
                                for unit in ["B", "K", "M", "G", "T"]:
                                    if bytes_val < 1024:
                                        return f"{bytes_val:.1f}{unit}"
                                    bytes_val /= 1024
                                return f"{bytes_val:.1f}P"

                            parsed["disks"].append(
                                {
                                    "mount_point": mount_point,
                                    "usage": round(usage, 2),
                                    "total_bytes": total_bytes,
                                    "used_bytes": used_bytes,
                                    "avail_bytes": avail_bytes,
                                    "total": _format_bytes(total_bytes),
                                    "used": _format_bytes(used_bytes),
                                    "available": _format_bytes(avail_bytes),
                                    "status": status,
                                }
                            )
                except Exception as e:
                    parsed["error"] = f"解析磁盘数据失败: {e}"
                    logger.error(parsed["error"])
            parsed_results.append(parsed)
        return parsed_results

    def detect_all(self, nodes: List[Dict[str, Any]], parallel: bool = True, max_workers: int = 10) -> Dict[str, Any]:
        cpu_results = self.detect_cpu(nodes, parallel, max_workers)
        memory_results = self.detect_memory(nodes, parallel, max_workers)
        disk_results = self.detect_disk(nodes, parallel, max_workers)

        merged = {}
        for node_result in cpu_results:
            node_addr = node_result["node"]
            merged[node_addr] = {
                "node": node_addr,
                "node_name": node_result["node_name"],
                "role": node_result["role"],
                "cpu": node_result,
            }

        for mem_result in memory_results:
            node_addr = mem_result["node"]
            if node_addr in merged:
                merged[node_addr]["memory"] = mem_result
            else:
                merged[node_addr] = {
                    "node": node_addr,
                    "node_name": mem_result["node_name"],
                    "role": mem_result["role"],
                    "memory": mem_result,
                }

        for disk_result in disk_results:
            node_addr = disk_result["node"]
            if node_addr in merged:
                merged[node_addr]["disk"] = disk_result
            else:
                merged[node_addr] = {
                    "node": node_addr,
                    "node_name": disk_result["node_name"],
                    "role": disk_result["role"],
                    "disk": disk_result,
                }

        return {"nodes": list(merged.values()), "timestamp": self._get_timestamp()}

    @staticmethod
    def _get_timestamp() -> str:
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def mark_high_load_nodes(
        resource_data: Dict[str, Any],
        history_data: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        consecutive_threshold: int = 3,
    ) -> Dict[str, Any]:
        nodes = resource_data.get("nodes", [])
        high_load_nodes: List[Dict[str, Any]] = []

        for node in nodes:
            node_addr = node.get("node")
            node_name = node.get("node_name", node_addr)

            cpu_status = node.get("cpu", {}).get("status", "UNKNOWN")
            mem_status = node.get("memory", {}).get("status", "UNKNOWN")
            disk_status = (
                max(
                    (d.get("status", "UNKNOWN") for d in node.get("disk", {}).get("disks", [])),
                    default="UNKNOWN",
                )
                if node.get("disk", {}).get("disks")
                else "UNKNOWN"
            )

            is_high_load = (
                cpu_status == "CRITICAL"
                or mem_status == "CRITICAL"
                or disk_status == "CRITICAL"
            )

            has_warning = (
                cpu_status == "WARNING"
                or mem_status == "WARNING"
                or disk_status == "WARNING"
            )

            consecutive_count = 0
            if history_data and node_addr in history_data:
                for hist in history_data[node_addr][-consecutive_threshold + 1 :]:
                    hist_cpu = hist.get("cpu", {}).get("status")
                    hist_mem = hist.get("memory", {}).get("status")
                    hist_disk = max(
                        (d.get("status") for d in hist.get("disk", {}).get("disks", [])),
                        default="UNKNOWN",
                    )
                    if (
                        hist_cpu == "CRITICAL"
                        or hist_mem == "CRITICAL"
                        or hist_disk == "CRITICAL"
                    ):
                        consecutive_count += 1

            node["is_high_load"] = is_high_load
            node["has_warning"] = has_warning
            node["high_load_consecutive"] = consecutive_count
            node["high_load_tags"] = []

            if cpu_status == "CRITICAL":
                node["high_load_tags"].append("CPU_CRITICAL")
            if mem_status == "CRITICAL":
                node["high_load_tags"].append("MEMORY_CRITICAL")
            if disk_status == "CRITICAL":
                node["high_load_tags"].append("DISK_CRITICAL")

            if is_high_load or (has_warning and consecutive_count >= consecutive_threshold):
                node["needs_attention"] = True
                high_load_nodes.append(node)
            else:
                node["needs_attention"] = False

        resource_data["high_load_nodes"] = high_load_nodes
        resource_data["high_load_count"] = len(high_load_nodes)
        resource_data["normal_count"] = len(nodes) - len(high_load_nodes)

        return resource_data

    @staticmethod
    def optimize_node_polling(
        nodes: List[Dict[str, Any]],
        resource_history: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        adaptive: bool = True,
        high_load_priority: bool = True,
        batch_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        if not nodes:
            return {"priority_nodes": [], "normal_nodes": [], "batches": []}

        priority_nodes: List[Dict[str, Any]] = []
        normal_nodes: List[Dict[str, Any]] = []
        high_load_addrs: set = set()

        if high_load_priority and resource_history:
            for node_addr, hist_list in resource_history.items():
                if not hist_list:
                    continue
                last = hist_list[-1]
                if last.get("is_high_load") or last.get("needs_attention"):
                    high_load_addrs.add(node_addr)

        for node in nodes:
            addr = node.get("address") or node.get("ip")
            if addr and addr in high_load_addrs:
                priority_nodes.append(node)
            else:
                normal_nodes.append(node)

        sorted_priority = sorted(
            priority_nodes,
            key=lambda n: (
                -resource_history.get(n.get("address") or n.get("ip"), [{}])[-1].get(
                    "high_load_consecutive", 0
                )
                if resource_history and (n.get("address") or n.get("ip")) in resource_history
                else 0
            ),
        )

        if adaptive and resource_history:
            normal_nodes.sort(
                key=lambda n: (
                    resource_history.get(n.get("address") or n.get("ip"), [{}])[-1].get(
                        "has_warning", False
                    ),
                    -len(resource_history.get(n.get("address") or n.get("ip"), [])),
                ),
                reverse=True,
            )

        ordered_nodes = sorted_priority + normal_nodes

        batches: List[List[Dict[str, Any]]] = []
        if batch_size and batch_size > 0:
            for i in range(0, len(ordered_nodes), batch_size):
                batches.append(ordered_nodes[i : i + batch_size])
        else:
            auto_batch_size = min(
                max(10, len(ordered_nodes) // 3 if len(ordered_nodes) >= 30 else len(ordered_nodes)),
                50,
            )
            for i in range(0, len(ordered_nodes), auto_batch_size):
                batches.append(ordered_nodes[i : i + auto_batch_size])

        return {
            "priority_nodes": sorted_priority,
            "normal_nodes": normal_nodes,
            "ordered_nodes": ordered_nodes,
            "batches": batches,
            "batch_size": batch_size or (batches[0] and len(batches[0]) or 0),
            "total_count": len(nodes),
            "priority_count": len(sorted_priority),
            "normal_count": len(normal_nodes),
        }

    def detect_all_optimized(
        self,
        nodes: List[Dict[str, Any]],
        resource_history: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        parallel: bool = True,
        max_workers: int = 10,
        adaptive_polling: bool = True,
        high_load_first: bool = True,
        mark_high_load: bool = True,
    ) -> Dict[str, Any]:
        polling_plan = self.optimize_node_polling(
            nodes=nodes,
            resource_history=resource_history,
            adaptive=adaptive_polling,
            high_load_priority=high_load_first,
        )

        ordered_nodes = polling_plan.get("ordered_nodes", nodes)
        priority_nodes = polling_plan.get("priority_nodes", [])
        priority_addrs = {n.get("address") or n.get("ip") for n in priority_nodes}

        logger.info(
            f"优化巡检计划: 共 {polling_plan['total_count']} 个节点, "
            f"优先节点 {polling_plan['priority_count']} 个, "
            f"普通节点 {polling_plan['normal_count']} 个, "
            f"分 {len(polling_plan['batches'])} 批执行"
        )

        if priority_nodes and high_load_first:
            logger.info("第一步: 优先巡检高负载节点...")
            priority_results = self.detect_all(priority_nodes, parallel, max_workers)
            priority_node_addrs = {n.get("node") for n in priority_results.get("nodes", [])}

            remaining_nodes = [
                n for n in ordered_nodes
                if (n.get("address") or n.get("ip")) not in priority_node_addrs
            ]

            if remaining_nodes:
                logger.info(f"第二步: 巡检剩余 {len(remaining_nodes)} 个节点...")
                remaining_results = self.detect_all(remaining_nodes, parallel, max_workers)
                all_nodes = priority_results.get("nodes", []) + remaining_results.get("nodes", [])
                final_result = {"nodes": all_nodes, "timestamp": self._get_timestamp()}
            else:
                final_result = priority_results
        else:
            final_result = self.detect_all(ordered_nodes, parallel, max_workers)

        if mark_high_load:
            final_result = self.mark_high_load_nodes(final_result, resource_history)

        final_result["polling_plan"] = polling_plan
        return final_result
