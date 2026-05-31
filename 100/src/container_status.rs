use anyhow::Result;
use chrono::{DateTime, Utc};
use colored::*;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use crate::cluster_connection::{connect_to_node, SshConnection};
use crate::config::NodeConfig;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ContainerState {
    Running,
    Restarting,
    Paused,
    Exited,
    Dead,
    Created,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: ContainerState,
    pub status: String,
    pub ports: String,
    pub created: String,
    pub cpu_usage: Option<f64>,
    pub memory_usage: Option<u64>,
    pub memory_limit: Option<u64>,
    pub restart_count: u32,
    pub health_status: Option<String>,
    pub is_healthy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeContainerStatus {
    pub cluster_name: String,
    pub node_name: String,
    pub host: String,
    pub containers: Vec<ContainerInfo>,
    pub total_containers: usize,
    pub running_count: usize,
    pub stopped_count: usize,
    pub unhealthy_count: usize,
    pub error: Option<String>,
    pub timestamp: DateTime<Utc>,
}

impl Default for NodeContainerStatus {
    fn default() -> Self {
        Self {
            cluster_name: String::new(),
            node_name: String::new(),
            host: String::new(),
            containers: Vec::new(),
            total_containers: 0,
            running_count: 0,
            stopped_count: 0,
            unhealthy_count: 0,
            error: Some("任务失败".to_string()),
            timestamp: Utc::now(),
        }
    }
}

impl ContainerState {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "running" => ContainerState::Running,
            "restarting" => ContainerState::Restarting,
            "paused" => ContainerState::Paused,
            "exited" => ContainerState::Exited,
            "dead" => ContainerState::Dead,
            "created" => ContainerState::Created,
            _ => ContainerState::Unknown,
        }
    }

    pub fn to_str(&self) -> &str {
        match self {
            ContainerState::Running => "running",
            ContainerState::Restarting => "restarting",
            ContainerState::Paused => "paused",
            ContainerState::Exited => "exited",
            ContainerState::Dead => "dead",
            ContainerState::Created => "created",
            ContainerState::Unknown => "unknown",
        }
    }

    pub fn is_issue(&self) -> bool {
        matches!(
            self,
            ContainerState::Exited | ContainerState::Dead | ContainerState::Unknown
        )
    }
}

pub async fn inspect_node_containers(
    cluster_name: &str,
    node: &NodeConfig,
    timeout: u64,
    only_issues: bool,
    filter: &str,
) -> Result<NodeContainerStatus> {
    info!("正在巡检节点 {}.{} 的容器状态...", cluster_name, node.name);

    let conn = match connect_to_node(cluster_name, node, timeout).await {
        Ok(c) => c,
        Err(e) => {
            error!("连接节点 {}.{} 失败: {}", cluster_name, node.name, e);
            return Ok(NodeContainerStatus {
                cluster_name: cluster_name.to_string(),
                node_name: node.name.clone(),
                host: node.host.clone(),
                containers: Vec::new(),
                total_containers: 0,
                running_count: 0,
                stopped_count: 0,
                unhealthy_count: 0,
                error: Some(format!("连接失败: {}", e)),
                timestamp: Utc::now(),
            });
        }
    };

    let result = parse_docker_ps(&conn, only_issues, filter);
    conn.close();

    match result {
        Ok(mut status) => {
            status.cluster_name = cluster_name.to_string();
            status.node_name = node.name.clone();
            status.host = node.host.clone();
            info!(
                "节点 {}.{} 巡检完成: 共 {} 个容器, 运行中 {}, 已停止 {}, 异常 {}",
                cluster_name,
                node.name,
                status.total_containers.to_string().cyan(),
                status.running_count.to_string().green(),
                status.stopped_count.to_string().yellow(),
                status.unhealthy_count.to_string().red()
            );
            Ok(status)
        }
        Err(e) => {
            error!("解析节点 {}.{} 容器信息失败: {}", cluster_name, node.name, e);
            Ok(NodeContainerStatus {
                cluster_name: cluster_name.to_string(),
                node_name: node.name.clone(),
                host: node.host.clone(),
                containers: Vec::new(),
                total_containers: 0,
                running_count: 0,
                stopped_count: 0,
                unhealthy_count: 0,
                error: Some(format!("解析失败: {}", e)),
                timestamp: Utc::now(),
            })
        }
    }
}

