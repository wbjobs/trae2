import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import logging
from enum import Enum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DrillDownLevel(str, Enum):
    YEAR = 'year'
    MONTH = 'month'
    WEEK = 'week'
    DAY = 'day'
    HOUR = 'hour'
    MINUTE = 'minute'
    RAW = 'raw'


class DrillDownDimension(str, Enum):
    TIME = 'time'
    DEVICE = 'device'
    METRIC = 'metric'
    LOCATION = 'location'
    DEVICE_TYPE = 'device_type'


class DrillDownAnalyzer:
    def __init__(self):
        self.time_level_formats = {
            DrillDownLevel.YEAR: '%Y',
            DrillDownLevel.MONTH: '%Y-%m',
            DrillDownLevel.WEEK: '%Y-%W',
            DrillDownLevel.DAY: '%Y-%m-%d',
            DrillDownLevel.HOUR: '%Y-%m-%d %H:00',
            DrillDownLevel.MINUTE: '%Y-%m-%d %H:%M',
            DrillDownLevel.RAW: None
        }
        
        self.time_granularity = {
            DrillDownLevel.YEAR: 'Y',
            DrillDownLevel.MONTH: 'M',
            DrillDownLevel.WEEK: 'W',
            DrillDownLevel.DAY: 'D',
            DrillDownLevel.HOUR: 'h',
            DrillDownLevel.MINUTE: 'min',
            DrillDownLevel.RAW: None
        }

    def drill_down(
        self,
        df: pd.DataFrame,
        dimension: DrillDownDimension,
        current_level: Optional[str] = None,
        drill_path: Optional[List[Dict]] = None,
        filters: Optional[Dict] = None
    ) -> Dict:
        if df.empty:
            return {'data': [], 'can_drill_down': False, 'can_drill_up': False, 'drill_path': []}

        result_df = df.copy()
        drill_path = drill_path or []
        
        if filters:
            result_df = self._apply_filters(result_df, filters)
        
        if dimension == DrillDownDimension.TIME:
            return self._time_drill_down(result_df, current_level, drill_path)
        elif dimension == DrillDownDimension.DEVICE:
            return self._device_drill_down(result_df, current_level, drill_path)
        elif dimension == DrillDownDimension.METRIC:
            return self._metric_drill_down(result_df, current_level, drill_path)
        elif dimension == DrillDownDimension.LOCATION:
            return self._location_drill_down(result_df, current_level, drill_path)
        elif dimension == DrillDownDimension.DEVICE_TYPE:
            return self._device_type_drill_down(result_df, current_level, drill_path)
        else:
            return {'data': [], 'can_drill_down': False, 'can_drill_up': False, 'drill_path': drill_path}

    def _apply_filters(self, df: pd.DataFrame, filters: Dict) -> pd.DataFrame:
        result_df = df.copy()
        
        if 'device_ids' in filters and filters['device_ids']:
            result_df = result_df[result_df['device_id'].isin(filters['device_ids'])]
        
        if 'metric_names' in filters and filters['metric_names']:
            result_df = result_df[result_df['metric_name'].isin(filters['metric_names'])]
        
        if 'time_start' in filters and filters['time_start']:
            result_df = result_df[result_df['collect_time'] >= pd.Timestamp(filters['time_start'])]
        
        if 'time_end' in filters and filters['time_end']:
            result_df = result_df[result_df['collect_time'] <= pd.Timestamp(filters['time_end'])]
        
        if 'locations' in filters and filters['locations']:
            result_df = result_df[result_df['location'].isin(filters['locations'])]
        
        if 'device_types' in filters and filters['device_types']:
            result_df = result_df[result_df['device_type'].isin(filters['device_types'])]
        
        return result_df

    def _time_drill_down(
        self,
        df: pd.DataFrame,
        current_level: Optional[str] = None,
        drill_path: List[Dict] = None
    ) -> Dict:
        drill_path = drill_path or []
        
        levels = [
            DrillDownLevel.YEAR,
            DrillDownLevel.MONTH,
            DrillDownLevel.WEEK,
            DrillDownLevel.DAY,
            DrillDownLevel.HOUR,
            DrillDownLevel.MINUTE,
            DrillDownLevel.RAW
        ]
        
        current_idx = levels.index(current_level) if current_level in levels else -1
        next_level = levels[current_idx + 1] if current_idx + 1 < len(levels) else None
        prev_level = levels[current_idx - 1] if current_idx > 0 else None
        
        target_level = next_level if next_level else (levels[current_idx] if current_idx >= 0 else levels[2])
        
        if target_level == DrillDownLevel.RAW:
            return {
                'dimension': 'time',
                'level': target_level.value,
                'data': self._aggregate_by_level(df, target_level),
                'can_drill_down': False,
                'can_drill_up': len(drill_path) > 0,
                'drill_path': drill_path,
                'available_levels': [l.value for l in levels]
            }
        
        aggregated_data = self._aggregate_by_level(df, target_level)
        
        can_drill_down = target_level != DrillDownLevel.RAW and len(aggregated_data) > 0
        can_drill_up = len(drill_path) > 0
        
        return {
            'dimension': 'time',
            'level': target_level.value,
            'data': aggregated_data,
            'can_drill_down': can_drill_down,
            'can_drill_up': can_drill_up,
            'drill_path': drill_path + [{'dimension': 'time', 'level': target_level.value}],
            'available_levels': [l.value for l in levels]
        }

    def _aggregate_by_level(self, df: pd.DataFrame, level: DrillDownLevel) -> List[Dict]:
        if level == DrillDownLevel.RAW:
            return df.to_dict(orient='records')
        
        df = df.copy()
        df['time_period'] = df['collect_time'].dt.strftime(self.time_level_formats[level])
        
        result = []
        for period, group in df.groupby('time_period'):
            agg = self._calculate_aggregates(group)
            result.append({
                'time_period': period,
                'start_time': str(group['collect_time'].min()),
                'end_time': str(group['collect_time'].max()),
                'record_count': len(group),
                **agg
            })
        
        return sorted(result, key=lambda x: x['time_period'])

    def _device_drill_down(
        self,
        df: pd.DataFrame,
        current_level: Optional[str] = None,
        drill_path: List[Dict] = None
    ) -> Dict:
        drill_path = drill_path or []
        
        levels = ['all', 'device_type', 'location', 'device', 'metric']
        
        current_idx = levels.index(current_level) if current_level in levels else -1
        next_level = levels[current_idx + 1] if current_idx + 1 < len(levels) else None
        target_level = next_level if next_level else levels[0]
        
        if target_level == 'all':
            all_agg = self._calculate_aggregates(df)
            return {
                'dimension': 'device',
                'level': target_level,
                'data': [{
                    'group': 'all',
                    'group_name': '全部设备',
                    'record_count': len(df),
                    **all_agg
                }],
                'can_drill_down': True,
                'can_drill_up': False,
                'drill_path': drill_path + [{'dimension': 'device', 'level': target_level}],
                'available_levels': levels
            }
        
        elif target_level == 'device_type':
            return self._aggregate_by_dimension(df, 'device_type', target_level, drill_path)
        
        elif target_level == 'location':
            return self._aggregate_by_dimension(df, 'location', target_level, drill_path)
        
        elif target_level == 'device':
            return self._aggregate_by_dimension(df, ['device_id', 'device_name'], target_level, drill_path)
        
        elif target_level == 'metric':
            return self._aggregate_by_dimension(df, ['device_id', 'device_name', 'metric_name'], target_level, drill_path)
        
        return {'data': [], 'can_drill_down': False, 'can_drill_up': False, 'drill_path': drill_path}

    def _metric_drill_down(
        self,
        df: pd.DataFrame,
        current_level: Optional[str] = None,
        drill_path: List[Dict] = None
    ) -> Dict:
        drill_path = drill_path or []
        
        levels = ['all', 'metric_category', 'metric', 'device', 'raw']
        
        current_idx = levels.index(current_level) if current_level in levels else -1
        next_level = levels[current_idx + 1] if current_idx + 1 < len(levels) else None
        target_level = next_level if next_level else levels[0]
        
        if target_level == 'all':
            all_agg = self._calculate_aggregates(df)
            return {
                'dimension': 'metric',
                'level': target_level,
                'data': [{
                    'group': 'all',
                    'group_name': '全部指标',
                    'record_count': len(df),
                    **all_agg
                }],
                'can_drill_down': True,
                'can_drill_up': False,
                'drill_path': drill_path + [{'dimension': 'metric', 'level': target_level}],
                'available_levels': levels
            }
        
        elif target_level == 'metric_category':
            metric_categories = {
                '环境指标': ['temperature', 'humidity', 'pressure'],
                '运行指标': ['vibration', 'rpm', 'flow_rate'],
                '电气指标': ['current', 'voltage', 'power']
            }
            
            result = []
            for category, metrics in metric_categories.items():
                category_df = df[df['metric_name'].isin(metrics)]
                if len(category_df) > 0:
                    agg = self._calculate_aggregates(category_df)
                    result.append({
                        'group': category,
                        'group_name': category,
                        'metrics': metrics,
                        'record_count': len(category_df),
                        **agg
                    })
            
            return {
                'dimension': 'metric',
                'level': target_level,
                'data': result,
                'can_drill_down': True,
                'can_drill_up': len(drill_path) > 0,
                'drill_path': drill_path + [{'dimension': 'metric', 'level': target_level}],
                'available_levels': levels
            }
        
        elif target_level == 'metric':
            return self._aggregate_by_dimension(df, 'metric_name', target_level, drill_path)
        
        elif target_level == 'device':
            return self._aggregate_by_dimension(df, ['metric_name', 'device_id', 'device_name'], target_level, drill_path)
        
        elif target_level == 'raw':
            return {
                'dimension': 'metric',
                'level': target_level,
                'data': df.to_dict(orient='records'),
                'can_drill_down': False,
                'can_drill_up': len(drill_path) > 0,
                'drill_path': drill_path,
                'available_levels': levels
            }
        
        return {'data': [], 'can_drill_down': False, 'can_drill_up': False, 'drill_path': drill_path}

    def _location_drill_down(
        self,
        df: pd.DataFrame,
        current_level: Optional[str] = None,
        drill_path: List[Dict] = None
    ) -> Dict:
        drill_path = drill_path or []
        
        levels = ['region', 'workshop', 'production_line', 'device']
        target_level = levels[0] if not current_level else levels[
            min(levels.index(current_level) + 1, len(levels) - 1)
        ] if current_level in levels else levels[0]
        
        if target_level == 'region':
            return self._aggregate_by_dimension(df, 'location', target_level, drill_path)
        elif target_level == 'workshop':
            return self._aggregate_by_dimension(df, 'location', target_level, drill_path)
        elif target_level == 'production_line':
            return self._aggregate_by_dimension(df, ['location', 'device_type'], target_level, drill_path)
        elif target_level == 'device':
            return self._aggregate_by_dimension(df, ['location', 'device_id', 'device_name'], target_level, drill_path)
        
        return {'data': [], 'can_drill_down': False, 'can_drill_up': False, 'drill_path': drill_path}

    def _device_type_drill_down(
        self,
        df: pd.DataFrame,
        current_level: Optional[str] = None,
        drill_path: List[Dict] = None
    ) -> Dict:
        drill_path = drill_path or []
        
        levels = ['device_type', 'device', 'metric']
        
        current_idx = levels.index(current_level) if current_level in levels else -1
        next_level = levels[current_idx + 1] if current_idx + 1 < len(levels) else None
        target_level = next_level if next_level else levels[0]
        
        if target_level == 'device_type':
            return self._aggregate_by_dimension(df, 'device_type', target_level, drill_path)
        elif target_level == 'device':
            return self._aggregate_by_dimension(df, ['device_type', 'device_id', 'device_name'], target_level, drill_path)
        elif target_level == 'metric':
            return self._aggregate_by_dimension(df, ['device_type', 'device_id', 'device_name', 'metric_name'], target_level, drill_path)
        
        return {'data': [], 'can_drill_down': False, 'can_drill_up': False, 'drill_path': drill_path}

    def _aggregate_by_dimension(
        self,
        df: pd.DataFrame,
        group_columns: Any,
        target_level: str,
        drill_path: List[Dict]
    ) -> Dict:
        result = []
        
        if isinstance(group_columns, str):
            group_columns = [group_columns]
        
        for group_vals, group in df.groupby(group_columns):
            if isinstance(group_vals, (tuple, list)):
                group_dict = dict(zip(group_columns, group_vals))
                group_name = ' - '.join(str(v) for v in group_vals)
            else:
                group_dict = {group_columns[0]: group_vals}
                group_name = str(group_vals)
            
            agg = self._calculate_aggregates(group)
            
            result.append({
                'group': group_name,
                'group_name': group_name,
                'filters': group_dict,
                'record_count': len(group),
                **agg
            })
        
        can_drill_down = target_level not in ['raw', 'metric']
        can_drill_up = len(drill_path) > 0
        
        return {
            'dimension': 'dimension',
            'level': target_level,
            'data': result,
            'can_drill_down': can_drill_down,
            'can_drill_up': can_drill_up,
            'drill_path': drill_path + [{'dimension': target_level, 'level': target_level}],
            'available_levels': ['all', 'device_type', 'location', 'device', 'metric']
        }

    def _calculate_aggregates(self, df: pd.DataFrame) -> Dict:
        if df.empty or 'cleaned_value' not in df.columns:
            return {
                'avg_value': 0,
                'min_value': 0,
                'max_value': 0,
                'std_value': 0,
                'anomaly_count': 0,
                'anomaly_rate': 0
            }
        
        values = df['cleaned_value']
        anomaly_count = int(df.get('is_outlier', pd.Series([False] * len(df))).sum())
        
        return {
            'avg_value': float(values.mean()),
            'min_value': float(values.min()),
            'max_value': float(values.max()),
            'std_value': float(values.std()) if len(values) > 1 else 0,
            'anomaly_count': anomaly_count,
            'anomaly_rate': float(anomaly_count / len(df) * 100) if len(df) > 0 else 0
        }

    def get_drill_down_summary(self, df: pd.DataFrame) -> Dict:
        if df.empty:
            return {}
        
        return {
            'time_range': {
                'start': str(df['collect_time'].min()),
                'end': str(df['collect_time'].max())
            },
            'devices': sorted(df['device_id'].unique().tolist()),
            'metrics': sorted(df['metric_name'].unique().tolist()),
            'locations': sorted(df['location'].unique().tolist()) if 'location' in df.columns else [],
            'device_types': sorted(df['device_type'].unique().tolist()) if 'device_type' in df.columns else [],
            'total_records': len(df),
            'anomaly_count': int(df.get('is_outlier', pd.Series([False])).sum())
        }


drill_down_analyzer = DrillDownAnalyzer()
