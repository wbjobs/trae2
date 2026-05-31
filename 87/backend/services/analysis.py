from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

from backend.database.clickhouse import execute_query
from backend.utils.logger import setup_logger

logger = setup_logger()

COMPARE_AGGREGATION_MAP = {
    "day": ("metrics_1day_mv", "1day"),
    "week": ("metrics_1week_mv", "1week"),
    "month": ("metrics_1month_mv", "1month")
}

COMPARE_PERIOD_MAP = {
    "yoy": 365,
    "qoq": 90,
    "mom": 30,
    "wow": 7,
    "dod": 1
}

METRIC_DISPLAY_MAP = {
    "avg_value": "平均值",
    "sum_value": "累计值",
    "max_value": "最大值",
    "min_value": "最小值"
}


def get_comparison_period(
    compare_type: str,
    period_type: str,
    end_time: datetime,
    periods: int = 1
) -> datetime:
    days = COMPARE_PERIOD_MAP.get(compare_type, 30)
    return end_time - timedelta(days=days * periods)


def query_yoy_mom_analysis(
    factory_id: str,
    device_ids: List[str],
    metric_names: List[str],
    compare_type: str = "mom",
    period_type: str = "day",
    metric_type: str = "avg_value",
    end_time: Optional[datetime] = None,
    periods: int = 12
) -> Dict[str, Any]:
    if end_time is None:
        end_time = datetime.now()

    table, agg_level = COMPARE_AGGREGATION_MAP.get(period_type, ("metrics_1day_mv", "1day"))

    device_filter = ""
    if device_ids:
        escaped_ids = ", ".join(f"'{did}'" for did in device_ids)
        device_filter = f"AND device_id IN ({escaped_ids})"

    metric_filter = ""
    if metric_names:
        escaped_names = ", ".join(f"'{mn}'" for mn in metric_names)
        metric_filter = f"AND metric_name IN ({escaped_names})"

    base_days = COMPARE_PERIOD_MAP.get(compare_type, 30)
    compare_days = base_days * periods
    start_time = end_time - timedelta(days=compare_days * 2)

    valid_metric_types = ["avg_value", "sum_value", "max_value", "min_value"]
    if metric_type not in valid_metric_types:
        metric_type = "avg_value"

    query = f"""
        SELECT
            timestamp,
            device_id,
            metric_name,
            {metric_type} AS value
        FROM {table} FINAL
        WHERE factory_id = %(factory_id)s
        {device_filter}
        {metric_filter}
        AND timestamp BETWEEN %(start_time)s AND %(end_time)s
        ORDER BY timestamp
    """

    params = {
        "factory_id": factory_id,
        "start_time": start_time,
        "end_time": end_time
    }

    results = execute_query(query, params, timeout=30, use_cache=True)

    if not results:
        return {
            "current_data": [],
            "compare_data": [],
            "comparison": [],
            "period_type": period_type,
            "compare_type": compare_type,
            "metric_type": metric_type
        }

    df = pd.DataFrame(results)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])

    group_cols = ["device_id", "metric_name"]

    comparison_results = []

    for (device_id, metric_name), group in df.groupby(group_cols):
        group = group.sort_values("timestamp").set_index("timestamp")

        if period_type == "day":
            current_mask = group.index >= (end_time - timedelta(days=compare_days))
        elif period_type == "week":
            current_mask = group.index >= (end_time - timedelta(weeks=periods))
        elif period_type == "month":
            current_mask = group.index >= (end_time - pd.DateOffset(months=periods))
        else:
            current_mask = group.index >= (end_time - timedelta(days=compare_days))

        current_data = group[current_mask].copy()
        compare_data = group[~current_mask].copy()

        if len(current_data) == 0 or len(compare_data) == 0:
            continue

        current_data = current_data.reset_index()
        compare_data = compare_data.reset_index()

        if len(current_data) > len(compare_data):
            current_data = current_data.head(len(compare_data))
        elif len(compare_data) > len(current_data):
            compare_data = compare_data.tail(len(current_data))

        current_total = current_data["value"].sum() if metric_type == "sum_value" else current_data["value"].mean()
        compare_total = compare_data["value"].sum() if metric_type == "sum_value" else compare_data["value"].mean()

        change_amount = current_total - compare_total
        change_rate = (change_amount / compare_total * 100) if compare_total != 0 else 0

        comparison_results.append({
            "device_id": device_id,
            "metric_name": metric_name,
            "current_total": round(current_total, 4),
            "compare_total": round(compare_total, 4),
            "change_amount": round(change_amount, 4),
            "change_rate": round(change_rate, 2),
            "trend": "up" if change_rate > 0 else ("down" if change_rate < 0 else "flat"),
            "current_series": [
                {"timestamp": ts.isoformat(), "value": round(v, 4)}
                for ts, v in zip(current_data["timestamp"], current_data["value"])
            ],
            "compare_series": [
                {"timestamp": ts.isoformat(), "value": round(v, 4)}
                for ts, v in zip(compare_data["timestamp"], compare_data["value"])
            ]
        })

    return {
        "comparison": comparison_results,
        "period_type": period_type,
        "compare_type": compare_type,
        "compare_type_display": _get_compare_type_display(compare_type),
        "metric_type": metric_type,
        "metric_type_display": METRIC_DISPLAY_MAP.get(metric_type, metric_type),
        "time_range": {
            "start": start_time.isoformat(),
            "end": end_time.isoformat()
        }
    }


