use async_trait::async_trait;
use chrono::Utc;
use core::{
    CollectionResult, CpuInfo, DiskInfo, HardwareInfo, HardwareType, MemoryInfo, NetworkInfo,
};
use hal::{DriverBox, HalError, HalResult, HardwareDriver};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Mutex;

#[derive(Error, Debug)]
pub enum PlatformError {
    #[error("Platform detection failed: {0}")]
    DetectionError(String),
    #[error("Unsupported platform: {0}")]
    UnsupportedPlatform(String),
    #[error("System call failed: {0}")]
    SystemCallError(String),
    #[error("File read error: {0}")]
    FileReadError(String),
}

pub type PlatformResult<T> = Result<T, PlatformError>;

#[cfg(windows)]
mod windows_impl;
#[cfg(unix)]
mod unix_impl;

pub trait PlatformDetector {
    fn get_os_name() -> String;
    fn get_os_version() -> String;
    fn get_architecture() -> String;
    fn get_hostname() -> String;
}

pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub architecture: String,
    pub hostname: String,
    pub kernel_version: String,
    pub uptime_seconds: u64,
}

impl SystemInfo {
    pub fn new() -> PlatformResult<Self> {
        #[cfg(windows)]
        {
            windows_impl::get_system_info()
        }
        #[cfg(unix)]
        {
            unix_impl::get_system_info()
        }
    }
}

pub struct PlatformCpuDriver {
    device_id: String,
    initialized: bool,
    sys: Arc<Mutex<sysinfo::System>>,
}

impl PlatformCpuDriver {
    pub fn new(device_id: String) -> Self {
        let mut sys = sysinfo::System::new();
        sys.refresh_cpu();
        Self {
            device_id,
            initialized: false,
            sys: Arc::new(Mutex::new(sys)),
        }
    }

    pub fn to_driver(self) -> DriverBox {
        Arc::new(Mutex::new(self))
    }
}

#[async_trait]
impl HardwareDriver for PlatformCpuDriver {
    async fn initialize(&mut self) -> HalResult<()> {
        log::info!("Initializing Platform CPU Driver: {}", self.device_id);
        let mut sys = self.sys.lock().await;
        sys.refresh_cpu();
        self.initialized = true;
        Ok(())
    }

    async fn read_data(&self) -> HalResult<CollectionResult> {
        if !self.initialized {
            return Err(HalError::NotInitialized);
        }

        let start = std::time::Instant::now();
        let mut sys = self.sys.lock().await;
        sys.refresh_cpu();

        let cpus = sys.cpus();
        if cpus.is_empty() {
            return Err(HalError::ReadError("No CPUs found".to_string()));
        }

        let first_cpu = &cpus[0];
        let total_cores: u32 = cpus.len() as u32;
        let total_threads: u32 = cpus.iter().map(|c| c.brand().contains("HT") as u32).sum::<u32>().max(total_cores);
        let avg_usage: f64 = cpus.iter().map(|c| c.cpu_usage() as f64).sum::<f64>() / cpus.len() as f64;

        let cpu_info = CpuInfo {
            name: first_cpu.name().to_string(),
            vendor_id: first_cpu.vendor_id().to_string(),
            cores: total_cores,
            threads: total_threads,
            frequency_mhz: first_cpu.frequency() as f64,
            usage_percent: avg_usage,
            temperature_celsius: None,
            cache_l1_kb: 0,
            cache_l2_kb: 0,
            cache_l3_kb: 0,
        };

        let mut hw_info = HardwareInfo::new(self.device_id.clone(), HardwareType::Cpu);
        hw_info.cpu = Some(cpu_info);
        hw_info.collected_at = Utc::now();

        let duration = start.elapsed().as_millis() as u64;
        Ok(CollectionResult::success(hw_info, duration))
    }

    fn get_device_info(&self) -> HalResult<HardwareInfo> {
        Err(HalError::NotInitialized)
    }

    fn get_device_id(&self) -> &str {
        &self.device_id
    }

    fn get_hardware_type(&self) -> HardwareType {
        HardwareType::Cpu
    }

    fn is_initialized(&self) -> bool {
        self.initialized
    }
}

