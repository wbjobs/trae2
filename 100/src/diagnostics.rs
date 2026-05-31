use anyhow::Result;
use chrono::{DateTime, Utc};
use colored::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{error, info};

use crate::cluster_connection::{connect_to_node, SshConnection};
use crate::config::NodeConfig;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Severity {
    Info,
    Warning,
    Critical,
    Fatal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticIssue {
    pub id: String,
    pub severity: Severity,
    pub category: String,
    pub title: String,
    pub description: String,
    pub node_name: String,
    pub container_id: Option<String>,
    pub container_name: Option<String>,
    pub recommendation: String,
    pub auto_fixable: bool,
    pub fixed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDiagnostics {
    pub cluster_name: String,
    pub node_name: String,
    pub host: String,
    pub issues: Vec<DiagnosticIssue>,
    pub cpu_diagnostic: Option<CpuDiagnostic>,
    pub memory_diagnostic: Option<MemoryDiagnostic>,
    pub disk_diagnostic: Option<DiskDiagnostic>,
    pub network_diagnostic: Option<NetworkDiagnostic>,
    pub container_diagnostics: Vec<ContainerDiagnostic>,
    pub error: Option<String>,
    pub timestamp: DateTime<Utc>,
}

impl Default for NodeDiagnostics {
    fn default() -> Self {
        Self {
            cluster_name: String::new(),
            node_name: String::new(),
            host: String::new(),
            issues: Vec::new(),
            cpu_diagnostic: None,
            memory_diagnostic: None,
            disk_diagnostic: None,
            network_diagnostic: None,
            container_diagnostics: Vec::new(),
            error: Some("任务失败".to_string()),
            timestamp: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuDiagnostic {
    pub total_cores: u32,
    pub load_average_1min: f64,
    pub load_average_5min: f64,
    pub load_average_15min: f64,
    pub user_percent: f64,
    pub system_percent: f64,
    pub iowait_percent: f64,
    pub idle_percent: f64,
    pub high_cpu_processes: Vec<ProcessInfo>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryDiagnostic {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub cached_bytes: u64,
    pub buffers_bytes: u64,
    pub swap_total: u64,
    pub swap_used: u64,
    pub oom_events: u32,
    pub high_memory_processes: Vec<ProcessInfo>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskDiagnostic {
    pub mounts: Vec<DiskMountDiagnostic>,
    pub inode_usage: Vec<InodeInfo>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskMountDiagnostic {
    pub mount_point: String,
    pub filesystem: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub used_percent: f64,
    pub available_bytes: u64,
    pub read_only: bool,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InodeInfo {
    pub mount_point: String,
    pub total: u64,
    pub used: u64,
    pub used_percent: f64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkDiagnostic {
    pub interfaces: Vec<InterfaceInfo>,
    pub dns_status: String,
    pub ping_status: HashMap<String, bool>,
    pub open_ports: Vec<u16>,
    pub connection_count: u32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceInfo {
    pub name: String,
    pub ipv4: Option<String>,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub errors: u64,
    pub dropped: u64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub user: String,
    pub cpu_percent: f64,
    pub memory_percent: f64,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerDiagnostic {
    pub container_id: String,
    pub container_name: String,
    pub image: String,
    pub state: String,
    pub restart_count: u32,
    pub uptime_seconds: Option<i64>,
    pub health_status: Option<String>,
    pub issues: Vec<DiagnosticIssue>,
    pub status: String,
}

pub async fn diagnose_node(
    cluster_name: &str,
    node: &NodeConfig,
    diag_type: &str,
    auto_fix: bool,
    timeout: u64,
) -> Result<NodeDiagnostics> {
    info!(
        "正在对节点 {}.{} 进行{}故障诊断...",
        cluster_name, node.name, diag_type
    );

    let conn = match connect_to_node(cluster_name, node, timeout).await {
        Ok(c) => c,
        Err(e) => {
            error!("连接节点 {}.{} 失败: {}", cluster_name, node.name, e);
            return Ok(NodeDiagnostics {
                cluster_name: cluster_name.to_string(),
                node_name: node.name.clone(),
                host: node.host.clone(),
                issues: vec![DiagnosticIssue {
                    id: format!("conn-fail-{}", node.name),
                    severity: Severity::Fatal,
                    category: "node".to_string(),
                    title: "节点连接失败".to_string(),
                    description: format!("无法连接到节点: {}", e),
                    node_name: node.name.clone(),
                    container_id: None,
                    container_name: None,
                    recommendation: "检查节点网络连接、SSH服务状态和认证配置".to_string(),
                    auto_fixable: false,
                    fixed: false,
                }],
                cpu_diagnostic: None,
                memory_diagnostic: None,
                disk_diagnostic: None,
                network_diagnostic: None,
                container_diagnostics: Vec::new(),
                error: Some(format!("连接失败: {}", e)),
                timestamp: Utc::now(),
            });
        }
    };

    let result = run_diagnostics(&conn, node, diag_type, auto_fix);
    conn.close();

    match result {
        Ok(mut diag) => {
            diag.cluster_name = cluster_name.to_string();
            diag.node_name = node.name.clone();
            diag.host = node.host.clone();
            let issue_count = diag.issues.len();
            let critical_count = diag
                .issues
                .iter()
                .filter(|i| i.severity == Severity::Critical || i.severity == Severity::Fatal)
                .count();
            info!(
                "节点 {}.{} 诊断完成: 发现 {} 个问题, {} 个严重",
                cluster_name,
                node.name,
                issue_count.to_string().cyan(),
                critical_count.to_string().red()
            );
            Ok(diag)
        }
        Err(e) => {
            error!("诊断节点 {}.{} 失败: {}", cluster_name, node.name, e);
            Ok(NodeDiagnostics {
                cluster_name: cluster_name.to_string(),
                node_name: node.name.clone(),
                host: node.host.clone(),
                issues: Vec::new(),
                cpu_diagnostic: None,
                memory_diagnostic: None,
                disk_diagnostic: None,
                network_diagnostic: None,
                container_diagnostics: Vec::new(),
                error: Some(format!("诊断失败: {}", e)),
                timestamp: Utc::now(),
            })
        }
    }
}

fn run_diagnostics(
    conn: &SshConnection,
    node: &NodeConfig,
    diag_type: &str,
    _auto_fix: bool,
) -> Result<NodeDiagnostics> {
    let mut diagnostics = NodeDiagnostics {
        cluster_name: String::new(),
        node_name: node.name.clone(),
        host: node.host.clone(),
        issues: Vec::new(),
        cpu_diagnostic: None,
        memory_diagnostic: None,
        disk_diagnostic: None,
        network_diagnostic: None,
        container_diagnostics: Vec::new(),
        error: None,
        timestamp: Utc::now(),
    };

    if diag_type == "all" || diag_type == "node" || diag_type == "container" {
        diagnostics.container_diagnostics = diagnose_containers(conn, &mut diagnostics.issues, &node.name)?;
    }

    if diag_type == "all" || diag_type == "node" {
        diagnostics.cpu_diagnostic = Some(diagnose_cpu(conn, &mut diagnostics.issues, &node.name)?);
        diagnostics.memory_diagnostic = Some(diagnose_memory(conn, &mut diagnostics.issues, &node.name)?);
        diagnostics.disk_diagnostic = Some(diagnose_disk(conn, &mut diagnostics.issues, &node.name)?);
        diagnostics.network_diagnostic = Some(diagnose_network(conn, &mut diagnostics.issues, &node.name)?);
    }

    if diag_type == "all" || diag_type == "storage" {
        if diagnostics.disk_diagnostic.is_none() {
            diagnostics.disk_diagnostic = Some(diagnose_disk(conn, &mut diagnostics.issues, &node.name)?);
        }
    }

    if diag_type == "all" || diag_type == "network" {
        if diagnostics.network_diagnostic.is_none() {
            diagnostics.network_diagnostic = Some(diagnose_network(conn, &mut diagnostics.issues, &node.name)?);
        }
    }

    Ok(diagnostics)
}

fn diagnose_cpu(
    conn: &SshConnection,
    issues: &mut Vec<DiagnosticIssue>,
    node_name: &str,
) -> Result<CpuDiagnostic> {
    let output = conn.execute(
        "uptime; echo '---STAT---'; cat /proc/stat | head -n 1; echo '---TOP---'; ps -eo pid,user,%cpu,%mem,cmd --sort=-%cpu | head -n 11"
    )?;

    let mut cpu_diag = CpuDiagnostic {
        total_cores: 0,
        load_average_1min: 0.0,
        load_average_5min: 0.0,
        load_average_15min: 0.0,
        user_percent: 0.0,
        system_percent: 0.0,
        iowait_percent: 0.0,
        idle_percent: 0.0,
        high_cpu_processes: Vec::new(),
        status: "ok".to_string(),
    };

    if output.success {
        let parts: Vec<&str> = output.stdout.split("---STAT---").collect();
        if parts.len() >= 2 {
            if let Some(load_line) = parts[0].lines().next() {
                let load_regex = regex::Regex::new(r"load average: ([\d.]+), ([\d.]+), ([\d.]+)").unwrap();
                if let Some(caps) = load_regex.captures(load_line) {
                    cpu_diag.load_average_1min = caps.get(1).unwrap().as_str().parse().unwrap_or(0.0);
                    cpu_diag.load_average_5min = caps.get(2).unwrap().as_str().parse().unwrap_or(0.0);
                    cpu_diag.load_average_15min = caps.get(3).unwrap().as_str().parse().unwrap_or(0.0);
                }
            }

            let rest: Vec<&str> = parts[1].split("---TOP---").collect();
            if rest.len() >= 2 {
                if let Some(stat_line) = rest[0].lines().next() {
                    let fields: Vec<&str> = stat_line.split_whitespace().collect();
                    if fields.len() >= 8 {
                        let user: u64 = fields[1].parse().unwrap_or(0);
                        let system: u64 = fields[3].parse().unwrap_or(0);
                        let idle: u64 = fields[4].parse().unwrap_or(0);
                        let iowait: u64 = fields[5].parse().unwrap_or(0);
                        let total = user + system + idle + iowait;
                        if total > 0 {
                            cpu_diag.user_percent = (user as f64 / total as f64) * 100.0;
                            cpu_diag.system_percent = (system as f64 / total as f64) * 100.0;
                            cpu_diag.iowait_percent = (iowait as f64 / total as f64) * 100.0;
                            cpu_diag.idle_percent = (idle as f64 / total as f64) * 100.0;
                        }
                    }
                }

                for (i, line) in rest[1].lines().enumerate() {
                    if i == 0 || line.trim().is_empty() {
                        continue;
                    }
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() >= 5 {
                        cpu_diag.high_cpu_processes.push(ProcessInfo {
                            pid: fields[0].parse().unwrap_or(0),
                            user: fields[1].to_string(),
                            cpu_percent: fields[2].parse().unwrap_or(0.0),
                            memory_percent: fields[3].parse().unwrap_or(0.0),
                            command: fields[4..].join(" "),
                        });
                    }
                }
            }
        }

        let nproc_output = conn.execute("nproc")?;
        if nproc_output.success {
            cpu_diag.total_cores = nproc_output.stdout.trim().parse().unwrap_or(1);
        }

        if cpu_diag.load_average_1min > cpu_diag.total_cores as f64 * 0.8 {
            issues.push(DiagnosticIssue {
                id: format!("cpu-high-load-{}", node_name),
                severity: if cpu_diag.load_average_1min > cpu_diag.total_cores as f64 * 1.5 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                category: "cpu".to_string(),
                title: "CPU负载过高".to_string(),
                description: format!(
                    "1分钟负载: {:.2}, CPU核心数: {}, 负载/核心比: {:.2}",
                    cpu_diag.load_average_1min,
                    cpu_diag.total_cores,
                    cpu_diag.load_average_1min / cpu_diag.total_cores as f64
                ),
                node_name: node_name.to_string(),
                container_id: None,
                container_name: None,
                recommendation: "检查高CPU占用进程，考虑扩容或优化应用代码".to_string(),
                auto_fixable: false,
                fixed: false,
            });
        }

        if cpu_diag.iowait_percent > 30.0 {
            issues.push(DiagnosticIssue {
                id: format!("cpu-high-iowait-{}", node_name),
                severity: Severity::Warning,
                category: "cpu".to_string(),
                title: "CPU IO等待过高".to_string(),
                description: format!("IO等待占比: {:.1}%", cpu_diag.iowait_percent),
                node_name: node_name.to_string(),
                container_id: None,
                container_name: None,
                recommendation: "检查磁盘IO性能，考虑升级存储或优化IO密集型应用".to_string(),
                auto_fixable: false,
                fixed: false,
            });
        }

        cpu_diag.status = if issues.iter().any(|i| i.category == "cpu") {
            "warning".to_string()
        } else {
            "ok".to_string()
        };
    }

    Ok(cpu_diag)
}

fn diagnose_memory(
    conn: &SshConnection,
    issues: &mut Vec<DiagnosticIssue>,
    node_name: &str,
) -> Result<MemoryDiagnostic> {
    let output = conn.execute(
        "free -b; echo '---VMSTAT---'; vmstat -s | grep -E '(oom|pgfault)'; echo '---TOPMEM---'; ps -eo pid,user,%cpu,%mem,cmd --sort=-%mem | head -n 11"
    )?;

    let mut mem_diag = MemoryDiagnostic {
        total_bytes: 0,
        used_bytes: 0,
        free_bytes: 0,
        cached_bytes: 0,
        buffers_bytes: 0,
        swap_total: 0,
        swap_used: 0,
        oom_events: 0,
        high_memory_processes: Vec::new(),
        status: "ok".to_string(),
    };

    if output.success {
        let parts: Vec<&str> = output.stdout.split("---VMSTAT---").collect();
        if parts.len() >= 2 {
            for line in parts[0].lines() {
                let line = line.trim();
                if line.starts_with("Mem:") {
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() >= 6 {
                        mem_diag.total_bytes = fields[1].parse().unwrap_or(0);
                        mem_diag.used_bytes = fields[2].parse().unwrap_or(0);
                        mem_diag.free_bytes = fields[3].parse().unwrap_or(0);
                        mem_diag.buffers_bytes = fields[4].parse().unwrap_or(0);
                        mem_diag.cached_bytes = fields[5].parse().unwrap_or(0);
                    }
                } else if line.starts_with("Swap:") {
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() >= 3 {
                        mem_diag.swap_total = fields[1].parse().unwrap_or(0);
                        mem_diag.swap_used = fields[2].parse().unwrap_or(0);
                    }
                }
            }

            let rest: Vec<&str> = parts[1].split("---TOPMEM---").collect();
            if rest.len() >= 2 {
                for line in rest[0].lines() {
                    if line.to_lowercase().contains("oom") {
                        mem_diag.oom_events += 1;
                    }
                }

                for (i, line) in rest[1].lines().enumerate() {
                    if i == 0 || line.trim().is_empty() {
                        continue;
                    }
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() >= 5 {
                        mem_diag.high_memory_processes.push(ProcessInfo {
                            pid: fields[0].parse().unwrap_or(0),
                            user: fields[1].to_string(),
                            cpu_percent: fields[2].parse().unwrap_or(0.0),
                            memory_percent: fields[3].parse().unwrap_or(0.0),
                            command: fields[4..].join(" "),
                        });
                    }
                }
            }
        }

        let used_percent = if mem_diag.total_bytes > 0 {
            (mem_diag.used_bytes as f64 / mem_diag.total_bytes as f64) * 100.0
        } else {
            0.0
        };

        if used_percent > 85.0 {
            issues.push(DiagnosticIssue {
                id: format!("mem-high-usage-{}", node_name),
                severity: if used_percent > 95.0 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                category: "memory".to_string(),
                title: "内存使用率过高".to_string(),
                description: format!("内存使用率: {:.1}%", used_percent),
                node_name: node_name.to_string(),
                container_id: None,
                container_name: None,
                recommendation: "检查高内存占用进程，考虑增加内存或优化应用内存使用".to_string(),
                auto_fixable: false,
                fixed: false,
            });
        }

        if mem_diag.swap_used > 0 && mem_diag.swap_total > 0 {
            let swap_percent = (mem_diag.swap_used as f64 / mem_diag.swap_total as f64) * 100.0;
            if swap_percent > 30.0 {
                issues.push(DiagnosticIssue {
                    id: format!("mem-high-swap-{}", node_name),
                    severity: Severity::Warning,
                    category: "memory".to_string(),
                    title: "Swap使用过高".to_string(),
                    description: format!("Swap使用率: {:.1}%", swap_percent),
                    node_name: node_name.to_string(),
                    container_id: None,
                    container_name: None,
                    recommendation: "系统内存不足，正在频繁使用Swap，考虑增加物理内存".to_string(),
                    auto_fixable: false,
                    fixed: false,
                });
            }
        }

        if mem_diag.oom_events > 0 {
            issues.push(DiagnosticIssue {
                id: format!("mem-oom-{}", node_name),
                severity: Severity::Critical,
                category: "memory".to_string(),
                title: "检测到OOM事件".to_string(),
                description: format!("系统发生 {} 次OOM事件", mem_diag.oom_events),
                node_name: node_name.to_string(),
                container_id: None,
                container_name: None,
                recommendation: "检查dmesg日志，找出被OOM Killer终止的进程，及时处理".to_string(),
                auto_fixable: false,
                fixed: false,
            });
        }

        mem_diag.status = if issues.iter().any(|i| i.category == "memory") {
            "warning".to_string()
        } else {
            "ok".to_string()
        };
    }

    Ok(mem_diag)
}

fn diagnose_disk(
    conn: &SshConnection,
    issues: &mut Vec<DiagnosticIssue>,
    node_name: &str,
) -> Result<DiskDiagnostic> {
    let output = conn.execute(
        "df -B1 --output=source,target,size,used,avail,pcent,fstype; echo '---INODE---'; df -i --output=target,files,itotal,iused,ipcent; echo '---READONLY---'; cat /proc/mounts | grep -E '(ro,|,ro,|,ro$)'"
    )?;

    let mut disk_diag = DiskDiagnostic {
        mounts: Vec::new(),
        inode_usage: Vec::new(),
        status: "ok".to_string(),
    };

    if output.success {
        let parts: Vec<&str> = output.stdout.split("---INODE---").collect();
        if parts.len() >= 2 {
            for (i, line) in parts[0].lines().enumerate() {
                if i == 0 || line.trim().is_empty() {
                    continue;
                }
                let fields: Vec<&str> = line.split_whitespace().collect();
                if fields.len() >= 7 {
                    let total: u64 = fields[2].parse().unwrap_or(0);
                    let used: u64 = fields[3].parse().unwrap_or(0);
                    let percent_str = fields[5].trim_end_matches('%');
                    let used_percent: f64 = percent_str.parse().unwrap_or(0.0);

                    disk_diag.mounts.push(DiskMountDiagnostic {
                        mount_point: fields[1].to_string(),
                        filesystem: fields[0].to_string(),
                        total_bytes: total,
                        used_bytes: used,
                        used_percent,
                        available_bytes: fields[4].parse().unwrap_or(0),
                        read_only: false,
                        status: if used_percent > 80.0 { "warning" } else { "ok" }.to_string(),
                    });

                    if used_percent > 85.0 {
                        issues.push(DiagnosticIssue {
                            id: format!("disk-high-usage-{}-{}", node_name, fields[1]),
                            severity: if used_percent > 95.0 {
                                Severity::Critical
                            } else {
                                Severity::Warning
                            },
                            category: "disk".to_string(),
                            title: format!("磁盘使用率过高: {}", fields[1]),
                            description: format!("挂载点 {} 使用率: {:.1}%", fields[1], used_percent),
                            node_name: node_name.to_string(),
                            container_id: None,
                            container_name: None,
                            recommendation: format!("清理 {} 挂载点下的无用文件，考虑扩容", fields[1]),
                            auto_fixable: false,
                            fixed: false,
                        });
                    }
                }
            }

            let rest: Vec<&str> = parts[1].split("---READONLY---").collect();
            if rest.len() >= 2 {
                for (i, line) in rest[0].lines().enumerate() {
                    if i == 0 || line.trim().is_empty() {
                        continue;
                    }
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() >= 5 {
                        let total: u64 = fields[2].parse().unwrap_or(0);
                        let used: u64 = fields[3].parse().unwrap_or(0);
                        let percent_str = fields[4].trim_end_matches('%');
                        let used_percent: f64 = percent_str.parse().unwrap_or(0.0);

                        disk_diag.inode_usage.push(InodeInfo {
                            mount_point: fields[0].to_string(),
                            total,
                            used,
                            used_percent,
                            status: if used_percent > 80.0 { "warning" } else { "ok" }.to_string(),
                        });

                        if used_percent > 80.0 {
                            issues.push(DiagnosticIssue {
                                id: format!("disk-inode-{}-{}", node_name, fields[0]),
                                severity: if used_percent > 95.0 {
                                    Severity::Critical
                                } else {
                                    Severity::Warning
                                },
                                category: "disk".to_string(),
                                title: format!("Inode使用率过高: {}", fields[0]),
                                description: format!("挂载点 {} Inode使用率: {:.1}%", fields[0], used_percent),
                                node_name: node_name.to_string(),
                                container_id: None,
                                container_name: None,
                                recommendation: format!("清理 {} 挂载点下的大量小文件", fields[0]),
                                auto_fixable: false,
                                fixed: false,
                            });
                        }
                    }
                }

                for line in rest[1].lines() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() >= 2 {
                        if let Some(mount) = disk_diag.mounts.iter_mut().find(|m| m.mount_point == fields[1]) {
                            mount.read_only = true;
                            mount.status = "critical".to_string();
                        }
                        issues.push(DiagnosticIssue {
                            id: format!("disk-ro-{}-{}", node_name, fields[1]),
                            severity: Severity::Critical,
                            category: "disk".to_string(),
                            title: format!("磁盘只读: {}", fields[1]),
                            description: format!("挂载点 {} 处于只读状态", fields[1]),
                            node_name: node_name.to_string(),
                            container_id: None,
                            container_name: None,
                            recommendation: format!("检查 {} 文件系统错误，可能需要修复或重启", fields[1]),
                            auto_fixable: false,
                            fixed: false,
                        });
                    }
                }
            }
        }

        disk_diag.status = if issues.iter().any(|i| i.category == "disk") {
            "warning".to_string()
        } else {
            "ok".to_string()
        };
    }

    Ok(disk_diag)
}

fn diagnose_network(
    conn: &SshConnection,
    issues: &mut Vec<DiagnosticIssue>,
    node_name: &str,
) -> Result<NetworkDiagnostic> {
    let output = conn.execute(
        "cat /proc/net/dev; echo '---DNS---'; nslookup google.com 2>&1 || echo 'DNS_FAIL'; echo '---PING---'; ping -c 1 -W 2 8.8.8.8 2>&1 | head -n 2; echo '---PORTS---'; ss -tln | awk 'NR>1 {print $4}' | grep -oP ':\\K\\d+$' | sort -u; echo '---CONN---'; ss -s | grep -E 'TCP:' | head -n 1"
    )?;

    let mut net_diag = NetworkDiagnostic {
        interfaces: Vec::new(),
        dns_status: "unknown".to_string(),
        ping_status: HashMap::new(),
        open_ports: Vec::new(),
        connection_count: 0,
        status: "ok".to_string(),
    };

    if output.success {
        let parts: Vec<&str> = output.stdout.split("---DNS---").collect();
        if parts.len() >= 2 {
            for (i, line) in parts[0].lines().enumerate() {
                if i < 2 || line.trim().is_empty() {
                    continue;
                }
                let fields: Vec<&str> = line.split_whitespace().collect();
                if fields.len() >= 10 {
                    let iface = fields[0].trim_end_matches(':');
                    if iface == "lo" {
                        continue;
                    }
                    net_diag.interfaces.push(InterfaceInfo {
                        name: iface.to_string(),
                        ipv4: None,
                        rx_bytes: fields[1].parse().unwrap_or(0),
                        tx_bytes: fields[9].parse().unwrap_or(0),
                        errors: fields[3].parse().unwrap_or(0),
                        dropped: fields[4].parse().unwrap_or(0),
                        status: if fields[3].parse::<u64>().unwrap_or(0) > 100
                            || fields[4].parse::<u64>().unwrap_or(0) > 100
                        {
                            "warning".to_string()
                        } else {
                            "ok".to_string()
                        },
                    });
                }
            }

            let rest: Vec<&str> = parts[1].split("---PING---").collect();
            if rest.len() >= 2 {
                net_diag.dns_status = if rest[0].contains("DNS_FAIL") || rest[0].contains("timed out") || rest[0].contains("refused") {
                    issues.push(DiagnosticIssue {
                        id: format!("net-dns-{}", node_name),
                        severity: Severity::Warning,
                        category: "network".to_string(),
                        title: "DNS解析失败".to_string(),
                        description: "无法解析域名，请检查DNS配置".to_string(),
                        node_name: node_name.to_string(),
                        container_id: None,
                        container_name: None,
                        recommendation: "检查 /etc/resolv.conf 配置，确认DNS服务器可达".to_string(),
                        auto_fixable: false,
                        fixed: false,
                    });
                    "fail".to_string()
                } else {
                    "ok".to_string()
                };

                let rest2: Vec<&str> = rest[1].split("---PORTS---").collect();
                if rest2.len() >= 2 {
                    net_diag.ping_status.insert(
                        "8.8.8.8".to_string(),
                        !rest2[0].contains("100% packet loss") && !rest2[0].contains("timeout"),
                    );

                    if !net_diag.ping_status["8.8.8.8"] {
                        issues.push(DiagnosticIssue {
                            id: format!("net-ping-{}", node_name),
                            severity: Severity::Warning,
                            category: "network".to_string(),
                            title: "网络连通性问题".to_string(),
                            description: "无法ping通外部网络".to_string(),
                            node_name: node_name.to_string(),
                            container_id: None,
                            container_name: None,
                            recommendation: "检查网络路由、防火墙和网关配置".to_string(),
                            auto_fixable: false,
                            fixed: false,
                        });
                    }

                    let rest3: Vec<&str> = rest2[1].split("---CONN---").collect();
                    if rest3.len() >= 2 {
                        for line in rest3[0].lines() {
                            if let Ok(port) = line.trim().parse::<u16>() {
                                net_diag.open_ports.push(port);
                            }
                        }

                        if let Some(conn_line) = rest3[1].lines().next() {
                            let conn_regex = regex::Regex::new(r"(\d+) connection[s]?").unwrap();
                            if let Some(caps) = conn_regex.captures(conn_line) {
                                net_diag.connection_count = caps.get(1).unwrap().as_str().parse().unwrap_or(0);
                            }
                        }
                    }
                }
            }
        }

        for iface in &net_diag.interfaces {
            if iface.errors > 100 {
                issues.push(DiagnosticIssue {
                    id: format!("net-errors-{}-{}", node_name, iface.name),
                    severity: Severity::Warning,
                    category: "network".to_string(),
                    title: format!("网卡错误包过多: {}", iface.name),
                    description: format!("网卡 {} 错误包数: {}, 丢包数: {}", iface.name, iface.errors, iface.dropped),
                    node_name: node_name.to_string(),
                    container_id: None,
                    container_name: None,
                    recommendation: format!("检查 {} 网卡硬件或驱动问题", iface.name),
                    auto_fixable: false,
                    fixed: false,
                });
            }
        }

        net_diag.status = if issues.iter().any(|i| i.category == "network") {
            "warning".to_string()
        } else {
            "ok".to_string()
        };
    }

    Ok(net_diag)
}

fn diagnose_containers(
    conn: &SshConnection,
    issues: &mut Vec<DiagnosticIssue>,
    node_name: &str,
) -> Result<Vec<ContainerDiagnostic>> {
    let output = conn.execute(
        "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}|{{.RestartCount}}'"
    )?;

    let mut container_diags = Vec::new();

    if output.success {
        for line in output.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() < 6 {
                continue;
            }

            let container_id = parts[0].to_string();
            let container_name = parts[1].to_string();
            let state = parts[3].to_string();
            let restart_count: u32 = parts[5].parse().unwrap_or(0);

            let mut container_issues = Vec::new();
            let mut status = "ok".to_string();

            if state != "running" {
                status = if state == "exited" { "exited".to_string() } else { "critical".to_string() };
                container_issues.push(DiagnosticIssue {
                    id: format!("container-state-{}-{}", node_name, container_id),
                    severity: Severity::Critical,
                    category: "container".to_string(),
                    title: format!("容器异常状态: {}", container_name),
                    description: format!("容器 {} 当前状态: {}", container_name, state),
                    node_name: node_name.to_string(),
                    container_id: Some(container_id.clone()),
                    container_name: Some(container_name.clone()),
                    recommendation: format!("查看容器 {} 日志，排查问题原因", container_name),
                    auto_fixable: false,
                    fixed: false,
                });
            }

            if restart_count > 5 {
                if status == "ok" {
                    status = "warning".to_string();
                }
                container_issues.push(DiagnosticIssue {
                    id: format!("container-restart-{}-{}", node_name, container_id),
                    severity: if restart_count > 20 {
                        Severity::Critical
                    } else {
                        Severity::Warning
                    },
                    category: "container".to_string(),
                    title: format!("容器频繁重启: {}", container_name),
                    description: format!("容器 {} 重启次数: {}", container_name, restart_count),
                    node_name: node_name.to_string(),
                    container_id: Some(container_id.clone()),
                    container_name: Some(container_name.clone()),
                    recommendation: format!("检查容器 {} 应用日志，排查崩溃原因", container_name),
                    auto_fixable: false,
                    fixed: false,
                });
            }

            let health_output = conn.execute(&format!(
                "docker inspect --format '{{{{.State.Health.Status}}}}' {}",
                container_id
            ))?;
            let health_status = if health_output.success {
                let h = health_output.stdout.trim().to_string();
                if h == "unhealthy" {
                    if status == "ok" {
                        status = "warning".to_string();
                    }
                    container_issues.push(DiagnosticIssue {
                        id: format!("container-health-{}-{}", node_name, container_id),
                        severity: Severity::Warning,
                        category: "container".to_string(),
                        title: format!("容器健康检查失败: {}", container_name),
                        description: format!("容器 {} 健康状态: unhealthy", container_name),
                        node_name: node_name.to_string(),
                        container_id: Some(container_id.clone()),
                        container_name: Some(container_name.clone()),
                        recommendation: format!("检查容器 {} 健康检查配置和应用状态", container_name),
                        auto_fixable: false,
                        fixed: false,
                    });
                }
                Some(h)
            } else {
                None
            };

            issues.extend(container_issues.clone());

            container_diags.push(ContainerDiagnostic {
                container_id: container_id.clone(),
                container_name,
                image: parts[2].to_string(),
                state: state.clone(),
                restart_count,
                uptime_seconds: None,
                health_status,
                issues: container_issues,
                status,
            });
        }
    }

    Ok(container_diags)
}

pub fn print_diagnostics(results: &[NodeDiagnostics], verbose: bool) {
    println!("\n{}", "=== 故障诊断报告 ===".bold().yellow());

    let mut total_critical = 0;
    let mut total_warning = 0;
    let mut total_info = 0;

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

        if verbose {
            if let Some(cpu) = &result.cpu_diagnostic {
                let status_color = match cpu.status.as_str() {
                    "ok" => cpu.status.green(),
                    _ => cpu.status.yellow(),
                };
                println!(
                    "\n  {} CPU: [{}] 负载 {:.2}/{:.2}/{:.2}, 用户 {:.1}%, 系统 {:.1}%, IO等待 {:.1}%",
                    "●".bold(),
                    status_color,
                    cpu.load_average_1min,
                    cpu.load_average_5min,
                    cpu.load_average_15min,
                    cpu.user_percent,
                    cpu.system_percent,
                    cpu.iowait_percent
                );
            }

            if let Some(mem) = &result.memory_diagnostic {
                let status_color = match mem.status.as_str() {
                    "ok" => mem.status.green(),
                    _ => mem.status.yellow(),
                };
                let used_gb = mem.used_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
                let total_gb = mem.total_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
                println!(
                    "  {} 内存: [{}] {:.2}GB / {:.2}GB ({:.1}%), OOM事件: {}",
                    "●".bold(),
                    status_color,
                    used_gb,
                    total_gb,
                    if mem.total_bytes > 0 { (mem.used_bytes as f64 / mem.total_bytes as f64) * 100.0 } else { 0.0 },
                    mem.oom_events
                );
            }

            if let Some(disk) = &result.disk_diagnostic {
                let status_color = match disk.status.as_str() {
                    "ok" => disk.status.green(),
                    _ => disk.status.yellow(),
                };
                print!("  {} 磁盘: [{}]", "●".bold(), status_color);
                for mount in &disk.mounts {
                    print!(" {}: {:.1}%", mount.mount_point, mount.used_percent);
                }
                println!();
            }

            if let Some(net) = &result.network_diagnostic {
                let status_color = match net.status.as_str() {
                    "ok" => net.status.green(),
                    _ => net.status.yellow(),
                };
                println!(
                    "  {} 网络: [{}] DNS: {}, Ping: {}, 连接数: {}",
                    "●".bold(),
                    status_color,
                    net.dns_status,
                    if *net.ping_status.get("8.8.8.8").unwrap_or(&false) { "ok".green() } else { "fail".red() },
                    net.connection_count
                );
            }

            if !result.container_diagnostics.is_empty() {
                println!("\n  {} 容器诊断:", "●".bold());
                for cd in &result.container_diagnostics {
                    let status_color = match cd.status.as_str() {
                        "ok" => cd.status.green(),
                        "warning" => cd.status.yellow(),
                        "exited" => cd.status.yellow(),
                        _ => cd.status.red(),
                    };
                    println!(
                        "    {} {} ({}) [{}] 重启: {}",
                        if cd.state == "running" { "✓".green() } else { "✗".red() },
                        cd.container_name.cyan(),
                        cd.container_id.chars().take(8).collect::<String>(),
                        status_color,
                        cd.restart_count
                    );
                }
            }
        }

        if !result.issues.is_empty() {
            println!("\n  {} 发现的问题:", "!".yellow().bold());

            for issue in &result.issues {
                let sev_str = match issue.severity {
                    Severity::Info => "INFO".cyan(),
                    Severity::Warning => "WARN".yellow(),
                    Severity::Critical => "CRIT".red(),
                    Severity::Fatal => "FATAL".red().bold(),
                };

                total_critical += if issue.severity == Severity::Critical || issue.severity == Severity::Fatal { 1 } else { 0 };
                total_warning += if issue.severity == Severity::Warning { 1 } else { 0 };
                total_info += if issue.severity == Severity::Info { 1 } else { 0 };

                println!(
                    "    [{}] {}: {}",
                    sev_str,
                    issue.title.bold(),
                    issue.description
                );
                if verbose {
                    println!("      {} {}", "建议:".cyan(), issue.recommendation);
                }
            }
        } else {
            println!("\n  {}: 未发现问题", "✓".green().bold());
        }
    }

    println!("\n{}", "=== 诊断汇总 ===".bold().yellow());
    println!(
        "总计: {} 个严重问题, {} 个警告, {} 个信息",
        total_critical.to_string().red().bold(),
        total_warning.to_string().yellow().bold(),
        total_info.to_string().cyan().bold()
    );

    if total_critical > 0 {
        println!("\n{}: 发现严重问题，需要立即处理！", "警告".red().bold());
    } else if total_warning > 0 {
        println!("\n{}: 发现警告，建议尽快处理。", "提示".yellow().bold());
    } else {
        println!("\n{}: 所有节点运行正常！", "✓".green().bold());
    }
}
