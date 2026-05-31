import sys
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_imports():
    logger.info("Testing module imports...")
    try:
        from config import grid_config, simulation_config
        logger.info("✓ config imported")
        
        from data_models import ObservationData, GridWeatherData, GridDefinition, WeatherVariable
        logger.info("✓ data_models imported")
        
        from data_preprocessor import DataPreprocessor, WeatherDataCleaner, WeatherDataGridded
        logger.info("✓ data_preprocessor imported")
        
        from grid_simulator import WeatherSimulation, RegionalSimulator, AdvectionDiffusionModel
        logger.info("✓ grid_simulator imported")
        
        from task_scheduler import TaskScheduler, RedisTaskQueue
        logger.info("✓ task_scheduler imported")
        
        from result_fusion import ResultFusion, QualityControl
        logger.info("✓ result_fusion imported")
        
        from node_monitor import NodeMonitor, ClusterMonitor, MonitorAPI, SystemMetrics
        logger.info("✓ node_monitor imported")
        
        logger.info("All modules imported successfully!")
        return True
    except Exception as e:
        logger.error(f"Import error: {e}")
        return False


def test_data_models():
    logger.info("Testing data models...")
    try:
        from data_models import ObservationData, GridDefinition, WeatherVariable
        from datetime import datetime
        
        obs = ObservationData(
            station_id="TEST001",
            timestamp=datetime.utcnow(),
            latitude=30.0,
            longitude=120.0,
            temperature=25.0,
            humidity=60.0,
            pressure=1013.25,
            wind_speed=5.0,
            wind_direction=180.0
        )
        logger.info(f"✓ ObservationData created: {obs.station_id}")
        
        grid_def = GridDefinition(
            lat_min=20, lat_max=50,
            lon_min=100, lon_max=140,
            resolution=5.0
        )
        logger.info(f"✓ GridDefinition created: shape {grid_def.shape}")
        logger.info(f"✓ WeatherVariable has {len(list(WeatherVariable))} variables")
        
        return True
    except Exception as e:
        logger.error(f"Data model test error: {e}")
        return False


def test_preprocessor():
    logger.info("Testing data preprocessor...")
    try:
        from data_preprocessor import DataPreprocessor
        from data_models import GridDefinition
        import numpy as np
        
        grid_def = GridDefinition(
            lat_min=20, lat_max=50,
            lon_min=100, lon_max=140,
            resolution=10.0
        )
        
        preprocessor = DataPreprocessor(grid_def)
        logger.info("✓ DataPreprocessor initialized")
        
        return True
    except Exception as e:
        logger.error(f"Preprocessor test error: {e}")
        return False


def test_grid_simulator():
    logger.info("Testing grid simulator...")
    try:
        from grid_simulator import WeatherSimulation
        from data_models import GridDefinition, GridWeatherData
        from datetime import datetime
        import numpy as np
        
        grid_def = GridDefinition(
            lat_min=20, lat_max=50,
            lon_min=100, lon_max=140,
            resolution=10.0
        )
        
        simulator = WeatherSimulation(grid_def, dt_seconds=3600)
        logger.info("✓ WeatherSimulation initialized")
        
        lon_grid, lat_grid = grid_def.get_grid_coords()
        initial_data = GridWeatherData(
            grid_def=grid_def,
            timestamp=datetime.utcnow(),
            temperature=np.ones(grid_def.shape) * 15.0,
            humidity=np.ones(grid_def.shape) * 60.0,
            pressure=np.ones(grid_def.shape) * 1013.0,
            wind_speed=np.ones(grid_def.shape) * 5.0,
            wind_direction=np.ones(grid_def.shape) * 180.0,
            precipitation=np.zeros(grid_def.shape)
        )
        
        result = simulator.simulate_step(initial_data)
        logger.info(f"✓ Simulation step completed: {result.timestamp}")
        
        return True
    except Exception as e:
        logger.error(f"Grid simulator test error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_result_fusion():
    logger.info("Testing result fusion...")
    try:
        from result_fusion import ResultFusion, QualityControl
        from data_models import GridDefinition, GridWeatherData
        from datetime import datetime
        import numpy as np
        
        grid_def = GridDefinition(
            lat_min=20, lat_max=50,
            lon_min=100, lon_max=140,
            resolution=10.0
        )
        
        fusion = ResultFusion(grid_def)
        logger.info("✓ ResultFusion initialized")
        
        test_data = GridWeatherData(
            grid_def=grid_def,
            timestamp=datetime.utcnow(),
            temperature=np.random.randn(*grid_def.shape) * 5 + 15
        )
        
        range_check = QualityControl.check_range(test_data)
        logger.info(f"✓ QualityControl range check: {range_check}")
        
        return True
    except Exception as e:
        logger.error(f"Result fusion test error: {e}")
        return False


def test_system_metrics():
    logger.info("Testing system metrics...")
    try:
        from node_monitor import SystemMetrics
        
        metrics = SystemMetrics.get_all_metrics()
        logger.info(f"✓ System metrics collected: CPU={metrics['cpu_usage']:.1f}%, Mem={metrics['memory']['usage_percent']:.1f}%")
        
        return True
    except Exception as e:
        logger.error(f"System metrics test error: {e}")
        return False


def run_all_tests():
    logger.info("=" * 60)
    logger.info("Running Weather Simulation System Tests")
    logger.info("=" * 60)
    
    tests = [
        ("Module Imports", test_imports),
        ("Data Models", test_data_models),
        ("Data Preprocessor", test_preprocessor),
        ("Grid Simulator", test_grid_simulator),
        ("Result Fusion", test_result_fusion),
        ("System Metrics", test_system_metrics),
    ]
    
    results = []
    for name, test_func in tests:
        logger.info(f"\n--- {name} ---")
        result = test_func()
        results.append((name, result))
    
    logger.info("\n" + "=" * 60)
    logger.info("Test Summary:")
    logger.info("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        logger.info(f"  {status} - {name}")
    
    logger.info(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        logger.info("\n✓ All tests passed! System is ready.")
        return True
    else:
        logger.warning(f"\n⚠ {total - passed} tests failed. Please check your installation.")
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
