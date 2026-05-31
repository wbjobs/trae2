mod cli;
mod config;
mod cluster_connection;
mod container_status;
mod resource_stats;
mod log_extract;
mod diagnostics;
mod storage;
mod report;

use anyhow::{anyhow, Result};
use chrono::Utc;
use clap::Parser;
use colored::*;
use futures::future;
use indicatif::{ProgressBar, ProgressStyle};
use std::sync::Arc;
use tracing::level_filters::LevelFilter;
use tracing_subscriber::EnvFilter;

use cli::{Cli, Commands, ConfigAction, HistoryAction};
use cluster_connection::{ConnectionResult, RetryConfig, get_concurrency_semaphore, with_retry};
use config::{AppConfig, ClusterConfig, ClusterType, NodeConfig, format_output};
use container_status::NodeContainerStatus;
use diagnostics::NodeDiagnostics;
use resource_stats::NodeResourceStats;
use storage::{TaskType, Storage, InspectionData, InspectionDataBuilder, generate_inspection_record};
use tracing::error;

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    init_logging(cli.debug);

    let config_path = cli.config.clone();
    let mut app_config = AppConfig::load(&config_path)
        .unwrap_or_else(|e| {
            tracing::warn!("加载配置失败，使用空配置: {}", e);
            AppConfig::new()
        });

    let storage = if cli.no_store {
        None
    } else {
        match Storage::new() {
            Ok(s) => Some(s),
            Err(e) => {
                tracing::warn!("初始化存储失败，跳过持久化: {}", e);
                None
            }
        }
    };

    let result = run_command(&cli, &mut app_config, storage.as_ref()).await;

    if let Err(e) = &result {
        tracing::error!("命令执行失败: {}", e);
        eprintln!("{}: {}", "错误".red().bold(), e);
        std::process::exit(1);
    }

    if let Err(e) = app_config.save(&config_path) {
        tracing::warn!("保存配置失败: {}", e);
    }

    Ok(())
}

fn init_logging(debug: bool) {
    let filter = if debug {
        EnvFilter::builder()
            .with_default_directive(LevelFilter::DEBUG.into())
            .from_env_lossy()
    } else {
        EnvFilter::builder()
            .with_default_directive(LevelFilter::INFO.into())
            .from_env_lossy()
    };

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_level(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .init();
}

fn get_filtered_nodes<'a>(
    app_config: &'a AppConfig,
    cli: &Cli,
) -> Vec<(String, NodeConfig)> {
    let groups = if cli.group.is_empty() { None } else { Some(cli.group.as_slice()) };
    let labels = if cli.label.is_empty() {
        None
    } else {
        Some(cli.label.as_slice())
    };
    app_config.get_filtered_nodes_with_opts(
        cli.cluster.as_deref(),
        cli.node.as_deref(),
        groups,
        labels,
    )
}

fn get_retry_config(cli: &Cli) -> RetryConfig {
    RetryConfig::new(cli.retries, cli.retry_delay)
}

async fn run_command(cli: &Cli, app_config: &mut AppConfig, storage: Option<&Storage>) -> Result<()> {
    match &cli.command {
        Commands::Config { action } => {
            handle_config_command(action, app_config, &cli.config, &cli.output).await
        }
        Commands::Connect { timeout } => {
            handle_connect_command(app_config, cli, storage, *timeout).await
        }
        Commands::Status { only_issues, filter } => {
            handle_status_command(app_config, cli, storage, *only_issues, filter).await
        }
        Commands::Resource { resource_type, sort, top } => {
            handle_resource_command(app_config, cli, storage, resource_type, *sort, *top).await
        }
        Commands::Logs { container, tail, output_file, follow, since } => {
            handle_logs_command(
                app_config,
                cli,
                storage,
                container,
                *tail,
                output_file.clone(),
                *follow,
                since.clone(),
            )
            .await
        }
        Commands::Diagnose { diag_type, verbose, auto_fix } => {
            handle_diagnose_command(app_config, cli, storage, diag_type, *verbose, *auto_fix).await
        }
        Commands::Inspect { report, report_format, report_title } => {
            handle_inspect_command(
                app_config, cli, storage,
                report.clone(), report_format.clone(), report_title.clone()
            ).await
        }
        Commands::History { action } => {
            handle_history_command(action, cli, storage).await
        }
        Commands::Report { id, output, format, title } => {
            handle_report_command(storage, id.clone(), output.clone(), format.clone(), title.clone()).await
        }
    }
}