pub struct PlatformMemoryDriver {
    device_id: String,
    initialized: bool,
    sys: Arc<Mutex<sysinfo::System>>,
}

impl PlatformMemoryDriver {
    pub fn new(device_id: String) -> Self {
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        Self {
            device_id,
            initialized: false,
            sys: Arc::new(Mutex::new(sys)),
        }
    }

    pub fn to_driver(self) -> DriverBox {
        Arc::new(Mutex::new(self))
    }
}

#[async_trait]
impl HardwareDriver for PlatformMemoryDriver {
    async fn initialize(&mut self) -> HalResult<()> {
        log::info!("Initializing Platform Memory Driver: {}", self.device_id);
        let mut sys = self.sys.lock().await;
        sys.refresh_memory();
        self.initialized = true;
        Ok(())
    }

    async fn read_data(&self) -> HalResult<CollectionResult> {
        if !self.initialized {
            return Err(HalError::NotInitialized);
        }

        let start = std::time::Instant::now();
        let mut sys = self.sys.lock().await;
        sys.refresh_memory();

        let total = sys.total_memory();
        let used = sys.used_memory();
        let available = sys.available_memory();
        let free = sys.free_memory();
        let swap_total = sys.total_swap();
        let swap_used = sys.used_swap();
        let usage_percent = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        let memory_info = MemoryInfo {
            total_bytes: total,
            used_bytes: used,
            available_bytes: available,
            free_bytes: free,
            swap_total_bytes: swap_total,
            swap_used_bytes: swap_used,
            usage_percent,
            speed_mhz: None,
            slots_used: None,
            slots_total: None,
        };

        let mut hw_info = HardwareInfo::new(self.device_id.clone(), HardwareType::Memory);
        hw_info.memory = Some(memory_info);
        hw_info.collected_at = Utc::now();

        let duration = start.elapsed().as_millis() as u64;
        Ok(CollectionResult::success(hw_info, duration))
    }

    fn get_device_info(&self) -> HalResult<HardwareInfo> {
        Err(HalError::NotInitialized)
    }

    fn get_device_id(&self) -> &str {
        &self.device_id
    }

    fn get_hardware_type(&self) -> HardwareType {
        HardwareType::Memory
    }

    fn is_initialized(&self) -> bool {
        self.initialized
    }
}

pub struct PlatformDiskDriver {
    device_id: String,
    initialized: bool,
    sys: Arc<Mutex<sysinfo::System>>,
}

impl PlatformDiskDriver {
    pub fn new(device_id: String) -> Self {
        let mut sys = sysinfo::System::new();
        sys.refresh_disks_list();
        Self {
            device_id,
            initialized: false,
            sys: Arc::new(Mutex::new(sys)),
        }
    }

    pub fn to_driver(self) -> DriverBox {
        Arc::new(Mutex::new(self))
    }
}

#[async_trait]
impl HardwareDriver for PlatformDiskDriver {
    async fn initialize(&mut self) -> HalResult<()> {
        log::info!("Initializing Platform Disk Driver: {}", self.device_id);
        let mut sys = self.sys.lock().await;
        sys.refresh_disks_list();
        self.initialized = true;
        Ok(())
    }

    async fn read_data(&self) -> HalResult<CollectionResult> {
        if !self.initialized {
            return Err(HalError::NotInitialized);
        }

        let start = std::time::Instant::now();
        let mut sys = self.sys.lock().await;
        sys.refresh_disks();

        let mut disks = Vec::new();
        for disk in sys.disks() {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total - available;
            let usage_percent = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };

            disks.push(DiskInfo {
                name: disk.name().to_string_lossy().to_string(),
                device_path: "".to_string(),
                total_bytes: total,
                used_bytes: used,
                free_bytes: available,
                usage_percent,
                filesystem: String::from_utf8_lossy(disk.file_system()).to_string(),
                mount_point: disk.mount_point().to_string_lossy().to_string(),
                is_removable: disk.is_removable(),
                drive_type: format!("{:?}", disk.kind()),
            });
        }

        let mut hw_info = HardwareInfo::new(self.device_id.clone(), HardwareType::Disk);
        hw_info.disks = disks;
        hw_info.collected_at = Utc::now();

