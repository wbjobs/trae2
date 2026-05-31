"""
状态快照保存模块
===============

支持计算过程状态快照保存与恢复，
包括增量保存、断点续算、计算状态管理。
"""

import os
import json
import pickle
import logging
import time
import hashlib
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List, Callable
from enum import Enum
import numpy as np
from scipy.sparse import csr_matrix, spmatrix

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SnapshotState(Enum):
    """快照状态"""
    INITIAL = "initial"
    MESH_GENERATED = "mesh_generated"
    ASSEMBLY_COMPLETE = "assembly_complete"
    INCREMENTAL = "incremental"
    CONVERGED = "converged"
    FAILED = "failed"


@dataclass
class SnapshotMetadata:
    """快照元数据"""
    snapshot_id: str
    timestamp: float
    state: SnapshotState
    iteration: int
    step: int
    data_hash: str
    file_path: str
    file_size: int
    description: str = ""
    tags: List[str] = field(default_factory=list)


@dataclass
class SnapshotData:
    """快照数据"""
    metadata: SnapshotMetadata
    mesh: Optional[Any] = None
    stiffness_matrix: Optional[spmatrix] = None
    displacement: Optional[np.ndarray] = None
    stress: Optional[np.ndarray] = None
    strain: Optional[np.ndarray] = None
    residual: Optional[np.ndarray] = None
    iteration_history: Optional[List[Dict]] = None
    parameters: Optional[Dict] = None
    custom_data: Dict = field(default_factory=dict)


