"""
数据存储微服务
"""
import json
from typing import Dict
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from .storage_engine import StorageEngine
from .time_series_db import SQLiteAdapter, TimescaleDBAdapter, InfluxDBAdapter
from shared.src.config import GatewayConfig
from shared.src.logger import get_logger

logger = get_logger("data_storage_service")


class DataStorageHandler(BaseHTTPRequestHandler):
    """数据存储 HTTP 请求处理器"""

    storage_engine: StorageEngine = None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        query_params = parse_qs(parsed.query)

        if path == "/health":
            self._handle_health()
        elif path == "/buckets":
            self._handle_list_buckets()
        elif path.startswith("/buckets/"):
            parts = path.split("/")
            if len(parts) >= 3:
                bucket_name = parts[2]
                if len(parts) == 4 and parts[3] == "measurements":
                    self._handle_list_measurements(bucket_name)
                else:
                    self._handle_get_bucket(bucket_name)
        elif path == "/query":
            self._handle_query(query_params)
        elif path == "/query/latest":
            self._handle_query_latest(query_params)
        elif path == "/stats":
            self._handle_stats()
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        data = json.loads(body.decode("utf-8"))

        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/buckets":
            self._handle_create_bucket(data)
        elif path == "/write":
            self._handle_write(data)
        elif path == "/write/batch":
            self._handle_write_batch(data)
        elif path == "/buckets/measurements":
            self._handle_add_measurement(data)
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        query_params = parse_qs(parsed.query)

        if path.startswith("/buckets/"):
            bucket_name = path.split("/")[-1]
            self._handle_delete_bucket(bucket_name)
        elif path == "/data":
            self._handle_delete_data(query_params)
        else:
            self._send_json(404, {"error": "Not Found"})

    def _handle_health(self):
        self._send_json(200, {"status": "running"})

    def _handle_list_buckets(self):
        buckets = self.storage_engine.bucket_manager.get_all_buckets()
        self._send_json(200, {"buckets": buckets})

    def _handle_get_bucket(self, bucket_name: str):
        bucket = self.storage_engine.bucket_manager.get_bucket(bucket_name)
        if bucket:
            self._send_json(200, bucket)
        else:
            self._send_json(404, {"error": "Bucket not found"})

    def _handle_create_bucket(self, data):
        try:
            bucket = self.storage_engine.bucket_manager.create_bucket(
                bucket_name=data.get("name", ""),
                description=data.get("description", ""),
                retention_days=data.get("retention_days"),
            )
            self._send_json(201, {"status": "created", "bucket": bucket})
        except Exception as e:
            self._send_json(400, {"error": str(e)})

    def _handle_delete_bucket(self, bucket_name: str):
        if self.storage_engine.bucket_manager.delete_bucket(bucket_name):
            self._send_json(200, {"status": "deleted"})
        else:
            self._send_json(404, {"error": "Bucket not found"})

    def _handle_list_measurements(self, bucket_name: str):
        measurements = self.storage_engine.bucket_manager.get_measurements(bucket_name)
        self._send_json(200, {"measurements": measurements})

    def _handle_add_measurement(self, data):
        try:
            bucket_name = data.get("bucket")
            measurement = data.get("measurement")
            tags = data.get("tags", {})
            if self.storage_engine.bucket_manager.add_measurement(bucket_name, measurement, tags):
                self._send_json(200, {"status": "added"})
            else:
                self._send_json(404, {"error": "Bucket not found"})
        except Exception as e:
            self._send_json(400, {"error": str(e)})

    def _handle_write(self, data):
        try:
            from shared.src.models import DataPoint
            bucket_name = data.get("bucket")
            measurement = data.get("measurement")
            point_data = data.get("point", {})
            tags = data.get("tags", {})
            
            point = DataPoint(
                device_id=point_data.get("device_id", ""),
                point_id=point_data.get("point_id", ""),
                value=point_data.get("value"),
                data_type=point_data.get("data_type", "float32"),
                quality=point_data.get("quality", "good"),
            )
            
            if "timestamp" in point_data:
                point.timestamp = datetime.fromisoformat(point_data["timestamp"])
            
            self.storage_engine.write_point(bucket_name, measurement, point, tags)
            self._send_json(200, {"status": "written"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_write_batch(self, data):
        try:
            from shared.src.models import DataPoint
            bucket_name = data.get("bucket")
            measurement = data.get("measurement")
            points_data = data.get("points", [])
            tags = data.get("tags", {})
            
            points = []
            for pd in points_data:
                point = DataPoint(
                    device_id=pd.get("device_id", ""),
                    point_id=pd.get("point_id", ""),
                    value=pd.get("value"),
                    data_type=pd.get("data_type", "float32"),
                    quality=pd.get("quality", "good"),
                )
                if "timestamp" in pd:
                    point.timestamp = datetime.fromisoformat(pd["timestamp"])
                points.append(point)
            
            count = self.storage_engine.write_points_batch(bucket_name, measurement, points, tags)
            self._send_json(200, {"status": "written", "count": count})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_query(self, query_params):
        try:
            bucket_name = query_params.get("bucket", [""])[0]
            measurement = query_params.get("measurement", [""])[0]
            start_time = datetime.fromisoformat(query_params.get("start", [datetime.utcnow().isoformat()])[0])
            end_time = datetime.fromisoformat(query_params.get("end", [datetime.utcnow().isoformat()])[0])
            
            results = self.storage_engine.query(bucket_name, measurement, start_time, end_time)
            self._send_json(200, {"results": results})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_query_latest(self, query_params):
        try:
            bucket_name = query_params.get("bucket", [""])[0]
            measurement = query_params.get("measurement", [""])[0]
            
            result = self.storage_engine.query_latest(bucket_name, measurement)
            self._send_json(200, {"result": result})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_delete_data(self, query_params):
        try:
            bucket_name = query_params.get("bucket", [""])[0]
            measurement = query_params.get("measurement", [""])[0]
            start_time = datetime.fromisoformat(query_params.get("start", [""])[0])
            end_time = datetime.fromisoformat(query_params.get("end", [""])[0])
            
            self.storage_engine.delete_data(bucket_name, measurement, start_time, end_time)
            self._send_json(200, {"status": "deleted"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_stats(self):
        stats = self.storage_engine.get_stats()
        self._send_json(200, stats)

    def _send_json(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        logger.debug(f"[{self.command}] {args[0]}")


class DataStorageService:
    """数据存储微服务"""

    def __init__(self, config: GatewayConfig):
        self.config = config
        self._server: HTTPServer = None
        self._db = self._init_database(config)
        self.storage_engine = StorageEngine(config, self._db)
        
        service_config = config.get("services", "data_storage")
        self._host = service_config.get("host", "0.0.0.0")
        self._port = service_config.get("port", 8004)

    def _init_database(self, config: GatewayConfig):
        storage_config = config.get("services", "data_storage")
        storage_type = storage_config.get("storage_type", "sqlite")
        
        if storage_type == "influxdb":
            return InfluxDBAdapter(
                url=storage_config.get("influxdb_url", "http://localhost:8086"),
                token=storage_config.get("influxdb_token", ""),
                org=storage_config.get("influxdb_org", "gateway"),
            )
        elif storage_type == "timescaledb":
            return TimescaleDBAdapter(
                connection_string=storage_config.get("database_url", "")
            )
        else:
            return SQLiteAdapter("gateway_data.db")

    def start(self):
        DataStorageHandler.storage_engine = self.storage_engine
        self._server = HTTPServer((self._host, self._port), DataStorageHandler)
        logger.info(f"数据存储服务启动: {self._host}:{self._port}")
        self._server.serve_forever()

    def stop(self):
        self.storage_engine.close()
        if self._server:
            self._server.shutdown()
            logger.info("数据存储服务已停止")

    def run(self):
        try:
            self.start()
        except KeyboardInterrupt:
            self.stop()


def main():
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else None
    config = GatewayConfig(config_path)
    service = DataStorageService(config)
    service.run()


if __name__ == "__main__":
    main()