        let duration = start.elapsed().as_millis() as u64;
        Ok(CollectionResult::success(hw_info, duration))
    }

    fn get_device_info(&self) -> HalResult<HardwareInfo> {
        Err(HalError::NotInitialized)
    }

    fn get_device_id(&self) -> &str {
        &self.device_id
    }

    fn get_hardware_type(&self) -> HardwareType {
        HardwareType::Disk
    }

    fn is_initialized(&self) -> bool {
        self.initialized
    }
}

pub struct PlatformNetworkDriver {
    device_id: String,
    initialized: bool,
    sys: Arc<Mutex<sysinfo::System>>,
}

impl PlatformNetworkDriver {
    pub fn new(device_id: String) -> Self {
        let mut sys = sysinfo::System::new();
        sys.refresh_networks_list();
        Self {
            device_id,
            initialized: false,
            sys: Arc::new(Mutex::new(sys)),
        }
    }

    pub fn to_driver(self) -> DriverBox {
        Arc::new(Mutex::new(self))
    }
}

#[async_trait]
impl HardwareDriver for PlatformNetworkDriver {
    async fn initialize(&mut self) -> HalResult<()> {
        log::info!("Initializing Platform Network Driver: {}", self.device_id);
        let mut sys = self.sys.lock().await;
        sys.refresh_networks_list();
        self.initialized = true;
        Ok(())
    }

    async fn read_data(&self) -> HalResult<CollectionResult> {
        if !self.initialized {
            return Err(HalError::NotInitialized);
        }

        let start = std::time::Instant::now();
        let mut sys = self.sys.lock().await;
        sys.refresh_networks();

        let mut networks = Vec::new();
        for (name, network) in sys.networks() {
            networks.push(NetworkInfo {
                interface_name: name.clone(),
                mac_address: network.mac_address().to_string(),
                ipv4_addresses: vec![],
                ipv6_addresses: vec![],
                rx_bytes: network.total_received(),
                tx_bytes: network.total_transmitted(),
                rx_packets: network.total_packets_received(),
                tx_packets: network.total_packets_transmitted(),
                speed_mbps: None,
                is_up: !network.mac_address().is_nil(),
            });
        }

        let mut hw_info = HardwareInfo::new(self.device_id.clone(), HardwareType::Network);
        hw_info.networks = networks;
        hw_info.collected_at = Utc::now();

        let duration = start.elapsed().as_millis() as u64;
        Ok(CollectionResult::success(hw_info, duration))
    }

    fn get_device_info(&self) -> HalResult<HardwareInfo> {
        Err(HalError::NotInitialized)
    }

    fn get_device_id(&self) -> &str {
        &self.device_id
    }

    fn get_hardware_type(&self) -> HardwareType {
        HardwareType::Network
    }

    fn is_initialized(&self) -> bool {
        self.initialized
    }
}

pub struct PlatformMotherboardDriver {
    device_id: String,
    initialized: bool,
    sys: Arc<Mutex<sysinfo::System>>,
}

impl PlatformMotherboardDriver {
    pub fn new(device_id: String) -> Self {
        let sys = sysinfo::System::new();
        Self {
            device_id,
            initialized: false,
            sys: Arc::new(Mutex::new(sys)),
        }
    }

    pub fn to_driver(self) -> DriverBox {
        Arc::new(Mutex::new(self))
    }
}

#[async_trait]
impl HardwareDriver for PlatformMotherboardDriver {
    async fn initialize(&mut self) -> HalResult<()> {
        log::info!("Initializing Platform Motherboard Driver: {}", self.device_id);
        self.initialized = true;
        Ok(())
    }

