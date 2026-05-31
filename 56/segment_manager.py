import os
import json
import uuid
import time
import numpy as np
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime
import soundfile as sf

from config import settings
from database import get_db, AudioSample
from pipeline.segment_pipeline import SegmentPipeline, AudioSegment


@dataclass
class SegmentMarker:
    marker_id: str
    sample_id: str
    start_time: float
    end_time: float
    label: Optional[str] = None
    notes: Optional[str] = None
    created_by: str = "system"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SegmentExportResult:
    success: bool
    output_path: Optional[str] = None
    num_segments: int = 0
    total_duration: float = 0.0
    error: Optional[str] = None


class SegmentManager:
    _instance = None
    _lock = None

    def __new__(cls):
        if cls._instance is None:
            import threading
            cls._lock = threading.Lock()
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized') and self._initialized:
            return
        self._initialized = True
        self.segment_pipeline = SegmentPipeline(sample_rate=settings.SAMPLE_RATE)
        self._markers: Dict[str, List[SegmentMarker]] = {}
        self._segments_dir = os.path.join(settings.STORAGE_PATH, "segments")
        self._markers_dir = os.path.join(settings.STORAGE_PATH, "markers")
        os.makedirs(self._segments_dir, exist_ok=True)
        os.makedirs(self._markers_dir, exist_ok=True)
        self._load_markers()

    def _load_markers(self):
        try:
            markers_file = os.path.join(self._markers_dir, "all_markers.json")
            if os.path.exists(markers_file):
                with open(markers_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for sample_id, markers in data.items():
                        self._markers[sample_id] = [SegmentMarker(**m) for m in markers]
        except Exception as e:
            print(f"Error loading markers: {e}")

    def _save_markers(self):
        try:
            markers_file = os.path.join(self._markers_dir, "all_markers.json")
            data = {}
            for sample_id, markers in self._markers.items():
                data[sample_id] = [m.to_dict() for m in markers]
            with open(markers_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving markers: {e}")

    def add_marker(self, sample_id: str, start_time: float, end_time: float,
                   label: Optional[str] = None, notes: Optional[str] = None,
                   created_by: str = "system") -> Optional[SegmentMarker]:
        try:
            if start_time >= end_time:
                return None

            marker = SegmentMarker(
                marker_id=f"marker_{uuid.uuid4().hex[:12]}",
                sample_id=sample_id,
                start_time=start_time,
                end_time=end_time,
                label=label,
                notes=notes,
                created_by=created_by
            )

            if sample_id not in self._markers:
                self._markers[sample_id] = []
            self._markers[sample_id].append(marker)
            self._save_markers()

            return marker
        except Exception as e:
            print(f"Error adding marker: {e}")
            return None

    def get_markers(self, sample_id: str) -> List[SegmentMarker]:
        return self._markers.get(sample_id, [])

    def get_all_markers(self) -> Dict[str, List[SegmentMarker]]:
        return dict(self._markers)

    def update_marker(self, marker_id: str, **kwargs) -> Optional[SegmentMarker]:
        try:
            for sample_id, markers in self._markers.items():
                for i, marker in enumerate(markers):
                    if marker.marker_id == marker_id:
                        for key, value in kwargs.items():
                            if hasattr(marker, key):
                                setattr(marker, key, value)
                        marker.updated_at = time.time()
                        self._save_markers()
                        return marker
            return None
        except Exception as e:
            print(f"Error updating marker: {e}")
            return None

    def delete_marker(self, marker_id: str) -> bool:
        try:
            for sample_id, markers in self._markers.items():
                for i, marker in enumerate(markers):
                    if marker.marker_id == marker_id:
                        markers.pop(i)
                        self._save_markers()
                        return True
            return False
        except Exception as e:
            print(f"Error deleting marker: {e}")
            return False

    def segment_audio(self, audio: np.ndarray, sample_rate: int,
                     method: str = "fixed", **kwargs) -> List[AudioSegment]:
        try:
            if method == "fixed":
                result = self.segment_pipeline.fixed_length_segment(
                    audio,
                    segment_duration=kwargs.get('segment_duration', 1.0),
                    overlap=kwargs.get('overlap', 0.0),
                    sample_rate=sample_rate,
                    min_length=kwargs.get('min_length', 0.1)
                )
            elif method == "energy":
                result = self.segment_pipeline.energy_based_segment(
                    audio,
                    threshold=kwargs.get('threshold', 0.1),
                    min_segment_duration=kwargs.get('min_segment_duration', 0.5),
                    max_segment_duration=kwargs.get('max_segment_duration', 5.0),
                    sample_rate=sample_rate
                )
            else:
                result = self.segment_pipeline.fixed_length_segment(
                    audio, sample_rate=sample_rate
                )

            return result.segments
        except Exception as e:
            print(f"Error segmenting audio: {e}")
            return []

    def extract_segments_from_markers(self, audio: np.ndarray, sample_rate: int,
                                      sample_id: str) -> List[AudioSegment]:
        try:
            markers = self.get_markers(sample_id)
            segments = []

            for marker in markers:
                segment = self.segment_pipeline.extract_custom_segment(
                    audio,
                    start_time=marker.start_time,
                    end_time=marker.end_time,
                    sample_rate=sample_rate
                )
                if segment:
                    segment.label = marker.label
                    segments.append(segment)

            return segments
        except Exception as e:
            print(f"Error extracting segments from markers: {e}")
            return []

    def save_segment(self, segment: AudioSegment, output_dir: Optional[str] = None) -> Optional[str]:
        try:
            dir_path = output_dir or self._segments_dir
            os.makedirs(dir_path, exist_ok=True)

            filename = f"{segment.segment_id}.wav"
            filepath = os.path.join(dir_path, filename)

            sf.write(filepath, segment.audio_data, segment.sample_rate)

            metadata_file = os.path.join(dir_path, f"{segment.segment_id}_meta.json")
            with open(metadata_file, 'w', encoding='utf-8') as f:
                json.dump(segment.to_dict(), f, indent=2, ensure_ascii=False)

            return filepath
        except Exception as e:
            print(f"Error saving segment: {e}")
            return None

    def export_segments(self, segments: List[AudioSegment],
                        output_dir: Optional[str] = None,
                        format: str = "wav") -> SegmentExportResult:
        try:
            dir_path = output_dir or self._segments_dir
            os.makedirs(dir_path, exist_ok=True)

            saved_count = 0
            total_duration = 0.0

            for segment in segments:
                filepath = self.save_segment(segment, dir_path)
                if filepath:
                    saved_count += 1
                    total_duration += segment.duration

            return SegmentExportResult(
                success=True,
                output_path=dir_path,
                num_segments=saved_count,
                total_duration=total_duration
            )
        except Exception as e:
            return SegmentExportResult(
                success=False,
                error=str(e)
            )

    def load_sample_audio(self, sample_id: str) -> Optional[Tuple[np.ndarray, int]]:
        try:
            db = next(get_db())
            sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()

            if not sample or not sample.file_path or not os.path.exists(sample.file_path):
                return None

            audio, sr = sf.read(sample.file_path)
            if len(audio.shape) > 1:
                audio = np.mean(audio, axis=1)

            return audio, sr
        except Exception as e:
            print(f"Error loading sample audio: {e}")
            return None
        finally:
            if 'db' in locals():
                db.close()

    def auto_detect_segments(self, sample_id: str, method: str = "energy",
                             **kwargs) -> List[SegmentMarker]:
        try:
            audio_data = self.load_sample_audio(sample_id)
            if not audio_data:
                return []

            audio, sr = audio_data
            segments = self.segment_audio(audio, sr, method=method, **kwargs)

            markers = []
            for seg in segments:
                marker = self.add_marker(
                    sample_id=sample_id,
                    start_time=seg.start_time,
                    end_time=seg.end_time,
                    created_by="auto_detect"
                )
                if marker:
                    markers.append(marker)

            return markers
        except Exception as e:
            print(f"Error auto detecting segments: {e}")
            return []

    def get_stats(self) -> Dict[str, Any]:
        total_markers = sum(len(m) for m in self._markers.values())
        labeled_markers = sum(
            1 for markers in self._markers.values()
            for m in markers if m.label
        )

        return {
            'total_samples_with_markers': len(self._markers),
            'total_markers': total_markers,
            'labeled_markers': labeled_markers,
            'unlabeled_markers': total_markers - labeled_markers,
            'segment_pipeline_stats': self.segment_pipeline.get_stats()
        }


def get_segment_manager() -> SegmentManager:
    return SegmentManager()
