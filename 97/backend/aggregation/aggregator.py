import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class MetricAggregator:
    def __init__(self):
        self.agg_periods = {
            'minute': 'min',
            '5_minute': '5min',
            '15_minute': '15min',
            'hour': 'h',
            '4_hour': '4h',
            'day': 'D',
            'week': 'W',
            'month': 'ME'
        }

    def aggregate_metrics(self, df: pd.DataFrame, period: str = 'hour') -> pd.DataFrame:
        if df.empty:
            return df

        df = df.copy()
        df['collect_time'] = pd.to_datetime(df['collect_time'])
        
        df = df.sort_values(['device_id', 'metric_name', 'collect_time'])
        
        agg_period = self.agg_periods.get(period, 'H')
        
        result = df.groupby([
            'device_id',
            'metric_name',
            pd.Grouper(key='collect_time', freq=agg_period)
        ]).agg({
            'cleaned_value': ['mean', 'max', 'min', 'std', 'count', 'sum']
        }).reset_index()
        
        result.columns = [
            'device_id', 'metric_name', 'agg_time',
            'avg_value', 'max_value', 'min_value', 'std_value',
            'count_value', 'sum_value'
        ]
        
        result['agg_period'] = period
        
        result = self._add_anomaly_counts(result, df, period)
        
        result = self._detect_aggregated_anomalies(result)
        
        return result

    def _add_anomaly_counts(self, result_df: pd.DataFrame, source_df: pd.DataFrame, period: str) -> pd.DataFrame:
        if 'is_outlier' not in source_df.columns:
            result_df['anomaly_count'] = 0
            return result_df
        
        agg_period = self.agg_periods.get(period, 'H')
        
        anomaly_df = source_df[source_df['is_outlier']].copy()
        if anomaly_df.empty:
            result_df['anomaly_count'] = 0
            return result_df
        
        anomaly_counts = anomaly_df.groupby([
            'device_id',
            'metric_name',
            pd.Grouper(key='collect_time', freq=agg_period)
        ]).size().reset_index(name='anomaly_count')
        
        anomaly_counts = anomaly_counts.rename(columns={'collect_time': 'agg_time'})
        
        result_df = result_df.merge(
            anomaly_counts,
            on=['device_id', 'metric_name', 'agg_time'],
            how='left'
        )
        result_df['anomaly_count'] = result_df['anomaly_count'].fillna(0).astype(int)
        
        return result_df

    def _detect_aggregated_anomalies(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df['is_anomaly'] = False
        df['anomaly_score'] = 0.0
        
        for (device_id, metric_name), group in df.groupby(['device_id', 'metric_name']):
            idx = group.index
            
            anomaly_scores = self._calculate_anomaly_score(group)
            
            df.loc[idx, 'anomaly_score'] = anomaly_scores
            df.loc[idx, 'is_anomaly'] = anomaly_scores > 0.8
        
        return df

    def _calculate_anomaly_score(self, group: pd.DataFrame) -> pd.Series:
        scores = pd.Series(0.0, index=group.index)
        
        mean_val = group['avg_value'].mean()
        std_val = group['std_value'].mean()
        
        if std_val == 0 or pd.isna(std_val):
            return scores
        
        z_scores = (group['avg_value'] - mean_val) / std_val
        volatility = group['std_value'] / mean_val if mean_val != 0 else 0
        
        scores = (abs(z_scores) * 0.6 + (volatility > 0.5).astype(float) * 0.4)
        
        return scores.clip(0, 1)

    def get_device_summary(self, df: pd.DataFrame) -> Dict:
        if df.empty:
            return {}
        
        summary = {
            'total_devices': int(df['device_id'].nunique()),
            'total_metrics': int(df['metric_name'].nunique()),
            'total_records': int(len(df)),
            'time_range': {
                'start': str(df['collect_time'].min()) if not df['collect_time'].empty else None,
                'end': str(df['collect_time'].max()) if not df['collect_time'].empty else None
            },
            'device_stats': {}
        }
        
        for device_id, group in df.groupby('device_id'):
            summary['device_stats'][device_id] = {
                'metrics': group['metric_name'].unique().tolist(),
                'record_count': int(len(group)),
                'anomaly_count': int(group.get('is_outlier', pd.Series([False])).sum()),
                'value_range': {
                    'avg': float(group['cleaned_value'].mean()),
                    'min': float(group['cleaned_value'].min()),
                    'max': float(group['cleaned_value'].max())
                }
            }
        
        return summary

    def calculate_trend_analysis(self, df: pd.DataFrame, window: int = 7) -> pd.DataFrame:
        df = df.copy()
        df = df.sort_values(['device_id', 'metric_name', 'agg_time'])
        
        for (device_id, metric_name), group in df.groupby(['device_id', 'metric_name']):
            idx = group.index
            
            def calculate_trend(x):
                if len(x) < 2:
                    return 0
                return np.polyfit(range(len(x)), x, 1)[0]
            
            df.loc[idx, 'trend'] = group['avg_value'].rolling(
                window=window, min_periods=1
            ).apply(calculate_trend)
            
            df.loc[idx, 'trend_direction'] = df.loc[idx, 'trend'].apply(
                lambda x: 'increasing' if x > 0 else 'decreasing' if x < 0 else 'stable'
            )
        
        return df

    def get_dashboard_stats(self, df: pd.DataFrame) -> Dict:
        if df.empty:
            return {}
        
        has_anomaly = 'is_anomaly' in df.columns
        has_score = 'anomaly_score' in df.columns
        
        return {
            'total_anomalies': int(df['is_anomaly'].sum()) if has_anomaly else 0,
            'anomaly_rate': float(df['is_anomaly'].mean() * 100) if has_anomaly else 0,
            'devices_with_anomalies': int(df[df['is_anomaly']]['device_id'].nunique()) if has_anomaly else 0,
            'avg_anomaly_score': float(df['anomaly_score'].mean()) if has_score else 0,
            'metrics_distribution': df.groupby('metric_name')['avg_value'].mean().to_dict()
        }


aggregator = MetricAggregator()
