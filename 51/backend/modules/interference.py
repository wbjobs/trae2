import numpy as np
from typing import Dict, Any, List, Tuple
from scipy import fftpack


class InterferenceCalculator:
    def __init__(self):
        self.c = 3e8
        self.MIN_WAVELENGTH = 10e-9
        self.MAX_RESOLUTION = 2000

    def calculate(
        self,
        elements: List[Dict[str, Any]],
        light_source: Dict[str, Any],
        simulation_type: str = "interference",
        resolution: int = 500
    ) -> Dict[str, Any]:
        wavelength = max(self.MIN_WAVELENGTH, light_source.get("wavelength", 632.8) * 1e-9)
        resolution = min(max(10, int(resolution)), self.MAX_RESOLUTION)
        k = 2 * np.pi / wavelength
        
        if simulation_type == "michelson":
            return self._calculate_michelson(elements, wavelength, k, resolution)
        elif simulation_type == "young":
            return self._calculate_young(elements, wavelength, k, resolution)
        elif simulation_type == "diffraction":
            return self._calculate_diffraction(elements, wavelength, k, resolution)
        elif simulation_type == "holography":
            return self._calculate_holography(elements, wavelength, k, resolution)
        else:
            return self._calculate_general(elements, wavelength, k, resolution)

    def _calculate_michelson(
        self,
        elements: List[Dict[str, Any]],
        wavelength: float,
        k: float,
        resolution: int
    ) -> Dict[str, Any]:
        mirrors = [e for e in elements if e["type"] == "mirror"]
        beam_splitters = [e for e in elements if e["type"] == "beam_splitter"]
        
        if len(mirrors) < 2 or len(beam_splitters) < 1:
            return self._generate_fringe_pattern(wavelength, resolution, "circular")
        
        m1_pos = mirrors[0]["position"]
        m2_pos = mirrors[1]["position"]
        bs_pos = beam_splitters[0]["position"]
        
        d1 = abs(m1_pos["x"] - bs_pos["x"])
        d2 = abs(m2_pos["y"] - bs_pos["y"])
        path_diff = 2 * abs(d1 - d2) * 1e-3
        
        x = np.linspace(-10, 10, resolution)
        y = np.linspace(-10, 10, resolution)
        X, Y = np.meshgrid(x, y)
        
        r = np.sqrt(X**2 + Y**2)
        theta = np.arctan2(r, 100)
        
        phase = k * (path_diff + 0.1 * r * 1e-3 * np.cos(theta))
        intensity = 0.5 * (1 + np.cos(phase))
        
        contrast = self._calculate_contrast(intensity)
        visibility = self._calculate_visibility(intensity)
        
        fringe_spacing = max(1e-6, wavelength * 1e3 / 2)
        max_r = float(np.max(r))
        fringe_count = max(0, int(max_r / fringe_spacing))
        
        return {
            "type": "michelson",
            "intensity": intensity.tolist(),
            "x": x.tolist(),
            "y": y.tolist(),
            "path_difference": float(path_diff),
            "fringe_spacing": float(fringe_spacing),
            "contrast": float(contrast),
            "visibility": float(visibility),
            "fringe_count": fringe_count
        }

    def _calculate_young(
        self,
        elements: List[Dict[str, Any]],
        wavelength: float,
        k: float,
        resolution: int
    ) -> Dict[str, Any]:
        apertures = [e for e in elements if e["type"] == "aperture"]
        detectors = [e for e in elements if e["type"] == "detector"]
        
        slit_separation = 0.5
        screen_distance = 1000.0
        
        if len(detectors) > 0:
            det_pos = detectors[0]["position"]
            screen_distance = max(1.0, float(det_pos.get("x", 1000)))
        
        x = np.linspace(-20, 20, resolution)
        y = np.linspace(-5, 5, resolution)
        X, Y = np.meshgrid(x, y)
        
        r1 = np.sqrt((X - slit_separation/2)**2 + screen_distance**2)
        r2 = np.sqrt((X + slit_separation/2)**2 + screen_distance**2)
        
        phase = k * (r2 - r1) * 1e-3
        intensity = 0.25 * (1 + np.cos(phase)) * 4
        
        fringe_spacing = max(1e-6, (wavelength * screen_distance * 1e-3) / (slit_separation * 1e-3))
        
        contrast = self._calculate_contrast(intensity)
        visibility = self._calculate_visibility(intensity)
        
        return {
            "type": "young",
            "intensity": intensity.tolist(),
            "x": x.tolist(),
            "y": y.tolist(),
            "slit_separation": float(slit_separation),
            "screen_distance": float(screen_distance),
            "fringe_spacing": float(fringe_spacing),
            "contrast": float(contrast),
            "visibility": float(visibility)
        }

    def _calculate_diffraction(
        self,
        elements: List[Dict[str, Any]],
        wavelength: float,
        k: float,
        resolution: int
    ) -> Dict[str, Any]:
        apertures = [e for e in elements if e["type"] == "aperture"]
        gratings = [e for e in elements if e["type"] == "grating"]
        
        if len(gratings) > 0:
            return self._calculate_grating_diffraction(gratings[0], wavelength, k, resolution)
        
        aperture_radius = 2.0
        if len(apertures) > 0:
            aperture_radius = max(0.1, float(apertures[0]["parameters"].get("radius", 2.0)))
        
        x = np.linspace(-15, 15, resolution)
        y = np.linspace(-15, 15, resolution)
        X, Y = np.meshgrid(x, y)
        
        r = np.sqrt(X**2 + Y**2)
        
        a = aperture_radius * 1e-3
        L = 1.0
        q = (k * a * r * 1e-3) / L
        
        from scipy.special import j1
        intensity = np.where(np.abs(q) < 1e-10, 1.0, (2 * j1(q) / np.maximum(q, 1e-10))**2)
        
        airy_radius = 1.22 * wavelength * L / (2 * max(a, 1e-10)) * 1e3
        
        contrast = self._calculate_contrast(intensity)
        
        first_null_angle = 1.22 * wavelength / (2 * max(a, 1e-10)) * 180 / np.pi
        
        return {
            "type": "diffraction",
            "pattern": "airy",
            "intensity": intensity.tolist(),
            "x": x.tolist(),
            "y": y.tolist(),
            "aperture_radius": float(aperture_radius),
            "airy_radius": float(airy_radius),
            "contrast": float(contrast),
            "first_null_angle": float(first_null_angle)
        }

    def _calculate_grating_diffraction(
        self,
        grating: Dict[str, Any],
        wavelength: float,
        k: float,
        resolution: int
    ) -> Dict[str, Any]:
        lines_per_mm = max(1, float(grating["parameters"].get("lines_per_mm", 300)))
        d = 1e-3 / lines_per_mm
        
        x = np.linspace(-30, 30, resolution)
        y = np.linspace(-5, 5, resolution)
        X, Y = np.meshgrid(x, y)
        
        L = 1.0
        theta = np.arctan2(X * 1e-3, L)
        
        intensity = np.zeros_like(X)
        
        for order in range(-5, 6):
            sin_theta_order = order * wavelength / d
            if abs(sin_theta_order) <= 1:
                theta_order = np.arcsin(sin_theta_order)
                sigma = 0.02
                intensity += np.exp(-(theta - theta_order)**2 / (2 * sigma**2))
        
        contrast = self._calculate_contrast(intensity)
        
        angles = []
        for order in range(-3, 4):
            sin_theta = order * wavelength / d
            if abs(sin_theta) <= 1:
                angles.append({
                    "order": order,
                    "angle": float(np.arcsin(sin_theta) * 180 / np.pi)
                })
        
        return {
            "type": "grating",
            "intensity": intensity.tolist(),
            "x": x.tolist(),
            "y": y.tolist(),
            "lines_per_mm": float(lines_per_mm),
            "groove_spacing": float(d * 1e6),
            "diffraction_orders": angles,
            "contrast": float(contrast)
        }

    def _calculate_holography(
        self,
        elements: List[Dict[str, Any]],
        wavelength: float,
        k: float,
        resolution: int
    ) -> Dict[str, Any]:
        x = np.linspace(-10, 10, resolution)
        y = np.linspace(-10, 10, resolution)
        X, Y = np.meshgrid(x, y)
        
        object_phase = np.sin(X * 0.5) * np.cos(Y * 0.5) * np.pi
        reference_angle = np.pi / 6
        
        reference_phase = k * (X * 1e-3 * np.sin(reference_angle))
        
        object_wave = np.exp(1j * object_phase)
        reference_wave = np.exp(1j * reference_phase)
        
        hologram = np.abs(object_wave + reference_wave)**2
        
        contrast = self._calculate_contrast(hologram)
        
        return {
            "type": "holography",
            "hologram": hologram.tolist(),
            "object_phase": object_phase.tolist(),
            "reference_phase": reference_phase.tolist(),
            "x": x.tolist(),
            "y": y.tolist(),
            "reference_angle": float(reference_angle * 180 / np.pi),
            "contrast": float(contrast)
        }

    def _calculate_general(
        self,
        elements: List[Dict[str, Any]],
        wavelength: float,
        k: float,
        resolution: int
    ) -> Dict[str, Any]:
        x = np.linspace(-10, 10, resolution)
        y = np.linspace(-10, 10, resolution)
        X, Y = np.meshgrid(x, y)
        
        phase = k * 0.1 * (X + Y) * 1e-3
        intensity = 0.5 * (1 + np.cos(phase))
        
        for i in range(1, 5):
            phase_i = k * 0.1 * (i * X + i * Y) * 1e-3
            intensity += 0.1 * (1 + np.cos(phase_i))
        
        max_intensity = np.max(intensity)
        if max_intensity > 0:
            intensity = intensity / max_intensity
        else:
            intensity = np.zeros_like(intensity)
        
        contrast = self._calculate_contrast(intensity)
        visibility = self._calculate_visibility(intensity)
        
        return {
            "type": "general",
            "intensity": intensity.tolist(),
            "x": x.tolist(),
            "y": y.tolist(),
            "contrast": float(contrast),
            "visibility": float(visibility),
            "fringe_density": int(resolution // 20)
        }

    def _calculate_contrast(self, intensity: np.ndarray) -> float:
        try:
            I_max = float(np.max(intensity))
            I_min = float(np.min(intensity))
            denominator = I_max + I_min
            if abs(denominator) < 1e-15:
                return 0.0
            return max(0.0, min(1.0, (I_max - I_min) / denominator))
        except (ValueError, TypeError, RuntimeError):
            return 0.0

    def _calculate_visibility(self, intensity: np.ndarray) -> float:
        try:
            I_max = float(np.max(intensity))
            I_min = float(np.min(intensity))
            if abs(I_max) < 1e-15:
                return 0.0
            return max(0.0, min(1.0, (I_max - I_min) / I_max))
        except (ValueError, TypeError, RuntimeError):
            return 0.0

    def _generate_fringe_pattern(
        self,
        wavelength: float,
        resolution: int,
        pattern_type: str
    ) -> Dict[str, Any]:
        wavelength = max(self.MIN_WAVELENGTH, wavelength)
        resolution = min(max(10, resolution), self.MAX_RESOLUTION)
        
        x = np.linspace(-10, 10, resolution)
        y = np.linspace(-10, 10, resolution)
        X, Y = np.meshgrid(x, y)
        
        if pattern_type == "circular":
            r = np.sqrt(X**2 + Y**2)
            k_factor = 2 * np.pi / max(wavelength * 1e3, 1e-10)
            intensity = 0.5 * (1 + np.cos(k_factor * r * 0.1))
        else:
            k_factor = 2 * np.pi / max(wavelength * 1e6, 1e-10)
            intensity = 0.5 * (1 + np.cos(k_factor * X))
        
        contrast = self._calculate_contrast(intensity)
        
        return {
            "type": pattern_type,
            "intensity": intensity.tolist(),
            "x": x.tolist(),
            "y": y.tolist(),
            "contrast": float(contrast)
        }

    def analyze_fringes(
        self,
        intensity_data: List[List[float]]
    ) -> Dict[str, Any]:
        try:
            intensity = np.array(intensity_data, dtype=np.float64)
            if intensity.size == 0:
                return {
                    "peak_count": 0,
                    "valley_count": 0,
                    "average_peak_spacing": 0.0,
                    "dominant_frequency": 0.0,
                    "uniformity": 0.0,
                    "max_intensity": 0.0,
                    "min_intensity": 0.0,
                    "mean_intensity": 0.0
                }
            
            profile = intensity[intensity.shape[0] // 2, :]
            
            from scipy.signal import find_peaks
            peaks, _ = find_peaks(profile, height=0.3)
            valleys, _ = find_peaks(-profile, height=-0.3)
            
            peak_spacing = float(np.mean(np.diff(peaks))) if len(peaks) > 1 else 0.0
            
            fft_profile = fftpack.fft(profile)
            frequencies = fftpack.fftfreq(len(profile))
            
            if len(fft_profile) > 2:
                dominant_freq_idx = np.argmax(np.abs(fft_profile[1:len(fft_profile)//2])) + 1
                dominant_frequency = float(abs(frequencies[dominant_freq_idx]))
            else:
                dominant_frequency = 0.0
            
            uniformity = self._calculate_uniformity(profile, peaks)
            
            return {
                "peak_count": int(len(peaks)),
                "valley_count": int(len(valleys)),
                "average_peak_spacing": peak_spacing,
                "dominant_frequency": dominant_frequency,
                "uniformity": float(uniformity),
                "max_intensity": float(np.max(intensity)),
                "min_intensity": float(np.min(intensity)),
                "mean_intensity": float(np.mean(intensity))
            }
        except Exception:
            return {
                "peak_count": 0,
                "valley_count": 0,
                "average_peak_spacing": 0.0,
                "dominant_frequency": 0.0,
                "uniformity": 0.0,
                "max_intensity": 0.0,
                "min_intensity": 0.0,
                "mean_intensity": 0.0
            }

    def _calculate_uniformity(
        self,
        profile: np.ndarray,
        peaks: np.ndarray
    ) -> float:
        try:
            if len(peaks) < 2:
                return 0.0
            
            peak_heights = profile[peaks]
            mean_height = float(np.mean(peak_heights))
            std_height = float(np.std(peak_heights))
            
            if abs(mean_height) < 1e-15:
                return 0.0
            
            return max(0.0, min(1.0, 1 - (std_height / mean_height)))
        except Exception:
            return 0.0

    def calculate_coherence(
        self,
        intensity_data: List[List[float]],
        wavelength: float
    ) -> Dict[str, Any]:
        try:
            intensity = np.array(intensity_data, dtype=np.float64)
            if intensity.size == 0:
                return {
                    "contrast": 0.0,
                    "coherence_length": 0.0,
                    "coherence_time": 0.0,
                    "visibility": 0.0
                }
            
            wavelength = max(self.MIN_WAVELENGTH, float(wavelength))
            
            profile = intensity[intensity.shape[0] // 2, :]
            
            contrast = self._calculate_contrast(profile)
            
            if contrast >= 1.0:
                coherence_length = 1e10
            elif contrast <= 0:
                coherence_length = 0.0
            else:
                coherence_length = wavelength * contrast / max(1 - contrast, 1e-10)
            
            coherence_time = coherence_length / max(self.c, 1.0)
            visibility = self._calculate_visibility(profile)
            
            return {
                "contrast": float(contrast),
                "coherence_length": float(coherence_length),
                "coherence_time": float(coherence_time),
                "visibility": float(visibility)
            }
        except Exception:
            return {
                "contrast": 0.0,
                "coherence_length": 0.0,
                "coherence_time": 0.0,
                "visibility": 0.0
            }
