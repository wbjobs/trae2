-- ============================================
-- 光伏电站运维分析系统 Hive 表结构
-- ============================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS pv_ops_db LOCATION '/user/hive/warehouse/pv_ops_db.db';
USE pv_ops_db;

-- ============================================
-- 原始数据表 (ODS 层)
-- ============================================

-- 光伏板原始数据表
CREATE TABLE IF NOT EXISTS pv_panel_raw (
    device_id STRING COMMENT '光伏板设备ID',
    station_id STRING COMMENT '电站ID',
    data_time TIMESTAMP COMMENT '数据采集时间',
    power_output DOUBLE COMMENT '输出功率 (W)',
    voltage DOUBLE COMMENT '电压 (V)',
    current DOUBLE COMMENT '电流 (A)',
    temperature DOUBLE COMMENT '组件温度 (°C)',
    irradiance DOUBLE COMMENT '辐照度 (W/m²)',
    status STRING COMMENT '运行状态'
)
PARTITIONED BY (dt STRING COMMENT '日期分区')
STORED AS PARQUET
TBLPROPERTIES ('comment'='光伏板原始采集数据');

-- 逆变器原始数据表
CREATE TABLE IF NOT EXISTS pv_inverter_raw (
    inverter_id STRING COMMENT '逆变器ID',
    station_id STRING COMMENT '电站ID',
    data_time TIMESTAMP COMMENT '数据采集时间',
    active_power DOUBLE COMMENT '有功功率 (kW)',
    reactive_power DOUBLE COMMENT '无功功率 (kVar)',
    voltage DOUBLE COMMENT '交流输出电压 (V)',
    current DOUBLE COMMENT '交流输出电流 (A)',
    frequency DOUBLE COMMENT '电网频率 (Hz)',
    efficiency DOUBLE COMMENT '逆变器效率 (%)',
    temperature DOUBLE COMMENT '逆变器温度 (°C)',
    status STRING COMMENT '运行状态'
)
PARTITIONED BY (dt STRING COMMENT '日期分区')
STORED AS PARQUET
TBLPROPERTIES ('comment'='逆变器原始采集数据');

-- 故障原始数据表
CREATE TABLE IF NOT EXISTS pv_fault_raw (
    fault_id STRING COMMENT '故障ID',
    device_id STRING COMMENT '设备ID',
    station_id STRING COMMENT '电站ID',
    fault_code STRING COMMENT '故障代码',
    fault_type STRING COMMENT '故障类型',
    fault_time TIMESTAMP COMMENT '故障发生时间',
    recover_time TIMESTAMP COMMENT '故障恢复时间',
    duration_hours DOUBLE COMMENT '故障持续时长 (小时)',
    severity STRING COMMENT '严重程度: critical/major/minor',
    status STRING COMMENT '处理状态: open/closed',
    impact_power DOUBLE COMMENT '影响发电量 (kWh)',
    description STRING COMMENT '故障描述'
)
PARTITIONED BY (dt STRING COMMENT '日期分区')
STORED AS PARQUET
TBLPROPERTIES ('comment'='设备故障记录数据');

-- 气象站原始数据表
CREATE TABLE IF NOT EXISTS pv_weather_raw (
    station_id STRING COMMENT '电站ID',
    data_time TIMESTAMP COMMENT '数据采集时间',
    temperature DOUBLE COMMENT '环境温度 (°C)',
    humidity DOUBLE COMMENT '相对湿度 (%)',
    wind_speed DOUBLE COMMENT '风速 (m/s)',
    wind_direction DOUBLE COMMENT '风向 (°)',
    irradiance DOUBLE COMMENT '辐照度 (W/m²)',
    precipitation DOUBLE COMMENT '降水量 (mm)',
    pressure DOUBLE COMMENT '大气压强 (hPa)'
)
PARTITIONED BY (dt STRING COMMENT '日期分区')
STORED AS PARQUET
TBLPROPERTIES ('comment'='气象站采集数据');

