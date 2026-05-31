from typing import Dict, Any, List, Optional, Union
from datetime import datetime
import logging
from config import settings

logger = logging.getLogger(__name__)


class InfluxDBV2Storage:
    def __init__(self, url: Optional[str] = None, token: Optional[str] = None,
                 org: Optional[str] = None, bucket: Optional[str] = None):
        self.url = url or settings.influxdb_url
        self.token = token or settings.influxdb_token
        self.org = org or settings.influxdb_org
        self.bucket = bucket or settings.influxdb_bucket
        self._client = None
        self._write_api = None
        self._query_api = None
        self._delete_api = None
        self._batch_size = 5000
        self._buffer: List[Any] = []
        self._connected = False
        self._connect()
    
    def _connect(self) -> bool:
        try:
            from influxdb_client import InfluxDBClient, Point, WriteOptions
            from influxdb_client.client.write_api import SYNCHRONOUS
            if self.token is None:
                logger.warning("InfluxDB token not provided, running in mock mode")
                self._connected = False
                return False
            self._client = InfluxDBClient(
                url=self.url,
                token=self.token,
                org=self.org
            )
            self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
            self._query_api = self._client.query_api()
            self._delete_api = self._client.delete_api()
            self._connected = True
            logger.info(f"Connected to InfluxDB v2 at {self.url}")
            return True
        except ImportError:
            logger.warning("influxdb-client not installed, running in mock mode")
            self._connected = False
            return False
        except Exception as e:
            logger.error(f"Failed to connect to InfluxDB v2: {e}")
            self._connected = False
            return False
    
    def is_connected(self) -> bool:
        return self._connected
    
    def write_point(self, point: Any) -> bool:
        if not self._connected:
            self._buffer.append(point)
            return True
        try:
            self._write_api.write(bucket=self.bucket, org=self.org, record=point)
            return True
        except Exception as e:
            logger.error(f"Failed to write point: {e}")
            return False
    
    def write_points(self, points: List[Any]) -> bool:
        if not self._connected:
            self._buffer.extend(points)
            return True
        try:
            for i in range(0, len(points), self._batch_size):
                batch = points[i:i + self._batch_size]
                self._write_api.write(bucket=self.bucket, org=self.org, record=batch)
            return True
        except Exception as e:
            logger.error(f"Failed to write points: {e}")
            return False
    
    def query(self, flux_query: str) -> List[Any]:
        if not self._connected:
            logger.warning("Not connected to InfluxDB, cannot query")
            return []
        try:
            return self._query_api.query(flux_query)
        except Exception as e:
            logger.error(f"Failed to query: {e}")
            return []
    
    def query_data_frame(self, flux_query: str) -> Any:
        if not self._connected:
            logger.warning("Not connected to InfluxDB, cannot query")
            return None
        try:
            return self._query_api.query_data_frame(flux_query)
        except Exception as e:
            logger.error(f"Failed to query data frame: {e}")
            return None
    
    def delete_range(self, start: datetime, stop: datetime, predicate: str = "") -> bool:
        if not self._connected:
            logger.warning("Not connected to InfluxDB, cannot delete")
            return False
        try:
            self._delete_api.delete(start, stop, predicate, bucket=self.bucket, org=self.org)
            return True
        except Exception as e:
            logger.error(f"Failed to delete data: {e}")
            return False
    
    def flush(self) -> bool:
        if not self._connected or not self._buffer:
            return True
        try:
            result = self.write_points(self._buffer)
            if result:
                self._buffer.clear()
            return result
        except Exception as e:
            logger.error(f"Failed to flush buffer: {e}")
            return False
    
    def close(self) -> None:
        self.flush()
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
        self._connected = False


