import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from datetime import datetime

from data_cleaning import cleaner
from aggregation import aggregator
from aggregation.anomaly_trend import TrendAnalyzer
from aggregation.drill_down import DrillDownAnalyzer, DrillDownDimension, DrillDownLevel
from reports import report_generator
from utils.mock_data import mock_data_generator


def test_data_generation():
    print("=" * 50)
    print("测试1: 生成模拟数据")
    print("=" * 50)
    
    df = mock_data_generator.generate_metrics_data(hours=24, interval_minutes=30)
    print(f"生成数据量: {len(df)} 条")
    print(f"设备数量: {df['device_id'].nunique()}")
    print(f"指标数量: {df['metric_name'].nunique()}")
    print(f"时间范围: {df['collect_time'].min()} ~ {df['collect_time'].max()}")
    print(f"\n数据样例:")
    print(df[['device_id', 'metric_name', 'metric_value', 'collect_time']].head())
    return df


def test_data_cleaning(df):
    print("\n" + "=" * 50)
    print("测试2: 数据清洗")
    print("=" * 50)
    
    cleaned_df = cleaner.clean_data(df)
    
    print(f"原始数据: {len(df)} 条")
    print(f"清洗后数据: {len(cleaned_df)} 条")
    print(f"异常数据: {cleaned_df['is_outlier'].sum()} 条")
    print(f"\n清洗后数据样例:")
    print(cleaned_df[['device_id', 'metric_name', 'metric_value', 'cleaned_value', 'is_outlier']].head(10))
    
    quality_report = cleaner.get_data_quality_report(cleaned_df)
    print(f"\n数据质量报告:")
    print(f"  - 总记录数: {quality_report['total_records']}")
    print(f"  - 缺失值: {quality_report['missing_values']}")
    print(f"  - 异常值: {quality_report['outliers']}")
    
    return cleaned_df


def test_aggregation(cleaned_df):
    print("\n" + "=" * 50)
    print("测试3: 指标聚合计算")
    print("=" * 50)
    
    aggregated_df = aggregator.aggregate_metrics(cleaned_df, period='hour')
    
    print(f"清洗后数据: {len(cleaned_df)} 条")
    print(f"聚合后数据: {len(aggregated_df)} 条")
    print(f"\n聚合数据样例:")
    print(aggregated_df[['device_id', 'metric_name', 'agg_time', 'avg_value', 'max_value', 'min_value', 'is_anomaly']].head(10))
    
    dashboard_stats = aggregator.get_dashboard_stats(aggregated_df)
    print(f"\n仪表盘统计:")
    print(f"  - 总异常数: {dashboard_stats['total_anomalies']}")
    print(f"  - 异常率: {dashboard_stats['anomaly_rate']:.2f}%")
    print(f"  - 平均异常评分: {dashboard_stats['avg_anomaly_score']:.2f}")
    
    device_summary = aggregator.get_device_summary(cleaned_df)
    print(f"\n设备汇总:")
    print(f"  - 总设备数: {device_summary['total_devices']}")
    print(f"  - 总指标数: {device_summary['total_metrics']}")
    
    return aggregated_df


def test_report_generation(cleaned_df):
    print("\n" + "=" * 50)
    print("测试4: 报表生成")
    print("=" * 50)
    
    device_summary_report = report_generator.generate_report(
        cleaned_df,
        'device_summary',
        {'devices': cleaned_df['device_id'].unique().tolist()[:3]}
    )
    print(f"设备汇总报表生成成功")
    print(f"  - 报表类型: {device_summary_report['report_type']}")
    print(f"  - 生成时间: {device_summary_report['generated_at']}")
    print(f"  - 设备数量: {len(device_summary_report['summary_data'])}")
    
    anomaly_report = report_generator.generate_report(cleaned_df, 'anomaly_report', {})
    print(f"\n异常分析报表生成成功")
    print(f"  - 总异常数: {anomaly_report['total_anomalies']}")
    print(f"  - 异常设备分布: {anomaly_report['anomalies_by_device']}")
    
    return device_summary_report, anomaly_report


