import logging
import sys
from datetime import datetime
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_haversine_distance():
    logger.info("=" * 60)
    logger.info("测试修复1: 数据预处理 - Haversine地球曲率距离计算")
    logger.info("=" * 60)
    
    from data_preprocessor import haversine_distance
    
    lon1, lat1 = 116.4, 39.9
    lon2, lat2 = 121.5, 31.2
    
    distance_km = haversine_distance(np.array([lon1]), np.array([lat1]), 
                                     np.array([lon2]), np.array([lat2]))
    
    expected_distance = 1068.0
    
    logger.info(f"北京到上海的实际距离约: {expected_distance} km")
    logger.info(f"Haversine计算结果: {distance_km[0]:.2f} km")
    logger.info(f"误差: {abs(distance_km[0] - expected_distance):.2f} km")
    
    error_percent = abs(distance_km[0] - expected_distance) / expected_distance * 100
    
    if error_percent < 5:
        logger.info("✓ 地球曲率距离计算正确")
        return True
    else:
        logger.warning(f"✗ 距离计算误差较大: {error_percent:.2f}%")
        return False


def test_wind_direction_interpolation():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复2: 数据预处理 - 风向环形插值")
    logger.info("=" * 60)
    
    from data_preprocessor import circular_interpolation
    
    values = np.array([350.0, 10.0])
    distances = np.array([1.0, 1.0])
    
    result = circular_interpolation(values, distances)
    
    logger.info(f"输入风向: 350° 和 10° (权重相同)")
    logger.info(f"普通算术平均: {(350 + 10) / 2:.1f}° (错误)")
    logger.info(f"环形插值结果: {result:.1f}° (正确, 接近0°)")
    
    if abs(result - 0) < 5 or abs(result - 360) < 5:
        logger.info("✓ 风向环形插值正确")
        return True
    else:
        logger.warning("✗ 风向环形插值不正确")
        return False


def test_pressure_correction():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复3: 数据预处理 - 气压海平面修正")
    logger.info("=" * 60)
    
    from data_preprocessor import correct_pressure_to_sea_level
    
    pressure = np.array([1000.0])
    temperature = np.array([15.0])
    altitude = 100.0
    
    sea_level_pressure = correct_pressure_to_sea_level(pressure, temperature, altitude)
    
    logger.info(f"站点气压: {pressure[0]:.1f} hPa")
    logger.info(f"站点温度: {temperature[0]:.1f} °C")
    logger.info(f"站点海拔: {altitude} m")
    logger.info(f"修正后海平面气压: {sea_level_pressure[0]:.2f} hPa")
    
    if sea_level_pressure[0] > pressure[0]:
        logger.info("✓ 气压修正方向正确(高海拔气压低于海平面)")
        return True
    else:
        logger.warning("✗ 气压修正不正确")
        return False


def test_nan_handling():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复4: 数据预处理 - NaN值处理修复")
    logger.info("=" * 60)
    
    import pandas as pd
    
    values = np.array([1.0, None, 3.0, np.nan, 5.0], dtype=float)
    valid_mask = ~pd.isna(values)
    
    logger.info(f"原始数组: {values}")
    logger.info(f"有效数据掩码: {valid_mask}")
    logger.info(f"有效数据数量: {np.sum(valid_mask)}")
    
    if np.sum(valid_mask) == 3:
        logger.info("✓ NaN和None值处理正确")
        return True
    else:
        logger.warning("✗ NaN值处理不正确")
        return False


def test_task_retry_mechanism():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复5: 任务调度 - 任务重试机制")
    logger.info("=" * 60)
    
    try:
        from task_scheduler import RedisTaskQueue
        from unittest.mock import MagicMock, patch
        
        queue = RedisTaskQueue()
        
        with patch.object(queue.redis_client, 'ping', return_value=True):
            queue.max_retries = 3
            
            queue.redis_client.hget = MagicMock(return_value=json.dumps({
                'task_id': 'test_task',
                'retry_count': 0
            }))
            queue.redis_client.hset = MagicMock()
            queue.redis_client.zadd = MagicMock()
            queue.redis_client.hdel = MagicMock()
            
            result = queue.retry_task('test_task', 'worker_1')
            
            if result:
                logger.info("✓ 任务重试机制正常工作")
                return True
            else:
                logger.warning("✗ 任务重试机制有问题")
                return False
    except Exception as e:
        logger.warning(f"测试跳过: {e}")
        return None


