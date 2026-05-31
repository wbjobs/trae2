"""
数据流引擎
负责执行数据转换、条件判断和路由规则
支持批量处理和异步执行以优化大吞吐量场景
"""
import re
import math
import operator
from typing import Any, Callable, Dict, List, Optional
from datetime import datetime
from shared.src.models import DataPoint, DataFlowRule
from shared.src.exceptions import DataFlowException
from shared.src.logger import get_logger
from shared.src.batch_processor import BatchCollector, BatchItem, BatchResult, AsyncProcessor
try:
    from .circuit_breaker import CircuitBreakerManager, CircuitBreakerOpenException
except ImportError:
    from circuit_breaker import CircuitBreakerManager, CircuitBreakerOpenException

logger = get_logger("dataflow_engine")


class TransformEngine:
    """数据转换引擎 - 支持表达式计算"""

    _functions: Dict[str, Callable] = {}
    _constants: Dict[str, Any] = {
        "PI": math.pi,
        "E": math.e,
        "TRUE": True,
        "FALSE": False,
    }

    def __init__(self):
        self._register_builtin_functions()

    def _register_builtin_functions(self):
        self._functions = {
            "abs": abs,
            "round": round,
            "floor": math.floor,
            "ceil": math.ceil,
            "sqrt": math.sqrt,
            "pow": math.pow,
            "min": min,
            "max": max,
            "sin": math.sin,
            "cos": math.cos,
            "tan": math.tan,
            "log": math.log,
            "log2": math.log2,
            "log10": math.log10,
            "int": int,
            "float": float,
            "str": str,
            "bool": bool,
        }

    def transform(self, expression: str, context: Dict[str, Any]) -> Any:
        try:
            if not expression:
                return context.get("value", context.get("source_value"))

            safe_globals = {"__builtins__": {}}
            safe_globals.update(self._functions)
            safe_globals.update(self._constants)

            result = eval(expression, safe_globals, context)
            return result
        except Exception as e:
            raise DataFlowException(
                f"表达式计算失败: {expression}, 错误: {e}"
            )

    def validate_expression(self, expression: str) -> bool:
        try:
            compile(expression, "<string>", "eval")
            return True
        except SyntaxError:
            return False


class ConditionEngine:
    """条件判断引擎"""

    _operators = {
        ">": operator.gt,
        ">=": operator.ge,
        "<": operator.lt,
        "<=": operator.le,
        "==": operator.eq,
        "!=": operator.ne,
        "and": operator.and_,
        "or": operator.or_,
        "not": operator.not_,
    }

    def evaluate(self, condition: str, context: Dict[str, Any]) -> bool:
        try:
            if not condition:
                return True

            safe_globals = {"__builtins__": {}}
            safe_globals.update({
                "value": context.get("value"),
                "source_value": context.get("source_value"),
                "target_value": context.get("target_value"),
            })

            for key in ["timestamp", "quality"]:
                if key in context:
                    safe_globals[key] = context[key]

            return bool(eval(condition, safe_globals, context))
        except Exception as e:
            logger.warning(f"条件评估失败: {condition}, 错误: {e}")
            return False


