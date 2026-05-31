#![allow(non_snake_case)]

use chrono::{DateTime, Utc};
use collector::{CollectorStatus, DataCollector};
use config::{AppConfig, ConfigManager, ReporterConfig};
use core::{CollectionResult, HardwareInfo};
use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction, JsNumber, JsObject, JsString, JsUndefined,
};
use napi_derive::napi;
use reporter::{DataReporter, ReporterStatus};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::sync::RwLock;

#[napi(object)]
pub struct NapiCpuInfo {
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

#[napi(object)]
pub struct NapiMemoryInfo {
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

#[napi(object)]
pub struct NapiDiskInfo {
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

#[napi(object)]
pub struct NapiNetworkInfo {
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

#[napi(object)]
pub struct NapiMotherboardInfo {
    pub manufacturer: String,
    pub model: String,
    pub version: String,
    pub serial_number: String,
    pub bios_version: String,
    pub bios_release_date: Option<String>,
    pub chipset: Option<String>,
}

#[napi(object)]
pub struct NapiExternalDevice {
    pub device_id: String,
    pub name: String,
    pub device_type: String,
    pub vendor_id: String,
    pub product_id: String,
    pub serial_number: Option<String>,
    pub connection_type: String,
    pub is_connected: bool,
}

#[napi(object)]
pub struct NapiSensorData {
    pub sensor_id: String,
    pub sensor_type: String,
    pub name: String,
    pub value: f64,
    pub unit: String,
    pub timestamp: String,
    pub status: String,
}

#[napi(object)]
pub struct NapiHardwareInfo {
    pub device_id: String,
    pub hardware_type: String,
    pub cpu: Option<NapiCpuInfo>,
    pub memory: Option<NapiMemoryInfo>,
    pub disks: Vec<NapiDiskInfo>,
    pub networks: Vec<NapiNetworkInfo>,
    pub motherboard: Option<NapiMotherboardInfo>,
    pub external_devices: Vec<NapiExternalDevice>,
    pub sensors: Vec<NapiSensorData>,
    pub collected_at: String,
    pub extra: Vec<(String, String)>,
}

#[napi(object)]
pub struct NapiCollectionResult {
    pub success: bool,
    pub data: Option<NapiHardwareInfo>,
    pub error: Option<String>,
    pub collected_at: String,
    pub duration_ms: u64,
}

#[napi(object)]
pub struct NapiCollectorStatus {
    pub is_running: bool,
    pub collection_count: u64,
    pub last_collection_at: Option<String>,
    pub avg_duration_ms: f64,
    pub total_duration_ms: u64,
    pub error_count: u64,
}

#[napi(object)]
pub struct NapiReporterStatus {
    pub total_reports: u64,
    pub successful_reports: u64,
    pub failed_reports: u64,
    pub total_retries: u64,
    pub last_report_at: Option<String>,
    pub last_error: Option<String>,
    pub queue_size: u32,
}

#[napi(object)]
pub struct NapiSystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub architecture: String,
    pub hostname: String,
    pub kernel_version: String,
    pub uptime_seconds: u64,
}

pub struct NapiHardwareMonitor {
    collector: Arc<RwLock<Option<DataCollector>>>,
    reporter: Arc<RwLock<Option<DataReporter>>>,
    config_manager: Arc<RwLock<Option<ConfigManager>>>,
    initialized: Arc<RwLock<bool>>,
    data_callback: Arc<Mutex<Option<ThreadsafeFunction<Vec<NapiCollectionResult>, ErrorStrategy::CalleeHandled>>>>,
}

impl Default for NapiHardwareMonitor {
    fn default() -> Self {
        Self::new()
    }
}

#[napi]
impl NapiHardwareMonitor {
    #[napi(constructor)]
    pub fn new() -> Self {
        let _ = env_logger::try_init();
        Self {
            collector: Arc::new(RwLock::new(None)),
            reporter: Arc::new(RwLock::new(None)),
            config_manager: Arc::new(RwLock::new(None)),
            initialized: Arc::new(RwLock::new(false)),
            data_callback: Arc::new(Mutex::new(None)),
        }
    }

