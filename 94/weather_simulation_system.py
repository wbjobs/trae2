import logging
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
import numpy as np

from config import grid_config, simulation_config
from data_models import (
    ObservationData, GridWeatherData, GridDefinition, 
    WeatherVariable, SimulationTask
)
from data_preprocessor import DataPreprocessor
from grid_simulator import WeatherSimulation, RegionalSimulator
from task_scheduler import TaskScheduler, RedisTaskQueue
from result_fusion import ResultFusion, QualityControl
from node_monitor import NodeMonitor, ClusterMonitor, MonitorAPI
from timescaledb_storage import TimescaleDBStorage
from task_snapshot import SnapshotManager, AutoSnapshotManager
from timeseries_comparison import TimeSeriesComparer
from optimized_scheduler import LoadAwareScheduler, DynamicTaskAllocator
from result_exporter import ResultExporter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class WeatherSimulationSystem:
    def __init__(self, use_dask: bool = False, enable_monitoring: bool = True,
                 enable_snapshots: bool = True, enable_optimized_scheduling: bool = True):
        self.grid_def = GridDefinition(
            lat_min=grid_config.lat_min,
            lat_max=grid_config.lat_max,
            lon_min=grid_config.lon_min,
            lon_max=grid_config.lon_max,
            resolution=grid_config.resolution
        )
        
        self.preprocessor = DataPreprocessor(self.grid_def)
        self.simulator = WeatherSimulation(self.grid_def, simulation_config.dt_seconds)
        self.scheduler = TaskScheduler(use_dask=use_dask)
        self.result_fusion = ResultFusion(self.grid_def)
        self.storage = None
        self.monitor = None
        self.enable_monitoring = enable_monitoring
        self.enable_snapshots = enable_snapshots
        self.enable_optimized_scheduling = enable_optimized_scheduling
        self.snapshot_manager = None
        self.auto_snapshot = None
        self.timeseries_comparer = None
        self.optimized_scheduler = None
        self.task_allocator = None
        self.exporter = None
        
        self._initialize_storage()
        self._initialize_monitoring()
        self._initialize_snapshot_manager()
        self._initialize_comparison_tools()
        self._initialize_optimized_scheduler()
        self._initialize_exporter()

    def _initialize_storage(self):
        try:
            self.storage = TimescaleDBStorage()
            self.storage.initialize_database()
            logger.info("TimescaleDB storage initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize TimescaleDB storage: {e}")
            logger.warning("Running without database storage")

    def _initialize_monitoring(self):
        if self.enable_monitoring:
            try:
                self.monitor = NodeMonitor()
                self.monitor.start()
                logger.info("Node monitor started")
            except Exception as e:
                logger.warning(f"Failed to start node monitor: {e}")
                self.enable_monitoring = False

    def _initialize_snapshot_manager(self):
        if self.enable_snapshots:
            try:
                self.snapshot_manager = SnapshotManager()
                self.auto_snapshot = AutoSnapshotManager(self.snapshot_manager, interval_steps=10)
                logger.info("Snapshot manager initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize snapshot manager: {e}")
                self.enable_snapshots = False

    def _initialize_comparison_tools(self):
        try:
            self.timeseries_comparer = TimeSeriesComparer(self.grid_def)
            logger.info("Time series comparison tools initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize comparison tools: {e}")
            self.timeseries_comparer = None

    def _initialize_optimized_scheduler(self):
        if self.enable_optimized_scheduling:
            try:
                self.optimized_scheduler = LoadAwareScheduler(self.grid_def)
                self.task_allocator = DynamicTaskAllocator(self.grid_def)
                logger.info("Optimized scheduler initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize optimized scheduler: {e}")
                self.enable_optimized_scheduling = False

    def _initialize_exporter(self):
        try:
            self.exporter = ResultExporter(self.grid_def, output_dir="output")
            logger.info("Result exporter initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize result exporter: {e}")
            self.exporter = None

    def process_observations(self, observations: List[ObservationData],
                              timestamp: Optional[datetime] = None) -> GridWeatherData:
        logger.info(f"Processing {len(observations)} observations")
        grid_data = self.preprocessor.process_observations(observations, timestamp)
        
        if self.storage:
            self.storage.save_grid_metadata("main_grid", self.grid_def, "Main simulation grid")
            self.storage.save_grid_weather_data("main_grid", grid_data)
        
        logger.info("Observation processing complete")
        return grid_data

    def run_simulation(self, initial_data: GridWeatherData,
                       num_steps: Optional[int] = None,
                       variables: Optional[List[WeatherVariable]] = None) -> List[GridWeatherData]:
        num_steps = num_steps or simulation_config.time_steps
        variables = variables or list(WeatherVariable)
        
        logger.info(f"Running simulation for {num_steps} time steps")
        
        results = self.simulator.simulate_multi_step(initial_data, num_steps, variables)
        
        if self.storage:
            for step_data in results:
                self.storage.save_grid_weather_data("main_grid", step_data)
        
        if self.enable_monitoring and self.monitor:
            self.monitor.update_task_count(completed=num_steps)
        
        logger.info(f"Simulation complete: {len(results)} time steps")
        return results

    def run_distributed_simulation(self, initial_data: GridWeatherData,
                                    num_steps: Optional[int] = None,
                                    variables: Optional[List[WeatherVariable]] = None,
                                    num_regions: int = 4,
                                    num_workers: Optional[int] = None) -> List[GridWeatherData]:
        num_steps = num_steps or simulation_config.time_steps
        variables = variables or list(WeatherVariable)
        num_workers = num_workers or simulation_config.parallel_workers
        
        logger.info(f"Starting distributed simulation: {num_regions} regions, {num_workers} workers")
        
        self.scheduler.task_queue.clear_all()
        
        tasks = self.scheduler.create_tasks(self.grid_def, num_steps, variables, num_regions)
        task_ids = self.scheduler.submit_tasks(tasks)
        
        monitor_to_pass = self.monitor if self.enable_monitoring else None
        
        self.scheduler.start_worker_pool(initial_data, num_workers, monitor=monitor_to_pass)
        
        self.scheduler.wait_for_completion(timeout=num_steps * 60)
        
        self.scheduler.stop_worker_pool()
        
        results = self.scheduler.get_all_results(task_ids)
        
        merged_results = self.result_fusion.merge_region_results(results)
        
        smoothed_results = []
        for data in merged_results:
            smoothed = self.result_fusion.smooth_data(data, sigma=1.0)
            filled = self.result_fusion.fill_missing_values(smoothed, method='nearest')
            smoothed_results.append(filled)
        
        if self.storage:
            for step_data in smoothed_results:
                self.storage.save_grid_weather_data("main_grid", step_data)
        
        logger.info(f"Distributed simulation complete: {len(smoothed_results)} time steps")
        return smoothed_results

    def run_quality_control(self, results: List[GridWeatherData]) -> Dict:
        logger.info("Running quality control checks")
        
        qc_results = {
            'range_checks': [],
            'spatial_checks': [],
            'temporal_checks': []
        }
        
        for i, data in enumerate(results):
            range_ok = QualityControl.check_range(data)
            spatial_ok = QualityControl.check_spatial_consistency(data)
            temporal_ok = {}
            
            if i > 0:
                temporal_ok = QualityControl.check_temporal_consistency(data, results[i-1])
            
            qc_results['range_checks'].append({
                'timestamp': data.timestamp.isoformat(),
                'checks': range_ok
            })
            qc_results['spatial_checks'].append({
                'timestamp': data.timestamp.isoformat(),
                'checks': spatial_ok
            })
            qc_results['temporal_checks'].append({
                'timestamp': data.timestamp.isoformat(),
                'checks': temporal_ok
            })
        
        logger.info("Quality control complete")
        return qc_results

    def query_time_series(self, latitude: float, longitude: float,
                          variable: WeatherVariable,
                          start_time: datetime, end_time: datetime) -> List[Dict]:
        if not self.storage:
            logger.warning("Storage not initialized")
            return []
        
        return self.storage.query_time_series("main_grid", variable, latitude, longitude, start_time, end_time)

    def query_region_stats(self, lat_min: float, lat_max: float,
                            lon_min: float, lon_max: float,
                            variable: WeatherVariable,
                            start_time: datetime, end_time: datetime) -> List[Dict]:
        if not self.storage:
            logger.warning("Storage not initialized")
            return []
        
        return self.storage.query_region_average("main_grid", variable, lat_min, lat_max, lon_min, lon_max, start_time, end_time)

    def get_cluster_status(self) -> Dict:
        cluster_monitor = ClusterMonitor()
        return cluster_monitor.get_cluster_summary()

    def create_snapshot(self, task: SimulationTask, grid_data: GridWeatherData,
                         current_step: int, completed_regions: List[str],
                         pending_regions: List[str], results: List[Dict]) -> str:
        if not self.enable_snapshots or not self.snapshot_manager:
            logger.warning("Snapshots not enabled")
            return ""
        
        return self.snapshot_manager.create_snapshot(
            task, grid_data, current_step, completed_regions, pending_regions, results
        )

    def restore_from_snapshot(self, snapshot_id: str) -> Tuple[Optional[GridWeatherData], List[str], List[str], List[Dict]]:
        if not self.enable_snapshots or not self.snapshot_manager:
            logger.warning("Snapshots not enabled")
            return None, [], [], []
        
        return self.snapshot_manager.restore_from_snapshot(snapshot_id)

    def list_snapshots(self, task_id: Optional[str] = None, limit: int = 20) -> List[Dict]:
        if not self.enable_snapshots or not self.snapshot_manager:
            return []
        
        return self.snapshot_manager.list_snapshots(task_id=task_id, limit=limit)

    def delete_snapshot(self, snapshot_id: str) -> bool:
        if not self.enable_snapshots or not self.snapshot_manager:
            logger.warning("Snapshots not enabled")
            return False
        
        return self.snapshot_manager.delete_snapshot(snapshot_id)

    def compare_periods(self, results: List[GridWeatherData],
                        period1: Tuple[datetime, datetime],
                        period2: Tuple[datetime, datetime],
                        variable: WeatherVariable) -> Optional[Dict]:
        if not self.timeseries_comparer:
            logger.warning("Comparison tools not available")
            return None
        
        comparison = self.timeseries_comparer.compare_periods(results, period1, period2, variable)
        if comparison:
            return {
                'mean_diff': comparison.mean_diff,
                'std_diff': comparison.std_diff,
                'max_diff': comparison.max_diff,
                'min_diff': comparison.min_diff,
                'correlation': comparison.correlation,
                'trend1': comparison.trend1,
                'trend2': comparison.trend2,
                'spatial_metrics': comparison.spatial_metrics
            }
        return None

    def analyze_trend(self, results: List[GridWeatherData],
                      variable: WeatherVariable) -> Optional[Dict]:
        if not self.timeseries_comparer:
            logger.warning("Comparison tools not available")
            return None
        
        trend = self.timeseries_comparer.analyze_trend(results, variable)
        if trend:
            return {
                'slope': trend.slope,
                'r_squared': trend.r_squared,
                'p_value': trend.p_value,
                'trend_direction': trend.trend_direction,
                'change_percent': trend.change_percent
            }
        return None

    def detect_extremes(self, results: List[GridWeatherData],
                        variable: WeatherVariable,
                        threshold: float = 2.0) -> List[Dict]:
        if not self.timeseries_comparer:
            logger.warning("Comparison tools not available")
            return []
        
        return self.timeseries_comparer.detect_extremes(results, variable, threshold)

    def generate_comparison_report(self, results: List[GridWeatherData],
                                     period1: Tuple[datetime, datetime],
                                     period2: Tuple[datetime, datetime]) -> Dict:
        if not self.timeseries_comparer:
            logger.warning("Comparison tools not available")
            return {}
        
        return self.timeseries_comparer.generate_comparison_report(results, period1, period2)

    def cross_correlation(self, results: List[GridWeatherData],
                          var1: WeatherVariable, var2: WeatherVariable,
                          max_lag: int = 24) -> Optional[Dict]:
        if not self.timeseries_comparer:
            logger.warning("Comparison tools not available")
            return None
        
        correlation = self.timeseries_comparer.cross_correlation(results, var1, var2, max_lag)
        if correlation:
            return {
                'lags': correlation.lags,
                'correlations': correlation.correlations,
                'max_correlation': correlation.max_correlation,
                'best_lag': correlation.best_lag
            }
        return None

    def diurnal_cycle(self, results: List[GridWeatherData],
                      variable: WeatherVariable) -> Optional[Dict]:
        if not self.timeseries_comparer:
            logger.warning("Comparison tools not available")
            return None
        
        cycle = self.timeseries_comparer.analyze_diurnal_cycle(results, variable)
        if cycle:
            return {
                'hourly_means': cycle.hourly_means,
                'hourly_stds': cycle.hourly_stds,
                'peak_hour': cycle.peak_hour,
                'trough_hour': cycle.trough_hour,
                'diurnal_amplitude': cycle.diurnal_amplitude
            }
        return None

    def get_resource_utilization(self) -> Dict:
        if not self.enable_optimized_scheduling or not self.optimized_scheduler:
            logger.warning("Optimized scheduler not available")
            return {}
        
        return self.optimized_scheduler.get_resource_utilization_report()

    def run_with_optimized_scheduling(self, initial_data: GridWeatherData,
                                       num_steps: Optional[int] = None,
                                       variables: Optional[List[WeatherVariable]] = None,
                                       num_regions: int = 4) -> List[GridWeatherData]:
        if not self.enable_optimized_scheduling or not self.task_allocator:
            logger.info("Using standard scheduling")
            return self.run_distributed_simulation(initial_data, num_steps, variables, num_regions)
        
        num_steps = num_steps or simulation_config.time_steps
        variables = variables or list(WeatherVariable)
        
        logger.info(f"Starting optimized scheduling simulation")
        
        tasks = self.scheduler.create_tasks(self.grid_def, num_steps, variables, num_regions)
        self.task_allocator.add_tasks(tasks)
        
        efficiency = self.task_allocator.get_allocation_efficiency()
        logger.info(f"Initial allocation efficiency: {efficiency}")
        
        return self.run_distributed_simulation(initial_data, num_steps, variables, num_regions)

    def export_results(self, results: List[GridWeatherData],
                       formats: List[str] = ['json', 'csv'],
                       output_prefix: str = "weather_results") -> Dict[str, str]:
        if not self.exporter:
            logger.warning("Result exporter not available")
            return {}
        
        return self.exporter.export_batch(results, formats=formats, output_prefix=output_prefix)

    def export_to_json(self, results: List[GridWeatherData], filename: Optional[str] = None) -> str:
        if not self.exporter:
            return ""
        return self.exporter.export_to_json(results, filename)

    def export_to_csv(self, results: List[GridWeatherData], filename: Optional[str] = None) -> str:
        if not self.exporter:
            return ""
        return self.exporter.export_to_csv(results, filename)

    def export_to_netcdf(self, results: List[GridWeatherData], filename: Optional[str] = None) -> str:
        if not self.exporter:
            return ""
        return self.exporter.export_to_netcdf(results, filename)

    def export_to_geotiff(self, data: GridWeatherData, variable: WeatherVariable,
                           filename: Optional[str] = None) -> str:
        if not self.exporter:
            return ""
        return self.exporter.export_to_geotiff(data, variable, filename)

    def export_summary(self, results: List[GridWeatherData]) -> str:
        if not self.exporter:
            return ""
        return self.exporter.export_summary(results)

    def shutdown(self):
        logger.info("Shutting down weather simulation system")
        
        if self.monitor:
            self.monitor.stop()
        
        if self.scheduler:
            self.scheduler.shutdown()
        
        if self.enable_optimized_scheduling and self.optimized_scheduler:
            self.optimized_scheduler.save_state()
        
        if self.enable_snapshots and self.snapshot_manager:
            self.snapshot_manager.clean_old_snapshots(days=7)
        
        logger.info("System shutdown complete")


