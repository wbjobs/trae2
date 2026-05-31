use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use colored::*;
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tokio::task;
use tracing::{debug, error, info, warn};

use crate::config::NodeConfig;

const DEFAULT_CONNECT_TIMEOUT: u64 = 30;
const SERVER_ALIVE_INTERVAL: u64 = 15;
const SERVER_ALIVE_COUNT_MAX: u64 = 3;
const MAX_CONCURRENT_SSH: usize = 16;

#[derive(Debug, Clone, Copy)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub initial_delay_secs: u64,
    pub backoff_factor: u32,
    pub max_delay_secs: u64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 2,
            initial_delay_secs: 2,
            backoff_factor: 2,
            max_delay_secs: 30,
        }
    }
}

impl RetryConfig {
    pub fn new(max_retries: u32, initial_delay_secs: u64) -> Self {
        Self {
            max_retries,
            initial_delay_secs,
            backoff_factor: 2,
            max_delay_secs: 30,
        }
    }

    pub fn delay_for_attempt(&self, attempt: u32) -> u64 {
        let delay = self.initial_delay_secs * (self.backoff_factor as u64).pow(attempt);
        delay.min(self.max_delay_secs)
    }
}

pub async fn with_retry<F, Fut, T>(
    config: RetryConfig,
    description: String,
    mut f: F,
) -> Result<T>
where
    F: FnMut(u32) -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut last_error: Option<anyhow::Error> = None;

    for attempt in 0..=config.max_retries {
        if attempt > 0 {
            let delay = config.delay_for_attempt(attempt - 1);
            warn!(
                "{} 第 {}/{} 次重试，等待 {} 秒...",
                description,
                attempt,
                config.max_retries,
                delay
            );
            tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
        }

        match f(attempt).await {
            Ok(value) => return Ok(value),
            Err(e) => {
                last_error = Some(e);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("重试耗尽")))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectionStatus {
    Connected,
    Disconnected,
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionResult {
    pub cluster_name: String,
    pub node_name: String,
    pub host: String,
    pub status: ConnectionStatus,
    pub latency_ms: Option<u64>,
    pub message: String,
    pub timestamp: DateTime<Utc>,
}

impl Default for ConnectionResult {
    fn default() -> Self {
        Self {
            cluster_name: String::new(),
            node_name: String::new(),
            host: String::new(),
            status: ConnectionStatus::Disconnected,
            latency_ms: None,
            message: String::new(),
            timestamp: Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
}

pub struct SshConnection {
    node_config: NodeConfig,
    cluster_name: String,
    timeout: u64,
}

impl SshConnection {
    pub async fn connect(
        cluster_name: &str,
        node: &NodeConfig,
        timeout: u64,
    ) -> Result<Self> {
        debug!("正在连接到 {}@{}:{}", node.user, node.host, node.port);

        let start = std::time::Instant::now();
        let effective_timeout = if timeout > 0 { timeout } else { node.timeout };
        let test_result = execute_ssh_command(node, "echo 'connection_ok'", effective_timeout).await;

        match test_result {
            Ok(output) if output.success => {
                let latency = start.elapsed().as_millis() as u64;
                debug!(
                    "节点 {} 连接成功，耗时 {}ms",
                    node.name, latency
                );
                Ok(Self {
                    node_config: node.clone(),
                    cluster_name: cluster_name.to_string(),
                    timeout: effective_timeout,
                })
            }
            Ok(output) => Err(anyhow!("连接测试失败: {}", output.stderr)),
            Err(e) => Err(anyhow!("连接失败: {}", e)),
        }
    }

    pub fn execute(&self, command: &str) -> Result<CommandOutput> {
        debug!("在节点 {} 执行命令: {}", self.node_config.name, command);
        execute_ssh_command_sync(&self.node_config, command, self.timeout)
    }

    pub fn execute_with_timeout(&self, command: &str, timeout: u64) -> Result<CommandOutput> {
        debug!(
            "在节点 {} 执行命令(超时{}s): {}",
            self.node_config.name, timeout, command
        );
        execute_ssh_command_sync(&self.node_config, command, timeout)
    }

    pub fn execute_streaming<F>(&self, command: &str, mut on_output: F) -> Result<CommandOutput>
    where
        F: FnMut(&str),
    {
        let output = self.execute(command)?;
        on_output(&output.stdout);
        Ok(output)
    }

    pub fn close(&self) {
    }

    pub fn node_name(&self) -> &str {
        &self.node_config.name
    }

    pub fn cluster_name(&self) -> &str {
        &self.cluster_name
    }

    pub fn host(&self) -> &str {
        &self.node_config.host
    }
}

fn build_ssh_command(node: &NodeConfig, command: &str, timeout: u64) -> Command {
    let mut cmd = Command::new("ssh");

    cmd.arg("-o").arg("StrictHostKeyChecking=no");
    cmd.arg("-o").arg("UserKnownHostsFile=/dev/null");
    cmd.arg("-o").arg(format!("ConnectTimeout={}", timeout.min(60)));
    cmd.arg("-o").arg(format!("ServerAliveInterval={}", SERVER_ALIVE_INTERVAL));
    cmd.arg("-o").arg(format!("ServerAliveCountMax={}", SERVER_ALIVE_COUNT_MAX));
    cmd.arg("-o").arg("BatchMode=yes");
    cmd.arg("-p").arg(node.port.to_string());

    if let Some(key_file) = &node.key_file {
        cmd.arg("-i").arg(key_file);
    }

    if let Some(_password) = &node.password {
    }

    cmd.arg(format!("{}@{}", node.user, node.host));
    cmd.arg(command);

    cmd
}

fn execute_ssh_command_sync(node: &NodeConfig, command: &str, timeout: u64) -> Result<CommandOutput> {
    let effective_timeout = if timeout > 0 { timeout } else { DEFAULT_CONNECT_TIMEOUT };
    let mut cmd = build_ssh_command(node, command, effective_timeout);

    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().context("启动SSH命令失败，请确保ssh客户端已安装")?;

    let child_id = child.id();
    let result = match child.wait_timeout(Duration::from_secs(effective_timeout)) {
        Some(_status) => {
            let output = child.wait_with_output().context("读取SSH命令输出失败")?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            let success = output.status.success();
            Ok(CommandOutput {
                stdout,
                stderr,
                exit_code,
                success,
            })
        }
        None => {
            warn!(
                "节点 {} 命令执行超时({}s)，终止进程 PID:{}",
                node.name, effective_timeout, child_id
            );
            let _ = child.kill();
            let _ = child.wait();
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("命令执行超时 ({}s)，进程已终止", effective_timeout),
                exit_code: -1,
                success: false,
            })
        }
    };

    result
}

trait ChildWaitTimeout {
    fn wait_timeout(&mut self, timeout: Duration) -> Option<std::process::ExitStatus>;
}

impl ChildWaitTimeout for std::process::Child {
    fn wait_timeout(&mut self, timeout: Duration) -> Option<std::process::ExitStatus> {
        let start = std::time::Instant::now();
        loop {
            match self.try_wait() {
                Ok(Some(status)) => return Some(status),
                Ok(None) => {
                    if start.elapsed() >= timeout {
                        return None;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(_) => return None,
            }
        }
    }
}

async fn execute_ssh_command(node: &NodeConfig, command: &str, timeout: u64) -> Result<CommandOutput> {
    let node_clone = node.clone();
    let command_clone = command.to_string();
    let effective_timeout = if timeout > 0 { timeout } else { DEFAULT_CONNECT_TIMEOUT };
    let timeout_dur = Duration::from_secs(effective_timeout + 10);

    let result = task::spawn_blocking(move || {
        execute_ssh_command_sync(&node_clone, &command_clone, effective_timeout)
    });

    match tokio::time::timeout(timeout_dur, result).await {
        Ok(Ok(Ok(output))) => Ok(output),
        Ok(Ok(Err(e))) => Err(e),
        Ok(Err(e)) => Err(e).context("任务执行失败"),
        Err(_) => Err(anyhow!("命令执行超时 ({}s)", effective_timeout)),
    }
}

pub fn get_concurrency_semaphore() -> Arc<Semaphore> {
    Arc::new(Semaphore::new(MAX_CONCURRENT_SSH))
}

pub async fn test_connection(
    cluster_name: &str,
    node: &NodeConfig,
    timeout: u64,
) -> ConnectionResult {
    let start = std::time::Instant::now();
    let host = node.host.clone();
    let node_name = node.name.clone();
    let effective_timeout = if timeout > 0 { timeout } else { node.timeout };

    match SshConnection::connect(cluster_name, node, effective_timeout).await {
        Ok(conn) => {
            let latency = start.elapsed().as_millis() as u64;
            conn.close();
            info!(
                "节点 {} ({}) 连接成功，耗时 {}ms",
                node_name.cyan(),
                host.bright_black(),
                latency.to_string().green()
            );
            ConnectionResult {
                cluster_name: cluster_name.to_string(),
                node_name,
                host,
                status: ConnectionStatus::Connected,
                latency_ms: Some(latency),
                message: "连接成功".to_string(),
                timestamp: Utc::now(),
            }
        }
        Err(e) => {
            error!("节点 {} ({}) 连接失败: {}", node_name, host, e);
            ConnectionResult {
                cluster_name: cluster_name.to_string(),
                node_name,
                host,
                status: ConnectionStatus::Failed(e.to_string()),
                latency_ms: None,
                message: format!("连接失败: {}", e),
                timestamp: Utc::now(),
            }
        }
    }
}

pub async fn connect_to_node(
    cluster_name: &str,
    node: &NodeConfig,
    timeout: u64,
) -> Result<SshConnection> {
    SshConnection::connect(cluster_name, node, timeout).await
}

pub async fn execute_on_node(
    cluster_name: &str,
    node: &NodeConfig,
    command: &str,
    timeout: u64,
) -> Result<(String, CommandOutput)> {
    let conn = connect_to_node(cluster_name, node, timeout).await?;
    let output = conn.execute(command)?;
    conn.close();
    Ok((node.name.clone(), output))
}

pub fn print_connection_results(results: &[ConnectionResult]) {
    println!("\n{}", "=== 节点连接测试结果 ===".bold().yellow());
    println!(
        "{:<15} {:<15} {:<20} {:<12} {:<10} {}",
        "集群", "节点", "地址", "状态", "延迟(ms)", "消息"
    );
    println!("{}", "-".repeat(100));

    for result in results {
        let status_str = match &result.status {
            ConnectionStatus::Connected => "已连接".green(),
            ConnectionStatus::Disconnected => "已断开".yellow(),
            ConnectionStatus::Failed(_) => "失败".red(),
        };
        let latency = result
            .latency_ms
            .map(|l| l.to_string())
            .unwrap_or_else(|| "-".to_string());

        println!(
            "{:<15} {:<15} {:<20} {:<12} {:<10} {}",
            result.cluster_name,
            result.node_name,
            result.host,
            status_str,
            latency,
            result.message
        );
    }

    let total = results.len();
    let success = results
        .iter()
        .filter(|r| matches!(r.status, ConnectionStatus::Connected))
        .count();
    let failed = total - success;

    println!("\n总计: {} 个节点，{} 成功，{} 失败", total, success.to_string().green(), failed.to_string().red());
}
