"""
时序数据库适配层
支持 InfluxDB、TimescaleDB、SQLite 等多种后端
"""
import sqlite3
import json
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from shared.src.logger import get_logger

logger = get_logger("time_series_db")


class TimeSeriesDB(ABC):
    """时序数据库抽象基类"""

    @abstractmethod
    def write(self, bucket: str, measurement: str, tags: Dict,
              fields: Dict, timestamp: datetime) -> bool:
        pass

    @abstractmethod
    def write_batch(self, points: List[Dict]) -> bool:
        pass

    @abstractmethod
    def query(self, bucket: str, measurement: str,
              start_time: datetime, end_time: datetime,
              tags: Dict = None, aggregation: str = None) -> List[Dict]:
        pass

    @abstractmethod
    def query_latest(self, bucket: str, measurement: str,
                     tags: Dict = None) -> Optional[Dict]:
        pass

    @abstractmethod
    def delete(self, bucket: str, measurement: str,
               start_time: datetime, end_time: datetime) -> bool:
        pass

    @abstractmethod
    def close(self):
        pass


class InfluxDBAdapter(TimeSeriesDB):
    """InfluxDB 适配器"""

    def __init__(self, url: str, token: str, org: str):
        self._url = url
        self._token = token
        self._org = org
        self._client = None
        self._write_api = None
        self._query_api = None
        self._connect()

    def _connect(self):
        try:
            from influxdb_client import InfluxDBClient, Point, WriteOptions
            from influxdb_client.client.write_api import SYNCHRONOUS
            self._client = InfluxDBClient(url=self._url, token=self._token, org=self._org)
            self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
            self._query_api = self._client.query_api()
            logger.info("InfluxDB 连接成功")
        except ImportError:
            logger.warning("influxdb-client 未安装, 使用模拟模式")
            self._client = _MockInfluxClient()
        except Exception as e:
            logger.error(f"InfluxDB 连接失败: {e}")
            self._client = _MockInfluxClient()

    def write(self, bucket: str, measurement: str, tags: Dict,
              fields: Dict, timestamp: datetime) -> bool:
        try:
            from influxdb_client import Point
            point = Point(measurement)
            for key, value in tags.items():
                point = point.tag(key, value)
            for key, value in fields.items():
                point = point.field(key, value)
            point = point.time(timestamp)
            self._write_api.write(bucket=bucket, org=self._org, record=point)
            return True
        except Exception as e:
            logger.error(f"InfluxDB 写入失败: {e}")
            return False

    def write_batch(self, points: List[Dict]) -> bool:
        try:
            influx_points = []
            for p in points:
                from influxdb_client import Point
                point = Point(p["measurement"])
                for key, value in p.get("tags", {}).items():
                    point = point.tag(key, value)
                for key, value in p.get("fields", {}).items():
                    point = point.field(key, value)
                point = point.time(p["timestamp"])
                influx_points.append(point)
            if influx_points:
                self._write_api.write(bucket=points[0]["bucket"], org=self._org, record=influx_points)
            return True
        except Exception as e:
            logger.error(f"InfluxDB 批量写入失败: {e}")
            return False

    def query(self, bucket: str, measurement: str,
              start_time: datetime, end_time: datetime,
              tags: Dict = None, aggregation: str = None) -> List[Dict]:
        try:
            range_start = start_time.strftime("%Y-%m-%dT%H:%M:%SZ")
            range_stop = end_time.strftime("%Y-%m-%dT%H:%M:%SZ")
            
            flux_query = f'''
            from(bucket: "{bucket}")
                |> range(start: time(v: "{range_start}"), stop: time(v: "{range_stop}"))
                |> filter(fn: (r) => r._measurement == "{measurement}")
            '''
            
            if tags:
                for key, value in tags.items():
                    flux_query += f' |> filter(fn: (r) => r.{key} == "{value}")'
            
            if aggregation:
                if aggregation == "mean":
                    flux_query += ' |> mean()'
                elif aggregation == "sum":
                    flux_query += ' |> sum()'
                elif aggregation == "count":
                    flux_query += ' |> count()'
            
            result = self._query_api.query(flux_query)
            return [record.values for table in result for record in table.records]
        except Exception as e:
            logger.error(f"InfluxDB 查询失败: {e}")
            return []

    def query_latest(self, bucket: str, measurement: str,
                     tags: Dict = None) -> Optional[Dict]:
        try:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=1)
            results = self.query(bucket, measurement, start_time, end_time, tags)
            return results[-1] if results else None
        except Exception as e:
            logger.error(f"InfluxDB 查询最新数据失败: {e}")
            return None

    def delete(self, bucket: str, measurement: str,
               start_time: datetime, end_time: datetime) -> bool:
        try:
            delete_api = self._client.delete_api()
            delete_api.delete(
                start=start_time,
                stop=end_time,
                predicate=f'_measurement="{measurement}"',
                bucket=bucket,
                org=self._org,
            )
            return True
        except Exception as e:
            logger.error(f"InfluxDB 删除失败: {e}")
            return False

    def close(self):
        if self._client:
            self._client.close()