fn parse_docker_ps(
    conn: &SshConnection,
    only_issues: bool,
    filter: &str,
) -> Result<NodeContainerStatus> {
    let format = "{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}|{{.RestartCount}}";
    let command = format!("docker ps -a --format '{}'", format);

    let output = conn.execute(&command)?;
    if !output.success {
        anyhow::bail!("执行docker ps失败: {}", output.stderr);
    }

    let mut containers = Vec::new();

    for line in output.stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 8 {
            warn!("容器信息格式不正确: {}", line);
            continue;
        }

        let state = ContainerState::from_str(parts[3]);

        if filter != "all" && state.to_str() != filter {
            continue;
        }

        if only_issues && !state.is_issue() {
            continue;
        }

        let restart_count: u32 = parts[7].parse().unwrap_or(0);
        let is_healthy = state == ContainerState::Running && restart_count < 5;

        let container = ContainerInfo {
            id: parts[0].to_string(),
            name: parts[1].to_string(),
            image: parts[2].to_string(),
            state,
            status: parts[4].to_string(),
            ports: parts[5].to_string(),
            created: parts[6].to_string(),
            cpu_usage: None,
            memory_usage: None,
            memory_limit: None,
            restart_count,
            health_status: None,
            is_healthy,
        };

        containers.push(container);
    }

    let total_containers = containers.len();
    let running_count = containers
        .iter()
        .filter(|c| c.state == ContainerState::Running)
        .count();
    let stopped_count = containers
        .iter()
        .filter(|c| c.state != ContainerState::Running)
        .count();
    let unhealthy_count = containers.iter().filter(|c| !c.is_healthy).count();

    Ok(NodeContainerStatus {
        cluster_name: String::new(),
        node_name: String::new(),
        host: String::new(),
        containers,
        total_containers,
        running_count,
        stopped_count,
        unhealthy_count,
        error: None,
        timestamp: Utc::now(),
    })
}

pub fn print_container_status(results: &[NodeContainerStatus], only_issues: bool) {
    println!("\n{}", "=== 容器状态巡检结果 ===".bold().yellow());

    let mut total_containers = 0;
    let mut total_running = 0;
    let mut total_stopped = 0;
    let mut total_unhealthy = 0;

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

        if result.containers.is_empty() {
            println!("  {}", "无容器信息".yellow());
            continue;
        }

        let containers_to_show: Vec<&ContainerInfo> = if only_issues {
            result.containers.iter().filter(|c| !c.is_healthy).collect()
        } else {
            result.containers.iter().collect()
        };

        if containers_to_show.is_empty() {
            println!("  {}", "所有容器运行正常".green());
            continue;
        }

        println!(
            "  总计: {} 个容器 | {} 运行中 | {} 已停止 | {} 异常",
            result.total_containers.to_string().cyan(),
            result.running_count.to_string().green(),
            result.stopped_count.to_string().yellow(),
            result.unhealthy_count.to_string().red()
        );

        if only_issues {
            println!("  {}: 仅显示异常容器", "提示".cyan());
        }

        println!(
            "  {:<14} {:<20} {:<25} {:<10} {:<8} {}",
            "容器ID", "名称", "镜像", "状态", "重启次数", "状态描述"
        );
        println!("  {}", "-".repeat(100));

        for container in containers_to_show {
            let state_str = match container.state {
                ContainerState::Running => "running".green(),
                ContainerState::Restarting => "restarting".yellow(),
                ContainerState::Paused => "paused".blue(),
                ContainerState::Exited => "exited".red(),
                ContainerState::Dead => "dead".red().bold(),
                ContainerState::Created => "created".cyan(),
                ContainerState::Unknown => "unknown".bright_black(),
            };

            let restart_str = if container.restart_count > 3 {
                container.restart_count.to_string().red()
            } else {
                container.restart_count.to_string().normal()
            };

            println!(
                "  {:<14} {:<20} {:<25} {:<10} {:<8} {}",
                container.id.chars().take(12).collect::<String>(),
                container.name.chars().take(18).collect::<String>(),
                container.image.chars().take(23).collect::<String>(),
                state_str,
                restart_str,
                container.status
            );
        }

        total_containers += result.total_containers;
        total_running += result.running_count;
        total_stopped += result.stopped_count;
        total_unhealthy += result.unhealthy_count;
    }

    println!("\n{}", "=== 汇总 ===".bold().yellow());
    println!(
        "总容器数: {} | 运行中: {} | 已停止: {} | 异常: {}",
        total_containers.to_string().cyan().bold(),
        total_running.to_string().green().bold(),
        total_stopped.to_string().yellow().bold(),
        total_unhealthy.to_string().red().bold()
    );

    if total_unhealthy > 0 {
        println!("\n{}: 发现 {} 个异常容器，建议检查！", "警告".yellow().bold(), total_unhealthy);
    } else {
        println!("\n{}: 所有容器运行正常！", "✓".green().bold());
    }
}

pub fn get_container_by_name_or_id<'a>(
    status: &'a [NodeContainerStatus],
    name_or_id: &str,
) -> Option<(&'a NodeContainerStatus, &'a ContainerInfo)> {
    for node_status in status {
        for container in &node_status.containers {
            if container.name == name_or_id
                || container.id.starts_with(name_or_id)
                || container.id == name_or_id
            {
                return Some((node_status, container));
            }
        }
    }
    None
}
