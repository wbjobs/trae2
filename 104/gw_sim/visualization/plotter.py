import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.figure import Figure
from typing import Dict, List, Optional, Tuple
import io
import base64
import os


class HydrologyPlotter:

    @staticmethod
    def plot_head_contour(
        h: np.ndarray,
        dx: float = 10.0,
        dy: float = 10.0,
        title: str = "Water Head Contour",
        levels: int = 20,
        cmap: str = "RdYlBu_r",
    ) -> Figure:
        ny, nx = h.shape
        x = np.arange(nx) * dx
        y = np.arange(ny) * dy
        X, Y = np.meshgrid(x, y)

        fig, ax = plt.subplots(figsize=(10, 8))
        cf = ax.contourf(X, Y, h, levels=levels, cmap=cmap)
        cs = ax.contour(X, Y, h, levels=levels, colors="black", linewidths=0.5, alpha=0.6)
        ax.clabel(cs, inline=True, fontsize=8, fmt="%.1f")
        fig.colorbar(cf, ax=ax, label="Head (m)")
        ax.set_xlabel("X (m)")
        ax.set_ylabel("Y (m)")
        ax.set_title(title)
        ax.set_aspect("equal")
        fig.tight_layout()
        return fig

    @staticmethod
    def plot_velocity_field(
        h: np.ndarray,
        vx: np.ndarray,
        vy: np.ndarray,
        dx: float = 10.0,
        dy: float = 10.0,
        title: str = "Seepage Velocity Field",
    ) -> Figure:
        ny, nx = h.shape
        x = np.arange(nx) * dx
        y = np.arange(ny) * dy
        X, Y = np.meshgrid(x, y)

        fig, ax = plt.subplots(figsize=(10, 8))
        cf = ax.contourf(X, Y, h, levels=20, cmap="Blues", alpha=0.6)

        skip = max(1, nx // 20)
        speed = np.sqrt(vx**2 + vy**2)
        ax.quiver(
            X[::skip, ::skip], Y[::skip, ::skip],
            vx[::skip, ::skip], vy[::skip, ::skip],
            speed[::skip, ::skip],
            cmap="autumn",
            scale=speed.max() * 20 if speed.max() > 0 else 1,
        )

        fig.colorbar(cf, ax=ax, label="Head (m)")
        ax.set_xlabel("X (m)")
        ax.set_ylabel("Y (m)")
        ax.set_title(title)
        ax.set_aspect("equal")
        fig.tight_layout()
        return fig

    @staticmethod
    def plot_water_level_timeseries(
        timestamps: List,
        water_levels: List[float],
        well_id: str = "Unknown",
        title: Optional[str] = None,
    ) -> Figure:
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.plot(timestamps, water_levels, "b-", linewidth=1.5, label=f"Well {well_id}")
        ax.fill_between(timestamps, water_levels, alpha=0.2)
        ax.set_xlabel("Time")
        ax.set_ylabel("Water Level (m)")
        ax.set_title(title or f"Water Level Evolution - Well {well_id}")
        ax.legend()
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        return fig

    @staticmethod
    def plot_evolution_animation_frames(
        h_series: List[np.ndarray],
        dx: float = 10.0,
        dy: float = 10.0,
        title_prefix: str = "Step",
        output_dir: Optional[str] = None,
    ) -> List[str]:
        paths = []
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        for idx, h in enumerate(h_series):
            fig = HydrologyPlotter.plot_head_contour(
                h, dx=dx, dy=dy, title=f"{title_prefix} {idx}"
            )
            if output_dir:
                path = os.path.join(output_dir, f"frame_{idx:04d}.png")
                fig.savefig(path, dpi=100, bbox_inches="tight")
                paths.append(path)
            plt.close(fig)

        return paths

    @staticmethod
    def fig_to_base64(fig: Figure, fmt: str = "png", dpi: int = 150) -> str:
        buf = io.BytesIO()
        fig.savefig(buf, format=fmt, dpi=dpi, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode("utf-8")

    @staticmethod
    def plot_multi_well_comparison(
        well_data: Dict[str, Tuple[List, List[float]]],
        title: str = "Multi-Well Water Level Comparison",
    ) -> Figure:
        fig, ax = plt.subplots(figsize=(14, 7))
        for well_id, (timestamps, levels) in well_data.items():
            ax.plot(timestamps, levels, linewidth=1.2, label=well_id)
        ax.set_xlabel("Time")
        ax.set_ylabel("Water Level (m)")
        ax.set_title(title)
        ax.legend(loc="best")
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        return fig

    @staticmethod
    def plot_long_term_projection(
        years: List[int],
        h_annual_avg: List[float],
        h_annual_min: List[float],
        h_annual_max: List[float],
        title: str = "Long-term Water Level Projection",
    ) -> Figure:
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.plot(years, h_annual_avg, "b-o", linewidth=2, label="Average Head")
        ax.fill_between(years, h_annual_min, h_annual_max, alpha=0.3, label="Range")
        ax.set_xlabel("Year")
        ax.set_ylabel("Water Level (m)")
        ax.set_title(title)
        ax.legend()
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        return fig
