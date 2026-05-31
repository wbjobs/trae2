# -*- coding: utf-8 -*-
"""
光谱参数解析模块
Parse and validate optical/device parameters for spectrum simulation.
"""

import json
import numpy as np
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field, asdict


@dataclass
class DeviceParams:
    """设备参数模型"""
    device_id: str = "SA-2026-001"
    device_name: str = "Spectrum Analyzer Pro"
    wavelength_range_nm: List[float] = field(default_factory=lambda: [400.0, 1100.0])
    resolution_nm: float = 0.5
    sampling_rate_hz: float = 1000.0
    integration_time_ms: float = 10.0
    detector_type: str = "CCD"
    pixel_count: int = 2048
    temperature_c: float = 25.0
    humidity_pct: float = 45.0


@dataclass
class OpticalParams:
    """光学参数模型"""
    light_source_type: str = "White_LED"
    source_power_mw: float = 5.0
    focal_length_mm: float = 75.0
    grating_density_lpm: float = 600.0
    slit_width_um: float = 50.0
    mirror_reflectivity: float = 0.95
    fiber_core_um: float = 200.0
    fiber_na: float = 0.22
    calibration_source_wl_nm: float = 632.8
    calibration_source_power_mw: float = 1.0


@dataclass
class CalibrationTarget:
    """标定目标参数"""
    target_wavelengths_nm: List[float] = field(default_factory=lambda: [450.0, 520.0, 632.8, 700.0, 850.0])
    target_intensities: List[float] = field(default_factory=lambda: [0.8, 0.9, 1.0, 0.85, 0.7])
    tolerance_pct: float = 2.0


