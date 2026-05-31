import os
import json
import pickle
import time
import logging
import numpy as np
from typing import Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class CheckpointManager:

    def __init__(self, checkpoint_dir: Optional[str] = None):
        if checkpoint_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            checkpoint_dir = os.path.join(base_dir, "checkpoints")
        self.checkpoint_dir = checkpoint_dir
        os.makedirs(self.checkpoint_dir, exist_ok=True)

    def _task_dir(self, task_id: str) -> str:
        path = os.path.join(self.checkpoint_dir, task_id)
        os.makedirs(path, exist_ok=True)
        return path

    def save(
        self,
        task_id: str,
        step: int,
        state_data: Dict[str, Any],
        metadata: Optional[Dict] = None,
    ) -> str:
        task_dir = self._task_dir(task_id)
        checkpoint_path = os.path.join(task_dir, f"checkpoint_{step:08d}.pkl")
        meta_path = os.path.join(task_dir, "meta.json")

        serializable_state = {}
        for k, v in state_data.items():
            if isinstance(v, np.ndarray):
                npy_path = os.path.join(task_dir, f"{k}_{step:08d}.npy")
                np.save(npy_path, v)
                serializable_state[k] = {"type": "ndarray", "file": os.path.basename(npy_path)}
            else:
                serializable_state[k] = {"type": "pickle", "value": v}

        checkpoint = {
            "task_id": task_id,
            "step": step,
            "timestamp": datetime.utcnow().isoformat(),
            "state": serializable_state,
            "metadata": metadata or {},
        }

        with open(checkpoint_path, "wb") as f:
            pickle.dump(checkpoint, f)

        with open(meta_path, "w") as f:
            json.dump({
                "task_id": task_id,
                "latest_step": step,
                "latest_checkpoint": os.path.basename(checkpoint_path),
                "timestamp": datetime.utcnow().isoformat(),
                "metadata": metadata or {},
            }, f, indent=2)

        logger.info(f"Checkpoint saved: task={task_id}, step={step}")
        return checkpoint_path

    def load(self, task_id: str, step: Optional[int] = None) -> Optional[Dict[str, Any]]:
        task_dir = self._task_dir(task_id)

        if step is None:
            meta_path = os.path.join(task_dir, "meta.json")
            if not os.path.exists(meta_path):
                return None
            with open(meta_path, "r") as f:
                meta = json.load(f)
            checkpoint_file = meta["latest_checkpoint"]
        else:
            checkpoint_file = f"checkpoint_{step:08d}.pkl"

        checkpoint_path = os.path.join(task_dir, checkpoint_file)
        if not os.path.exists(checkpoint_path):
            return None

        with open(checkpoint_path, "rb") as f:
            checkpoint = pickle.load(f)

        state_data = {}
        for k, v in checkpoint["state"].items():
            if v["type"] == "ndarray":
                npy_path = os.path.join(task_dir, v["file"])
                state_data[k] = np.load(npy_path)
            else:
                state_data[k] = v["value"]

        return {
            "task_id": checkpoint["task_id"],
            "step": checkpoint["step"],
            "timestamp": checkpoint["timestamp"],
            "state": state_data,
            "metadata": checkpoint.get("metadata", {}),
        }

    def get_latest_step(self, task_id: str) -> Optional[int]:
        meta_path = os.path.join(self._task_dir(task_id), "meta.json")
        if not os.path.exists(meta_path):
            return None
        with open(meta_path, "r") as f:
            meta = json.load(f)
        return meta.get("latest_step")

    def list_checkpoints(self, task_id: str) -> list:
        task_dir = self._task_dir(task_id)
        checkpoints = []
        for f in sorted(os.listdir(task_dir)):
            if f.startswith("checkpoint_") and f.endswith(".pkl"):
                step = int(f.replace("checkpoint_", "").replace(".pkl", ""))
                checkpoints.append(step)
        return checkpoints

    def cleanup(self, task_id: str, keep_last: int = 3):
        checkpoints = self.list_checkpoints(task_id)
        if len(checkpoints) <= keep_last:
            return

        task_dir = self._task_dir(task_id)
        to_remove = checkpoints[:-keep_last]
        for step in to_remove:
            cp_file = os.path.join(task_dir, f"checkpoint_{step:08d}.pkl")
            if os.path.exists(cp_file):
                os.remove(cp_file)
            for f in os.listdir(task_dir):
                if f.endswith(f"_{step:08d}.npy"):
                    os.remove(os.path.join(task_dir, f))

        logger.info(f"Cleaned up {len(to_remove)} old checkpoints for task {task_id}")

    def delete_task(self, task_id: str):
        task_dir = self._task_dir(task_id)
        if os.path.exists(task_dir):
            import shutil
            shutil.rmtree(task_dir)
            logger.info(f"Deleted all checkpoints for task {task_id}")
