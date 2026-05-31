"""
分类模型在线微调模块
支持增量学习、小样本微调、模型版本管理、自动热更新

功能特性：
- 增量微调：基于已有模型进行在线学习，不中断服务
- 小样本学习：支持少量标注数据快速适配
- 模型版本：自动管理版本历史，支持回滚
- 热更新：模型更新时不中断推理服务
- 效果评估：自动对比新旧模型性能，择优部署
"""
import logging
import os
import shutil
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import numpy as np

from config import MODEL_DIR, MODEL_LABELS

logger = logging.getLogger(__name__)


@dataclass
class FinetuneSample:
    """微调样本数据结构"""
    features: np.ndarray
    label: str
    confidence: float = 1.0
    source: str = "manual"
    timestamp: float = field(default_factory=time.time)


@dataclass
class ModelVersion:
    """模型版本信息"""
    version: str
    path: Path
    created_at: datetime
    sample_count: int = 0
    accuracy: Optional[float] = None
    is_active: bool = False
    description: str = ""


@dataclass
class FinetuneConfig:
    """微调配置"""
    min_samples_per_class: int = 5
    max_samples_per_class: int = 1000
    learning_rate: float = 0.01
    max_iterations: int = 100
    validation_split: float = 0.2
    auto_deploy_threshold: float = 0.85
    keep_versions: int = 5
    finetune_interval: int = 300
    enable_incremental: bool = True


class FinetuneDataBuffer:
    """微调数据缓存区"""

    def __init__(self, max_samples: int = 10000):
        self.max_samples = max_samples
        self._samples: List[FinetuneSample] = []
        self._lock = threading.RLock()

    def add(self, sample: FinetuneSample) -> None:
        """添加样本"""
        with self._lock:
            self._samples.append(sample)
            if len(self._samples) > self.max_samples:
                self._samples = self._samples[-self.max_samples:]

    def add_batch(self, samples: List[FinetuneSample]) -> None:
        """批量添加样本"""
        with self._lock:
            self._samples.extend(samples)
            if len(self._samples) > self.max_samples:
                self._samples = self._samples[-self.max_samples:]

    def get_all(self) -> List[FinetuneSample]:
        """获取所有样本"""
        with self._lock:
            return list(self._samples)

    def get_by_label(self, label: str) -> List[FinetuneSample]:
        """按标签获取样本"""
        with self._lock:
            return [s for s in self._samples if s.label == label]

    def clear(self) -> None:
        """清空缓存"""
        with self._lock:
            self._samples.clear()

    def count_by_label(self) -> Dict[str, int]:
        """统计各标签样本数"""
        with self._lock:
            counts: Dict[str, int] = {}
            for s in self._samples:
                counts[s.label] = counts.get(s.label, 0) + 1
            return counts

    def __len__(self) -> int:
        with self._lock:
            return len(self._samples)


