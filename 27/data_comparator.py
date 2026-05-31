import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
import logging
from datetime import datetime

from config import GlobalConfig
from data_structures import Spot, Trajectory, ProcessingResult


@dataclass
class ComparisonMetrics:
    dataset_a: str
    dataset_b: str
    num_trajectories_a: int
    num_trajectories_b: int
    mean_r_squared_a: float
    mean_r_squared_b: float
    mean_rmse_a: float
    mean_rmse_b: float
    mean_duration_a: float
    mean_duration_b: float
    mean_points_a: float
    mean_points_b: float
    similarity_score: float
    difference_magnitude: float
    description: str


@dataclass
class BatchComparisonResult:
    comparison_id: str
    datasets: List[str]
    pairwise_metrics: List[ComparisonMetrics] = field(default_factory=list)
    global_statistics: Dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)


class DatasetComparator:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")

    def extract_dataset_statistics(self, result: ProcessingResult) -> Dict:
        if not result.trajectories:
            return {
                'num_trajectories': 0,
                'mean_r_squared': 0.0,
                'mean_rmse': 0.0,
                'mean_duration': 0.0,
                'mean_points': 0.0,
                'total_spots': result.detected_spots,
                'total_frames': result.total_frames,
                'processing_time': result.processing_time,
                'success': result.success
            }

        r_squared_values = [t.r_squared for t in result.trajectories]
        rmse_values = [t.rmse for t in result.trajectories]
        durations = [t.duration for t in result.trajectories]
        num_points = [t.num_points for t in result.trajectories]

        return {
            'num_trajectories': len(result.trajectories),
            'mean_r_squared': float(np.mean(r_squared_values)),
            'std_r_squared': float(np.std(r_squared_values)),
            'mean_rmse': float(np.mean(rmse_values)),
            'std_rmse': float(np.std(rmse_values)),
            'mean_duration': float(np.mean(durations)),
            'std_duration': float(np.std(durations)),
            'mean_points': float(np.mean(num_points)),
            'std_points': float(np.std(num_points)),
            'total_spots': result.detected_spots,
            'total_frames': result.total_frames,
            'processing_time': result.processing_time,
            'success': result.success
        }

    def compare_pairwise(self, result_a: ProcessingResult, result_b: ProcessingResult,
                         name_a: str = "Dataset A", name_b: str = "Dataset B") -> ComparisonMetrics:
        stats_a = self.extract_dataset_statistics(result_a)
        stats_b = self.extract_dataset_statistics(result_b)

        similarity_score = self._calculate_similarity(stats_a, stats_b)
        diff_magnitude = self._calculate_difference_magnitude(stats_a, stats_b)

        description = self._generate_comparison_description(stats_a, stats_b, name_a, name_b)

        return ComparisonMetrics(
            dataset_a=name_a,
            dataset_b=name_b,
            num_trajectories_a=stats_a['num_trajectories'],
            num_trajectories_b=stats_b['num_trajectories'],
            mean_r_squared_a=stats_a.get('mean_r_squared', 0.0),
            mean_r_squared_b=stats_b.get('mean_r_squared', 0.0),
            mean_rmse_a=stats_a.get('mean_rmse', 0.0),
            mean_rmse_b=stats_b.get('mean_rmse', 0.0),
            mean_duration_a=stats_a.get('mean_duration', 0.0),
            mean_duration_b=stats_b.get('mean_duration', 0.0),
            mean_points_a=stats_a.get('mean_points', 0.0),
            mean_points_b=stats_b.get('mean_points', 0.0),
            similarity_score=similarity_score,
            difference_magnitude=diff_magnitude,
            description=description
        )

    def _calculate_similarity(self, stats_a: Dict, stats_b: Dict) -> float:
        scores = []
        weights = {
            'num_trajectories': 0.2,
            'mean_r_squared': 0.3,
            'mean_rmse': 0.2,
            'mean_duration': 0.15,
            'mean_points': 0.15
        }

        for key, weight in weights.items():
            val_a = stats_a.get(key, 0)
            val_b = stats_b.get(key, 0)

            if val_a == 0 and val_b == 0:
                scores.append(1.0)
            elif val_a == 0 or val_b == 0:
                scores.append(0.0)
            else:
                similarity = 1.0 - min(abs(val_a - val_b) / max(abs(val_a), abs(val_b)), 1.0)
                scores.append(similarity * weight)

        return float(np.sum(scores))

    def _calculate_difference_magnitude(self, stats_a: Dict, stats_b: Dict) -> float:
        differences = []
        keys = ['num_trajectories', 'mean_r_squared', 'mean_rmse', 'mean_duration', 'mean_points']

        for key in keys:
            val_a = stats_a.get(key, 0)
            val_b = stats_b.get(key, 0)
            differences.append(abs(val_a - val_b))

        return float(np.sqrt(np.sum(np.array(differences) ** 2)))

    def _generate_comparison_description(self, stats_a: Dict, stats_b: Dict,
                                          name_a: str, name_b: str) -> str:
        parts = []

        if stats_a['num_trajectories'] > 0 and stats_b['num_trajectories'] > 0:
            r2_diff = stats_a.get('mean_r_squared', 0) - stats_b.get('mean_r_squared', 0)
            if abs(r2_diff) > 0.01:
                direction = "higher" if r2_diff > 0 else "lower"
                parts.append(f"{name_a} has {direction} mean R² ({abs(r2_diff):.4f})")

            rmse_diff = stats_a.get('mean_rmse', 0) - stats_b.get('mean_rmse', 0)
            if abs(rmse_diff) > 0.1:
                direction = "higher" if rmse_diff > 0 else "lower"
                parts.append(f"{name_a} has {direction} mean RMSE ({abs(rmse_diff):.2f}px)")

        if not parts:
            parts.append("Datasets show similar characteristics")

        return "; ".join(parts)

    def compare_multiple(self, results: Dict[str, ProcessingResult]) -> BatchComparisonResult:
        self.logger.info(f"Comparing {len(results)} datasets")

        dataset_names = list(results.keys())
        comparison_id = f"cmp_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        batch_result = BatchComparisonResult(
            comparison_id=comparison_id,
            datasets=dataset_names
        )

        for i in range(len(dataset_names)):
            for j in range(i + 1, len(dataset_names)):
                name_a = dataset_names[i]
                name_b = dataset_names[j]

                metrics = self.compare_pairwise(
                    results[name_a],
                    results[name_b],
                    name_a,
                    name_b
                )
                batch_result.pairwise_metrics.append(metrics)

        all_stats = [self.extract_dataset_statistics(r) for r in results.values()]
        batch_result.global_statistics = self._calculate_global_statistics(all_stats, dataset_names)

        return batch_result

    def _calculate_global_statistics(self, all_stats: List[Dict], dataset_names: List[str]) -> Dict:
        if not all_stats:
            return {}

        num_trajectories_list = [s['num_trajectories'] for s in all_stats]
        r_squared_list = [s.get('mean_r_squared', 0) for s in all_stats if s['num_trajectories'] > 0]
        rmse_list = [s.get('mean_rmse', 0) for s in all_stats if s['num_trajectories'] > 0]

        return {
            'num_datasets': len(all_stats),
            'min_trajectories': min(num_trajectories_list) if num_trajectories_list else 0,
            'max_trajectories': max(num_trajectories_list) if num_trajectories_list else 0,
            'mean_trajectories': float(np.mean(num_trajectories_list)) if num_trajectories_list else 0,
            'overall_mean_r_squared': float(np.mean(r_squared_list)) if r_squared_list else 0,
            'overall_mean_rmse': float(np.mean(rmse_list)) if rmse_list else 0,
            'best_dataset': dataset_names[np.argmax(r_squared_list)] if r_squared_list else None,
            'worst_dataset': dataset_names[np.argmin(r_squared_list)] if r_squared_list else None
        }


