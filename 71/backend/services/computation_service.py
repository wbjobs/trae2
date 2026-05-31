# -*- coding: utf-8 -*-
"""
数值计算服务
Orchestrate the full spectrum simulation pipeline:
parameter parsing -> optical path simulation -> spectrum generation -> calibration.
"""

import numpy as np
from typing import Dict, Any, Optional, List
from datetime import datetime

from core.parameter_parser import ParameterParser
from core.optical_simulator import OpticalSimulator
from core.spectrum_generator import SpectrumGenerator, SpectrumData
from core.calibration_engine import CalibrationEngine, CalibrationResult, CalibrationMetrics


class ComputationService:
    """数值计算服务 - 整合所有核心计算模块"""

    def __init__(self):
        self.parser = ParameterParser()
        self.optical_sim = OpticalSimulator()
        self.spectrum_gen = SpectrumGenerator()
        self.calibration_engine = CalibrationEngine()
        self._last_spectrum: Optional[SpectrumData] = None
        self._last_calibration: Optional[CalibrationResult] = None
        self._last_metrics: Optional[CalibrationMetrics] = None

    def load_parameters(self, filepath: Optional[str] = None,
                        data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """加载并解析参数"""
        if filepath:
            raw = self.parser.load_from_json(filepath)
        elif data:
            self.parser.load_from_dict(data)
        else:
            return {"error": "必须提供参数文件或参数字典"}

        parsed = self.parser.parse_all()
        validation = self.parser.validate()

        return {
            "parameters": parsed,
            "validation": validation
        }

    def get_wavelength_axis(self) -> List[float]:
        """获取波长轴数据"""
        return self.parser.get_wavelength_axis().tolist()

    def simulate_optical_path(
        self,
        wavelength_nm: float,
        optical_params: Optional[Dict[str, Any]] = None,
        device_params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, float]:
        """仿真单波长光路"""
        if optical_params is None:
            optical_params = self.parser.parse_all()["optical"]
        if device_params is None:
            device_params = self.parser.parse_all()["device"]

        return self.optical_sim.simulate_full_path(
            wavelength_nm, optical_params, device_params
        )

    def simulate_full_spectrum(
        self,
        params: Optional[Dict[str, Any]] = None,
        source_type: str = "White_LED",
        add_emission_lines: bool = True,
        seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        完整光谱仿真流程
        1. 参数解析
        2. 光路仿真
        3. 光谱生成
        4. 返回结果
        """
        if params:
            self.parser.load_from_dict(params)

        all_params = self.parser.parse_all()
        device_params = all_params["device"]
        optical_params = all_params["optical"]

        wavelengths = self.parser.get_wavelength_axis()

        optical_transmission = self.optical_sim.simulate_spectrum_path(
            wavelengths, optical_params, device_params
        )

        self.spectrum_gen.clear_lines()
        if add_emission_lines:
            self.spectrum_gen.add_emission_line(450.0, 0.6, 1.0)
            self.spectrum_gen.add_emission_line(520.0, 0.7, 0.8)
            self.spectrum_gen.add_emission_line(589.0, 0.8, 0.6)
            self.spectrum_gen.add_emission_line(632.8, 1.0, 0.3)
            self.spectrum_gen.add_emission_line(700.0, 0.5, 1.0)
            self.spectrum_gen.add_emission_line(850.0, 0.4, 1.2)

        self.spectrum_gen.set_background(0.05)
        self.spectrum_gen.set_noise(0.02)

        spectrum_data = self.spectrum_gen.generate_complete_spectrum(
            wavelengths, source_type,
            apply_optical_transmission=optical_transmission,
            add_noise=True,
            seed=seed
        )

        self._last_spectrum = spectrum_data

        peaks = self.spectrum_gen.find_peaks(
            spectrum_data.wavelengths,
            spectrum_data.intensities,
            min_height=0.15,
            min_distance_nm=5.0
        )

        return {
            "status": "success",
            "spectrum": spectrum_data.to_dict(),
            "peaks": peaks,
            "metadata": spectrum_data.metadata,
            "timestamp": datetime.now().isoformat()
        }

    def run_wavelength_calibration(
        self,
        reference_lines: Optional[List] = None
    ) -> Dict[str, Any]:
        """执行波长标定"""
        if reference_lines is None:
            cal_target = self.parser.parse_calibration_target()
            reference_lines = list(zip(
                cal_target.target_wavelengths_nm,
                cal_target.target_intensities
            ))

        if self._last_spectrum is None:
            return {"error": "请先运行光谱仿真"}

        calibration_spectrum = {
            "wavelengths": self._last_spectrum.wavelengths.tolist(),
            "intensities": self._last_spectrum.intensities.tolist()
        }

        result = self.calibration_engine.perform_wavelength_calibration(
            calibration_spectrum,
            reference_lines
        )

        self._last_calibration = result

        return {
            "status": result.status,
            "calibration": result.to_dict(),
            "timestamp": datetime.now().isoformat()
        }

    def run_intensity_calibration(
        self,
        measured_intensities: List[float],
        reference_intensities: List[float],
        wavelengths: Optional[List[float]] = None
    ) -> Dict[str, Any]:
        """执行强度标定"""
        result = self.calibration_engine.perform_intensity_calibration(
            measured_intensities,
            reference_intensities,
            wavelengths
        )

        self._last_calibration = result

        return {
            "status": result.status,
            "calibration": result.to_dict(),
            "timestamp": datetime.now().isoformat()
        }

    def run_full_calibration(
        self,
        reference_lines: Optional[List] = None
    ) -> Dict[str, Any]:
        """执行完整标定（波长+强度）"""
        wl_result = self.run_wavelength_calibration(reference_lines)
        if wl_result.get("status") != "success":
            return wl_result

        if self._last_spectrum is None:
            return {"error": "请先运行光谱仿真"}

        meas_intensities = []
        ref_intensities = []
        cal_wavelengths = []

        for point in self._last_calibration.calibration_points:
            idx = int(point["pixel"])
            if idx < len(self._last_spectrum.intensities):
                meas_intensities.append(
                    float(self._last_spectrum.intensities[idx])
                )
                ref_intensities.append(
                    float(point["wavelength_reference"])
                )
                cal_wavelengths.append(
                    float(point["wavelength_reference"])
                )

        int_result = self.run_intensity_calibration(
            meas_intensities, ref_intensities, cal_wavelengths
        )

        if self._last_calibration:
            self._last_metrics = self.calibration_engine.compute_calibration_metrics(
                [p["wavelength_measured"] for p in self._last_calibration.calibration_points],
                [p["wavelength_reference"] for p in self._last_calibration.calibration_points],
                meas_intensities,
                ref_intensities
            )

        return {
            "status": "success",
            "wavelength_calibration": wl_result.get("calibration", {}),
            "intensity_calibration": int_result.get("calibration", {}),
            "metrics": {
                "wavelength_accuracy_nm": self._last_metrics.wavelength_accuracy_nm if self._last_metrics else 0,
                "wavelength_precision_nm": self._last_metrics.wavelength_precision_nm if self._last_metrics else 0,
                "intensity_accuracy_pct": self._last_metrics.intensity_accuracy_pct if self._last_metrics else 0,
                "intensity_precision_pct": self._last_metrics.intensity_precision_pct if self._last_metrics else 0,
                "linearity_r2": self._last_metrics.linearity_r2 if self._last_metrics else 0,
                "snr": self._last_metrics.snr if self._last_metrics else 0
            },
            "timestamp": datetime.now().isoformat()
        }

    def get_calibrated_spectrum(self) -> Dict[str, Any]:
        """获取标定后的光谱数据"""
        if self._last_spectrum is None:
            return {"error": "无光谱数据"}

        wl, intensity = self.calibration_engine.apply_full_calibration(
            self._last_spectrum.wavelengths,
            self._last_spectrum.intensities
        )

        return {
            "wavelengths_original": self._last_spectrum.wavelengths.tolist(),
            "intensities_original": self._last_spectrum.intensities.tolist(),
            "wavelengths_calibrated": wl.tolist(),
            "intensities_calibrated": intensity.tolist()
        }

    def validate_calibration(
        self,
        test_reference_lines: Optional[List] = None,
        tolerance_pct: float = 2.0
    ) -> Dict[str, Any]:
        """验证标定结果"""
        if self._last_spectrum is None:
            return {"error": "请先运行光谱仿真"}

        if test_reference_lines is None:
            cal_target = self.parser.parse_calibration_target()
            test_reference_lines = list(zip(
                cal_target.target_wavelengths_nm,
                cal_target.target_intensities
            ))

        test_spectrum = {
            "wavelengths": self._last_spectrum.wavelengths.tolist(),
            "intensities": self._last_spectrum.intensities.tolist()
        }

        validation = self.calibration_engine.validate_calibration(
            test_spectrum, test_reference_lines, tolerance_pct
        )

        return {
            "status": "success",
            "validation": validation,
            "timestamp": datetime.now().isoformat()
        }

    def get_device_presets(self) -> Dict[str, Any]:
        """获取设备预设列表"""
        from models.device_models import DeviceModelManager
        manager = DeviceModelManager()
        presets = {}
        for name in manager.list_presets():
            preset = manager.get_preset(name)
            if preset:
                presets[name] = preset.to_dict()
        return presets

    def get_optical_presets(self) -> Dict[str, Any]:
        """获取光学预设列表"""
        from models.optical_models import OpticalModelManager
        manager = OpticalModelManager()
        presets = {}
        for name in manager.list_presets():
            preset = manager.get_preset(name)
            if preset:
                presets[name] = preset.to_dict()
        return presets

    def reset(self) -> None:
        """重置服务状态"""
        self.parser = ParameterParser()
        self.optical_sim = OpticalSimulator()
        self.spectrum_gen = SpectrumGenerator()
        self.calibration_engine = CalibrationEngine()
        self._last_spectrum = None
        self._last_calibration = None
        self._last_metrics = None
