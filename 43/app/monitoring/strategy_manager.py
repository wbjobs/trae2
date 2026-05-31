import uuid
import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum

from app.config import settings
from app.constants import ParameterType, AlarmLevel, ThresholdCondition, ParameterUnit

logger = logging.getLogger(__name__)


class StrategyType(str, Enum):
    STANDARD = "standard"
    STRICT = "strict"
    RELAXED = "relaxed"
    NIGHT = "night"
    PEAK = "peak"
    MAINTENANCE = "maintenance"


@dataclass
class ThresholdStrategy:
    strategy_id: str
    name: str
    type: StrategyType
    description: str
    thresholds: Dict[ParameterType, Dict[AlarmLevel, Dict[str, Any]]]
    enabled: bool = True
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class StrategySchedule:
    schedule_id: str
    name: str
    strategy_type: StrategyType
    cron: str
    timezone: str = "Asia/Shanghai"
    enabled: bool = True
    pipeline_ids: List[str] = field(default_factory=list)
    all_pipelines: bool = False


class StrategyManager:
    """
    告警策略定时切换模块
    支持多种告警策略的定义、定时切换、手动切换，
    适配不同时间段、节假日、维护期等场景。
    """

    def __init__(self, threshold_engine=None):
        self._strategies: Dict[str, ThresholdStrategy] = {}
        self._schedules: Dict[str, StrategySchedule] = {}
        self._active_strategy: Dict[str, StrategyType] = {}
        self._default_strategy = StrategyType.STANDARD
        self._redis_client = None
        self._threshold_engine = threshold_engine
        self._initialized = False

    async def initialize(self, redis_client=None):
        if redis_client:
            self._redis_client = redis_client

        self._init_default_strategies()
        self._init_default_schedules()

        try:
            await self._load_from_redis()
        except Exception as e:
            logger.warning("Failed to load strategies from Redis: %s", e)

        self._initialized = True
        logger.info(
            "Strategy manager initialized: %d strategies, %d schedules",
            len(self._strategies),
            len(self._schedules),
        )

    def _init_default_strategies(self):
        standard_thresholds = {
            ParameterType.POTENTIAL: {
                AlarmLevel.WARNING: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -850.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 0,
                },
                AlarmLevel.CRITICAL: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -1100.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 0,
                },
                AlarmLevel.EMERGENCY: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -1500.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 0,
                },
            },
            ParameterType.CURRENT: {
                AlarmLevel.WARNING: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 3000.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 0,
                },
                AlarmLevel.CRITICAL: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 4000.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 0,
                },
                AlarmLevel.EMERGENCY: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 4500.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 0,
                },
            },
        }

        strict_thresholds = {
            ParameterType.POTENTIAL: {
                AlarmLevel.WARNING: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -900.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 60,
                },
                AlarmLevel.CRITICAL: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -1000.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 30,
                },
                AlarmLevel.EMERGENCY: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -1200.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 10,
                },
            },
            ParameterType.CURRENT: {
                AlarmLevel.WARNING: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 2500.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 60,
                },
                AlarmLevel.CRITICAL: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 3500.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 30,
                },
                AlarmLevel.EMERGENCY: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 4000.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 10,
                },
            },
        }

        relaxed_thresholds = {
            ParameterType.POTENTIAL: {
                AlarmLevel.WARNING: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -1000.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 300,
                },
                AlarmLevel.CRITICAL: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -1300.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 120,
                },
                AlarmLevel.EMERGENCY: {
                    "condition": ThresholdCondition.BELOW,
                    "value": -1700.0,
                    "unit": ParameterUnit.MILLIVOLT,
                    "duration": 60,
                },
            },
            ParameterType.CURRENT: {
                AlarmLevel.WARNING: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 3500.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 300,
                },
                AlarmLevel.CRITICAL: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 4500.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 120,
                },
                AlarmLevel.EMERGENCY: {
                    "condition": ThresholdCondition.ABOVE,
                    "value": 5000.0,
                    "unit": ParameterUnit.MILLIAMPERE,
                    "duration": 60,
                },
            },
        }

        self._strategies[StrategyType.STANDARD] = ThresholdStrategy(
            strategy_id=StrategyType.STANDARD,
            name="标准策略",
            type=StrategyType.STANDARD,
            description="适用于常规场景的标准阈值配置",
            thresholds=standard_thresholds,
        )

        self._strategies[StrategyType.STRICT] = ThresholdStrategy(
            strategy_id=StrategyType.STRICT,
            name="严格策略",
            type=StrategyType.STRICT,
            description="适用于敏感区域的严格阈值配置，灵敏度高",
            thresholds=strict_thresholds,
        )

        self._strategies[StrategyType.RELAXED] = ThresholdStrategy(
            strategy_id=StrategyType.RELAXED,
            name="宽松策略",
            type=StrategyType.RELAXED,
            description="适用于稳定区域的宽松阈值配置，减少误报",
            thresholds=relaxed_thresholds,
        )

        self._strategies[StrategyType.NIGHT] = ThresholdStrategy(
            strategy_id=StrategyType.NIGHT,
            name="夜间策略",
            type=StrategyType.NIGHT,
            description="适用于夜间的阈值配置，降低敏感度",
            thresholds=relaxed_thresholds,
        )

        self._strategies[StrategyType.PEAK] = ThresholdStrategy(
            strategy_id=StrategyType.PEAK,
            name="高峰策略",
            type=StrategyType.PEAK,
            description="适用于用电高峰的严格阈值配置",
            thresholds=strict_thresholds,
        )

        self._strategies[StrategyType.MAINTENANCE] = ThresholdStrategy(
            strategy_id=StrategyType.MAINTENANCE,
            name="维护策略",
            type=StrategyType.MAINTENANCE,
            description="维护期间使用，告警阈值大幅放宽",
            thresholds={},
        )

    def _init_default_schedules(self):
        self._schedules["night_schedule"] = StrategySchedule(
            schedule_id="night_schedule",
            name="夜间策略切换",
            strategy_type=StrategyType.NIGHT,
            cron="0 22 * * *",
            pipeline_ids=[],
            all_pipelines=True,
        )

        self._schedules["peak_schedule"] = StrategySchedule(
            schedule_id="peak_schedule",
            name="高峰策略切换",
            strategy_type=StrategyType.PEAK,
            cron="0 8,18 * * 1-5",
            pipeline_ids=[],
            all_pipelines=True,
        )

        self._schedules["standard_schedule"] = StrategySchedule(
            schedule_id="standard_schedule",
            name="标准策略恢复",
            strategy_type=StrategyType.STANDARD,
            cron="0 6,20 * * *",
            pipeline_ids=[],
            all_pipelines=True,
        )

    async def _load_from_redis(self):
        if not self._redis_client:
            return
        try:
            data = await self._redis_client.get("cp:strategy:active")
            if data:
                self._active_strategy = json.loads(data)
        except Exception as e:
            logger.warning("Failed to load active strategy: %s", e)

    async def _persist_to_redis(self):
        if not self._redis_client:
            return
        try:
            await self._redis_client.set(
                "cp:strategy:active",
                json.dumps(self._active_strategy, ensure_ascii=False),
            )
        except Exception as e:
            logger.warning("Failed to persist active strategy: %s", e)

    async def switch_strategy(
        self,
        strategy_type: StrategyType,
        pipeline_id: Optional[str] = None,
        reason: str = "",
    ) -> bool:
        if strategy_type not in self._strategies:
            logger.error("Unknown strategy type: %s", strategy_type)
            return False

        strategy = self._strategies[strategy_type]
        if not strategy.enabled:
            logger.warning("Strategy %s is disabled", strategy_type)
            return False

        target_pipelines = [pipeline_id] if pipeline_id else self._get_all_pipelines()

        for pid in target_pipelines:
            old_strategy = self._active_strategy.get(pid, self._default_strategy)
            self._active_strategy[pid] = strategy_type
            logger.info(
                "Strategy switched for pipeline %s: %s -> %s (%s)",
                pid,
                old_strategy,
                strategy_type,
                reason,
            )

        await self._apply_strategy_to_engine(strategy, target_pipelines)
        await self._persist_to_redis()
        return True

    async def _apply_strategy_to_engine(
        self, strategy: ThresholdStrategy, pipeline_ids: List[str]
    ):
        if not self._threshold_engine:
            return

        from app.models.alarm_models import AlarmRule

        for pipeline_id in pipeline_ids:
            for param_type, level_configs in strategy.thresholds.items():
                for alarm_level, config in level_configs.items():
                    rule_id = f"{strategy.type}_{param_type.value}_{alarm_level.value}"
                    rule = AlarmRule(
                        rule_id=rule_id,
                        param_type=param_type,
                        alarm_level=alarm_level,
                        condition=config["condition"],
                        threshold_value=config["value"],
                        unit=config["unit"],
                        duration_seconds=config.get("duration", 0),
                        enabled=True,
                        description=f"{strategy.name} - {param_type.value} {alarm_level.value}",
                    )
                    self._threshold_engine.add_rule(pipeline_id, rule)

    def _get_all_pipelines(self) -> List[str]:
        if self._threshold_engine:
            return list(self._threshold_engine._custom_rules.keys())
        return []

    def get_active_strategy(self, pipeline_id: str) -> StrategyType:
        return self._active_strategy.get(pipeline_id, self._default_strategy)

    def get_strategy(self, strategy_type: StrategyType) -> Optional[ThresholdStrategy]:
        return self._strategies.get(strategy_type)

    def list_strategies(self) -> List[dict]:
        return [
            {
                "strategy_id": s.strategy_id,
                "name": s.name,
                "type": s.type.value,
                "description": s.description,
                "enabled": s.enabled,
                "threshold_count": sum(
                    len(levels) for levels in s.thresholds.values()
                ),
            }
            for s in self._strategies.values()
        ]

    def list_schedules(self) -> List[dict]:
        return [
            {
                "schedule_id": s.schedule_id,
                "name": s.name,
                "strategy_type": s.strategy_type.value,
                "cron": s.cron,
                "timezone": s.timezone,
                "enabled": s.enabled,
                "all_pipelines": s.all_pipelines,
                "pipeline_count": len(s.pipeline_ids),
            }
            for s in self._schedules.values()
        ]

    def add_schedule(
        self,
        name: str,
        strategy_type: StrategyType,
        cron: str,
        pipeline_ids: Optional[List[str]] = None,
        all_pipelines: bool = False,
        timezone: str = "Asia/Shanghai",
    ) -> str:
        schedule_id = f"schedule_{uuid.uuid4().hex[:8]}"
        self._schedules[schedule_id] = StrategySchedule(
            schedule_id=schedule_id,
            name=name,
            strategy_type=strategy_type,
            cron=cron,
            timezone=timezone,
            pipeline_ids=pipeline_ids or [],
            all_pipelines=all_pipelines,
        )
        logger.info("Added schedule: %s (%s)", name, schedule_id)
        return schedule_id

    def remove_schedule(self, schedule_id: str) -> bool:
        if schedule_id in self._schedules:
            del self._schedules[schedule_id]
            logger.info("Removed schedule: %s", schedule_id)
            return True
        return False

    def enable_schedule(self, schedule_id: str) -> bool:
        if schedule_id in self._schedules:
            self._schedules[schedule_id].enabled = True
            logger.info("Enabled schedule: %s", schedule_id)
            return True
        return False

    def disable_schedule(self, schedule_id: str) -> bool:
        if schedule_id in self._schedules:
            self._schedules[schedule_id].enabled = False
            logger.info("Disabled schedule: %s", schedule_id)
            return True
        return False

    async def execute_schedule(self, schedule_id: str) -> bool:
        schedule = self._schedules.get(schedule_id)
        if not schedule or not schedule.enabled:
            return False

        pipelines = []
        if schedule.all_pipelines:
            pipelines = self._get_all_pipelines()
        else:
            pipelines = schedule.pipeline_ids

        if not pipelines:
            logger.warning("No pipelines for schedule %s", schedule_id)
            return False

        logger.info(
            "Executing schedule %s: switching to %s for %d pipelines",
            schedule_id,
            schedule.strategy_type,
            len(pipelines),
        )

        success = True
        for pipeline_id in pipelines:
            if not await self.switch_strategy(
                schedule.strategy_type, pipeline_id, f"schedule:{schedule_id}"
            ):
                success = False

        return success

    def get_statistics(self) -> dict:
        strategy_counts = {}
        for pid, stype in self._active_strategy.items():
            strategy_counts[stype] = strategy_counts.get(stype, 0) + 1

        return {
            "total_strategies": len(self._strategies),
            "total_schedules": len(self._schedules),
            "enabled_schedules": sum(1 for s in self._schedules.values() if s.enabled),
            "active_strategy_distribution": strategy_counts,
        }