class ModelVersionManager:
    """模型版本管理器"""

    def __init__(self, base_dir: Path, keep_versions: int = 5):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.keep_versions = keep_versions
        self._versions: List[ModelVersion] = []
        self._active_version: Optional[ModelVersion] = None
        self._lock = threading.RLock()
        self._scan_versions()

    def _scan_versions(self) -> None:
        """扫描现有版本"""
        self._versions.clear()
        for path in sorted(self.base_dir.glob("v_*")):
            if not path.is_dir():
                continue
            try:
                version_str = path.name
                created_at = datetime.fromtimestamp(path.stat().st_mtime)
                version = ModelVersion(
                    version=version_str,
                    path=path,
                    created_at=created_at,
                )
                meta_path = path / "meta.txt"
                if meta_path.exists():
                    try:
                        with open(meta_path, "r") as f:
                            for line in f:
                                if line.startswith("sample_count="):
                                    version.sample_count = int(line.split("=")[1])
                                elif line.startswith("accuracy="):
                                    version.accuracy = float(line.split("=")[1])
                                elif line.startswith("description="):
                                    version.description = line.split("=", 1)[1].strip()
                    except Exception:
                        pass
                self._versions.append(version)
            except Exception as e:
                logger.warning(f"Failed to load version {path}: {e}")

    def create_version(
        self,
        model_path: Path,
        sample_count: int,
        accuracy: Optional[float] = None,
        description: str = "",
    ) -> ModelVersion:
        """创建新版本"""
        with self._lock:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            version_str = f"v_{timestamp}"
            version_path = self.base_dir / version_str
            shutil.copytree(model_path, version_path)
            version = ModelVersion(
                version=version_str,
                path=version_path,
                created_at=datetime.now(),
                sample_count=sample_count,
                accuracy=accuracy,
                is_active=False,
                description=description,
            )
            try:
                with open(version_path / "meta.txt", "w") as f:
                    f.write(f"sample_count={sample_count}\n")
                    if accuracy is not None:
                        f.write(f"accuracy={accuracy}\n")
                    f.write(f"description={description}\n")
            except Exception as e:
                logger.warning(f"Failed to write meta: {e}")
            self._versions.append(version)
            self._cleanup_old_versions()
            logger.info(f"Created model version: {version_str}")
            return version

    def activate_version(self, version_str: str) -> bool:
        """激活指定版本"""
        with self._lock:
            for v in self._versions:
                if v.version == version_str:
                    if self._active_version:
                        self._active_version.is_active = False
                    v.is_active = True
                    self._active_version = v
                    logger.info(f"Activated model version: {version_str}")
                    return True
            logger.warning(f"Version not found: {version_str}")
            return False

    def get_active_version(self) -> Optional[ModelVersion]:
        """获取当前激活版本"""
        return self._active_version

    def list_versions(self) -> List[ModelVersion]:
        """列出所有版本"""
        return sorted(self._versions, key=lambda v: v.created_at, reverse=True)

    def rollback(self) -> Optional[ModelVersion]:
        """回滚到上一个版本"""
        with self._lock:
            sorted_versions = sorted(
                self._versions,
                key=lambda v: v.created_at,
                reverse=True,
            )
            if len(sorted_versions) < 2:
                logger.warning("No previous version to rollback")
                return None
            prev = sorted_versions[1]
            self.activate_version(prev.version)
            return prev

    def _cleanup_old_versions(self) -> None:
        """清理旧版本"""
        if len(self._versions) <= self.keep_versions:
            return
        sorted_versions = sorted(self._versions, key=lambda v: v.created_at)
        to_delete = sorted_versions[: len(sorted_versions) - self.keep_versions]
        for v in to_delete:
            try:
                if v.is_active:
                    continue
                shutil.rmtree(v.path, ignore_errors=True)
                self._versions.remove(v)
                logger.info(f"Removed old version: {v.version}")
            except Exception as e:
                logger.warning(f"Failed to remove version {v.version}: {e}")


