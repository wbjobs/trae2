import numpy as np
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
import time

from feature_extractor import RobustFeatureExtractor


@dataclass
class FeatureResult:
    features: Dict[str, Any]
    feature_count: int
    time_domain_features: Dict[str, float]
    frequency_domain_features: Dict[str, float]
    mfcc_features: Dict[str, List[float]]
    spectral_features: Dict[str, List[float]]
    processing_time: float
    warnings: List[str] = field(default_factory=list)


class FeaturePipeline:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.extractor = RobustFeatureExtractor(sample_rate=sample_rate)
        self.stats = {
            'total_processed': 0,
            'avg_feature_count': 0.0,
            'avg_processing_time': 0.0,
            'failures': 0
        }

    def process(self, audio: np.ndarray, sample_rate: Optional[int] = None,
                config: Optional[Dict[str, Any]] = None) -> FeatureResult:
        start_time = time.time()
        sr = sample_rate or self.sample_rate
        warnings = []

        try:
            if config is None:
                config = {}

            if config.get('extract_all', True):
                features = self.extractor.extract_all_features(audio, sr)
            else:
                features = {}
                if config.get('extract_time', True):
                    td = self.extractor.extract_time_domain_features(audio, sr)
                    features.update(td)
                if config.get('extract_freq', True):
                    fd = self.extractor.extract_frequency_domain_features(audio, sr)
                    features.update(fd)
                if config.get('extract_mfcc', True):
                    mfcc = self.extractor.extract_mfcc_features(audio, sr)
                    features.update(mfcc)
                if config.get('extract_spectral', True):
                    sp = self.extractor.extract_spectral_features(audio, sr)
                    features.update(sp)

            td_features = {k: v for k, v in features.items()
                          if k.startswith('time_') or k in ['rms', 'peak', 'crest_factor', 'zcr']}
            fd_features = {k: v for k, v in features.items()
                          if k.startswith('freq_') or k in ['spectral_centroid', 'spectral_bandwidth']}
            mfcc_features = {k: v for k, v in features.items()
                            if k.startswith('mfcc_') and isinstance(v, list)}
            spectral_features = {k: v for k, v in features.items()
                                if k.startswith('spectral_') and isinstance(v, list)}

            invalid_count = sum(1 for v in features.values()
                               if isinstance(v, (int, float)) and (np.isnan(v) or np.isinf(v)))
            if invalid_count > 0:
                warnings.append(f"Found {invalid_count} invalid feature values")

            proc_time = time.time() - start_time

            self.stats['total_processed'] += 1
            self.stats['avg_feature_count'] = (
                (self.stats['avg_feature_count'] * (self.stats['total_processed'] - 1) +
                 len(features)) / self.stats['total_processed']
            )
            self.stats['avg_processing_time'] = (
                (self.stats['avg_processing_time'] * (self.stats['total_processed'] - 1) +
                 proc_time) / self.stats['total_processed']
            )

            return FeatureResult(
                features=features,
                feature_count=len(features),
                time_domain_features=td_features,
                frequency_domain_features=fd_features,
                mfcc_features=mfcc_features,
                spectral_features=spectral_features,
                processing_time=proc_time,
                warnings=warnings
            )

        except Exception as e:
            self.stats['failures'] += 1
            proc_time = time.time() - start_time
            warnings.append(f"Feature extraction failed: {str(e)}")
            return FeatureResult(
                features={},
                feature_count=0,
                time_domain_features={},
                frequency_domain_features={},
                mfcc_features={},
                spectral_features={},
                processing_time=proc_time,
                warnings=warnings
            )

    def get_feature_vector(self, features: Dict[str, Any],
                          expected_features: List[str]) -> np.ndarray:
        return self.extractor.get_feature_vector(features, expected_features)

    def get_stats(self) -> Dict[str, Any]:
        return dict(self.stats)

    def reset_stats(self):
        self.stats = {
            'total_processed': 0,
            'avg_feature_count': 0.0,
            'avg_processing_time': 0.0,
            'failures': 0
        }
