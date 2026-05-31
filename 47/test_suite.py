import unittest
import numpy as np
import tempfile
import os
from pathlib import Path
from unittest.mock import patch, MagicMock

from config import AppConfig, DenoiseConfig, InterpolationConfig, ParallelConfig
from data_parser import OceanObservation, DataDenoiser, OceanDataParser
from parallel_kernel import ParallelKernel, TaskStatus, profile_parallel_performance
from spatial_interpolator import (
    OceanSpatialInterpolator,
    FastIDWInterpolator,
    OptimizedKrigingInterpolator,
    InterpolationResult,
    LRUCache
)
from task_scheduler import TaskScheduler, JobStatus
from result_exporter import ResultExporter
from data_validator import OceanDataValidator, QualityControl, ValidationSeverity
from utils import (
    setup_logger,
    Timer,
    generate_task_id,
    calculate_statistics,
    haversine_distance,
    validate_coordinates
)


class TestUtils(unittest.TestCase):
    def test_setup_logger(self):
        logger = setup_logger("test")
        self.assertIsNotNone(logger)
        self.assertEqual(logger.name, "test")

    def test_timer(self):
        with Timer("test") as timer:
            pass
        self.assertGreaterEqual(timer.elapsed, 0.0)

    def test_generate_task_id(self):
        task_id = generate_task_id("test")
        self.assertTrue(task_id.startswith("test_"))
        self.assertEqual(len(task_id.split("_")), 3)

    def test_calculate_statistics(self):
        data = np.array([1, 2, 3, 4, 5])
        stats = calculate_statistics(data)
        self.assertEqual(stats["mean"], 3.0)
        self.assertEqual(stats["median"], 3.0)
        self.assertAlmostEqual(stats["std"], np.std(data))

    def test_haversine_distance(self):
        d = haversine_distance(0, 0, 1, 1)
        self.assertGreater(d, 0)

    def test_validate_coordinates(self):
        self.assertTrue(validate_coordinates(np.array([120]), np.array([30])))
        self.assertFalse(validate_coordinates(np.array([-200]), np.array([30])))
        self.assertFalse(validate_coordinates(np.array([120]), np.array([-100])))