class TimescaleDBAdapter(TimeSeriesDB):
    """TimescaleDB 适配器 (基于 PostgreSQL)"""

    def __init__(self, connection_string: str):
        self._conn_str = connection_string
        self._conn = None
        self._connect()

    def _connect(self):
        try:
            import psycopg2
            self._conn = psycopg2.connect(self._conn_str)
            self._conn.autocommit = True
            self._init_schema()
            logger.info("TimescaleDB 连接成功")
        except ImportError:
            logger.warning("psycopg2 未安装, 使用 SQLite 作为后备")
            self._conn = SQLiteAdapter("timescale_fallback.db")
        except Exception as e:
            logger.error(f"TimescaleDB 连接失败: {e}")
            self._conn = SQLiteAdapter("timescale_fallback.db")

    def _init_schema(self):
        try:
            cursor = self._conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS time_series_data (
                    time TIMESTAMPTZ NOT NULL,
                    bucket TEXT NOT NULL,
                    measurement TEXT NOT NULL,
                    tags JSONB,
                    fields JSONB
                );
            """)
            try:
                cursor.execute("SELECT create_hypertable('time_series_data', 'time');")
            except Exception:
                pass
            self._conn.commit()
        except Exception as e:
            logger.debug(f"初始化 schema: {e}")

    def write(self, bucket: str, measurement: str, tags: Dict,
              fields: Dict, timestamp: datetime) -> bool:
        try:
            cursor = self._conn.cursor()
            cursor.execute(
                """INSERT INTO time_series_data (time, bucket, measurement, tags, fields)
                   VALUES (%s, %s, %s, %s, %s)""",
                (timestamp, bucket, measurement, json.dumps(tags), json.dumps(fields))
            )
            return True
        except Exception as e:
            logger.error(f"TimescaleDB 写入失败: {e}")
            return False

    def write_batch(self, points: List[Dict]) -> bool:
        try:
            cursor = self._conn.cursor()
            for p in points:
                cursor.execute(
                    """INSERT INTO time_series_data (time, bucket, measurement, tags, fields)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (p["timestamp"], p["bucket"], p["measurement"],
                     json.dumps(p.get("tags", {})), json.dumps(p.get("fields", {})))
                )
            return True
        except Exception as e:
            logger.error(f"TimescaleDB 批量写入失败: {e}")
            return False

    def query(self, bucket: str, measurement: str,
              start_time: datetime, end_time: datetime,
              tags: Dict = None, aggregation: str = None) -> List[Dict]:
        try:
            cursor = self._conn.cursor()
            query = """SELECT time, tags, fields FROM time_series_data
                       WHERE bucket = %s AND measurement = %s
                       AND time BETWEEN %s AND %s"""
            params = [bucket, measurement, start_time, end_time]
            
            if tags:
                for key, value in tags.items():
                    query += f" AND tags->>'{key}' = %s"
                    params.append(value)
            
            cursor.execute(query, params)
            results = []
            for row in cursor.fetchall():
                results.append({
                    "time": row[0].isoformat() if row[0] else None,
                    "tags": json.loads(row[1]) if row[1] else {},
                    "fields": json.loads(row[2]) if row[2] else {},
                })
            return results
        except Exception as e:
            logger.error(f"TimescaleDB 查询失败: {e}")
            return []

    def query_latest(self, bucket: str, measurement: str,
                     tags: Dict = None) -> Optional[Dict]:
        try:
            cursor = self._conn.cursor()
            query = """SELECT time, tags, fields FROM time_series_data
                       WHERE bucket = %s AND measurement = %s
                       ORDER BY time DESC LIMIT 1"""
            cursor.execute(query, (bucket, measurement))
            row = cursor.fetchone()
            if row:
                return {
                    "time": row[0].isoformat() if row[0] else None,
                    "tags": json.loads(row[1]) if row[1] else {},
                    "fields": json.loads(row[2]) if row[2] else {},
                }
            return None
        except Exception as e:
            logger.error(f"TimescaleDB 查询最新数据失败: {e}")
            return None

    def delete(self, bucket: str, measurement: str,
               start_time: datetime, end_time: datetime) -> bool:
        try:
            cursor = self._conn.cursor()
            cursor.execute(
                """DELETE FROM time_series_data
                   WHERE bucket = %s AND measurement = %s
                   AND time BETWEEN %s AND %s""",
                (bucket, measurement, start_time, end_time)
            )
            return True
        except Exception as e:
            logger.error(f"TimescaleDB 删除失败: {e}")
            return False

    def close(self):
        if self._conn and hasattr(self._conn, "close"):
            self._conn.close()


