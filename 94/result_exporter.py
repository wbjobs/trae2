import logging
import json
import os
import csv
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import numpy as np

from data_models import GridWeatherData, GridDefinition, WeatherVariable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ResultExporter:
    def __init__(self, grid_def: GridDefinition, output_dir: str = "output"):
        self.grid_def = grid_def
        self.output_dir = output_dir
        self._ensure_output_dir()

    def _ensure_output_dir(self):
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)
            logger.info(f"Created output directory: {self.output_dir}")

    def _prepare_data_dict(self, data: GridWeatherData, include_coords: bool = True) -> Dict:
        result = {
            'timestamp': data.timestamp.isoformat(),
            'grid_def': {
                'lat_min': data.grid_def.lat_min,
                'lat_max': data.grid_def.lat_max,
                'lon_min': data.grid_def.lon_min,
                'lon_max': data.grid_def.lon_max,
                'resolution': data.grid_def.resolution,
                'shape': data.grid_def.shape
            }
        }
        
        for var in WeatherVariable:
            values = getattr(data, var.value)
            if values is not None:
                result[var.value] = {
                    'data': values.tolist(),
                    'min': float(np.nanmin(values)),
                    'max': float(np.nanmax(values)),
                    'mean': float(np.nanmean(values)),
                    'std': float(np.nanstd(values))
                }
        
        if include_coords:
            result['latitude'] = data.grid_def.lat_points.tolist()
            result['longitude'] = data.grid_def.lon_points.tolist()
        
        return result

    def export_to_json(self, data_list: List[GridWeatherData], 
                       filename: Optional[str] = None,
                       variables: Optional[List[WeatherVariable]] = None) -> str:
        if not data_list:
            logger.warning("No data to export")
            return ""
        
        if filename is None:
            filename = f"weather_results_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        
        filepath = os.path.join(self.output_dir, filename)
        
        export_data = {
            'metadata': {
                'export_time': datetime.utcnow().isoformat(),
                'time_steps': len(data_list),
                'variables': [v.value for v in (variables or list(WeatherVariable))],
                'grid_def': {
                    'lat_min': self.grid_def.lat_min,
                    'lat_max': self.grid_def.lat_max,
                    'lon_min': self.grid_def.lon_min,
                    'lon_max': self.grid_def.lon_max,
                    'resolution': self.grid_def.resolution
                }
            },
            'data': [self._prepare_data_dict(d) for d in data_list]
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Exported {len(data_list)} time steps to {filepath}")
        return filepath

    def export_to_csv(self, data_list: List[GridWeatherData],
                      filename: Optional[str] = None,
                      variables: Optional[List[WeatherVariable]] = None,
                      include_coords: bool = True) -> str:
        if not data_list:
            logger.warning("No data to export")
            return ""
        
        if variables is None:
            variables = list(WeatherVariable)
        
        if filename is None:
            filename = f"weather_results_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        
        filepath = os.path.join(self.output_dir, filename)
        
        fieldnames = ['timestamp']
        if include_coords:
            fieldnames.extend(['latitude', 'longitude'])
        fieldnames.extend([v.value for v in variables])
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            
            lat_points = self.grid_def.lat_points
            lon_points = self.grid_def.lon_points
            
            for data in data_list:
                for i, lat in enumerate(lat_points):
                    for j, lon in enumerate(lon_points):
                        row = {'timestamp': data.timestamp.isoformat()}
                        if include_coords:
                            row['latitude'] = lat
                            row['longitude'] = lon
                        
                        for var in variables:
                            values = getattr(data, var.value)
                            if values is not None:
                                value = values[i, j]
                                row[var.value] = None if np.isnan(value) else float(value)
                            else:
                                row[var.value] = None
                        
                        writer.writerow(row)
        
        logger.info(f"Exported {len(data_list)} time steps to {filepath}")
        return filepath

    def export_to_netcdf(self, data_list: List[GridWeatherData],
                         filename: Optional[str] = None,
                         variables: Optional[List[WeatherVariable]] = None) -> str:
        if not data_list:
            logger.warning("No data to export")
            return ""
        
        if variables is None:
            variables = list(WeatherVariable)
        
        if filename is None:
            filename = f"weather_results_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.nc"
        
        filepath = os.path.join(self.output_dir, filename)
        
        try:
            import xarray as xr
            
            timestamps = [d.timestamp for d in data_list]
            latitudes = self.grid_def.lat_points
            longitudes = self.grid_def.lon_points
            
            data_vars = {}
            for var in variables:
                var_data = np.array([getattr(d, var.value) for d in data_list])
                data_vars[var.value] = (['time', 'latitude', 'longitude'], var_data)
            
            ds = xr.Dataset(
                data_vars=data_vars,
                coords={
                    'time': timestamps,
                    'latitude': latitudes,
                    'longitude': longitudes
                },
                attrs={
                    'title': 'Weather Simulation Results',
                    'institution': 'Weather Simulation System',
                    'creation_date': datetime.utcnow().isoformat(),
                    'grid_resolution': self.grid_def.resolution
                }
            )
            
            ds.to_netcdf(filepath)
            logger.info(f"Exported {len(data_list)} time steps to {filepath}")
            
        except ImportError:
            logger.warning("xarray/netCDF4 not available, using alternative approach")
            self._export_to_netcdf_manual(data_list, filepath, variables)
        
        return filepath

    def _export_to_netcdf_manual(self, data_list: List[GridWeatherData],
                                  filepath: str,
                                  variables: List[WeatherVariable]):
        try:
            from netCDF4 import Dataset
            
            timestamps = [d.timestamp for d in data_list]
            latitudes = self.grid_def.lat_points
            longitudes = self.grid_def.lon_points
            
            with Dataset(filepath, 'w', format='NETCDF4') as ds:
                ds.createDimension('time', len(timestamps))
                ds.createDimension('latitude', len(latitudes))
                ds.createDimension('longitude', len(longitudes))
                
                time_var = ds.createVariable('time', 'f8', ('time',))
                time_var.units = 'hours since 1970-01-01 00:00:00'
                time_var.calendar = 'gregorian'
                
                lat_var = ds.createVariable('latitude', 'f4', ('latitude',))
                lat_var.units = 'degrees_north'
                
                lon_var = ds.createVariable('longitude', 'f4', ('longitude',))
                lon_var.units = 'degrees_east'
                
                time_var[:] = [(t - datetime(1970, 1, 1)).total_seconds() / 3600 for t in timestamps]
                lat_var[:] = latitudes
                lon_var[:] = longitudes
                
                for var in variables:
                    var_data = np.array([getattr(d, var.value) for d in data_list])
                    nc_var = ds.createVariable(var.value, 'f4', ('time', 'latitude', 'longitude'),
                                               fill_value=np.nan)
                    nc_var.units = self._get_variable_units(var)
                    nc_var[:] = var_data
                
                ds.title = 'Weather Simulation Results'
                ds.institution = 'Weather Simulation System'
                ds.creation_date = datetime.utcnow().isoformat()
            
            logger.info(f"Exported {len(data_list)} time steps to {filepath}")
            
        except ImportError:
            logger.error("netCDF4 not available. Please install with: pip install netCDF4")

    def _get_variable_units(self, variable: WeatherVariable) -> str:
        units = {
            WeatherVariable.TEMPERATURE: 'degrees_Celsius',
            WeatherVariable.HUMIDITY: 'percent',
            WeatherVariable.PRESSURE: 'hPa',
            WeatherVariable.WIND_SPEED: 'm s-1',
            WeatherVariable.WIND_DIRECTION: 'degrees',
            WeatherVariable.PRECIPITATION: 'mm'
        }
        return units.get(variable, '1')

    def export_to_geotiff(self, data: GridWeatherData,
                          variable: WeatherVariable,
                          filename: Optional[str] = None) -> str:
        if filename is None:
            timestamp_str = data.timestamp.strftime('%Y%m%d_%H%M%S')
            filename = f"weather_{variable.value}_{timestamp_str}.tif"
        
        filepath = os.path.join(self.output_dir, filename)
        
        try:
            from osgeo import gdal, osr
            
            values = getattr(data, variable.value)
            if values is None:
                logger.warning(f"No data for variable {variable.value}")
                return ""
            
            driver = gdal.GetDriverByName('GTiff')
            rows, cols = values.shape
            
            dataset = driver.Create(filepath, cols, rows, 1, gdal.GDT_Float32)
            
            lon_min = self.grid_def.lon_min
            lon_max = self.grid_def.lon_max
            lat_min = self.grid_def.lat_min
            lat_max = self.grid_def.lat_max
            
            lon_res = (lon_max - lon_min) / (cols - 1) if cols > 1 else self.grid_def.resolution
            lat_res = (lat_max - lat_min) / (rows - 1) if rows > 1 else self.grid_def.resolution
            
            geotransform = (lon_min - lon_res/2, lon_res, 0, 
                           lat_max + lat_res/2, 0, -lat_res)
            
            dataset.SetGeoTransform(geotransform)
            
            srs = osr.SpatialReference()
            srs.ImportFromEPSG(4326)
            dataset.SetProjection(srs.ExportToWkt())
            
            band = dataset.GetRasterBand(1)
            band.SetNoDataValue(np.nan)
            band.WriteArray(values)
            band.SetDescription(variable.value)
            
            dataset.SetMetadata({
                'TIMESTAMP': data.timestamp.isoformat(),
                'VARIABLE': variable.value,
                'UNITS': self._get_variable_units(variable)
            })
            
            band.FlushCache()
            dataset = None
            
            logger.info(f"Exported {variable.value} to {filepath}")
            
        except ImportError:
            logger.warning("GDAL not available. Please install with: pip install gdal")
            filepath = self._export_to_geotiff_ascii(data, variable, filepath)
        
        return filepath

    def _export_to_geotiff_ascii(self, data: GridWeatherData,
                                  variable: WeatherVariable,
                                  filepath: str) -> str:
        ascii_path = filepath.replace('.tif', '.asc')
        
        values = getattr(data, variable.value)
        if values is None:
            return ""
        
        rows, cols = values.shape
        lon_min = self.grid_def.lon_min
        lat_max = self.grid_def.lat_max
        cell_size = self.grid_def.resolution
        
        with open(ascii_path, 'w') as f:
            f.write(f"ncols         {cols}\n")
            f.write(f"nrows         {rows}\n")
            f.write(f"xllcorner     {lon_min - cell_size/2:.6f}\n")
            f.write(f"yllcorner     {lat_max - rows * cell_size + cell_size/2:.6f}\n")
            f.write(f"cellsize      {cell_size:.6f}\n")
            f.write(f"NODATA_value  -9999\n")
            
            for i in range(rows):
                row_data = []
                for j in range(cols):
                    val = values[i, j]
                    if np.isnan(val):
                        row_data.append('-9999')
                    else:
                        row_data.append(f"{val:.3f}")
                f.write(' '.join(row_data) + '\n')
        
        logger.info(f"Exported {variable.value} to ASCII grid {ascii_path}")
        return ascii_path

    def export_variable_series(self, data_list: List[GridWeatherData],
                                variable: WeatherVariable,
                                latitude: float, longitude: float,
                                filename: Optional[str] = None) -> str:
        if not data_list:
            return ""
        
        if filename is None:
            filename = f"timeseries_{variable.value}_{latitude}_{longitude}.csv"
        
        filepath = os.path.join(self.output_dir, filename)
        
        lat_idx = np.argmin(np.abs(self.grid_def.lat_points - latitude))
        lon_idx = np.argmin(np.abs(self.grid_def.lon_points - longitude))
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['timestamp', 'value', 'latitude', 'longitude'])
            
            for data in data_list:
                values = getattr(data, variable.value)
                if values is not None:
                    value = values[lat_idx, lon_idx]
                    writer.writerow([
                        data.timestamp.isoformat(),
                        None if np.isnan(value) else value,
                        self.grid_def.lat_points[lat_idx],
                        self.grid_def.lon_points[lon_idx]
                    ])
        
        logger.info(f"Exported time series to {filepath}")
        return filepath

    def export_summary(self, data_list: List[GridWeatherData],
                       filename: Optional[str] = None) -> str:
        if not data_list:
            return ""
        
        if filename is None:
            filename = f"summary_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        
        filepath = os.path.join(self.output_dir, filename)
        
        summary = {
            'metadata': {
                'export_time': datetime.utcnow().isoformat(),
                'time_steps': len(data_list),
                'start_time': data_list[0].timestamp.isoformat(),
                'end_time': data_list[-1].timestamp.isoformat(),
                'grid_def': {
                    'lat_min': self.grid_def.lat_min,
                    'lat_max': self.grid_def.lat_max,
                    'lon_min': self.grid_def.lon_min,
                    'lon_max': self.grid_def.lon_max,
                    'resolution': self.grid_def.resolution,
                    'shape': self.grid_def.shape
                }
            },
            'variables': {}
        }
        
        for var in WeatherVariable:
            all_values = []
            time_means = []
            
            for data in data_list:
                values = getattr(data, var.value)
                if values is not None:
                    all_values.append(values.flatten())
                    time_means.append(np.nanmean(values))
            
            if all_values:
                all_values_flat = np.concatenate(all_values)
                valid_values = all_values_flat[~np.isnan(all_values_flat)]
                time_means_arr = np.array(time_means)
                
                summary['variables'][var.value] = {
                    'units': self._get_variable_units(var),
                    'overall_min': float(np.min(valid_values)),
                    'overall_max': float(np.max(valid_values)),
                    'overall_mean': float(np.mean(valid_values)),
                    'overall_std': float(np.std(valid_values)),
                    'time_mean_min': float(np.min(time_means_arr)),
                    'time_mean_max': float(np.max(time_means_arr)),
                    'time_mean_std': float(np.std(time_means_arr)),
                    'trend': float(np.polyfit(range(len(time_means_arr)), time_means_arr, 1)[0])
                }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)
        
        logger.info(f"Exported summary to {filepath}")
        return filepath

    def export_batch(self, data_list: List[GridWeatherData],
                     formats: List[str] = ['json', 'csv', 'netcdf'],
                     output_prefix: str = "weather_results") -> Dict[str, str]:
        results = {}
        
        for fmt in formats:
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = f"{output_prefix}_{timestamp}"
            
            if fmt.lower() == 'json':
                results['json'] = self.export_to_json(data_list, f"{filename}.json")
            elif fmt.lower() == 'csv':
                results['csv'] = self.export_to_csv(data_list, f"{filename}.csv")
            elif fmt.lower() == 'netcdf' or fmt.lower() == 'nc':
                results['netcdf'] = self.export_to_netcdf(data_list, f"{filename}.nc")
        
        if 'geotiff' in [f.lower() for f in formats] and data_list:
            for var in WeatherVariable:
                tif_file = self.export_to_geotiff(data_list[-1], var, 
                                                   f"{output_prefix}_{var.value}_{timestamp}.tif")
                if tif_file:
                    results[f'geotiff_{var.value}'] = tif_file
        
        return results
