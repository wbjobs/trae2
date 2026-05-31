use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Duration, Utc};
use colored::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::cluster_connection::ConnectionResult;
use crate::container_status::NodeContainerStatus;
use crate::diagnostics::NodeDiagnostics;
use crate::resource_stats::NodeResourceStats;

const DEFAULT_STORAGE_DIR: &str = "data/history";
const INDEX_FILE: &str = "index.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskType {
    Connect,
    Status,
    Resource,
    Logs,
    Diagnose,
    Inspect,
}

impl std::fmt::Display for TaskType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            TaskType::Connect => "connect",
            TaskType::Status => "status",
            TaskType::Resource => "resource",
            TaskType::Logs => "logs",
            TaskType::Diagnose => "diagnose",
            TaskType::Inspect => "inspect",
        };
        write!(f, "{}", s)
    }
}

impl std::str::FromStr for TaskType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "connect" | "conn" => Ok(TaskType::Connect),
            "status" | "ps" => Ok(TaskType::Status),
            "resource" | "stats" => Ok(TaskType::Resource),
            "logs" | "log" => Ok(TaskType::Logs),
            "diagnose" | "diag" => Ok(TaskType::Diagnose),
            "inspect" | "all" => Ok(TaskType::Inspect),
            _ => Err(anyhow!("未知的任务类型: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectionRecord {
    pub id: String,
    pub task_type: TaskType,
    pub cluster_filter: Option<String>,
    pub node_filter: Option<String>,
    pub groups_filter: Vec<String>,
    pub labels_filter: Vec<(String, String)>,
    pub target_clusters: Vec<String>,
    pub target_nodes: Vec<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration_ms: u64,
    pub total_nodes: usize,
    pub success_nodes: usize,
    pub failed_nodes: usize,
    pub has_errors: bool,
    pub error_message: Option<String>,
    pub parameters: HashMap<String, String>,
    pub summary: InspectionSummary,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InspectionSummary {
    pub total_containers: Option<usize>,
    pub running_containers: Option<usize>,
    pub unhealthy_containers: Option<usize>,
    pub avg_cpu_percent: Option<f64>,
    pub avg_memory_percent: Option<f64>,
    pub critical_issues: Option<usize>,
    pub warning_issues: Option<usize>,
    pub disk_high_usage: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectionData {
    pub record: InspectionRecord,
    pub connection_results: Option<Vec<ConnectionResult>>,
    pub container_statuses: Option<Vec<NodeContainerStatus>>,
    pub resource_stats: Option<Vec<NodeResourceStats>>,
    pub diagnostics: Option<Vec<NodeDiagnostics>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageIndex {
    pub records: Vec<InspectionRecord>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    pub total_records: usize,
    pub total_size_bytes: u64,
    pub oldest_record: Option<DateTime<Utc>>,
    pub newest_record: Option<DateTime<Utc>>,
    pub by_task_type: HashMap<String, usize>,
    pub by_cluster: HashMap<String, usize>,
    pub storage_dir: PathBuf,
}

pub struct Storage {
    base_dir: PathBuf,
    index_path: PathBuf,
}

impl Storage {
    pub fn new() -> Result<Self> {
        Self::with_dir(DEFAULT_STORAGE_DIR)
    }

    pub fn with_dir<P: AsRef<Path>>(dir: P) -> Result<Self> {
        let base_dir = dir.as_ref().to_path_buf();
        if !base_dir.exists() {
            fs::create_dir_all(&base_dir)
                .with_context(|| format!("创建存储目录失败: {}", base_dir.display()))?;
        }

        let index_path = base_dir.join(INDEX_FILE);
        let storage = Self {
            base_dir,
            index_path,
        };

        if !storage.index_path.exists() {
            storage.save_index(&StorageIndex {
                records: Vec::new(),
                updated_at: Utc::now(),
            })?;
        }

        Ok(storage)
    }

    pub fn save_inspection(&self, data: &InspectionData) -> Result<String> {
        let record_id = &data.record.id;
        let date_dir = self.base_dir.join(
            data.record.start_time.format("%Y-%m-%d").to_string()
        );
        fs::create_dir_all(&date_dir)
            .with_context(|| format!("创建日期目录失败: {}", date_dir.display()))?;

        let file_name = format!("{}-{}.json",
            data.record.start_time.format("%H%M%S"),
            record_id
        );
        let file_path = date_dir.join(&file_name);

        let json = serde_json::to_string_pretty(data)
            .context("序列化巡检数据失败")?;

        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&file_path)
            .with_context(|| format!("创建巡检记录文件失败: {}", file_path.display()))?;

        let mut writer = BufWriter::new(file);
        writer.write_all(json.as_bytes())?;
        writer.flush()?;

        self.add_to_index(&data.record)?;

        tracing::info!("巡检记录已保存: {} ({})", record_id, file_path.display());
        Ok(record_id.clone())
    }

    fn add_to_index(&self, record: &InspectionRecord) -> Result<()> {
        let mut index = self.load_index()?;

        if let Some(pos) = index.records.iter().position(|r| r.id == record.id) {
            index.records[pos] = record.clone();
        } else {
            index.records.insert(0, record.clone());
        }

        index.records.sort_by(|a, b| b.start_time.cmp(&a.start_time));
        index.updated_at = Utc::now();
        self.save_index(&index)
    }

    fn load_index(&self) -> Result<StorageIndex> {
        if !self.index_path.exists() {
            return Ok(StorageIndex {
                records: Vec::new(),
                updated_at: Utc::now(),
            });
        }

        let content = fs::read_to_string(&self.index_path)
            .with_context(|| format!("读取索引文件失败: {}", self.index_path.display()))?;

        let index: StorageIndex = serde_json::from_str(&content)
            .with_context(|| format!("解析索引文件失败: {}", self.index_path.display()))?;

        Ok(index)
    }

    fn save_index(&self, index: &StorageIndex) -> Result<()> {
        let json = serde_json::to_string_pretty(index)
            .context("序列化索引失败")?;

        let temp_path = self.index_path.with_extension("json.tmp");
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&temp_path)
            .with_context(|| format!("创建临时索引文件失败: {}", temp_path.display()))?;

        let mut writer = BufWriter::new(file);
        writer.write_all(json.as_bytes())?;
        writer.flush()?;
        drop(writer);

        fs::rename(&temp_path, &self.index_path)
            .with_context(|| format!("重命名索引文件失败: {} -> {}",
                temp_path.display(), self.index_path.display()))?;

        Ok(())
    }

    pub fn list_records(
        &self,
        limit: usize,
        task_type: Option<&str>,
        cluster: Option<&str>,
    ) -> Result<Vec<InspectionRecord>> {
        let index = self.load_index()?;
        let mut records = index.records;

        if let Some(tt) = task_type {
            records.retain(|r| r.task_type.to_string() == tt.to_lowercase());
        }

        if let Some(c) = cluster {
            records.retain(|r| r.target_clusters.iter().any(|cl| cl == c));
        }

        records.truncate(limit);
        Ok(records)
    }

    pub fn get_record(&self, id: &str) -> Result<Option<InspectionData>> {
        let index = self.load_index()?;
        let Some(record) = index.records.iter().find(|r| r.id == id) else {
            return Ok(None);
        };

        let date_dir = self.base_dir.join(
            record.start_time.format("%Y-%m-%d").to_string()
        );

        for entry in WalkDir::new(&date_dir).max_depth(1).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let name = entry.file_name().to_string_lossy();
                if name.ends_with(&format!("-{}.json", id)) {
                    let content = fs::read_to_string(entry.path())
                        .with_context(|| format!("读取巡检记录失败: {}", entry.path().display()))?;
                    let data: InspectionData = serde_json::from_str(&content)
                        .with_context(|| format!("解析巡检记录失败: {}", entry.path().display()))?;
                    return Ok(Some(data));
                }
            }
        }

        Ok(None)
    }

    pub fn get_latest_record(&self) -> Result<Option<InspectionData>> {
        let index = self.load_index()?;
        let Some(latest) = index.records.first() else {
            return Ok(None);
        };
        self.get_record(&latest.id)
    }

    pub fn delete_record(&self, id: &str) -> Result<bool> {
        let mut index = self.load_index()?;
        let Some(pos) = index.records.iter().position(|r| r.id == id) else {
            return Ok(false);
        };

        let record = index.records.remove(pos);
        let date_dir = self.base_dir.join(
            record.start_time.format("%Y-%m-%d").to_string()
        );

        for entry in WalkDir::new(&date_dir).max_depth(1).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let name = entry.file_name().to_string_lossy();
                if name.ends_with(&format!("-{}.json", id)) {
                    fs::remove_file(entry.path())
                        .with_context(|| format!("删除巡检记录失败: {}", entry.path().display()))?;
                    break;
                }
            }
        }

        index.updated_at = Utc::now();
        self.save_index(&index)?;
        Ok(true)
    }

    pub fn delete_older_than(&self, days: u64) -> Result<usize> {
        let cutoff = Utc::now() - Duration::days(days as i64);
        let mut index = self.load_index()?;
        let mut deleted = 0usize;

        let to_delete: Vec<String> = index.records
            .iter()
            .filter(|r| r.start_time < cutoff)
            .map(|r| r.id.clone())
            .collect();

        for id in &to_delete {
            if self.delete_record(id)? {
                deleted += 1;
            }
        }

        index = self.load_index()?;
        index.updated_at = Utc::now();
        self.save_index(&index)?;

        Ok(deleted)
    }

    pub fn delete_all(&self) -> Result<usize> {
        let index = self.load_index()?;
        let count = index.records.len();

        for entry in WalkDir::new(&self.base_dir).min_depth(1) {
            let entry = entry?;
            if entry.file_type().is_file() && entry.file_name() != INDEX_FILE {
                let _ = fs::remove_file(entry.path());
            } else if entry.file_type().is_dir() {
                let _ = fs::remove_dir_all(entry.path());
            }
        }

        self.save_index(&StorageIndex {
            records: Vec::new(),
            updated_at: Utc::now(),
        })?;

        Ok(count)
    }

    pub fn get_stats(&self) -> Result<StorageStats> {
        let index = self.load_index()?;
        let mut total_size = 0u64;

        for entry in WalkDir::new(&self.base_dir).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Ok(meta) = entry.metadata() {
                    total_size += meta.len();
                }
            }
        }

        let mut by_task_type = HashMap::new();
        let mut by_cluster = HashMap::new();

        for record in &index.records {
            *by_task_type.entry(record.task_type.to_string()).or_insert(0usize) += 1;
            for cluster in &record.target_clusters {
                *by_cluster.entry(cluster.clone()).or_insert(0usize) += 1;
            }
        }

        Ok(StorageStats {
            total_records: index.records.len(),
            total_size_bytes: total_size,
            oldest_record: index.records.last().map(|r| r.start_time),
            newest_record: index.records.first().map(|r| r.start_time),
            by_task_type,
            by_cluster,
            storage_dir: self.base_dir.clone(),
        })
    }
}

