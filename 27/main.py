import os
import sys
import argparse
import logging
from datetime import datetime
from typing import Optional

from config import GlobalConfig
from data_parser import RawDataParser
from parallel_kernel import ParallelProcessor
from trajectory_fitting import SpotTracker, TrajectoryFitter, TrajectoryAnalyzer
from visualization import ResultVisualizer, ReportGenerator
from task_scheduler import PipelineProcessor, TaskScheduler
from data_structures import ProcessingResult
from utils import setup_logger, save_pickle, load_pickle


def run_complete_pipeline(source_file: str, config: Optional[GlobalConfig] = None,
                          use_scheduler: bool = False) -> Optional[ProcessingResult]:
    config = config or GlobalConfig()
    logger = setup_logger(config)

    logger.info("=" * 80)
    logger.info("Starting Astronomical Spot Trajectory Analysis Pipeline")
    logger.info("=" * 80)
    logger.info(f"Source file: {source_file}")
    logger.info(f"Number of workers: {config.processing.num_workers}")
    logger.info(f"Output directory: {config.output.output_dir}")
    logger.info("")

    if use_scheduler:
        processor = PipelineProcessor(config, logger)
        result = processor.process_file(source_file)
    else:
        parser = RawDataParser(config)
        processor = ParallelProcessor(config, logger)
        tracker = SpotTracker(config, logger)
        fitter = TrajectoryFitter(config, logger)
        analyzer = TrajectoryAnalyzer(config, logger)
        visualizer = ResultVisualizer(config, logger)
        reporter = ReportGenerator(config, logger)

        start_time = datetime.now()

        logger.info("Step 1: Parsing raw observation data")
        frames = parser.parse_file(source_file)
        logger.info(f"  Parsed {len(frames)} frames")

        logger.info("Step 2: Parallel frame denoising and spot detection")
        denoised_frames, all_spots = processor.process_frames(frames)
        logger.info(f"  Denoised {len(denoised_frames)} frames, detected {len(all_spots)} spots")

        from collections import defaultdict
        spots_by_frame = defaultdict(list)
        for spot in all_spots:
            spots_by_frame[spot.frame_id].append(spot)

        logger.info("Step 3: Tracking spots across frames")
        tracks = tracker.track_spots(dict(spots_by_frame))
        logger.info(f"  Found {len(tracks)} valid tracks")

        logger.info("Step 4: Fitting trajectories")
        trajectories = fitter.fit_tracks(tracks)
        logger.info(f"  Fitted {len(trajectories)} trajectories")

        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()

        result = ProcessingResult(
            job_id="",
            source_file=source_file,
            total_frames=len(frames),
            detected_spots=len(all_spots),
            trajectories=trajectories,
            denoised_frames=denoised_frames,
            processing_time=processing_time,
            start_time=start_time,
            end_time=end_time,
            success=True
        )

        if config.output.save_visualization:
            logger.info("Step 5: Generating visualizations")
            vis_files = visualizer.visualize_result(result)
            result.metadata['visualization_files'] = vis_files
            logger.info(f"  Generated {len(vis_files)} visualization files")

        if config.output.generate_report:
            logger.info("Step 6: Generating reports")
            text_report = reporter.generate_text_report(result)
            json_report = reporter.generate_json_report(result)
            result.metadata['text_report'] = text_report
            result.metadata['json_report'] = json_report
            logger.info(f"  Text report: {text_report}")
            logger.info(f"  JSON report: {json_report}")

        if config.output.save_trajectory_data:
            result_path = os.path.join(
                config.output.output_dir,
                f"result_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pkl"
            )
            save_pickle(result, result_path)
            result.metadata['result_file'] = result_path
            logger.info(f"  Result data saved to: {result_path}")

    logger.info("")
    logger.info("=" * 80)
    logger.info("Pipeline completed successfully!")
    logger.info(f"Total processing time: {result.processing_time:.2f} seconds")
    logger.info(f"Frames processed: {result.total_frames}")
    logger.info(f"Spots detected: {result.detected_spots}")
    logger.info(f"Trajectories found: {len(result.trajectories)}")
    logger.info("=" * 80)

    return result


