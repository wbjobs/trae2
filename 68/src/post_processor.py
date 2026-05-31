import numpy as np
import matplotlib.pyplot as plt
import matplotlib.tri as tri
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import os
from matplotlib import cm
from matplotlib.colors import Normalize


@dataclass
class PostProcessConfig:
    figure_dpi: int = 150
    figure_size: Tuple[int, int] = (12, 8)
    colormap: str = 'viridis'
    contour_levels: int = 20
    show_mesh: bool = False
    save_numpy: bool = True
    save_csv: bool = True
    output_format: str = 'png'


class PostProcessor:
    def __init__(self, params_parser, mesh_data, fem_result=None, output_dir: str = './output',
                 result_bundle=None):
        self.params = params_parser
        self.mesh = mesh_data
        self.output_dir = output_dir
        self.config = PostProcessConfig()

        os.makedirs(output_dir, exist_ok=True)

        if result_bundle is not None:
            self.result = result_bundle
        elif fem_result is not None:
            if hasattr(fem_result, 'to_bundle'):
                self.result = fem_result.to_bundle()
            else:
                self.result = fem_result
        else:
            self.result = None
    
    def _create_triangulation(self) -> tri.Triangulation:
        nodes = self.mesh.nodes
        elements = self.mesh.elements
        
        triangles = []
        for elem in elements:
            triangles.append([elem[0], elem[1], elem[2]])
            triangles.append([elem[0], elem[2], elem[3]])
        
        triangles = np.array(triangles)
        
        return tri.Triangulation(nodes[:, 0], nodes[:, 1], triangles)
    
    def plot_hydraulic_head(self, filename: str = 'hydraulic_head.png') -> str:
        fig, ax = plt.subplots(figsize=self.config.figure_size, dpi=self.config.figure_dpi)
        
        triang = self._create_triangulation()
        
        min_val = np.min(self.result.head)
        max_val = np.max(self.result.head)
        
        if abs(max_val - min_val) < 1e-10:
            max_val = min_val + 1e-6
        
        levels = np.linspace(min_val, max_val, self.config.contour_levels)
        
        contour = ax.tricontourf(triang, self.result.head, levels=levels, 
                                cmap=self.config.colormap)
        
        cbar = plt.colorbar(contour, ax=ax)
        cbar.set_label('Hydraulic Head (m)', fontsize=12)
        
        lines = ax.tricontour(triang, self.result.head, levels=levels,
                             colors='k', linewidths=0.5)
        ax.clabel(lines, inline=True, fontsize=8, fmt='%.1f')
        
        if self.config.show_mesh:
            ax.triplot(triang, 'k-', lw=0.3, alpha=0.5)
        
        self._plot_dam_outline(ax)
        
        ax.set_xlabel('X Coordinate (m)', fontsize=12)
        ax.set_ylabel('Y Coordinate (m)', fontsize=12)
        ax.set_title('Hydraulic Head Distribution', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        ax.grid(True, alpha=0.3)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def plot_pressure(self, filename: str = 'pressure.png') -> str:
        fig, ax = plt.subplots(figsize=self.config.figure_size, dpi=self.config.figure_dpi)
        
        triang = self._create_triangulation()
        
        pressure_kpa = self.result.pressure / 1000.0
        
        min_val = np.min(pressure_kpa)
        max_val = np.max(pressure_kpa)
        
        if abs(max_val - min_val) < 1e-10:
            max_val = min_val + 1e-6
        
        levels = np.linspace(min_val, max_val, self.config.contour_levels)
        
        contour = ax.tricontourf(triang, pressure_kpa, levels=levels, 
                                cmap='RdYlBu_r')
        
        cbar = plt.colorbar(contour, ax=ax)
        cbar.set_label('Pore Water Pressure (kPa)', fontsize=12)
        
        lines = ax.tricontour(triang, pressure_kpa, levels=levels,
                             colors='k', linewidths=0.5)
        ax.clabel(lines, inline=True, fontsize=8, fmt='%.1f')
        
        if self.config.show_mesh:
            ax.triplot(triang, 'k-', lw=0.3, alpha=0.5)
        
        self._plot_dam_outline(ax)
        
        ax.set_xlabel('X Coordinate (m)', fontsize=12)
        ax.set_ylabel('Y Coordinate (m)', fontsize=12)
        ax.set_title('Pore Water Pressure Distribution', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        ax.grid(True, alpha=0.3)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def plot_velocity_field(self, filename: str = 'velocity_field.png') -> str:
        fig, ax = plt.subplots(figsize=self.config.figure_size, dpi=self.config.figure_dpi)
        
        triang = self._create_triangulation()
        
        vel_mag = self.result.velocity_magnitude
        vel_mag_log = np.log10(vel_mag + 1e-10)
        
        contour = ax.tricontourf(triang, vel_mag_log, 
                                levels=self.config.contour_levels,
                                cmap='jet')
        
        cbar = plt.colorbar(contour, ax=ax)
        cbar.set_label('Velocity Magnitude (log10 m/s)', fontsize=12)
        
        skip = max(1, len(self.mesh.nodes) // 100)
        node_indices = np.arange(0, len(self.mesh.nodes), skip)
        
        ax.quiver(self.mesh.nodes[node_indices, 0], 
                 self.mesh.nodes[node_indices, 1],
                 self.result.velocity_x[node_indices],
                 self.result.velocity_y[node_indices],
                 scale=50, scale_units='width', color='white', alpha=0.8,
                 width=0.002)
        
        if self.config.show_mesh:
            ax.triplot(triang, 'k-', lw=0.3, alpha=0.3)
        
        self._plot_dam_outline(ax)
        
        ax.set_xlabel('X Coordinate (m)', fontsize=12)
        ax.set_ylabel('Y Coordinate (m)', fontsize=12)
        ax.set_title('Seepage Velocity Field', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        ax.grid(True, alpha=0.3)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def plot_hydraulic_gradient(self, filename: str = 'hydraulic_gradient.png') -> str:
        fig, ax = plt.subplots(figsize=self.config.figure_size, dpi=self.config.figure_dpi)
        
        triang = self._create_triangulation()
        
        min_val = np.min(self.result.hydraulic_gradient)
        max_val = np.max(self.result.hydraulic_gradient)
        
        if abs(max_val - min_val) < 1e-10:
            max_val = min_val + 1e-6
        
        levels = np.linspace(min_val, max_val, self.config.contour_levels)
        
        contour = ax.tricontourf(triang, self.result.hydraulic_gradient, 
                                levels=levels, cmap='plasma')
        
        cbar = plt.colorbar(contour, ax=ax)
        cbar.set_label('Hydraulic Gradient', fontsize=12)
        
        lines = ax.tricontour(triang, self.result.hydraulic_gradient, 
                             levels=levels, colors='k', linewidths=0.5)
        ax.clabel(lines, inline=True, fontsize=8, fmt='%.3f')
        
        if self.config.show_mesh:
            ax.triplot(triang, 'k-', lw=0.3, alpha=0.5)
        
        self._plot_dam_outline(ax)
        
        ax.set_xlabel('X Coordinate (m)', fontsize=12)
        ax.set_ylabel('Y Coordinate (m)', fontsize=12)
        ax.set_title('Hydraulic Gradient Distribution', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        ax.grid(True, alpha=0.3)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def plot_phreatic_line(self, filename: str = 'phreatic_line.png') -> str:
        fig, ax = plt.subplots(figsize=self.config.figure_size, dpi=self.config.figure_dpi)
        
        triang = self._create_triangulation()
        
        pressure_kpa = self.result.pressure / 1000.0
        
        contour = ax.tricontourf(triang, pressure_kpa, 
                                levels=self.config.contour_levels,
                                cmap='Blues')
        
        zero_contour = ax.tricontour(triang, pressure_kpa, levels=[0], 
                                    colors='red', linewidths=2)
        ax.clabel(zero_contour, inline=True, fontsize=10, fmt='Phreatic Line')
        
        cbar = plt.colorbar(contour, ax=ax)
        cbar.set_label('Pore Water Pressure (kPa)', fontsize=12)
        
        self._plot_dam_outline(ax)
        
        ax.set_xlabel('X Coordinate (m)', fontsize=12)
        ax.set_ylabel('Y Coordinate (m)', fontsize=12)
        ax.set_title('Phreatic Line (Zero Pressure Contour)', fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        ax.grid(True, alpha=0.3)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def plot_mesh(self, filename: str = 'mesh.png') -> str:
        fig, ax = plt.subplots(figsize=self.config.figure_size, dpi=self.config.figure_dpi)
        
        triang = self._create_triangulation()
        
        ax.triplot(triang, 'b-', lw=0.5)
        
        unique_materials = np.unique(self.mesh.element_materials)
        colors = cm.Set2(np.linspace(0, 1, len(unique_materials)))
        
        for i, mat_id in enumerate(unique_materials):
            elem_indices = np.where(self.mesh.element_materials == mat_id)[0]
            
            for elem_idx in elem_indices[:1]:
                elem = self.mesh.elements[elem_idx]
                center = np.mean(self.mesh.nodes[elem], axis=0)
                ax.fill(self.mesh.nodes[elem, 0], self.mesh.nodes[elem, 1],
                       color=colors[i], alpha=0.5, label=f'Layer {int(mat_id) + 1}')
        
        for boundary_name, node_indices in self.mesh.boundary_nodes.items():
            if len(node_indices) > 0:
                ax.scatter(self.mesh.nodes[node_indices, 0], 
                          self.mesh.nodes[node_indices, 1],
                          s=20, label=boundary_name, alpha=0.7)
        
        self._plot_dam_outline(ax)
        
        ax.set_xlabel('X Coordinate (m)', fontsize=12)
        ax.set_ylabel('Y Coordinate (m)', fontsize=12)
        ax.set_title(f'Finite Element Mesh\nNodes: {self.mesh.num_nodes}, Elements: {self.mesh.num_elements}',
                    fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        ax.legend(loc='upper right', fontsize=10)
        ax.grid(True, alpha=0.3)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def plot_cross_section(self, x_position: float, filename: str = 'cross_section.png') -> str:
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 12), dpi=self.config.figure_dpi)
        
        nodes = self.mesh.nodes
        distances = np.abs(nodes[:, 0] - x_position)
        near_indices = np.where(distances < self.mesh.mesh_size * 2)[0]
        
        if len(near_indices) == 0:
            raise ValueError(f"No nodes found near x = {x_position}")
        
        y_coords = nodes[near_indices, 1]
        sort_idx = np.argsort(y_coords)
        
        y_sorted = y_coords[sort_idx]
        head_sorted = self.result.head[near_indices[sort_idx]]
        pressure_sorted = self.result.pressure[near_indices[sort_idx]] / 1000.0
        
        ax1.plot(head_sorted, y_sorted, 'b-o', linewidth=2, markersize=6, label='Hydraulic Head')
        ax1.plot(y_sorted, y_sorted, 'r--', linewidth=1.5, label='Elevation')
        
        ax1.set_xlabel('Hydraulic Head (m)', fontsize=12)
        ax1.set_ylabel('Elevation (m)', fontsize=12)
        ax1.set_title(f'Cross-Section at X = {x_position:.2f} m\nHydraulic Head Profile',
                     fontsize=14, fontweight='bold')
        ax1.grid(True, alpha=0.3)
        ax1.legend(fontsize=10)
        
        ax2.barh(y_sorted, pressure_sorted, height=self.mesh.mesh_size * 0.8, 
                color='blue', alpha=0.6)
        
        ax2.set_xlabel('Pore Water Pressure (kPa)', fontsize=12)
        ax2.set_ylabel('Elevation (m)', fontsize=12)
        ax2.set_title('Pore Water Pressure Profile', fontsize=14, fontweight='bold')
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def plot_convergence_history(self, filename: str = 'convergence.png') -> str:
        if not self.result.convergence_history:
            return ""
        
        fig, ax = plt.subplots(figsize=(10, 6), dpi=self.config.figure_dpi)
        
        iterations = np.arange(1, len(self.result.convergence_history) + 1)
        
        ax.semilogy(iterations, self.result.convergence_history, 
                   'b-', linewidth=2, marker='o', markersize=4)
        
        ax.set_xlabel('Iteration', fontsize=12)
        ax.set_ylabel('Residual Norm', fontsize=12)
        ax.set_title('Convergence History', fontsize=14, fontweight='bold')
        ax.grid(True, alpha=0.3, which='both')
        
        ax.axhline(y=self.params.simulation_params.convergence_tolerance, 
                  color='r', linestyle='--', label='Tolerance')
        ax.legend(fontsize=10)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, bbox_inches='tight')
        plt.close()
        
        return output_path
    
    def _plot_dam_outline(self, ax) -> None:
        geom = self.params.dam_geometry
        if geom is None:
            return
        
        H = geom.dam_height
        B = geom.crest_width
        m1 = geom.upstream_slope
        m2 = geom.downstream_slope
        D = geom.foundation_depth
        
        upstream_crest_x = m1 * H
        downstream_crest_x = upstream_crest_x + B
        downstream_foot_x = downstream_crest_x + m2 * H
        
        outline_x = [
            0, upstream_crest_x, downstream_crest_x, 
            downstream_foot_x, downstream_foot_x + D, 
            -D, 0, 0
        ]
        outline_y = [
            0, H, H, 0, 0, 0, 0, 0
        ]
        
        ax.plot(outline_x, outline_y, 'k-', linewidth=2, label='Dam Outline')
        
        if geom.reservoir_water_level > 0:
            ax.axhline(y=geom.reservoir_water_level, xmin=0, xmax=upstream_crest_x/H,
                      color='blue', linestyle='--', linewidth=1.5, label='Reservoir Level')
        
        if geom.tailwater_level > 0:
            ax.axhline(y=geom.tailwater_level, xmin=downstream_crest_x/H, xmax=1,
                      color='blue', linestyle=':', linewidth=1.5, label='Tailwater Level')
    
    def generate_all_plots(self) -> Dict[str, str]:
        plots = {}
        
        plots['hydraulic_head'] = self.plot_hydraulic_head()
        plots['pressure'] = self.plot_pressure()
        plots['velocity_field'] = self.plot_velocity_field()
        plots['hydraulic_gradient'] = self.plot_hydraulic_gradient()
        plots['phreatic_line'] = self.plot_phreatic_line()
        plots['mesh'] = self.plot_mesh()
        plots['convergence'] = self.plot_convergence_history()
        
        if self.params.dam_geometry:
            x_mid = self.params.dam_geometry.upstream_slope * self.params.dam_geometry.dam_height / 2
            plots['cross_section'] = self.plot_cross_section(x_mid)
        
        return plots
    
    def export_data(self) -> Dict[str, str]:
        output_files = {}
        
        if self.config.save_numpy:
            data_path = os.path.join(self.output_dir, 'results.npz')
            np.savez(data_path,
                     nodes=self.mesh.nodes,
                     elements=self.mesh.elements,
                     head=self.result.head,
                     pressure=self.result.pressure,
                     velocity_x=self.result.velocity_x,
                     velocity_y=self.result.velocity_y,
                     velocity_magnitude=self.result.velocity_magnitude,
                     hydraulic_gradient=self.result.hydraulic_gradient,
                     element_materials=self.mesh.element_materials)
            output_files['numpy'] = data_path
        
        if self.config.save_csv:
            csv_path = os.path.join(self.output_dir, 'node_results.csv')
            with open(csv_path, 'w') as f:
                f.write('node_id,x,y,head(m),pressure(kPa),velocity_x(m/s),velocity_y(m/s),gradient\n')
                for i in range(len(self.mesh.nodes)):
                    f.write(f'{i},{self.mesh.nodes[i,0]:.4f},{self.mesh.nodes[i,1]:.4f},'
                           f'{self.result.head[i]:.4f},{self.result.pressure[i]/1000:.4f},'
                           f'{self.result.velocity_x[i]:.6e},{self.result.velocity_y[i]:.6e},'
                           f'{self.result.hydraulic_gradient[i]:.6f}\n')
            output_files['csv'] = csv_path
        
        return output_files
    
    def get_statistics(self) -> Dict[str, Dict[str, float]]:
        return {
            'hydraulic_head': {
                'max': float(np.max(self.result.head)),
                'min': float(np.min(self.result.head)),
                'mean': float(np.mean(self.result.head)),
                'std': float(np.std(self.result.head))
            },
            'pressure': {
                'max': float(np.max(self.result.pressure) / 1000.0),
                'min': float(np.min(self.result.pressure) / 1000.0),
                'mean': float(np.mean(self.result.pressure) / 1000.0),
                'std': float(np.std(self.result.pressure) / 1000.0)
            },
            'velocity': {
                'max': float(np.max(self.result.velocity_magnitude)),
                'min': float(np.min(self.result.velocity_magnitude)),
                'mean': float(np.mean(self.result.velocity_magnitude)),
                'std': float(np.std(self.result.velocity_magnitude))
            },
            'hydraulic_gradient': {
                'max': float(np.max(self.result.hydraulic_gradient)),
                'min': float(np.min(self.result.hydraulic_gradient)),
                'mean': float(np.mean(self.result.hydraulic_gradient)),
                'std': float(np.std(self.result.hydraulic_gradient))
            }
        }