class SnapshotManager:
    """快照管理器"""

    def __init__(self, snapshot_dir: str = "output/snapshots"):
        self.snapshot_dir = snapshot_dir
        os.makedirs(self.snapshot_dir, exist_ok=True)
        self.snapshots: List[SnapshotMetadata] = []
        self._load_existing_snapshots()

    def _load_existing_snapshots(self) -> None:
        """加载已存在的快照"""
        if not os.path.exists(self.snapshot_dir):
            return

        for filename in os.listdir(self.snapshot_dir):
            if filename.endswith("_metadata.json"):
                try:
                    filepath = os.path.join(self.snapshot_dir, filename)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        metadata = SnapshotMetadata(
                            snapshot_id=data["snapshot_id"],
                            timestamp=data["timestamp"],
                            state=SnapshotState(data["state"]),
                            iteration=data["iteration"],
                            step=data["step"],
                            data_hash=data["data_hash"],
                            file_path=data["file_path"],
                            file_size=data["file_size"],
                            description=data.get("description", ""),
                            tags=data.get("tags", [])
                        )
                        self.snapshots.append(metadata)
                except Exception as e:
                    logger.warning(f"加载快照元数据失败 {filename}: {e}")

        self.snapshots.sort(key=lambda x: x.timestamp)
        logger.info(f"加载了 {len(self.snapshots)} 个已有快照")

    def _compute_hash(self, data: Any) -> str:
        """计算数据哈希"""
        if isinstance(data, np.ndarray):
            return hashlib.md5(data.tobytes()).hexdigest()
        elif isinstance(data, spmatrix):
            return hashlib.md5(data.data.tobytes()).hexdigest()
        elif isinstance(data, dict):
            return hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()
        else:
            return hashlib.md5(str(data).encode()).hexdigest()

    def _save_metadata(self, metadata: SnapshotMetadata) -> None:
        """保存快照元数据"""
        metadata_file = os.path.join(
            self.snapshot_dir,
            f"{metadata.snapshot_id}_metadata.json"
        )
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump({
                "snapshot_id": metadata.snapshot_id,
                "timestamp": metadata.timestamp,
                "state": metadata.state.value,
                "iteration": metadata.iteration,
                "step": metadata.step,
                "data_hash": metadata.data_hash,
                "file_path": metadata.file_path,
                "file_size": metadata.file_size,
                "description": metadata.description,
                "tags": metadata.tags
            }, f, ensure_ascii=False, indent=4)

    def save_snapshot(self, snapshot_data: SnapshotData,
                        description: str = "",
                        tags: Optional[List[str]] = None) -> str:
        """保存快照"""
        timestamp = time.time()
        snapshot_id = f"snapshot_{int(timestamp)}_{np.random.randint(1000):04d}"

        snapshot_data.metadata.snapshot_id = snapshot_id
        snapshot_data.metadata.timestamp = timestamp
        snapshot_data.metadata.description = description
        snapshot_data.metadata.tags = tags or []

        data_file = os.path.join(self.snapshot_dir, f"{snapshot_id}_data.pkl")

        try:
            with open(data_file, 'wb') as f:
                pickle.dump(snapshot_data, f, protocol=pickle.HIGHEST_PROTOCOL)

            file_size = os.path.getsize(data_file)
            snapshot_data.metadata.file_path = data_file
            snapshot_data.metadata.file_size = file_size

            self._save_metadata(snapshot_data.metadata)
            self.snapshots.append(snapshot_data.metadata)

            logger.info(f"快照已保存: {snapshot_id} ({file_size/1024:.1f} KB)")
            return snapshot_id

        except Exception as e:
            logger.error(f"保存快照失败 {snapshot_id}: {e}")
            if os.path.exists(data_file):
                os.remove(data_file)
            raise

    def load_snapshot(self, snapshot_id: str) -> Optional[SnapshotData]:
        """加载快照"""
        data_file = os.path.join(self.snapshot_dir, f"{snapshot_id}_data.pkl")

        if not os.path.exists(data_file):
            logger.warning(f"快照文件不存在: {snapshot_id}")
            return None

        try:
            with open(data_file, 'rb') as f:
                snapshot_data = pickle.load(f)
            logger.info(f"快照已加载: {snapshot_id}")
            return snapshot_data
        except Exception as e:
            logger.error(f"加载快照失败 {snapshot_id}: {e}")
            return None

    def delete_snapshot(self, snapshot_id: str) -> bool:
        """删除快照"""
        data_file = os.path.join(self.snapshot_dir, f"{snapshot_id}_data.pkl")
        metadata_file = os.path.join(self.snapshot_dir, f"{snapshot_id}_metadata.json")

        try:
            if os.path.exists(data_file):
                os.remove(data_file)
            if os.path.exists(metadata_file):
                os.remove(metadata_file)

            self.snapshots = [s for s in self.snapshots if s.snapshot_id != snapshot_id]
            logger.info(f"快照已删除: {snapshot_id}")
            return True
        except Exception as e:
            logger.error(f"删除快照失败 {snapshot_id}: {e}")
            return False

    def list_snapshots(self, state: Optional[SnapshotState] = None,
                        tags: Optional[List[str]] = None) -> List[SnapshotMetadata]:
        """列出快照"""
        snapshots = self.snapshots.copy()

        if state:
            snapshots = [s for s in snapshots if s.state == state]

        if tags:
            snapshots = [s for s in snapshots if any(tag in s.tags for tag in tags)]

        return sorted(snapshots, key=lambda x: x.timestamp, reverse=True)

    def get_latest_snapshot(self, state: Optional[SnapshotState] = None) -> Optional[SnapshotMetadata]:
        """获取最新快照"""
        snapshots = self.list_snapshots(state=state)
        return snapshots[0] if snapshots else None

    def restore_from_latest(self) -> Optional[SnapshotData]:
        """从最新快照恢复"""
        latest = self.get_latest_snapshot()
        if latest:
            return self.load_snapshot(latest.snapshot_id)
        return None

    def cleanup_old_snapshots(self, keep_count: int = 10) -> int:
        """清理旧快照"""
        if len(self.snapshots) <= keep_count:
            return 0

        to_delete = sorted(self.snapshots, key=lambda x: x.timestamp)[:-keep_count]
        deleted = 0

        for snapshot in to_delete:
            if self.delete_snapshot(snapshot.snapshot_id):
                deleted += 1

        logger.info(f"清理了 {deleted} 个旧快照")
        return deleted

    def get_snapshot_info(self, snapshot_id: str) -> Optional[SnapshotMetadata]:
        """获取快照信息"""
        for snapshot in self.snapshots:
            if snapshot.snapshot_id == snapshot_id:
                return snapshot
        return None


