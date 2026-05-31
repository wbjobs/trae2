"""
规则管理器 - 持久化和管理数据流规则 (线程安全)
"""
import json
import os
import sys
import threading
from typing import Dict, List, Optional
from datetime import datetime
try:
    from .engine import DataFlowEngine
except ImportError:
    from engine import DataFlowEngine
from shared.src.models import DataFlowRule
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("rule_manager")

if sys.platform == 'win32':
    import msvcrt
    def _lock_file(f, exclusive: bool = True):
        msvcrt.locking(f.fileno(), msvcrt.LK_LOCK if exclusive else msvcrt.LK_NBLCK, 1)
    
    def _unlock_file(f):
        msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
else:
    import fcntl
    def _lock_file(f, exclusive: bool = True):
        fcntl.flock(f.fileno(), fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
    
    def _unlock_file(f):
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)


class RuleManager:
    """规则管理器 - 线程安全的数据流规则持久化与管理"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        self.engine = DataFlowEngine()
        self._rules_file = config.get("services", "dataflow_router", "rules_file",
                                  default="dataflow_rules.json")
        self._canvas_file = config.get("services", "dataflow_router", "canvas_file",
                                   default="canvas_data.json")
        self._lock = threading.RLock()
        self._file_lock = threading.Lock()
        self._canvas_data: Dict = {}
        self._load_rules()
        self._load_canvas()

    def _load_rules(self):
        with self._lock:
            if os.path.exists(self._rules_file):
                try:
                    with self._file_lock:
                        with open(self._rules_file, "r", encoding="utf-8") as f:
                            try:
                                _lock_file(f, exclusive=False)
                                rules_data = json.load(f)
                            finally:
                                _unlock_file(f)
                    if not isinstance(rules_data, list):
                        logger.error(f"规则文件格式错误: 期望列表, 实际 {type(rules_data)}")
                        return
                    loaded_count = 0
                    for rule_data in rules_data:
                        try:
                            rule = DataFlowRule.from_dict(rule_data)
                            self.engine.add_rule(rule)
                            loaded_count += 1
                        except Exception as e:
                            logger.error(f"加载单条规则失败 {rule_data.get('rule_id', 'unknown')}: {e}")
                    logger.info(f"成功加载 {loaded_count}/{len(rules_data)} 条规则")
                except json.JSONDecodeError as e:
                    logger.error(f"规则文件 JSON 解析失败: {e}")
                    self._backup_corrupt_file()
                except Exception as e:
                    logger.error(f"加载规则失败: {e}")
    
    def _backup_corrupt_file(self):
        """备份损坏的规则文件"""
        try:
            backup_file = f"{self._rules_file}.backup.{int(datetime.utcnow().timestamp())}"
            os.rename(self._rules_file, backup_file)
            logger.info(f"已备份损坏的规则文件到: {backup_file}")
        except Exception as e:
            logger.error(f"备份损坏文件失败: {e}")

    def _save_rules(self):
        with self._lock:
            temp_file = None
            try:
                rules_data = [rule.to_dict() for rule in self.engine.get_rules()]
                temp_file = f"{self._rules_file}.tmp"
                with self._file_lock:
                    with open(temp_file, "w", encoding="utf-8") as f:
                        _lock_file(f, exclusive=True)
                        json.dump(rules_data, f, indent=2, ensure_ascii=False)
                        _unlock_file(f)
                    os.replace(temp_file, self._rules_file)
                logger.info(f"保存 {len(rules_data)} 条规则成功")
            except Exception as e:
                logger.error(f"保存规则失败: {e}")
                if temp_file and os.path.exists(temp_file):
                    try:
                        os.remove(temp_file)
                    except Exception:
                        pass

    def create_rule(self, rule_data: Dict) -> DataFlowRule:
        with self._lock:
            rule = DataFlowRule(**{k: v for k, v in rule_data.items()
                               if k in DataFlowRule.__dataclass_fields__})
            rule.created_at = datetime.utcnow()
            rule.updated_at = datetime.utcnow()
            self.engine.add_rule(rule)
            self._save_rules()
            return rule

    def update_rule(self, rule_id: str, rule_data: Dict) -> Optional[DataFlowRule]:
        with self._lock:
            rule = self.engine.get_rule(rule_id)
            if not rule:
                return None

            for key, value in rule_data.items():
                if hasattr(rule, key) and key not in ["rule_id", "created_at"]:
                    setattr(rule, key, value)

            rule.updated_at = datetime.utcnow()
            self._save_rules()
            return rule

    def delete_rule(self, rule_id: str) -> bool:
        with self._lock:
            if self.engine.get_rule(rule_id):
                self.engine.remove_rule(rule_id)
                self._save_rules()
                return True
            return False

    def get_rule(self, rule_id: str) -> Optional[DataFlowRule]:
        with self._lock:
            return self.engine.get_rule(rule_id)

    def get_rules(self, source_device: str = None) -> List[Dict]:
        with self._lock:
            rules = self.engine.get_rules(source_device)
            return [rule.to_dict() for rule in rules]

    def execute_rule(self, rule_id: str, context: Dict) -> List[Dict]:
        with self._lock:
            rule = self.engine.get_rule(rule_id)
            if not rule:
                return []

            from shared.src.models import DataPoint
            source_point = DataPoint(
                device_id=rule.source_device,
                point_id=rule.source_point,
                value=context.get("value"),
                data_type=context.get("data_type", "float32"),
            )

            results = self.engine.execute(source_point, context)
            return [r.to_dict() for r in results]

    def get_stats(self) -> Dict:
        with self._lock:
            return self.engine.get_stats()
    
    def get_circuit_breakers(self) -> Dict:
        """获取所有熔断器状态"""
        with self._lock:
            return self.engine.get_circuit_breakers()
    
    def reset_circuit_breaker(self, name: str) -> bool:
        """重置指定熔断器"""
        with self._lock:
            return self.engine.reset_circuit_breaker(name)
    
    def force_open_circuit_breaker(self, name: str) -> bool:
        """强制熔断指定熔断器"""
        with self._lock:
            return self.engine.force_open_circuit_breaker(name)
    
    def force_close_circuit_breaker(self, name: str) -> bool:
        """强制闭合指定熔断器"""
        with self._lock:
            return self.engine.force_close_circuit_breaker(name)
    
    def _load_canvas(self):
        """加载画布数据"""
        with self._lock:
            if os.path.exists(self._canvas_file):
                try:
                    with self._file_lock:
                        with open(self._canvas_file, "r", encoding="utf-8") as f:
                            try:
                                _lock_file(f, exclusive=False)
                                self._canvas_data = json.load(f)
                            finally:
                                _unlock_file(f)
                    logger.info(f"加载画布数据成功, 节点数: {len(self._canvas_data.get('nodes', []))}")
                except json.JSONDecodeError as e:
                    logger.error(f"画布文件 JSON 解析失败: {e}")
                    self._canvas_data = {"nodes": [], "edges": []}
                except Exception as e:
                    logger.error(f"加载画布数据失败: {e}")
                    self._canvas_data = {"nodes": [], "edges": []}
            else:
                self._canvas_data = {"nodes": [], "edges": []}
    
    def save_canvas(self, canvas_data: Dict) -> bool:
        """保存画布数据"""
        with self._lock:
            temp_file = None
            try:
                temp_file = f"{self._canvas_file}.tmp"
                with self._file_lock:
                    with open(temp_file, "w", encoding="utf-8") as f:
                        _lock_file(f, exclusive=True)
                        json.dump(canvas_data, f, indent=2, ensure_ascii=False)
                        _unlock_file(f)
                    os.replace(temp_file, self._canvas_file)
                self._canvas_data = canvas_data
                logger.info(f"保存画布数据成功, 节点数: {len(canvas_data.get('nodes', []))}")
                return True
            except Exception as e:
                logger.error(f"保存画布数据失败: {e}")
                if temp_file and os.path.exists(temp_file):
                    try:
                        os.remove(temp_file)
                    except Exception:
                        pass
                return False
    
    def get_canvas(self) -> Dict:
        """获取画布数据"""
        with self._lock:
            return self._canvas_data.copy()