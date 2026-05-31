import logging
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import numpy as np
import pandas as pd
from scipy.interpolate import griddata, RBFInterpolator
from scipy.spatial import cKDTree
from data_models import ObservationData, GridWeatherData, GridDefinition, WeatherVariable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6371.0


def haversine_distance(lon1: np.ndarray, lat1: np.ndarray, 
                       lon2: np.ndarray, lat2: np.ndarray) -> np.ndarray:
    lon1, lat1, lon2, lat2 = map(np.radians, [lon1, lat1, lon2, lat2])
    
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    
    a = np.sin(dlat/2.0)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2.0)**2
    c = 2 * np.arcsin(np.sqrt(a))
    
    return EARTH_RADIUS_KM * c


def circular_interpolation(values: np.ndarray, distances: np.ndarray, 
                          power: int = 2, period: float = 360.0) -> float:
    sin_vals = np.sin(2 * np.pi * values / period)
    cos_vals = np.cos(2 * np.pi * values / period)
    
    distances = np.maximum(distances, 1e-10)
    weights = 1.0 / (distances ** power)
    weights_sum = np.sum(weights)
    
    sin_weighted = np.sum(sin_vals * weights) / weights_sum
    cos_weighted = np.sum(cos_vals * weights) / weights_sum
    
    result_rad = np.arctan2(sin_weighted, cos_weighted)
    result_deg = np.degrees(result_rad) % period
    
    return result_deg


class WeatherDataCleaner:
    def __init__(self):
        self.variable_ranges = {
            WeatherVariable.TEMPERATURE: (-100, 60),
            WeatherVariable.HUMIDITY: (0, 100),
            WeatherVariable.PRESSURE: (800, 1100),
            WeatherVariable.WIND_SPEED: (0, 150),
            WeatherVariable.WIND_DIRECTION: (0, 360),
            WeatherVariable.PRECIPITATION: (0, 1000),
        }

    def clean_observations(self, observations: List[ObservationData]) -> List[ObservationData]:
        cleaned_data = []
        for obs in observations:
            if not self._validate_coordinates(obs.latitude, obs.longitude):
                continue
            if not self._validate_timestamp(obs.timestamp):
                continue
            
            cleaned_obs = self._clean_variables(obs)
            cleaned_data.append(cleaned_obs)
        
        logger.info(f"Cleaned data: {len(cleaned_data)} valid observations from {len(observations)}")
        return cleaned_data

    def _validate_coordinates(self, lat: float, lon: float) -> bool:
        return -90 <= lat <= 90 and -180 <= lon <= 180

    def _validate_timestamp(self, timestamp: datetime) -> bool:
        return timestamp is not None

    def _clean_variables(self, obs: ObservationData) -> ObservationData:
        for var in WeatherVariable:
            value = getattr(obs, var.value)
            if value is not None:
                min_val, max_val = self.variable_ranges[var]
                if not (min_val <= value <= max_val):
                    setattr(obs, var.value, None)
        return obs

    def remove_duplicates(self, observations: List[ObservationData]) -> List[ObservationData]:
        seen = set()
        unique_obs = []
        for obs in observations:
            key = (obs.station_id, obs.timestamp.isoformat())
            if key not in seen:
                seen.add(key)
                unique_obs.append(obs)
        logger.info(f"Removed duplicates: {len(unique_obs)} unique observations")
        return unique_obs