pub fn print_record_list(records: &[InspectionRecord]) {
    if records.is_empty() {
        println!("{}", "暂无巡检历史记录".yellow());
        return;
    }

    println!("\n{}", "=== 巡检历史记录 ===".bold().yellow());
    println!(
        "{:<12} {:<10} {:<20} {:<10} {:<12} {:<12} {}",
        "ID", "类型", "开始时间", "节点总数", "成功", "失败", "耗时(ms)"
    );
    println!("{}", "-".repeat(100));

    for record in records {
        let task_type = match record.task_type {
            TaskType::Connect => "connect".cyan(),
            TaskType::Status => "status".green(),
            TaskType::Resource => "resource".blue(),
            TaskType::Logs => "logs".purple(),
            TaskType::Diagnose => "diagnose".yellow(),
            TaskType::Inspect => "inspect".red(),
        };

        let status_str = if record.has_errors {
            format!("{}/{}",
                record.success_nodes.to_string().yellow(),
                record.failed_nodes.to_string().red()
            )
        } else {
            format!("{}/{}",
                record.success_nodes.to_string().green(),
                record.failed_nodes.to_string().cyan()
            )
        };

        let short_id: String = record.id.chars().take(8).collect();
        let time_str = record.start_time.format("%Y-%m-%d %H:%M:%S").to_string();

        println!(
            "{:<12} {:<10} {:<20} {:<10} {:<12} {:<12} {}",
            short_id,
            task_type,
            time_str,
            record.total_nodes,
            status_str,
            record.duration_ms,
            if record.has_errors { "有错误".red() } else { "正常".green() }
        );
    }
}

