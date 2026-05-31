import numpy as np
import joblib
import os
import threading
import asyncio
import uuid
from typing import Dict, List, Optional, Tuple, Callable, Any
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
import logging
from datetime import datetime
import json
import time
from queue import Queue, Empty
from concurrent.futures import ThreadPoolExecutor, Future

from .config import settings
from .schemas import FaultTypeEnum
from .feature_extractor import FeatureExtractor

logger = logging.getLogger(__name__)


class TrainingSample:
    def __init__(
        self,
        features: Dict[str, float],
        label: str,
        sample_id: Optional[str] = None,
        motor_type: Optional[str] = None,
        source: str = "manual",
        confidence: Optional[float] = None,
        metadata: Optional[Dict] = None
    ):
        self.features = features
        self.label = label
        self.sample_id = sample_id
        self.motor_type = motor_type
        self.source = source
        self.confidence = confidence
        self.metadata = metadata or {}
        self.created_at = datetime.utcnow()
        self.weight = 1.0
        
        if confidence is not None:
            self.weight = max(0.1, confidence)

    def to_dict(self) -> Dict:
        return {
            "sample_id": self.sample_id,
            "label": self.label,
            "motor_type": self.motor_type,
            "source": self.source,
            "confidence": self.confidence,
            "weight": self.weight,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat()
        }


class TrainingJob:
    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"

    def __init__(
        self,
        job_id: str,
        samples: List[TrainingSample],
        config: Optional[Dict] = None,
        description: Optional[str] = None
    ):
        self.job_id = job_id
        self.samples = samples
        self.config = config or {}
        self.description = description
        self.status = self.STATUS_PENDING
        self.progress = 0.0
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.error: Optional[str] = None
        self.results: Optional[Dict] = None
        self.created_at = datetime.utcnow()
        self._cancel_flag = threading.Event()

    def cancel(self):
        self._cancel_flag.set()
        self.status = self.STATUS_CANCELLED

    def is_cancelled(self) -> bool:
        return self._cancel_flag.is_set()

    def to_dict(self) -> Dict:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "description": self.description,
            "num_samples": len(self.samples),
            "config": self.config,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_seconds": (self.end_time - self.start_time).total_seconds() if self.start_time and self.end_time else None,
            "error": self.error,
            "results": self.results,
            "created_at": self.created_at.isoformat()
        }


