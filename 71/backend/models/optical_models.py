# -*- coding: utf-8 -*-
"""
光学参数数据模型
Optical parameter models for light source, fiber, and optical components.
"""

from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum


class LightSourceType(Enum):
    """光源类型"""
    WHITE_LED = "White_LED"
    LASER = "Laser"
    HALOGEN = "Halogen"
    DEUTERIUM = "Deuterium"
    XENON = "Xenon"
    CUSTOM = "Custom"


class FiberType(Enum):
    """光纤类型"""
    SI = "Step_Index"
    GI = "Graded_Index"
    PCF = "Photonic_Crystal"
    SMF = "Single_Mode"


@dataclass
class LightSourceSpec:
    """光源规格"""
    type: LightSourceType = LightSourceType.WHITE_LED
    power_mw: float = 5.0
    wavelength_range_nm: List[float] = field(default_factory=lambda: [400.0, 1100.0])
    central_wavelength_nm: float = 550.0
    spectral_width_nm: float = 200.0
    coherence_length_mm: float = 0.01
    modulation_frequency_hz: float = 0.0
    stability_pct: float = 1.0


@dataclass
class FiberSpec:
    """光纤规格"""
    type: FiberType = FiberType.SI
    core_diameter_um: float = 200.0
    cladding_diameter_um: float = 225.0
    buffer_diameter_um: float = 500.0
    numerical_aperture: float = 0.22
    length_m: float = 1.0
    attenuation_dbkm: float = 0.5
    bending_radius_mm: float = 30.0
    connector_type: str = "SMA905"


@dataclass
class GratingSpec:
    """光栅规格"""
    density_lpm: float = 600.0
    blaze_wavelength_nm: float = 500.0
    diffraction_order: int = 1
    efficiency_pct: float = 80.0
    groove_depth_nm: float = 150.0
    ruled_area_mm2: float = 50.0


@dataclass
class MirrorSpec:
    """反射镜规格"""
    reflectivity: float = 0.95
    diameter_mm: float = 25.0
    focal_length_mm: float = 75.0
    surface_quality: str = "lambda/10"
    coating_type: str = "Al+SiO2"


@dataclass
class SlitSpec:
    """狭缝规格"""
    width_um: float = 50.0
    height_mm: float = 1.0
    shape: str = "rectangular"
    transmission: float = 0.95


@dataclass
class CalibrationSourceSpec:
    """标定光源规格"""
    type: str = "HeNe_Laser"
    wavelength_nm: float = 632.8
    power_mw: float = 1.0
    linewidth_pm: float = 1.0
    stability_pct: float = 0.1
    calibration_lines: List[Tuple[float, float]] = field(
        default_factory=lambda: [
            (435.8, 0.8),
            (546.1, 0.9),
            (632.8, 1.0),
            (696.5, 0.7),
            (763.5, 0.6),
            (811.5, 0.5)
        ]
    )


