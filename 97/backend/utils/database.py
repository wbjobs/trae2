import os
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from typing import Optional, List, Dict, Any

load_dotenv()


def get_doris_engine():
    host = os.getenv("DORIS_HOST", "localhost")
    port = os.getenv("DORIS_PORT", "9030")
    user = os.getenv("DORIS_USER", "root")
    password = os.getenv("DORIS_PASSWORD", "")
    database = os.getenv("DORIS_DATABASE", "iot_operation")
    
    connection_string = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"
    return create_engine(connection_string, pool_pre_ping=True, pool_recycle=3600)


def init_database():
    engine = get_doris_engine()
    
    create_tables_sql = [
        """
        CREATE TABLE IF NOT EXISTS devices (
            device_id VARCHAR(64),
            device_name VARCHAR(128),
            device_type VARCHAR(64),
            location VARCHAR(128),
            manufacturer VARCHAR(128),
            install_date DATE,
            status VARCHAR(32) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=OLAP
        DUPLICATE KEY(device_id)
        COMMENT '设备信息表'
        DISTRIBUTED BY HASH(device_id) BUCKETS 10
        PROPERTIES (
            "replication_num" = "1",
            "bloom_filter_columns" = "device_type,location"
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS raw_metrics (
            id BIGINT,
            device_id VARCHAR(64),
            metric_name VARCHAR(64),
            metric_value DOUBLE,
            metric_unit VARCHAR(32),
            collect_time DATETIME,
            quality_score INT DEFAULT 100,
            is_valid BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=OLAP
        DUPLICATE KEY(id, device_id, metric_name, collect_time)
        COMMENT '原始指标数据表'
        PARTITION BY RANGE(collect_time) ()
        DISTRIBUTED BY HASH(device_id) BUCKETS 30
        PROPERTIES (
            "replication_num" = "1",
            "dynamic_partition.enable" = "true",
            "dynamic_partition.time_unit" = "DAY",
            "dynamic_partition.start" = "-30",
            "dynamic_partition.end" = "7",
            "dynamic_partition.prefix" = "p",
            "dynamic_partition.buckets" = "10",
            "bloom_filter_columns" = "device_id,metric_name",
            "compression" = "LZ4"
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_raw_device_time ON raw_metrics (device_id, collect_time) USING BITMAP COMMENT '设备时间复合索引';
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_raw_metric_time ON raw_metrics (metric_name, collect_time) USING BITMAP COMMENT '指标时间复合索引';
        """,
        """
        CREATE TABLE IF NOT EXISTS cleaned_metrics (
            id BIGINT,
            device_id VARCHAR(64),
            metric_name VARCHAR(64),
            metric_value DOUBLE,
            metric_unit VARCHAR(32),
            collect_time DATETIME,
            cleaned_value DOUBLE,
            is_outlier BOOLEAN DEFAULT FALSE,
            outlier_reason VARCHAR(256),
            cleaning_method VARCHAR(64),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=OLAP
        DUPLICATE KEY(id, device_id, metric_name, collect_time)
        COMMENT '清洗后指标数据表'
        PARTITION BY RANGE(collect_time) ()
        DISTRIBUTED BY HASH(device_id) BUCKETS 20
        PROPERTIES (
            "replication_num" = "1",
            "dynamic_partition.enable" = "true",
            "dynamic_partition.time_unit" = "DAY",
            "dynamic_partition.start" = "-30",
            "dynamic_partition.end" = "7",
            "dynamic_partition.prefix" = "p",
            "dynamic_partition.buckets" = "10",
            "bloom_filter_columns" = "device_id,metric_name,is_outlier",
            "compression" = "LZ4"
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_cleaned_device_time ON cleaned_metrics (device_id, collect_time) USING BITMAP COMMENT '设备时间复合索引';
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_cleaned_outlier ON cleaned_metrics (is_outlier) USING BITMAP COMMENT '异常标记索引';
        """,
        """
        CREATE TABLE IF NOT EXISTS aggregated_metrics (
            device_id VARCHAR(64),
            metric_name VARCHAR(64),
            agg_period VARCHAR(32),
            agg_time DATETIME,
            avg_value DOUBLE SUM,
            max_value DOUBLE MAX,
            min_value DOUBLE MIN,
            std_value DOUBLE SUM,
            count_value BIGINT SUM,
            sum_value DOUBLE SUM,
            anomaly_count INT SUM,
            is_anomaly BOOLEAN MAX,
            anomaly_score DOUBLE MAX,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=OLAP
        AGGREGATE KEY(device_id, metric_name, agg_period, agg_time)
        COMMENT '聚合指标数据表'
        PARTITION BY RANGE(agg_time) ()
        DISTRIBUTED BY HASH(device_id) BUCKETS 15
        PROPERTIES (
            "replication_num" = "1",
            "dynamic_partition.enable" = "true",
            "dynamic_partition.time_unit" = "DAY",
            "dynamic_partition.start" = "-90",
            "dynamic_partition.end" = "7",
            "dynamic_partition.prefix" = "p",
            "dynamic_partition.buckets" = "10",
            "bloom_filter_columns" = "device_id,metric_name,agg_period",
            "compression" = "LZ4"
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_agg_device_metric ON aggregated_metrics (device_id, metric_name, agg_time) USING BITMAP COMMENT '设备指标时间复合索引';
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_agg_period ON aggregated_metrics (agg_period) USING BITMAP COMMENT '聚合周期索引';
        """,
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id VARCHAR(64),
            username VARCHAR(64),
            password_hash VARCHAR(256),
            email VARCHAR(128),
            role VARCHAR(32) DEFAULT 'viewer',
            permissions JSON,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=OLAP
        UNIQUE KEY(user_id, username)
        COMMENT '用户表'
        DISTRIBUTED BY HASH(user_id) BUCKETS 5
        PROPERTIES ("replication_num" = "1");
        """,
        """
        CREATE TABLE IF NOT EXISTS reports (
            report_id VARCHAR(64),
            report_name VARCHAR(128),
            report_type VARCHAR(64),
            config JSON,
            created_by VARCHAR(64),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=OLAP
        UNIQUE KEY(report_id)
        COMMENT '报表配置表'
        DISTRIBUTED BY HASH(report_id) BUCKETS 5
        PROPERTIES ("replication_num" = "1");
        """,
        """
        CREATE TABLE IF NOT EXISTS dashboard_layouts (
            layout_id VARCHAR(64),
            layout_name VARCHAR(128),
            user_id VARCHAR(64),
            config JSON,
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=OLAP
        UNIQUE KEY(layout_id, user_id)
        COMMENT '大屏布局配置表'
        DISTRIBUTED BY HASH(layout_id) BUCKETS 5
        PROPERTIES ("replication_num" = "1");
        """,
        """
        CREATE TABLE IF NOT EXISTS trend_analysis_results (
            analysis_id VARCHAR(64),
            device_id VARCHAR(64),
            metric_name VARCHAR(64),
            analysis_type VARCHAR(32),
            analysis_time DATETIME,
            result JSON,
            anomaly_score DOUBLE,
            risk_level VARCHAR(16),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=OLAP
        DUPLICATE KEY(analysis_id, device_id, metric_name, analysis_time)
        COMMENT '趋势分析结果表'
        PARTITION BY RANGE(analysis_time) ()
        DISTRIBUTED BY HASH(device_id) BUCKETS 10
        PROPERTIES (
            "replication_num" = "1",
            "dynamic_partition.enable" = "true",
            "dynamic_partition.time_unit" = "DAY",
            "dynamic_partition.start" = "-30",
            "dynamic_partition.end" = "3",
            "dynamic_partition.prefix" = "p",
            "dynamic_partition.buckets" = "5",
            "bloom_filter_columns" = "device_id,metric_name,risk_level"
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_trend_device ON trend_analysis_results (device_id, metric_name) USING BITMAP COMMENT '设备指标索引';
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_trend_risk ON trend_analysis_results (risk_level) USING BITMAP COMMENT '风险等级索引';
        """
    ]
    
    with engine.connect() as conn:
        for sql in create_tables_sql:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"Table creation notice: {e}")


def execute_query(sql: str, params: Optional[Dict] = None) -> pd.DataFrame:
    engine = get_doris_engine()
    with engine.connect() as conn:
        return pd.read_sql(text(sql), conn, params=params)


def execute_update(sql: str, params: Optional[Dict] = None) -> int:
    engine = get_doris_engine()
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        conn.commit()
        return result.rowcount


def insert_dataframe(df: pd.DataFrame, table_name: str, if_exists: str = "append"):
    engine = get_doris_engine()
    df.to_sql(table_name, engine, if_exists=if_exists, index=False)