class TestDataParser(unittest.TestCase):
    def setUp(self):
        self.config = DenoiseConfig()
        self.denoiser = DataDenoiser(self.config)

    def test_ocean_observation_validation(self):
        n = 10
        obs = OceanObservation(
            station_id="test",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.full(n, 120.0),
            latitude=np.full(n, 30.0),
            depth=np.linspace(0, 1000, n),
            temperature=np.random.uniform(5, 25, n),
            salinity=np.random.uniform(33, 35, n),
        )
        is_valid, errors = obs.validate()
        self.assertTrue(is_valid)
        self.assertEqual(len(errors), 0)

    def test_observation_validation_with_bad_data(self):
        n = 10
        obs = OceanObservation(
            station_id="test",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.full(n, -200.0),
            latitude=np.full(n, 30.0),
            depth=np.linspace(0, 1000, n),
            temperature=np.random.uniform(5, 25, n),
            salinity=np.random.uniform(33, 35, n),
        )
        is_valid, errors = obs.validate()
        self.assertFalse(is_valid)
        self.assertGreater(len(errors), 0)

    def test_observation_summary(self):
        n = 10
        obs = OceanObservation(
            station_id="test",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.full(n, 120.0),
            latitude=np.full(n, 30.0),
            depth=np.linspace(0, 1000, n),
            temperature=np.random.uniform(5, 25, n),
            salinity=np.random.uniform(33, 35, n),
        )
        summary = obs.summary()
        self.assertEqual(summary["n_points"], n)
        self.assertIn("temperature_stats", summary)
        self.assertIn("salinity_stats", summary)

    def test_physical_range_validation(self):
        data = np.array([100, 10, 20, -10, 30])
        cleaned, n_invalid = self.denoiser.validate_physical_range(data, "temperature")
        self.assertGreater(n_invalid, 0)
        self.assertLess(np.max(cleaned), 50)
        self.assertGreater(np.min(cleaned), -5)

    def test_iqr_outlier_removal(self):
        data = np.array([1, 2, 3, 4, 5, 100, 6, 7, 8, 9])
        cleaned, n_outliers = self.denoiser.remove_outliers_iqr(data)
        self.assertGreater(n_outliers, 0)
        self.assertLess(np.max(cleaned), 100)

    def test_spatial_outlier_removal(self):
        depths = np.linspace(0, 100, 10)
        values = np.array([20, 19, 18, 100, 16, 15, 14, 13, 12, 11])
        cleaned, n_outliers = self.denoiser.remove_spatial_outliers(depths, values)
        self.assertGreater(n_outliers, 0)
        self.assertLess(np.max(cleaned), 100)

    def test_denoise_returns_report(self):
        data = np.array([1, 2, 3, 100, 5, 6, 7])
        depths = np.linspace(0, 100, 7)
        cleaned, report = self.denoiser.denoise(data, "temperature", depths)
        self.assertIsInstance(report, dict)
        self.assertIn("physical_range_outliers", report)
        self.assertIn("statistical_outliers", report)
        self.assertIn("spatial_outliers", report)

    def test_median_filter(self):
        data = np.array([1, 10, 2, 10, 3])
        filtered = self.denoiser.apply_median_filter(data)
        self.assertLess(np.max(filtered), 10)

    def test_csv_parsing(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write("station_id,longitude,latitude,depth,temperature,salinity\n")
            for i in range(5):
                f.write(f"ST001,120.0,30.0,{i*100},{20-i},{34+i*0.1}\n")
            temp_path = f.name

        try:
            parser = OceanDataParser()
            observations = parser.parse_file(temp_path)
            self.assertEqual(len(observations), 1)
            self.assertEqual(len(observations[0]), 5)
        finally:
            os.unlink(temp_path)

    def test_merge_observations(self):
        parser = OceanDataParser()
        n = 5
        obs_list = []
        for i in range(3):
            obs = OceanObservation(
                station_id=f"ST{i:03d}",
                time=np.full(n, np.datetime64("2024-01-01")),
                longitude=np.full(n, 120.0 + i),
                latitude=np.full(n, 30.0 + i),
                depth=np.linspace(0, 1000, n),
                temperature=np.random.uniform(5, 25, n),
                salinity=np.random.uniform(33, 35, n),
            )
            obs_list.append(obs)

        parser.observations = obs_list
        merged = parser.merge_observations()
        self.assertEqual(len(merged), n * 3)
        self.assertEqual(merged.metadata["n_stations"], 3)


class TestParallelKernel(unittest.TestCase):
    def setUp(self):
        self.config = ParallelConfig(n_workers=2, chunk_size=10)

    def test_chunk_data(self):
        with ParallelKernel(self.config) as kernel:
            data = np.arange(100)
            chunks = kernel.chunk_data(data, chunk_size=25)
            self.assertEqual(len(chunks), 4)
            self.assertEqual(len(chunks[0]), 25)

    def test_execute(self):
        self.config.backend = "threading"

        def square(x):
            return x ** 2

        with ParallelKernel(self.config) as kernel:
            data = np.arange(10)
            results = kernel.execute(square, data)
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].status, TaskStatus.COMPLETED)

    def test_map_reduce(self):
        self.config.backend = "threading"

        def map_func(chunk):
            return np.sum(chunk)

        def reduce_func(results):
            return sum(results)

        with ParallelKernel(self.config) as kernel:
            data = np.arange(100)
            result = kernel.map_reduce(map_func, reduce_func, data)
            self.assertEqual(result, 4950)

    def test_parallel_performance_profile(self):
        def slow_func(data):
            return np.mean(data)

        data = np.random.rand(1000)
        results = profile_parallel_performance(
            slow_func, data, n_workers_list=[1, 2], n_runs=1, backend="threading"
        )
        self.assertIn(1, results)
        self.assertIn(2, results)

    def test_as_completed_async_execution(self):
        self.config.backend = "threading"
        import time

        def slow_task(x):
            time.sleep(0.01)
            return x * 2

        with ParallelKernel(self.config) as kernel:
            data = list(range(10))
            results = kernel.execute(slow_task, data)
            success_count = sum(1 for r in results if r.status == TaskStatus.COMPLETED)
            self.assertEqual(success_count, len(results))