async fn handle_config_command(
    action: &ConfigAction,
    app_config: &mut AppConfig,
    config_path: &str,
    output_format: &str,
) -> Result<()> {
    match action {
        ConfigAction::List => {
            if app_config.clusters.is_empty() {
                println!("{}", "暂无集群配置".yellow());
                println!("使用 'cinspect config init' 生成示例配置");
            } else {
                if output_format == "table" {
                    print_config_list(app_config);
                } else {
                    println!("{}", format_output(app_config, output_format)?);
                }
            }
        }
        ConfigAction::Add {
            name,
            cluster_type,
            nodes,
            user,
            password,
            key_file,
            port,
        } => {
            let cluster_type = match cluster_type.to_lowercase().as_str() {
                "docker" => ClusterType::Docker,
                "k8s" | "kubernetes" => ClusterType::Kubernetes,
                "swarm" => ClusterType::DockerSwarm,
                _ => return Err(anyhow!("不支持的集群类型: {}", cluster_type)),
            };

            let node_configs: Vec<NodeConfig> = nodes
                .split(',')
                .map(|s| {
                    let s = s.trim();
                    NodeConfig {
                        name: format!("node-{}", s.replace('.', "-")),
                        host: s.to_string(),
                        port: *port,
                        user: user.clone(),
                        password: password.clone(),
                        key_file: key_file.clone(),
                        timeout: 30,
                        enabled: true,
                        groups: Vec::new(),
                        labels: std::collections::HashMap::new(),
                    }
                })
                .collect();

            let cluster = ClusterConfig {
                name: name.clone(),
                cluster_type,
                description: format!("通过CLI添加的集群"),
                nodes: node_configs,
            };

            app_config.add_cluster(cluster);
            println!("{} 集群配置已添加: {}", "✓".green(), name.bold());
        }
        ConfigAction::AddGroup { cluster, node, groups } => {
            let groups_to_add: Vec<String> = groups.split(',').map(|s| s.trim().to_string()).collect();
            let mut added = false;

            for c in &mut app_config.clusters {
                if &c.name == cluster {
                    for n in &mut c.nodes {
                        if &n.name == node {
                            for g in &groups_to_add {
                                if !n.groups.contains(g) {
                                    n.groups.push(g.clone());
                                }
                            }
                            added = true;
                            println!("{} 已为节点 {} 添加分组: {}", "✓".green(), node.bold(), groups);
                        }
                    }
                }
            }

            if !added {
                return Err(anyhow!("未找到集群 {} 中的节点 {}", cluster, node));
            }
        }
        ConfigAction::AddLabel { cluster, node, labels } => {
            let labels_to_add: Vec<(String, String)> = labels
                .split(',')
                .filter_map(|s| {
                    let parts: Vec<&str> = s.splitn(2, '=').collect();
                    if parts.len() == 2 {
                        Some((parts[0].trim().to_string(), parts[1].trim().to_string()))
                    } else {
                        None
                    }
                })
                .collect();

            let mut added = false;
            for c in &mut app_config.clusters {
                if &c.name == cluster {
                    for n in &mut c.nodes {
                        if &n.name == node {
                            for (k, v) in &labels_to_add {
                                n.labels.insert(k.clone(), v.clone());
                            }
                            added = true;
                            println!("{} 已为节点 {} 添加标签: {}", "✓".green(), node.bold(), labels);
                        }
                    }
                }
            }

            if !added {
                return Err(anyhow!("未找到集群 {} 中的节点 {}", cluster, node));
            }
        }
        ConfigAction::Remove { name } => {
            if app_config.remove_cluster(name) {
                println!("{} 集群配置已删除: {}", "✓".green(), name.bold());
            } else {
                return Err(anyhow!("未找到集群: {}", name));
            }
        }
        ConfigAction::Validate => match app_config.validate() {
            Ok(_) => {
                println!("{} 配置文件验证通过", "✓".green());
                println!("集群数量: {}", app_config.clusters.len());
                let total_nodes: usize = app_config.clusters.iter().map(|c| c.nodes.len()).sum();
                println!("节点总数: {}", total_nodes);
            }
            Err(e) => {
                return Err(anyhow!("配置验证失败: {}", e));
            }
        },
        ConfigAction::Init => {
            *app_config = AppConfig::generate_template();
            println!(
                "{} 示例配置已生成到: {}",
                "✓".green(),
                config_path.cyan()
            );
            println!("请编辑配置文件添加实际的集群节点信息");
        }
    }
    Ok(())
}