class WeatherDataGridded:
    def __init__(self, grid_def: GridDefinition, method: str = "idw"):
        self.grid_def = grid_def
        self.method = method
        self.lon_grid, self.lat_grid = grid_def.get_grid_coords()

    def interpolate_to_grid(self, observations: List[ObservationData], 
                            variable: WeatherVariable,
                            method: Optional[str] = None) -> np.ndarray:
        method = method or self.method
        
        lats = np.array([obs.latitude for obs in observations])
        lons = np.array([obs.longitude for obs in observations])
        values = np.array([getattr(obs, variable.value) for obs in observations], dtype=float)
        
        valid_mask = ~pd.isna(values)
        lats_valid = lats[valid_mask]
        lons_valid = lons[valid_mask]
        values_valid = values[valid_mask]
        
        if len(values_valid) < 3:
            logger.warning(f"Insufficient valid data for {variable.value}")
            return np.full(self.grid_def.shape, np.nan)
        
        if variable == WeatherVariable.WIND_DIRECTION:
            return self._interpolate_wind_direction(lats_valid, lons_valid, values_valid, method)
        
        points = np.column_stack((lons_valid, lats_valid))
        grid_points = np.column_stack((self.lon_grid.ravel(), self.lat_grid.ravel()))
        
        if method == "idw":
            result = self._idw_interpolation_haversine(lats_valid, lons_valid, values_valid, 
                                                        self.lat_grid.ravel(), self.lon_grid.ravel())
        elif method == "kriging":
            result = self._kriging_interpolation(points, values_valid, grid_points)
        elif method == "rbf":
            result = self._rbf_interpolation(points, values_valid, grid_points)
        elif method == "nearest":
            result = self._nearest_interpolation_haversine(lats_valid, lons_valid, values_valid,
                                                             self.lat_grid.ravel(), self.lon_grid.ravel())
        else:
            result = self._idw_interpolation_haversine(lats_valid, lons_valid, values_valid,
                                                        self.lat_grid.ravel(), self.lon_grid.ravel())
        
        return result.reshape(self.grid_def.shape)

    def _interpolate_wind_direction(self, lats_valid: np.ndarray, lons_valid: np.ndarray,
                                     values_valid: np.ndarray, method: str) -> np.ndarray:
        grid_lats = self.lat_grid.ravel()
        grid_lons = self.lon_grid.ravel()
        
        if method == "nearest":
            result = self._nearest_interpolation_haversine(lats_valid, lons_valid, values_valid,
                                                             grid_lats, grid_lons)
        else:
            result = np.zeros(len(grid_lats))
            k = min(10, len(lats_valid))
            
            for i in range(len(grid_lats)):
                distances = haversine_distance(
                    lons_valid, lats_valid,
                    np.full_like(lons_valid, grid_lons[i]),
                    np.full_like(lats_valid, grid_lats[i])
                )
                
                idx = np.argsort(distances)[:k]
                nearest_distances = distances[idx]
                nearest_values = values_valid[idx]
                
                result[i] = circular_interpolation(nearest_values, nearest_distances)
        
        return result.reshape(self.grid_def.shape)

    def _idw_interpolation_haversine(self, lats: np.ndarray, lons: np.ndarray, values: np.ndarray,
                                     grid_lats: np.ndarray, grid_lons: np.ndarray, 
                                     power: int = 2) -> np.ndarray:
        result = np.zeros(len(grid_lats))
        k = min(10, len(lats))
        
        for i in range(len(grid_lats)):
            distances = haversine_distance(
                lons, lats,
                np.full_like(lons, grid_lons[i]),
                np.full_like(lats, grid_lats[i])
            )
            
            idx = np.argsort(distances)[:k]
            nearest_distances = distances[idx]
            nearest_values = values[idx]
            
            nearest_distances = np.maximum(nearest_distances, 1e-10)
            weights = 1.0 / (nearest_distances ** power)
            
            weights_sum = np.sum(weights)
            weighted_values = np.sum(nearest_values * weights)
            
            result[i] = weighted_values / weights_sum
        
        return result

    def _nearest_interpolation_haversine(self, lats: np.ndarray, lons: np.ndarray, values: np.ndarray,
                                          grid_lats: np.ndarray, grid_lons: np.ndarray) -> np.ndarray:
        result = np.zeros(len(grid_lats))
        
        for i in range(len(grid_lats)):
            distances = haversine_distance(
                lons, lats,
                np.full_like(lons, grid_lons[i]),
                np.full_like(lats, grid_lats[i])
            )
            
            nearest_idx = np.argmin(distances)
            result[i] = values[nearest_idx]
        
        return result

    def _kriging_interpolation(self, points: np.ndarray, values: np.ndarray,
                                grid_points: np.ndarray) -> np.ndarray:
        try:
            from sklearn.gaussian_process import GaussianProcessRegressor
            from sklearn.gaussian_process.kernels import RBF, ConstantKernel
            
            kernel = ConstantKernel(1.0) * RBF(length_scale=1.0)
            gp = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=5)
            gp.fit(points, values)
            
            result = gp.predict(grid_points)
            return result
        except ImportError:
            logger.warning("scikit-learn not available, using IDW instead")
            lats_valid = points[:, 1]
            lons_valid = points[:, 0]
            grid_lats = grid_points[:, 1]
            grid_lons = grid_points[:, 0]
            return self._idw_interpolation_haversine(lats_valid, lons_valid, values, 
                                                      grid_lats, grid_lons)

    def _rbf_interpolation(self, points: np.ndarray, values: np.ndarray,
                           grid_points: np.ndarray) -> np.ndarray:
        rbf = RBFInterpolator(points, values, kernel='thin_plate_spline')
        return rbf(grid_points)

    def create_grid_data(self, observations: List[ObservationData],
                         timestamp: datetime,
                         variables: Optional[List[WeatherVariable]] = None) -> GridWeatherData:
        if variables is None:
            variables = list(WeatherVariable)
        
        grid_data = GridWeatherData(
            grid_def=self.grid_def,
            timestamp=timestamp
        )
        
        for var in variables:
            interpolated = self.interpolate_to_grid(observations, var)
            grid_data.set_variable(var, interpolated)
        
        return grid_data


