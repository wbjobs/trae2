import logging
import json
import pickle
import os
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict
import numpy as np
import redis

from config import redis_config
from data_models import GridWeatherData, GridDefinition, SimulationTask, WeatherVariable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class TaskSnapshot:
    snapshot_id: str
    task_id: str
    timestamp: datetime
    grid_def: Dict
    initial_data: Dict
    current_step: int
    total_steps: int
    completed_regions: List[str]
    pending_regions: List[str]
    variables: List[str]
    results: List[Dict]
    metadata: Dict = field(default_factory=dict)
    checksum: str = ""

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        return data

    @classmethod
    def from_dict(cls, data: Dict) -> 'TaskSnapshot':
        data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)


class SnapshotManager:
    def __init__(self, storage_dir: Optional[str] = None, use_redis: bool = True):
        self.storage_dir = storage_dir or os.path.join(os.getcwd(), "snapshots")
        self.use_redis = use_redis
        self._ensure_storage_dir()
        
        if use_redis:
            self.redis_client = redis.Redis(
                host=redis_config.host,
                port=redis_config.port,
                db=redis_config.db,
                password=redis_config.password if redis_config.password else None,
                decode_responses=True
            )
        
        self.snapshot_key_prefix = "snapshot:"
        self.snapshot_index_key = "snapshot:index"

    def _ensure_storage_dir(self):
        if not os.path.exists(self.storage_dir):
            os.makedirs(self.storage_dir)
            logger.info(f"Created snapshot storage directory: {self.storage_dir}")

    def _generate_snapshot_id(self, task_id: str, step: int) -> str:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"{task_id}_{step}_{timestamp}"

    def _calculate_checksum(self, data: Any) -> str:
        if isinstance(data, np.ndarray):
            return hashlib.md5(data.tobytes()).hexdigest()
        elif isinstance(data, dict):
            return hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()
        else:
            return hashlib.md5(pickle.dumps(data)).hexdigest()

    def create_snapshot(self, task: SimulationTask, grid_data: GridWeatherData, 
                        current_step: int, completed_regions: List[str], 
                        pending_regions: List[str], results: List[Dict],
                        metadata: Optional[Dict] = None) -> str:
        snapshot_id = self._generate_snapshot_id(task.task_id, current_step)
        
        initial_data_dict = {
            'temperature': grid_data.temperature.tolist() if grid_data.temperature is not None else None,
            'humidity': grid_data.humidity.tolist() if grid_data.humidity is not None else None,
            'pressure': grid_data.pressure.tolist() if grid_data.pressure is not None else None,
            'wind_speed': grid_data.wind_speed.tolist() if grid_data.wind_speed is not None else None,
            'wind_direction': grid_data.wind_direction.tolist() if grid_data.wind_direction is not None else None,
            'precipitation': grid_data.precipitation.tolist() if grid_data.precipitation is not None else None,
            'timestamp': grid_data.timestamp.isoformat()
        }
        
        grid_def_dict = {
            'lat_min': grid_data.grid_def.lat_min,
            'lat_max': grid_data.grid_def.lat_max,
            'lon_min': grid_data.grid_def.lon_min,
            'lon_max': grid_data.grid_def.lon_max,
            'resolution': grid_data.grid_def.resolution
        }
        
        snapshot = TaskSnapshot(
            snapshot_id=snapshot_id,
            task_id=task.task_id,
            timestamp=datetime.utcnow(),
            grid_def=grid_def_dict,
            initial_data=initial_data_dict,
            current_step=current_step,
            total_steps=task.time_step,
            completed_regions=completed_regions.copy(),
            pending_regions=pending_regions.copy(),
            variables=[v.value for v in task.variables],
            results=results.copy(),
            metadata=metadata or {}
        )
        
        snapshot.checksum = self._calculate_checksum({
            'task_id': task.task_id,
            'current_step': current_step,
            'results': results
        })
        
        self._save_snapshot(snapshot)
        self._update_index(snapshot)
        
        logger.info(f"Created snapshot {snapshot_id} for task {task.task_id} at step {current_step}")
        return snapshot_id

    def _save_snapshot(self, snapshot: TaskSnapshot):
        snapshot_dict = snapshot.to_dict()
        
        if self.use_redis:
            key = f"{self.snapshot_key_prefix}{snapshot.snapshot_id}"
            self.redis_client.set(key, json.dumps(snapshot_dict))
            self.redis_client.expire(key, timedelta(days=7))
        
        file_path = os.path.join(self.storage_dir, f"{snapshot.snapshot_id}.json")
        with open(file_path, 'w') as f:
            json.dump(snapshot_dict, f, indent=2)

    def _update_index(self, snapshot: TaskSnapshot):
        index_data = {
            'snapshot_id': snapshot.snapshot_id,
            'task_id': snapshot.task_id,
            'timestamp': snapshot.timestamp.isoformat(),
            'current_step': snapshot.current_step,
            'total_steps': snapshot.total_steps,
            'progress': f"{snapshot.current_step}/{snapshot.total_steps}"
        }
        
        if self.use_redis:
            self.redis_client.zadd(
                self.snapshot_index_key,
                {json.dumps(index_data): snapshot.timestamp.timestamp()}
            )

    def load_snapshot(self, snapshot_id: str) -> Optional[TaskSnapshot]:
        snapshot_data = None
        
        if self.use_redis:
            key = f"{self.snapshot_key_prefix}{snapshot_id}"
            data = self.redis_client.get(key)
            if data:
                snapshot_data = json.loads(data)
        
        if not snapshot_data:
            file_path = os.path.join(self.storage_dir, f"{snapshot_id}.json")
            if os.path.exists(file_path):
                with open(file_path, 'r') as f:
                    snapshot_data = json.load(f)
        
        if snapshot_data:
            return TaskSnapshot.from_dict(snapshot_data)
        
        logger.warning(f"Snapshot {snapshot_id} not found")
        return None

    def restore_from_snapshot(self, snapshot_id: str) -> Tuple[Optional[GridWeatherData], List[str], List[str], List[Dict]]:
        snapshot = self.load_snapshot(snapshot_id)
        if not snapshot:
            return None, [], [], []
        
        grid_def = GridDefinition(
            lat_min=snapshot.grid_def['lat_min'],
            lat_max=snapshot.grid_def['lat_max'],
            lon_min=snapshot.grid_def['lon_min'],
            lon_max=snapshot.grid_def['lon_max'],
            resolution=snapshot.grid_def['resolution']
        )
        
        timestamp = datetime.fromisoformat(snapshot.initial_data['timestamp'])
        
        grid_data = GridWeatherData(
            grid_def=grid_def,
            timestamp=timestamp,
            temperature=np.array(snapshot.initial_data['temperature']) if snapshot.initial_data['temperature'] else None,
            humidity=np.array(snapshot.initial_data['humidity']) if snapshot.initial_data['humidity'] else None,
            pressure=np.array(snapshot.initial_data['pressure']) if snapshot.initial_data['pressure'] else None,
            wind_speed=np.array(snapshot.initial_data['wind_speed']) if snapshot.initial_data['wind_speed'] else None,
            wind_direction=np.array(snapshot.initial_data['wind_direction']) if snapshot.initial_data['wind_direction'] else None,
            precipitation=np.array(snapshot.initial_data['precipitation']) if snapshot.initial_data['precipitation'] else None
        )
        
        logger.info(f"Restored from snapshot {snapshot_id}: step {snapshot.current_step}/{snapshot.total_steps}")
        return grid_data, snapshot.completed_regions, snapshot.pending_regions, snapshot.results

    def list_snapshots(self, task_id: Optional[str] = None, limit: int = 20) -> List[Dict]:
        snapshots = []
        
        if self.use_redis:
            data_list = self.redis_client.zrevrange(self.snapshot_index_key, 0, limit - 1)
            for data_str in data_list:
                data = json.loads(data_str)
                if task_id is None or data['task_id'] == task_id:
                    snapshots.append(data)
        
        if not snapshots:
            files = sorted(os.listdir(self.storage_dir), reverse=True)
            for file in files[:limit]:
                if file.endswith('.json'):
                    file_path = os.path.join(self.storage_dir, file)
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                    if task_id is None or data['task_id'] == task_id:
                        snapshots.append({
                            'snapshot_id': data['snapshot_id'],
                            'task_id': data['task_id'],
                            'timestamp': data['timestamp'],
                            'current_step': data['current_step'],
                            'total_steps': data['total_steps'],
                            'progress': f"{data['current_step']}/{data['total_steps']}"
                        })
        
        return snapshots

    def delete_snapshot(self, snapshot_id: str) -> bool:
        try:
            if self.use_redis:
                key = f"{self.snapshot_key_prefix}{snapshot_id}"
                self.redis_client.delete(key)
            
            file_path = os.path.join(self.storage_dir, f"{snapshot_id}.json")
            if os.path.exists(file_path):
                os.remove(file_path)
            
            logger.info(f"Deleted snapshot {snapshot_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete snapshot {snapshot_id}: {e}")
            return False

    def clean_old_snapshots(self, days: int = 7) -> int:
        cutoff = datetime.utcnow() - timedelta(days=days)
        deleted_count = 0
        
        for filename in os.listdir(self.storage_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(self.storage_dir, filename)
                mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                if mtime < cutoff:
                    os.remove(file_path)
                    deleted_count += 1
        
        logger.info(f"Cleaned {deleted_count} snapshots older than {days} days")
        return deleted_count

    def verify_snapshot(self, snapshot_id: str) -> bool:
        snapshot = self.load_snapshot(snapshot_id)
        if not snapshot:
            return False
        
        checksum = self._calculate_checksum({
            'task_id': snapshot.task_id,
            'current_step': snapshot.current_step,
            'results': snapshot.results
        })
        
        return checksum == snapshot.checksum

    def get_latest_snapshot(self, task_id: str) -> Optional[TaskSnapshot]:
        snapshots = self.list_snapshots(task_id=task_id, limit=1)
        if snapshots:
            return self.load_snapshot(snapshots[0]['snapshot_id'])
        return None

    def compare_snapshots(self, snapshot_id1: str, snapshot_id2: str) -> Dict:
        snap1 = self.load_snapshot(snapshot_id1)
        snap2 = self.load_snapshot(snapshot_id2)
        
        if not snap1 or not snap2:
            return {'error': 'One or both snapshots not found'}
        
        time_diff = (snap2.timestamp - snap1.timestamp).total_seconds()
        step_diff = snap2.current_step - snap1.current_step
        
        return {
            'snapshot1': snapshot_id1,
            'snapshot2': snapshot_id2,
            'time_difference_seconds': time_diff,
            'step_difference': step_diff,
            'completed_regions_diff': len(snap2.completed_regions) - len(snap1.completed_regions),
            'pending_regions_diff': len(snap2.pending_regions) - len(snap1.pending_regions),
            'results_count_diff': len(snap2.results) - len(snap1.results),
            'progress_change': f"{snap1.current_step}/{snap1.total_steps} -> {snap2.current_step}/{snap2.total_steps}"
        }


class AutoSnapshotManager:
    def __init__(self, snapshot_manager: SnapshotManager, interval_steps: int = 10):
        self.snapshot_manager = snapshot_manager
        self.interval_steps = interval_steps
        self.last_snapshot_step = 0
        self.snapshot_history = []

    def should_snapshot(self, current_step: int) -> bool:
        if current_step == 0:
            return False
        return current_step - self.last_snapshot_step >= self.interval_steps

    def create_auto_snapshot(self, task: SimulationTask, grid_data: GridWeatherData,
                             current_step: int, completed_regions: List[str],
                             pending_regions: List[str], results: List[Dict]) -> Optional[str]:
        if self.should_snapshot(current_step):
            metadata = {
                'auto_snapshot': True,
                'interval_steps': self.interval_steps
            }
            snapshot_id = self.snapshot_manager.create_snapshot(
                task, grid_data, current_step, completed_regions, pending_regions, results, metadata
            )
            self.last_snapshot_step = current_step
            self.snapshot_history.append(snapshot_id)
            return snapshot_id
        return None

    def get_recovery_point(self, task_id: str) -> Optional[str]:
        snapshots = self.snapshot_manager.list_snapshots(task_id=task_id, limit=5)
        for snap in snapshots:
            if self.snapshot_manager.verify_snapshot(snap['snapshot_id']):
                return snap['snapshot_id']
        return None
