import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm, Normalize
from typing import List, Optional, Dict, Tuple
import os
import logging
from datetime import datetime

from config import GlobalConfig
from data_structures import DenoisedFrame, Spot, Trajectory, ProcessingResult
from utils import normalize_image, percentile_clip, save_json, ensure_directory


class ResultVisualizer:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.output_dir = config.output.output_dir
        self.format = config.output.visualization_format
        self.dpi = config.output.visualization_dpi

    def _get_output_path(self, prefix: str, suffix: str = "") -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if suffix:
            filename = f"{prefix}_{suffix}_{timestamp}.{self.format}"
        else:
            filename = f"{prefix}_{timestamp}.{self.format}"
        return os.path.join(self.output_dir, filename)

    def plot_frame_comparison(self, denoised_frame: DenoisedFrame,
                              spots: Optional[List[Spot]] = None,
                              save: bool = True) -> Optional[str]:
        self.logger.info(f"Generating frame comparison plot for frame {denoised_frame.frame_id}")

        fig, axes = plt.subplots(1, 3, figsize=(18, 6))

        original = denoised_frame.original_frame.data
        denoised = denoised_frame.denoised_data
        difference = original - denoised

        vmin, vmax = np.percentile(original, [1, 99])
        norm = Normalize(vmin=vmin, vmax=vmax)

        im1 = axes[0].imshow(original, cmap='gray', norm=norm, origin='lower')
        axes[0].set_title('Original Frame')
        axes[0].set_xlabel('X (pixels)')
        axes[0].set_ylabel('Y (pixels)')
        plt.colorbar(im1, ax=axes[0], fraction=0.046, pad=0.04)

        im2 = axes[1].imshow(denoised, cmap='gray', norm=norm, origin='lower')
        axes[1].set_title(f'Denoised ({denoised_frame.denoising_method})')
        axes[1].set_xlabel('X (pixels)')
        plt.colorbar(im2, ax=axes[1], fraction=0.046, pad=0.04)

        if spots:
            spot_x = [s.x for s in spots if s.frame_id == denoised_frame.frame_id]
            spot_y = [s.y for s in spots if s.frame_id == denoised_frame.frame_id]
            if spot_x:
                axes[1].scatter(spot_x, spot_y, s=50, facecolors='none', edgecolors='red', linewidths=1.5,
                              label=f'Detected spots ({len(spot_x)})')
                axes[1].legend(loc='upper right')

        im3 = axes[2].imshow(difference, cmap='RdBu_r', origin='lower')
        axes[2].set_title('Difference (Original - Denoised)')
        axes[2].set_xlabel('X (pixels)')
        plt.colorbar(im3, ax=axes[2], fraction=0.046, pad=0.04)

        fig.suptitle(f'Frame {denoised_frame.frame_id} - Noise level: {denoised_frame.noise_level:.2f}',
                     fontsize=14, y=1.02)
        plt.tight_layout()

        if save:
            filepath = self._get_output_path("frame_comparison", f"frame_{denoised_frame.frame_id}")
            fig.savefig(filepath, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            self.logger.info(f"Saved frame comparison to {filepath}")
            return filepath
        else:
            return None

    def plot_spots(self, denoised_frame: DenoisedFrame, spots: List[Spot],
                   save: bool = True) -> Optional[str]:
        self.logger.info(f"Generating spot detection plot for frame {denoised_frame.frame_id}")

        fig, ax = plt.subplots(1, 1, figsize=(10, 8))

        data = percentile_clip(denoised_frame.denoised_data, 1, 99)
        im = ax.imshow(data, cmap='gray', origin='lower')

        frame_spots = [s for s in spots if s.frame_id == denoised_frame.frame_id]

        for spot in frame_spots:
            circle = plt.Circle((spot.x, spot.y), np.sqrt(spot.area / np.pi),
                              fill=False, color='red', linewidth=1.5, alpha=0.8)
            ax.add_patch(circle)
            ax.text(spot.x + 5, spot.y + 5, f"SNR:{spot.snr:.1f}",
                    color='yellow', fontsize=8, alpha=0.9)

        ax.set_title(f'Spot Detection - Frame {denoised_frame.frame_id}\n'
                    f'Detected {len(frame_spots)} spots')
        ax.set_xlabel('X (pixels)')
        ax.set_ylabel('Y (pixels)')
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

        plt.tight_layout()

        if save:
            filepath = self._get_output_path("spots", f"frame_{denoised_frame.frame_id}")
            fig.savefig(filepath, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            self.logger.info(f"Saved spot detection plot to {filepath}")
            return filepath
        else:
            return None

    def plot_trajectories(self, trajectories: List[Trajectory],
                          image_shape: Tuple[int, int],
                          background_frame: Optional[np.ndarray] = None,
                          save: bool = True) -> Optional[str]:
        self.logger.info(f"Generating trajectory plot for {len(trajectories)} trajectories")

        fig, ax = plt.subplots(1, 1, figsize=(12, 10))

        if background_frame is not None:
            data = percentile_clip(background_frame, 1, 99)
            ax.imshow(data, cmap='gray', alpha=0.7, origin='lower')
        else:
            ax.set_xlim(0, image_shape[1])
            ax.set_ylim(0, image_shape[0])

        colors = plt.cm.rainbow(np.linspace(0, 1, len(trajectories)))

        for idx, traj in enumerate(trajectories):
            color = colors[idx]

            x_coords = [s.x for s in traj.spots]
            y_coords = [s.y for s in traj.spots]

            times = np.array([(s.timestamp - traj.start_time).total_seconds() for s in traj.spots])
            if len(times) > 1:
                t_fine = np.linspace(times.min(), times.max(), 100)
                x_coeffs = traj.coefficients[:len(traj.coefficients) // 2]
                y_coeffs = traj.coefficients[len(traj.coefficients) // 2:]
                x_fine = np.polyval(x_coeffs, t_fine)
                y_fine = np.polyval(y_coeffs, t_fine)

                ax.plot(x_fine, y_fine, color=color, linewidth=2,
                       label=f'Traj {idx}: R²={traj.r_squared:.3f}')

            ax.scatter(x_coords, y_coords, color=color, s=40, zorder=5,
                      edgecolors='black', linewidths=0.5)

            if x_coords:
                ax.scatter(x_coords[0], y_coords[0], color=color, s=100, marker='o',
                          edgecolors='black', linewidths=1, zorder=6)
                ax.scatter(x_coords[-1], y_coords[-1], color=color, s=100, marker='s',
                          edgecolors='black', linewidths=1, zorder=6)

        ax.set_title(f'Spot Trajectories\n{len(trajectories)} trajectories detected')
        ax.set_xlabel('X (pixels)')
        ax.set_ylabel('Y (pixels)')
        if len(trajectories) <= 10:
            ax.legend(loc='best', fontsize=8)
        ax.set_aspect('equal')
        ax.grid(True, alpha=0.3)

        plt.tight_layout()

        if save:
            filepath = self._get_output_path("trajectories")
            fig.savefig(filepath, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            self.logger.info(f"Saved trajectory plot to {filepath}")
            return filepath
        else:
            return None

    def plot_trajectory_analysis(self, trajectory: Trajectory, save: bool = True) -> Optional[str]:
        self.logger.info(f"Generating detailed analysis for trajectory {trajectory.trajectory_id}")

        fig, axes = plt.subplots(2, 2, figsize=(14, 10))

        times = np.array([(s.timestamp - trajectory.start_time).total_seconds() for s in trajectory.spots])
        x_coords = np.array([s.x for s in trajectory.spots])
        y_coords = np.array([s.y for s in trajectory.spots])
        intensities = np.array([s.intensity for s in trajectory.spots])
        snrs = np.array([s.snr for s in trajectory.spots])

        t_fine = np.linspace(times.min(), times.max(), 100) if len(times) > 1 else times
        x_coeffs = trajectory.coefficients[:len(trajectory.coefficients) // 2]
        y_coeffs = trajectory.coefficients[len(trajectory.coefficients) // 2:]
        x_fine = np.polyval(x_coeffs, t_fine)
        y_fine = np.polyval(y_coeffs, t_fine)

        axes[0, 0].plot(times, x_coords, 'bo-', label='Data')
        axes[0, 0].plot(t_fine, x_fine, 'r--', label='Fit')
        axes[0, 0].set_xlabel('Time (s)')
        axes[0, 0].set_ylabel('X Position (pixels)')
        axes[0, 0].set_title('X Position vs Time')
        axes[0, 0].legend()
        axes[0, 0].grid(True, alpha=0.3)

        axes[0, 1].plot(times, y_coords, 'go-', label='Data')
        axes[0, 1].plot(t_fine, y_fine, 'r--', label='Fit')
        axes[0, 1].set_xlabel('Time (s)')
        axes[0, 1].set_ylabel('Y Position (pixels)')
        axes[0, 1].set_title('Y Position vs Time')
        axes[0, 1].legend()
        axes[0, 1].grid(True, alpha=0.3)

        if len(times) > 1:
            dt = np.diff(times)
            dt[dt == 0] = 1.0
            vx = np.diff(x_coords) / dt
            vy = np.diff(y_coords) / dt
            speed = np.sqrt(vx ** 2 + vy ** 2)

            axes[1, 0].plot(times[:-1], vx, 'b.-', label='Vx')
            axes[1, 0].plot(times[:-1], vy, 'g.-', label='Vy')
            axes[1, 0].set_xlabel('Time (s)')
            axes[1, 0].set_ylabel('Velocity (pixels/s)')
            axes[1, 0].set_title('Velocity Components')
            axes[1, 0].legend()
            axes[1, 0].grid(True, alpha=0.3)

            axes[1, 1].plot(times[:-1], speed, 'm.-')
            axes[1, 1].set_xlabel('Time (s)')
            axes[1, 1].set_ylabel('Speed (pixels/s)')
            axes[1, 1].set_title('Speed vs Time')
            axes[1, 1].grid(True, alpha=0.3)
        else:
            axes[1, 0].text(0.5, 0.5, 'Insufficient data for velocity',
                           ha='center', va='center', transform=axes[1, 0].transAxes)
            axes[1, 1].text(0.5, 0.5, 'Insufficient data for velocity',
                           ha='center', va='center', transform=axes[1, 1].transAxes)

        fig.suptitle(f'Trajectory Analysis\n{trajectory.fitting_method} | '
                    f'R²={trajectory.r_squared:.3f} | RMSE={trajectory.rmse:.2f} | '
                    f'Points={trajectory.num_points}',
                    fontsize=14, y=1.02)
        plt.tight_layout()

        if save:
            filepath = self._get_output_path("trajectory_analysis", trajectory.trajectory_id[:8])
            fig.savefig(filepath, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            self.logger.info(f"Saved trajectory analysis to {filepath}")
            return filepath
        else:
            return None

    def plot_intensity_histogram(self, denoised_frame: DenoisedFrame,
                                 spots: Optional[List[Spot]] = None,
                                 save: bool = True) -> Optional[str]:
        self.logger.info(f"Generating intensity histogram for frame {denoised_frame.frame_id}")

        fig, axes = plt.subplots(1, 2, figsize=(14, 5))

        original_data = denoised_frame.original_frame.data.flatten()
        denoised_data = denoised_frame.denoised_data.flatten()

        vmin, vmax = np.percentile(original_data, [1, 99])

        axes[0].hist(original_data, bins=100, range=(vmin, vmax), alpha=0.7, label='Original', density=True)
        axes[0].hist(denoised_data, bins=100, range=(vmin, vmax), alpha=0.7, label='Denoised', density=True)
        axes[0].set_xlabel('Pixel Intensity')
        axes[0].set_ylabel('Normalized Frequency')
        axes[0].set_title('Intensity Distribution')
        axes[0].legend()
        axes[0].grid(True, alpha=0.3)

        axes[0].axvline(np.mean(original_data), color='blue', linestyle='--', alpha=0.7,
                       label=f'Original mean: {np.mean(original_data):.1f}')
        axes[0].axvline(np.mean(denoised_data), color='orange', linestyle='--', alpha=0.7,
                       label=f'Denoised mean: {np.mean(denoised_data):.1f}')
        axes[0].legend()

        if spots:
            frame_spots = [s for s in spots if s.frame_id == denoised_frame.frame_id]
            if frame_spots:
                intensities = [s.intensity for s in frame_spots]
                snrs = [s.snr for s in frame_spots]

                sc = axes[1].scatter(range(len(intensities)), intensities, c=snrs, cmap='viridis', s=50)
                axes[1].set_xlabel('Spot Index')
                axes[1].set_ylabel('Spot Intensity')
                axes[1].set_title(f'Detected Spot Intensities ({len(frame_spots)} spots)')
                axes[1].grid(True, alpha=0.3)
                plt.colorbar(sc, ax=axes[1], label='SNR')
            else:
                axes[1].text(0.5, 0.5, 'No spots detected in this frame',
                           ha='center', va='center', transform=axes[1].transAxes)

        plt.tight_layout()

        if save:
            filepath = self._get_output_path("intensity_histogram", f"frame_{denoised_frame.frame_id}")
            fig.savefig(filepath, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            self.logger.info(f"Saved intensity histogram to {filepath}")
            return filepath
        else:
            return None

    def plot_quality_metrics(self, result: ProcessingResult, save: bool = True) -> Optional[str]:
        self.logger.info("Generating quality metrics summary")

        fig, axes = plt.subplots(2, 2, figsize=(14, 10))

        if result.trajectories:
            r_squared_values = [t.r_squared for t in result.trajectories]
            rmse_values = [t.rmse for t in result.trajectories]
            num_points = [t.num_points for t in result.trajectories]

            axes[0, 0].hist(r_squared_values, bins=20, edgecolor='black', alpha=0.7)
            axes[0, 0].axvline(np.mean(r_squared_values), color='red', linestyle='--',
                             label=f'Mean: {np.mean(r_squared_values):.3f}')
            axes[0, 0].set_xlabel('R² Value')
            axes[0, 0].set_ylabel('Frequency')
            axes[0, 0].set_title('Distribution of R² Values')
            axes[0, 0].legend()
            axes[0, 0].grid(True, alpha=0.3)

            axes[0, 1].hist(rmse_values, bins=20, edgecolor='black', alpha=0.7)
            axes[0, 1].axvline(np.mean(rmse_values), color='red', linestyle='--',
                             label=f'Mean: {np.mean(rmse_values):.2f}')
            axes[0, 1].set_xlabel('RMSE (pixels)')
            axes[0, 1].set_ylabel('Frequency')
            axes[0, 1].set_title('Distribution of RMSE Values')
            axes[0, 1].legend()
            axes[0, 1].grid(True, alpha=0.3)

            axes[1, 0].hist(num_points, bins=20, edgecolor='black', alpha=0.7)
            axes[1, 0].axvline(np.mean(num_points), color='red', linestyle='--',
                             label=f'Mean: {np.mean(num_points):.1f}')
            axes[1, 0].set_xlabel('Number of Points per Trajectory')
            axes[1, 0].set_ylabel('Frequency')
            axes[1, 0].set_title('Trajectory Length Distribution')
            axes[1, 0].legend()
            axes[1, 0].grid(True, alpha=0.3)

        if result.denoised_frames:
            noise_levels = [f.noise_level for f in result.denoised_frames]
            frame_ids = [f.frame_id for f in result.denoised_frames]

            axes[1, 1].plot(frame_ids, noise_levels, 'b-o', linewidth=1, markersize=4)
            axes[1, 1].axhline(np.mean(noise_levels), color='red', linestyle='--',
                             label=f'Mean: {np.mean(noise_levels):.2f}')
            axes[1, 1].set_xlabel('Frame ID')
            axes[1, 1].set_ylabel('Noise Level')
            axes[1, 1].set_title('Noise Level Across Frames')
            axes[1, 1].legend()
            axes[1, 1].grid(True, alpha=0.3)

        fig.suptitle(f'Processing Quality Summary\n'
                    f'Total frames: {result.total_frames} | '
                    f'Detected spots: {result.detected_spots} | '
                    f'Trajectories: {len(result.trajectories)} | '
                    f'Time: {result.processing_time:.1f}s',
                    fontsize=14, y=1.02)
        plt.tight_layout()

        if save:
            filepath = self._get_output_path("quality_metrics")
            fig.savefig(filepath, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            self.logger.info(f"Saved quality metrics to {filepath}")
            return filepath
        else:
            return None

    def visualize_result(self, result: ProcessingResult) -> Dict[str, str]:
        self.logger.info("Starting result visualization")
        output_files = {}

        if self.config.output.save_visualization:
            if result.denoised_frames and result.trajectories:
                first_frame = result.denoised_frames[0]
                image_shape = first_frame.shape

                traj_plot = self.plot_trajectories(
                    result.trajectories,
                    image_shape,
                    background_frame=first_frame.denoised_data
                )
                if traj_plot:
                    output_files['trajectories'] = traj_plot

                middle_idx = len(result.denoised_frames) // 2
                if len(result.denoised_frames) > 0:
                    sample_frame = result.denoised_frames[min(middle_idx, len(result.denoised_frames) - 1)]
                    spots = [s for t in result.trajectories for s in t.spots]

                    frame_plot = self.plot_frame_comparison(sample_frame, spots=spots)
                    if frame_plot:
                        output_files['frame_comparison'] = frame_plot

                    spots_plot = self.plot_spots(sample_frame, spots)
                    if spots_plot:
                        output_files['spots'] = spots_plot

                    hist_plot = self.plot_intensity_histogram(sample_frame, spots)
                    if hist_plot:
                        output_files['histogram'] = hist_plot

            quality_plot = self.plot_quality_metrics(result)
            if quality_plot:
                output_files['quality_metrics'] = quality_plot

            for i, traj in enumerate(result.trajectories[:5]):
                analysis_plot = self.plot_trajectory_analysis(traj)
                if analysis_plot:
                    output_files[f'trajectory_{i}'] = analysis_plot

        self.logger.info(f"Visualization completed. Generated {len(output_files)} files")
        return output_files


class ReportGenerator:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.output_dir = config.output.output_dir

    def generate_text_report(self, result: ProcessingResult,
                            visualization_files: Optional[Dict[str, str]] = None) -> str:
        self.logger.info("Generating text report")

        report_lines = []
        report_lines.append("=" * 80)
        report_lines.append("ASTRONOMICAL SPOT TRAJECTORY ANALYSIS REPORT")
        report_lines.append("=" * 80)
        report_lines.append("")

        report_lines.append("PROCESSING SUMMARY")
        report_lines.append("-" * 40)
        report_lines.append(f"Job ID: {result.job_id}")
        report_lines.append(f"Source File: {result.source_file}")
        report_lines.append(f"Processing Start: {result.start_time.isoformat()}")
        report_lines.append(f"Processing End: {result.end_time.isoformat()}")
        report_lines.append(f"Total Processing Time: {result.processing_time:.2f} seconds")
        report_lines.append(f"Success: {'Yes' if result.success else 'No'}")
        if result.error_message:
            report_lines.append(f"Error: {result.error_message}")
        report_lines.append("")

        report_lines.append("DATA STATISTICS")
        report_lines.append("-" * 40)
        report_lines.append(f"Total Frames Processed: {result.total_frames}")
        report_lines.append(f"Total Spots Detected: {result.detected_spots}")
        report_lines.append(f"Number of Trajectories: {len(result.trajectories)}")
        report_lines.append("")

        if result.denoised_frames:
            noise_levels = [f.noise_level for f in result.denoised_frames]
            report_lines.append("NOISE ANALYSIS")
            report_lines.append("-" * 40)
            report_lines.append(f"Denoising Method: {result.denoised_frames[0].denoising_method}")
            report_lines.append(f"Mean Noise Level: {np.mean(noise_levels):.2f}")
            report_lines.append(f"Noise Level Std: {np.std(noise_levels):.2f}")
            report_lines.append(f"Min Noise Level: {np.min(noise_levels):.2f}")
            report_lines.append(f"Max Noise Level: {np.max(noise_levels):.2f}")
            report_lines.append("")

        if result.trajectories:
            report_lines.append("TRAJECTORY STATISTICS")
            report_lines.append("-" * 40)

            r_squared_values = [t.r_squared for t in result.trajectories]
            rmse_values = [t.rmse for t in result.trajectories]
            num_points = [t.num_points for t in result.trajectories]
            durations = [t.duration for t in result.trajectories]

            report_lines.append(f"Mean R²: {np.mean(r_squared_values):.4f}")
            report_lines.append(f"Median R²: {np.median(r_squared_values):.4f}")
            report_lines.append(f"Min R²: {np.min(r_squared_values):.4f}")
            report_lines.append(f"Max R²: {np.max(r_squared_values):.4f}")
            report_lines.append("")
            report_lines.append(f"Mean RMSE: {np.mean(rmse_values):.2f} pixels")
            report_lines.append(f"Median RMSE: {np.median(rmse_values):.2f} pixels")
            report_lines.append("")
            report_lines.append(f"Mean Points per Trajectory: {np.mean(num_points):.1f}")
            report_lines.append(f"Median Points per Trajectory: {np.median(num_points):.1f}")
            report_lines.append("")
            report_lines.append(f"Mean Duration: {np.mean(durations):.2f} s")
            report_lines.append(f"Total Observation Time: {max(durations):.2f} s")
            report_lines.append("")

            report_lines.append("TOP TRAJECTORIES (by R²)")
            report_lines.append("-" * 40)
            sorted_traj = sorted(result.trajectories, key=lambda t: t.r_squared, reverse=True)[:10]
            for i, traj in enumerate(sorted_traj, 1):
                report_lines.append(f"  {i}. ID: {traj.trajectory_id[:12]}... "
                                  f"R²={traj.r_squared:.4f} "
                                  f"RMSE={traj.rmse:.2f} "
                                  f"Points={traj.num_points} "
                                  f"Method={traj.fitting_method}")
            report_lines.append("")

        if visualization_files:
            report_lines.append("GENERATED FILES")
            report_lines.append("-" * 40)
            for name, filepath in visualization_files.items():
                report_lines.append(f"  {name}: {filepath}")
            report_lines.append("")

        if result.metadata:
            report_lines.append("ADDITIONAL METADATA")
            report_lines.append("-" * 40)
            for key, value in result.metadata.items():
                report_lines.append(f"  {key}: {value}")
            report_lines.append("")

        report_lines.append("=" * 80)
        report_lines.append("END OF REPORT")
        report_lines.append("=" * 80)

        report_text = "\n".join(report_lines)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = os.path.join(self.output_dir, f"analysis_report_{timestamp}.txt")
        ensure_directory(os.path.dirname(filepath))

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(report_text)

        self.logger.info(f"Saved text report to {filepath}")
        return filepath

    def generate_json_report(self, result: ProcessingResult,
                            visualization_files: Optional[Dict[str, str]] = None) -> str:
        self.logger.info("Generating JSON report")

        report_data = {
            'job_id': result.job_id,
            'source_file': result.source_file,
            'start_time': result.start_time.isoformat(),
            'end_time': result.end_time.isoformat(),
            'processing_time_seconds': result.processing_time,
            'success': result.success,
            'error_message': result.error_message,
            'statistics': {
                'total_frames': result.total_frames,
                'detected_spots': result.detected_spots,
                'num_trajectories': len(result.trajectories),
            },
            'trajectories': [],
            'visualization_files': visualization_files or {},
            'metadata': result.metadata
        }

        if result.trajectories:
            r_squared_values = [t.r_squared for t in result.trajectories]
            rmse_values = [t.rmse for t in result.trajectories]
            num_points = [t.num_points for t in result.trajectories]
            durations = [t.duration for t in result.trajectories]

            report_data['statistics'].update({
                'mean_r_squared': float(np.mean(r_squared_values)),
                'median_r_squared': float(np.median(r_squared_values)),
                'min_r_squared': float(np.min(r_squared_values)),
                'max_r_squared': float(np.max(r_squared_values)),
                'mean_rmse': float(np.mean(rmse_values)),
                'median_rmse': float(np.median(rmse_values)),
                'mean_points_per_trajectory': float(np.mean(num_points)),
                'mean_duration_seconds': float(np.mean(durations)),
            })

            for traj in result.trajectories:
                traj_data = {
                    'trajectory_id': traj.trajectory_id,
                    'num_points': traj.num_points,
                    'duration_seconds': traj.duration,
                    'r_squared': traj.r_squared,
                    'rmse': traj.rmse,
                    'fitting_method': traj.fitting_method,
                    'start_time': traj.start_time.isoformat(),
                    'end_time': traj.end_time.isoformat(),
                    'coefficients': traj.coefficients.tolist(),
                    'spots': [
                        {
                            'spot_id': s.spot_id,
                            'x': s.x,
                            'y': s.y,
                            'intensity': s.intensity,
                            'area': s.area,
                            'snr': s.snr,
                            'frame_id': s.frame_id,
                            'timestamp': s.timestamp.isoformat()
                        }
                        for s in traj.spots
                    ]
                }
                report_data['trajectories'].append(traj_data)

        if result.denoised_frames:
            noise_levels = [f.noise_level for f in result.denoised_frames]
            report_data['noise_analysis'] = {
                'denoising_method': result.denoised_frames[0].denoising_method,
                'mean_noise_level': float(np.mean(noise_levels)),
                'std_noise_level': float(np.std(noise_levels)),
                'min_noise_level': float(np.min(noise_levels)),
                'max_noise_level': float(np.max(noise_levels)),
            }

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = os.path.join(self.output_dir, f"analysis_report_{timestamp}.json")
        save_json(report_data, filepath)

        self.logger.info(f"Saved JSON report to {filepath}")
        return filepath
