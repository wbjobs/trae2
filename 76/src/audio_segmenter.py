import numpy as np
import soundfile as sf
from scipy import signal
from scipy.signal import find_peaks, hilbert
from typing import List, Dict, Optional, Tuple, Union
from pathlib import Path
import uuid
import logging
import json
from datetime import datetime

logger = logging.getLogger(__name__)


class AudioSegment:
    def __init__(
        self,
        audio: np.ndarray,
        start_time: float,
        end_time: float,
        sample_rate: int,
        segment_id: Optional[str] = None,
        label: Optional[str] = None,
        confidence: Optional[float] = None,
        metadata: Optional[Dict] = None
    ):
        self.segment_id = segment_id or f"seg_{uuid.uuid4().hex[:16]}"
        self.audio = audio
        self.start_time = start_time
        self.end_time = end_time
        self.duration = end_time - start_time
        self.sample_rate = sample_rate
        self.label = label
        self.confidence = confidence
        self.metadata = metadata or {}
        self.created_at = datetime.utcnow()

    def __len__(self):
        return len(self.audio)

    @property
    def num_samples(self):
        return len(self.audio)

    def save(self, output_dir: Union[str, Path]) -> str:
        output_path = Path(output_dir) / f"{self.segment_id}.wav"
        sf.write(str(output_path), self.audio, self.sample_rate)
        return str(output_path)

    def to_dict(self) -> Dict:
        return {
            "segment_id": self.segment_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration": self.duration,
            "sample_rate": self.sample_rate,
            "num_samples": self.num_samples,
            "label": self.label,
            "confidence": self.confidence,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat()
        }


