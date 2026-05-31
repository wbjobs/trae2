import os
import json
import time
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Set
from pathlib import Path


logger = logging.getLogger(__name__)


@dataclass
class NodeStatus:
    host: str
    role: str = "unknown"
    tags: List[str] = field(default_factory=list)
    status: str = "unknown"
    health_score: int = 100
    consecutive_failures: int = 0
    total_failures: int = 0
    total_successes: int = 0
    last_check: Optional[str] = None
    last_success: Optional[str] = None
    last_failure: Optional[str] = None
    last_error: Optional[str] = None
    avg_response_time: float = 0.0
    is_blacklisted: bool = False
    blacklist_reason: Optional[str] = None
    blacklist_until: Optional[str] = None
    failure_history: List[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    @property
    def is_healthy(self) -> bool:
        return self.status == "healthy" and not self.is_blacklisted

    @property
    def is_unhealthy(self) -> bool:
        return self.status in ("unhealthy", "error") or self.is_blacklisted

    @property
    def failure_rate(self) -> float:
        total = self.total_successes + self.total_failures
        if total == 0:
            return 0.0
        return self.total_failures / total

    @property
    def uptime_percent(self) -> float:
        total = self.total_successes + self.total_failures
        if total == 0:
            return 100.0
        return (self.total_successes / total) * 100

    def mark_success(self, response_time: float = 0.0) -> None:
        self.status = "healthy"
        self.consecutive_failures = 0
        self.total_successes += 1
        self.last_success = datetime.now().isoformat()
        self.last_check = self.last_success

        if self.avg_response_time > 0:
            self.avg_response_time = (self.avg_response_time * 0.9) + (response_time * 0.1)
        else:
            self.avg_response_time = response_time

        if self.health_score < 100:
            self.health_score = min(100, self.health_score + 5)

        if self.is_blacklisted and self._should_remove_from_blacklist():
            self.is_blacklisted = False
            self.blacklist_reason = None
            self.blacklist_until = None
            logger.info(f"节点已从黑名单移除: {self.host}")

    def mark_failure(self, error: str = "", permanent: bool = False) -> None:
        self.status = "error"
        self.consecutive_failures += 1
        self.total_failures += 1
        self.last_failure = datetime.now().isoformat()
        self.last_check = self.last_failure
        self.last_error = error

        penalty = min(30, self.consecutive_failures * 5)
        self.health_score = max(0, self.health_score - penalty)

        self.failure_history.append({
            "timestamp": self.last_failure,
            "error": error[:200],
            "consecutive": self.consecutive_failures,
        })
        if len(self.failure_history) > 50:
            self.failure_history = self.failure_history[-50:]

        if permanent:
            self._blacklist("permanent_failure", None)
        elif self.consecutive_failures >= 5:
            duration = min(3600, self.consecutive_failures * 60)
            self._blacklist(f"consecutive_failures:{self.consecutive_failures}", duration)

    def _blacklist(self, reason: str, duration_seconds: Optional[int]) -> None:
        if self.is_blacklisted:
            return

        self.is_blacklisted = True
        self.blacklist_reason = reason
        if duration_seconds:
            self.blacklist_until = (datetime.now() + timedelta(seconds=duration_seconds)).isoformat()
        else:
            self.blacklist_until = None
        logger.warning(f"节点已加入黑名单: {self.host} - {reason}")

    def _should_remove_from_blacklist(self) -> bool:
        if not self.is_blacklisted:
            return False
        if not self.blacklist_until:
            return False
        try:
            until = datetime.fromisoformat(self.blacklist_until)
            return datetime.now() > until
        except Exception:
            return False

    def reset(self) -> None:
        self.status = "unknown"
        self.health_score = 100
        self.consecutive_failures = 0
        self.is_blacklisted = False
        self.blacklist_reason = None
        self.blacklist_until = None
        self.failure_history.clear()

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "NodeStatus":
        return cls(**data)


class NodeStatusManager:
    def __init__(self, state_file: str = "./data/node_status.json",
                 auto_blacklist: bool = True,
                 max_failure_history: int = 50):
        self.state_file = state_file
        self.auto_blacklist = auto_blacklist
        self.max_failure_history = max_failure_history
        self._nodes: Dict[str, NodeStatus] = {}
        self._load_state()

    def _ensure_dir(self) -> None:
        Path(self.state_file).parent.mkdir(parents=True, exist_ok=True)

    def _load_state(self) -> None:
        if not os.path.exists(self.state_file):
            return
        try:
            with open(self.state_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            for host, node_data in data.items():
                self._nodes[host] = NodeStatus.from_dict(node_data)
            logger.info(f"已加载 {len(self._nodes)} 个节点状态")
        except Exception as e:
            logger.warning(f"加载节点状态文件失败: {e}")

    def save_state(self) -> None:
        self._ensure_dir()
        try:
            data = {host: node.to_dict() for host, node in self._nodes.items()}
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存节点状态失败: {e}")

    def register_node(self, host: str, role: str = "unknown", tags: List[str] = None) -> NodeStatus:
        if host in self._nodes:
            node = self._nodes[host]
            if role != "unknown":
                node.role = role
            if tags:
                node.tags = list(set(node.tags + tags))
            return node

        node = NodeStatus(host=host, role=role, tags=tags or [])
        self._nodes[host] = node
        return node

    def register_nodes(self, nodes: List[dict]) -> None:
        for node_info in nodes:
            self.register_node(
                host=node_info.get("host", ""),
                role=node_info.get("role", "unknown"),
                tags=node_info.get("tags", []),
            )

    def get_node(self, host: str) -> Optional[NodeStatus]:
        return self._nodes.get(host)

    def get_all_nodes(self) -> List[NodeStatus]:
        return list(self._nodes.values())

    def get_healthy_nodes(self) -> List[NodeStatus]:
        return [n for n in self._nodes.values() if n.is_healthy]

    def get_unhealthy_nodes(self) -> List[NodeStatus]:
        return [n for n in self._nodes.values() if n.is_unhealthy]

    def get_blacklisted_nodes(self) -> List[NodeStatus]:
        return [n for n in self._nodes.values() if n.is_blacklisted]

    def get_nodes_by_role(self, role: str) -> List[NodeStatus]:
        return [n for n in self._nodes.values() if n.role == role]

    def get_nodes_by_tag(self, tag: str) -> List[NodeStatus]:
        return [n for n in self._nodes.values() if tag in n.tags]

    def mark_success(self, host: str, response_time: float = 0.0) -> None:
        node = self.get_node(host)
        if not node:
            node = self.register_node(host)
        node.mark_success(response_time)

    def mark_failure(self, host: str, error: str = "", permanent: bool = False) -> None:
        node = self.get_node(host)
        if not node:
            node = self.register_node(host)
        node.mark_failure(error, permanent)

    def blacklist_node(self, host: str, reason: str, duration_seconds: Optional[int] = None) -> bool:
        node = self.get_node(host)
        if not node:
            return False
        node._blacklist(reason, duration_seconds)
        self.save_state()
        return True

    def unblacklist_node(self, host: str) -> bool:
        node = self.get_node(host)
        if not node:
            return False
        node.is_blacklisted = False
        node.blacklist_reason = None
        node.blacklist_until = None
        node.consecutive_failures = 0
        node.status = "healthy"
        self.save_state()
        return True

    def reset_node(self, host: str) -> bool:
        node = self.get_node(host)
        if not node:
            return False
        node.reset()
        return True

    def get_statistics(self) -> dict:
        total = len(self._nodes)
        healthy = len(self.get_healthy_nodes())
        unhealthy = len(self.get_unhealthy_nodes())
        blacklisted = len(self.get_blacklisted_nodes())

        avg_health = 0.0
        if total > 0:
            avg_health = sum(n.health_score for n in self._nodes.values()) / total

        avg_response = 0.0
        responsive = [n for n in self._nodes.values() if n.avg_response_time > 0]
        if responsive:
            avg_response = sum(n.avg_response_time for n in responsive) / len(responsive)

        return {
            "total_nodes": total,
            "healthy_nodes": healthy,
            "unhealthy_nodes": unhealthy,
            "blacklisted_nodes": blacklisted,
            "avg_health_score": round(avg_health, 1),
            "avg_response_time_ms": round(avg_response * 1000, 1),
            "total_failures": sum(n.total_failures for n in self._nodes.values()),
            "total_successes": sum(n.total_successes for n in self._nodes.values()),
        }

    def get_failure_summary(self) -> List[dict]:
        failures = []
        for node in self._nodes.values():
            if node.consecutive_failures > 0 or node.is_blacklisted:
                failures.append({
                    "host": node.host,
                    "consecutive_failures": node.consecutive_failures,
                    "health_score": node.health_score,
                    "last_error": node.last_error,
                    "last_failure": node.last_failure,
                    "blacklisted": node.is_blacklisted,
                    "blacklist_reason": node.blacklist_reason,
                })
        return sorted(failures, key=lambda x: x["consecutive_failures"], reverse=True)

    def prune_old_nodes(self, days: int = 30) -> int:
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        to_remove = []
        for host, node in self._nodes.items():
            if node.last_check and node.last_check < cutoff:
                to_remove.append(host)

        for host in to_remove:
            del self._nodes[host]

        if to_remove:
            logger.info(f"已清理 {len(to_remove)} 个长时间未巡检的节点")
            self.save_state()

        return len(to_remove)

    def export_report(self, filepath: str) -> None:
        report = {
            "generated_at": datetime.now().isoformat(),
            "statistics": self.get_statistics(),
            "nodes": [n.to_dict() for n in self.get_all_nodes()],
            "failures": self.get_failure_summary(),
        }
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        logger.info(f"节点状态报告已导出: {filepath}")

    def __len__(self) -> int:
        return len(self._nodes)

    def __contains__(self, host: str) -> bool:
        return host in self._nodes
