import os
import time
import uuid
import numpy as np
import joblib
import threading
from typing import Dict, List, Optional, Tuple, Any
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import warnings
warnings.filterwarnings('ignore')

from config import settings
from database import get_db, AudioSample, ProcessingLog, ClassificationModel
from schemas import ClassificationResult, FaultType, Severity
from feature_extractor import feature_extractor
from pipeline.fine_tune_pipeline import FineTunePipeline, TrainingSample, FineTuneResult


class FaultClassifier:
    def __init__(self):
        self.model = None
        self.scaler = None
        self.fault_types = [e.value for e in FaultType]
        self.feature_names: List[str] = []
        self.is_trained = False
        self._model_lock = threading.RLock()
        self._fine_tune_pipeline: Optional[FineTunePipeline] = None
        self._training_history: List[Dict[str, Any]] = []
        self._load_model()
        self._init_fine_tune()

    def _init_fine_tune(self):
        try:
            self._fine_tune_pipeline = FineTunePipeline(
                base_model_path=settings.CLASSIFICATION_MODEL_PATH
            )
        except Exception as e:
            print(f"Error initializing fine-tune pipeline: {e}")
            self._fine_tune_pipeline = None

    def _load_model(self):
        with self._model_lock:
            try:
                if os.path.exists(settings.CLASSIFICATION_MODEL_PATH):
                    self.model = joblib.load(settings.CLASSIFICATION_MODEL_PATH)
                    self.is_trained = True
                if os.path.exists(settings.SCALER_PATH):
                    self.scaler = joblib.load(settings.SCALER_PATH)
            except Exception as e:
                print(f"Error loading model: {e}")
                self.model = None
                self.scaler = None
                self.is_trained = False

    def _save_model(self, accuracy: float = 0.0):
        with self._model_lock:
            os.makedirs(settings.MODEL_DIR, exist_ok=True)
            joblib.dump(self.model, settings.CLASSIFICATION_MODEL_PATH)
            joblib.dump(self.scaler, settings.SCALER_PATH)

            db = None
            try:
                db = next(get_db())
                model_record = ClassificationModel(
                    model_name="RandomForest_Fault_Classifier",
                    model_version=f"v{int(time.time())}",
                    model_path=settings.CLASSIFICATION_MODEL_PATH,
                    accuracy=accuracy,
                    is_active=True
                )
                model_record.set_fault_types(self.fault_types)
                db.add(model_record)
                db.commit()
            except Exception as e:
                print(f"Error saving model record: {e}")
                if db:
                    db.rollback()
            finally:
                if db:
                    db.close()

    def _safe_float(self, value, default: float = 0.0) -> float:
        try:
            if value is None:
                return default
            result = float(value)
            if np.isnan(result) or np.isinf(result):
                return default
            return result
        except (ValueError, TypeError):
            return default

    def _get_severity_from_confidence(self, confidence: float, fault_type: str) -> str:
        if fault_type == "normal":
            return "none"
        confidence = self._safe_float(confidence)
        if confidence >= 0.9:
            return "critical"
        elif confidence >= 0.75:
            return "high"
        elif confidence >= 0.6:
            return "medium"
        elif confidence >= 0.45:
            return "low"
        return "unknown"

    def _validate_feature_vector(self, feature_vector: List[float], min_length: int = 50) -> List[float]:
        if feature_vector is None:
            return [0.0] * min_length

        validated = []
        for val in feature_vector:
            validated.append(self._safe_float(val))

        if len(validated) < min_length:
            validated.extend([0.0] * (min_length - len(validated)))

        validated = [0.0 if np.isnan(v) or np.isinf(v) else v for v in validated]

        return validated

    def train_model(self, sample_ids: Optional[List[str]] = None,
                    test_size: float = 0.2, random_state: int = 42) -> Dict:
        start_time = time.time()

        db = None
        try:
            db = next(get_db())

            query = db.query(AudioSample).filter(AudioSample.is_labeled == True)
            if sample_ids:
                query = query.filter(AudioSample.sample_id.in_(sample_ids))

            labeled_samples = query.all()

            if len(labeled_samples) < 10:
                db.close()
                return {"error": "Not enough labeled samples. Need at least 10."}

            X = []
            y = []

            for sample in labeled_samples:
                try:
                    features = sample.get_features()
                    if not features:
                        continue

                    feature_vector = feature_extractor._flatten_features(features)
                    feature_vector = self._validate_feature_vector(feature_vector, 100)
                    X.append(feature_vector)
                    y.append(sample.fault_type)
                except Exception as e:
                    print(f"Error processing sample {sample.sample_id}: {e}")
                    continue

            db.close()
            db = None

            if len(X) < 10:
                return {"error": "Not enough valid samples after processing."}

            X = np.array(X, dtype=np.float64)
            y = np.array(y)

            unique_classes = np.unique(y)
            if len(unique_classes) < 2:
                return {"error": "Need at least 2 different fault types for training."}

            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=random_state, stratify=y
            )

            with self._model_lock:
                self.scaler = StandardScaler()
                X_train_scaled = self.scaler.fit_transform(X_train)
                X_test_scaled = self.scaler.transform(X_test)

                self.model = RandomForestClassifier(
                    n_estimators=200,
                    max_depth=None,
                    min_samples_split=2,
                    min_samples_leaf=1,
                    random_state=random_state,
                    class_weight='balanced',
                    n_jobs=-1
                )

                self.model.fit(X_train_scaled, y_train)

                y_pred = self.model.predict(X_test_scaled)
                y_pred_proba = self.model.predict_proba(X_test_scaled)

                accuracy = accuracy_score(y_test, y_pred)
                report = classification_report(y_test, y_pred, output_dict=True)
                cm = confusion_matrix(y_test, y_pred)

                self.fault_types = sorted(list(unique_classes))
                self.is_trained = True

                feature_importance = {}
                if hasattr(self.model, 'feature_importances_'):
                    importances = self.model.feature_importances_
                    feature_importance = {
                        "top_features": sorted(range(len(importances)), key=lambda i: importances[i], reverse=True)[:20],
                        "importances": importances.tolist()
                    }

                self._save_model(accuracy=float(accuracy))

            return {
                "training_samples": len(X_train),
                "test_samples": len(X_test),
                "accuracy": float(accuracy),
                "classification_report": report,
                "confusion_matrix": cm.tolist(),
                "classes": self.fault_types,
                "feature_importance": feature_importance,
                "training_time": time.time() - start_time
            }

        except Exception as e:
            print(f"Training error: {e}")
            if db:
                db.close()
            return {"error": f"Training failed: {str(e)}"}

    def fine_tune_model(self, sample_ids: Optional[List[str]] = None,
                        learning_rate: float = 0.1,
                        validation_split: float = 0.2) -> Dict[str, Any]:
        start_time = time.time()

        if self._fine_tune_pipeline is None:
            self._init_fine_tune()
            if self._fine_tune_pipeline is None:
                return {"error": "Fine-tune pipeline not available"}

        db = None
        try:
            db = next(get_db())

            query = db.query(AudioSample).filter(AudioSample.is_labeled == True)
            if sample_ids:
                query = query.filter(AudioSample.sample_id.in_(sample_ids))

            labeled_samples = query.all()

            if len(labeled_samples) < 5:
                db.close()
                return {"error": "Not enough labeled samples for fine-tuning. Need at least 5."}

            training_samples = []
            for sample in labeled_samples:
                try:
                    features = sample.get_features()
                    if not features:
                        continue

                    flat_features = feature_extractor._flatten_features(features)
                    feature_dict = {f"feat_{i}": v for i, v in enumerate(flat_features)}

                    training_samples.append(TrainingSample(
                        features=feature_dict,
                        label=sample.fault_type,
                        sample_id=sample.sample_id,
                        weight=1.0
                    ))
                except Exception as e:
                    print(f"Error processing sample {sample.sample_id}: {e}")
                    continue

            db.close()
            db = None

            if len(training_samples) < 5:
                return {"error": "Not enough valid samples for fine-tuning."}

            with self._model_lock:
                fine_tune_result = self._fine_tune_pipeline.fine_tune(
                    new_samples=training_samples,
                    validation_split=validation_split,
                    learning_rate=learning_rate,
                    save_model=False,
                    model_name="fault_classifier"
                )

                if fine_tune_result.success:
                    if hasattr(self._fine_tune_pipeline, 'model'):
                        self.model = self._fine_tune_pipeline.model
                    if hasattr(self._fine_tune_pipeline, 'scaler'):
                        self.scaler = self._fine_tune_pipeline.scaler
                    if hasattr(self._fine_tune_pipeline, 'label_encoder'):
                        self.fault_types = sorted(list(self._fine_tune_pipeline.label_encoder.keys()))

                    self.is_trained = True

                    self._save_model(accuracy=fine_tune_result.accuracy)

                    history_entry = {
                        "timestamp": time.time(),
                        "type": "fine_tune",
                        "samples_used": fine_tune_result.samples_used,
                        "accuracy": fine_tune_result.accuracy,
                        "improvement": fine_tune_result.improvement,
                        "new_version": fine_tune_result.new_model_version,
                        "training_time": fine_tune_result.training_time
                    }
                    self._training_history.append(history_entry)
                    if len(self._training_history) > 100:
                        self._training_history = self._training_history[-100:]

                return {
                    "success": fine_tune_result.success,
                    "new_model_version": fine_tune_result.new_model_version,
                    "accuracy": fine_tune_result.accuracy,
                    "samples_used": fine_tune_result.samples_used,
                    "training_time": fine_tune_result.training_time,
                    "improvement": fine_tune_result.improvement,
                    "previous_accuracy": fine_tune_result.previous_accuracy,
                    "warnings": fine_tune_result.warnings,
                    "error": fine_tune_result.error
                }

        except Exception as e:
            print(f"Fine-tuning error: {e}")
            if db:
                db.close()
            return {"error": f"Fine-tuning failed: {str(e)}"}

    def evaluate_model(self, sample_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        if self._fine_tune_pipeline is None:
            self._init_fine_tune()
            if self._fine_tune_pipeline is None:
                return {"error": "Fine-tune pipeline not available"}

        db = None
        try:
            db = next(get_db())

            query = db.query(AudioSample).filter(AudioSample.is_labeled == True)
            if sample_ids:
                query = query.filter(AudioSample.sample_id.in_(sample_ids))

            test_samples = query.all()

            if len(test_samples) < 3:
                db.close()
                return {"error": "Not enough test samples. Need at least 3."}

            eval_samples = []
            for sample in test_samples:
                try:
                    features = sample.get_features()
                    if not features:
                        continue

                    flat_features = feature_extractor._flatten_features(features)
                    feature_dict = {f"feat_{i}": v for i, v in enumerate(flat_features)}

                    eval_samples.append(TrainingSample(
                        features=feature_dict,
                        label=sample.fault_type,
                        sample_id=sample.sample_id
                    ))
                except Exception as e:
                    print(f"Error processing sample {sample.sample_id}: {e}")
                    continue

            db.close()

            if len(eval_samples) < 3:
                return {"error": "Not enough valid test samples."}

            result = self._fine_tune_pipeline.evaluate(eval_samples)

            return result

        except Exception as e:
            print(f"Evaluation error: {e}")
            if db:
                db.close()
            return {"error": f"Evaluation failed: {str(e)}"}

    def get_training_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(reversed(self._training_history[-limit:]))

    def classify(self, feature_vector: List[float]) -> Tuple[str, float, Dict[str, float]]:
        feature_vector = self._validate_feature_vector(feature_vector, 100)

        with self._model_lock:
            if not self.is_trained or self.model is None or self.scaler is None:
                return self._classify_with_rules(feature_vector)

            try:
                X = np.array(feature_vector, dtype=np.float64).reshape(1, -1)
                X_scaled = self.scaler.transform(X)

                prediction = self.model.predict(X_scaled)[0]
                probabilities = self.model.predict_proba(X_scaled)[0]

                all_probs = {}
                for i, class_name in enumerate(self.model.classes_):
                    all_probs[class_name] = self._safe_float(probabilities[i])

                confidence = self._safe_float(np.max(probabilities))

                return str(prediction), confidence, all_probs

            except Exception as e:
                print(f"ML classification error: {e}, falling back to rule-based")
                return self._classify_with_rules(feature_vector)

    def _classify_with_rules(self, feature_vector: List[float]) -> Tuple[str, float, Dict[str, float]]:
        feature_vector = self._validate_feature_vector(feature_vector, 20)

        time_features = feature_vector[:20]

        rms = self._safe_float(time_features[0] if len(time_features) > 0 else 0)
        peak_to_rms = self._safe_float(time_features[2] if len(time_features) > 2 else 1)
        zcr = self._safe_float(time_features[3] if len(time_features) > 3 else 0)
        kurtosis = self._safe_float(time_features[7] if len(time_features) > 7 else 0)
        envelope_std = self._safe_float(time_features[10] if len(time_features) > 10 else 0)
        spectral_centroid = self._safe_float(time_features[15] if len(time_features) > 15 else 1000)

        all_probs = {
            "normal": 0.0,
            "bearing_fault": 0.0,
            "gear_fault": 0.0,
            "motor_fault": 0.0,
            "pump_fault": 0.0,
            "fan_fault": 0.0,
            "unbalance": 0.0,
            "misalignment": 0.0,
            "loose_part": 0.0,
            "unknown": 0.0
        }

        rms_threshold_high = 0.15
        rms_threshold_medium = 0.08

        if rms < rms_threshold_medium and kurtosis < 3 and zcr < 0.1:
            all_probs["normal"] = 0.85
            fault_type = "normal"
        elif rms > rms_threshold_high:
            if kurtosis > 5 and peak_to_rms > 5:
                all_probs["bearing_fault"] = 0.75
                fault_type = "bearing_fault"
            elif zcr > 0.3 and envelope_std > 0.1:
                all_probs["gear_fault"] = 0.7
                fault_type = "gear_fault"
            elif 3 < kurtosis <= 5:
                all_probs["unbalance"] = 0.65
                fault_type = "unbalance"
            elif spectral_centroid > 5000:
                all_probs["pump_fault"] = 0.6
                fault_type = "pump_fault"
            else:
                all_probs["motor_fault"] = 0.55
                fault_type = "motor_fault"
        elif rms_threshold_medium <= rms <= rms_threshold_high:
            if envelope_std > 0.08:
                all_probs["loose_part"] = 0.6
                fault_type = "loose_part"
            elif zcr > 0.2:
                all_probs["misalignment"] = 0.55
                fault_type = "misalignment"
            else:
                all_probs["unknown"] = 0.5
                fault_type = "unknown"
        else:
            all_probs["unknown"] = 0.4
            all_probs["normal"] = 0.3
            fault_type = "unknown"

        confidence = self._safe_float(max(all_probs.values()))

        total = sum(all_probs.values())
        if total > 0:
            for key in all_probs:
                all_probs[key] = self._safe_float(all_probs[key] / total)

        return fault_type, confidence, all_probs

    def classify_sample(self, sample_id: str) -> Dict:
        start_time = time.time()

        db = None
        try:
            db = next(get_db())
            sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()

            if not sample:
                db.close()
                return {"error": "Sample not found", "sample_id": sample_id}

            try:
                features = sample.get_features()

                if not features:
                    try:
                        feature_result = feature_extractor.process_sample(sample_id)
                        if "error" in feature_result:
                            print(f"Feature extraction warning: {feature_result['error']}")
                        db.refresh(sample)
                        features = sample.get_features()
                    except Exception as fe:
                        print(f"Feature extraction failed: {fe}")

                if not features:
                    features = feature_extractor._get_default_features()

                feature_vector = feature_extractor._flatten_features(features)

            except Exception as e:
                print(f"Feature preparation error: {e}")
                feature_vector = [0.0] * 200
                features = feature_extractor._get_default_features()

            try:
                fault_type, confidence, all_probs = self.classify(feature_vector)
                severity = self._get_severity_from_confidence(confidence, fault_type)
            except Exception as classify_error:
                print(f"Classification error: {classify_error}")
                fault_type = "unknown"
                confidence = 0.0
                severity = "unknown"
                all_probs = {"unknown": 1.0}

            try:
                sample.classification_result = fault_type
                sample.classification_confidence = confidence

                processing_log = ProcessingLog(
                    task_id=sample_id,
                    device_id=sample.device_id,
                    stage="classification",
                    status="completed",
                    message=f"Classified as {fault_type} with {confidence:.2%} confidence",
                    processing_time=time.time() - start_time
                )
                db.add(processing_log)
                db.commit()
            except Exception as db_error:
                print(f"Database error: {db_error}")
                db.rollback()

            db.close()

            result = ClassificationResult(
                sample_id=sample_id,
                fault_type=fault_type,
                fault_severity=severity,
                confidence=confidence,
                all_probabilities=all_probs,
                processing_time=time.time() - start_time,
                features_used=["time_domain", "frequency_domain", "mfcc", "spectral", "cepstral"]
            )

            return result.model_dump()

        except Exception as e:
            print(f"Fatal classification error for {sample_id}: {e}")
            if db:
                try:
                    db.close()
                except:
                    pass
            return {
                "error": f"Classification failed: {str(e)}",
                "sample_id": sample_id,
                "fault_type": "unknown",
                "fault_severity": "unknown",
                "confidence": 0.0,
                "status": "failed"
            }

    def get_model_info(self) -> Dict:
        db = None
        active_model = None
        try:
            db = next(get_db())
            active_model = db.query(ClassificationModel).filter(
                ClassificationModel.is_active == True
            ).order_by(ClassificationModel.created_at.desc()).first()
        except Exception as e:
            print(f"Error getting model info: {e}")
        finally:
            if db:
                db.close()

        with self._model_lock:
            return {
                "is_trained": self.is_trained,
                "model_type": type(self.model).__name__ if self.model else "RuleBased",
                "classes": self.fault_types,
                "active_model": {
                    "model_name": active_model.model_name if active_model else None,
                    "model_version": active_model.model_version if active_model else None,
                    "accuracy": active_model.accuracy if active_model else None,
                    "created_at": active_model.created_at.isoformat() if active_model else None
                } if active_model else None
            }


_fault_classifier_instance = None
_classifier_lock = threading.Lock()


def get_fault_classifier() -> FaultClassifier:
    global _fault_classifier_instance
    if _fault_classifier_instance is None:
        with _classifier_lock:
            if _fault_classifier_instance is None:
                _fault_classifier_instance = FaultClassifier()
    return _fault_classifier_instance


fault_classifier = get_fault_classifier()


def process_classification_task(sample_id: str) -> Dict:
    try:
        classifier = get_fault_classifier()
        return classifier.classify_sample(sample_id)
    except Exception as e:
        print(f"Task wrapper error (classification): {e}")
        return {
            "error": f"Classification task failed: {str(e)}",
            "sample_id": sample_id,
            "fault_type": "unknown",
            "confidence": 0.0,
            "status": "failed"
        }


def train_classifier_task(sample_ids: List[str] = None) -> Dict:
    try:
        classifier = get_fault_classifier()
        return classifier.train_model(sample_ids)
    except Exception as e:
        print(f"Task wrapper error (training): {e}")
        return {"error": f"Training task failed: {str(e)}"}


def fine_tune_classifier_task(sample_ids: Optional[List[str]] = None,
                              learning_rate: float = 0.1) -> Dict:
    try:
        classifier = get_fault_classifier()
        return classifier.fine_tune_model(sample_ids, learning_rate=learning_rate)
    except Exception as e:
        print(f"Task wrapper error (fine-tune): {e}")
        return {"error": f"Fine-tuning task failed: {str(e)}"}


def evaluate_model_task(sample_ids: Optional[List[str]] = None) -> Dict:
    try:
        classifier = get_fault_classifier()
        return classifier.evaluate_model(sample_ids)
    except Exception as e:
        print(f"Task wrapper error (evaluation): {e}")
        return {"error": f"Evaluation task failed: {str(e)}"}
