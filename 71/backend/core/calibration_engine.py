# -*- coding: utf-8 -*-
"""
标定引擎模块
Perform wavelength calibration, intensity calibration, and error analysis
for spectrum analyzer parameter calibration.
"""

import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass, field
from scipy.optimize import curve_fit
from scipy.interpolate import interp1d


@dataclass
class CalibrationResult:
    """标定结果"""
    wavelength_coeffs: List[float] = field(default_factory=list)
    intensity_coeffs: List[float] = field(default_factory=list)
    wavelength_rmse: float = 0.0
    intensity_rmse: float = 0.0
    calibration_points: List[Dict[str, float]] = field(default_factory=list)
    status: str = "pending"
    error_message: str = ""
    timestamp: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "wavelength_coeffs": self.wavelength_coeffs,
            "intensity_coeffs": self.intensity_coeffs,
            "wavelength_rmse": self.wavelength_rmse,
            "intensity_rmse": self.intensity_rmse,
            "calibration_points": self.calibration_points,
            "status": self.status,
            "error_message": self.error_message,
            "timestamp": self.timestamp
        }


@dataclass
class CalibrationMetrics:
    """标定性能指标"""
    wavelength_accuracy_nm: float = 0.0
    wavelength_precision_nm: float = 0.0
    intensity_accuracy_pct: float = 0.0
    intensity_precision_pct: float = 0.0
    linearity_r2: float = 0.0
    snr: float = 0.0
    drift_ppm: float = 0.0
    resolution_nm: float = 0.0


