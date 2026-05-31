import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass, field
from scipy import signal
from scipy.ndimage import gaussian_filter1d

from utils import setup_logger
from data_parser import OceanObservation

logger = setup_logger("profile_analyzer")


@dataclass
class GradientAnalysisResult:
    station_id: str
    depth: np.ndarray
    temperature: np.ndarray
    salinity: np.ndarray
    temperature_gradient: np.ndarray
    salinity_gradient: np.ndarray
    buoyancy_frequency: Optional[np.ndarray] = None
    density: Optional[np.ndarray] = None
    mixed_layer_depth: float = np.nan
    thermocline_depth: float = np.nan
    halocline_depth: float = np.nan
    pycnocline_depth: float = np.nan
    thermocline_strength: float = np.nan
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "station_id": self.station_id,
            "mixed_layer_depth": float(self.mixed_layer_depth),
            "thermocline_depth": float(self.thermocline_depth),
            "halocline_depth": float(self.halocline_depth),
            "pycnocline_depth": float(self.pycnocline_depth),
            "thermocline_strength": float(self.thermocline_strength),
            "metadata": self.metadata,
        }


@dataclass
class WaterMass:
    name: str
    depth_range: Tuple[float, float]
    temperature_range: Tuple[float, float]
    salinity_range: Tuple[float, float]
    density_range: Optional[Tuple[float, float]] = None
    color: str = "#1f77b4"


