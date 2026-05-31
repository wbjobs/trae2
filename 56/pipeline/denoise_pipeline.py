import numpy as np
from typing import Dict, Any, Optional
from dataclasses import dataclass
import time

from denoiser import AudioDenoiser


@dataclass
class DenoiseResult:
    denoised_audio: np.ndarray
    noise_level_before: float
    noise_level_after: float
    snr_improvement: float
    processing_time: float
    method_used: str
    impulse_noise_detected: bool


class DenoisePipeline:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.denoiser = AudioDenoiser(sample_rate=sample_rate)
        self.stats = {
            'total_processed': 0,
            'avg_snr_improvement': 0.0,
            'failures': 0
        }

    def process(self, audio: np.ndarray, sample_rate: Optional[int] = None,
                config: Optional[Dict[str, Any]] = None) -> DenoiseResult:
        start_time = time.time()
        sr = sample_rate or self.sample_rate

        try:
            if config is None:
                config = {}

            method = config.get('method', 'industrial')

            if method == 'industrial':
                result = self.denoiser.industrial_denoise(audio, sample_rate=sr)
                denoised = result['denoised_audio']
                snr_before = result.get('snr_estimate', 0)
                impulse_detected = result.get('impulse_noise_detected', False)
            elif method == 'spectral':
                denoised = self.denoiser.spectral_subtraction(audio, sample_rate=sr)
                snr_before = self._estimate_snr(audio)
                impulse_detected = False
            elif method == 'multiband':
                denoised = self.denoiser.multi_band_denoise(audio, sample_rate=sr)
                snr_before = self._estimate_snr(audio)
                impulse_detected = False
            else:
                denoised = self.denoiser.reduce_noise(audio, sample_rate=sr)
                snr_before = self._estimate_snr(audio)
                impulse_detected = False

            noise_before = self._calculate_noise_level(audio)
            noise_after = self._calculate_noise_level(denoised)
            snr_improvement = noise_before - noise_after if noise_after > 0 else 0

            proc_time = time.time() - start_time

            self.stats['total_processed'] += 1
            self.stats['avg_snr_improvement'] = (
                (self.stats['avg_snr_improvement'] * (self.stats['total_processed'] - 1) +
                 snr_improvement) / self.stats['total_processed']
            )

            return DenoiseResult(
                denoised_audio=denoised,
                noise_level_before=float(noise_before),
                noise_level_after=float(noise_after),
                snr_improvement=float(snr_improvement),
                processing_time=proc_time,
                method_used=method,
                impulse_noise_detected=impulse_detected
            )

        except Exception as e:
            self.stats['failures'] += 1
            proc_time = time.time() - start_time
            return DenoiseResult(
                denoised_audio=audio,
                noise_level_before=float(self._calculate_noise_level(audio)),
                noise_level_after=float(self._calculate_noise_level(audio)),
                snr_improvement=0.0,
                processing_time=proc_time,
                method_used='failed',
                impulse_noise_detected=False
            )

    def _estimate_snr(self, audio: np.ndarray) -> float:
        try:
            signal_power = np.mean(audio ** 2)
            noise_est = np.percentile(np.abs(audio), 10)
            noise_power = noise_est ** 2
            if noise_power > 0:
                return 10 * np.log10(signal_power / noise_power)
        except:
            pass
        return 0.0

    def _calculate_noise_level(self, audio: np.ndarray) -> float:
        try:
            return float(np.sqrt(np.mean(audio ** 2)))
        except:
            return 0.0

    def get_stats(self) -> Dict[str, Any]:
        return dict(self.stats)

    def reset_stats(self):
        self.stats = {
            'total_processed': 0,
            'avg_snr_improvement': 0.0,
            'failures': 0
        }
