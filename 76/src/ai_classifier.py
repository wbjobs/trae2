import numpy as np
import joblib
import os
import threading
import asyncio
from typing import Dict, List, Optional, Tuple
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import logging
from datetime import datetime
import json
import time
from functools import wraps

from .config import settings
from .schemas import FaultTypeEnum

logger = logging.getLogger(__name__)


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 30):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "closed"
        self._lock = threading.Lock()

    def call(self, func, *args, **kwargs):
        with self._lock:
            if self.state == "open":
                if time.time() - self.last_failure_time >= self.recovery_timeout:
                    self.state = "half-open"
                else:
                    raise RuntimeError("Circuit breaker is open")

        try:
            result = func(*args, **kwargs)
            with self._lock:
                if self.state == "half-open":
                    self.state = "closed"
                    self.failure_count = 0
            return result
        except Exception as e:
            with self._lock:
                self.failure_count += 1
                self.last_failure_time = time.time()
                if self.failure_count >= self.failure_threshold:
                    self.state = "open"
                    logger.warning(f"Circuit breaker opened after {self.failure_count} failures")
            raise e


class TimeoutException(Exception):
    pass


def timeout(seconds: int = 30):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = [None]
            exception = [None]

            def target():
                try:
                    result[0] = func(*args, **kwargs)
                except Exception as e:
                    exception[0] = e

            thread = threading.Thread(target=target)
            thread.daemon = True
            thread.start()
            thread.join(timeout=seconds)

            if thread.is_alive():
                raise TimeoutException(f"Function {func.__name__} timed out after {seconds} seconds")

            if exception[0] is not None:
                raise exception[0]

            return result[0]
        return wrapper
    return decorator


