import os
import h5py
import json
import csv
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime
import logging

from .config import SimulationConfig
from .kernel import SimulationState, ParticleData, FluidData

logger = logging.getLogger(__name__)


@dataclass
class ExportConfig:
    output_dir: str = "./results"
    format: str = "hdf5"
    save_particle_data: bool = True
    save_fluid_data: bool = True
    save_force_data: bool = True
    save_config: bool = True
    save_summary: bool = True
    compression: bool = True
    compression_level: int = 4


class ResultExporter:
    def __init__(self, config: SimulationConfig):
        self.config = config
        self.export_config = ExportConfig(
            output_dir=config.output.output_dir,
            format=config.output.format,
            save_particle_data=config.output.save_particle_data,
            save_fluid_data=config.output.save_fluid_data,
            save_force_data=config.output.save_force_data,
            compression=config.output.compression,
            compression_level=config.output.compression_level
        )
        
        self._ensure_output_dir()
    
    def _ensure_output_dir(self) -> None:
        Path(self.export_config.output_dir).mkdir(parents=True, exist_ok=True)
    
    def _generate_filename(self, task_id: str, suffix: str, name: str = "") -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if name:
            filename = f"{task_id}_{name}_{timestamp}.{suffix}"
        else:
            filename = f"{task_id}_{timestamp}.{suffix}"
        return os.path.join(self.export_config.output_dir, filename)
    
    def export_all(
        self,
        state: SimulationState,
        task_id: str = "simulation",
        formats: Optional[List[str]] = None
    ) -> str:
        if formats is None:
            formats = [self.export_config.format]
        
        export_paths = {}
        
        for fmt in formats:
            if fmt == "hdf5":
                export_paths[fmt] = self.export_hdf5(state, task_id)
            elif fmt == "csv":
                export_paths[fmt] = self.export_csv(state, task_id)
            elif fmt == "vtk":
                export_paths[fmt] = self.export_vtk(state, task_id)
            elif fmt == "json":
                export_paths[fmt] = self.export_json(state, task_id)
            else:
                logger.warning(f"不支持的导出格式: {fmt}")
        
        if self.export_config.save_config:
            export_paths['config'] = self.export_config_file(task_id)
        
        if self.export_config.save_summary:
            export_paths['summary'] = self.export_summary(state, task_id)
        
        logger.info(f"结果导出完成，格式: {list(export_paths.keys())}")
        
        return self.export_config.output_dir
    
    def export_hdf5(self, state: SimulationState, task_id: str) -> str:
        filepath = self._generate_filename(task_id, "h5")
        
        compression_opts = None
        if self.export_config.compression:
            compression_opts = {
                'compression': 'gzip',
                'compression_opts': self.export_config.compression_level
            }
        
        with h5py.File(filepath, 'w') as f:
            f.attrs['task_id'] = task_id
            f.attrs['created_at'] = datetime.now().isoformat()
            f.attrs['version'] = "1.0.0"
            
            sim_group = f.create_group('simulation')
            sim_group.attrs['current_time'] = state.current_time
            sim_group.attrs['current_step'] = state.current_step
            sim_group.attrs['total_steps'] = state.total_steps
            sim_group.attrs['collision_count'] = state.collision_count
            sim_group.attrs['energy_kinetic'] = state.energy_kinetic
            sim_group.attrs['energy_potential'] = state.energy_potential
            
            if self.export_config.save_particle_data:
                self._save_particles_hdf5(f, state.particle_data, compression_opts)
            
            if self.export_config.save_fluid_data:
                self._save_fluid_hdf5(f, state.fluid_data, compression_opts)
            
            config_group = f.create_group('config')
            self._save_config_hdf5(config_group, compression_opts)
        
        logger.info(f"HDF5数据已导出: {filepath}")
        return filepath
    
    def _save_particles_hdf5(
        self,
        f: h5py.File,
        particle_data: ParticleData,
        compression_opts: Optional[Dict]
    ) -> None:
        p_group = f.create_group('particles')
        
        datasets = {
            'positions': particle_data.positions,
            'velocities': particle_data.velocities,
            'accelerations': particle_data.accelerations,
            'forces': particle_data.forces,
            'torques': particle_data.torques,
            'angular_velocities': particle_data.angular_velocities,
            'diameters': particle_data.diameters,
            'densities': particle_data.densities,
            'masses': particle_data.masses,
            'ids': particle_data.ids
        }
        
        for name, data in datasets.items():
            if data is not None:
                if compression_opts:
                    p_group.create_dataset(name, data=data, **compression_opts)
                else:
                    p_group.create_dataset(name, data=data)
    
    def _save_fluid_hdf5(
        self,
        f: h5py.File,
        fluid_data: FluidData,
        compression_opts: Optional[Dict]
    ) -> None:
        f_group = f.create_group('fluid')
        
        f_group.attrs['grid_shape'] = fluid_data.grid_shape
        
        datasets = {
            'velocity': fluid_data.velocity,
            'pressure': fluid_data.pressure,
            'density': fluid_data.density,
            'viscosity': fluid_data.viscosity,
            'volume_fraction': fluid_data.volume_fraction
        }
        
        for name, data in datasets.items():
            if data is not None:
                if compression_opts:
                    f_group.create_dataset(name, data=data, **compression_opts)
                else:
                    f_group.create_dataset(name, data=data)
    
    def _save_config_hdf5(self, group: h5py.Group, compression_opts: Optional[Dict]) -> None:
        config_dict = self.config.to_dict()
        
        for section, data in config_dict.items():
            if isinstance(data, dict):
                subgroup = group.create_group(section)
                for key, value in data.items():
                    if isinstance(value, (int, float, str, bool)):
                        subgroup.attrs[key] = value
                    elif isinstance(value, list):
                        subgroup.create_dataset(key, data=np.array(value))
            elif isinstance(data, list):
                group.create_dataset(section, data=np.array(data))
    
    def export_csv(self, state: SimulationState, task_id: str) -> str:
        output_dir = os.path.join(self.export_config.output_dir, f"{task_id}_csv")
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        if self.export_config.save_particle_data:
            self._save_particles_csv(state.particle_data, output_dir)
        
        if self.export_config.save_fluid_data:
            self._save_fluid_csv(state.fluid_data, output_dir)
        
        logger.info(f"CSV数据已导出: {output_dir}")
        return output_dir
    
    def _save_particles_csv(self, particle_data: ParticleData, output_dir: str) -> None:
        n = len(particle_data.ids) if particle_data.ids is not None else 0
        
        df = pd.DataFrame({
            'id': particle_data.ids if particle_data.ids is not None else np.arange(n),
            'pos_x': particle_data.positions[:, 0] if particle_data.positions is not None else np.nan,
            'pos_y': particle_data.positions[:, 1] if particle_data.positions is not None else np.nan,
            'pos_z': particle_data.positions[:, 2] if particle_data.positions is not None else np.nan,
            'vel_x': particle_data.velocities[:, 0] if particle_data.velocities is not None else np.nan,
            'vel_y': particle_data.velocities[:, 1] if particle_data.velocities is not None else np.nan,
            'vel_z': particle_data.velocities[:, 2] if particle_data.velocities is not None else np.nan,
            'diameter': particle_data.diameters if particle_data.diameters is not None else np.nan,
            'density': particle_data.densities if particle_data.densities is not None else np.nan,
            'mass': particle_data.masses if particle_data.masses is not None else np.nan
        })
        
        if self.export_config.save_force_data:
            df['force_x'] = particle_data.forces[:, 0] if particle_data.forces is not None else np.nan
            df['force_y'] = particle_data.forces[:, 1] if particle_data.forces is not None else np.nan
            df['force_z'] = particle_data.forces[:, 2] if particle_data.forces is not None else np.nan
        
        filepath = os.path.join(output_dir, "particles.csv")
        df.to_csv(filepath, index=False, float_format='%.6e')
    
    def _save_fluid_csv(self, fluid_data: FluidData, output_dir: str) -> None:
        nx, ny, nz = fluid_data.grid_shape
        
        data = []
        for i in range(nx):
            for j in range(ny):
                for k in range(nz):
                    row = {
                        'i': i, 'j': j, 'k': k,
                        'pressure': fluid_data.pressure[i, j, k],
                        'density': fluid_data.density[i, j, k],
                        'vel_x': fluid_data.velocity[i, j, k, 0],
                        'vel_y': fluid_data.velocity[i, j, k, 1],
                        'vel_z': fluid_data.velocity[i, j, k, 2]
                    }
                    data.append(row)
        
        df = pd.DataFrame(data)
        filepath = os.path.join(output_dir, "fluid.csv")
        df.to_csv(filepath, index=False, float_format='%.6e')
    
    def export_vtk(self, state: SimulationState, task_id: str) -> str:
        filepath = self._generate_filename(task_id, "vtu", "particles")
        
        with open(filepath, 'w') as f:
            f.write('<?xml version="1.0"?>\n')
            f.write('<VTKFile type="UnstructuredGrid" version="0.1" byte_order="LittleEndian">\n')
            f.write('  <UnstructuredGrid>\n')
            
            n = len(state.particle_data.ids)
            f.write(f'    <Piece NumberOfPoints="{n}" NumberOfCells="{n}">\n')
            
            f.write('      <Points>\n')
            f.write('        <DataArray type="Float64" NumberOfComponents="3" format="ascii">\n')
            for i in range(n):
                x, y, z = state.particle_data.positions[i]
                f.write(f'          {x:.6e} {y:.6e} {z:.6e}\n')
            f.write('        </DataArray>\n')
            f.write('      </Points>\n')
            
            f.write('      <Cells>\n')
            f.write('        <DataArray type="Int32" Name="connectivity" format="ascii">\n')
            for i in range(n):
                f.write(f'          {i}\n')
            f.write('        </DataArray>\n')
            f.write('        <DataArray type="Int32" Name="offsets" format="ascii">\n')
            for i in range(1, n + 1):
                f.write(f'          {i}\n')
            f.write('        </DataArray>\n')
            f.write('        <DataArray type="UInt8" Name="types" format="ascii">\n')
            for _ in range(n):
                f.write('          1\n')
            f.write('        </DataArray>\n')
            f.write('      </Cells>\n')
            
            f.write('      <PointData>\n')
            
            f.write('        <DataArray type="Float64" Name="velocity" NumberOfComponents="3" format="ascii">\n')
            for i in range(n):
                vx, vy, vz = state.particle_data.velocities[i]
                f.write(f'          {vx:.6e} {vy:.6e} {vz:.6e}\n')
            f.write('        </DataArray>\n')
            
            f.write('        <DataArray type="Float64" Name="diameter" format="ascii">\n')
            for d in state.particle_data.diameters:
                f.write(f'          {d:.6e}\n')
            f.write('        </DataArray>\n')
            
            f.write('      </PointData>\n')
            f.write('    </Piece>\n')
            f.write('  </UnstructuredGrid>\n')
            f.write('</VTKFile>\n')
        
        logger.info(f"VTK数据已导出: {filepath}")
        return filepath
    
    def export_json(self, state: SimulationState, task_id: str) -> str:
        filepath = self._generate_filename(task_id, "json")
        
        data = {
            'task_id': task_id,
            'created_at': datetime.now().isoformat(),
            'simulation': {
                'current_time': state.current_time,
                'current_step': state.current_step,
                'total_steps': state.total_steps,
                'collision_count': state.collision_count,
                'energy_kinetic': state.energy_kinetic,
                'energy_potential': state.energy_potential
            },
            'config': self.config.to_dict()
        }
        
        if self.export_config.save_particle_data:
            n = min(1000, len(state.particle_data.ids))
            data['particles'] = {
                'count': len(state.particle_data.ids),
                'sample_ids': state.particle_data.ids[:n].tolist(),
                'sample_positions': state.particle_data.positions[:n].tolist()
            }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"JSON数据已导出: {filepath}")
        return filepath
    
    def export_config_file(self, task_id: str) -> str:
        filepath = self._generate_filename(task_id, "yaml", "config")
        self.config.save(filepath)
        return filepath
    
    def export_summary(self, state: SimulationState, task_id: str) -> str:
        filepath = self._generate_filename(task_id, "txt", "summary")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write("=" * 60 + "\n")
            f.write("CFD-DEM 仿真结果摘要\n")
            f.write("=" * 60 + "\n\n")
            
            f.write(f"任务ID: {task_id}\n")
            f.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("-" * 40 + "\n")
            f.write("仿真统计\n")
            f.write("-" * 40 + "\n")
            f.write(f"总时间步数: {state.total_steps}\n")
            f.write(f"完成步数: {state.current_step}\n")
            f.write(f"仿真时间: {state.current_time:.6e} s\n")
            f.write(f"总碰撞次数: {state.collision_count}\n\n")
            
            f.write("-" * 40 + "\n")
            f.write("能量统计\n")
            f.write("-" * 40 + "\n")
            f.write(f"动能: {state.energy_kinetic:.6e} J\n")
            f.write(f"势能: {state.energy_potential:.6e} J\n")
            f.write(f"总能量: {state.energy_kinetic + state.energy_potential:.6e} J\n\n")
            
            f.write("-" * 40 + "\n")
            f.write("颗粒信息\n")
            f.write("-" * 40 + "\n")
            f.write(f"颗粒数量: {len(state.particle_data.ids)}\n")
            f.write(f"颗粒直径: {self.config.particle.diameter:.6e} m\n")
            f.write(f"颗粒密度: {self.config.particle.density:.6e} kg/m³\n\n")
            
            f.write("-" * 40 + "\n")
            f.write("流体信息\n")
            f.write("-" * 40 + "\n")
            f.write(f"流体密度: {self.config.fluid.density:.6e} kg/m³\n")
            f.write(f"流体粘度: {self.config.fluid.viscosity:.6e} Pa·s\n")
            f.write(f"流体温度: {self.config.fluid.temperature:.2f} K\n\n")
            
            f.write("=" * 60 + "\n")
        
        logger.info(f"摘要文件已导出: {filepath}")
        return filepath
    
    @staticmethod
    def load_hdf5(filepath: str) -> Dict[str, Any]:
        result = {}
        
        with h5py.File(filepath, 'r') as f:
            result['task_id'] = f.attrs.get('task_id', '')
            result['created_at'] = f.attrs.get('created_at', '')
            
            if 'simulation' in f:
                sim_group = f['simulation']
                result['simulation'] = {
                    'current_time': sim_group.attrs['current_time'],
                    'current_step': sim_group.attrs['current_step'],
                    'total_steps': sim_group.attrs['total_steps'],
                    'collision_count': sim_group.attrs['collision_count'],
                    'energy_kinetic': sim_group.attrs['energy_kinetic'],
                    'energy_potential': sim_group.attrs['energy_potential']
                }
            
            if 'particles' in f:
                p_group = f['particles']
                result['particles'] = {}
                for name in p_group:
                    result['particles'][name] = p_group[name][:]
            
            if 'fluid' in f:
                f_group = f['fluid']
                result['fluid'] = {}
                for name in f_group:
                    if name != 'grid_shape':
                        result['fluid'][name] = f_group[name][:]
                result['fluid']['grid_shape'] = f_group.attrs['grid_shape']
        
        return result
