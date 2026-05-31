from typing import Dict, Any, List, Optional
from datetime import datetime
import pandas as pd
import numpy as np
from scipy import stats as scipy_stats
from sklearn.preprocessing import MinMaxScaler, StandardScaler

from backend.database.clickhouse import execute_query, insert_data, get_client, invalidate_cache
from backend.utils.logger import setup_logger

logger = setup_logger()


class DataCleaner:
    def __init__(self):
        self.cleaning_rules = {
            "remove_duplicates": self._remove_duplicates,
            "handle_missing": self._handle_missing_values,
            "remove_outliers_zscore": self._remove_outliers_zscore,
            "remove_outliers_iqr": self._remove_outliers_iqr,
            "smooth_moving_average": self._smooth_moving_average,
            "normalize_minmax": self._normalize_minmax,
            "normalize_standard": self._normalize_standard,
            "interpolate_linear": self._interpolate_linear,
            "filter_quality": self._filter_quality,
            "remove_infinite_values": self._remove_infinite_values,
            "remove_extreme_values": self._remove_extreme_values,
            "remove_spike_noise": self._remove_spike_noise,
            "fill_grouped_missing": self._fill_grouped_missing,
        }

    def _pre_clean(self, df: pd.DataFrame, value_col: str = "metric_value") -> pd.DataFrame:
        if value_col in df.columns:
            df[value_col] = pd.to_numeric(df[value_col], errors="coerce")
            df = df.replace([np.inf, -np.inf], np.nan)
        return df

    def _remove_duplicates(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        subset = kwargs.get("subset", None)
        if subset is None:
            group_cols = []
            for col in ["timestamp", "device_id", "metric_name"]:
                if col in df.columns:
                    group_cols.append(col)
            subset = group_cols if group_cols else None
        return df.drop_duplicates(subset=subset, keep="last")

    def _handle_missing_values(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        method = kwargs.get("method", "ffill")
        value_col = kwargs.get("value_col", "metric_value")
        group_cols = kwargs.get("group_cols", [])

        if not group_cols:
            available_groups = [c for c in ["device_id", "metric_name"] if c in df.columns]
            group_cols = available_groups

        if method == "drop":
            return df.dropna(subset=[value_col] if value_col in df.columns else None)
        elif method in ("ffill", "bfill"):
            if group_cols and value_col in df.columns:
                df = df.sort_values(group_cols + (["timestamp"] if "timestamp" in df.columns else []))
                df[value_col] = df.groupby(group_cols)[value_col].transform(method)
                return df
            return getattr(df, method)()
        elif method == "interpolate":
            if value_col in df.columns:
                if group_cols:
                    df = df.sort_values(group_cols + (["timestamp"] if "timestamp" in df.columns else []))
                    df[value_col] = df.groupby(group_cols)[value_col].transform(
                        lambda g: g.interpolate(method="linear", limit_direction="both")
                    )
                    return df
                return df.interpolate(method="linear")
            return df
        elif method == "mean":
            if group_cols and value_col in df.columns:
                df[value_col] = df.groupby(group_cols)[value_col].transform(
                    lambda g: g.fillna(g.mean())
                )
                return df
            return df.fillna(df.mean(numeric_only=True))
        elif method == "median":
            if group_cols and value_col in df.columns:
                df[value_col] = df.groupby(group_cols)[value_col].transform(
                    lambda g: g.fillna(g.median())
                )
                return df
            return df.fillna(df.median(numeric_only=True))
        else:
            return df.fillna(method)

    def _remove_outliers_zscore(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        threshold = kwargs.get("threshold", 3.0)
        value_col = kwargs.get("value_col", "metric_value")
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if not group_cols:
            available_groups = [c for c in ["device_id", "metric_name"] if c in df.columns]
            group_cols = available_groups

        if group_cols:
            mask = pd.Series(True, index=df.index)
            for _, group_idx in df.groupby(group_cols).groups.items():
                group = df.loc[group_idx]
                valid = group[value_col].dropna()
                if len(valid) < 3:
                    continue
                z_scores = np.abs(scipy_stats.zscore(valid))
                outlier_mask = z_scores >= threshold
                outlier_indices = valid.index[outlier_mask]
                mask.loc[outlier_indices] = False
            return df[mask]
        else:
            valid = df[value_col].dropna()
            if len(valid) < 3:
                return df
            z_scores = np.abs(scipy_stats.zscore(valid))
            mask = z_scores < threshold
            return df[mask.reindex(df.index, fill_value=True)]

    def _remove_outliers_iqr(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        value_col = kwargs.get("value_col", "metric_value")
        multiplier = kwargs.get("multiplier", 1.5)
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if not group_cols:
            available_groups = [c for c in ["device_id", "metric_name"] if c in df.columns]
            group_cols = available_groups

        if group_cols:
            mask = pd.Series(True, index=df.index)
            for _, group in df.groupby(group_cols):
                valid = group[value_col].dropna()
                if len(valid) < 4:
                    continue
                Q1 = valid.quantile(0.25)
                Q3 = valid.quantile(0.75)
                IQR = Q3 - Q1
                if IQR == 0:
                    continue
                lower_bound = Q1 - multiplier * IQR
                upper_bound = Q3 + multiplier * IQR
                outlier_mask = (group[value_col] < lower_bound) | (group[value_col] > upper_bound)
                outlier_mask = outlier_mask & group[value_col].notna()
                mask.loc[outlier_mask.index[outlier_mask]] = False
            return df[mask]
        else:
            valid = df[value_col].dropna()
            if len(valid) < 4:
                return df
            Q1 = valid.quantile(0.25)
            Q3 = valid.quantile(0.75)
            IQR = Q3 - Q1
            if IQR == 0:
                return df
            lower_bound = Q1 - multiplier * IQR
            upper_bound = Q3 + multiplier * IQR
            return df[
                ((df[value_col] >= lower_bound) & (df[value_col] <= upper_bound))
                | df[value_col].isna()
            ]

    def _smooth_moving_average(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        window = kwargs.get("window", 5)
        value_col = kwargs.get("value_col", "metric_value")
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if not group_cols:
            available_groups = [c for c in ["device_id", "metric_name"] if c in df.columns]
            group_cols = available_groups

        if group_cols:
            df = df.sort_values(group_cols + (["timestamp"] if "timestamp" in df.columns else []))
            df[value_col] = df.groupby(group_cols)[value_col].transform(
                lambda g: g.rolling(window=window, min_periods=1).mean()
            )
        else:
            df[value_col] = df[value_col].rolling(window=window, min_periods=1).mean()
        return df

    def _normalize_minmax(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        value_col = kwargs.get("value_col", "metric_value")
        output_col = kwargs.get("output_col", f"{value_col}_normalized")
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if group_cols:
            available_groups = [c for c in group_cols if c in df.columns]
            if available_groups:
                df[output_col] = df.groupby(available_groups)[value_col].transform(
                    lambda g: pd.Series(
                        MinMaxScaler().fit_transform(g.values.reshape(-1, 1)).flatten(),
                        index=g.index
                    )
                )
                return df

        scaler = MinMaxScaler()
        df[output_col] = scaler.fit_transform(df[[value_col]])
        return df

    def _normalize_standard(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        value_col = kwargs.get("value_col", "metric_value")
        output_col = kwargs.get("output_col", f"{value_col}_standardized")
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if group_cols:
            available_groups = [c for c in group_cols if c in df.columns]
            if available_groups:
                df[output_col] = df.groupby(available_groups)[value_col].transform(
                    lambda g: pd.Series(
                        StandardScaler().fit_transform(g.values.reshape(-1, 1)).flatten(),
                        index=g.index
                    ) if len(g.dropna()) >= 2 else g
                )
                return df

        scaler = StandardScaler()
        df[output_col] = scaler.fit_transform(df[[value_col]])
        return df

    def _interpolate_linear(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        value_col = kwargs.get("value_col", "metric_value")
        time_col = kwargs.get("time_col", "timestamp")
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if not group_cols:
            available_groups = [c for c in ["device_id", "metric_name"] if c in df.columns]
            group_cols = available_groups

        if group_cols and time_col in df.columns:
            df = df.sort_values(group_cols + [time_col])
            df[value_col] = df.groupby(group_cols)[value_col].transform(
                lambda g: g.interpolate(method="linear", limit_direction="both")
            )
            return df
        elif time_col in df.columns:
            df = df.set_index(time_col)
            df[value_col] = df[value_col].interpolate(method="time")
            return df.reset_index()
        else:
            df[value_col] = df[value_col].interpolate(method="linear")
            return df

    def _filter_quality(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        min_quality = kwargs.get("min_quality", 1)
        value_col = kwargs.get("value_col", "metric_value")
        drop_null_values = kwargs.get("drop_null_values", True)

        mask = pd.Series(True, index=df.index)

        if "quality" in df.columns:
            quality_mask = df["quality"] >= min_quality
            if quality_mask.dtype == object:
                quality_mask = df["quality"].apply(
                    lambda x: True if pd.isna(x) else (int(x) >= min_quality if str(x).isdigit() else False)
                )
            mask = mask & quality_mask

        if drop_null_values and value_col in df.columns:
            mask = mask & df[value_col].notna()
            mask = mask & ~df[value_col].isin([np.inf, -np.inf])

        return df[mask]

    def _remove_infinite_values(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        value_col = kwargs.get("value_col", "metric_value")
        if value_col not in df.columns:
            return df
        df[value_col] = pd.to_numeric(df[value_col], errors="coerce")
        return df[df[value_col].notna() & ~df[value_col].isin([np.inf, -np.inf])]

    def _remove_extreme_values(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        value_col = kwargs.get("value_col", "metric_value")
        lower_bound = kwargs.get("lower_bound", None)
        upper_bound = kwargs.get("upper_bound", None)
        auto_detect = kwargs.get("auto_detect", True)
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if not group_cols:
            available_groups = [c for c in ["device_id", "metric_name"] if c in df.columns]
            group_cols = available_groups

        if auto_detect and (lower_bound is None or upper_bound is None):
            if group_cols:
                mask = pd.Series(True, index=df.index)
                for _, group in df.groupby(group_cols):
                    valid = group[value_col].dropna()
                    if len(valid) < 10:
                        continue
                    mean = valid.mean()
                    std = valid.std()
                    if std == 0:
                        continue
                    group_lower = lower_bound if lower_bound is not None else mean - 5 * std
                    group_upper = upper_bound if upper_bound is not None else mean + 5 * std
                    outlier = (group[value_col] < group_lower) | (group[value_col] > group_upper)
                    outlier = outlier & group[value_col].notna()
                    mask.loc[outlier.index[outlier]] = False
                return df[mask]
            else:
                valid = df[value_col].dropna()
                if len(valid) < 10:
                    return df
                mean = valid.mean()
                std = valid.std()
                if std == 0:
                    return df
                computed_lower = lower_bound if lower_bound is not None else mean - 5 * std
                computed_upper = upper_bound if upper_bound is not None else mean + 5 * std
                return df[
                    ((df[value_col] >= computed_lower) & (df[value_col] <= computed_upper))
                    | df[value_col].isna()
                ]
        else:
            mask = pd.Series(True, index=df.index)
            if lower_bound is not None:
                mask = mask & ((df[value_col] >= lower_bound) | df[value_col].isna())
            if upper_bound is not None:
                mask = mask & ((df[value_col] <= upper_bound) | df[value_col].isna())
            return df[mask]

    def _remove_spike_noise(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        value_col = kwargs.get("value_col", "metric_value")
        threshold = kwargs.get("threshold", 0.5)
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if not group_cols:
            available_groups = [c for c in ["device_id", "metric_name"] if c in df.columns]
            group_cols = available_groups

        time_col = "timestamp" if "timestamp" in df.columns else None
        sort_cols = group_cols + ([time_col] if time_col else [])
        df = df.sort_values(sort_cols)

        if group_cols:
            mask = pd.Series(True, index=df.index)
            for _, group in df.groupby(group_cols):
                if len(group) < 3:
                    continue
                values = group[value_col].copy()
                range_val = values.max() - values.min()
                if range_val == 0:
                    continue
                diffs = values.diff().abs() / range_val
                spike_mask = diffs > threshold
                spike_mask.iloc[0] = False
                mask.loc[spike_mask[spike_mask].index] = False
            return df[mask]
        else:
            if len(df) < 3:
                return df
            values = df[value_col].copy()
            range_val = values.max() - values.min()
            if range_val == 0:
                return df
            diffs = values.diff().abs() / range_val
            spike_mask = diffs <= threshold
            spike_mask.iloc[0] = True
            return df[spike_mask]

    def _fill_grouped_missing(self, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
        value_col = kwargs.get("value_col", "metric_value")
        method = kwargs.get("method", "ffill")
        max_gap = kwargs.get("max_gap", None)
        group_cols = kwargs.get("group_cols", [])

        if value_col not in df.columns:
            return df

        if not group_cols:
            available_groups = [c for c in ["device_id", "metric_name"] if c in df.columns]
            group_cols = available_groups

        time_col = "timestamp" if "timestamp" in df.columns else None
        sort_cols = group_cols + ([time_col] if time_col else [])
        df = df.sort_values(sort_cols)

        if group_cols:
            df[value_col] = df.groupby(group_cols)[value_col].transform(
                lambda g: g.fillna(method=method, limit=max_gap)
            )
        else:
            df[value_col] = df[value_col].fillna(method=method, limit=max_gap)
        return df

    def apply_rules(self, df: pd.DataFrame, rules: List[Dict[str, Any]]) -> pd.DataFrame:
        value_col = "metric_value"
        if value_col in df.columns:
            df = self._pre_clean(df, value_col)

        for rule in rules:
            rule_name = rule.get("name")
            rule_params = rule.get("params", {})

            if rule_name in self.cleaning_rules:
                try:
                    before = len(df)
                    df = self.cleaning_rules[rule_name](df, **rule_params)
                    after = len(df)
                    logger.info(f"Applied rule '{rule_name}': {before} -> {after} rows")
                except Exception as e:
                    logger.error(f"Error applying rule {rule_name}: {e}")
            else:
                logger.warning(f"Unknown cleaning rule: {rule_name}")

        if value_col in df.columns:
            df = self._pre_clean(df, value_col)

        return df


def clean_data(
    source_query: str,
    cleaning_rules: List[Dict[str, Any]],
    target_table: Optional[str] = None
) -> Dict[str, Any]:
    cleaner = DataCleaner()

    try:
        raw_data = execute_query(source_query, use_cache=False)
        if not raw_data:
            return {"processed_rows": 0, "cleaned_rows": 0, "message": "No data to process"}

        df = pd.DataFrame(raw_data)
        original_count = len(df)

        df_cleaned = cleaner.apply_rules(df, cleaning_rules)
        cleaned_count = len(df_cleaned)

        nan_count = 0
        if "metric_value" in df_cleaned.columns:
            nan_count = df_cleaned["metric_value"].isna().sum()
            df_cleaned = df_cleaned.dropna(subset=["metric_value"])
            df_cleaned = df_cleaned.replace([np.inf, -np.inf], np.nan)
            df_cleaned = df_cleaned.dropna(subset=["metric_value"])

        if target_table and len(df_cleaned) > 0:
            cleaned_data = df_cleaned.to_dict("records")
            insert_data(target_table, cleaned_data)
            invalidate_cache()

        return {
            "original_rows": original_count,
            "cleaned_rows": len(df_cleaned),
            "removed_rows": original_count - len(df_cleaned),
            "nan_values_removed": int(nan_count),
            "target_table": target_table
        }

    except Exception as e:
        logger.error(f"Data cleaning error: {e}")
        raise


def create_cleaning_task(
    task_name: str,
    source_table: str,
    target_table: str,
    cleaning_rules: List[str],
    created_by: str,
    time_range: Optional[Dict[str, datetime]] = None
) -> Dict[str, Any]:
    client = get_client()

    query = f"""
        INSERT INTO data_cleaning_tasks 
        (task_name, source_table, target_table, cleaning_rules, status, created_by)
        VALUES
        ('{task_name}', '{source_table}', '{target_table}', {cleaning_rules}, 'pending', '{created_by}')
    """

    client.command(query)

    return {
        "task_name": task_name,
        "status": "pending",
        "created_by": created_by
    }


def get_cleaning_tasks(limit: int = 100) -> List[Dict[str, Any]]:
    query = """
        SELECT
            task_id,
            task_name,
            source_table,
            target_table,
            cleaning_rules,
            status,
            created_by,
            created_at,
            started_at,
            completed_at,
            processed_rows,
            error_message
        FROM data_cleaning_tasks
        ORDER BY created_at DESC
        LIMIT %(limit)s
    """
    return execute_query(query, {"limit": limit})


def get_data_quality_report(
    factory_id: str,
    device_id: Optional[str] = None,
    metric_name: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None
) -> Dict[str, Any]:
    conditions = ["factory_id = %(factory_id)s"]
    params = {"factory_id": factory_id}

    if device_id:
        conditions.append("device_id = %(device_id)s")
        params["device_id"] = device_id
    if metric_name:
        conditions.append("metric_name = %(metric_name)s")
        params["metric_name"] = metric_name
    if start_time:
        conditions.append("timestamp >= %(start_time)s")
        params["start_time"] = start_time
    if end_time:
        conditions.append("timestamp <= %(end_time)s")
        params["end_time"] = end_time

    where_clause = "WHERE " + " AND ".join(conditions)

    query = f"""
        SELECT
            metric_name,
            count() AS total_points,
            countIf(quality = 1) AS good_quality_points,
            countIf(quality = 0) AS bad_quality_points,
            countIf(isNull(metric_value) OR isNaN(metric_value) OR isFinite(metric_value) = 0) AS missing_values,
            countIf(metric_value < 0 AND metric_name IN ('temperature', 'pressure', 'flow', 'speed', 'level')) AS negative_anomaly_points,
            min(metric_value) AS min_value,
            max(metric_value) AS max_value,
            avg(metric_value) AS avg_value,
            stddevPop(metric_value) AS stddev
        FROM industrial_metrics
        {where_clause}
        GROUP BY metric_name
        ORDER BY metric_name
    """

    results = execute_query(query, params)

    for row in results:
        total = row["total_points"]
        if total > 0:
            row["good_quality_rate"] = row["good_quality_points"] / total
            row["missing_rate"] = row["missing_values"] / total
            row["anomaly_rate"] = (row.get("bad_quality_points", 0) + row.get("negative_anomaly_points", 0)) / total
        else:
            row["good_quality_rate"] = 0
            row["missing_rate"] = 0
            row["anomaly_rate"] = 0

    return {
        "quality_report": results,
        "time_range": {
            "start": start_time.isoformat() if start_time else None,
            "end": end_time.isoformat() if end_time else None
        }
    }
