import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
import re
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DataCleaner:
    def __init__(self):
        self.cleaning_methods = {
            'remove_outliers': self._remove_outliers,
            'fill_missing': self._fill_missing_values,
            'smooth': self._smooth_data,
            'normalize': self._normalize_data
        }
        
        self.metric_ranges = {
            'temperature': {'min': -50, 'max': 200, 'unit': '°C'},
            'vibration': {'min': 0, 'max': 100, 'unit': 'mm/s'},
            'pressure': {'min': 0, 'max': 100, 'unit': 'MPa'},
            'current': {'min': 0, 'max': 5000, 'unit': 'A'},
            'voltage': {'min': 0, 'max': 5000, 'unit': 'V'},
            'power': {'min': 0, 'max': 10000, 'unit': 'kW'},
            'rpm': {'min': 0, 'max': 50000, 'unit': 'rpm'},
            'flow_rate': {'min': 0, 'max': 10000, 'unit': 'm³/h'},
            'humidity': {'min': 0, 'max': 100, 'unit': '%'},
            'air_flow': {'min': 0, 'max': 10000, 'unit': 'm³/min'}
        }

    def clean_data(self, df: pd.DataFrame, config: Optional[Dict] = None) -> pd.DataFrame:
        if df.empty:
            return df

        config = config or {}
        result_df = df.copy()
        
        result_df = self._filter_irregular_data(result_df, config)
        result_df = self._validate_data_types(result_df)
        result_df = self._remove_duplicates(result_df)
        result_df = self._handle_missing_values(result_df, config.get('missing_strategy', 'interpolate'))
        result_df = self._detect_and_handle_outliers(result_df, config.get('outlier_method', 'iqr'))
        result_df = self._smooth_data(result_df, config.get('smooth_method', 'rolling'))
        
        result_df['cleaning_method'] = '|'.join([k for k, v in config.items() if v]) or 'default'
        
        logger.info(f"数据清洗完成: 原始 {len(df)} 条, 清洗后 {len(result_df)} 条")
        
        return result_df

    def _filter_irregular_data(self, df: pd.DataFrame, config: Optional[Dict] = None) -> pd.DataFrame:
        df = df.copy()
        initial_count = len(df)
        
        df['filter_reason'] = ''
        
        df = self._filter_invalid_device_id(df)
        df = self._filter_invalid_metric_name(df)
        df = self._filter_invalid_time(df)
        df = self._filter_extreme_values(df)
        df = self._filter_invalid_numeric(df)
        df = self._filter_garbage_text(df)
        
        filtered_count = initial_count - len(df)
        if filtered_count > 0:
            logger.info(f"过滤不规则脏数据: {filtered_count} 条")
        
        return df

    def _filter_invalid_device_id(self, df: pd.DataFrame) -> pd.DataFrame:
        if 'device_id' not in df.columns:
            return df
        
        invalid_mask = df['device_id'].isna()
        if not invalid_mask.all():
            valid_pattern = r'^[A-Za-z0-9_\-]+$'
            invalid_mask = ~df['device_id'].astype(str).str.match(valid_pattern, na=True)
        
        if invalid_mask.sum() > 0:
            df.loc[invalid_mask, 'filter_reason'] = 'invalid_device_id'
            logger.info(f"  - 无效设备ID: {invalid_mask.sum()} 条")
            df = df[~invalid_mask]
        
        return df

    def _filter_invalid_metric_name(self, df: pd.DataFrame) -> pd.DataFrame:
        if 'metric_name' not in df.columns:
            return df
        
        invalid_mask = df['metric_name'].isna()
        if not invalid_mask.all() and len(self.metric_ranges) > 0:
            valid_metrics = set(self.metric_ranges.keys())
            invalid_mask = ~df['metric_name'].isin(valid_metrics)
        
        if invalid_mask.sum() > 0:
            df.loc[invalid_mask, 'filter_reason'] = 'invalid_metric_name'
            logger.info(f"  - 无效指标名称: {invalid_mask.sum()} 条")
            df = df[~invalid_mask]
        
        return df

    def _filter_invalid_time(self, df: pd.DataFrame) -> pd.DataFrame:
        if 'collect_time' not in df.columns:
            return df
        
        df['collect_time_temp'] = pd.to_datetime(df['collect_time'], errors='coerce')
        
        invalid_mask = df['collect_time_temp'].isna()
        
        now = pd.Timestamp.now()
        future_mask = df['collect_time_temp'] > now + timedelta(days=1)
        too_old_mask = df['collect_time_temp'] < now - timedelta(days=365 * 5)
        
        invalid_mask = invalid_mask | future_mask | too_old_mask
        
        if invalid_mask.sum() > 0:
            df.loc[invalid_mask, 'filter_reason'] = 'invalid_time'
            logger.info(f"  - 无效时间戳: {invalid_mask.sum()} 条")
            df = df[~invalid_mask].copy()
        
        df.loc[:, 'collect_time'] = df['collect_time_temp']
        df = df.drop(columns=['collect_time_temp'])
        
        return df

    def _filter_extreme_values(self, df: pd.DataFrame) -> pd.DataFrame:
        if 'metric_name' not in df.columns or 'metric_value' not in df.columns:
            return df
        
        extreme_mask = pd.Series([False] * len(df), index=df.index)
        
        for metric_name, range_info in self.metric_ranges.items():
            metric_mask = df['metric_name'] == metric_name
            if metric_mask.any():
                metric_values = pd.to_numeric(df.loc[metric_mask, 'metric_value'], errors='coerce')
                out_of_range = (metric_values < range_info['min']) | (metric_values > range_info['max'])
                extreme_mask.loc[metric_mask] = out_of_range.values
        
        if extreme_mask.sum() > 0:
            df.loc[extreme_mask, 'filter_reason'] = 'value_out_of_range'
            logger.info(f"  - 超出物理范围: {extreme_mask.sum()} 条")
            df = df[~extreme_mask]
        
        return df

    def _filter_invalid_numeric(self, df: pd.DataFrame) -> pd.DataFrame:
        if 'metric_value' not in df.columns:
            return df
        
        numeric_values = pd.to_numeric(df['metric_value'], errors='coerce')
        invalid_mask = numeric_values.isna() | np.isinf(numeric_values)
        
        if invalid_mask.sum() > 0:
            df.loc[invalid_mask, 'filter_reason'] = 'invalid_numeric'
            logger.info(f"  - 无效数值: {invalid_mask.sum()} 条")
            df = df[~invalid_mask].copy()
        
        df.loc[:, 'metric_value'] = numeric_values[~invalid_mask].values
        
        return df

    def _filter_garbage_text(self, df: pd.DataFrame) -> pd.DataFrame:
        text_columns = ['device_id', 'device_name', 'metric_name', 'location']
        garbage_patterns = [
            r'^[^\w\s\u4e00-\u9fa5]+$',
            r'^[?！。，；：""''（）]+$',
            r'^[a-zA-Z]{20,}$',
            r'^null$|^undefined$|^none$',
            r'^[<>]+$'
        ]
        
        combined_pattern = '|'.join(garbage_patterns)
        
        for col in text_columns:
            if col in df.columns:
                garbage_mask = df[col].astype(str).str.strip().str.match(combined_pattern, case=False, na=True)
                if garbage_mask.sum() > 0:
                    df.loc[garbage_mask, 'filter_reason'] = f'garbage_text_in_{col}'
                    df = df[~garbage_mask]
        
        return df

    def _validate_data_types(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        
        if 'collect_time' in df.columns:
            df['collect_time'] = pd.to_datetime(df['collect_time'], errors='coerce')
        
        if 'metric_value' in df.columns:
            df['metric_value'] = pd.to_numeric(df['metric_value'], errors='coerce')
        
        return df

    def _remove_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        initial_count = len(df)
        df = df.drop_duplicates(subset=['device_id', 'metric_name', 'collect_time'], keep='last')
        removed_count = initial_count - len(df)
        if removed_count > 0:
            logger.info(f"移除重复数据: {removed_count} 条")
        return df

    def _handle_missing_values(self, df: pd.DataFrame, strategy: str = 'interpolate') -> pd.DataFrame:
        df = df.copy()
        
        df['is_outlier'] = False
        df['outlier_reason'] = ''
        
        missing_mask = df['metric_value'].isna()
        
        if strategy == 'drop':
            df = df.dropna(subset=['metric_value'])
        elif strategy == 'ffill':
            df['metric_value'] = df['metric_value'].fillna(method='ffill')
        elif strategy == 'bfill':
            df['metric_value'] = df['metric_value'].fillna(method='bfill')
        elif strategy == 'mean':
            df['metric_value'] = df['metric_value'].fillna(df['metric_value'].mean())
        elif strategy == 'median':
            df['metric_value'] = df['metric_value'].fillna(df['metric_value'].median())
        elif strategy == 'interpolate':
            df = df.sort_values(['device_id', 'metric_name', 'collect_time'])
            for (device_id, metric_name), group in df.groupby(['device_id', 'metric_name']):
                idx = group.index
                group_with_index = group.set_index('collect_time')
                interpolated = group_with_index['metric_value'].interpolate(method='time', limit_direction='both')
                df.loc[idx, 'metric_value'] = interpolated.values
        
        df['cleaned_value'] = df['metric_value']
        
        return df

    def _detect_and_handle_outliers(self, df: pd.DataFrame, method: str = 'iqr') -> pd.DataFrame:
        df = df.copy()
        df = df.sort_values(['device_id', 'metric_name', 'collect_time'])
        
        for (device_id, metric_name), group in df.groupby(['device_id', 'metric_name']):
            idx = group.index
            
            if method == 'iqr':
                outliers = self._iqr_outliers(group['metric_value'])
            elif method == 'zscore':
                outliers = self._zscore_outliers(group['metric_value'])
            elif method == 'isolation_forest':
                outliers = self._isolation_forest_outliers(group['metric_value'])
            else:
                outliers = pd.Series([False] * len(group), index=idx)
            
            df.loc[idx[outliers], 'is_outlier'] = True
            df.loc[idx[outliers], 'outlier_reason'] = f'{method}_outlier'
            
            median_value = group['metric_value'].median()
            df.loc[idx[outliers], 'cleaned_value'] = median_value
        
        outlier_count = df['is_outlier'].sum()
        if outlier_count > 0:
            logger.info(f"检测到异常值: {outlier_count} 条")
        
        return df

    def _iqr_outliers(self, series: pd.Series, threshold: float = 1.5) -> pd.Series:
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower_bound = q1 - threshold * iqr
        upper_bound = q3 + threshold * iqr
        return (series < lower_bound) | (series > upper_bound)

    def _zscore_outliers(self, series: pd.Series, threshold: float = 3.0) -> pd.Series:
        z_scores = (series - series.mean()) / series.std()
        return abs(z_scores) > threshold

    def _isolation_forest_outliers(self, series: pd.Series) -> pd.Series:
        try:
            from sklearn.ensemble import IsolationForest
            X = series.values.reshape(-1, 1)
            clf = IsolationForest(contamination=0.01, random_state=42)
            outliers = clf.fit_predict(X) == -1
            return pd.Series(outliers, index=series.index)
        except ImportError:
            return pd.Series([False] * len(series), index=series.index)

    def _smooth_data(self, df: pd.DataFrame, method: str = 'rolling', window: int = 5) -> pd.DataFrame:
        df = df.copy()
        df = df.sort_values(['device_id', 'metric_name', 'collect_time'])
        
        for (device_id, metric_name), group in df.groupby(['device_id', 'metric_name']):
            idx = group.index
            
            if method == 'rolling':
                smoothed = group['cleaned_value'].rolling(window=window, center=True, min_periods=1).mean()
            elif method == 'ema':
                smoothed = group['cleaned_value'].ewm(span=window).mean()
            else:
                smoothed = group['cleaned_value']
            
            df.loc[idx, 'cleaned_value'] = smoothed
        
        return df

    def _remove_outliers(self, df: pd.DataFrame) -> pd.DataFrame:
        return df[~df['is_outlier']]

    def _fill_missing_values(self, df: pd.DataFrame) -> pd.DataFrame:
        return self._handle_missing_values(df, strategy='interpolate')

    def _normalize_data(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        for (device_id, metric_name), group in df.groupby(['device_id', 'metric_name']):
            idx = group.index
            mean_val = group['cleaned_value'].mean()
            std_val = group['cleaned_value'].std()
            if std_val > 0:
                df.loc[idx, 'normalized_value'] = (group['cleaned_value'] - mean_val) / std_val
        return df

    def get_data_quality_report(self, df: pd.DataFrame) -> Dict:
        if 'filter_reason' in df.columns:
            filter_stats = df['filter_reason'].value_counts().to_dict()
            filter_stats.pop('', None)
        else:
            filter_stats = {}
        
        report = {
            'total_records': int(len(df)),
            'missing_values': int(df['metric_value'].isna().sum()),
            'duplicate_records': int(df.duplicated(subset=['device_id', 'metric_name', 'collect_time']).sum()),
            'outliers': int(df.get('is_outlier', pd.Series([False])).sum()),
            'filtered_records': filter_stats,
            'total_filtered': int(sum(filter_stats.values()) if filter_stats else 0),
            'devices': int(df['device_id'].nunique()),
            'metrics': int(df['metric_name'].nunique()),
            'time_range': {
                'start': str(df['collect_time'].min()) if not df.empty else None,
                'end': str(df['collect_time'].max()) if not df.empty else None
            },
            'value_stats': {
                'mean': float(df['metric_value'].mean()) if not df.empty else 0,
                'min': float(df['metric_value'].min()) if not df.empty else 0,
                'max': float(df['metric_value'].max()) if not df.empty else 0,
                'std': float(df['metric_value'].std()) if not df.empty else 0
            },
            'data_quality_score': self._calculate_quality_score(df)
        }
        return report

    def _calculate_quality_score(self, df: pd.DataFrame) -> float:
        if df.empty:
            return 0.0
        
        score = 100.0
        total = len(df)
        
        missing_pct = df['metric_value'].isna().sum() / total * 100
        score -= missing_pct * 0.5
        
        outlier_pct = df.get('is_outlier', pd.Series([False])).sum() / total * 100
        score -= outlier_pct * 0.3
        
        duplicate_pct = df.duplicated(subset=['device_id', 'metric_name', 'collect_time']).sum() / total * 100
        score -= duplicate_pct * 0.5
        
        return max(0.0, round(score, 2))


cleaner = DataCleaner()
