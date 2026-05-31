import sys
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from data_preprocessing.pipeline import PreprocessingPipeline, load_hydrology_data
from seepage_calculation.engine import ComputationEngine
from visualization.plotter import HydrologyPlotter
from visualization.exporter import DataExporter


def generate_sample_hydrology_data(output_path: str):
    print("生成示例水文采样数据...")
    n_samples = 1000
    timestamps = [datetime(2024, 1, 1) + timedelta(hours=i) for i in range(n_samples)]
    well_ids = [f"W{str(i % 5 + 1).zfill(2)}" for i in range(n_samples)]

    base_levels = {"W01": 50.0, "W02": 48.5, "W03": 52.0, "W04": 47.0, "W05": 49.5}
    water_levels = []
    for i in range(n_samples):
        well = well_ids[i]
        seasonal = 2.0 * np.sin(2 * np.pi * i / 8760)
        noise = np.random.normal(0, 0.3)
        trend = -0.0001 * i
        water_levels.append(base_levels[well] + seasonal + noise + trend)

    df = pd.DataFrame({
        "timestamp": timestamps,
        "well_id": well_ids,
        "water_level": water_levels,
        "temperature": np.random.uniform(12.0, 18.0, n_samples),
        "conductivity": np.random.uniform(400.0, 800.0, n_samples),
    })

    df.to_csv(output_path, index=False)
    print(f"示例数据已保存到: {output_path}")
    return df


def demo_data_preprocessing():
    print("\n=== 数据预处理模块演示 ===")
    data_path = os.path.join(os.path.dirname(__file__), "sample_data.csv")
    df = generate_sample_hydrology_data(data_path)
    print(f"原始数据形状: {df.shape}")

    pipeline = PreprocessingPipeline(
        missing_strategy="interpolate",
        outlier_method="iqr",
        outlier_action="clip",
        normalization_method="minmax",
        normalization_columns=["water_level", "temperature", "conductivity"],
    )

    result_df = pipeline.fit_transform(df)
    print(f"预处理后数据形状: {result_df.shape}")
    print(f"归一化参数: {list(pipeline.norm_params.keys())}")
    print(f"处理步骤: {pipeline.get_pipeline_info()['steps']}")


def demo_seepage_calculation():
    print("\n=== 渗流场计算模块演示 ===")
    nx, ny = 50, 50
    k_field = np.ones((ny, nx)) * 1e-4
    k_field[20:30, 20:30] = 1e-5
    boundary_top = np.ones(nx) * 50.0
    boundary_bottom = np.ones(nx) * 45.0

    engine = ComputationEngine(use_matlab=False, nx=nx, ny=ny)

    print("计算稳态渗流...")
    steady_result = engine.compute_seepage_steady({
        "k_field": k_field,
        "boundary_top": boundary_top,
        "boundary_bottom": boundary_bottom,
        "recharge": 0.0,
    })
    h = steady_result["h"]
    print(f"稳态水头范围: [{h.min():.2f}, {h.max():.2f}]")
    print(f"计算后端: {steady_result['backend']}")

    print("计算水位演化（季节性）...")
    evolution_result = engine.compute_water_level_evolution({
        "h_initial": h,
        "mode": "seasonal",
        "amplitude": 2.0,
    })
    print(f"演化时间步数: {len(evolution_result['h_series'])}")

    engine.shutdown()
    return steady_result


def demo_visualization(steady_result):
    print("\n=== 可视化模块演示 ===")
    output_dir = os.path.join(os.path.dirname(__file__), "outputs")
    os.makedirs(output_dir, exist_ok=True)

    h = np.array(steady_result["h"])
    vx = np.array(steady_result["vx"])
    vy = np.array(steady_result["vy"])

    contour_fig = HydrologyPlotter.plot_head_contour(h, title="Steady State Water Head Contour")
    contour_path = os.path.join(output_dir, "head_contour.png")
    contour_fig.savefig(contour_path, dpi=150)
    print(f"水头等值线图: {contour_path}")

    velocity_fig = HydrologyPlotter.plot_velocity_field(h, vx, vy, title="Seepage Velocity Field")
    velocity_path = os.path.join(output_dir, "velocity_field.png")
    velocity_fig.savefig(velocity_path, dpi=150)
    print(f"速度场图: {velocity_path}")

    export_paths = DataExporter.export_simulation_report(
        steady_result, output_dir, "demo_task", format="all"
    )
    print(f"导出文件: {list(export_paths.keys())}")


def demo_monitoring():
    print("\n=== 监控模块演示 ===")
    from monitoring.node_monitor import NodeMonitor

    monitor = NodeMonitor(node_id="demo-node", heartbeat_interval=5)
    print(f"Node ID: {monitor.node_id}")
    print("Collecting metrics...")

    metrics = monitor.collect_metrics()
    print(f"Platform: {metrics.get('platform')}")
    print(f"CPU: {metrics.get('cpu', {}).get('percent')}%")
    print(f"Memory: {metrics.get('memory', {}).get('used_percent')}%")
    print(f"Disk: {metrics.get('disk', {}).get('used_percent')}%")
    print(f"Temperature sensors: {list(metrics.get('temperature', {}).keys())}")
    print(f"Avg temperature: {monitor.get_average_temperature()}")
    print(f"Load avg: {metrics.get('load_avg')}")

    health = monitor.get_health_report()
    print(f"Health status: {'HEALTHY' if health['healthy'] else 'UNHEALTHY'}")
    if health['issues']:
        print(f"Issues: {health['issues']}")


if __name__ == "__main__":
    print("地下水文演化模拟计算系统 - 模块演示")
    print("=" * 50)

    demo_data_preprocessing()
    steady_result = demo_seepage_calculation()
    demo_visualization(steady_result)
    demo_monitoring()

    print("\n" + "=" * 50)
    print("演示完成!")
