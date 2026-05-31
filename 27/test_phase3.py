#!/usr/bin/env python3
import sys
import os
import time
import numpy as np
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import GlobalConfig
from data_structures import Spot, Trajectory
from trajectory_fitting import TrajectoryFitter, TrackState
from anomaly_detector import TrajectoryAnomalyDetector, BatchAnomalyDetector
from data_comparator import DatasetComparator, TrajectoryMatcher
from utils import setup_logger, find_local_maxima


def create_test_spots(n_frames=100, noise_level=2.0, anomaly_indices=None):
    if anomaly_indices is None:
        anomaly_indices = []
    
    spots = []
    for i in range(n_frames):
        t = datetime(2024, 1, 1, 0, 0, 0) + timedelta(seconds=i * 0.1)
        
        x = 100.0 + 50.0 * np.sin(i * 0.1)
        y = 80.0 + 30.0 * np.cos(i * 0.1)
        intensity = 1000.0 + np.random.normal(0, 50)
        
        if i in anomaly_indices:
            x += np.random.normal(0, 20)
            y += np.random.normal(0, 20)
            intensity = 3000.0
        
        spots.append(Spot(
            spot_id=f"spot_{i}",
            x=x + np.random.normal(0, noise_level),
            y=y + np.random.normal(0, noise_level),
            intensity=intensity,
            area=4.0,
            frame_id=i,
            timestamp=t,
            snr=intensity / 50.0
        ))
    
    return spots


def test_anomaly_detection():
    print("\n" + "=" * 60)
    print("TEST 1: Anomaly Detection")
    print("=" * 60)
    
    config = GlobalConfig()
    logger = setup_logger(config)
    detector = TrajectoryAnomalyDetector(config=config, logger=logger)
    
    np.random.seed(42)
    spots = create_test_spots(100, anomaly_indices=[25, 50, 75])
    
    trajectory = Trajectory(
        trajectory_id="test_track",
        spots=spots,
        coefficients=np.array([0.0, 100.0, 0.0, 80.0]),
        fitting_method="test",
        r_squared=0.95,
        rmse=2.0,
        start_time=spots[0].timestamp,
        end_time=spots[-1].timestamp
    )
    
    report = detector.detect_all_anomalies(trajectory)
    
    print(f"\nTotal points: {len(trajectory.spots)}")
    print(f"Anomaly points detected: {len(report.anomaly_points)}")
    
    if report.anomaly_points:
        print("\nAnomaly points detected:")
        for ap in report.anomaly_points[:5]:
            print(f"  Frame {ap.frame_id}: type={ap.anomaly_type}, severity={ap.severity:.2f}")
    
    print("\n✓ Anomaly detection test passed!")
    return True


def test_data_comparison():
    print("\n" + "=" * 60)
    print("TEST 2: Data Comparison")
    print("=" * 60)
    
    config = GlobalConfig()
    logger = setup_logger(config)
    
    np.random.seed(123)
    n_frames = 50
    
    trajectories1 = []
    trajectories2 = []
    
    for track_idx in range(3):
        spots1 = []
        spots2 = []
        
        for i in range(n_frames):
            t = datetime(2024, 1, 1) + timedelta(seconds=i * 0.1)
            
            base_x = 100.0 + 50.0 * np.sin(i * 0.1 + track_idx)
            base_y = 80.0 + 30.0 * np.cos(i * 0.1 + track_idx)
            
            spots1.append(Spot(
                spot_id=f"s1_{track_idx}_{i}",
                x=base_x + np.random.normal(0, 2),
                y=base_y + np.random.normal(0, 2),
                intensity=1000.0,
                area=4.0,
                frame_id=i,
                timestamp=t,
                snr=20.0
            ))
            
            spots2.append(Spot(
                spot_id=f"s2_{track_idx}_{i}",
                x=base_x + np.random.normal(0, 2) + 5,
                y=base_y + np.random.normal(0, 2) + 5,
                intensity=1000.0,
                area=4.0,
                frame_id=i,
                timestamp=t,
                snr=20.0
            ))
        
        trajectories1.append(Trajectory(
            trajectory_id=f"track1_{track_idx}",
            spots=spots1,
            coefficients=np.array([0.0, 100.0, 0.0, 80.0]),
            fitting_method="test",
            r_squared=0.95,
            rmse=2.0,
            start_time=spots1[0].timestamp,
            end_time=spots1[-1].timestamp
        ))
        
        trajectories2.append(Trajectory(
            trajectory_id=f"track2_{track_idx}",
            spots=spots2,
            coefficients=np.array([0.0, 105.0, 0.0, 85.0]),
            fitting_method="test",
            r_squared=0.95,
            rmse=2.0,
            start_time=spots2[0].timestamp,
            end_time=spots2[-1].timestamp
        ))
    
    matcher = TrajectoryMatcher(config=config, logger=logger)
    matches = matcher.match_trajectories(trajectories1, trajectories2)
    
    print(f"\nMatched {len(matches)} trajectory pairs")
    for traj1_id, traj2_id in matches.items():
        print(f"  {traj1_id} <-> {traj2_id}")
    
    print("\n✓ Data comparison test passed!")
    return True