class IncrementalSnapshot:
    """增量快照保存器"""

    def __init__(self, snapshot_manager: SnapshotManager,
                  save_interval: int = 10,
                  max_snapshots: int = 50):
        self.manager = snapshot_manager
        self.save_interval = save_interval
        self.max_snapshots = max_snapshots
        self.iteration_count = 0
        self.step_count = 0

    def should_save(self) -> bool:
        """判断是否应该保存快照"""
        return self.iteration_count % self.save_interval == 0

    def save_incremental(self, displacement: np.ndarray,
                           stress: Optional[np.ndarray] = None,
                           strain: Optional[np.ndarray] = None,
                           residual: Optional[np.ndarray] = None,
                           iteration_history: Optional[List[Dict]] = None,
                           description: str = "") -> Optional[str]:
        """保存增量快照"""
        if not self.should_save():
            self.iteration_count += 1
            return None

        self.step_count += 1

        data_hash = self.manager._compute_hash(displacement)

        metadata = SnapshotMetadata(
            snapshot_id="",
            timestamp=0.0,
            state=SnapshotState.INCREMENTAL,
            iteration=self.iteration_count,
            step=self.step_count,
            data_hash=data_hash,
            file_path="",
            file_size=0,
            description=description,
            tags=["incremental"]
        )

        snapshot_data = SnapshotData(
            metadata=metadata,
            displacement=displacement.copy() if displacement is not None else None,
            stress=stress.copy() if stress is not None else None,
            strain=strain.copy() if strain is not None else None,
            residual=residual.copy() if residual is not None else None,
            iteration_history=iteration_history
        )

        snapshot_id = self.manager.save_snapshot(
            snapshot_data,
            description=description,
            tags=["incremental"]
        )

        self.manager.cleanup_old_snapshots(keep_count=self.max_snapshots)

        self.iteration_count += 1
        return snapshot_id

    def save_checkpoint(self, state: SnapshotState,
                       displacement: np.ndarray,
                       mesh: Optional[Any] = None,
                       stiffness_matrix: Optional[spmatrix] = None,
                       stress: Optional[np.ndarray] = None,
                       strain: Optional[np.ndarray] = None,
                       parameters: Optional[Dict] = None,
                       description: str = "") -> str:
        """保存检查点快照"""
        data_hash = self.manager._compute_hash(displacement)

        metadata = SnapshotMetadata(
            snapshot_id="",
            timestamp=0.0,
            state=state,
            iteration=self.iteration_count,
            step=self.step_count,
            data_hash=data_hash,
            file_path="",
            file_size=0,
            description=description,
            tags=["checkpoint", state.value]
        )

        snapshot_data = SnapshotData(
            metadata=metadata,
            mesh=mesh,
            stiffness_matrix=stiffness_matrix,
            displacement=displacement.copy() if displacement is not None else None,
            stress=stress.copy() if stress is not None else None,
            strain=strain.copy() if strain is not None else None,
            parameters=parameters
        )

        return self.manager.save_snapshot(
            snapshot_data,
            description=description,
            tags=["checkpoint", state.value]
        )

    def reset(self) -> None:
        """重置计数器"""
        self.iteration_count = 0
        self.step_count = 0


