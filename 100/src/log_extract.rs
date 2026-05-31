use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use colored::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::OnceLock;
use tracing::{debug, error, info};

use crate::cluster_connection::{connect_to_node, SshConnection};
use crate::config::NodeConfig;

static RE_TIMESTAMP: OnceLock<Regex> = OnceLock::new();
static RE_LEVEL: OnceLock<Regex> = OnceLock::new();
static RE_SIMPLIFY_TIMESTAMP: OnceLock<Regex> = OnceLock::new();
static RE_SIMPLIFY_UUID: OnceLock<Regex> = OnceLock::new();
static RE_SIMPLIFY_HEX: OnceLock<Regex> = OnceLock::new();
static RE_SIMPLIFY_NUM: OnceLock<Regex> = OnceLock::new();

fn re_timestamp() -> &'static Regex {
    RE_TIMESTAMP.get_or_init(|| {
        Regex::new(
            r"(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)"
        ).unwrap()
    })
}

fn re_level() -> &'static Regex {
    RE_LEVEL.get_or_init(|| {
        Regex::new(r"\b(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL|PANIC)\b").unwrap()
    })
}

fn re_simplify_timestamp() -> &'static Regex {
    RE_SIMPLIFY_TIMESTAMP.get_or_init(|| {
        Regex::new(
            r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?"
        ).unwrap()
    })
}

fn re_simplify_uuid() -> &'static Regex {
    RE_SIMPLIFY_UUID.get_or_init(|| {
        Regex::new(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
        ).unwrap()
    })
}

fn re_simplify_hex() -> &'static Regex {
    RE_SIMPLIFY_HEX.get_or_init(|| {
        Regex::new(r"0x[0-9a-fA-F]+").unwrap()
    })
}

fn re_simplify_num() -> &'static Regex {
    RE_SIMPLIFY_NUM.get_or_init(|| {
        Regex::new(r"\b\d+\b").unwrap()
    })
}

