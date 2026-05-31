import logging
from datetime import datetime, timezone
from typing import List, Tuple, Optional, Dict, Any
from dataclasses import dataclass, field

from app.constants import ParameterType, ParameterUnit, VALID_PARAM_RANGES
from app.models.schemas import CollectDataRequest, ParameterData, BatchCollectRequest
from app.models.data_models import PipelineDataPoint

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    valid: bool
    errors: List[str]
    warnings: List[str]
    data: Any = None


@dataclass
class ValidationContext:
    request: CollectDataRequest
    device_info: Optional[Dict] = None
    pipeline_info: Optional[Dict] = None
    metadata: Dict = field(default_factory=dict)


class ParameterTypeValidator:
    """
    第一层：参数类型与格式校验
    只负责基础类型、格式、范围的纯数据校验
    """

    def __init__(self):
        self._max_timestamp_skew = 300

    def validate(self, param: ParameterData) -> ValidationResult:
        errors = []
        warnings = []

        if not isinstance(param.value, (int, float)):
            errors.append(
                f"Invalid value type: expected numeric, got {type(param.value).__name__}"
            )
            return ValidationResult(False, errors, warnings)

        if param.param_type not in VALID_PARAM_RANGES:
            errors.append(f"Unknown parameter type: {param.param_type.value}")
            return ValidationResult(False, errors, warnings)

        min_val, max_val = VALID_PARAM_RANGES[param.param_type]
        if param.value < min_val or param.value > max_val:
            errors.append(
                f"Value {param.value} out of valid range [{min_val}, {max_val}]"
            )

        expected_unit = self._get_expected_unit(param.param_type)
        if param.unit != expected_unit:
            warnings.append(
                f"Unit mismatch: expected {expected_unit.value}, got {param.unit.value}"
            )

        if param.quality < 0 or param.quality > 3:
            errors.append(f"Quality flag out of range [0-3]: {param.quality}")

        return ValidationResult(len(errors) == 0, errors, warnings, param)

    def _get_expected_unit(self, param_type: ParameterType) -> ParameterUnit:
        unit_map = {
            ParameterType.POTENTIAL: ParameterUnit.MILLIVOLT,
            ParameterType.CURRENT: ParameterUnit.MILLIAMPERE,
            ParameterType.RESISTIVITY: ParameterUnit.OHM_METER,
            ParameterType.TEMPERATURE: ParameterUnit.CELSIUS,
            ParameterType.PH: ParameterUnit.PH_UNIT,
        }
        return unit_map.get(param_type, ParameterUnit.MILLIVOLT)


class DeviceValidator:
    """
    第二层：设备与管道元信息校验
    负责设备ID、管道ID的格式与有效性校验
    """

    def __init__(self, redis_client=None):
        self._redis_client = redis_client
        self._max_id_length = 64

    async def validate(self, context: ValidationContext) -> ValidationResult:
        errors = []
        warnings = []

        request = context.request

        if not request.device_id or not request.device_id.strip():
            errors.append("device_id cannot be empty")
        elif len(request.device_id) > self._max_id_length:
            errors.append(f"device_id exceeds max length {self._max_id_length}")

        if not request.pipeline_id or not request.pipeline_id.strip():
            errors.append("pipeline_id cannot be empty")
        elif len(request.pipeline_id) > self._max_id_length:
            errors.append(f"pipeline_id exceeds max length {self._max_id_length}")

        if self._redis_client and len(errors) == 0:
            try:
                device_key = f"cp:device:{request.device_id}"
                device_exists = await self._redis_client.exists(device_key)
                if not device_exists:
                    warnings.append(f"Unknown device: {request.device_id}")
            except Exception as e:
                logger.warning("Device validation lookup failed: %s", e)

        return ValidationResult(len(errors) == 0, errors, warnings)