-- 设备状态表
CREATE TABLE IF NOT EXISTS pv_device_status (
    device_id STRING COMMENT '设备ID',
    station_id STRING COMMENT '电站ID',
    device_type STRING COMMENT '设备类型: panel/inverter/combiner',
    status STRING COMMENT '设备状态: online/offline/fault',
    last_heartbeat TIMESTAMP COMMENT '最后心跳时间',
    alarm_count INT COMMENT '告警次数'
)
PARTITIONED BY (dt STRING COMMENT '日期分区')
STORED AS PARQUET
TBLPROPERTIES ('comment'='设备实时状态表');

-- ============================================
-- 清洗后数据表 (DWD 层)
-- ============================================

-- 光伏板清洗后数据表
CREATE TABLE IF NOT EXISTS pv_panel_cleaned (
    device_id STRING COMMENT '光伏板设备ID',
    station_id STRING COMMENT '电站ID',
    data_time TIMESTAMP COMMENT '数据采集时间',
    power_output DOUBLE COMMENT '输出功率 (W)',
    voltage DOUBLE COMMENT '电压 (V)',
    current DOUBLE COMMENT '电流 (A)',
    temperature DOUBLE COMMENT '组件温度 (°C)',
    irradiance DOUBLE COMMENT '辐照度 (W/m²)',
    status STRING COMMENT '运行状态',
    data_quality STRING COMMENT '数据质量: good/suspect'
)
PARTITIONED BY (dt STRING COMMENT '日期分区')
STORED AS PARQUET
TBLPROPERTIES ('comment'='清洗后的光伏板数据');

-- 逆变器清洗后数据表
CREATE TABLE IF NOT EXISTS pv_inverter_cleaned (
    inverter_id STRING COMMENT '逆变器ID',
    station_id STRING COMMENT '电站ID',
    data_time TIMESTAMP COMMENT '数据采集时间',
    active_power DOUBLE COMMENT '有功功率 (kW)',
    reactive_power DOUBLE COMMENT '无功功率 (kVar)',
    voltage DOUBLE COMMENT '交流输出电压 (V)',
    current DOUBLE COMMENT '交流输出电流 (A)',
    frequency DOUBLE COMMENT '电网频率 (Hz)',
    efficiency DOUBLE COMMENT '逆变器效率 (%)',
    temperature DOUBLE COMMENT '逆变器温度 (°C)',
    status STRING COMMENT '运行状态',
    data_quality STRING COMMENT '数据质量: good/suspect'
)
PARTITIONED BY (dt STRING COMMENT '日期分区')
STORED AS PARQUET
TBLPROPERTIES ('comment'='清洗后的逆变器数据');

-- ============================================
-- 聚合数据表 (DWS 层)
-- ============================================

-- 发电量小时聚合表
CREATE TABLE IF NOT EXISTS pv_power_hourly (
    station_id STRING COMMENT '电站ID',
    date STRING COMMENT '日期',
    hour INT COMMENT '小时',
    total_power DOUBLE COMMENT '总发电量 (kWh)',
    avg_power DOUBLE COMMENT '平均功率 (kW)',
    max_power DOUBLE COMMENT '最大功率 (kW)',
    min_power DOUBLE COMMENT '最小功率 (kW)',
    record_count BIGINT COMMENT '记录数'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='发电量小时聚合数据');

-- 发电量日聚合表
CREATE TABLE IF NOT EXISTS pv_power_daily (
    station_id STRING COMMENT '电站ID',
    date STRING COMMENT '日期',
    total_power DOUBLE COMMENT '总发电量 (kWh)',
    avg_power DOUBLE COMMENT '平均功率 (kW)',
    max_power DOUBLE COMMENT '最大功率 (kW)',
    min_power DOUBLE COMMENT '最小功率 (kW)',
    record_count BIGINT COMMENT '记录数',
    irradiation DOUBLE COMMENT '当日辐照量 (kWh/m²)'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='发电量日聚合数据');

-- 发电量月聚合表
CREATE TABLE IF NOT EXISTS pv_power_monthly (
    station_id STRING COMMENT '电站ID',
    year_month STRING COMMENT '年月',
    total_power DOUBLE COMMENT '总发电量 (MWh)',
    avg_daily_power DOUBLE COMMENT '日均发电量 (kWh)',
    max_power DOUBLE COMMENT '峰值功率 (kW)',
    operational_days INT COMMENT '运行天数'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='发电量月聚合数据');

