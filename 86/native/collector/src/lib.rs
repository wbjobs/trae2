use chrono::{DateTime, Utc};
use config::{AppConfig, CollectionRule};
use core::{CollectionResult, HardwareInfo};
use hal::DriverManager;
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::mpsc::{self, Receiver, Sender};
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;

#[derive(Error, Debug)]
pub enum CollectorError {
    #[error("Initialization error: {0}")]
    InitializationError(String),
    #[error("Collection error: {0}")]
    CollectionError(String),
    #[error("Not initialized")]
    NotInitialized,
    #[error("Already running")]
    AlreadyRunning,
    #[error("Not running")]
    NotRunning,
    #[error("Send error: {0}")]
    SendError(String),
    #[error("Timeout error")]
    Timeout,
}

pub type CollectorResult<T> = Result<T, CollectorError>;

pub type DataCallback = Arc<dyn Fn(Vec<CollectionResult>) + Send + Sync>;

#[derive(Debug, Clone)]
pub struct CollectorStatus {
    pub is_running: bool,
    pub collection_count: u64,
    pub last_collection_at: Option<DateTime<Utc>>,
    pub avg_duration_ms: f64,
    pub total_duration_ms: u64,
    pub error_count: u64,
}

pub struct DataCollector {
    driver_manager: Arc<Mutex<DriverManager>>,
    config: Arc<RwLock<AppConfig>>,
    status: Arc<RwLock<CollectorStatus>>,
    is_running: Arc<RwLock<bool>>,
    collection_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
    stop_sender: Arc<RwLock<Option<Sender<()>>>>,
    callback: Option<DataCallback>,
    data_sender: Sender<Vec<CollectionResult>>,
    data_receiver: Arc<Mutex<Option<Receiver<Vec<CollectionResult>>>>>,
    initialized: bool,
}

impl DataCollector {
    pub fn new(config: AppConfig) -> Self {
        let (data_sender, data_receiver) = mpsc::channel(1000);

        Self {
            driver_manager: Arc::new(Mutex::new(DriverManager::new())),
            config: Arc::new(RwLock::new(config)),
            status: Arc::new(RwLock::new(CollectorStatus {
                is_running: false,
                collection_count: 0,
                last_collection_at: None,
                avg_duration_ms: 0.0,
                total_duration_ms: 0,
                error_count: 0,
            })),
            is_running: Arc::new(RwLock::new(false)),
            collection_handle: Arc::new(RwLock::new(None)),
            stop_sender: Arc::new(RwLock::new(None)),
            callback: None,
            data_sender,
            data_receiver: Arc::new(Mutex::new(Some(data_receiver))),
            initialized: false,
        }
    }

    pub fn with_callback(config: AppConfig, callback: DataCallback) -> Self {
        let mut collector = Self::new(config);
        collector.callback = Some(callback);
        collector
    }

    pub async fn initialize(&mut self) -> CollectorResult<()> {
        log::info!("Initializing DataCollector...");

        let drivers = platform::create_all_platform_drivers();
        log::info!("Registering {} platform drivers", drivers.len());

        let mut dm = self.driver_manager.lock().await;
        for driver in drivers {
            dm.register_driver(driver);
        }

        dm.initialize_all()
            .await
            .map_err(|e| CollectorError::InitializationError(e.to_string()))?;

        self.initialized = true;
        log::info!("DataCollector initialized successfully");
        Ok(())
    }

    pub async fn collect_once(&self) -> CollectorResult<Vec<CollectionResult>> {
        if !self.initialized {
            return Err(CollectorError::NotInitialized);
        }

        log::debug!("Performing one-time data collection");

        let start = std::time::Instant::now();
        let dm = self.driver_manager.lock().await;

        let config = self.config.read().await;
        let rules: Vec<CollectionRule> = config
            .collection_rules
            .iter()
            .filter(|r| r.enabled)
            .cloned()
            .collect();

        let mut all_results = Vec::new();

        for rule in rules {
            let timeout = std::time::Duration::from_millis(rule.timeout_ms);
            let result = tokio::time::timeout(timeout, async {
                let mut results = Vec::new();
                for hw_type in &rule.hardware_types {
                    let type_results = dm.read_by_type(hw_type.clone()).await;
                    results.extend(type_results);
                }
                results
            })
            .await;

            match result {
                Ok(results) => all_results.extend(results),
                Err(_) => {
                    log::error!("Collection timed out for rule: {}", rule.rule_id);
                    all_results.push(CollectionResult::failure(
                        format!("Timeout for rule: {}", rule.rule_id),
                        0,
                    ));
                }
            }
        }

        let duration = start.elapsed().as_millis() as u64;
        self.update_status(&all_results, duration).await;

        if let Some(callback) = &self.callback {
            callback(all_results.clone());
        }

        Ok(all_results)
    }