def test_trend_analysis(cleaned_df):
    print("\n" + "=" * 50)
    print("测试5: 指标异动趋势分析")
    print("=" * 50)
    
    analyzer = TrendAnalyzer()
    
    device_metric_df = cleaned_df[
        (cleaned_df['device_id'] == 'DEV001') & 
        (cleaned_df['metric_name'] == 'temperature')
    ].copy()
    
    device_metric_df = device_metric_df.sort_values('collect_time')
    
    print(f"分析数据量: {len(device_metric_df)} 条")
    print(f"时间范围: {device_metric_df['collect_time'].min()} ~ {device_metric_df['collect_time'].max()}")
    
    trend_result = analyzer.analyze_trend_changes(
        device_metric_df, 
        value_col='cleaned_value', 
        time_col='collect_time',
        window=3,
        threshold=1.5
    )
    
    print(f"\n趋势分段: {len(trend_result.get('trend_segments', []))} 段")
    for i, seg in enumerate(trend_result.get('trend_segments', [])[:5]):
        print(f"  段{i+1}: {seg['trend_direction']}, 斜率={seg['slope']:.4f}, 数据点={seg['data_points']}")
    
    overall = trend_result.get('overall_trend', {})
    print(f"\n总体趋势:")
    print(f"  - 方向: {overall.get('direction', 'N/A')}")
    print(f"  - 斜率: {overall.get('slope', 0):.4f}")
    print(f"  - 总变化率: {overall.get('total_change_percent', 0):.2f}%")
    print(f"  - 突变点数: {len(trend_result.get('change_points', []))}")
    
    abnormal_result = analyzer.detect_abnormal_trend(
        device_metric_df,
        value_col='cleaned_value',
        time_col='collect_time',
        lookback_periods=12,
        alert_threshold=1.5
    )
    
    print(f"\n异常趋势检测:")
    print(f"  - 是否异常: {abnormal_result.get('is_abnormal', False)}")
    print(f"  - 告警数量: {abnormal_result.get('alert_count', 0)}")
    baseline = abnormal_result.get('baseline', {})
    print(f"  - 基线均值: {baseline.get('mean', 0):.2f}")
    print(f"  - 基线标准差: {baseline.get('std', 0):.4f}")
    for alert in abnormal_result.get('alerts', [])[:3]:
        print(f"  - 告警: {alert.get('alert_type')} at {alert.get('time')[:19]}, 偏差={alert.get('deviation_percent', 0):.2f}%")
    
    metric_anomaly = analyzer.analyze_metric_anomaly(
        device_metric_df,
        value_col='cleaned_value',
        time_col='collect_time'
    )
    
    print(f"\n指标异常综合分析:")
    print(f"  - 异常评分: {metric_anomaly.get('anomaly_score', 0):.2f}")
    print(f"  - 风险等级: {metric_anomaly.get('risk_level', 'normal')}")
    details = metric_anomaly.get('details', {})
    print(f"  - 异常值比例: {details.get('outlier_ratio', 0):.4f}")
    print(f"  - 趋势斜率: {details.get('trend_slope', 0):.4f}")
    print(f"  - 波动率: {details.get('volatility', 0):.4f}")
    
    return trend_result, abnormal_result, metric_anomaly