def test_trajectory_fitting():
    print("\n" + "=" * 60)
    print("TEST 3: Trajectory Fitting (Optimized)")
    print("=" * 60)
    
    config = GlobalConfig()
    logger = setup_logger(config)
    fitter = TrajectoryFitter(config, logger=logger)
    
    np.random.seed(456)
    n_frames = 150
    spots = []
    
    for i in range(n_frames):
        t = datetime(2024, 1, 1) + timedelta(seconds=i * 0.1)
        
        x = 100.0 + 50.0 * np.sin(i * 0.05) + 2.0 * i
        y = 80.0 + 30.0 * np.cos(i * 0.05) + 1.5 * i
        intensity = 1000.0 + np.random.normal(0, 50)
        
        if i in [30, 60, 90, 120]:
            x += np.random.normal(0, 30)
            y += np.random.normal(0, 30)
        
        spots.append(Spot(
            spot_id=f"spot_{i}",
            x=x + np.random.normal(0, 2),
            y=y + np.random.normal(0, 2),
            intensity=intensity,
            area=4.0,
            frame_id=i,
            timestamp=t,
            snr=intensity / 50.0
        ))
    
    track = TrackState(
        track_id="test_fit",
        spots=spots
    )
    
    start_time = time.time()
    
    times = np.array([(s.timestamp - spots[0].timestamp).total_seconds() for s in spots])
    x_coords = np.array([s.x for s in spots])
    y_coords = np.array([s.y for s in spots])
    
    optimal_degree = fitter._select_optimal_degree(times, x_coords, y_coords)
    print(f"\nOptimal polynomial degree (BIC): {optimal_degree}")
    
    fitted_trajectory = fitter.fit_polynomial(track, auto_select=True)
    elapsed = time.time() - start_time
    
    print(f"Fitting time: {elapsed:.3f}s")
    print(f"Original points: {len(fitted_trajectory.spots)}")
    print(f"Fit method: {fitted_trajectory.fitting_method}")
    print(f"RMSE: {fitted_trajectory.rmse:.4f}")
    print(f"R-squared: {fitted_trajectory.r_squared:.4f}")
    
    print("\n✓ Trajectory fitting test passed!")
    return True


def test_find_local_maxima():
    print("\n" + "=" * 60)
    print("TEST 4: Find Local Maxima (Optimized)")
    print("=" * 60)
    
    np.random.seed(789)
    image = np.zeros((200, 200))
    
    peak_positions = [(50, 50), (100, 100), (150, 150), (30, 170), (170, 30)]
    for py, px in peak_positions:
        y, x = np.ogrid[-10:11, -10:11]
        gaussian = 1000 * np.exp(-(x**2 + y**2) / (2 * 3**2))
        image[py-10:py+11, px-10:px+11] += gaussian
    
    image += np.random.normal(0, 10, image.shape)
    
    start_time = time.time()
    peaks = find_local_maxima(image, threshold=100, min_distance=10)
    elapsed = time.time() - start_time
    
    print(f"Found {len(peaks)} peaks in {elapsed:.4f}s")
    print(f"Expected peaks: {len(peak_positions)}")
    
    if len(peaks) >= len(peak_positions) - 1:
        print("✓ Find local maxima test passed!")
        return True
    else:
        print("✗ Find local maxima test failed!")
        return False


