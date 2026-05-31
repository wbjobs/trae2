import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass, field
from collections import defaultdict
import logging
from datetime import datetime

from config import GlobalConfig
from data_structures import Spot, Trajectory


@dataclass
class TrackedSpot:
    spot: Spot
    track_id: str
    prediction: Optional[Tuple[float, float]] = None


@dataclass
class TrackState:
    track_id: str
    spots: List[Spot] = field(default_factory=list)
    last_prediction: Optional[Tuple[float, float]] = None
    velocity: Optional[Tuple[float, float]] = None
    missed_frames: int = 0
    active: bool = True

    @property
    def last_spot(self) -> Optional[Spot]:
        if self.spots:
            return self.spots[-1]
        return None

    @property
    def first_spot(self) -> Optional[Spot]:
        if self.spots:
            return self.spots[0]
        return None

    @property
    def num_spots(self) -> int:
        return len(self.spots)


class SpotTracker:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.max_distance: float = 50.0
        self.max_missed_frames: int = 3
        self.min_track_length: int = 3

    def _calculate_distance(self, spot1: Spot, spot2: Spot) -> float:
        return np.sqrt((spot1.x - spot2.x) ** 2 + (spot1.y - spot2.y) ** 2)

    def _predict_next_position(self, track: TrackState) -> Optional[Tuple[float, float]]:
        if len(track.spots) < 2:
            return None

        last_two = track.spots[-2:]
        dt = (last_two[1].timestamp - last_two[0].timestamp).total_seconds()
        if dt <= 0:
            dt = 1.0

        vx = (last_two[1].x - last_two[0].x) / dt
        vy = (last_two[1].y - last_two[0].y) / dt

        next_x = last_two[1].x + vx
        next_y = last_two[1].y + vy

        return (next_x, next_y)

    def _match_spots_to_tracks(self,
                                spots: List[Spot],
                                tracks: Dict[str, TrackState]) -> Dict[str, Optional[Spot]]:
        matches: Dict[str, Optional[Spot]] = {tid: None for tid in tracks}
        if not spots:
            return matches

        spot_coords = np.array([[s.y, s.x] for s in spots])
        spot_ids = list(range(len(spots)))
        used_mask = np.zeros(len(spots), dtype=bool)

        active_tracks = [t for t in tracks.values() if t.active and t.last_spot is not None]
        active_tracks.sort(key=lambda t: t.last_spot.timestamp, reverse=True)

        for track in active_tracks:
            prediction = self._predict_next_position(track)
            if prediction:
                ref_x, ref_y = prediction
            else:
                ref_x, ref_y = track.last_spot.x, track.last_spot.y

            available = ~used_mask
            if not np.any(available):
                break

            available_indices = np.where(available)[0]
            available_coords = spot_coords[available_indices]

            distances = np.sqrt((available_coords[:, 1] - ref_x) ** 2 + (available_coords[:, 0] - ref_y) ** 2)
            valid_mask = distances < self.max_distance

            if np.any(valid_mask):
                best_local_idx = np.argmin(distances)
                best_global_idx = available_indices[best_local_idx]
                matches[track.track_id] = spots[best_global_idx]
                used_mask[best_global_idx] = True

        return matches

    def track_spots(self, spots_by_frame: Dict[int, List[Spot]]) -> List[TrackState]:
        self.logger.info(f"Starting spot tracking across {len(spots_by_frame)} frames")

        tracks: Dict[str, TrackState] = {}
        next_track_id = 0

        sorted_frames = sorted(spots_by_frame.keys())

        for frame_id in sorted_frames:
            spots = spots_by_frame[frame_id]

            matches = self._match_spots_to_tracks(spots, tracks)

            matched_spots = set()
            for track_id, spot in matches.items():
                if spot is not None:
                    tracks[track_id].spots.append(spot)
                    tracks[track_id].missed_frames = 0
                    matched_spots.add(id(spot))
                else:
                    tracks[track_id].missed_frames += 1
                    if tracks[track_id].missed_frames > self.max_missed_frames:
                        tracks[track_id].active = False

            for spot in spots:
                if id(spot) not in matched_spots:
                    track_id = f"track_{next_track_id:06d}"
                    next_track_id += 1
                    tracks[track_id] = TrackState(
                        track_id=track_id,
                        spots=[spot]
                    )

        valid_tracks = [
            t for t in tracks.values()
            if t.num_spots >= self.min_track_length
        ]

        self.logger.info(f"Tracking completed. Found {len(valid_tracks)} valid tracks (min {self.min_track_length} points)")
        return valid_tracks


