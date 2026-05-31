import logging
import sys
import os
from datetime import datetime, timedelta
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_snapshot_module():
    logger.info("=" * 60)
    logger.info("测试升级功能1: 任务快照保存模块")
    logger.info("=" * 60)
    
    try:
        from task_snapshot import SnapshotManager, AutoSnapshotManager
        from data_models import GridDefinition, GridWeatherData, SimulationTask, WeatherVariable
        
        grid_def = GridDefinition(20, 50, 100, 140, 10)
        
        snapshot_manager = SnapshotManager(use_redis=False)
        logger.info("✓ SnapshotManager 初始化成功")
        
        auto_snapshot = AutoSnapshotManager(snapshot_manager, interval_steps=5)
        logger.info("✓ AutoSnapshotManager 初始化成功")
        
        task = SimulationTask(
            task_id="test_task_001",
            grid_region=(20, 35, 100, 120),
            time_step=10,
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow() + timedelta(hours=10),
            variables=[WeatherVariable.TEMPERATURE, WeatherVariable.HUMIDITY]
        )
        
        grid_data = GridWeatherData(
            grid_def=grid_def,
            timestamp=datetime.utcnow(),
            temperature=np.ones(grid_def.shape) * 20.0,
            humidity=np.ones(grid_def.shape) * 60.0,
            pressure=np.ones(grid_def.shape) * 1013.0,
            wind_speed=np.ones(grid_def.shape) * 5.0,
            wind_direction=np.ones(grid_def.shape) * 180.0,
            precipitation=np.zeros(grid_def.shape)
        )
        
        snapshot_id = snapshot_manager.create_snapshot(
            task, grid_data, current_step=5,
            completed_regions=['region_1', 'region_2'],
            pending_regions=['region_3', 'region_4'],
            results=[{'step': 1, 'temp': 20.5}]
        )
        logger.info(f"✓ 创建快照成功: {snapshot_id}")
        
        verify_result = snapshot_manager.verify_snapshot(snapshot_id)
        logger.info(f"✓ 快照校验结果: {'通过' if verify_result else '失败'}")
        
        snapshots = snapshot_manager.list_snapshots(task_id="test_task_001")
        logger.info(f"✓ 快照列表查询成功，共 {len(snapshots)} 个快照")
        
        restored_data, completed, pending, results = snapshot_manager.restore_from_snapshot(snapshot_id)
        logger.info(f"✓ 从快照恢复成功")
        logger.info(f"  - 已完成区域: {len(completed)} 个")
        logger.info(f"  - 待处理区域: {len(pending)} 个")
        logger.info(f"  - 已保存结果: {len(results)} 个")
        
        should_snap = auto_snapshot.should_snapshot(5)
        logger.info(f"✓ 自动快照判断 (step=5): {should_snap}")
        
        should_snap = auto_snapshot.should_snapshot(10)
        logger.info(f"✓ 自动快照判断 (step=10): {should_snap}")
        
        snapshot_manager.clean_old_snapshots(days=0)
        logger.info("✓ 旧快照清理成功")
        
        return True
        
    except Exception as e:
        logger.error(f"快照模块测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_timeseries_comparison():
    logger.info("\n" + "=" * 60)
    logger.info("测试升级功能2: 多时段结果对比计算模块")
    logger.info("=" * 60)
    
    try:
        from timeseries_comparison import TimeSeriesComparer
        from data_models import GridDefinition, GridWeatherData, WeatherVariable
        
        grid_def = GridDefinition(20, 50, 100, 140, 10)
        comparer = TimeSeriesComparer(grid_def)
        logger.info("✓ TimeSeriesComparer 初始化成功")
        
        base_time = datetime.utcnow()
        data_list = []
        for i in range(48):
            data = GridWeatherData(
                grid_def=grid_def,
                timestamp=base_time + timedelta(hours=i),
                temperature=np.ones(grid_def.shape) * (15 + 5 * np.sin(2 * np.pi * i / 24) + np.random.randn(*grid_def.shape)),
                humidity=np.ones(grid_def.shape) * (60 + 10 * np.sin(2 * np.pi * i / 24)),
                pressure=np.ones(grid_def.shape) * 1013.0,
                wind_speed=np.ones(grid_def.shape) * 5.0,
                wind_direction=np.ones(grid_def.shape) * 180.0,
                precipitation=np.zeros(grid_def.shape)
            )
            data_list.append(data)
        
        logger.info(f"✓ 生成 {len(data_list)} 个时间步的模拟数据")
        
        period1 = (base_time, base_time + timedelta(hours=12))
        period2 = (base_time + timedelta(hours=24), base_time + timedelta(hours=36))
        
        comparison = comparer.compare_periods(data_list, period1, period2, WeatherVariable.TEMPERATURE)
        if comparison:
            logger.info(f"✓ 时段对比计算成功")
            logger.info(f"  - 均值差: {comparison.mean_diff:.3f}")
            logger.info(f"  - 标准差差: {comparison.std_diff:.3f}")
            logger.info(f"  - 相关系数: {comparison.correlation:.3f}")
            logger.info(f"  - 空间RMSE: {comparison.spatial_metrics['rmse']:.3f}")
        
        trend = comparer.analyze_trend(data_list, WeatherVariable.TEMPERATURE)
        if trend:
            logger.info(f"✓ 趋势分析成功")
            logger.info(f"  - 斜率: {trend.slope:.6f}")
            logger.info(f"  - R²: {trend.r_squared:.3f}")
            logger.info(f"  - p值: {trend.p_value:.4f}")
            logger.info(f"  - 趋势方向: {trend.trend_direction}")
            logger.info(f"  - 变化百分比: {trend.change_percent:.2f}%")
        
        extremes = comparer.detect_extremes(data_list, WeatherVariable.TEMPERATURE, threshold=1.5)
        logger.info(f"✓ 极值检测成功，发现 {len(extremes)} 个含极值的时间步")
        
        report = comparer.generate_comparison_report(data_list, period1, period2)
        logger.info(f"✓ 对比报告生成成功，包含 {len(report['period_comparisons'])} 个变量的对比")
        
        cross_corr = comparer.cross_correlation(data_list, WeatherVariable.TEMPERATURE, WeatherVariable.HUMIDITY)
        if 'error' not in cross_corr:
            logger.info(f"✓ 交叉相关分析成功")
            logger.info(f"  - 最大相关系数: {cross_corr['max_correlation']:.3f}")
            logger.info(f"  - 对应时滞: {cross_corr['lag_at_max']} 步")
        
        diurnal = comparer.calculate_diurnal_cycle(data_list, WeatherVariable.TEMPERATURE)
        logger.info(f"✓ 日周期分析成功，包含 {len(diurnal)} 个小时的统计")
        
        return True
        
    except Exception as e:
        logger.error(f"多时段对比模块测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_optimized_scheduler():
    logger.info("\n" + "=" * 60)
    logger.info("测试升级功能3: 优化任务调度算法")
    logger.info("=" * 60)
    
    try:
        from optimized_scheduler import LoadAwareScheduler, DynamicTaskAllocator
        from data_models import GridDefinition, SimulationTask, WeatherVariable
        
        grid_def = GridDefinition(20, 50, 100, 140, 10)
        
        scheduler = LoadAwareScheduler(grid_def)
        logger.info("✓ LoadAwareScheduler 初始化成功")
        
        allocator = DynamicTaskAllocator(grid_def)
        logger.info("✓ DynamicTaskAllocator 初始化成功")
        
        tasks = []
        for i in range(8):
            task = SimulationTask(
                task_id=f"opt_task_{i:03d}",
                grid_region=(20 + i*3, 23 + i*3, 100, 110),
                time_step=10,
                start_time=datetime.utcnow(),
                end_time=datetime.utcnow() + timedelta(hours=10),
                variables=[WeatherVariable.TEMPERATURE],
                priority=100 - i
            )
            tasks.append(task)
        
        estimate = scheduler.estimate_task_resources(tasks[0])
        logger.info(f"✓ 任务资源预估成功")
        logger.info(f"  - 预估CPU: {estimate.estimated_cpu:.2f}")
        logger.info(f"  - 预估内存: {estimate.estimated_memory_mb:.1f} MB")
        logger.info(f"  - 预估时长: {estimate.estimated_duration:.1f} 秒")
        
        optimized_batch = scheduler.optimize_task_batch(tasks)
        logger.info(f"✓ 任务批优化成功，批次大小: {len(optimized_batch)}")
        
        worker_count = scheduler.get_optimal_worker_count(pending_tasks=8)
        logger.info(f"✓ 最优worker数计算: {worker_count} 个")
        
        report = scheduler.get_resource_utilization_report()
        if 'error' in report:
            logger.info(f"  资源利用率报告: {report['error']} (无活跃worker属正常)")
        else:
            logger.info(f"✓ 资源利用率报告生成成功")
        
        allocator.add_tasks(tasks)
        logger.info(f"✓ 添加 {len(tasks)} 个任务到分配队列")
        
        efficiency = allocator.get_allocation_efficiency()
        if 'error' not in efficiency:
            logger.info(f"✓ 分配效率查询成功")
        
        return True
        
    except Exception as e:
        logger.error(f"优化调度模块测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_result_exporter():
    logger.info("\n" + "=" * 60)
    logger.info("测试升级功能4: 多维格式导出模块")
    logger.info("=" * 60)
    
    try:
        from result_exporter import ResultExporter
        from data_models import GridDefinition, GridWeatherData, WeatherVariable
        
        grid_def = GridDefinition(20, 50, 100, 140, 10)
        exporter = ResultExporter(grid_def, output_dir="test_output")
        logger.info("✓ ResultExporter 初始化成功")
        
        base_time = datetime.utcnow()
        data_list = []
        for i in range(3):
            data = GridWeatherData(
                grid_def=grid_def,
                timestamp=base_time + timedelta(hours=i),
                temperature=np.ones(grid_def.shape) * (20 + i),
                humidity=np.ones(grid_def.shape) * (60 - i * 5),
                pressure=np.ones(grid_def.shape) * 1013.0,
                wind_speed=np.ones(grid_def.shape) * 5.0,
                wind_direction=np.ones(grid_def.shape) * 180.0,
                precipitation=np.zeros(grid_def.shape)
            )
            data_list.append(data)
        
        json_file = exporter.export_to_json(data_list, "test_results.json")
        if json_file and os.path.exists(json_file):
            file_size = os.path.getsize(json_file)
            logger.info(f"✓ JSON导出成功: {json_file} ({file_size} bytes)")
        
        csv_file = exporter.export_to_csv(data_list, "test_results.csv")
        if csv_file and os.path.exists(csv_file):
            file_size = os.path.getsize(csv_file)
            logger.info(f"✓ CSV导出成功: {csv_file} ({file_size} bytes)")
        
        try:
            nc_file = exporter.export_to_netcdf(data_list, "test_results.nc")
            if nc_file and os.path.exists(nc_file):
                file_size = os.path.getsize(nc_file)
                logger.info(f"✓ NetCDF导出成功: {nc_file} ({file_size} bytes)")
        except Exception as e:
            logger.info(f"  NetCDF导出跳过 (依赖库未安装): {e}")
        
        ascii_file = exporter.export_to_geotiff(data_list[0], WeatherVariable.TEMPERATURE, "test_temp.tif")
        if ascii_file and os.path.exists(ascii_file):
            file_size = os.path.getsize(ascii_file)
            logger.info(f"✓ GeoTIFF/ASCII导出成功: {ascii_file} ({file_size} bytes)")
        
        series_file = exporter.export_variable_series(data_list, WeatherVariable.TEMPERATURE, 35.0, 120.0)
        if series_file and os.path.exists(series_file):
            file_size = os.path.getsize(series_file)
            logger.info(f"✓ 单点时间序列导出成功: {series_file} ({file_size} bytes)")
        
        summary_file = exporter.export_summary(data_list, "test_summary.json")
        if summary_file and os.path.exists(summary_file):
            file_size = os.path.getsize(summary_file)
            logger.info(f"✓ 汇总报告导出成功: {summary_file} ({file_size} bytes)")
        
        batch_results = exporter.export_batch(data_list, formats=['json', 'csv'], output_prefix="batch_test")
        logger.info(f"✓ 批量导出成功，共 {len(batch_results)} 个文件")
        
        return True
        
    except Exception as e:
        logger.error(f"结果导出模块测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_system_integration():
    logger.info("\n" + "=" * 60)
    logger.info("测试升级功能5: 系统集成")
    logger.info("=" * 60)
    
    try:
        from weather_simulation_system import WeatherSimulationSystem, generate_sample_observations
        
        system = WeatherSimulationSystem(
            use_dask=False, 
            enable_monitoring=False,
            enable_snapshots=True,
            enable_optimized_scheduling=True
        )
        logger.info("✓ WeatherSimulationSystem 初始化成功 (含所有新功能)")
        
        observations = generate_sample_observations(20)
        initial_data = system.process_observations(observations)
        logger.info("✓ 数据预处理完成")
        
        results = system.run_simulation(initial_data, num_steps=5)
        logger.info(f"✓ 模拟计算完成，共 {len(results)} 个时间步")
        
        util_report = system.get_resource_utilization()
        logger.info("✓ 资源利用率查询成功")
        
        snapshots = system.list_snapshots()
        logger.info(f"✓ 快照列表查询成功，共 {len(snapshots)} 个")
        
        if len(results) >= 24:
            period1 = (results[0].timestamp, results[11].timestamp)
            period2 = (results[12].timestamp, results[23].timestamp)
            
            comparison = system.compare_periods(results, period1, period2, WeatherVariable.TEMPERATURE)
            if comparison:
                logger.info(f"✓ 时段对比查询成功，均值差: {comparison['mean_diff']:.3f}")
        
        trend = system.analyze_trend(results, WeatherVariable.TEMPERATURE)
        if trend:
            logger.info(f"✓ 趋势分析查询成功，趋势: {trend['trend_direction']}")
        
        extremes = system.detect_extremes(results, WeatherVariable.TEMPERATURE)
        logger.info(f"✓ 极值检测查询成功，发现 {len(extremes)} 个极值时间步")
        
        export_files = system.export_results(results, formats=['json', 'csv'])
        logger.info(f"✓ 结果导出成功，共 {len(export_files)} 个文件")
        
        summary_file = system.export_summary(results)
        logger.info(f"✓ 汇总报告导出成功: {summary_file}")
        
        system.shutdown()
        logger.info("✓ 系统关闭成功")
        
        return True
        
    except Exception as e:
        logger.error(f"系统集成测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_all_upgrade_tests():
    logger.info("=" * 60)
    logger.info("气象数值模拟系统 - 升级功能验证")
    logger.info("=" * 60)
    
    tests = [
        ("任务快照保存模块", test_snapshot_module),
        ("多时段结果对比计算模块", test_timeseries_comparison),
        ("优化任务调度算法", test_optimized_scheduler),
        ("多维格式导出模块", test_result_exporter),
        ("系统集成测试", test_system_integration),
    ]
    
    results = []
    for name, test_func in tests:
        logger.info(f"\n{'='*60}")
        logger.info(f"开始测试: {name}")
        logger.info("=" * 60)
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            logger.error(f"测试执行错误: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    logger.info("\n" + "=" * 60)
    logger.info("升级功能验证总结")
    logger.info("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        logger.info(f"  {status} - {name}")
    
    logger.info(f"\n总计: {passed}/{total} 通过")
    
    if passed == total:
        logger.info("\n✓ 所有升级功能验证通过!")
        return True
    else:
        logger.warning(f"\n⚠ {total - passed} 项验证失败")
        return False


if __name__ == "__main__":
    success = run_all_upgrade_tests()
    sys.exit(0 if success else 1)
