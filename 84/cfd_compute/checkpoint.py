from typing import Dict, Any, Optional, List
import os
import json
import time
import logging
import threading
from datetime import datetime
from dataclasses import dataclass, field, asdict
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class CheckpointMetadata:
    task_id: str
    iteration: int
    total_iterations: int
    timestamp: str
    elapsed_time: float
    grid_nx: int
    grid_ny: int
    num_shards: int
    dt: float
    nu: float
    status: str = 'interrupted'
    metrics_snapshot: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CheckpointMetadata':
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


class CheckpointStorage:
    def __init__(self, base_dir: str = 'checkpoints'):
        self.base_dir = base_dir
        os.makedirs(base_dir, exist_ok=True)

    def _task_dir(self, task_id: str) -> str:
        path = os.path.join(self.base_dir, task_id)
        os.makedirs(path, exist_ok=True)
        return path

    def save_field(self, task_id: str, name: str, data: np.ndarray) -> str:
        path = os.path.join(self._task_dir(task_id), f'{name}.npy')
        np.save(path, data)
        return path

    def load_field(self, task_id: str, name: str) -> np.ndarray:
        path = os.path.join(self._task_dir(task_id), f'{name}.npy')
        return np.load(path)

    def save_metadata(self, task_id: str, metadata: CheckpointMetadata) -> str:
        path = os.path.join(self._task_dir(task_id), 'metadata.json')
        with open(path, 'w') as f:
            json.dump(metadata.to_dict(), f, indent=2)
        return path

    def load_metadata(self, task_id: str) -> Optional[CheckpointMetadata]:
        path = os.path.join(self._task_dir(task_id), 'metadata.json')
        if not os.path.exists(path):
            return None
        with open(path, 'r') as f:
            data = json.load(f)
        return CheckpointMetadata.from_dict(data)

    def save_shard_field(self, task_id: str, shard_id: int, name: str, data: np.ndarray) -> str:
        shard_dir = os.path.join(self._task_dir(task_id), f'shard_{shard_id}')
        os.makedirs(shard_dir, exist_ok=True)
        path = os.path.join(shard_dir, f'{name}.npy')
        np.save(path, data)
        return path

    def load_shard_field(self, task_id: str, shard_id: int, name: str) -> np.ndarray:
        shard_dir = os.path.join(self._task_dir(task_id), f'shard_{shard_id}')
        path = os.path.join(shard_dir, f'{name}.npy')
        return np.load(path)

    def checkpoint_exists(self, task_id: str) -> bool:
        path = os.path.join(self._task_dir(task_id), 'metadata.json')
        return os.path.exists(path)

    def list_checkpoints(self) -> List[Dict[str, Any]]:
        results = []
        if not os.path.exists(self.base_dir):
            return results
        for task_id in os.listdir(self.base_dir):
            meta = self.load_metadata(task_id)
            if meta:
                results.append(meta.to_dict())
        return results

    def delete_checkpoint(self, task_id: str) -> bool:
        import shutil
        path = self._task_dir(task_id)
        if os.path.exists(path):
            shutil.rmtree(path)
            return True
        return False


