import logging
from typing import Dict, Optional, Tuple, List
from datetime import datetime, timedelta
import numpy as np
from scipy.ndimage import gaussian_filter, convolve
from data_models import GridWeatherData, GridDefinition, WeatherVariable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AdvectionDiffusionModel:
    def __init__(self, grid_def: GridDefinition):
        self.grid_def = grid_def
        self.dx = np.diff(grid_def.lon_points)[0] * 111000 * np.cos(np.radians(grid_def.lat_points.mean()))
        self.dy = np.diff(grid_def.lat_points)[0] * 111000

    def advect(self, field: np.ndarray, u: np.ndarray, v: np.ndarray, dt: float) -> np.ndarray:
        dx = self.dx
        dy = self.dy
        
        dfield_dx = np.gradient(field, dx, axis=1)
        dfield_dy = np.gradient(field, dy, axis=0)
        
        advection = -(u * dfield_dx + v * dfield_dy)
        return field + advection * dt

    def diffuse(self, field: np.ndarray, diffusion_coeff: float, dt: float) -> np.ndarray:
        dx = self.dx
        dy = self.dy
        
        laplacian = (np.gradient(np.gradient(field, dx, axis=1), dx, axis=1) +
                     np.gradient(np.gradient(field, dy, axis=0), dy, axis=0))
        
        return field + diffusion_coeff * laplacian * dt