fn print_config_list(app_config: &AppConfig) {
    println!("\n{}", "=== 集群配置列表 ===".bold().yellow());
    for cluster in &app_config.clusters {
        let cluster_type = match cluster.cluster_type {
            ClusterType::Docker => "Docker".cyan(),
            ClusterType::Kubernetes => "K8s".blue(),
            ClusterType::DockerSwarm => "Swarm".green(),
        };

        println!(
            "\n{} [{}] {} - {}",
            "集群:".bold(),
            cluster_type,
            cluster.name.bold(),
            cluster.description
        );
        println!("  {:<15} {:<20} {:<8} {:<15} {:<15} {:<10}", "节点名称", "主机地址", "端口", "用户", "分组", "状态");
        println!("  {}", "-".repeat(100));

        for node in &cluster.nodes {
            let status = if node.enabled {
                "启用".green()
            } else {
                "禁用".red()
            };
            let groups = if node.groups.is_empty() {
                "-".to_string()
            } else {
                node.groups.join(",")
            };
            println!(
                "  {:<15} {:<20} {:<8} {:<15} {:<15} {}",
                node.name,
                node.host,
                node.port,
                node.user,
                groups,
                status
            );
            if !node.labels.is_empty() {
                let labels: Vec<String> = node.labels.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
                println!("    {}", labels.join(" ").bright_black());
            }
        }
    }
}

async fn handle_connect_command(
    app_config: &AppConfig,
    cli: &Cli,
    storage: Option<&Storage>,
    timeout: u64,
) -> Result<()> {
    let nodes = get_filtered_nodes(app_config, cli);

    if nodes.is_empty() {
        return Err(anyhow!("未找到匹配的节点，请检查配置和筛选条件"));
    }

    println!(
        "{} 正在测试 {} 个节点的连接...",
        "→".cyan(),
        nodes.len().to_string().cyan()
    );

    let start_time = Utc::now();
    let retry_config = get_retry_config(cli);

    let (results, success_count) = run_concurrent_tasks(
        nodes.clone(),
        nodes.len(),
        move |_cluster_name, node| {
            let node_clone = node.clone();
            let retry_config = retry_config;
            async move {
                let desc = format!("连接 {}", node.name);
                match with_retry(retry_config, desc, move |_| {
                    let n = node_clone.clone();
                    async move {
                        let r = cluster_connection::test_connection("cluster", &n, timeout).await;
                        Ok(r)
                    }
                }).await {
                    Ok(r) => Ok(r),
                    Err(e) => {
                        error!("连接任务失败: {}", e);
                        Ok(ConnectionResult::default())
                    }
                }
            }
        },
    ).await;

    if cli.output == "table" {
        cluster_connection::print_connection_results(&results);
    } else {
        println!("{}", format_output(&results, &cli.output)?);
    }

    if let Some(storage) = storage {
        let mut builder = InspectionDataBuilder::new(nodes);
        builder.success_count = success_count;
        builder.connection_results = Some(results.clone());

        let record = generate_inspection_record(
            TaskType::Connect,
            cli,
            start_time,
            &builder,
            None,
        );

        let data = InspectionData {
            record,
            connection_results: Some(results),
            container_statuses: None,
            resource_stats: None,
            diagnostics: None,
        };

        if let Err(e) = storage.save_inspection(&data) {
            tracing::warn!("保存巡检记录失败: {}", e);
        } else {
            println!("{} 巡检记录已保存: {}", "✓".green(), data.record.id);
        }
    }

    Ok(())
}

