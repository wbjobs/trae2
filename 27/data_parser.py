import numpy as np
import logging
from typing import List, Optional, Tuple
from datetime import datetime
import os
import struct
from scipy.ndimage import gaussian_filter, median_filter, uniform_filter
from scipy.signal import wiener

from config import GlobalConfig
from data_structures import ObservationFrame, DenoisedFrame, Spot
from utils import estimate_noise_level, find_local_maxima, fit_2d_gaussian, calculate_snr


class RawDataParser:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self.supported_formats = ['.fits', '.raw', '.npy', '.txt', '.dat']

    def parse_file(self, filepath: str) -> List[ObservationFrame]:
        ext = os.path.splitext(filepath)[1].lower()

        if ext == '.fits':
            return self._parse_fits(filepath)
        elif ext == '.raw':
            return self._parse_raw(filepath)
        elif ext == '.npy':
            return self._parse_npy(filepath)
        elif ext in ['.txt', '.dat']:
            return self._parse_text(filepath)
        else:
            raise ValueError(f"Unsupported file format: {ext}")

    def _validate_and_clean_data(self, data: np.ndarray) -> np.ndarray:
        data_float = np.asarray(data, dtype=np.float64)
        data_clean = np.nan_to_num(data_float, nan=0.0, posinf=0.0, neginf=0.0)

        if np.any(data_clean < 0):
            data_clean = np.maximum(data_clean, 0)

        if data_clean.size > 0:
            median_val = np.median(data_clean)
            std_val = np.std(data_clean)
            if std_val > 0:
                z_scores = np.abs((data_clean - median_val) / std_val)
                data_clean[z_scores > 10] = median_val

        return data_clean

    def _parse_fits(self, filepath: str) -> List[ObservationFrame]:
        try:
            from astropy.io import fits
        except ImportError:
            raise ImportError("astropy package required for FITS files")

        frames = []
        with fits.open(filepath) as hdul:
            for i, hdu in enumerate(hdul):
                if hasattr(hdu, 'data') and hdu.data is not None:
                    data = np.asarray(hdu.data, dtype=np.float64)
                    data = self._validate_and_clean_data(data)
                    header = hdu.header

                    timestamp = header.get('DATE-OBS', datetime.now().isoformat())
                    if isinstance(timestamp, str):
                        try:
                            timestamp = datetime.fromisoformat(timestamp)
                        except ValueError:
                            timestamp = datetime.now()

                    exposure = float(header.get('EXPTIME', 0.0))
                    temperature = float(header.get('TEMP', 0.0))

                    if data.ndim == 2:
                        frames.append(ObservationFrame(
                            frame_id=i,
                            timestamp=timestamp,
                            exposure_time=exposure,
                            temperature=temperature,
                            data=data
                        ))
                    elif data.ndim == 3:
                        for j in range(data.shape[0]):
                            frames.append(ObservationFrame(
                                frame_id=i * 1000 + j,
                                timestamp=timestamp,
                                exposure_time=exposure,
                                temperature=temperature,
                                data=data[j]
                            ))

        return frames

    def _parse_raw(self, filepath: str) -> List[ObservationFrame]:
        frames = []
        try:
            with open(filepath, 'rb') as f:
                header = f.read(64)
                if len(header) < 16:
                    raise ValueError("Invalid RAW file: header too short")

                width, height, num_frames, data_type = struct.unpack('<IIII', header[:16])

                if width <= 0 or height <= 0 or num_frames <= 0:
                    raise ValueError(f"Invalid RAW file dimensions: {width}x{height}x{num_frames}")

                if data_type == 0:
                    dtype = np.uint8
                    bytes_per_pixel = 1
                elif data_type == 1:
                    dtype = np.uint16
                    bytes_per_pixel = 2
                else:
                    dtype = np.float32
                    bytes_per_pixel = 4

                frame_size = width * height * bytes_per_pixel

                for i in range(num_frames):
                    raw_data = f.read(frame_size)
                    if len(raw_data) < frame_size:
                        self.logger.warning(f"RAW file truncated at frame {i}")
                        break

                    try:
                        data = np.frombuffer(raw_data, dtype=dtype).reshape(height, width)
                        data = data.astype(np.float64)
                        data = self._validate_and_clean_data(data)

                        frames.append(ObservationFrame(
                            frame_id=i,
                            timestamp=datetime.now(),
                            exposure_time=0.0,
                            temperature=0.0,
                            data=data
                        ))
                    except Exception as e:
                        self.logger.warning(f"Failed to parse frame {i}: {e}")
                        continue

        except Exception as e:
            self.logger.error(f"Failed to parse RAW file: {e}")
            raise

        return frames

    def _parse_npy(self, filepath: str) -> List[ObservationFrame]:
        try:
            data = np.load(filepath)
            data = self._validate_and_clean_data(data)
            frames = []

            if data.ndim == 2:
                frames.append(ObservationFrame(
                    frame_id=0,
                    timestamp=datetime.now(),
                    exposure_time=0.0,
                    temperature=0.0,
                    data=data.astype(np.float64)
                ))
            elif data.ndim == 3:
                for i in range(data.shape[0]):
                    frames.append(ObservationFrame(
                        frame_id=i,
                        timestamp=datetime.now(),
                        exposure_time=0.0,
                        temperature=0.0,
                        data=data[i].astype(np.float64)
                    ))
            else:
                raise ValueError(f"Unsupported array dimensions: {data.ndim}")

            return frames
        except Exception as e:
            self.logger.error(f"Failed to parse NPY file: {e}")
            raise

    def _parse_text(self, filepath: str) -> List[ObservationFrame]:
        try:
            data = np.loadtxt(filepath)
            data = self._validate_and_clean_data(data)
            frames = []

            if data.ndim == 2:
                frames.append(ObservationFrame(
                    frame_id=0,
                    timestamp=datetime.now(),
                    exposure_time=0.0,
                    temperature=0.0,
                    data=data.astype(np.float64)
                ))
            elif data.ndim == 3:
                for i in range(data.shape[0]):
                    frames.append(ObservationFrame(
                        frame_id=i,
                        timestamp=datetime.now(),
                        exposure_time=0.0,
                        temperature=0.0,
                        data=data[i].astype(np.float64)
                    ))
            else:
                raise ValueError(f"Unsupported array dimensions: {data.ndim}")

            return frames
        except Exception as e:
            self.logger.error(f"Failed to parse text file: {e}")
            raise

    def generate_test_data(self, num_frames: int = 10,
                           shape: Tuple[int, int] = (512, 512),
                           num_spots: int = 5,
                           noise_level: float = 5.0) -> List[ObservationFrame]:
        frames = []
        spot_positions = []
        for _ in range(num_spots):
            x = np.random.uniform(50, shape[1] - 50)
            y = np.random.uniform(50, shape[0] - 50)
            vx = np.random.uniform(-1, 1)
            vy = np.random.uniform(-1, 1)
            spot_positions.append([x, y, vx, vy])

        for frame_idx in range(num_frames):
            data = np.random.normal(0, noise_level, shape)

            for spot in spot_positions:
                x, y = spot[0] + spot[2] * frame_idx, spot[1] + spot[3] * frame_idx
                if 0 <= x < shape[1] and 0 <= y < shape[0]:
                    y_grid, x_grid = np.ogrid[:shape[0], :shape[1]]
                    amplitude = np.random.uniform(50, 100)
                    sigma = np.random.uniform(3, 8)
                    gaussian = amplitude * np.exp(
                        -((x_grid - x) ** 2 + (y_grid - y) ** 2) / (2 * sigma ** 2)
                    )
                    data += gaussian

            frames.append(ObservationFrame(
                frame_id=frame_idx,
                timestamp=datetime.now(),
                exposure_time=0.1,
                temperature=25.0,
                data=data
            ))

        return frames