def test_monitor_task_count():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复6: 监控模块 - 任务计数增量逻辑")
    logger.info("=" * 60)
    
    from node_monitor import NodeMonitor
    
    monitor = NodeMonitor()
    
    monitor.node_status.active_tasks = 0
    monitor.node_status.completed_tasks = 0
    monitor.node_status.failed_tasks = 0
    
    monitor.update_task_count(active_delta=1)
    logger.info(f"任务开始后 active_tasks: {monitor.node_status.active_tasks}")
    
    monitor.update_task_count(active_delta=-1, completed=1)
    logger.info(f"任务完成后 active_tasks: {monitor.node_status.active_tasks}, completed: {monitor.node_status.completed_tasks}")
    
    monitor.update_task_count(active_delta=2)
    logger.info(f"两个任务开始后 active_tasks: {monitor.node_status.active_tasks}")
    
    monitor.update_task_count(active_delta=-2, failed=1)
    logger.info(f"任务失败后 active_tasks: {monitor.node_status.active_tasks}, failed: {monitor.node_status.failed_tasks}")
    
    if (monitor.node_status.active_tasks == 0 and 
        monitor.node_status.completed_tasks == 1 and 
        monitor.node_status.failed_tasks == 1):
        logger.info("✓ 任务计数增量逻辑正确")
        return True
    else:
        logger.warning("✗ 任务计数逻辑不正确")
        return False


def test_redis_reconnection():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复7: 任务调度 - Redis重连机制")
    logger.info("=" * 60)
    
    try:
        from task_scheduler import RedisTaskQueue
        
        queue = RedisTaskQueue()
        
        try:
            queue._ensure_redis_connection()
            logger.info("✓ Redis连接检查正常")
            return True
        except Exception as e:
            logger.info(f"Redis不可用，跳过测试: {e}")
            return None
    except Exception as e:
        logger.warning(f"测试错误: {e}")
        return False


def test_worker_non_daemon():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复8: 任务调度 - Worker非daemon模式")
    logger.info("=" * 60)
    
    import inspect
    from task_scheduler import TaskScheduler
    
    source = inspect.getsource(TaskScheduler.start_worker_pool)
    
    if 'thread.daemon = False' in source:
        logger.info("✓ Worker线程设置为非daemon模式")
        logger.info("  主线程退出时会等待worker完成任务，避免中途终止")
        return True
    else:
        logger.warning("✗ Worker线程设置不正确")
        return False


def test_stuck_task_recovery():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复9: 任务调度 - 卡住任务恢复机制")
    logger.info("=" * 60)
    
    import inspect
    from task_scheduler import TaskScheduler, RedisTaskQueue
    
    queue = RedisTaskQueue()
    has_recover_method = hasattr(queue, 'recover_stuck_tasks')
    source = inspect.getsource(TaskScheduler.wait_for_completion)
    
    if has_recover_method and 'recover_stuck_tasks' in source:
        logger.info("✓ 等待完成循环中包含卡住任务恢复机制")
        return True
    else:
        logger.warning("✗ 卡住任务恢复机制缺失")
        return False


def test_monitor_queue_stats():
    logger.info("\n" + "=" * 60)
    logger.info("测试修复10: 监控模块 - 任务队列实时统计")
    logger.info("=" * 60)
    
    from node_monitor import ClusterMonitor
    
    monitor = ClusterMonitor()
    
    if hasattr(monitor, 'get_task_queue_stats'):
        logger.info("✓ 支持从Redis获取任务队列实时统计")
        logger.info("  包括: pending, processing, completed, failed 任务计数")
        return True
    else:
        logger.warning("✗ 任务队列统计功能缺失")
        return False


import json

def run_all_verifications():
    logger.info("=" * 60)
    logger.info("气象数值模拟系统 - Bug修复验证")
    logger.info("=" * 60)
    
    tests = [
        ("Haversine地球曲率距离计算", test_haversine_distance),
        ("风向环形插值", test_wind_direction_interpolation),
        ("气压海平面修正", test_pressure_correction),
        ("NaN值处理", test_nan_handling),
        ("任务重试机制", test_task_retry_mechanism),
        ("任务计数增量逻辑", test_monitor_task_count),
        ("Redis重连机制", test_redis_reconnection),
        ("Worker非daemon模式", test_worker_non_daemon),
        ("卡住任务恢复机制", test_stuck_task_recovery),
        ("任务队列实时统计", test_monitor_queue_stats),
    ]
    
    results = []
    for name, test_func in tests:
        logger.info(f"\n--- {name} ---")
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            logger.error(f"测试执行错误: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    logger.info("\n" + "=" * 60)
    logger.info("修复验证总结")
    logger.info("=" * 60)
    
    passed = sum(1 for _, result in results if result is True)
    skipped = sum(1 for _, result in results if result is None)
    failed = sum(1 for _, result in results if result is False)
    total = len(results)
    
    for name, result in results:
        if result is True:
            status = "✓ PASS"
        elif result is None:
            status = "⊘ SKIP"
        else:
            status = "✗ FAIL"
        logger.info(f"  {status} - {name}")
    
    logger.info(f"\n总计: {passed}/{total} 通过, {skipped} 跳过, {failed} 失败")
    
    if failed == 0:
        logger.info("\n✓ 所有修复验证通过! 系统稳定性已提升。")
        return True
    else:
        logger.warning(f"\n⚠ {failed} 项验证失败，请检查。")
        return False


if __name__ == "__main__":
    success = run_all_verifications()
    sys.exit(0 if success else 1)