async fn handle_status_command(
    app_config: &AppConfig,
    cli: &Cli,
    storage: Option<&Storage>,
    only_issues: bool,
    filter: &str,
) -> Result<()> {
    let nodes = get_filtered_nodes(app_config, cli);

    if nodes.is_empty() {
        return Err(anyhow!("未找到匹配的节点，请检查配置和筛选条件"));
    }

    println!(
        "{} 正在巡检 {} 个节点的容器状态...",
        "→".cyan(),
        nodes.len().to_string().cyan()
    );

    let start_time = Utc::now();
    let retry_config = get_retry_config(cli);
    let filter_owned = filter.to_string();

    let (results, success_count) = run_concurrent_tasks(
        nodes.clone(),
        nodes.len(),
        move |cluster_name, node| {
            let cluster_name = cluster_name.clone();
            let node_clone = node.clone();
            let filter = filter_owned.clone();
            let retry_config = retry_config;
            async move {
                let desc = format!("巡检 {}", node.name);
                match with_retry(retry_config, desc, move |_| {
                    let cluster = cluster_name.clone();
                    let n = node_clone.clone();
                    let f = filter.clone();
                    async move {
                        container_status::inspect_node_containers(&cluster, &n, n.timeout, only_issues, &f).await
                    }
                }).await {
                    Ok(r) => Ok(r),
                    Err(e) => {
                        error!("容器巡检任务失败: {}", e);
                        Ok(NodeContainerStatus::default())
                    }
                }
            }
        },
    ).await;

    if cli.output == "table" {
        container_status::print_container_status(&results, only_issues);
    } else {
        println!("{}", format_output(&results, &cli.output)?);
    }

    if let Some(storage) = storage {
        let mut builder = InspectionDataBuilder::new(nodes);
        builder.success_count = success_count;
        builder.container_statuses = Some(results.clone());

        let record = generate_inspection_record(
            TaskType::Status,
            cli,
            start_time,
            &builder,
            None,
        );

        let data = InspectionData {
            record,
            connection_results: None,
            container_statuses: Some(results),
            resource_stats: None,
            diagnostics: None,
        };

        if let Err(e) = storage.save_inspection(&data) {
            tracing::warn!("保存巡检记录失败: {}", e);
        } else {
            println!("{} 巡检记录已保存: {}", "✓".green(), data.record.id);
        }
    }

    Ok(())
}