class AIClassifier:
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or settings.model_path
        os.makedirs(self.model_path, exist_ok=True)
        
        self.classes = [f.value for f in FaultTypeEnum]
        self.class_to_idx = {c: i for i, c in enumerate(self.classes)}
        self.idx_to_class = {i: c for i, c in enumerate(self.classes)}
        
        self.model: Optional[Pipeline] = None
        self.feature_order: List[str] = []
        self.model_info: Dict = {}
        
        self._model_lock = threading.RLock()
        self._prediction_lock = threading.Lock()
        self._circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=30)
        
        self._prediction_timeout = 30
        self._max_retries = 3
        self._retry_delay = 0.1
        
        self._total_predictions = 0
        self._successful_predictions = 0
        self._failed_predictions = 0
        
        self._load_or_create_model()

    def _load_or_create_model(self):
        model_file = os.path.join(self.model_path, "fault_classifier.pkl")
        info_file = os.path.join(self.model_path, "model_info.json")
        
        if os.path.exists(model_file) and os.path.exists(info_file):
            try:
                with self._model_lock:
                    self.model = joblib.load(model_file)
                    with open(info_file, 'r', encoding='utf-8') as f:
                        self.model_info = json.load(f)
                    self.feature_order = self.model_info.get("feature_order", [])
                logger.info("Loaded existing AI classifier model")
            except Exception as e:
                logger.warning(f"Failed to load model: {e}, creating new model")
                self._create_default_model()
                self._train_synthetic_model()
        else:
            self._create_default_model()
            self._train_synthetic_model()

    def _create_default_model(self):
        with self._model_lock:
            self.model = Pipeline([
                ('scaler', StandardScaler()),
                ('classifier', RandomForestClassifier(
                    n_estimators=100,
                    max_depth=12,
                    min_samples_split=5,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=1,
                    warm_start=False
                ))
            ])
            
            self.model_info = {
                "model_name": "motor_fault_classifier",
                "model_version": "2.0.0",
                "model_type": "RandomForest",
                "created_at": datetime.utcnow().isoformat(),
                "classes": self.classes,
                "accuracy": None,
                "is_active": True,
                "thread_safe": True,
                "timeout_seconds": self._prediction_timeout,
                "max_retries": self._max_retries
            }

    def _train_synthetic_model(self):
        from .feature_extractor import FeatureExtractor
        
        logger.info("Training synthetic model for initial deployment...")
        
        extractor = FeatureExtractor(sample_rate=settings.sample_rate)
        n_samples_per_class = 50
        
        X = []
        y = []
        
        for class_idx, fault_type in enumerate(self.classes):
            for _ in range(n_samples_per_class):
                audio = self._generate_synthetic_audio(fault_type)
                features = extractor.extract_all_features(audio, settings.sample_rate)
                
                if not self.feature_order:
                    self.feature_order = list(features.keys())
                
                feature_array = np.array([features.get(f, 0.0) for f in self.feature_order], dtype=np.float32)
                X.append(feature_array)
                y.append(class_idx)
        
        X = np.array(X)
        y = np.array(y)
        
        indices = np.random.permutation(len(X))
        X = X[indices]
        y = y[indices]
        
        with self._model_lock:
            self.model.fit(X, y)
            
            train_score = self.model.score(X, y)
            self.model_info["accuracy"] = float(train_score)
            self.model_info["feature_order"] = self.feature_order
            self.model_info["trained_samples"] = len(X)
        
        self._save_model()
        
        logger.info(f"Synthetic model trained with accuracy: {train_score:.4f}")

    def _generate_synthetic_audio(self, fault_type: str, duration: float = 2.0) -> np.ndarray:
        sr = settings.sample_rate
        n_samples = int(duration * sr)
        t = np.linspace(0, duration, n_samples)
        
        base_noise = np.random.normal(0, 0.02, n_samples)
        audio = base_noise.copy()
        
        if fault_type == FaultTypeEnum.NORMAL:
            fundamental = 50
            harmonics = [2, 3, 4]
            for h in harmonics:
                amp = 0.5 / h
                audio += amp * np.sin(2 * np.pi * fundamental * h * t)
            audio *= 0.5
        
        elif fault_type == FaultTypeEnum.BEARING_FAULT:
            bearing_freq = 150
            modulation_freq = 15
            carrier = np.sin(2 * np.pi * bearing_freq * t)
            modulation = 1 + 0.3 * np.sin(2 * np.pi * modulation_freq * t)
            audio += 0.6 * carrier * modulation
            
            sidebands = [-4, -3, -2, -1, 1, 2, 3, 4]
            for sb in sidebands:
                amp = 0.15 / (abs(sb) + 1)
                audio += amp * np.sin(2 * np.pi * (bearing_freq + sb * modulation_freq) * t)
        
        elif fault_type == FaultTypeEnum.GEAR_FAULT:
            mesh_freq = 300
            rotation_freq = 25
            for h in range(1, 5):
                amp = 0.4 / h
                audio += amp * np.sin(2 * np.pi * mesh_freq * h * t)
            
            audio += 0.15 * np.sin(2 * np.pi * rotation_freq * t)
            audio += 0.1 * np.sin(2 * np.pi * (mesh_freq - rotation_freq) * t)
            audio += 0.1 * np.sin(2 * np.pi * (mesh_freq + rotation_freq) * t)
            
            impulses = np.zeros(n_samples)
            impulse_interval = int(sr / rotation_freq)
            for i in range(0, n_samples, impulse_interval):
                if i + 50 < n_samples:
                    impulses[i:i+50] = np.exp(-np.linspace(0, 3, 50))
            audio += 0.3 * impulses
        
        elif fault_type == FaultTypeEnum.ROTOR_FAULT:
            fundamental = 50
            slip_freq = 2
            for h in [1, 2, 3]:
                audio += 0.3 * np.sin(2 * np.pi * fundamental * h * t)
                audio += 0.15 * np.sin(2 * np.pi * (fundamental * h - 2 * slip_freq) * t)
                audio += 0.15 * np.sin(2 * np.pi * (fundamental * h + 2 * slip_freq) * t)
        
        elif fault_type == FaultTypeEnum.STATOR_FAULT:
            fundamental = 50
            for h in [1, 3, 5, 7]:
                amp = 0.5 / h
                audio += amp * np.sin(2 * np.pi * fundamental * h * t)
            
            audio += 0.2 * np.abs(np.sin(2 * np.pi * 100 * t))
        
        elif fault_type == FaultTypeEnum.UNBALANCE:
            rotation_freq = 30
            for h in range(1, 4):
                amp = 0.6 / h
                audio += amp * np.sin(2 * np.pi * rotation_freq * h * t)
        
        elif fault_type == FaultTypeEnum.MISALIGNMENT:
            rotation_freq = 25
            for h in [1, 2, 3, 4]:
                if h <= 2:
                    amp = 0.5
                else:
                    amp = 0.2
                audio += amp * np.sin(2 * np.pi * rotation_freq * h * t)
            
            axial_freq = 12.5
            audio += 0.2 * np.sin(2 * np.pi * axial_freq * t)
        
        elif fault_type == FaultTypeEnum.MECHANICAL_LOOSENESS:
            rotation_freq = 20
            for h in range(1, 8):
                amp = 0.3 / h
                audio += amp * np.sin(2 * np.pi * rotation_freq * h * t)
            
            audio += 0.2 * np.random.uniform(-1, 1, n_samples) * np.abs(np.sin(2 * np.pi * rotation_freq * t))
        
        else:
            audio += 0.3 * np.sin(2 * np.pi * 60 * t)
            audio += 0.2 * np.random.normal(0, 1, n_samples)
        
        return audio.astype(np.float32)

    def _predict_with_retry(self, feature_array: np.ndarray) -> Tuple[int, Optional[np.ndarray]]:
        last_exception = None
        
        for attempt in range(self._max_retries):
            try:
                with self._prediction_lock:
                    prediction_idx = self.model.predict(feature_array)[0]
                    
                    if hasattr(self.model, "predict_proba"):
                        probabilities = self.model.predict_proba(feature_array)[0]
                    else:
                        probabilities = None
                
                return int(prediction_idx), probabilities
                
            except Exception as e:
                last_exception = e
                logger.warning(f"Prediction attempt {attempt + 1} failed: {e}")
                
                if attempt < self._max_retries - 1:
                    time.sleep(self._retry_delay * (attempt + 1))
        
        raise last_exception or RuntimeError("Prediction failed after all retries")

    @timeout(30)
    def _predict_internal(self, features: Dict[str, float]) -> Tuple[str, float, Dict[str, float]]:
        if self.model is None:
            raise RuntimeError("Model not initialized")
        
        if not self.feature_order:
            with self._model_lock:
                self.feature_order = list(features.keys())
        
        feature_array = np.array(
            [features.get(f, 0.0) for f in self.feature_order], 
            dtype=np.float32
        )
        feature_array = feature_array.reshape(1, -1)
        
        if not np.isfinite(feature_array).all():
            feature_array = np.nan_to_num(feature_array, nan=0.0, posinf=0.0, neginf=0.0)
        
        prediction_idx, probabilities = self._predict_with_retry(feature_array)
        prediction = self.idx_to_class.get(prediction_idx, FaultTypeEnum.UNKNOWN)
        
        if probabilities is not None:
            prob_dict = {
                self.idx_to_class[i]: float(prob) 
                for i, prob in enumerate(probabilities)
            }
            confidence = float(np.max(probabilities))
        else:
            prob_dict = {prediction: 1.0}
            confidence = 1.0
        
        return prediction, confidence, prob_dict

    def classify(
        self,
        features: Dict[str, float],
        return_probabilities: bool = True
    ) -> Tuple[str, float, Dict[str, float]]:
        self._total_predictions += 1
        
        try:
            result = self._circuit_breaker.call(
                self._predict_internal,
                features
            )
            self._successful_predictions += 1
            return result
        except Exception as e:
            self._failed_predictions += 1
            logger.error(f"Classification failed: {e}")
            
            prediction = FaultTypeEnum.UNKNOWN
            confidence = 0.0
            prob_dict = {c: 0.0 for c in self.classes}
            prob_dict[prediction] = 1.0
            
            return prediction, confidence, prob_dict

    def classify_batch(
        self,
        features_list: List[Dict[str, float]]
    ) -> List[Tuple[str, float, Dict[str, float]]]:
        if self.model is None:
            raise RuntimeError("Model not initialized")
        
        if not self.feature_order and features_list:
            with self._model_lock:
                self.feature_order = list(features_list[0].keys())
        
        X = []
        for features in features_list:
            feature_array = np.array(
                [features.get(f, 0.0) for f in self.feature_order], 
                dtype=np.float32
            )
            X.append(feature_array)
        
        X = np.array(X)
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        
        results = []
        try:
            with self._prediction_lock:
                predictions_idx = self.model.predict(X)
                
                if hasattr(self.model, "predict_proba"):
                    probabilities_list = self.model.predict_proba(X)
                else:
                    probabilities_list = None
            
            for i, idx in enumerate(predictions_idx):
                prediction = self.idx_to_class.get(int(idx), FaultTypeEnum.UNKNOWN)
                
                if probabilities_list is not None:
                    probs = probabilities_list[i]
                    prob_dict = {
                        self.idx_to_class[j]: float(prob) 
                        for j, prob in enumerate(probs)
                    }
                    confidence = float(np.max(probs))
                else:
                    prob_dict = {prediction: 1.0}
                    confidence = 1.0
                
                results.append((prediction, confidence, prob_dict))
        
        except Exception as e:
            logger.error(f"Batch classification failed: {e}")
            for _ in features_list:
                results.append((FaultTypeEnum.UNKNOWN, 0.0, {c: 0.0 for c in self.classes}))
        
        return results

    def fine_tune(
        self,
        features_list: List[Dict[str, float]],
        labels: List[str],
        epochs: int = 1
    ) -> float:
        if not self.feature_order and features_list:
            with self._model_lock:
                self.feature_order = list(features_list[0].keys())
        
        X = []
        y = []
        for features, label in zip(features_list, labels):
            feature_array = np.array(
                [features.get(f, 0.0) for f in self.feature_order], 
                dtype=np.float32
            )
            X.append(feature_array)
            y.append(self.class_to_idx.get(label, 0))
        
        X = np.array(X)
        y = np.array(y)
        
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        
        with self._model_lock:
            self.model.fit(X, y)
            
            accuracy = self.model.score(X, y)
            self.model_info["accuracy"] = float(accuracy)
            self.model_info["last_fine_tune"] = datetime.utcnow().isoformat()
            self.model_info["fine_tune_samples"] = \
                self.model_info.get("fine_tune_samples", 0) + len(X)
        
        self._save_model()
        
        return float(accuracy)

    def get_model_info(self) -> Dict:
        with self._model_lock:
            info = {
                **self.model_info,
                "num_classes": len(self.classes),
                "num_features": len(self.feature_order),
                "feature_order": self.feature_order,
                "total_predictions": self._total_predictions,
                "successful_predictions": self._successful_predictions,
                "failed_predictions": self._failed_predictions,
                "success_rate": self._successful_predictions / max(1, self._total_predictions),
                "circuit_breaker_state": self._circuit_breaker.state
            }
        return info

    def _save_model(self):
        model_file = os.path.join(self.model_path, "fault_classifier.pkl")
        info_file = os.path.join(self.model_path, "model_info.json")
        
        try:
            with self._model_lock:
                joblib.dump(self.model, model_file)
                with open(info_file, 'w', encoding='utf-8') as f:
                    json.dump(self.model_info, f, indent=2, ensure_ascii=False)
            logger.info("Model saved successfully")
        except Exception as e:
            logger.error(f"Failed to save model: {e}")

    def reset_circuit_breaker(self):
        self._circuit_breaker.state = "closed"
        self._circuit_breaker.failure_count = 0
        logger.info("Circuit breaker reset")

    def get_statistics(self) -> Dict:
        return {
            "total_predictions": self._total_predictions,
            "successful_predictions": self._successful_predictions,
            "failed_predictions": self._failed_predictions,
            "success_rate": self._successful_predictions / max(1, self._total_predictions),
            "circuit_breaker_state": self._circuit_breaker.state,
            "failure_count": self._circuit_breaker.failure_count
        }
