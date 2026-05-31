import clickhouse_connect
from clickhouse_connect.driver import Client
from typing import Optional, List, Dict, Any
from contextlib import contextmanager
import hashlib
import json
import time

from backend.config import settings
from backend.utils.logger import setup_logger

logger = setup_logger()

_client: Optional[Client] = None

_query_cache: Dict[str, Any] = {}
_CACHE_TTL = 60
_CACHE_MAX_SIZE = 200


def get_client() -> Client:
    global _client
    if _client is None:
        try:
            _client = clickhouse_connect.get_client(
                host=settings.CLICKHOUSE_HOST,
                port=settings.CLICKHOUSE_PORT,
                username=settings.CLICKHOUSE_USER,
                password=settings.CLICKHOUSE_PASSWORD,
                database=settings.CLICKHOUSE_DATABASE,
                connect_timeout=10,
                send_receive_timeout=300,
                settings={
                    'max_execution_time': 60,
                    'max_rows_to_read': 100000000,
                    'max_bytes_to_read': 10737418240,
                    'read_overflow_mode': 'break',
                }
            )
            logger.info("ClickHouse client connected successfully")
        except Exception as e:
            logger.error(f"Failed to connect to ClickHouse: {e}")
            raise
    return _client


@contextmanager
def get_client_context():
    client = get_client()
    try:
        yield client
    finally:
        pass


def _make_cache_key(query: str, params: Optional[Dict[str, Any]] = None) -> str:
    raw = query + (json.dumps(params, sort_keys=True, default=str) if params else "")
    return hashlib.md5(raw.encode()).hexdigest()


def _get_cached(key: str) -> Optional[List[Dict[str, Any]]]:
    entry = _query_cache.get(key)
    if entry is None:
        return None
    if time.time() - entry["ts"] > _CACHE_TTL:
        del _query_cache[key]
        return None
    return entry["data"]


def _set_cached(key: str, data: List[Dict[str, Any]]):
    if len(_query_cache) >= _CACHE_MAX_SIZE:
        oldest_key = min(_query_cache, key=lambda k: _query_cache[k]["ts"])
        del _query_cache[oldest_key]
    _query_cache[key] = {"data": data, "ts": time.time()}


def invalidate_cache(pattern: Optional[str] = None):
    if pattern is None:
        _query_cache.clear()
    else:
        keys_to_remove = [k for k in _query_cache if pattern in k]
        for k in keys_to_remove:
            del _query_cache[k]


def init_clickhouse():
    client = clickhouse_connect.get_client(
        host=settings.CLICKHOUSE_HOST,
        port=settings.CLICKHOUSE_PORT,
        username=settings.CLICKHOUSE_USER,
        password=settings.CLICKHOUSE_PASSWORD
    )

    client.command(f"CREATE DATABASE IF NOT EXISTS {settings.CLICKHOUSE_DATABASE}")
    client.database = settings.CLICKHOUSE_DATABASE

    create_tables(client)
    create_materialized_views(client)
    create_users_table(client)
    create_skip_indexes(client)
    create_alert_tables(client)
    create_dashboard_layout_table(client)
    logger.info("ClickHouse tables initialized successfully")


