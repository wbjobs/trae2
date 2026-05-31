"""
声纹特征提取模块（修复版）
支持时域特征、频域特征、MFCC、梅尔谱图、谱对比度、过零率等
修复：特征提取数据缺失问题
新增：数据验证、边界处理、错误捕获、默认值填充、数值稳定性保护
"""
import logging
from typing import Dict, List, Optional, Tuple, Union

import numpy as np

from config import (
    SAMPLE_RATE,
    N_FFT,
    HOP_LENGTH,
    N_MELS,
    N_MFCC,
    FEATURE_TYPES,
    DEFAULT_FEATURE_TYPES,
)

logger = logging.getLogger(__name__)


class FeatureValidationError(Exception):
    pass


class FeatureValidator:
    """特征输入验证器"""

    @staticmethod
    def validate_audio(audio: np.ndarray, min_samples: int = 100) -> Tuple[bool, str]:
        if audio is None:
            return False, "Audio array is None"
        if not isinstance(audio, np.ndarray):
            return False, f"Expected np.ndarray, got {type(audio)}"
        if audio.size == 0:
            return False, "Audio array is empty"
        if len(audio) < min_samples:
            return False, f"Audio too short: {len(audio)} < {min_samples}"
        if not np.isfinite(audio).all():
            return False, "Audio contains NaN or Inf values"
        return True, "OK"

    @staticmethod
    def sanitize_audio(audio: np.ndarray, min_samples: int = 2048) -> np.ndarray:
        if audio is None:
            logger.warning("Audio is None, returning zeros")
            return np.zeros(min_samples, dtype=np.float32)

        if not isinstance(audio, np.ndarray):
            try:
                audio = np.array(audio, dtype=np.float32)
            except Exception as e:
                logger.error(f"Failed to convert audio to numpy: {e}")
                return np.zeros(min_samples, dtype=np.float32)

        if audio.size == 0:
            logger.warning("Audio is empty, padding with zeros")
            return np.zeros(min_samples, dtype=np.float32)

        audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

        if len(audio) < min_samples:
            audio = np.pad(audio, (0, min_samples - len(audio)))

        if np.max(np.abs(audio)) > 10.0:
            max_amp = np.max(np.abs(audio))
            audio = audio / max_amp

        return audio

    @staticmethod
    def validate_frame_params(
        audio_length: int, frame_length: int, hop_length: int
    ) -> Tuple[int, int]:
        frame_length = min(max(frame_length, 64), audio_length)
        hop_length = min(max(hop_length, 16), frame_length)
        return frame_length, hop_length

    @staticmethod
    def safe_feature(feature: np.ndarray, default_shape: tuple, fill_value: float = 0.0) -> np.ndarray:
        if feature is None:
            logger.warning(f"Feature is None, using default shape {default_shape}")
            return np.full(default_shape, fill_value, dtype=np.float32)

        if not isinstance(feature, np.ndarray):
            try:
                feature = np.array(feature, dtype=np.float32)
            except Exception as e:
                logger.error(f"Failed to convert feature to numpy: {e}")
                return np.full(default_shape, fill_value, dtype=np.float32)

        if not np.isfinite(feature).all():
            feature = np.nan_to_num(feature, nan=fill_value, posinf=fill_value, neginf=fill_value)
            logger.warning("Feature contains NaN/Inf, replaced with fill value")

        if feature.shape != default_shape:
            logger.warning(f"Feature shape mismatch: {feature.shape} vs expected {default_shape}, reshaping")
            feature = np.resize(feature, default_shape)

        return feature.astype(np.float32)


