import logging
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import numpy as np
from scipy.ndimage import gaussian_filter
from data_models import GridWeatherData, GridDefinition, WeatherVariable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ResultFusion:
    def __init__(self, grid_def: GridDefinition):
        self.grid_def = grid_def
        self.lat_points = grid_def.lat_points
        self.lon_points = grid_def.lon_points
        self.lat_grid, self.lon_grid = np.meshgrid(self.lat_points, self.lon_points, indexing='ij')

    def merge_region_results(self, region_results: List[Dict]) -> List[GridWeatherData]:
        if not region_results:
            logger.warning("No region results to merge")
            return []

        time_steps = set()
        for result in region_results:
            if 'data' in result and 'results' in result['data']:
                for step_result in result['data']['results']:
                    time_steps.add(step_result['timestamp'])
        
        time_steps = sorted(time_steps)
        logger.info(f"Merging {len(region_results)} regions into {len(time_steps)} time steps")

        merged_results = []
        for ts in time_steps:
            merged_data = self._merge_single_time_step(region_results, ts)
            merged_results.append(merged_data)

        return merged_results

    def _merge_single_time_step(self, region_results: List[Dict], timestamp: str) -> GridWeatherData:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        
        grid_data = GridWeatherData(
            grid_def=self.grid_def,
            timestamp=dt
        )

        variables = ['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'precipitation']
        
        for var in variables:
            merged = self._merge_variable(region_results, timestamp, var)
            setattr(grid_data, var, merged)

        return grid_data

    def _merge_variable(self, region_results: List[Dict], timestamp: str, variable: str) -> np.ndarray:
        full_data = np.full(self.grid_def.shape, np.nan)
        weight_data = np.zeros(self.grid_def.shape)

        for result in region_results:
            if 'data' not in result or 'results' not in result['data']:
                continue

            data = result['data']
            lat_indices = np.array(data.get('lat_indices', []))
            lon_indices = np.array(data.get('lon_indices', []))

            if not lat_indices.any() or not lon_indices.any():
                continue

            for step_result in data['results']:
                if step_result['timestamp'] == timestamp:
                    var_data = step_result.get(variable)
                    if var_data is not None:
                        var_array = np.array(var_data)
                        
                        region_lat_mask = lat_indices
                        region_lon_mask = lon_indices
                        
                        lat_slice = np.ix_(region_lat_mask, region_lon_mask)
                        
                        region_data = full_data[lat_slice]
                        region_weights = weight_data[lat_slice]
                        
                        overlap_mask = ~np.isnan(region_data)
                        
                        valid_mask = ~np.isnan(var_array)
                        
                        target_shape = (np.sum(region_lat_mask), np.sum(region_lon_mask))
                        if var_array.shape != target_shape:
                            var_array = var_array[:target_shape[0], :target_shape[1]]
                        
                        new_data = np.where(overlap_mask,
                                            (region_data * region_weights + var_array * 0.5) / (region_weights + 0.5),
                                            var_array)
                        
                        full_data[lat_slice] = new_data
                        weight_data[lat_slice] = np.where(overlap_mask,
                                                           region_weights + 0.5,
                                                           0.5)
                    break

        return full_data

    def smooth_data(self, grid_data: GridWeatherData, sigma: float = 1.0) -> GridWeatherData:
        smoothed = GridWeatherData(
            grid_def=grid_data.grid_def,
            timestamp=grid_data.timestamp
        )

        variables = ['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'precipitation']
        
        for var in variables:
            data = getattr(grid_data, var)
            if data is not None:
                if var == 'wind_direction':
                    smoothed_data = self._smooth_circular_data(data, sigma)
                else:
                    smoothed_data = gaussian_filter(data, sigma=sigma, mode='nearest')
                setattr(smoothed, var, smoothed_data)

        return smoothed

    def _smooth_circular_data(self, data: np.ndarray, sigma: float) -> np.ndarray:
        data_rad = np.radians(data)
        sin_data = np.sin(data_rad)
        cos_data = np.cos(data_rad)
        
        sin_smooth = gaussian_filter(sin_data, sigma=sigma, mode='nearest')
        cos_smooth = gaussian_filter(cos_data, sigma=sigma, mode='nearest')
        
        smoothed_rad = np.arctan2(sin_smooth, cos_smooth)
        smoothed_deg = np.degrees(smoothed_rad) % 360
        
        return smoothed_deg

    def fill_missing_values(self, grid_data: GridWeatherData, method: str = 'idw') -> GridWeatherData:
        filled = GridWeatherData(
            grid_def=grid_data.grid_def,
            timestamp=grid_data.timestamp
        )

        variables = ['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'precipitation']
        
        for var in variables:
            data = getattr(grid_data, var)
            if data is not None:
                if method == 'idw':
                    filled_data = self._fill_idw(data)
                elif method == 'nearest':
                    filled_data = self._fill_nearest(data)
                else:
                    filled_data = self._fill_idw(data)
                setattr(filled, var, filled_data)

        return filled

    def _fill_idw(self, data: np.ndarray, power: int = 2) -> np.ndarray:
        mask = np.isnan(data)
        if not mask.any():
            return data

        filled = data.copy()
        y, x = np.mgrid[0:data.shape[0], 0:data.shape[1]]

        known_y = y[~mask]
        known_x = x[~mask]
        known_values = data[~mask]

        unknown_y = y[mask]
        unknown_x = x[mask]

        for uy, ux in zip(unknown_y, unknown_x):
            distances = np.sqrt((known_y - uy) ** 2 + (known_x - ux) ** 2)
            distances = np.maximum(distances, 1e-10)
            weights = 1.0 / (distances ** power)
            weights /= weights.sum()
            filled[uy, ux] = np.sum(weights * known_values)

        return filled

    def _fill_nearest(self, data: np.ndarray) -> np.ndarray:
        from scipy.ndimage import distance_transform_edt
        
        mask = np.isnan(data)
        if not mask.any():
            return data

        indices = distance_transform_edt(mask, return_indices=True)[1]
        filled = data[indices[0], indices[1]]
        
        return filled

    def apply_boundary_conditions(self, grid_data: GridWeatherData, 
                                   boundary_data: Optional[GridWeatherData] = None) -> GridWeatherData:
        result = GridWeatherData(
            grid_def=grid_data.grid_def,
            timestamp=grid_data.timestamp
        )

        variables = ['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'precipitation']
        
        for var in variables:
            data = getattr(grid_data, var)
            if data is not None:
                new_data = data.copy()
                
                new_data[0, :] = new_data[1, :]
                new_data[-1, :] = new_data[-2, :]
                new_data[:, 0] = new_data[:, 1]
                new_data[:, -1] = new_data[:, -2]
                
                if boundary_data is not None:
                    boundary_var = getattr(boundary_data, var)
                    if boundary_var is not None:
                        new_data[0, :] = boundary_var[0, :]
                        new_data[-1, :] = boundary_var[-1, :]
                        new_data[:, 0] = boundary_var[:, 0]
                        new_data[:, -1] = boundary_var[:, -1]
                
                setattr(result, var, new_data)

        return result

    def ensemble_average(self, ensemble_results: List[List[GridWeatherData]]) -> List[GridWeatherData]:
        if not ensemble_results:
            return []

        num_members = len(ensemble_results)
        num_steps = min(len(member) for member in ensemble_results)
        
        logger.info(f"Computing ensemble average of {num_members} members over {num_steps} steps")

        averaged = []
        for step in range(num_steps):
            step_data = [member[step] for member in ensemble_results if len(member) > step]
            avg_data = self._average_single_step(step_data)
            averaged.append(avg_data)

        return averaged

    def _average_single_step(self, step_data: List[GridWeatherData]) -> GridWeatherData:
        if not step_data:
            return None

        grid_def = step_data[0].grid_def
        timestamp = step_data[0].timestamp

        result = GridWeatherData(
            grid_def=grid_def,
            timestamp=timestamp
        )

        variables = ['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'precipitation']
        
        for var in variables:
            values = []
            for data in step_data:
                val = getattr(data, var)
                if val is not None:
                    values.append(val)
            
            if values:
                if var == 'wind_direction':
                    avg_val = self._average_circular(values)
                else:
                    avg_val = np.mean(values, axis=0)
                setattr(result, var, avg_val)

        return result

    def _average_circular(self, values: List[np.ndarray]) -> np.ndarray:
        rad_values = [np.radians(v) for v in values]
        sin_avg = np.mean([np.sin(r) for r in rad_values], axis=0)
        cos_avg = np.mean([np.cos(r) for r in rad_values], axis=0)
        avg_rad = np.arctan2(sin_avg, cos_avg)
        return np.degrees(avg_rad) % 360

    def compute_ensemble_spread(self, ensemble_results: List[List[GridWeatherData]]) -> List[Dict]:
        if not ensemble_results:
            return []

        num_steps = min(len(member) for member in ensemble_results)
        
        spread_results = []
        for step in range(num_steps):
            step_data = [member[step] for member in ensemble_results if len(member) > step]
            spread = self._compute_single_step_spread(step_data)
            spread_results.append(spread)

        return spread_results

    def _compute_single_step_spread(self, step_data: List[GridWeatherData]) -> Dict:
        if not step_data:
            return {}

        spread = {
            'timestamp': step_data[0].timestamp,
            'variables': {}
        }

        variables = ['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'precipitation']
        
        for var in variables:
            values = []
            for data in step_data:
                val = getattr(data, var)
                if val is not None:
                    values.append(val)
            
            if values:
                if var == 'wind_direction':
                    spread['variables'][var] = self._circular_std(values)
                else:
                    spread['variables'][var] = np.std(values, axis=0)

        return spread

    def _circular_std(self, values: List[np.ndarray]) -> np.ndarray:
        rad_values = [np.radians(v) for v in values]
        sin_vals = [np.sin(r) for r in rad_values]
        cos_vals = [np.cos(r) for r in rad_values]
        
        sin_mean = np.mean(sin_vals, axis=0)
        cos_mean = np.mean(cos_vals, axis=0)
        
        resultant = np.sqrt(sin_mean ** 2 + cos_mean ** 2)
        std_rad = np.sqrt(-2 * np.log(resultant))
        
        return np.degrees(std_rad)


class QualityControl:
    @staticmethod
    def check_range(grid_data: GridWeatherData) -> Dict[str, bool]:
        ranges = {
            'temperature': (-100, 60),
            'humidity': (0, 100),
            'pressure': (800, 1100),
            'wind_speed': (0, 150),
            'wind_direction': (0, 360),
            'precipitation': (0, 1000),
        }

        results = {}
        for var, (min_val, max_val) in ranges.items():
            data = getattr(grid_data, var)
            if data is not None:
                valid = np.all((data >= min_val) & (data <= max_val) | np.isnan(data))
                results[var] = valid
            else:
                results[var] = True

        return results

    @staticmethod
    def check_spatial_consistency(grid_data: GridWeatherData, threshold: float = 10.0) -> Dict[str, bool]:
        results = {}
        
        variables = ['temperature', 'humidity', 'pressure', 'wind_speed']
        
        for var in variables:
            data = getattr(grid_data, var)
            if data is not None:
                grad = np.gradient(data)
                grad_mag = np.sqrt(grad[0] ** 2 + grad[1] ** 2)
                valid = np.nanmax(grad_mag) < threshold
                results[var] = valid
            else:
                results[var] = True

        return results

    @staticmethod
    def check_temporal_consistency(current_data: GridWeatherData, 
                                   previous_data: GridWeatherData,
                                   max_change: float = 5.0) -> Dict[str, bool]:
        results = {}
        
        variables = ['temperature', 'humidity', 'pressure', 'wind_speed']
        
        for var in variables:
            curr = getattr(current_data, var)
            prev = getattr(previous_data, var)
            if curr is not None and prev is not None:
                change = np.abs(curr - prev)
                valid = np.nanmax(change) < max_change
                results[var] = valid
            else:
                results[var] = True

        return results
