import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta
import numpy as np
import pandas as pd

from turbulence_interp import (
    load_config,
    ObservationDataParser,
    ParallelProcessor,
    SpatiotemporalInterpolator,
    TaskScheduler,
    Task,
    ResultExporter,
)

from turbulence_interp.main import generate_sample_data


def example_data_parsing():
    print("=" * 60)
    print("示例1: 数据解析与验证")
    print("=" * 60)
    
    sample_file = "./sample_data.csv"
    if not os.path.exists(sample_file):
        generate_sample_data(sample_file, num_stations=10, num_times=24)
    
    parser = ObservationDataParser()
    dataset = parser.parse(sample_file)
    
    print(f"解析完成，共 {len(dataset.records)} 条记录")
    print(f"站点数量: {len(dataset.stations)}")
    print(f"时间范围: {dataset.timestamps.min()} 到 {dataset.timestamps.max()}")
    print(f"变量: {dataset.variables}")
    
    validation = parser.validate()
    print(f"\n数据验证:")
    print(f"  总记录数: {validation['total_records']}")
    print(f"  空间范围: {validation['spatial_range']}")
    for var, stats in validation['missing_values'].items():
        print(f"  {var}: 缺失 {stats['count']} ({stats['percentage']:.2f}%)")
    
    cleaned = parser.clean(
        remove_outliers=True, 
        fill_missing=True,
        use_physical_range=True,
        use_quality_flag=True,
        use_iqr=True,
        per_station=True,
    )
    print(f"\n数据清理完成")
    
    df = cleaned.to_dataframe()
    print(f"DataFrame 形状: {df.shape}")
    print(df.head())
    
    return df


def example_parallel_computation():
    print("\n" + "=" * 60)
    print("示例2: 并行计算")
    print("=" * 60)
    
    def process_chunk(chunk):
        result = np.mean(chunk) + np.std(chunk)
        return result
    
    data = np.random.rand(10000)
    
    print(f"可用后端: {ParallelProcessor.available_backends()}")
    
    with ParallelProcessor(max_workers=4, backend="concurrent") as processor:
        chunks = np.array_split(data, 10)
        tasks = [(chunk,) for chunk in chunks]
        
        results = processor.map(process_chunk, tasks)
        
        success_count = sum(1 for r in results if r.success)
        print(f"成功执行 {success_count}/{len(results)} 个任务")
        
        for i, result in enumerate(results):
            if result.success:
                print(f"  任务 {i}: 结果={result.result:.4f}, 耗时={result.execution_time:.4f}s")


def example_spatial_interpolation():
    print("\n" + "=" * 60)
    print("示例3: 空间插值")
    print("=" * 60)
    
    np.random.seed(42)
    n_points = 50
    lons = 110.0 + np.random.uniform(-2, 2, n_points)
    lats = 30.0 + np.random.uniform(-2, 2, n_points)
    values = 0.5 + 0.3 * np.sin(lons / 10) * np.cos(lats / 10) + np.random.normal(0, 0.1, n_points)
    
    df = pd.DataFrame({
        "longitude": lons,
        "latitude": lats,
        "turbulence_intensity": values,
    })
    
    print(f"可用空间插值方法: {SpatiotemporalInterpolator.available_spatial_methods()}")
    print(f"可用降噪方法: {SpatiotemporalInterpolator.available_noise_methods()}")
    
    interpolator = SpatiotemporalInterpolator(
        spatial_method="idw",
        noise_reduction="gaussian",
        grid_resolution=0.2,
        power=2.0,
    )
    
    result = interpolator.interpolate_spatial(
        df,
        "turbulence_intensity",
        lon_range=(108.0, 112.0),
        lat_range=(28.0, 32.0),
    )
    
    print(f"插值结果数据集:")
    print(result.dataset)
    print(f"\n插值方法: {result.method}")
    print(f"网格大小: {result.dataset['turbulence_intensity'].shape}")
    
    return result