class TrajectoryFitter:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.default_degree = config.processing.polynomial_degree
        self._ransac_max_iterations = 100
        self._ransac_inlier_threshold = 3.0

    def _time_to_seconds(self, spots: List[Spot]) -> np.ndarray:
        if not spots:
            return np.array([])

        start_time = spots[0].timestamp
        times = np.array([
            (spot.timestamp - start_time).total_seconds()
            for spot in spots
        ], dtype=np.float64)

        return times

    def _select_optimal_degree(self, times: np.ndarray, x_coords: np.ndarray,
                               y_coords: np.ndarray, max_degree: int = 5) -> int:
        n = len(times)
        if n < 4:
            return min(2, n - 1)

        max_degree = min(max_degree, n - 1)
        best_degree = 2
        best_bic = float('inf')

        for degree in range(2, max_degree + 1):
            x_coeffs = np.polyfit(times, x_coords, degree)
            y_coeffs = np.polyfit(times, y_coords, degree)

            x_pred = np.polyval(x_coeffs, times)
            y_pred = np.polyval(y_coeffs, times)

            x_residual = x_coords - x_pred
            y_residual = y_coords - y_pred

            ss_res = np.sum(x_residual ** 2) + np.sum(y_residual ** 2)
            k = 2 * (degree + 1)

            if ss_res <= 0 or n - k - 1 <= 0:
                continue

            bic = n * np.log(ss_res / n) + k * np.log(n)

            if bic < best_bic:
                best_bic = bic
                best_degree = degree

        return best_degree

    def fit_polynomial(self, track: TrackState, degree: Optional[int] = None,
                       auto_select: bool = True) -> Optional[Trajectory]:
        if track.num_spots < 3:
            return None

        spots = sorted(track.spots, key=lambda s: s.timestamp)
        times = self._time_to_seconds(spots)

        x_coords = np.array([s.x for s in spots], dtype=np.float64)
        y_coords = np.array([s.y for s in spots], dtype=np.float64)

        n = len(times)

        if auto_select and n > 5:
            degree = self._select_optimal_degree(times, x_coords, y_coords)
        else:
            degree = degree or min(self.default_degree, n - 1)

        degree = max(1, min(degree, n - 1))

        x_coeffs = np.polyfit(times, x_coords, degree)
        y_coeffs = np.polyfit(times, y_coords, degree)

        x_pred = np.polyval(x_coeffs, times)
        y_pred = np.polyval(y_coeffs, times)

        x_residual = x_coords - x_pred
        y_residual = y_coords - y_pred

        ss_res = np.sum(x_residual ** 2) + np.sum(y_residual ** 2)
        ss_tot = np.sum((x_coords - x_coords.mean()) ** 2) + np.sum((y_coords - y_coords.mean()) ** 2)

        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
        rmse = np.sqrt(ss_res / (2 * max(n, 1)))

        coefficients = np.concatenate([x_coeffs, y_coeffs])

        return Trajectory(
            trajectory_id="",
            spots=spots,
            coefficients=coefficients,
            fitting_method=f"polynomial_degree_{degree}",
            r_squared=float(r_squared),
            rmse=float(rmse),
            start_time=spots[0].timestamp,
            end_time=spots[-1].timestamp
        )

    def fit_ransac(self, track: TrackState, degree: Optional[int] = None) -> Optional[Trajectory]:
        if track.num_spots < 6:
            return self.fit_polynomial(track, degree)

        spots = sorted(track.spots, key=lambda s: s.timestamp)
        times = self._time_to_seconds(spots)

        x_coords = np.array([s.x for s in spots], dtype=np.float64)
        y_coords = np.array([s.y for s in spots], dtype=np.float64)

        n = len(times)
        degree = degree or min(self.default_degree, n // 2)
        degree = max(2, min(degree, n - 1))

        best_inliers_x = None
        best_inliers_y = None
        best_inlier_count = 0

        min_samples = max(degree + 1, 4)

        for _ in range(self._ransac_max_iterations):
            indices = np.random.choice(n, size=min_samples, replace=False)
            t_sample = times[indices]
            x_sample = x_coords[indices]
            y_sample = y_coords[indices]

            try:
                x_coeffs = np.polyfit(t_sample, x_sample, degree)
                y_coeffs = np.polyfit(t_sample, y_sample, degree)
            except np.linalg.LinAlgError:
                continue

            x_pred = np.polyval(x_coeffs, times)
            y_pred = np.polyval(y_coeffs, times)

            x_residual = np.abs(x_coords - x_pred)
            y_residual = np.abs(y_coords - y_pred)

            inlier_mask = (x_residual < self._ransac_inlier_threshold) & \
                         (y_residual < self._ransac_inlier_threshold)
            inlier_count = np.sum(inlier_mask)

            if inlier_count > best_inlier_count:
                best_inlier_count = inlier_count
                best_inliers_x = inlier_mask.copy()
                best_inliers_y = inlier_mask.copy()

        if best_inliers_x is None or best_inlier_count < min_samples:
            return self.fit_polynomial(track, degree, auto_select=False)

        inlier_times = times[best_inliers_x]
        inlier_x = x_coords[best_inliers_x]
        inlier_y = y_coords[best_inliers_x]

        x_coeffs = np.polyfit(inlier_times, inlier_x, degree)
        y_coeffs = np.polyfit(inlier_times, inlier_y, degree)

        x_pred = np.polyval(x_coeffs, times)
        y_pred = np.polyval(y_coeffs, times)

        x_residual = x_coords - x_pred
        y_residual = y_coords - y_pred

        ss_res = np.sum(x_residual ** 2) + np.sum(y_residual ** 2)
        ss_tot = np.sum((x_coords - x_coords.mean()) ** 2) + np.sum((y_coords - y_coords.mean()) ** 2)

        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
        rmse = np.sqrt(ss_res / (2 * max(n, 1)))

        coefficients = np.concatenate([x_coeffs, y_coeffs])

        return Trajectory(
            trajectory_id="",
            spots=spots,
            coefficients=coefficients,
            fitting_method=f"ransac_polynomial_degree_{degree}",
            r_squared=float(r_squared),
            rmse=float(rmse),
            start_time=spots[0].timestamp,
            end_time=spots[-1].timestamp
        )

    def fit_kalman(self, track: TrackState) -> Optional[Trajectory]:
        if track.num_spots < 4:
            return None

        spots = sorted(track.spots, key=lambda s: s.timestamp)
        times = self._time_to_seconds(spots)

        x_coords = np.array([s.x for s in spots], dtype=np.float64)
        y_coords = np.array([s.y for s in spots], dtype=np.float64)

        n = len(times)
        dt = np.diff(times) if n > 1 else np.array([1.0])

        x_smoothed = np.zeros(n)
        y_smoothed = np.zeros(n)

        P_x = 1.0
        P_y = 1.0
        Q = 0.1
        R = 1.0

        x_smoothed[0] = x_coords[0]
        y_smoothed[0] = y_coords[0]

        for i in range(1, n):
            dt_i = dt[i - 1] if i - 1 < len(dt) else 1.0

            P_x = P_x + Q * dt_i
            K_x = P_x / (P_x + R)
            x_smoothed[i] = x_smoothed[i - 1] + K_x * (x_coords[i] - x_smoothed[i - 1])
            P_x = (1 - K_x) * P_x

            P_y = P_y + Q * dt_i
            K_y = P_y / (P_y + R)
            y_smoothed[i] = y_smoothed[i - 1] + K_y * (y_coords[i] - y_smoothed[i - 1])
            P_y = (1 - K_y) * P_y

        degree = min(self.default_degree, n - 1)
        x_coeffs = np.polyfit(times, x_smoothed, degree)
        y_coeffs = np.polyfit(times, y_smoothed, degree)

        x_pred = np.polyval(x_coeffs, times)
        y_pred = np.polyval(y_coeffs, times)

        x_residual = x_smoothed - x_pred
        y_residual = y_smoothed - y_pred

        ss_res = np.sum(x_residual ** 2) + np.sum(y_residual ** 2)
        ss_tot = np.sum((x_smoothed - x_smoothed.mean()) ** 2) + np.sum((y_smoothed - y_smoothed.mean()) ** 2)

        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
        rmse = np.sqrt(ss_res / (2 * max(n, 1)))

        coefficients = np.concatenate([x_coeffs, y_coeffs])

        return Trajectory(
            trajectory_id="",
            spots=spots,
            coefficients=coefficients,
            fitting_method="kalman_filter",
            r_squared=float(r_squared),
            rmse=float(rmse),
            start_time=spots[0].timestamp,
            end_time=spots[-1].timestamp
        )

    def auto_fit(self, track: TrackState) -> Optional[Trajectory]:
        n = track.num_spots

        if n < 3:
            return None
        elif n < 6:
            return self.fit_polynomial(track, degree=2, auto_select=False)
        elif n < 15:
            return self.fit_polynomial(track, auto_select=True)
        else:
            ransac_result = self.fit_ransac(track)
            kalman_result = self.fit_kalman(track)
            poly_result = self.fit_polynomial(track, auto_select=True)

            candidates = [r for r in [ransac_result, kalman_result, poly_result] if r is not None]
            if not candidates:
                return None

            best = max(candidates, key=lambda t: t.r_squared)
            return best

    def fit_tracks(self, tracks: List[TrackState], method: str = 'auto') -> List[Trajectory]:
        self.logger.info(f"Fitting {len(tracks)} tracks using method: {method}")

        trajectories = []
        for track in tracks:
            try:
                if method == 'auto':
                    traj = self.auto_fit(track)
                elif method == 'polynomial':
                    traj = self.fit_polynomial(track, auto_select=True)
                elif method == 'ransac':
                    traj = self.fit_ransac(track)
                elif method == 'kalman':
                    traj = self.fit_kalman(track)
                else:
                    raise ValueError(f"Unknown fitting method: {method}")

                if traj is not None and traj.r_squared > 0.5:
                    trajectories.append(traj)
            except Exception as e:
                self.logger.debug(f"Failed to fit track {track.track_id}: {e}")
                continue

        self.logger.info(f"Successfully fitted {len(trajectories)} trajectories")
        return trajectories


class TrajectoryAnalyzer:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")

    def calculate_velocity(self, trajectory: Trajectory) -> Tuple[float, float, float]:
        times = np.array([
            (s.timestamp - trajectory.start_time).total_seconds()
            for s in trajectory.spots
        ])

        x_coords = np.array([s.x for s in trajectory.spots])
        y_coords = np.array([s.y for s in trajectory.spots])

        if len(times) < 2:
            return (0.0, 0.0, 0.0)

        dt = np.diff(times)
        dx = np.diff(x_coords)
        dy = np.diff(y_coords)

        dt[dt == 0] = 1.0

        vx = dx / dt
        vy = dy / dt
        speed = np.sqrt(vx ** 2 + vy ** 2)

        return (float(np.mean(vx)), float(np.mean(vy)), float(np.mean(speed)))

    def calculate_acceleration(self, trajectory: Trajectory) -> Tuple[float, float, float]:
        times = np.array([
            (s.timestamp - trajectory.start_time).total_seconds()
            for s in trajectory.spots
        ])

        if len(times) < 3:
            return (0.0, 0.0, 0.0)

        x_coords = np.array([s.x for s in trajectory.spots])
        y_coords = np.array([s.y for s in trajectory.spots])

        dt = np.diff(times)
        dt[dt == 0] = 1.0

        vx = np.diff(x_coords) / dt
        vy = np.diff(y_coords) / dt

        ax = np.diff(vx) / dt[:-1] if len(dt) > 1 else np.array([0.0])
        ay = np.diff(vy) / dt[:-1] if len(dt) > 1 else np.array([0.0])
        accel_mag = np.sqrt(ax ** 2 + ay ** 2)

        return (float(np.mean(ax)), float(np.mean(ay)), float(np.mean(accel_mag)))

    def get_trajectory_summary(self, trajectory: Trajectory) -> Dict:
        vx, vy, speed = self.calculate_velocity(trajectory)
        ax, ay, accel = self.calculate_acceleration(trajectory)

        return {
            'trajectory_id': trajectory.trajectory_id,
            'num_points': trajectory.num_points,
            'duration_seconds': trajectory.duration,
            'r_squared': trajectory.r_squared,
            'rmse': trajectory.rmse,
            'fitting_method': trajectory.fitting_method,
            'mean_velocity_x': vx,
            'mean_velocity_y': vy,
            'mean_speed': speed,
            'mean_acceleration_x': ax,
            'mean_acceleration_y': ay,
            'mean_acceleration_magnitude': accel,
            'start_time': trajectory.start_time.isoformat(),
            'end_time': trajectory.end_time.isoformat()
        }