def generate_sample_observations(num_stations: int = 50) -> List[ObservationData]:
    np.random.seed(42)
    observations = []
    timestamp = datetime.utcnow()
    
    for i in range(num_stations):
        lat = np.random.uniform(20, 50)
        lon = np.random.uniform(100, 140)
        
        obs = ObservationData(
            station_id=f"STATION_{i:03d}",
            timestamp=timestamp,
            latitude=lat,
            longitude=lon,
            temperature=float(np.random.normal(15, 5)),
            humidity=float(np.random.uniform(30, 90)),
            pressure=float(np.random.normal(1013, 10)),
            wind_speed=float(np.random.uniform(0, 20)),
            wind_direction=float(np.random.uniform(0, 360)),
            precipitation=float(np.random.exponential(1))
        )
        observations.append(obs)
    
    logger.info(f"Generated {num_stations} sample observations")
    return observations


def run_single_node_demo():
    logger.info("=" * 60)
    logger.info("Running Single-Node Weather Simulation Demo")
    logger.info("=" * 60)
    
    system = WeatherSimulationSystem(use_dask=False, enable_monitoring=True)
    
    try:
        observations = generate_sample_observations(100)
        
        initial_data = system.process_observations(observations)
        
        logger.info(f"Initial grid shape: {initial_data.grid_def.shape}")
        logger.info(f"Temperature range: {np.nanmin(initial_data.temperature):.2f} to {np.nanmax(initial_data.temperature):.2f} C")
        
        results = system.run_simulation(initial_data, num_steps=10)
        
        qc_results = system.run_quality_control(results)
        
        logger.info(f"Generated {len(results)} time steps of simulation data")
        
        final_temp = results[-1].temperature
        logger.info(f"Final temperature range: {np.nanmin(final_temp):.2f} to {np.nanmax(final_temp):.2f} C")
        
        cluster_status = system.get_cluster_status()
        logger.info(f"Cluster status: {cluster_status}")
        
    finally:
        system.shutdown()
    
    logger.info("Single-node demo complete")


