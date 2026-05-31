import numpy as np
from scipy.spatial import KDTree, cKDTree, distance
from scipy.interpolate import RBFInterpolator, griddata, CloughTocher2DInterpolator
from scipy.spatial.distance import cdist
from scipy.linalg import solve, cho_factor, cho_solve
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel as C, WhiteKernel
from sklearn.svm import SVR
from typing import Tuple, Optional, Dict, Any, List, Union
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import functools
from collections import OrderedDict

from config import InterpolationConfig
from utils import setup_logger, Timer, haversine_distance, calculate_statistics
from data_parser import OceanObservation

logger = setup_logger("spatial_interpolator")


class LRUCache:
    def __init__(self, capacity: int = 128):
        self.cache = OrderedDict()
        self.capacity = capacity

    def get(self, key: Any) -> Optional[Any]:
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        return None

    def put(self, key: Any, value: Any) -> None:
        if key in self.cache:
            self.cache.move_to_end(key)
        else:
            if len(self.cache) >= self.capacity:
                self.cache.popitem(last=False)
        self.cache[key] = value

    def clear(self) -> None:
        self.cache.clear()


@dataclass
class InterpolationResult:
    variable: str
    lon_grid: np.ndarray
    lat_grid: np.ndarray
    depth_grid: np.ndarray
    values: np.ndarray
    method: str
    statistics: Dict[str, float] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    uncertainty: Optional[np.ndarray] = None

    def shape(self) -> Tuple[int, int, int]:
        return self.values.shape

    def slice_at_depth(self, depth: float) -> np.ndarray:
        depth_idx = np.argmin(np.abs(self.depth_grid - depth))
        return self.values[:, :, depth_idx]

    def slice_at_lon(self, lon: float) -> np.ndarray:
        lon_idx = np.argmin(np.abs(self.lon_grid - lon))
        return self.values[lon_idx, :, :]

    def slice_at_lat(self, lat: float) -> np.ndarray:
        lat_idx = np.argmin(np.abs(self.lat_grid - lat))
        return self.values[:, lat_idx, :]


