import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
import logging
from scipy import stats

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TrendAnalyzer:
    def __init__(self):
        self.change_point_methods = {
            'cusum': self._cusum_change_point,
            'pettitt': self._pettitt_test,
            'rolling_slope': self._rolling_slope_change
        }

    def analyze_trend_changes(
        self,
        df: pd.DataFrame,
        value_col: str = 'cleaned_value',
        time_col: str = 'collect_time',
        window: int = 7,
        threshold: float = 2.0
    ) -> Dict:
        if df.empty or len(df) < window * 2:
            return {'has_changes': False, 'change_points': [], 'trend_segments': []}

        df = df.sort_values(time_col).copy()
        
        change_points = []
        trend_segments = []
        
        values = df[value_col].values
        times = df[time_col].values
        
        overall_trend = self._calculate_trend_slope(values)
        
        rolling_slopes = self._calculate_rolling_slope(values, window)
        
        significant_changes = self._detect_significant_changes(rolling_slopes, threshold)
        
        if len(significant_changes) > 0:
            segments = self._split_into_segments(values, significant_changes)
            
            for i, seg in enumerate(segments):
                start_idx, end_idx = seg
                segment_trend = self._calculate_trend_slope(values[start_idx:end_idx])
                trend_segments.append({
                    'segment_index': i,
                    'start_time': str(times[start_idx]),
                    'end_time': str(times[end_idx - 1]),
                    'start_value': float(values[start_idx]),
                    'end_value': float(values[end_idx - 1]),
                    'slope': float(segment_trend),
                    'trend_direction': self._get_trend_direction(segment_trend),
                    'data_points': end_idx - start_idx
                })
            
            for idx in significant_changes:
                if idx > 0 and idx < len(values) - 1:
                    before_avg = np.mean(values[max(0, idx - window):idx])
                    after_avg = np.mean(values[idx:min(len(values), idx + window)])
                    change_magnitude = abs(after_avg - before_avg) / (before_avg + 1e-6) * 100
                    
                    change_points.append({
                        'time': str(times[idx]),
                        'index': int(idx),
                        'before_value': float(values[idx - 1]) if idx > 0 else float(values[idx]),
                        'after_value': float(values[idx]),
                        'before_avg': float(before_avg),
                        'after_avg': float(after_avg),
                        'change_percent': float(change_magnitude),
                        'severity': self._get_severity(change_magnitude),
                        'slope_change': float(rolling_slopes[idx] - rolling_slopes[max(0, idx - 1)])
                    })

        return {
            'has_changes': len(change_points) > 0,
            'overall_trend': {
                'slope': float(overall_trend),
                'direction': self._get_trend_direction(overall_trend),
                'start_value': float(values[0]),
                'end_value': float(values[-1]),
                'total_change_percent': float((values[-1] - values[0]) / (values[0] + 1e-6) * 100)
            },
            'change_points': change_points,
            'trend_segments': trend_segments,
            'rolling_slopes': rolling_slopes.tolist() if len(rolling_slopes) > 0 else []
        }

    def _cusum_change_point(self, values: np.ndarray, threshold: float = 2.0) -> List[int]:
        mean = np.mean(values)
        std = np.std(values) + 1e-6
        
        cusum_pos = np.zeros(len(values))
        cusum_neg = np.zeros(len(values))
        
        for i in range(1, len(values)):
            cusum_pos[i] = max(0, cusum_pos[i - 1] + (values[i] - mean) / std - 0.5)
            cusum_neg[i] = min(0, cusum_neg[i - 1] + (values[i] - mean) / std + 0.5)
        
        change_points = []
        for i in range(len(values)):
            if abs(cusum_pos[i]) > threshold or abs(cusum_neg[i]) > threshold:
                if not change_points or i - change_points[-1] > 5:
                    change_points.append(i)
        
        return change_points

    def _pettitt_test(self, values: np.ndarray) -> int:
        n = len(values)
        ranks = stats.rankdata(values)
        
        U = np.zeros((n, n))
        for i in range(n):
            for j in range(i + 1, n):
                U[i, j] = np.sign(ranks[j] - ranks[i])
        
        k = np.cumsum(np.sum(U, axis=1))
        change_point = np.argmax(np.abs(k))
        
        return change_point if np.max(np.abs(k)) > 0 else -1

    def _rolling_slope_change(self, values: np.ndarray, window: int = 7, threshold: float = 2.0) -> List[int]:
        slopes = self._calculate_rolling_slope(values, window)
        slope_changes = np.abs(np.diff(slopes))
        std_change = np.std(slope_changes) + 1e-6
        
        change_points = []
        for i in range(1, len(slope_changes)):
            if slope_changes[i] > threshold * std_change:
                if not change_points or i - change_points[-1] > window:
                    change_points.append(i + window)
        
        return change_points

    def _calculate_trend_slope(self, values: np.ndarray) -> float:
        if len(values) < 2:
            return 0.0
        
        x = np.arange(len(values))
        slope, _, _, _, _ = stats.linregress(x, values)
        
        return slope

    def _calculate_rolling_slope(self, values: np.ndarray, window: int = 7) -> np.ndarray:
        n = len(values)
        slopes = np.zeros(n)
        
        for i in range(n):
            start = max(0, i - window + 1)
            end = i + 1
            if end - start >= 3:
                x = np.arange(end - start)
                slope, _, _, _, _ = stats.linregress(x, values[start:end])
                slopes[i] = slope
            else:
                slopes[i] = slopes[i - 1] if i > 0 else 0.0
        
        return slopes

    def _detect_significant_changes(self, slopes: np.ndarray, threshold: float = 2.0) -> List[int]:
        if len(slopes) < 3:
            return []
        
        slope_diffs = np.abs(np.diff(slopes))
        mean_diff = np.mean(slope_diffs)
        std_diff = np.std(slope_diffs) + 1e-6
        
        z_scores = (slope_diffs - mean_diff) / std_diff
        
        change_indices = np.where(z_scores > threshold)[0] + 1
        
        filtered = []
        min_distance = 5
        for idx in change_indices:
            if not filtered or idx - filtered[-1] >= min_distance:
                filtered.append(int(idx))
        
        return filtered

    def _split_into_segments(self, values: np.ndarray, change_points: List[int]) -> List[Tuple[int, int]]:
        if not change_points:
            return [(0, len(values))]
        
        segments = []
        prev = 0
        
        for cp in change_points:
            if cp - prev >= 3:
                segments.append((prev, cp))
                prev = cp
        
        if len(values) - prev >= 3:
            segments.append((prev, len(values)))
        
        return segments

    def _get_trend_direction(self, slope: float) -> str:
        if abs(slope) < 1e-6:
            return 'stable'
        elif slope > 0:
            return 'increasing'
        else:
            return 'decreasing'

    def _get_severity(self, change_percent: float) -> str:
        if change_percent < 5:
            return 'low'
        elif change_percent < 15:
            return 'medium'
        elif change_percent < 30:
            return 'high'
        else:
            return 'critical'

    def detect_abnormal_trend(
        self,
        df: pd.DataFrame,
        value_col: str = 'cleaned_value',
        time_col: str = 'collect_time',
        lookback_periods: int = 24,
        alert_threshold: float = 2.0
    ) -> Dict:
        if df.empty or len(df) < lookback_periods:
            return {'is_abnormal': False, 'alerts': []}

        df = df.sort_values(time_col).copy()
        values = df[value_col].values
        times = df[time_col].values
        
        alerts = []
        
        mean = np.mean(values[:-1]) if len(values) > 1 else np.mean(values)
        std = np.std(values[:-1]) + 1e-6
        
        recent_values = values[-lookback_periods:] if len(values) >= lookback_periods else values
        
        z_scores = np.abs((recent_values - mean) / std)
        abnormal_indices = np.where(z_scores > alert_threshold)[0]
        
        for idx in abnormal_indices:
            actual_idx = len(values) - len(recent_values) + idx
            alerts.append({
                'time': str(times[actual_idx]),
                'value': float(values[actual_idx]),
                'expected_mean': float(mean),
                'expected_std': float(std),
                'z_score': float(z_scores[idx]),
                'deviation_percent': float((values[actual_idx] - mean) / (mean + 1e-6) * 100),
                'alert_type': 'statistical_deviation'
            })
        
        if len(values) >= 2:
            recent_trend = self._calculate_trend_slope(values[-lookback_periods:])
            historical_trend = self._calculate_trend_slope(values[:-lookback_periods])
            
            if abs(recent_trend) > abs(historical_trend) * 3 and abs(recent_trend) > 1e-6:
                alerts.append({
                    'time': str(times[-1]),
                    'value': float(values[-1]),
                    'recent_trend': float(recent_trend),
                    'historical_trend': float(historical_trend),
                    'trend_ratio': float(abs(recent_trend) / (abs(historical_trend) + 1e-6)),
                    'alert_type': 'sudden_trend_change'
                })
        
        return {
            'is_abnormal': len(alerts) > 0,
            'baseline': {
                'mean': float(mean),
                'std': float(std),
                'historical_trend': float(historical_trend) if len(values) >= 2 else 0.0
            },
            'alerts': alerts,
            'alert_count': len(alerts)
        }

    def analyze_metric_anomaly(
        self,
        df: pd.DataFrame,
        value_col: str = 'cleaned_value',
        time_col: str = 'collect_time'
    ) -> Dict:
        if df.empty:
            return {'anomaly_score': 0.0, 'risk_level': 'low', 'details': {}}

        values = df[value_col].values
        
        std = np.std(values) + 1e-6
        mean = np.mean(values)
        
        outliers = np.abs(values - mean) > 2 * std
        outlier_ratio = np.sum(outliers) / len(values)
        
        trend_slope = self._calculate_trend_slope(values)
        normalized_slope = abs(trend_slope) / (std + 1e-6)
        
        volatility = std / (abs(mean) + 1e-6)
        
        anomaly_score = (outlier_ratio * 50 + normalized_slope * 30 + min(volatility * 10, 20))
        
        if anomaly_score > 80:
            risk_level = 'critical'
        elif anomaly_score > 60:
            risk_level = 'high'
        elif anomaly_score > 40:
            risk_level = 'medium'
        elif anomaly_score > 20:
            risk_level = 'low'
        else:
            risk_level = 'normal'

        return {
            'anomaly_score': float(min(anomaly_score, 100)),
            'risk_level': risk_level,
            'details': {
                'outlier_ratio': float(outlier_ratio),
                'trend_slope': float(trend_slope),
                'volatility': float(volatility),
                'normalized_slope': float(normalized_slope)
            }
        }


trend_analyzer = TrendAnalyzer()