class CheckpointManager:
    def __init__(self, storage: Optional[CheckpointStorage] = None,
                 save_interval: int = 50,
                 auto_save: bool = True):
        self.storage = storage or CheckpointStorage()
        self.save_interval = save_interval
        self.auto_save = auto_save
        self._last_save_iteration = 0
        self._lock = threading.RLock()
        self._callbacks: List[callable] = []

    def on_checkpoint_saved(self, callback: callable) -> None:
        self._callbacks.append(callback)

    def should_checkpoint(self, current_iteration: int) -> bool:
        if not self.auto_save:
            return False
        return (current_iteration - self._last_save_iteration) >= self.save_interval

    def save(self, task_id: str, iteration: int, total_iterations: int,
             u: np.ndarray, v: np.ndarray, p: np.ndarray,
             elapsed_time: float = 0.0, dt: float = 0.0, nu: float = 0.0,
             grid_nx: int = 0, grid_ny: int = 0, num_shards: int = 1,
             metrics: Optional[Dict[str, float]] = None,
             status: str = 'interrupted') -> CheckpointMetadata:
        with self._lock:
            self.storage.save_field(task_id, 'u', u)
            self.storage.save_field(task_id, 'v', v)
            self.storage.save_field(task_id, 'p', p)
            metadata = CheckpointMetadata(
                task_id=task_id,
                iteration=iteration,
                total_iterations=total_iterations,
                timestamp=datetime.utcnow().isoformat(),
                elapsed_time=elapsed_time,
                grid_nx=grid_nx or u.shape[0],
                grid_ny=grid_ny or u.shape[1],
                num_shards=num_shards,
                dt=dt,
                nu=nu,
                status=status,
                metrics_snapshot=metrics or {}
            )
            self.storage.save_metadata(task_id, metadata)
            self._last_save_iteration = iteration
            logger.info(f'Checkpoint saved: task={task_id}, iteration={iteration}')
            for cb in self._callbacks:
                try:
                    cb(metadata)
                except Exception:
                    pass
            return metadata

    def save_sharded(self, task_id: str, iteration: int, total_iterations: int,
                     shard_states: Dict[int, Dict[str, np.ndarray]],
                     elapsed_time: float = 0.0, dt: float = 0.0, nu: float = 0.0,
                     grid_nx: int = 0, grid_ny: int = 0, num_shards: int = 1,
                     metrics: Optional[Dict[str, float]] = None) -> CheckpointMetadata:
        with self._lock:
            for shard_id, fields in shard_states.items():
                for name, data in fields.items():
                    self.storage.save_shard_field(task_id, shard_id, name, data)
            metadata = CheckpointMetadata(
                task_id=task_id,
                iteration=iteration,
                total_iterations=total_iterations,
                timestamp=datetime.utcnow().isoformat(),
                elapsed_time=elapsed_time,
                grid_nx=grid_nx,
                grid_ny=grid_ny,
                num_shards=num_shards,
                dt=dt,
                nu=nu,
                status='interrupted',
                metrics_snapshot=metrics or {}
            )
            self.storage.save_metadata(task_id, metadata)
            self._last_save_iteration = iteration
            logger.info(f'Sharded checkpoint saved: task={task_id}, iteration={iteration}, shards={len(shard_states)}')
            return metadata

    def load(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            metadata = self.storage.load_metadata(task_id)
            if metadata is None:
                return None
            try:
                u = self.storage.load_field(task_id, 'u')
                v = self.storage.load_field(task_id, 'v')
                p = self.storage.load_field(task_id, 'p')
            except Exception:
                logger.error(f'Failed to load checkpoint fields for task {task_id}')
                return None
            return {
                'metadata': metadata,
                'u': u,
                'v': v,
                'p': p,
                'resume_from': metadata.iteration
            }

    def load_sharded(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            metadata = self.storage.load_metadata(task_id)
            if metadata is None:
                return None
            shard_states = {}
            for shard_id in range(metadata.num_shards):
                try:
                    u = self.storage.load_shard_field(task_id, shard_id, 'u')
                    v = self.storage.load_shard_field(task_id, shard_id, 'v')
                    p = self.storage.load_shard_field(task_id, shard_id, 'p')
                    shard_states[shard_id] = {'u': u, 'v': v, 'p': p}
                except Exception:
                    logger.error(f'Failed to load shard {shard_id} for task {task_id}')
                    return None
            return {
                'metadata': metadata,
                'shard_states': shard_states,
                'resume_from': metadata.iteration
            }

    def has_checkpoint(self, task_id: str) -> bool:
        return self.storage.checkpoint_exists(task_id)

    def list_checkpoints(self) -> List[Dict[str, Any]]:
        return self.storage.list_checkpoints()

    def delete_checkpoint(self, task_id: str) -> bool:
        return self.storage.delete_checkpoint(task_id)

    def mark_completed(self, task_id: str) -> None:
        metadata = self.storage.load_metadata(task_id)
        if metadata:
            metadata.status = 'completed'
            self.storage.save_metadata(task_id, metadata)


def resume_or_create(task_id: str, config_dict: Dict[str, Any],
                     checkpoint_manager: Optional[CheckpointManager] = None) -> Dict[str, Any]:
    mgr = checkpoint_manager or CheckpointManager()
    checkpoint = mgr.load(task_id)
    if checkpoint and checkpoint['metadata'].status != 'completed':
        logger.info(f'Resuming task {task_id} from iteration {checkpoint["resume_from"]}')
        return {
            'action': 'resume',
            'u': checkpoint['u'],
            'v': checkpoint['v'],
            'p': checkpoint['p'],
            'start_iteration': checkpoint['resume_from'],
            'metadata': checkpoint['metadata']
        }
    return {
        'action': 'create',
        'start_iteration': 0,
        'metadata': None
    }
