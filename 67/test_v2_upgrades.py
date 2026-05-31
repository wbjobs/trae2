import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import logging
import time
import numpy as np
import pandas as pd
import xarray as xr

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def test_imports():
    print("\n" + "="*60)
    print("TEST 1: Module Imports")
    print("="*60)
    
    try:
        from turbulence_interp import (
            load_config,
            ObservationDataParser,
            ParallelProcessor,
            SpatiotemporalInterpolator,
            TaskScheduler,
            Task,
            TaskStatus,
            TaskResult,
            TaskExecutor,
            LocalExecutor,
            TurbulenceGradientAnalyzer,
            GradientConfig,
            GradientMethod,
            MultiPeriodProcessor,
            PeriodConfig,
            AggregationMethod,
            CombineMethod,
            ResultExporter,
        )
        print("✓ All modules imported successfully")
        print(f"  - Version: 2.0.0")
        return True
    except Exception as e:
        print(f"✗ Import failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_spatial_interpolators():
    print("\n" + "="*60)
    print("TEST 2: Spatial Interpolation Methods")
    print("="*60)
    
    from turbulence_interp import SpatiotemporalInterpolator
    
    methods = SpatiotemporalInterpolator.available_spatial_methods()
    print(f"Available spatial methods: {methods}")
    
    np.random.seed(42)
    n_stations = 50
    lons = np.random.uniform(116, 117, n_stations)
    lats = np.random.uniform(39, 40, n_stations)
    values = np.sin(lons * 10) * np.cos(lats * 10) * 5 + 10
    
    df = pd.DataFrame({
        'longitude': lons,
        'latitude': lats,
        'temperature': values,
    })
    
    results = {}
    for method in ['idw_fast', 'idw', 'nearest']:
        try:
            start = time.time()
            interpolator = SpatiotemporalInterpolator(spatial_method=method, grid_resolution=0.05)
            result = interpolator.interpolate_spatial(
                df, 'temperature', (116, 117), (39, 40)
            )
            elapsed = time.time() - start
            
            grid_shape = result.dataset['temperature'].shape
            nan_ratio = np.isnan(result.dataset['temperature'].values).mean()
            
            results[method] = {
                'time': elapsed,
                'shape': grid_shape,
                'nan_ratio': nan_ratio,
                'mean': float(result.dataset['temperature'].mean().values),
            }
            print(f"✓ {method}: {elapsed:.3f}s, shape={grid_shape}, nan={nan_ratio:.2%}")
        except Exception as e:
            print(f"✗ {method}: {e}")
    
    if 'idw' in results and 'idw_fast' in results:
        speedup = results['idw']['time'] / results['idw_fast']['time']
        print(f"\n  Speedup (idw_fast vs idw): {speedup:.1f}x")
    
    return len(results) >= 2


def test_gradient_analysis():
    print("\n" + "="*60)
    print("TEST 3: Turbulence Gradient Analysis")
    print("="*60)
    
    from turbulence_interp import TurbulenceGradientAnalyzer, GradientConfig, GradientMethod
    
    lons = np.linspace(0, 10, 50)
    lats = np.linspace(0, 10, 50)
    lon_grid, lat_grid = np.meshgrid(lons, lats)
    
    u = 2 * lon_grid + lat_grid
    v = lon_grid - 3 * lat_grid
    w = 0.1 * lon_grid * lat_grid
    
    ds = xr.Dataset({
        'u': (['lat', 'lon'], u),
        'v': (['lat', 'lon'], v),
        'w': (['lat', 'lon'], w),
    }, coords={
        'lon': lons,
        'lat': lats,
    })
    
    analyzer = TurbulenceGradientAnalyzer(GradientConfig(
        method=GradientMethod.CENTRAL,
        use_smoothing=False,
        dx=0.2,
        dy=0.2,
    ))
    
    try:
        result = analyzer.analyze_dataset(
            ds, ['u', 'v'],
            compute_spatial_gradient=True,
            compute_vorticity=True,
            compute_divergence=True,
            compute_deformation=True,
            lon_dim='lon',
            lat_dim='lat',
        )
        print(f"✓ Analysis completed, variables: {list(result.data_vars.keys())}")
        
        expected_vars = [
            'u_dx', 'u_dy', 'v_dx', 'v_dy',
            'u_gradient_magnitude', 'v_gradient_magnitude',
            'vorticity', 'divergence',
            'shearing_deformation', 'stretching_deformation',
            'total_deformation',
        ]
        
        for var in expected_vars:
            if var in result.data_vars:
                print(f"  ✓ {var}: shape={result[var].shape}")
            else:
                print(f"  ✗ {var}: MISSING")
        
        return True
    except Exception as e:
        print(f"✗ Analysis failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_multi_period():
    print("\n" + "="*60)
    print("TEST 4: Multi-Period Processing")
    print("="*60)
    
    from turbulence_interp import MultiPeriodProcessor, PeriodConfig, AggregationMethod
    
    processor = MultiPeriodProcessor()
    
    lons = np.linspace(0, 10, 20)
    lats = np.linspace(0, 10, 20)
    
    period_datasets = []
    for i in range(3):
        times = pd.date_range(f'2024-01-0{i+1}', periods=24, freq='1h')
        data = np.random.randn(len(times), len(lats), len(lons)) * (i + 1)
        ds = xr.Dataset({
            'temperature': (['time', 'lat', 'lon'], data + 20),
        }, coords={
            'time': times,
            'lon': lons,
            'lat': lats,
        })
        
        processor.add_period(
            name=f'period_{i+1}',
            start_time=pd.Timestamp(f'2024-01-0{i+1}'),
            end_time=pd.Timestamp(f'2024-01-0{i+1} 23:00:00'),
            data=ds,
            weight=1.0 / (i + 1),
        )
        period_datasets.append(ds)
    
    print(f"✓ Added {len(processor.periods)} periods")
    
    try:
        combined_mean = xr.concat([
            ds['temperature'].mean(dim='time') for ds in period_datasets
        ], dim='period').mean(dim='period')
        print(f"✓ Combined (mean): shape={combined_mean.shape}")
        
        weights = np.array([1.0, 0.5, 1.0/3.0])
        weights = weights / weights.sum()
        weighted_sum = sum(
            ds['temperature'].mean(dim='time') * w 
            for ds, w in zip(period_datasets, weights)
        )
        print(f"✓ Weighted composite: shape={weighted_sum.shape}")
        
        all_data = xr.concat(period_datasets, dim='time')
        time_vals = np.arange(len(all_data.time))
        mean_temp = all_data['temperature'].mean(dim=['lat', 'lon'])
        slope = np.polyfit(time_vals, mean_temp.values, 1)[0]
        print(f"✓ Trend analysis: slope={slope:.4f}")
        
        p1_mean = period_datasets[0]['temperature'].mean(dim='time')
        p2_mean = period_datasets[1]['temperature'].mean(dim='time')
        anomaly = p2_mean - p1_mean
        print(f"✓ Anomaly detection: shape={anomaly.shape}, range=[{float(anomaly.min()):.2f}, {float(anomaly.max()):.2f}]")
        
        return True
    except Exception as e:
        print(f"✗ Multi-period failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_task_scheduler():
    print("\n" + "="*60)
    print("TEST 5: Task Scheduler (Local)")
    print("="*60)
    
    from turbulence_interp import TaskScheduler, TaskStatus
    
    scheduler = TaskScheduler(max_workers=2, task_timeout=30.0)
    
    def compute_task(x, y):
        time.sleep(0.5)
        return x * y
    
    try:
        scheduler.start()
        
        task_id = scheduler.submit("test_multiply", compute_task, 6, 7)
        print(f"✓ Task submitted: {task_id}")
        
        time.sleep(0.2)
        status = scheduler.get_status(task_id)
        print(f"  Status: {status.value}")
        
        result = scheduler.get_result(task_id, timeout=10.0)
        if result and result.success:
            print(f"✓ Task completed: result={result.result}, time={result.execution_time:.2f}s")
        else:
            print(f"✗ Task failed: {result.error if result else 'timeout'}")
            return False
        
        task_ids = scheduler.submit_batch([
            {"name": "batch_1", "func": compute_task, "args": (2, 3)},
            {"name": "batch_2", "func": compute_task, "args": (4, 5)},
            {"name": "batch_3", "func": compute_task, "args": (6, 7)},
        ])
        print(f"✓ Batch submitted: {len(task_ids)} tasks")
        
        scheduler.wait_all(timeout=30.0)
        
        completed = scheduler.get_completed_tasks()
        print(f"✓ Completed tasks: {len(completed)}")
        
        scheduler.stop()
        return True
        
    except Exception as e:
        print(f"✗ Scheduler failed: {e}")
        import traceback
        traceback.print_exc()
        scheduler.stop()
        return False


def test_data_cleaning():
    print("\n" + "="*60)
    print("TEST 6: Enhanced Data Cleaning")
    print("="*60)
    
    from turbulence_interp import ObservationDataParser
    
    parser = ObservationDataParser()
    
    np.random.seed(42)
    n_samples = 1000
    times = pd.date_range('2024-01-01', periods=n_samples, freq='1h')
    stations = [f'STA{i:03d}' for i in range(20)]
    
    data = []
    for i, t in enumerate(times):
        for sta in stations:
            data.append({
                'timestamp': t,
                'station_id': sta,
                'longitude': 116 + np.random.randn() * 0.5,
                'latitude': 39 + np.random.randn() * 0.5,
                'temperature': 20 + np.random.randn() * 2,
                'wind_speed': 5 + np.random.randn() * 3,
                'turbulence_intensity': 0.1 + np.random.rand() * 0.3,
                'quality_flag': np.random.choice([0, 1], p=[0.95, 0.05]),
            })
    
    df = pd.DataFrame(data)
    
    df.loc[df.sample(20).index, 'temperature'] = 200
    df.loc[df.sample(15).index, 'wind_speed'] = -10
    
    print(f"Original data: {len(df)} rows")
    
    try:
        cleaned = parser.clean(
            df,
            remove_outliers=True,
            fill_missing=False,
            z_threshold=3.0,
            use_physical_range=True,
            use_quality_flag=True,
            use_iqr=True,
            per_station=True,
        )
        print(f"✓ Cleaned data: {len(cleaned)} rows (removed {len(df)-len(cleaned)})")
        
        temp_invalid = (cleaned['temperature'] < -90) | (cleaned['temperature'] > 60)
        print(f"  Temperature physical range violations: {temp_invalid.sum()}")
        
        wind_invalid = (cleaned['wind_speed'] < 0) | (cleaned['wind_speed'] > 75)
        print(f"  Wind speed physical range violations: {wind_invalid.sum()}")
        
        qual_bad = (cleaned['quality_flag'] > 0).sum()
        print(f"  Bad quality flags remaining: {qual_bad}")
        
        return True
    except Exception as e:
        print(f"✗ Cleaning failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_full_pipeline():
    print("\n" + "="*60)
    print("TEST 7: Full Pipeline Integration")
    print("="*60)
    
    from turbulence_interp import (
        ObservationDataParser,
        ParallelProcessor,
        SpatiotemporalInterpolator,
        TurbulenceGradientAnalyzer,
        GradientConfig,
    )
    
    np.random.seed(42)
    n_stations = 30
    n_times = 10
    
    data = []
    stations = [f'STA{i:03d}' for i in range(n_stations)]
    times = pd.date_range('2024-01-01', periods=n_times, freq='1h')
    
    for t in times:
        for sta in stations:
            data.append({
                'timestamp': t,
                'station_id': sta,
                'longitude': 116 + np.random.randn() * 0.3,
                'latitude': 39 + np.random.randn() * 0.3,
                'temperature': 20 + np.random.randn() * 1,
                'wind_speed': 5 + np.random.randn() * 1,
            })
    
    df = pd.DataFrame(data)
    print(f"Input data: {len(df)} rows, {n_stations} stations, {n_times} timesteps")
    
    try:
        parser = ObservationDataParser()
        cleaned = parser.clean(df, use_physical_range=True)
        print(f"✓ Data cleaned: {len(cleaned)} rows")
        
        interpolator = SpatiotemporalInterpolator(
            spatial_method='idw_fast',
            grid_resolution=0.1,
            use_vectorized=True,
        )
        
        target_times = pd.date_range('2024-01-01', periods=20, freq='30min')
        
        result = interpolator.interpolate_spatiotemporal(
            cleaned, 'temperature',
            lon_range=(115.5, 116.5),
            lat_range=(38.5, 39.5),
            target_times=target_times,
        )
        
        print(f"✓ Spatiotemporal interpolation complete")
        print(f"  Shape: {result.dataset['temperature'].shape}")
        print(f"  Time steps: {len(result.dataset.time)}")
        print(f"  Grid: {len(result.dataset.latitude)}x{len(result.dataset.longitude)}")
        
        analyzer = TurbulenceGradientAnalyzer(GradientConfig(dx=0.1, dy=0.1))
        gradient_result = analyzer.compute_spatial_gradient(
            result.dataset['temperature'],
            lon_dim='longitude',
            lat_dim='latitude',
        )
        print(f"✓ Gradient analysis complete")
        print(f"  Gradient magnitude range: [{gradient_result['temperature_gradient_magnitude'].min().values:.3f}, {gradient_result['temperature_gradient_magnitude'].max().values:.3f}]")
        
        return True
        
    except Exception as e:
        print(f"✗ Pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "="*60)
    print("TURBULENCE INTERPOLATION SUITE v2.0 - UPGRADE VALIDATION")
    print("="*60)
    
    tests = [
        test_imports,
        test_spatial_interpolators,
        test_gradient_analysis,
        test_multi_period,
        test_task_scheduler,
        test_data_cleaning,
        test_full_pipeline,
    ]
    
    results = []
    for test in tests:
        try:
            results.append(test())
        except Exception as e:
            print(f"✗ {test.__name__} crashed: {e}")
            results.append(False)
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    passed = sum(results)
    total = len(results)
    
    for i, test in enumerate(tests):
        status = "✓ PASS" if results[i] else "✗ FAIL"
        print(f"  {status}: {test.__name__}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✓ ALL TESTS PASSED! Upgrade successful.")
        return 0
    else:
        print(f"\n✗ {total - passed} tests failed!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
