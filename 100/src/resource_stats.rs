use anyhow::Result;
use chrono::{DateTime, Utc};
use colored::*;
use humansize::{format_size, DECIMAL};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use crate::cluster_connection::{connect_to_node, SshConnection};
use crate::config::NodeConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStats {
    pub container_id: String,
    pub container_name: String,
    pub cpu_percent: f64,
    pub memory_usage_bytes: u64,
    pub memory_limit_bytes: u64,
    pub memory_percent: f64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub block_read_bytes: u64,
    pub block_write_bytes: u64,
    pub pids: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskUsage {
    pub filesystem: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub used_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeResourceStats {
    pub cluster_name: String,
    pub node_name: String,
    pub host: String,
    pub cpu_cores: u32,
    pub cpu_total_percent: f64,
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
    pub memory_available_bytes: u64,
    pub memory_percent: f64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub disk_usage: Vec<DiskUsage>,
    pub container_stats: Vec<ContainerStats>,
    pub error: Option<String>,
    pub timestamp: DateTime<Utc>,
}

impl Default for NodeResourceStats {
    fn default() -> Self {
        Self {
            cluster_name: String::new(),
            node_name: String::new(),
            host: String::new(),
            cpu_cores: 0,
            cpu_total_percent: 0.0,
            memory_total_bytes: 0,
            memory_used_bytes: 0,
            memory_available_bytes: 0,
            memory_percent: 0.0,
            swap_total_bytes: 0,
            swap_used_bytes: 0,
            disk_usage: Vec::new(),
            container_stats: Vec::new(),
            error: Some("任务失败".to_string()),
            timestamp: Utc::now(),
        }
    }
}

const CPU_SAMPLE_INTERVAL_MS: u64 = 1000;

pub async fn collect_node_stats(
    cluster_name: &str,
    node: &NodeConfig,
    timeout: u64,
    resource_type: &str,
) -> Result<NodeResourceStats> {
    info!("正在收集节点 {}.{} 的资源统计...", cluster_name, node.name);

    let conn = match connect_to_node(cluster_name, node, timeout).await {
        Ok(c) => c,
        Err(e) => {
            error!("连接节点 {}.{} 失败: {}", cluster_name, node.name, e);
            return Ok(NodeResourceStats {
                cluster_name: cluster_name.to_string(),
                node_name: node.name.clone(),
                host: node.host.clone(),
                cpu_cores: 0,
                cpu_total_percent: 0.0,
                memory_total_bytes: 0,
                memory_used_bytes: 0,
                memory_available_bytes: 0,
                memory_percent: 0.0,
                swap_total_bytes: 0,
                swap_used_bytes: 0,
                disk_usage: Vec::new(),
                container_stats: Vec::new(),
                error: Some(format!("连接失败: {}", e)),
                timestamp: Utc::now(),
            });
        }
    };

    let result = parse_resource_stats(&conn, resource_type);
    conn.close();

    match result {
        Ok(mut stats) => {
            stats.cluster_name = cluster_name.to_string();
            stats.node_name = node.name.clone();
            stats.host = node.host.clone();
            info!(
                "节点 {}.{} 资源统计完成: CPU {:.1}%, 内存 {:.1}%",
                cluster_name,
                node.name,
                stats.cpu_total_percent,
                stats.memory_percent
            );
            Ok(stats)
        }
        Err(e) => {
            error!(
                "解析节点 {}.{} 资源统计失败: {}",
                cluster_name, node.name, e
            );
            Ok(NodeResourceStats {
                cluster_name: cluster_name.to_string(),
                node_name: node.name.clone(),
                host: node.host.clone(),
                cpu_cores: 0,
                cpu_total_percent: 0.0,
                memory_total_bytes: 0,
                memory_used_bytes: 0,
                memory_available_bytes: 0,
                memory_percent: 0.0,
                swap_total_bytes: 0,
                swap_used_bytes: 0,
                disk_usage: Vec::new(),
                container_stats: Vec::new(),
                error: Some(format!("解析失败: {}", e)),
                timestamp: Utc::now(),
            })
        }
    }
}

fn parse_resource_stats(
    conn: &SshConnection,
    resource_type: &str,
) -> Result<NodeResourceStats> {
    let mut stats = NodeResourceStats {
        cluster_name: String::new(),
        node_name: String::new(),
        host: String::new(),
        cpu_cores: 0,
        cpu_total_percent: 0.0,
        memory_total_bytes: 0,
        memory_used_bytes: 0,
        memory_available_bytes: 0,
        memory_percent: 0.0,
        swap_total_bytes: 0,
        swap_used_bytes: 0,
        disk_usage: Vec::new(),
        container_stats: Vec::new(),
        error: None,
        timestamp: Utc::now(),
    };

    if resource_type == "all" || resource_type == "cpu" || resource_type == "memory" {
        let cpu_mem_output = conn.execute_with_timeout(
            &format!(
                "cat /proc/stat | head -n 1; sleep 0.{}; cat /proc/stat | head -n 1; echo '---MEM---'; free -b; echo '---CPUCORES---'; nproc",
                CPU_SAMPLE_INTERVAL_MS
            ),
            60,
        )?;
        if cpu_mem_output.success {
            parse_cpu_memory(&cpu_mem_output.stdout, &mut stats);
        }
    }

    if resource_type == "all" || resource_type == "disk" {
        let df_output = conn.execute("df -B1 --output=source,target,size,used,avail,pcent")?;
        if df_output.success {
            stats.disk_usage = parse_disk_usage(&df_output.stdout)?;
        }
    }

    if resource_type == "all" || resource_type == "cpu" || resource_type == "memory" {
        let docker_stats_output = conn.execute_with_timeout(
            "docker stats --no-stream --format '{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}'",
            60,
        )?;
        if docker_stats_output.success {
            stats.container_stats = parse_docker_stats(&docker_stats_output.stdout)?;
        }
    }

    Ok(stats)
}

fn parse_cpu_memory(output: &str, stats: &mut NodeResourceStats) {
    let parts: Vec<&str> = output.split("---MEM---").collect();
    if parts.len() < 2 {
        return;
    }

    let cpu_part = parts[0];
    let rest = parts[1];
    let mem_parts: Vec<&str> = rest.split("---CPUCORES---").collect();
    if mem_parts.len() < 2 {
        return;
    }

    let mem_part = mem_parts[0];
    let cores_part = mem_parts[1];

    stats.cpu_cores = cores_part.trim().parse().unwrap_or(1);

    let cpu_lines: Vec<&str> = cpu_part
        .lines()
        .filter(|l| l.starts_with("cpu "))
        .collect();

    if cpu_lines.len() >= 2 {
        let fields1: Vec<u64> = cpu_lines[0]
            .split_whitespace()
            .skip(1)
            .filter_map(|f| f.parse().ok())
            .collect();
        let fields2: Vec<u64> = cpu_lines[1]
            .split_whitespace()
            .skip(1)
            .filter_map(|f| f.parse().ok())
            .collect();

        if fields1.len() >= 4 && fields2.len() >= 4 {
            let total1: u64 = fields1.iter().sum();
            let idle1: u64 = fields1[3] + if fields1.len() > 4 { fields1[4] } else { 0 };
            let total2: u64 = fields2.iter().sum();
            let idle2: u64 = fields2[3] + if fields2.len() > 4 { fields2[4] } else { 0 };

            let d_total = (total2 as i64 - total1 as i64).max(1) as f64;
            let d_idle = idle2 as f64 - idle1 as f64;

            stats.cpu_total_percent = ((d_total - d_idle) / d_total * 100.0).clamp(0.0, 100.0);
        }
    } else if cpu_lines.len() == 1 {
        let fields: Vec<u64> = cpu_lines[0]
            .split_whitespace()
            .skip(1)
            .filter_map(|f| f.parse().ok())
            .collect();
        if fields.len() >= 5 {
            let total: u64 = fields.iter().sum();
            let idle: u64 = fields[3] + fields[4];
            if total > 0 {
                stats.cpu_total_percent =
                    ((total - idle) as f64 / total as f64 * 100.0).clamp(0.0, 100.0);
            }
        }
    }

    for line in mem_part.lines() {
        let line = line.trim();
        if line.starts_with("Mem:") {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() >= 7 {
                stats.memory_total_bytes = fields[1].parse().unwrap_or(0);
                stats.memory_used_bytes = fields[2].parse().unwrap_or(0);
                stats.memory_available_bytes = fields[6].parse().unwrap_or(0);
                let effective_used = stats.memory_total_bytes.saturating_sub(stats.memory_available_bytes);
                stats.memory_used_bytes = effective_used;
                if stats.memory_total_bytes > 0 {
                    stats.memory_percent =
                        (effective_used as f64 / stats.memory_total_bytes as f64 * 100.0).clamp(0.0, 100.0);
                }
            } else if fields.len() >= 3 {
                stats.memory_total_bytes = fields[1].parse().unwrap_or(0);
                stats.memory_used_bytes = fields[2].parse().unwrap_or(0);
                if stats.memory_total_bytes > 0 {
                    stats.memory_percent =
                        (stats.memory_used_bytes as f64 / stats.memory_total_bytes as f64 * 100.0).clamp(0.0, 100.0);
                }
            }
        } else if line.starts_with("Swap:") {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() >= 3 {
                stats.swap_total_bytes = fields[1].parse().unwrap_or(0);
                stats.swap_used_bytes = fields[2].parse().unwrap_or(0);
            }
        }
    }
}

fn parse_disk_usage(output: &str) -> Result<Vec<DiskUsage>> {
    let mut disks = Vec::new();

    for (i, line) in output.lines().enumerate() {
        if i == 0 {
            continue;
        }

        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() >= 6 {
            let total: u64 = fields[2].parse().unwrap_or(0);
            let used: u64 = fields[3].parse().unwrap_or(0);
            let avail: u64 = fields[4].parse().unwrap_or(0);
            let percent_str = fields[5].trim_end_matches('%');
            let used_percent: f64 = percent_str.parse().unwrap_or_else(|_| {
                if total > 0 { (used as f64 / total as f64) * 100.0 } else { 0.0 }
            });

            disks.push(DiskUsage {
                filesystem: fields[0].to_string(),
                mount_point: fields[1].to_string(),
                total_bytes: total,
                used_bytes: used,
                available_bytes: avail,
                used_percent,
            });
        }
    }

    Ok(disks)
}

fn parse_docker_stats(output: &str) -> Result<Vec<ContainerStats>> {
    let mut container_stats = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 8 {
            continue;
        }

        let cpu_percent = parts[2]
            .trim_end_matches('%')
            .parse::<f64>()
            .unwrap_or(0.0);

        let mem_parts: Vec<&str> = parts[3].split('/').collect();
        let memory_usage_bytes = parse_human_size(mem_parts.get(0).map(|s| s.trim()).unwrap_or(""));
        let memory_limit_bytes = if mem_parts.len() > 1 {
            parse_human_size(mem_parts[1].trim())
        } else {
            0
        };

        let memory_percent = parts[4]
            .trim_end_matches('%')
            .parse::<f64>()
            .unwrap_or_else(|_| {
                if memory_limit_bytes > 0 {
                    (memory_usage_bytes as f64 / memory_limit_bytes as f64) * 100.0
                } else {
                    0.0
                }
            });

        let net_parts: Vec<&str> = parts[5].split('/').collect();
        let network_rx_bytes = parse_human_size(net_parts.get(0).map(|s| s.trim()).unwrap_or(""));
        let network_tx_bytes = if net_parts.len() > 1 {
            parse_human_size(net_parts[1].trim())
        } else {
            0
        };

        let block_parts: Vec<&str> = parts[6].split('/').collect();
        let block_read_bytes = parse_human_size(block_parts.get(0).map(|s| s.trim()).unwrap_or(""));
        let block_write_bytes = if block_parts.len() > 1 {
            parse_human_size(block_parts[1].trim())
        } else {
            0
        };

        let pids: u64 = parts[7].parse().unwrap_or(0);

        container_stats.push(ContainerStats {
            container_id: parts[0].to_string(),
            container_name: parts[1].to_string(),
            cpu_percent,
            memory_usage_bytes,
            memory_limit_bytes,
            memory_percent,
            network_rx_bytes,
            network_tx_bytes,
            block_read_bytes,
            block_write_bytes,
            pids,
        });
    }

    Ok(container_stats)
}

fn parse_human_size(s: &str) -> u64 {
    let s = s.trim();
    if s.is_empty() || s == "0B" || s == "0" || s == "--" {
        return 0;
    }

    let num_str: String = s.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let unit: String = s.chars()
        .skip_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    let unit = unit.trim().to_lowercase();

    let num: f64 = match num_str.parse() {
        Ok(n) => n,
        Err(_) => return 0,
    };

    match unit.as_str() {
        "b" | "" => num as u64,
        "kib" | "ki" => (num * 1024.0) as u64,
        "k" | "kb" => (num * 1000.0) as u64,
        "mib" | "mi" => (num * 1024.0 * 1024.0) as u64,
        "m" | "mb" => (num * 1000.0 * 1000.0) as u64,
        "gib" | "gi" => (num * 1024.0 * 1024.0 * 1024.0) as u64,
        "g" | "gb" => (num * 1000.0 * 1000.0 * 1000.0) as u64,
        "tib" | "ti" => (num * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64,
        "t" | "tb" => (num * 1000.0 * 1000.0 * 1000.0 * 1000.0) as u64,
        _ => {
            if unit.starts_with('k') { (num * 1024.0) as u64 }
            else if unit.starts_with('m') { (num * 1024.0 * 1024.0) as u64 }
            else if unit.starts_with('g') { (num * 1024.0 * 1024.0 * 1024.0) as u64 }
            else if unit.starts_with('t') { (num * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64 }
            else { num as u64 }
        }
    }
}

pub fn print_resource_stats(
    results: &[NodeResourceStats],
    resource_type: &str,
    sort: bool,
    top: usize,
) {
    println!("\n{}", "=== 资源占用统计 ===".bold().yellow());

    for result in results {
        println!(
            "\n{} [{}] {} ({})",
            "节点:".bold(),
            result.cluster_name.cyan(),
            result.node_name.green(),
            result.host.bright_black()
        );

        if let Some(err) = &result.error {
            println!("  {}: {}", "错误".red().bold(), err);
            continue;
        }

        if resource_type == "all" || resource_type == "cpu" || resource_type == "memory" {
            println!("\n  {}", "--- 系统资源 ---".bold());
            println!(
                "  CPU: {:.1}% ({} 核) | 内存: {:.1}% ({}/{}) | Swap: {}/{}",
                result.cpu_total_percent,
                result.cpu_cores,
                result.memory_percent,
                format_size(result.memory_used_bytes, DECIMAL),
                format_size(result.memory_total_bytes, DECIMAL),
                format_size(result.swap_used_bytes, DECIMAL),
                format_size(result.swap_total_bytes, DECIMAL)
            );
        }

        if resource_type == "all" || resource_type == "disk" {
            println!("\n  {}", "--- 磁盘使用 ---".bold());
            println!(
                "  {:<30} {:<15} {:<15} {:<15} {:<10}",
                "文件系统", "挂载点", "总计", "已用", "使用率"
            );
            println!("  {}", "-".repeat(90));

            for disk in &result.disk_usage {
                let percent_str = if disk.used_percent > 80.0 {
                    format!("{:.1}%", disk.used_percent).red()
                } else if disk.used_percent > 60.0 {
                    format!("{:.1}%", disk.used_percent).yellow()
                } else {
                    format!("{:.1}%", disk.used_percent).green()
                };

                println!(
                    "  {:<30} {:<15} {:<15} {:<15} {:<10}",
                    disk.filesystem,
                    disk.mount_point,
                    format_size(disk.total_bytes, DECIMAL),
                    format_size(disk.used_bytes, DECIMAL),
                    percent_str
                );
            }
        }

        if (resource_type == "all" || resource_type == "cpu" || resource_type == "memory")
            && !result.container_stats.is_empty()
        {
            println!("\n  {}", "--- 容器资源排行 TOP ---".bold());

            let mut sorted_stats = result.container_stats.clone();
            if sort {
                sorted_stats.sort_by(|a, b| {
                    b.cpu_percent
                        .partial_cmp(&a.cpu_percent)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
            }

            sorted_stats.truncate(top);

            println!(
                "  {:<14} {:<20} {:<10} {:<20} {:<10}",
                "容器ID", "名称", "CPU %", "内存使用", "内存 %"
            );
            println!("  {}", "-".repeat(80));

            for cs in &sorted_stats {
                let cpu_str = if cs.cpu_percent > 50.0 {
                    format!("{:.1}%", cs.cpu_percent).red()
                } else if cs.cpu_percent > 20.0 {
                    format!("{:.1}%", cs.cpu_percent).yellow()
                } else {
                    format!("{:.1}%", cs.cpu_percent).green()
                };

                let mem_str = if cs.memory_percent > 80.0 {
                    format!("{:.1}%", cs.memory_percent).red()
                } else if cs.memory_percent > 50.0 {
                    format!("{:.1}%", cs.memory_percent).yellow()
                } else {
                    format!("{:.1}%", cs.memory_percent).green()
                };

                println!(
                    "  {:<14} {:<20} {:<10} {:<20} {:<10}",
                    cs.container_id.chars().take(12).collect::<String>(),
                    cs.container_name.chars().take(18).collect::<String>(),
                    cpu_str,
                    format_size(cs.memory_usage_bytes, DECIMAL),
                    mem_str
                );
            }
        }
    }
}
