# -*- coding: utf-8 -*-
"""
设备参数数据模型
Device parameter models for spectrum analyzer hardware.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum


class DetectorType(Enum):
    """探测器类型"""
    CCD = "CCD"
    CMOS = "CMOS"
    PD = "Photodiode"
    PMT = "Photomultiplier"
    INGAAS = "InGaAs"


class DeviceStatus(Enum):
    """设备状态"""
    IDLE = "idle"
    RUNNING = "running"
    CALIBRATING = "calibrating"
    ERROR = "error"
    MAINTENANCE = "maintenance"


@dataclass
class DetectorSpec:
    """探测器规格"""
    type: DetectorType = DetectorType.CCD
    pixel_count: int = 2048
    pixel_size_um: float = 14.0
    well_capacity_ke: float = 100.0
    dark_current_epix_s: float = 0.001
    read_noise_e: float = 5.0
    quantum_efficiency: float = 0.85
    active_area_mm2: float = 28.67


@dataclass
class SpectrometerSpec:
    """光谱仪规格"""
    wavelength_range_nm: List[float] = field(default_factory=lambda: [400.0, 1100.0])
    resolution_nm: float = 0.5
    f_number: float = 3.9
    focal_length_mm: float = 75.0
    grating_density_lpm: float = 600.0
    blaze_wavelength_nm: float = 500.0
    slit_width_um: float = 50.0
    numerical_aperture: float = 0.22
    stray_light_level: float = 0.0001


@dataclass
class DataAcquisitionSpec:
    """数据采集规格"""
    sampling_rate_hz: float = 1000.0
    integration_time_ms: float = 10.0
    min_integration_ms: float = 1.0
    max_integration_ms: float = 60000.0
    adc_resolution_bits: int = 16
    trigger_mode: str = "internal"
    averaging_count: int = 1


@dataclass
class EnvironmentalSpec:
    """环境参数规格"""
    operating_temp_c: List[float] = field(default_factory=lambda: [5.0, 40.0])
    storage_temp_c: List[float] = field(default_factory=lambda: [-20.0, 60.0])
    operating_humidity_pct: List[float] = field(default_factory=lambda: [20.0, 80.0])
    current_temp_c: float = 25.0
    current_humidity_pct: float = 45.0
    pressure_kpa: float = 101.3


@dataclass
class DeviceInfo:
    """设备信息"""
    device_id: str = "SA-2026-001"
    device_name: str = "Spectrum Analyzer Pro"
    manufacturer: str = "Photonics Corp"
    model: str = "SAP-2026"
    serial_number: str = "SN-2026-0001"
    firmware_version: str = "2.1.3"
    hardware_version: str = "1.0"
    manufacture_date: str = "2026-01-15"
    calibration_date: str = "2026-03-01"
    next_calibration_date: str = "2027-03-01"


@dataclass
class DeviceConfig:
    """设备完整配置"""
    info: DeviceInfo = field(default_factory=DeviceInfo)
    detector: DetectorSpec = field(default_factory=DetectorSpec)
    spectrometer: SpectrometerSpec = field(default_factory=SpectrometerSpec)
    acquisition: DataAcquisitionSpec = field(default_factory=DataAcquisitionSpec)
    environment: EnvironmentalSpec = field(default_factory=EnvironmentalSpec)
    status: DeviceStatus = DeviceStatus.IDLE

    def to_dict(self) -> Dict[str, Any]:
        return {
            "info": asdict(self.info),
            "detector": {
                **asdict(self.detector),
                "type": self.detector.type.value
            },
            "spectrometer": asdict(self.spectrometer),
            "acquisition": asdict(self.acquisition),
            "environment": asdict(self.environment),
            "status": self.status.value
        }

    def from_dict(self, data: Dict[str, Any]) -> None:
        """从字典加载配置"""
        if "info" in data:
            self.info = DeviceInfo(**data["info"])
        if "detector" in data:
            det_data = data["detector"].copy()
            if "type" in det_data:
                det_data["type"] = DetectorType(det_data["type"])
            self.detector = DetectorSpec(**det_data)
        if "spectrometer" in data:
            self.spectrometer = SpectrometerSpec(**data["spectrometer"])
        if "acquisition" in data:
            self.acquisition = DataAcquisitionSpec(**data["acquisition"])
        if "environment" in data:
            self.environment = EnvironmentalSpec(**data["environment"])
        if "status" in data:
            self.status = DeviceStatus(data["status"])

    def validate(self) -> List[str]:
        """验证设备配置"""
        errors = []
        spec = self.spectrometer
        if spec.wavelength_range_nm[0] >= spec.wavelength_range_nm[1]:
            errors.append("波长范围无效: 起始值必须小于结束值")
        if spec.resolution_nm <= 0:
            errors.append("分辨率必须大于0")
        if self.detector.pixel_count <= 0:
            errors.append("像素数量必须大于0")
        if self.acquisition.integration_time_ms < self.acquisition.min_integration_ms:
            errors.append("积分时间小于最小值")
        if self.acquisition.integration_time_ms > self.acquisition.max_integration_ms:
            errors.append("积分时间大于最大值")
        if not (self.environment.operating_temp_c[0] <=
                self.environment.current_temp_c <=
                self.environment.operating_temp_c[1]):
            errors.append("当前温度超出工作范围")
        return errors


class DeviceModelManager:
    """设备模型管理器"""

    def __init__(self):
        self.config = DeviceConfig()
        self._presets: Dict[str, DeviceConfig] = {}
        self._init_presets()

    def _init_presets(self) -> None:
        """初始化预设设备配置"""
        basic = DeviceConfig(
            info=DeviceInfo(
                device_id="SA-BASIC-001",
                device_name="Spectrum Analyzer Basic",
                model="SAB-2026"
            ),
            detector=DetectorSpec(
                type=DetectorType.CCD,
                pixel_count=1024,
                pixel_size_um=20.0
            ),
            spectrometer=SpectrometerSpec(
                wavelength_range_nm=[350.0, 1000.0],
                resolution_nm=1.0,
                grating_density_lpm=300.0
            ),
            acquisition=DataAcquisitionSpec(
                sampling_rate_hz=500.0,
                adc_resolution_bits=14
            )
        )

        pro = DeviceConfig(
            info=DeviceInfo(
                device_id="SA-PRO-001",
                device_name="Spectrum Analyzer Pro",
                model="SAP-2026"
            ),
            detector=DetectorSpec(
                type=DetectorType.CCD,
                pixel_count=2048,
                pixel_size_um=14.0
            ),
            spectrometer=SpectrometerSpec(
                wavelength_range_nm=[200.0, 1100.0],
                resolution_nm=0.3,
                grating_density_lpm=1200.0,
                slit_width_um=25.0
            ),
            acquisition=DataAcquisitionSpec(
                sampling_rate_hz=2000.0,
                adc_resolution_bits=16
            )
        )

        nir = DeviceConfig(
            info=DeviceInfo(
                device_id="SA-NIR-001",
                device_name="NIR Spectrum Analyzer",
                model="SAN-2026"
            ),
            detector=DetectorSpec(
                type=DetectorType.INGAAS,
                pixel_count=512,
                pixel_size_um=25.0,
                quantum_efficiency=0.75
            ),
            spectrometer=SpectrometerSpec(
                wavelength_range_nm=[900.0, 2500.0],
                resolution_nm=2.0,
                grating_density_lpm=150.0,
                blaze_wavelength_nm=1500.0
            ),
            acquisition=DataAcquisitionSpec(
                sampling_rate_hz=200.0
            )
        )

        self._presets = {
            "basic": basic,
            "pro": pro,
            "nir": nir
        }

    def get_preset(self, name: str) -> Optional[DeviceConfig]:
        """获取预设配置"""
        return self._presets.get(name)

    def list_presets(self) -> List[str]:
        """列出所有预设"""
        return list(self._presets.keys())

    def apply_preset(self, name: str) -> bool:
        """应用预设配置"""
        preset = self._presets.get(name)
        if preset:
            self.config = preset
            return True
        return False

    def export_config(self, filepath: str) -> None:
        """导出配置到文件"""
        import json
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.config.to_dict(), f, indent=2, ensure_ascii=False)

    def import_config(self, filepath: str) -> None:
        """从文件导入配置"""
        import json
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.config.from_dict(data)
