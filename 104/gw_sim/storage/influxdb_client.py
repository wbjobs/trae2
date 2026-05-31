import logging
from datetime import datetime
from typing import Dict, List, Optional
from influxdb_client import InfluxDBClient, Point, WriteOptions
from influxdb_client.client.write_api import SYNCHRONOUS

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET

logger = logging.getLogger(__name__)


class InfluxDBStorage:

    def __init__(
        self,
        url: Optional[str] = None,
        token: Optional[str] = None,
        org: Optional[str] = None,
        bucket: Optional[str] = None,
    ):
        self.url = url or INFLUXDB_URL
        self.token = token or INFLUXDB_TOKEN
        self.org = org or INFLUXDB_ORG
        self.bucket = bucket or INFLUXDB_BUCKET
        self._client: Optional[InfluxDBClient] = None
        self._write_api = None
        self._query_api = None

    def _ensure_connection(self):
        if self._client is None:
            self._client = InfluxDBClient(url=self.url, token=self.token, org=self.org)
            self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
            self._query_api = self._client.query_api()

    def write_simulation_result(
        self,
        measurement: str,
        tags: Dict[str, str],
        fields: Dict,
        timestamp: Optional[datetime] = None,
    ):
        self._ensure_connection()
        point = Point(measurement)
        for k, v in tags.items():
            point.tag(k, str(v))
        for k, v in fields.items():
            if isinstance(v, float):
                point.field(k, v)
            elif isinstance(v, int):
                point.field(k, v)
            elif isinstance(v, str):
                point.field(k, v)
            elif isinstance(v, bool):
                point.field(k, v)
            else:
                point.field(k, str(v))
        if timestamp:
            point.time(timestamp)
        try:
            self._write_api.write(bucket=self.bucket, org=self.org, record=point)
        except Exception as e:
            logger.error(f"InfluxDB write error: {e}")

    def write_head_field(
        self,
        task_id: str,
        h_data: List[List[float]],
        step: int = 0,
        backend: str = "python",
    ):
        self._ensure_connection()
        points = []
        for j, row in enumerate(h_data):
            for i, val in enumerate(row):
                point = Point("head_field") \
                    .tag("task_id", task_id) \
                    .tag("backend", backend) \
                    .tag("step", str(step)) \
                    .field("i", i) \
                    .field("j", j) \
                    .field("head", float(val))
                points.append(point)
        try:
            self._write_api.write(bucket=self.bucket, org=self.org, record=points)
        except Exception as e:
            logger.error(f"InfluxDB head field write error: {e}")

    def write_water_level_timeseries(
        self,
        well_id: str,
        timestamps: List[str],
        water_levels: List[float],
        task_id: str = "",
    ):
        self._ensure_connection()
        points = []
        for ts, wl in zip(timestamps, water_levels):
            point = Point("water_level") \
                .tag("well_id", well_id) \
                .tag("task_id", task_id) \
                .field("water_level", float(wl))
            try:
                point.time(datetime.fromisoformat(ts))
            except (ValueError, TypeError):
                point.time(datetime.utcnow())
            points.append(point)
        try:
            self._write_api.write(bucket=self.bucket, org=self.org, record=points)
        except Exception as e:
            logger.error(f"InfluxDB timeseries write error: {e}")

    def query_head_field(
        self,
        task_id: str,
        step: int = 0,
    ) -> List[Dict]:
        self._ensure_connection()
        flux_query = f'''
        from(bucket: "{self.bucket}")
          |> range(start: -30d)
          |> filter(fn: (r) => r._measurement == "head_field")
          |> filter(fn: (r) => r.task_id == "{task_id}")
          |> filter(fn: (r) => r.step == "{step}")
          |> pivot(rowFn: (r) => [r._time, r.i, r.j], columnFn: (r) => r._field, valueFn: (r) => r._value)
        '''
        try:
            tables = self._query_api.query_data_frame(flux_query, org=self.org)
            if tables.empty:
                return []
            return tables.to_dict("records")
        except Exception as e:
            logger.error(f"InfluxDB head field query error: {e}")
            return []

    def query_water_level(
        self,
        well_id: str,
        start: str = "-30d",
        stop: str = "now()",
    ) -> List[Dict]:
        self._ensure_connection()
        flux_query = f'''
        from(bucket: "{self.bucket}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r._measurement == "water_level")
          |> filter(fn: (r) => r.well_id == "{well_id}")
          |> filter(fn: (r) => r._field == "water_level")
        '''
        try:
            tables = self._query_api.query_data_frame(flux_query, org=self.org)
            if tables.empty:
                return []
            return tables.to_dict("records")
        except Exception as e:
            logger.error(f"InfluxDB water level query error: {e}")
            return []

    def query_long_term_data(
        self,
        measurement: str = "long_term_projection",
        start: str = "-10y",
    ) -> List[Dict]:
        self._ensure_connection()
        flux_query = f'''
        from(bucket: "{self.bucket}")
          |> range(start: {start})
          |> filter(fn: (r) => r._measurement == "{measurement}")
        '''
        try:
            tables = self._query_api.query_data_frame(flux_query, org=self.org)
            if tables.empty:
                return []
            return tables.to_dict("records")
        except Exception as e:
            logger.error(f"InfluxDB long-term query error: {e}")
            return []

    def close(self):
        if self._write_api:
            self._write_api.close()
        if self._client:
            self._client.close()
            self._client = None