class CalibrationEngine:
    """光谱标定引擎"""

    def __init__(self):
        self.result = CalibrationResult()
        self.metrics = CalibrationMetrics()

    def _quadratic_wavelength_model(
        self,
        pixel: np.ndarray,
        a: float,
        b: float,
        c: float
    ) -> np.ndarray:
        """波长二次标定模型: λ = a*p² + b*p + c"""
        return a * pixel ** 2 + b * pixel + c

    def _linear_wavelength_model(
        self,
        pixel: np.ndarray,
        a: float,
        b: float
    ) -> np.ndarray:
        """波长线性标定模型: λ = a*p + b"""
        return a * pixel + b

    def perform_wavelength_calibration(
        self,
        calibration_spectrum: Dict[str, Any],
        reference_lines: List[Tuple[float, float]],
        pixel_count: int = 2048,
        use_quadratic: bool = True
    ) -> CalibrationResult:
        """
        执行波长标定
        calibration_spectrum: 标定光谱数据
        reference_lines: 参考谱线 [(wavelength, intensity), ...]
        """
        try:
            wavelengths = np.array(calibration_spectrum.get("wavelengths", []))
            intensities = np.array(calibration_spectrum.get("intensities", []))

            if len(wavelengths) == 0 or len(reference_lines) == 0:
                self.result.status = "failed"
                self.result.error_message = "标定光谱或参考谱线数据为空"
                return self.result

            detected_peaks = []
            ref_wavelengths = [wl for wl, _ in reference_lines]

            for ref_wl in ref_wavelengths:
                idx = np.argmin(np.abs(wavelengths - ref_wl))
                search_range = max(10, pixel_count // 100)
                start = max(0, idx - search_range)
                end = min(len(wavelengths), idx + search_range)

                local_max_idx = start + np.argmax(intensities[start:end])
                detected_peaks.append({
                    "pixel": float(local_max_idx),
                    "wavelength_measured": float(wavelengths[local_max_idx]),
                    "wavelength_reference": ref_wl
                })

            pixels = np.array([p["pixel"] for p in detected_peaks])
            ref_wls = np.array([p["wavelength_reference"] for p in detected_peaks])

            if use_quadratic and len(pixels) >= 3:
                try:
                    popt, _ = curve_fit(
                        self._quadratic_wavelength_model,
                        pixels, ref_wls,
                        p0=[0.0, 0.001, 400.0],
                        maxfev=10000
                    )
                    self.result.wavelength_coeffs = list(popt)
                except Exception:
                    popt = np.polyfit(pixels, ref_wls, 1)
                    self.result.wavelength_coeffs = [0.0, popt[0], popt[1]]
            else:
                popt = np.polyfit(pixels, ref_wls, 1)
                self.result.wavelength_coeffs = [0.0, popt[0], popt[1]]

            calibrated_wls = self._quadratic_wavelength_model(
                pixels, *self.result.wavelength_coeffs
            )
            residuals = ref_wls - calibrated_wls
            self.result.wavelength_rmse = float(np.sqrt(np.mean(residuals ** 2)))

            self.result.calibration_points = detected_peaks
            self.result.status = "success"

        except Exception as e:
            self.result.status = "failed"
            self.result.error_message = str(e)

        return self.result

    def perform_intensity_calibration(
        self,
        measured_intensities: List[float],
        reference_intensities: List[float],
        wavelengths: Optional[List[float]] = None
    ) -> CalibrationResult:
        """
        执行强度标定
        使用多项式拟合强度响应曲线
        """
        try:
            measured = np.array(measured_intensities)
            reference = np.array(reference_intensities)

            if len(measured) == 0 or len(reference) == 0:
                self.result.status = "failed"
                self.result.error_message = "强度标定数据为空"
                return self.result

            if len(measured) != len(reference):
                self.result.status = "failed"
                self.result.error_message = "测量与参考强度数量不匹配"
                return self.result

            valid = (measured > 0) & (reference > 0)
            if np.sum(valid) < 2:
                self.result.status = "failed"
                self.result.error_message = "有效数据点不足"
                return self.result

            ratios = reference[valid] / measured[valid]
            if wavelengths is not None and len(wavelengths) == len(ratios):
                wl = np.array(wavelengths)[valid]
                if len(wl) >= 4:
                    coeffs = np.polyfit(wl, ratios, 3)
                    self.result.intensity_coeffs = list(coeffs)
                elif len(wl) >= 3:
                    coeffs = np.polyfit(wl, ratios, 2)
                    self.result.intensity_coeffs = list(coeffs)
                else:
                    avg_ratio = np.mean(ratios)
                    self.result.intensity_coeffs = [avg_ratio]
            else:
                avg_ratio = np.mean(ratios)
                self.result.intensity_coeffs = [avg_ratio]

            calibrated = measured * np.mean(ratios)
            residuals = reference - calibrated
            self.result.intensity_rmse = float(np.sqrt(np.mean(residuals ** 2)))

            self.result.status = "success"

        except Exception as e:
            self.result.status = "failed"
            self.result.error_message = str(e)

        return self.result

    def compute_calibration_metrics(
        self,
        measured_wavelengths: List[float],
        reference_wavelengths: List[float],
        measured_intensities: List[float],
        reference_intensities: List[float]
    ) -> CalibrationMetrics:
        """计算标定性能指标"""
        meas_wl = np.array(measured_wavelengths)
        ref_wl = np.array(reference_wavelengths)
        meas_int = np.array(measured_intensities)
        ref_int = np.array(reference_intensities)

        if len(meas_wl) > 0 and len(ref_wl) > 0:
            wl_errors = np.abs(meas_wl - ref_wl)
            self.metrics.wavelength_accuracy_nm = float(np.mean(wl_errors))
            self.metrics.wavelength_precision_nm = float(np.std(wl_errors))

        if len(meas_int) > 0 and len(ref_int) > 0:
            int_errors = np.abs(meas_int - ref_int)
            self.metrics.intensity_accuracy_pct = float(
                np.mean(int_errors / np.maximum(ref_int, 1e-10)) * 100
            )
            self.metrics.intensity_precision_pct = float(
                np.std(int_errors / np.maximum(ref_int, 1e-10)) * 100
            )

        if len(ref_int) >= 2 and len(meas_int) >= 2:
            corr_matrix = np.corrcoef(ref_int, meas_int)
            self.metrics.linearity_r2 = float(corr_matrix[0, 1] ** 2)

        if len(meas_int) > 1:
            signal = np.mean(meas_int)
            noise = np.std(meas_int)
            self.metrics.snr = float(signal / max(noise, 1e-10))

        return self.metrics

    def get_wavelength_correction(
        self,
        pixel_index: float
    ) -> float:
        """根据标定系数获取波长校正值"""
        if len(self.result.wavelength_coeffs) >= 3:
            a, b, c = self.result.wavelength_coeffs[:3]
            return a * pixel_index ** 2 + b * pixel_index + c
        elif len(self.result.wavelength_coeffs) >= 2:
            b, c = self.result.wavelength_coeffs[-2:]
            return b * pixel_index + c
        return pixel_index

    def get_intensity_correction(
        self,
        wavelength_nm: float,
        measured_intensity: float
    ) -> float:
        """根据标定系数获取强度校正值"""
        if len(self.result.intensity_coeffs) == 0:
            return measured_intensity

        coeffs = self.result.intensity_coeffs
        if len(coeffs) == 1:
            return measured_intensity * coeffs[0]
        elif len(coeffs) >= 2:
            correction = np.polyval(coeffs, wavelength_nm)
            return measured_intensity * correction

        return measured_intensity

    def apply_full_calibration(
        self,
        wavelengths: np.ndarray,
        intensities: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """应用完整的波长和强度标定"""
        corrected_wavelengths = np.array([
            self.get_wavelength_correction(wl)
            for wl in wavelengths
        ])

        corrected_intensities = np.array([
            self.get_intensity_correction(wl, intensity)
            for wl, intensity in zip(wavelengths, intensities)
        ])

        return corrected_wavelengths, corrected_intensities

    def validate_calibration(
        self,
        test_spectrum: Dict[str, Any],
        reference_lines: List[Tuple[float, float]],
        tolerance_pct: float = 2.0
    ) -> Dict[str, Any]:
        """验证标定结果"""
        results = {
            "valid": True,
            "wavelength_errors": [],
            "intensity_errors": [],
            "failed_points": [],
            "overall_quality": "excellent"
        }

        if self.result.status != "success":
            results["valid"] = False
            results["overall_quality"] = "failed"
            return results

        wavelengths = np.array(test_spectrum.get("wavelengths", []))
        intensities = np.array(test_spectrum.get("intensities", []))

        for ref_wl, ref_int in reference_lines:
            idx = np.argmin(np.abs(wavelengths - ref_wl))
            meas_int = intensities[idx] if idx < len(intensities) else 0

            wl_error = abs(wavelengths[idx] - ref_wl) / ref_wl * 100
            int_error = abs(meas_int - ref_int) / max(ref_int, 1e-10) * 100

            results["wavelength_errors"].append(float(wl_error))
            results["intensity_errors"].append(float(int_error))

            if wl_error > tolerance_pct or int_error > tolerance_pct:
                results["failed_points"].append({
                    "wavelength": ref_wl,
                    "wl_error_pct": wl_error,
                    "int_error_pct": int_error
                })

        if results["failed_points"]:
            results["valid"] = False
            if len(results["failed_points"]) > len(reference_lines) * 0.5:
                results["overall_quality"] = "poor"
            else:
                results["overall_quality"] = "acceptable"
        else:
            avg_wl_error = np.mean(results["wavelength_errors"])
            avg_int_error = np.mean(results["intensity_errors"])
            if avg_wl_error < 0.5 and avg_int_error < 1.0:
                results["overall_quality"] = "excellent"
            elif avg_wl_error < 1.0 and avg_int_error < 2.0:
                results["overall_quality"] = "good"
            else:
                results["overall_quality"] = "acceptable"

        return results

    def reset(self) -> None:
        """重置标定引擎"""
        self.result = CalibrationResult()
        self.metrics = CalibrationMetrics()
