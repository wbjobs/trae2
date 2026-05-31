import numpy as np
import noisereduce as nr
from scipy import signal
from scipy.signal import butter, lfilter, wiener, medfilt, hilbert, find_peaks
from scipy.ndimage import gaussian_filter1d
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class AudioDenoiser:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self._noise_profile_cache = {}
        self._adaptive_threshold = 0.5

    def denoise(
        self,
        audio: np.ndarray,
        sample_rate: Optional[int] = None,
        method: str = "adaptive_industrial"
    ) -> np.ndarray:
        sr = sample_rate or self.sample_rate
        
        audio = self.remove_dc_offset(audio)
        
        snr_estimate = self._estimate_snr(audio)
        
        if method == "adaptive_industrial":
            return self._adaptive_industrial_denoise(audio, sr, snr_estimate)
        elif method == "spectral":
            return self._spectral_denoise_improved(audio, sr)
        elif method == "wavelet":
            return self._wavelet_denoise(audio)
        elif method == "butterworth":
            return self._butterworth_bandpass(audio, sr)
        elif method == "combined":
            return self._combined_denoise_improved(audio, sr)
        elif method == "wiener":
            return self._wiener_denoise(audio)
        elif method == "industrial_strong":
            return self._industrial_strong_noise_denoise(audio, sr)
        else:
            raise ValueError(f"Unknown denoising method: {method}")

    def _estimate_snr(self, audio: np.ndarray) -> float:
        rms = np.sqrt(np.mean(audio ** 2))
        if rms == 0:
            return 0.0
        
        peak = np.max(np.abs(audio))
        if peak == 0:
            return 0.0
        
        env = np.abs(hilbert(audio))
        noise_floor = np.percentile(env, 10)
        signal_level = np.percentile(env, 90)
        
        if noise_floor > 0:
            snr = 20 * np.log10(signal_level / (noise_floor + 1e-10))
        else:
            snr = 20 * np.log10(peak / (rms + 1e-10))
        
        return float(snr)

    def _adaptive_industrial_denoise(
        self, 
        audio: np.ndarray, 
        sample_rate: int,
        snr_estimate: float
    ) -> np.ndarray:
        try:
            if snr_estimate < -5:
                return self._industrial_strong_noise_denoise(audio, sample_rate)
            elif snr_estimate < 10:
                return self._medium_noise_denoise(audio, sample_rate)
            else:
                return self._low_noise_denoise(audio, sample_rate)
        except Exception as e:
            logger.warning(f"Adaptive denoising failed: {e}, fallback to spectral")
            return self._spectral_denoise_improved(audio, sample_rate)

    def _industrial_strong_noise_denoise(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        try:
            audio_float = audio.astype(np.float32)
            if audio_float.ndim > 1:
                audio_float = audio_float.mean(axis=1)
            
            max_val = np.max(np.abs(audio_float))
            if max_val > 0:
                audio_norm = audio_float / max_val
            else:
                audio_norm = audio_float
            
            audio_bp = self._butterworth_bandpass(audio_norm, sample_rate, lowcut=10.0, highcut=4000.0, order=6)
            
            noise_profile = self._robust_noise_estimation(audio_bp, sample_rate)
            
            reduced_noise = nr.reduce_noise(
                y=audio_bp,
                sr=sample_rate,
                y_noise=noise_profile,
                prop_decrease=0.85,
                n_std_thresh_stationary=2.0,
                stationary=True,
                freq_mask_smooth_hz=100,
                time_mask_smooth_ms=50
            )
            
            reduced_noise = wiener(reduced_noise, mysize=5)
            
            reduced_noise = medfilt(reduced_noise, kernel_size=3)
            
            reduced_noise = self._spectral_subtraction_enhanced(
                reduced_noise, 
                sample_rate, 
                noise_profile
            )
            
            audio_hp = self._highpass_filter(reduced_noise, sample_rate, cutoff=15.0)
            
            if max_val > 0:
                audio_hp = audio_hp * max_val
            
            audio_hp = self._normalize_output(audio_hp, audio_float)
            
            return audio_hp.astype(audio.dtype)
        except Exception as e:
            logger.warning(f"Strong noise denoising failed: {e}, returning bandpass filtered")
            return self._butterworth_bandpass(audio, sample_rate)

    def _medium_noise_denoise(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        try:
            audio_bp = self._butterworth_bandpass(audio, sample_rate, lowcut=20.0, highcut=4000.0, order=4)
            
            noise_profile = self._robust_noise_estimation(audio_bp, sample_rate, noise_duration=0.2)
            
            reduced_noise = nr.reduce_noise(
                y=audio_bp,
                sr=sample_rate,
                y_noise=noise_profile,
                prop_decrease=0.75,
                n_std_thresh_stationary=1.5,
                stationary=True
            )
            
            reduced_noise = wiener(reduced_noise, mysize=3)
            
            return reduced_noise.astype(audio.dtype)
        except Exception as e:
            logger.warning(f"Medium noise denoising failed: {e}")
            return audio

    def _low_noise_denoise(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        try:
            audio_bp = self._butterworth_bandpass(audio, sample_rate, lowcut=20.0, highcut=5000.0, order=4)
            
            noise_samples = min(int(0.1 * sample_rate), len(audio_bp) // 10)
            if noise_samples > 0:
                noise_clip = audio_bp[:noise_samples]
                reduced_noise = nr.reduce_noise(
                    y=audio_bp,
                    sr=sample_rate,
                    y_noise=noise_clip,
                    prop_decrease=0.6,
                    n_std_thresh_stationary=1.0,
                    stationary=True
                )
                return reduced_noise.astype(audio.dtype)
            return audio_bp
        except Exception as e:
            logger.warning(f"Low noise denoising failed: {e}")
            return audio

    def _robust_noise_estimation(
        self, 
        audio: np.ndarray, 
        sample_rate: int,
        noise_duration: float = 0.5
    ) -> np.ndarray:
        n_samples = len(audio)
        noise_samples = min(int(noise_duration * sample_rate), n_samples)
        
        frame_size = int(0.025 * sample_rate)
        hop_size = int(0.010 * sample_rate)
        n_frames = (n_samples - frame_size) // hop_size + 1
        
        frame_energies = []
        for i in range(n_frames):
            start = i * hop_size
            end = start + frame_size
            frame = audio[start:end]
            energy = np.sum(frame ** 2)
            frame_energies.append((i, energy))
        
        frame_energies.sort(key=lambda x: x[1])
        n_noise_frames = max(1, int(n_frames * 0.15))
        
        noise_frames = []
        for idx, _ in frame_energies[:n_noise_frames]:
            start = idx * hop_size
            end = start + frame_size
            noise_frames.append(audio[start:end])
        
        if noise_frames:
            noise_profile = np.concatenate(noise_frames)
            if len(noise_profile) < noise_samples:
                repeats = (noise_samples // len(noise_profile)) + 1
                noise_profile = np.tile(noise_profile, repeats)[:noise_samples]
        else:
            noise_profile = audio[:noise_samples] if n_samples > noise_samples else audio
        
        return noise_profile

    def _spectral_subtraction_enhanced(
        self, 
        audio: np.ndarray, 
        sample_rate: int,
        noise_profile: np.ndarray
    ) -> np.ndarray:
        try:
            n_fft = min(2048, len(audio) // 4)
            hop_length = n_fft // 4
            
            n_stft = len(noise_profile)
            noise_fft = np.fft.rfft(noise_profile[:n_fft])
            noise_mag = np.abs(noise_fft)
            
            audio_stft = signal.stft(audio, fs=sample_rate, nperseg=n_fft, noverlap=n_fft-hop_length)[2]
            audio_mag = np.abs(audio_stft)
            audio_phase = np.angle(audio_stft)
            
            alpha = 2.0
            beta = 0.01
            enhanced_mag = np.maximum(audio_mag - alpha * noise_mag[:, np.newaxis], beta * audio_mag)
            
            enhanced_stft = enhanced_mag * np.exp(1j * audio_phase)
            _, enhanced_audio = signal.istft(enhanced_stft, fs=sample_rate, nperseg=n_fft, noverlap=n_fft-hop_length)
            
            if len(enhanced_audio) > len(audio):
                enhanced_audio = enhanced_audio[:len(audio)]
            elif len(enhanced_audio) < len(audio):
                enhanced_audio = np.pad(enhanced_audio, (0, len(audio) - len(enhanced_audio)))
            
            return enhanced_audio.astype(audio.dtype)
        except Exception as e:
            logger.warning(f"Spectral subtraction failed: {e}")
            return audio

    def _spectral_denoise_improved(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        try:
            audio_float = audio.astype(np.float32)
            if audio_float.ndim > 1:
                audio_float = audio_float.mean(axis=1)
            
            max_val = np.max(np.abs(audio_float))
            if max_val > 0:
                audio_norm = audio_float / max_val
            else:
                audio_norm = audio_float
            
            noise_profile = self._robust_noise_estimation(audio_norm, sample_rate, noise_duration=0.2)
            
            reduced_noise = nr.reduce_noise(
                y=audio_norm,
                sr=sample_rate,
                y_noise=noise_profile,
                prop_decrease=0.8,
                n_std_thresh_stationary=1.5,
                stationary=True
            )
            
            if max_val > 0:
                reduced_noise = reduced_noise * max_val
            
            return reduced_noise.astype(audio.dtype)
        except Exception as e:
            logger.warning(f"Spectral denoising failed: {e}, returning original")
            return audio

    def _butterworth_bandpass(
        self,
        audio: np.ndarray,
        sample_rate: int,
        lowcut: float = 20.0,
        highcut: float = 4000.0,
        order: int = 4
    ) -> np.ndarray:
        try:
            nyquist = 0.5 * sample_rate
            low = lowcut / nyquist
            high = highcut / nyquist
            
            if high >= 1.0:
                high = 0.99
            
            if low >= high:
                return audio
            
            b, a = butter(order, [low, high], btype='band')
            
            if audio.ndim > 1:
                result = np.zeros_like(audio)
                for i in range(audio.shape[1]):
                    result[:, i] = lfilter(b, a, audio[:, i])
                return result
            else:
                return lfilter(b, a, audio)
        except Exception as e:
            logger.warning(f"Butterworth filter failed: {e}, returning original")
            return audio

    def _highpass_filter(
        self,
        audio: np.ndarray,
        sample_rate: int,
        cutoff: float = 15.0,
        order: int = 3
    ) -> np.ndarray:
        try:
            nyquist = 0.5 * sample_rate
            norm_cutoff = cutoff / nyquist
            
            if norm_cutoff >= 1.0:
                return audio
            
            b, a = butter(order, norm_cutoff, btype='highpass')
            return lfilter(b, a, audio)
        except Exception as e:
            logger.warning(f"Highpass filter failed: {e}")
            return audio

    def _wiener_denoise(self, audio: np.ndarray) -> np.ndarray:
        try:
            if audio.ndim > 1:
                result = np.zeros_like(audio)
                for i in range(audio.shape[1]):
                    result[:, i] = wiener(audio[:, i])
                return result
            else:
                return wiener(audio)
        except Exception as e:
            logger.warning(f"Wiener denoising failed: {e}, returning original")
            return audio

    def _wavelet_denoise(self, audio: np.ndarray) -> np.ndarray:
        try:
            import pywt
            
            coeffs = pywt.wavedec(audio, 'db8', level=5)
            
            sigma = np.median(np.abs(coeffs[-1])) / 0.6745
            uthresh = sigma * np.sqrt(2 * np.log(len(audio)))
            
            coeffs[1:] = [pywt.threshold(c, value=uthresh, mode='soft') for c in coeffs[1:]]
            
            reconstructed = pywt.waverec(coeffs, 'db8')
            
            if len(reconstructed) != len(audio):
                reconstructed = reconstructed[:len(audio)]
            
            return reconstructed
        except ImportError:
            logger.warning("PyWavelets not installed, using spectral denoising instead")
            return self._spectral_denoise_improved(audio, self.sample_rate)
        except Exception as e:
            logger.warning(f"Wavelet denoising failed: {e}, returning original")
            return audio

    def _combined_denoise_improved(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        try:
            audio_bp = self._butterworth_bandpass(audio, sample_rate, lowcut=20.0, highcut=4000.0, order=4)
            
            noise_profile = self._robust_noise_estimation(audio_bp, sample_rate)
            
            audio_spec = nr.reduce_noise(
                y=audio_bp,
                sr=sample_rate,
                y_noise=noise_profile,
                prop_decrease=0.75,
                n_std_thresh_stationary=1.5,
                stationary=True
            )
            
            audio_wiener = wiener(audio_spec, mysize=3)
            
            return audio_wiener.astype(audio.dtype)
        except Exception as e:
            logger.warning(f"Combined denoising failed: {e}, returning original")
            return audio

    def remove_dc_offset(self, audio: np.ndarray) -> np.ndarray:
        if audio.ndim > 1:
            return audio - np.mean(audio, axis=0, keepdims=True)
        return audio - np.mean(audio)

    def normalize_audio(self, audio: np.ndarray, target_db: float = -3.0) -> np.ndarray:
        rms = np.sqrt(np.mean(audio ** 2))
        if rms == 0:
            return audio
        
        current_db = 20 * np.log10(rms)
        target_rms = 10 ** (target_db / 20)
        gain = target_rms / rms
        
        return audio * gain

    def _normalize_output(self, output: np.ndarray, input_audio: np.ndarray) -> np.ndarray:
        input_rms = np.sqrt(np.mean(input_audio ** 2))
        output_rms = np.sqrt(np.mean(output ** 2))
        
        if output_rms > 0 and input_rms > 0:
            gain = min(input_rms / output_rms, 1.0)
            output = output * gain
        
        max_output = np.max(np.abs(output))
        if max_output > 0.95:
            output = output * (0.95 / max_output)
        
        return output

    def get_snr(self, clean_audio: np.ndarray, noisy_audio: np.ndarray) -> float:
        noise = noisy_audio - clean_audio
        signal_power = np.mean(clean_audio ** 2)
        noise_power = np.mean(noise ** 2)
        
        if noise_power == 0:
            return 100.0
        
        snr = 10 * np.log10(signal_power / noise_power)
        return snr

    def estimate_noise_profile(self, audio: np.ndarray, sample_rate: int) -> dict:
        try:
            noise_profile = self._robust_noise_estimation(audio, sample_rate)
            
            snr = self._estimate_snr(audio)
            
            return {
                "noise_mean": float(np.mean(noise_profile)),
                "noise_std": float(np.std(noise_profile)),
                "noise_rms": float(np.sqrt(np.mean(noise_profile ** 2))),
                "noise_peak": float(np.max(np.abs(noise_profile))),
                "estimated_snr_db": snr,
                "noise_level_category": "high" if snr < 0 else "medium" if snr < 10 else "low"
            }
        except Exception as e:
            logger.error(f"Error estimating noise profile: {e}")
            return {}
