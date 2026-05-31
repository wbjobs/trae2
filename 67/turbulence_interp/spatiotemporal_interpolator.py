import logging
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple, Union
from abc import ABC, abstractmethod
from functools import partial

import numpy as np
import pandas as pd
import xarray as xr
from scipy import interpolate, signal
from scipy.spatial import KDTree
from scipy.ndimage import gaussian_filter
from scipy.spatial.distance import cdist

logger = logging.getLogger(__name__)


@dataclass
class InterpolationConfig:
    spatial_method: str = "idw_fast"
    temporal_method: str = "linear"
    noise_reduction: Optional[str] = None
    grid_resolution: float = 0.1
    search_radius: float = 5.0
    power: float = 2.0
    smooth: float = 0.1
    num_neighbors: int = 12
    use_vectorized: bool = True
    kriging_variogram_model: str = "spherical"
    kriging_nugget: float = 0.1
    kriging_sill: float = 1.0
    kriging_range: float = 10.0


@dataclass
class InterpolationResult:
    dataset: xr.Dataset
    method: str
    uncertainty: Optional[xr.DataArray] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class NoiseReducer(ABC):
    @abstractmethod
    def reduce(self, data: np.ndarray, **kwargs) -> np.ndarray:
        pass


class WaveletDenoiser(NoiseReducer):
    def reduce(self, data: np.ndarray, wavelet: str = "db4", level: int = 3, **kwargs) -> np.ndarray:
        try:
            import pywt
        except ImportError:
            logger.warning("PyWavelets not available, using simple moving average instead")
            return self._moving_average(data)
        
        if data.ndim == 1:
            coeffs = pywt.wavedec(data, wavelet, level=level)
            sigma = np.median(np.abs(coeffs[-1])) / 0.6745
            uthresh = sigma * np.sqrt(2 * np.log(len(data)))
            coeffs[1:] = [pywt.threshold(c, uthresh, "soft") for c in coeffs[1:]]
            return pywt.waverec(coeffs, wavelet)[:len(data)]
        else:
            result = np.empty_like(data)
            for i in range(data.shape[0]):
                result[i] = self.reduce(data[i], wavelet=wavelet, level=level)
            return result

    def _moving_average(self, data: np.ndarray, window: int = 5) -> np.ndarray:
        kernel = np.ones(window) / window
        if data.ndim == 1:
            return np.convolve(data, kernel, mode="same")
        else:
            result = np.empty_like(data)
            for i in range(data.shape[0]):
                result[i] = np.convolve(data[i], kernel, mode="same")
            return result


class GaussianFilter(NoiseReducer):
    def reduce(self, data: np.ndarray, sigma: float = 1.0, **kwargs) -> np.ndarray:
        return gaussian_filter(data, sigma=sigma)


class SavitzkyGolayFilter(NoiseReducer):
    def reduce(self, data: np.ndarray, window_length: int = 11, polyorder: int = 3, **kwargs) -> np.ndarray:
        if data.ndim == 1:
            return signal.savgol_filter(data, window_length, polyorder)
        else:
            result = np.empty_like(data)
            for i in range(data.shape[0]):
                result[i] = signal.savgol_filter(data[i], window_length, polyorder)
            return result


class KalmanFilter(NoiseReducer):
    def reduce(self, data: np.ndarray, process_noise: float = 1e-3, measurement_noise: float = 1e-2, **kwargs) -> np.ndarray:
        n = len(data) if data.ndim == 1 else data.shape[1]
        
        if data.ndim == 1:
            return self._kalman_1d(data, process_noise, measurement_noise)
        else:
            result = np.empty_like(data)
            for i in range(data.shape[0]):
                result[i] = self._kalman_1d(data[i], process_noise, measurement_noise)
            return result

    def _kalman_1d(self, data: np.ndarray, Q: float, R: float) -> np.ndarray:
        n = len(data)
        x = np.zeros(n)
        P = np.zeros(n)
        x[0] = data[0]
        P[0] = 1.0
        
        for k in range(1, n):
            x_pred = x[k-1]
            P_pred = P[k-1] + Q
            K = P_pred / (P_pred + R)
            x[k] = x_pred + K * (data[k] - x_pred)
            P[k] = (1 - K) * P_pred
        
        return x