class WeatherSimulation:
    def __init__(self, grid_def: GridDefinition, dt_seconds: int = 3600):
        self.grid_def = grid_def
        self.dt = dt_seconds
        self.advection_model = AdvectionDiffusionModel(grid_def)
        self.lat_grid, self.lon_grid = np.meshgrid(grid_def.lat_points, grid_def.lon_points, indexing='ij')

    def initialize_wind_components(self, wind_speed: np.ndarray, wind_direction: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        wind_rad = np.radians(wind_direction)
        u = wind_speed * np.sin(wind_rad)
        v = wind_speed * np.cos(wind_rad)
        return u, v

    def step_temperature(self, temperature: np.ndarray, pressure: np.ndarray,
                         u: np.ndarray, v: np.ndarray, humidity: np.ndarray,
                         dt: Optional[float] = None) -> np.ndarray:
        dt = dt or self.dt
        
        temp_new = self.advection_model.advect(temperature, u, v, dt)
        temp_new = self.advection_model.diffuse(temp_new, diffusion_coeff=100.0, dt=dt)
        
        lapse_rate = -0.0065
        pressure_ref = 1013.25
        temp_adj = lapse_rate * (1 - pressure / pressure_ref) * 1000
        temp_new += temp_adj * dt / 3600
        
        humidity_effect = 0.1 * (humidity / 100 - 0.5)
        temp_new -= humidity_effect * dt / 3600
        
        return temp_new

    def step_pressure(self, pressure: np.ndarray, temperature: np.ndarray,
                      u: np.ndarray, v: np.ndarray, dt: Optional[float] = None) -> np.ndarray:
        dt = dt or self.dt
        
        pressure_new = self.advection_model.advect(pressure, u, v, dt)
        pressure_new = self.advection_model.diffuse(pressure_new, diffusion_coeff=50.0, dt=dt)
        
        temp_effect = 0.01 * (temperature - 288.15)
        pressure_new += temp_effect * dt / 3600
        
        return pressure_new

    def step_humidity(self, humidity: np.ndarray, temperature: np.ndarray,
                      u: np.ndarray, v: np.ndarray, dt: Optional[float] = None) -> np.ndarray:
        dt = dt or self.dt
        
        humidity_new = self.advection_model.advect(humidity, u, v, dt)
        humidity_new = self.advection_model.diffuse(humidity_new, diffusion_coeff=80.0, dt=dt)
        
        saturation_pressure = 6.112 * np.exp(17.67 * (temperature - 273.15) / (temperature - 29.65))
        humidity_new = np.clip(humidity_new, 0, 100)
        
        return humidity_new

    def step_wind(self, wind_speed: np.ndarray, wind_direction: np.ndarray,
                  pressure: np.ndarray, temperature: np.ndarray,
                  dt: Optional[float] = None) -> Tuple[np.ndarray, np.ndarray]:
        dt = dt or self.dt
        
        u, v = self.initialize_wind_components(wind_speed, wind_direction)
        
        dp_dx = np.gradient(pressure, self.advection_model.dx, axis=1)
        dp_dy = np.gradient(pressure, self.advection_model.dy, axis=0)
        
        f = 2 * 7.2921e-5 * np.sin(np.radians(self.lat_grid))
        
        u_new = u + (dp_dx / (1.2 * 100) - f * v) * dt
        v_new = v + (dp_dy / (1.2 * 100) + f * u) * dt
        
        u_new = self.advection_model.diffuse(u_new, diffusion_coeff=200.0, dt=dt)
        v_new = self.advection_model.diffuse(v_new, diffusion_coeff=200.0, dt=dt)
        
        wind_speed_new = np.sqrt(u_new ** 2 + v_new ** 2)
        wind_direction_new = np.degrees(np.arctan2(u_new, v_new)) % 360
        
        return wind_speed_new, wind_direction_new

    def step_precipitation(self, precipitation: np.ndarray, humidity: np.ndarray,
                           temperature: np.ndarray, wind_speed: np.ndarray,
                           dt: Optional[float] = None) -> np.ndarray:
        dt = dt or self.dt
        
        cond_prob = np.maximum(0, (humidity - 80) / 20) * np.maximum(0, (20 - np.abs(temperature - 288))) / 20
        precip_new = cond_prob * wind_speed * dt / 3600 * 0.1
        
        precip_new = gaussian_filter(precip_new, sigma=2)
        
        return precip_new

    def simulate_step(self, grid_data: GridWeatherData, 
                      variables: Optional[List[WeatherVariable]] = None) -> GridWeatherData:
        if variables is None:
            variables = list(WeatherVariable)
        
        u, v = self.initialize_wind_components(grid_data.wind_speed, grid_data.wind_direction)
        
        new_data = GridWeatherData(
            grid_def=self.grid_def,
            timestamp=grid_data.timestamp + timedelta(seconds=self.dt)
        )
        
        if WeatherVariable.TEMPERATURE in variables:
            new_data.temperature = self.step_temperature(
                grid_data.temperature, grid_data.pressure, u, v, grid_data.humidity
            )
        
        if WeatherVariable.PRESSURE in variables:
            new_data.pressure = self.step_pressure(
                grid_data.pressure, grid_data.temperature, u, v
            )
        
        if WeatherVariable.HUMIDITY in variables:
            new_data.humidity = self.step_humidity(
                grid_data.humidity, grid_data.temperature, u, v
            )
        
        if WeatherVariable.WIND_SPEED in variables or WeatherVariable.WIND_DIRECTION in variables:
            new_wind_speed, new_wind_direction = self.step_wind(
                grid_data.wind_speed, grid_data.wind_direction,
                grid_data.pressure, grid_data.temperature
            )
            new_data.wind_speed = new_wind_speed
            new_data.wind_direction = new_wind_direction
        
        if WeatherVariable.PRECIPITATION in variables:
            new_data.precipitation = self.step_precipitation(
                grid_data.precipitation, grid_data.humidity,
                grid_data.temperature, grid_data.wind_speed
            )
        
        return new_data

    def simulate_multi_step(self, initial_data: GridWeatherData,
                            num_steps: int,
                            variables: Optional[List[WeatherVariable]] = None) -> List[GridWeatherData]:
        results = [initial_data]
        current_data = initial_data
        
        for step in range(num_steps):
            current_data = self.simulate_step(current_data, variables)
            results.append(current_data)
            
            if step % 10 == 0:
                logger.info(f"Completed simulation step {step}/{num_steps}")
        
        return results


class RegionalSimulator:
    def __init__(self, grid_def: GridDefinition, dt_seconds: int = 3600):
        self.simulator = WeatherSimulation(grid_def, dt_seconds)

    def simulate_region(self, initial_data: GridWeatherData,
                        region: Tuple[float, float, float, float],
                        num_steps: int) -> Dict:
        lat_min, lat_max, lon_min, lon_max = region
        
        lat_mask = ((initial_data.grid_def.lat_points >= lat_min) & 
                    (initial_data.grid_def.lat_points <= lat_max))
        lon_mask = ((initial_data.grid_def.lon_points >= lon_min) & 
                    (initial_data.grid_def.lon_points <= lon_max))
        
        region_indices = np.ix_(lat_mask, lon_mask)
        
        results = self.simulator.simulate_multi_step(initial_data, num_steps)
        
        return {
            'region': region,
            'num_steps': num_steps,
            'start_time': initial_data.timestamp,
            'end_time': results[-1].timestamp,
            'results': [
                {
                    'timestamp': r.timestamp.isoformat(),
                    'temperature': r.temperature[region_indices].tolist() if r.temperature is not None else None,
                    'humidity': r.humidity[region_indices].tolist() if r.humidity is not None else None,
                    'pressure': r.pressure[region_indices].tolist() if r.pressure is not None else None,
                    'wind_speed': r.wind_speed[region_indices].tolist() if r.wind_speed is not None else None,
                    'wind_direction': r.wind_direction[region_indices].tolist() if r.wind_direction is not None else None,
                    'precipitation': r.precipitation[region_indices].tolist() if r.precipitation is not None else None,
                }
                for r in results
            ],
            'lat_indices': lat_mask.tolist(),
            'lon_indices': lon_mask.tolist(),
        }