def _get_compare_type_display(compare_type: str) -> str:
    displays = {
        "yoy": "同比(YoY)",
        "qoq": "季度环比(QoQ)",
        "mom": "月度环比(MoM)",
        "wow": "周环比(WoW)",
        "dod": "日环比(DoD)"
    }
    return displays.get(compare_type, compare_type)


def get_multi_period_comparison(
    factory_id: str,
    device_ids: List[str],
    metric_names: List[str],
    metric_type: str = "avg_value",
    end_time: Optional[datetime] = None,
    periods: int = 6
) -> Dict[str, Any]:
    if end_time is None:
        end_time = datetime.now()

    results = {}

    for compare_type in ["yoy", "mom", "wow"]:
        for period_type in ["month", "week", "day"]:
            if (compare_type == "yoy" and period_type != "month") or \
               (compare_type == "mom" and period_type == "week") or \
               (compare_type == "wow" and period_type != "week"):
                continue

            key = f"{compare_type}_{period_type}"
            try:
                result = query_yoy_mom_analysis(
                    factory_id=factory_id,
                    device_ids=device_ids,
                    metric_names=metric_names,
                    compare_type=compare_type,
                    period_type=period_type,
                    metric_type=metric_type,
                    end_time=end_time,
                    periods=periods
                )
                results[key] = result
            except Exception as e:
                logger.error(f"Error calculating {key}: {e}")
                results[key] = {"error": str(e)}

    return results


def get_alert_analysis(
    factory_id: str,
    metric_names: Optional[List[str]] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None
) -> Dict[str, Any]:
    if not start_time:
        start_time = datetime.now() - timedelta(days=30)
    if not end_time:
        end_time = datetime.now()

    metric_filter = ""
    if metric_names:
        escaped_names = ", ".join(f"'{mn}'" for mn in metric_names)
        metric_filter = f"AND metric_name IN ({escaped_names})"

    query = f"""
        SELECT
            metric_name,
            severity,
            count() AS alert_count,
            countIf(status = 'active') AS active_count,
            countIf(status = 'resolved') AS resolved_count
        FROM alert_records
        WHERE factory_id = %(factory_id)s
        {metric_filter}
        AND triggered_at BETWEEN %(start_time)s AND %(end_time)s
        GROUP BY metric_name, severity
        ORDER BY alert_count DESC
    """

    params = {
        "factory_id": factory_id,
        "start_time": start_time,
        "end_time": end_time
    }

    results = execute_query(query, params, timeout=15, use_cache=True)

    return {
        "alert_summary": results,
        "total_alerts": sum(r.get("alert_count", 0) for r in results),
        "active_alerts": sum(r.get("active_count", 0) for r in results),
        "time_range": {
            "start": start_time.isoformat(),
            "end": end_time.isoformat()
        }
    }