def correct_pressure_to_sea_level(pressure: np.ndarray, temperature: np.ndarray, 
                                   altitude: float = 0.0) -> np.ndarray:
    if altitude == 0:
        return pressure
    
    lapse_rate = 0.0065
    temperature_k = temperature + 273.15
    sea_level_pressure = pressure * (1 - (lapse_rate * altitude) / temperature_k) ** (-5.257)
    
    return sea_level_pressure


def correct_temperature_to_altitude(temperature: np.ndarray, altitude: float) -> np.ndarray:
    lapse_rate = 0.0065
    return temperature - lapse_rate * altitude


class DataPreprocessor:
    def __init__(self, grid_def: GridDefinition):
        self.cleaner = WeatherDataCleaner()
        self.gridded = WeatherDataGridded(grid_def)

    def process_observations(self, observations: List[ObservationData],
                             timestamp: Optional[datetime] = None,
                             variables: Optional[List[WeatherVariable]] = None) -> GridWeatherData:
        cleaned = self.cleaner.clean_observations(observations)
        cleaned = self.cleaner.remove_duplicates(cleaned)
        
        if timestamp is None and cleaned:
            timestamp = cleaned[0].timestamp
        
        grid_data = self.gridded.create_grid_data(cleaned, timestamp, variables)
        logger.info(f"Grid data created at {timestamp} with shape {grid_data.grid_def.shape}")
        
        return grid_data

    def process_dataframe(self, df: pd.DataFrame,
                          variables: Optional[List[WeatherVariable]] = None) -> Dict[datetime, GridWeatherData]:
        observations = self._dataframe_to_observations(df)
        
        results = {}
        for timestamp, group in df.groupby('timestamp'):
            group_obs = self._dataframe_to_observations(group)
            results[timestamp] = self.process_observations(group_obs, timestamp, variables)
        
        return results

    def _dataframe_to_observations(self, df: pd.DataFrame) -> List[ObservationData]:
        observations = []
        for _, row in df.iterrows():
            obs = ObservationData(
                station_id=str(row.get('station_id', 'unknown')),
                timestamp=row.get('timestamp'),
                latitude=float(row.get('latitude', 0)),
                longitude=float(row.get('longitude', 0)),
                temperature=row.get('temperature'),
                humidity=row.get('humidity'),
                pressure=row.get('pressure'),
                wind_speed=row.get('wind_speed'),
                wind_direction=row.get('wind_direction'),
                precipitation=row.get('precipitation')
            )
            observations.append(obs)
        return observations