class InfluxDBV1Storage:
    def __init__(self, host: Optional[str] = None, port: Optional[int] = None,
                 username: Optional[str] = None, password: Optional[str] = None,
                 database: Optional[str] = None):
        self.host = host or settings.influxdb_host
        self.port = port or settings.influxdb_port
        self.username = username or settings.influxdb_v1_username
        self.password = password or settings.influxdb_v1_password
        self.database = database or settings.influxdb_v1_database
        self._client = None
        self._batch_size = 5000
        self._buffer: List[Dict[str, Any]] = []
        self._connected = False
        self._connect()
    
    def _connect(self) -> bool:
        try:
            from influxdb import InfluxDBClient
            self._client = InfluxDBClient(
                host=self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                database=self.database
            )
            self._client.create_database(self.database)
            self._connected = True
            logger.info(f"Connected to InfluxDB v1 at {self.host}:{self.port}")
            return True
        except ImportError:
            logger.warning("influxdb not installed, running in mock mode")
            self._connected = False
            return False
        except Exception as e:
            logger.error(f"Failed to connect to InfluxDB v1: {e}")
            self._connected = False
            return False
    
    def is_connected(self) -> bool:
        return self._connected
    
    def write_point(self, point: Dict[str, Any]) -> bool:
        return self.write_points([point])
    
    def write_points(self, points: List[Dict[str, Any]]) -> bool:
        if not self._connected:
            self._buffer.extend(points)
            return True
        try:
            for i in range(0, len(points), self._batch_size):
                batch = points[i:i + self._batch_size]
                self._client.write_points(batch)
            return True
        except Exception as e:
            logger.error(f"Failed to write points: {e}")
            return False
    
    def query(self, query: str) -> List[Any]:
        if not self._connected:
            logger.warning("Not connected to InfluxDB, cannot query")
            return []
        try:
            return self._client.query(query).get_points()
        except Exception as e:
            logger.error(f"Failed to query: {e}")
            return []
    
    def delete_series(self, measurement: Optional[str] = None, tags: Optional[Dict[str, str]] = None) -> bool:
        if not self._connected:
            logger.warning("Not connected to InfluxDB, cannot delete")
            return False
        try:
            query_parts = ["DROP SERIES"]
            if measurement:
                query_parts.append(f'FROM "{measurement}"')
            if tags:
                tag_conditions = [f'"{k}"=\'{v}\'' for k, v in tags.items()]
                query_parts.append(f"WHERE {' AND '.join(tag_conditions)}")
            self._client.query(' '.join(query_parts))
            return True
        except Exception as e:
            logger.error(f"Failed to delete series: {e}")
            return False
    
    def flush(self) -> bool:
        if not self._connected or not self._buffer:
            return True
        try:
            result = self.write_points(self._buffer)
            if result:
                self._buffer.clear()
            return result
        except Exception as e:
            logger.error(f"Failed to flush buffer: {e}")
            return False
    
    def close(self) -> None:
        self.flush()
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
        self._connected = False


class InfluxDBStorage:
    def __init__(self, use_v2: bool = True):
        self.use_v2 = use_v2
        if use_v2:
            self._storage = InfluxDBV2Storage()
        else:
            self._storage = InfluxDBV1Storage()
        self._Point = None
        self._try_import_point()
    
    def _try_import_point(self):
        try:
            from influxdb_client import Point
            self._Point = Point
        except ImportError:
            self._Point = None
    
    def is_connected(self) -> bool:
        return self._storage.is_connected()
    
    def create_point(self, measurement: str, tags: Dict[str, str],
                     fields: Dict[str, Any], time: Optional[datetime] = None) -> Any:
        if self.use_v2 and self._Point is not None:
            point = self._Point(measurement)
            for k, v in tags.items():
                point = point.tag(k, str(v))
            for k, v in fields.items():
                if isinstance(v, int):
                    point = point.int_field(k, v)
                elif isinstance(v, float):
                    point = point.float_field(k, v)
                elif isinstance(v, bool):
                    point = point.bool_field(k, v)
                else:
                    point = point.string_field(k, str(v))
            if time:
                point = point.time(time)
            return point
        else:
            point_data = {
                "measurement": measurement,
                "tags": {k: str(v) for k, v in tags.items()},
                "time": time.isoformat() if time else datetime.utcnow().isoformat(),
                "fields": fields
            }
            return point_data
    
    def write_point(self, point: Any) -> bool:
        return self._storage.write_point(point)
    
    def write_points(self, points: List[Any]) -> bool:
        return self._storage.write_points(points)
    
    def query(self, query_str: str) -> List[Any]:
        return self._storage.query(query_str)
    
    def flush(self) -> bool:
        return self._storage.flush()
    
    def close(self) -> None:
        self._storage.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