    #[napi]
    pub async fn initHardware(&mut self) -> Result<bool> {
        log::info!("Initializing hardware monitor...");

        let config = if let Some(cm) = self.config_manager.read().await.as_ref() {
            cm.get_config().clone()
        } else {
            AppConfig::default()
        };

        let mut collector = DataCollector::new(config);
        collector.initialize().await.map_err(|e| {
            napi::Error::from_reason(format!("Failed to initialize collector: {}", e))
        })?;

        *self.collector.write().await = Some(collector);
        *self.initialized.write().await = true;

        log::info!("Hardware monitor initialized successfully");
        Ok(true)
    }

    #[napi]
    pub async fn collectOnce(&self) -> Result<Vec<NapiCollectionResult>> {
        let collector = self.collector.read().await;
        let collector = collector
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Collector not initialized"))?;

        let results = collector
            .collect_once()
            .await
            .map_err(|e| napi::Error::from_reason(format!("Collection failed: {}", e)))?;

        Ok(results.into_iter().map(convert_result).collect())
    }

    #[napi]
    pub async fn collectParallel(&self) -> Result<Vec<NapiCollectionResult>> {
        let collector = self.collector.read().await;
        let collector = collector
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Collector not initialized"))?;

        let results = collector
            .collect_parallel()
            .await
            .map_err(|e| napi::Error::from_reason(format!("Collection failed: {}", e)))?;

        Ok(results.into_iter().map(convert_result).collect())
    }

    #[napi]
    pub async fn startCollect(&mut self, callback: JsFunction) -> Result<bool> {
        let tsfn: ThreadsafeFunction<Vec<NapiCollectionResult>, ErrorStrategy::CalleeHandled> = callback
            .build_threadsafe_function()
            .callback(|ctx| Ok(vec![ctx.value]))
            .build()?;

        *self.data_callback.lock().await = Some(tsfn.clone());

        let collector_arc = Arc::clone(&self.collector);
        let callback_arc = Arc::clone(&self.data_callback);
        let initialized_arc = Arc::clone(&self.initialized);

        let config = if let Some(cm) = self.config_manager.read().await.as_ref() {
            cm.get_config().clone()
        } else {
            AppConfig::default()
        };

        let callback: collector::DataCallback = Arc::new(move |results| {
            let napi_results: Vec<NapiCollectionResult> =
                results.into_iter().map(convert_result).collect();

            if let Some(tsfn) = callback_arc.try_lock().and_then(|g| g.clone()) {
                tsfn.call(Ok(napi_results), ThreadsafeFunctionCallMode::Blocking);
            }
        });

        let mut collector = DataCollector::with_callback(config, callback);
        collector.initialize().await.map_err(|e| {
            napi::Error::from_reason(format!("Failed to initialize collector: {}", e))
        })?;

        collector.start().await.map_err(|e| {
            napi::Error::from_reason(format!("Failed to start collection: {}", e))
        })?;

        *self.collector.write().await = Some(collector);
        *self.initialized.write().await = true;

        Ok(true)
    }

    #[napi]
    pub async fn stopCollect(&mut self) -> Result<bool> {
        let mut collector = self.collector.write().await;
        if let Some(collector) = collector.as_mut() {
            collector.stop().await.map_err(|e| {
                napi::Error::from_reason(format!("Failed to stop collection: {}", e))
            })?;
        }

        *self.data_callback.lock().await = None;
        Ok(true)
    }