def generate_demo_data(config: Optional[GlobalConfig] = None) -> str:
    config = config or GlobalConfig()
    parser = RawDataParser(config)

    frames = parser.generate_test_data(
        num_frames=20,
        shape=(256, 256),
        num_spots=8,
        noise_level=8.0
    )

    data_dir = os.path.join(config.output.output_dir, "demo_data")
    os.makedirs(data_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(data_dir, f"demo_observation_{timestamp}.npy")

    data_array = np.stack([f.data for f in frames])
    np.save(filepath, data_array)

    print(f"Generated demo data with {len(frames)} frames")
    print(f"Data saved to: {filepath}")
    print(f"Image shape: {frames[0].shape}")

    return filepath


def run_demo():
    print("Astro Spot Trajectory Analysis - Demo Mode")
    print("=" * 60)

    config = GlobalConfig()
    config.processing.num_workers = min(4, os.cpu_count() or 2)
    config.output.output_dir = "./demo_results"
    os.makedirs(config.output.output_dir, exist_ok=True)

    print("\n[1/3] Generating demo observation data...")
    demo_file = generate_demo_data(config)

    print("\n[2/3] Running analysis pipeline...")
    result = run_complete_pipeline(demo_file, config)

    if result and result.success:
        print("\n[3/3] Summary:")
        print(f"  Total frames: {result.total_frames}")
        print(f"  Detected spots: {result.detected_spots}")
        print(f"  Trajectories: {len(result.trajectories)}")
        print(f"  Processing time: {result.processing_time:.2f}s")

        if result.trajectories:
            print("\n  Top 5 trajectories (by R²):")
            sorted_traj = sorted(result.trajectories, key=lambda t: t.r_squared, reverse=True)[:5]
            for i, traj in enumerate(sorted_traj, 1):
                print(f"    {i}. R²={traj.r_squared:.4f}, RMSE={traj.rmse:.2f}px, Points={traj.num_points}")

        print(f"\n  Results saved to: {config.output.output_dir}")

        if 'text_report' in result.metadata:
            print(f"  Text report: {result.metadata['text_report']}")
    else:
        print("\n[ERROR] Pipeline execution failed!")

    print("\nDemo completed!")


def main():
    parser = argparse.ArgumentParser(
        description="Astronomical Spot Trajectory Analysis Suite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run demo with synthetic data
  python main.py --demo

  # Process a single FITS file
  python main.py --input observation.fits

  # Process with custom worker count
  python main.py --input data.npy --workers 8

  # Use task scheduler mode
  python main.py --input data.fits --scheduler

  # Generate demo data only
  python main.py --generate-demo
        """
    )

    parser.add_argument("--demo", action="store_true",
                        help="Run complete demo with synthetic data")
    parser.add_argument("--generate-demo", action="store_true",
                        help="Generate demo data only")
    parser.add_argument("--input", "-i", type=str,
                        help="Input observation file (.fits, .npy, .raw, .txt)")
    parser.add_argument("--output", "-o", type=str, default="./results",
                        help="Output directory (default: ./results)")
    parser.add_argument("--workers", "-w", type=int, default=None,
                        help="Number of worker processes (default: CPU count)")
    parser.add_argument("--scheduler", action="store_true",
                        help="Use task scheduler for processing")
    parser.add_argument("--no-visualization", action="store_true",
                        help="Disable visualization generation")
    parser.add_argument("--no-report", action="store_true",
                        help="Disable report generation")
    parser.add_argument("--noise-threshold", type=float, default=None,
                        help="Noise threshold multiplier (default: 3.0)")
    parser.add_argument("--fitting-method", type=str, default="auto",
                        choices=["auto", "polynomial", "kalman"],
                        help="Trajectory fitting method (default: auto)")
    parser.add_argument("--processing-mode", type=str, default="multiprocessing",
                        choices=["multiprocessing", "threading", "sequential"],
                        help="Parallel processing mode (default: multiprocessing)")

    args = parser.parse_args()

    if args.demo:
        run_demo()
        return

    if args.generate_demo:
        config = GlobalConfig()
        config.output.output_dir = args.output
        generate_demo_data(config)
        return

    if not args.input:
        parser.print_help()
        print("\nError: --input is required (or use --demo for demo mode)")
        sys.exit(1)

    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)

    config = GlobalConfig()
    config.output.output_dir = args.output

    if args.workers:
        config.processing.num_workers = args.workers
    if args.noise_threshold:
        config.processing.noise_threshold = args.noise_threshold
    config.output.save_visualization = not args.no_visualization
    config.output.generate_report = not args.no_report

    os.makedirs(config.output.output_dir, exist_ok=True)

    parameters = {
        'processing_mode': args.processing_mode,
        'fitting_method': args.fitting_method,
    }

    print("Astro Spot Trajectory Analysis")
    print("=" * 60)
    print(f"Input file: {args.input}")
    print(f"Output directory: {args.output}")
    print(f"Workers: {config.processing.num_workers}")
    print(f"Processing mode: {args.processing_mode}")
    print(f"Fitting method: {args.fitting_method}")
    print("")

    if args.scheduler:
        processor = PipelineProcessor(config)
        result = processor.process_file(args.input, parameters=parameters)
    else:
        result = run_complete_pipeline(args.input, config)

    if result and result.success:
        print("\n" + "=" * 60)
        print("Processing completed successfully!")
        print(f"Total time: {result.processing_time:.2f}s")
        print(f"Frames: {result.total_frames} | Spots: {result.detected_spots} | Trajectories: {len(result.trajectories)}")

        if 'text_report' in result.metadata:
            print(f"Report: {result.metadata['text_report']}")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("Processing failed!")
        if result:
            print(f"Error: {result.error_message}")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    import numpy as np
    main()