const MAX_LOG_LINES: usize = 100000;
const LOG_CHUNK_SIZE: usize = 5000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogOptions {
    pub container: String,
    pub tail: u64,
    pub follow: bool,
    pub since: Option<String>,
    pub output_file: Option<String>,
    pub highlight_keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: Option<String>,
    pub level: Option<String>,
    pub message: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogExtractResult {
    pub cluster_name: String,
    pub node_name: String,
    pub container_id: String,
    pub container_name: String,
    pub total_lines: usize,
    pub error_lines: usize,
    pub warning_lines: usize,
    pub truncated: bool,
    pub entries: Vec<LogEntry>,
    pub error: Option<String>,
    pub timestamp: DateTime<Utc>,
}

pub async fn extract_container_logs(
    cluster_name: &str,
    node: &NodeConfig,
    container_id: &str,
    options: &LogOptions,
    timeout: u64,
) -> Result<LogExtractResult> {
    info!(
        "正在提取节点 {}.{} 容器 {} 的日志...",
        cluster_name, node.name, container_id
    );

    let conn = match connect_to_node(cluster_name, node, timeout).await {
        Ok(c) => c,
        Err(e) => {
            error!("连接节点 {}.{} 失败: {}", cluster_name, node.name, e);
            return Ok(LogExtractResult {
                cluster_name: cluster_name.to_string(),
                node_name: node.name.clone(),
                container_id: container_id.to_string(),
                container_name: String::new(),
                total_lines: 0,
                error_lines: 0,
                warning_lines: 0,
                truncated: false,
                entries: Vec::new(),
                error: Some(format!("连接失败: {}", e)),
                timestamp: Utc::now(),
            });
        }
    };

    let result = fetch_logs(&conn, container_id, options);
    conn.close();

    match result {
        Ok(mut log_result) => {
            log_result.cluster_name = cluster_name.to_string();
            log_result.node_name = node.name.clone();
            info!(
                "提取完成: 共 {} 行日志, {} 错误, {} 譥告{}",
                log_result.total_lines.to_string().cyan(),
                log_result.error_lines.to_string().red(),
                log_result.warning_lines.to_string().yellow(),
                if log_result.truncated { " (已截断)".yellow() } else { "".normal() }
            );

            if let Some(output_file) = &options.output_file {
                if let Err(e) = save_logs_to_file(&log_result, output_file) {
                    error!("保存日志到文件失败: {}", e);
                } else {
                    info!("日志已保存到: {}", output_file);
                }
            }

            Ok(log_result)
        }
        Err(e) => {
            error!("提取日志失败: {}", e);
            Ok(LogExtractResult {
                cluster_name: cluster_name.to_string(),
                node_name: node.name.clone(),
                container_id: container_id.to_string(),
                container_name: String::new(),
                total_lines: 0,
                error_lines: 0,
                warning_lines: 0,
                truncated: false,
                entries: Vec::new(),
                error: Some(format!("提取失败: {}", e)),
                timestamp: Utc::now(),
            })
        }
    }
}

fn fetch_logs(
    conn: &SshConnection,
    container_id: &str,
    options: &LogOptions,
) -> Result<LogExtractResult> {
    let effective_tail = options.tail.min(MAX_LOG_LINES as u64);
    let mut command = format!("docker logs --tail {}", effective_tail);

    if options.follow {
        command.push_str(" -f");
    }

    if let Some(since) = &options.since {
        command.push_str(&format!(" --since {}", since));
    }

    command.push_str(&format!(" {}", container_id));
    command.push_str(" 2>&1");

    debug!("执行日志命令: {}", command);

    let mut container_name = String::new();
    let inspect_output = conn.execute(&format!("docker inspect --format '{{{{.Name}}}}' {}", container_id))?;
    if inspect_output.success {
        container_name = inspect_output.stdout.trim().trim_start_matches('/').to_string();
    }

    let output = conn.execute_with_timeout(&command, 120)?;
    if !output.success && output.exit_code != 1 {
        anyhow::bail!("执行docker logs失败: {}", output.stderr);
    }

    let raw_content = &output.stdout;

    let (entries, truncated) = parse_log_entries_fast(raw_content, effective_tail as usize);

    let mut error_lines = 0usize;
    let mut warning_lines = 0usize;
    for entry in &entries {
        let is_error = entry.level.as_deref() == Some("ERROR")
            || entry.level.as_deref() == Some("FATAL")
            || entry.level.as_deref() == Some("PANIC")
            || entry.raw.to_uppercase().contains("ERROR");
        let is_warning = entry.level.as_deref() == Some("WARN")
            || entry.level.as_deref() == Some("WARNING")
            || entry.raw.to_uppercase().contains("WARN");

        if is_error {
            error_lines += 1;
        }
        if is_warning {
            warning_lines += 1;
        }
    }

    Ok(LogExtractResult {
        cluster_name: String::new(),
        node_name: String::new(),
        container_id: container_id.to_string(),
        container_name,
        total_lines: entries.len(),
        error_lines,
        warning_lines,
        truncated,
        entries,
        error: None,
        timestamp: Utc::now(),
    })
}

fn parse_log_entries_fast(log_content: &str, max_lines: usize) -> (Vec<LogEntry>, bool) {
    let mut entries = Vec::with_capacity(max_lines.min(10000));
    let mut count = 0usize;
    let mut truncated = false;

    for line in log_content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if count >= max_lines {
            truncated = true;
            break;
        }

        let timestamp = re_timestamp()
            .captures(line)
            .map(|caps| caps.get(1).unwrap().as_str().to_string());

        let level = re_level()
            .captures(line)
            .map(|caps| caps.get(1).unwrap().as_str().to_string().to_uppercase());

        entries.push(LogEntry {
            timestamp,
            level,
            message: line.to_string(),
            raw: line.to_string(),
        });

        count += 1;
    }

    (entries, truncated)
}