class TestSpatialInterpolator(unittest.TestCase):
    def setUp(self):
        self.config = InterpolationConfig(
            method="idw",
            grid_resolution=(1.0, 1.0, 100.0),
            lon_range=(118, 122),
            lat_range=(28, 32),
            depth_range=(0, 1000)
        )
        self.interpolator = OceanSpatialInterpolator(self.config)

    def test_generate_grid(self):
        lon, lat, depth = self.interpolator.generate_grid()
        self.assertEqual(len(lon), 5)
        self.assertEqual(len(lat), 5)
        self.assertEqual(len(depth), 11)

    def test_idw_interpolation(self):
        n_points = 20
        points = np.column_stack([
            np.random.uniform(118, 122, n_points),
            np.random.uniform(28, 32, n_points),
            np.random.uniform(0, 1000, n_points)
        ])
        values = np.random.uniform(5, 25, n_points)

        idw = IDWInterpolator(self.config)
        grid_points = np.array([[120, 30, 500]])
        result = idw.interpolate(points, values, grid_points)
        self.assertEqual(len(result), 1)
        self.assertGreater(result[0], 0)

    def test_kriging_variogram_fit(self):
        n_points = 30
        points = np.column_stack([
            np.random.uniform(118, 122, n_points),
            np.random.uniform(28, 32, n_points),
            np.random.uniform(0, 1000, n_points)
        ])
        values = np.random.uniform(5, 25, n_points)

        kriging = KrigingInterpolator(self.config)
        params = kriging._fit_variogram(points, values)
        self.assertIn("nugget", params)
        self.assertIn("sill", params)
        self.assertIn("range", params)

    def test_interpolate_variable(self):
        n = 50
        obs = OceanObservation(
            station_id="test",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.random.uniform(118, 122, n),
            latitude=np.random.uniform(28, 32, n),
            depth=np.random.uniform(0, 1000, n),
            temperature=np.random.uniform(5, 25, n),
            salinity=np.random.uniform(33, 35, n),
        )

        result = self.interpolator.interpolate_variable(obs, "temperature")
        self.assertIsInstance(result, InterpolationResult)
        self.assertEqual(result.variable, "temperature")
        self.assertEqual(result.method, "idw")
        self.assertEqual(len(result.values.shape), 3)


class TestTaskScheduler(unittest.TestCase):
    def setUp(self):
        self.config = AppConfig()

    def test_job_submission_and_execution(self):
        with TaskScheduler(self.config, max_workers=2) as scheduler:
            def simple_task(x, progress_callback=None):
                return x * 2

            job_id = scheduler.submit(simple_task, args=(5,), name="test_task")
            result = scheduler.wait_for_job(job_id, timeout=10)
            self.assertEqual(result, 10)

    def test_job_with_dependencies(self):
        with TaskScheduler(self.config, max_workers=2) as scheduler:
            def task_a(progress_callback=None):
                return 10

            def task_b(a_result, progress_callback=None):
                return a_result * 2

            job_a = scheduler.submit(task_a, name="task_a")
            job_b = scheduler.submit(task_b, args=(10,), name="task_b", dependencies=[job_a])

            scheduler.wait_for_all()
            job_b_status = scheduler.get_job_status(job_b)
            self.assertEqual(job_b_status.status, JobStatus.COMPLETED)

    def test_job_retry(self):
        attempt_count = [0]

        with TaskScheduler(self.config, max_workers=2) as scheduler:
            def failing_task(progress_callback=None):
                attempt_count[0] += 1
                if attempt_count[0] < 3:
                    raise ValueError("Temporary failure")
                return "success"

            job_id = scheduler.submit(failing_task, name="failing_task", max_retries=3)
            result = scheduler.wait_for_job(job_id, timeout=10)
            self.assertEqual(result, "success")
            self.assertEqual(attempt_count[0], 3)

    def test_scheduler_stats(self):
        with TaskScheduler(self.config, max_workers=2) as scheduler:
            def task(progress_callback=None):
                return "done"

            for i in range(5):
                scheduler.submit(task, name=f"task_{i}")

            scheduler.wait_for_all()
            stats = scheduler.get_stats()
            self.assertEqual(stats.total_jobs, 5)
            self.assertEqual(stats.completed_jobs, 5)