    pub async fn collect_parallel(&self) -> CollectorResult<Vec<CollectionResult>> {
        if !self.initialized {
            return Err(CollectorError::NotInitialized);
        }

        log::debug!("Performing parallel data collection");

        let start = std::time::Instant::now();
        let dm = self.driver_manager.lock().await;
        let results = dm.read_all_parallel().await;

        let duration = start.elapsed().as_millis() as u64;
        self.update_status(&results, duration).await;

        if let Some(callback) = &self.callback {
            callback(results.clone());
        }

        Ok(results)
    }

    pub async fn start(&mut self) -> CollectorResult<()> {
        if !self.initialized {
            return Err(CollectorError::NotInitialized);
        }

        let is_running = *self.is_running.read().await;
        if is_running {
            return Err(CollectorError::AlreadyRunning);
        }

        log::info!("Starting continuous data collection");

        *self.is_running.write().await = true;
        self.status.write().await.is_running = true;

        let (stop_sender, mut stop_receiver) = mpsc::channel::<()>(1);
        *self.stop_sender.write().await = Some(stop_sender);

        let driver_manager = Arc::clone(&self.driver_manager);
        let config = Arc::clone(&self.config);
        let is_running = Arc::clone(&self.is_running);
        let status = Arc::clone(&self.status);
        let callback = self.callback.clone();
        let data_sender = self.data_sender.clone();

        let handle = tokio::spawn(async move {
            loop {
                let should_stop = tokio::select! {
                    _ = stop_receiver.recv() => {
                        log::info!("Received stop signal for data collection");
                        true
                    }
                    _ = async {
                        let cfg = config.read().await;
                        let interval = cfg
                            .collection_rules
                            .iter()
                            .filter(|r| r.enabled)
                            .map(|r| r.collection_interval_ms)
                            .min()
                            .unwrap_or(5000);
                        tokio::time::sleep(std::time::Duration::from_millis(interval)).await;
                    } => {
                        false
                    }
                };

                if should_stop || !*is_running.read().await {
                    break;
                }

                let start = std::time::Instant::now();
                let dm = driver_manager.lock().await;
                let results = dm.read_all_parallel().await;
                let duration = start.elapsed().as_millis() as u64;

                let mut status = status.write().await;
                status.collection_count += 1;
                status.last_collection_at = Some(Utc::now());
                status.total_duration_ms += duration;
                status.avg_duration_ms = status.total_duration_ms as f64 / status.collection_count as f64;
                status.error_count += results.iter().filter(|r| !r.success).count() as u64;

                if let Some(cb) = &callback {
                    cb(results.clone());
                }

                if let Err(e) = data_sender.send(results).await {
                    log::error!("Failed to send collection results: {}", e);
                }
            }

            log::info!("Data collection loop stopped");
        });

        *self.collection_handle.write().await = Some(handle);

        Ok(())
    }

    pub async fn stop(&mut self) -> CollectorResult<()> {
        let is_running = *self.is_running.read().await;
        if !is_running {
            return Err(CollectorError::NotRunning);
        }

        log::info!("Stopping data collection...");

        *self.is_running.write().await = false;
        self.status.write().await.is_running = false;

        if let Some(sender) = self.stop_sender.write().await.take() {
            let _ = sender.send(()).await;
        }

        if let Some(handle) = self.collection_handle.write().await.take() {
            handle.abort();
            let _ = handle.await;
        }

        log::info!("Data collection stopped");
        Ok(())
    }

    pub async fn get_status(&self) -> CollectorStatus {
        self.status.read().await.clone()
    }

    pub async fn get_data_receiver(&self) -> Option<Receiver<Vec<CollectionResult>>> {
        self.data_receiver.lock().await.take()
    }

