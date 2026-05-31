from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import math
import pandas as pd
import numpy as np

from backend.database.clickhouse import execute_query, insert_data, invalidate_cache
from backend.utils.logger import setup_logger

logger = setup_logger()

AGGREGATION_TABLES = {
    "raw": "industrial_metrics",
    "1min": "metrics_1min_mv",
    "1hour": "metrics_1hour_mv",
    "1day": "metrics_1day_mv"
}

MAX_QUERY_POINTS = 500000


def determine_aggregation(start_time: datetime, end_time: datetime) -> str:
    duration = end_time - start_time
    if duration <= timedelta(hours=6):
        return "raw"
    elif duration <= timedelta(days=7):
        return "1min"
    elif duration <= timedelta(days=90):
        return "1hour"
    else:
        return "1day"


def _sanitize_value(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
    return float(val)


def query_timeseries(
    factory_id: str,
    device_ids: List[str],
    metric_names: List[str],
    start_time: datetime,
    end_time: datetime,
    aggregation: Optional[str] = None,
    downsample_points: int = 1000,
    page: int = 1,
    page_size: int = 0
) -> Dict[str, Any]:
    if aggregation is None:
        aggregation = determine_aggregation(start_time, end_time)

    table = AGGREGATION_TABLES.get(aggregation, "industrial_metrics")

    device_filter = ""
    if device_ids:
        escaped_ids = ", ".join(f"'{did}'" for did in device_ids)
        device_filter = f"AND device_id IN ({escaped_ids})"

    metric_filter = ""
    if metric_names:
        escaped_names = ", ".join(f"'{mn}'" for mn in metric_names)
        metric_filter = f"AND metric_name IN ({escaped_names})"

    limit_clause = ""
    if aggregation == "raw":
        value_col = "metric_value"
        effective_limit = min(downsample_points * 100, MAX_QUERY_POINTS)
        limit_clause = f"LIMIT {effective_limit}"
    else:
        value_col = "avg_value"

    if aggregation == "raw":
        query = f"""
            SELECT
                timestamp,
                device_id,
                metric_name,
                {value_col} AS value
            FROM {table}
            WHERE factory_id = %(factory_id)s
            {device_filter}
            {metric_filter}
            AND timestamp BETWEEN %(start_time)s AND %(end_time)s
            ORDER BY timestamp
            {limit_clause}
        """
    else:
        query = f"""
            SELECT
                timestamp,
                device_id,
                metric_name,
                {value_col} AS value,
                min_value,
                max_value
            FROM {table}
            WHERE factory_id = %(factory_id)s
            {device_filter}
            {metric_filter}
            AND timestamp BETWEEN %(start_time)s AND %(end_time)s
            ORDER BY timestamp
            LIMIT {MAX_QUERY_POINTS}
        """

    params = {
        "factory_id": factory_id,
        "start_time": start_time,
        "end_time": end_time
    }

    try:
        results = execute_query(query, params, timeout=30, use_cache=True)
    except TimeoutError:
        logger.warning(f"Raw query timeout, forcing higher aggregation level")
        if aggregation == "raw":
            aggregation = "1min"
            return query_timeseries(
                factory_id, device_ids, metric_names,
                start_time, end_time, aggregation="1min",
                downsample_points=downsample_points
            )
        elif aggregation == "1min":
            aggregation = "1hour"
            return query_timeseries(
                factory_id, device_ids, metric_names,
                start_time, end_time, aggregation="1hour",
                downsample_points=downsample_points
            )
        raise

    for row in results:
        row["value"] = _sanitize_value(row.get("value"))
        if "min_value" in row:
            row["min_value"] = _sanitize_value(row.get("min_value"))
        if "max_value" in row:
            row["max_value"] = _sanitize_value(row.get("max_value"))

    total_count = len(results)

    if results and total_count > downsample_points:
        results = downsample_data(results, downsample_points)

    paged_results = results
    total_available = total_count
    if page_size > 0:
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paged_results = results[start_idx:end_idx]

    return {
        "data": paged_results,
        "aggregation": aggregation,
        "total_points": total_available,
        "page": page,
        "page_size": page_size if page_size > 0 else total_available,
        "time_range": {
            "start": start_time.isoformat(),
            "end": end_time.isoformat()
        }
    }


def downsample_data(data: List[Dict[str, Any]], target_points: int) -> List[Dict[str, Any]]:
    if len(data) <= target_points:
        return data

    df = pd.DataFrame(data)

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp")

    value_col = "value"
    if value_col in df.columns:
        df[value_col] = pd.to_numeric(df[value_col], errors="coerce")
        df[value_col] = df[value_col].replace([np.inf, -np.inf], np.nan)

    group_cols = []
    if "device_id" in df.columns:
        group_cols.append("device_id")
    if "metric_name" in df.columns:
        group_cols.append("metric_name")

    if group_cols:
        n_groups = df.groupby(group_cols).ngroups
        points_per_group = max(target_points // max(n_groups, 1), 10)
    else:
        points_per_group = target_points

    result_frames = []

    if group_cols:
        for group_key, group_df in df.groupby(group_cols):
            downsampled = _downsample_group(group_df, points_per_group, value_col)
            if isinstance(group_key, tuple):
                for col, val in zip(group_cols, group_key):
                    downsampled[col] = val
            else:
                downsampled[group_cols[0]] = group_key
            result_frames.append(downsampled)
    else:
        result_frames.append(_downsample_group(df, points_per_group, value_col))

    if not result_frames:
        return data

    result_df = pd.concat(result_frames, ignore_index=True)
    result_df = result_df.sort_values("timestamp")

    records = result_df.to_dict("records")
    for row in records:
        if isinstance(row.get("timestamp"), pd.Timestamp):
            row["timestamp"] = row["timestamp"].isoformat()
        if "value" in row:
            row["value"] = _sanitize_value(row["value"])
        if "min_value" in row:
            row["min_value"] = _sanitize_value(row.get("min_value"))
        if "max_value" in row:
            row["max_value"] = _sanitize_value(row.get("max_value"))

    return records


def _downsample_group(df: pd.DataFrame, target_points: int, value_col: str) -> pd.DataFrame:
    if len(df) <= target_points:
        return df

    step = max(1, len(df) // target_points)
    indices = list(range(0, len(df), step))
    if indices[-1] != len(df) - 1:
        indices.append(len(df) - 1)

    downsampled = df.iloc[indices].copy()

    extra_cols = [c for c in ["min_value", "max_value"] if c in downsampled.columns]
    for window_start in range(0, len(df) - step, step):
        window_end = min(window_start + step, len(df))
        window = df.iloc[window_start:window_end]
        if value_col in window.columns and not window[value_col].dropna().empty:
            max_idx = window_start // step
            if max_idx < len(downsampled) and value_col in downsampled.columns:
                for ec in extra_cols:
                    if ec == "min_value" and ec in window.columns:
                        downsampled.iloc[max_idx, downsampled.columns.get_loc(ec)] = window[ec].min()
                    elif ec == "max_value" and ec in window.columns:
                        downsampled.iloc[max_idx, downsampled.columns.get_loc(ec)] = window[ec].max()

    return downsampled


def get_metric_statistics(
    factory_id: str,
    device_ids: List[str],
    metric_names: List[str],
    start_time: datetime,
    end_time: datetime
) -> Dict[str, Any]:
    device_filter = ""
    if device_ids:
        escaped_ids = ", ".join(f"'{did}'" for did in device_ids)
        device_filter = f"AND device_id IN ({escaped_ids})"

    metric_filter = ""
    if metric_names:
        escaped_names = ", ".join(f"'{mn}'" for mn in metric_names)
        metric_filter = f"AND metric_name IN ({escaped_names})"

    query = f"""
        SELECT
            metric_name,
            device_id,
            count() AS count,
            avg(metric_value) AS avg_value,
            min(metric_value) AS min_value,
            max(metric_value) AS max_value,
            stddevPop(metric_value) AS stddev,
            quantile(0.5)(metric_value) AS median,
            quantile(0.95)(metric_value) AS p95,
            quantile(0.99)(metric_value) AS p99
        FROM industrial_metrics
        WHERE factory_id = %(factory_id)s
        {device_filter}
        {metric_filter}
        AND timestamp BETWEEN %(start_time)s AND %(end_time)s
        AND isFinite(metric_value)
        GROUP BY metric_name, device_id
    """

    params = {
        "factory_id": factory_id,
        "start_time": start_time,
        "end_time": end_time
    }

    results = execute_query(query, params, timeout=30, use_cache=True)

    for row in results:
        for key in ["avg_value", "min_value", "max_value", "stddev", "median", "p95", "p99"]:
            if key in row:
                row[key] = _sanitize_value(row[key])
                if row[key] is not None:
                    row[key] = round(row[key], 4)

    return {
        "statistics": results,
        "time_range": {
            "start": start_time.isoformat(),
            "end": end_time.isoformat()
        }
    }


def get_devices(factory_id: Optional[str] = None) -> List[Dict[str, Any]]:
    factory_filter = "WHERE factory_id = %(factory_id)s" if factory_id else ""
    query = f"""
        SELECT
            device_id,
            device_name,
            device_type,
            factory_id,
            factory_name,
            metrics,
            status
        FROM devices FINAL
        {factory_filter}
        ORDER BY factory_id, device_id
    """
    params = {"factory_id": factory_id} if factory_id else {}
    return execute_query(query, params, use_cache=True)


def get_metrics(factory_id: Optional[str] = None, device_id: Optional[str] = None) -> List[Dict[str, Any]]:
    conditions = []
    params = {}

    if factory_id:
        conditions.append("factory_id = %(factory_id)s")
        params["factory_id"] = factory_id
    if device_id:
        conditions.append("device_id = %(device_id)s")
        params["device_id"] = device_id

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    query = f"""
        SELECT DISTINCT
            metric_name,
            unit,
            count() AS data_points
        FROM industrial_metrics
        {where_clause}
        AND isFinite(metric_value)
        GROUP BY metric_name, unit
        ORDER BY metric_name
        LIMIT 500
    """

    return execute_query(query, params, timeout=30, use_cache=True)


def get_factories() -> List[Dict[str, Any]]:
    query = """
        SELECT DISTINCT
            factory_id,
            factory_name,
            count(DISTINCT device_id) AS device_count
        FROM devices FINAL
        GROUP BY factory_id, factory_name
        ORDER BY factory_id
    """
    return execute_query(query, use_cache=True)


def insert_metrics_data(data: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"inserted": 0}

    cleaned = []
    for item in data:
        val = item.get("metric_value")
        if val is not None:
            try:
                fval = float(val)
                if not (math.isnan(fval) or math.isinf(fval)):
                    item["metric_value"] = fval
                    cleaned.append(item)
            except (ValueError, TypeError):
                continue
        else:
            continue

    if not cleaned:
        return {"inserted": 0}

    insert_data("industrial_metrics", cleaned)
    invalidate_cache()
    return {"inserted": len(cleaned)}


def generate_sample_data(
    factory_id: str,
    device_id: str,
    metric_name: str,
    start_time: datetime,
    end_time: datetime,
    interval_seconds: int = 60
) -> List[Dict[str, Any]]:
    data = []
    current = start_time
    base_value = np.random.uniform(50, 100)

    while current <= end_time:
        noise = np.random.normal(0, 5)
        trend = (current - start_time).total_seconds() / 3600 * 0.1
        value = base_value + noise + trend

        if math.isnan(value) or math.isinf(value):
            current += timedelta(seconds=interval_seconds)
            continue

        data.append({
            "timestamp": current,
            "device_id": device_id,
            "device_type": "sensor",
            "factory_id": factory_id,
            "metric_name": metric_name,
            "metric_value": round(value, 2),
            "unit": get_unit_for_metric(metric_name),
            "quality": 1 if abs(noise) < 15 else 0,
            "tags": {}
        })

        current += timedelta(seconds=interval_seconds)

    return data


def get_unit_for_metric(metric_name: str) -> str:
    units = {
        "temperature": "°C",
        "pressure": "kPa",
        "vibration": "mm/s",
        "current": "A",
        "voltage": "V",
        "power": "kW",
        "speed": "rpm",
        "flow": "m³/h",
        "humidity": "%",
        "level": "%"
    }
    for key, unit in units.items():
        if key in metric_name.lower():
            return unit
    return "unit"
