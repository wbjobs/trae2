import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum

from app.constants import (
    ParameterType,
    AlarmLevel,
    ThresholdCondition,
    ParameterUnit,
    DEFAULT_THRESHOLDS,
    ALARM_LEVEL_NAMES,
)
from app.models.data_models import PipelineDataPoint
from app.models.alarm_models import AlarmEvent, AlarmRule

logger = logging.getLogger(__name__)


class EvaluationPhase(str, Enum):
    PRE_FILTER = "pre_filter"
    THRESHOLD_CHECK = "threshold_check"
    DURATION_CHECK = "duration_check"
    POST_PROCESS = "post_process"


@dataclass
class EvaluationContext:
    point: PipelineDataPoint
    phase: EvaluationPhase
    pipeline_rules: List[AlarmRule] = field(default_factory=list)
    matched_rules: List[AlarmRule] = field(default_factory=list)
    triggered_alarms: List[AlarmEvent] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)
    skip_phases: List[EvaluationPhase] = field(default_factory=list)


class EvaluationHandler:
    """
    判定处理器基类
    每个业务判定阶段都实现此接口，实现判定逻辑的完全解耦
    """

    def __init__(self, next_handler=None):
        self._next = next_handler
        self._callbacks: List[Callable] = []

    def set_next(self, handler):
        self._next = handler
        return handler

    async def handle(self, context: EvaluationContext) -> EvaluationContext:
        if self.should_skip(context):
            return await self._pass_to_next(context)

        context = await self.process(context)
        await self._fire_callbacks(context)
        return await self._pass_to_next(context)

    async def _pass_to_next(self, context: EvaluationContext) -> EvaluationContext:
        if self._next:
            return await self._next.handle(context)
        return context

    def should_skip(self, context: EvaluationContext) -> bool:
        return context.phase in context.skip_phases

    async def process(self, context: EvaluationContext) -> EvaluationContext:
        raise NotImplementedError

    def add_callback(self, callback: Callable):
        self._callbacks.append(callback)

    async def _fire_callbacks(self, context: EvaluationContext):
        for cb in self._callbacks:
            try:
                await cb(context)
            except Exception as e:
                logger.error("Handler callback failed: %s", e)


class QualityFilterHandler(EvaluationHandler):
    """
    数据质量预过滤处理器
    根据数据质量级别决定是否跳过判定
    """

    def __init__(self, min_quality: int = 2):
        super().__init__()
        self._min_quality = min_quality

    async def process(self, context: EvaluationContext) -> EvaluationContext:
        context.phase = EvaluationPhase.PRE_FILTER

        point = context.point
        if point.quality is not None and point.quality < self._min_quality:
            context.skip_phases.extend([
                EvaluationPhase.THRESHOLD_CHECK,
                EvaluationPhase.DURATION_CHECK,
            ])
            context.metadata["quality_filter_skipped"] = True
            context.metadata["quality_level"] = point.quality

        return context


class ThresholdCheckHandler(EvaluationHandler):
    """
    阈值检查处理器
    核心业务判定：检查参数值是否触发阈值规则
    """

    def __init__(self, rules_provider):
        super().__init__()
        self._rules_provider = rules_provider

    async def process(self, context: EvaluationContext) -> EvaluationContext:
        context.phase = EvaluationPhase.THRESHOLD_CHECK

        point = context.point
        rules = self._rules_provider.get_rules_for_pipeline(
            point.pipeline_id, point.param_type
        )
        context.pipeline_rules = rules

        for rule in rules:
            if not rule.enabled:
                continue

            triggered = self._check_condition(rule, point.value)
            if triggered:
                context.matched_rules.append(rule)

        return context

    def _check_condition(self, rule: AlarmRule, value: float) -> bool:
        condition = rule.condition

        if condition == ThresholdCondition.ABOVE:
            return value > rule.threshold_value
        elif condition == ThresholdCondition.BELOW:
            return value < rule.threshold_value
        elif condition == ThresholdCondition.RANGE:
            upper = rule.upper_value or rule.threshold_value
            return rule.threshold_value <= value <= upper
        elif condition == ThresholdCondition.OUT_OF_RANGE:
            upper = rule.upper_value or rule.threshold_value
            return value < rule.threshold_value or value > upper
        elif condition == ThresholdCondition.RAPID_CHANGE:
            return self._check_rapid_change(rule, value)

        return False

    def _check_rapid_change(self, rule: AlarmRule, value: float) -> bool:
        key = f"rapid_{rule.rule_id}"
        if key not in self._rules_provider._duration_tracker:
            self._rules_provider._duration_tracker[key] = {
                "last_value": (value, datetime.now(timezone.utc))
            }
            return False

        last_val, _ = self._rules_provider._duration_tracker[key]["last_value"]
        delta = abs(value - last_val)
        self._rules_provider._duration_tracker[key]["last_value"] = (
            value,
            datetime.now(timezone.utc),
        )
        return delta > rule.threshold_value


