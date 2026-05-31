-- ClickHouse Database Schema for Industrial IoT Analytics Platform

CREATE DATABASE IF NOT EXISTS industrial_iot;

USE industrial_iot;

-- 主时序数据表
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
SETTINGS index_granularity = 8192;

-- 设备元数据表
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
ORDER BY (factory_id, device_id);

-- 数据清洗任务表
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
ORDER BY (task_id, created_at);

-- 报表任务表
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
ORDER BY (report_id, created_at);

-- 用户表
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
ORDER BY (user_id, username);

-- 1分钟聚合视图
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
GROUP BY timestamp, factory_id, device_id, metric_name;

-- 1小时聚合视图
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
GROUP BY timestamp, factory_id, device_id, metric_name;

-- 1天聚合视图
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
GROUP BY timestamp, factory_id, device_id, metric_name;