    #[napi]
    pub async fn loadConfig(&mut self, configPath: String) -> Result<bool> {
        log::info!("Loading config from: {}", configPath);

        let mut manager = ConfigManager::new(&configPath);
        manager
            .load()
            .map_err(|e| napi::Error::from_reason(format!("Failed to load config: {}", e)))?;

        *self.config_manager.write().await = Some(manager);

        if let Some(collector) = self.collector.write().await.as_mut() {
            collector
                .update_config(self.config_manager.read().await.as_ref().unwrap().get_config().clone())
                .await;
        }

        Ok(true)
    }

    #[napi]
    pub async fn loadConfigFromJson(&mut self, jsonString: String) -> Result<bool> {
        log::info!("Loading config from JSON string");

        let mut manager = ConfigManager::new("");
        manager
            .load_json(&jsonString)
            .map_err(|e| napi::Error::from_reason(format!("Failed to load config: {}", e)))?;

        *self.config_manager.write().await = Some(manager);

        if let Some(collector) = self.collector.write().await.as_mut() {
            collector
                .update_config(self.config_manager.read().await.as_ref().unwrap().get_config().clone())
                .await;
        }

        Ok(true)
    }

    #[napi]
    pub async fn getConfig(&self) -> Result<String> {
        let manager = self.config_manager.read().await;
        let manager = manager
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Config not loaded"))?;

        manager
            .to_json()
            .map_err(|e| napi::Error::from_reason(format!("Failed to serialize config: {}", e)))
    }

    #[napi]
    pub async fn initReporter(
        &mut self,
        endpointUrl: String,
        authToken: Option<String>,
        encryptionKey: Option<String>,
    ) -> Result<bool> {
        let config = ReporterConfig {
            reporter_id: "napi-reporter".to_string(),
            name: "NAPI Reporter".to_string(),
            enabled: true,
            endpoint_url: endpointUrl,
            auth_token: authToken,
            encryption_key: encryptionKey,
            batch_size: 100,
            max_interval_ms: 30000,
            retry_count: 3,
            retry_interval_ms: 5000,
            timeout_ms: 10000,
            use_tls: true,
            tls_cert_path: None,
            headers: std::collections::HashMap::new(),
        };

        let reporter = DataReporter::new(config)
            .map_err(|e| napi::Error::from_reason(format!("Failed to create reporter: {}", e)))?;

        *self.reporter.write().await = Some(reporter);
        Ok(true)
    }

    #[napi]
    pub async fn reportData(&self, data: String) -> Result<bool> {
        let reporter = self.reporter.read().await;
        let reporter = reporter
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Reporter not initialized"))?;

        let hw_info: HardwareInfo = serde_json::from_str(&data)
            .map_err(|e| napi::Error::from_reason(format!("Invalid hardware data: {}", e)))?;

        reporter
            .report(&hw_info)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Report failed: {}", e)))?;

        Ok(true)
    }

    #[napi]
    pub async fn reportBatch(&self, dataArray: Vec<String>) -> Result<bool> {
        let reporter = self.reporter.read().await;
        let reporter = reporter
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Reporter not initialized"))?;

        let mut hw_infos = Vec::new();
        for data in dataArray {
            let hw_info: HardwareInfo = serde_json::from_str(&data)
                .map_err(|e| napi::Error::from_reason(format!("Invalid hardware data: {}", e)))?;
            hw_infos.push(hw_info);
        }

        reporter
            .report_batch(hw_infos)
            .await
            .map_err(|e| napi::Error::from_reason(format!("Report failed: {}", e)))?;

        Ok(true)
    }

    #[napi]
    pub async fn queueData(&self, data: String) -> Result<()> {
        let reporter = self.reporter.read().await;
        let reporter = reporter
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Reporter not initialized"))?;

        let hw_info: HardwareInfo = serde_json::from_str(&data)
            .map_err(|e| napi::Error::from_reason(format!("Invalid hardware data: {}", e)))?;

        reporter.queue_data(hw_info).await;
        Ok(())
    }

