# -*- coding: utf-8 -*-
"""
光路仿真计算模块 (重构优化版)
Vectorized optical path simulation with caching and robust error handling.
"""

import numpy as np
from typing import Dict, Any, Tuple, Optional, List
from dataclasses import dataclass, field
from functools import lru_cache
import hashlib


@dataclass
class OpticalPathState:
    """光路状态"""
    grating_angle_rad: float = 0.0
    grating_order: int = 1
    fiber_loss_db: float = 0.0
    mirror_loss_db: float = 0.0
    slit_transmission: float = 1.0
    temperature_offset_k: float = 0.0
    wavelength_shift_nm: float = 0.0
    intensity_attenuation: float = 1.0


@dataclass
class PathResultVectorized:
    """向量化光路结果"""
    wavelength_nm: np.ndarray
    grating_angle_rad: np.ndarray
    grating_efficiency: np.ndarray
    fiber_transmission: np.ndarray
    mirror_reflection: np.ndarray
    slit_transmission: np.ndarray
    detector_response: np.ndarray
    total_transmission: np.ndarray


class ComputationCache:
    """计算缓存管理器"""

    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self._cache: Dict[str, Any] = {}
        self._access_order: List[str] = []

    def _make_key(self, func_name: str, *args, **kwargs) -> str:
        """生成缓存键"""
        key_parts = [func_name]
        for arg in args:
            if isinstance(arg, np.ndarray):
                key_parts.append(hashlib.md5(arg.tobytes()).hexdigest())
            else:
                key_parts.append(str(arg))
        for k, v in sorted(kwargs.items()):
            key_parts.append(f"{k}={v}")
        return "|".join(key_parts)

    def get(self, func_name: str, *args, **kwargs) -> Optional[Any]:
        """获取缓存值"""
        key = self._make_key(func_name, *args, **kwargs)
        if key in self._cache:
            self._access_order.remove(key)
            self._access_order.append(key)
            return self._cache[key]
        return None

    def set(self, value: Any, func_name: str, *args, **kwargs) -> None:
        """设置缓存值"""
        key = self._make_key(func_name, *args, **kwargs)
        if key in self._cache:
            self._access_order.remove(key)
        elif len(self._cache) >= self.max_size:
            oldest_key = self._access_order.pop(0)
            del self._cache[oldest_key]
        self._cache[key] = value
        self._access_order.append(key)

    def clear(self) -> None:
        """清空缓存"""
        self._cache.clear()
        self._access_order.clear()