def create_tables(client: Client):
    client.command("""
        CREATE TABLE IF NOT EXISTS industrial_metrics (
            timestamp DateTime64(9) CODEC(DoubleDelta, LZ4),
            device_id String CODEC(LZ4),
            device_type String CODEC(LZ4),
            factory_id String CODEC(LZ4),
            metric_name String CODEC(LZ4),
            metric_value Float64 CODEC(Gorilla, LZ4),
            unit String CODEC(LZ4),
            quality Int8 DEFAULT 1 CODEC(LZ4),
            tags Map(String, String) CODEC(LZ4)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (factory_id, device_id, metric_name, timestamp)
        TTL timestamp + INTERVAL 2 YEAR
        SETTINGS index_granularity = 8192
    """)

    client.command("""
        CREATE TABLE IF NOT EXISTS devices (
            device_id String,
            device_name String,
            device_type String,
            factory_id String,
            factory_name String,
            metrics Array(String),
            status String DEFAULT 'online',
            created_at DateTime DEFAULT now(),
            updated_at DateTime DEFAULT now()
        )
        ENGINE = ReplacingMergeTree(updated_at)
        ORDER BY (factory_id, device_id)
    """)

    client.command("""
        CREATE TABLE IF NOT EXISTS data_cleaning_tasks (
            task_id UUID DEFAULT generateUUIDv4(),
            task_name String,
            source_table String,
            target_table String,
            cleaning_rules Array(String),
            status String DEFAULT 'pending',
            created_by String,
            created_at DateTime DEFAULT now(),
            started_at Nullable(DateTime),
            completed_at Nullable(DateTime),
            processed_rows UInt64 DEFAULT 0,
            error_message Nullable(String)
        )
        ENGINE = MergeTree()
        ORDER BY (task_id, created_at)
    """)

    client.command("""
        CREATE TABLE IF NOT EXISTS report_tasks (
            report_id UUID DEFAULT generateUUIDv4(),
            report_name String,
            report_type String,
            parameters Map(String, String),
            status String DEFAULT 'pending',
            created_by String,
            created_at DateTime DEFAULT now(),
            started_at Nullable(DateTime),
            completed_at Nullable(DateTime),
            file_path Nullable(String),
            file_size Nullable(UInt64)
        )
        ENGINE = MergeTree()
        ORDER BY (report_id, created_at)
    """)