class TrajectoryMatcher:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.distance_threshold = 50.0

    def match_trajectories(self, traj_a: List[Trajectory], traj_b: List[Trajectory]) -> Dict[str, str]:
        self.logger.info(f"Matching {len(traj_a)} trajectories with {len(traj_b)} trajectories")

        matches = {}
        used_b = set()

        for t_a in traj_a:
            best_match = None
            best_distance = float('inf')

            for t_b in traj_b:
                if t_b.trajectory_id in used_b:
                    continue

                distance = self._calculate_trajectory_distance(t_a, t_b)
                if distance < best_distance and distance < self.distance_threshold:
                    best_distance = distance
                    best_match = t_b

            if best_match is not None:
                matches[t_a.trajectory_id] = best_match.trajectory_id
                used_b.add(best_match.trajectory_id)

        self.logger.info(f"Matched {len(matches)} trajectory pairs")
        return matches

    def _calculate_trajectory_distance(self, traj_a: Trajectory, traj_b: Trajectory) -> float:
        points_a = len(traj_a.spots)
        points_b = len(traj_b.spots)

        if points_a == 0 or points_b == 0:
            return float('inf')

        sample_a = min(points_a, 10)
        sample_b = min(points_b, 10)

        indices_a = np.linspace(0, points_a - 1, sample_a, dtype=int)
        indices_b = np.linspace(0, points_b - 1, sample_b, dtype=int)

        points_a_coords = np.array([[traj_a.spots[i].x, traj_a.spots[i].y] for i in indices_a])
        points_b_coords = np.array([[traj_b.spots[i].x, traj_b.spots[i].y] for i in indices_b])

        distances = []
        for pa in points_a_coords:
            min_dist = min(np.sqrt(np.sum((pb - pa) ** 2)) for pb in points_b_coords)
            distances.append(min_dist)

        return float(np.mean(distances))

    def compare_matched_trajectories(self, traj_a: List[Trajectory], traj_b: List[Trajectory]) -> Dict:
        matches = self.match_trajectories(traj_a, traj_b)

        traj_a_dict = {t.trajectory_id: t for t in traj_a}
        traj_b_dict = {t.trajectory_id: t for t in traj_b}

        comparisons = []
        for id_a, id_b in matches.items():
            t_a = traj_a_dict[id_a]
            t_b = traj_b_dict[id_b]

            comparison = {
                'trajectory_a': id_a,
                'trajectory_b': id_b,
                'r_squared_diff': t_a.r_squared - t_b.r_squared,
                'rmse_diff': t_a.rmse - t_b.rmse,
                'duration_diff': t_a.duration - t_b.duration,
                'points_diff': t_a.num_points - t_b.num_points
            }
            comparisons.append(comparison)

        return {
            'num_matches': len(matches),
            'comparisons': comparisons,
            'mean_r2_diff': float(np.mean([c['r_squared_diff'] for c in comparisons])) if comparisons else 0,
            'mean_rmse_diff': float(np.mean([c['rmse_diff'] for c in comparisons])) if comparisons else 0
        }