async fn handle_resource_command(
    app_config: &AppConfig,
    cli: &Cli,
    storage: Option<&Storage>,
    resource_type: &str,
    sort: bool,
    top: usize,
) -> Result<()> {
    let nodes = get_filtered_nodes(app_config, cli);

    if nodes.is_empty() {
        return Err(anyhow!("未找到匹配的节点，请检查配置和筛选条件"));
    }

    println!(
        "{} 正在收集 {} 个节点的资源统计...",
        "→".cyan(),
        nodes.len().to_string().cyan()
    );

    let start_time = Utc::now();
    let retry_config = get_retry_config(cli);
    let resource_type_owned = resource_type.to_string();

    let (results, success_count) = run_concurrent_tasks(
        nodes.clone(),
        nodes.len(),
        move |cluster_name, node| {
            let cluster_name = cluster_name.clone();
            let node_clone = node.clone();
            let resource_type = resource_type_owned.clone();
            let retry_config = retry_config;
            async move {
                let desc = format!("资源统计 {}", node.name);
                match with_retry(retry_config, desc, move |_| {
                    let cluster = cluster_name.clone();
                    let n = node_clone.clone();
                    let rt = resource_type.clone();
                    async move {
                        resource_stats::collect_node_stats(&cluster, &n, n.timeout, &rt).await
                    }
                }).await {
                    Ok(r) => Ok(r),
                    Err(e) => {
                        error!("资源统计任务失败: {}", e);
                        Ok(NodeResourceStats::default())
                    }
                }
            }
        },
    ).await;

    if cli.output == "table" {
        resource_stats::print_resource_stats(&results, resource_type, sort, top);
    } else {
        println!("{}", format_output(&results, &cli.output)?);
    }

    if let Some(storage) = storage {
        let mut builder = InspectionDataBuilder::new(nodes);
        builder.success_count = success_count;
        builder.resource_stats = Some(results.clone());

        let record = generate_inspection_record(
            TaskType::Resource,
            cli,
            start_time,
            &builder,
            None,
        );

        let data = InspectionData {
            record,
            connection_results: None,
            container_statuses: None,
            resource_stats: Some(results),
            diagnostics: None,
        };

        if let Err(e) = storage.save_inspection(&data) {
            tracing::warn!("保存巡检记录失败: {}", e);
        } else {
            println!("{} 巡检记录已保存: {}", "✓".green(), data.record.id);
        }
    }

    Ok(())
}

async fn handle_logs_command(
    app_config: &AppConfig,
    cli: &Cli,
    storage: Option<&Storage>,
    container: &str,
    tail: u64,
    output_file: Option<String>,
    _follow: bool,
    since: Option<String>,
) -> Result<()> {
    let nodes = get_filtered_nodes(app_config, cli);

    if nodes.is_empty() {
        return Err(anyhow!("未找到匹配的节点，请检查配置和筛选条件"));
    }

    let options = log_extract::LogOptions {
        container: container.to_string(),
        tail,
        follow: false,
        since,
        output_file,
        highlight_keywords: vec!["ERROR".to_string(), "WARN".to_string(), "FATAL".to_string()],
    };

    println!(
        "{} 正在提取容器 {} 的日志...",
        "→".cyan(),
        container.cyan()
    );

    let start_time = Utc::now();

    for (cluster_name, node) in &nodes {
        match log_extract::extract_container_logs(cluster_name, node, container, &options, node.timeout).await {
            Ok(result) => {
                if result.error.is_none() && !result.entries.is_empty() {
                    if cli.output == "table" {
                        log_extract::print_logs(&result, tail);
                    } else {
                        println!("{}", format_output(&result, &cli.output)?);
                    }

                    let patterns = log_extract::analyze_log_patterns(&result);
                    if !patterns.is_empty() {
                        println!("\n{}", "=== TOP 10 日志模式 ===".bold().yellow());
                        for (pattern, count) in patterns {
                            println!("  [{}] {}", count.to_string().cyan(), pattern);
                        }
                    }

                    if let Some(storage) = storage {
                        let target_nodes = vec![(cluster_name.clone(), node.clone())];
                        let mut builder = InspectionDataBuilder::new(target_nodes);
                        builder.success_count = 1;

                        let record = generate_inspection_record(
                            TaskType::Logs,
                            cli,
                            start_time,
                            &builder,
                            None,
                        );

                        let data = InspectionData {
                            record,
                            connection_results: None,
                            container_statuses: None,
                            resource_stats: None,
                            diagnostics: None,
                        };

                        if let Err(e) = storage.save_inspection(&data) {
                            tracing::warn!("保存巡检记录失败: {}", e);
                        } else {
                            println!("{} 巡检记录已保存: {}", "✓".green(), data.record.id);
                        }
                    }

                    return Ok(());
                }
            }
            Err(e) => {
                tracing::debug!("节点 {} 未找到容器: {}", node.name, e);
            }
        }
    }

    Err(anyhow!(
        "未找到容器 {}，请确认容器名称或ID是否正确",
        container
    ))
}