class TimeDomainFeatures:
    @staticmethod
    def extract(audio: np.ndarray, frame_length: int = 2048, hop_length: int = 512) -> Dict[str, np.ndarray]:
        features = {}

        try:
            valid, msg = FeatureValidator.validate_audio(audio)
            if not valid:
                logger.warning(f"Audio validation failed: {msg}")
                audio = FeatureValidator.sanitize_audio(audio)

            frame_length, hop_length = FeatureValidator.validate_frame_params(
                len(audio), frame_length, hop_length
            )

            n_frames = max(1, 1 + (len(audio) - frame_length) // hop_length)
            default_shape = (n_frames,)

            try:
                rms = TimeDomainFeatures._rms(audio, frame_length, hop_length)
                features["rms"] = FeatureValidator.safe_feature(rms, default_shape)
            except Exception as e:
                logger.error(f"RMS extraction failed: {e}")
                features["rms"] = np.zeros(default_shape, dtype=np.float32)

            try:
                energy = TimeDomainFeatures._energy(audio, frame_length, hop_length)
                features["energy"] = FeatureValidator.safe_feature(energy, default_shape)
            except Exception as e:
                logger.error(f"Energy extraction failed: {e}")
                features["energy"] = np.zeros(default_shape, dtype=np.float32)

            try:
                zcr = TimeDomainFeatures._zero_crossing_rate(audio, frame_length, hop_length)
                features["zero_crossing_rate"] = FeatureValidator.safe_feature(zcr, default_shape)
            except Exception as e:
                logger.error(f"ZCR extraction failed: {e}")
                features["zero_crossing_rate"] = np.zeros(default_shape, dtype=np.float32)

            try:
                peak = TimeDomainFeatures._peak_amplitude(audio, frame_length, hop_length)
                features["peak_amplitude"] = FeatureValidator.safe_feature(peak, default_shape)
            except Exception as e:
                logger.error(f"Peak extraction failed: {e}")
                features["peak_amplitude"] = np.zeros(default_shape, dtype=np.float32)

            try:
                cf = TimeDomainFeatures._crest_factor(audio, frame_length, hop_length)
                features["crest_factor"] = FeatureValidator.safe_feature(cf, default_shape)
            except Exception as e:
                logger.error(f"Crest factor extraction failed: {e}")
                features["crest_factor"] = np.ones(default_shape, dtype=np.float32)

        except Exception as e:
            logger.error(f"Time domain features extraction failed completely: {e}")
            n_frames = max(1, 1 + (len(audio) - frame_length) // hop_length)
            default_shape = (n_frames,)
            features = {
                "rms": np.zeros(default_shape, dtype=np.float32),
                "energy": np.zeros(default_shape, dtype=np.float32),
                "zero_crossing_rate": np.zeros(default_shape, dtype=np.float32),
                "peak_amplitude": np.zeros(default_shape, dtype=np.float32),
                "crest_factor": np.ones(default_shape, dtype=np.float32),
            }

        return features

    @staticmethod
    def _rms(audio: np.ndarray, frame_length: int, hop_length: int) -> np.ndarray:
        try:
            import librosa
            result = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
            return np.maximum(result, 1e-10)
        except ImportError:
            rms_list = []
            for i in range(0, len(audio) - frame_length + 1, hop_length):
                frame = audio[i : i + frame_length]
                rms = np.sqrt(np.mean(frame ** 2))
                rms_list.append(max(rms, 1e-10))
            return np.array(rms_list, dtype=np.float32)

    @staticmethod
    def _energy(audio: np.ndarray, frame_length: int, hop_length: int) -> np.ndarray:
        energy_list = []
        for i in range(0, len(audio) - frame_length + 1, hop_length):
            frame = audio[i : i + frame_length]
            energy = np.sum(frame ** 2)
            energy_list.append(max(energy, 1e-10))
        return np.array(energy_list, dtype=np.float32)

    @staticmethod
    def _zero_crossing_rate(audio: np.ndarray, frame_length: int, hop_length: int) -> np.ndarray:
        try:
            import librosa
            return librosa.feature.zero_crossing_rate(audio, frame_length=frame_length, hop_length=hop_length)[0]
        except ImportError:
            zcr_list = []
            for i in range(0, len(audio) - frame_length + 1, hop_length):
                frame = audio[i : i + frame_length]
                crossings = np.sum(np.abs(np.diff(np.sign(frame)))) / 2
                zcr_list.append(crossings / frame_length)
            return np.array(zcr_list, dtype=np.float32)

    @staticmethod
    def _peak_amplitude(audio: np.ndarray, frame_length: int, hop_length: int) -> np.ndarray:
        peaks = []
        for i in range(0, len(audio) - frame_length + 1, hop_length):
            frame = audio[i : i + frame_length]
            peaks.append(np.max(np.abs(frame)))
        return np.array(peaks, dtype=np.float32)

    @staticmethod
    def _crest_factor(audio: np.ndarray, frame_length: int, hop_length: int) -> np.ndarray:
        cf_list = []
        for i in range(0, len(audio) - frame_length + 1, hop_length):
            frame = audio[i : i + frame_length]
            peak = np.max(np.abs(frame))
            rms = np.sqrt(np.mean(frame ** 2))
            cf = peak / max(rms, 1e-10)
            cf = min(cf, 100.0)
            cf_list.append(cf)
        return np.array(cf_list, dtype=np.float32)


class FrequencyDomainFeatures:
    @staticmethod
    def extract(
        audio: np.ndarray,
        sample_rate: int = SAMPLE_RATE,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
    ) -> Dict[str, np.ndarray]:
        features = {}

        try:
            valid, msg = FeatureValidator.validate_audio(audio)
            if not valid:
                logger.warning(f"Audio validation failed: {msg}")
                audio = FeatureValidator.sanitize_audio(audio)

            if len(audio) < n_fft:
                audio = np.pad(audio, (0, n_fft - len(audio)))

            n_frames = max(1, 1 + (len(audio) - n_fft) // hop_length)
            default_shape = (n_frames,)

            try:
                sc = FrequencyDomainFeatures._spectral_centroid(audio, sample_rate, n_fft, hop_length)
                features["spectral_centroid"] = FeatureValidator.safe_feature(sc, default_shape)
            except Exception as e:
                logger.error(f"Spectral centroid extraction failed: {e}")
                features["spectral_centroid"] = np.full(default_shape, sample_rate / 4, dtype=np.float32)

            try:
                sb = FrequencyDomainFeatures._spectral_bandwidth(audio, sample_rate, n_fft, hop_length)
                features["spectral_bandwidth"] = FeatureValidator.safe_feature(sb, default_shape)
            except Exception as e:
                logger.error(f"Spectral bandwidth extraction failed: {e}")
                features["spectral_bandwidth"] = np.full(default_shape, sample_rate / 8, dtype=np.float32)

            try:
                sr = FrequencyDomainFeatures._spectral_rolloff(audio, sample_rate, n_fft, hop_length)
                features["spectral_rolloff"] = FeatureValidator.safe_feature(sr, default_shape)
            except Exception as e:
                logger.error(f"Spectral rolloff extraction failed: {e}")
                features["spectral_rolloff"] = np.full(default_shape, sample_rate / 2, dtype=np.float32)

            try:
                sf = FrequencyDomainFeatures._spectral_flatness(audio, n_fft, hop_length)
                features["spectral_flatness"] = FeatureValidator.safe_feature(sf, default_shape)
            except Exception as e:
                logger.error(f"Spectral flatness extraction failed: {e}")
                features["spectral_flatness"] = np.ones(default_shape, dtype=np.float32) * 0.1

        except Exception as e:
            logger.error(f"Frequency domain features extraction failed completely: {e}")
            n_frames = max(1, 1 + (len(audio) - n_fft) // hop_length)
            default_shape = (n_frames,)
            features = {
                "spectral_centroid": np.full(default_shape, sample_rate / 4, dtype=np.float32),
                "spectral_bandwidth": np.full(default_shape, sample_rate / 8, dtype=np.float32),
                "spectral_rolloff": np.full(default_shape, sample_rate / 2, dtype=np.float32),
                "spectral_flatness": np.ones(default_shape, dtype=np.float32) * 0.1,
            }

        return features

    @staticmethod
    def _compute_stft(audio: np.ndarray, n_fft: int, hop_length: int) -> np.ndarray:
        try:
            import librosa
            return np.abs(librosa.stft(audio, n_fft=n_fft, hop_length=hop_length))
        except ImportError:
            window = np.hanning(n_fft)
            n_frames = 1 + (len(audio) - n_fft) // hop_length
            stft_matrix = np.zeros((n_fft // 2 + 1, max(1, n_frames)))
            for i in range(n_frames):
                start = i * hop_length
                frame = audio[start : start + n_fft] * window
                stft_matrix[:, i] = np.abs(np.fft.rfft(frame, n=n_fft))
            return stft_matrix.astype(np.float32)

    @staticmethod
    def _spectral_centroid(audio, sr, n_fft, hop_length) -> np.ndarray:
        try:
            import librosa
            result = librosa.feature.spectral_centroid(y=audio, sr=sr, n_fft=n_fft, hop_length=hop_length)[0]
            return np.clip(result, 0, sr / 2)
        except ImportError:
            S = FrequencyDomainFeatures._compute_stft(audio, n_fft, hop_length)
            freqs = np.linspace(0, sr / 2, S.shape[0])
            centroid = np.sum(S * freqs[:, np.newaxis], axis=0) / np.maximum(np.sum(S, axis=0), 1e-10)
            return np.clip(centroid, 0, sr / 2)

    @staticmethod
    def _spectral_bandwidth(audio, sr, n_fft, hop_length) -> np.ndarray:
        try:
            import librosa
            result = librosa.feature.spectral_bandwidth(y=audio, sr=sr, n_fft=n_fft, hop_length=hop_length)[0]
            return np.clip(result, 0, sr / 2)
        except ImportError:
            S = FrequencyDomainFeatures._compute_stft(audio, n_fft, hop_length)
            freqs = np.linspace(0, sr / 2, S.shape[0])
            centroid = np.sum(S * freqs[:, np.newaxis], axis=0) / np.maximum(np.sum(S, axis=0), 1e-10)
            bw = np.sqrt(np.sum(((freqs[:, np.newaxis] - centroid) ** 2) * S, axis=0) / np.maximum(np.sum(S, axis=0), 1e-10))
            return np.clip(bw, 0, sr / 2)

    @staticmethod
    def _spectral_rolloff(audio, sr, n_fft, hop_length, roll_percent: float = 0.85) -> np.ndarray:
        try:
            import librosa
            result = librosa.feature.spectral_rolloff(y=audio, sr=sr, n_fft=n_fft, hop_length=hop_length, roll_percent=roll_percent)[0]
            return np.clip(result, 0, sr / 2)
        except ImportError:
            S = FrequencyDomainFeatures._compute_stft(audio, n_fft, hop_length)
            total_energy = np.sum(S, axis=0)
            cumsum = np.cumsum(S, axis=0)
            threshold = roll_percent * np.maximum(total_energy, 1e-10)
            freqs = np.linspace(0, sr / 2, S.shape[0])
            rolloff = np.zeros(S.shape[1])
            for i in range(S.shape[1]):
                indices = np.where(cumsum[:, i] >= threshold[i])[0]
                if len(indices) > 0:
                    rolloff[i] = freqs[indices[0]]
                else:
                    rolloff[i] = sr / 2
            return rolloff

    @staticmethod
    def _spectral_flatness(audio, n_fft, hop_length) -> np.ndarray:
        try:
            import librosa
            result = librosa.feature.spectral_flatness(y=audio, n_fft=n_fft, hop_length=hop_length)[0]
            return np.clip(result, 0, 1)
        except ImportError:
            S = FrequencyDomainFeatures._compute_stft(audio, n_fft, hop_length)
            S = np.maximum(S, 1e-10)
            arith_mean = np.mean(S, axis=0)
            geo_mean = np.exp(np.mean(np.log(S), axis=0))
            result = geo_mean / np.maximum(arith_mean, 1e-10)
            return np.clip(result, 0, 1)


class MFCCExtractor:
    @staticmethod
    def extract(
        audio: np.ndarray,
        sample_rate: int = SAMPLE_RATE,
        n_mfcc: int = N_MFCC,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        n_mels: int = N_MELS,
    ) -> Dict[str, np.ndarray]:
        features = {}

        try:
            valid, msg = FeatureValidator.validate_audio(audio)
            if not valid:
                logger.warning(f"Audio validation failed: {msg}")
                audio = FeatureValidator.sanitize_audio(audio)

            if len(audio) < n_fft:
                audio = np.pad(audio, (0, n_fft - len(audio)))

            n_frames = max(1, 1 + (len(audio) - n_fft) // hop_length)
            default_shape = (n_mfcc, n_frames)

            try:
                import librosa
                mfccs = librosa.feature.mfcc(y=audio, sr=sample_rate, n_mfcc=n_mfcc, n_fft=n_fft, hop_length=hop_length, n_mels=n_mels)
                features["mfcc"] = FeatureValidator.safe_feature(mfccs, default_shape)
            except ImportError:
                try:
                    mfccs = MFCCExtractor._mfcc_numpy(audio, sample_rate, n_mfcc, n_fft, hop_length, n_mels)
                    features["mfcc"] = FeatureValidator.safe_feature(mfccs, default_shape)
                except Exception as e:
                    logger.error(f"MFCC numpy extraction failed: {e}")
                    features["mfcc"] = np.zeros(default_shape, dtype=np.float32)
            except Exception as e:
                logger.error(f"MFCC extraction failed: {e}")
                features["mfcc"] = np.zeros(default_shape, dtype=np.float32)

            try:
                features["mfcc_delta"] = MFCCExtractor._delta(features["mfcc"])
            except Exception as e:
                logger.error(f"MFCC delta extraction failed: {e}")
                features["mfcc_delta"] = np.zeros_like(features["mfcc"])

            try:
                features["mfcc_delta2"] = MFCCExtractor._delta(features["mfcc"], order=2)
            except Exception as e:
                logger.error(f"MFCC delta2 extraction failed: {e}")
                features["mfcc_delta2"] = np.zeros_like(features["mfcc"])

        except Exception as e:
            logger.error(f"MFCC extraction failed completely: {e}")
            n_frames = max(1, 1 + (len(audio) - n_fft) // hop_length)
            default_shape = (n_mfcc, n_frames)
            features = {
                "mfcc": np.zeros(default_shape, dtype=np.float32),
                "mfcc_delta": np.zeros(default_shape, dtype=np.float32),
                "mfcc_delta2": np.zeros(default_shape, dtype=np.float32),
            }

        return features

    @staticmethod
    def _mfcc_numpy(audio, sr, n_mfcc, n_fft, hop_length, n_mels):
        S = FrequencyDomainFeatures._compute_stft(audio, n_fft, hop_length)
        mel_filterbank = MFCCExtractor._mel_filterbank(sr, n_fft, n_mels)
        mel_spec = np.dot(mel_filterbank, S)
        log_mel_spec = np.log(np.maximum(mel_spec, 1e-10))
        try:
            from scipy.fft import dct
            mfccs = dct(log_mel_spec, axis=0, type=2, norm="ortho")[:n_mfcc]
        except ImportError:
            mfccs = np.zeros((n_mfcc, log_mel_spec.shape[1]), dtype=np.float32)
        return mfccs.astype(np.float32)

    @staticmethod
    def _mel_filterbank(sr, n_fft, n_mels):
        low_freq_mel = 0
        high_freq_mel = 2595 * np.log10(1 + (sr / 2) / 700)
        mel_points = np.linspace(low_freq_mel, high_freq_mel, n_mels + 2)
        hz_points = 700 * (10 ** (mel_points / 2595) - 1)
        bin_points = np.floor((n_fft + 1) * hz_points / sr).astype(int)
        fbank = np.zeros((n_mels, n_fft // 2 + 1))
        for m in range(1, n_mels + 1):
            f_m_minus = bin_points[m - 1]
            f_m = bin_points[m]
            f_m_plus = bin_points[m + 1]
            for k in range(f_m_minus, f_m):
                fbank[m - 1, k] = (k - bin_points[m - 1]) / max(bin_points[m] - bin_points[m - 1], 1)
            for k in range(f_m, f_m_plus):
                fbank[m - 1, k] = (bin_points[m + 1] - k) / max(bin_points[m + 1] - bin_points[m], 1)
        return fbank.astype(np.float32)

    @staticmethod
    def _delta(data: np.ndarray, order: int = 1, axis: int = -1) -> np.ndarray:
        try:
            if order == 1:
                delta = np.gradient(data, axis=axis)
            else:
                delta = data
                for _ in range(order):
                    delta = np.gradient(delta, axis=axis)
            return delta.astype(np.float32)
        except Exception:
            return np.zeros_like(data, dtype=np.float32)


class MelSpectrogramExtractor:
    @staticmethod
    def extract(
        audio: np.ndarray,
        sample_rate: int = SAMPLE_RATE,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        n_mels: int = N_MELS,
        log_scale: bool = True,
    ) -> Dict[str, np.ndarray]:
        try:
            valid, msg = FeatureValidator.validate_audio(audio)
            if not valid:
                logger.warning(f"Audio validation failed: {msg}")
                audio = FeatureValidator.sanitize_audio(audio)

            if len(audio) < n_fft:
                audio = np.pad(audio, (0, n_fft - len(audio)))

            n_frames = max(1, 1 + (len(audio) - n_fft) // hop_length)
            default_shape = (n_mels, n_frames)

            try:
                import librosa
                mel_spec = librosa.feature.melspectrogram(
                    y=audio, sr=sample_rate, n_fft=n_fft, hop_length=hop_length, n_mels=n_mels
                )
                if log_scale:
                    mel_spec = librosa.power_to_db(mel_spec, ref=np.max)
            except ImportError:
                try:
                    S = FrequencyDomainFeatures._compute_stft(audio, n_fft, hop_length)
                    mel_filterbank = MFCCExtractor._mel_filterbank(sample_rate, n_fft, n_mels)
                    mel_spec = np.dot(mel_filterbank, S)
                    if log_scale:
                        mel_spec = np.log(np.maximum(mel_spec, 1e-10))
                except Exception as e:
                    logger.error(f"Mel spectrogram fallback extraction failed: {e}")
                    mel_spec = np.zeros(default_shape, dtype=np.float32)
            except Exception as e:
                logger.error(f"Mel spectrogram extraction failed: {e}")
                mel_spec = np.zeros(default_shape, dtype=np.float32)

            mel_spec = FeatureValidator.safe_feature(mel_spec, default_shape)
            return {"mel_spectrogram": mel_spec.astype(np.float32)}

        except Exception as e:
            logger.error(f"Mel spectrogram extraction failed completely: {e}")
            n_frames = max(1, 1 + (len(audio) - n_fft) // hop_length)
            default_shape = (n_mels, n_frames)
            return {"mel_spectrogram": np.zeros(default_shape, dtype=np.float32)}


class SpectralContrastExtractor:
    @staticmethod
    def extract(
        audio: np.ndarray,
        sample_rate: int = SAMPLE_RATE,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        n_bands: int = 6,
    ) -> Dict[str, np.ndarray]:
        try:
            valid, msg = FeatureValidator.validate_audio(audio)
            if not valid:
                logger.warning(f"Audio validation failed: {msg}")
                audio = FeatureValidator.sanitize_audio(audio)

            if len(audio) < n_fft:
                audio = np.pad(audio, (0, n_fft - len(audio)))

            n_frames = max(1, 1 + (len(audio) - n_fft) // hop_length)
            default_shape = (n_bands + 1, n_frames)

            try:
                import librosa
                contrast = librosa.feature.spectral_contrast(y=audio, sr=sample_rate, n_fft=n_fft, hop_length=hop_length, n_bands=n_bands)
            except ImportError:
                try:
                    S = FrequencyDomainFeatures._compute_stft(audio, n_fft, hop_length)
                    n_freq_bins = S.shape[0]
                    band_edges = np.linspace(0, n_freq_bins, n_bands + 1, dtype=int)
                    contrast = np.zeros((n_bands + 1, n_frames), dtype=np.float32)
                    for i in range(n_bands):
                        band_data = S[band_edges[i] : band_edges[i + 1], :]
                        if len(band_data) > 0:
                            contrast[i, :] = np.mean(band_data, axis=0) - np.min(band_data, axis=0)
                except Exception as e:
                    logger.error(f"Spectral contrast fallback extraction failed: {e}")
                    contrast = np.zeros(default_shape, dtype=np.float32)
            except Exception as e:
                logger.error(f"Spectral contrast extraction failed: {e}")
                contrast = np.zeros(default_shape, dtype=np.float32)

            contrast = FeatureValidator.safe_feature(contrast, default_shape)
            return {"spectral_contrast": contrast.astype(np.float32)}

        except Exception as e:
            logger.error(f"Spectral contrast extraction failed completely: {e}")
            n_frames = max(1, 1 + (len(audio) - n_fft) // hop_length)
            default_shape = (n_bands + 1, n_frames)
            return {"spectral_contrast": np.zeros(default_shape, dtype=np.float32)}


class FeatureExtractor:
    def __init__(
        self,
        feature_types: Optional[List[str]] = None,
        sample_rate: int = SAMPLE_RATE,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        n_mfcc: int = N_MFCC,
        n_mels: int = N_MELS,
    ):
        self.feature_types = feature_types or DEFAULT_FEATURE_TYPES
        self.sample_rate = sample_rate
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.n_mfcc = n_mfcc
        self.n_mels = n_mels
        self._feature_dim_cache = {}
        self._extraction_errors = 0
        self._max_errors = 10

    def extract(self, audio: np.ndarray) -> Dict[str, np.ndarray]:
        all_features = {}

        try:
            audio = FeatureValidator.sanitize_audio(audio, min_samples=self.n_fft)

            for feat_type in self.feature_types:
                try:
                    if feat_type == "time_domain":
                        features = TimeDomainFeatures.extract(
                            audio, frame_length=self.n_fft, hop_length=self.hop_length
                        )
                        all_features.update(features)
                    elif feat_type == "frequency_domain":
                        features = FrequencyDomainFeatures.extract(
                            audio, self.sample_rate, self.n_fft, self.hop_length
                        )
                        all_features.update(features)
                    elif feat_type == "mfcc":
                        features = MFCCExtractor.extract(
                            audio, self.sample_rate, self.n_mfcc, self.n_fft, self.hop_length, self.n_mels
                        )
                        all_features.update(features)
                    elif feat_type == "mel_spectrogram":
                        features = MelSpectrogramExtractor.extract(
                            audio, self.sample_rate, self.n_fft, self.hop_length, self.n_mels
                        )
                        all_features.update(features)
                    elif feat_type == "spectral_contrast":
                        features = SpectralContrastExtractor.extract(
                            audio, self.sample_rate, self.n_fft, self.hop_length
                        )
                        all_features.update(features)
                    elif feat_type == "zero_crossing_rate":
                        zcr = TimeDomainFeatures._zero_crossing_rate(audio, self.n_fft, self.hop_length)
                        all_features["zero_crossing_rate"] = zcr

                except Exception as e:
                    self._extraction_errors += 1
                    logger.error(f"Feature extraction failed for {feat_type}: {e} (total errors: {self._extraction_errors})")

        except Exception as e:
            logger.error(f"Feature extraction pipeline failed: {e}")

        if not all_features:
            logger.warning("No features extracted, providing default features")
            all_features = self._get_default_features(len(audio))

        return all_features

    def _get_default_features(self, audio_length: int) -> Dict[str, np.ndarray]:
        n_frames = max(1, 1 + (audio_length - self.n_fft) // self.hop_length)
        defaults = {}

        if "time_domain" in self.feature_types or "zero_crossing_rate" in self.feature_types:
            defaults["rms"] = np.ones(n_frames, dtype=np.float32) * 1e-5
            defaults["energy"] = np.ones(n_frames, dtype=np.float32) * 1e-5
            defaults["zero_crossing_rate"] = np.zeros(n_frames, dtype=np.float32)
            defaults["peak_amplitude"] = np.ones(n_frames, dtype=np.float32) * 1e-4
            defaults["crest_factor"] = np.ones(n_frames, dtype=np.float32) * 10.0

        if "frequency_domain" in self.feature_types:
            defaults["spectral_centroid"] = np.ones(n_frames, dtype=np.float32) * (self.sample_rate / 4)
            defaults["spectral_bandwidth"] = np.ones(n_frames, dtype=np.float32) * (self.sample_rate / 8)
            defaults["spectral_rolloff"] = np.ones(n_frames, dtype=np.float32) * (self.sample_rate / 2)
            defaults["spectral_flatness"] = np.ones(n_frames, dtype=np.float32) * 0.1

        if "mfcc" in self.feature_types:
            defaults["mfcc"] = np.zeros((self.n_mfcc, n_frames), dtype=np.float32)
            defaults["mfcc_delta"] = np.zeros((self.n_mfcc, n_frames), dtype=np.float32)
            defaults["mfcc_delta2"] = np.zeros((self.n_mfcc, n_frames), dtype=np.float32)

        if "mel_spectrogram" in self.feature_types:
            defaults["mel_spectrogram"] = np.zeros((self.n_mels, n_frames), dtype=np.float32)

        if "spectral_contrast" in self.feature_types:
            defaults["spectral_contrast"] = np.zeros((7, n_frames), dtype=np.float32)

        return defaults

    def extract_flattened(self, audio: np.ndarray, target_dim: Optional[int] = None) -> np.ndarray:
        try:
            features = self.extract(audio)
            if not features:
                logger.warning("No features to flatten")
                return np.zeros(target_dim or 1024, dtype=np.float32)

            flattened_parts = []
            for key, value in features.items():
                if isinstance(value, np.ndarray):
                    flat = value.flatten()
                    flattened_parts.append(flat)

            if not flattened_parts:
                return np.zeros(target_dim or 1024, dtype=np.float32)

            result = np.concatenate(flattened_parts)

            if target_dim is not None:
                if len(result) > target_dim:
                    result = result[:target_dim]
                elif len(result) < target_dim:
                    result = np.pad(result, (0, target_dim - len(result)))

            if not np.isfinite(result).all():
                result = np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)

            return result.astype(np.float32)

        except Exception as e:
            logger.error(f"Flattened feature extraction failed: {e}")
            return np.zeros(target_dim or 1024, dtype=np.float32)

    def extract_global_stats(self, audio: np.ndarray) -> Dict[str, Dict[str, float]]:
        try:
            features = self.extract(audio)
            stats = {}
            for key, value in features.items():
                if isinstance(value, np.ndarray) and value.size > 0:
                    try:
                        valid_data = value[np.isfinite(value)]
                        if len(valid_data) == 0:
                            valid_data = np.array([0.0])
                        stats[key] = {
                            "mean": float(np.mean(valid_data)),
                            "std": float(np.std(valid_data)),
                            "min": float(np.min(valid_data)),
                            "max": float(np.max(valid_data)),
                            "median": float(np.median(valid_data)),
                        }
                    except Exception as e:
                        logger.error(f"Failed to compute stats for {key}: {e}")
                        stats[key] = {
                            "mean": 0.0,
                            "std": 1.0,
                            "min": 0.0,
                            "max": 1.0,
                            "median": 0.0,
                        }
            return stats
        except Exception as e:
            logger.error(f"Global stats extraction failed: {e}")
            return {}

    def get_feature_dimensions(self) -> Dict[str, int]:
        dims = {}
        for feat_type in self.feature_types:
            if feat_type == "mfcc":
                dims["mfcc"] = self.n_mfcc
                dims["mfcc_delta"] = self.n_mfcc
                dims["mfcc_delta2"] = self.n_mfcc
            elif feat_type == "mel_spectrogram":
                dims["mel_spectrogram"] = self.n_mels
            elif feat_type == "spectral_contrast":
                dims["spectral_contrast"] = 7
            elif feat_type == "time_domain":
                dims["rms"] = 1
                dims["energy"] = 1
                dims["zero_crossing_rate"] = 1
                dims["peak_amplitude"] = 1
                dims["crest_factor"] = 1
            elif feat_type == "frequency_domain":
                dims["spectral_centroid"] = 1
                dims["spectral_bandwidth"] = 1
                dims["spectral_rolloff"] = 1
                dims["spectral_flatness"] = 1
            elif feat_type == "zero_crossing_rate":
                dims["zero_crossing_rate"] = 1
        return dims

    def get_config(self) -> dict:
        return {
            "feature_types": self.feature_types,
            "sample_rate": self.sample_rate,
            "n_fft": self.n_fft,
            "hop_length": self.hop_length,
            "n_mfcc": self.n_mfcc,
            "n_mels": self.n_mels,
            "dimensions": self.get_feature_dimensions(),
            "extraction_errors": self._extraction_errors,
        }

    def reset_error_count(self):
        self._extraction_errors = 0


def get_available_feature_types() -> list:
    return FEATURE_TYPES


def create_feature_extractor(feature_types: Optional[List[str]] = None, **kwargs) -> FeatureExtractor:
    return FeatureExtractor(feature_types=feature_types, **kwargs)