pub fn print_storage_stats(stats: &StorageStats) {
    println!("\n{}", "=== 存储统计信息 ===".bold().yellow());
    println!("存储目录: {}", stats.storage_dir.display());
    println!("总记录数: {}", stats.total_records.to_string().cyan());
    println!("总大小: {}", humansize::format_size(stats.total_size_bytes, humansize::DECIMAL));

    if let Some(oldest) = stats.oldest_record {
        println!(
            "最早记录: {}",
            oldest.format("%Y-%m-%d %H:%M:%S").to_string().bright_black()
        );
    }
    if let Some(newest) = stats.newest_record {
        println!(
            "最新记录: {}",
            newest.format("%Y-%m-%d %H:%M:%S").to_string().cyan()
        );
    }

    if !stats.by_task_type.is_empty() {
        println!("\n{}", "按任务类型分布:".bold());
        for (t, c) in &stats.by_task_type {
            println!("  {:<10} {}", t.cyan(), c);
        }
    }

    if !stats.by_cluster.is_empty() {
        println!("\n{}", "按集群分布:".bold());
        for (c, cnt) in &stats.by_cluster {
            println!("  {:<15} {}", c.green(), cnt);
        }
    }
}

pub fn build_inspection_summary(
    _connections: Option<&[ConnectionResult]>,
    container_statuses: Option<&[NodeContainerStatus]>,
    resource_stats: Option<&[NodeResourceStats]>,
    diagnostics: Option<&[NodeDiagnostics]>,
) -> InspectionSummary {
    let mut summary = InspectionSummary::default();

    if let Some(statuses) = container_statuses {
        let (total, running, unhealthy): (usize, usize, usize) = statuses.iter().fold(
            (0, 0, 0),
            |(total, running, unhealthy), s| {
                (
                    total + s.total_containers,
                    running + s.running_count,
                    unhealthy + s.unhealthy_count,
                )
            },
        );
        summary.total_containers = Some(total);
        summary.running_containers = Some(running);
        summary.unhealthy_containers = Some(unhealthy);
    }

    if let Some(stats) = resource_stats {
        let valid_stats: Vec<&NodeResourceStats> = stats.iter().filter(|s| s.error.is_none()).collect();
        if !valid_stats.is_empty() {
            let total_cpu: f64 = valid_stats.iter().map(|s| s.cpu_total_percent).sum();
            let total_mem: f64 = valid_stats.iter().map(|s| s.memory_percent).sum();
            let n = valid_stats.len() as f64;
            summary.avg_cpu_percent = Some(total_cpu / n);
            summary.avg_memory_percent = Some(total_mem / n);

            let high_disk = valid_stats
                .iter()
                .map(|s| s.disk_usage.iter().filter(|d| d.used_percent > 80.0).count())
                .sum::<usize>();
            summary.disk_high_usage = Some(high_disk);
        }
    }

    if let Some(diags) = diagnostics {
        let (critical, warning): (usize, usize) = diags.iter().fold(
            (0, 0),
            |(critical, warning), d| {
                let (c, w) = d.issues.iter().fold(
                    (0, 0),
                    |(c, w), issue| match issue.severity {
                        crate::diagnostics::Severity::Critical | crate::diagnostics::Severity::Fatal => (c + 1, w),
                        crate::diagnostics::Severity::Warning => (c, w + 1),
                        _ => (c, w),
                    },
                );
                (critical + c, warning + w)
            },
        );
        summary.critical_issues = Some(critical);
        summary.warning_issues = Some(warning);
    }

    summary
}

