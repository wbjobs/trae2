from typing import Dict, Any, Optional, List, Tuple
import os
import logging
import numpy as np
from datetime import datetime

logger = logging.getLogger(__name__)

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib import cm
    from matplotlib.colors import Normalize
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False

try:
    import h5py
    HDF5_AVAILABLE = True
except ImportError:
    HDF5_AVAILABLE = False


class FlowVisualizer:
    def __init__(self, dpi: int = 150, figsize: Tuple[int, int] = (10, 8),
                 style: str = 'dark_background'):
        self.dpi = dpi
        self.figsize = figsize
        self.style = style
        self._style_applied = False

    def _apply_style(self):
        if not self._style_applied and MATPLOTLIB_AVAILABLE:
            try:
                plt.style.use(self.style)
            except Exception:
                pass
            self._style_applied = True

    def plot_scalar_field(self, field: np.ndarray, title: str = '',
                          xlabel: str = 'x', ylabel: str = 'y',
                          cmap: str = 'RdBu_r', colorbar: bool = True,
                          vmin: Optional[float] = None, vmax: Optional[float] = None,
                          save_path: Optional[str] = None) -> Optional[Any]:
        if not MATPLOTLIB_AVAILABLE:
            logger.warning('matplotlib not available')
            return None
        self._apply_style()
        fig, ax = plt.subplots(1, 1, figsize=self.figsize)
        im = ax.imshow(field.T, origin='lower', cmap=cmap, aspect='equal',
                       vmin=vmin, vmax=vmax)
        ax.set_title(title, fontsize=14)
        ax.set_xlabel(xlabel, fontsize=12)
        ax.set_ylabel(ylabel, fontsize=12)
        if colorbar:
            cbar = fig.colorbar(im, ax=ax, shrink=0.8)
            cbar.ax.tick_params(labelsize=10)
        plt.tight_layout()
        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            return save_path
        return fig

    def plot_velocity_magnitude(self, u: np.ndarray, v: np.ndarray,
                                title: str = 'Velocity Magnitude',
                                cmap: str = 'inferno',
                                save_path: Optional[str] = None) -> Optional[Any]:
        mag = np.sqrt(u ** 2 + v ** 2)
        return self.plot_scalar_field(mag, title=title, cmap=cmap, save_path=save_path)

    def plot_pressure_field(self, p: np.ndarray, title: str = 'Pressure Field',
                            cmap: str = 'RdBu_r',
                            save_path: Optional[str] = None) -> Optional[Any]:
        return self.plot_scalar_field(p, title=title, cmap=cmap, save_path=save_path)

    def plot_vorticity_field(self, u: np.ndarray, v: np.ndarray,
                             dx: float = 1.0, dy: float = 1.0,
                             title: str = 'Vorticity',
                             cmap: str = 'RdBu_r',
                             save_path: Optional[str] = None) -> Optional[Any]:
        from cfd_compute import compute_vorticity
        vort = compute_vorticity(u, v, dx, dy)
        vmax = max(abs(vort.min()), abs(vort.max())) or 1.0
        return self.plot_scalar_field(vort, title=title, cmap=cmap,
                                      vmin=-vmax, vmax=vmax, save_path=save_path)

    def plot_vector_field(self, u: np.ndarray, v: np.ndarray,
                          title: str = 'Velocity Vectors',
                          skip: int = 4, scale: Optional[float] = None,
                          color_by_magnitude: bool = True,
                          cmap: str = 'viridis',
                          save_path: Optional[str] = None) -> Optional[Any]:
        if not MATPLOTLIB_AVAILABLE:
            logger.warning('matplotlib not available')
            return None
        self._apply_style()
        fig, ax = plt.subplots(1, 1, figsize=self.figsize)
        ny, nx = u.shape
        x = np.arange(nx)
        y = np.arange(ny)
        X, Y = np.meshgrid(x, y)
        Xs = X[::skip, ::skip]
        Ys = Y[::skip, ::skip]
        Us = u[::skip, ::skip]
        Vs = v[::skip, ::skip]
        if color_by_magnitude:
            mag = np.sqrt(Us ** 2 + Vs ** 2)
            q = ax.quiver(Xs, Ys, Us, Vs, mag, cmap=cmap, scale=scale)
            fig.colorbar(q, ax=ax, shrink=0.8, label='Magnitude')
        else:
            q = ax.quiver(Xs, Ys, Us, Vs, scale=scale)
        ax.set_title(title, fontsize=14)
        ax.set_xlabel('x', fontsize=12)
        ax.set_ylabel('y', fontsize=12)
        ax.set_aspect('equal')
        plt.tight_layout()
        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            return save_path
        return fig

    def plot_contour(self, field: np.ndarray, title: str = '',
                     levels: int = 20, filled: bool = True,
                     cmap: str = 'RdBu_r',
                     save_path: Optional[str] = None) -> Optional[Any]:
        if not MATPLOTLIB_AVAILABLE:
            return None
        self._apply_style()
        fig, ax = plt.subplots(1, 1, figsize=self.figsize)
        ny, nx = field.shape
        x = np.arange(nx)
        y = np.arange(ny)
        X, Y = np.meshgrid(x, y)
        if filled:
            cf = ax.contourf(X, Y, field.T, levels=levels, cmap=cmap)
        else:
            cf = ax.contour(X, Y, field.T, levels=levels, cmap=cmap)
        ax.set_title(title, fontsize=14)
        ax.set_aspect('equal')
        fig.colorbar(cf, ax=ax, shrink=0.8)
        plt.tight_layout()
        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            return save_path
        return fig

    def plot_streamlines(self, u: np.ndarray, v: np.ndarray,
                         title: str = 'Streamlines',
                         density: float = 1.5, linewidth: float = 1.0,
                         color_by_magnitude: bool = True,
                         cmap: str = 'viridis',
                         save_path: Optional[str] = None) -> Optional[Any]:
        if not MATPLOTLIB_AVAILABLE:
            return None
        self._apply_style()
        fig, ax = plt.subplots(1, 1, figsize=self.figsize)
        ny, nx = u.shape
        x = np.arange(nx)
        y = np.arange(ny)
        X, Y = np.meshgrid(x, y)
        speed = np.sqrt(u ** 2 + v ** 2)
        if color_by_magnitude:
            strm = ax.streamplot(X, Y, u, v, color=speed, cmap=cmap,
                                 density=density, linewidth=linewidth)
            fig.colorbar(strm.lines, ax=ax, shrink=0.8, label='Speed')
        else:
            ax.streamplot(X, Y, u, v, density=density, linewidth=linewidth, color='white')
        ax.set_title(title, fontsize=14)
        ax.set_aspect('equal')
        plt.tight_layout()
        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            return save_path
        return fig

    def plot_multi_panel(self, u: np.ndarray, v: np.ndarray, p: np.ndarray,
                         dx: float = 1.0, dy: float = 1.0,
                         title: str = 'Flow Field Overview',
                         save_path: Optional[str] = None) -> Optional[Any]:
        if not MATPLOTLIB_AVAILABLE:
            return None
        self._apply_style()
        from cfd_compute import compute_vorticity
        vort = compute_vorticity(u, v, dx, dy)
        mag = np.sqrt(u ** 2 + v ** 2)
        fig, axes = plt.subplots(2, 2, figsize=(14, 12))
        ax = axes[0, 0]
        im = ax.imshow(mag.T, origin='lower', cmap='inferno', aspect='equal')
        ax.set_title('Velocity Magnitude')
        fig.colorbar(im, ax=ax, shrink=0.7)
        ax = axes[0, 1]
        vmax = max(abs(vort.min()), abs(vort.max())) or 1.0
        im = ax.imshow(vort.T, origin='lower', cmap='RdBu_r', aspect='equal',
                       vmin=-vmax, vmax=vmax)
        ax.set_title('Vorticity')
        fig.colorbar(im, ax=ax, shrink=0.7)
        ax = axes[1, 0]
        im = ax.imshow(p.T, origin='lower', cmap='RdBu_r', aspect='equal')
        ax.set_title('Pressure')
        fig.colorbar(im, ax=ax, shrink=0.7)
        ax = axes[1, 1]
        skip = max(1, u.shape[0] // 20)
        ny, nx = u.shape
        x = np.arange(nx)
        y = np.arange(ny)
        X, Y = np.meshgrid(x, y)
        q = ax.quiver(X[::skip, ::skip], Y[::skip, ::skip],
                       u[::skip, ::skip], v[::skip, ::skip],
                       mag[::skip, ::skip], cmap='viridis', scale=None)
        ax.set_title('Velocity Vectors')
        fig.colorbar(q, ax=ax, shrink=0.7)
        fig.suptitle(title, fontsize=16)
        plt.tight_layout()
        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            return save_path
        return fig

    def plot_metrics_timeseries(self, metrics_history: List[Dict[str, Any]],
                                keys: Optional[List[str]] = None,
                                title: str = 'Flow Metrics Over Time',
                                save_path: Optional[str] = None) -> Optional[Any]:
        if not MATPLOTLIB_AVAILABLE:
            return None
        self._apply_style()
        if keys is None:
            keys = ['kinetic_energy', 'max_velocity_magnitude', 'cfl_number']
        fig, axes = plt.subplots(len(keys), 1, figsize=(10, 3 * len(keys)),
                                 squeeze=False)
        for idx, key in enumerate(keys):
            ax = axes[idx, 0]
            iterations = [m.get('iteration', i) for i, m in enumerate(metrics_history)]
            values = [m.get(key, 0.0) for m in metrics_history]
            ax.plot(iterations, values, linewidth=1.5, marker='o', markersize=3)
            ax.set_ylabel(key, fontsize=11)
            ax.grid(True, alpha=0.3)
            if idx == len(keys) - 1:
                ax.set_xlabel('Iteration', fontsize=11)
        fig.suptitle(title, fontsize=14)
        plt.tight_layout()
        if save_path:
            fig.savefig(save_path, dpi=self.dpi, bbox_inches='tight')
            plt.close(fig)
            return save_path
        return fig

    def create_animation(self, history: List[Dict[str, Any]],
                         field_key: str = 'u',
                         title: str = '', cmap: str = 'RdBu_r',
                         interval_ms: int = 100,
                         save_path: Optional[str] = None) -> Optional[Any]:
        if not MATPLOTLIB_AVAILABLE:
            return None
        from matplotlib.animation import FuncAnimation
        fig, ax = plt.subplots(1, 1, figsize=self.figsize)
        first_field = history[0].get(field_key, np.zeros((10, 10)))
        vmax = max(abs(f.get(field_key, np.zeros((1, 1))).min()) for f in history)
        vmax = max(vmax, max(abs(f.get(field_key, np.zeros((1, 1))).max()) for f in history)) or 1.0
        im = ax.imshow(first_field.T, origin='lower', cmap=cmap,
                       vmin=-vmax, vmax=vmax, aspect='equal')
        cbar = fig.colorbar(im, ax=ax, shrink=0.8)
        iteration_text = ax.text(0.02, 0.95, '', transform=ax.transAxes,
                                 color='white', fontsize=12)
        def update(frame_idx):
            frame = history[frame_idx]
            field = frame.get(field_key, np.zeros((10, 10)))
            im.set_data(field.T)
            iteration_text.set_text(f'Iteration: {frame.get("iteration", frame_idx)}')
            return [im, iteration_text]
        anim = FuncAnimation(fig, update, frames=len(history),
                             interval=interval_ms, blit=True)
        if save_path:
            if save_path.endswith('.gif'):
                anim.save(save_path, writer='pillow', fps=10)
            elif save_path.endswith('.mp4'):
                anim.save(save_path, writer='ffmpeg', fps=10)
            plt.close(fig)
            return save_path
        return anim


class DataExporter:
    def __init__(self, output_dir: str = 'exports'):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def export_csv(self, u: np.ndarray, v: np.ndarray, p: np.ndarray,
                   dx: float = 1.0, dy: float = 1.0,
                   filename: str = 'flow_field.csv') -> str:
        path = os.path.join(self.output_dir, filename)
        ny, nx = u.shape
        x_coords = np.arange(nx) * dx
        y_coords = np.arange(ny) * dy
        X, Y = np.meshgrid(x_coords, y_coords)
        data = np.column_stack([
            X.ravel(), Y.ravel(),
            u.ravel(), v.ravel(), p.ravel()
        ])
        header = 'x,y,u,v,p'
        np.savetxt(path, data, delimiter=',', header=header, comments='')
        return path

    def export_metrics_csv(self, metrics_history: List[Dict[str, Any]],
                           filename: str = 'metrics.csv') -> str:
        path = os.path.join(self.output_dir, filename)
        if not metrics_history:
            return path
        keys = list(metrics_history[0].keys())
        rows = []
        for m in metrics_history:
            row = [m.get(k, '') for k in keys]
            rows.append(row)
        header = ','.join(keys)
        with open(path, 'w') as f:
            f.write(header + '\n')
            for row in rows:
                f.write(','.join(str(v) for v in row) + '\n')
        return path

    def export_npy(self, fields: Dict[str, np.ndarray],
                   filename: str = 'flow_fields.npz') -> str:
        path = os.path.join(self.output_dir, filename)
        np.savez(path, **fields)
        return path

    def export_hdf5(self, fields: Dict[str, np.ndarray],
                    metadata: Optional[Dict[str, Any]] = None,
                    filename: str = 'flow_fields.h5') -> str:
        path = os.path.join(self.output_dir, filename)
        if not HDF5_AVAILABLE:
            logger.warning('h5py not available, falling back to npz')
            return self.export_npy(fields, filename.replace('.h5', '.npz'))
        with h5py.File(path, 'w') as f:
            for name, data in fields.items():
                f.create_dataset(name, data=data, compression='gzip', compression_opts=4)
            if metadata:
                meta_grp = f.create_group('metadata')
                for k, v in metadata.items():
                    if isinstance(v, (int, float, str, bool)):
                        meta_grp.attrs[k] = v
                    elif isinstance(v, (list, tuple)):
                        meta_grp.attrs[k] = str(v)
                    elif isinstance(v, dict):
                        for sk, sv in v.items():
                            if isinstance(sv, (int, float, str, bool)):
                                meta_grp.attrs[f'{k}_{sk}'] = sv
        return path

    def export_history_hdf5(self, history: List[Dict[str, Any]],
                            filename: str = 'simulation_history.h5') -> str:
        path = os.path.join(self.output_dir, filename)
        if not HDF5_AVAILABLE:
            logger.warning('h5py not available, using npz per frame')
            for i, frame in enumerate(history):
                self.export_npy(
                    {'u': frame['u'], 'v': frame['v'], 'p': frame['p']},
                    filename=f'frame_{i:04d}.npz'
                )
            return self.output_dir
        with h5py.File(path, 'w') as f:
            for i, frame in enumerate(history):
                grp = f.create_group(f'frame_{i:04d}')
                grp.attrs['iteration'] = frame.get('iteration', i)
                grp.attrs['time'] = frame.get('time', 0.0)
                grp.attrs['kinetic_energy'] = frame.get('kinetic_energy', 0.0)
                for key in ['u', 'v', 'p', 'vorticity']:
                    if key in frame and isinstance(frame[key], np.ndarray):
                        grp.create_dataset(key, data=frame[key], compression='gzip', compression_opts=4)
        return path

    def export_vtk(self, u: np.ndarray, v: np.ndarray, p: np.ndarray,
                   dx: float = 1.0, dy: float = 1.0,
                   filename: str = 'flow_field.vtr') -> str:
        path = os.path.join(self.output_dir, filename)
        ny, nx = u.shape
        x = np.arange(nx + 1) * dx
        y = np.arange(ny + 1) * dy
        header = f"""<?xml version="1.0"?>
<VTKFile type="RectilinearGrid" version="0.1" byte_order="LittleEndian">
<RectilinearGrid WholeExtent="0 {nx} 0 {ny} 0 0">
<Piece Extent="0 {nx} 0 {ny} 0 0">
<PointData>
</PointData>
<CellData>
<DataArray type="Float64" Name="velocity" NumberOfComponents="3" format="ascii">
"""
        lines = [header]
        for j in range(ny):
            for i in range(nx):
                lines.append(f'{u[i, j]:.10e} {v[i, j]:.10e} 0.0')
        lines.append(f"""</DataArray>
<DataArray type="Float64" Name="pressure" format="ascii">
""")
        for j in range(ny):
            for i in range(nx):
                lines.append(f'{p[i, j]:.10e}')
        lines.append(f"""</DataArray>
</CellData>
<Coordinates>
<DataArray type="Float64" Name="X" format="ascii" NumberOfComponents="1">
""")
        lines.append(' '.join(f'{xi:.10e}' for xi in x))
        lines.append("""</DataArray>
<DataArray type="Float64" Name="Y" format="ascii" NumberOfComponents="1">
""")
        lines.append(' '.join(f'{yi:.10e}' for yi in y))
        lines.append("""</DataArray>
<DataArray type="Float64" Name="Z" format="ascii" NumberOfComponents="1">
0.0
</DataArray>
</Coordinates>
</Piece>
</RectilinearGrid>
</VTKFile>""")
        with open(path, 'w') as f:
            f.write('\n'.join(lines))
        return path


class VisualizationExporter:
    def __init__(self, visualizer: Optional[FlowVisualizer] = None,
                 exporter: Optional[DataExporter] = None):
        self.visualizer = visualizer or FlowVisualizer()
        self.exporter = exporter or DataExporter()

    def export_full_report(self, u: np.ndarray, v: np.ndarray, p: np.ndarray,
                           dx: float, dy: float, dt: float, nu: float,
                           history: List[Dict[str, Any]],
                           task_id: str = 'simulation',
                           output_dir: Optional[str] = None) -> Dict[str, str]:
        if output_dir:
            self.exporter.output_dir = output_dir
            self.visualizer.dpi = 150
        os.makedirs(self.exporter.output_dir, exist_ok=True)
        exported = {}
        img_path = os.path.join(self.exporter.output_dir, f'{task_id}_multi_panel.png')
        result = self.visualizer.plot_multi_panel(u, v, p, dx, dy,
                                                   title=f'Flow Field - {task_id}',
                                                   save_path=img_path)
        if result:
            exported['multi_panel'] = result
        img_path = os.path.join(self.exporter.output_dir, f'{task_id}_velocity.png')
        result = self.visualizer.plot_velocity_magnitude(u, v, save_path=img_path)
        if result:
            exported['velocity_magnitude'] = result
        img_path = os.path.join(self.exporter.output_dir, f'{task_id}_vorticity.png')
        result = self.visualizer.plot_vorticity_field(u, v, dx, dy, save_path=img_path)
        if result:
            exported['vorticity'] = result
        img_path = os.path.join(self.exporter.output_dir, f'{task_id}_streamlines.png')
        result = self.visualizer.plot_streamlines(u, v, save_path=img_path)
        if result:
            exported['streamlines'] = result
        img_path = os.path.join(self.exporter.output_dir, f'{task_id}_pressure_contour.png')
        result = self.visualizer.plot_contour(p, title='Pressure Contours',
                                               save_path=img_path)
        if result:
            exported['pressure_contour'] = result
        csv_path = self.exporter.export_csv(u, v, p, dx, dy,
                                             filename=f'{task_id}_field.csv')
        exported['csv'] = csv_path
        npz_path = self.exporter.export_npy(
            {'u': u, 'v': v, 'p': p},
            filename=f'{task_id}_fields.npz'
        )
        exported['npz'] = npz_path
        h5_path = self.exporter.export_hdf5(
            {'u': u, 'v': v, 'p': p},
            metadata={'task_id': task_id, 'dx': dx, 'dy': dy, 'dt': dt, 'nu': nu},
            filename=f'{task_id}_fields.h5'
        )
        exported['hdf5'] = h5_path
        vtk_path = self.exporter.export_vtk(u, v, p, dx, dy,
                                             filename=f'{task_id}_field.vtr')
        exported['vtk'] = vtk_path
        if history:
            metrics_list = []
            for frame in history:
                from cfd_compute import compute_flow_metrics
                m = compute_flow_metrics(frame['u'], frame['v'], frame['p'],
                                         dx, dy, dt, nu)
                d = m.to_dict()
                d['iteration'] = frame.get('iteration', 0)
                metrics_list.append(d)
            metrics_csv = self.exporter.export_metrics_csv(
                metrics_list, filename=f'{task_id}_metrics.csv')
            exported['metrics_csv'] = metrics_csv
            img_path = os.path.join(self.exporter.output_dir, f'{task_id}_metrics.png')
            result = self.visualizer.plot_metrics_timeseries(
                metrics_list, save_path=img_path)
            if result:
                exported['metrics_plot'] = result
            hist_h5 = self.exporter.export_history_hdf5(
                history, filename=f'{task_id}_history.h5')
            exported['history_hdf5'] = hist_h5
        return exported
