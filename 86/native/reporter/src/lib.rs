use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use config::ReporterConfig;
use core::HardwareInfo;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

#[derive(Error, Debug)]
pub enum ReporterError {
    #[error("Encryption error: {0}")]
    EncryptionError(String),
    #[error("Decryption error: {0}")]
    DecryptionError(String),
    #[error("HTTP error: {0}")]
    HttpError(String),
    #[error("Serialization error: {0}")]
    SerializationError(String),
    #[error("Invalid key: {0}")]
    InvalidKey(String),
    #[error("Timeout: {0}")]
    Timeout(String),
    #[error("All retries failed")]
    AllRetriesFailed,
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}

pub type ReporterResult<T> = Result<T, ReporterError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    pub ciphertext: String,
    pub nonce: String,
    pub algorithm: String,
    pub timestamp: DateTime<Utc>,
    pub compressed: bool,
    pub original_size: u64,
    pub compressed_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportBatch {
    pub batch_id: String,
    pub device_id: String,
    pub data: Vec<HardwareInfo>,
    pub timestamp: DateTime<Utc>,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportResponse {
    pub success: bool,
    pub message: Option<String>,
    pub batch_id: Option<String>,
    pub received_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct ReporterStatus {
    pub total_reports: u64,
    pub successful_reports: u64,
    pub failed_reports: u64,
    pub total_retries: u64,
    pub last_report_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub queue_size: usize,
}

pub struct DataReporter {
    config: ReporterConfig,
    client: reqwest::Client,
    encryption_key: Option<Vec<u8>>,
    status: Arc<Mutex<ReporterStatus>>,
    queue: Arc<Mutex<Vec<HardwareInfo>>>,
    flush_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    is_flushing: Arc<Mutex<bool>>,
}

impl DataReporter {
    pub fn new(config: ReporterConfig) -> ReporterResult<Self> {
        if config.endpoint_url.is_empty() {
            return Err(ReporterError::InvalidConfig(
                "endpoint_url cannot be empty".to_string(),
            ));
        }

        let encryption_key = match &config.encryption_key {
            Some(key) => {
                let key_bytes = general_purpose::STANDARD
                    .decode(key)
                    .map_err(|e| ReporterError::InvalidKey(format!("Invalid base64 key: {}", e)))?;
                if key_bytes.len() != 32 {
                    return Err(ReporterError::InvalidKey(format!(
                        "Key must be 32 bytes (256 bits), got {} bytes",
                        key_bytes.len()
                    )));
                }
                Some(key_bytes)
            }
            None => None,
        };

        let client_builder = reqwest::Client::builder()
            .timeout(Duration::from_millis(config.timeout_ms))
            .connect_timeout(Duration::from_millis(config.timeout_ms));

        let client = client_builder
            .build()
            .map_err(|e| ReporterError::HttpError(format!("Failed to create client: {}", e)))?;

        Ok(Self {
            config,
            client,
            encryption_key,
            status: Arc::new(Mutex::new(ReporterStatus {
                total_reports: 0,
                successful_reports: 0,
                failed_reports: 0,
                total_retries: 0,
                last_report_at: None,
                last_error: None,
                queue_size: 0,
            })),
            queue: Arc::new(Mutex::new(Vec::new())),
            flush_handle: Arc::new(Mutex::new(None)),
            is_flushing: Arc::new(Mutex::new(false)),
        })
    }

    pub fn generate_encryption_key() -> String {
        let mut key = vec![0u8; 32];
        OsRng.fill_bytes(&mut key);
        general_purpose::STANDARD.encode(&key)
    }

    pub fn encrypt(&self, data: &[u8]) -> ReporterResult<EncryptedData> {
        let key_bytes = self
            .encryption_key
            .as_ref()
            .ok_or_else(|| ReporterError::EncryptionError("No encryption key configured".to_string()))?;

        let original_size = data.len() as u64;
        let compressed = Self::compress_data(data);
        let compressed_size = compressed.len() as u64;
        let should_use_compressed = compressed.len() < data.len();

        let payload = if should_use_compressed {
            &compressed
        } else {
            data
        };

        let key = Key::<Aes256Gcm>::from_slice(key_bytes);
        let cipher = Aes256Gcm::new(key);

        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, payload)
            .map_err(|e| ReporterError::EncryptionError(format!("Encryption failed: {}", e)))?;

        Ok(EncryptedData {
            ciphertext: general_purpose::STANDARD.encode(&ciphertext),
            nonce: general_purpose::STANDARD.encode(&nonce_bytes),
            algorithm: "AES-256-GCM".to_string(),
            timestamp: Utc::now(),
            compressed: should_use_compressed,
            original_size,
            compressed_size: if should_use_compressed { compressed_size } else { original_size },
        })
    }

    pub fn decrypt(&self, encrypted: &EncryptedData) -> ReporterResult<Vec<u8>> {
        let key_bytes = self
            .encryption_key
            .as_ref()
            .ok_or_else(|| ReporterError::DecryptionError("No encryption key configured".to_string()))?;

        let key = Key::<Aes256Gcm>::from_slice(key_bytes);
        let cipher = Aes256Gcm::new(key);

        let nonce_bytes = general_purpose::STANDARD
            .decode(&encrypted.nonce)
            .map_err(|e| ReporterError::DecryptionError(format!("Invalid nonce: {}", e)))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = general_purpose::STANDARD
            .decode(&encrypted.ciphertext)
            .map_err(|e| ReporterError::DecryptionError(format!("Invalid ciphertext: {}", e)))?;

        let decrypted = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| ReporterError::DecryptionError(format!("Decryption failed: {}", e)))?;

        if encrypted.compressed {
            Self::decompress_data(&decrypted)
        } else {
            Ok(decrypted)
        }
    }

    fn compress_data(data: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut encoder = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::fast);
        if encoder.write_all(data).is_ok() {
            if let Ok(compressed) = encoder.finish() {
                return compressed;
            }
        }
        data.to_vec()
    }

    fn decompress_data(data: &[u8]) -> ReporterResult<Vec<u8>> {
        use std::io::Read;
        let mut decoder = flate2::read::DeflateDecoder::new(data);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)
            .map_err(|e| ReporterError::DecryptionError(format!("Decompression failed: {}", e)))?;
        Ok(decompressed)
    }

    pub async fn report(&self, data: &HardwareInfo) -> ReporterResult<ReportResponse> {
        let batch = ReportBatch {
            batch_id: self.generate_batch_id(),
            device_id: data.device_id.clone(),
            data: vec![data.clone()],
            timestamp: Utc::now(),
            count: 1,
        };

        self.send_batch(&batch).await
    }

    pub async fn report_batch(&self, data: Vec<HardwareInfo>) -> ReporterResult<ReportResponse> {
        if data.is_empty() {
            return Err(ReporterError::InvalidConfig(
                "Cannot send empty batch".to_string(),
            ));
        }

        let device_id = data[0].device_id.clone();
        let batch = ReportBatch {
            batch_id: self.generate_batch_id(),
            device_id,
            data,
            timestamp: Utc::now(),
            count: data.len(),
        };

        self.send_batch(&batch).await
    }

    pub async fn queue_data(&self, data: HardwareInfo) {
        let mut queue = self.queue.lock().await;
        queue.push(data);
        self.status.lock().await.queue_size = queue.len();

        if queue.len() >= self.config.batch_size {
            drop(queue);
            let self_clone = self.clone();
            tokio::spawn(async move {
                let _ = self_clone.flush().await;
            });
        }
    }

    pub async fn flush(&self) -> ReporterResult<Option<ReportResponse>> {
        let mut is_flushing = self.is_flushing.lock().await;
        if *is_flushing {
            return Ok(None);
        }
        *is_flushing = true;
        drop(is_flushing);

        let queue_data: Vec<HardwareInfo> = {
            let mut queue = self.queue.lock().await;
            if queue.is_empty() {
                let mut is_flushing = self.is_flushing.lock().await;
                *is_flushing = false;
                return Ok(None);
            }
            let data = queue.drain(..).collect();
            self.status.lock().await.queue_size = 0;
            data
        };

        let result = self.report_batch(queue_data).await;

        let mut is_flushing = self.is_flushing.lock().await;
        *is_flushing = false;

        match result {
            Ok(response) => Ok(Some(response)),
            Err(e) => Err(e),
        }
    }

    pub fn start_auto_flush(&mut self) {
        let queue = Arc::clone(&self.queue);
        let status = Arc::clone(&self.status);
        let is_flushing = Arc::clone(&self.is_flushing);
        let config = self.config.clone();
        let self_clone = self.clone();

        let handle = tokio::spawn(async move {
            loop {
                sleep(Duration::from_millis(config.max_interval_ms)).await;

                let queue_len = queue.lock().await.len();
                if queue_len == 0 {
                    continue;
                }

                let flushing = *is_flushing.lock().await;
                if flushing {
                    continue;
                }

                log::debug!("Auto-flushing {} items from queue", queue_len);

                let queue_data: Vec<HardwareInfo> = {
                    let mut q = queue.lock().await;
                    let data = q.drain(..).collect();
                    status.lock().await.queue_size = 0;
                    data
                };

                if !queue_data.is_empty() {
                    *is_flushing.lock().await = true;
                    let _ = self_clone.report_batch(queue_data).await;
                    *is_flushing.lock().await = false;
                }
            }
        });

        self.flush_handle = Arc::new(Mutex::new(Some(handle)));
    }

    pub async fn stop_auto_flush(&mut self) {
        if let Some(handle) = self.flush_handle.lock().await.take() {
            handle.abort();
            let _ = handle.await;
        }
        let _ = self.flush().await;
    }

    async fn send_batch(&self, batch: &ReportBatch) -> ReporterResult<ReportResponse> {
        let json = serde_json::to_string(batch)
            .map_err(|e| ReporterError::SerializationError(e.to_string()))?;

        let payload = if self.encryption_key.is_some() {
            let encrypted = self.encrypt(json.as_bytes())?;
            serde_json::to_string(&encrypted)
                .map_err(|e| ReporterError::SerializationError(e.to_string()))?
        } else {
            json
        };

        let mut last_error = None;

        for attempt in 0..=self.config.retry_count {
            if attempt > 0 {
                self.status.lock().await.total_retries += 1;
                log::warn!(
                    "Retry {} for batch {}, waiting {}ms",
                    attempt,
                    batch.batch_id,
                    self.config.retry_interval_ms
                );
                sleep(Duration::from_millis(self.config.retry_interval_ms)).await;
            }

            let result = self.send_request(&payload).await;
            self.status.lock().await.total_reports += 1;

            match result {
                Ok(response) => {
                    let mut status = self.status.lock().await;
                    status.successful_reports += 1;
                    status.last_report_at = Some(Utc::now());
                    status.last_error = None;
                    return Ok(response);
                }
                Err(e) => {
                    last_error = Some(e);
                    log::error!(
                        "Attempt {} failed for batch {}: {}",
                        attempt + 1,
                        batch.batch_id,
                        last_error.as_ref().unwrap()
                    );
                }
            }
        }

        let mut status = self.status.lock().await;
        status.failed_reports += 1;
        status.last_error = last_error.as_ref().map(|e| e.to_string());

        Err(ReporterError::AllRetriesFailed)
    }

    async fn send_request(&self, payload: &str) -> ReporterResult<ReportResponse> {
        let mut request = self
            .client
            .post(&self.config.endpoint_url)
            .header("Content-Type", "application/json");

        if let Some(token) = &self.config.auth_token {
            request = request.header("Authorization", format!("Bearer {}", token));
        }

        for (key, value) in &self.config.headers {
            request = request.header(key, value);
        }

        let response = request
            .body(payload.to_string())
            .send()
            .await
            .map_err(|e| ReporterError::HttpError(format!("Request failed: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let error_body = response
                .text()
                .await
                .unwrap_or_else(|_| "No error body".to_string());
            return Err(ReporterError::HttpError(format!(
                "HTTP {}: {}",
                status, error_body
            )));
        }

        let response_body = response
            .text()
            .await
            .map_err(|e| ReporterError::HttpError(format!("Failed to read response: {}", e)))?;

        let report_response: ReportResponse = serde_json::from_str(&response_body)
            .map_err(|e| ReporterError::SerializationError(format!("Invalid response: {}", e)))?;

        Ok(report_response)
    }

    fn generate_batch_id(&self) -> String {
        let mut bytes = [0u8; 16];
        OsRng.fill_bytes(&mut bytes);
        format!(
            "batch-{}-{}",
            hex::encode(&bytes),
            Utc::now().timestamp_millis()
        )
    }

    pub async fn get_status(&self) -> ReporterStatus {
        self.status.lock().await.clone()
    }

    pub fn get_config(&self) -> &ReporterConfig {
        &self.config
    }

    pub async fn get_queue_size(&self) -> usize {
        self.queue.lock().await.len()
    }
}

impl Clone for DataReporter {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            client: self.client.clone(),
            encryption_key: self.encryption_key.clone(),
            status: Arc::clone(&self.status),
            queue: Arc::clone(&self.queue),
            flush_handle: Arc::clone(&self.flush_handle),
            is_flushing: Arc::clone(&self.is_flushing),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::{HardwareInfo, HardwareType};
    use std::collections::HashMap;

    #[test]
    fn test_key_generation() {
        let key = DataReporter::generate_encryption_key();
        assert!(!key.is_empty());
        let decoded = general_purpose::STANDARD.decode(&key).unwrap();
        assert_eq!(decoded.len(), 32);
    }

    #[test]
    fn test_encryption_decryption() {
        let key = DataReporter::generate_encryption_key();
        let config = ReporterConfig {
            reporter_id: "test".to_string(),
            name: "Test Reporter".to_string(),
            enabled: true,
            endpoint_url: "http://example.com".to_string(),
            auth_token: None,
            encryption_key: Some(key),
            batch_size: 100,
            max_interval_ms: 5000,
            retry_count: 3,
            retry_interval_ms: 1000,
            timeout_ms: 10000,
            use_tls: false,
            tls_cert_path: None,
            headers: HashMap::new(),
        };

        let reporter = DataReporter::new(config).unwrap();
        let data = b"Hello, World!";

        let encrypted = reporter.encrypt(data).unwrap();
        assert_eq!(encrypted.algorithm, "AES-256-GCM");
        assert!(!encrypted.ciphertext.is_empty());
        assert!(!encrypted.nonce.is_empty());

        let decrypted = reporter.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, data);
    }

    #[test]
    fn test_invalid_key() {
        let config = ReporterConfig {
            reporter_id: "test".to_string(),
            name: "Test Reporter".to_string(),
            enabled: true,
            endpoint_url: "http://example.com".to_string(),
            auth_token: None,
            encryption_key: Some("invalid-key".to_string()),
            batch_size: 100,
            max_interval_ms: 5000,
            retry_count: 3,
            retry_interval_ms: 1000,
            timeout_ms: 10000,
            use_tls: false,
            tls_cert_path: None,
            headers: HashMap::new(),
        };

        let result = DataReporter::new(config);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_endpoint() {
        let config = ReporterConfig {
            reporter_id: "test".to_string(),
            name: "Test Reporter".to_string(),
            enabled: true,
            endpoint_url: "".to_string(),
            auth_token: None,
            encryption_key: None,
            batch_size: 100,
            max_interval_ms: 5000,
            retry_count: 3,
            retry_interval_ms: 1000,
            timeout_ms: 10000,
            use_tls: false,
            tls_cert_path: None,
            headers: HashMap::new(),
        };

        let result = DataReporter::new(config);
        assert!(matches!(result, Err(ReporterError::InvalidConfig(_))));
    }

    #[tokio::test]
    async fn test_queue_and_flush() {
        let config = ReporterConfig {
            reporter_id: "test".to_string(),
            name: "Test Reporter".to_string(),
            enabled: true,
            endpoint_url: "http://example.com/api/report".to_string(),
            auth_token: Some("test-token".to_string()),
            encryption_key: None,
            batch_size: 2,
            max_interval_ms: 5000,
            retry_count: 0,
            retry_interval_ms: 1000,
            timeout_ms: 5000,
            use_tls: false,
            tls_cert_path: None,
            headers: HashMap::new(),
        };

        let reporter = DataReporter::new(config).unwrap();
        let hw_info = HardwareInfo::new("test-device".to_string(), HardwareType::Cpu);

        reporter.queue_data(hw_info.clone()).await;
        assert_eq!(reporter.get_queue_size().await, 1);

        reporter.queue_data(hw_info).await;
        assert_eq!(reporter.get_queue_size().await, 0);

        let status = reporter.get_status().await;
        assert_eq!(status.total_reports, 1);
        assert_eq!(status.failed_reports, 1);
    }

    #[test]
    fn test_no_encryption_key() {
        let config = ReporterConfig {
            reporter_id: "test".to_string(),
            name: "Test Reporter".to_string(),
            enabled: true,
            endpoint_url: "http://example.com".to_string(),
            auth_token: None,
            encryption_key: None,
            batch_size: 100,
            max_interval_ms: 5000,
            retry_count: 3,
            retry_interval_ms: 1000,
            timeout_ms: 10000,
            use_tls: false,
            tls_cert_path: None,
            headers: HashMap::new(),
        };

        let reporter = DataReporter::new(config).unwrap();
        let result = reporter.encrypt(b"test");
        assert!(matches!(result, Err(ReporterError::EncryptionError(_))));
    }
}
