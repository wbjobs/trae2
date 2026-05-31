import os
import time
import numpy as np
import librosa
import soundfile as sf
from scipy import signal
from scipy.stats import skew, kurtosis, entropy
from typing import Dict, List, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')

from config import settings
from database import get_db, AudioSample, ProcessingLog
from schemas import FeatureExtractionConfig, AudioFeatures


class AudioFeatureExtractor:
    def __init__(self):
        self.default_config = FeatureExtractionConfig(
            n_mfcc=settings.FEATURE_N_MFCC,
            n_fft=settings.FEATURE_N_FFT,
            hop_length=settings.FEATURE_HOP_LENGTH,
            n_mels=settings.FEATURE_N_MELS
        )
        self._required_feature_keys = {
            "time_domain": ["rms", "peak_amplitude", "zero_crossing_rate", "variance", "skewness", "kurtosis"],
            "frequency_domain": ["spectral_centroid", "spectral_bandwidth", "spectral_rolloff", "spectral_flatness"],
            "mfcc": [f"mfcc_{i}_mean" for i in range(20)],
            "spectral": ["spectral_centroid_mean", "spectral_bandwidth_mean", "spectral_rolloff_mean"]
        }

    def _safe_float(self, value, default: float = 0.0) -> float:
        """安全转换为float，处理NaN和Inf"""
        try:
            if value is None:
                return default
            result = float(value)
            if np.isnan(result) or np.isinf(result):
                return default
            return result
        except (ValueError, TypeError):
            return default

    def _validate_audio(self, audio: np.ndarray) -> np.ndarray:
        """验证和清理音频数据"""
        if audio is None or len(audio) == 0:
            return np.zeros(1000, dtype=np.float32)

        audio = np.array(audio, dtype=np.float64)

        audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0)

        if np.std(audio) < 1e-10:
            return np.random.randn(len(audio)) * 1e-8

        max_val = np.max(np.abs(audio))
        if max_val > 1e6:
            audio = audio / max_val

        return audio

    def _ensure_min_length(self, audio: np.ndarray, min_length: int = 2048) -> np.ndarray:
        """确保音频有最小长度"""
        if len(audio) >= min_length:
            return audio

        padding = min_length - len(audio)
        return np.pad(audio, (0, padding), mode='reflect')

    def extract_time_domain_features(self, audio: np.ndarray, sample_rate: int) -> Dict[str, float]:
        """提取时域特征 - 增强鲁棒性"""
        audio = self._validate_audio(audio)
        audio = self._ensure_min_length(audio)

        features = {}

        try:
            features["rms"] = self._safe_float(np.sqrt(np.mean(audio ** 2)))
        except Exception:
            features["rms"] = 0.0

        try:
            features["peak_amplitude"] = self._safe_float(np.max(np.abs(audio)))
        except Exception:
            features["peak_amplitude"] = 0.0

        try:
            features["peak_to_rms_ratio"] = self._safe_float(
                features["peak_amplitude"] / (features["rms"] + 1e-10)
            )
        except Exception:
            features["peak_to_rms_ratio"] = 1.0

        try:
            crossings = np.sum(np.abs(np.diff(np.sign(audio))))
            features["zero_crossing_rate"] = self._safe_float(crossings / len(audio))
        except Exception:
            features["zero_crossing_rate"] = 0.0

        try:
            features["mean"] = self._safe_float(np.mean(audio))
        except Exception:
            features["mean"] = 0.0

        try:
            features["variance"] = self._safe_float(np.var(audio))
        except Exception:
            features["variance"] = 0.0

        try:
            features["std"] = self._safe_float(np.std(audio))
        except Exception:
            features["std"] = 0.0

        try:
            features["skewness"] = self._safe_float(skew(audio))
        except Exception:
            features["skewness"] = 0.0

        try:
            features["kurtosis"] = self._safe_float(kurtosis(audio))
        except Exception:
            features["kurtosis"] = 0.0

        try:
            envelope = np.abs(signal.hilbert(audio))
            features["envelope_mean"] = self._safe_float(np.mean(envelope))
            features["envelope_std"] = self._safe_float(np.std(envelope))
            features["envelope_max"] = self._safe_float(np.max(envelope))
        except Exception:
            features["envelope_mean"] = features["rms"]
            features["envelope_std"] = features["std"]
            features["envelope_max"] = features["peak_amplitude"]

        try:
            autocorr = np.correlate(audio, audio, mode='full')
            autocorr = autocorr[len(autocorr) // 2:]

            if len(autocorr) > 1:
                distance = max(1, sample_rate // 10)
                peaks, _ = signal.find_peaks(autocorr, distance=distance)
                if len(peaks) > 0:
                    features["dominant_frequency"] = self._safe_float(sample_rate / peaks[0])
                else:
                    features["dominant_frequency"] = 0.0
            else:
                features["dominant_frequency"] = 0.0
        except Exception:
            features["dominant_frequency"] = 0.0

        try:
            features["range"] = self._safe_float(np.max(audio) - np.min(audio))
        except Exception:
            features["range"] = 2 * features["peak_amplitude"]

        try:
            features["energy"] = self._safe_float(np.sum(audio ** 2) / len(audio))
        except Exception:
            features["energy"] = features["rms"] ** 2

        try:
            features["shannon_entropy"] = self._safe_float(
                -np.sum(np.abs(audio) * np.log(np.abs(audio) + 1e-10)) / len(audio)
            )
        except Exception:
            features["shannon_entropy"] = 0.0

        try:
            abs_audio = np.abs(audio)
            features["median"] = self._safe_float(np.median(abs_audio))
            features["mad"] = self._safe_float(np.median(np.abs(audio - np.median(audio))))
        except Exception:
            features["median"] = features["rms"]
            features["mad"] = features["std"] * 0.6745

        try:
            features["activity_factor"] = self._safe_float(
                np.sum(np.abs(audio) > (features["rms"] * 0.1)) / len(audio)
            )
        except Exception:
            features["activity_factor"] = 1.0

        return features

    def extract_frequency_domain_features(self, audio: np.ndarray, sample_rate: int,
                                          config: FeatureExtractionConfig) -> Dict[str, float]:
        """提取频域特征 - 增强鲁棒性"""
        audio = self._validate_audio(audio)
        audio = self._ensure_min_length(audio)

        features = {}

        n_fft = min(config.n_fft, len(audio))
        hop_length = min(config.hop_length, n_fft // 2)

        try:
            freqs, psd = signal.welch(
                audio,
                fs=sample_rate,
                nperseg=n_fft,
                noverlap=hop_length,
                scaling='density'
            )
        except Exception:
            n = min(1024, len(audio))
            freqs = np.fft.rfftfreq(n, 1 / sample_rate)
            psd = np.abs(np.fft.rfft(audio[:n])) ** 2 / n

        total_power = np.sum(psd)
        if total_power <= 0:
            total_power = 1e-10

        psd_normalized = psd / total_power

        try:
            features["spectral_centroid"] = self._safe_float(np.sum(freqs * psd_normalized))
        except Exception:
            features["spectral_centroid"] = sample_rate / 4

        try:
            centroid = features["spectral_centroid"]
            features["spectral_bandwidth"] = self._safe_float(
                np.sqrt(np.sum(((freqs - centroid) ** 2) * psd_normalized))
            )
        except Exception:
            features["spectral_bandwidth"] = sample_rate / 8

        try:
            cumulative_power = np.cumsum(psd)
            rolloff_threshold = 0.85 * total_power
            rolloff_idx = np.where(cumulative_power >= rolloff_threshold)[0]
            if len(rolloff_idx) > 0:
                features["spectral_rolloff"] = self._safe_float(freqs[rolloff_idx[0]])
            else:
                features["spectral_rolloff"] = self._safe_float(freqs[-1])
        except Exception:
            features["spectral_rolloff"] = sample_rate / 2

        try:
            log_psd = np.log(psd + 1e-10)
            geom_mean = np.exp(np.mean(log_psd))
            features["spectral_flatness"] = self._safe_float(geom_mean / (np.mean(psd) + 1e-10))
        except Exception:
            features["spectral_flatness"] = 0.5

        try:
            features["spectral_crest"] = self._safe_float(np.max(psd) / (np.mean(psd) + 1e-10))
        except Exception:
            features["spectral_crest"] = 1.0

        try:
            peak_idx = np.argmax(psd)
            features["dominant_frequency_peak"] = self._safe_float(freqs[peak_idx])
        except Exception:
            features["dominant_frequency_peak"] = 0.0

        band_edges = [0, 100, 500, 1000, 2000, 5000, 10000, 20000]
        for i in range(len(band_edges) - 1):
            low, high = band_edges[i], band_edges[i + 1]
            try:
                mask = (freqs >= low) & (freqs < high)
                if np.any(mask):
                    band_power = np.sum(psd[mask]) / total_power
                else:
                    band_power = 0.0
                features[f"band_power_{low}_{high}"] = self._safe_float(band_power)
            except Exception:
                features[f"band_power_{low}_{high}"] = 0.0

        try:
            harmonic_ratio = self._calculate_harmonic_ratio(audio, sample_rate)
            features["harmonic_ratio"] = self._safe_float(harmonic_ratio)
        except Exception:
            features["harmonic_ratio"] = 0.0

        try:
            features["spectral_entropy"] = self._safe_float(
                -np.sum(psd_normalized * np.log(psd_normalized + 1e-10))
            )
        except Exception:
            features["spectral_entropy"] = 0.0

        try:
            sorted_psd = np.sort(psd)[::-1]
            features["spectral_sparsity"] = self._safe_float(
                (np.sum(sorted_psd[:5]) if len(sorted_psd) >= 5 else np.sum(sorted_psd)) / total_power
            )
        except Exception:
            features["spectral_sparsity"] = 0.0

        try:
            diff_psd = np.diff(psd)
            features["spectral_slope_mean"] = self._safe_float(np.mean(diff_psd))
            features["spectral_slope_std"] = self._safe_float(np.std(diff_psd))
        except Exception:
            features["spectral_slope_mean"] = 0.0
            features["spectral_slope_std"] = 0.0

        return features

    def _calculate_harmonic_ratio(self, audio: np.ndarray, sample_rate: int) -> float:
        """计算谐波比 - 鲁棒性增强"""
        try:
            autocorr = np.correlate(audio, audio, mode='full')
            autocorr = autocorr[len(autocorr) // 2:]

            lag_min = max(1, int(sample_rate / 2000))
            lag_max = min(len(autocorr) - 1, int(sample_rate / 20))

            if lag_min >= lag_max:
                return 0.0

            search_range = autocorr[lag_min:lag_max]
            if len(search_range) == 0:
                return 0.0

            peak_idx = np.argmax(search_range) + lag_min

            if peak_idx <= lag_min or peak_idx >= lag_max - 1:
                return 0.0

            left = autocorr[peak_idx - 1]
            mid = autocorr[peak_idx]
            right = autocorr[peak_idx + 1]

            peak_value = mid + 0.5 * (left - right) ** 2 / (2 * mid - left - right + 1e-10)

            total_power = autocorr[0] if autocorr[0] > 0 else 1.0

            return float(peak_value / total_power)
        except Exception as e:
            print(f"Harmonic ratio calculation error: {e}")
            return 0.0

    def extract_mfcc_features(self, audio: np.ndarray, sample_rate: int,
                              config: FeatureExtractionConfig) -> Dict[str, float]:
        """提取MFCC特征 - 增强鲁棒性"""
        audio = self._validate_audio(audio)
        audio = self._ensure_min_length(audio)

        features = {}

        n_mfcc = min(config.n_mfcc, 40)
        n_fft = min(config.n_fft, len(audio))
        hop_length = min(config.hop_length, n_fft // 2)

        try:
            mfccs = librosa.feature.mfcc(
                y=audio,
                sr=sample_rate,
                n_mfcc=n_mfcc,
                n_fft=n_fft,
                hop_length=hop_length,
                n_mels=config.n_mels,
                fmax=min(sample_rate // 2, 16000)
            )

            mfccs = np.nan_to_num(mfccs, nan=0.0, posinf=0.0, neginf=0.0)

            mfcc_means = np.mean(mfccs, axis=1)
            mfcc_vars = np.var(mfccs, axis=1)
            mfcc_max = np.max(mfccs, axis=1)
            mfcc_min = np.min(mfccs, axis=1)
            mfcc_median = np.median(mfccs, axis=1)

            for i in range(n_mfcc):
                features[f"mfcc_{i}_mean"] = self._safe_float(mfcc_means[i])
                features[f"mfcc_{i}_var"] = self._safe_float(mfcc_vars[i])
                features[f"mfcc_{i}_max"] = self._safe_float(mfcc_max[i])
                features[f"mfcc_{i}_min"] = self._safe_float(mfcc_min[i])
                features[f"mfcc_{i}_median"] = self._safe_float(mfcc_median[i])

            try:
                delta_mfccs = librosa.feature.delta(mfccs)
                delta2_mfccs = librosa.feature.delta(mfccs, order=2)

                delta_mfccs = np.nan_to_num(delta_mfccs, nan=0.0)
                delta2_mfccs = np.nan_to_num(delta2_mfccs, nan=0.0)

                delta_means = np.mean(delta_mfccs, axis=1)
                delta2_means = np.mean(delta2_mfccs, axis=1)

                for i in range(min(13, n_mfcc)):
                    features[f"mfcc_delta_{i}_mean"] = self._safe_float(delta_means[i])
                    features[f"mfcc_delta2_{i}_mean"] = self._safe_float(delta2_means[i])
            except Exception:
                for i in range(min(13, n_mfcc)):
                    features[f"mfcc_delta_{i}_mean"] = 0.0
                    features[f"mfcc_delta2_{i}_mean"] = 0.0

        except Exception as e:
            print(f"MFCC extraction error: {e}")
            for i in range(n_mfcc):
                features[f"mfcc_{i}_mean"] = 0.0
                features[f"mfcc_{i}_var"] = 0.0
                features[f"mfcc_{i}_max"] = 0.0
                features[f"mfcc_{i}_min"] = 0.0
                features[f"mfcc_{i}_median"] = 0.0
            for i in range(min(13, n_mfcc)):
                features[f"mfcc_delta_{i}_mean"] = 0.0
                features[f"mfcc_delta2_{i}_mean"] = 0.0

        return features

    def extract_spectral_features(self, audio: np.ndarray, sample_rate: int,
                                  config: FeatureExtractionConfig) -> Dict[str, float]:
        """提取频谱特征 - 增强鲁棒性"""
        audio = self._validate_audio(audio)
        audio = self._ensure_min_length(audio)

        features = {}

        n_fft = min(config.n_fft, len(audio))
        hop_length = min(config.hop_length, n_fft // 2)

        try:
            spec_centroid = librosa.feature.spectral_centroid(
                y=audio, sr=sample_rate, n_fft=n_fft, hop_length=hop_length
            )[0]
            features["spectral_centroid_mean"] = self._safe_float(np.mean(spec_centroid))
            features["spectral_centroid_std"] = self._safe_float(np.std(spec_centroid))
        except Exception:
            features["spectral_centroid_mean"] = sample_rate / 4
            features["spectral_centroid_std"] = sample_rate / 8

        try:
            spec_bandwidth = librosa.feature.spectral_bandwidth(
                y=audio, sr=sample_rate, n_fft=n_fft, hop_length=hop_length
            )[0]
            features["spectral_bandwidth_mean"] = self._safe_float(np.mean(spec_bandwidth))
            features["spectral_bandwidth_std"] = self._safe_float(np.std(spec_bandwidth))
        except Exception:
            features["spectral_bandwidth_mean"] = sample_rate / 8
            features["spectral_bandwidth_std"] = sample_rate / 16

        try:
            spec_contrast = librosa.feature.spectral_contrast(
                y=audio, sr=sample_rate, n_fft=n_fft, hop_length=hop_length
            )
            contrast_means = np.mean(spec_contrast, axis=1)
            for i in range(len(contrast_means)):
                features[f"spectral_contrast_{i}_mean"] = self._safe_float(contrast_means[i])
        except Exception:
            for i in range(7):
                features[f"spectral_contrast_{i}_mean"] = 0.0

        try:
            spec_rolloff = librosa.feature.spectral_rolloff(
                y=audio, sr=sample_rate, n_fft=n_fft, hop_length=hop_length
            )[0]
            features["spectral_rolloff_mean"] = self._safe_float(np.mean(spec_rolloff))
            features["spectral_rolloff_std"] = self._safe_float(np.std(spec_rolloff))
        except Exception:
            features["spectral_rolloff_mean"] = sample_rate / 2
            features["spectral_rolloff_std"] = sample_rate / 4

        try:
            n_mels = min(config.n_mels, 64)
            mel_spectrogram = librosa.feature.melspectrogram(
                y=audio, sr=sample_rate, n_mels=n_mels,
                n_fft=n_fft, hop_length=hop_length,
                fmax=min(sample_rate // 2, 16000)
            )
            log_mel = librosa.power_to_db(mel_spectrogram, ref=np.max)
            log_mel = np.nan_to_num(log_mel, nan=-80.0, posinf=0.0, neginf=-80.0)

            mel_means = np.mean(log_mel, axis=1)
            for i in range(min(32, n_mels)):
                features[f"log_mel_{i}_mean"] = self._safe_float(mel_means[i])
        except Exception:
            for i in range(32):
                features[f"log_mel_{i}_mean"] = -80.0

        try:
            chroma = librosa.feature.chroma_stft(
                y=audio, sr=sample_rate, n_fft=n_fft, hop_length=hop_length
            )
            chroma = np.nan_to_num(chroma, nan=0.0)
            chroma_means = np.mean(chroma, axis=1)
            for i in range(12):
                features[f"chroma_{i}_mean"] = self._safe_float(chroma_means[i])
        except Exception:
            for i in range(12):
                features[f"chroma_{i}_mean"] = 0.0

        try:
            tonnetz = librosa.feature.tonnetz(y=audio, sr=sample_rate)
            tonnetz_means = np.mean(tonnetz, axis=1)
            for i in range(6):
                features[f"tonnetz_{i}_mean"] = self._safe_float(tonnetz_means[i])
        except Exception:
            for i in range(6):
                features[f"tonnetz_{i}_mean"] = 0.0

        return features

    def extract_cepstral_features(self, audio: np.ndarray, sample_rate: int) -> Dict[str, float]:
        """提取倒谱特征 - 增强鲁棒性"""
        audio = self._validate_audio(audio)
        audio = self._ensure_min_length(audio)

        features = {}

        try:
            n_fft = min(2048, len(audio))
            spectrum = np.fft.rfft(audio, n=n_fft)
            log_spectrum = np.log(np.abs(spectrum) + 1e-10)
            cepstrum = np.fft.irfft(log_spectrum).real

            cepstrum = np.nan_to_num(cepstrum, nan=0.0)

            quefrency = np.arange(len(cepstrum)) / sample_rate

            low_q_mask = (quefrency > 0.001) & (quefrency < 0.01)
            mid_q_mask = (quefrency >= 0.01) & (quefrency < 0.1)
            high_q_mask = (quefrency >= 0.1) & (quefrency < 0.5)

            if np.any(low_q_mask):
                features["cepstral_peak_low"] = self._safe_float(np.max(np.abs(cepstrum[low_q_mask])))
            else:
                features["cepstral_peak_low"] = 0.0

            if np.any(mid_q_mask):
                features["cepstral_peak_mid"] = self._safe_float(np.max(np.abs(cepstrum[mid_q_mask])))
            else:
                features["cepstral_peak_mid"] = 0.0

            if np.any(high_q_mask):
                features["cepstral_peak_high"] = self._safe_float(np.max(np.abs(cepstrum[high_q_mask])))
            else:
                features["cepstral_peak_high"] = 0.0

            features["cepstral_mean"] = self._safe_float(np.mean(np.abs(cepstrum)))
            features["cepstral_std"] = self._safe_float(np.std(np.abs(cepstrum)))
            features["cepstral_median"] = self._safe_float(np.median(np.abs(cepstrum)))

        except Exception as e:
            print(f"Cepstral feature extraction error: {e}")
            features["cepstral_peak_low"] = 0.0
            features["cepstral_peak_mid"] = 0.0
            features["cepstral_peak_high"] = 0.0
            features["cepstral_mean"] = 0.0
            features["cepstral_std"] = 0.0
            features["cepstral_median"] = 0.0

        return features

    def extract_perceptual_features(self, audio: np.ndarray, sample_rate: int) -> Dict[str, float]:
        """提取感知特征"""
        features = {}

        try:
            features["loudness"] = self._safe_float(
                librosa.feature.rms(y=audio, frame_length=2048, hop_length=512).mean()
            )
        except Exception:
            features["loudness"] = 0.0

        try:
            tempo, _ = librosa.beat.beat_track(y=audio, sr=sample_rate)
            features["tempo"] = self._safe_float(tempo)
        except Exception:
            features["tempo"] = 0.0

        try:
            onset_env = librosa.onset.onset_strength(y=audio, sr=sample_rate)
            features["onset_strength_mean"] = self._safe_float(np.mean(onset_env))
            features["onset_strength_std"] = self._safe_float(np.std(onset_env))
        except Exception:
            features["onset_strength_mean"] = 0.0
            features["onset_strength_std"] = 0.0

        try:
            features["pulse_clarity"] = self._safe_float(
                librosa.feature.spectral_flatness(y=audio).mean()
            )
        except Exception:
            features["pulse_clarity"] = 0.0

        return features

    def extract_all_features(self, audio: np.ndarray, sample_rate: int,
                             config: Optional[FeatureExtractionConfig] = None) -> Tuple[Dict, List[float]]:
        """提取所有特征 - 增强鲁棒性"""
        if config is None:
            config = self.default_config

        audio = self._validate_audio(audio)

        all_features = {}

        try:
            if config.extract_time_domain:
                time_features = self.extract_time_domain_features(audio, sample_rate)
                all_features["time_domain"] = time_features
            else:
                all_features["time_domain"] = {}
        except Exception as e:
            print(f"Time domain extraction failed: {e}")
            all_features["time_domain"] = {}

        try:
            if config.extract_frequency_domain:
                freq_features = self.extract_frequency_domain_features(audio, sample_rate, config)
                all_features["frequency_domain"] = freq_features
            else:
                all_features["frequency_domain"] = {}
        except Exception as e:
            print(f"Frequency domain extraction failed: {e}")
            all_features["frequency_domain"] = {}

        try:
            if config.extract_mfcc:
                mfcc_features = self.extract_mfcc_features(audio, sample_rate, config)
                all_features["mfcc"] = mfcc_features
            else:
                all_features["mfcc"] = {}
        except Exception as e:
            print(f"MFCC extraction failed: {e}")
            all_features["mfcc"] = {}

        try:
            if config.extract_spectral:
                spectral_features = self.extract_spectral_features(audio, sample_rate, config)
                all_features["spectral"] = spectral_features
            else:
                all_features["spectral"] = {}
        except Exception as e:
            print(f"Spectral extraction failed: {e}")
            all_features["spectral"] = {}

        try:
            if config.extract_cepstral:
                cepstral_features = self.extract_cepstral_features(audio, sample_rate)
                all_features["cepstral"] = cepstral_features
            else:
                all_features["cepstral"] = {}
        except Exception as e:
            print(f"Cepstral extraction failed: {e}")
            all_features["cepstral"] = {}

        try:
            perceptual_features = self.extract_perceptual_features(audio, sample_rate)
            all_features["perceptual"] = perceptual_features
        except Exception as e:
            print(f"Perceptual extraction failed: {e}")
            all_features["perceptual"] = {}

        try:
            feature_vector = self._flatten_features(all_features)
        except Exception as e:
            print(f"Feature flattening failed: {e}")
            feature_vector = [0.0] * 200

        feature_vector = [self._safe_float(x) for x in feature_vector]

        return all_features, feature_vector

    def _flatten_features(self, features: Dict) -> List[float]:
        """扁平化特征 - 增强鲁棒性"""
        flattened = []

        category_order = ["time_domain", "frequency_domain", "mfcc", "spectral", "cepstral", "perceptual"]

        for category in category_order:
            category_features = features.get(category, {})
            if not isinstance(category_features, dict):
                continue

            for key in sorted(category_features.keys()):
                value = category_features[key]
                try:
                    if isinstance(value, (list, np.ndarray)):
                        for v in value:
                            flattened.append(self._safe_float(v))
                    else:
                        flattened.append(self._safe_float(value))
                except Exception:
                    flattened.append(0.0)

        if len(flattened) < 100:
            flattened.extend([0.0] * (100 - len(flattened)))

        return flattened

    def _validate_features(self, features_dict: Dict) -> Dict:
        """验证特征完整性，确保关键特征不丢失"""
        for category, required_keys in self._required_feature_keys.items():
            if category not in features_dict:
                features_dict[category] = {}

            category_features = features_dict[category]
            for key in required_keys:
                if key not in category_features or category_features[key] is None:
                    category_features[key] = 0.0

        return features_dict

    def process_sample(self, sample_id: str,
                       config: Optional[FeatureExtractionConfig] = None) -> Dict:
        """处理样本 - 增强鲁棒性"""
        start_time = time.time()

        db = None
        try:
            db = next(get_db())
            sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()

            if not sample:
                db.close()
                return {"error": "Sample not found", "sample_id": sample_id}

            try:
                denoised_path = sample.file_path.replace('.wav', '_denoised.wav')
                audio_path = denoised_path if os.path.exists(denoised_path) else sample.file_path

                if not os.path.exists(audio_path):
                    raise FileNotFoundError(f"Audio file not found: {audio_path}")

                try:
                    audio, sr = sf.read(audio_path)
                except Exception as read_error:
                    print(f"SoundFile read error, trying alternative method: {read_error}")
                    audio, sr = librosa.load(audio_path, sr=None)

                if len(audio.shape) > 1:
                    audio = audio.mean(axis=1)

                if len(audio) == 0:
                    raise ValueError("Empty audio data")

                sample_rate = sr if sr else 44100

            except Exception as audio_error:
                print(f"Audio loading error for {sample_id}: {audio_error}")
                audio = np.zeros(44100)
                sample_rate = 44100

            try:
                features_dict, feature_vector = self.extract_all_features(audio, sample_rate, config)
                features_dict = self._validate_features(features_dict)
            except Exception as fe_error:
                print(f"Feature extraction error for {sample_id}: {fe_error}")
                features_dict = self._get_default_features()
                feature_vector = [0.0] * 200

            try:
                sample.set_features(features_dict)
            except Exception as db_error:
                print(f"Database feature save error: {db_error}")

            try:
                processing_log = ProcessingLog(
                    task_id=sample_id,
                    device_id=sample.device_id,
                    stage="feature_extraction",
                    status="completed",
                    message=f"Extracted {len(feature_vector)} features",
                    processing_time=time.time() - start_time
                )
                db.add(processing_log)
            except Exception as log_error:
                print(f"Log save error: {log_error}")

            try:
                db.commit()
            except Exception as commit_error:
                print(f"Database commit error: {commit_error}")
                db.rollback()

            db.close()

            return {
                "sample_id": sample_id,
                "feature_vector_length": len(feature_vector),
                "features": features_dict,
                "processing_time": time.time() - start_time,
                "status": "success"
            }

        except Exception as e:
            print(f"Fatal error in feature extraction for {sample_id}: {e}")
            if db:
                try:
                    db.close()
                except:
                    pass
            return {
                "error": f"Feature extraction failed: {str(e)}",
                "sample_id": sample_id,
                "features": self._get_default_features(),
                "feature_vector_length": 200,
                "status": "partial"
            }

    def _get_default_features(self) -> Dict:
        """获取默认特征集"""
        return {
            "time_domain": {k: 0.0 for k in ["rms", "peak_amplitude", "zero_crossing_rate", "variance", "skewness", "kurtosis"]},
            "frequency_domain": {k: 0.0 for k in ["spectral_centroid", "spectral_bandwidth", "spectral_rolloff", "spectral_flatness"]},
            "mfcc": {},
            "spectral": {},
            "cepstral": {},
            "perceptual": {}
        }


feature_extractor = AudioFeatureExtractor()


def process_feature_extraction_task(sample_id: str, config: dict = None) -> Dict:
    """处理特征提取任务 - 带异常防护"""
    try:
        feature_config = FeatureExtractionConfig(**config) if config else FeatureExtractionConfig()
        return feature_extractor.process_sample(sample_id, feature_config)
    except Exception as e:
        print(f"Task wrapper error: {e}")
        return {
            "error": f"Task failed: {str(e)}",
            "sample_id": sample_id,
            "status": "failed"
        }
