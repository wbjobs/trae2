use chrono::{DateTime, Utc};
use core::HardwareType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Config file not found: {0}")]
    FileNotFound(String),
    #[error("Config parse error: {0}")]
    ParseError(String),
    #[error("Config validation error: {0}")]
    ValidationError(String),
    #[error("IO error: {0}")]
    IoError(String),
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
}

pub type ConfigResult<T> = Result<T, ConfigError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConfig {
    pub device_id: String,
    pub name: String,
    pub hardware_type: HardwareType,
    pub enabled: bool,
    pub poll_interval_ms: u64,
    pub settings: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionRule {
    pub rule_id: String,
    pub name: String,
    pub enabled: bool,
    pub hardware_types: Vec<HardwareType>,
    pub collection_interval_ms: u64,
    pub timeout_ms: u64,
    pub max_retries: u32,
    pub filters: Vec<String>,
    pub aggregate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReporterConfig {
    pub reporter_id: String,
    pub name: String,
    pub enabled: bool,
    pub endpoint_url: String,
    pub auth_token: Option<String>,
    pub encryption_key: Option<String>,
    pub batch_size: usize,
    pub max_interval_ms: u64,
    pub retry_count: u32,
    pub retry_interval_ms: u64,
    pub timeout_ms: u64,
    pub use_tls: bool,
    pub tls_cert_path: Option<String>,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub file_path: Option<String>,
    pub max_file_size_mb: u64,
    pub max_files: u32,
    pub console_output: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub app_name: String,
    pub app_version: String,
    pub device_id: String,
    #[serde(default = "default_devices")]
    pub devices: Vec<DeviceConfig>,
    #[serde(default = "default_rules")]
    pub collection_rules: Vec<CollectionRule>,
    #[serde(default = "default_reporters")]
    pub reporters: Vec<ReporterConfig>,
    #[serde(default)]
    pub logging: LoggingConfig,
    #[serde(default)]
    pub extra: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn default_devices() -> Vec<DeviceConfig> {
    Vec::new()
}

fn default_rules() -> Vec<CollectionRule> {
    vec![CollectionRule::default()]
}

fn default_reporters() -> Vec<ReporterConfig> {
    Vec::new()
}

impl Default for CollectionRule {
    fn default() -> Self {
        Self {
            rule_id: "default-rule".to_string(),
            name: "Default Collection Rule".to_string(),
            enabled: true,
            hardware_types: vec![
                HardwareType::Cpu,
                HardwareType::Memory,
                HardwareType::Disk,
                HardwareType::Network,
            ],
            collection_interval_ms: 5000,
            timeout_ms: 30000,
            max_retries: 3,
            filters: Vec::new(),
            aggregate: true,
        }
    }
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: "info".to_string(),
            file_path: None,
            max_file_size_mb: 10,
            max_files: 5,
            console_output: true,
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            app_name: "hardware-monitor".to_string(),
            app_version: "1.0.0".to_string(),
            device_id: generate_device_id(),
            devices: Vec::new(),
            collection_rules: vec![CollectionRule::default()],
            reporters: Vec::new(),
            logging: LoggingConfig::default(),
            extra: HashMap::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}

fn generate_device_id() -> String {
    use std::env;
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    format!("device-{}-{}", hostname, chrono::Utc::now().timestamp())
}

pub struct ConfigManager {
    config_path: PathBuf,
    config: AppConfig,
}

impl ConfigManager {
    pub fn new(config_path: impl AsRef<Path>) -> Self {
        Self {
            config_path: config_path.as_ref().to_path_buf(),
            config: AppConfig::default(),
        }
    }

    pub fn load(&mut self) -> ConfigResult<()> {
        let path = &self.config_path;
        log::info!("Loading config from: {}", path.display());

        if !path.exists() {
            return Err(ConfigError::FileNotFound(path.display().to_string()));
        }

        let content = fs::read_to_string(path)
            .map_err(|e| ConfigError::IoError(format!("{}: {}", path.display(), e)))?;

        let format = self.detect_format(path)?;
        self.config = match format.as_str() {
            "json" => serde_json::from_str(&content)
                .map_err(|e| ConfigError::ParseError(format!("JSON: {}", e)))?,
            "yaml" | "yml" => serde_yaml::from_str(&content)
                .map_err(|e| ConfigError::ParseError(format!("YAML: {}", e)))?,
            _ => {
                return Err(ConfigError::UnsupportedFormat(format));
            }
        };

        self.validate()?;
        log::info!("Config loaded successfully");
        Ok(())
    }

    pub fn load_json(&mut self, json: &str) -> ConfigResult<()> {
        log::info!("Loading config from JSON string");
        self.config = serde_json::from_str(json)
            .map_err(|e| ConfigError::ParseError(format!("JSON: {}", e)))?;
        self.validate()?;
        Ok(())
    }

    pub fn load_yaml(&mut self, yaml: &str) -> ConfigResult<()> {
        log::info!("Loading config from YAML string");
        self.config = serde_yaml::from_str(yaml)
            .map_err(|e| ConfigError::ParseError(format!("YAML: {}", e)))?;
        self.validate()?;
        Ok(())
    }

    pub fn save(&self) -> ConfigResult<()> {
        let path = &self.config_path;
        log::info!("Saving config to: {}", path.display());

        let format = self.detect_format(path)?;
        let content = match format.as_str() {
            "json" => serde_json::to_string_pretty(&self.config)
                .map_err(|e| ConfigError::ParseError(format!("JSON: {}", e)))?,
            "yaml" | "yml" => serde_yaml::to_string(&self.config)
                .map_err(|e| ConfigError::ParseError(format!("YAML: {}", e)))?,
            _ => {
                return Err(ConfigError::UnsupportedFormat(format));
            }
        };

        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| ConfigError::IoError(format!("{}: {}", parent.display(), e)))?;
            }
        }

        fs::write(path, content)
            .map_err(|e| ConfigError::IoError(format!("{}: {}", path.display(), e)))?;
        log::info!("Config saved successfully");
        Ok(())
    }

    pub fn save_default(&self, path: impl AsRef<Path>) -> ConfigResult<()> {
        let path = path.as_ref();
        log::info!("Saving default config to: {}", path.display());
        let default_config = AppConfig::default();
        let content = serde_json::to_string_pretty(&default_config)
            .map_err(|e| ConfigError::ParseError(format!("JSON: {}", e)))?;

        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| ConfigError::IoError(format!("{}: {}", parent.display(), e)))?;
            }
        }

        fs::write(path, content)
            .map_err(|e| ConfigError::IoError(format!("{}: {}", path.display(), e)))?;
        Ok(())
    }

    fn detect_format(&self, path: &Path) -> ConfigResult<String> {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
            .ok_or_else(|| ConfigError::UnsupportedFormat(
                path.display().to_string()
            ))
    }

    pub fn validate(&self) -> ConfigResult<()> {
        if self.config.app_name.is_empty() {
            return Err(ConfigError::ValidationError(
                "app_name cannot be empty".to_string(),
            ));
        }

        if self.config.device_id.is_empty() {
            return Err(ConfigError::ValidationError(
                "device_id cannot be empty".to_string(),
            ));
        }

        for (i, device) in self.config.devices.iter().enumerate() {
            if device.device_id.is_empty() {
                return Err(ConfigError::ValidationError(format!(
                    "Device {} has empty device_id",
                    i
                )));
            }
            if device.poll_interval_ms == 0 {
                return Err(ConfigError::ValidationError(format!(
                    "Device {} has zero poll_interval_ms",
                    device.device_id
                )));
            }
        }

        for (i, rule) in self.config.collection_rules.iter().enumerate() {
            if rule.rule_id.is_empty() {
                return Err(ConfigError::ValidationError(format!(
                    "Rule {} has empty rule_id",
                    i
                )));
            }
            if rule.collection_interval_ms == 0 {
                return Err(ConfigError::ValidationError(format!(
                    "Rule {} has zero collection_interval_ms",
                    rule.rule_id
                )));
            }
        }

        for (i, reporter) in self.config.reporters.iter().enumerate() {
            if reporter.reporter_id.is_empty() {
                return Err(ConfigError::ValidationError(format!(
                    "Reporter {} has empty reporter_id",
                    i
                )));
            }
            if reporter.endpoint_url.is_empty() {
                return Err(ConfigError::ValidationError(format!(
                    "Reporter {} has empty endpoint_url",
                    reporter.reporter_id
                )));
            }
        }

        Ok(())
    }

    pub fn get_config(&self) -> &AppConfig {
        &self.config
    }

    pub fn get_config_mut(&mut self) -> &mut AppConfig {
        &mut self.config
    }

    pub fn set_config(&mut self, config: AppConfig) {
        self.config = config;
        self.config.updated_at = Utc::now();
    }

    pub fn add_device(&mut self, device: DeviceConfig) {
        self.config.devices.push(device);
        self.config.updated_at = Utc::now();
    }

    pub fn remove_device(&mut self, device_id: &str) -> Option<DeviceConfig> {
        let index = self.config.devices.iter().position(|d| d.device_id == device_id);
        if let Some(i) = index {
            self.config.updated_at = Utc::now();
            Some(self.config.devices.remove(i))
        } else {
            None
        }
    }

    pub fn get_device(&self, device_id: &str) -> Option<&DeviceConfig> {
        self.config.devices.iter().find(|d| d.device_id == device_id)
    }

    pub fn add_rule(&mut self, rule: CollectionRule) {
        self.config.collection_rules.push(rule);
        self.config.updated_at = Utc::now();
    }

    pub fn remove_rule(&mut self, rule_id: &str) -> Option<CollectionRule> {
        let index = self.config.collection_rules.iter().position(|r| r.rule_id == rule_id);
        if let Some(i) = index {
            self.config.updated_at = Utc::now();
            Some(self.config.collection_rules.remove(i))
        } else {
            None
        }
    }

    pub fn add_reporter(&mut self, reporter: ReporterConfig) {
        self.config.reporters.push(reporter);
        self.config.updated_at = Utc::now();
    }

    pub fn remove_reporter(&mut self, reporter_id: &str) -> Option<ReporterConfig> {
        let index = self.config.reporters.iter().position(|r| r.reporter_id == reporter_id);
        if let Some(i) = index {
            self.config.updated_at = Utc::now();
            Some(self.config.reporters.remove(i))
        } else {
            None
        }
    }

    pub fn to_json(&self) -> ConfigResult<String> {
        serde_json::to_string_pretty(&self.config)
            .map_err(|e| ConfigError::ParseError(format!("JSON: {}", e)))
    }

    pub fn to_yaml(&self) -> ConfigResult<String> {
        serde_yaml::to_string(&self.config)
            .map_err(|e| ConfigError::ParseError(format!("YAML: {}", e)))
    }

    pub fn get_enabled_devices(&self) -> Vec<&DeviceConfig> {
        self.config.devices.iter().filter(|d| d.enabled).collect()
    }

    pub fn get_enabled_rules(&self) -> Vec<&CollectionRule> {
        self.config
            .collection_rules
            .iter()
            .filter(|r| r.enabled)
            .collect()
    }

    pub fn get_enabled_reporters(&self) -> Vec<&ReporterConfig> {
        self.config.reporters.iter().filter(|r| r.enabled).collect()
    }

    pub fn get_config_path(&self) -> &Path {
        &self.config_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.app_name, "hardware-monitor");
        assert!(!config.device_id.is_empty());
        assert_eq!(config.collection_rules.len(), 1);
        assert!(config.collection_rules[0].enabled);
    }

    #[test]
    fn test_config_validation() {
        let mut config = AppConfig::default();
        config.validate().unwrap();

        config.app_name = String::new();
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_json_serialization() {
        let config = AppConfig::default();
        let json = serde_json::to_string_pretty(&config).unwrap();
        assert!(!json.is_empty());

        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.app_name, config.app_name);
        assert_eq!(deserialized.device_id, config.device_id);
    }

    #[test]
    fn test_config_manager() {
        let dir = tempdir().unwrap();
        let config_path = dir.path().join("config.json");

        let mut manager = ConfigManager::new(&config_path);
        manager.save_default(&config_path).unwrap();

        manager.load().unwrap();
        assert_eq!(manager.get_config().app_name, "hardware-monitor");

        let mut device = DeviceConfig {
            device_id: "test-001".to_string(),
            name: "Test Device".to_string(),
            hardware_type: HardwareType::Cpu,
            enabled: true,
            poll_interval_ms: 1000,
            settings: HashMap::new(),
        };

        manager.add_device(device.clone());
        assert_eq!(manager.get_config().devices.len(), 1);
        assert_eq!(manager.get_device("test-001").unwrap().device_id, "test-001");

        manager.save().unwrap();

        let removed = manager.remove_device("test-001").unwrap();
        assert_eq!(removed.device_id, "test-001");
        assert!(manager.get_device("test-001").is_none());
    }

    #[test]
    fn test_device_config() {
        let device = DeviceConfig {
            device_id: "cpu-001".to_string(),
            name: "Main CPU".to_string(),
            hardware_type: HardwareType::Cpu,
            enabled: true,
            poll_interval_ms: 2000,
            settings: HashMap::new(),
        };

        assert_eq!(device.device_id, "cpu-001");
        assert_eq!(device.hardware_type, HardwareType::Cpu);
        assert!(device.enabled);
    }

    #[test]
    fn test_reporter_config() {
        let reporter = ReporterConfig {
            reporter_id: "reporter-001".to_string(),
            name: "Main Reporter".to_string(),
            enabled: true,
            endpoint_url: "https://example.com/api/report".to_string(),
            auth_token: Some("secret-token".to_string()),
            encryption_key: None,
            batch_size: 100,
            max_interval_ms: 30000,
            retry_count: 3,
            retry_interval_ms: 5000,
            timeout_ms: 10000,
            use_tls: true,
            tls_cert_path: None,
            headers: HashMap::new(),
        };

        assert_eq!(reporter.reporter_id, "reporter-001");
        assert_eq!(reporter.batch_size, 100);
        assert!(reporter.use_tls);
    }
}