fn save_logs_to_file(result: &LogExtractResult, file_path: &str) -> Result<()> {
    let path = Path::new(file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .with_context(|| format!("创建目录失败: {}", parent.display()))?;
        }
    }

    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)
        .with_context(|| format!("创建日志文件失败: {}", path.display()))?;

    let mut writer = BufWriter::new(file);

    writeln!(writer, "# 容器日志提取报告")?;
    writeln!(writer, "集群: {}", result.cluster_name)?;
    writeln!(writer, "节点: {}", result.node_name)?;
    writeln!(writer, "容器ID: {}", result.container_id)?;
    writeln!(writer, "容器名称: {}", result.container_name)?;
    writeln!(writer, "提取时间: {}", result.timestamp)?;
    writeln!(writer, "总行数: {}", result.total_lines)?;
    writeln!(writer, "错误行数: {}", result.error_lines)?;
    writeln!(writer, "警告行数: {}", result.warning_lines)?;
    if result.truncated {
        writeln!(writer, "注意: 日志已截断")?;
    }
    writeln!(writer, "\n{}", "=".repeat(80))?;
    writeln!(writer, "# 日志内容:")?;
    writeln!(writer)?;

    for entry in &result.entries {
        let mut line = String::with_capacity(entry.raw.len() + 40);
        if let Some(ts) = &entry.timestamp {
            line.push_str(&format!("[{}] ", ts));
        }
        if let Some(lvl) = &entry.level {
            line.push_str(&format!("[{}] ", lvl));
        }
        line.push_str(&entry.raw);
        writeln!(writer, "{}", line)?;
    }

    writer.flush().context("刷新日志文件失败")?;

    Ok(())
}

pub fn print_logs(result: &LogExtractResult, tail: u64) {
    println!("\n{}", "=== 容器日志 ===".bold().yellow());
    println!(
        "{} [{}] {} ({})",
        "节点:".bold(),
        result.cluster_name.cyan(),
        result.node_name.green(),
        result.container_name.bright_black()
    );
    println!(
        "容器: {} ({})",
        result.container_name.cyan(),
        result.container_id
    );
    println!(
        "总计: {} 行 | {} 错误 | {} 警告{}",
        result.total_lines.to_string().cyan(),
        result.error_lines.to_string().red(),
        result.warning_lines.to_string().yellow(),
        if result.truncated { " | ".to_string() + &"已截断".yellow().to_string() } else { String::new() }
    );

    if let Some(err) = &result.error {
        println!("\n{}: {}", "错误".red().bold(), err);
        return;
    }

    println!("\n{}", "-".repeat(80));

    let start = if result.entries.len() > tail as usize {
        result.entries.len() - tail as usize
    } else {
        0
    };

    for entry in result.entries.iter().skip(start) {
        let mut prefix = String::new();
        if let Some(ts) = &entry.timestamp {
            prefix.push_str(&format!("[{}] ", ts.bright_black()));
        }

        let level_str = match entry.level.as_deref() {
            Some("ERROR") | Some("FATAL") | Some("PANIC") => {
                format!("[{}] ", "ERROR".red().bold())
            }
            Some("WARN") | Some("WARNING") => {
                format!("[{}] ", "WARN".yellow().bold())
            }
            Some("INFO") => {
                format!("[{}] ", "INFO".cyan())
            }
            Some("DEBUG") | Some("TRACE") => {
                format!("[{}] ", entry.level.as_ref().unwrap().bright_black())
            }
            _ => String::new(),
        };

        println!("{}{}{}", prefix, level_str, entry.message);
    }

    println!("{}", "-".repeat(80));

    if result.error_lines > 0 {
        println!(
            "\n{}: 发现 {} 条错误日志",
            "警告".yellow().bold(),
            result.error_lines
        );
    }
}

pub fn analyze_log_patterns(result: &LogExtractResult) -> Vec<(String, usize)> {
    let mut patterns: HashMap<String, usize> = HashMap::new();

    let chunk_size = LOG_CHUNK_SIZE;
    for chunk in result.entries.chunks(chunk_size) {
        for entry in chunk {
            let simplified = simplify_log_pattern(&entry.raw);
            *patterns.entry(simplified).or_insert(0) += 1;
        }
    }

    let mut sorted: Vec<(String, usize)> = patterns.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    sorted.truncate(10);

    sorted
}

fn simplify_log_pattern(line: &str) -> String {
    let mut result = re_simplify_timestamp().replace_all(line, "<TIMESTAMP>").to_string();
    result = re_simplify_uuid().replace_all(&result, "<UUID>").to_string();
    result = re_simplify_hex().replace_all(&result, "<HEX>").to_string();
    result = re_simplify_num().replace_all(&result, "<NUM>").to_string();

    if result.len() > 100 {
        result.truncate(100);
        result.push_str("...");
    }

    result
}