class DurationCheckHandler(EvaluationHandler):
    """
    持续时间检查处理器
    检查阈值触发是否满足持续时间要求
    """

    def __init__(self, duration_tracker: Dict):
        super().__init__()
        self._duration_tracker = duration_tracker

    async def process(self, context: EvaluationContext) -> EvaluationContext:
        context.phase = EvaluationPhase.DURATION_CHECK

        filtered_rules = []
        point = context.point

        for rule in context.matched_rules:
            if rule.duration_seconds <= 0:
                filtered_rules.append(rule)
                continue

            key = f"{point.device_id}:{point.param_type.value}:{rule.rule_id}"

            if key in self._duration_tracker:
                start_val, start_ts = self._duration_tracker[key]
                elapsed = (datetime.now(timezone.utc) - start_ts).total_seconds()
                if elapsed >= rule.duration_seconds:
                    filtered_rules.append(rule)
                    context.metadata[f"duration_met_{rule.rule_id}"] = elapsed
            else:
                self._duration_tracker[key] = (point.value, datetime.now(timezone.utc))
                context.metadata[f"duration_started_{rule.rule_id}"] = True

        context.matched_rules = filtered_rules
        return context


class AlarmCreationHandler(EvaluationHandler):
    """
    告警创建处理器
    根据匹配的规则生成告警事件
    """

    def __init__(self):
        super().__init__()

    async def process(self, context: EvaluationContext) -> EvaluationContext:
        context.phase = EvaluationPhase.POST_PROCESS
        point = context.point

        for rule in context.matched_rules:
            alarm = self._create_alarm(point, rule)
            context.triggered_alarms.append(alarm)

            logger.warning(
                "Alarm created: [%s] device=%s param=%s value=%.2f threshold=%.2f",
                ALARM_LEVEL_NAMES[alarm.alarm_level],
                point.device_id,
                point.param_type.value,
                point.value,
                rule.threshold_value,
            )

        return context

    def _create_alarm(
        self, point: PipelineDataPoint, rule: AlarmRule
    ) -> AlarmEvent:
        return AlarmEvent(
            alarm_id=str(uuid.uuid4()),
            device_id=point.device_id,
            pipeline_id=point.pipeline_id,
            param_type=point.param_type,
            alarm_level=rule.alarm_level,
            condition=rule.condition,
            threshold_value=rule.threshold_value,
            actual_value=point.value,
            unit=point.unit,
            timestamp=datetime.now(timezone.utc),
            message=self._build_message(point, rule),
            metadata={
                "rule_id": rule.rule_id,
                "location": point.location,
                "quality": point.quality,
                "node_id": point.node_id,
            },
        )

    def _build_message(self, point: PipelineDataPoint, rule: AlarmRule) -> str:
        level_name = ALARM_LEVEL_NAMES.get(rule.alarm_level, "未知")
        direction = ""
        if rule.condition == ThresholdCondition.ABOVE:
            direction = "超过上限"
        elif rule.condition == ThresholdCondition.BELOW:
            direction = "低于下限"
        elif rule.condition == ThresholdCondition.RAPID_CHANGE:
            direction = "剧烈变化"

        return (
            f"【{level_name}】设备[{point.device_id}]管道[{point.pipeline_id}] "
            f"{point.param_type.value}{direction}: "
            f"实测值 {point.value:.2f}{point.unit.value}, "
            f"阈值 {rule.threshold_value:.2f}{rule.unit.value}"
        )


