import time
import logging
from datetime import datetime, timezone
from typing import List, Tuple, Optional

from app.constants import (
    ParameterType,
    ParameterUnit,
    VALID_PARAM_RANGES,
)
from app.models.schemas import CollectDataRequest, ParameterData
from app.models.data_models import PipelineDataPoint

logger = logging.getLogger(__name__)


class ParameterValidator:
    """
    参数校验模块
    负责对野外监测终端传回的电位、电流等参数进行完整性、
    有效性、范围、时序等多维度校验，确保数据质量后再进入后续处理流水线。
    """

    MAX_TIMESTAMP_SKEW_SECONDS = 300
    MIN_SAMPLE_INTERVAL_MS = 100

    def __init__(self):
        self._last_device_sample: dict = {}

    def validate_collect_request(
        self, request: CollectDataRequest
    ) -> Tuple[bool, List[str], List[PipelineDataPoint]]:
        errors: List[str] = []
        validated_points: List[PipelineDataPoint] = []

        errors.extend(self._validate_device_id(request.device_id))
        errors.extend(self._validate_pipeline_id(request.pipeline_id))

        for param in request.parameters:
            param_errors = self._validate_parameter(param)
            if param_errors:
                errors.extend(param_errors)
                continue

            skew_errors = self._validate_timestamp_skew(param.timestamp)
            if skew_errors:
                errors.extend(skew_errors)
                continue

            interval_errors = self._validate_sample_interval(
                request.device_id, param.param_type, param.timestamp
            )
            if interval_errors:
                errors.extend(interval_errors)

            point = PipelineDataPoint(
                device_id=request.device_id,
                pipeline_id=request.pipeline_id,
                param_type=param.param_type,
                value=param.value,
                unit=param.unit,
                timestamp=param.timestamp,
                location=request.location,
                quality=param.quality,
                batch_id=request.batch_id,
            )
            validated_points.append(point)

        return len(errors) == 0, errors, validated_points

    def _validate_device_id(self, device_id: str) -> List[str]:
        errors = []
        if not device_id or not device_id.strip():
            errors.append("device_id cannot be empty")
        elif len(device_id) > 64:
            errors.append(f"device_id exceeds max length 64: {len(device_id)}")
        return errors

    def _validate_pipeline_id(self, pipeline_id: str) -> List[str]:
        errors = []
        if not pipeline_id or not pipeline_id.strip():
            errors.append("pipeline_id cannot be empty")
        elif len(pipeline_id) > 64:
            errors.append(f"pipeline_id exceeds max length 64: {len(pipeline_id)}")
        return errors

    def _validate_parameter(self, param: ParameterData) -> List[str]:
        errors = []

        if not isinstance(param.value, (int, float)):
            errors.append(
                f"Invalid value type for {param.param_type.value}: "
                f"expected numeric, got {type(param.value).__name__}"
            )
            return errors

        if param.param_type not in VALID_PARAM_RANGES:
            errors.append(f"Unknown parameter type: {param.param_type.value}")
            return errors

        min_val, max_val = VALID_PARAM_RANGES[param.param_type]
        if param.value < min_val or param.value > max_val:
            errors.append(
                f"{param.param_type.value} value {param.value} out of valid range "
                f"[{min_val}, {max_val}] {param.unit.value}"
            )

        expected_unit = self._get_expected_unit(param.param_type)
        if param.unit != expected_unit:
            errors.append(
                f"Unit mismatch for {param.param_type.value}: "
                f"expected {expected_unit.value}, got {param.unit.value}"
            )

        if param.quality < 0 or param.quality > 3:
            errors.append(f"Quality flag out of range [0-3]: {param.quality}")

        return errors

    def _validate_timestamp_skew(self, ts: datetime) -> List[str]:
        errors = []
        now = datetime.now(timezone.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        skew = abs((now - ts).total_seconds())
        if skew > self.MAX_TIMESTAMP_SKEW_SECONDS:
            errors.append(
                f"Timestamp skew {skew:.0f}s exceeds max allowed "
                f"{self.MAX_TIMESTAMP_SKEW_SECONDS}s"
            )
        return errors

    def _validate_sample_interval(
        self,
        device_id: str,
        param_type: ParameterType,
        ts: datetime,
    ) -> List[str]:
        errors = []
        key = f"{device_id}:{param_type.value}"
        now_ms = time.time() * 1000

        if key in self._last_device_sample:
            last_ms = self._last_device_sample[key]
            interval = now_ms - last_ms
            if interval < self.MIN_SAMPLE_INTERVAL_MS:
                errors.append(
                    f"Sample interval too short for {key}: "
                    f"{interval:.0f}ms < {self.MIN_SAMPLE_INTERVAL_MS}ms"
                )

        self._last_device_sample[key] = now_ms
        return errors

    def _get_expected_unit(self, param_type: ParameterType) -> ParameterUnit:
        unit_map = {
            ParameterType.POTENTIAL: ParameterUnit.MILLIVOLT,
            ParameterType.CURRENT: ParameterUnit.MILLIAMPERE,
            ParameterType.RESISTIVITY: ParameterUnit.OHM_METER,
            ParameterType.TEMPERATURE: ParameterUnit.CELSIUS,
            ParameterType.PH: ParameterUnit.PH_UNIT,
        }
        return unit_map.get(param_type, ParameterUnit.MILLIVOLT)

    def batch_validate(
        self, requests: List[CollectDataRequest]
    ) -> Tuple[int, int, List[PipelineDataPoint], List[str]]:
        total_errors: List[str] = []
        all_validated: List[PipelineDataPoint] = []
        success_count = 0
        fail_count = 0

        for req in requests:
            ok, errs, points = self.validate_collect_request(req)
            if ok:
                success_count += 1
                all_validated.extend(points)
            else:
                fail_count += 1
                total_errors.extend(errs)

        return success_count, fail_count, all_validated, total_errors