def create_materialized_views(client: Client):
    client.command("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1min_mv
        ENGINE = SummingMergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (factory_id, device_id, metric_name, timestamp)
        AS
        SELECT
            toStartOfMinute(timestamp) AS timestamp,
            factory_id,
            device_id,
            metric_name,
            avg(metric_value) AS avg_value,
            min(metric_value) AS min_value,
            max(metric_value) AS max_value,
            sum(metric_value) AS sum_value,
            count() AS count_value
        FROM industrial_metrics
        GROUP BY timestamp, factory_id, device_id, metric_name
    """)

    client.command("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1hour_mv
        ENGINE = SummingMergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (factory_id, device_id, metric_name, timestamp)
        AS
        SELECT
            toStartOfHour(timestamp) AS timestamp,
            factory_id,
            device_id,
            metric_name,
            avg(metric_value) AS avg_value,
            min(metric_value) AS min_value,
            max(metric_value) AS max_value,
            sum(metric_value) AS sum_value,
            count() AS count_value
        FROM industrial_metrics
        GROUP BY timestamp, factory_id, device_id, metric_name
    """)

    client.command("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1day_mv
        ENGINE = SummingMergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (factory_id, device_id, metric_name, timestamp)
        AS
        SELECT
            toStartOfDay(timestamp) AS timestamp,
            factory_id,
            device_id,
            metric_name,
            avg(metric_value) AS avg_value,
            min(metric_value) AS min_value,
            max(metric_value) AS max_value,
            sum(metric_value) AS sum_value,
            count() AS count_value
        FROM industrial_metrics
        GROUP BY timestamp, factory_id, device_id, metric_name
    """)

    client.command("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1week_mv
        ENGINE = SummingMergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (factory_id, device_id, metric_name, timestamp)
        AS
        SELECT
            toStartOfWeek(timestamp, 1) AS timestamp,
            factory_id,
            device_id,
            metric_name,
            avg(metric_value) AS avg_value,
            min(metric_value) AS min_value,
            max(metric_value) AS max_value,
            sum(metric_value) AS sum_value,
            count() AS count_value
        FROM industrial_metrics
        GROUP BY timestamp, factory_id, device_id, metric_name
    """)

    client.command("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1month_mv
        ENGINE = SummingMergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (factory_id, device_id, metric_name, timestamp)
        AS
        SELECT
            toStartOfMonth(timestamp) AS timestamp,
            factory_id,
            device_id,
            metric_name,
            avg(metric_value) AS avg_value,
            min(metric_value) AS min_value,
            max(metric_value) AS max_value,
            sum(metric_value) AS sum_value,
            count() AS count_value
        FROM industrial_metrics
        GROUP BY timestamp, factory_id, device_id, metric_name
    """)


def create_users_table(client: Client):
    client.command("""
        CREATE TABLE IF NOT EXISTS users (
            user_id UUID DEFAULT generateUUIDv4(),
            username String,
            email String,
            hashed_password String,
            full_name Nullable(String),
            role String DEFAULT 'viewer',
            permissions Array(String) DEFAULT ['read'],
            factories Array(String) DEFAULT [],
            is_active Bool DEFAULT true,
            created_at DateTime DEFAULT now(),
            last_login Nullable(DateTime)
        )
        ENGINE = ReplacingMergeTree(created_at)
        ORDER BY (user_id, username)
    """)

    from backend.services.auth import get_password_hash
    
    result = client.query("SELECT count() FROM users WHERE username = 'admin'")
    if result.first_row == 0:
        hashed_pwd = get_password_hash("admin123")
        client.command(f"""
            INSERT INTO users (username, email, hashed_password, full_name, role, permissions, factories)
            VALUES ('admin', 'admin@example.com', '{hashed_pwd}', '系统管理员', 'admin', ['read', 'write', 'admin'], ['*'])
        """)
        logger.info("Default admin user created")


def execute_query(
    query: str,
    params: Optional[Dict[str, Any]] = None,
    timeout: int = 60,
    use_cache: bool = True
) -> List[Dict[str, Any]]:
    if use_cache:
        cache_key = _make_cache_key(query, params)
        cached = _get_cached(cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for query: {query[:80]}...")
            return cached

    client = get_client()
    try:
        result = client.query(
            query,
            parameters=params or {},
            settings={
                'max_execution_time': timeout,
                'max_rows_to_read': 100000000,
                'read_overflow_mode': 'break',
            }
        )
        columns = result.column_names
        data = [dict(zip(columns, row)) for row in result.result_rows]
    except clickhouse_connect.driver.exceptions.DatabaseError as e:
        if "TIMEOUT" in str(e) or "max_execution_time" in str(e):
            logger.error(f"Query timeout after {timeout}s: {query[:200]}")
            raise TimeoutError(f"查询超时({timeout}s)，请缩小查询时间范围或使用聚合查询") from e
        logger.error(f"ClickHouse query error: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected query error: {e}")
        raise

    if use_cache:
        _set_cached(cache_key, data)

    return data


def execute_query_stream(
    query: str,
    params: Optional[Dict[str, Any]] = None,
    batch_size: int = 10000
):
    client = get_client()
    try:
        result = client.query(
            query,
            parameters=params or {},
            settings={
                'max_execution_time': 120,
                'max_block_size': batch_size,
            }
        )
        columns = result.column_names
        for row in result.result_rows:
            yield dict(zip(columns, row))
    except Exception as e:
        logger.error(f"Stream query error: {e}")
        raise


def insert_data(table: str, data: List[Dict[str, Any]]):
    if not data:
        return
    client = get_client()

    batch_size = 50000
    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        columns = list(batch[0].keys())
        rows = [[row[col] for col in columns] for row in batch]
        client.insert(table, rows, column_names=columns)

    _invalidate_table_cache(table)


def _invalidate_table_cache(table: str):
    keys_to_remove = []
    for key in _query_cache:
        cached_data = _query_cache[key].get("data", [])
        if cached_data and len(cached_data) > 0:
            keys_to_remove.append(key)
    for key in keys_to_remove:
        del _query_cache[key]


def create_skip_indexes(client: Client):
    try:
        client.command("""
            ALTER TABLE industrial_metrics ADD INDEX IF NOT EXISTS
                idx_metric_value metric_value TYPE minmax GRANULARITY 4
        """)
    except Exception as e:
        logger.warning(f"Skip index idx_metric_value may already exist: {e}")

    try:
        client.command("""
            ALTER TABLE industrial_metrics ADD INDEX IF NOT EXISTS
                idx_quality quality TYPE set(100) GRANULARITY 1
        """)
    except Exception as e:
        logger.warning(f"Skip index idx_quality may already exist: {e}")

    try:
        client.command("""
            ALTER TABLE industrial_metrics ADD INDEX IF NOT EXISTS
                idx_device_metric (device_id, metric_name) TYPE bloom_filter(0.01) GRANULARITY 1
        """)
    except Exception as e:
        logger.warning(f"Bloom filter index may already exist: {e}")

    try:
        client.command("""
            ALTER TABLE industrial_metrics ADD INDEX IF NOT EXISTS
                idx_metric_name_bf metric_name TYPE bloom_filter(0.01) GRANULARITY 1
        """)
    except Exception as e:
        logger.warning(f"Bloom filter index for metric_name may already exist: {e}")

    try:
        client.command("""
            MATERIALIZE INDEX idx_metric_value ON industrial_metrics
        """)
        client.command("""
            MATERIALIZE INDEX idx_quality ON industrial_metrics
        """)
        client.command("""
            MATERIALIZE INDEX idx_device_metric ON industrial_metrics
        """)
        client.command("""
            MATERIALIZE INDEX idx_metric_name_bf ON industrial_metrics
        """)
    except Exception as e:
        logger.info(f"Index materialization skipped (may already exist): {e}")

    logger.info("Skip indexes created successfully")


def create_alert_tables(client: Client):
    client.command("""
        CREATE TABLE IF NOT EXISTS alert_thresholds (
            threshold_id UUID DEFAULT generateUUIDv4(),
            factory_id String,
            device_id String DEFAULT '',
            metric_name String,
            threshold_type String DEFAULT 'range',
            min_value Nullable(Float64),
            max_value Nullable(Float64),
            warning_value Nullable(Float64),
            critical_value Nullable(Float64),
            duration_threshold Int32 DEFAULT 60,
            severity String DEFAULT 'warning',
            enabled Bool DEFAULT true,
            notification_channels Array(String) DEFAULT [],
            created_by String,
            created_at DateTime DEFAULT now(),
            updated_at DateTime DEFAULT now()
        )
        ENGINE = ReplacingMergeTree(updated_at)
        ORDER BY (factory_id, device_id, metric_name, threshold_id)
    """)

    client.command("""
        CREATE TABLE IF NOT EXISTS alert_records (
            alert_id UUID DEFAULT generateUUIDv4(),
            factory_id String,
            device_id String,
            metric_name String,
            threshold_id String,
            alert_type String,
            severity String,
            metric_value Float64,
            threshold_value Float64,
            message String,
            status String DEFAULT 'active',
            triggered_at DateTime DEFAULT now(),
            resolved_at Nullable(DateTime),
            acknowledged_by Nullable(String),
            acknowledged_at Nullable(DateTime),
            notes Nullable(String)
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(triggered_at)
        ORDER BY (factory_id, device_id, metric_name, triggered_at)
        TTL triggered_at + INTERVAL 1 YEAR
    """)

    logger.info("Alert tables created successfully")


def create_dashboard_layout_table(client: Client):
    client.command("""
        CREATE TABLE IF NOT EXISTS dashboard_layouts (
            layout_id UUID DEFAULT generateUUIDv4(),
            layout_name String,
            user_id String,
            factory_id String DEFAULT '',
            layout_type String DEFAULT 'dashboard',
            layout_config String,
            is_default Bool DEFAULT false,
            is_public Bool DEFAULT false,
            created_at DateTime DEFAULT now(),
            updated_at DateTime DEFAULT now()
        )
        ENGINE = ReplacingMergeTree(updated_at)
        ORDER BY (user_id, layout_type, layout_id)
    """)

    logger.info("Dashboard layout table created successfully")
