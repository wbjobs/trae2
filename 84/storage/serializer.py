from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import numpy as np
from config import GridConfig, SimulationConfig


@dataclass
class FieldData:
    u: np.ndarray
    v: np.ndarray
    p: np.ndarray
    iteration: int
    time: float
    vorticity: Optional[np.ndarray] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'iteration': self.iteration,
            'time': self.time,
            'u_stats': {
                'mean': float(np.mean(self.u)),
                'max': float(np.max(self.u)),
                'min': float(np.min(self.u)),
                'std': float(np.std(self.u))
            },
            'v_stats': {
                'mean': float(np.mean(self.v)),
                'max': float(np.max(self.v)),
                'min': float(np.min(self.v)),
                'std': float(np.std(self.v))
            },
            'p_stats': {
                'mean': float(np.mean(self.p)),
                'max': float(np.max(self.p)),
                'min': float(np.min(self.p)),
                'std': float(np.std(self.p))
            },
            'vorticity_stats': {
                'mean': float(np.mean(self.vorticity)),
                'max': float(np.max(self.vorticity)),
                'min': float(np.min(self.vorticity)),
                'std': float(np.std(self.vorticity))
            } if self.vorticity is not None else None
        }


@dataclass
class FlowMetricsData:
    kinetic_energy: float
    enstrophy: float
    dissipation: float
    max_velocity_magnitude: float
    avg_velocity_magnitude: float
    max_vorticity: float
    min_vorticity: float
    reynolds_number: float
    cfl_number: float
    divergence_max: float
    pressure_max: float
    pressure_min: float
    pressure_mean: float
    iteration: int
    time: float
    shard_id: Optional[int] = None
    additional_metrics: Dict[str, float] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            'kinetic_energy': self.kinetic_energy,
            'enstrophy': self.enstrophy,
            'dissipation': self.dissipation,
            'max_velocity_magnitude': self.max_velocity_magnitude,
            'avg_velocity_magnitude': self.avg_velocity_magnitude,
            'max_vorticity': self.max_vorticity,
            'min_vorticity': self.min_vorticity,
            'reynolds_number': self.reynolds_number,
            'cfl_number': self.cfl_number,
            'divergence_max': self.divergence_max,
            'pressure_max': self.pressure_max,
            'pressure_min': self.pressure_min,
            'pressure_mean': self.pressure_mean,
            'iteration': self.iteration,
            'time': self.time,
            **self.additional_metrics
        }
        if self.shard_id is not None:
            result['shard_id'] = self.shard_id
        return result
    
    def to_fields(self) -> Dict[str, float]:
        fields = {
            'kinetic_energy': float(self.kinetic_energy),
            'enstrophy': float(self.enstrophy),
            'dissipation': float(self.dissipation),
            'max_velocity_magnitude': float(self.max_velocity_magnitude),
            'avg_velocity_magnitude': float(self.avg_velocity_magnitude),
            'max_vorticity': float(self.max_vorticity),
            'min_vorticity': float(self.min_vorticity),
            'reynolds_number': float(self.reynolds_number),
            'cfl_number': float(self.cfl_number),
            'divergence_max': float(self.divergence_max),
            'pressure_max': float(self.pressure_max),
            'pressure_min': float(self.pressure_min),
            'pressure_mean': float(self.pressure_mean),
        }
        for k, v in self.additional_metrics.items():
            fields[k] = float(v)
        return fields
    
    def to_tags(self) -> Dict[str, str]:
        tags = {
            'iteration': str(self.iteration),
        }
        if self.shard_id is not None:
            tags['shard_id'] = str(self.shard_id)
        return tags


