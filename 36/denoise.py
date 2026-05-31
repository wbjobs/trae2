"""
音频降噪模块（修复版）
支持谱减法、维纳滤波、小波降噪等多种降噪算法
修复：强噪音环境下降噪失效问题
新增：自适应阈值、噪声平滑、过减保护、音乐噪声抑制
"""
import logging
from typing import Optional, Tuple

import numpy as np

from config import (
    SAMPLE_RATE,
    N_FFT,
    HOP_LENGTH,
    SPECTRAL_SUBTRACTION_ALPHA,
    SPECTRAL_SUBTRACTION_BETA,
    WIENER_NR_ITER,
    WAVELET_LEVEL,
    WAVELET_WAVELET,
    WAVELET_MODE,
)

logger = logging.getLogger(__name__)


class AdvancedNoiseEstimator:
    """高级噪声估计器 - 支持VAD、在线更新、平滑处理"""

    def __init__(
        self,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        smooth_factor: float = 0.85,
        vad_threshold: float = 0.01,
    ):
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.smooth_factor = smooth_factor
        self.vad_threshold = vad_threshold
        self._noise_psd: Optional[np.ndarray] = None
        self._noise_counter = 0
        self._is_initialized = False

    def initialize_noise(self, noise_samples: np.ndarray) -> np.ndarray:
        """使用静默段初始化噪声轮廓"""
        stft = self._stft(noise_samples)
        magnitude = np.abs(stft)
        self._noise_psd = np.mean(magnitude ** 2, axis=1, keepdims=True)
        self._is_initialized = True
        self._noise_counter = magnitude.shape[1]
        logger.info(f"Noise initialized with {self._noise_counter} frames")
        return self._noise_psd

    def update_noise(self, magnitude_frame: np.ndarray, is_speech: bool = False):
        """在线更新噪声轮廓（非语音帧时更新）"""
        if not self._is_initialized:
            self._noise_psd = magnitude_frame.reshape(-1, 1) ** 2
            self._is_initialized = True
            return

        if not is_speech:
            alpha = self.smooth_factor
            current_psd = magnitude_frame.reshape(-1, 1) ** 2
            self._noise_psd = alpha * self._noise_psd + (1 - alpha) * current_psd
            self._noise_counter += 1

    def detect_speech(self, magnitude_frame: np.ndarray) -> bool:
        """简单的能量基VAD检测"""
        if self._noise_psd is None:
            return False

        frame_energy = np.mean(magnitude_frame ** 2)
        noise_energy = np.mean(self._noise_psd)
        snr = 10 * np.log10(frame_energy / max(noise_energy, 1e-10))
        return snr > self.vad_threshold * 100

    def get_noise_psd(self) -> np.ndarray:
        if self._noise_psd is None:
            return np.zeros((self.n_fft // 2 + 1, 1))
        return self._noise_psd

    def _stft(self, signal: np.ndarray) -> np.ndarray:
        try:
            import librosa
            return librosa.stft(signal, n_fft=self.n_fft, hop_length=self.hop_length)
        except ImportError:
            return self._stft_numpy(signal)

    def _stft_numpy(self, signal: np.ndarray) -> np.ndarray:
        window = np.hanning(self.n_fft)
        n_frames = 1 + (len(signal) - self.n_fft) // self.hop_length
        stft_matrix = np.zeros((self.n_fft // 2 + 1, n_frames), dtype=np.complex64)
        for i in range(n_frames):
            start = i * self.hop_length
            frame = signal[start : start + self.n_fft] * window
            stft_matrix[:, i] = np.fft.rfft(frame, n=self.n_fft)
        return stft_matrix


class SpectralSubtraction:
    """增强版谱减法 - 修复强噪音失效问题"""

    def __init__(
        self,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        alpha: float = SPECTRAL_SUBTRACTION_ALPHA,
        beta: float = SPECTRAL_SUBTRACTION_BETA,
        adaptive_alpha: bool = True,
        max_alpha: float = 5.0,
        min_alpha: float = 1.0,
        post_filter: bool = True,
    ):
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.alpha = alpha
        self.beta = beta
        self.adaptive_alpha = adaptive_alpha
        self.max_alpha = max_alpha
        self.min_alpha = min_alpha
        self.post_filter = post_filter
        self._noise_est: Optional[np.ndarray] = None
        self._noise_estimator = AdvancedNoiseEstimator(n_fft=n_fft, hop_length=hop_length)

    def estimate_noise(self, noise_samples: np.ndarray, n_fft: Optional[int] = None) -> np.ndarray:
        n_fft = n_fft or self.n_fft
        stft = self._stft(noise_samples, n_fft)
        magnitude = np.abs(stft)

        noise_mean = np.mean(magnitude, axis=1, keepdims=True)
        noise_std = np.std(magnitude, axis=1, keepdims=True)
        self._noise_est = noise_mean + 0.5 * noise_std

        self._noise_estimator.initialize_noise(noise_samples)
        logger.info(f"Noise profile estimated with robust statistics, shape={self._noise_est.shape}")
        return self._noise_est

    def denoise(self, audio: np.ndarray) -> np.ndarray:
        if self._noise_est is None:
            logger.warning("Noise not estimated, using adaptive noise estimation")
            self._adaptive_noise_init(audio)

        stft = self._stft(audio, self.n_fft)
        magnitude = np.abs(stft)
        phase = np.angle(stft)

        n_bins, n_frames = magnitude.shape
        noise_mag = np.broadcast_to(self._noise_est, (n_bins, n_frames))

        if self.adaptive_alpha:
            snr = self._compute_snr(magnitude, noise_mag)
            alpha_map = self._compute_adaptive_alpha(snr)
        else:
            alpha_map = self.alpha

        cleaned_mag = magnitude - alpha_map * noise_mag

        noise_floor = self.beta * noise_mag
        cleaned_mag = np.maximum(cleaned_mag, noise_floor)

        if self.post_filter:
            cleaned_mag = self._musical_noise_suppression(cleaned_mag, magnitude, noise_mag)
            cleaned_mag = self._temporal_smoothing(cleaned_mag)

        cleaned_stft = cleaned_mag * np.exp(1j * phase)
        cleaned_audio = self._istft(cleaned_stft)

        cleaned_audio = self._match_length(cleaned_audio, len(audio))
        cleaned_audio = self._clip_protection(cleaned_audio)

        return cleaned_audio.astype(np.float32)

    def _adaptive_noise_init(self, audio: np.ndarray):
        """自适应噪声初始化 - 从低能量帧中估计噪声"""
        rms_list = []
        frame_size = self.n_fft
        for i in range(0, len(audio) - frame_size, self.hop_length):
            frame = audio[i : i + frame_size]
            rms = np.sqrt(np.mean(frame ** 2))
            rms_list.append(rms)

        if rms_list:
            threshold = np.percentile(rms_list, 30)
            noise_frames = []
            for i in range(0, len(audio) - frame_size, self.hop_length):
                frame = audio[i : i + frame_size]
                rms = np.sqrt(np.mean(frame ** 2))
                if rms <= threshold:
                    noise_frames.append(frame)

            if noise_frames:
                noise_samples = np.concatenate(noise_frames[:min(10, len(noise_frames))])
                self.estimate_noise(noise_samples)
            else:
                self._noise_est = np.ones((self.n_fft // 2 + 1, 1)) * 1e-8
        else:
            self._noise_est = np.ones((self.n_fft // 2 + 1, 1)) * 1e-8

    def _compute_snr(self, magnitude: np.ndarray, noise: np.ndarray) -> np.ndarray:
        """计算每帧每频点的SNR"""
        signal_power = magnitude ** 2
        noise_power = noise ** 2 + 1e-10
        snr = 10 * np.log10(signal_power / noise_power)
        return np.clip(snr, -20, 40)

    def _compute_adaptive_alpha(self, snr: np.ndarray) -> np.ndarray:
        """根据SNR自适应调整过减系数"""
        alpha = self.alpha - 0.05 * snr
        return np.clip(alpha, self.min_alpha, self.max_alpha)

    def _musical_noise_suppression(
        self, cleaned_mag: np.ndarray, original_mag: np.ndarray, noise_mag: np.ndarray
    ) -> np.ndarray:
        """音乐噪声抑制 - 基于邻域平均"""
        kernel_size = 3
        smoothed = np.zeros_like(cleaned_mag)

        for i in range(cleaned_mag.shape[0]):
            start = max(0, i - kernel_size // 2)
            end = min(cleaned_mag.shape[0], i + kernel_size // 2 + 1)
            smoothed[i, :] = np.mean(cleaned_mag[start:end, :], axis=0)

        residual = original_mag - noise_mag
        mask = (residual > 0).astype(float)
        result = mask * cleaned_mag + (1 - mask) * smoothed * 0.5

        return result

    def _temporal_smoothing(self, magnitude: np.ndarray, smooth_factor: float = 0.6) -> np.ndarray:
        """时域平滑 - 减少音乐噪声"""
        smoothed = np.zeros_like(magnitude)
        smoothed[:, 0] = magnitude[:, 0]

        for t in range(1, magnitude.shape[1]):
            smoothed[:, t] = smooth_factor * smoothed[:, t - 1] + (1 - smooth_factor) * magnitude[:, t]

        return smoothed

    def _clip_protection(self, audio: np.ndarray, max_amp: float = 0.99) -> np.ndarray:
        """限幅保护 - 防止削波失真"""
        peak = np.max(np.abs(audio))
        if peak > max_amp:
            audio = audio * (max_amp / peak)
        return np.clip(audio, -1.0, 1.0)

    def _stft(self, signal: np.ndarray, n_fft: int) -> np.ndarray:
        try:
            import librosa
            return librosa.stft(signal, n_fft=n_fft, hop_length=self.hop_length)
        except ImportError:
            return self._stft_numpy(signal, n_fft)

    def _stft_numpy(self, signal: np.ndarray, n_fft: int) -> np.ndarray:
        window = np.hanning(n_fft)
        n_frames = 1 + (len(signal) - n_fft) // self.hop_length
        stft_matrix = np.zeros((n_fft // 2 + 1, n_frames), dtype=np.complex64)
        for i in range(n_frames):
            start = i * self.hop_length
            frame = signal[start : start + n_fft] * window
            stft_matrix[:, i] = np.fft.rfft(frame, n=n_fft)
        return stft_matrix

    def _istft(self, stft_matrix: np.ndarray) -> np.ndarray:
        try:
            import librosa
            return librosa.istft(stft_matrix, hop_length=self.hop_length)
        except ImportError:
            return self._istft_numpy(stft_matrix)

    def _istft_numpy(self, stft_matrix: np.ndarray) -> np.ndarray:
        n_fft = (stft_matrix.shape[0] - 1) * 2
        n_frames = stft_matrix.shape[1]
        output_length = n_fft + (n_frames - 1) * self.hop_length
        output = np.zeros(output_length, dtype=np.float32)
        window = np.hanning(n_fft)
        window_sum = np.zeros(output_length, dtype=np.float32)
        for i in range(n_frames):
            start = i * self.hop_length
            frame = np.fft.irfft(stft_matrix[:, i], n=n_fft)
            output[start : start + n_fft] += frame * window
            window_sum[start : start + n_fft] += window
        window_sum = np.maximum(window_sum, 1e-10)
        output /= window_sum
        return output

    def _match_length(self, audio: np.ndarray, target_length: int) -> np.ndarray:
        if len(audio) < target_length:
            return np.pad(audio, (0, target_length - len(audio)))
        return audio[:target_length]


class WienerFilter:
    """增强版维纳滤波 - 修复收敛和数值稳定性问题"""

    def __init__(
        self,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        n_iter: int = WIENER_NR_ITER,
        gain_floor: float = 0.05,
        psd_smooth: float = 0.8,
    ):
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.n_iter = n_iter
        self.gain_floor = gain_floor
        self.psd_smooth = psd_smooth
        self._noise_psd: Optional[np.ndarray] = None
        self._noise_estimator = AdvancedNoiseEstimator(n_fft=n_fft, hop_length=hop_length)

    def estimate_noise(self, noise_samples: np.ndarray) -> np.ndarray:
        self._noise_psd = self._noise_estimator.initialize_noise(noise_samples)
        logger.info(f"Wiener noise PSD estimated, shape={self._noise_psd.shape}")
        return self._noise_psd

    def denoise(self, audio: np.ndarray) -> np.ndarray:
        if self._noise_psd is None:
            logger.warning("Noise PSD not estimated, using adaptive estimation")
            self._adaptive_noise_init(audio)

        stft = self._stft(audio)
        magnitude = np.abs(stft)
        phase = np.angle(stft)

        noisy_psd = magnitude ** 2

        if self.psd_smooth < 1.0:
            noisy_psd = self._smooth_psd(noisy_psd, self.psd_smooth)

        clean_psd = np.zeros_like(noisy_psd)
        noise_psd = self._noise_psd + 1e-10

        for iter_idx in range(self.n_iter):
            prior_snr = clean_psd / noise_psd
            gain = prior_snr / (prior_snr + 1)
            gain = np.maximum(gain, self.gain_floor)

            clean_psd = gain * noisy_psd

            if iter_idx < self.n_iter - 1:
                clean_psd = self._smooth_psd(clean_psd, 0.9)

        gain = np.maximum(clean_psd / (clean_psd + noise_psd), self.gain_floor)
        clean_mag = magnitude * gain

        clean_stft = clean_mag * np.exp(1j * phase)
        clean_audio = self._istft(clean_stft)

        clean_audio = self._match_length(clean_audio, len(audio))
        clean_audio = self._clip_protection(clean_audio)

        return clean_audio.astype(np.float32)

    def _adaptive_noise_init(self, audio: np.ndarray):
        rms_list = []
        frame_size = self.n_fft
        for i in range(0, len(audio) - frame_size, self.hop_length):
            frame = audio[i : i + frame_size]
            rms = np.sqrt(np.mean(frame ** 2))
            rms_list.append(rms)

        if rms_list:
            threshold = np.percentile(rms_list, 30)
            noise_frames = []
            for i in range(0, len(audio) - frame_size, self.hop_length):
                frame = audio[i : i + frame_size]
                rms = np.sqrt(np.mean(frame ** 2))
                if rms <= threshold:
                    noise_frames.append(frame)

            if noise_frames:
                noise_samples = np.concatenate(noise_frames[:min(10, len(noise_frames))])
                self.estimate_noise(noise_samples)
            else:
                self._noise_psd = np.ones((self.n_fft // 2 + 1, 1)) * 1e-8
        else:
            self._noise_psd = np.ones((self.n_fft // 2 + 1, 1)) * 1e-8

    def _smooth_psd(self, psd: np.ndarray, smooth_factor: float) -> np.ndarray:
        smoothed = np.zeros_like(psd)
        smoothed[:, 0] = psd[:, 0]
        for t in range(1, psd.shape[1]):
            smoothed[:, t] = smooth_factor * smoothed[:, t - 1] + (1 - smooth_factor) * psd[:, t]
        return smoothed

    def _clip_protection(self, audio: np.ndarray, max_amp: float = 0.99) -> np.ndarray:
        peak = np.max(np.abs(audio))
        if peak > max_amp:
            audio = audio * (max_amp / peak)
        return np.clip(audio, -1.0, 1.0)

    def _stft(self, signal: np.ndarray) -> np.ndarray:
        try:
            import librosa
            return librosa.stft(signal, n_fft=self.n_fft, hop_length=self.hop_length)
        except ImportError:
            ss = SpectralSubtraction(n_fft=self.n_fft, hop_length=self.hop_length)
            return ss._stft_numpy(signal, self.n_fft)

    def _istft(self, stft_matrix: np.ndarray) -> np.ndarray:
        try:
            import librosa
            return librosa.istft(stft_matrix, hop_length=self.hop_length)
        except ImportError:
            ss = SpectralSubtraction(n_fft=self.n_fft, hop_length=self.hop_length)
            return ss._istft_numpy(stft_matrix)

    def _match_length(self, audio: np.ndarray, target_length: int) -> np.ndarray:
        if len(audio) < target_length:
            return np.pad(audio, (0, target_length - len(audio)))
        return audio[:target_length]


class WaveletDenoise:
    """增强版小波降噪 - 修复强噪音和边界效应问题"""

    def __init__(
        self,
        wavelet: str = WAVELET_WAVELET,
        level: int = WAVELET_LEVEL,
        mode: str = WAVELET_MODE,
        adaptive_threshold: bool = True,
        boundary_protection: bool = True,
    ):
        self.wavelet = wavelet
        self.level = level
        self.mode = mode
        self.adaptive_threshold = adaptive_threshold
        self.boundary_protection = boundary_protection

    def denoise(self, audio: np.ndarray) -> np.ndarray:
        original_length = len(audio)

        if self.boundary_protection:
            audio = self._pad_boundary(audio)

        try:
            import pywt
            max_level = min(self.level, pywt.dwt_max_level(len(audio), pywt.Wavelet(self.wavelet).dec_len))
            if max_level < 1:
                max_level = 1

            coeffs = pywt.wavedec(audio, self.wavelet, level=max_level)

            sigma = self._estimate_noise_level(coeffs)

            new_coeffs = list(coeffs)
            for i in range(1, len(new_coeffs)):
                coeff = new_coeffs[i]

                if self.adaptive_threshold:
                    level_factor = 1.0 + 0.2 * (len(new_coeffs) - i)
                    threshold = sigma * np.sqrt(2 * np.log(len(coeff))) * level_factor
                else:
                    threshold = sigma * np.sqrt(2 * np.log(len(coeff)))

                new_coeffs[i] = pywt.threshold(coeff, threshold, mode=self.mode)

            denoised = pywt.waverec(new_coeffs, self.wavelet)

        except ImportError:
            logger.warning("pywt not available, using enhanced moving average filter")
            denoised = self._enhanced_smooth(audio)

        if self.boundary_protection:
            denoised = self._trim_boundary(denoised, original_length)

        if len(denoised) > original_length:
            denoised = denoised[:original_length]
        elif len(denoised) < original_length:
            denoised = np.pad(denoised, (0, original_length - len(denoised)))

        denoised = self._clip_protection(denoised)

        return denoised.astype(np.float32)

    def _estimate_noise_level(self, coeffs) -> float:
        """鲁棒的噪声水平估计"""
        detail_coeffs = coeffs[-1]
        sigma = np.median(np.abs(detail_coeffs)) / 0.6745

        if sigma < 1e-6:
            sigma = np.std(detail_coeffs) * 0.5

        return max(sigma, 1e-8)

    def _pad_boundary(self, audio: np.ndarray, pad_samples: int = 512) -> np.ndarray:
        """对称边界填充 - 减少边界效应"""
        return np.pad(audio, (pad_samples, pad_samples), mode="symmetric")

    def _trim_boundary(self, audio: np.ndarray, original_length: int, pad_samples: int = 512) -> np.ndarray:
        start = pad_samples
        end = start + original_length
        if end <= len(audio):
            return audio[start:end]
        return audio[pad_samples: pad_samples + original_length]

    def _enhanced_smooth(self, audio: np.ndarray) -> np.ndarray:
        """增强型平滑 - 多级平滑"""
        denoised = audio.copy()

        for kernel_size in [3, 5, 7]:
            kernel = np.hanning(kernel_size)
            kernel = kernel / kernel.sum()
            denoised = np.convolve(denoised, kernel, mode="same")

        return denoised

    def _clip_protection(self, audio: np.ndarray, max_amp: float = 0.99) -> np.ndarray:
        peak = np.max(np.abs(audio))
        if peak > max_amp:
            audio = audio * (max_amp / peak)
        return np.clip(audio, -1.0, 1.0)


class NoiseEstimator:
    @staticmethod
    def estimate_from_silence(audio: np.ndarray, sample_rate: int = SAMPLE_RATE, silence_duration: float = 0.5) -> np.ndarray:
        silence_samples = int(silence_duration * sample_rate)
        if len(audio) < silence_samples:
            silence_samples = len(audio) // 2
        return audio[:silence_samples]

    @staticmethod
    def estimate_energy_threshold(audio: np.ndarray, frame_length: int = 2048, hop_length: int = 512) -> float:
        try:
            import librosa
            rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
        except ImportError:
            rms = NoiseEstimator._compute_rms(audio, frame_length, hop_length)
        return np.percentile(rms, 10)

    @staticmethod
    def _compute_rms(audio: np.ndarray, frame_length: int, hop_length: int) -> np.ndarray:
        rms_list = []
        for i in range(0, len(audio) - frame_length, hop_length):
            frame = audio[i : i + frame_length]
            rms = np.sqrt(np.mean(frame ** 2))
            rms_list.append(rms)
        return np.array(rms_list)


class AudioDenoiser:
    def __init__(
        self,
        method: str = "spectral_subtraction",
        sample_rate: int = SAMPLE_RATE,
    ):
        self.method = method
        self.sample_rate = sample_rate
        self._initialized = False
        self._error_count = 0
        self._max_errors = 5

        if method == "spectral_subtraction":
            self._denoiser = SpectralSubtraction()
        elif method == "wiener":
            self._denoiser = WienerFilter()
        elif method == "wavelet":
            self._denoiser = WaveletDenoise()
        elif method == "none":
            self._denoiser = None
        else:
            raise ValueError(f"Unknown denoise method: {method}")

    def estimate_noise(self, noise_samples: np.ndarray):
        if self._denoiser is None:
            logger.info("No denoiser, skipping noise estimation")
            return

        try:
            if len(noise_samples) < 100:
                logger.warning("Noise samples too short, padding")
                noise_samples = np.pad(noise_samples, (0, max(0, 1000 - len(noise_samples))))

            if hasattr(self._denoiser, "estimate_noise"):
                self._denoiser.estimate_noise(noise_samples)
                self._initialized = True
                self._error_count = 0
                logger.info(f"Noise estimated successfully for method={self.method}")
        except Exception as e:
            logger.error(f"Noise estimation failed: {e}")
            self._initialized = False

    def auto_estimate_noise(self, audio: np.ndarray, silence_portion: float = 0.15) -> bool:
        if self._denoiser is None:
            return False

        if len(audio) < 1000:
            logger.warning("Audio too short for auto noise estimation")
            return False

        try:
            silence_samples = int(len(audio) * silence_portion)

            rms_list = []
            frame_size = 1024
            for i in range(0, len(audio) - frame_size, 256):
                frame = audio[i : i + frame_size]
                rms = np.sqrt(np.mean(frame ** 2))
                rms_list.append(rms)

            if rms_list:
                threshold = np.percentile(rms_list, 20)
                noise_segments = []
                for i in range(0, len(audio) - frame_size, 256):
                    frame = audio[i : i + frame_size]
                    rms = np.sqrt(np.mean(frame ** 2))
                    if rms <= threshold:
                        noise_segments.append(frame)

                if noise_segments:
                    max_segments = min(20, len(noise_segments))
                    noise_samples = np.concatenate(noise_segments[:max_segments])
                    self.estimate_noise(noise_samples)
                    return True

            noise_samples = audio[:silence_samples]
            self.estimate_noise(noise_samples)
            return True

        except Exception as e:
            logger.error(f"Auto noise estimation failed: {e}")
            return False

    def denoise(self, audio: np.ndarray) -> np.ndarray:
        if self._denoiser is None:
            return audio

        try:
            if not self._initialized and hasattr(self._denoiser, "estimate_noise"):
                logger.info(f"Performing adaptive noise initialization for {self.method}")
                self.auto_estimate_noise(audio)

            if len(audio) == 0:
                logger.warning("Empty audio input")
                return audio

            if not np.isfinite(audio).all():
                logger.warning("Audio contains NaN/Inf, replacing with zeros")
                audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0)

            denoised = self._denoiser.denoise(audio)

            if not np.isfinite(denoised).all():
                logger.warning("Denoised output contains NaN/Inf, returning original")
                return audio.astype(np.float32)

            self._error_count = 0
            return denoised.astype(np.float32)

        except Exception as e:
            self._error_count += 1
            logger.error(f"Denoise failed (attempt {self._error_count}/{self._max_errors}): {e}")

            if self._error_count >= self._max_errors:
                logger.error("Too many denoise errors, returning original audio permanently")
                self._denoiser = None

            return audio.astype(np.float32)

    def get_method_info(self) -> dict:
        return {
            "method": self.method,
            "initialized": self._initialized,
            "sample_rate": self.sample_rate,
            "error_count": self._error_count,
            "is_functional": self._denoiser is not None,
        }


def get_available_methods() -> list:
    return ["spectral_subtraction", "wiener", "wavelet", "none"]


def create_denoiser(method: str = "spectral_subtraction", **kwargs) -> AudioDenoiser:
    return AudioDenoiser(method=method, **kwargs)
