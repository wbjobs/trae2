use async_trait::async_trait;
use core::{CollectionResult, HardwareInfo, HardwareType};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Mutex;

#[derive(Error, Debug)]
pub enum HalError {
    #[error("Driver not found: {0}")]
    DriverNotFound(String),
    #[error("Initialization failed: {0}")]
    InitializationError(String),
    #[error("Read error: {0}")]
    ReadError(String),
    #[error("Device not initialized")]
    NotInitialized,
    #[error("Unsupported hardware type: {0:?}")]
    UnsupportedHardwareType(HardwareType),
}

pub type HalResult<T> = Result<T, HalError>;

#[async_trait]
pub trait HardwareDriver: Send + Sync {
    async fn initialize(&mut self) -> HalResult<()>;

    async fn read_data(&self) -> HalResult<CollectionResult>;

    fn get_device_info(&self) -> HalResult<HardwareInfo>;

    fn get_device_id(&self) -> &str;

    fn get_hardware_type(&self) -> HardwareType;

    fn is_initialized(&self) -> bool;
}

pub type DriverBox = Arc<Mutex<dyn HardwareDriver>>;

pub struct DriverManager {
    drivers: HashMap<String, DriverBox>,
    initialized: bool,
}

impl DriverManager {
    pub fn new() -> Self {
        Self {
            drivers: HashMap::new(),
            initialized: false,
        }
    }

    pub fn register_driver(&mut self, driver: DriverBox) {
        let device_id = {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async { driver.lock().await.get_device_id().to_string() })
        };
        log::debug!("Registering driver: {}", device_id);
        self.drivers.insert(device_id, driver);
    }

    pub async fn initialize_all(&mut self) -> HalResult<()> {
        log::info!("Initializing all drivers...");
        for (device_id, driver) in &self.drivers {
            log::debug!("Initializing driver: {}", device_id);
            let mut driver = driver.lock().await;
            driver.initialize().await.map_err(|e| {
                log::error!("Failed to initialize driver {}: {}", device_id, e);
                e
            })?;
        }
        self.initialized = true;
        log::info!("All drivers initialized successfully");
        Ok(())
    }

    pub async fn read_all(&self) -> Vec<CollectionResult> {
        let mut results = Vec::new();
        for (device_id, driver) in &self.drivers {
            log::debug!("Reading data from: {}", device_id);
            let driver = driver.lock().await;
            match driver.read_data().await {
                Ok(result) => results.push(result),
                Err(e) => {
                    log::error!("Error reading from {}: {}", device_id, e);
                    results.push(CollectionResult::failure(e.to_string(), 0));
                }
            }
        }
        results
    }

    pub async fn read_all_parallel(&self) -> Vec<CollectionResult> {
        let mut handles = Vec::new();
        for (_, driver) in &self.drivers {
            let driver_clone = Arc::clone(driver);
            handles.push(tokio::spawn(async move {
                let driver = driver_clone.lock().await;
                driver.read_data().await.unwrap_or_else(|e| {
                    CollectionResult::failure(e.to_string(), 0)
                })
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(result) => results.push(result),
                Err(e) => {
                    log::error!("Task error: {}", e);
                    results.push(CollectionResult::failure(e.to_string(), 0));
                }
            }
        }
        results
    }

    pub fn get_driver(&self, device_id: &str) -> Option<&DriverBox> {
        self.drivers.get(device_id)
    }

    pub fn get_all_drivers(&self) -> &HashMap<String, DriverBox> {
        &self.drivers
    }

    pub fn get_driver_count(&self) -> usize {
        self.drivers.len()
    }

    pub fn is_all_initialized(&self) -> bool {
        self.initialized
    }

    pub async fn read_by_type(&self, hardware_type: HardwareType) -> Vec<CollectionResult> {
        let mut results = Vec::new();
        for (_, driver) in &self.drivers {
            let driver = driver.lock().await;
            if driver.get_hardware_type() == hardware_type {
                match driver.read_data().await {
                    Ok(result) => results.push(result),
                    Err(e) => results.push(CollectionResult::failure(e.to_string(), 0)),
                }
            }
        }
        results
    }
}

impl Default for DriverManager {
    fn default() -> Self {
        Self::new()
    }
}

pub struct MockCpuDriver {
    device_id: String,
    initialized: bool,
    data: Option<HardwareInfo>,
}

impl MockCpuDriver {
    pub fn new(device_id: String) -> Self {
        Self {
            device_id,
            initialized: false,
            data: None,
        }
    }
}

#[async_trait]
impl HardwareDriver for MockCpuDriver {
    async fn initialize(&mut self) -> HalResult<()> {
        log::info!("Initializing Mock CPU Driver: {}", self.device_id);
        self.initialized = true;
        Ok(())
    }

    async fn read_data(&self) -> HalResult<CollectionResult> {
        if !self.initialized {
            return Err(HalError::NotInitialized);
        }

        use chrono::Utc;
        use core::{CpuInfo, HardwareInfo, HardwareType};
        use std::collections::HashMap;

        let start = std::time::Instant::now();
        let cpu_info = CpuInfo {
            name: "Mock CPU".to_string(),
            vendor_id: "MOCK".to_string(),
            cores: 4,
            threads: 8,
            frequency_mhz: 3500.0,
            usage_percent: rand::random::<f64>() * 100.0,
            temperature_celsius: Some(45.0 + rand::random::<f64>() * 20.0),
            cache_l1_kb: 256,
            cache_l2_kb: 1024,
            cache_l3_kb: 8192,
        };

        let mut hw_info = HardwareInfo::new(self.device_id.clone(), HardwareType::Cpu);
        hw_info.cpu = Some(cpu_info);
        hw_info.collected_at = Utc::now();
        hw_info.extra = HashMap::new();

        let duration = start.elapsed().as_millis() as u64;
        Ok(CollectionResult::success(hw_info, duration))
    }

    fn get_device_info(&self) -> HalResult<HardwareInfo> {
        self.data
            .clone()
            .ok_or(HalError::NotInitialized)
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

#[cfg(test)]
mod tests {
    use super::*;
    use tokio;

    #[tokio::test]
    async fn test_mock_cpu_driver() {
        let mut driver = MockCpuDriver::new("cpu-001".to_string());
        assert!(!driver.is_initialized());

        driver.initialize().await.unwrap();
        assert!(driver.is_initialized());
        assert_eq!(driver.get_device_id(), "cpu-001");
        assert_eq!(driver.get_hardware_type(), HardwareType::Cpu);

        let result = driver.read_data().await.unwrap();
        assert!(result.success);
        assert!(result.data.is_some());
        let data = result.data.unwrap();
        assert!(data.cpu.is_some());
    }

    #[tokio::test]
    async fn test_driver_manager() {
        let mut manager = DriverManager::new();
        let driver = Arc::new(Mutex::new(MockCpuDriver::new("cpu-001".to_string())));
        manager.register_driver(driver);

        assert_eq!(manager.get_driver_count(), 1);
        assert!(manager.get_driver("cpu-001").is_some());

        manager.initialize_all().await.unwrap();
        assert!(manager.is_all_initialized());

        let results = manager.read_all().await;
        assert_eq!(results.len(), 1);
        assert!(results[0].success);
    }
}
