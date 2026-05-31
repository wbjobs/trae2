import numpy as np
import librosa
from scipy import signal
from scipy.stats import skew, kurtosis
from scipy.signal import hilbert, find_peaks, welch, csd
from scipy.fft import fft, fftfreq
from typing import Dict, List, Optional, Tuple
import logging
import warnings

warnings.filterwarnings('ignore')
logger = logging.getLogger(__name__)


class FeatureExtractor:
    def __init__(self, sample_rate: int = 16000, n_fft: int = 2048, hop_length: int = 512):
        self.sample_rate = sample_rate
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.n_mels = 128
        self.n_mfcc = 20
        self._feature_cache = {}

    def extract_all_features(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None
    ) -> Dict[str, float]:
        sr = sample_rate or self.sample_rate
        
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        
        audio = audio.astype(np.float32)
        
        if len(audio) < sr * 0.5:
            padding = np.zeros(int(sr * 0.5) - len(audio), dtype=np.float32)
            audio = np.concatenate([audio, padding])
        
        features = {}
        
        features.update(self._extract_time_domain_features(audio))
        features.update(self._extract_frequency_domain_features(audio, sr))
        features.update(self._extract_envelope_features(audio, sr))
        features.update(self._extract_cepstral_features(audio, sr))
        features.update(self._extract_mfcc_features(audio, sr))
        features.update(self._extract_harmonic_features(audio, sr))
        features.update(self._extract_bearing_features(audio, sr))
        features.update(self._extract_gear_features(audio, sr))
        
        features = {k: self._sanitize_value(v) for k, v in features.items()}
        
        return features

    def _sanitize_value(self, value):
        if isinstance(value, (int, float)):
            if np.isnan(value) or np.isinf(value):
                return 0.0
            return float(value)
        return float(value) if value is not None else 0.0

    def _extract_time_domain_features(self, audio: np.ndarray) -> Dict[str, float]:
        features = {}
        
        rms = np.sqrt(np.mean(audio ** 2))
        peak = np.max(np.abs(audio))
        mean_abs = np.mean(np.abs(audio))
        crest_factor = peak / rms if rms > 0 else 0
        
        features.update({
            "mean": float(np.mean(audio)),
            "std": float(np.std(audio)),
            "rms": float(rms),
            "peak_amplitude": float(peak),
            "peak_to_peak": float(np.max(audio) - np.min(audio)),
            "crest_factor": float(crest_factor),
            "impulse_factor": float(peak / (mean_abs + 1e-10)),
            "margin_factor": float(peak / ((np.mean(np.sqrt(np.abs(audio)))) ** 2 + 1e-10)),
            "shape_factor": float(rms / (mean_abs + 1e-10)),
            "skewness": float(skew(audio)),
            "kurtosis": float(kurtosis(audio)),
            "zero_crossing_rate": float(np.sum(np.abs(np.diff(np.sign(audio)))) / (2 * len(audio))),
            "energy": float(np.sum(audio ** 2)),
            "entropy": self._spectral_entropy(audio),
            "root_amplitude": float((np.mean(np.sqrt(np.abs(audio)))) ** 2),
            "log_energy": float(np.log10(np.sum(audio ** 2) + 1e-10)),
            "rms_log": float(np.log10(rms + 1e-10)),
            "peak_log": float(np.log10(peak + 1e-10))
        })
        
        return features

    def _extract_frequency_domain_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        n = len(audio)
        n_fft = min(self.n_fft, n)
        
        f, Pxx = welch(audio, fs=sr, nperseg=n_fft, noverlap=n_fft//2, scaling='density')
        
        total_energy = np.sum(Pxx) + 1e-10
        
        spectral_centroid = np.sum(f * Pxx) / total_energy
        spectral_variance = np.sum(((f - spectral_centroid) ** 2) * Pxx) / total_energy
        spectral_spread = np.sqrt(spectral_variance)
        
        cumulative = np.cumsum(Pxx)
        rolloff_85_idx = np.where(cumulative >= 0.85 * total_energy)[0]
        rolloff_85 = f[rolloff_85_idx[0]] if len(rolloff_85_idx) > 0 else f[-1]
        
        rolloff_75_idx = np.where(cumulative >= 0.75 * total_energy)[0]
        rolloff_75 = f[rolloff_75_idx[0]] if len(rolloff_75_idx) > 0 else f[-1]
        
        rolloff_90_idx = np.where(cumulative >= 0.90 * total_energy)[0]
        rolloff_90 = f[rolloff_90_idx[0]] if len(rolloff_90_idx) > 0 else f[-1]
        
        spectral_entropy = -np.sum((Pxx / total_energy) * np.log2(Pxx / total_energy + 1e-10))
        
        f0 = self._estimate_fundamental_freq(audio, sr)
        dominant_freq = f[np.argmax(Pxx)]
        
        features.update({
            "spectral_centroid": float(spectral_centroid),
            "spectral_spread": float(spectral_spread),
            "spectral_rolloff_75": float(rolloff_75),
            "spectral_rolloff_85": float(rolloff_85),
            "spectral_rolloff_90": float(rolloff_90),
            "spectral_entropy": float(spectral_entropy),
            "spectral_flatness": float(np.exp(np.mean(np.log(Pxx + 1e-10))) / (np.mean(Pxx) + 1e-10)),
            "fundamental_freq": float(f0),
            "dominant_freq": float(dominant_freq),
            "spectral_bandwidth": float(librosa.feature.spectral_bandwidth(y=audio, sr=sr, n_fft=n_fft)[0].mean()),
            "harmonic_energy_ratio": float(self._harmonic_energy_ratio(audio, sr))
        })
        
        peaks = self._find_robust_peaks(f, Pxx, sr, n_peaks=10)
        for i in range(10):
            if i < len(peaks):
                features[f"peak_freq_{i+1}"] = float(peaks[i]['freq'])
                features[f"peak_amp_{i+1}"] = float(peaks[i]['amp'])
            else:
                features[f"peak_freq_{i+1}"] = 0.0
                features[f"peak_amp_{i+1}"] = 0.0
        
        features.update(self._extract_harmonic_structure(audio, sr, f0))
        
        return features

    def _find_robust_peaks(self, f: np.ndarray, Pxx: np.ndarray, sr: int, n_peaks: int = 10) -> List[Dict]:
        try:
            noise_floor = np.percentile(Pxx, 25)
            threshold = max(noise_floor * 2, np.max(Pxx) * 0.05)
            
            peaks, peak_props = find_peaks(
                Pxx,
                height=threshold,
                distance=max(5, int(sr / (f[-1] * 10)))
            )
            
            if len(peaks) == 0:
                return []
            
            peak_freqs = f[peaks]
            peak_amps = peak_props['peak_heights']
            
            sorted_indices = np.argsort(peak_amps)[::-1]
            
            result = []
            used_freqs = set()
            
            for idx in sorted_indices[:n_peaks * 2]:
                freq = peak_freqs[idx]
                amp = peak_amps[idx]
                
                freq_bin = round(freq / 5) * 5
                if freq_bin not in used_freqs:
                    used_freqs.add(freq_bin)
                    result.append({'freq': freq, 'amp': amp})
                
                if len(result) >= n_peaks:
                    break
            
            return result
        except Exception as e:
            logger.warning(f"Peak finding failed: {e}")
            return []

    def _extract_harmonic_structure(self, audio: np.ndarray, sr: int, f0: float) -> Dict[str, float]:
        features = {}
        
        if f0 <= 0 or f0 > sr / 2:
            f0 = 50.0
        
        try:
            f, Pxx = welch(audio, fs=sr, nperseg=1024, noverlap=512)
            
            harmonic_amplitudes = []
            n_harmonics = 10
            
            for h in range(1, n_harmonics + 1):
                target_freq = f0 * h
                if target_freq > sr / 2:
                    break
                
                freq_range = 10
                mask = (f >= target_freq - freq_range) & (f <= target_freq + freq_range)
                
                if np.any(mask):
                    harmonic_amplitudes.append(np.max(Pxx[mask]))
                else:
                    harmonic_amplitudes.append(0.0)
            
            for i, amp in enumerate(harmonic_amplitudes):
                features[f"harmonic_{i+1}_amp"] = float(amp)
            
            if harmonic_amplitudes:
                features["harmonic_decay_rate"] = float(
                    np.polyfit(range(1, len(harmonic_amplitudes) + 1), 
                              np.log(harmonic_amplitudes) + 1e-10, 1)[0]
                )
                features["harmonic_energy_total"] = float(np.sum(harmonic_amplitudes))
                features["harmonic_energy_ratio_1_2"] = float(
                    harmonic_amplitudes[0] / (harmonic_amplitudes[1] if len(harmonic_amplitudes) > 1 else 1e-10)
                )
            else:
                features["harmonic_decay_rate"] = 0.0
                features["harmonic_energy_total"] = 0.0
                features["harmonic_energy_ratio_1_2"] = 0.0
        
        except Exception as e:
            logger.warning(f"Harmonic structure extraction failed: {e}")
            features.update({
                "harmonic_decay_rate": 0.0,
                "harmonic_energy_total": 0.0,
                "harmonic_energy_ratio_1_2": 0.0
            })
            for i in range(10):
                features[f"harmonic_{i+1}_amp"] = 0.0
        
        return features

    def _extract_envelope_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        try:
            analytic_signal = hilbert(audio)
            envelope = np.abs(analytic_signal)
            
            envelope_detrend = envelope - np.mean(envelope)
            
            features.update({
                "envelope_mean": float(np.mean(envelope)),
                "envelope_std": float(np.std(envelope)),
                "envelope_max": float(np.max(envelope)),
                "envelope_min": float(np.min(envelope)),
                "envelope_peak_to_peak": float(np.max(envelope) - np.min(envelope)),
                "envelope_crest": float(np.max(envelope) / (np.mean(envelope) + 1e-10)),
                "envelope_skew": float(skew(envelope)),
                "envelope_kurtosis": float(kurtosis(envelope)),
                "envelope_modulation_depth": float((np.max(envelope) - np.min(envelope)) / (np.mean(envelope) + 1e-10))
            })
            
            f_env, Pxx_env = welch(envelope_detrend, fs=sr, nperseg=512, noverlap=256)
            
            peak_idx = np.argmax(Pxx_env)
            features["envelope_modulation_freq"] = float(f_env[peak_idx])
            features["envelope_modulation_strength"] = float(Pxx_env[peak_idx] / (np.mean(Pxx_env) + 1e-10))
            
            low_freq_mask = (f_env >= 1) & (f_env <= 200)
            if np.any(low_freq_mask):
                features["envelope_low_freq_energy"] = float(np.sum(Pxx_env[low_freq_mask]))
            else:
                features["envelope_low_freq_energy"] = 0.0
            
            peaks, _ = find_peaks(envelope, height=np.mean(envelope))
            features["envelope_peak_count"] = float(len(peaks))
            if len(peaks) > 1:
                features["envelope_peak_interval_mean"] = float(np.mean(np.diff(peaks)) / sr)
                features["envelope_peak_interval_std"] = float(np.std(np.diff(peaks)) / sr)
            else:
                features["envelope_peak_interval_mean"] = 0.0
                features["envelope_peak_interval_std"] = 0.0
        
        except Exception as e:
            logger.warning(f"Envelope feature extraction failed: {e}")
            default_keys = [
                "envelope_mean", "envelope_std", "envelope_max", "envelope_min",
                "envelope_peak_to_peak", "envelope_crest", "envelope_skew", 
                "envelope_kurtosis", "envelope_modulation_depth",
                "envelope_modulation_freq", "envelope_modulation_strength",
                "envelope_low_freq_energy", "envelope_peak_count",
                "envelope_peak_interval_mean", "envelope_peak_interval_std"
            ]
            for k in default_keys:
                features[k] = 0.0
        
        return features

    def _extract_cepstral_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        try:
            n_fft = min(self.n_fft, len(audio))
            _, _, Zxx = signal.stft(audio, fs=sr, nperseg=n_fft, noverlap=n_fft//2)
            power_spectrum = np.abs(Zxx) ** 2
            
            log_spectrum = np.log(power_spectrum + 1e-10)
            cepstrum = np.fft.ifft(log_spectrum, axis=0).real
            
            quefrency = np.fft.fftfreq(n_fft, d=1/sr)
            
            cepstrum_mean = np.mean(cepstrum, axis=1)
            
            low_q_mask = (quefrency >= 0.001) & (quefrency <= 0.01)
            mid_q_mask = (quefrency > 0.01) & (quefrency <= 0.1)
            high_q_mask = (quefrency > 0.1) & (quefrency <= 1.0)
            
            features.update({
                "cepstrum_low_energy": float(np.sum(np.abs(cepstrum_mean[low_q_mask]))) if np.any(low_q_mask) else 0.0,
                "cepstrum_mid_energy": float(np.sum(np.abs(cepstrum_mean[mid_q_mask]))) if np.any(mid_q_mask) else 0.0,
                "cepstrum_high_energy": float(np.sum(np.abs(cepstrum_mean[high_q_mask]))) if np.any(high_q_mask) else 0.0
            })
            
            bearing_q_range = (quefrency >= 1/500) & (quefrency <= 1/50)
            if np.any(bearing_q_range):
                bearing_cep = cepstrum_mean[bearing_q_range]
                if len(bearing_cep) > 0:
                    peak_idx = np.argmax(bearing_cep)
                    features["cepstrum_bearing_peak"] = float(bearing_cep[peak_idx])
                    features["cepstrum_bearing_quefrency"] = float(quefrency[bearing_q_range][peak_idx])
                else:
                    features["cepstrum_bearing_peak"] = 0.0
                    features["cepstrum_bearing_quefrency"] = 0.0
            else:
                features["cepstrum_bearing_peak"] = 0.0
                features["cepstrum_bearing_quefrency"] = 0.0
        
        except Exception as e:
            logger.warning(f"Cepstral feature extraction failed: {e}")
            default_keys = [
                "cepstrum_low_energy", "cepstrum_mid_energy", 
                "cepstrum_high_energy", "cepstrum_bearing_peak",
                "cepstrum_bearing_quefrency"
            ]
            for k in default_keys:
                features[k] = 0.0
        
        return features

    def _extract_spectral_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        mel_spectrogram = librosa.feature.melspectrogram(
            y=audio,
            sr=sr,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
            n_mels=self.n_mels
        )
        log_mel = librosa.power_to_db(mel_spectrogram, ref=np.max)
        
        features.update({
            "mel_mean": float(log_mel.mean()),
            "mel_std": float(log_mel.std()),
            "mel_max": float(log_mel.max()),
            "mel_min": float(log_mel.min()),
            "mel_median": float(np.median(log_mel)),
            "mel_skew": float(skew(log_mel.flatten())),
            "mel_kurtosis": float(kurtosis(log_mel.flatten())),
        })
        
        chroma = librosa.feature.chroma_stft(y=audio, sr=sr, n_fft=self.n_fft, hop_length=self.hop_length)
        features.update({
            f"chroma_{i}": float(chroma[i].mean()) for i in range(12)
        })
        features["chroma_std"] = float(chroma.std())
        
        return features

    def _extract_mfcc_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        mfcc = librosa.feature.mfcc(
            y=audio,
            sr=sr,
            n_mfcc=self.n_mfcc,
            n_fft=self.n_fft,
            hop_length=self.hop_length
        )
        
        mfcc_delta = librosa.feature.delta(mfcc)
        mfcc_delta2 = librosa.feature.delta(mfcc, order=2)
        
        for i in range(self.n_mfcc):
            features[f"mfcc_{i+1}_mean"] = float(mfcc[i].mean())
            features[f"mfcc_{i+1}_std"] = float(mfcc[i].std())
            features[f"mfcc_{i+1}_max"] = float(mfcc[i].max())
            features[f"mfcc_{i+1}_min"] = float(mfcc[i].min())
            features[f"mfcc_delta_{i+1}_mean"] = float(mfcc_delta[i].mean())
            features[f"mfcc_delta2_{i+1}_mean"] = float(mfcc_delta2[i].mean())
        
        return features

    def _extract_harmonic_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        try:
            y_harmonic, y_percussive = librosa.effects.hpss(audio)
            
            harmonic_energy = np.sum(y_harmonic ** 2)
            percussive_energy = np.sum(y_percussive ** 2)
            total_energy = harmonic_energy + percussive_energy + 1e-10
            
            features.update({
                "harmonic_energy": float(harmonic_energy),
                "percussive_energy": float(percussive_energy),
                "harmonic_percussive_ratio": float(harmonic_energy / (percussive_energy + 1e-10)),
                "harmonic_ratio": float(harmonic_energy / total_energy),
                "percussive_ratio": float(percussive_energy / total_energy),
                "harmonic_rms": float(np.sqrt(np.mean(y_harmonic ** 2))),
                "percussive_rms": float(np.sqrt(np.mean(y_percussive ** 2))),
                "zero_crossing_rate_harmonic": float(librosa.feature.zero_crossing_rate(y_harmonic)[0].mean()),
                "zero_crossing_rate_percussive": float(librosa.feature.zero_crossing_rate(y_percussive)[0].mean()),
            })
        
        except Exception as e:
            logger.warning(f"Harmonic feature extraction failed: {e}")
            default_keys = [
                "harmonic_energy", "percussive_energy", "harmonic_percussive_ratio",
                "harmonic_ratio", "percussive_ratio", "harmonic_rms", "percussive_rms",
                "zero_crossing_rate_harmonic", "zero_crossing_rate_percussive"
            ]
            for k in default_keys:
                features[k] = 0.0
        
        return features

    def _extract_bearing_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        try:
            analytic = hilbert(audio)
            envelope = np.abs(analytic)
            envelope = envelope - np.mean(envelope)
            
            f_env, Pxx_env = welch(envelope, fs=sr, nperseg=512, noverlap=256)
            
            bpfo_range = (f_env >= 50) & (f_env <= 300)
            bpfi_range = (f_env >= 300) & (f_env <= 1000)
            ftf_range = (f_env >= 10) & (f_env <= 100)
            
            features.update({
                "bearing_bpfo_energy": float(np.sum(Pxx_env[bpfo_range])) if np.any(bpfo_range) else 0.0,
                "bearing_bpfi_energy": float(np.sum(Pxx_env[bpfi_range])) if np.any(bpfi_range) else 0.0,
                "bearing_ftf_energy": float(np.sum(Pxx_env[ftf_range])) if np.any(ftf_range) else 0.0,
                "bearing_bsf_ratio": float(
                    (np.sum(Pxx_env[bpfo_range]) if np.any(bpfo_range) else 0.0) / 
                    (np.sum(Pxx_env[ftf_range]) if np.sum(Pxx_env[ftf_range]) > 0 else 1e-10)
                )
            })
            
            peak_range = (f_env >= 50) & (f_env <= 500)
            if np.any(peak_range):
                peak_idx = np.argmax(Pxx_env[peak_range])
                peak_freq = f_env[peak_range][peak_idx]
                peak_amp = Pxx_env[peak_range][peak_idx]
                
                features["bearing_peak_freq"] = float(peak_freq)
                features["bearing_peak_amplitude"] = float(peak_amp)
                
                sideband_amps = []
                for sb in [-3, -2, -1, 1, 2, 3]:
                    sb_freq = peak_freq + sb * 15
                    sb_mask = (f_env >= sb_freq - 5) & (f_env <= sb_freq + 5)
                    if np.any(sb_mask):
                        sideband_amps.append(np.max(Pxx_env[sb_mask]))
                
                if sideband_amps:
                    features["bearing_sideband_strength"] = float(np.mean(sideband_amps) / (peak_amp + 1e-10))
                else:
                    features["bearing_sideband_strength"] = 0.0
            else:
                features["bearing_peak_freq"] = 0.0
                features["bearing_peak_amplitude"] = 0.0
                features["bearing_sideband_strength"] = 0.0
        
        except Exception as e:
            logger.warning(f"Bearing feature extraction failed: {e}")
            default_keys = [
                "bearing_bpfo_energy", "bearing_bpfi_energy", "bearing_ftf_energy",
                "bearing_bsf_ratio", "bearing_peak_freq", "bearing_peak_amplitude",
                "bearing_sideband_strength"
            ]
            for k in default_keys:
                features[k] = 0.0
        
        return features

    def _extract_gear_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        try:
            f, Pxx = welch(audio, fs=sr, nperseg=1024, noverlap=512)
            
            mesh_range = (f >= 100) & (f_env <= 1000 if 'f_env' in locals() else 1000)
            mesh_energy = np.sum(Pxx[mesh_range]) if np.any(mesh_range) else 0.0
            
            sideband_energy = 0.0
            fundamental_freq = 50.0
            mesh_freq = fundamental_freq * 10
            
            for h in range(1, 6):
                harmonic_freq = mesh_freq * h
                for sb in [-3, -2, -1, 1, 2, 3]:
                    sb_freq = harmonic_freq + sb * fundamental_freq
                    if 10 <= sb_freq <= sr/2:
                        sb_mask = (f >= sb_freq - 5) & (f <= sb_freq + 5)
                        if np.any(sb_mask):
                            sideband_energy += np.sum(Pxx[sb_mask])
            
            features.update({
                "gear_mesh_energy": float(mesh_energy),
                "gear_sideband_energy": float(sideband_energy),
                "gear_sideband_ratio": float(sideband_energy / (mesh_energy + 1e-10)),
                "gear_fm_index": float(sideband_energy / (np.sum(Pxx) + 1e-10))
            })
            
            residual = audio - np.mean(audio)
            f_res, Pxx_res = welch(residual, fs=sr, nperseg=512, noverlap=256)
            
            rotation_range = (f_res >= 10) & (f_res <= 100)
            if np.any(rotation_range):
                peak_idx = np.argmax(Pxx_res[rotation_range])
                features["gear_rotation_freq"] = float(f_res[rotation_range][peak_idx])
                features["gear_rotation_strength"] = float(Pxx_res[rotation_range][peak_idx] / (np.mean(Pxx_res) + 1e-10))
            else:
                features["gear_rotation_freq"] = 0.0
                features["gear_rotation_strength"] = 0.0
            
            amplitude_modulation = np.abs(hilbert(audio))
            features["gear_am_depth"] = float(
                (np.max(amplitude_modulation) - np.min(amplitude_modulation)) / 
                (np.mean(amplitude_modulation) + 1e-10)
            )
        
        except Exception as e:
            logger.warning(f"Gear feature extraction failed: {e}")
            default_keys = [
                "gear_mesh_energy", "gear_sideband_energy", "gear_sideband_ratio",
                "gear_fm_index", "gear_rotation_freq", "gear_rotation_strength",
                "gear_am_depth"
            ]
            for k in default_keys:
                features[k] = 0.0
        
        return features

    def _extract_rhythm_features(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        features = {}
        
        try:
            tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=sr)
            features["tempo"] = float(tempo)
            
            onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
            features["onset_strength_mean"] = float(onset_env.mean())
            features["onset_strength_std"] = float(onset_env.std())
            features["onset_count"] = float(len(librosa.onset.onset_detect(y=audio, sr=sr)))
            features["onset_strength_max"] = float(onset_env.max())
            
            if len(onset_env) > 1:
                autocorr = np.correlate(onset_env, onset_env, mode='full')
                autocorr = autocorr[len(autocorr)//2:]
                peaks, _ = find_peaks(autocorr, height=np.mean(autocorr))
                features["rhythm_periodicity"] = float(len(peaks) / len(onset_env) * sr) if len(peaks) > 0 else 0.0
            else:
                features["rhythm_periodicity"] = 0.0
        
        except Exception as e:
            logger.warning(f"Rhythm feature extraction failed: {e}")
            default_keys = [
                "tempo", "onset_strength_mean", "onset_strength_std",
                "onset_count", "onset_strength_max", "rhythm_periodicity"
            ]
            for k in default_keys:
                features[k] = 0.0
        
        return features

    def _spectral_entropy(self, signal_data: np.ndarray, nbins: int = 100) -> float:
        try:
            counts, _ = np.histogram(signal_data, bins=nbins, density=True)
            counts = counts + 1e-10
            probs = counts / np.sum(counts)
            entropy = -np.sum(probs * np.log2(probs))
            return float(entropy / np.log2(nbins))
        except:
            return 0.0

    def _estimate_fundamental_freq(self, audio: np.ndarray, sr: int) -> float:
        try:
            f0, _, _ = librosa.pyin(
                audio, 
                fmin=librosa.note_to_hz('C1'), 
                fmax=librosa.note_to_hz('C7'), 
                sr=sr
            )
            valid_f0 = f0[~np.isnan(f0)]
            if len(valid_f0) > 0:
                return float(np.median(valid_f0))
            
            f, Pxx = welch(audio, fs=sr, nperseg=1024)
            mask = (f >= 20) & (f <= 400)
            if np.any(mask):
                peak_idx = np.argmax(Pxx[mask])
                return float(f[mask][peak_idx])
            
            return 50.0
        except:
            return 50.0

    def _harmonic_energy_ratio(self, audio: np.ndarray, sr: int) -> float:
        try:
            y_harmonic, y_percussive = librosa.effects.hpss(audio)
            harmonic_energy = np.sum(y_harmonic ** 2)
            total_energy = np.sum(audio ** 2) + 1e-10
            return harmonic_energy / total_energy
        except:
            return 0.0

    def get_feature_names(self) -> List[str]:
        features = self.extract_all_features(np.random.randn(self.sample_rate))
        return list(features.keys())

    def normalize_features(self, features: Dict[str, float], mean: Dict[str, float], std: Dict[str, float]) -> Dict[str, float]:
        normalized = {}
        for key, value in features.items():
            if key in mean and key in std and std[key] > 0:
                normalized[key] = (value - mean[key]) / std[key]
            else:
                normalized[key] = value
        return normalized

    def features_to_array(self, features: Dict[str, float], feature_order: List[str]) -> np.ndarray:
        return np.array([features.get(f, 0.0) for f in feature_order], dtype=np.float32)