-- 故障统计日聚合表
CREATE TABLE IF NOT EXISTS pv_fault_daily (
    station_id STRING COMMENT '电站ID',
    date STRING COMMENT '日期',
    total_faults INT COMMENT '总故障数',
    open_faults INT COMMENT '未处理故障数',
    critical_faults INT COMMENT '严重故障数',
    major_faults INT COMMENT '主要故障数',
    minor_faults INT COMMENT '次要故障数',
    avg_duration DOUBLE COMMENT '平均故障时长 (小时)',
    total_impact_power DOUBLE COMMENT '总影响发电量 (kWh)'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='故障统计日聚合数据');

-- 设备效率日统计表
CREATE TABLE IF NOT EXISTS pv_efficiency_daily (
    station_id STRING COMMENT '电站ID',
    date STRING COMMENT '日期',
    inverter_id STRING COMMENT '逆变器ID',
    avg_efficiency DOUBLE COMMENT '平均效率 (%)',
    max_efficiency DOUBLE COMMENT '最高效率 (%)',
    min_efficiency DOUBLE COMMENT '最低效率 (%)',
    pr DOUBLE COMMENT '性能比 (PR) (%)',
    availability DOUBLE COMMENT '可用率 (%)'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='设备效率日统计数据');

-- ============================================
-- 应用层数据表 (ADS 层)
-- ============================================

-- 电站运行日报表
CREATE TABLE IF NOT EXISTS pv_station_daily_report (
    station_id STRING COMMENT '电站ID',
    station_name STRING COMMENT '电站名称',
    date STRING COMMENT '日期',
    total_power DOUBLE COMMENT '发电量 (kWh)',
    target_power DOUBLE COMMENT '目标发电量 (kWh)',
    completion_rate DOUBLE COMMENT '完成率 (%)',
    avg_efficiency DOUBLE COMMENT '平均效率 (%)',
    loss_rate DOUBLE COMMENT '损耗率 (%)',
    fault_count INT COMMENT '故障次数',
    availability DOUBLE COMMENT '设备可用率 (%)',
    online_rate DOUBLE COMMENT '设备在线率 (%)',
    irradiation DOUBLE COMMENT '辐照量 (kWh/m²)',
    equivalent_hours DOUBLE COMMENT '等效利用小时数 (h)'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='电站运行日报表');

-- 故障类型统计表
CREATE TABLE IF NOT EXISTS pv_fault_type_stats (
    station_id STRING COMMENT '电站ID',
    fault_type STRING COMMENT '故障类型',
    start_date STRING COMMENT '统计开始日期',
    end_date STRING COMMENT '统计结束日期',
    fault_count INT COMMENT '故障次数',
    total_duration DOUBLE COMMENT '总持续时长 (小时)',
    avg_duration DOUBLE COMMENT '平均持续时长 (小时)',
    total_impact DOUBLE COMMENT '总影响发电量 (kWh)',
    rank INT COMMENT '故障次数排名'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='故障类型统计数据');

-- ============================================
-- 视图定义
-- ============================================

-- 当前运行状态视图
CREATE VIEW IF NOT EXISTS v_current_operation_status AS
SELECT 
    s.station_id,
    s.station_name,
    COUNT(DISTINCT CASE WHEN d.status = 'online' THEN d.device_id END) as online_devices,
    COUNT(DISTINCT d.device_id) as total_devices,
    ROUND(COUNT(DISTINCT CASE WHEN d.status = 'online' THEN d.device_id END) * 100.0 / COUNT(DISTINCT d.device_id), 2) as online_rate,
    SUM(CASE WHEN f.status = 'open' THEN 1 ELSE 0 END) as open_faults
FROM pv_station_info s
LEFT JOIN pv_device_status d ON s.station_id = d.station_id
LEFT JOIN pv_fault_raw f ON s.station_id = f.station_id AND f.status = 'open'
GROUP BY s.station_id, s.station_name;

-- 发电效率趋势视图
CREATE VIEW IF NOT EXISTS v_efficiency_trend AS
SELECT 
    station_id,
    date,
    avg_efficiency,
    LAG(avg_efficiency, 1) OVER (PARTITION BY station_id ORDER BY date) as prev_day_efficiency,
    ROUND((avg_efficiency - LAG(avg_efficiency, 1) OVER (PARTITION BY station_id ORDER BY date)), 2) as efficiency_change