    async fn read_data(&self) -> HalResult<CollectionResult> {
        if !self.initialized {
            return Err(HalError::NotInitialized);
        }

        let start = std::time::Instant::now();

        let mut manufacturer = String::new();
        let mut model = String::new();
        let mut version = String::new();
        let mut serial_number = String::new();
        let mut bios_version = String::new();

        #[cfg(unix)]
        {
            if let Ok(content) = std::fs::read_to_string("/sys/devices/virtual/dmi/id/board_vendor") {
                manufacturer = content.trim().to_string();
            }
            if let Ok(content) = std::fs::read_to_string("/sys/devices/virtual/dmi/id/board_name") {
                model = content.trim().to_string();
            }
            if let Ok(content) = std::fs::read_to_string("/sys/devices/virtual/dmi/id/board_version") {
                version = content.trim().to_string();
            }
            if let Ok(content) = std::fs::read_to_string("/sys/devices/virtual/dmi/id/board_serial") {
                serial_number = content.trim().to_string();
            }
            if let Ok(content) = std::fs::read_to_string("/sys/devices/virtual/dmi/id/bios_version") {
                bios_version = content.trim().to_string();
            }
        }

        #[cfg(windows)]
        {
            let sys = self.sys.lock().await;
            let sys_name = sys.name().unwrap_or_default();
            if !sys_name.is_empty() {
                manufacturer = sys_name;
            }
        }

        if manufacturer.is_empty() {
            manufacturer = "Unknown".to_string();
        }
        if model.is_empty() {
            model = "Unknown".to_string();
        }
        if bios_version.is_empty() {
            bios_version = "Unknown".to_string();
        }

        let motherboard_info = core::MotherboardInfo {
            manufacturer,
            model,
            version,
            serial_number,
            bios_version,
            bios_release_date: None,
            chipset: None,
        };

        let mut hw_info = HardwareInfo::new(self.device_id.clone(), HardwareType::Motherboard);
        hw_info.motherboard = Some(motherboard_info);
        hw_info.collected_at = Utc::now();

        let duration = start.elapsed().as_millis() as u64;
        Ok(CollectionResult::success(hw_info, duration))
    }

    fn get_device_info(&self) -> HalResult<HardwareInfo> {
        Err(HalError::NotInitialized)
    }

    fn get_device_id(&self) -> &str {
        &self.device_id
    }

    fn get_hardware_type(&self) -> HardwareType {
        HardwareType::Motherboard
    }

    fn is_initialized(&self) -> bool {
        self.initialized
    }
}

pub struct PlatformExternalDeviceDriver {
    device_id: String,
    initialized: bool,
    last_scan: Arc<Mutex<Vec<core::ExternalDevice>>>,
}