class TestResultExporter(unittest.TestCase):
    def setUp(self):
        from config import OutputConfig
        self.temp_dir = tempfile.mkdtemp()
        self.config = OutputConfig(output_dir=self.temp_dir, formats=["json", "csv"])
        self.exporter = ResultExporter(self.config)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir)

    def test_export_json(self):
        result = InterpolationResult(
            variable="temperature",
            lon_grid=np.array([120, 121]),
            lat_grid=np.array([30, 31]),
            depth_grid=np.array([0, 100]),
            values=np.random.rand(2, 2, 2),
            method="idw",
            statistics={"mean": 10.0, "std": 2.0}
        )

        export_results = self.exporter.export(result, formats=["json"])
        self.assertEqual(len(export_results), 1)
        self.assertTrue(export_results[0].file_path.exists())
        self.assertEqual(export_results[0].format, "json")

    def test_export_csv(self):
        result = InterpolationResult(
            variable="salinity",
            lon_grid=np.array([120, 121]),
            lat_grid=np.array([30, 31]),
            depth_grid=np.array([0, 100]),
            values=np.random.rand(2, 2, 2),
            method="idw"
        )

        export_results = self.exporter.export(result, formats=["csv"])
        self.assertEqual(len(export_results), 1)
        self.assertTrue(export_results[0].file_path.exists())
        self.assertGreater(export_results[0].file_size_mb, 0)

    def test_export_metadata(self):
        results = [
            InterpolationResult(
                variable="temperature",
                lon_grid=np.array([120]),
                lat_grid=np.array([30]),
                depth_grid=np.array([0]),
                values=np.array([[[10.0]]]),
                method="idw",
                statistics={"mean": 10.0}
            )
        ]

        export_result = self.exporter.export_metadata(results, {"source": "test"})
        self.assertTrue(export_result.file_path.exists())

    def test_batch_export(self):
        results = [
            InterpolationResult(
                variable=var,
                lon_grid=np.array([120, 121]),
                lat_grid=np.array([30, 31]),
                depth_grid=np.array([0, 100]),
                values=np.random.rand(2, 2, 2),
                method="idw"
            )
            for var in ["temperature", "salinity"]
        ]

        export_results = self.exporter.export_batch(results, formats=["json"])
        self.assertEqual(len(export_results), 2)