class AudioSegmenter:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self._markers: List[Dict] = []

    def add_marker(
        self,
        start_time: float,
        end_time: Optional[float] = None,
        label: Optional[str] = None,
        confidence: Optional[float] = None,
        metadata: Optional[Dict] = None
    ) -> str:
        marker_id = f"marker_{uuid.uuid4().hex[:12]}"
        marker = {
            "marker_id": marker_id,
            "start_time": start_time,
            "end_time": end_time,
            "label": label,
            "confidence": confidence,
            "metadata": metadata or {},
            "created_at": datetime.utcnow()
        }
        self._markers.append(marker)
        return marker_id

    def get_markers(self) -> List[Dict]:
        return sorted(self._markers, key=lambda x: x["start_time"])

    def remove_marker(self, marker_id: str) -> bool:
        for i, marker in enumerate(self._markers):
            if marker["marker_id"] == marker_id:
                self._markers.pop(i)
                return True
        return False

    def clear_markers(self):
        self._markers = []

    def segment_by_markers(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None
    ) -> List[AudioSegment]:
        sr = sample_rate or self.sample_rate
        
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        
        total_duration = len(audio) / sr
        segments = []
        
        for marker in self.get_markers():
            start_time = marker["start_time"]
            end_time = marker.get("end_time") or total_duration
            
            start_sample = int(start_time * sr)
            end_sample = int(end_time * sr)
            
            start_sample = max(0, min(start_sample, len(audio)))
            end_sample = max(0, min(end_sample, len(audio)))
            
            if end_sample > start_sample:
                segment_audio = audio[start_sample:end_sample].copy()
                segment = AudioSegment(
                    audio=segment_audio,
                    start_time=start_time,
                    end_time=end_time,
                    sample_rate=sr,
                    label=marker.get("label"),
                    confidence=marker.get("confidence"),
                    metadata=marker.get("metadata")
                )
                segments.append(segment)
        
        return segments

    def detect_anomaly_segments(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None,
        threshold: float = 2.0,
        min_duration: float = 0.5,
        max_segments: int = 10
    ) -> List[AudioSegment]:
        sr = sample_rate or self.sample_rate
        
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        
        envelope = np.abs(hilbert(audio))
        envelope_mean = np.mean(envelope)
        envelope_std = np.std(envelope)
        
        anomaly_mask = envelope > (envelope_mean + threshold * envelope_std)
        
        min_samples = int(min_duration * sr)
        segments = []
        in_segment = False
        segment_start = 0
        
        for i, is_anomaly in enumerate(anomaly_mask):
            if is_anomaly and not in_segment:
                segment_start = i
                in_segment = True
            elif not is_anomaly and in_segment:
                segment_end = i
                if segment_end - segment_start >= min_samples:
                    segments.append((segment_start, segment_end))
                in_segment = False
        
        if in_segment:
            if len(audio) - segment_start >= min_samples:
                segments.append((segment_start, len(audio)))
        
        segments = sorted(segments, key=lambda x: x[1] - x[0], reverse=True)
        segments = segments[:max_segments]
        
        result = []
        for start_sample, end_sample in segments:
            segment_audio = audio[start_sample:end_sample].copy()
            segment = AudioSegment(
                audio=segment_audio,
                start_time=start_sample / sr,
                end_time=end_sample / sr,
                sample_rate=sr,
                label="anomaly",
                confidence=float(np.mean(envelope[start_sample:end_sample]) / (envelope_mean + 1e-10)),
                metadata={
                    "detection_method": "energy_threshold",
                    "threshold": threshold,
                    "peak_energy": float(np.max(envelope[start_sample:end_sample]))
                }
            )
            result.append(segment)
        
        return result

    def segment_by_energy(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None,
        frame_size: float = 0.05,
        hop_size: float = 0.025,
        threshold: Optional[float] = None,
        min_silence_duration: float = 0.3,
        min_segment_duration: float = 1.0
    ) -> List[AudioSegment]:
        sr = sample_rate or self.sample_rate
        
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        
        frame_samples = int(frame_size * sr)
        hop_samples = int(hop_size * sr)
        min_silence_samples = int(min_silence_duration * sr)
        min_segment_samples = int(min_segment_duration * sr)
        
        energies = []
        for i in range(0, len(audio) - frame_samples, hop_samples):
            frame = audio[i:i + frame_samples]
            energy = np.sqrt(np.mean(frame ** 2))
            energies.append(energy)
        
        energies = np.array(energies)
        
        if threshold is None:
            threshold = np.mean(energies) + 0.5 * np.std(energies)
        
        voice_mask = energies > threshold
        
        segments = []
        in_segment = False
        segment_start = 0
        silence_counter = 0
        
        for i, is_voice in enumerate(voice_mask):
            sample_pos = i * hop_samples
            
            if is_voice and not in_segment:
                segment_start = sample_pos
                in_segment = True
                silence_counter = 0
            elif is_voice and in_segment:
                silence_counter = 0
            elif not is_voice and in_segment:
                silence_counter += hop_samples
                if silence_counter >= min_silence_samples:
                    segment_end = sample_pos - min_silence_samples + frame_samples
                    if segment_end - segment_start >= min_segment_samples:
                        segments.append((segment_start, segment_end))
                    in_segment = False
        
        if in_segment:
            segment_end = len(audio)
            if segment_end - segment_start >= min_segment_samples:
                segments.append((segment_start, segment_end))
        
        result = []
        for start_sample, end_sample in segments:
            segment_audio = audio[start_sample:end_sample].copy()
            segment = AudioSegment(
                audio=segment_audio,
                start_time=start_sample / sr,
                end_time=end_sample / sr,
                sample_rate=sr,
                label="voice",
                metadata={
                    "detection_method": "energy_vad",
                    "threshold": float(threshold),
                    "avg_energy": float(np.mean(energies[voice_mask])) if np.any(voice_mask) else 0.0
                }
            )
            result.append(segment)
        
        return result

    def segment_fixed_length(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None,
        segment_duration: float = 2.0,
        overlap: float = 0.5
    ) -> List[AudioSegment]:
        sr = sample_rate or self.sample_rate
        
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        
        segment_samples = int(segment_duration * sr)
        hop_samples = int(segment_samples * (1 - overlap))
        
        segments = []
        for start_sample in range(0, len(audio) - segment_samples + 1, hop_samples):
            end_sample = start_sample + segment_samples
            segment_audio = audio[start_sample:end_sample].copy()
            segment = AudioSegment(
                audio=segment_audio,
                start_time=start_sample / sr,
                end_time=end_sample / sr,
                sample_rate=sr,
                metadata={
                    "segment_method": "fixed_length",
                    "segment_duration": segment_duration,
                    "overlap": overlap
                }
            )
            segments.append(segment)
        
        return segments

    def segment_by_beat(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None,
        min_segment_duration: float = 1.0
    ) -> List[AudioSegment]:
        sr = sample_rate or self.sample_rate
        
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        
        try:
            import librosa
            tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=sr)
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)
            
            min_samples = int(min_segment_duration * sr)
            segments = []
            
            for i in range(len(beat_times) - 1):
                start_time = beat_times[i]
                end_time = beat_times[i + 1]
                start_sample = int(start_time * sr)
                end_sample = int(end_time * sr)
                
                if end_sample - start_sample >= min_samples:
                    segment_audio = audio[start_sample:end_sample].copy()
                    segment = AudioSegment(
                        audio=segment_audio,
                        start_time=start_time,
                        end_time=end_time,
                        sample_rate=sr,
                        label="beat_segment",
                        metadata={
                            "detection_method": "beat_tracking",
                            "tempo": float(tempo),
                            "beat_index": i
                        }
                    )
                    segments.append(segment)
            
            return segments
            
        except ImportError:
            logger.warning("Librosa not available, falling back to fixed length segmentation")
            return self.segment_fixed_length(audio, sr)

    def extract_segment(
        self,
        audio: np.ndarray,
        start_time: float,
        end_time: float,
        sample_rate: Optional[int] = None,
        label: Optional[str] = None
    ) -> AudioSegment:
        sr = sample_rate or self.sample_rate
        
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        
        start_sample = int(start_time * sr)
        end_sample = int(end_time * sr)
        
        start_sample = max(0, min(start_sample, len(audio)))
        end_sample = max(0, min(end_sample, len(audio)))
        
        segment_audio = audio[start_sample:end_sample].copy()
        
        return AudioSegment(
            audio=segment_audio,
            start_time=start_time,
            end_time=end_time,
            sample_rate=sr,
            label=label
        )

    def split_large_audio(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None,
        max_duration: float = 30.0,
        overlap: float = 1.0
    ) -> List[AudioSegment]:
        sr = sample_rate or self.sample_rate
        return self.segment_fixed_length(
            audio=audio,
            sample_rate=sr,
            segment_duration=max_duration,
            overlap=overlap / max_duration
        )

    def save_segments(
        self,
        segments: List[AudioSegment],
        output_dir: Union[str, Path],
        create_index: bool = True
    ) -> List[str]:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        saved_paths = []
        index_data = []
        
        for segment in segments:
            path = segment.save(output_path)
            saved_paths.append(path)
            index_data.append(segment.to_dict())
        
        if create_index:
            index_file = output_path / "segments_index.json"
            with open(index_file, 'w', encoding='utf-8') as f:
                json.dump(index_data, f, indent=2, ensure_ascii=False)
        
        return saved_paths

    def export_markers(self, filepath: Union[str, Path]) -> str:
        markers_data = []
        for marker in self.get_markers():
            marker_copy = marker.copy()
            marker_copy["created_at"] = marker_copy["created_at"].isoformat()
            markers_data.append(marker_copy)
        
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(markers_data, f, indent=2, ensure_ascii=False)
        
        return str(filepath)

    def import_markers(self, filepath: Union[str, Path]) -> int:
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"Markers file not found: {filepath}")
        
        with open(filepath, 'r', encoding='utf-8') as f:
            markers_data = json.load(f)
        
        count = 0
        for marker_data in markers_data:
            marker_id = self.add_marker(
                start_time=marker_data["start_time"],
                end_time=marker_data.get("end_time"),
                label=marker_data.get("label"),
                confidence=marker_data.get("confidence"),
                metadata=marker_data.get("metadata")
            )
            if marker_id:
                count += 1
        
        return count