async fn handle_diagnose_command(
    app_config: &AppConfig,
    cli: &Cli,
    storage: Option<&Storage>,
    diag_type: &str,
    verbose: bool,
    auto_fix: bool,
) -> Result<()> {
    let nodes = get_filtered_nodes(app_config, cli);

    if nodes.is_empty() {
        return Err(anyhow!("未找到匹配的节点，请检查配置和筛选条件"));
    }

    println!(
        "{} 正在对 {} 个节点进行{}故障诊断...",
        "→".cyan(),
        nodes.len().to_string().cyan(),
        diag_type
    );

    let start_time = Utc::now();
    let retry_config = get_retry_config(cli);
    let diag_type_owned = diag_type.to_string();

    let (results, success_count) = run_concurrent_tasks(
        nodes.clone(),
        nodes.len(),
        move |cluster_name, node| {
            let cluster_name = cluster_name.clone();
            let node_clone = node.clone();
            let diag_type = diag_type_owned.clone();
            let retry_config = retry_config;
            async move {
                let desc = format!("诊断 {}", node.name);
                match with_retry(retry_config, desc, move |_| {
                    let cluster = cluster_name.clone();
                    let n = node_clone.clone();
                    let dt = diag_type.clone();
                    async move {
                        diagnostics::diagnose_node(&cluster, &n, &dt, auto_fix, n.timeout).await
                    }
                }).await {
                    Ok(r) => Ok(r),
                    Err(e) => {
                        error!("诊断任务失败: {}", e);
                        Ok(NodeDiagnostics::default())
                    }
                }
            }
        },
    ).await;

    if cli.output == "table" {
        diagnostics::print_diagnostics(&results, verbose);
    } else {
        println!("{}", format_output(&results, &cli.output)?);
    }

    if let Some(storage) = storage {
        let mut builder = InspectionDataBuilder::new(nodes);
        builder.success_count = success_count;
        builder.diagnostics = Some(results.clone());

        let record = generate_inspection_record(
            TaskType::Diagnose,
            cli,
            start_time,
            &builder,
            None,
        );

        let data = InspectionData {
            record,
            connection_results: None,
            container_statuses: None,
            resource_stats: None,
            diagnostics: Some(results),
        };

        if let Err(e) = storage.save_inspection(&data) {
            tracing::warn!("保存巡检记录失败: {}", e);
        } else {
            println!("{} 巡检记录已保存: {}", "✓".green(), data.record.id);
        }
    }

    Ok(())
}