FROM pv_efficiency_daily
ORDER BY station_id, date;

-- ============================================
-- 数据字典表
-- ============================================

CREATE TABLE IF NOT EXISTS pv_dict_fault_type (
    fault_code STRING COMMENT '故障代码',
    fault_name STRING COMMENT '故障名称',
    fault_type STRING COMMENT '故障大类',
    severity STRING COMMENT '严重程度',
    description STRING COMMENT '故障描述',
    solution STRING COMMENT '处理建议'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='故障类型字典表');

CREATE TABLE IF NOT EXISTS pv_station_info (
    station_id STRING COMMENT '电站ID',
    station_name STRING COMMENT '电站名称',
    capacity DOUBLE COMMENT '装机容量 (MW)',
    install_date STRING COMMENT '投运日期',
    location STRING COMMENT '地理位置',
    longitude DOUBLE COMMENT '经度',
    latitude DOUBLE COMMENT '纬度',
    panel_count INT COMMENT '光伏板数量',
    inverter_count INT COMMENT '逆变器数量',
    operator STRING COMMENT '运营单位'
)
STORED AS PARQUET
TBLPROPERTIES ('comment'='电站基础信息表');

-- ============================================
-- 索引定义（Hive 3.0+ Materialized View / Index）
-- ============================================

-- 发电量日聚合表 - 按日期和电站ID的复合索引
CREATE INDEX IF NOT EXISTS idx_power_daily_date_station 
ON TABLE pv_power_daily (date, station_id) 
AS 'COMPACT' 
WITH DEFERRED REBUILD;

-- 发电量小时聚合表 - 按日期和电站ID的复合索引
CREATE INDEX IF NOT EXISTS idx_power_hourly_date_station 
ON TABLE pv_power_hourly (date, station_id) 
AS 'COMPACT' 
WITH DEFERRED REBUILD;

-- 故障日聚合表 - 按日期和电站ID的复合索引
CREATE INDEX IF NOT EXISTS idx_fault_daily_date_station 
ON TABLE pv_fault_daily (date, station_id) 
AS 'COMPACT' 
WITH DEFERRED REBUILD;

-- 故障原始数据表 - 按故障类型索引
CREATE INDEX IF NOT EXISTS idx_fault_raw_type 
ON TABLE pv_fault_raw (fault_type) 
AS 'COMPACT' 
WITH DEFERRED REBUILD;

-- 设备状态表 - 按电站ID和状态复合索引
CREATE INDEX IF NOT EXISTS idx_device_status_station_status 
ON TABLE pv_device_status (station_id, status) 
AS 'COMPACT' 
WITH DEFERRED REBUILD;

-- 清洗后光伏板数据 - 按数据质量和日期索引
CREATE INDEX IF NOT EXISTS idx_panel_cleaned_quality_date 
ON TABLE pv_panel_cleaned (data_quality, dt) 
AS 'COMPACT' 
WITH DEFERRED REBUILD;

-- 清洗后逆变器数据 - 按电站ID和时间索引
CREATE INDEX IF NOT EXISTS idx_inverter_cleaned_station_time 
ON TABLE pv_inverter_cleaned (station_id, dt) 
AS 'COMPACT' 
WITH DEFERRED REBUILD;

-- ============================================
-- 物化视图（Hive 3.0+ Materialized View）
-- ============================================

-- 发电量同比环比物化视图 - 预计算月度聚合与去年同期
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_power_monthly_yoy
DISABLE REWRITE
AS
SELECT 
    curr.station_id,
    curr.year_month AS current_month,
    curr.total_power AS current_power,
    prev.year_month AS previous_month,
    prev.total_power AS previous_power,
    ROUND((curr.total_power - prev.total_power) / prev.total_power * 100, 2) AS yoy_change_rate
FROM pv_power_monthly curr
LEFT JOIN pv_power_monthly prev 
    ON curr.station_id = prev.station_id 
    AND CONCAT(SUBSTRING(curr.year_month, 1, 4) - 1, SUBSTRING(curr.year_month, 5, 2)) = prev.year_month
WHERE prev.total_power > 0;

