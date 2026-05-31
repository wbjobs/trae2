import numpy as np
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
import time
import os
import joblib
from datetime import datetime

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from config import settings


@dataclass
class FineTuneResult:
    success: bool
    new_model_version: str
    accuracy: float
    samples_used: int
    training_time: float
    improvement: Optional[float] = None
    previous_accuracy: Optional[float] = None
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class TrainingSample:
    features: Dict[str, Any]
    label: str
    sample_id: Optional[str] = None
    weight: float = 1.0


class FineTunePipeline:
    def __init__(self, base_model_path: Optional[str] = None):
        self.base_model_path = base_model_path or settings.MODEL_PATH
        self.model: Optional[RandomForestClassifier] = None
        self.scaler = None
        self.label_encoder: Dict[str, int] = {}
        self.inverse_label_encoder: Dict[int, str] = {}
        self.expected_features: List[str] = []
        self.current_version: str = "1.0.0"
        self._load_base_model()
        self.stats = {
            'total_fine_tunes': 0,
            'avg_improvement': 0.0,
            'failures': 0
        }

    def _load_base_model(self):
        try:
            if os.path.exists(self.base_model_path):
                model_data = joblib.load(self.base_model_path)
                self.model = model_data.get('model')
                self.scaler = model_data.get('scaler')
                self.label_encoder = model_data.get('label_encoder', {})
                self.inverse_label_encoder = {v: k for k, v in self.label_encoder.items()}
                self.expected_features = model_data.get('expected_features', [])
                self.current_version = model_data.get('version', '1.0.0')
                print(f"Loaded base model version {self.current_version}")
        except Exception as e:
            print(f"Warning: Could not load base model: {e}")
            self._create_default_model()

    def _create_default_model(self):
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=15,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )
        self.label_encoder = {
            'normal': 0,
            'bearing_fault': 1,
            'gear_fault': 2,
            'motor_fault': 3,
            'pump_fault': 4,
            'fan_fault': 5,
            'unbalance': 6,
            'misalignment': 7,
            'loose_part': 8,
            'unknown': 9
        }
        self.inverse_label_encoder = {v: k for k, v in self.label_encoder.items()}
        print("Created default model")

    def _prepare_training_data(self, samples: List[TrainingSample]) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        if not samples:
            raise ValueError("No training samples provided")

        all_feature_keys = set()
        for sample in samples:
            all_feature_keys.update(sample.features.keys())

        feature_list = sorted(all_feature_keys)

        X = []
        y = []
        weights = []

        for sample in samples:
            vector = [float(sample.features.get(key, 0.0)) for key in feature_list]
            X.append(vector)
            y.append(sample.features.get('label', sample.label))
            weights.append(sample.weight)

        X = np.array(X, dtype=np.float64)

        y_encoded = []
        for label in y:
            if label not in self.label_encoder:
                new_idx = len(self.label_encoder)
                self.label_encoder[label] = new_idx
                self.inverse_label_encoder[new_idx] = label
            y_encoded.append(self.label_encoder[label])

        y = np.array(y_encoded)
        weights = np.array(weights)

        return X, y, feature_list

    def fine_tune(self, new_samples: List[TrainingSample],
                 validation_split: float = 0.2,
                 learning_rate: float = 0.1,
                 save_model: bool = True,
                 model_name: str = "fault_classifier") -> FineTuneResult:
        start_time = time.time()
        warnings = []

        try:
            if len(new_samples) < 10:
                warnings.append(f"Small training set: {len(new_samples)} samples. Recommended: >= 50")

            X, y, feature_list = self._prepare_training_data(new_samples)
            self.expected_features = feature_list

            X_train, X_val, y_train, y_val = train_test_split(
                X, y, test_size=validation_split, random_state=42, stratify=y
            )

            previous_accuracy = None
            if self.model and hasattr(self.model, 'estimators_') and len(X_val) > 0:
                try:
                    y_pred_old = self.model.predict(X_val)
                    previous_accuracy = accuracy_score(y_val, y_pred_old)
                except:
                    pass

            if self.model is None or not hasattr(self.model, 'estimators_'):
                self.model = RandomForestClassifier(
                    n_estimators=100,
                    max_depth=15,
                    min_samples_split=5,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1,
                    warm_start=True
                )
            else:
                self.model.set_params(warm_start=True)
                additional_trees = max(10, int(self.model.n_estimators * learning_rate))
                self.model.n_estimators += additional_trees

            self.model.fit(X_train, y_train)

            new_accuracy = 0.0
            if len(X_val) > 0:
                y_pred = self.model.predict(X_val)
                new_accuracy = accuracy_score(y_val, y_pred)

            improvement = None
            if previous_accuracy is not None:
                improvement = new_accuracy - previous_accuracy

            new_version = self._increment_version(self.current_version)

            if save_model:
                self._save_model(model_name, new_version, feature_list, new_accuracy)

            self.current_version = new_version

            proc_time = time.time() - start_time

            self.stats['total_fine_tunes'] += 1
            if improvement is not None:
                self.stats['avg_improvement'] = (
                    (self.stats['avg_improvement'] * (self.stats['total_fine_tunes'] - 1) +
                     improvement) / self.stats['total_fine_tunes']
                )

            return FineTuneResult(
                success=True,
                new_model_version=new_version,
                accuracy=float(new_accuracy),
                samples_used=len(new_samples),
                training_time=proc_time,
                improvement=float(improvement) if improvement is not None else None,
                previous_accuracy=float(previous_accuracy) if previous_accuracy is not None else None,
                warnings=warnings
            )

        except Exception as e:
            self.stats['failures'] += 1
            proc_time = time.time() - start_time
            return FineTuneResult(
                success=False,
                new_model_version=self.current_version,
                accuracy=0.0,
                samples_used=len(new_samples),
                training_time=proc_time,
                warnings=warnings,
                error=str(e)
            )

    def _increment_version(self, version: str) -> str:
        parts = version.split('.')
        if len(parts) >= 3:
            parts[-1] = str(int(parts[-1]) + 1)
        else:
            parts = ['1', '0', '1']
        return '.'.join(parts)

    def _save_model(self, model_name: str, version: str,
                   feature_list: List[str], accuracy: float):
        try:
            os.makedirs(os.path.dirname(self.base_model_path), exist_ok=True)

            model_data = {
                'model': self.model,
                'scaler': self.scaler,
                'label_encoder': self.label_encoder,
                'expected_features': feature_list,
                'version': version,
                'accuracy': accuracy,
                'created_at': datetime.now().isoformat(),
                'fault_types': list(self.label_encoder.keys())
            }

            base, ext = os.path.splitext(self.base_model_path)
            versioned_path = f"{base}_v{version}{ext or '.joblib'}"

            joblib.dump(model_data, versioned_path)
            joblib.dump(model_data, self.base_model_path)

            print(f"Model saved: {versioned_path}")

        except Exception as e:
            print(f"Error saving model: {e}")
            raise

    def evaluate(self, test_samples: List[TrainingSample]) -> Dict[str, Any]:
        try:
            X, y, _ = self._prepare_training_data(test_samples)

            if self.model is None or not hasattr(self.model, 'estimators_'):
                return {'error': 'Model not trained'}

            y_pred = self.model.predict(X)
            accuracy = accuracy_score(y, y_pred)

            labels = [self.inverse_label_encoder.get(i, str(i))
                     for i in range(len(self.label_encoder))]

            report = classification_report(
                y, y_pred,
                labels=list(range(len(self.label_encoder))),
                target_names=labels,
                output_dict=True,
                zero_division=0
            )

            return {
                'accuracy': float(accuracy),
                'classification_report': report,
                'num_samples': len(test_samples)
            }

        except Exception as e:
            return {'error': str(e)}

    def get_model_info(self) -> Dict[str, Any]:
        return {
            'version': self.current_version,
            'num_classes': len(self.label_encoder),
            'expected_features': len(self.expected_features),
            'is_trained': self.model is not None and hasattr(self.model, 'estimators_'),
            'stats': self.get_stats()
        }

    def get_stats(self) -> Dict[str, Any]:
        return dict(self.stats)

    def reset_stats(self):
        self.stats = {
            'total_fine_tunes': 0,
            'avg_improvement': 0.0,
            'failures': 0
        }
