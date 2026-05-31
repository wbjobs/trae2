import os
import time
import numpy as np
import noisereduce as nr
from scipy import signal
from scipy.io import wavfile
import soundfile as sf
from typing import Dict, Tuple, Optional
from numba import jit

from config import settings
from database import get_db, AudioSample, ProcessingLog
from schemas import NoiseReductionConfig


class AudioDenoiser:
    def __init__(self):
        self.default_config = NoiseReductionConfig()
        self._noise_profile_cache = {}

    def calculate_noise_level(self, audio: np.ndarray) -> float:
        if len(audio) == 0:
            return 0.0
        return float(np.sqrt(np.mean(audio ** 2)))

    def calculate_snr(self, signal: np.ndarray, noise: np.ndarray) -> float:
        signal_power = np.mean(signal ** 2)
        noise_power = np.mean(noise ** 2)
        if noise_power == 0:
            return 100.0
        return float(10 * np.log10(signal_power / noise_power))

    def detect_impulse_noise(self, audio: np.ndarray, threshold: float = 3.0) -> np.ndarray:
        """检测脉冲噪声"""
        if len(audio) < 3:
            return np.zeros_like(audio, dtype=bool)

        abs_audio = np.abs(audio)
        median = np.median(abs_audio)
        std = np.std(abs_audio)

        if std == 0:
            return np.zeros_like(audio, dtype=bool)

        z_scores = (abs_audio - median) / (std + 1e-10)
        impulse_mask = z_scores > threshold

        return impulse_mask

    def remove_impulse_noise(self, audio: np.ndarray, threshold: float = 4.0,
                             window_size: int = 5) -> np.ndarray:
        """去除工业环境中的脉冲噪声"""
        try:
            cleaned = audio.copy()
            impulse_mask = self.detect_impulse_noise(audio, threshold)

            if not np.any(impulse_mask):
                return audio

            half_window = window_size // 2
            for i in np.where(impulse_mask)[0]:
                start = max(0, i - half_window)
                end = min(len(audio), i + half_window + 1)

                valid_samples = []
                for j in range(start, end):
                    if not impulse_mask[j]:
                        valid_samples.append(audio[j])

                if len(valid_samples) > 0:
                    cleaned[i] = np.median(valid_samples)
                else:
                    left_val = audio[max(0, i - 1)] if i > 0 else 0
                    right_val = audio[min(len(audio) - 1, i + 1)] if i < len(audio) - 1 else 0
                    cleaned[i] = (left_val + right_val) / 2

            return cleaned
        except Exception as e:
            print(f"Impulse noise removal error: {e}")
            return audio

    def spectral_subtraction(self, audio: np.ndarray, sample_rate: int,
                              alpha: float = 2.0, beta: float = 0.01) -> np.ndarray:
        """谱减法降噪，适合强工业噪声"""
        try:
            n_fft = 2048
            hop_length = 512

            f, t, Zxx = signal.stft(audio, fs=sample_rate, nperseg=n_fft, noverlap=hop_length)

            magnitude = np.abs(Zxx)
            phase = np.angle(Zxx)

            noise_est = np.percentile(magnitude, 25, axis=1, keepdims=True)

            mag_squared = magnitude ** 2
            noise_squared = noise_est ** 2

            enhanced_squared = np.maximum(mag_squared - alpha * noise_squared, beta * noise_squared)
            enhanced_mag = np.sqrt(enhanced_squared)

            enhanced_Zxx = enhanced_mag * np.exp(1j * phase)

            _, denoised_audio = signal.istft(enhanced_Zxx, fs=sample_rate,
                                             nperseg=n_fft, noverlap=hop_length)

            return denoised_audio[:len(audio)]
        except Exception as e:
            print(f"Spectral subtraction error: {e}")
            return audio

    def mmse_estimator(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        """MMSE估计器降噪"""
        try:
            n_fft = 2048
            hop_length = 512

            f, t, Zxx = signal.stft(audio, fs=sample_rate, nperseg=n_fft, noverlap=hop_length)

            magnitude = np.abs(Zxx)
            phase = np.angle(Zxx)

            noise_power = np.mean(magnitude[:, :10] ** 2, axis=1, keepdims=True)

            snr_post = magnitude ** 2 / (noise_power + 1e-10)
            snr_prior = 0.98 + 0.02 * snr_post

            gamma = snr_post
            nu = gamma * snr_prior / (1 + snr_prior)

            from scipy.special import iv
            gain = (np.sqrt(np.pi) / 2) * np.sqrt(nu / gamma) * np.exp(-nu / 2)
            gain *= ((1 + nu) * iv(0, nu / 2) + nu * iv(1, nu / 2))
            gain = np.minimum(gain, 1.0)

            enhanced_mag = magnitude * gain
            enhanced_Zxx = enhanced_mag * np.exp(1j * phase)

            _, denoised_audio = signal.istft(enhanced_Zxx, fs=sample_rate,
                                             nperseg=n_fft, noverlap=hop_length)

            return denoised_audio[:len(audio)]
        except Exception as e:
            print(f"MMSE estimator error: {e}")
            return audio

    def multi_band_denoise(self, audio: np.ndarray, sample_rate: int,
                           config: NoiseReductionConfig) -> np.ndarray:
        """多频段降噪，针对工业噪声优化"""
        try:
            n_fft = 2048
            hop_length = 512

            f, t, Zxx = signal.stft(audio, fs=sample_rate, nperseg=n_fft, noverlap=hop_length)
            magnitude = np.abs(Zxx)
            phase = np.angle(Zxx)

            freq_bins = len(f)
            bands = [
                (0, int(freq_bins * 0.1), 1.5),
                (int(freq_bins * 0.1), int(freq_bins * 0.3), 2.0),
                (int(freq_bins * 0.3), int(freq_bins * 0.6), 2.5),
                (int(freq_bins * 0.6), int(freq_bins * 0.85), 1.8),
                (int(freq_bins * 0.85), freq_bins, 1.2),
            ]

            noise_est = np.percentile(magnitude, 30, axis=1, keepdims=True)

            enhanced_mag = magnitude.copy()
            for start, end, strength in bands:
                band_mag = magnitude[start:end, :]
                band_noise = noise_est[start:end, :]

                mask = band_mag > (band_noise * strength)
                enhanced_mag[start:end, :] = np.where(mask, band_mag, band_noise * 0.1)

            enhanced_Zxx = enhanced_mag * np.exp(1j * phase)

            _, denoised_audio = signal.istft(enhanced_Zxx, fs=sample_rate,
                                             nperseg=n_fft, noverlap=hop_length)

            return denoised_audio[:len(audio)]
        except Exception as e:
            print(f"Multi-band denoise error: {e}")
            return audio

    def spectral_gating_denoise(self, audio: np.ndarray, sample_rate: int,
                                config: NoiseReductionConfig) -> np.ndarray:
        try:
            snr = self._estimate_snr(audio)

            if snr < -5:
                audio = self.remove_impulse_noise(audio, threshold=3.5)
                audio = self.spectral_subtraction(audio, sample_rate, alpha=1.5, beta=0.05)

            prop_decrease = min(config.prop_decrease * 1.2, 1.0) if snr < 0 else config.prop_decrease

            reduced_noise = nr.reduce_noise(
                y=audio,
                sr=sample_rate,
                stationary=config.stationary,
                prop_decrease=prop_decrease,
                n_std_thresh_stationary=1.2,
                thresh_n_mult_nonstationary=1.5,
                time_constant_s=0.5,
                freq_mask_smooth_hz=200,
                time_mask_smooth_ms=100
            )
            return reduced_noise
        except Exception as e:
            print(f"Spectral gating error: {e}")
            return audio

    def wiener_denoise(self, audio: np.ndarray, sample_rate: int,
                       config: NoiseReductionConfig) -> np.ndarray:
        try:
            audio = self.remove_impulse_noise(audio)

            n_fft = 2048
            hop_length = 512

            f, t, Zxx = signal.stft(audio, fs=sample_rate, nperseg=n_fft, noverlap=hop_length)

            magnitude = np.abs(Zxx)
            phase = np.angle(Zxx)

            noise_mag = np.percentile(magnitude, 15, axis=1, keepdims=True)
            snr = magnitude / (noise_mag + 1e-10)

            alpha = config.strength
            gain = snr ** 2 / (snr ** 2 + alpha)
            gain = np.maximum(gain, 0.05)

            enhanced_mag = magnitude * gain
            enhanced_Zxx = enhanced_mag * np.exp(1j * phase)

            _, denoised_audio = signal.istft(enhanced_Zxx, fs=sample_rate,
                                             nperseg=n_fft, noverlap=hop_length)

            return denoised_audio[:len(audio)]
        except Exception as e:
            print(f"Wiener denoise error: {e}")
            return audio

    def industrial_denoise(self, audio: np.ndarray, sample_rate: int,
                           config: NoiseReductionConfig) -> np.ndarray:
        """工业噪声专用降噪流程"""
        try:
            audio_clean = self.remove_impulse_noise(audio, threshold=4.0)

            snr = self._estimate_snr(audio_clean)

            if snr < 0:
                audio_clean = self.multi_band_denoise(audio_clean, sample_rate, config)

            audio_clean = self.spectral_subtraction(audio_clean, sample_rate,
                                                    alpha=config.strength * 2.0, beta=0.02)

            audio_clean = self.wiener_denoise(audio_clean, sample_rate, config)

            return audio_clean
        except Exception as e:
            print(f"Industrial denoise error: {e}")
            return audio

    def _estimate_snr(self, audio: np.ndarray) -> float:
        """估计信噪比"""
        if len(audio) == 0:
            return 0

        abs_audio = np.abs(audio)
        sorted_vals = np.sort(abs_audio)
        n = len(sorted_vals)

        noise_est = np.mean(sorted_vals[:int(n * 0.2)])
        signal_est = np.mean(sorted_vals[int(n * 0.8):])

        if noise_est == 0:
            return 30

        snr = 20 * np.log10(signal_est / (noise_est + 1e-10))
        return float(snr)

    def bandpass_filter(self, audio: np.ndarray, sample_rate: int,
                        low_freq: float = 20.0, high_freq: float = 20000.0) -> np.ndarray:
        try:
            nyquist = sample_rate / 2
            low = low_freq / nyquist
            high = high_freq / nyquist

            if low <= 0 or high >= 1:
                return audio

            b, a = signal.butter(6, [low, high], btype='band')
            filtered_audio = signal.filtfilt(b, a, audio)
            return filtered_audio
        except Exception as e:
            print(f"Bandpass filter error: {e}")
            return audio

    def notch_filter(self, audio: np.ndarray, sample_rate: int,
                     freq: float, quality: float = 30.0) -> np.ndarray:
        """陷波滤波器，去除特定频率的工业噪声"""
        try:
            nyquist = sample_rate / 2
            freq_norm = freq / nyquist

            b, a = signal.iirnotch(freq_norm, quality)
            filtered_audio = signal.filtfilt(b, a, audio)
            return filtered_audio
        except Exception as e:
            print(f"Notch filter error: {e}")
            return audio

    def remove_dc_offset(self, audio: np.ndarray) -> np.ndarray:
        return audio - np.mean(audio)

    def normalize_audio(self, audio: np.ndarray, target_db: float = -3.0,
                        max_gain: float = 20.0) -> np.ndarray:
        if len(audio) == 0:
            return audio

        rms = np.sqrt(np.mean(audio ** 2))
        if rms == 0:
            return audio

        target_rms = 10 ** (target_db / 20)
        gain = target_rms / rms

        gain = min(gain, max_gain)

        normalized = audio * gain

        peak = np.max(np.abs(normalized))
        if peak > 1.0:
            normalized = normalized / peak * 0.95

        return normalized

    def soft_clip(self, audio: np.ndarray, threshold: float = 0.9) -> np.ndarray:
        """软限幅，避免削波失真"""
        audio_abs = np.abs(audio)
        mask = audio_abs > threshold

        if not np.any(mask):
            return audio

        gain = np.ones_like(audio)
        gain[mask] = threshold + (1 - threshold) * np.tanh(
            (audio_abs[mask] - threshold) / (1 - threshold)
        ) / audio_abs[mask]

        return audio * gain

    def denoise_audio(self, audio: np.ndarray, sample_rate: int,
                      config: Optional[NoiseReductionConfig] = None) -> Tuple[np.ndarray, Dict]:
        if config is None:
            config = self.default_config

        if len(audio) == 0:
            return audio, {"error": "empty_audio"}

        original_audio = audio.copy()
        noise_level_before = self.calculate_noise_level(audio)
        initial_snr = self._estimate_snr(audio)

        try:
            audio = self.remove_dc_offset(audio)

            audio = self.bandpass_filter(audio, sample_rate, 50, 15000)

            for freq in [50, 60, 100, 120, 200, 240]:
                audio = self.notch_filter(audio, sample_rate, freq)

            method = config.method.lower()

            if method == "industrial" or initial_snr < 5:
                denoised_audio = self.industrial_denoise(audio, sample_rate, config)
                method_used = "industrial"
            elif method == "spectral_gating":
                denoised_audio = self.spectral_gating_denoise(audio, sample_rate, config)
                method_used = "spectral_gating"
            elif method == "wiener":
                denoised_audio = self.wiener_denoise(audio, sample_rate, config)
                method_used = "wiener"
            elif method == "mmse":
                audio = self.remove_impulse_noise(audio)
                denoised_audio = self.mmse_estimator(audio, sample_rate)
                method_used = "mmse"
            else:
                denoised_audio = self.industrial_denoise(audio, sample_rate, config)
                method_used = "industrial"

            denoised_audio = self.soft_clip(denoised_audio)
            denoised_audio = self.normalize_audio(denoised_audio)

            if len(denoised_audio) != len(original_audio):
                if len(denoised_audio) > len(original_audio):
                    denoised_audio = denoised_audio[:len(original_audio)]
                else:
                    padding = np.zeros(len(original_audio) - len(denoised_audio))
                    denoised_audio = np.concatenate([denoised_audio, padding])

            noise_level_after = self.calculate_noise_level(denoised_audio)

            signal_estimate = original_audio - denoised_audio
            if np.std(signal_estimate) > 0:
                snr_improvement = self.calculate_snr(original_audio, signal_estimate)
            else:
                snr_improvement = 0.0

            final_snr = self._estimate_snr(denoised_audio)

            stats = {
                "noise_level_before": noise_level_before,
                "noise_level_after": noise_level_after,
                "snr_before": initial_snr,
                "snr_after": final_snr,
                "snr_improvement_db": snr_improvement,
                "reduction_ratio": noise_level_before / max(noise_level_after, 1e-10),
                "method_used": method_used,
                "impulse_noise_detected": bool(np.any(self.detect_impulse_noise(original_audio)))
            }

            return denoised_audio, stats

        except Exception as e:
            print(f"Denoise pipeline error: {e}")
            stats = {
                "noise_level_before": noise_level_before,
                "noise_level_after": noise_level_before,
                "snr_before": initial_snr,
                "snr_after": initial_snr,
                "snr_improvement_db": 0.0,
                "reduction_ratio": 1.0,
                "method_used": "failed",
                "error": str(e)
            }
            return original_audio, stats

    def process_sample(self, sample_id: str,
                       config: Optional[NoiseReductionConfig] = None) -> Dict:
        start_time = time.time()

        db = next(get_db())
        sample = db.query(AudioSample).filter(AudioSample.sample_id == sample_id).first()

        if not sample:
            db.close()
            return {"error": "Sample not found"}

        try:
            audio, sample_rate = sf.read(sample.file_path)
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)

            if np.any(np.isnan(audio)) or np.any(np.isinf(audio)):
                audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0)

            denoised_audio, stats = self.denoise_audio(audio, sample_rate, config)

            denoised_path = sample.file_path.replace('.wav', '_denoised.wav')
            sf.write(denoised_path, denoised_audio, sample_rate)

            sample.noise_level_before = stats["noise_level_before"]
            sample.noise_level_after = stats["noise_level_after"]

            processing_log = ProcessingLog(
                task_id=sample_id,
                device_id=sample.device_id,
                stage="denoise",
                status="completed",
                message=f"Denoiser completed using {stats['method_used']}, SNR improved by {stats['snr_improvement_db']:.1f}dB",
                processing_time=time.time() - start_time
            )
            db.add(processing_log)
            db.commit()
            db.close()

            return {
                "sample_id": sample_id,
                "denoised_file_path": denoised_path,
                "stats": stats,
                "processing_time": time.time() - start_time
            }

        except Exception as e:
            db.close()
            return {"error": f"Processing failed: {str(e)}"}


denoiser = AudioDenoiser()


def process_denoise_task(sample_id: str, config: dict = None) -> Dict:
    try:
        noise_config = NoiseReductionConfig(**config) if config else NoiseReductionConfig()
        return denoiser.process_sample(sample_id, noise_config)
    except Exception as e:
        return {"error": f"Task failed: {str(e)}"}