class CheckpointManager:
    """检查点管理器（用于断点续算）"""

    def __init__(self, checkpoint_dir: str = "output/checkpoints"):
        self.checkpoint_dir = checkpoint_dir
        os.makedirs(self.checkpoint_dir, exist_ok=True)
        self.checkpoints: List[Dict] = []
        self._load_existing_checkpoints()

    def _load_existing_checkpoints(self) -> None:
        """加载已存在的检查点"""
        index_file = os.path.join(self.checkpoint_dir, "checkpoint_index.json")
        if os.path.exists(index_file):
            try:
                with open(index_file, 'r', encoding='utf-8') as f:
                    self.checkpoints = json.load(f)
                logger.info(f"加载了 {len(self.checkpoints)} 个检查点索引")
            except Exception as e:
                logger.warning(f"加载检查点索引失败: {e}")
                self.checkpoints = []

    def _save_index(self) -> None:
        """保存检查点索引"""
        index_file = os.path.join(self.checkpoint_dir, "checkpoint_index.json")
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(self.checkpoints, f, ensure_ascii=False, indent=4)

    def save_checkpoint(self, name: str, data: Dict, description: str = "") -> str:
        """保存检查点"""
        timestamp = time.time()
        checkpoint_id = f"{name}_{int(timestamp)}"

        data_file = os.path.join(self.checkpoint_dir, f"{checkpoint_id}.pkl")

        try:
            with open(data_file, 'wb') as f:
                pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)

            file_size = os.path.getsize(data_file)

            checkpoint_info = {
                "checkpoint_id": checkpoint_id,
                "name": name,
                "timestamp": timestamp,
                "file_path": data_file,
                "file_size": file_size,
                "description": description
            }

            self.checkpoints.append(checkpoint_info)
            self._save_index()

            logger.info(f"检查点已保存: {checkpoint_id} ({file_size/1024:.1f} KB)")
            return checkpoint_id

        except Exception as e:
            logger.error(f"保存检查点失败 {name}: {e}")
            if os.path.exists(data_file):
                os.remove(data_file)
            raise

    def load_checkpoint(self, checkpoint_id: str) -> Optional[Dict]:
        """加载检查点"""
        for checkpoint in self.checkpoints:
            if checkpoint["checkpoint_id"] == checkpoint_id:
                try:
                    with open(checkpoint["file_path"], 'rb') as f:
                        data = pickle.load(f)
                    logger.info(f"检查点已加载: {checkpoint_id}")
                    return data
                except Exception as e:
                    logger.error(f"加载检查点失败 {checkpoint_id}: {e}")
                    return None

        logger.warning(f"检查点不存在: {checkpoint_id}")
        return None

    def list_checkpoints(self, name: Optional[str] = None) -> List[Dict]:
        """列出检查点"""
        checkpoints = sorted(self.checkpoints, key=lambda x: x["timestamp"], reverse=True)
        if name:
            checkpoints = [c for c in checkpoints if c["name"] == name]
        return checkpoints

    def get_latest_checkpoint(self, name: Optional[str] = None) -> Optional[Dict]:
        """获取最新检查点"""
        checkpoints = self.list_checkpoints(name=name)
        return checkpoints[0] if checkpoints else None

    def delete_checkpoint(self, checkpoint_id: str) -> bool:
        """删除检查点"""
        for i, checkpoint in enumerate(self.checkpoints):
            if checkpoint["checkpoint_id"] == checkpoint_id:
                try:
                    if os.path.exists(checkpoint["file_path"]):
                        os.remove(checkpoint["file_path"])
                    self.checkpoints.pop(i)
                    self._save_index()
                    logger.info(f"检查点已删除: {checkpoint_id}")
                    return True
                except Exception as e:
                    logger.error(f"删除检查点失败 {checkpoint_id}: {e}")
                    return False
        return False

    def cleanup_old_checkpoints(self, keep_count: int = 5) -> int:
        """清理旧检查点"""
        if len(self.checkpoints) <= keep_count:
            return 0

        to_delete = sorted(self.checkpoints, key=lambda x: x["timestamp"])[:-keep_count]
        deleted = 0

        for checkpoint in to_delete:
            if self.delete_checkpoint(checkpoint["checkpoint_id"]):
                deleted += 1

        logger.info(f"清理了 {deleted} 个旧检查点")
        return deleted