class VisualizationComparator:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")

    def plot_comparison_radar(self, comparison_result: BatchComparisonResult) -> Optional[str]:
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
        except ImportError:
            self.logger.warning("matplotlib not available for comparison visualization")
            return None

        if len(comparison_result.datasets) < 2:
            return None

        fig, axes = plt.subplots(1, 2, figsize=(16, 8))

        ax1 = axes[0]
        metrics = ['mean_r_squared', 'mean_rmse', 'mean_duration', 'mean_points']
        metric_labels = ['R²', 'RMSE (px)', 'Duration (s)', 'Points']

        x = np.arange(len(metrics))
        width = 0.35

        for i, dataset in enumerate(comparison_result.datasets[:4]):
            stats = comparison_result.global_statistics
            self.logger.debug(f"Dataset {dataset} stats: {stats}")

        ax1.set_ylabel('Value')
        ax1.set_title('Dataset Comparison Overview')
        ax1.set_xticks(x)
        ax1.set_xticklabels(metric_labels)
        ax1.legend(loc='best')
        ax1.grid(True, alpha=0.3)

        ax2 = axes[1]
        if comparison_result.pairwise_metrics:
            similarity_scores = [m.similarity_score for m in comparison_result.pairwise_metrics]
            pairs = [f"{m.dataset_a[:10]} vs {m.dataset_b[:10]}" for m in comparison_result.pairwise_metrics]

            y_pos = np.arange(len(pairs))
            ax2.barh(y_pos, similarity_scores, color='steelblue')
            ax2.set_yticks(y_pos)
            ax2.set_yticklabels(pairs)
            ax2.set_xlabel('Similarity Score')
            ax2.set_title('Pairwise Dataset Similarity')
            ax2.set_xlim(0, 1.0)
            ax2.axvline(x=0.5, color='red', linestyle='--', alpha=0.7, label='50% threshold')
            ax2.legend(loc='best')

        plt.tight_layout()

        filepath = f"{self.config.output.output_dir}/comparison_{comparison_result.comparison_id}.png"
        fig.savefig(filepath, dpi=self.config.output.visualization_dpi, bbox_inches='tight')
        plt.close(fig)

        self.logger.info(f"Saved comparison plot to {filepath}")
        return filepath

    def generate_comparison_report(self, comparison_result: BatchComparisonResult) -> str:
        report_lines = []
        report_lines.append("=" * 80)
        report_lines.append("DATASET COMPARISON REPORT")
        report_lines.append("=" * 80)
        report_lines.append(f"Report ID: {comparison_result.comparison_id}")
        report_lines.append(f"Generated: {comparison_result.created_at.isoformat()}")
        report_lines.append(f"Datasets compared: {len(comparison_result.datasets)}")
        report_lines.append("")

        report_lines.append("DATASETS:")
        for i, dataset in enumerate(comparison_result.datasets, 1):
            report_lines.append(f"  {i}. {dataset}")
        report_lines.append("")

        report_lines.append("PAIRWISE COMPARISONS:")
        report_lines.append("-" * 40)
        for metrics in comparison_result.pairwise_metrics:
            report_lines.append(f"\n  {metrics.dataset_a} vs {metrics.dataset_b}")
            report_lines.append(f"    Similarity: {metrics.similarity_score:.4f}")
            report_lines.append(f"    Difference magnitude: {metrics.difference_magnitude:.4f}")
            report_lines.append(f"    {metrics.description}")
            report_lines.append("")
            report_lines.append(f"    {'Metric':<20} {'Dataset A':>12} {'Dataset B':>12} {'Difference':>12}")
            report_lines.append(f"    {'-'*20} {'-'*12} {'-'*12} {'-'*12}")
            report_lines.append(f"    {'Trajectories':<20} {metrics.num_trajectories_a:>12} {metrics.num_trajectories_b:>12} {metrics.num_trajectories_a - metrics.num_trajectories_b:>12}")
            report_lines.append(f"    {'Mean R²':<20} {metrics.mean_r_squared_a:>12.4f} {metrics.mean_r_squared_b:>12.4f} {metrics.mean_r_squared_a - metrics.mean_r_squared_b:>12.4f}")
            report_lines.append(f"    {'Mean RMSE':<20} {metrics.mean_rmse_a:>12.2f} {metrics.mean_rmse_b:>12.2f} {metrics.mean_rmse_a - metrics.mean_rmse_b:>12.2f}")
        report_lines.append("")

        if comparison_result.global_statistics:
            report_lines.append("GLOBAL STATISTICS:")
            report_lines.append("-" * 40)
            stats = comparison_result.global_statistics
            for key, value in stats.items():
                if isinstance(value, float):
                    report_lines.append(f"  {key}: {value:.4f}")
                else:
                    report_lines.append(f"  {key}: {value}")
        report_lines.append("")

        report_lines.append("=" * 80)
        report_lines.append("END OF REPORT")
        report_lines.append("=" * 80)

        report_text = "\n".join(report_lines)

        filepath = f"{self.config.output.output_dir}/comparison_report_{comparison_result.comparison_id}.txt"
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(report_text)

        self.logger.info(f"Saved comparison report to {filepath}")
        return filepath