class TestDataValidator(unittest.TestCase):
    def setUp(self):
        self.validator = OceanDataValidator()
        self.qc = QualityControl()

    def test_profile_validation_valid_data(self):
        depths = np.linspace(0, 1000, 50)
        temps = np.linspace(25, 5, 50) + np.random.normal(0, 0.1, 50)

        report = self.validator.validate_profile(depths, temps, "temperature")
        self.assertEqual(report.variable, "temperature")
        self.assertEqual(report.total_points, 50)
        self.assertTrue(report.is_valid())

    def test_profile_validation_with_extreme_values(self):
        depths = np.linspace(0, 1000, 50)
        temps = np.linspace(25, 5, 50)
        temps[0] = 100
        temps[-1] = -20

        report = self.validator.validate_profile(depths, temps, "temperature")
        self.assertFalse(report.is_valid())
        self.assertGreater(len(report.issues), 0)

        critical_issues = [i for i in report.issues if i.severity == ValidationSeverity.CRITICAL]
        self.assertGreater(len(critical_issues), 0)

    def test_profile_validation_with_nan_values(self):
        depths = np.linspace(0, 1000, 50)
        temps = np.linspace(25, 5, 50)
        temps[10:15] = np.nan

        report = self.validator.validate_profile(depths, temps, "temperature")
        self.assertEqual(report.valid_points, 45)
        nan_issue = next((i for i in report.issues if i.issue_type == "nan_values"), None)
        self.assertIsNotNone(nan_issue)
        self.assertEqual(nan_issue.count, 5)

    def test_coordinate_validation(self):
        lons = np.full(10, 120.0)
        lats = np.full(10, 30.0)

        report = self.validator.validate_coordinates(lons, lats)
        self.assertTrue(report.is_valid())

    def test_coordinate_validation_invalid(self):
        lons = np.array([120, -200, 130])
        lats = np.array([30, 30, 100])

        report = self.validator.validate_coordinates(lons, lats)
        self.assertFalse(report.is_valid())

    def test_quality_control_auto_correct(self):
        depths = np.linspace(0, 1000, 50)
        temps = np.linspace(25, 5, 50)
        temps[0] = 100
        temps[25] = np.nan

        corrected, corrections = self.qc.auto_correct_profile(depths, temps.copy(), "temperature")

        self.assertLess(np.max(corrected), 100)
        self.assertFalse(np.any(np.isnan(corrected)))
        self.assertGreater(corrections["nan_filled"], 0)

    def test_observation_validation(self):
        n = 50
        obs = OceanObservation(
            station_id="test_qc",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.full(n, 120.0),
            latitude=np.full(n, 30.0),
            depth=np.linspace(0, 1000, n),
            temperature=np.concatenate([np.linspace(25, 5, 25), np.full(25, 100)]),
            salinity=np.random.uniform(33, 35, n),
        )

        qc_result = self.qc.apply_qc_to_observation(obs)
        self.assertIn("summary", qc_result)
        self.assertIn("corrections", qc_result)


class TestHPCClient(unittest.TestCase):
    def test_local_simulator(self):
        from hpc_client import LocalHPCSimulator

        with tempfile.TemporaryDirectory() as tmpdir:
            simulator = LocalHPCSimulator(work_dir=tmpdir)
            job_id = simulator.submit_job("echo 'Hello World'", name="test_job")

            job = simulator.wait_for_job(job_id, timeout=10)
            self.assertEqual(job.state.value, "COMPLETED")

            output = simulator.get_job_output(job_id, tmpdir)
            self.assertIn("stdout", output)
            self.assertIn("Hello World", output["stdout"])


