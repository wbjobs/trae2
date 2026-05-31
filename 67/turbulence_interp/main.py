import os
import sys
import logging
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import numpy as np
import pandas as pd

from .config import load_config, Config
from .data_parser import ObservationDataParser, ParsedDataset
from .parallel_kernel import ParallelProcessor, ParallelConfig
from .spatiotemporal_interpolator import SpatiotemporalInterpolator, InterpolationConfig, InterpolationResult
from .task_scheduler import TaskScheduler, Task
from .result_exporter import ResultExporter, ExportConfig

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class TurbulenceInterpolationPipeline:
    def __init__(self, config: Optional[Config] = None, config_path: Optional[str] = None):
        self.config = config or load_config(config_path)
        
        self.data_parser = ObservationDataParser()
        self.parallel_processor = ParallelProcessor(
            ParallelConfig(
                max_workers=self.config.system.max_workers,
                backend=self.config.parallel.backend,
                chunk_size=self.config.parallel.chunk_size,
            )
        )
        self.interpolator = SpatiotemporalInterpolator(
            InterpolationConfig(
                spatial_method=self.config.interpolation.spatial_method,
                temporal_method=self.config.interpolation.temporal_method,
                noise_reduction=self.config.interpolation.noise_reduction,
                grid_resolution=self.config.interpolation.grid_resolution,
                search_radius=self.config.interpolation.search_radius,
            )
        )
        self.task_scheduler = TaskScheduler()
        self.result_exporter = ResultExporter(
            ExportConfig(
                format=self.config.output.format,
                compression=self.config.output.compression,
                compression_level=self.config.output.compression_level,
                include_metadata=self.config.output.include_metadata,
            )
        )

    def run(self, input_path: str, output_dir: str,
            variables: Optional[List[str]] = None,
            lon_range: Optional[tuple] = None,
            lat_range: Optional[tuple] = None,
            time_range: Optional[tuple] = None,
            resolution: Optional[float] = None,
            use_parallel: bool = True) -> List[Path]:
        logger.info("Starting turbulence interpolation pipeline...")
        
        parsed_data = self.data_parser.parse(input_path)
        logger.info(f"Loaded {len(parsed_data.records)} records")
        
        validation = self.data_parser.validate()
        logger.info(f"Data validation: {validation}")
        
        cleaned_data = self.data_parser.clean(
            remove_outliers=True,
            fill_missing=True,
            z_threshold=3.0,
            use_physical_range=True,
            use_quality_flag=True,
            use_iqr=True,
            per_station=True,
        )
        logger.info("Data cleaning completed")
        
        df = cleaned_data.to_dataframe()
        
        if variables is None:
            variables = cleaned_data.variables
        
        if lon_range is None:
            lon_range = (df["longitude"].min(), df["longitude"].max())
        if lat_range is None:
            lat_range = (df["latitude"].min(), df["latitude"].max())
        if time_range is None:
            time_range = (df["timestamp"].min(), df["timestamp"].max())
        
        target_times = pd.date_range(
            start=time_range[0],
            end=time_range[1],
            freq="1h"
        )
        
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        output_paths = []
        
        for variable in variables:
            logger.info(f"Processing variable: {variable}")
            
            if use_parallel:
                result = self.interpolator.interpolate_spatiotemporal(
                    df, variable,
                    lon_range=lon_range,
                    lat_range=lat_range,
                    target_times=target_times,
                    resolution=resolution,
                    parallel_processor=self.parallel_processor,
                )
            else:
                result = self.interpolator.interpolate_spatiotemporal(
                    df, variable,
                    lon_range=lon_range,
                    lat_range=lat_range,
                    target_times=target_times,
                    resolution=resolution,
                )
            
            result.dataset.attrs.update({
                "source": input_path,
                "variable": variable,
                "interpolation_method": result.method,
                "created_at": datetime.now().isoformat(),
            })
            
            output_path = self.result_exporter.export(
                result.dataset,
                output_dir / f"turbulence_{variable}",
            )
            output_paths.append(output_path)
            logger.info(f"Exported {variable} to {output_path}")
        
        logger.info("Pipeline completed successfully")
        return output_paths

    def run_batch(self, input_dir: str, output_dir: str,
                  pattern: str = "*.csv", **kwargs) -> List[Path]:
        parser = ObservationDataParser()
        parsed_data = parser.parse_directory(input_dir, pattern=pattern)
        
        temp_path = Path(output_dir) / "combined_data.csv"
        parsed_data.to_dataframe().to_csv(temp_path, index=False)
        
        return self.run(str(temp_path), output_dir, **kwargs)

    def submit_to_cluster(self, input_path: str, output_dir: str,
                          cluster_config: Optional[Dict[str, Any]] = None, **kwargs) -> str:
        from .task_scheduler import SlurmExecutor
        
        cluster_cfg = cluster_config or self.config.cluster
        
        slurm_executor = SlurmExecutor(
            host=cluster_cfg.host,
            username=cluster_cfg.username,
            port=cluster_cfg.port,
            remote_workdir=cluster_cfg.remote_workdir,
            partition=cluster_cfg.partition,
            nodes=cluster_cfg.nodes,
            tasks_per_node=cluster_cfg.tasks_per_node,
        )
        
        self.task_scheduler.add_executor("slurm", slurm_executor)
        self.task_scheduler.set_default_executor("slurm")
        
        def remote_task(input_path, output_dir, kwargs):
            from turbulence_interp import TurbulenceInterpolationPipeline
            pipeline = TurbulenceInterpolationPipeline()
            return pipeline.run(input_path, output_dir, **kwargs)
        
        task = Task(
            task_id=f"turbulence_job_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            name="turbulence_interpolation",
            func=remote_task,
            args=(input_path, output_dir),
            kwargs=kwargs,
        )
        
        task_id = self.task_scheduler.submit(task, executor="slurm")
        logger.info(f"Submitted job to cluster: {task_id}")
        
        return task_id

    def shutdown(self):
        self.parallel_processor.shutdown()
        self.task_scheduler.shutdown()
        logger.info("Pipeline shut down")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
        return False