@dataclass
class OpticalConfig:
    """光学完整配置"""
    light_source: LightSourceSpec = field(default_factory=LightSourceSpec)
    fiber: FiberSpec = field(default_factory=FiberSpec)
    grating: GratingSpec = field(default_factory=GratingSpec)
    mirror: MirrorSpec = field(default_factory=MirrorSpec)
    slit: SlitSpec = field(default_factory=SlitSpec)
    calibration_source: CalibrationSourceSpec = field(default_factory=CalibrationSourceSpec)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "light_source": {
                **asdict(self.light_source),
                "type": self.light_source.type.value
            },
            "fiber": {
                **asdict(self.fiber),
                "type": self.fiber.type.value
            },
            "grating": asdict(self.grating),
            "mirror": asdict(self.mirror),
            "slit": asdict(self.slit),
            "calibration_source": asdict(self.calibration_source)
        }

    def from_dict(self, data: Dict[str, Any]) -> None:
        """从字典加载配置"""
        if "light_source" in data:
            ls = data["light_source"].copy()
            if "type" in ls:
                ls["type"] = LightSourceType(ls["type"])
            self.light_source = LightSourceSpec(**ls)
        if "fiber" in data:
            fb = data["fiber"].copy()
            if "type" in fb:
                fb["type"] = FiberType(fb["type"])
            self.fiber = FiberSpec(**fb)
        if "grating" in data:
            self.grating = GratingSpec(**data["grating"])
        if "mirror" in data:
            self.mirror = MirrorSpec(**data["mirror"])
        if "slit" in data:
            self.slit = SlitSpec(**data["slit"])
        if "calibration_source" in data:
            self.calibration_source = CalibrationSourceSpec(**data["calibration_source"])

    def validate(self) -> List[str]:
        """验证光学配置"""
        errors = []
        if self.light_source.power_mw <= 0:
            errors.append("光源功率必须大于0")
        if self.fiber.numerical_aperture <= 0 or self.fiber.numerical_aperture > 1:
            errors.append("光纤NA必须在(0, 1]范围内")
        if self.grating.density_lpm <= 0:
            errors.append("光栅密度必须大于0")
        if not (0 < self.mirror.reflectivity <= 1):
            errors.append("镜面反射率必须在(0, 1]范围内")
        if self.slit.width_um <= 0:
            errors.append("狭缝宽度必须大于0")
        return errors


class OpticalModelManager:
    """光学模型管理器"""

    def __init__(self):
        self.config = OpticalConfig()
        self._presets: Dict[str, OpticalConfig] = {}
        self._init_presets()

    def _init_presets(self) -> None:
        """初始化预设光学配置"""
        visible = OpticalConfig(
            light_source=LightSourceSpec(
                type=LightSourceType.WHITE_LED,
                power_mw=5.0,
                central_wavelength_nm=550.0
            ),
            grating=GratingSpec(
                density_lpm=600.0,
                blaze_wavelength_nm=500.0
            )
        )

        uv = OpticalConfig(
            light_source=LightSourceSpec(
                type=LightSourceType.DEUTERIUM,
                power_mw=0.5,
                central_wavelength_nm=250.0,
                wavelength_range_nm=[200.0, 450.0]
            ),
            grating=GratingSpec(
                density_lpm=1200.0,
                blaze_wavelength_nm=250.0
            ),
            slit=SlitSpec(width_um=25.0)
        )

        nir = OpticalConfig(
            light_source=LightSourceSpec(
                type=LightSourceType.HALOGEN,
                power_mw=10.0,
                central_wavelength_nm=1500.0,
                wavelength_range_nm=[900.0, 2500.0]
            ),
            fiber=FiberSpec(
                type=FiberType.SMF,
                core_diameter_um=9.0,
                numerical_aperture=0.12
            ),
            grating=GratingSpec(
                density_lpm=150.0,
                blaze_wavelength_nm=1500.0
            ),
            calibration_source=CalibrationSourceSpec(
                type="NIR_Calibration",
                wavelength_nm=1550.0
            )
        )

        high_res = OpticalConfig(
            light_source=LightSourceSpec(
                type=LightSourceType.LASER,
                power_mw=1.0,
                central_wavelength_nm=632.8,
                spectral_width_nm=0.001
            ),
            grating=GratingSpec(
                density_lpm=1800.0,
                blaze_wavelength_nm=600.0
            ),
            slit=SlitSpec(width_um=10.0)
        )

        self._presets = {
            "visible": visible,
            "uv": uv,
            "nir": nir,
            "high_resolution": high_res
        }

    def get_preset(self, name: str) -> Optional[OpticalConfig]:
        """获取预设配置"""
        return self._presets.get(name)

    def list_presets(self) -> List[str]:
        return list(self._presets.keys())

    def apply_preset(self, name: str) -> bool:
        preset = self._presets.get(name)
        if preset:
            self.config = preset
            return True
        return False

    def export_config(self, filepath: str) -> None:
        import json
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.config.to_dict(), f, indent=2, ensure_ascii=False)

    def import_config(self, filepath: str) -> None:
        import json
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.config.from_dict(data)
