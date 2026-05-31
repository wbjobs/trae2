import logging
import json
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from contextlib import contextmanager
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from sqlalchemy import create_engine, text, Column, String, Float, DateTime, Integer, LargeBinary
    from sqlalchemy.ext.declarative import declarative_base
    from sqlalchemy.orm import sessionmaker, Session
    SQLALCHEMY_AVAILABLE = True
except ImportError:
    SQLALCHEMY_AVAILABLE = False
    logger.warning("SQLAlchemy not available. TimescaleDB storage will be disabled.")

from config import timescaledb_config
from data_models import GridWeatherData, GridDefinition, WeatherVariable

if SQLALCHEMY_AVAILABLE:
    Base = declarative_base()

    class SimulationResult(Base):
        __tablename__ = "simulation_results"

        id = Column(Integer, primary_key=True)
        timestamp = Column(DateTime, nullable=False, index=True)
        grid_id = Column(String, nullable=False, index=True)
        variable = Column(String, nullable=False, index=True)
        latitude = Column(Float, nullable=False)
        longitude = Column(Float, nullable=False)
        value = Column(Float)
        created_at = Column(DateTime, default=datetime.utcnow)

        __mapper_args__ = {
            "primary_key": ["id"]
        }


    class GridMetadata(Base):
        __tablename__ = "grid_metadata"

        grid_id = Column(String, primary_key=True)
        lat_min = Column(Float, nullable=False)
        lat_max = Column(Float, nullable=False)
        lon_min = Column(Float, nullable=False)
        lon_max = Column(Float, nullable=False)
        resolution = Column(Float, nullable=False)
        created_at = Column(DateTime, default=datetime.utcnow)
        description = Column(String)


    class SimulationTaskLog(Base):
        __tablename__ = "simulation_task_logs"

        task_id = Column(String, primary_key=True)
        timestamp = Column(DateTime, default=datetime.utcnow)
        status = Column(String, index=True)
        worker_id = Column(String, index=True)
        grid_region = Column(String)
        time_step = Column(Integer)
        start_time = Column(DateTime)
        end_time = Column(DateTime)
        duration_seconds = Column(Float)
        error_message = Column(String)
        result_summary = Column(String)
else:
    Base = object
    SimulationResult = None
    GridMetadata = None
    SimulationTaskLog = None