def detect_threshold_violations(
    factory_id: str,
    lookback_minutes: int = 5
) -> List[Dict[str, Any]]:
    end_time = datetime.now()
    start_time = end_time - timedelta(minutes=lookback_minutes)

    threshold_query = """
        SELECT
            threshold_id,
            factory_id,
            device_id,
            metric_name,
            threshold_type,
            min_value,
            max_value,
            warning_value,
            critical_value,
            severity,
            enabled
        FROM alert_thresholds FINAL
        WHERE factory_id = %(factory_id)s AND enabled = true
    """

    thresholds = execute_query(threshold_query, {"factory_id": factory_id}, timeout=10, use_cache=False)

    if not thresholds:
        return []

    violations = []

    for threshold in thresholds:
        device_filter = f"AND device_id = '{threshold['device_id']}'" if threshold.get("device_id") else ""

        query = f"""
            SELECT
                timestamp,
                device_id,
                metric_name,
                metric_value,
                avg(metric_value) OVER w AS avg_value,
                max(metric_value) OVER w AS max_value,
                min(metric_value) OVER w AS min_value
            FROM industrial_metrics
            WHERE factory_id = %(factory_id)s
            {device_filter}
            AND metric_name = %(metric_name)s
            AND timestamp BETWEEN %(start_time)s AND %(end_time)s
            WINDOW w AS (
                PARTITION BY device_id, metric_name
                ORDER BY timestamp
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
            ORDER BY timestamp DESC
            LIMIT 100
        """

        params = {
            "factory_id": factory_id,
            "metric_name": threshold["metric_name"],
            "start_time": start_time,
            "end_time": end_time
        }

        try:
            data = execute_query(query, params, timeout=10, use_cache=False)
        except Exception as e:
            logger.error(f"Error checking threshold {threshold.get('threshold_id')}: {e}")
            continue

        if not data:
            continue

        df = pd.DataFrame(data)
        current_value = df["metric_value"].iloc[0] if len(df) > 0 else None

        if current_value is None:
            continue

        violation = _check_single_threshold(threshold, float(current_value))
        if violation:
            violation.update({
                "threshold_id": str(threshold.get("threshold_id")),
                "factory_id": factory_id,
                "device_id": threshold.get("device_id", ""),
                "metric_name": threshold.get("metric_name"),
                "current_value": float(current_value),
                "timestamp": df["timestamp"].iloc[0]
            })
            violations.append(violation)

    return violations


def _check_single_threshold(threshold: Dict[str, Any], value: float) -> Optional[Dict[str, Any]]:
    if threshold.get("threshold_type") == "range":
        min_val = threshold.get("min_value")
        max_val = threshold.get("max_value")
        if min_val is not None and value < float(min_val):
            return {
                "alert_type": "below_min",
                "severity": threshold.get("severity", "warning"),
                "threshold_value": float(min_val),
                "message": f"{threshold.get('metric_name')} 值 {value:.2f} 低于最小值 {min_val}"
            }
        if max_val is not None and value > float(max_val):
            return {
                "alert_type": "above_max",
                "severity": threshold.get("severity", "warning"),
                "threshold_value": float(max_val),
                "message": f"{threshold.get('metric_name')} 值 {value:.2f} 超过最大值 {max_val}"
            }
    elif threshold.get("threshold_type") == "warning":
        warn_val = threshold.get("warning_value")
        crit_val = threshold.get("critical_value")
        if crit_val is not None and value > float(crit_val):
            return {
                "alert_type": "critical",
                "severity": "critical",
                "threshold_value": float(crit_val),
                "message": f"{threshold.get('metric_name')} 值 {value:.2f} 超过危急阈值 {crit_val}"
            }
        if warn_val is not None and value > float(warn_val):
            return {
                "alert_type": "warning",
                "severity": "warning",
                "threshold_value": float(warn_val),
                "message": f"{threshold.get('metric_name')} 值 {value:.2f} 超过警告阈值 {warn_val}"
            }

    return None