impl PlatformExternalDeviceDriver {
    pub fn new(device_id: String) -> Self {
        Self {
            device_id,
            initialized: false,
            last_scan: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn to_driver(self) -> DriverBox {
        Arc::new(Mutex::new(self))
    }

    #[cfg(unix)]
    fn scan_usb_devices() -> Vec<core::ExternalDevice> {
        let mut devices = Vec::new();
        let usb_path = std::path::Path::new("/sys/bus/usb/devices");

        if let Ok(entries) = std::fs::read_dir(usb_path) {
            for entry in entries.flatten() {
                let dev_path = entry.path();
                if !dev_path.join("idVendor").exists() {
                    continue;
                }

                let vendor_id = std::fs::read_to_string(dev_path.join("idVendor"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let product_id = std::fs::read_to_string(dev_path.join("idProduct"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let manufacturer = std::fs::read_to_string(dev_path.join("manufacturer"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let product_name = std::fs::read_to_string(dev_path.join("product"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let serial = std::fs::read_to_string(dev_path.join("serial"))
                    .ok()
                    .map(|s| s.trim().to_string());

                if vendor_id.is_empty() {
                    continue;
                }

                let dev_name = if !product_name.is_empty() {
                    product_name
                } else if !manufacturer.is_empty() {
                    format!("{} Device", manufacturer)
                } else {
                    format!("USB Device {:04x}:{:04x}", 
                        u16::from_str_radix(&vendor_id, 16).unwrap_or(0),
                        u16::from_str_radix(&product_id, 16).unwrap_or(0)
                    )
                };

                let interface_class = std::fs::read_to_string(dev_path.join("bDeviceClass"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();

                let device_type = match interface_class.as_str() {
                    "02" => "Communications".to_string(),
                    "03" => "HID".to_string(),
                    "08" => "Mass Storage".to_string(),
                    "0a" => "CDC-Data".to_string(),
                    "0e" => "Video".to_string(),
                    "01" => "Audio".to_string(),
                    "06" => "Image".to_string(),
                    "0b" => "Smart Card".to_string(),
                    "e0" => "Wireless".to_string(),
                    _ => "USB Device".to_string(),
                };

                let bus_num = std::fs::read_to_string(dev_path.join("busnum"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();
                let dev_num = std::fs::read_to_string(dev_path.join("devnum"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();

                devices.push(core::ExternalDevice {
                    device_id: if !bus_num.is_empty() && !dev_num.is_empty() {
                        format!("usb-{}-{}", bus_num, dev_num)
                    } else {
                        format!("usb-{}:{}", vendor_id, product_id)
                    },
                    name: dev_name,
                    device_type,
                    vendor_id,
                    product_id,
                    serial_number: serial,
                    connection_type: "USB".to_string(),
                    is_connected: true,
                });
            }
        }

        let serial_path = std::path::Path::new("/dev/serial/by-id");
        if let Ok(entries) = std::fs::read_dir(serial_path) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if let Ok(target) = std::fs::read_link(entry.path()) {
                    let target_str = target.to_string_lossy().to_string();
                    devices.push(core::ExternalDevice {
                        device_id: format!("serial-{}", name),
                        name: name.clone(),
                        device_type: "Serial Port".to_string(),
                        vendor_id: "".to_string(),
                        product_id: "".to_string(),
                        serial_number: Some(name),
                        connection_type: "Serial".to_string(),
                        is_connected: true,
                    });
                }
            }
        }

        devices
    }

    #[cfg(windows)]
    fn scan_usb_devices() -> Vec<core::ExternalDevice> {
        Vec::new()
    }
}

#[async_trait]
impl HardwareDriver for PlatformExternalDeviceDriver {
    async fn initialize(&mut self) -> HalResult<()> {
        log::info!("Initializing Platform External Device Driver: {}", self.device_id);
        self.initialized = true;
        Ok(())
    }

    async fn read_data(&self) -> HalResult<CollectionResult> {
        if !self.initialized {
            return Err(HalError::NotInitialized);
        }

        let start = std::time::Instant::now();
        let devices = Self::scan_usb_devices();

        let mut prev = self.last_scan.lock().await;
        *prev = devices.clone();

        let mut hw_info = HardwareInfo::new(self.device_id.clone(), HardwareType::ExternalDevice);
        hw_info.external_devices = devices;
        hw_info.collected_at = Utc::now();

        let duration = start.elapsed().as_millis() as u64;
        Ok(CollectionResult::success(hw_info, duration))
    }

    fn get_device_info(&self) -> HalResult<HardwareInfo> {
        Err(HalError::NotInitialized)
    }

    fn get_device_id(&self) -> &str {
        &self.device_id
    }

    fn get_hardware_type(&self) -> HardwareType {
        HardwareType::ExternalDevice
    }

    fn is_initialized(&self) -> bool {
        self.initialized
    }
}

pub struct PlatformSensorDriver {
    device_id: String,
    initialized: bool,
    last_scan: Arc<Mutex<Vec<core::SensorData>>>,
}

impl PlatformSensorDriver {
    pub fn new(device_id: String) -> Self {
        Self {
            device_id,
            initialized: false,
            last_scan: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn to_driver(self) -> DriverBox {
        Arc::new(Mutex::new(self))
    }

    #[cfg(unix)]
    fn scan_hwmon_sensors() -> Vec<core::SensorData> {
        let mut sensors = Vec::new();
        let hwmon_path = std::path::Path::new("/sys/class/hwmon");

        if let Ok(entries) = std::fs::read_dir(hwmon_path) {
            for entry in entries.flatten() {
                let hwmon_dir = entry.path();

                let chip_name = std::fs::read_to_string(hwmon_dir.join("name"))
                    .unwrap_or_default()
                    .trim()
                    .to_string();

                if let Ok(sub_entries) = std::fs::read_dir(&hwmon_dir) {
                    for sub in sub_entries.flatten() {
                        let fname = sub.file_name().to_string_lossy().to_string();

                        if fname.starts_with("temp") && fname.ends_with("_input") {
                            if let Ok(val_str) = std::fs::read_to_string(sub.path()) {
                                if let Ok(millidegrees) = val_str.trim().parse::<f64>() {
                                    let temp_c = millidegrees / 1000.0;
                                    let sensor_id = fname.replace("_input", "");
                                    
                                    let label = std::fs::read_to_string(
                                        hwmon_dir.join(fname.replace("_input", "_label"))
                                    )
                                    .unwrap_or_else(|_| sensor_id.clone())
                                    .trim()
                                    .to_string();

                                    let status = if temp_c > 80.0 {
                                        core::SensorStatus::Critical
                                    } else if temp_c > 60.0 {
                                        core::SensorStatus::Warning
                                    } else {
                                        core::SensorStatus::Normal
                                    };

                                    sensors.push(core::SensorData {
                                        sensor_id: format!("{}-{}", chip_name, sensor_id),
                                        sensor_type: "temperature".to_string(),
                                        name: format!("{} - {}", chip_name, label),
                                        value: temp_c,
                                        unit: "°C".to_string(),
                                        timestamp: Utc::now(),
                                        status,
                                    });
                                }
                            }
                        }

                        if fname.starts_with("fan") && fname.ends_with("_input") {
                            if let Ok(val_str) = std::fs::read_to_string(sub.path()) {
                                if let Ok(rpm) = val_str.trim().parse::<f64>() {
                                    let sensor_id = fname.replace("_input", "");
                                    
                                    let label = std::fs::read_to_string(
                                        hwmon_dir.join(fname.replace("_input", "_label"))
                                    )
                                    .unwrap_or_else(|_| sensor_id.clone())
                                    .trim()
                                    .to_string();

                                    sensors.push(core::SensorData {
                                        sensor_id: format!("{}-{}", chip_name, sensor_id),
                                        sensor_type: "fan".to_string(),
                                        name: format!("{} - {}", chip_name, label),
                                        value: rpm,
                                        unit: "RPM".to_string(),
                                        timestamp: Utc::now(),
                                        status: core::SensorStatus::Normal,
                                    });
                                }
                            }
                        }

                        if fname.starts_with("in") && fname.ends_with("_input") {
                            if let Ok(val_str) = std::fs::read_to_string(sub.path()) {
                                if let Ok(millivolts) = val_str.trim().parse::<f64>() {
                                    let sensor_id = fname.replace("_input", "");
                                    let voltage = millivolts / 1000.0;
                                    
                                    let label = std::fs::read_to_string(
                                        hwmon_dir.join(fname.replace("_input", "_label"))
                                    )
                                    .unwrap_or_else(|_| sensor_id.clone())
                                    .trim()
                                    .to_string();

                                    sensors.push(core::SensorData {
                                        sensor_id: format!("{}-{}", chip_name, sensor_id),
                                        sensor_type: "voltage".to_string(),
                                        name: format!("{} - {}", chip_name, label),
                                        value: voltage,
                                        unit: "V".to_string(),
                                        timestamp: Utc::now(),
                                        status: core::SensorStatus::Normal,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        sensors
    }

    #[cfg(windows)]
    fn scan_hwmon_sensors() -> Vec<core::SensorData> {
        Vec::new()
    }
}

#[async_trait]
impl HardwareDriver for PlatformSensorDriver {
    async fn initialize(&mut self) -> HalResult<()> {
        log::info!("Initializing Platform Sensor Driver: {}", self.device_id);
        self.initialized = true;
        Ok(())
    }

    async fn read_data(&self) -> HalResult<CollectionResult> {
        if !self.initialized {
            return Err(HalError::NotInitialized);
        }

        let start = std::time::Instant::now();
        let sensors = Self::scan_hwmon_sensors();

        let mut prev = self.last_scan.lock().await;
        *prev = sensors.clone();

        let mut hw_info = HardwareInfo::new(self.device_id.clone(), HardwareType::Sensor);
        hw_info.sensors = sensors;
        hw_info.collected_at = Utc::now();

        let duration = start.elapsed().as_millis() as u64;
        Ok(CollectionResult::success(hw_info, duration))
    }

    fn get_device_info(&self) -> HalResult<HardwareInfo> {
        Err(HalError::NotInitialized)
    }

    fn get_device_id(&self) -> &str {
        &self.device_id
    }

    fn get_hardware_type(&self) -> HardwareType {
        HardwareType::Sensor
    }

    fn is_initialized(&self) -> bool {
        self.initialized
    }
}

pub fn create_all_platform_drivers() -> Vec<DriverBox> {
    vec![
        PlatformCpuDriver::new("cpu-001".to_string()).to_driver(),
        PlatformMemoryDriver::new("memory-001".to_string()).to_driver(),
        PlatformDiskDriver::new("disk-001".to_string()).to_driver(),
        PlatformNetworkDriver::new("network-001".to_string()).to_driver(),
        PlatformMotherboardDriver::new("motherboard-001".to_string()).to_driver(),
        PlatformExternalDeviceDriver::new("external-001".to_string()).to_driver(),
        PlatformSensorDriver::new("sensor-001".to_string()).to_driver(),
    ]
}

pub fn detect_platform() -> PlatformResult<String> {
    #[cfg(windows)]
    {
        Ok(format!("Windows {}", windows_impl::get_windows_version()?))
    }
    #[cfg(unix)]
    {
        Ok(format!("Linux {}", unix_impl::get_linux_kernel_version()?))
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::ptr;
    use winapi::shared::minwindef::DWORD;
    use winapi::um::sysinfoapi::GetSystemInfo;
    use winapi::um::winbase::GetComputerNameA;
    use winapi::um::winreg::{
        RegCloseKey, RegOpenKeyExA, RegQueryValueExA, HKEY_LOCAL_MACHINE, KEY_READ, REG_SZ,
    };

    pub fn get_system_info() -> PlatformResult<SystemInfo> {
        let os_name = "Windows".to_string();
        let os_version = get_windows_version()?;
        let architecture = get_architecture()?;
        let hostname = get_hostname()?;
        let kernel_version = os_version.clone();
        let uptime_seconds = get_uptime()?;

        Ok(SystemInfo {
            os_name,
            os_version,
            architecture,
            hostname,
            kernel_version,
            uptime_seconds,
        })
    }

    pub fn get_windows_version() -> PlatformResult<String> {
        let mut version = String::new();
        unsafe {
            let mut hkey: winapi::um::winreg::HKEY = ptr::null_mut();
            let result = RegOpenKeyExA(
                HKEY_LOCAL_MACHINE,
                b"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\0".as_ptr() as *const i8,
                0,
                KEY_READ,
                &mut hkey,
            );

            if result == 0 {
                let mut buf: [u8; 256] = [0; 256];
                let mut buf_len = buf.len() as DWORD;
                let mut value_type: DWORD = 0;

                let result = RegQueryValueExA(
                    hkey,
                    b"ProductName\0".as_ptr() as *const i8,
                    ptr::null_mut(),
                    &mut value_type,
                    buf.as_mut_ptr(),
                    &mut buf_len,
                );

                if result == 0 && value_type == REG_SZ {
                    version = String::from_utf8_lossy(&buf[..buf_len as usize - 1]).to_string();
                }

                RegCloseKey(hkey);
            }
        }

        if version.is_empty() {
            return Err(PlatformError::DetectionError(
                "Failed to read Windows version".to_string(),
            ));
        }
        Ok(version)
    }

    pub fn get_architecture() -> PlatformResult<String> {
        unsafe {
            let mut sys_info: winapi::um::sysinfoapi::SYSTEM_INFO = std::mem::zeroed();
            GetSystemInfo(&mut sys_info);
            match sys_info.wProcessorArchitecture {
                0 => Ok("x86".to_string()),
                9 => Ok("x64".to_string()),
                5 => Ok("ARM".to_string()),
                12 => Ok("ARM64".to_string()),
                _ => Ok("Unknown".to_string()),
            }
        }
    }

    pub fn get_hostname() -> PlatformResult<String> {
        unsafe {
            let mut buf: [u8; 256] = [0; 256];
            let mut buf_len = buf.len() as DWORD;

            if GetComputerNameA(buf.as_mut_ptr() as *mut i8, &mut buf_len) != 0 {
                Ok(String::from_utf8_lossy(&buf[..buf_len as usize]).to_string())
            } else {
                Err(PlatformError::SystemCallError(
                    "GetComputerNameA failed".to_string(),
                ))
            }
        }
    }

    pub fn get_uptime() -> PlatformResult<u64> {
        use winapi::um::sysinfoapi::GetTickCount64;
        unsafe { Ok((GetTickCount64() as f64 / 1000.0) as u64) }
    }
}

#[cfg(unix)]
mod unix_impl {
    use super::*;
    use std::fs;
    use std::path::Path;

    pub fn get_system_info() -> PlatformResult<SystemInfo> {
        let os_name = "Linux".to_string();
        let os_version = get_os_release()?;
        let architecture = get_architecture()?;
        let hostname = get_hostname()?;
        let kernel_version = get_linux_kernel_version()?;
        let uptime_seconds = get_uptime()?;

        Ok(SystemInfo {
            os_name,
            os_version,
            architecture,
            hostname,
            kernel_version,
            uptime_seconds,
        })
    }

    pub fn get_os_release() -> PlatformResult<String> {
        let path = Path::new("/etc/os-release");
        if path.exists() {
            let content = fs::read_to_string(path)
                .map_err(|e| PlatformError::FileReadError(format!("{}: {}", path.display(), e)))?;
            for line in content.lines() {
                if line.starts_with("PRETTY_NAME=") {
                    return Ok(line
                        .trim_start_matches("PRETTY_NAME=")
                        .trim_matches('"')
                        .to_string());
                }
            }
        }
        Ok("Unknown Linux".to_string())
    }

    pub fn get_linux_kernel_version() -> PlatformResult<String> {
        let content = fs::read_to_string("/proc/version")
            .map_err(|e| PlatformError::FileReadError(format!("/proc/version: {}", e)))?;
        let parts: Vec<&str> = content.split_whitespace().collect();
        if parts.len() > 2 {
            Ok(parts[2].to_string())
        } else {
            Err(PlatformError::DetectionError(
                "Failed to parse kernel version".to_string(),
            ))
        }
    }

    pub fn get_architecture() -> PlatformResult<String> {
        unsafe {
            let utsname: libc::utsname = std::mem::zeroed();
            if libc::uname(&utsname as *const _ as *mut libc::utsname) != 0 {
                return Err(PlatformError::SystemCallError("uname failed".to_string()));
            }
            let machine = std::ffi::CStr::from_ptr(utsname.machine.as_ptr())
                .to_string_lossy()
                .to_string();
            Ok(machine)
        }
    }

    pub fn get_hostname() -> PlatformResult<String> {
        unsafe {
            let mut buf: [u8; 256] = [0; 256];
            if libc::gethostname(buf.as_mut_ptr() as *mut i8, buf.len()) != 0 {
                return Err(PlatformError::SystemCallError(
                    "gethostname failed".to_string(),
                ));
            }
            let c_str = std::ffi::CStr::from_ptr(buf.as_ptr() as *const i8);
            Ok(c_str.to_string_lossy().to_string())
        }
    }

    pub fn get_uptime() -> PlatformResult<u64> {
        let content = fs::read_to_string("/proc/uptime")
            .map_err(|e| PlatformError::FileReadError(format!("/proc/uptime: {}", e)))?;
        let parts: Vec<&str> = content.split_whitespace().collect();
        if parts.is_empty() {
            return Err(PlatformError::DetectionError(
                "Failed to parse uptime".to_string(),
            ));
        }
        Ok(parts[0].parse::<f64>().unwrap_or(0.0) as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_platform() {
        let platform = detect_platform().unwrap();
        assert!(!platform.is_empty());
        println!("Detected platform: {}", platform);
    }

    #[test]
    fn test_system_info() {
        let info = SystemInfo::new().unwrap();
        assert!(!info.os_name.is_empty());
        assert!(!info.architecture.is_empty());
        assert!(!info.hostname.is_empty());
        println!(
            "System: {} {} ({}) - {}",
            info.os_name, info.os_version, info.architecture, info.hostname
        );
    }
}