class TimescaleDBStorage:
    def __init__(self, connection_string: Optional[str] = None):
        self.connection_string = connection_string or timescaledb_config.connection_string
        self.engine = None
        self.SessionLocal = None
        self.available = False
        self._initialize()

    def _initialize(self):
        if not SQLALCHEMY_AVAILABLE:
            logger.warning("SQLAlchemy not available. TimescaleDB storage disabled.")
            return
        
        try:
            self.engine = create_engine(
                self.connection_string,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True
            )
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
            self.available = True
            logger.info("Database connection established")
        except Exception as e:
            logger.warning(f"Failed to connect to database: {e}. Storage disabled.")
            self.available = False

    @contextmanager
    def get_session(self):
        if not self.available:
            raise RuntimeError("TimescaleDB storage not available")
        
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            session.close()

    def create_tables(self):
        if not self.available:
            return
        Base.metadata.create_all(bind=self.engine)
        logger.info("Tables created")

    def create_hypertable(self):
        if not self.available:
            return
        with self.get_session() as session:
            try:
                session.execute(text("""
                    SELECT create_hypertable(
                        'simulation_results',
                        'timestamp',
                        if_not_exists => TRUE,
                        chunk_time_interval => INTERVAL '1 day'
                    );
                """))
                logger.info("Hypertable created")
            except Exception as e:
                logger.warning(f"Hypertable may already exist: {e}")

    def create_indexes(self):
        if not self.available:
            return
        with self.get_session() as session:
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_sim_results_ts_var ON simulation_results(timestamp, variable);",
                "CREATE INDEX IF NOT EXISTS idx_sim_results_ts_grid ON simulation_results(timestamp, grid_id);",
                "CREATE INDEX IF NOT EXISTS idx_sim_results_location ON simulation_results(latitude, longitude);",
            ]
            for idx_sql in indexes:
                try:
                    session.execute(text(idx_sql))
                except Exception as e:
                    logger.warning(f"Index may already exist: {e}")
            logger.info("Indexes created")

    def initialize_database(self):
        if not self.available:
            logger.warning("Skipping database initialization - storage not available")
            return
        self.create_tables()
        self.create_hypertable()
        self.create_indexes()

    def save_grid_metadata(self, grid_id: str, grid_def: GridDefinition, description: str = ""):
        if not self.available:
            logger.warning(f"Skipping save_grid_metadata - storage not available")
            return
        with self.get_session() as session:
            existing = session.query(GridMetadata).filter_by(grid_id=grid_id).first()
            if existing:
                logger.info(f"Grid metadata {grid_id} already exists")
                return

            metadata = GridMetadata(
                grid_id=grid_id,
                lat_min=grid_def.lat_min,
                lat_max=grid_def.lat_max,
                lon_min=grid_def.lon_min,
                lon_max=grid_def.lon_max,
                resolution=grid_def.resolution,
                description=description
            )
            session.add(metadata)
            logger.info(f"Saved grid metadata: {grid_id}")

    def save_grid_weather_data(self, grid_id: str, grid_data: GridWeatherData, batch_size: int = 10000):
        if not self.available:
            logger.warning(f"Skipping save_grid_weather_data - storage not available")
            return
        records = []
        lat_points = grid_data.grid_def.lat_points
        lon_points = grid_data.grid_def.lon_points

        variables = [
            (WeatherVariable.TEMPERATURE, grid_data.temperature),
            (WeatherVariable.HUMIDITY, grid_data.humidity),
            (WeatherVariable.PRESSURE, grid_data.pressure),
            (WeatherVariable.WIND_SPEED, grid_data.wind_speed),
            (WeatherVariable.WIND_DIRECTION, grid_data.wind_direction),
            (WeatherVariable.PRECIPITATION, grid_data.precipitation),
        ]

        for variable, data in variables:
            if data is None:
                continue

            for i, lat in enumerate(lat_points):
                for j, lon in enumerate(lon_points):
                    value = float(data[i, j]) if not np.isnan(data[i, j]) else None
                    records.append({
                        'timestamp': grid_data.timestamp,
                        'grid_id': grid_id,
                        'variable': variable.value,
                        'latitude': float(lat),
                        'longitude': float(lon),
                        'value': value
                    })

                    if len(records) >= batch_size:
                        self._batch_insert(records)
                        records = []

        if records:
            self._batch_insert(records)

        logger.info(f"Saved grid weather data: {grid_id} at {grid_data.timestamp}")

    def _batch_insert(self, records: List[Dict]):
        if not self.available:
            return
        with self.get_session() as session:
            session.bulk_insert_mappings(SimulationResult, records)

    def query_time_series(self, grid_id: str, variable: WeatherVariable,
                          latitude: float, longitude: float,
                          start_time: datetime, end_time: datetime) -> List[Dict]:
        if not self.available:
            logger.warning(f"Skipping query_time_series - storage not available")
            return []
        with self.get_session() as session:
            results = session.query(SimulationResult).filter(
                SimulationResult.grid_id == grid_id,
                SimulationResult.variable == variable.value,
                SimulationResult.latitude.between(latitude - 0.01, latitude + 0.01),
                SimulationResult.longitude.between(longitude - 0.01, longitude + 0.01),
                SimulationResult.timestamp.between(start_time, end_time)
            ).order_by(SimulationResult.timestamp).all()

            return [
                {
                    'timestamp': r.timestamp,
                    'value': r.value,
                    'latitude': r.latitude,
                    'longitude': r.longitude
                }
                for r in results
            ]

    def query_grid_snapshot(self, grid_id: str, variable: WeatherVariable,
                            timestamp: datetime) -> Dict:
        if not self.available:
            logger.warning(f"Skipping query_grid_snapshot - storage not available")
            return {}
        with self.get_session() as session:
            results = session.query(SimulationResult).filter(
                SimulationResult.grid_id == grid_id,
                SimulationResult.variable == variable.value,
                SimulationResult.timestamp == timestamp
            ).all()

            grid_meta = session.query(GridMetadata).filter_by(grid_id=grid_id).first()

            if not grid_meta:
                return {}

            lat_points = np.arange(grid_meta.lat_min, grid_meta.lat_max + grid_meta.resolution, grid_meta.resolution)
            lon_points = np.arange(grid_meta.lon_min, grid_meta.lon_max + grid_meta.resolution, grid_meta.resolution)

            data = np.full((len(lat_points), len(lon_points)), np.nan)

            for r in results:
                lat_idx = np.argmin(np.abs(lat_points - r.latitude))
                lon_idx = np.argmin(np.abs(lon_points - r.longitude))
                data[lat_idx, lon_idx] = r.value

            return {
                'grid_id': grid_id,
                'variable': variable.value,
                'timestamp': timestamp,
                'lat_points': lat_points.tolist(),
                'lon_points': lon_points.tolist(),
                'data': data.tolist()
            }

    def query_region_average(self, grid_id: str, variable: WeatherVariable,
                             lat_min: float, lat_max: float,
                             lon_min: float, lon_max: float,
                             start_time: datetime, end_time: datetime) -> List[Dict]:
        if not self.available:
            logger.warning(f"Skipping query_region_average - storage not available")
            return []
        with self.get_session() as session:
            sql = text("""
                SELECT 
                    time_bucket('1 hour', timestamp) as bucket,
                    AVG(value) as avg_value,
                    MIN(value) as min_value,
                    MAX(value) as max_value,
                    COUNT(value) as count
                FROM simulation_results
                WHERE grid_id = :grid_id
                  AND variable = :variable
                  AND latitude BETWEEN :lat_min AND :lat_max
                  AND longitude BETWEEN :lon_min AND :lon_max
                  AND timestamp BETWEEN :start_time AND :end_time
                GROUP BY bucket
                ORDER BY bucket;
            """)

            result = session.execute(sql, {
                'grid_id': grid_id,
                'variable': variable.value,
                'lat_min': lat_min,
                'lat_max': lat_max,
                'lon_min': lon_min,
                'lon_max': lon_max,
                'start_time': start_time,
                'end_time': end_time
            })

            return [
                {
                    'timestamp': row[0],
                    'avg_value': row[1],
                    'min_value': row[2],
                    'max_value': row[3],
                    'count': row[4]
                }
                for row in result
            ]

    def save_task_log(self, task_id: str, status: str, worker_id: Optional[str] = None,
                      grid_region: Optional[Tuple[float, float, float, float]] = None,
                      time_step: Optional[int] = None,
                      start_time: Optional[datetime] = None,
                      end_time: Optional[datetime] = None,
                      duration_seconds: Optional[float] = None,
                      error_message: Optional[str] = None,
                      result_summary: Optional[Dict] = None):
        if not self.available:
            logger.warning(f"Skipping save_task_log - storage not available")
            return
        with self.get_session() as session:
            task_log = SimulationTaskLog(
                task_id=task_id,
                status=status,
                worker_id=worker_id,
                grid_region=str(grid_region) if grid_region else None,
                time_step=time_step,
                start_time=start_time,
                end_time=end_time,
                duration_seconds=duration_seconds,
                error_message=error_message,
                result_summary=json.dumps(result_summary) if result_summary else None
            )
            session.merge(task_log)

    def get_task_logs(self, status: Optional[str] = None, 
                      worker_id: Optional[str] = None,
                      limit: int = 100) -> List[Dict]:
        if not self.available:
            logger.warning(f"Skipping get_task_logs - storage not available")
            return []
        with self.get_session() as session:
            query = session.query(SimulationTaskLog)
            
            if status:
                query = query.filter_by(status=status)
            if worker_id:
                query = query.filter_by(worker_id=worker_id)
            
            results = query.order_by(SimulationTaskLog.timestamp.desc()).limit(limit).all()
            
            return [
                {
                    'task_id': r.task_id,
                    'timestamp': r.timestamp,
                    'status': r.status,
                    'worker_id': r.worker_id,
                    'grid_region': r.grid_region,
                    'time_step': r.time_step,
                    'start_time': r.start_time,
                    'end_time': r.end_time,
                    'duration_seconds': r.duration_seconds,
                    'error_message': r.error_message,
                    'result_summary': json.loads(r.result_summary) if r.result_summary else None
                }
                for r in results
            ]

    def get_statistics(self, grid_id: str, start_time: datetime, end_time: datetime) -> Dict:
        if not self.available:
            logger.warning(f"Skipping get_statistics - storage not available")
            return {}
        with self.get_session() as session:
            sql = text("""
                SELECT 
                    variable,
                    COUNT(*) as record_count,
                    AVG(value) as avg_value,
                    MIN(value) as min_value,
                    MAX(value) as max_value,
                    STDDEV(value) as std_value
                FROM simulation_results
                WHERE grid_id = :grid_id
                  AND timestamp BETWEEN :start_time AND :end_time
                GROUP BY variable;
            """)

            result = session.execute(sql, {
                'grid_id': grid_id,
                'start_time': start_time,
                'end_time': end_time
            })

            stats = {}
            for row in result:
                stats[row[0]] = {
                    'record_count': row[1],
                    'avg_value': row[2],
                    'min_value': row[3],
                    'max_value': row[4],
                    'std_value': row[5]
                }

            return stats
