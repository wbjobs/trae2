import numpy as np
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
import time
import uuid


@dataclass
class AudioSegment:
    segment_id: str
    start_time: float
    end_time: float
    start_sample: int
    end_sample: int
    duration: float
    audio_data: np.ndarray
    sample_rate: int
    label: Optional[str] = None
    confidence: Optional[float] = None
    features: Optional[Dict[str, Any]] = None
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'segment_id': self.segment_id,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'start_sample': self.start_sample,
            'end_sample': self.end_sample,
            'duration': self.duration,
            'sample_rate': self.sample_rate,
            'label': self.label,
            'confidence': self.confidence,
            'features': self.features,
            'created_at': self.created_at
        }


@dataclass
class SegmentResult:
    segments: List[AudioSegment]
    total_segments: int
    total_duration: float
    processing_time: float
    method: str
    warnings: List[str] = field(default_factory=list)


class SegmentPipeline:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.stats = {
            'total_segmented': 0,
            'avg_segments_per_file': 0.0,
            'failures': 0
        }

    def fixed_length_segment(self, audio: np.ndarray,
                            segment_duration: float = 1.0,
                            overlap: float = 0.0,
                            sample_rate: Optional[int] = None,
                            min_length: float = 0.1) -> SegmentResult:
        start_time = time.time()
        sr = sample_rate or self.sample_rate
        warnings = []
        segments = []

        try:
            if len(audio) == 0:
                warnings.append("Empty audio input")
                return SegmentResult(
                    segments=[], total_segments=0, total_duration=0,
                    processing_time=time.time() - start_time,
                    method='fixed_length', warnings=warnings
                )

            total_duration = len(audio) / sr
            segment_samples = int(segment_duration * sr)
            overlap_samples = int(overlap * segment_samples)
            step_samples = segment_samples - overlap_samples
            min_samples = int(min_length * sr)

            if segment_samples <= 0:
                segment_samples = int(1.0 * sr)
                warnings.append(f"Invalid segment duration, using default 1.0s")

            start = 0
            seg_idx = 0
            while start < len(audio):
                end = min(start + segment_samples, len(audio))
                actual_duration = (end - start) / sr

                if actual_duration >= min_length:
                    segment_audio = audio[start:end]

                    segment = AudioSegment(
                        segment_id=f"seg_{uuid.uuid4().hex[:12]}",
                        start_time=start / sr,
                        end_time=end / sr,
                        start_sample=start,
                        end_sample=end,
                        duration=actual_duration,
                        audio_data=segment_audio,
                        sample_rate=sr
                    )
                    segments.append(segment)
                    seg_idx += 1

                start += step_samples
                if step_samples <= 0:
                    break

            proc_time = time.time() - start_time

            self.stats['total_segmented'] += 1
            self.stats['avg_segments_per_file'] = (
                (self.stats['avg_segments_per_file'] * (self.stats['total_segmented'] - 1) +
                 len(segments)) / self.stats['total_segmented']
            )

            return SegmentResult(
                segments=segments,
                total_segments=len(segments),
                total_duration=total_duration,
                processing_time=proc_time,
                method='fixed_length',
                warnings=warnings
            )

        except Exception as e:
            self.stats['failures'] += 1
            warnings.append(f"Segmentation failed: {str(e)}")
            return SegmentResult(
                segments=[], total_segments=0, total_duration=0,
                processing_time=time.time() - start_time,
                method='fixed_length', warnings=warnings
            )

    def energy_based_segment(self, audio: np.ndarray,
                            threshold: float = 0.1,
                            min_segment_duration: float = 0.5,
                            max_segment_duration: float = 5.0,
                            sample_rate: Optional[int] = None) -> SegmentResult:
        start_time = time.time()
        sr = sample_rate or self.sample_rate
        warnings = []
        segments = []

        try:
            if len(audio) == 0:
                warnings.append("Empty audio input")
                return SegmentResult(
                    segments=[], total_segments=0, total_duration=0,
                    processing_time=time.time() - start_time,
                    method='energy_based', warnings=warnings
                )

            total_duration = len(audio) / sr
            frame_length = int(0.025 * sr)
            hop_length = int(0.01 * sr)

            energy = []
            for i in range(0, len(audio) - frame_length, hop_length):
                frame = audio[i:i + frame_length]
                e = np.sqrt(np.mean(frame ** 2))
                energy.append(e)

            if not energy:
                return self.fixed_length_segment(audio, 1.0, 0, sr)

            energy_arr = np.array(energy)
            if threshold <= 0:
                threshold = np.mean(energy_arr) * 0.5

            above_threshold = energy_arr > threshold
            above_threshold = np.convolve(above_threshold.astype(int), np.ones(10) / 10, mode='same') > 0.5

            segment_boundaries = []
            in_segment = False
            seg_start = 0

            for i, is_above in enumerate(above_threshold):
                if is_above and not in_segment:
                    in_segment = True
                    seg_start = i * hop_length
                elif not is_above and in_segment:
                    in_segment = False
                    seg_end = i * hop_length
                    segment_boundaries.append((seg_start, seg_end))

            if in_segment:
                segment_boundaries.append((seg_start, len(audio)))

            min_samples = int(min_segment_duration * sr)
            max_samples = int(max_segment_duration * sr)

            seg_idx = 0
            for start, end in segment_boundaries:
                duration_samples = end - start
                if duration_samples < min_samples:
                    continue

                if duration_samples > max_samples:
                    num_subsegments = int(np.ceil(duration_samples / max_samples))
                    sub_len = duration_samples // num_subsegments
                    for j in range(num_subsegments):
                        sub_start = start + j * sub_len
                        sub_end = min(start + (j + 1) * sub_len, end)
                        seg_audio = audio[sub_start:sub_end]

                        segment = AudioSegment(
                            segment_id=f"seg_{uuid.uuid4().hex[:12]}",
                            start_time=sub_start / sr,
                            end_time=sub_end / sr,
                            start_sample=sub_start,
                            end_sample=sub_end,
                            duration=(sub_end - sub_start) / sr,
                            audio_data=seg_audio,
                            sample_rate=sr
                        )
                        segments.append(segment)
                        seg_idx += 1
                else:
                    seg_audio = audio[start:end]

                    segment = AudioSegment(
                        segment_id=f"seg_{uuid.uuid4().hex[:12]}",
                        start_time=start / sr,
                        end_time=end / sr,
                        start_sample=start,
                        end_sample=end,
                        duration=duration_samples / sr,
                        audio_data=seg_audio,
                        sample_rate=sr
                    )
                    segments.append(segment)
                    seg_idx += 1

            proc_time = time.time() - start_time

            self.stats['total_segmented'] += 1
            self.stats['avg_segments_per_file'] = (
                (self.stats['avg_segments_per_file'] * (self.stats['total_segmented'] - 1) +
                 len(segments)) / self.stats['total_segmented']
            )

            return SegmentResult(
                segments=segments,
                total_segments=len(segments),
                total_duration=total_duration,
                processing_time=proc_time,
                method='energy_based',
                warnings=warnings
            )

        except Exception as e:
            self.stats['failures'] += 1
            warnings.append(f"Energy-based segmentation failed: {str(e)}")
            return self.fixed_length_segment(audio, 1.0, 0, sr)

    def extract_custom_segment(self, audio: np.ndarray,
                              start_time: float,
                              end_time: float,
                              sample_rate: Optional[int] = None) -> Optional[AudioSegment]:
        sr = sample_rate or self.sample_rate

        try:
            start_sample = int(start_time * sr)
            end_sample = int(end_time * sr)

            start_sample = max(0, min(start_sample, len(audio)))
            end_sample = max(0, min(end_sample, len(audio)))

            if end_sample <= start_sample:
                return None

            seg_audio = audio[start_sample:end_sample]

            return AudioSegment(
                segment_id=f"seg_{uuid.uuid4().hex[:12]}",
                start_time=start_sample / sr,
                end_time=end_sample / sr,
                start_sample=start_sample,
                end_sample=end_sample,
                duration=(end_sample - start_sample) / sr,
                audio_data=seg_audio,
                sample_rate=sr
            )

        except Exception as e:
            print(f"Error extracting segment: {e}")
            return None

    def label_segment(self, segment: AudioSegment,
                     label: str,
                     confidence: Optional[float] = None) -> AudioSegment:
        segment.label = label
        segment.confidence = confidence
        return segment

    def get_stats(self) -> Dict[str, Any]:
        return dict(self.stats)

    def reset_stats(self):
        self.stats = {
            'total_segmented': 0,
            'avg_segments_per_file': 0.0,
            'failures': 0
        }