    #[napi]
    pub async fn flushReporter(&self) -> Result<bool> {
        let reporter = self.reporter.read().await;
        let reporter = reporter
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Reporter not initialized"))?;

        reporter
            .flush()
            .await
            .map_err(|e| napi::Error::from_reason(format!("Flush failed: {}", e)))?;

        Ok(true)
    }

    #[napi]
    pub async fn getCollectorStatus(&self) -> Result<NapiCollectorStatus> {
        let collector = self.collector.read().await;
        let collector = collector
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Collector not initialized"))?;

        let status = collector.get_status().await;
        Ok(convert_collector_status(status))
    }

    #[napi]
    pub async fn getReporterStatus(&self) -> Result<NapiReporterStatus> {
        let reporter = self.reporter.read().await;
        let reporter = reporter
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Reporter not initialized"))?;

        let status = reporter.get_status().await;
        Ok(convert_reporter_status(status))
    }

    #[napi]
    pub async fn isInitialized(&self) -> Result<bool> {
        Ok(*self.initialized.read().await)
    }

    #[napi]
    pub async fn isCollecting(&self) -> Result<bool> {
        let collector = self.collector.read().await;
        if let Some(collector) = collector.as_ref() {
            Ok(collector.is_running().await)
        } else {
            Ok(false)
        }
    }

    #[napi]
    pub fn generateEncryptionKey(&self) -> String {
        DataReporter::generate_encryption_key()
    }

    #[napi]
    pub fn getSystemInfo(&self) -> Result<NapiSystemInfo> {
        let info = platform::SystemInfo::new()
            .map_err(|e| napi::Error::from_reason(format!("Failed to get system info: {}", e)))?;

        Ok(NapiSystemInfo {
            os_name: info.os_name,
            os_version: info.os_version,
            architecture: info.architecture,
            hostname: info.hostname,
            kernel_version: info.kernel_version,
            uptime_seconds: info.uptime_seconds,
        })
    }