class TimeValidator:
    """
    第三层：时序逻辑校验
    负责时间戳偏移、采样间隔等时序相关校验
    """

    def __init__(self):
        self._max_timestamp_skew = 300
        self._min_sample_interval_ms = 100
        self._last_sample: Dict[str, float] = {}

    def validate(
        self,
        device_id: str,
        param_type: ParameterType,
        timestamp: datetime,
    ) -> ValidationResult:
        errors = []
        warnings = []

        now = datetime.now(timezone.utc)
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)

        skew = abs((now - timestamp).total_seconds())
        if skew > self._max_timestamp_skew:
            errors.append(f"Timestamp skew {skew:.0f}s exceeds allowed limit")

        key = f"{device_id}:{param_type.value}"
        now_ms = now.timestamp() * 1000

        if key in self._last_sample:
            interval = now_ms - self._last_sample[key]
            if interval < self._min_sample_interval_ms:
                warnings.append(f"Sample interval {interval:.0f}ms is very short")

        self._last_sample[key] = now_ms

        return ValidationResult(len(errors) == 0, errors, warnings)


class PipelineDataTransformer:
    """
    数据转换层：将校验后的请求转换为标准数据点格式
    独立于校验逻辑，负责数据标准化、单位转换、字段映射
    """

    def __init__(self):
        pass

    def transform(
        self,
        request: CollectDataRequest,
        param: ParameterData,
        node_id: str = "",
    ) -> PipelineDataPoint:
        return PipelineDataPoint(
            device_id=request.device_id,
            pipeline_id=request.pipeline_id,
            param_type=param.param_type,
            value=float(param.value),
            unit=param.unit,
            timestamp=param.timestamp,
            location=request.location,
            quality=param.quality,
            batch_id=request.batch_id,
            node_id=node_id,
        )


class ValidationPipeline:
    """
    校验流水线：编排各校验器顺序执行
    实现校验与业务逻辑的完全解耦
    """

    def __init__(self, redis_client=None):
        self._type_validator = ParameterTypeValidator()
        self._device_validator = DeviceValidator(redis_client)
        self._time_validator = TimeValidator()
        self._transformer = PipelineDataTransformer()
        self._node_id = ""

    def set_node_id(self, node_id: str):
        self._node_id = node_id

    async def process(
        self, request: CollectDataRequest
    ) -> Tuple[bool, List[str], List[str], List[PipelineDataPoint]]:
        all_errors = []
        all_warnings = []
        all_points = []

        context = ValidationContext(request=request)

        device_result = await self._device_validator.validate(context)
        all_errors.extend(device_result.errors)
        all_warnings.extend(device_result.warnings)

        if not device_result.valid:
            return False, all_errors, all_warnings, []

        for param in request.parameters:
            type_result = self._type_validator.validate(param)
            if not type_result.valid:
                all_errors.extend(
                    f"[{param.param_type.value}] {e}" for e in type_result.errors
                )
                continue

            all_warnings.extend(
                f"[{param.param_type.value}] {w}" for w in type_result.warnings
            )

            time_result = self._time_validator.validate(
                request.device_id, param.param_type, param.timestamp
            )
            if not time_result.valid:
                all_errors.extend(
                    f"[{param.param_type.value}] {e}" for e in time_result.errors
                )
                continue

            all_warnings.extend(
                f"[{param.param_type.value}] {w}" for w in time_result.warnings
            )

            point = self._transformer.transform(param, param, self._node_id)
            point.device_id = request.device_id
            point.pipeline_id = request.pipeline_id
            point.location = request.location
            point.batch_id = request.batch_id
            all_points.append(point)

        return len(all_errors) == 0, all_errors, all_warnings, all_points

    async def process_batch(
        self, batch: BatchCollectRequest
    ) -> Tuple[int, int, List[PipelineDataPoint], List[str]]:
        success_count = 0
        fail_count = 0
        all_points = []
        all_errors = []

        for request in batch.requests:
            ok, errors, _, points = await self.process(request)
            if ok:
                success_count += 1
                all_points.extend(points)
            else:
                fail_count += 1
                all_errors.extend(errors)

        return success_count, fail_count, all_points, all_errors

    def get_statistics(self) -> dict:
        return {
            "validators": ["type", "device", "time"],
            "transformer": "standard",
            "mode": "async_pipeline",
        }