class ModelFinetuner:
    def __init__(
        self,
        classifier,
        feature_extractor: Optional[FeatureExtractor] = None,
        storage_path: Optional[str] = None
    ):
        self.classifier = classifier
        self.feature_extractor = feature_extractor or FeatureExtractor(sample_rate=settings.sample_rate)
        self.storage_path = storage_path or os.path.join(settings.model_path, "finetune")
        os.makedirs(self.storage_path, exist_ok=True)
        
        self._sample_buffer: List[TrainingSample] = []
        self._sample_buffer_lock = threading.Lock()
        self._max_buffer_size = 1000
        self._auto_finetune_threshold = 100
        self._last_finetune_time: Optional[datetime] = None
        self._min_finetune_interval = 3600
        
        self._training_queue: Queue[TrainingJob] = Queue()
        self._active_jobs: Dict[str, TrainingJob] = {}
        self._completed_jobs: Dict[str, TrainingJob] = {}
        self._job_lock = threading.Lock()
        
        self._training_executor = ThreadPoolExecutor(max_workers=1)
        self._is_running = False
        self._worker_thread: Optional[threading.Thread] = None
        
        self._training_callbacks: List[Callable[[TrainingJob], None]] = []
        
        self._start_worker()

    def _start_worker(self):
        if self._is_running:
            return
        
        self._is_running = True
        self._worker_thread = threading.Thread(target=self._training_worker, daemon=True)
        self._worker_thread.start()
        logger.info("Model finetune worker started")

    def _training_worker(self):
        while self._is_running:
            try:
                job = self._training_queue.get(timeout=1.0)
                
                if job.status == TrainingJob.STATUS_CANCELLED:
                    continue
                
                self._execute_training_job(job)
                
            except Empty:
                continue
            except Exception as e:
                logger.error(f"Training worker error: {e}")
                time.sleep(1.0)

    def _execute_training_job(self, job: TrainingJob):
        try:
            job.status = TrainingJob.STATUS_RUNNING
            job.start_time = datetime.utcnow()
            self._notify_callbacks(job)
            
            logger.info(f"Starting training job {job.job_id} with {len(job.samples)} samples")
            
            if job.is_cancelled():
                return
            
            job.progress = 10.0
            self._notify_callbacks(job)
            
            X, y, sample_weights = self._prepare_training_data(job.samples)
            
            if job.is_cancelled():
                return
            
            job.progress = 30.0
            self._notify_callbacks(job)
            
            X_train, X_val, y_train, y_val, weights_train, weights_val = train_test_split(
                X, y, sample_weights,
                test_size=job.config.get("validation_split", 0.2),
                random_state=job.config.get("random_state", 42),
                stratify=y
            )
            
            if job.is_cancelled():
                return
            
            job.progress = 50.0
            self._notify_callbacks(job)
            
            new_model = self._create_model(job.config)
            
            n_estimators = job.config.get("n_estimators", 100)
            max_depth = job.config.get("max_depth", 15)
            
            if hasattr(new_model, 'named_steps'):
                clf = new_model.named_steps['classifier']
                clf.n_estimators = n_estimators
                clf.max_depth = max_depth
            
            if job.is_cancelled():
                return
            
            job.progress = 70.0
            self._notify_callbacks(job)
            
            new_model.fit(X_train, y_train)
            
            if job.is_cancelled():
                return
            
            job.progress = 85.0
            self._notify_callbacks(job)
            
            results = self._evaluate_model(new_model, X_val, y_val, X_train, y_train)
            
            if job.is_cancelled():
                return
            
            job.progress = 95.0
            self._notify_callbacks(job)
            
            if results.get("accuracy", 0) >= job.config.get("min_accuracy", 0.7):
                self._update_classifier_model(new_model, job)
                results["model_updated"] = True
                job.progress = 100.0
            else:
                results["model_updated"] = False
                results["warning"] = f"Validation accuracy {results.get('accuracy', 0):.4f} below threshold {job.config.get('min_accuracy', 0.7)}"
                job.progress = 100.0
            
            job.results = results
            job.status = TrainingJob.STATUS_COMPLETED
            job.end_time = datetime.utcnow()
            
            self._save_training_results(job)
            self._notify_callbacks(job)
            
            logger.info(f"Training job {job.job_id} completed with accuracy: {results.get('accuracy', 0):.4f}")
            
        except Exception as e:
            job.status = TrainingJob.STATUS_FAILED
            job.error = str(e)
            job.end_time = datetime.utcnow()
            logger.error(f"Training job {job.job_id} failed: {e}")
            self._notify_callbacks(job)
        finally:
            with self._job_lock:
                if job.job_id in self._active_jobs:
                    del self._active_jobs[job.job_id]
                self._completed_jobs[job.job_id] = job

    def _prepare_training_data(
        self, 
        samples: List[TrainingSample]
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        feature_order = self.classifier.feature_order
        if not feature_order and samples:
            feature_order = list(samples[0].features.keys())
        
        X = []
        y = []
        weights = []
        
        for sample in samples:
            feature_array = np.array(
                [sample.features.get(f, 0.0) for f in feature_order],
                dtype=np.float32
            )
            feature_array = np.nan_to_num(feature_array, nan=0.0, posinf=0.0, neginf=0.0)
            
            X.append(feature_array)
            y.append(self.classifier.class_to_idx.get(sample.label, 0))
            weights.append(sample.weight)
        
        return np.array(X), np.array(y), np.array(weights)

    def _create_model(self, config: Dict) -> Pipeline:
        model_type = config.get("model_type", "RandomForest")
        
        if model_type == "GradientBoosting":
            classifier = GradientBoostingClassifier(
                n_estimators=config.get("n_estimators", 100),
                max_depth=config.get("max_depth", 8),
                learning_rate=config.get("learning_rate", 0.1),
                random_state=config.get("random_state", 42)
            )
        elif model_type == "SVM":
            classifier = SVC(
                C=config.get("C", 1.0),
                kernel=config.get("kernel", "rbf"),
                probability=True,
                random_state=config.get("random_state", 42)
            )
        else:
            classifier = RandomForestClassifier(
                n_estimators=config.get("n_estimators", 100),
                max_depth=config.get("max_depth", 15),
                min_samples_split=config.get("min_samples_split", 5),
                min_samples_leaf=config.get("min_samples_leaf", 2),
                random_state=config.get("random_state", 42),
                n_jobs=1
            )
        
        return Pipeline([
            ('scaler', StandardScaler()),
            ('classifier', classifier)
        ])

    def _evaluate_model(
        self,
        model: Pipeline,
        X_val: np.ndarray,
        y_val: np.ndarray,
        X_train: np.ndarray,
        y_train: np.ndarray
    ) -> Dict:
        y_pred_train = model.predict(X_train)
        y_pred_val = model.predict(X_val)
        
        train_accuracy = accuracy_score(y_train, y_pred_train)
        val_accuracy = accuracy_score(y_val, y_pred_val)
        
        results = {
            "train_accuracy": float(train_accuracy),
            "validation_accuracy": float(val_accuracy),
            "accuracy": float(val_accuracy),
            "precision": float(precision_score(y_val, y_pred_val, average='weighted', zero_division=0)),
            "recall": float(recall_score(y_val, y_pred_val, average='weighted', zero_division=0)),
            "f1_score": float(f1_score(y_val, y_pred_val, average='weighted', zero_division=0)),
            "train_samples": len(y_train),
            "validation_samples": len(y_val)
        }
        
        if hasattr(model, "predict_proba"):
            try:
                cv_scores = cross_val_score(model, X_val, y_val, cv=3, scoring='accuracy')
                results["cross_val_accuracy_mean"] = float(np.mean(cv_scores))
                results["cross_val_accuracy_std"] = float(np.std(cv_scores))
            except Exception as e:
                logger.warning(f"Cross validation failed: {e}")
        
        try:
            cm = confusion_matrix(y_val, y_pred_val)
            results["confusion_matrix"] = cm.tolist()
            results["classes"] = [self.classifier.idx_to_class[i] for i in range(len(self.classifier.classes))]
        except Exception as e:
            logger.warning(f"Confusion matrix failed: {e}")
        
        return results

    def _update_classifier_model(self, new_model: Pipeline, job: TrainingJob):
        with self.classifier._model_lock:
            self.classifier.model = new_model
            self.classifier.model_info.update({
                "last_finetune_job": job.job_id,
                "last_finetune_time": datetime.utcnow().isoformat(),
                "last_finetune_accuracy": job.results.get("accuracy", 0),
                "total_finetune_samples": self.classifier.model_info.get("total_finetune_samples", 0) + len(job.samples)
            })
            
            if "finetune_count" in self.classifier.model_info:
                self.classifier.model_info["finetune_count"] += 1
            else:
                self.classifier.model_info["finetune_count"] = 1
            
            if "version" in self.classifier.model_info:
                version_parts = self.classifier.model_info["version"].split(".")
                if len(version_parts) >= 3:
                    version_parts[-1] = str(int(version_parts[-1]) + 1)
                    self.classifier.model_info["version"] = ".".join(version_parts)
            
            self.classifier._save_model()
            
        self._last_finetune_time = datetime.utcnow()

    def _save_training_results(self, job: TrainingJob):
        results_file = os.path.join(self.storage_path, f"job_{job.job_id}_results.json")
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(job.to_dict(), f, indent=2, ensure_ascii=False)
        
        samples_file = os.path.join(self.storage_path, f"job_{job.job_id}_samples.json")
        samples_data = [s.to_dict() for s in job.samples]
        with open(samples_file, 'w', encoding='utf-8') as f:
            json.dump(samples_data, f, indent=2, ensure_ascii=False)

    def _notify_callbacks(self, job: TrainingJob):
        for callback in self._training_callbacks:
            try:
                callback(job)
            except Exception as e:
                logger.error(f"Training callback error: {e}")

    def add_training_sample(
        self,
        features: Dict[str, float],
        label: str,
        sample_id: Optional[str] = None,
        motor_type: Optional[str] = None,
        source: str = "manual",
        confidence: Optional[float] = None,
        auto_trigger: bool = True
    ) -> str:
        sample = TrainingSample(
            features=features,
            label=label,
            sample_id=sample_id,
            motor_type=motor_type,
            source=source,
            confidence=confidence
        )
        
        with self._sample_buffer_lock:
            self._sample_buffer.append(sample)
            buffer_size = len(self._sample_buffer)
            
            if buffer_size > self._max_buffer_size:
                self._sample_buffer = self._sample_buffer[-self._max_buffer_size:]
        
        if auto_trigger and buffer_size >= self._auto_finetune_threshold:
            self._check_auto_finetune()
        
        return sample.sample_id or f"sample_{len(self._sample_buffer)}"

    def add_training_samples(
        self,
        samples: List[Tuple[Dict[str, float], str, Optional[Dict]]],
        auto_trigger: bool = True
    ) -> int:
        count = 0
        for features, label, metadata in samples:
            self.add_training_sample(
                features=features,
                label=label,
                metadata=metadata,
                auto_trigger=False
            )
            count += 1
        
        if auto_trigger:
            self._check_auto_finetune()
        
        return count

    def _check_auto_finetune(self):
        with self._sample_buffer_lock:
            buffer_size = len(self._sample_buffer)
            if buffer_size < self._auto_finetune_threshold:
                return
            
            if self._last_finetune_time:
                elapsed = (datetime.utcnow() - self._last_finetune_time).total_seconds()
                if elapsed < self._min_finetune_interval:
                    return
            
            samples = self._sample_buffer.copy()
            self._sample_buffer = []
        
        self.start_finetuning_job(
            samples=samples,
            config={"auto_triggered": True},
            description=f"Auto finetune with {len(samples)} samples"
        )

    def start_finetuning_job(
        self,
        samples: Optional[List[TrainingSample]] = None,
        config: Optional[Dict] = None,
        description: Optional[str] = None
    ) -> str:
        job_id = f"finetune_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        
        if samples is None:
            with self._sample_buffer_lock:
                samples = self._sample_buffer.copy()
                self._sample_buffer = []
        
        if not samples:
            raise ValueError("No training samples provided")
        
        job = TrainingJob(
            job_id=job_id,
            samples=samples,
            config=config or {},
            description=description
        )
        
        with self._job_lock:
            self._active_jobs[job_id] = job
        
        self._training_queue.put(job)
        logger.info(f"Finetuning job {job_id} queued with {len(samples)} samples")
        
        return job_id

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        with self._job_lock:
            if job_id in self._active_jobs:
                return self._active_jobs[job_id].to_dict()
            if job_id in self._completed_jobs:
                return self._completed_jobs[job_id].to_dict()
        return None

    def cancel_job(self, job_id: str) -> bool:
        with self._job_lock:
            if job_id in self._active_jobs:
                self._active_jobs[job_id].cancel()
                return True
        return False

    def get_active_jobs(self) -> List[Dict]:
        with self._job_lock:
            return [job.to_dict() for job in self._active_jobs.values()]

    def get_completed_jobs(self, limit: int = 10) -> List[Dict]:
        with self._job_lock:
            jobs = sorted(
                self._completed_jobs.values(),
                key=lambda j: j.end_time or j.created_at,
                reverse=True
            )
            return [job.to_dict() for job in jobs[:limit]]

    def get_buffer_status(self) -> Dict:
        with self._sample_buffer_lock:
            return {
                "buffer_size": len(self._sample_buffer),
                "max_buffer_size": self._max_buffer_size,
                "auto_threshold": self._auto_finetune_threshold,
                "last_finetune": self._last_finetune_time.isoformat() if self._last_finetune_time else None
            }

    def clear_buffer(self) -> int:
        with self._sample_buffer_lock:
            count = len(self._sample_buffer)
            self._sample_buffer = []
            return count

    def register_callback(self, callback: Callable[[TrainingJob], None]):
        self._training_callbacks.append(callback)

    def unregister_callback(self, callback: Callable[[TrainingJob], None]):
        if callback in self._training_callbacks:
            self._training_callbacks.remove(callback)

    def shutdown(self, wait: bool = True):
        self._is_running = False
        
        for job in list(self._active_jobs.values()):
            job.cancel()
        
        if wait:
            self._training_executor.shutdown(wait=True)
        
        if self._worker_thread:
            self._worker_thread.join(timeout=5.0)
        
        logger.info("Model finetune worker stopped")
