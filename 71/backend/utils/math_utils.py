# -*- coding: utf-8 -*-
"""
工具函数模块
Utility functions for mathematical operations and data processing.
"""

import numpy as np
from typing import Tuple, List, Optional
from scipy.signal import savgol_filter, find_peaks


def gaussian(x: np.ndarray, center: float, amplitude: float, sigma: float) -> np.ndarray:
    """高斯函数"""
    return amplitude * np.exp(-0.5 * ((x - center) / sigma) ** 2)


def lorentzian(x: np.ndarray, center: float, amplitude: float, gamma: float) -> np.ndarray:
    """洛伦兹函数"""
    return amplitude * (gamma ** 2) / ((x - center) ** 2 + gamma ** 2)


def voigt(x: np.ndarray, center: float, amplitude: float, sigma: float, gamma: float) -> np.ndarray:
    """Voigt函数 (高斯与洛伦兹的近似卷积)"""
    g = gaussian(x, center, 1.0, sigma)
    l = lorentzian(x, center, 1.0, gamma)
    return amplitude * (0.5 * g + 0.5 * l)


def fwhm_to_sigma(fwhm: float) -> float:
    """FWHM 转高斯 sigma"""
    return fwhm / (2.0 * np.sqrt(2.0 * np.log(2.0)))


def sigma_to_fwhm(sigma: float) -> float:
    """高斯 sigma 转 FWHM"""
    return sigma * 2.0 * np.sqrt(2.0 * np.log(2.0))


def snr(signal: np.ndarray, noise: Optional[np.ndarray] = None) -> float:
    """计算信噪比"""
    if noise is None:
        signal_mean = np.mean(signal)
        noise_std = np.std(signal)
    else:
        signal_mean = np.mean(signal)
        noise_std = np.std(noise)
    return float(signal_mean / max(noise_std, 1e-10))


def smooth_spectrum(
    wavelengths: np.ndarray,
    intensities: np.ndarray,
    window_length: int = 11,
    polyorder: int = 3
) -> np.ndarray:
    """平滑光谱 (Savitzky-Golay)"""
    if window_length % 2 == 0:
        window_length += 1
    if len(intensities) < window_length:
        return intensities.copy()
    return savgol_filter(intensities, window_length, polyorder)


def normalize_spectrum(intensities: np.ndarray) -> np.ndarray:
    """归一化光谱到 [0, 1]"""
    max_val = np.max(intensities)
    if max_val <= 0:
        return intensities.copy()
    return intensities / max_val


def baseline_correction(
    wavelengths: np.ndarray,
    intensities: np.ndarray,
    method: str = "asymmetric_least_squares"
) -> np.ndarray:
    """基线校正"""
    if method == "asymmetric_least_squares":
        return _asls_baseline(intensities)
    elif method == "polyfit":
        return _polyfit_baseline(wavelengths, intensities)
    elif method == "min":
        return _min_baseline(intensities)
    else:
        return _asls_baseline(intensities)


def _asls_baseline(
    intensities: np.ndarray,
    lam: float = 1e6,
    p: float = 0.01,
    max_iter: int = 10
) -> np.ndarray:
    """非对称最小二乘基线校正"""
    L = len(intensities)
    D = np.diff(np.eye(L), 2)
    H = lam * D.T @ D
    w = np.ones(L)

    for _ in range(max_iter):
        W = np.diag(w)
        Z = np.linalg.solve(W + H, w * intensities)
        w_new = np.where(intensities > Z, p, 1 - p)
        if np.allclose(w, w_new):
            break
        w = w_new

    return intensities - Z


def _polyfit_baseline(
    wavelengths: np.ndarray,
    intensities: np.ndarray,
    degree: int = 3
) -> np.ndarray:
    """多项式拟合基线校正"""
    coeffs = np.polyfit(wavelengths, intensities, degree)
    baseline = np.polyval(coeffs, wavelengths)
    return intensities - baseline


def _min_baseline(intensities: np.ndarray, window: int = 50) -> np.ndarray:
    """最小值基线校正"""
    baseline = np.minimum.accumulate(intensities)
    for i in range(len(intensities)):
        start = max(0, i - window // 2)
        end = min(len(intensities), i + window // 2)
        baseline[i] = np.min(intensities[start:end])
    return intensities - baseline


def detect_peaks(
    wavelengths: np.ndarray,
    intensities: np.ndarray,
    min_height: float = 0.1,
    min_distance: int = 10,
    min_prominence: float = 0.05
) -> Tuple[np.ndarray, np.ndarray]:
    """峰值检测"""
    normalized = normalize_spectrum(intensities)
    peaks, properties = find_peaks(
        normalized,
        height=min_height,
        distance=min_distance,
        prominence=min_prominence
    )
    return wavelengths[peaks], intensities[peaks]


def interpolate_1d(
    x: np.ndarray,
    y: np.ndarray,
    x_new: np.ndarray
) -> np.ndarray:
    """一维线性插值"""
    return np.interp(x_new, x, y)


def resample_spectrum(
    wavelengths: np.ndarray,
    intensities: np.ndarray,
    new_wavelengths: np.ndarray
) -> np.ndarray:
    """重采样光谱到新波长网格"""
    return interpolate_1d(wavelengths, intensities, new_wavelengths)


def compute_derivative(
    x: np.ndarray,
    y: np.ndarray,
    order: int = 1
) -> np.ndarray:
    """计算光谱导数"""
    if order == 1:
        return np.gradient(y, x)
    elif order == 2:
        dy = np.gradient(y, x)
        return np.gradient(dy, x)
    else:
        return np.gradient(y, x, edge_order=min(order, 2))


def blackbody_spectrum(
    wavelengths_nm: np.ndarray,
    temperature_k: float
) -> np.ndarray:
    """黑体辐射光谱"""
    h = 6.626e-34
    c = 299792458.0
    k = 1.3806e-23

    wavelength_m = wavelengths_nm * 1e-9
    exponent = (h * c) / (wavelength_m * k * temperature_k)

    with np.errstate(over='ignore', invalid='ignore'):
        spectrum = (2.0 * h * c ** 2) / (wavelength_m ** 5) / \
                   (np.exp(np.minimum(exponent, 500)) - 1.0)

    return np.nan_to_num(spectrum, nan=0.0, posinf=0.0, neginf=0.0)


def wavelength_to_frequency(wavelength_nm: float) -> float:
    """波长(nm)转频率(Hz)"""
    return 299792458.0 / (wavelength_nm * 1e-9)


def wavelength_to_energy(wavelength_nm: float) -> float:
    """波长(nm)转能量(eV)"""
    h = 4.13566733e-15
    c = 299792458.0
    return h * c / (wavelength_nm * 1e-9)


def frequency_to_wavelength(frequency_hz: float) -> float:
    """频率(Hz)转波长(nm)"""
    return 299792458.0 / frequency_hz * 1e9


def energy_to_wavelength(energy_ev: float) -> float:
    """能量(eV)转波长(nm)"""
    h = 4.13566733e-15
    c = 299792458.0
    return h * c / energy_ev * 1e9


def wavelength_to_wavenumber(wavelength_nm: float) -> float:
    """波长(nm)转波数(cm⁻¹)"""
    return 1.0e7 / wavelength_nm


def wavenumber_to_wavelength(wavenumber_cm: float) -> float:
    """波数(cm⁻¹)转波长(nm)"""
    return 1.0e7 / wavenumber_cm
