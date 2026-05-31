"""高水位节点标记模块"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class WaterLevel(Enum):
    """水位级别"""
    NORMAL = "normal"
    WARNING = "warning"
    CRITICAL = "critical"


class MarkType(Enum):
    """标记类型"""
    CPU_HIGH = "cpu_high"
    MEMORY_HIGH = "memory_high"
    DISK_HIGH = "disk_high"
    NETWORK_ERROR = "network_error"
    CONTAINER_CRASH = "container_crash"
    CONNECTION_ISSUE = "connection_issue"


@dataclass
class HighWaterMark:
    """高水位标记"""
    node_name: str
    mark_type: MarkType
    level: WaterLevel
    value: float
    threshold: float
    description: str
    first_seen: datetime = field(default_factory=datetime.now)
    last_seen: datetime = field(default_factory=datetime.now)
    occurrences: int = 1
    acknowledged: bool = False
    resolved: bool = False

    def to_dict(self) -> dict:
        return {
            "node_name": self.node_name,
            "mark_type": self.mark_type.value,
            "level": self.level.value,
            "value": self.value,
            "threshold": self.threshold,
            "description": self.description,
            "first_seen": self.first_seen.strftime("%Y-%m-%d %H:%M:%S"),
            "last_seen": self.last_seen.strftime("%Y-%m-%d %H:%M:%S"),
            "occurrences": self.occurrences,
            "acknowledged": self.acknowledged,
            "resolved": self.resolved,
        }


class HighWaterMarker:
    """高水位节点标记器"""

    def __init__(self, data_dir: str = "./data"):
        self._marks: Dict[str, Dict[str, HighWaterMark]] = {}
        self._data_dir = data_dir
        self._marks_file = os.path.join(data_dir, "high_water_marks.json")
        self._ensure_data_dir()
        self._load_marks()

    def _ensure_data_dir(self):
        """确保数据目录存在"""
        if not os.path.exists(self._data_dir):
            os.makedirs(self._data_dir)

    def _load_marks(self):
        """从文件加载标记"""
        if os.path.exists(self._marks_file):
            try:
                with open(self._marks_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                for node_name, marks_data in data.items():
                    node_marks = {}
                    for mark_type_str, mark_data in marks_data.items():
                        try:
                            mark = HighWaterMark(
                                node_name=mark_data["node_name"],
                                mark_type=MarkType(mark_data["mark_type"]),
                                level=WaterLevel(mark_data["level"]),
                                value=mark_data["value"],
                                threshold=mark_data["threshold"],
                                description=mark_data["description"],
                                first_seen=datetime.strptime(
                                    mark_data["first_seen"], "%Y-%m-%d %H:%M:%S"
                                ),
                                last_seen=datetime.strptime(
                                    mark_data["last_seen"], "%Y-%m-%d %H:%M:%S"
                                ),
                                occurrences=mark_data.get("occurrences", 1),
                                acknowledged=mark_data.get("acknowledged", False),
                                resolved=mark_data.get("resolved", False),
                            )
                            node_marks[mark_type_str] = mark
                        except Exception as e:
                            logger.warning(f"解析标记失败: {e}")
                    self._marks[node_name] = node_marks

                logger.info(f"已加载 {len(data)} 个节点的高水位标记")
            except Exception as e:
                logger.warning(f"加载高水位标记失败: {e}")

    def _save_marks(self):
        """保存标记到文件"""
        try:
            data = {}
            for node_name, node_marks in self._marks.items():
                data[node_name] = {
                    mt: m.to_dict() for mt, m in node_marks.items()
                }

            with open(self._marks_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"保存高水位标记失败: {e}")

    def mark_high_water(
        self,
        node_name: str,
        mark_type: MarkType,
        level: WaterLevel,
        value: float,
        threshold: float,
        description: str,
    ) -> HighWaterMark:
        """标记高水位节点

        Args:
            node_name: 节点名称
            mark_type: 标记类型
            level: 水位级别
            value: 当前值
            threshold: 阈值
            description: 描述

        Returns:
            HighWaterMark 对象
        """
        mark_type_str = mark_type.value

        if node_name not in self._marks:
            self._marks[node_name] = {}

        existing = self._marks[node_name].get(mark_type_str)

        if existing and not existing.resolved:
            existing.last_seen = datetime.now()
            existing.occurrences += 1
            existing.value = value
            existing.level = level
            existing.description = description
            mark = existing
        else:
            mark = HighWaterMark(
                node_name=node_name,
                mark_type=mark_type,
                level=level,
                value=value,
                threshold=threshold,
                description=description,
            )
            self._marks[node_name][mark_type_str] = mark

        self._save_marks()
        logger.info(
            f"节点 {node_name} 标记为 {mark_type.value} {level.value}: "
            f"{value} > {threshold}"
        )
        return mark

    def mark_resolved(self, node_name: str, mark_type: Optional[MarkType] = None) -> bool:
        """标记为已解决

        Args:
            node_name: 节点名称
            mark_type: 标记类型，None 表示该节点所有标记

        Returns:
            是否成功
        """
        if node_name not in self._marks:
            return False

        if mark_type:
            mark_type_str = mark_type.value
            if mark_type_str in self._marks[node_name]:
                self._marks[node_name][mark_type_str].resolved = True
                self._save_marks()
                return True
        else:
            for mark in self._marks[node_name].values():
                mark.resolved = True
            self._save_marks()
            return True

        return False

    def acknowledge(self, node_name: str, mark_type: Optional[MarkType] = None) -> bool:
        """确认标记

        Args:
            node_name: 节点名称
            mark_type: 标记类型，None 表示该节点所有标记

        Returns:
            是否成功
        """
        if node_name not in self._marks:
            return False

        if mark_type:
            mark_type_str = mark_type.value
            if mark_type_str in self._marks[node_name]:
                self._marks[node_name][mark_type_str].acknowledged = True
                self._save_marks()
                return True
        else:
            for mark in self._marks[node_name].values():
                mark.acknowledged = True
            self._save_marks()
            return True

        return False

    def get_node_marks(
        self,
        node_name: str,
        include_resolved: bool = False,
    ) -> List[HighWaterMark]:
        """获取节点的高水位标记"""
        if node_name not in self._marks:
            return []

        marks = list(self._marks[node_name].values())
        if not include_resolved:
            marks = [m for m in marks if not m.resolved]

        return sorted(marks, key=lambda m: m.last_seen, reverse=True)

    def get_all_marks(
        self,
        level: Optional[WaterLevel] = None,
        include_resolved: bool = False,
        include_acknowledged: bool = True,
    ) -> List[HighWaterMark]:
        """获取所有高水位标记

        Args:
            level: 按水位级别过滤
            include_resolved: 是否包含已解决的
            include_acknowledged: 是否包含已确认的

        Returns:
            标记列表
        """
        all_marks = []
        for node_marks in self._marks.values():
            for mark in node_marks.values():
                if not include_resolved and mark.resolved:
                    continue
                if not include_acknowledged and mark.acknowledged:
                    continue
                if level and mark.level != level:
                    continue
                all_marks.append(mark)

        return sorted(all_marks, key=lambda m: m.last_seen, reverse=True)

    def get_high_water_nodes(self) -> Dict[str, List[HighWaterMark]]:
        """获取所有存在高水位问题的节点

        Returns:
            节点名称到标记列表的映射
        """
        result = {}
        for node_name, node_marks in self._marks.items():
            active_marks = [m for m in node_marks.values() if not m.resolved]
            if active_marks:
                result[node_name] = active_marks
        return result

    def get_summary(self) -> dict:
        """获取统计摘要"""
        total_nodes = len(self._marks)
        active_nodes = 0
        active_marks = 0
        critical_marks = 0
        warning_marks = 0

        for node_name, node_marks in self._marks.items():
            has_active = False
            for mark in node_marks.values():
                if not mark.resolved:
                    active_marks += 1
                    has_active = True
                    if mark.level == WaterLevel.CRITICAL:
                        critical_marks += 1
                    elif mark.level == WaterLevel.WARNING:
                        warning_marks += 1
            if has_active:
                active_nodes += 1

        return {
            "total_nodes_with_marks": total_nodes,
            "active_nodes": active_nodes,
            "total_active_marks": active_marks,
            "critical_marks": critical_marks,
            "warning_marks": warning_marks,
        }

    def cleanup_old_marks(self, days: int = 30) -> int:
        """清理旧的已解决标记

        Args:
            days: 保留天数

        Returns:
            清理的标记数量
        """
        cutoff = datetime.now() - timedelta(days=days)
        removed = 0

        for node_name in list(self._marks.keys()):
            node_marks = self._marks[node_name]
            for mark_type_str in list(node_marks.keys()):
                mark = node_marks[mark_type_str]
                if mark.resolved and mark.last_seen < cutoff:
                    del node_marks[mark_type_str]
                    removed += 1

            if not node_marks:
                del self._marks[node_name]

        if removed > 0:
            self._save_marks()
            logger.info(f"已清理 {removed} 个旧标记")

        return removed

    def check_resource_and_mark(
        self,
        node_name: str,
        resource_type: str,
        value: float,
        warning_threshold: float,
        critical_threshold: float,
    ) -> Optional[HighWaterMark]:
        """检查资源水位并自动标记

        Args:
            node_name: 节点名称
            resource_type: 资源类型 (cpu/memory/disk)
            value: 当前值
            warning_threshold: 警告阈值
            critical_threshold: 严重阈值

        Returns:
            如果触发标记返回 HighWaterMark，否则返回 None
        """
        mark_type_map = {
            "cpu": MarkType.CPU_HIGH,
            "memory": MarkType.MEMORY_HIGH,
            "disk": MarkType.DISK_HIGH,
        }

        desc_map = {
            "cpu": "CPU使用率",
            "memory": "内存使用率",
            "disk": "磁盘使用率",
        }

        if resource_type not in mark_type_map:
            return None

        if value >= critical_threshold:
            return self.mark_high_water(
                node_name=node_name,
                mark_type=mark_type_map[resource_type],
                level=WaterLevel.CRITICAL,
                value=value,
                threshold=critical_threshold,
                description=f"{desc_map[resource_type]}达到严重阈值",
            )
        elif value >= warning_threshold:
            return self.mark_high_water(
                node_name=node_name,
                mark_type=mark_type_map[resource_type],
                level=WaterLevel.WARNING,
                value=value,
                threshold=warning_threshold,
                description=f"{desc_map[resource_type]}达到警告阈值",
            )

        return None