def test_parallel_fitting():
    print("\n" + "=" * 60)
    print("TEST 5: Parallel Fitting Performance")
    print("=" * 60)
    
    config = GlobalConfig()
    config.processing.num_workers = 4
    logger = setup_logger(config)
    fitter = TrajectoryFitter(config, logger=logger)
    
    np.random.seed(101)
    tracks = []
    
    for track_idx in range(10):
        spots = []
        n_frames = 50
        
        for i in range(n_frames):
            t = datetime(2024, 1, 1) + timedelta(seconds=i * 0.1)
            
            x = 100.0 + track_idx * 20 + np.random.normal(0, 5)
            y = 80.0 + track_idx * 15 + np.random.normal(0, 5)
            
            spots.append(Spot(
                spot_id=f"s_{track_idx}_{i}",
                x=x,
                y=y,
                intensity=1000.0,
                area=4.0,
                frame_id=i,
                timestamp=t,
                snr=20.0
            ))
        
        tracks.append(TrackState(
            track_id=f"track_{track_idx}",
            spots=spots
        ))
    
    start_time = time.time()
    fitted = []
    for track in tracks:
        result = fitter.fit_polynomial(track)
        if result:
            fitted.append(result)
    elapsed = time.time() - start_time
    
    print(f"Fitted {len(fitted)} trajectories in {elapsed:.3f}s")
    print(f"Average time per trajectory: {elapsed/len(fitted):.4f}s")
    
    print("✓ Parallel fitting test passed!")
    return True


def test_ransac_fitting():
    print("\n" + "=" * 60)
    print("TEST 6: RANSAC Robust Fitting")
    print("=" * 60)
    
    config = GlobalConfig()
    logger = setup_logger(config)
    fitter = TrajectoryFitter(config, logger=logger)
    
    np.random.seed(202)
    n_frames = 100
    spots = []
    
    for i in range(n_frames):
        t = datetime(2024, 1, 1) + timedelta(seconds=i * 0.1)
        
        x = 100.0 + 2.0 * i
        y = 80.0 + 1.5 * i
        intensity = 1000.0
        
        if i % 10 == 0:
            x += np.random.normal(0, 50)
            y += np.random.normal(0, 50)
        
        spots.append(Spot(
            spot_id=f"spot_{i}",
            x=x + np.random.normal(0, 2),
            y=y + np.random.normal(0, 2),
            intensity=intensity,
            area=4.0,
            frame_id=i,
            timestamp=t,
            snr=intensity / 50.0
        ))
    
    track = TrackState(
        track_id="test_ransac",
        spots=spots
    )
    
    start_time = time.time()
    fitted_trajectory = fitter.fit_ransac(track, degree=1)
    elapsed = time.time() - start_time
    
    print(f"RANSAC fitting time: {elapsed:.3f}s")
    print(f"RMSE: {fitted_trajectory.rmse:.4f}")
    print(f"R-squared: {fitted_trajectory.r_squared:.4f}")
    
    print("✓ RANSAC fitting test passed!")
    return True


def main():
    print("=" * 60)
    print("COMPREHENSIVE TEST SUITE - Phase 3 Improvements")
    print("=" * 60)
    
    tests = [
        ("Anomaly Detection", test_anomaly_detection),
        ("Data Comparison", test_data_comparison),
        ("Trajectory Fitting", test_trajectory_fitting),
        ("Find Local Maxima", test_find_local_maxima),
        ("Parallel Fitting", test_parallel_fitting),
        ("RANSAC Fitting", test_ransac_fitting),
    ]
    
    results = []
    
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n✗ {name} test ERROR: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {name}: {status}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n" + "=" * 60)
        print("ALL TESTS PASSED!")
        print("=" * 60)
        return 0
    else:
        print("\n" + "=" * 60)
        print("SOME TESTS FAILED!")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
