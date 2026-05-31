import numpy as np
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass, field
from collections import defaultdict
import logging
from datetime import datetime

from config import GlobalConfig
from data_structures import Spot, Trajectory


@dataclass
class AnomalyPoint:
    spot: Spot
    anomaly_type: str
    severity: float
    description: str
    frame_id: int
    position_deviation: float = 0.0
    intensity_deviation: float = 0.0


@dataclass
class AnomalyReport:
    trajectory_id: str
    total_points: int
    anomaly_points: List[AnomalyPoint] = field(default_factory=list)
    outlier_count: int = 0
    jump_count: int = 0
    intensity_spike_count: int = 0
    missing_frames: List[int] = field(default_factory=list)

    @property
    def anomaly_rate(self) -> float:
        if self.total_points == 0:
            return 0.0
        return len(self.anomaly_points) / self.total_points


class TrajectoryAnomalyDetector:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.zscore_threshold = 3.0
        self.jump_threshold = 10.0
        self.intensity_spike_threshold = 5.0
        self.missing_frame_gap = 3

    def detect_outliers_iqr(self, trajectory: Trajectory) -> List[AnomalyPoint]:
        if len(trajectory.spots) < 5:
            return []

        x_coords = np.array([s.x for s in trajectory.spots])
        y_coords = np.array([s.y for s in trajectory.spots])
        distances = np.sqrt(np.diff(x_coords) ** 2 + np.diff(y_coords) ** 2)

        if len(distances) < 3:
            return []

        Q1 = np.percentile(distances, 25)
        Q3 = np.percentile(distances, 75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR

        anomalies = []
        for i, dist in enumerate(distances):
            if dist > upper_bound or dist < lower_bound:
                severity = abs(dist - (Q1 + Q3) / 2) / (IQR + 1e-10)
                anomalies.append(AnomalyPoint(
                    spot=trajectory.spots[i + 1],
                    anomaly_type='outlier',
                    severity=float(severity),
                    description=f'Step distance {dist:.2f}px outside IQR bounds [{lower_bound:.2f}, {upper_bound:.2f}]',
                    frame_id=trajectory.spots[i + 1].frame_id,
                    position_deviation=float(abs(dist - (Q1 + Q3) / 2))
                ))

        return anomalies

    def detect_outliers_zscore(self, trajectory: Trajectory) -> List[AnomalyPoint]:
        if len(trajectory.spots) < 5:
            return []

        times = np.array([
            (s.timestamp - trajectory.start_time).total_seconds()
            for s in trajectory.spots
        ])
        x_coords = np.array([s.x for s in trajectory.spots])
        y_coords = np.array([s.y for s in trajectory.spots])

        if len(times) < 3:
            return []

        x_fit = np.polyfit(times, x_coords, min(3, len(times) - 1))
        y_fit = np.polyfit(times, y_coords, min(3, len(times) - 1))

        x_pred = np.polyval(x_fit, times)
        y_pred = np.polyval(y_fit, times)

        x_residuals = x_coords - x_pred
        y_residuals = y_coords - y_pred
        residuals = np.sqrt(x_residuals ** 2 + y_residuals ** 2)

        mean_res = np.mean(residuals)
        std_res = np.std(residuals)

        if std_res < 1e-10:
            return []

        z_scores = (residuals - mean_res) / std_res

        anomalies = []
        for i, z_score in enumerate(z_scores):
            if abs(z_score) > self.zscore_threshold:
                anomalies.append(AnomalyPoint(
                    spot=trajectory.spots[i],
                    anomaly_type='zscore_outlier',
                    severity=float(abs(z_score)),
                    description=f'Residual z-score {z_score:.2f} exceeds threshold {self.zscore_threshold}',
                    frame_id=trajectory.spots[i].frame_id,
                    position_deviation=float(residuals[i])
                ))

        return anomalies

    def detect_jumps(self, trajectory: Trajectory) -> List[AnomalyPoint]:
        if len(trajectory.spots) < 3:
            return []

        x_coords = np.array([s.x for s in trajectory.spots])
        y_coords = np.array([s.y for s in trajectory.spots])
        times = np.array([
            (s.timestamp - trajectory.start_time).total_seconds()
            for s in trajectory.spots
        ])

        if len(times) < 2:
            return []

        dt = np.diff(times)
        dt[dt == 0] = 1.0

        dx = np.diff(x_coords) / dt
        dy = np.diff(y_coords) / dt
        speed = np.sqrt(dx ** 2 + dy ** 2)

        if len(speed) < 2:
            return []

        speed_change = np.abs(np.diff(speed))

        mean_speed = np.mean(speed)
        if mean_speed < 1e-10:
            return []

        anomalies = []
        for i, change in enumerate(speed_change):
            relative_change = change / mean_speed
            if relative_change > self.jump_threshold:
                anomalies.append(AnomalyPoint(
                    spot=trajectory.spots[i + 2],
                    anomaly_type='velocity_jump',
                    severity=float(relative_change),
                    description=f'Velocity change {change:.2f}px/s ({relative_change:.1f}x mean speed {mean_speed:.2f})',
                    frame_id=trajectory.spots[i + 2].frame_id,
                    position_deviation=float(change)
                ))

        return anomalies

    def detect_intensity_spikes(self, trajectory: Trajectory) -> List[AnomalyPoint]:
        if len(trajectory.spots) < 3:
            return []

        intensities = np.array([s.intensity for s in trajectory.spots])

        if len(intensities) < 3:
            return []

        median_intensity = np.median(intensities)
        std_intensity = np.std(intensities)

        if std_intensity < 1e-10:
            return []

        anomalies = []
        for i, intensity in enumerate(intensities):
            deviation = abs(intensity - median_intensity) / std_intensity
            if deviation > self.intensity_spike_threshold:
                anomalies.append(AnomalyPoint(
                    spot=trajectory.spots[i],
                    anomaly_type='intensity_spike',
                    severity=float(deviation),
                    description=f'Intensity {intensity:.1f} deviates {deviation:.1f}σ from median {median_intensity:.1f}',
                    frame_id=trajectory.spots[i].frame_id,
                    intensity_deviation=float(abs(intensity - median_intensity))
                ))

        return anomalies

    def detect_missing_frames(self, trajectory: Trajectory) -> List[int]:
        if len(trajectory.spots) < 2:
            return []

        frame_ids = sorted([s.frame_id for s in trajectory.spots])
        expected_range = set(range(frame_ids[0], frame_ids[-1] + 1))
        actual_frames = set(frame_ids)
        missing = sorted(expected_range - actual_frames)

        gaps = []
        if missing:
            current_gap = [missing[0]]
            for m in missing[1:]:
                if m == current_gap[-1] + 1:
                    current_gap.append(m)
                else:
                    if len(current_gap) >= self.missing_frame_gap:
                        gaps.extend(current_gap)
                    current_gap = [m]
            if len(current_gap) >= self.missing_frame_gap:
                gaps.extend(current_gap)

        return gaps

    def detect_all_anomalies(self, trajectory: Trajectory) -> AnomalyReport:
        report = AnomalyReport(
            trajectory_id=trajectory.trajectory_id,
            total_points=len(trajectory.spots)
        )

        iqr_outliers = self.detect_outliers_iqr(trajectory)
        zscore_outliers = self.detect_outliers_zscore(trajectory)
        jumps = self.detect_jumps(trajectory)
        intensity_spikes = self.detect_intensity_spikes(trajectory)
        missing_frames = self.detect_missing_frames(trajectory)

        all_anomalies = iqr_outliers + zscore_outliers + jumps + intensity_spikes

        seen_frames = set()
        unique_anomalies = []
        for anomaly in all_anomalies:
            if anomaly.frame_id not in seen_frames:
                seen_frames.add(anomaly.frame_id)
                unique_anomalies.append(anomaly)

        report.anomaly_points = sorted(unique_anomalies, key=lambda x: x.frame_id)
        report.outlier_count = len(iqr_outliers) + len(zscore_outliers)
        report.jump_count = len(jumps)
        report.intensity_spike_count = len(intensity_spikes)
        report.missing_frames = missing_frames

        return report

    def filter_trajectory(self, trajectory: Trajectory, anomaly_report: AnomalyReport) -> Trajectory:
        anomalous_frames = {a.frame_id for a in anomaly_report.anomaly_points}
        filtered_spots = [s for s in trajectory.spots if s.frame_id not in anomalous_frames]

        if len(filtered_spots) < 3:
            return trajectory

        times = np.array([
            (s.timestamp - trajectory.start_time).total_seconds()
            for s in filtered_spots
        ])
        x_coords = np.array([s.x for s in filtered_spots])
        y_coords = np.array([s.y for s in filtered_spots])

        degree = min(self.config.processing.polynomial_degree, len(times) - 1)
        x_coeffs = np.polyfit(times, x_coords, degree)
        y_coeffs = np.polyfit(times, y_coords, degree)

        coefficients = np.concatenate([x_coeffs, y_coeffs])

        x_pred = np.polyval(x_coeffs, times)
        y_pred = np.polyval(y_coeffs, times)

        x_residual = x_coords - x_pred
        y_residual = y_coords - y_pred

        ss_res = np.sum(x_residual ** 2) + np.sum(y_residual ** 2)
        ss_tot = np.sum((x_coords - x_coords.mean()) ** 2) + np.sum((y_coords - y_coords.mean()) ** 2)

        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
        rmse = np.sqrt(ss_res / (2 * len(times)))

        return Trajectory(
            trajectory_id=trajectory.trajectory_id,
            spots=filtered_spots,
            coefficients=coefficients,
            fitting_method=trajectory.fitting_method + '_filtered',
            r_squared=float(r_squared),
            rmse=float(rmse),
            start_time=filtered_spots[0].timestamp if filtered_spots else trajectory.start_time,
            end_time=filtered_spots[-1].timestamp if filtered_spots else trajectory.end_time
        )


class BatchAnomalyDetector:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.detector = TrajectoryAnomalyDetector(config, logger)

    def analyze_trajectories(self, trajectories: List[Trajectory]) -> Dict[str, AnomalyReport]:
        self.logger.info(f"Analyzing anomalies for {len(trajectories)} trajectories")

        reports = {}
        for trajectory in trajectories:
            report = self.detector.detect_all_anomalies(trajectory)
            reports[trajectory.trajectory_id] = report

            if report.anomaly_points:
                self.logger.debug(
                    f"Trajectory {trajectory.trajectory_id[:8]}: "
                    f"{len(report.anomaly_points)} anomalies detected "
                    f"(rate: {report.anomaly_rate:.2%})"
                )

        return reports

    def get_summary(self, reports: Dict[str, AnomalyReport]) -> Dict:
        total_trajectories = len(reports)
        total_anomalies = sum(len(r.anomaly_points) for r in reports.values())
        total_outliers = sum(r.outlier_count for r in reports.values())
        total_jumps = sum(r.jump_count for r in reports.values())
        total_intensity_spikes = sum(r.intensity_spike_count for r in reports.values())
        total_missing = sum(len(r.missing_frames) for r in reports.values())

        anomaly_rates = [r.anomaly_rate for r in reports.values()]

        return {
            'total_trajectories': total_trajectories,
            'total_anomalies': total_anomalies,
            'total_outliers': total_outliers,
            'total_velocity_jumps': total_jumps,
            'total_intensity_spikes': total_intensity_spikes,
            'total_missing_frames': total_missing,
            'mean_anomaly_rate': float(np.mean(anomaly_rates)) if anomaly_rates else 0.0,
            'max_anomaly_rate': float(np.max(anomaly_rates)) if anomaly_rates else 0.0,
            'trajectories_with_anomalies': sum(1 for r in reports.values() if r.anomaly_points),
            'anomaly_rate_above_10pct': sum(1 for r in reports.values() if r.anomaly_rate > 0.1)
        }
