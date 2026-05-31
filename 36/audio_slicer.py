"""
音频片段截取模块
支持 VAD 端点检测、自动切片、静音移除、重叠片段合并

功能特性：
- 能量基 VAD：基于短时能量 + 过零率的语音活动检测
- 自适应阈值检测：自动估计噪声水平，动态调整检测阈值
- 片段合并：相邻活跃片段自动合并
- 静音移除：精确切除静音片段，保留有效内容
- 多策略切片：固定长度、可变长度、能量基多种切片方式
"""
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from config import SAMPLE_RATE, HOP_LENGTH, N_FFT

logger = logging.getLogger(__name__)


@dataclass
class AudioSlice:
    """音频切片数据结构"""
    audio: np.ndarray
    start_sample: int
    end_sample: int
    start_time: float
    end_time: float
    duration: float
    rms: float
    peak: float
    has_voice: bool

    def __post_init__(self):
        if self.duration <= 0:
            self.duration = (self.end_sample - self.start_sample) / SAMPLE_RATE
        if self.start_time <= 0 and self.start_sample >= 0:
            self.start_time = self.start_sample / SAMPLE_RATE
        if self.end_time <= 0 and self.end_sample >= 0:
            self.end_time = self.end_sample / SAMPLE_RATE


@dataclass
class SlicerConfig:
    """切片器配置"""
    min_silence_duration: float = 0.3
    min_voice_duration: float = 0.2
    max_slice_duration: float = 10.0
    min_slice_duration: float = 0.5
    energy_threshold: float = 0.01
    zcr_threshold: float = 0.1
    merge_gap_duration: float = 0.2
    pad_before: float = 0.1
    pad_after: float = 0.1
    overlap_ratio: float = 0.0
    vad_mode: str = "adaptive"


class EnergyBasedVAD:
    """能量基语音活动检测器"""

    def __init__(
        self,
        frame_length: int = 512,
        hop_length: int = 256,
        threshold_energy: float = None,
        threshold_zcr: float = 0.1,
        mode: str = "adaptive",
    ):
        self.frame_length = frame_length
        self.hop_length = hop_length
        self.threshold_energy = threshold_energy
        self.threshold_zcr = threshold_zcr
        self.mode = mode
        self._noise_energy: Optional[float] = None
        self._noise_zcr: Optional[float] = None

    def _frame(self, audio: np.ndarray) -> np.ndarray:
        """分帧处理"""
        if len(audio) < self.frame_length:
            return np.array([audio])
        n_frames = 1 + (len(audio) - self.frame_length) // self.hop_length
        frames = np.zeros((n_frames, self.frame_length), dtype=np.float32)
        for i in range(n_frames):
            start = i * self.hop_length
            frames[i] = audio[start:start + self.frame_length]
        return frames

    def estimate_noise(self, audio: np.ndarray, noise_frames_ratio: float = 0.1):
        """从低能量帧估计噪声水平"""
        frames = self._frame(audio)
        energies = np.array([np.sqrt(np.mean(frame ** 2)) for frame in frames])
        zcrs = np.array([np.sum(np.abs(np.diff(frame > 0))) for frame in frames]) / self.frame_length
        if len(energies) == 0:
            self._noise_energy = 0.01
            self._noise_zcr = 0.1
            return
        n_noise = max(1, int(len(energies) * noise_frames_ratio))
        sorted_idx = np.argsort(energies)
        self._noise_energy = np.mean(energies[sorted_idx[:n_noise]])
        self._noise_zcr = np.mean(zcrs[sorted_idx[:n_noise]])
        logger.info(f"Noise estimated: energy={self._noise_energy:.6f}, zcr={self._noise_zcr:.4f}")

    def detect(self, audio: np.ndarray) -> np.ndarray:
        """检测语音活动，返回每帧的语音标志"""
        frames = self._frame(audio)
        n_frames = len(frames)
        if n_frames == 0:
            return np.array([], dtype=bool)
        energies = np.array([np.sqrt(np.mean(frame ** 2)) for frame in frames])
        zcrs = np.array([np.sum(np.abs(np.diff(np.sign(frame)))) for frame in frames]) / self.frame_length
        if self._noise_energy is None:
            self.estimate_noise(audio)
        if self.mode == "adaptive":
            threshold_energy = max(self.threshold_energy or 0.01, self._noise_energy * 3.0)
            threshold_zcr = self.threshold_zcr
        else:
            threshold_energy = self.threshold_energy or 0.01
            threshold_zcr = self.threshold_zcr
        voice_mask = (energies > threshold_energy) & (zcrs < 0.8)
        if np.any(voice_mask):
            voice_energies = energies[voice_mask]
            if len(voice_energies) > 0:
                high_energy = np.percentile(voice_energies, 75)
                voice_mask = voice_mask | (energies > high_energy * 0.5)
        return voice_mask

    def get_voice_segments(self, audio: np.ndarray) -> List[Tuple[int, int]]:
        """获取语音片段的起止帧索引"""
        voice_mask = self.detect(audio)
        if len(voice_mask) == 0:
            return []
        segments = []
        in_voice = False
        start = 0
        for i, is_voice in enumerate(voice_mask):
            if is_voice and not in_voice:
                start = i
                in_voice = True
            elif not is_voice and in_voice:
                segments.append((start, i))
                in_voice = False
        if in_voice:
            segments.append((start, len(voice_mask)))
        return segments


