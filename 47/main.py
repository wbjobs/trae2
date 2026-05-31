import argparse
import sys
import time
from pathlib import Path
from typing import List, Optional, Dict, Any

from config import AppConfig
from data_parser import OceanDataParser, OceanObservation
from spatial_interpolator import OceanSpatialInterpolator, InterpolationResult
from result_exporter import ResultExporter, BatchExporter
from task_scheduler import TaskScheduler
from parallel_kernel import ParallelKernel
from hpc_client import HPCClient, LocalHPCSimulator
from utils import setup_logger, Timer, generate_task_id, save_json

logger = setup_logger("main")


class OceanInterpolationPipeline:
    def __init__(self, config: Optional[AppConfig] = None):
        self.config = config or AppConfig()
        self.parser = OceanDataParser(self.config.denoise)
        self.interpolator = OceanSpatialInterpolator(self.config.interpolation)
        self.exporter = ResultExporter(self.config.output)
        self.batch_exporter = BatchExporter(self.config.output)

    def run(
        self,
        input_path: str,
        variables: Optional[List[str]] = None,
        use_parallel: bool = True,
        export_formats: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        variables = variables or ["temperature", "salinity"]

        pipeline_id = generate_task_id("pipeline")
        logger.info(f"Starting pipeline {pipeline_id}")

        total_start = time.time()

        with Timer("Data parsing and denoising", logger):
            input_path = Path(input_path)
            if input_path.is_dir():
                observations = self.parser.parse_directory(input_path)
            else:
                observations = self.parser.parse_file(input_path)

            if not observations:
                raise ValueError("No observations loaded from input")

            self.parser.denoise_observations()
            merged_obs = self.parser.merge_observations()

            logger.info(f"Loaded {len(observations)} stations, {len(merged_obs)} total data points")

        with Timer("Spatial interpolation", logger):
            if use_parallel:
                interpolation_results = self.interpolator.parallel_interpolate(
                    merged_obs,
                    variables,
                    n_workers=self.config.parallel.n_workers
                )
            else:
                interpolation_results = self.interpolator.interpolate_multiple(
                    merged_obs,
                    variables
                )

        with Timer("Results export", logger):
            export_summary = self.batch_exporter.export_all(
                list(interpolation_results.values()),
                observations=observations,
                additional_metadata={
                    "pipeline_id": pipeline_id,
                    "n_stations": len(observations),
                    "input_path": str(input_path),
                    "interpolation_method": self.config.interpolation.method,
                    "variables": variables
                }
            )

        total_time = time.time() - total_start

        return {
            "pipeline_id": pipeline_id,
            "total_time": total_time,
            "n_stations": len(observations),
            "n_data_points": len(merged_obs),
            "interpolation_results": {
                var: {
                    "shape": list(result.values.shape),
                    "statistics": result.statistics
                }
                for var, result in interpolation_results.items()
            },
            "export_summary": export_summary
        }

    def run_with_scheduler(
        self,
        input_path: str,
        variables: Optional[List[str]] = None,
        max_workers: int = 4
    ) -> Dict[str, Any]:
        variables = variables or ["temperature", "salinity"]

        with TaskScheduler(self.config, max_workers=max_workers) as scheduler:
            def parse_task(progress_callback=None):
                input_path_p = Path(input_path)
                if input_path_p.is_dir():
                    observations = self.parser.parse_directory(input_path_p)
                else:
                    observations = self.parser.parse_file(input_path_p)
                self.parser.denoise_observations()
                return observations

            def interpolate_task(observations, var, progress_callback=None):
                merged = self.parser.merge_observations()
                return self.interpolator.interpolate_variable(merged, var)

            parse_job_id = scheduler.submit(
                parse_task,
                name="parse_data",
                priority=10
            )

            interp_job_ids = []
            for var in variables:
                job_id = scheduler.submit(
                    interpolate_task,
                    name=f"interpolate_{var}",
                    args=([], var),
                    dependencies=[parse_job_id],
                    priority=5
                )
                interp_job_ids.append(job_id)

            scheduler.wait_for_all()

            results = {}
            for var, job_id in zip(variables, interp_job_ids):
                job = scheduler.get_job_status(job_id)
                if job and job.result:
                    results[var] = job.result

            stats = scheduler.get_stats()
            logger.info(f"Pipeline completed: {stats.completed_jobs}/{stats.total_jobs} jobs succeeded")

            return {
                "scheduler_stats": stats.to_dict(),
                "interpolation_results": results
            }


def generate_sample_data(output_dir: str, n_stations: int = 5, n_depths: int = 50) -> Path:
    import numpy as np
    import pandas as pd

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    lons = np.random.uniform(115, 125, n_stations)
    lats = np.random.uniform(25, 35, n_stations)

    for i in range(n_stations):
        depths = np.linspace(0, 2000, n_depths)
        n = len(depths)

        temp_surface = np.random.uniform(20, 28)
        temp = temp_surface - 0.01 * depths + np.random.normal(0, 0.5, n)

        sal_surface = np.random.uniform(33, 35)
        sal = sal_surface + 0.0005 * depths + np.random.normal(0, 0.1, n)

        df = pd.DataFrame({
            "station_id": f"STATION_{i+1:03d}",
            "longitude": lons[i],
            "latitude": lats[i],
            "depth": depths,
            "temperature": temp,
            "salinity": sal,
            "pressure": depths * 0.1,
        })

        file_path = output_dir / f"station_{i+1:03d}.csv"
        df.to_csv(file_path, index=False)
        logger.info(f"Generated sample data: {file_path}")

    return output_dir


def run_local_pipeline(args):
    config = AppConfig()

    if args.sample:
        sample_dir = generate_sample_data("./sample_data", n_stations=args.sample_stations)
        input_path = str(sample_dir)
    else:
        input_path = args.input

    pipeline = OceanInterpolationPipeline(config)

    with Timer("Full pipeline", logger):
        result = pipeline.run(
            input_path=input_path,
            variables=args.variables.split(",") if args.variables else None,
            use_parallel=not args.no_parallel,
            export_formats=args.formats.split(",") if args.formats else None
        )

    output_file = Path(config.output.output_dir) / "pipeline_result.json"
    save_json(result, output_file)
    logger.info(f"Pipeline result saved to {output_file}")

    return result


def run_hpc_job(args):
    from config import HPCConfig

    if args.local_simulator:
        simulator = LocalHPCSimulator(work_dir=args.work_dir)
        logger.info("Using local HPC simulator")

        command = f"python main.py --input {args.input} --output {args.output}"
        job_id = simulator.submit_job(command, name=args.job_name)

        logger.info(f"Job submitted: {job_id}")
        job = simulator.wait_for_job(job_id, timeout=args.timeout)
        logger.info(f"Job finished with state: {job.state.value}")

        output = simulator.get_job_output(job_id)
        if "stdout" in output:
            print("\n=== STDOUT ===")
            print(output["stdout"])
        if "stderr" in output:
            print("\n=== STDERR ===")
            print(output["stderr"])
    else:
        hpc_config = HPCConfig(
            host=args.host,
            port=args.port,
            username=args.username,
            remote_workdir=args.remote_dir,
            scheduler=args.scheduler,
            nodes=args.nodes,
            ntasks_per_node=args.ntasks,
            walltime=args.walltime,
            memory=args.memory,
        )

        with HPCClient(hpc_config) as client:
            data_files = list(Path(args.input).glob("*.csv")) if Path(args.input).is_dir() else [Path(args.input)]
            job_id = client.submit_interpolation_job(
                data_files=data_files,
                name=args.job_name,
                nodes=args.nodes,
                ntasks_per_node=args.ntasks,
                walltime=args.walltime,
                memory=args.memory,
            )

            logger.info(f"Job submitted: {job_id}")
            job = client.wait_for_job(job_id, timeout=args.timeout)
            logger.info(f"Job finished with state: {job.state.value}")

            output = client.get_job_output(job_id, args.output)
            print(f"Output files saved to {args.output}")


def main():
    parser = argparse.ArgumentParser(
        description="Ocean Temperature-Salinity-Depth Profile Interpolation System"
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    run_parser = subparsers.add_parser("run", help="Run interpolation pipeline")
    run_parser.add_argument("--input", "-i", type=str, help="Input data directory or file")
    run_parser.add_argument("--sample", action="store_true", help="Generate and use sample data")
    run_parser.add_argument("--sample-stations", type=int, default=5, help="Number of sample stations")
    run_parser.add_argument("--variables", type=str, default="temperature,salinity", help="Variables to interpolate")
    run_parser.add_argument("--formats", type=str, default="netcdf,csv,json", help="Export formats")
    run_parser.add_argument("--no-parallel", action="store_true", help="Disable parallel processing")

    hpc_parser = subparsers.add_parser("hpc", help="Submit job to HPC cluster")
    hpc_parser.add_argument("--input", "-i", type=str, required=True, help="Input data directory")
    hpc_parser.add_argument("--output", "-o", type=str, default="./hpc_output", help="Output directory")
    hpc_parser.add_argument("--host", type=str, default="hpc.example.com", help="HPC host")
    hpc_parser.add_argument("--port", type=int, default=22, help="SSH port")
    hpc_parser.add_argument("--username", type=str, required=True, help="HPC username")
    hpc_parser.add_argument("--remote-dir", type=str, default="~/ocean_interp", help="Remote working directory")
    hpc_parser.add_argument("--scheduler", type=str, default="slurm", choices=["slurm", "pbs"], help="Job scheduler")
    hpc_parser.add_argument("--nodes", type=int, default=1, help="Number of nodes")
    hpc_parser.add_argument("--ntasks", type=int, default=16, help="Tasks per node")
    hpc_parser.add_argument("--walltime", type=str, default="02:00:00", help="Wall time")
    hpc_parser.add_argument("--memory", type=str, default="32G", help="Memory per node")
    hpc_parser.add_argument("--job-name", type=str, default="ocean_interp", help="Job name")
    hpc_parser.add_argument("--timeout", type=int, default=7200, help="Timeout in seconds")
    hpc_parser.add_argument("--local-simulator", action="store_true", help="Use local HPC simulator")
    hpc_parser.add_argument("--work-dir", type=str, default="./hpc_sim", help="Local simulator work directory")

    sample_parser = subparsers.add_parser("sample", help="Generate sample data")
    sample_parser.add_argument("--output", "-o", type=str, default="./sample_data", help="Output directory")
    sample_parser.add_argument("--stations", type=int, default=5, help="Number of stations")
    sample_parser.add_argument("--depths", type=int, default=50, help="Depth levels per station")

    args = parser.parse_args()

    if args.command == "run":
        run_local_pipeline(args)
    elif args.command == "hpc":
        run_hpc_job(args)
    elif args.command == "sample":
        generate_sample_data(args.output, n_stations=args.stations, n_depths=args.depths)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