    #[napi]
    pub async fn getAggregatedData(&self) -> Result<String> {
        let collector = self.collector.read().await;
        let collector = collector
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Collector not initialized"))?;

        let data = collector
            .collect_and_aggregate()
            .await
            .map_err(|e| napi::Error::from_reason(format!("Collection failed: {}", e)))?;

        serde_json::to_string(&data)
            .map_err(|e| napi::Error::from_reason(format!("Serialization failed: {}", e)))
    }
}

fn convert_result(result: CollectionResult) -> NapiCollectionResult {
    NapiCollectionResult {
        success: result.success,
        data: result.data.map(convert_hardware_info),
        error: result.error,
        collected_at: result.collected_at.to_rfc3339(),
        duration_ms: result.duration_ms,
    }
}

fn convert_hardware_info(info: HardwareInfo) -> NapiHardwareInfo {
    NapiHardwareInfo {
        device_id: info.device_id,
        hardware_type: format!("{:?}", info.hardware_type),
        cpu: info.cpu.map(|cpu| NapiCpuInfo {
            name: cpu.name,
            vendor_id: cpu.vendor_id,
            cores: cpu.cores,
            threads: cpu.threads,
            frequency_mhz: cpu.frequency_mhz,
            usage_percent: cpu.usage_percent,
            temperature_celsius: cpu.temperature_celsius,
            cache_l1_kb: cpu.cache_l1_kb,
            cache_l2_kb: cpu.cache_l2_kb,
            cache_l3_kb: cpu.cache_l3_kb,
        }),
        memory: info.memory.map(|mem| NapiMemoryInfo {
            total_bytes: mem.total_bytes,
            used_bytes: mem.used_bytes,
            available_bytes: mem.available_bytes,
            free_bytes: mem.free_bytes,
            swap_total_bytes: mem.swap_total_bytes,
            swap_used_bytes: mem.swap_used_bytes,
            usage_percent: mem.usage_percent,
            speed_mhz: mem.speed_mhz,
            slots_used: mem.slots_used,
            slots_total: mem.slots_total,
        }),
        disks: info
            .disks
            .into_iter()
            .map(|disk| NapiDiskInfo {
                name: disk.name,
                device_path: disk.device_path,
                total_bytes: disk.total_bytes,
                used_bytes: disk.used_bytes,
                free_bytes: disk.free_bytes,
                usage_percent: disk.usage_percent,
                filesystem: disk.filesystem,
                mount_point: disk.mount_point,
                is_removable: disk.is_removable,
                drive_type: disk.drive_type,
            })
            .collect(),
        networks: info
            .networks
            .into_iter()
            .map(|net| NapiNetworkInfo {
                interface_name: net.interface_name,
                mac_address: net.mac_address,
                ipv4_addresses: net.ipv4_addresses,
                ipv6_addresses: net.ipv6_addresses,
                rx_bytes: net.rx_bytes,
                tx_bytes: net.tx_bytes,
                rx_packets: net.rx_packets,
                tx_packets: net.tx_packets,
                speed_mbps: net.speed_mbps,
                is_up: net.is_up,
            })
            .collect(),
        motherboard: info.motherboard.map(|mb| NapiMotherboardInfo {
            manufacturer: mb.manufacturer,
            model: mb.model,
            version: mb.version,
            serial_number: mb.serial_number,
            bios_version: mb.bios_version,
            bios_release_date: mb.bios_release_date,
            chipset: mb.chipset,
        }),
        external_devices: info
            .external_devices
            .into_iter()
            .map(|dev| NapiExternalDevice {
                device_id: dev.device_id,
                name: dev.name,
                device_type: dev.device_type,
                vendor_id: dev.vendor_id,
                product_id: dev.product_id,
                serial_number: dev.serial_number,
                connection_type: dev.connection_type,
                is_connected: dev.is_connected,
            })
            .collect(),
        sensors: info
            .sensors
            .into_iter()
            .map(|s| NapiSensorData {
                sensor_id: s.sensor_id,
                sensor_type: s.sensor_type,
                name: s.name,
                value: s.value,
                unit: s.unit,
                timestamp: s.timestamp.to_rfc3339(),
                status: format!("{:?}", s.status),
            })
            .collect(),
        collected_at: info.collected_at.to_rfc3339(),
        extra: info.extra.into_iter().collect(),
    }
}

fn convert_collector_status(status: CollectorStatus) -> NapiCollectorStatus {
    NapiCollectorStatus {
        is_running: status.is_running,
        collection_count: status.collection_count,
        last_collection_at: status.last_collection_at.map(|t| t.to_rfc3339()),
        avg_duration_ms: status.avg_duration_ms,
        total_duration_ms: status.total_duration_ms,
        error_count: status.error_count,
    }
}

fn convert_reporter_status(status: ReporterStatus) -> NapiReporterStatus {
    NapiReporterStatus {
        total_reports: status.total_reports,
        successful_reports: status.successful_reports,
        failed_reports: status.failed_reports,
        total_retries: status.total_retries,
        last_report_at: status.last_report_at.map(|t| t.to_rfc3339()),
        last_error: status.last_error,
        queue_size: status.queue_size as u32,
    }
}

#[napi]
pub fn initHardwareSync() -> bool {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut monitor = NapiHardwareMonitor::new();
    rt.block_on(async { monitor.initHardware().await.unwrap_or(false) })
}

#[napi]
pub fn collectOnceSync() -> Result<Vec<NapiCollectionResult>> {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut monitor = NapiHardwareMonitor::new();
    rt.block_on(async {
        monitor.initHardware().await?;
        monitor.collectOnce().await
    })
}

#[napi]
pub fn getSystemInfoSync() -> Result<NapiSystemInfo> {
    let monitor = NapiHardwareMonitor::new();
    monitor.getSystemInfo()
}

#[napi]
pub fn generateEncryptionKeySync() -> String {
    DataReporter::generate_encryption_key()
}
