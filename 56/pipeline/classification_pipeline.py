import numpy as np
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
import time

from fault_classifier import get_fault_classifier, FaultClassifier


@dataclass
class ClassificationResult:
    fault_type: str
    fault_severity: str
    confidence: float
    all_probabilities: Dict[str, float]
    processing_time: float
    features_used: List[str] = field(default_factory=list)
    model_version: str = "latest"
    warnings: List[str] = field(default_factory=list)


class ClassificationPipeline:
    def __init__(self):
        self.classifier: Optional[FaultClassifier] = None
        self._init_classifier()
        self.stats = {
            'total_classified': 0,
            'avg_confidence': 0.0,
            'avg_processing_time': 0.0,
            'failures': 0
        }

    def _init_classifier(self):
        try:
            self.classifier = get_fault_classifier()
        except Exception as e:
            print(f"Failed to initialize classifier: {e}")
            self.classifier = None

    def process(self, features: Dict[str, Any],
                model_version: str = "latest",
                config: Optional[Dict[str, Any]] = None) -> ClassificationResult:
        start_time = time.time()
        warnings = []

        try:
            if self.classifier is None:
                self._init_classifier()
                if self.classifier is None:
                    raise RuntimeError("Classifier not available")

            result = self.classifier.predict_with_confidence(features)

            proc_time = time.time() - start_time

            self.stats['total_classified'] += 1
            self.stats['avg_confidence'] = (
                (self.stats['avg_confidence'] * (self.stats['total_classified'] - 1) +
                 result['confidence']) / self.stats['total_classified']
            )
            self.stats['avg_processing_time'] = (
                (self.stats['avg_processing_time'] * (self.stats['total_classified'] - 1) +
                 proc_time) / self.stats['total_classified']
            )

            return ClassificationResult(
                fault_type=result['fault_type'],
                fault_severity=result.get('severity', 'medium'),
                confidence=result['confidence'],
                all_probabilities=result.get('probabilities', {}),
                processing_time=proc_time,
                features_used=result.get('features_used', []),
                model_version=model_version,
                warnings=warnings
            )

        except Exception as e:
            self.stats['failures'] += 1
            proc_time = time.time() - start_time
            warnings.append(f"Classification failed: {str(e)}")

            return ClassificationResult(
                fault_type="unknown",
                fault_severity="low",
                confidence=0.0,
                all_probabilities={},
                processing_time=proc_time,
                features_used=[],
                model_version=model_version,
                warnings=warnings
            )

    def batch_classify(self, features_list: List[Dict[str, Any]],
                      model_version: str = "latest") -> List[ClassificationResult]:
        return [self.process(f, model_version) for f in features_list]

    def get_model_info(self) -> Dict[str, Any]:
        if self.classifier:
            return self.classifier.get_model_status()
        return {"is_trained": False, "error": "Classifier not initialized"}

    def get_stats(self) -> Dict[str, Any]:
        return dict(self.stats)

    def reset_stats(self):
        self.stats = {
            'total_classified': 0,
            'avg_confidence': 0.0,
            'avg_processing_time': 0.0,
            'failures': 0
        }