class ResultSerializer:
    def __init__(self):
        self._measurement_flow = 'cfd_flow_metrics'
        self._measurement_field = 'cfd_field_stats'
        self._measurement_task = 'cfd_task_events'
        self._measurement_node = 'cfd_node_metrics'
    
    def create_flow_metrics_point(self, metrics: Dict[str, Any],
                                  iteration: int, time_val: float,
                                  tags: Optional[Dict[str, str]] = None,
                                  shard_id: Optional[int] = None) -> Dict[str, Any]:
        point_tags = tags.copy() if tags else {}
        point_tags['iteration'] = str(iteration)
        if shard_id is not None:
            point_tags['shard_id'] = str(shard_id)
        fields = {}
        for key, value in metrics.items():
            if isinstance(value, (int, float, np.integer, np.floating)):
                fields[key] = float(value)
            elif isinstance(value, str):
                fields[key] = value
        fields['simulation_time'] = float(time_val)
        return {
            'measurement': self._measurement_flow,
            'tags': point_tags,
            'fields': fields,
            'time': datetime.utcnow()
        }
    
    def create_field_stats_point(self, field_data: FieldData,
                                 tags: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        point_tags = tags.copy() if tags else {}
        point_tags['iteration'] = str(field_data.iteration)
        field_stats = field_data.to_dict()
        fields = {}
        for field_name, stats in field_stats.items():
            if isinstance(stats, dict):
                for stat_name, value in stats.items():
                    fields[f'{field_name}_{stat_name}'] = float(value)
        fields['simulation_time'] = float(field_data.time)
        return {
            'measurement': self._measurement_field,
            'tags': point_tags,
            'fields': fields,
            'time': datetime.utcnow()
        }
    
    def create_task_event_point(self, task_id: str, event_type: str,
                                status: str, metadata: Optional[Dict[str, Any]] = None,
                                tags: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        point_tags = tags.copy() if tags else {}
        point_tags['task_id'] = task_id
        point_tags['event_type'] = event_type
        point_tags['status'] = status
        fields = {}
        if metadata:
            for key, value in metadata.items():
                if isinstance(value, (int, float, np.integer, np.floating)):
                    fields[key] = float(value)
                elif isinstance(value, str):
                    fields[key] = value
                elif isinstance(value, bool):
                    fields[key] = value
                else:
                    fields[key] = str(value)
        return {
            'measurement': self._measurement_task,
            'tags': point_tags,
            'fields': fields,
            'time': datetime.utcnow()
        }
    
    def create_node_metrics_point(self, node_name: str, cpu_percent: float,
                                  memory_percent: float, memory_available_gb: float,
                                  active_tasks: int = 0,
                                  additional_metrics: Optional[Dict[str, float]] = None,
                                  tags: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        point_tags = tags.copy() if tags else {}
        point_tags['node_name'] = node_name
        fields = {
            'cpu_percent': float(cpu_percent),
            'memory_percent': float(memory_percent),
            'memory_available_gb': float(memory_available_gb),
            'active_tasks': int(active_tasks)
        }
        if additional_metrics:
            for key, value in additional_metrics.items():
                fields[key] = float(value)
        return {
            'measurement': self._measurement_node,
            'tags': point_tags,
            'fields': fields,
            'time': datetime.utcnow()
        }
    
    def serialize_shard_result(self, result: Dict[str, Any],
                               grid_config: GridConfig,
                               sim_config: SimulationConfig,
                               tags: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        points = []
        shard_id = result.get('shard_id', 0)
        for saved_data in result.get('saved_data', []):
            iteration = saved_data['iteration']
            time_val = saved_data['time']
            metrics_data = {
                'kinetic_energy': saved_data.get('kinetic_energy', 0.0),
                'shard_id': shard_id
            }
            point = self.create_flow_metrics_point(
                metrics=metrics_data,
                iteration=iteration,
                time_val=time_val,
                tags=tags,
                shard_id=shard_id
            )
            points.append(point)
        return points
    
    def serialize_simulation_result(self, result: Dict[str, Any],
                                    tags: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        points = []
        task_id = result.get('task_id', 'unknown')
        event_point = self.create_task_event_point(
            task_id=task_id,
            event_type='completion',
            status=result.get('status', 'unknown'),
            metadata={
                'iterations_completed': result.get('iterations_completed', 0),
                'name': result.get('name', '')
            },
            tags=tags
        )
        points.append(event_point)
        return points
    
    @staticmethod
    def parse_influx_result(tables: Any) -> List[Dict[str, Any]]:
        results = []
        try:
            for table in tables:
                for record in table.records:
                    results.append({
                        'time': record.get_time(),
                        'measurement': record.get_measurement(),
                        'fields': record.values,
                        'tags': record.values.get('_tags', {})
                    })
        except Exception:
            return []
        return results
    
    @staticmethod
    def parse_influx_v1_result(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return list(points)