def test_drill_down(cleaned_df):
    print("\n" + "=" * 50)
    print("测试6: 多级数据下钻查询")
    print("=" * 50)
    
    analyzer = DrillDownAnalyzer()
    
    print("\n6.1 时间维度下钻:")
    time_result = analyzer.drill_down(
        cleaned_df,
        dimension=DrillDownDimension.TIME,
        current_level=DrillDownLevel.DAY
    )
    
    drill_path = time_result.get('drill_path', [])
    path_str = ' -> '.join([f"{p.get('dimension', '')}:{p.get('level', '')}" for p in drill_path])
    
    print(f"  当前级别: {time_result.get('level')}")
    print(f"  下钻路径: {path_str or '(根级别)'}")
    print(f"  可下钻: {time_result.get('can_drill_down', False)}")
    print(f"  可上钻: {time_result.get('can_drill_up', False)}")
    print(f"  数据汇总数: {len(time_result.get('data', []))}")
    
    if time_result.get('data'):
        for item in time_result['data'][:3]:
            print(f"    - {item.get('time_period')}: 记录数={item.get('record_count')}, 均值={item.get('avg_value', 0):.2f}")
    
    print("\n6.2 设备维度下钻:")
    device_result = analyzer.drill_down(
        cleaned_df,
        dimension=DrillDownDimension.DEVICE,
        filters={'locations': ['北京']}
    )
    
    drill_path = device_result.get('drill_path', [])
    path_str = ' -> '.join([f"{p.get('dimension', '')}:{p.get('level', '')}" for p in drill_path])
    
    print(f"  当前级别: {device_result.get('level')}")
    print(f"  下钻路径: {path_str or '(根级别)'}")
    print(f"  设备数量: {len(device_result.get('data', []))}")
    
    if device_result.get('data'):
        for item in device_result['data'][:3]:
            print(f"    - {item.get('group_name')}: 异常率={item.get('anomaly_rate', 0):.2f}%")
    
    print("\n6.3 指标维度下钻:")
    metric_result = analyzer.drill_down(
        cleaned_df,
        dimension=DrillDownDimension.METRIC
    )
    
    print(f"  当前级别: {metric_result.get('level')}")
    print(f"  指标数量: {len(metric_result.get('data', []))}")
    
    if metric_result.get('data'):
        for item in metric_result['data'][:5]:
            print(f"    - {item.get('group_name')}: 均值={item.get('avg_value', 0):.2f}, 异常={item.get('anomaly_count', 0)}")
    
    return time_result, device_result, metric_result


def test_dirty_data_filtering():
    print("\n" + "=" * 50)
    print("测试7: 不规则脏数据过滤")
    print("=" * 50)
    
    df = mock_data_generator.generate_metrics_data(hours=12, interval_minutes=30)
    
    import numpy as np
    dirty_rows = []
    for i in range(20):
        dirty_rows.append({
            'device_id': f'INVALID_{i}' if i % 3 == 0 else f'DEV{i:03d}',
            'metric_name': f'unknown_metric_{i}' if i % 4 == 0 else 'temperature',
            'metric_value': np.nan if i % 5 == 0 else 999999,
            'collect_time': pd.Timestamp.now() + pd.Timedelta(days=365) if i % 6 == 0 else pd.Timestamp.now(),
            'unit': 'C',
            'device_name': 'Test',
            'location': '北京',
            'device_type': 'sensor'
        })
    
    dirty_df = pd.concat([df, pd.DataFrame(dirty_rows)], ignore_index=True)
    print(f"原始数据: {len(df)} 条, 注入脏数据: {len(dirty_rows)} 条, 总计: {len(dirty_df)} 条")
    
    cleaned_df = cleaner.clean_data(dirty_df)
    
    print(f"清洗后数据: {len(cleaned_df)} 条")
    print(f"过滤脏数据: {len(dirty_df) - len(cleaned_df)} 条")
    
    quality_report = cleaner.get_data_quality_report(cleaned_df)
    print(f"\n数据质量评分: {quality_report.get('data_quality_score', 0):.2f}/100")
    print(f"总记录数: {quality_report.get('total_records', 0)}")
    print(f"缺失值: {quality_report.get('missing_values', 0)}")
    print(f"异常值: {quality_report.get('outliers', 0)}")
    print(f"过滤记录: {quality_report.get('total_filtered', 0)}")
    
    if quality_report.get('filtered_records'):
        print(f"\n过滤原因统计:")
        for reason, count in quality_report['filtered_records'].items():
            print(f"  - {reason}: {count} 条")
    
    return quality_report


def main():
    print("\n" + "#" * 60)
    print("# 设备运维指标分析平台 - 后端功能测试")
    print("#" * 60)
    
    try:
        df = test_data_generation()
        
        cleaned_df = test_data_cleaning(df)
        
        aggregated_df = test_aggregation(cleaned_df)
        
        test_report_generation(cleaned_df)
        
        test_trend_analysis(cleaned_df)
        
        test_drill_down(cleaned_df)
        
        test_dirty_data_filtering()
        
        print("\n" + "=" * 50)
        print("所有测试通过!")
        print("=" * 50)
        
    except Exception as e:
        print(f"\n测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