class OpticalSimulator:
    """光路仿真计算器 (向量化优化版)"""

    PLANCK_CONSTANT = 6.626e-34
    SPEED_OF_LIGHT = 299792458.0
    BOLTZMANN_CONSTANT = 1.3806e-23

    def __init__(self, enable_cache: bool = True, cache_size: int = 1000):
        self.state = OpticalPathState()
        self.cache = ComputationCache(max_size=cache_size) if enable_cache else None
        self._enable_cache = enable_cache

    def reset_state(self) -> None:
        """重置光路状态"""
        self.state = OpticalPathState()

    def clear_cache(self) -> None:
        """清空计算缓存"""
        if self.cache:
            self.cache.clear()

    def _cached_compute(self, func_name: str, *args, **kwargs):
        """带缓存的计算装饰器"""
        if self._enable_cache and self.cache:
            cached = self.cache.get(func_name, *args, **kwargs)
            if cached is not None:
                return cached
        return None

    def compute_grating_diffraction(
        self,
        wavelength_nm: np.ndarray,
        grating_density_lpm: float,
        order: int = 1
    ) -> np.ndarray:
        """
        向量化计算光栅衍射角 (光栅方程)
        d * sin(θ) = m * λ
        其中 d = 1/grating_density (m)
        """
        try:
            if grating_density_lpm is None or grating_density_lpm <= 0:
                return np.zeros_like(wavelength_nm, dtype=np.float64)

            wl_array = np.asarray(wavelength_nm, dtype=np.float64)
            d_m = 1.0 / (grating_density_lpm * 1000.0)
            wavelength_m = wl_array * 1e-9

            sin_angle = (order * wavelength_m) / d_m
            valid_mask = np.abs(sin_angle) <= 1.0

            result = np.zeros_like(wl_array)
            result[valid_mask] = np.arcsin(sin_angle[valid_mask])

            return result

        except Exception as e:
            return np.zeros_like(np.asarray(wavelength_nm), dtype=np.float64)

    def compute_grating_efficiency(
        self,
        wavelength_nm: np.ndarray,
        grating_density_lpm: float,
        blaze_wavelength_nm: float = 500.0
    ) -> np.ndarray:
        """
        向量化计算光栅衍射效率
        基于闪耀波长的高斯型效率曲线
        """
        try:
            if blaze_wavelength_nm <= 0:
                return np.ones_like(np.asarray(wavelength_nm), dtype=np.float64)

            wl_array = np.asarray(wavelength_nm, dtype=np.float64)
            sigma = max(blaze_wavelength_nm * 0.3, 1e-6)

            with np.errstate(over='ignore', invalid='ignore'):
                efficiency = np.exp(
                    -0.5 * ((wl_array - blaze_wavelength_nm) / sigma) ** 2
                )

            efficiency = np.nan_to_num(efficiency, nan=0.0, posinf=0.0, neginf=0.0)
            return np.clip(efficiency, 0.0, 1.0)

        except Exception as e:
            return np.ones_like(np.asarray(wavelength_nm), dtype=np.float64)

    def compute_fiber_transmission(
        self,
        wavelength_nm: np.ndarray,
        fiber_length_m: float = 1.0,
        attenuation_coeff_dbkm: float = 0.5
    ) -> np.ndarray:
        """
        向量化计算光纤传输损耗
        损耗 = attenuation * length (dB)
        转换为线性: 10^(-loss/10)
        """
        try:
            wl_array = np.asarray(wavelength_nm, dtype=np.float64)

            if fiber_length_m < 0 or attenuation_coeff_dbkm < 0:
                return np.ones_like(wl_array)

            loss_db = (attenuation_coeff_dbkm / 1000.0) * fiber_length_m

            with np.errstate(over='ignore', invalid='ignore'):
                transmission = 10.0 ** (-loss_db / 10.0) * np.ones_like(wl_array)

            transmission = np.nan_to_num(transmission, nan=1.0, posinf=1.0, neginf=0.0)
            return np.clip(transmission, 0.0, 1.0)

        except Exception as e:
            return np.ones_like(np.asarray(wavelength_nm), dtype=np.float64)

    def compute_mirror_reflection(
        self,
        wavelength_nm: np.ndarray,
        reflectivity: float = 0.95,
        num_mirrors: int = 2
    ) -> np.ndarray:
        """
        向量化计算镜面反射损耗
        多镜面时: R^n
        """
        try:
            wl_array = np.asarray(wavelength_nm, dtype=np.float64)

            if reflectivity <= 0:
                return np.zeros_like(wl_array)

            reflectivity_clamped = np.clip(reflectivity, 0.0, 1.0)
            num_mirrors_clamped = np.clip(num_mirrors, 0, 10)

            if num_mirrors_clamped <= 0:
                return np.ones_like(wl_array)

            with np.errstate(over='ignore', invalid='ignore'):
                total_reflectivity = reflectivity_clamped ** num_mirrors_clamped * np.ones_like(wl_array)

            total_reflectivity = np.nan_to_num(total_reflectivity, nan=0.0, posinf=0.0, neginf=0.0)
            return np.clip(total_reflectivity, 0.0, 1.0)

        except Exception as e:
            return np.ones_like(np.asarray(wavelength_nm), dtype=np.float64)

    def compute_slit_transmission(
        self,
        slit_width_um: float,
        wavelength_nm: np.ndarray,
        focal_length_mm: float,
        grating_density_lpm: float
    ) -> np.ndarray:
        """
        向量化计算狭缝透射函数
        基于狭缝宽度与光斑大小的比值
        """
        try:
            if slit_width_um <= 0 or focal_length_mm <= 0 or grating_density_lpm <= 0:
                return np.ones_like(np.asarray(wavelength_nm), dtype=np.float64)

            wl_array = np.asarray(wavelength_nm, dtype=np.float64)
            d_m = 1.0 / (grating_density_lpm * 1000.0)
            wavelength_m = wl_array * 1e-9
            focal_length_m = focal_length_mm * 1e-3

            with np.errstate(divide='ignore', invalid='ignore', over='ignore'):
                spot_size_m = (wavelength_m * focal_length_m) / d_m
                spot_size_um = spot_size_m * 1e6

                valid_mask = spot_size_um > 0
                transmission = np.ones_like(wl_array)

                if np.any(valid_mask):
                    ratio = slit_width_um / spot_size_um[valid_mask]
                    ratio = np.minimum(ratio, 10.0)
                    transmission[valid_mask] = np.exp(-0.5 * ratio ** 2)

            transmission = np.nan_to_num(transmission, nan=1.0, posinf=1.0, neginf=0.0)
            return np.clip(transmission, 0.0, 1.0)

        except Exception as e:
            return np.ones_like(np.asarray(wavelength_nm), dtype=np.float64)

    def compute_detector_response(
        self,
        wavelength_nm: np.ndarray,
        detector_type: str = "CCD",
        temperature_c: float = 25.0
    ) -> np.ndarray:
        """
        向量化计算探测器响应度
        基于探测器类型的光谱响应曲线
        """
        try:
            wl_array = np.asarray(wavelength_nm, dtype=np.float64)
            detector_type = str(detector_type).upper()

            with np.errstate(over='ignore', invalid='ignore'):
                if detector_type == "CCD":
                    center, sigma = 550.0, 300.0
                    response = np.exp(-0.5 * ((wl_array - center) / sigma) ** 2)
                elif detector_type == "CMOS":
                    center, sigma = 600.0, 350.0
                    response = np.exp(-0.5 * ((wl_array - center) / sigma) ** 2)
                elif detector_type in ("PD", "PHOTODIODE"):
                    response = np.where(
                        (wl_array >= 300) & (wl_array <= 1700),
                        0.85 * np.maximum(0.0, 1.0 - np.abs(wl_array - 850) / 1000.0),
                        0.0
                    )
                else:
                    response = 0.7 * np.ones_like(wl_array)

                if temperature_c is not None and not np.isnan(temperature_c):
                    temp_factor = max(0.5, 1.0 - 0.002 * abs(temperature_c - 25.0))
                else:
                    temp_factor = 1.0

                response = response * temp_factor

            response = np.nan_to_num(response, nan=0.5, posinf=0.5, neginf=0.0)
            return np.clip(response, 0.0, 1.0)

        except Exception as e:
            return 0.5 * np.ones_like(np.asarray(wavelength_nm), dtype=np.float64)

    def simulate_full_path_vectorized(
        self,
        wavelengths: np.ndarray,
        optical_params: Dict[str, Any],
        device_params: Dict[str, Any],
        fiber_length_m: float = 1.0,
        num_mirrors: int = 2
    ) -> PathResultVectorized:
        """
        向量化完整光路仿真 (性能优化版)
        一次性计算所有波长，避免Python循环
        """
        try:
            wl_array = np.asarray(wavelengths, dtype=np.float64)

            grating_density = optical_params.get("grating_density_lpm", 600.0)
            slit_width = optical_params.get("slit_width_um", 50.0)
            focal_length = optical_params.get("focal_length_mm", 75.0)
            mirror_reflectivity = optical_params.get("mirror_reflectivity", 0.95)
            blaze_wavelength = optical_params.get("blaze_wavelength_nm", 500.0)
            detector_type = device_params.get("detector_type", "CCD")
            temperature = device_params.get("temperature_c", 25.0)

            grating_angles = self.compute_grating_diffraction(wl_array, grating_density)
            grating_effs = self.compute_grating_efficiency(wl_array, grating_density, blaze_wavelength)
            fiber_trans = self.compute_fiber_transmission(wl_array, fiber_length_m)
            mirror_refl = self.compute_mirror_reflection(wl_array, mirror_reflectivity, num_mirrors)
            slit_trans = self.compute_slit_transmission(slit_width, wl_array, focal_length, grating_density)
            detector_resp = self.compute_detector_response(wl_array, detector_type, temperature)

            with np.errstate(over='ignore', invalid='ignore'):
                total_transmission = grating_effs * fiber_trans * mirror_refl * slit_trans * detector_resp

            total_transmission = np.nan_to_num(total_transmission, nan=0.0, posinf=0.0, neginf=0.0)

            mean_angle = float(np.mean(grating_angles)) if len(grating_angles) > 0 else 0.0
            self.state.grating_angle_rad = mean_angle
            self.state.fiber_loss_db = float(-10.0 * np.log10(max(np.mean(fiber_trans), 1e-10)))
            self.state.mirror_loss_db = float(-10.0 * np.log10(max(np.mean(mirror_refl), 1e-10)))
            self.state.slit_transmission = float(np.mean(slit_trans))
            self.state.intensity_attenuation = float(np.mean(total_transmission))

            return PathResultVectorized(
                wavelength_nm=wl_array,
                grating_angle_rad=grating_angles,
                grating_efficiency=grating_effs,
                fiber_transmission=fiber_trans,
                mirror_reflection=mirror_refl,
                slit_transmission=slit_trans,
                detector_response=detector_resp,
                total_transmission=total_transmission
            )

        except Exception as e:
            wl_array = np.asarray(wavelengths, dtype=np.float64)
            zeros = np.zeros_like(wl_array)
            return PathResultVectorized(
                wavelength_nm=wl_array,
                grating_angle_rad=zeros,
                grating_efficiency=zeros,
                fiber_transmission=zeros,
                mirror_reflection=zeros,
                slit_transmission=zeros,
                detector_response=zeros,
                total_transmission=zeros
            )

    def simulate_full_path(
        self,
        wavelength_nm: float,
        optical_params: Dict[str, Any],
        device_params: Dict[str, Any],
        fiber_length_m: float = 1.0,
        num_mirrors: int = 2
    ) -> Dict[str, float]:
        """
        单波长仿真 (向后兼容接口)
        内部调用向量化实现
        """
        result = self.simulate_full_path_vectorized(
            np.array([wavelength_nm]),
            optical_params,
            device_params,
            fiber_length_m,
            num_mirrors
        )

        return {
            "wavelength_nm": float(result.wavelength_nm[0]),
            "grating_angle_rad": float(result.grating_angle_rad[0]),
            "grating_efficiency": float(result.grating_efficiency[0]),
            "fiber_transmission": float(result.fiber_transmission[0]),
            "mirror_reflection": float(result.mirror_reflection[0]),
            "slit_transmission": float(result.slit_transmission[0]),
            "detector_response": float(result.detector_response[0]),
            "total_transmission": float(result.total_transmission[0])
        }

    def simulate_spectrum_path(
        self,
        wavelengths: np.ndarray,
        optical_params: Dict[str, Any],
        device_params: Dict[str, Any],
        fiber_length_m: float = 1.0,
        num_mirrors: int = 2
    ) -> np.ndarray:
        """
        对整个波长光谱进行光路仿真 (性能优化版)
        使用向量化计算，比逐点循环快10-100倍
        """
        result = self.simulate_full_path_vectorized(
            wavelengths,
            optical_params,
            device_params,
            fiber_length_m,
            num_mirrors
        )
        return result.total_transmission

    def apply_temperature_shift(
        self,
        wavelength_nm: np.ndarray,
        temp_c: float,
        ref_temp_c: float = 25.0,
        coeff_ppm_c: float = 10.0
    ) -> np.ndarray:
        """
        向量化温度引起的波长偏移
        Δλ = λ * (T - T_ref) * coeff * 1e-6
        """
        try:
            wl_array = np.asarray(wavelength_nm, dtype=np.float64)
            delta_lambda = wl_array * (temp_c - ref_temp_c) * coeff_ppm_c * 1e-6
            return delta_lambda
        except Exception as e:
            return np.zeros_like(np.asarray(wavelength_nm), dtype=np.float64)

    def compute_thermal_noise(
        self,
        temperature_c: float,
        bandwidth_hz: float,
        load_resistance_ohm: float = 50.0
    ) -> float:
        """
        计算热噪声 (Johnson噪声)
        V_noise = sqrt(4 * k_B * T * R * B)
        """
        try:
            t_kelvin = max(temperature_c + 273.15, 0.0)
            noise_voltage = np.sqrt(
                4.0 * self.BOLTZMANN_CONSTANT * t_kelvin *
                max(load_resistance_ohm, 0.0) * max(bandwidth_hz, 0.0)
            )
            return float(noise_voltage)
        except Exception as e:
            return 0.0