class SQLiteAdapter(TimeSeriesDB):
    """SQLite 适配器 - 用于嵌入式环境"""

    def __init__(self, db_path: str = "gateway_data.db"):
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS time_series_data (
                time TEXT NOT NULL,
                bucket TEXT NOT NULL,
                measurement TEXT NOT NULL,
                tags TEXT,
                fields TEXT
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_time ON time_series_data(time)
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_bucket ON time_series_data(bucket, measurement)
        """)
        self._conn.commit()

    def write(self, bucket: str, measurement: str, tags: Dict,
              fields: Dict, timestamp: datetime) -> bool:
        try:
            self._conn.execute(
                """INSERT INTO time_series_data (time, bucket, measurement, tags, fields)
                   VALUES (?, ?, ?, ?, ?)""",
                (timestamp.isoformat(), bucket, measurement,
                 json.dumps(tags), json.dumps(fields))
            )
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"SQLite 写入失败: {e}")
            return False

    def write_batch(self, points: List[Dict]) -> bool:
        try:
            for p in points:
                self._conn.execute(
                    """INSERT INTO time_series_data (time, bucket, measurement, tags, fields)
                       VALUES (?, ?, ?, ?, ?)""",
                    (p["timestamp"].isoformat(), p["bucket"], p["measurement"],
                     json.dumps(p.get("tags", {})), json.dumps(p.get("fields", {})))
                )
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"SQLite 批量写入失败: {e}")
            return False

    def query(self, bucket: str, measurement: str,
              start_time: datetime, end_time: datetime,
              tags: Dict = None, aggregation: str = None) -> List[Dict]:
        try:
            query = """SELECT time, tags, fields FROM time_series_data
                       WHERE bucket = ? AND measurement = ?
                       AND time BETWEEN ? AND ?"""
            params = [bucket, measurement, start_time.isoformat(), end_time.isoformat()]
            
            cursor = self._conn.execute(query, params)
            results = []
            for row in cursor.fetchall():
                results.append({
                    "time": row["time"],
                    "tags": json.loads(row["tags"]) if row["tags"] else {},
                    "fields": json.loads(row["fields"]) if row["fields"] else {},
                })
            return results
        except Exception as e:
            logger.error(f"SQLite 查询失败: {e}")
            return []

    def query_latest(self, bucket: str, measurement: str,
                     tags: Dict = None) -> Optional[Dict]:
        try:
            cursor = self._conn.execute(
                """SELECT time, tags, fields FROM time_series_data
                   WHERE bucket = ? AND measurement = ?
                   ORDER BY time DESC LIMIT 1""",
                (bucket, measurement)
            )
            row = cursor.fetchone()
            if row:
                return {
                    "time": row["time"],
                    "tags": json.loads(row["tags"]) if row["tags"] else {},
                    "fields": json.loads(row["fields"]) if row["fields"] else {},
                }
            return None
        except Exception as e:
            logger.error(f"SQLite 查询最新数据失败: {e}")
            return None

    def delete(self, bucket: str, measurement: str,
               start_time: datetime, end_time: datetime) -> bool:
        try:
            self._conn.execute(
                """DELETE FROM time_series_data
                   WHERE bucket = ? AND measurement = ?
                   AND time BETWEEN ? AND ?""",
                (bucket, measurement, start_time.isoformat(), end_time.isoformat())
            )
            self._conn.commit()
            return True
        except Exception as e:
            logger.error(f"SQLite 删除失败: {e}")
            return False

    def close(self):
        if self._conn:
            self._conn.close()


class _MockInfluxClient:
    """模拟 InfluxDB 客户端"""

    def write(self, **kwargs):
        pass

    def query(self, query: str):
        return []

    def close(self):
        pass