class TestMainPipeline(unittest.TestCase):
    def test_generate_sample_data(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            from main import generate_sample_data
            data_dir = generate_sample_data(tmpdir, n_stations=3, n_depths=10)
            self.assertTrue(data_dir.exists())
            csv_files = list(data_dir.glob("*.csv"))
            self.assertEqual(len(csv_files), 3)

    def test_pipeline_integration(self):
        from main import OceanInterpolationPipeline
        from main import generate_sample_data

        with tempfile.TemporaryDirectory() as tmpdir:
            data_dir = generate_sample_data(tmpdir, n_stations=3, n_depths=10)

            config = AppConfig()
            config.output.output_dir = os.path.join(tmpdir, "output")
            config.interpolation.grid_resolution = (2.0, 2.0, 500.0)
            config.interpolation.lon_range = (114, 126)
            config.interpolation.lat_range = (24, 36)
            config.interpolation.depth_range = (0, 2000)
            config.interpolation.method = "idw"

            pipeline = OceanInterpolationPipeline(config)
            result = pipeline.run(
                input_path=str(data_dir),
                variables=["temperature", "salinity"],
                use_parallel=False,
                export_formats=["json", "csv"]
            )

            self.assertIn("pipeline_id", result)
            self.assertIn("interpolation_results", result)
            self.assertIn("temperature", result["interpolation_results"])
            self.assertIn("salinity", result["interpolation_results"])


class TestProfileAnalyzer(unittest.TestCase):
    def setUp(self):
        from profile_analyzer import ProfileAnalyzer
        self.analyzer = ProfileAnalyzer(smooth_sigma=1.0)

    def test_density_calculation(self):
        n = 50
        temp = np.linspace(25, 5, n)
        sal = np.full(n, 35.0)
        pressure = np.linspace(0, 500, n) * 0.1

        density = ProfileAnalyzer.calculate_density(temp, sal, pressure)

        self.assertEqual(len(density), n)
        self.assertTrue(np.all(density > 1000))
        self.assertTrue(np.all(density < 1050))

    def test_buoyancy_frequency(self):
        n = 50
        depth = np.linspace(0, 500, n)
        density = 1025 + 0.01 * depth

        N = ProfileAnalyzer.calculate_buoyancy_frequency(depth, density)

        self.assertEqual(len(N), n)
        self.assertTrue(np.all(N >= 0))

    def test_profile_analysis(self):
        n = 50
        obs = OceanObservation(
            station_id="profile_test",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.full(n, 120.0),
            latitude=np.full(n, 30.0),
            depth=np.linspace(0, 500, n),
            temperature=np.concatenate([np.full(10, 25), np.linspace(24, 8, 30), np.full(10, 7)]),
            salinity=np.linspace(34.5, 35.0, n),
        )

        result = self.analyzer.analyze_profile(obs)

        self.assertEqual(result.station_id, "profile_test")
        self.assertEqual(len(result.depth), n)
        self.assertFalse(np.isnan(result.mixed_layer_depth))
        self.assertFalse(np.isnan(result.thermocline_depth))
        self.assertIsNotNone(result.density)
        self.assertIsNotNone(result.buoyancy_frequency)

    def test_mixed_layer_detection(self):
        depth = np.linspace(0, 200, 50)
        temp = np.concatenate([np.full(15, 25.0), np.linspace(24.5, 15, 35)])

        mld = self.analyzer._find_mixed_layer_depth(depth, temp)

        self.assertGreater(mld, 0)
        self.assertLess(mld, 200)

    def test_water_mass_classification(self):
        n = 100
        depth = np.linspace(0, 5000, n)
        temp = np.linspace(25, 2, n)
        sal = np.linspace(34, 35, n)

        classifications = self.analyzer.classify_water_masses(depth, temp, sal)

        self.assertEqual(len(classifications), n)
        self.assertTrue(any("Surface" in str(c) for c in classifications))

    def test_t_s_diagram_properties(self):
        n = 100
        temp = np.linspace(25, 5, n)
        sal = np.linspace(34, 35, n)

        props = self.analyzer.t_s_diagram_properties(temp, sal)

        self.assertIn("correlation", props)
        self.assertIn("t_std", props)
        self.assertIn("s_std", props)


class TestMultiCruise(unittest.TestCase):
    def setUp(self):
        from multi_cruise import SpatioTemporalAligner, MultiCruiseMerger
        self.aligner = SpatioTemporalAligner()
        self.merger = MultiCruiseMerger(max_distance_km=200.0)

    def test_extract_coordinates(self):
        n = 10
        obs = OceanObservation(
            station_id="test",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.linspace(120, 121, n),
            latitude=np.linspace(30, 31, n),
            depth=np.linspace(0, 500, n),
            temperature=np.random.uniform(5, 25, n),
            salinity=np.random.uniform(33, 35, n),
        )

        lons, lats, times = self.aligner.extract_station_coordinates([obs])

        self.assertEqual(len(lons), 1)
        self.assertAlmostEqual(lons[0], 120.5, places=1)

    def test_align_to_common_grid(self):
        n1, n2 = 50, 60
        depth1 = np.linspace(0, 500, n1)
        depth2 = np.linspace(0, 500, n2)
        prof1 = np.linspace(25, 5, n1)
        prof2 = np.linspace(26, 6, n2)

        target_depth = np.linspace(0, 500, 55)
        aligned = self.aligner.align_to_common_grid(
            [prof1, prof2], [depth1, depth2], target_depth
        )

        self.assertEqual(len(aligned), 2)
        self.assertEqual(len(aligned[0]), len(target_depth))

    def test_spatial_weights(self):
        distances = np.array([5, 10, 15, 20])

        weights_idw = self.aligner.calculate_spatial_weights(distances, method="idw")
        weights_gauss = self.aligner.calculate_spatial_weights(distances, method="gaussian")

        self.assertEqual(len(weights_idw), 4)
        self.assertEqual(len(weights_gauss), 4)
        self.assertAlmostEqual(np.sum(weights_idw), 1.0, places=6)
        self.assertAlmostEqual(np.sum(weights_gauss), 1.0, places=6)

    def test_find_nearby_stations(self):
        target_lon, target_lat = 120.0, 30.0
        src_lons = np.array([120.1, 120.5, 122.0])
        src_lats = np.array([30.1, 30.5, 32.0])

        indices, distances = self.aligner.find_nearby_stations(
            target_lon, target_lat, src_lons, src_lats, max_distance_km=100.0
        )

        self.assertGreater(len(indices), 0)
        self.assertTrue(np.all(distances <= 100.0))


class TestAdvancedInterpolators(unittest.TestCase):
    def setUp(self):
        self.config = InterpolationConfig(
            method="idw",
            lon_range=(118, 122),
            lat_range=(28, 32),
            depth_range=(0, 100),
            grid_resolution=(1.0, 1.0, 25.0),
            n_neighbors=8
        )

    def test_fast_idw_interpolator(self):
        from spatial_interpolator import FastIDWInterpolator

        interpolator = FastIDWInterpolator(self.config)

        np.random.seed(42)
        points = np.random.rand(50, 3) * 10
        values = np.sin(points[:, 0]) + np.cos(points[:, 1])

        grid_points = np.random.rand(20, 3) * 10

        result, _ = interpolator.interpolate(points, values, grid_points)

        self.assertEqual(len(result), 20)
        self.assertFalse(np.any(np.isnan(result)))

    def test_optimized_kriging(self):
        from spatial_interpolator import OptimizedKrigingInterpolator

        interpolator = OptimizedKrigingInterpolator(self.config)

        np.random.seed(42)
        points = np.random.rand(30, 3) * 5
        values = np.sum(points, axis=1)

        grid_points = np.random.rand(10, 3) * 5

        result, variance = interpolator.interpolate(points, values, grid_points)

        self.assertEqual(len(result), 10)
        self.assertFalse(np.any(np.isnan(result)))
        self.assertIsNone(variance)

    def test_svr_interpolator(self):
        from spatial_interpolator import SVRInterpolator

        interpolator = SVRInterpolator(self.config)

        np.random.seed(42)
        points = np.random.rand(50, 3) * 10
        values = np.sin(points[:, 0]) + np.cos(points[:, 1])

        grid_points = np.random.rand(20, 3) * 10

        result, _ = interpolator.interpolate(points, values, grid_points)

        self.assertEqual(len(result), 20)

    def test_adaptive_interpolator(self):
        from spatial_interpolator import AdaptiveInterpolator

        interpolator = AdaptiveInterpolator(self.config)

        n = 50
        obs = OceanObservation(
            station_id="adaptive_test",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.random.uniform(118, 122, n),
            latitude=np.random.uniform(28, 32, n),
            depth=np.random.uniform(0, 100, n),
            temperature=np.random.uniform(5, 25, n),
            salinity=np.random.uniform(33, 35, n),
        )

        result = interpolator.interpolate_variable(obs, "temperature")

        self.assertIsNotNone(result)
        self.assertEqual(result.variable, "temperature")

    def test_ensemble_interpolator(self):
        from spatial_interpolator import EnsembleInterpolator

        interpolator = EnsembleInterpolator(
            self.config,
            methods=["idw", "linear"]
        )

        n = 50
        obs = OceanObservation(
            station_id="ensemble_test",
            time=np.full(n, np.datetime64("2024-01-01")),
            longitude=np.random.uniform(118, 122, n),
            latitude=np.random.uniform(28, 32, n),
            depth=np.random.uniform(0, 100, n),
            temperature=np.random.uniform(5, 25, n),
            salinity=np.random.uniform(33, 35, n),
        )

        result = interpolator.interpolate_variable(obs, "temperature")

        self.assertIsNotNone(result)
        self.assertTrue("ensemble" in result.method)


class TestTaskExecutor(unittest.TestCase):
    def test_thread_pool_executor(self):
        from task_executor import ThreadPoolExecutor, TaskStatus

        def square(x):
            return x * x

        with ThreadPoolExecutor(max_workers=2) as executor:
            task_id = executor.submit(square, args=(5,))

            result = executor.get_result(task_id, timeout=5.0)

            self.assertIsNotNone(result)
            self.assertEqual(result.status, TaskStatus.COMPLETED)
            self.assertEqual(result.result, 25)

    def test_process_pool_executor(self):
        from task_executor import ProcessPoolExecutor, TaskStatus

        def cube(x):
            return x ** 3

        with ProcessPoolExecutor(max_workers=2) as executor:
            task_id = executor.submit(cube, args=(3,))

            result = executor.get_result(task_id, timeout=10.0)

            self.assertIsNotNone(result)
            self.assertEqual(result.status, TaskStatus.COMPLETED)
            self.assertEqual(result.result, 27)

    def test_work_stealing_executor(self):
        from task_executor import WorkStealingExecutor, TaskStatus

        def add(a, b):
            return a + b

        with WorkStealingExecutor(n_workers=2) as executor:
            task_id = executor.submit(add, args=(2, 3))

            result = executor.get_result(task_id, timeout=5.0)

            self.assertIsNotNone(result)
            self.assertEqual(result.status, TaskStatus.COMPLETED)
            self.assertEqual(result.result, 5)

    def test_executor_with_callback(self):
        from task_executor import ThreadPoolExecutor

        results = []

        def callback(result):
            results.append(result.result)

        with ThreadPoolExecutor(max_workers=2) as executor:
            executor.add_completion_callback(callback)
            executor.submit(lambda x: x + 1, args=(5,))
            executor.submit(lambda x: x * 2, args=(5,))

            import time
            time.sleep(0.5)

            self.assertEqual(len(results), 2)

    def test_batch_processor(self):
        from task_executor import ThreadPoolExecutor, BatchProcessor

        def process_item(x):
            return x * 2

        with ThreadPoolExecutor(max_workers=2) as executor:
            processor = BatchProcessor(executor, batch_size=3)

            items = [1, 2, 3, 4, 5, 6]
            results = processor.map(process_item, items)

            self.assertEqual(len(results), 6)
            processed_values = [r.result for r in results]
            self.assertEqual(sorted(processed_values), [2, 4, 6, 8, 10, 12])

    def test_create_executor_factory(self):
        from task_executor import create_executor, ThreadPoolExecutor, ProcessPoolExecutor, WorkStealingExecutor

        thread_exec = create_executor("thread", max_workers=2)
        self.assertIsInstance(thread_exec, ThreadPoolExecutor)
        thread_exec.shutdown()

        proc_exec = create_executor("process", max_workers=2)
        self.assertIsInstance(proc_exec, ProcessPoolExecutor)
        proc_exec.shutdown()

        ws_exec = create_executor("work_stealing", max_workers=2)
        self.assertIsInstance(ws_exec, WorkStealingExecutor)
        ws_exec.shutdown()


class TestPerformanceOptimizations(unittest.TestCase):
    def test_lru_cache(self):
        from spatial_interpolator import LRUCache

        cache = LRUCache(capacity=3)

        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)

        self.assertEqual(cache.get("a"), 1)

        cache.put("d", 4)

        self.assertIsNone(cache.get("b"))
        self.assertEqual(cache.get("a"), 1)

    def test_interpolation_speed_comparison(self):
        from spatial_interpolator import FastIDWInterpolator, OceanSpatialInterpolator
        import time

        config = InterpolationConfig(
            method="idw",
            lon_range=(0, 10),
            lat_range=(0, 10),
            depth_range=(0, 10),
            grid_resolution=(1.0, 1.0, 1.0),
            n_neighbors=8
        )

        np.random.seed(42)
        n_points = 500
        points = np.random.rand(n_points, 3) * 10
        values = np.sin(points[:, 0]) + np.cos(points[:, 1])

        n_grid = 1000
        grid_points = np.random.rand(n_grid, 3) * 10

        fast_idw = FastIDWInterpolator(config)

        start = time.time()
        result, _ = fast_idw.interpolate(points, values, grid_points)
        elapsed = time.time() - start

        self.assertLess(elapsed, 5.0)
        self.assertEqual(len(result), n_grid)


if __name__ == "__main__":
    unittest.main()