pub fn generate_inspection_record(
    task_type: TaskType,
    cli: &crate::cli::Cli,
    start_time: DateTime<Utc>,
    results: &InspectionDataBuilder,
    error_msg: Option<&str>,
) -> InspectionRecord {
    let end_time = Utc::now();
    let duration_ms = (end_time - start_time).num_milliseconds().max(0) as u64;

    let target_clusters: Vec<String> = results.target_nodes.iter().map(|(c, _)| c.clone()).collect();
    let mut cluster_set = std::collections::HashSet::new();
    let mut clusters = Vec::new();
    for c in target_clusters {
        if cluster_set.insert(c.clone()) {
            clusters.push(c);
        }
    }

    let target_nodes: Vec<String> = results.target_nodes.iter().map(|(_, n)| n.name.clone()).collect();

    let total_nodes = results.target_nodes.len();
    let success_nodes = results.success_count;
    let failed_nodes = total_nodes.saturating_sub(success_nodes);

    let mut parameters = HashMap::new();
    if let Some(cluster) = &cli.cluster {
        parameters.insert("cluster".to_string(), cluster.clone());
    }
    if let Some(node) = &cli.node {
        parameters.insert("node".to_string(), node.clone());
    }
    if !cli.group.is_empty() {
        parameters.insert("groups".to_string(), cli.group.join(","));
    }
    if !cli.label.is_empty() {
        let labels: Vec<String> = cli.label.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
        parameters.insert("labels".to_string(), labels.join(","));
    }

    let summary = build_inspection_summary(
        results.connection_results.as_deref(),
        results.container_statuses.as_deref(),
        results.resource_stats.as_deref(),
        results.diagnostics.as_deref(),
    );

    InspectionRecord {
        id: Uuid::new_v4().to_string(),
        task_type,
        cluster_filter: cli.cluster.clone(),
        node_filter: cli.node.clone(),
        groups_filter: cli.group.clone(),
        labels_filter: cli.label.clone(),
        target_clusters: clusters,
        target_nodes,
        start_time,
        end_time,
        duration_ms,
        total_nodes,
        success_nodes,
        failed_nodes,
        has_errors: error_msg.is_some() || failed_nodes > 0,
        error_message: error_msg.map(|s| s.to_string()),
        parameters,
        summary,
    }
}

pub struct InspectionDataBuilder {
    pub target_nodes: Vec<(String, crate::config::NodeConfig)>,
    pub success_count: usize,
    pub connection_results: Option<Vec<ConnectionResult>>,
    pub container_statuses: Option<Vec<NodeContainerStatus>>,
    pub resource_stats: Option<Vec<NodeResourceStats>>,
    pub diagnostics: Option<Vec<NodeDiagnostics>>,
}

impl InspectionDataBuilder {
    pub fn new(nodes: Vec<(String, crate::config::NodeConfig)>) -> Self {
        Self {
            target_nodes: nodes,
            success_count: 0,
            connection_results: None,
            container_statuses: None,
            resource_stats: None,
            diagnostics: None,
        }
    }
}