def generate_sample_data(output_path: str, num_stations: int = 20, num_times: int = 48):
    np.random.seed(42)
    
    stations = []
    for i in range(num_stations):
        stations.append({
            "station_id": f"STN{i:03d}",
            "latitude": 30.0 + np.random.uniform(-5, 5),
            "longitude": 110.0 + np.random.uniform(-5, 5),
            "altitude": np.random.uniform(0, 2000),
        })
    
    start_time = datetime(2024, 1, 1)
    times = [start_time + timedelta(hours=i) for i in range(num_times)]
    
    records = []
    for stn in stations:
        for t in times:
            base_turb = 0.5 + 0.3 * np.sin(2 * np.pi * t.hour / 24)
            noise = np.random.normal(0, 0.1)
            
            records.append({
                "station_id": stn["station_id"],
                "latitude": stn["latitude"],
                "longitude": stn["longitude"],
                "altitude": stn["altitude"],
                "timestamp": t.isoformat(),
                "turbulence_intensity": max(0.1, base_turb + noise),
                "wind_speed": 5.0 + 3.0 * np.random.random(),
                "temperature": 15.0 + 10.0 * np.sin(2 * np.pi * (t.timetuple().tm_yday) / 365),
                "quality_flag": np.random.choice([0, 1], p=[0.9, 0.1]),
            })
    
    df = pd.DataFrame(records)
    df.to_csv(output_path, index=False)
    logger.info(f"Generated sample data with {len(df)} records at {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="大气湍流观测数据时空插值并行计算套件"
    )
    parser.add_argument(
        "--input", "-i",
        type=str,
        help="输入数据文件路径",
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="./output",
        help="输出目录路径",
    )
    parser.add_argument(
        "--config", "-c",
        type=str,
        help="配置文件路径",
    )
    parser.add_argument(
        "--variables", "-v",
        nargs="+",
        help="要处理的变量列表",
    )
    parser.add_argument(
        "--resolution", "-r",
        type=float,
        help="网格分辨率（度）",
    )
    parser.add_argument(
        "--lon-range",
        nargs=2,
        type=float,
        help="经度范围 (min max)",
    )
    parser.add_argument(
        "--lat-range",
        nargs=2,
        type=float,
        help="纬度范围 (min max)",
    )
    parser.add_argument(
        "--no-parallel",
        action="store_true",
        help="禁用并行计算",
    )
    parser.add_argument(
        "--generate-sample",
        action="store_true",
        help="生成示例数据",
    )
    parser.add_argument(
        "--cluster",
        action="store_true",
        help="提交到集群运行",
    )
    
    args = parser.parse_args()
    
    if args.generate_sample:
        sample_path = args.input or "./sample_data.csv"
        generate_sample_data(sample_path)
        print(f"示例数据已生成: {sample_path}")
        return 0
    
    if not args.input:
        parser.error("--input 参数是必需的（除非使用 --generate-sample）")
    
    with TurbulenceInterpolationPipeline(config_path=args.config) as pipeline:
        if args.cluster:
            task_id = pipeline.submit_to_cluster(
                args.input,
                args.output,
                variables=args.variables,
                lon_range=tuple(args.lon_range) if args.lon_range else None,
                lat_range=tuple(args.lat_range) if args.lat_range else None,
                resolution=args.resolution,
                use_parallel=not args.no_parallel,
            )
            print(f"任务已提交到集群，任务ID: {task_id}")
        else:
            output_paths = pipeline.run(
                args.input,
                args.output,
                variables=args.variables,
                lon_range=tuple(args.lon_range) if args.lon_range else None,
                lat_range=tuple(args.lat_range) if args.lat_range else None,
                resolution=args.resolution,
                use_parallel=not args.no_parallel,
            )
            print(f"处理完成！输出文件:")
            for path in output_paths:
                print(f"  - {path}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