def get_threshold_config(
    factory_id: str,
    device_id: Optional[str] = None,
    metric_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    conditions = ["factory_id = %(factory_id)s"]
    params = {"factory_id": factory_id}

    if device_id:
        conditions.append("device_id = %(device_id)s")
        params["device_id"] = device_id
    if metric_name:
        conditions.append("metric_name = %(metric_name)s")
        params["metric_name"] = metric_name

    where_clause = "WHERE " + " AND ".join(conditions)

    query = f"""
        SELECT
            threshold_id,
            factory_id,
            device_id,
            metric_name,
            threshold_type,
            min_value,
            max_value,
            warning_value,
            critical_value,
            duration_threshold,
            severity,
            enabled,
            notification_channels,
            created_by,
            created_at,
            updated_at
        FROM alert_thresholds FINAL
        {where_clause}
        ORDER BY metric_name, device_id
    """

    results = execute_query(query, params, timeout=10, use_cache=False)
    return [dict(r, threshold_id=str(r.get("threshold_id", ""))) for r in results]


def save_threshold_config(config: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    from backend.database.clickhouse import get_client

    client = get_client()

    factory_id = config["factory_id"]
    device_id = config.get("device_id", "")
    metric_name = config["metric_name"]
    threshold_type = config.get("threshold_type", "range")
    min_value = config.get("min_value")
    max_value = config.get("max_value")
    warning_value = config.get("warning_value")
    critical_value = config.get("critical_value")
    severity = config.get("severity", "warning")
    enabled = config.get("enabled", True)
    notification_channels = config.get("notification_channels", [])
    duration_threshold = config.get("duration_threshold", 60)

    query = f"""
        INSERT INTO alert_thresholds
        (factory_id, device_id, metric_name, threshold_type, min_value, max_value,
         warning_value, critical_value, duration_threshold, severity, enabled,
         notification_channels, created_by)
        VALUES
        (%(factory_id)s, %(device_id)s, %(metric_name)s, %(threshold_type)s,
         %(min_value)s, %(max_value)s, %(warning_value)s, %(critical_value)s,
         %(duration_threshold)s, %(severity)s, %(enabled)s, %(notification_channels)s,
         %(created_by)s)
    """

    params = {
        "factory_id": factory_id,
        "device_id": device_id,
        "metric_name": metric_name,
        "threshold_type": threshold_type,
        "min_value": min_value,
        "max_value": max_value,
        "warning_value": warning_value,
        "critical_value": critical_value,
        "duration_threshold": duration_threshold,
        "severity": severity,
        "enabled": enabled,
        "notification_channels": notification_channels,
        "created_by": created_by
    }

    client.command(query, parameters=params)

    return {"status": "success", "message": "阈值配置保存成功"}


def delete_threshold_config(threshold_id: str) -> Dict[str, Any]:
    from backend.database.clickhouse import get_client

    client = get_client()

    query = f"""
        ALTER TABLE alert_thresholds DELETE WHERE threshold_id = '{threshold_id}'
    """

    client.command(query)

    return {"status": "success", "message": "阈值配置删除成功"}


def get_dashboard_layout(
    user_id: str,
    layout_type: str = "dashboard",
    factory_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    conditions = ["user_id = %(user_id)s", "layout_type = %(layout_type)s"]
    params = {"user_id": user_id, "layout_type": layout_type}

    if factory_id:
        conditions.append("(factory_id = %(factory_id)s OR factory_id = '')")
        params["factory_id"] = factory_id

    where_clause = "WHERE " + " AND ".join(conditions)

    query = f"""
        SELECT
            layout_id,
            layout_name,
            user_id,
            factory_id,
            layout_type,
            layout_config,
            is_default,
            is_public,
            created_at,
            updated_at
        FROM dashboard_layouts FINAL
        {where_clause}
        ORDER BY is_default DESC, updated_at DESC
    """

    results = execute_query(query, params, timeout=10, use_cache=False)
    return results


def save_dashboard_layout(
    user_id: str,
    layout_data: Dict[str, Any]
) -> Dict[str, Any]:
    from backend.database.clickhouse import get_client

    client = get_client()

    layout_id = layout_data.get("layout_id")
    layout_name = layout_data.get("layout_name", "自定义布局")
    factory_id = layout_data.get("factory_id", "")
    layout_type = layout_data.get("layout_type", "dashboard")
    layout_config = str(layout_data.get("layout_config", "{}")).replace("'", "''")
    is_default = layout_data.get("is_default", False)
    is_public = layout_data.get("is_public", False)

    if is_default:
        clear_query = f"""
            ALTER TABLE dashboard_layouts UPDATE is_default = false
            WHERE user_id = '{user_id}' AND layout_type = '{layout_type}'
        """
        client.command(clear_query)

    query = f"""
        INSERT INTO dashboard_layouts
        (layout_name, user_id, factory_id, layout_type, layout_config, is_default, is_public)
        VALUES
        ('{layout_name}', '{user_id}', '{factory_id}', '{layout_type}',
         '{layout_config}', {is_default}, {is_public})
    """

    client.command(query)

    return {"status": "success", "message": "大屏布局保存成功"}


def delete_dashboard_layout(user_id: str, layout_id: str) -> Dict[str, Any]:
    from backend.database.clickhouse import get_client

    client = get_client()

    query = f"""
        ALTER TABLE dashboard_layouts DELETE
        WHERE user_id = '{user_id}' AND layout_id = '{layout_id}'
    """

    client.command(query)

    return {"status": "success", "message": "大屏布局删除成功"}


def get_alert_records(
    factory_id: str,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    conditions = ["factory_id = %(factory_id)s"]
    params = {"factory_id": factory_id, "limit": limit}

    if status:
        conditions.append("status = %(status)s")
        params["status"] = status
    if severity:
        conditions.append("severity = %(severity)s")
        params["severity"] = severity
    if start_time:
        conditions.append("triggered_at >= %(start_time)s")
        params["start_time"] = start_time
    if end_time:
        conditions.append("triggered_at <= %(end_time)s")
        params["end_time"] = end_time

    where_clause = "WHERE " + " AND ".join(conditions)

    query = f"""
        SELECT
            alert_id,
            factory_id,
            device_id,
            metric_name,
            threshold_id,
            alert_type,
            severity,
            metric_value,
            threshold_value,
            message,
            status,
            triggered_at,
            resolved_at,
            acknowledged_by,
            acknowledged_at,
            notes
        FROM alert_records
        {where_clause}
        ORDER BY triggered_at DESC
        LIMIT %(limit)s
    """

    results = execute_query(query, params, timeout=15, use_cache=False)
    return [dict(r, alert_id=str(r.get("alert_id", ""))) for r in results]


def acknowledge_alert(
    alert_id: str,
    acknowledged_by: str,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    from backend.database.clickhouse import get_client

    client = get_client()

    now = datetime.now()
    notes_str = f"'{notes}'" if notes else 'NULL'

    query = f"""
        ALTER TABLE alert_records UPDATE
            status = 'acknowledged',
            acknowledged_by = '{acknowledged_by}',
            acknowledged_at = '{now}',
            notes = {notes_str}
        WHERE alert_id = '{alert_id}'
    """

    client.command(query)

    return {"status": "success", "message": "告警已确认"}


def resolve_alert(
    alert_id: str,
    resolved_by: Optional[str] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    from backend.database.clickhouse import get_client

    client = get_client()

    now = datetime.now()
    notes_str = f"'{notes}'" if notes else 'NULL'

    query = f"""
        ALTER TABLE alert_records UPDATE
            status = 'resolved',
            resolved_at = '{now}',
            notes = {notes_str}
        WHERE alert_id = '{alert_id}'
    """

    client.command(query)

    return {"status": "success", "message": "告警已解决"}