class BusinessEvaluationEngine:
    """
    业务判定引擎
    使用责任链模式编排各处理器，实现校验与业务判定的完全解耦
    """

    def __init__(self):
        self._custom_rules: Dict[str, Dict[ParameterType, List[AlarmRule]]] = {}
        self._duration_tracker: Dict[str, Tuple[float, datetime]] = {}
        self._handler_chain: Optional[EvaluationHandler] = None
        self._build_handler_chain()
        self._load_default_rules()

    def _build_handler_chain(self):
        quality_handler = QualityFilterHandler(min_quality=1)
        threshold_handler = ThresholdCheckHandler(self)
        duration_handler = DurationCheckHandler(self._duration_tracker)
        alarm_handler = AlarmCreationHandler()

        quality_handler.set_next(threshold_handler).set_next(
            duration_handler
        ).set_next(alarm_handler)

        self._handler_chain = quality_handler

    def _load_default_rules(self):
        for param_type, levels in DEFAULT_THRESHOLDS.items():
            for level, config in levels.items():
                rule = AlarmRule(
                    rule_id=f"default_{param_type.value}_{level.value}",
                    param_type=param_type,
                    alarm_level=level,
                    condition=config["condition"],
                    threshold_value=config["value"],
                    unit=config["unit"],
                    description=f"Default {param_type.value} {ALARM_LEVEL_NAMES[level]} threshold",
                )
                if "default" not in self._custom_rules:
                    self._custom_rules["default"] = {}
                if param_type not in self._custom_rules["default"]:
                    self._custom_rules["default"][param_type] = []
                self._custom_rules["default"][param_type].append(rule)

    def get_rules_for_pipeline(
        self, pipeline_id: str, param_type: ParameterType
    ) -> List[AlarmRule]:
        rules: List[AlarmRule] = []

        if pipeline_id in self._custom_rules:
            if param_type in self._custom_rules[pipeline_id]:
                rules.extend(self._custom_rules[pipeline_id][param_type])

        if "default" in self._custom_rules:
            if param_type in self._custom_rules["default"]:
                existing_ids = {r.rule_id for r in rules}
                for r in self._custom_rules["default"][param_type]:
                    if r.rule_id not in existing_ids:
                        rules.append(r)

        return sorted(rules, key=lambda r: r.alarm_level.value, reverse=True)

    async def evaluate(self, point: PipelineDataPoint) -> List[AlarmEvent]:
        context = EvaluationContext(point=point)
        result = await self._handler_chain.handle(context)
        return result.triggered_alarms

    async def evaluate_batch(
        self, points: List[PipelineDataPoint]
    ) -> List[AlarmEvent]:
        all_alarms = []
        for point in points:
            alarms = await self.evaluate(point)
            all_alarms.extend(alarms)
        return all_alarms

    def add_rule(self, pipeline_id: str, rule: AlarmRule):
        if pipeline_id not in self._custom_rules:
            self._custom_rules[pipeline_id] = {}
        if rule.param_type not in self._custom_rules[pipeline_id]:
            self._custom_rules[pipeline_id][rule.param_type] = []
        self._custom_rules[pipeline_id][rule.param_type].append(rule)
        logger.info("Added rule %s for pipeline %s", rule.rule_id, pipeline_id)

    def remove_rule(self, pipeline_id: str, rule_id: str) -> bool:
        if pipeline_id not in self._custom_rules:
            return False
        for param_type, rules in self._custom_rules[pipeline_id].items():
            for i, rule in enumerate(rules):
                if rule.rule_id == rule_id:
                    rules.pop(i)
                    logger.info("Removed rule %s", rule_id)
                    return True
        return False

    def get_statistics(self) -> dict:
        total_rules = 0
        total_pipelines = 0
        for pid, ptype_rules in self._custom_rules.items():
            if pid != "default":
                total_pipelines += 1
            for rules in ptype_rules.values():
                total_rules += len(rules)
        return {
            "engine_type": "chain_of_responsibility",
            "handlers": ["quality_filter", "threshold_check", "duration_check", "alarm_creation"],
            "total_rules": total_rules,
            "custom_pipelines": total_pipelines,
        }