def example_spatiotemporal_interpolation():
    print("\n" + "=" * 60)
    print("示例4: 时空插值")
    print("=" * 60)
    
    sample_file = "./sample_data.csv"
    if not os.path.exists(sample_file):
        generate_sample_data(sample_file, num_stations=15, num_times=12)
    
    parser = ObservationDataParser()
    dataset = parser.parse(sample_file)
    df = dataset.to_dataframe()
    
    interpolator = SpatiotemporalInterpolator(
        spatial_method="idw",
        temporal_method="linear",
        grid_resolution=0.5,
    )
    
    target_times = pd.date_range(
        start=df["timestamp"].min(),
        end=df["timestamp"].max(),
        freq="2H"
    )
    
    print(f"时间步长: {len(target_times)}")
    print(f"目标时间范围: {target_times.min()} 到 {target_times.max()}")
    
    with ParallelProcessor(max_workers=2) as processor:
        result = interpolator.interpolate_spatiotemporal(
            df,
            "turbulence_intensity",
            lon_range=(df["longitude"].min(), df["longitude"].max()),
            lat_range=(df["latitude"].min(), df["latitude"].max()),
            target_times=target_times,
            parallel_processor=processor,
        )
    
    print(f"时空插值结果:")
    print(result.dataset)
    print(f"\n数据形状: {result.dataset['turbulence_intensity'].shape}")
    
    return result


def example_task_scheduling():
    print("\n" + "=" * 60)
    print("示例5: 任务调度")
    print("=" * 60)
    
    def compute_task(x, y):
        import time
        time.sleep(0.5)
        return x * y + x + y
    
    scheduler = TaskScheduler()
    
    tasks = []
    for i in range(5):
        task = Task(
            task_id=f"task_{i}",
            name=f"Computation_{i}",
            func=compute_task,
            args=(i, i + 1),
            priority=5 - i,
        )
        tasks.append(task)
    
    task_ids = scheduler.submit_batch(tasks)
    print(f"已提交 {len(task_ids)} 个任务")
    
    completed = scheduler.wait_all(timeout=10.0)
    print(f"已完成 {len(completed)} 个任务")
    
    for task in scheduler.list_tasks():
        result = scheduler.get_result(task.task_id)
        status = scheduler.get_status(task.task_id)
        print(f"  {task.task_id}: {status.value}, 结果={result.result if result else None}")
    
    scheduler.shutdown()


def example_result_export():
    print("\n" + "=" * 60)
    print("示例6: 结果导出")
    print("=" * 60)
    
    result = example_spatial_interpolation()
    
    exporter = ResultExporter()
    print(f"支持的导出格式: {ResultExporter.supported_formats()}")
    
    os.makedirs("./output", exist_ok=True)
    
    nc_path = exporter.export(result.dataset, "./output/result", format="netcdf")
    print(f"NetCDF 导出: {nc_path}")
    
    csv_path = exporter.export(result.dataset, "./output/result", format="csv")
    print(f"CSV 导出: {csv_path}")
    
    json_path = exporter.export(result.dataset, "./output/result", format="json")
    print(f"JSON 导出: {json_path}")
    
    return [nc_path, csv_path, json_path]


def example_full_pipeline():
    print("\n" + "=" * 60)
    print("示例7: 完整流程")
    print("=" * 60)
    
    from turbulence_interp.main import TurbulenceInterpolationPipeline
    
    sample_file = "./sample_data.csv"
    if not os.path.exists(sample_file):
        generate_sample_data(sample_file, num_stations=20, num_times=24)
    
    config = load_config()
    
    with TurbulenceInterpolationPipeline(config=config) as pipeline:
        output_paths = pipeline.run(
            input_path=sample_file,
            output_dir="./pipeline_output",
            variables=["turbulence_intensity", "wind_speed"],
            use_parallel=True,
        )
        
        print(f"\n完整流程完成！输出文件:")
        for path in output_paths:
            print(f"  - {path}")


if __name__ == "__main__":
    print("大气湍流观测数据时空插值并行计算套件 - 示例程序\n")
    
    try:
        example_data_parsing()
        example_parallel_computation()
        example_spatial_interpolation()
        example_spatiotemporal_interpolation()
        example_task_scheduling()
        example_result_export()
        example_full_pipeline()
        
        print("\n" + "=" * 60)
        print("所有示例执行完成！")
        print("=" * 60)
    except Exception as e:
        print(f"执行出错: {e}")
        import traceback
        traceback.print_exc()