async fn handle_inspect_command(
    app_config: &AppConfig,
    cli: &Cli,
    storage: Option<&Storage>,
    report: Option<String>,
    report_format: String,
    report_title: Option<String>,
) -> Result<()> {
    println!(
        "{}",
        "=== 开始完整巡检流程 ===".bold().yellow()
    );

    let start_time = Utc::now();
    let nodes = get_filtered_nodes(app_config, cli);

    if nodes.is_empty() {
        return Err(anyhow!("未找到匹配的节点，请检查配置和筛选条件"));
    }

    let mut builder = InspectionDataBuilder::new(nodes.clone());

    println!("\n{}", "[1/5] 测试节点连接...".bold());
    let conn_result = handle_connect_command(app_config, cli, None, 10).await;
    if conn_result.is_ok() {
        builder.success_count = builder.success_count.max(nodes.len());
    }

    println!("\n{}", "[2/5] 巡检容器状态...".bold());
    let status_result = handle_status_command(app_config, cli, None, false, "all").await;
    if status_result.is_ok() {
        builder.success_count = builder.success_count.max(nodes.len());
    }

    println!("\n{}", "[3/5] 收集资源统计...".bold());
    let resource_result = handle_resource_command(app_config, cli, None, "all", true, 10).await;
    if resource_result.is_ok() {
        builder.success_count = builder.success_count.max(nodes.len());
    }

    println!("\n{}", "[4/5] 故障诊断分析...".bold());
    let diag_result = handle_diagnose_command(app_config, cli, None, "all", true, false).await;
    if diag_result.is_ok() {
        builder.success_count = builder.success_count.max(nodes.len());
    }

    println!("\n{}", "[5/5] 巡检完成!".bold().green());

    if let Some(storage) = storage {
        let record = generate_inspection_record(
            TaskType::Inspect,
            cli,
            start_time,
            &builder,
            None,
        );

        let data = InspectionData {
            record,
            connection_results: None,
            container_statuses: None,
            resource_stats: None,
            diagnostics: None,
        };

        let record_id = match storage.save_inspection(&data) {
            Ok(id) => {
                println!("{} 巡检记录已保存: {}", "✓".green(), id);
                Some(id)
            }
            Err(e) => {
                tracing::warn!("保存巡检记录失败: {}", e);
                None
            }
        };

        if let Some(output) = report.or_else(|| Some(format!("reports/{}", chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()))) {
            let fmt = match report_format.parse::<report::ReportFormat>() {
                Ok(f) => f,
                Err(_) => report::ReportFormat::Markdown,
            };
            let title = report_title.unwrap_or_else(|| format!("完整巡检报告 - {}", chrono::Local::now().format("%Y-%m-%d")));
            let generator = report::ReportGenerator::new(&title, fmt);

            match storage.get_latest_record()? {
                Some(data) => {
                    match generator.generate(&data, &output) {
                        Ok(files) => {
                            report::print_generated_files(&files);
                        }
                        Err(e) => {
                            tracing::warn!("生成报告失败: {}", e);
                        }
                    }
                }
                None => {
                    tracing::warn!("无巡检记录用于生成报告");
                }
            }

            let _ = record_id;
        }
    }

    Ok(())
}

async fn handle_history_command(
    action: &HistoryAction,
    cli: &Cli,
    storage: Option<&Storage>,
) -> Result<()> {
    let storage = match storage {
        Some(s) => s,
        None => {
            return Err(anyhow!("存储功能未启用，请移除 --no-store 参数"));
        }
    };

    match action {
        HistoryAction::List { limit, task_type, cluster } => {
            let records = storage.list_records(*limit, task_type.as_deref(), cluster.as_deref())?;

            if cli.output == "table" {
                storage::print_record_list(&records);
            } else {
                println!("{}", format_output(&records, &cli.output)?);
            }
        }
        HistoryAction::Show { id } => {
            match storage.get_record(id)? {
                Some(data) => {
                    if cli.output == "table" {
                        println!("\n{}", "=== 巡检记录详情 ===".bold().yellow());
                        println!("ID: {}", data.record.id);
                        println!("类型: {:?}", data.record.task_type);
                        println!("时间: {} -> {}",
                            data.record.start_time.format("%Y-%m-%d %H:%M:%S"),
                            data.record.end_time.format("%Y-%m-%d %H:%M:%S")
                        );
                        println!("耗时: {}ms", data.record.duration_ms);
                        println!("节点: {}/{} 成功/总数",
                            data.record.success_nodes, data.record.total_nodes
                        );
                        println!("\n{}", "=== 汇总 ===".bold());
                        let s = &data.record.summary;
                        if let Some(v) = s.total_containers { println!("容器总数: {}", v); }
                        if let Some(v) = s.running_containers { println!("运行中: {}", v); }
                        if let Some(v) = s.unhealthy_containers { println!("异常容器: {}", v); }
                        if let Some(v) = s.avg_cpu_percent { println!("平均CPU: {:.1}%", v); }
                        if let Some(v) = s.avg_memory_percent { println!("平均内存: {:.1}%", v); }
                        if let Some(v) = s.critical_issues { println!("严重问题: {}", v); }
                        if let Some(v) = s.warning_issues { println!("警告问题: {}", v); }
                        if let Some(v) = s.disk_high_usage { println!("高磁盘占用: {} 个", v); }

                        if !data.record.target_clusters.is_empty() {
                            println!("\n目标集群: {}", data.record.target_clusters.join(", "));
                        }
                        if !data.record.target_nodes.is_empty() {
                            println!("目标节点: {}", data.record.target_nodes.join(", "));
                        }
                    } else {
                        println!("{}", format_output(&data, &cli.output)?);
                    }
                }
                None => {
                    return Err(anyhow!("未找到巡检记录: {}", id));
                }
            }
        }
        HistoryAction::Delete { id, all, older_than_days } => {
            if *all {
                let count = storage.delete_all()?;
                println!("{} 已删除 {} 条巡检记录", "✓".green(), count);
            } else if let Some(days) = older_than_days {
                let count = storage.delete_older_than(*days)?;
                println!("{} 已删除 {} 条 {} 天前的巡检记录", "✓".green(), count, days);
            } else {
                if storage.delete_record(id)? {
                    println!("{} 已删除巡检记录: {}", "✓".green(), id);
                } else {
                    return Err(anyhow!("未找到巡检记录: {}", id));
                }
            }
        }
        HistoryAction::Stats => {
            let stats = storage.get_stats()?;
            if cli.output == "table" {
                storage::print_storage_stats(&stats);
            } else {
                println!("{}", format_output(&stats, &cli.output)?);
            }
        }
    }

    Ok(())
}

