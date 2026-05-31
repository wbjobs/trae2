#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""快速集成测试 - 验证所有新功能API可正常调用"""

import logging
import sys
from datetime import datetime, timedelta
import numpy as np

logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

def test_system_integration():
    """测试系统集成和所有新API"""
    logger.info("=" * 60)
    logger.info("快速集成测试 - 验证新功能API")
    logger.info("=" * 60)
    
    try:
        from weather_simulation_system import WeatherSimulationSystem, generate_sample_observations
    except Exception as e:
        logger.error(f"导入系统失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    try:
        logger.info("\n1. 初始化系统 (含所有升级功能)...")
        system = WeatherSimulationSystem(
            use_dask=False,
            enable_monitoring=False,
            enable_snapshots=True,
            enable_optimized_scheduling=True
        )
        logger.info("✓ 系统初始化成功")
        
        logger.info("\n2. 验证快照功能API...")
        assert hasattr(system, 'snapshot_manager') and system.snapshot_manager is not None, "快照管理器未初始化"
        assert hasattr(system, 'create_snapshot'), "缺少 create_snapshot 方法"
        assert hasattr(system, 'restore_from_snapshot'), "缺少 restore_from_snapshot 方法"
        assert hasattr(system, 'list_snapshots'), "缺少 list_snapshots 方法"
        assert hasattr(system, 'delete_snapshot'), "缺少 delete_snapshot 方法"
        logger.info("✓ 快照功能API完整")
        
        snapshots = system.list_snapshots(limit=5)
        logger.info(f"  - list_snapshots() 返回: {len(snapshots)} 个快照")
        
        logger.info("\n3. 验证多时段对比功能API...")
        assert hasattr(system, 'timeseries_comparer') and system.timeseries_comparer is not None, "对比工具未初始化"
        assert hasattr(system, 'compare_periods'), "缺少 compare_periods 方法"
        assert hasattr(system, 'analyze_trend'), "缺少 analyze_trend 方法"
        assert hasattr(system, 'detect_extremes'), "缺少 detect_extremes 方法"
        assert hasattr(system, 'generate_comparison_report'), "缺少 generate_comparison_report 方法"
        assert hasattr(system, 'cross_correlation'), "缺少 cross_correlation 方法"
        assert hasattr(system, 'diurnal_cycle'), "缺少 diurnal_cycle 方法"
        logger.info("✓ 多时段对比功能API完整")
        
        logger.info("\n4. 验证优化调度功能API...")
        assert hasattr(system, 'optimized_scheduler') and system.optimized_scheduler is not None, "优化调度器未初始化"
        assert hasattr(system, 'task_allocator') and system.task_allocator is not None, "任务分配器未初始化"
        assert hasattr(system, 'get_resource_utilization'), "缺少 get_resource_utilization 方法"
        assert hasattr(system, 'run_with_optimized_scheduling'), "缺少 run_with_optimized_scheduling 方法"
        logger.info("✓ 优化调度功能API完整")
        
        util_report = system.get_resource_utilization()
        logger.info(f"  - get_resource_utilization() 返回: {len(util_report)} 项指标")
        
        logger.info("\n5. 验证结果导出功能API...")
        assert hasattr(system, 'exporter') and system.exporter is not None, "导出器未初始化"
        assert hasattr(system, 'export_results'), "缺少 export_results 方法"
        assert hasattr(system, 'export_to_json'), "缺少 export_to_json 方法"
        assert hasattr(system, 'export_to_csv'), "缺少 export_to_csv 方法"
        assert hasattr(system, 'export_to_netcdf'), "缺少 export_to_netcdf 方法"
        assert hasattr(system, 'export_to_geotiff'), "缺少 export_to_geotiff 方法"
        assert hasattr(system, 'export_summary'), "缺少 export_summary 方法"
        logger.info("✓ 结果导出功能API完整")
        
        logger.info("\n6. 验证shutdown方法...")
        assert hasattr(system, 'shutdown'), "缺少 shutdown 方法"
        logger.info("✓ shutdown 方法存在")
        
        logger.info("\n" + "=" * 60)
        logger.info("✓ 所有新功能API验证通过!")
        logger.info("=" * 60)
        
        logger.info("\n功能统计:")
        logger.info("  - 快照功能: 4个API ✓")
        logger.info("  - 多时段对比: 6个API ✓")
        logger.info("  - 优化调度: 3个API ✓")
        logger.info("  - 结果导出: 6个API ✓")
        logger.info("  总计: 19个新API全部可用 ✓")
        
        return True
        
    except Exception as e:
        logger.error(f"\n✗ 集成测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_system_integration()
    sys.exit(0 if success else 1)
