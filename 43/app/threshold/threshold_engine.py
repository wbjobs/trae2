import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple

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


class ThresholdEngine:
    """
    阈值判别模块
    实现多级阈值判定逻辑，支持对电位、电流等参数进行分级告警。
    维护自定义阈值规则，支持动态配置和热加载。
    """

    def __init__(self):
        self._custom_rules: Dict[str, Dict[ParameterType, List[AlarmRule]]] = {}
        self._duration_tracker: Dict[str, Dict[str, Tuple[float, datetime]]] = {}
        self._load_default_rules()

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

    def evaluate(
        self, point: PipelineDataPoint
    ) -> List[AlarmEvent]:
        alarms: List[AlarmEvent] = []
        rules = self._get_rules_for_pipeline(point.pipeline_id, point.param_type)

        for rule in rules:
            if not rule.enabled:
                continue

            triggered, highest_level = self._check_condition(
                rule, point.value
            )

            if triggered:
                if rule.duration_seconds > 0:
                    if not self._check_duration(point, rule, triggered):
                        continue

                alarm = self._create_alarm_event(point, rule, highest_level)
                alarms.append(alarm)
                logger.warning(
                    "Alarm triggered: [%s] device=%s pipeline=%s "
                    "param=%s value=%.2f%s threshold=%.2f%s",
                    ALARM_LEVEL_NAMES[alarm.alarm_level],
                    point.device_id,
                    point.pipeline_id,
                    point.param_type.value,
                    point.value,
                    point.unit.value,
                    rule.threshold_value,
                    rule.unit.value,
                )

        return alarms

    def evaluate_batch(
        self, points: List[PipelineDataPoint]
    ) -> List[AlarmEvent]:
        all_alarms: List[AlarmEvent] = []
        for point in points:
            alarms = self.evaluate(point)
            all_alarms.extend(alarms)
        return all_alarms

    def _check_condition(
        self, rule: AlarmRule, value: float
    ) -> Tuple[bool, AlarmLevel]:
        condition = rule.condition

        if condition == ThresholdCondition.ABOVE:
            triggered = value > rule.threshold_value
        elif condition == ThresholdCondition.BELOW:
            triggered = value < rule.threshold_value
        elif condition == ThresholdCondition.RANGE:
            upper = rule.upper_value or rule.threshold_value
            triggered = rule.threshold_value <= value <= upper
        elif condition == ThresholdCondition.OUT_OF_RANGE:
            upper = rule.upper_value or rule.threshold_value
            triggered = value < rule.threshold_value or value > upper
        elif condition == ThresholdCondition.RAPID_CHANGE:
            triggered = self._check_rapid_change(rule, value)
        else:
            triggered = False

        return triggered, rule.alarm_level

    def _check_rapid_change(self, rule: AlarmRule, value: float) -> bool:
        key = f"{rule.rule_id}_rapid"
        if key not in self._duration_tracker:
            self._duration_tracker[key] = {
                "last_value": (value, datetime.now(timezone.utc))
            }
            return False

        last_val, last_ts = self._duration_tracker[key]["last_value"]
        delta = abs(value - last_val)
        return delta > rule.threshold_value

    def _check_duration(
        self, point: PipelineDataPoint, rule: AlarmRule, triggered: bool
    ) -> bool:
        key = f"{point.device_id}:{point.param_type.value}:{rule.rule_id}"

        if triggered:
            now = datetime.now(timezone.utc)
            if key in self._duration_tracker:
                start_val, start_ts = self._duration_tracker[key]
                elapsed = (now - start_ts).total_seconds()
                if elapsed >= rule.duration_seconds:
                    return True
            else:
                self._duration_tracker[key] = (point.value, now)
                return False
        else:
            if key in self._duration_tracker:
                del self._duration_tracker[key]
            return False

        return False

    def _create_alarm_event(
        self,
        point: PipelineDataPoint,
        rule: AlarmRule,
        level: AlarmLevel,
    ) -> AlarmEvent:
        alarm = AlarmEvent(
            alarm_id=str(uuid.uuid4()),
            device_id=point.device_id,
            pipeline_id=point.pipeline_id,
            param_type=point.param_type,
            alarm_level=level,
            condition=rule.condition,
            threshold_value=rule.threshold_value,
            actual_value=point.value,
            unit=point.unit,
            timestamp=datetime.now(timezone.utc),
            message=self._build_alarm_message(point, rule, level),
            metadata={
                "rule_id": rule.rule_id,
                "location": point.location,
                "quality": point.quality,
                "node_id": point.node_id,
            },
        )
        return alarm

    def _build_alarm_message(
        self,
        point: PipelineDataPoint,
        rule: AlarmRule,
        level: AlarmLevel,
    ) -> str:
        level_name = ALARM_LEVEL_NAMES.get(level, "未知")
        param_name = point.param_type.value
        direction = ""
        if rule.condition == ThresholdCondition.ABOVE:
            direction = "超过上限"
        elif rule.condition == ThresholdCondition.BELOW:
            direction = "低于下限"
        elif rule.condition == ThresholdCondition.RAPID_CHANGE:
            direction = "剧烈变化"

        return (
            f"【{level_name}】设备[{point.device_id}]管道[{point.pipeline_id}] "
            f"{param_name}{direction}: "
            f"实测值 {point.value:.2f}{point.unit.value}, "
            f"阈值 {rule.threshold_value:.2f}{rule.unit.value}"
        )

    def _get_rules_for_pipeline(
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

    def add_rule(self, pipeline_id: str, rule: AlarmRule):
        if pipeline_id not in self._custom_rules:
            self._custom_rules[pipeline_id] = {}
        if rule.param_type not in self._custom_rules[pipeline_id]:
            self._custom_rules[pipeline_id][rule.param_type] = []
        self._custom_rules[pipeline_id][rule.param_type].append(rule)
        logger.info(
            "Added threshold rule %s for pipeline %s",
            rule.rule_id,
            pipeline_id,
        )

    def remove_rule(self, pipeline_id: str, rule_id: str) -> bool:
        if pipeline_id not in self._custom_rules:
            return False
        for param_type, rules in self._custom_rules[pipeline_id].items():
            for i, rule in enumerate(rules):
                if rule.rule_id == rule_id:
                    rules.pop(i)
                    logger.info(
                        "Removed threshold rule %s from pipeline %s",
                        rule_id,
                        pipeline_id,
                    )
                    return True
        return False

    def get_rules(
        self, pipeline_id: Optional[str] = None
    ) -> Dict[str, Dict[str, List[dict]]]:
        result: Dict[str, Dict[str, List[dict]]] = {}
        target_pipelines = (
            [pipeline_id] if pipeline_id else list(self._custom_rules.keys())
        )
        for pid in target_pipelines:
            if pid in self._custom_rules:
                result[pid] = {}
                for ptype, rules in self._custom_rules[pid].items():
                    result[pid][ptype.value] = [
                        r.to_dict() for r in rules
                    ]
        return result

    def get_statistics(self) -> dict:
        total_rules = 0
        total_pipelines = 0
        for pid, ptype_rules in self._custom_rules.items():
            if pid != "default":
                total_pipelines += 1
            for rules in ptype_rules.values():
                total_rules += len(rules)
        return {
            "total_rules": total_rules,
            "custom_pipelines": total_pipelines,
            "default_rules": len(self._custom_rules.get("default", {})),
        }