class DataFlowEngine:
    """数据流引擎 - 核心路由逻辑（支持熔断保护、批量处理、异步执行）"""

    def __init__(self, enable_batch_processing: bool = True, enable_async: bool = True):
        self.transform_engine = TransformEngine()
        self.condition_engine = ConditionEngine()
        self._rules: Dict[str, DataFlowRule] = {}
        self._rule_chains: Dict[str, List[str]] = {}
        self._execution_history: List[Dict[str, Any]] = []
        self._circuit_breaker_manager = CircuitBreakerManager()
        self._rule_circuit_breakers: Dict[str, str] = {}
        self._device_circuit_breakers: Dict[str, str] = {}
        
        self._enable_batch_processing = enable_batch_processing
        self._enable_async = enable_async
        
        if enable_batch_processing:
            self._batch_collector = BatchCollector(
                name="dataflow_engine",
                handler=self._process_batch_handler,
                max_batch_size=50,
                max_wait_time=0.05,
            )
            self._batch_collector.start()
        else:
            self._batch_collector = None
        
        if enable_async:
            self._async_processor = AsyncProcessor(
                name="dataflow_engine",
                max_workers=4,
                max_queue_size=1000,
            )
            self._async_processor.start()
        else:
            self._async_processor = None
        
        self._batch_callbacks: Dict[str, Callable] = {}
        self._async_callbacks: Dict[str, Callable] = {}

    def add_rule(self, rule: DataFlowRule):
        self._rules[rule.rule_id] = rule
        if rule.source_device not in self._rule_chains:
            self._rule_chains[rule.source_device] = []
        self._rule_chains[rule.source_device].append(rule.rule_id)
        
        cb_name = f"rule_{rule.rule_id}"
        self._rule_circuit_breakers[rule.rule_id] = cb_name
        self._circuit_breaker_manager.get_or_create(
            cb_name,
            failure_threshold=10,
            recovery_timeout=60.0,
        )
        
        device_cb_name = f"device_{rule.source_device}"
        if rule.source_device not in self._device_circuit_breakers:
            self._device_circuit_breakers[rule.source_device] = device_cb_name
            self._circuit_breaker_manager.get_or_create(
                device_cb_name,
                failure_threshold=20,
                recovery_timeout=120.0,
            )
        
        logger.info(f"添加数据流规则: {rule.rule_name} ({rule.rule_id})")

    def remove_rule(self, rule_id: str):
        if rule_id in self._rules:
            rule = self._rules[rule_id]
            if rule.source_device in self._rule_chains:
                self._rule_chains[rule.source_device].remove(rule_id)
            del self._rules[rule_id]
            
            cb_name = self._rule_circuit_breakers.pop(rule_id, None)
            if cb_name:
                self._circuit_breaker_manager.remove(cb_name)
            
            logger.info(f"移除数据流规则: {rule_id}")

    def get_rule(self, rule_id: str) -> Optional[DataFlowRule]:
        return self._rules.get(rule_id)

    def get_rules(self, source_device: str = None) -> List[DataFlowRule]:
        if source_device:
            rule_ids = self._rule_chains.get(source_device, [])
            return [self._rules[rid] for rid in rule_ids if rid in self._rules]
        return list(self._rules.values())

    def execute(self, source_point: DataPoint, context: Dict[str, Any] = None) -> List[DataPoint]:
        if context is None:
            context = {}

        source_device = source_point.device_id
        rules = self.get_rules(source_device)
        results = []
        
        device_cb_name = self._device_circuit_breakers.get(source_device)
        device_cb = self._circuit_breaker_manager.get(device_cb_name) if device_cb_name else None
        
        if device_cb and not device_cb.can_execute():
            logger.warning(f"设备 [{source_device}] 熔断器已打开，跳过所有规则执行")
            return results

        for rule in rules:
            if not rule.enabled:
                continue
            
            cb_name = self._rule_circuit_breakers.get(rule.rule_id)
            rule_cb = self._circuit_breaker_manager.get(cb_name) if cb_name else None
            
            if rule_cb and not rule_cb.can_execute():
                logger.warning(f"规则 [{rule.rule_name}] 熔断器已打开，跳过执行")
                continue

            try:
                rule_context = {
                    **context,
                    "source_device": source_device,
                    "source_point": source_point.point_id,
                    "source_value": source_point.value,
                    "value": source_point.value,
                    "timestamp": source_point.timestamp,
                    "quality": source_point.quality,
                }

                if self.condition_engine.evaluate(rule.trigger_condition, rule_context):
                    transformed_value = self.transform_engine.transform(
                        rule.transform_expression, rule_context
                    )

                    target_point = DataPoint(
                        device_id=rule.target_device,
                        point_id=rule.target_point,
                        value=transformed_value,
                        quality=source_point.quality,
                        timestamp=datetime.utcnow(),
                        data_type=source_point.data_type,
                    )

                    execution_record = {
                        "rule_id": rule.rule_id,
                        "rule_name": rule.rule_name,
                        "source_point": source_point.to_dict(),
                        "target_point": target_point.to_dict(),
                        "status": "success",
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                    self._execution_history.append(execution_record)
                    results.append(target_point)
                    
                    if rule_cb:
                        rule_cb.on_success()
                    if device_cb:
                        device_cb.on_success()

            except DataFlowException as e:
                logger.error(f"规则执行失败 {rule.rule_name}: {e}")
                execution_record = {
                    "rule_id": rule.rule_id,
                    "rule_name": rule.rule_name,
                    "source_point": source_point.to_dict(),
                    "status": "failed",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat(),
                }
                self._execution_history.append(execution_record)
                
                if rule_cb:
                    rule_cb.on_failure(e)
                if device_cb:
                    device_cb.on_failure(e)
            except CircuitBreakerOpenException as e:
                logger.warning(f"熔断器阻止执行: {e}")
                break

        return results

    def get_execution_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        return self._execution_history[-limit:]

    def clear_history(self):
        self._execution_history.clear()

    def get_stats(self) -> Dict[str, Any]:
        return {
            "total_rules": len(self._rules),
            "enabled_rules": sum(1 for r in self._rules.values() if r.enabled),
            "total_executions": len(self._execution_history),
            "success_executions": sum(
                1 for r in self._execution_history if r.get("status") == "success"
            ),
            "failed_executions": sum(
                1 for r in self._execution_history if r.get("status") == "failed"
            ),
        }
    
    def get_circuit_breakers(self) -> Dict[str, Any]:
        """获取所有熔断器状态"""
        return self._circuit_breaker_manager.get_all_metrics()
    
    def reset_circuit_breaker(self, name: str) -> bool:
        """重置指定熔断器"""
        cb = self._circuit_breaker_manager.get(name)
        if cb:
            cb.reset()
            return True
        return False
    
    def force_open_circuit_breaker(self, name: str) -> bool:
        """强制熔断指定熔断器"""
        cb = self._circuit_breaker_manager.get(name)
        if cb:
            cb.force_open()
            return True
        return False
    
    def force_close_circuit_breaker(self, name: str) -> bool:
        """强制闭合指定熔断器"""
        cb = self._circuit_breaker_manager.get(name)
        if cb:
            cb.force_close()
            return True
        return False
    
    def _process_batch_handler(self, batch: List[BatchItem]) -> BatchResult:
        """批次处理处理器（内部使用）"""
        import time
        start_time = time.time()
        
        success_count = 0
        failed_count = 0
        
        for item in batch:
            try:
                data = item.data
                source_point = data.get("source_point")
                context = data.get("context", {})
                callback = data.get("callback")
                
                results = self.execute(source_point, context)
                
                if callback:
                    try:
                        callback(True, results, None)
                    except Exception as e:
                        logger.error(f"批次回调执行失败: {e}")
                
                success_count += 1
            except Exception as e:
                failed_count += 1
                logger.error(f"批次处理单条数据失败: {e}")
        
        return BatchResult(
            success=True,
            processed_count=success_count,
            failed_count=failed_count,
            total_latency_ms=(time.time() - start_time) * 1000,
        )
    
    def execute_batch(
        self,
        source_points: List[DataPoint],
        context: Optional[Dict[str, Any]] = None,
        callback: Optional[Callable] = None,
    ) -> bool:
        """
        异步批量执行数据点处理
        
        Args:
            source_points: 源数据点列表
            context: 执行上下文
            callback: 完成回调函数
            
        Returns:
            是否提交成功
        """
        if not self._enable_batch_processing or not self._batch_collector:
            logger.warning("批量处理未启用")
            return False
        
        for point in source_points:
            data = {
                "source_point": point,
                "context": context or {},
                "callback": callback,
            }
            if not self._batch_collector.submit(data):
                logger.warning(f"批量队列已满，丢弃数据点 {point.point_id}")
                return False
        
        return True
    
    def execute_async(
        self,
        source_point: DataPoint,
        context: Optional[Dict[str, Any]] = None,
        callback: Optional[Callable] = None,
    ) -> bool:
        """
        异步执行数据点处理
        
        Args:
            source_point: 源数据点
            context: 执行上下文
            callback: 完成回调函数 callback(success, results, error)
            
        Returns:
            是否提交成功
        """
        if not self._enable_async or not self._async_processor:
            logger.warning("异步处理未启用")
            return False
        
        def _execute_task():
            return self.execute(source_point, context or {})
        
        return self._async_processor.submit(_execute_task, callback=callback)
    
    def get_batch_stats(self) -> Dict[str, Any]:
        """获取批量处理统计信息"""
        if self._batch_collector:
            return self._batch_collector.get_stats()
        return {"enabled": False}
    
    def get_async_stats(self) -> Dict[str, Any]:
        """获取异步处理统计信息"""
        if self._async_processor:
            return self._async_processor.get_stats()
        return {"enabled": False}
    
    def flush_batch(self):
        """立即刷新批量队列"""
        if self._batch_collector:
            self._batch_collector.flush()
    
    def stop_processors(self):
        """停止所有处理器"""
        if self._batch_collector:
            self._batch_collector.stop()
        if self._async_processor:
            self._async_processor.stop()