-- 故障类型地理分布物化视图 - 预聚合各电站故障统计
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_fault_geo_stats
DISABLE REWRITE
AS
SELECT 
    f.station_id,
    s.station_name,
    s.longitude,
    s.latitude,
    f.fault_type,
    SUM(f.fault_count) AS total_fault_count,
    AVG(f.avg_duration) AS avg_duration,
    SUM(f.total_impact_power) AS total_impact_power
FROM pv_fault_daily f
JOIN pv_station_info s ON f.station_id = s.station_id
GROUP BY f.station_id, s.station_name, s.longitude, s.latitude, f.fault_type;

-- 电站日运行概览物化视图
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_station_daily_overview
DISABLE REWRITE
AS
SELECT 
    p.station_id,
    p.date,
    p.total_power,
    p.avg_power,
    e.avg_efficiency,
    f.total_faults,
    f.open_faults,
    d.online_rate
FROM pv_power_daily p
LEFT JOIN pv_efficiency_daily e ON p.station_id = e.station_id AND p.date = e.date
LEFT JOIN pv_fault_daily f ON p.station_id = f.station_id AND p.date = f.date
LEFT JOIN (
    SELECT station_id, dt AS date,
           ROUND(COUNT(CASE WHEN status = 'online' THEN 1 END) * 100.0 / COUNT(*), 2) AS online_rate
    FROM pv_device_status
    GROUP BY station_id, dt
) d ON p.station_id = d.station_id AND p.date = d.date;

-- ============================================
-- 查询优化配置
-- ============================================

-- 启用物化视图自动重写
SET hive.materializedview.rewriting=true;

-- 启用向量化查询执行
SET hive.exec.parallel=true;
SET hive.exec.parallel.thread.number=8;

-- 启用 CBO (Cost-Based Optimizer)
SET hive.cbo.enable=true;
SET hive.compute.query.using.stats=true;
SET hive.stats.fetch.column.stats=true;

-- Parquet 读取优化
SET hive.exec.orc.compression.strategy=COMPRESSION;
SET parquet.read.support.int96.timestamp=true;

-- 动态分区优化
SET hive.exec.dynamic.partition=true;
SET hive.exec.dynamic.partition.mode=nonstrict;
SET hive.exec.max.dynamic.partitions=1000;

-- Join 优化
SET hive.auto.convert.join=true;
SET hive.auto.convert.join.noconditionaltask=true;
SET hive.auto.convert.join.noconditionaltask.size=100000000;

-- MapJoin 优化小表
SET hive.mapjoin.smalltable.filesize=25000000;

-- 索引自动使用
SET hive.optimize.index.filter=true;
SET hive.optimize.index.autocompact=true;

-- ============================================
-- 分区修复与统计信息收集
-- ============================================

-- 收集各表统计信息以优化查询计划
ANALYZE TABLE pv_panel_raw COMPUTE STATISTICS;
ANALYZE TABLE pv_panel_raw COMPUTE STATISTICS FOR COLUMNS device_id, station_id, data_time, power_output, irradiance;

ANALYZE TABLE pv_inverter_raw COMPUTE STATISTICS;
ANALYZE TABLE pv_inverter_raw COMPUTE STATISTICS FOR COLUMNS inverter_id, station_id, data_time, active_power, efficiency;

ANALYZE TABLE pv_fault_raw COMPUTE STATISTICS;
ANALYZE TABLE pv_fault_raw COMPUTE STATISTICS FOR COLUMNS device_id, station_id, fault_type, fault_time;

ANALYZE TABLE pv_power_daily COMPUTE STATISTICS;
ANALYZE TABLE pv_power_daily COMPUTE STATISTICS FOR COLUMNS station_id, date, total_power;

ANALYZE TABLE pv_power_hourly COMPUTE STATISTICS;
ANALYZE TABLE pv_power_hourly COMPUTE STATISTICS FOR COLUMNS station_id, date, hour, total_power;

ANALYZE TABLE pv_fault_daily COMPUTE STATISTICS;
ANALYZE TABLE pv_fault_daily COMPUTE STATISTICS FOR COLUMNS station_id, date, fault_type;

ANALYZE TABLE pv_station_info COMPUTE STATISTICS;