    pub async fn collect_and_aggregate(&self) -> CollectorResult<HardwareInfo> {
        let results = self.collect_parallel().await?;

        let mut aggregated = HardwareInfo::new(
            self.config.read().await.device_id.clone(),
            core::HardwareType::Unknown,
        );

        for result in results {
            if let Some(data) = result.data {
                if data.cpu.is_some() {
                    aggregated.cpu = data.cpu;
                    aggregated.hardware_type = core::HardwareType::Cpu;
                }
                if data.memory.is_some() {
                    aggregated.memory = data.memory;
                }
                aggregated.disks.extend(data.disks);
                aggregated.networks.extend(data.networks);
                if data.motherboard.is_some() {
                    aggregated.motherboard = data.motherboard;
                }
                aggregated.external_devices.extend(data.external_devices);
                aggregated.sensors.extend(data.sensors);
                aggregated.extra.extend(data.extra);
            }
        }

        Ok(aggregated)
    }

    async fn update_status(&self, results: &[CollectionResult], duration: u64) {
        let mut status = self.status.write().await;
        status.collection_count += 1;
        status.last_collection_at = Some(Utc::now());
        status.total_duration_ms += duration;
        status.avg_duration_ms = status.total_duration_ms as f64 / status.collection_count as f64;
        status.error_count += results.iter().filter(|r| !r.success).count() as u64;
    }

    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }

    pub async fn update_config(&mut self, config: AppConfig) {
        *self.config.write().await = config;
    }

    pub async fn get_driver_count(&self) -> usize {
        self.driver_manager.lock().await.get_driver_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use config::AppConfig;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn test_collector_initialization() {
        let config = AppConfig::default();
        let mut collector = DataCollector::new(config);
        collector.initialize().await.unwrap();
        assert!(collector.is_initialized());
        assert!(collector.get_driver_count().await > 0);
    }

    #[tokio::test]
    async fn test_collect_once() {
        let config = AppConfig::default();
        let mut collector = DataCollector::new(config);
        collector.initialize().await.unwrap();

        let results = collector.collect_once().await.unwrap();
        assert!(!results.is_empty());
        println!("Collected {} results", results.len());

        for result in &results {
            println!(
                "  - Success: {}, Duration: {}ms",
                result.success, result.duration_ms
            );
            if let Some(data) = &result.data {
                if let Some(cpu) = &data.cpu {
                    println!("    CPU: {} ({}% used)", cpu.name, cpu.usage_percent);
                }
                if let Some(mem) = &data.memory {
                    println!("    Memory: {}% used", mem.usage_percent);
                }
                println!("    Disks: {}, Networks: {}", data.disks.len(), data.networks.len());
            }
        }
    }

    #[tokio::test]
    async fn test_collect_parallel() {
        let config = AppConfig::default();
        let mut collector = DataCollector::new(config);
        collector.initialize().await.unwrap();

        let results = collector.collect_parallel().await.unwrap();
        assert!(!results.is_empty());
    }

    #[tokio::test]
    async fn test_collector_with_callback() {
        let config = AppConfig::default();
        let counter = Arc::new(AtomicU64::new(0));
        let counter_clone = Arc::clone(&counter);

        let callback: DataCallback = Arc::new(move |results| {
            counter_clone.fetch_add(results.len() as u64, Ordering::SeqCst);
        });

        let mut collector = DataCollector::with_callback(config, callback);
        collector.initialize().await.unwrap();

        let _ = collector.collect_once().await.unwrap();
        assert!(counter.load(Ordering::SeqCst) > 0);
    }

    #[tokio::test]
    async fn test_collector_status() {
        let config = AppConfig::default();
        let mut collector = DataCollector::new(config);
        collector.initialize().await.unwrap();

        let status = collector.get_status().await;
        assert_eq!(status.collection_count, 0);
        assert!(!status.is_running);

        let _ = collector.collect_once().await.unwrap();

        let status = collector.get_status().await;
        assert_eq!(status.collection_count, 1);
        assert!(status.last_collection_at.is_some());
        assert!(status.avg_duration_ms > 0.0);
    }

    #[tokio::test]
    async fn test_not_initialized_error() {
        let config = AppConfig::default();
        let collector = DataCollector::new(config);
        let result = collector.collect_once().await;
        assert!(matches!(result, Err(CollectorError::NotInitialized)));
    }
}