class BaseInterpolator(ABC):
    def __init__(self, config: InterpolationConfig):
        self.config = config
        self.cache = LRUCache(capacity=64)

    @abstractmethod
    def interpolate(
        self,
        points: np.ndarray,
        values: np.ndarray,
        grid_points: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        pass

    def _cache_key(self, points: np.ndarray, values: np.ndarray) -> str:
        return f"{hash(points.tobytes())}_{hash(values.tobytes())}"


class FastIDWInterpolator(BaseInterpolator):
    def __init__(self, config: InterpolationConfig):
        super().__init__(config)
        self.power = getattr(config, 'idw_power', 2.0)
        self.use_kd_tree = True
        self.batch_size = 50000

    def interpolate(
        self,
        points: np.ndarray,
        values: np.ndarray,
        grid_points: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        logger.info(f"Fast IDW interpolation: {len(points)} points -> {len(grid_points)} grid points")

        n_points = len(points)
        n_grid = len(grid_points)
        k = min(self.config.n_neighbors, n_points)

        tree = cKDTree(points, compact_nodes=True, balanced_tree=True)

        result = np.zeros(n_grid, dtype=values.dtype)

        for start in range(0, n_grid, self.batch_size):
            end = min(start + self.batch_size, n_grid)
            batch = grid_points[start:end]

            distances, indices = tree.query(batch, k=k, n_jobs=-1)
            distances = np.maximum(distances, 1e-10)

            weights = 1.0 / (distances ** self.power)
            weight_sums = weights.sum(axis=1, keepdims=True)
            weights = np.where(weight_sums > 0, weights / weight_sums, 1.0 / k)

            batch_values = values[indices]
            result[start:end] = np.sum(batch_values * weights, axis=1)

        return result, None


class OptimizedKrigingInterpolator(BaseInterpolator):
    def __init__(self, config: InterpolationConfig):
        super().__init__(config)
        self.variogram_params = None
        self._fit_cache = None
        self.use_local_kriging = True
        self.cholesky_cache = {}

    def _fit_variogram_fast(self, points: np.ndarray, values: np.ndarray) -> Dict[str, float]:
        n = len(points)
        sample_size = min(n, 2000)

        if n > sample_size:
            idx = np.random.choice(n, sample_size, replace=False)
            sample_points = points[idx]
            sample_values = values[idx]
        else:
            sample_points = points
            sample_values = values

        distances = cdist(sample_points, sample_points)
        max_dist = np.percentile(distances, 60)

        bins = np.linspace(0, max_dist, 15)
        bin_centers = (bins[:-1] + bins[1:]) / 2

        semivariances = np.zeros(len(bin_centers))
        counts = np.zeros(len(bin_centers))

        for i in range(len(bins) - 1):
            mask = (distances >= bins[i]) & (distances < bins[i + 1])
            counts[i] = np.sum(mask)
            if counts[i] > 0:
                pairs = sample_values[:, None] - sample_values[None, :]
                semivariances[i] = np.mean(pairs[mask] ** 2) / 2

        valid = counts > 5
        if not np.any(valid):
            return {"nugget": 0.0, "sill": np.var(values), "range": max_dist, "model": "spherical"}

        bin_centers = bin_centers[valid]
        semivariances = semivariances[valid]

        nugget = semivariances[0] if len(semivariances) > 0 else 0.0
        sill = np.percentile(semivariances, 90) if len(semivariances) > 0 else np.var(values)
        range_val = bin_centers[np.argmin(np.abs(semivariances - 0.95 * sill))] if len(bin_centers) > 0 else max_dist

        self.variogram_params = {
            "nugget": float(nugget),
            "sill": float(sill),
            "range": float(range_val),
            "model": self.config.variogram_model
        }
        return self.variogram_params

    def _variogram_vectorized(self, h: np.ndarray) -> np.ndarray:
        params = self.variogram_params
        nugget, sill, range_val = params["nugget"], params["sill"], params["range"]
        model = params["model"]

        h = np.asarray(h, dtype=float)

        if model == "spherical":
            ratio = h / range_val
            gamma = np.where(
                h <= range_val,
                nugget + (sill - nugget) * (1.5 * ratio - 0.5 * ratio ** 3),
                sill
            )
        elif model == "exponential":
            gamma = nugget + (sill - nugget) * (1 - np.exp(-3 * h / range_val))
        elif model == "gaussian":
            gamma = nugget + (sill - nugget) * (1 - np.exp(-3 * (h / range_val) ** 2))
        else:
            gamma = sill * np.ones_like(h)

        return gamma

    def interpolate(
        self,
        points: np.ndarray,
        values: np.ndarray,
        grid_points: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        logger.info(f"Optimized Kriging: {len(points)} points -> {len(grid_points)} grid points")

        self._fit_variogram_fast(points, values)
        logger.debug(f"Variogram params: {self.variogram_params}")

        n = len(points)
        k = min(self.config.n_neighbors, n)

        tree = cKDTree(points)

        n_grid = len(grid_points)
        predictions = np.zeros(n_grid, dtype=values.dtype)
        variances = np.zeros(n_grid, dtype=values.dtype) if self.config.return_std else None

        batch_size = 20000

        for start in range(0, n_grid, batch_size):
            end = min(start + batch_size, n_grid)
            batch = grid_points[start:end]

            distances, indices = tree.query(batch, k=k, n_jobs=-1)

            batch_predictions = np.zeros(len(batch))
            if variances is not None:
                batch_variances = np.zeros(len(batch))

            for i in range(len(batch)):
                idx = indices[i]
                dists = distances[i]
                local_points = points[idx]
                local_values = values[idx]

                C = self._variogram_vectorized(cdist(local_points, local_points))
                C += np.eye(k) * 1e-8
                c = self._variogram_vectorized(dists)

                try:
                    ones = np.ones(k)
                    A = np.block([
                        [C, ones.reshape(-1, 1)],
                        [ones.reshape(1, -1), [[0.0]]]
                    ])
                    b = np.append(c, [1.0])
                    rhs = np.append(local_values, [0.0])

                    weights = np.linalg.solve(A, rhs)
                    lambdas = weights[:k]
                    mu = weights[k]

                    batch_predictions[i] = np.sum(lambdas * local_values)

                    if variances is not None:
                        sigma2 = np.sum(lambdas * c) + mu
                        batch_variances[i] = np.sqrt(max(0, sigma2))

                except np.linalg.LinAlgError:
                    weights = 1.0 / (dists + 1e-6)
                    weights /= weights.sum()
                    batch_predictions[i] = np.sum(weights * local_values)
                    if variances is not None:
                        batch_variances[i] = np.std(local_values)

            predictions[start:end] = batch_predictions
            if variances is not None:
                variances[start:end] = batch_variances

        return predictions, variances


class RBFInterpolatorFast(BaseInterpolator):
    def __init__(self, config: InterpolationConfig):
        super().__init__(config)
        self.kernel = getattr(config, 'rbf_kernel', 'thin_plate_spline')
        self.smoothing = getattr(config, 'rbf_smoothing', 0.01)
        self.neighbors = min(config.n_neighbors, 200)

    def interpolate(
        self,
        points: np.ndarray,
        values: np.ndarray,
        grid_points: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        logger.info(f"RBF interpolation: {len(points)} points -> {len(grid_points)} grid points")

        n = len(points)
        if n <= self.neighbors:
            rbf = RBFInterpolator(
                points, values,
                kernel=self.kernel,
                smoothing=self.smoothing
            )
            return rbf(grid_points), None

        tree = cKDTree(points)
        result = np.zeros(len(grid_points))

        batch_size = 10000
        for start in range(0, len(grid_points), batch_size):
            end = min(start + batch_size, len(grid_points))
            batch = grid_points[start:end]

            distances, indices = tree.query(batch, k=self.neighbors, n_jobs=-1)

            for i in range(len(batch)):
                local_points = points[indices[i]]
                local_values = values[indices[i]]

                try:
                    rbf = RBFInterpolator(
                        local_points, local_values,
                        kernel=self.kernel,
                        smoothing=self.smoothing
                    )
                    result[start + i] = rbf(batch[i:i + 1])[0]
                except:
                    weights = 1.0 / (distances[i] + 1e-6)
                    weights /= weights.sum()
                    result[start + i] = np.sum(weights * local_values)

        return result, None


class GaussianProcessInterpolator(BaseInterpolator):
    def __init__(self, config: InterpolationConfig):
        super().__init__(config)
        self.gp = None
        self.max_train_points = 500

    def interpolate(
        self,
        points: np.ndarray,
        values: np.ndarray,
        grid_points: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        logger.info(f"Gaussian Process interpolation: {len(points)} points -> {len(grid_points)} grid points")

        n = len(points)
        if n > self.max_train_points:
            idx = np.random.choice(n, self.max_train_points, replace=False)
            train_points = points[idx]
            train_values = values[idx]
        else:
            train_points = points
            train_values = values

        kernel = C(1.0, (1e-3, 1e3)) * RBF(1.0, (1e-2, 1e2)) + WhiteKernel(0.1, (1e-5, 1e1))
        self.gp = GaussianProcessRegressor(
            kernel=kernel,
            alpha=1e-6,
            n_restarts_optimizer=5,
            normalize_y=True
        )

        self.gp.fit(train_points, train_values)

        batch_size = 5000
        predictions = np.zeros(len(grid_points))
        stds = np.zeros(len(grid_points)) if self.config.return_std else None

        for start in range(0, len(grid_points), batch_size):
            end = min(start + batch_size, len(grid_points))
            batch = grid_points[start:end]

            if self.config.return_std:
                pred, std = self.gp.predict(batch, return_std=True)
                predictions[start:end] = pred
                stds[start:end] = std
            else:
                predictions[start:end] = self.gp.predict(batch, return_std=False)

        return predictions, stds


class SVRInterpolator(BaseInterpolator):
    def __init__(self, config: InterpolationConfig):
        super().__init__(config)
        self.kernel = getattr(config, 'svr_kernel', 'rbf')
        self.C = getattr(config, 'svr_C', 100.0)
        self.epsilon = getattr(config, 'svr_epsilon', 0.1)
        self.gamma = getattr(config, 'svr_gamma', 'scale')
        self.max_train_points = 2000

    def interpolate(
        self,
        points: np.ndarray,
        values: np.ndarray,
        grid_points: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        logger.info(f"SVR interpolation: {len(points)} points -> {len(grid_points)} grid points")

        n = len(points)
        if n > self.max_train_points:
            idx = np.random.choice(n, self.max_train_points, replace=False)
            train_points = points[idx]
            train_values = values[idx]
        else:
            train_points = points
            train_values = values

        svr = SVR(
            kernel=self.kernel,
            C=self.C,
            epsilon=self.epsilon,
            gamma=self.gamma
        )
        svr.fit(train_points, train_values)

        batch_size = 20000
        predictions = np.zeros(len(grid_points))

        for start in range(0, len(grid_points), batch_size):
            end = min(start + batch_size, len(grid_points))
            predictions[start:end] = svr.predict(grid_points[start:end])

        return predictions, None


class LinearInterpolatorFast(BaseInterpolator):
    def interpolate(
        self,
        points: np.ndarray,
        values: np.ndarray,
        grid_points: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        logger.info(f"Linear interpolation: {len(points)} points -> {len(grid_points)} grid points")
        result = griddata(points, values, grid_points, method="linear", fill_value=np.nan)

        nan_mask = np.isnan(result)
        if np.any(nan_mask):
            nearest_result = griddata(points, values, grid_points, method="nearest")
            result[nan_mask] = nearest_result[nan_mask]

        return result, None


class NearestNeighborInterpolator(BaseInterpolator):
    def interpolate(
        self,
        points: np.ndarray,
        values: np.ndarray,
        grid_points: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        logger.info(f"Nearest neighbor interpolation: {len(points)} points -> {len(grid_points)} grid points")

        tree = cKDTree(points)
        _, indices = tree.query(grid_points, k=1, n_jobs=-1)

        return values[indices], None


class OceanSpatialInterpolator:
    INTERPOLATORS = {
        "idw": FastIDWInterpolator,
        "kriging": OptimizedKrigingInterpolator,
        "kriging_fast": OptimizedKrigingInterpolator,
        "rbf": RBFInterpolatorFast,
        "gp": GaussianProcessInterpolator,
        "gaussian_process": GaussianProcessInterpolator,
        "svr": SVRInterpolator,
        "linear": LinearInterpolatorFast,
        "nearest": NearestNeighborInterpolator,
    }

    def __init__(self, config: InterpolationConfig):
        self.config = config
        self.interpolator = self._create_interpolator()
        self._grid_cache = None

    def _create_interpolator(self) -> BaseInterpolator:
        method = self.config.method.lower()
        if method not in self.INTERPOLATORS:
            raise ValueError(f"Unknown interpolation method: {method}. Available: {list(self.INTERPOLATORS.keys())}")
        return self.INTERPOLATORS[method](self.config)

    def generate_grid(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if self._grid_cache is not None:
            return self._grid_cache

        lon_res, lat_res, depth_res = self.config.grid_resolution
        lon = np.arange(
            self.config.lon_range[0],
            self.config.lon_range[1] + lon_res / 2,
            lon_res
        )
        lat = np.arange(
            self.config.lat_range[0],
            self.config.lat_range[1] + lat_res / 2,
            lat_res
        )
        depth = np.arange(
            self.config.depth_range[0],
            self.config.depth_range[1] + depth_res / 2,
            depth_res
        )

        self._grid_cache = (lon, lat, depth)
        return lon, lat, depth

    def _prepare_points(
        self,
        observation: OceanObservation,
        variable: str
    ) -> Tuple[np.ndarray, np.ndarray]:
        values = getattr(observation, variable)
        mask = ~np.isnan(values)

        if not np.any(mask):
            return np.array([]), np.array([])

        points = np.column_stack([
            observation.longitude[mask],
            observation.latitude[mask],
            observation.depth[mask]
        ])
        values = values[mask]

        return points, values

    def interpolate_variable(
        self,
        observation: OceanObservation,
        variable: str
    ) -> InterpolationResult:
        logger.info(f"Interpolating variable: {variable}")

        with Timer(f"{variable} interpolation", logger):
            lon, lat, depth = self.generate_grid()
            lon_grid, lat_grid, depth_grid = np.meshgrid(lon, lat, depth, indexing="ij")
            grid_points = np.column_stack([
                lon_grid.ravel(),
                lat_grid.ravel(),
                depth_grid.ravel()
            ])

            points, values = self._prepare_points(observation, variable)

            if len(points) < 3:
                logger.warning(f"Insufficient data points for {variable}: {len(points)}")
                mean_val = np.mean(values) if len(values) > 0 else np.nan
                return InterpolationResult(
                    variable=variable,
                    lon_grid=lon,
                    lat_grid=lat,
                    depth_grid=depth,
                    values=np.full(lon_grid.shape, mean_val),
                    method=self.config.method,
                    metadata={"warning": "insufficient_points"}
                )

            interpolated, uncertainty = self.interpolator.interpolate(points, values, grid_points)
            interpolated_grid = interpolated.reshape(lon_grid.shape)

            uncertainty_grid = None
            if uncertainty is not None:
                uncertainty_grid = uncertainty.reshape(lon_grid.shape)

            stats = calculate_statistics(interpolated)

        return InterpolationResult(
            variable=variable,
            lon_grid=lon,
            lat_grid=lat,
            depth_grid=depth,
            values=interpolated_grid,
            uncertainty=uncertainty_grid,
            method=self.config.method,
            statistics=stats,
            metadata={
                "n_input_points": len(points),
                "n_grid_points": len(grid_points),
                "grid_shape": interpolated_grid.shape,
                "has_uncertainty": uncertainty is not None
            }
        )

    def interpolate_multiple(
        self,
        observation: OceanObservation,
        variables: List[str]
    ) -> Dict[str, InterpolationResult]:
        results = {}
        for variable in variables:
            results[variable] = self.interpolate_variable(observation, variable)
        return results

    def parallel_interpolate(
        self,
        observation: OceanObservation,
        variables: List[str],
        n_workers: int = -1
    ) -> Dict[str, InterpolationResult]:
        from parallel_kernel import ParallelKernel, ParallelConfig

        parallel_config = ParallelConfig(n_workers=n_workers)
        with ParallelKernel(parallel_config) as kernel:
            def interpolate_wrapper(var):
                return self.interpolate_variable(observation, var)

            results = kernel.execute(interpolate_wrapper, variables)
            return {
                var: res.result
                for var, res in zip(variables, results)
                if res.status.value == "completed" and res.result is not None
            }


class AdaptiveInterpolator(OceanSpatialInterpolator):
    def __init__(self, config: InterpolationConfig):
        super().__init__(config)
        self.method_thresholds = {
            10: "nearest",
            50: "linear",
            200: "idw",
            1000: "rbf",
            5000: "kriging",
            float('inf'): "gp"
        }

    def interpolate_variable(
        self,
        observation: OceanObservation,
        variable: str
    ) -> InterpolationResult:
        points, values = self._prepare_points(observation, variable)
        n_points = len(points)

        for threshold in sorted(self.method_thresholds.keys()):
            if n_points <= threshold:
                selected_method = self.method_thresholds[threshold]
                break

        self.config.method = selected_method
        self.interpolator = self._create_interpolator()
        logger.info(f"Adaptive interpolation: selected {selected_method} for {n_points} points")

        return super().interpolate_variable(observation, variable)


class DepthSliceInterpolator:
    def __init__(self, config: InterpolationConfig):
        self.config = config
        self.base_interpolator = OceanSpatialInterpolator(config)

    def interpolate_by_depth_slices(
        self,
        observation: OceanObservation,
        variable: str,
        depth_slices: Optional[List[float]] = None
    ) -> InterpolationResult:
        logger.info(f"Depth-slice interpolation for {variable}")

        lon, lat, depth = self.base_interpolator.generate_grid()

        if depth_slices is None:
            depth_slices = depth.tolist()

        result_volume = np.zeros((len(lon), len(lat), len(depth_slices)))
        uncertainty_volume = None

        for d_idx, target_depth in enumerate(depth_slices):
            depth_window = max(10.0, self.config.grid_resolution[2] * 3)
            depth_mask = np.abs(observation.depth - target_depth) <= depth_window

            if np.sum(depth_mask) < 5:
                depth_mask = np.argsort(np.abs(observation.depth - target_depth))[:min(20, len(observation.depth))]

            slice_points = np.column_stack([
                observation.longitude[depth_mask],
                observation.latitude[depth_mask]
            ])
            slice_values = getattr(observation, variable)[depth_mask]

            if len(slice_values) < 3:
                result_volume[:, :, d_idx] = np.nanmean(slice_values) if len(slice_values) > 0 else np.nan
                continue

            lon_grid_2d, lat_grid_2d = np.meshgrid(lon, lat, indexing="ij")
            grid_points_2d = np.column_stack([lon_grid_2d.ravel(), lat_grid_2d.ravel()])

            interpolator = NearestNeighborInterpolator(self.config)
            if self.config.method == "idw":
                interpolator = FastIDWInterpolator(self.config)

            slice_result, _ = interpolator.interpolate(slice_points, slice_values, grid_points_2d)
            result_volume[:, :, d_idx] = slice_result.reshape(lon_grid_2d.shape)

        stats = calculate_statistics(result_volume)

        return InterpolationResult(
            variable=variable,
            lon_grid=lon,
            lat_grid=lat,
            depth_grid=np.array(depth_slices),
            values=result_volume,
            uncertainty=uncertainty_volume,
            method=f"{self.config.method}_depth_slice",
            statistics=stats,
            metadata={
                "n_depth_slices": len(depth_slices),
                "interpolation_type": "2D_per_slice"
            }
        )


class EnsembleInterpolator:
    def __init__(self, config: InterpolationConfig, methods: List[str] = None):
        self.config = config
        self.methods = methods or ["idw", "rbf", "linear"]
        self.interpolators = {}

        for method in self.methods:
            config_copy = InterpolationConfig(**{**config.__dict__, "method": method})
            self.interpolators[method] = OceanSpatialInterpolator(config_copy)

    def interpolate_variable(
        self,
        observation: OceanObservation,
        variable: str,
        weights: Optional[Dict[str, float]] = None
    ) -> InterpolationResult:
        logger.info(f"Ensemble interpolation: {self.methods}")

        if weights is None:
            weights = {m: 1.0 / len(self.methods) for m in self.methods}

        results = {}
        for method in self.methods:
            results[method] = self.interpolators[method].interpolate_variable(observation, variable)

        first_result = results[self.methods[0]]
        ensemble_values = np.zeros_like(first_result.values)

        for method in self.methods:
            ensemble_values += results[method].values * weights[method]

        stats = calculate_statistics(ensemble_values)

        return InterpolationResult(
            variable=variable,
            lon_grid=first_result.lon_grid,
            lat_grid=first_result.lat_grid,
            depth_grid=first_result.depth_grid,
            values=ensemble_values,
            method=f"ensemble_{'+'.join(self.methods)}",
            statistics=stats,
            metadata={
                "methods": self.methods,
                "weights": weights,
                "individual_results": {k: v.statistics for k, v in results.items()}
            }
        )
