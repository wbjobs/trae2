# -*- coding: utf-8 -*-
"""
光谱图谱生成模块
Generate synthetic spectrum data including emission lines,
background noise, and realistic spectral features.
"""

import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass, field


@dataclass
class SpectrumLine:
    """光谱发射/吸收谱线"""
    wavelength_nm: float
    intensity: float
    width_nm: float = 0.5
    line_type: str = "emission"
    amplitude: float = 1.0


@dataclass
class SpectrumData:
    """光谱数据容器"""
    wavelengths: np.ndarray = field(default_factory=lambda: np.array([]))
    intensities: np.ndarray = field(default_factory=lambda: np.array([]))
    wavelengths_calibrated: np.ndarray = field(default_factory=lambda: np.array([]))
    intensities_calibrated: np.ndarray = field(default_factory=lambda: np.array([]))
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "wavelengths": self.wavelengths.tolist(),
            "intensities": self.intensities.tolist(),
            "wavelengths_calibrated": self.wavelengths_calibrated.tolist(),
            "intensities_calibrated": self.intensities_calibrated.tolist(),
            "metadata": self.metadata
        }


class SpectrumGenerator:
    """光谱图谱生成器"""

    def __init__(self):
        self.lines: List[SpectrumLine] = []
        self.background_level: float = 0.05
        self.noise_level: float = 0.02

    def add_emission_line(
        self,
        wavelength_nm: float,
        intensity: float,
        width_nm: float = 0.5
    ) -> None:
        """添加发射谱线"""
        self.lines.append(SpectrumLine(
            wavelength_nm=wavelength_nm,
            intensity=intensity,
            width_nm=width_nm,
            line_type="emission"
        ))

    def add_absorption_line(
        self,
        wavelength_nm: float,
        depth: float,
        width_nm: float = 0.5
    ) -> None:
        """添加吸收谱线"""
        self.lines.append(SpectrumLine(
            wavelength_nm=wavelength_nm,
            intensity=depth,
            width_nm=width_nm,
            line_type="absorption"
        ))

    def clear_lines(self) -> None:
        """清除所有谱线"""
        self.lines.clear()

    def _gaussian_line(
        self,
        wavelengths: np.ndarray,
        center: float,
        amplitude: float,
        sigma: float
    ) -> np.ndarray:
        """生成高斯型谱线"""
        return amplitude * np.exp(-0.5 * ((wavelengths - center) / sigma) ** 2)

    def _lorentzian_line(
        self,
        wavelengths: np.ndarray,
        center: float,
        amplitude: float,
        gamma: float
    ) -> np.ndarray:
        """生成洛伦兹型谱线"""
        return amplitude * (gamma ** 2) / ((wavelengths - center) ** 2 + gamma ** 2)

    def _voigt_line(
        self,
        wavelengths: np.ndarray,
        center: float,
        amplitude: float,
        sigma: float,
        gamma: float
    ) -> np.ndarray:
        """生成Voigt型谱线 (高斯+洛伦兹卷积近似)"""
        gauss = self._gaussian_line(wavelengths, center, 1.0, sigma)
        lorentz = self._lorentzian_line(wavelengths, center, 1.0, gamma)
        return amplitude * (0.5 * gauss + 0.5 * lorentz)

    def set_background(self, level: float) -> None:
        """设置背景光水平"""
        self.background_level = level

    def set_noise(self, level: float) -> None:
        """设置噪声水平"""
        self.noise_level = level

    def generate_white_light_spectrum(
        self,
        wavelengths: np.ndarray,
        color_temp_k: float = 5500.0,
        normalize: bool = True
    ) -> np.ndarray:
        """
        生成白光光谱 (基于黑体辐射近似)
        B(λ, T) = 2hc²/λ⁵ * 1/(e^(hc/λkT) - 1)
        """
        h = 6.626e-34
        c = 299792458.0
        k = 1.3806e-23

        wavelength_m = wavelengths * 1e-9
        exponent = (h * c) / (wavelength_m * k * color_temp_k)

        with np.errstate(over='ignore', invalid='ignore'):
            spectrum = (2.0 * h * c ** 2) / (wavelength_m ** 5) / \
                       (np.exp(np.minimum(exponent, 500)) - 1.0)

        spectrum = np.nan_to_num(spectrum, nan=0.0, posinf=0.0, neginf=0.0)

        if normalize:
            max_val = np.max(spectrum)
            if max_val > 0:
                spectrum = spectrum / max_val

        return spectrum

    def generate_led_spectrum(
        self,
        wavelengths: np.ndarray,
        peak_wavelength_nm: float,
        fwhm_nm: float = 30.0,
        amplitude: float = 1.0
    ) -> np.ndarray:
        """生成LED光谱"""
        sigma = fwhm_nm / (2.0 * np.sqrt(2.0 * np.log(2.0)))
        spectrum = amplitude * np.exp(
            -0.5 * ((wavelengths - peak_wavelength_nm) / sigma) ** 2
        )
        return spectrum

    def generate_laser_spectrum(
        self,
        wavelengths: np.ndarray,
        wavelength_nm: float,
        linewidth_nm: float = 0.001,
        amplitude: float = 1.0
    ) -> np.ndarray:
        """生成激光光谱 (极窄洛伦兹线)"""
        gamma = linewidth_nm / 2.0
        spectrum = amplitude * (gamma ** 2) / \
                   ((wavelengths - wavelength_nm) ** 2 + gamma ** 2)
        return spectrum

    def generate_calibration_spectrum(
        self,
        wavelengths: np.ndarray,
        calibration_lines: List[Tuple[float, float]],
        width_nm: float = 0.1,
        amplitude: float = 1.0
    ) -> np.ndarray:
        """
        生成标定光谱 (已知波长的标定线)
        calibration_lines: [(wavelength, intensity), ...]
        """
        spectrum = np.zeros_like(wavelengths)
        sigma = width_nm / (2.0 * np.sqrt(2.0 * np.log(2.0)))

        for wl, intensity in calibration_lines:
            spectrum += intensity * amplitude * np.exp(
                -0.5 * ((wavelengths - wl) / sigma) ** 2
            )

        return spectrum

    def generate_complete_spectrum(
        self,
        wavelengths: np.ndarray,
        source_type: str = "White_LED",
        apply_optical_transmission: Optional[np.ndarray] = None,
        add_noise: bool = True,
        seed: Optional[int] = None
    ) -> SpectrumData:
        """
        生成完整的光谱数据
        """
        if seed is not None:
            np.random.seed(seed)

        if source_type.upper() in ["WHITE", "WHITE_LED", "WHITELED"]:
            base_spectrum = self.generate_white_light_spectrum(wavelengths, 5500.0)
        elif source_type.upper() == "LASER":
            base_spectrum = np.zeros_like(wavelengths)
        elif source_type.upper() == "LED":
            base_spectrum = self.generate_led_spectrum(wavelengths, 550.0, 40.0)
        else:
            base_spectrum = self.generate_white_light_spectrum(wavelengths, 5500.0)

        for line in self.lines:
            sigma = line.width_nm / (2.0 * np.sqrt(2.0 * np.log(2.0)))
            if line.line_type == "emission":
                base_spectrum += self._gaussian_line(
                    wavelengths, line.wavelength_nm, line.intensity, sigma
                )
            elif line.line_type == "absorption":
                base_spectrum -= self._gaussian_line(
                    wavelengths, line.wavelength_nm, line.intensity, sigma
                )

        base_spectrum += self.background_level

        if apply_optical_transmission is not None:
            base_spectrum = base_spectrum * apply_optical_transmission

        if add_noise and self.noise_level > 0:
            noise = np.random.normal(0, self.noise_level, len(wavelengths))
            base_spectrum = base_spectrum + noise

        base_spectrum = np.clip(base_spectrum, 0.0, None)

        max_val = np.max(base_spectrum)
        if max_val > 0:
            base_spectrum = base_spectrum / max_val

        return SpectrumData(
            wavelengths=wavelengths,
            intensities=base_spectrum,
            wavelengths_calibrated=wavelengths.copy(),
            intensities_calibrated=base_spectrum.copy(),
            metadata={
                "source_type": source_type,
                "noise_level": self.noise_level,
                "background_level": self.background_level,
                "num_lines": len(self.lines)
            }
        )

    def apply_wavelength_calibration(
        self,
        spectrum: SpectrumData,
        calibration_coeffs: Tuple[float, float, float]
    ) -> SpectrumData:
        """
        应用波长标定校正
        λ_calibrated = a * λ² + b * λ + c
        """
        a, b, c = calibration_coeffs
        spectrum.wavelengths_calibrated = (
            a * spectrum.wavelengths ** 2 +
            b * spectrum.wavelengths +
            c
        )
        return spectrum

    def apply_intensity_calibration(
        self,
        spectrum: SpectrumData,
        calibration_factors: np.ndarray
    ) -> SpectrumData:
        """
        应用强度标定校正
        """
        spectrum.intensities_calibrated = spectrum.intensities * calibration_factors
        max_val = np.max(spectrum.intensities_calibrated)
        if max_val > 0:
            spectrum.intensities_calibrated = \
                spectrum.intensities_calibrated / max_val
        return spectrum

    def find_peaks(
        self,
        wavelengths: np.ndarray,
        intensities: np.ndarray,
        min_height: float = 0.1,
        min_distance_nm: float = 5.0
    ) -> List[Dict[str, float]]:
        """
        简单的峰值检测
        """
        peaks = []
        for i in range(1, len(intensities) - 1):
            if (intensities[i] > intensities[i - 1] and
                intensities[i] > intensities[i + 1] and
                intensities[i] >= min_height):

                if peaks:
                    if wavelengths[i] - peaks[-1]["wavelength"] >= min_distance_nm:
                        peaks.append({
                            "wavelength": wavelengths[i],
                            "intensity": intensities[i],
                            "index": i
                        })
                else:
                    peaks.append({
                        "wavelength": wavelengths[i],
                        "intensity": intensities[i],
                        "index": i
                    })

        return peaks

    def interpolate_spectrum(
        self,
        wavelengths: np.ndarray,
        intensities: np.ndarray,
        target_wavelengths: np.ndarray
    ) -> np.ndarray:
        """光谱插值 (重采样)"""
        return np.interp(target_wavelengths, wavelengths, intensities)