class AudioSlicer:
    """音频切片器"""

    def __init__(self, config: Optional[SlicerConfig] = None):
        self.config = config or SlicerConfig()
        self.vad = EnergyBasedVAD(
            frame_length=N_FFT,
            hop_length=HOP_LENGTH,
            threshold_energy=self.config.energy_threshold,
            threshold_zcr=self.config.zcr_threshold,
            mode=self.config.vad_mode,
        )

    def _frame_to_sample(self, frame_idx: int) -> int:
        return frame_idx * self.vad.hop_length

    def _sample_to_time(self, sample_idx: int) -> float:
        return sample_idx / SAMPLE_RATE

    def _merge_segments(
        self,
        segments: List[Tuple[int, int]],
        audio_length: int,
    ) -> List[Tuple[int, int]]:
        """合并相邻语音片段"""
        if not segments:
            return []
        min_voice_samples = int(self.config.min_voice_duration * SAMPLE_RATE)
        merge_gap_samples = int(self.config.merge_gap_duration * SAMPLE_RATE)
        merged = []
        current_start, current_end = segments[0]
        for start, end in segments[1:]:
            gap = start - current_end
            if gap <= merge_gap_samples:
                current_end = end
            else:
                if current_end - current_start >= min_voice_samples:
                    merged.append((current_start, current_end))
                current_start, current_end = start, end
        if current_end - current_start >= min_voice_samples:
            merged.append((current_start, current_end))
        return merged

    def _pad_segments(
        self,
        segments: List[Tuple[int, int]],
        audio_length: int,
    ) -> List[Tuple[int, int]]:
        """为片段添加前后填充"""
        pad_before = int(self.config.pad_before * SAMPLE_RATE)
        pad_after = int(self.config.pad_after * SAMPLE_RATE)
        padded = []
        for start, end in segments:
            new_start = max(0, start - pad_before)
            new_end = min(audio_length, end + pad_after)
            padded.append((new_start, new_end))
        return padded

    def _split_long_segments(
        self,
        segments: List[Tuple[int, int]],
    ) -> List[Tuple[int, int]]:
        """拆分过长的片段"""
        max_samples = int(self.config.max_slice_duration * SAMPLE_RATE)
        overlap_samples = int(self.config.overlap_ratio * max_samples)
        split = []
        for start, end in segments:
            length = end - start
            if length <= max_samples:
                split.append((start, end))
                continue
            step = max_samples - overlap_samples
            pos = start
            while pos < end:
                seg_end = min(pos + max_samples, end)
                split.append((pos, seg_end))
                if seg_end >= end:
                    break
                pos += step
        return split

    def slice_by_voice_activity(self, audio: np.ndarray) -> List[AudioSlice]:
        """基于 VAD 的语音切片"""
        if len(audio) == 0:
            return []
        self.vad.estimate_noise(audio)
        segments = self.vad.get_voice_segments(audio)
        sample_segments = [
            (self._frame_to_sample(s), self._frame_to_sample(e))
            for s, e in segments
        ]
        sample_segments = self._merge_segments(sample_segments, len(audio))
        sample_segments = self._pad_segments(sample_segments, len(audio))
        sample_segments = self._split_long_segments(sample_segments)
        slices = []
        for start, end in sample_segments:
            segment_audio = audio[start:end].copy()
            if len(segment_audio) == 0:
                continue
            rms = np.sqrt(np.mean(segment_audio ** 2))
            peak = np.max(np.abs(segment_audio))
            slices.append(AudioSlice(
                audio=segment_audio,
                start_sample=start,
                end_sample=end,
                start_time=self._sample_to_time(start),
                end_time=self._sample_to_time(end),
                duration=self._sample_to_time(end - start),
                rms=float(rms),
                peak=float(peak),
                has_voice=True,
            ))
        logger.info(f"VAD sliced {len(slices)} segments from {len(audio)/SAMPLE_RATE:.2f}s audio")
        return slices

    def slice_fixed_length(
        self,
        audio: np.ndarray,
        duration: float = 3.0,
        overlap: float = 0.5,
    ) -> List[AudioSlice]:
        """固定长度切片"""
        if len(audio) == 0:
            return []
        slice_samples = int(duration * SAMPLE_RATE)
        hop_samples = int((duration - overlap) * SAMPLE_RATE)
        slices = []
        pos = 0
        while pos < len(audio):
            end = min(pos + slice_samples, len(audio))
            if end - pos < int(0.1 * SAMPLE_RATE):
                break
            segment_audio = audio[pos:end].copy()
            rms = np.sqrt(np.mean(segment_audio ** 2))
            peak = np.max(np.abs(segment_audio))
            has_voice = rms > self.config.energy_threshold
            slices.append(AudioSlice(
                audio=segment_audio,
                start_sample=pos,
                end_sample=end,
                start_time=self._sample_to_time(pos),
                end_time=self._sample_to_time(end),
                duration=self._sample_to_time(end - pos),
                rms=float(rms),
                peak=float(peak),
                has_voice=has_voice,
            ))
            pos += hop_samples
        return slices

    def remove_silence(
        self,
        audio: np.ndarray,
        max_silence_duration: float = 0.5,
    ) -> np.ndarray:
        """移除静音片段"""
        if len(audio) == 0:
            return audio
        self.vad.estimate_noise(audio)
        segments = self.vad.get_voice_segments(audio)
        if not segments:
            logger.warning("No voice activity detected, returning original")
            return audio
        sample_segments = [
            (self._frame_to_sample(s), self._frame_to_sample(e))
            for s, e in segments
        ]
        sample_segments = self._merge_segments(sample_segments, len(audio))
        sample_segments = self._pad_segments(sample_segments, len(audio))
        parts = []
        for start, end in sample_segments:
            parts.append(audio[start:end])
        if not parts:
            return audio
        result = np.concatenate(parts)
        logger.info(f"Removed silence: {len(audio)/SAMPLE_RATE:.2f}s -> {len(result)/SAMPLE_RATE:.2f}s")
        return result

    def get_slices(
        self,
        audio: np.ndarray,
        method: str = "vad",
        **kwargs,
    ) -> List[AudioSlice]:
        """获取音频切片，支持多种方法"""
        method = method.lower()
        if method == "vad":
            return self.slice_by_voice_activity(audio)
        elif method == "fixed":
            return self.slice_fixed_length(audio, **kwargs)
        else:
            raise ValueError(f"Unknown slice method: {method}")

    def slice_with_metadata(
        self,
        audio: np.ndarray,
        method: str = "vad",
        **kwargs,
    ) -> Dict:
        """切片并返回元数据"""
        slices = self.get_slices(audio, method, **kwargs)
        return {
            "total_slices": len(slices),
            "total_duration": sum(s.duration for s in slices),
            "original_duration": len(audio) / SAMPLE_RATE,
            "slices": [
                {
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "duration": s.duration,
                    "rms": s.rms,
                    "peak": s.peak,
                    "has_voice": s.has_voice,
                    "audio": s.audio,
                }
                for s in slices
            ],
        }