async fn handle_report_command(
    storage: Option<&Storage>,
    id: Option<String>,
    output: String,
    format: String,
    title: Option<String>,
) -> Result<()> {
    let storage = match storage {
        Some(s) => s,
        None => {
            return Err(anyhow!("存储功能未启用，请移除 --no-store 参数"));
        }
    };

    let data = match id {
        Some(ref id) => match storage.get_record(id)? {
            Some(data) => data,
            None => return Err(anyhow!("未找到巡检记录: {}", id)),
        },
        None => match storage.get_latest_record()? {
            Some(data) => data,
            None => return Err(anyhow!("暂无巡检记录，请先执行巡检命令")),
        },
    };

    let fmt = match format.parse::<report::ReportFormat>() {
        Ok(f) => f,
        Err(_) => report::ReportFormat::Both,
    };

    let report_title = title.unwrap_or_else(|| {
        format!("巡检报告 - {:?} - {}",
            data.record.task_type,
            data.record.start_time.format("%Y-%m-%d %H:%M")
        )
    });

    let generator = report::ReportGenerator::new(&report_title, fmt);
    let files = generator.generate(&data, &output)?;
    report::print_generated_files(&files);

    Ok(())
}

async fn run_concurrent_tasks<F, Fut, T>(
    nodes: Vec<(String, NodeConfig)>,
    total: usize,
    task_fn: F,
) -> (Vec<T>, usize)
where
    F: Fn(String, NodeConfig) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<T>> + Send + 'static,
    T: Default + Send + 'static + Clone,
{
    let pb = ProgressBar::new(total as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{bar:40.cyan/blue}] {pos}/{len} 节点")
            .unwrap()
            .progress_chars("##-"),
    );
    let pb = Arc::new(pb);
    let sem = get_concurrency_semaphore();
    let task_fn = Arc::new(task_fn);

    let mut handles = Vec::new();
    for (cluster_name, node) in nodes {
        let pb_clone = pb.clone();
        let permit = sem.clone();
        let task_fn = task_fn.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit.acquire().await.unwrap();
            let result = task_fn(cluster_name, node).await;
            pb_clone.inc(1);
            result
        }));
    }

    let results: Vec<T> = future::join_all(handles)
        .await
        .into_iter()
        .map(|r| match r {
            Ok(Ok(value)) => value,
            Ok(Err(e)) => {
                tracing::warn!("任务执行失败: {}", e);
                T::default()
            }
            Err(e) => {
                tracing::warn!("任务异常: {}", e);
                T::default()
            }
        })
        .collect();

    pb.finish_and_clear();

    let success_count = results.len();
    (results, success_count)
}
