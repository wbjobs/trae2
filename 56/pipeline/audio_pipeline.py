import numpy as np
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
import time

from .denoise_pipeline import DenoisePipeline, DenoiseResult
from .feature_pipeline import FeaturePipeline, FeatureResult
from .classification_pipeline import ClassificationPipeline, ClassificationResult
from .segment_pipeline import SegmentPipeline, SegmentResult


@dataclass
class FullPipelineResult:
    sample_id: str
    denoise_result: Optional[DenoiseResult] = None
    feature_result: Optional[FeatureResult] = None
    classification_result: Optional[ClassificationResult] = None
    segment_result: Optional[SegmentResult] = None
    total_processing_time: float = 0.0
    success: bool = True
    error: Optional[str] = None
    stages_completed: List[str] = field(default_factory=list)


class AudioProcessingPipeline:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.denoise_pipeline = DenoisePipeline(sample_rate)
        self.feature_pipeline = FeaturePipeline(sample_rate)
        self.classification_pipeline = ClassificationPipeline()
        self.segment_pipeline = SegmentPipeline(sample_rate)

        self.stats = {
            'total_processed': 0,
            'avg_processing_time': 0.0,
            'failures': 0
        }

    def process_full(self, audio: np.ndarray,
                    sample_id: str,
                    sample_rate: Optional[int] = None,
                    run_denoise: bool = True,
                    run_segment: bool = False,
                    denoise_config: Optional[Dict[str, Any]] = None,
                    feature_config: Optional[Dict[str, Any]] = None,
                    classification_config: Optional[Dict[str, Any]] = None,
                    segment_config: Optional[Dict[str, Any]] = None) -> FullPipelineResult:

        start_time = time.time()
        sr = sample_rate or self.sample_rate
        result = FullPipelineResult(sample_id=sample_id)
        current_audio = audio

        try:
            if run_denoise:
                denoise_result = self.denoise_pipeline.process(
                    current_audio, sr, denoise_config
                )
                result.denoise_result = denoise_result
                result.stages_completed.append('denoise')
                current_audio = denoise_result.denoised_audio

            feature_result = self.feature_pipeline.process(
                current_audio, sr, feature_config
            )
            result.feature_result = feature_result
            result.stages_completed.append('feature_extraction')

            if feature_result.feature_count > 0:
                classification_result = self.classification_pipeline.process(
                    feature_result.features,
                    config=classification_config
                )
                result.classification_result = classification_result
                result.stages_completed.append('classification')

            if run_segment:
                segment_result = self.segment_pipeline.fixed_length_segment(
                    current_audio,
                    segment_duration=segment_config.get('segment_duration', 1.0) if segment_config else 1.0,
                    overlap=segment_config.get('overlap', 0.0) if segment_config else 0.0,
                    sample_rate=sr
                )
                result.segment_result = segment_result
                result.stages_completed.append('segmentation')

            result.total_processing_time = time.time() - start_time
            result.success = True

            self.stats['total_processed'] += 1
            self.stats['avg_processing_time'] = (
                (self.stats['avg_processing_time'] * (self.stats['total_processed'] - 1) +
                 result.total_processing_time) / self.stats['total_processed']
            )

        except Exception as e:
            result.success = False
            result.error = str(e)
            result.total_processing_time = time.time() - start_time
            self.stats['failures'] += 1

        return result

    def process_batch(self, audio_list: List[np.ndarray],
                     sample_ids: List[str],
                     sample_rate: Optional[int] = None,
                     max_concurrent: int = 4,
                     **kwargs) -> List[FullPipelineResult]:
        results = []
        for audio, sample_id in zip(audio_list, sample_ids):
            result = self.process_full(
                audio=audio,
                sample_id=sample_id,
                sample_rate=sample_rate,
                **kwargs
            )
            results.append(result)
        return results

    def get_all_stats(self) -> Dict[str, Any]:
        return {
            'pipeline': self.get_stats(),
            'denoise': self.denoise_pipeline.get_stats(),
            'feature': self.feature_pipeline.get_stats(),
            'classification': self.classification_pipeline.get_stats(),
            'segment': self.segment_pipeline.get_stats()
        }

    def get_stats(self) -> Dict[str, Any]:
        return dict(self.stats)

    def reset_all_stats(self):
        self.reset_stats()
        self.denoise_pipeline.reset_stats()
        self.feature_pipeline.reset_stats()
        self.classification_pipeline.reset_stats()
        self.segment_pipeline.reset_stats()

    def reset_stats(self):
        self.stats = {
            'total_processed': 0,
            'avg_processing_time': 0.0,
            'failures': 0
        }
