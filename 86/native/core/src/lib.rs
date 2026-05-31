use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CoreError {
    #[error("Invalid data: {0}")]
    InvalidData(String),
    #[error("Serialization error: {0}")]
    SerializationError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum HardwareType {
    Cpu,
    Memory,
    Disk,
    Network,
    Motherboard,
    Sensor,
    ExternalDevice,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    pub name: String,
    pub vendor_id: String,
    pub cores: u32,
    pub threads: u32,
    pub frequency_mhz: f64,
    pub usage_percent: f64,
    pub temperature_celsius: Option<f64>,
    pub cache_l1_kb: u64,
    pub cache_l2_kb: u64,
    pub cache_l3_kb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub free_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub usage_percent: f64,
    pub speed_mhz: Option<u32>,
    pub slots_used: Option<u32>,
    pub slots_total: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub device_path: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub usage_percent: f64,
    pub filesystem: String,
    pub mount_point: String,
    pub is_removable: bool,
    pub drive_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub interface_name: String,
    pub mac_address: String,
    pub ipv4_addresses: Vec<String>,
    pub ipv6_addresses: Vec<String>,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub rx_packets: u64,
    pub tx_packets: u64,
    pub speed_mbps: Option<u32>,
    pub is_up: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotherboardInfo {
    pub manufacturer: String,
    pub model: String,
    pub version: String,
    pub serial_number: String,
    pub bios_version: String,
    pub bios_release_date: Option<String>,
    pub chipset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalDevice {
    pub device_id: String,
    pub name: String,
    pub device_type: String,
    pub vendor_id: String,
    pub product_id: String,
    pub serial_number: Option<String>,
    pub connection_type: String,
    pub is_connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorData {
    pub sensor_id: String,
    pub sensor_type: String,
    pub name: String,
    pub value: f64,
    pub unit: String,
    pub timestamp: DateTime<Utc>,
    pub status: SensorStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum SensorStatus {
    Normal,
    Warning,
    Critical,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareInfo {
    pub device_id: String,
    pub hardware_type: HardwareType,
    pub cpu: Option<CpuInfo>,
    pub memory: Option<MemoryInfo>,
    pub disks: Vec<DiskInfo>,
    pub networks: Vec<NetworkInfo>,
    pub motherboard: Option<MotherboardInfo>,
    pub external_devices: Vec<ExternalDevice>,
    pub sensors: Vec<SensorData>,
    pub collected_at: DateTime<Utc>,
    pub extra: HashMap<String, String>,
}

impl HardwareInfo {
    pub fn new(device_id: String, hardware_type: HardwareType) -> Self {
        Self {
            device_id,
            hardware_type,
            cpu: None,
            memory: None,
            disks: Vec::new(),
            networks: Vec::new(),
            motherboard: None,
            external_devices: Vec::new(),
            sensors: Vec::new(),
            collected_at: Utc::now(),
            extra: HashMap::new(),
        }
    }

    pub fn to_json(&self) -> Result<String, CoreError> {
        serde_json::to_string(self).map_err(|e| CoreError::SerializationError(e.to_string()))
    }

    pub fn from_json(json: &str) -> Result<Self, CoreError> {
        serde_json::from_str(json).map_err(|e| CoreError::SerializationError(e.to_string()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionResult {
    pub success: bool,
    pub data: Option<HardwareInfo>,
    pub error: Option<String>,
    pub collected_at: DateTime<Utc>,
    pub duration_ms: u64,
}

impl CollectionResult {
    pub fn success(data: HardwareInfo, duration_ms: u64) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            collected_at: Utc::now(),
            duration_ms,
        }
    }

    pub fn failure(error: String, duration_ms: u64) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
            collected_at: Utc::now(),
            duration_ms,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum AlertLevel {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub rule_id: String,
    pub name: String,
    pub hardware_type: String,
    pub metric: String,
    pub operator: String,
    pub threshold: f64,
    pub duration_secs: u64,
    pub enabled: bool,
    pub level: AlertLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertEvent {
    pub rule_id: String,
    pub rule_name: String,
    pub hardware_type: String,
    pub metric: String,
    pub current_value: f64,
    pub threshold: f64,
    pub level: AlertLevel,
    pub message: String,
    pub triggered_at: DateTime<Utc>,
}

pub struct AlertEngine {
    rules: Vec<AlertRule>,
}

impl AlertEngine {
    pub fn new() -> Self {
        Self { rules: Vec::new() }
    }

    pub fn add_rule(&mut self, rule: AlertRule) {
        self.rules.push(rule);
    }

    pub fn remove_rule(&mut self, rule_id: &str) {
        self.rules.retain(|r| r.rule_id != rule_id);
    }

    pub fn check_hardware_info(&self, info: &HardwareInfo) -> Vec<AlertEvent> {
        let mut events = Vec::new();
        let mut candidates: Vec<(String, String, f64)> = Vec::new();

        if let Some(cpu) = &info.cpu {
            candidates.push(("Cpu".to_string(), "usage_percent".to_string(), cpu.usage_percent));
            if let Some(temp) = cpu.temperature_celsius {
                candidates.push(("Cpu".to_string(), "temperature_celsius".to_string(), temp));
            }
        }
        if let Some(mem) = &info.memory {
            candidates.push(("Memory".to_string(), "usage_percent".to_string(), mem.usage_percent));
        }
        for disk in &info.disks {
            candidates.push(("Disk".to_string(), "usage_percent".to_string(), disk.usage_percent));
        }
        for sensor in &info.sensors {
            candidates.push(("Sensor".to_string(), sensor.sensor_type.clone(), sensor.value));
        }

        for rule in &self.rules {
            if !rule.enabled {
                continue;
            }
            for (hw, metric, value) in &candidates {
                if &rule.hardware_type != hw || &rule.metric != metric {
                    continue;
                }
                let triggered = match rule.operator.as_str() {
                    "gt" => value > &rule.threshold,
                    "gte" => value >= &rule.threshold,
                    "lt" => value < &rule.threshold,
                    "lte" => value <= &rule.threshold,
                    "eq" => (value - rule.threshold).abs() < f64::EPSILON,
                    _ => false,
                };
                if triggered {
                    events.push(AlertEvent {
                        rule_id: rule.rule_id.clone(),
                        rule_name: rule.name.clone(),
                        hardware_type: rule.hardware_type.clone(),
                        metric: rule.metric.clone(),
                        current_value: *value,
                        threshold: rule.threshold,
                        level: rule.level.clone(),
                        message: format!(
                            "{} {} {} (current: {})",
                            rule.metric, rule.operator, rule.threshold, value
                        ),
                        triggered_at: Utc::now(),
                    });
                }
            }
        }

        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpu_info_serialization() {
        let cpu = CpuInfo {
            name: "Intel Core i7-10700K".to_string(),
            vendor_id: "GenuineIntel".to_string(),
            cores: 8,
            threads: 16,
            frequency_mhz: 3800.0,
            usage_percent: 45.5,
            temperature_celsius: Some(65.2),
            cache_l1_kb: 512,
            cache_l2_kb: 2048,
            cache_l3_kb: 16384,
        };

        let json = serde_json::to_string(&cpu).unwrap();
        let deserialized: CpuInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(cpu.name, deserialized.name);
        assert_eq!(cpu.cores, deserialized.cores);
    }

    #[test]
    fn test_hardware_info_creation() {
        let mut info = HardwareInfo::new("test-123".to_string(), HardwareType::Cpu);
        assert_eq!(info.device_id, "test-123");
        assert_eq!(info.hardware_type, HardwareType::Cpu);
        assert!(info.cpu.is_none());

        info.cpu = Some(CpuInfo {
            name: "Test CPU".to_string(),
            vendor_id: "TEST".to_string(),
            cores: 4,
            threads: 8,
            frequency_mhz: 2000.0,
            usage_percent: 50.0,
            temperature_celsius: None,
            cache_l1_kb: 256,
            cache_l2_kb: 1024,
            cache_l3_kb: 8192,
        });

        assert!(info.cpu.is_some());
    }
}
