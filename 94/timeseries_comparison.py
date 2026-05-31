import logging
from typing import List, Dict, Optional, Tuple, Union
from datetime import datetime, timedelta
import numpy as np
from dataclasses import dataclass, field
from scipy import stats
from scipy.signal import correlate

from data_models import GridWeatherData, GridDefinition, WeatherVariable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class PeriodComparison:
    variable: str
    period1_start: datetime
    period1_end: datetime
    period2_start: datetime
    period2_end: datetime
    mean_diff: float
    std_diff: float
    max_diff: float
    min_diff: float
    correlation: float
    trend1: float
    trend2: float
    spatial_metrics: Dict = field(default_factory=dict)


@dataclass
class TrendAnalysis:
    variable: str
    start_time: datetime
    end_time: datetime
    total_steps: int
    slope: float
    intercept: float
    r_squared: float
    p_value: float
    std_error: float
    trend_direction: str
    change_percent: float


class TimeSeriesComparer:
    def __init__(self, grid_def: GridDefinition):
        self.grid_def = grid_def

    def split_by_periods(self, data_list: List[GridWeatherData],
                         periods: List[Tuple[datetime, datetime]]) -> List[List[GridWeatherData]]:
        period_data = []
        for start, end in periods:
            period_subset = [
                d for d in data_list
                if start <= d.timestamp <= end
            ]
            period_data.append(period_subset)
            logger.info(f"Period {start} to {end}: {len(period_subset)} time steps")
        return period_data

    def compare_periods(self, data_list: List[GridWeatherData],
                        period1: Tuple[datetime, datetime],
                        period2: Tuple[datetime, datetime],
                        variable: WeatherVariable) -> Optional[PeriodComparison]:
        period_data = self.split_by_periods(data_list, [period1, period2])
        
        if not period_data[0] or not period_data[1]:
            logger.warning("Insufficient data for one or both periods")
            return None
        
        values1 = np.array([getattr(d, variable.value) for d in period_data[0]])
        values2 = np.array([getattr(d, variable.value) for d in period_data[1]])
        
        mean1 = np.nanmean(values1)
        mean2 = np.nanmean(values2)
        std1 = np.nanstd(values1)
        std2 = np.nanstd(values2)
        
        mean_diff = mean2 - mean1
        std_diff = std2 - std1
        
        all_values1 = values1.flatten()
        all_values2 = values2.flatten()
        
        valid_mask = ~np.isnan(all_values1) & ~np.isnan(all_values2)
        if np.sum(valid_mask) > 1:
            v1 = all_values1[valid_mask]
            v2 = all_values2[valid_mask]
            
            max_len = min(len(v1), len(v2))
            correlation = np.corrcoef(v1[:max_len], v2[:max_len])[0, 1] if max_len > 1 else 0
        else:
            correlation = 0
        
        diff = values2[-1] - values1[-1] if len(values1) > 0 and len(values2) > 0 else np.array([])
        
        trend1 = self._calculate_slope(values1)
        trend2 = self._calculate_slope(values2)
        
        spatial_metrics = self._calculate_spatial_metrics(values1, values2)
        
        return PeriodComparison(
            variable=variable.value,
            period1_start=period1[0],
            period1_end=period1[1],
            period2_start=period2[0],
            period2_end=period2[1],
            mean_diff=mean_diff,
            std_diff=std_diff,
            max_diff=np.nanmax(diff) if diff.size > 0 else 0,
            min_diff=np.nanmin(diff) if diff.size > 0 else 0,
            correlation=correlation,
            trend1=trend1,
            trend2=trend2,
            spatial_metrics=spatial_metrics
        )

    def _calculate_slope(self, values: np.ndarray) -> float:
        if values.ndim == 3:
            means = np.nanmean(values, axis=(1, 2))
        else:
            means = np.nanmean(values, axis=tuple(range(1, values.ndim)))
        
        x = np.arange(len(means))
        valid_mask = ~np.isnan(means)
        
        if np.sum(valid_mask) < 2:
            return 0.0
        
        x_valid = x[valid_mask]
        y_valid = means[valid_mask]
        
        slope, _ = np.polyfit(x_valid, y_valid, 1)
        return float(slope)

    def _calculate_spatial_metrics(self, values1: np.ndarray, values2: np.ndarray) -> Dict:
        last1 = values1[-1] if values1.ndim == 3 else values1
        last2 = values2[-1] if values2.ndim == 3 else values2
        
        diff = last2 - last1
        
        metrics = {
            'mean_spatial_diff': float(np.nanmean(diff)),
            'max_spatial_diff': float(np.nanmax(diff)),
            'min_spatial_diff': float(np.nanmin(diff)),
            'std_spatial_diff': float(np.nanstd(diff)),
            'rmse': float(np.sqrt(np.nanmean(diff ** 2))),
            'mae': float(np.nanmean(np.abs(diff))),
        }
        
        lat_size, lon_size = diff.shape
        quarter_lat = lat_size // 2
        quarter_lon = lon_size // 2
        
        metrics['quadrant_diffs'] = {
            'nw': float(np.nanmean(diff[:quarter_lat, :quarter_lon])),
            'ne': float(np.nanmean(diff[:quarter_lat, quarter_lon:])),
            'sw': float(np.nanmean(diff[quarter_lat:, :quarter_lon])),
            'se': float(np.nanmean(diff[quarter_lat:, quarter_lon:])),
        }
        
        return metrics

    def analyze_trend(self, data_list: List[GridWeatherData],
                      variable: WeatherVariable,
                      region: Optional[Tuple[float, float, float, float]] = None) -> Optional[TrendAnalysis]:
        if not data_list:
            return None
        
        if region:
            data_list = self._extract_region(data_list, region)
        
        values = np.array([getattr(d, variable.value) for d in data_list])
        means = np.nanmean(values, axis=(1, 2))
        
        x = np.arange(len(means))
        valid_mask = ~np.isnan(means)
        
        if np.sum(valid_mask) < 3:
            logger.warning("Insufficient valid data for trend analysis")
            return None
        
        x_valid = x[valid_mask]
        y_valid = means[valid_mask]
        
        slope, intercept, r_value, p_value, std_err = stats.linregress(x_valid, y_valid)
        
        if y_valid[0] != 0:
            change_percent = ((y_valid[-1] - y_valid[0]) / abs(y_valid[0])) * 100
        else:
            change_percent = 0
        
        if p_value < 0.05:
            if slope > 0:
                direction = "significant_increase"
            elif slope < 0:
                direction = "significant_decrease"
            else:
                direction = "stable"
        else:
            if slope > 0:
                direction = "increasing"
            elif slope < 0:
                direction = "decreasing"
            else:
                direction = "stable"
        
        return TrendAnalysis(
            variable=variable.value,
            start_time=data_list[0].timestamp,
            end_time=data_list[-1].timestamp,
            total_steps=len(data_list),
            slope=float(slope),
            intercept=float(intercept),
            r_squared=float(r_value ** 2),
            p_value=float(p_value),
            std_error=float(std_err),
            trend_direction=direction,
            change_percent=float(change_percent)
        )

    def _extract_region(self, data_list: List[GridWeatherData],
                        region: Tuple[float, float, float, float]) -> List[GridWeatherData]:
        lat_min, lat_max, lon_min, lon_max = region
        
        lat_mask = (self.grid_def.lat_points >= lat_min) & (self.grid_def.lat_points <= lat_max)
        lon_mask = (self.grid_def.lon_points >= lon_min) & (self.grid_def.lon_points <= lon_max)
        
        region_indices = np.ix_(lat_mask, lon_mask)
        
        result = []
        for data in data_list:
            new_data = GridWeatherData(
                grid_def=GridDefinition(lat_min, lat_max, lon_min, lon_max, self.grid_def.resolution),
                timestamp=data.timestamp
            )
            
            for var in WeatherVariable:
                values = getattr(data, var.value)
                if values is not None:
                    setattr(new_data, var.value, values[region_indices])
            
            result.append(new_data)
        
        return result

    def calculate_anomaly(self, data_list: List[GridWeatherData],
                          variable: WeatherVariable,
                          baseline_period: Tuple[datetime, datetime]) -> List[np.ndarray]:
        baseline_data = [
            d for d in data_list
            if baseline_period[0] <= d.timestamp <= baseline_period[1]
        ]
        
        if not baseline_data:
            logger.warning("No baseline data found")
            return []
        
        baseline_values = np.array([getattr(d, variable.value) for d in baseline_data])
        baseline_mean = np.nanmean(baseline_values, axis=0)
        baseline_std = np.nanstd(baseline_values, axis=0)
        baseline_std = np.where(baseline_std == 0, 1e-10, baseline_std)
        
        anomalies = []
        for data in data_list:
            values = getattr(data, variable.value)
            if values is not None:
                anomaly = (values - baseline_mean) / baseline_std
                anomalies.append(anomaly)
        
        logger.info(f"Calculated anomalies for {len(anomalies)} time steps")
        return anomalies

    def detect_extremes(self, data_list: List[GridWeatherData],
                        variable: WeatherVariable,
                        threshold: float = 2.0) -> List[Dict]:
        anomalies = self.calculate_anomaly(
            data_list, variable,
            (data_list[0].timestamp, data_list[len(data_list) // 2].timestamp)
        )
        
        extremes = []
        for i, anomaly in enumerate(anomalies):
            extreme_mask = np.abs(anomaly) > threshold
            
            if np.any(extreme_mask):
                extreme_positions = np.where(extreme_mask)
                
                extremes.append({
                    'step': i,
                    'timestamp': data_list[i].timestamp.isoformat(),
                    'variable': variable.value,
                    'extreme_count': int(np.sum(extreme_mask)),
                    'max_anomaly': float(np.nanmax(np.abs(anomaly))),
                    'extreme_latitudes': self.grid_def.lat_points[extreme_positions[0]].tolist()[:10],
                    'extreme_longitudes': self.grid_def.lon_points[extreme_positions[1]].tolist()[:10],
                    'extreme_values': anomaly[extreme_mask].tolist()[:10],
                })
        
        logger.info(f"Detected {len(extremes)} time steps with extreme values")
        return extremes

    def compare_multiple_variables(self, data_list: List[GridWeatherData],
                                    period1: Tuple[datetime, datetime],
                                    period2: Tuple[datetime, datetime],
                                    variables: List[WeatherVariable]) -> Dict:
        results = {}
        for var in variables:
            comparison = self.compare_periods(data_list, period1, period2, var)
            if comparison:
                results[var.value] = comparison
        
        return results

    def calculate_diurnal_cycle(self, data_list: List[GridWeatherData],
                                variable: WeatherVariable,
                                hour_start: int = 0, hour_end: int = 23) -> Dict:
        hourly_data = {}
        
        for data in data_list:
            hour = data.timestamp.hour
            if hour_start <= hour <= hour_end:
                if hour not in hourly_data:
                    hourly_data[hour] = []
                
                values = getattr(data, variable.value)
                if values is not None:
                    hourly_data[hour].append(np.nanmean(values))
        
        hourly_stats = {}
        for hour in sorted(hourly_data.keys()):
            values = np.array(hourly_data[hour])
            hourly_stats[hour] = {
                'mean': float(np.mean(values)),
                'std': float(np.std(values)),
                'min': float(np.min(values)),
                'max': float(np.max(values)),
                'count': len(values)
            }
        
        return hourly_stats

    def cross_correlation(self, data_list: List[GridWeatherData],
                          var1: WeatherVariable, var2: WeatherVariable,
                          max_lag: int = 24) -> Dict:
        values1 = np.array([np.nanmean(getattr(d, var1.value)) for d in data_list])
        values2 = np.array([np.nanmean(getattr(d, var2.value)) for d in data_list])
        
        valid_mask = ~np.isnan(values1) & ~np.isnan(values2)
        v1 = values1[valid_mask]
        v2 = values2[valid_mask]
        
        if len(v1) < max_lag + 1:
            return {'error': 'Insufficient data for cross-correlation'}
        
        correlations = correlate(v1 - np.mean(v1), v2 - np.mean(v2), mode='full')
        mid = len(correlations) // 2
        lags = np.arange(-max_lag, max_lag + 1)
        corr_values = correlations[mid - max_lag:mid + max_lag + 1]
        
        max_corr_idx = np.argmax(np.abs(corr_values))
        max_lag = lags[max_corr_idx]
        max_corr = corr_values[max_corr_idx]
        
        return {
            'variable1': var1.value,
            'variable2': var2.value,
            'max_correlation': float(max_corr),
            'lag_at_max': int(max_lag),
            'correlations': corr_values.tolist(),
            'lags': lags.tolist(),
            'zero_lag_correlation': float(np.corrcoef(v1, v2)[0, 1])
        }

    def generate_comparison_report(self, data_list: List[GridWeatherData],
                                    period1: Tuple[datetime, datetime],
                                    period2: Tuple[datetime, datetime]) -> Dict:
        report = {
            'period_comparisons': {},
            'trend_analyses': {},
            'extremes': {},
            'summary': {}
        }
        
        all_vars = list(WeatherVariable)
        
        for var in all_vars:
            comparison = self.compare_periods(data_list, period1, period2, var)
            if comparison:
                report['period_comparisons'][var.value] = {
                    'mean_diff': comparison.mean_diff,
                    'std_diff': comparison.std_diff,
                    'max_diff': comparison.max_diff,
                    'min_diff': comparison.min_diff,
                    'correlation': comparison.correlation,
                    'spatial_rmse': comparison.spatial_metrics.get('rmse', 0)
                }
            
            trend = self.analyze_trend(data_list, var)
            if trend:
                report['trend_analyses'][var.value] = {
                    'slope': trend.slope,
                    'r_squared': trend.r_squared,
                    'p_value': trend.p_value,
                    'direction': trend.trend_direction,
                    'change_percent': trend.change_percent
                }
            
            extremes = self.detect_extremes(data_list, var)
            report['extremes'][var.value] = len(extremes)
        
        report['summary'] = {
            'total_time_steps': len(data_list),
            'period1': f"{period1[0]} to {period1[1]}",
            'period2': f"{period2[0]} to {period2[1]}",
            'analysis_timestamp': datetime.utcnow().isoformat(),
            'grid_resolution': self.grid_def.resolution
        }
        
        return report