class ParameterParser:
    """光谱参数解析器"""

    def __init__(self):
        self.device_params = DeviceParams()
        self.optical_params = OpticalParams()
        self.calibration_target = CalibrationTarget()
        self._raw_data: Dict[str, Any] = {}

    def load_from_json(self, filepath: str) -> Dict[str, Any]:
        """从 JSON 文件加载参数"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                raw = json.load(f)
            self._raw_data = raw if isinstance(raw, dict) else {}
        except (json.JSONDecodeError, FileNotFoundError, PermissionError, OSError) as e:
            raise ValueError(f"无法加载参数文件 {filepath}: {str(e)}")
        return self._raw_data

    def load_from_dict(self, data: Dict[str, Any]) -> None:
        """从字典加载参数"""
        if isinstance(data, dict):
            self._raw_data = data
        else:
            self._raw_data = {}

    def parse_device_params(self) -> DeviceParams:
        """解析设备参数"""
        if "device" in self._raw_data:
            dev = self._raw_data["device"]
            self.device_params = DeviceParams(
                device_id=dev.get("device_id", "SA-2026-001"),
                device_name=dev.get("device_name", "Spectrum Analyzer Pro"),
                wavelength_range_nm=dev.get("wavelength_range_nm", [400.0, 1100.0]),
                resolution_nm=dev.get("resolution_nm", 0.5),
                sampling_rate_hz=dev.get("sampling_rate_hz", 1000.0),
                integration_time_ms=dev.get("integration_time_ms", 10.0),
                detector_type=dev.get("detector_type", "CCD"),
                pixel_count=dev.get("pixel_count", 2048),
                temperature_c=dev.get("temperature_c", 25.0),
                humidity_pct=dev.get("humidity_pct", 45.0)
            )
        return self.device_params

    def parse_optical_params(self) -> OpticalParams:
        """解析光学参数"""
        if "optical" in self._raw_data:
            opt = self._raw_data["optical"]
            self.optical_params = OpticalParams(
                light_source_type=opt.get("light_source_type", "White_LED"),
                source_power_mw=opt.get("source_power_mw", 5.0),
                focal_length_mm=opt.get("focal_length_mm", 75.0),
                grating_density_lpm=opt.get("grating_density_lpm", 600.0),
                slit_width_um=opt.get("slit_width_um", 50.0),
                mirror_reflectivity=opt.get("mirror_reflectivity", 0.95),
                fiber_core_um=opt.get("fiber_core_um", 200.0),
                fiber_na=opt.get("fiber_na", 0.22),
                calibration_source_wl_nm=opt.get("calibration_source_wl_nm", 632.8),
                calibration_source_power_mw=opt.get("calibration_source_power_mw", 1.0)
            )
        return self.optical_params

    def parse_calibration_target(self) -> CalibrationTarget:
        """解析标定目标"""
        if "calibration" in self._raw_data:
            cal = self._raw_data["calibration"]
            self.calibration_target = CalibrationTarget(
                target_wavelengths_nm=cal.get("target_wavelengths_nm", [450.0, 520.0, 632.8, 700.0, 850.0]),
                target_intensities=cal.get("target_intensities", [0.8, 0.9, 1.0, 0.85, 0.7]),
                tolerance_pct=cal.get("tolerance_pct", 2.0)
            )
        return self.calibration_target

    def parse_all(self) -> Dict[str, Any]:
        """解析所有参数并返回字典"""
        self.parse_device_params()
        self.parse_optical_params()
        self.parse_calibration_target()
        return {
            "device": asdict(self.device_params),
            "optical": asdict(self.optical_params),
            "calibration": asdict(self.calibration_target)
        }

    def validate(self) -> Dict[str, Any]:
        """验证参数有效性"""
        errors = []
        warnings = []

        try:
            dev = self.device_params
            if not hasattr(dev, 'resolution_nm'):
                errors.append("设备参数缺失分辨率字段")
            else:
                if dev.resolution_nm <= 0:
                    errors.append("分辨率必须大于0")

            wl_range = getattr(dev, 'wavelength_range_nm', None)
            if wl_range is None or len(wl_range) < 2:
                errors.append("波长范围配置无效")
            elif wl_range[0] >= wl_range[1]:
                errors.append("波长范围起始值必须小于结束值")

            if hasattr(dev, 'integration_time_ms') and dev.integration_time_ms <= 0:
                errors.append("积分时间必须大于0")
            if hasattr(dev, 'pixel_count') and dev.pixel_count <= 0:
                errors.append("像素数量必须大于0")

            opt = self.optical_params
            if hasattr(opt, 'focal_length_mm') and opt.focal_length_mm <= 0:
                errors.append("焦距必须大于0")
            if hasattr(opt, 'grating_density_lpm'):
                if opt.grating_density_lpm <= 0:
                    errors.append("光栅密度必须大于0")
                elif opt.grating_density_lpm < 10.0:
                    warnings.append("光栅密度过小，可能导致光路数值计算不稳定")
            if hasattr(opt, 'mirror_reflectivity') and not (0 < opt.mirror_reflectivity <= 1):
                errors.append("镜面反射率应在(0, 1]范围内")
            if hasattr(opt, 'fiber_na') and opt.fiber_na <= 0:
                errors.append("光纤NA必须大于0")

            if wl_range is not None and len(wl_range) >= 2:
                cal_wl = getattr(opt, 'calibration_source_wl_nm', None)
                if cal_wl is not None and (cal_wl < wl_range[0] or cal_wl > wl_range[1]):
                    warnings.append("标定光源波长超出设备波长范围")

            cal = self.calibration_target
            wls = getattr(cal, 'target_wavelengths_nm', [])
            ints = getattr(cal, 'target_intensities', [])
            if len(wls) != len(ints):
                errors.append("标定波长与强度数量不匹配")
        except Exception as e:
            errors.append(f"参数验证异常: {str(e)}")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }

    def get_wavelength_axis(self) -> np.ndarray:
        """根据设备参数生成波长轴"""
        try:
            dev = self.device_params
            wl_range = getattr(dev, 'wavelength_range_nm', None)
            pixel_count = getattr(dev, 'pixel_count', 2048)

            if wl_range is None or len(wl_range) < 2:
                return np.linspace(400.0, 1100.0, 2048)

            if wl_range[0] >= wl_range[1]:
                return np.linspace(400.0, 1100.0, 2048)

            if pixel_count is None or pixel_count <= 0:
                pixel_count = 2048

            return np.linspace(wl_range[0], wl_range[1], int(pixel_count))
        except Exception:
            return np.linspace(400.0, 1100.0, 2048)

    def export_to_json(self, filepath: str) -> None:
        """导出当前参数到 JSON 文件"""
        all_params = self.parse_all()
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(all_params, f, indent=2, ensure_ascii=False)