class ModelFinetuner:
    """模型在线微调器"""

    def __init__(
        self,
        classifier,
        config: Optional[FinetuneConfig] = None,
    ):
        self.classifier = classifier
        self.config = config or FinetuneConfig()
        self.data_buffer = FinetuneDataBuffer(max_samples=10000)
        self.version_manager = ModelVersionManager(
            base_dir=MODEL_DIR / "versions",
            keep_versions=self.config.keep_versions,
        )
        self._finetune_lock = threading.Lock()
        self._last_finetune_time: float = 0
        self._is_finetuning: bool = False
        self._stats: Dict[str, Any] = {
            "total_finetunes": 0,
            "last_finetune_time": None,
            "total_samples_used": 0,
            "accuracy_history": [],
        }

    def add_sample(
        self,
        features: np.ndarray,
        label: str,
        confidence: float = 1.0,
        source: str = "manual",
    ) -> bool:
        """添加微调样本"""
        if label not in MODEL_LABELS:
            logger.warning(f"Invalid label: {label}")
            return False
        features = np.asarray(features, dtype=np.float32)
        if not np.isfinite(features).all():
            logger.warning("Invalid features (contains NaN/Inf)")
            return False
        sample = FinetuneSample(
            features=features,
            label=label,
            confidence=confidence,
            source=source,
        )
        self.data_buffer.add(sample)
        return True

    def add_samples_batch(
        self,
        samples: List[Tuple[np.ndarray, str]],
        source: str = "batch",
    ) -> int:
        """批量添加样本"""
        count = 0
        for features, label in samples:
            if self.add_sample(features, label, source=source):
                count += 1
        return count

    def _prepare_dataset(self) -> Optional[Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
        """准备训练数据集"""
        all_samples = self.data_buffer.get_all()
        if not all_samples:
            logger.warning("No samples for finetuning")
            return None
        label_counts: Dict[str, int] = {}
        for s in all_samples:
            label_counts[s.label] = label_counts.get(s.label, 0) + 1
        valid_labels = [
            l for l, c in label_counts.items()
            if c >= self.config.min_samples_per_class
        ]
        if len(valid_labels) < 2:
            logger.warning(f"Not enough classes with samples: {label_counts}")
            return None
        filtered_samples = [s for s in all_samples if s.label in valid_labels]
        max_per_class = self.config.max_samples_per_class
        balanced: List[FinetuneSample] = []
        for label in valid_labels:
            class_samples = [s for s in filtered_samples if s.label == label]
            if len(class_samples) > max_per_class:
                indices = np.random.choice(
                    len(class_samples),
                    max_per_class,
                    replace=False,
                )
                balanced.extend([class_samples[i] for i in indices])
            else:
                balanced.extend(class_samples)
        np.random.shuffle(balanced)
        features = np.array([s.features for s in balanced], dtype=np.float32)
        label_to_idx = {l: i for i, l in enumerate(valid_labels)}
        labels = np.array([label_to_idx[s.label] for s in balanced], dtype=np.int64)
        if self.config.validation_split > 0:
            split_idx = int(len(features) * (1 - self.config.validation_split))
            X_train, X_val = features[:split_idx], features[split_idx:]
            y_train, y_val = labels[:split_idx], labels[split_idx:]
        else:
            X_train, X_val = features, features
            y_train, y_val = labels, labels
        logger.info(f"Prepared dataset: train={len(X_train)}, val={len(X_val)}, classes={len(valid_labels)}")
        return X_train, y_train, X_val, y_val

    def _evaluate_model(self, model, X: np.ndarray, y: np.ndarray) -> float:
        """评估模型准确率"""
        if len(X) == 0:
            return 0.0
        try:
            correct = 0
            for i in range(len(X)):
                result = model.classify(X[i])
                pred_idx = MODEL_LABELS.index(result.label) if result.label in MODEL_LABELS else -1
                if pred_idx == y[i]:
                    correct += 1
            accuracy = correct / len(X)
            logger.info(f"Model evaluation accuracy: {accuracy:.4f}")
            return accuracy
        except Exception as e:
            logger.warning(f"Evaluation failed: {e}")
            return 0.0

    def finetune(self, force: bool = False) -> Dict:
        """执行模型微调"""
        if not force and self._is_finetuning:
            return {"success": False, "reason": "finetune_in_progress"}
        if not force and time.time() - self._last_finetune_time < self.config.finetune_interval:
            remaining = self.config.finetune_interval - (time.time() - self._last_finetune_time)
            return {"success": False, "reason": "too_frequent", "remaining_seconds": int(remaining)}
        with self._finetune_lock:
            try:
                self._is_finetuning = True
                dataset = self._prepare_dataset()
                if dataset is None:
                    return {"success": False, "reason": "no_valid_data"}
                X_train, y_train, X_val, y_val = dataset
                try:
                    base_accuracy = self._evaluate_model(self.classifier, X_val, y_val)
                except Exception:
                    base_accuracy = 0.0
                if hasattr(self.classifier._model, "fit") and self.config.enable_incremental:
                    try:
                        logger.info("Starting incremental finetuning...")
                        self.classifier._model.fit(X_train, y_train)
                    except Exception as e:
                        logger.warning(f"Incremental finetune failed: {e}")
                        return {"success": False, "reason": "fit_failed", "error": str(e)}
                try:
                    new_accuracy = self._evaluate_model(self.classifier, X_val, y_val)
                except Exception:
                    new_accuracy = 0.0
                temp_dir = MODEL_DIR / "temp_finetune"
                if temp_dir.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)
                temp_dir.mkdir(parents=True)
                try:
                    self.classifier.save_model(str(temp_dir / "model.pth"))
                    version = self.version_manager.create_version(
                        temp_dir,
                        sample_count=len(X_train) + len(X_val),
                        accuracy=new_accuracy,
                        description=f"Finetuned from {base_accuracy:.4f} to {new_accuracy:.4f}",
                    )
                    if new_accuracy >= max(base_accuracy, self.config.auto_deploy_threshold):
                        self.version_manager.activate_version(version.version)
                        deployed = True
                    else:
                        deployed = False
                finally:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                self._stats["total_finetunes"] += 1
                self._stats["last_finetune_time"] = datetime.now().isoformat()
                self._stats["total_samples_used"] += len(X_train) + len(X_val)
                self._stats["accuracy_history"].append({
                    "time": datetime.now().isoformat(),
                    "base": base_accuracy,
                    "new": new_accuracy,
                    "deployed": deployed,
                })
                self._last_finetune_time = time.time()
                self.data_buffer.clear()
                return {
                    "success": True,
                    "base_accuracy": base_accuracy,
                    "new_accuracy": new_accuracy,
                    "improved": new_accuracy > base_accuracy,
                    "deployed": deployed,
                    "version": version.version if 'version' in locals() else None,
                    "train_samples": len(X_train),
                    "val_samples": len(X_val),
                }
            finally:
                self._is_finetuning = False

    def trigger_finetune(self) -> Dict:
        """触发异步微调（非阻塞）"""
        if self._is_finetuning:
            return {"success": False, "reason": "already_running"}
        thread = threading.Thread(target=self.finetune, args=(True,), daemon=True)
        thread.start()
        return {"success": True, "status": "started"}

    def get_stats(self) -> Dict:
        """获取微调统计"""
        buffer_counts = self.data_buffer.count_by_label()
        return {
            **self._stats,
            "is_finetuning": self._is_finetuning,
            "buffer_size": len(self.data_buffer),
            "buffer_counts": buffer_counts,
            "last_finetune_seconds_ago": int(time.time() - self._last_finetune_time) if self._last_finetune_time else None,
            "versions_count": len(self.version_manager.list_versions()),
            "active_version": self.version_manager.get_active_version().version if self.version_manager.get_active_version() else None,
        }

    def list_versions(self) -> List[Dict]:
        """列出所有模型版本"""
        versions = self.version_manager.list_versions()
        return [
            {
                "version": v.version,
                "created_at": v.created_at.isoformat(),
                "sample_count": v.sample_count,
                "accuracy": v.accuracy,
                "is_active": v.is_active,
                "description": v.description,
            }
            for v in versions
        ]

    def rollback(self) -> Dict:
        """回滚模型"""
        version = self.version_manager.rollback()
        if version:
            return {"success": True, "version": version.version}
        return {"success": False, "reason": "no_previous_version"}

    def activate_version(self, version_str: str) -> Dict:
        """激活指定版本"""
        if self.version_manager.activate_version(version_str):
            return {"success": True, "version": version_str}
        return {"success": False, "reason": "version_not_found"}