class ProfileAnalyzer:
    STANDARD_WATER_MASSES = [
        WaterMass("Surface Mixed Layer", (0, 100), (15, 30), (32, 36), color="#ff7f0e"),
        WaterMass("Thermocline", (100, 1000), (8, 20), (34, 35.5), color="#2ca02c"),
        WaterMass("Intermediate Water", (1000, 2000), (4, 10), (34.5, 35), color="#d62728"),
        WaterMass("Deep Water", (2000, 4000), (2, 6), (34.6, 34.9), color="#9467bd"),
        WaterMass("Bottom Water", (4000, 11000), (-1, 4), (34.6, 34.8), color="#8c564b"),
    ]

    def __init__(self, smooth_sigma: float = 2.0, gradient_method: str = "central"):
        self.smooth_sigma = smooth_sigma
        self.gradient_method = gradient_method

    @staticmethod
    def calculate_density(temperature: np.ndarray, salinity: np.ndarray, pressure: np.ndarray) -> np.ndarray:
        S = salinity
        T = temperature
        P = pressure / 10.0

        a0 = 999.842594
        a1 = 0.06793953
        a2 = -0.009095290
        a3 = 0.0001001685
        a4 = -0.000001120083
        a5 = 0.000000006536332

        b0 = 0.824493
        b1 = -0.0040899
        b2 = 0.000076438
        b3 = -0.00000082467
        b4 = 0.0000000053875

        c0 = -0.00572466
        c1 = 0.00010227
        c2 = -0.0000016546

        d0 = 0.00048314

        rho_w = a0 + a1*T + a2*T**2 + a3*T**3 + a4*T**4 + a5*T**5

        rho = (rho_w + (b0 + b1*T + b2*T**2 + b3*T**3 + b4*T**4) * S +
               (c0 + c1*T + c2*T**2) * S**1.5 + d0 * S**2)

        K0 = 19652.21 + 148.4206*T - 2.327105*T**2 + 0.01360477*T**3 - 0.00005155288*T**4
        K1 = 54.6746 - 0.603459*T + 0.0109987*T**2 - 0.000061670*T**3
        K2 = 0.07944 - 0.0016493*T + 0.00002102*T**2

        B0 = 0.00028
        B1 = 0.00000256
        B2 = -0.0000000227

        A0 = 0.00000143713
        A1 = -0.000000116092
        A2 = 0.000000000577885

        K = K0 + K1*S + K2*S**1.5
        B = B0 + B1*T + B2*T**2
        A = A0 + A1*T + A2*T**2

        rho_p = rho * (1 + P / (K + A*P + B*P**2))

        return rho_p

    @staticmethod
    def calculate_buoyancy_frequency(
        depth: np.ndarray,
        density: np.ndarray,
        g: float = 9.81,
        rho0: float = 1025.0
    ) -> np.ndarray:
        rho_smooth = gaussian_filter1d(density, sigma=1.0)
        drho_dz = np.gradient(rho_smooth, depth)
        N2 = -g / rho0 * drho_dz
        N = np.sqrt(np.maximum(N2, 0))
        return N

    def _calculate_gradient(self, values: np.ndarray, depth: np.ndarray) -> np.ndarray:
        if self.gradient_method == "central":
            return np.gradient(values, depth, edge_order=2)
        elif self.gradient_method == "forward":
            grad = np.diff(values) / np.diff(depth)
            return np.concatenate([[grad[0]], grad])
        elif self.gradient_method == "savitzky_golay":
            window_length = min(7, len(values) // 2 * 2 + 1)
            if window_length < 3:
                return np.gradient(values, depth, edge_order=2)
            return signal.savgol_filter(values, window_length, 2, deriv=1, delta=np.mean(np.diff(depth)))
        else:
            return np.gradient(values, depth)

    def analyze_profile(
        self,
        observation: OceanObservation,
        calculate_density: bool = True,
        calculate_buoyancy: bool = True
    ) -> GradientAnalysisResult:
        depth = observation.depth
        temp = observation.temperature
        sal = observation.salinity

        sort_idx = np.argsort(depth)
        depth_sorted = depth[sort_idx]
        temp_sorted = temp[sort_idx]
        sal_sorted = sal[sort_idx]

        temp_smooth = gaussian_filter1d(temp_sorted, sigma=self.smooth_sigma)
        sal_smooth = gaussian_filter1d(sal_sorted, sigma=self.smooth_sigma)

        dT_dz = self._calculate_gradient(temp_smooth, depth_sorted)
        dS_dz = self._calculate_gradient(sal_smooth, depth_sorted)

        density = None
        N2 = None

        if calculate_density:
            pressure = observation.pressure if observation.pressure is not None else depth_sorted * 0.1
            density = self.calculate_density(temp_smooth, sal_smooth, pressure)

        if calculate_buoyancy and density is not None:
            N2 = self.calculate_buoyancy_frequency(depth_sorted, density)

        mld = self._find_mixed_layer_depth(depth_sorted, temp_smooth)
        thermocline_depth, thermocline_strength = self._find_thermocline(depth_sorted, dT_dz)
        halocline_depth = self._find_halocline(depth_sorted, dS_dz)

        pycnocline_depth = np.nan
        if density is not None:
            drho_dz = self._calculate_gradient(density, depth_sorted)
            pycnocline_depth = self._find_pycnocline(depth_sorted, drho_dz)

        result = GradientAnalysisResult(
            station_id=observation.station_id,
            depth=depth_sorted,
            temperature=temp_smooth,
            salinity=sal_smooth,
            temperature_gradient=dT_dz,
            salinity_gradient=dS_dz,
            buoyancy_frequency=N2,
            density=density,
            mixed_layer_depth=mld,
            thermocline_depth=thermocline_depth,
            halocline_depth=halocline_depth,
            pycnocline_depth=pycnocline_depth,
            thermocline_strength=thermocline_strength,
            metadata={
                "n_points": len(depth),
                "depth_range": [float(np.min(depth)), float(np.max(depth))],
                "smooth_sigma": self.smooth_sigma,
                "gradient_method": self.gradient_method
            }
        )

        logger.debug(
            f"Profile analysis for {observation.station_id}: "
            f"MLD={mld:.1f}m, Thermocline={thermocline_depth:.1f}m"
        )

        return result

    @staticmethod
    def _find_mixed_layer_depth(
        depth: np.ndarray,
        temperature: np.ndarray,
        threshold: float = 0.5,
        reference_depth: float = 10.0
    ) -> float:
        ref_idx = np.argmin(np.abs(depth - reference_depth))
        if ref_idx >= len(temperature):
            return np.nan

        ref_temp = temperature[ref_idx]
        temp_diff = np.abs(temperature - ref_temp)

        mld_idx = np.where(temp_diff > threshold)[0]
        if len(mld_idx) > 0:
            mld_idx = mld_idx[0]
            if mld_idx > 0:
                d1, d2 = depth[mld_idx-1], depth[mld_idx]
                t1, t2 = temp_diff[mld_idx-1], temp_diff[mld_idx]
                alpha = (threshold - t1) / (t2 - t1) if t2 != t1 else 0.5
                return d1 + alpha * (d2 - d1)
            return float(depth[mld_idx])

        return float(np.max(depth))

    @staticmethod
    def _find_thermocline(
        depth: np.ndarray,
        dT_dz: np.ndarray,
        min_depth: float = 50.0,
        max_depth: float = 1000.0
    ) -> Tuple[float, float]:
        mask = (depth >= min_depth) & (depth <= max_depth)
        if not np.any(mask):
            return np.nan, np.nan

        masked_depth = depth[mask]
        masked_grad = dT_dz[mask]

        if len(masked_grad) == 0:
            return np.nan, np.nan

        min_grad_idx = np.argmin(masked_grad)
        thermocline_depth = float(masked_depth[min_grad_idx])
        strength = float(np.abs(masked_grad[min_grad_idx]))

        return thermocline_depth, strength

    @staticmethod
    def _find_halocline(
        depth: np.ndarray,
        dS_dz: np.ndarray,
        min_depth: float = 50.0,
        max_depth: float = 1000.0
    ) -> float:
        mask = (depth >= min_depth) & (depth <= max_depth)
        if not np.any(mask):
            return np.nan

        masked_depth = depth[mask]
        masked_grad = np.abs(dS_dz[mask])

        if len(masked_grad) == 0:
            return np.nan

        max_grad_idx = np.argmax(masked_grad)
        return float(masked_depth[max_grad_idx])

    @staticmethod
    def _find_pycnocline(
        depth: np.ndarray,
        drho_dz: np.ndarray,
        min_depth: float = 50.0,
        max_depth: float = 1000.0
    ) -> float:
        mask = (depth >= min_depth) & (depth <= max_depth)
        if not np.any(mask):
            return np.nan

        masked_depth = depth[mask]
        masked_grad = drho_dz[mask]

        if len(masked_grad) == 0:
            return np.nan

        max_grad_idx = np.argmax(masked_grad)
        return float(masked_depth[max_grad_idx])

    def classify_water_masses(
        self,
        depth: np.ndarray,
        temperature: np.ndarray,
        salinity: np.ndarray,
        water_masses: Optional[List[WaterMass]] = None
    ) -> np.ndarray:
        water_masses = water_masses or self.STANDARD_WATER_MASSES
        classifications = np.array(["Unknown"] * len(depth), dtype=object)

        for i, z in enumerate(depth):
            T, S = temperature[i], salinity[i]
            for wm in water_masses:
                if (wm.depth_range[0] <= z <= wm.depth_range[1] and
                    wm.temperature_range[0] <= T <= wm.temperature_range[1] and
                    wm.salinity_range[0] <= S <= wm.salinity_range[1]):
                    classifications[i] = wm.name
                    break

        return classifications

    def t_s_diagram_properties(
        self,
        temperature: np.ndarray,
        salinity: np.ndarray
    ) -> Dict[str, Any]:
        valid_mask = ~np.isnan(temperature) & ~np.isnan(salinity)
        T = temperature[valid_mask]
        S = salinity[valid_mask]

        if len(T) < 2:
            return {}

        correlation = np.corrcoef(T, S)[0, 1] if len(T) > 1 else 0

        return {
            "correlation": float(correlation),
            "t_std": float(np.std(T)),
            "s_std": float(np.std(S)),
            "t_skew": float((np.mean(T) - np.median(T)) / np.std(T)) if np.std(T) > 0 else 0,
            "s_skew": float((np.mean(S) - np.median(S)) / np.std(S)) if np.std(S) > 0 else 0,
        }

    def batch_analyze(
        self,
        observations: List[OceanObservation]
    ) -> List[GradientAnalysisResult]:
        results = []
        for obs in observations:
            try:
                result = self.analyze_profile(obs)
                results.append(result)
            except Exception as e:
                logger.warning(f"Failed to analyze profile {obs.station_id}: {e}")
        return results


class ProfileComparator:
    @staticmethod
    def compare_profiles(
        result1: GradientAnalysisResult,
        result2: GradientAnalysisResult,
        interp_depths: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        if interp_depths is None:
            min_depth = max(np.min(result1.depth), np.min(result2.depth))
            max_depth = min(np.max(result1.depth), np.max(result2.depth))
            interp_depths = np.linspace(min_depth, max_depth, 100)

        temp1_interp = np.interp(interp_depths, result1.depth, result1.temperature)
        temp2_interp = np.interp(interp_depths, result2.depth, result2.temperature)
        sal1_interp = np.interp(interp_depths, result1.depth, result1.salinity)
        sal2_interp = np.interp(interp_depths, result2.depth, result2.salinity)

        temp_rmse = np.sqrt(np.mean((temp1_interp - temp2_interp) ** 2))
        sal_rmse = np.sqrt(np.mean((sal1_interp - sal2_interp) ** 2))
        temp_correlation = np.corrcoef(temp1_interp, temp2_interp)[0, 1]
        sal_correlation = np.corrcoef(sal1_interp, sal2_interp)[0, 1]

        return {
            "temperature_rmse": float(temp_rmse),
            "salinity_rmse": float(sal_rmse),
            "temperature_correlation": float(temp_correlation),
            "salinity_correlation": float(sal_correlation),
            "mld_difference": float(np.abs(result1.mixed_layer_depth - result2.mixed_layer_depth)),
            "thermocline_depth_difference": float(np.abs(result1.thermocline_depth - result2.thermocline_depth)),
        }