class FrameDenoiser:
    def __init__(self, config: GlobalConfig):
        self.config = config

    def denoise(self, frame: ObservationFrame, method: str = 'adaptive') -> DenoisedFrame:
        import time
        start_time = time.time()

        noise_level = estimate_noise_level(frame.data)
        threshold = noise_level * self.config.processing.noise_threshold

        if method == 'gaussian':
            denoised = self._gaussian_denoise(frame.data)
        elif method == 'median':
            denoised = self._median_denoise(frame.data)
        elif method == 'wiener':
            denoised = self._wiener_denoise(frame.data)
        elif method == 'adaptive':
            denoised = self._adaptive_denoise(frame.data, threshold)
        else:
            raise ValueError(f"Unknown denoising method: {method}")

        denoised = np.maximum(denoised, 0)

        processing_time = time.time() - start_time

        return DenoisedFrame(
            frame_id=frame.frame_id,
            original_frame=frame,
            denoised_data=denoised,
            noise_level=noise_level,
            denoising_method=method,
            processing_time=processing_time
        )

    def _gaussian_denoise(self, data: np.ndarray, sigma: float = 1.5) -> np.ndarray:
        return gaussian_filter(data, sigma=sigma)

    def _median_denoise(self, data: np.ndarray, size: int = 3) -> np.ndarray:
        return median_filter(data, size=size)

    def _wiener_denoise(self, data: np.ndarray, size: int = 5) -> np.ndarray:
        try:
            return wiener(data, mysize=size)
        except Exception:
            return self._gaussian_denoise(data)

    def _adaptive_denoise(self, data: np.ndarray, threshold: float) -> np.ndarray:
        data_clean = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
        data_float = data_clean.astype(np.float64)

        local_mean = uniform_filter(data_float, size=5)
        local_sq_mean = uniform_filter(data_float ** 2, size=5)
        local_var = np.maximum(local_sq_mean - local_mean ** 2, 0)

        noise_var_estimate = np.median(local_var[local_var > 0]) if np.any(local_var > 0) else 1.0
        noise_var = max(noise_var_estimate, 1e-6)

        signal_mask = np.abs(data_float - local_mean) > threshold
        gain = np.sqrt(np.maximum(local_var - noise_var, 0)) / np.maximum(local_var, 1e-6)

        result = np.where(
            signal_mask,
            data_float,
            local_mean + gain * (data_float - local_mean)
        )

        result = np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)
        return result.astype(np.float64)


class SpotDetector:
    def __init__(self, config: GlobalConfig):
        self.config = config

    def detect_spots(self, denoised_frame: DenoisedFrame) -> List[Spot]:
        data = denoised_frame.denoised_data
        noise_level = denoised_frame.noise_level
        threshold = noise_level * self.config.processing.noise_threshold
        threshold = max(threshold, self.config.processing.min_signal_intensity)

        peaks = find_local_maxima(data, threshold, min_distance=5)

        spots = []
        for peak in peaks:
            fit_result = fit_2d_gaussian(data, peak, radius=5)

            if fit_result is not None:
                x0, y0, amplitude, sigma_x, sigma_y = fit_result
                area = np.pi * sigma_x * sigma_y
                snr = calculate_snr(amplitude, noise_level)

                if snr > 3.0 and area > 3:
                    spot = Spot(
                        spot_id="",
                        x=float(x0),
                        y=float(y0),
                        intensity=float(amplitude),
                        area=float(area),
                        frame_id=denoised_frame.frame_id,
                        timestamp=denoised_frame.original_frame.timestamp,
                        snr=float(snr)
                    )
                    spots.append(spot)

        return spots