class SpatialInterpolator(ABC):
    @abstractmethod
    def interpolate(self, points: np.ndarray, values: np.ndarray, grid: np.ndarray, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        pass


class FastIDWInterpolator(SpatialInterpolator):
    def interpolate(self, points: np.ndarray, values: np.ndarray, grid: np.ndarray,
                    power: float = 2.0, num_neighbors: int = 12, 
                    search_radius: Optional[float] = None, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        tree = KDTree(points)
        grid_flat = grid.reshape(-1, grid.shape[-1])
        
        if search_radius is not None:
            distances, indices = tree.query(
                grid_flat, k=min(num_neighbors, len(points)),
                distance_upper_bound=search_radius
            )
        else:
            distances, indices = tree.query(
                grid_flat, k=min(num_neighbors, len(points))
            )
        
        values_neighbors = values[indices]
        
        distances_safe = np.where(distances < 1e-10, 1e-10, distances)
        weights = 1.0 / (distances_safe ** power)
        
        valid_mask = distances < np.inf
        weights = np.where(valid_mask, weights, 0.0)
        values_neighbors = np.where(valid_mask, values_neighbors, 0.0)
        
        weights_sum = np.sum(weights, axis=1, keepdims=True)
        weights_sum_safe = np.where(weights_sum < 1e-10, 1e-10, weights_sum)
        weights_normalized = weights / weights_sum_safe
        
        result_flat = np.sum(weights_normalized * values_neighbors, axis=1)
        result = result_flat.reshape(grid.shape[:-1])
        
        no_data_mask = weights_sum.flatten() < 1e-10
        if no_data_mask.any():
            result_flat[no_data_mask] = np.nan
            result = result_flat.reshape(grid.shape[:-1])
        
        uncertainty = None
        if np.any(valid_mask):
            weighted_var = np.sum(
                weights_normalized * (values_neighbors - result_flat[:, np.newaxis])**2,
                axis=1
            )
            uncertainty = np.sqrt(weighted_var).reshape(grid.shape[:-1])
        
        return result, uncertainty


class IDWInterpolator(SpatialInterpolator):
    def interpolate(self, points: np.ndarray, values: np.ndarray, grid: np.ndarray,
                    power: float = 2.0, search_radius: Optional[float] = None, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        tree = KDTree(points)
        result = np.zeros(grid.shape[:-1])
        
        if search_radius is not None:
            for idx in np.ndindex(grid.shape[:-1]):
                query_point = grid[idx]
                distances, indices = tree.query(query_point, k=min(10, len(points)), distance_upper_bound=search_radius)
                valid = distances < np.inf
                if valid.sum() == 0:
                    result[idx] = np.nan
                    continue
                weights = 1.0 / (distances[valid] ** power + 1e-10)
                weights /= weights.sum()
                result[idx] = np.sum(weights * values[indices[valid]])
        else:
            for idx in np.ndindex(grid.shape[:-1]):
                query_point = grid[idx]
                distances, indices = tree.query(query_point, k=min(10, len(points)))
                weights = 1.0 / (distances ** power + 1e-10)
                weights /= weights.sum()
                result[idx] = np.sum(weights * values[indices])
        
        return result, None


class RBFInterpolator(SpatialInterpolator):
    def interpolate(self, points: np.ndarray, values: np.ndarray, grid: np.ndarray,
                    function: str = "multiquadric", epsilon: float = 1.0, 
                    smooth: float = 0.0, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        try:
            from scipy.interpolate import RBFInterpolator as SciPyRBF
        except ImportError:
            logger.warning("SciPy RBFInterpolator not available, falling back to IDW")
            return FastIDWInterpolator().interpolate(points, values, grid, **kwargs)
        
        rbf = SciPyRBF(points, values, kernel=function, epsilon=epsilon, smoothing=smooth)
        grid_flat = grid.reshape(-1, grid.shape[-1])
        result_flat = rbf(grid_flat)
        result = result_flat.reshape(grid.shape[:-1])
        
        return result, None


class NaturalNeighborInterpolator(SpatialInterpolator):
    def interpolate(self, points: np.ndarray, values: np.ndarray, grid: np.ndarray, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        try:
            from scipy.spatial import Voronoi
        except ImportError:
            logger.warning("Voronoi not available, falling back to IDW")
            return FastIDWInterpolator().interpolate(points, values, grid, **kwargs)
        
        vor = Voronoi(points)
        grid_flat = grid.reshape(-1, grid.shape[-1])
        result_flat = np.zeros(grid_flat.shape[0])
        
        tree = KDTree(points)
        distances, indices = tree.query(grid_flat, k=min(6, len(points)))
        
        for i in range(grid_flat.shape[0]):
            query = grid_flat[i]
            neighbor_indices = indices[i]
            neighbor_points = points[neighbor_indices]
            neighbor_values = values[neighbor_indices]
            
            dists = distances[i]
            weights = 1.0 / (dists ** 2 + 1e-10)
            weights /= weights.sum()
            result_flat[i] = np.sum(weights * neighbor_values)
        
        result = result_flat.reshape(grid.shape[:-1])
        return result, None


class KrigingInterpolator(SpatialInterpolator):
    def interpolate(self, points: np.ndarray, values: np.ndarray, grid: np.ndarray,
                    variogram_model: str = "spherical", nugget: float = 0.1,
                    sill: float = 1.0, range_param: float = 10.0, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        try:
            from pykrige.ok import OrdinaryKriging
        except ImportError:
            logger.warning("PyKrige not available, falling back to Fast IDW")
            return FastIDWInterpolator().interpolate(points, values, grid, **kwargs)
        
        lons = points[:, 0]
        lats = points[:, 1]
        grid_lons = grid[..., 0]
        grid_lats = grid[..., 1]
        
        OK = OrdinaryKriging(
            lons, lats, values,
            variogram_model=variogram_model,
            nlags=10,
            verbose=False,
            enable_plotting=False,
        )
        
        z, ss = OK.execute("grid", grid_lons[0, :], grid_lats[:, 0])
        
        return z, ss


class SplineInterpolator(SpatialInterpolator):
    def interpolate(self, points: np.ndarray, values: np.ndarray, grid: np.ndarray,
                    smooth: float = 0.1, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        lons = points[:, 0]
        lats = points[:, 1]
        grid_lons = grid[..., 0]
        grid_lats = grid[..., 1]
        
        spline = interpolate.SmoothBivariateSpline(lons, lats, values, s=smooth)
        z = spline.ev(grid_lons, grid_lats)
        
        return z, None


class NearestNeighborInterpolator(SpatialInterpolator):
    def interpolate(self, points: np.ndarray, values: np.ndarray, grid: np.ndarray, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        tree = KDTree(points)
        flat_grid = grid.reshape(-1, grid.shape[-1])
        _, indices = tree.query(flat_grid, k=1)
        result = values[indices.flatten()].reshape(grid.shape[:-1])
        return result, None


class TemporalInterpolator(ABC):
    @abstractmethod
    def interpolate(self, times: np.ndarray, values: np.ndarray, target_times: np.ndarray, **kwargs) -> np.ndarray:
        pass


class LinearTemporalInterpolator(TemporalInterpolator):
    def interpolate(self, times: np.ndarray, values: np.ndarray, target_times: np.ndarray, **kwargs) -> np.ndarray:
        f = interpolate.interp1d(times.astype(np.float64), values, kind="linear",
                                 bounds_error=False, fill_value=np.nan)
        return f(target_times.astype(np.float64))


class CubicTemporalInterpolator(TemporalInterpolator):
    def interpolate(self, times: np.ndarray, values: np.ndarray, target_times: np.ndarray, **kwargs) -> np.ndarray:
        f = interpolate.interp1d(times.astype(np.float64), values, kind="cubic",
                                 bounds_error=False, fill_value=np.nan)
        return f(target_times.astype(np.float64))


class SplineTemporalInterpolator(TemporalInterpolator):
    def interpolate(self, times: np.ndarray, values: np.ndarray, target_times: np.ndarray,
                    s: float = 0.1, **kwargs) -> np.ndarray:
        spline = interpolate.UnivariateSpline(times.astype(np.float64), values, s=s)
        return spline(target_times.astype(np.float64))


class AkimaTemporalInterpolator(TemporalInterpolator):
    def interpolate(self, times: np.ndarray, values: np.ndarray, target_times: np.ndarray, **kwargs) -> np.ndarray:
        try:
            from scipy.interpolate import Akima1DInterpolator
            akima = Akima1DInterpolator(times.astype(np.float64), values)
            return akima(target_times.astype(np.float64))
        except ImportError:
            logger.warning("Akima interpolator not available, falling back to cubic")
            f = interpolate.interp1d(times.astype(np.float64), values, kind="cubic",
                                     bounds_error=False, fill_value=np.nan)
            return f(target_times.astype(np.float64))


class SpatiotemporalInterpolator:
    SPATIAL_METHODS = {
        "idw_fast": FastIDWInterpolator,
        "idw": IDWInterpolator,
        "kriging": KrigingInterpolator,
        "spline": SplineInterpolator,
        "nearest": NearestNeighborInterpolator,
        "rbf": RBFInterpolator,
        "natural_neighbor": NaturalNeighborInterpolator,
    }

    TEMPORAL_METHODS = {
        "linear": LinearTemporalInterpolator,
        "cubic": CubicTemporalInterpolator,
        "spline": SplineTemporalInterpolator,
        "akima": AkimaTemporalInterpolator,
    }

    NOISE_METHODS = {
        "wavelet": WaveletDenoiser,
        "gaussian": GaussianFilter,
        "savgol": SavitzkyGolayFilter,
        "kalman": KalmanFilter,
    }

    def __init__(self, config: Optional[InterpolationConfig] = None, **kwargs):
        self.config = config or InterpolationConfig(**kwargs)
        self._spatial_interpolator = self.SPATIAL_METHODS[self.config.spatial_method]()
        self._temporal_interpolator = self.TEMPORAL_METHODS[self.config.temporal_method]()
        self._noise_reducer = (
            self.NOISE_METHODS[self.config.noise_reduction]()
            if self.config.noise_reduction else None
        )

    def reduce_noise(self, data: np.ndarray, **kwargs) -> np.ndarray:
        if self._noise_reducer is None:
            return data
        logger.info(f"Applying {self.config.noise_reduction} noise reduction")
        return self._noise_reducer.reduce(data, **kwargs)

    def interpolate_spatial(self, df: pd.DataFrame, variable: str,
                            lon_range: Tuple[float, float], lat_range: Tuple[float, float],
                            resolution: Optional[float] = None) -> InterpolationResult:
        resolution = resolution or self.config.grid_resolution
        
        lons = np.arange(lon_range[0], lon_range[1] + resolution, resolution)
        lats = np.arange(lat_range[0], lat_range[1] + resolution, resolution)
        lon_grid, lat_grid = np.meshgrid(lons, lats)
        grid = np.stack([lon_grid, lat_grid], axis=-1)
        
        points = df[["longitude", "latitude"]].values
        values = df[variable].values
        
        valid_mask = ~np.isnan(values)
        points = points[valid_mask]
        values = values[valid_mask]
        
        if len(points) < 3:
            raise ValueError("Not enough valid points for spatial interpolation")
        
        logger.info(f"Interpolating {variable} using {self.config.spatial_method}")
        
        z, uncertainty = self._spatial_interpolator.interpolate(
            points, values, grid,
            power=self.config.power,
            smooth=self.config.smooth,
            search_radius=self.config.search_radius,
            num_neighbors=self.config.num_neighbors,
            variogram_model=self.config.kriging_variogram_model,
            nugget=self.config.kriging_nugget,
            sill=self.config.kriging_sill,
            range_param=self.config.kriging_range,
        )
        
        ds = xr.Dataset(
            {
                variable: (["latitude", "longitude"], z),
            },
            coords={
                "longitude": lons,
                "latitude": lats,
            },
        )
        
        if uncertainty is not None:
            ds[f"{variable}_uncertainty"] = (["latitude", "longitude"], uncertainty)
        
        return InterpolationResult(
            dataset=ds,
            method=self.config.spatial_method,
            uncertainty=ds.get(f"{variable}_uncertainty") if uncertainty is not None else None,
            metadata={
                "variable": variable,
                "resolution": resolution,
                "num_points": len(points),
            },
        )

    def interpolate_temporal(self, df: pd.DataFrame, variable: str,
                             target_times: Union[np.ndarray, pd.DatetimeIndex]) -> InterpolationResult:
        if isinstance(target_times, pd.DatetimeIndex):
            target_times = target_times.values
        
        times = df["timestamp"].values.astype(np.float64)
        values = df[variable].values
        
        valid_mask = ~np.isnan(values)
        times = times[valid_mask]
        values = values[valid_mask]
        
        if len(times) < 2:
            raise ValueError("Not enough valid time points for temporal interpolation")
        
        logger.info(f"Temporal interpolating {variable} using {self.config.temporal_method}")
        
        interpolated = self._temporal_interpolator.interpolate(
            times, values, target_times.astype(np.float64)
        )
        
        ds = xr.Dataset(
            {
                variable: (["time"], interpolated),
            },
            coords={
                "time": pd.to_datetime(target_times),
            },
        )
        
        return InterpolationResult(
            dataset=ds,
            method=self.config.temporal_method,
            metadata={
                "variable": variable,
                "num_points": len(times),
            },
        )

    def _fast_temporal_interpolation_3d(
        self, spatial_cube: np.ndarray, original_times: np.ndarray, target_times: np.ndarray
    ) -> np.ndarray:
        n_target = len(target_times)
        grid_shape = spatial_cube.shape[1:]
        n_points = grid_shape[0] * grid_shape[1]
        
        spatial_flat = spatial_cube.reshape(spatial_cube.shape[0], n_points)
        
        valid_fraction = np.mean(~np.isnan(spatial_flat), axis=0)
        good_mask = valid_fraction >= 0.5
        
        result_flat = np.full((n_target, n_points), np.nan)
        
        good_indices = np.where(good_mask)[0]
        if len(good_indices) > 0:
            good_data = spatial_flat[:, good_indices]
            
            for i in range(len(good_indices)):
                series = good_data[:, i]
                valid = ~np.isnan(series)
                if valid.sum() >= 2:
                    f = interpolate.interp1d(
                        original_times[valid], series[valid],
                        kind="linear", bounds_error=False, fill_value=np.nan
                    )
                    result_flat[:, good_indices[i]] = f(target_times)
        
        return result_flat.reshape((n_target,) + grid_shape)

    def interpolate_spatiotemporal(self, df: pd.DataFrame, variable: str,
                                   lon_range: Tuple[float, float], lat_range: Tuple[float, float],
                                   target_times: Union[np.ndarray, pd.DatetimeIndex],
                                   resolution: Optional[float] = None,
                                   parallel_processor=None) -> InterpolationResult:
        resolution = resolution or self.config.grid_resolution
        
        if isinstance(target_times, pd.DatetimeIndex):
            target_times = target_times.values
        
        lons = np.arange(lon_range[0], lon_range[1] + resolution, resolution)
        lats = np.arange(lat_range[0], lat_range[1] + resolution, resolution)
        lon_grid, lat_grid = np.meshgrid(lons, lats)
        grid = np.stack([lon_grid, lat_grid], axis=-1)
        
        logger.info(f"Performing spatiotemporal interpolation for {variable}")
        logger.info(f"Grid: {len(lats)}x{len(lons)} points, {len(target_times)} time steps")
        
        unique_times = sorted(df["timestamp"].unique())
        unique_times_np = np.array([pd.Timestamp(t).timestamp() for t in unique_times])
        
        time_indices = np.searchsorted(unique_times_np, unique_times_np)
        df_sorted = df.sort_values("timestamp")
        
        values_by_time = []
        points_by_time = []
        
        for t in unique_times:
            time_df = df[df["timestamp"] == t]
            points = time_df[["longitude", "latitude"]].values
            values = time_df[variable].values
            valid_mask = ~np.isnan(values)
            points_by_time.append(points[valid_mask])
            values_by_time.append(values[valid_mask])
        
        spatial_results = []
        uncertainty_results = []
        
        if parallel_processor is not None and len(unique_times) > 1:
            tasks = []
            for i, t in enumerate(unique_times):
                if len(values_by_time[i]) >= 3:
                    tasks.append((
                        points_by_time[i], values_by_time[i], grid,
                        self.config.power, self.config.smooth, self.config.search_radius,
                        self.config.num_neighbors,
                    ))
            
            if tasks:
                def _interp_task(points, values, grid, power, smooth, search_radius, num_neighbors):
                    return self._spatial_interpolator.interpolate(
                        points, values, grid,
                        power=power, smooth=smooth, search_radius=search_radius,
                        num_neighbors=num_neighbors,
                    )
                
                results = parallel_processor.map(_interp_task, tasks)
                
                result_idx = 0
                for i in range(len(unique_times)):
                    if len(values_by_time[i]) >= 3 and result_idx < len(results):
                        if results[result_idx].success:
                            z, unc = results[result_idx].result
                            spatial_results.append(z)
                            if unc is not None:
                                uncertainty_results.append(unc)
                        else:
                            spatial_results.append(np.full(grid.shape[:-1], np.nan))
                            uncertainty_results.append(np.full(grid.shape[:-1], np.nan))
                        result_idx += 1
                    else:
                        spatial_results.append(np.full(grid.shape[:-1], np.nan))
                        uncertainty_results.append(np.full(grid.shape[:-1], np.nan))
        else:
            for i, t in enumerate(unique_times):
                if len(values_by_time[i]) < 3:
                    spatial_results.append(np.full(grid.shape[:-1], np.nan))
                    uncertainty_results.append(np.full(grid.shape[:-1], np.nan))
                    continue
                
                z, unc = self._spatial_interpolator.interpolate(
                    points_by_time[i], values_by_time[i], grid,
                    power=self.config.power,
                    smooth=self.config.smooth,
                    search_radius=self.config.search_radius,
                    num_neighbors=self.config.num_neighbors,
                )
                spatial_results.append(z)
                if unc is not None:
                    uncertainty_results.append(unc)
        
        if not spatial_results:
            raise ValueError("No valid spatial interpolation results")
        
        spatial_cube = np.stack(spatial_results, axis=0)
        
        target_times_float = np.array([pd.Timestamp(t).timestamp() for t in target_times])
        
        if self.config.use_vectorized:
            final_cube = self._fast_temporal_interpolation_3d(
                spatial_cube, unique_times_np, target_times_float
            )
        else:
            final_cube = np.zeros((len(target_times),) + grid.shape[:-1])
            for i in range(grid.shape[0]):
                for j in range(grid.shape[1]):
                    series = spatial_cube[:, i, j]
                    valid = ~np.isnan(series)
                    if valid.sum() >= 2:
                        f = interpolate.interp1d(
                            unique_times_np[valid], series[valid],
                            kind="linear", bounds_error=False, fill_value=np.nan
                        )
                        final_cube[:, i, j] = f(target_times_float)
                    else:
                        final_cube[:, i, j] = np.nan
        
        ds = xr.Dataset(
            {
                variable: (["time", "latitude", "longitude"], final_cube),
            },
            coords={
                "time": pd.to_datetime(target_times),
                "longitude": lons,
                "latitude": lats,
            },
        )
        
        if uncertainty_results and len(uncertainty_results) == len(spatial_results):
            unc_cube = np.stack(uncertainty_results, axis=0)
            final_unc = self._fast_temporal_interpolation_3d(
                unc_cube, unique_times_np, target_times_float
            )
            ds[f"{variable}_uncertainty"] = (["time", "latitude", "longitude"], final_unc)
        
        return InterpolationResult(
            dataset=ds,
            method=f"{self.config.spatial_method}+{self.config.temporal_method}",
            uncertainty=ds.get(f"{variable}_uncertainty") if uncertainty_results else None,
            metadata={
                "variable": variable,
                "resolution": resolution,
                "num_time_steps": len(target_times),
                "grid_size": (len(lats), len(lons)),
                "vectorized": self.config.use_vectorized,
            },
        )

    @staticmethod
    def available_spatial_methods() -> List[str]:
        return list(SpatiotemporalInterpolator.SPATIAL_METHODS.keys())

    @staticmethod
    def available_temporal_methods() -> List[str]:
        return list(SpatiotemporalInterpolator.TEMPORAL_METHODS.keys())

    @staticmethod
    def available_noise_methods() -> List[str]:
        return list(SpatiotemporalInterpolator.NOISE_METHODS.keys())