def run_distributed_demo():
    logger.info("=" * 60)
    logger.info("Running Distributed Weather Simulation Demo")
    logger.info("=" * 60)
    
    system = WeatherSimulationSystem(use_dask=False, enable_monitoring=True)
    
    try:
        observations = generate_sample_observations(50)
        
        initial_data = system.process_observations(observations)
        
        logger.info(f"Initial grid shape: {initial_data.grid_def.shape}")
        
        results = system.run_distributed_simulation(
            initial_data,
            num_steps=5,
            num_regions=4,
            num_workers=2
        )
        
        qc_results = system.run_quality_control(results)
        
        logger.info(f"Generated {len(results)} time steps of distributed simulation data")
        
        for i, result in enumerate(results):
            temp_mean = np.nanmean(result.temperature)
            hum_mean = np.nanmean(result.humidity)
            logger.info(f"Step {i}: Temp={temp_mean:.2f} C, Humidity={hum_mean:.2f}%")
        
    finally:
        system.shutdown()
    
    logger.info("Distributed demo complete")


def run_monitoring_demo():
    logger.info("=" * 60)
    logger.info("Running Monitoring Demo")
    logger.info("=" * 60)
    
    monitor = NodeMonitor()
    monitor.start()
    
    try:
        import time
        for i in range(3):
            status = monitor.get_status()
            logger.info(f"Node status: {status['status']}")
            logger.info(f"CPU Usage: {status['metrics'].get('cpu_usage', 0):.1f}%")
            logger.info(f"Memory Usage: {status['metrics'].get('memory', {}).get('usage_percent', 0):.1f}%")
            
            monitor.update_task_count(active=i+1, completed=i)
            
            time.sleep(2)
        
        cluster_monitor = ClusterMonitor()
        summary = cluster_monitor.get_cluster_summary()
        logger.info(f"Cluster summary: {summary}")
        
    finally:
        monitor.stop()
    
    logger.info("Monitoring demo complete")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        mode = sys.argv[1].lower()
    else:
        mode = "single"
    
    if mode == "single":
        run_single_node_demo()
    elif mode == "distributed":
        run_distributed_demo()
    elif mode == "monitoring":
        run_monitoring_demo()
    else:
        print(f"Unknown mode: {mode}")
        print("Usage: python weather_simulation_system.py [single|distributed|monitoring]")
