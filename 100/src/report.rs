use anyhow::{anyhow, Context, Result};
use chrono::Local;
use colored::*;
use humansize::{format_size, DECIMAL};
use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::Path;

use crate::storage::{InspectionData, InspectionRecord};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportFormat {
    Markdown,
    Html,
    Both,
}

impl std::str::FromStr for ReportFormat {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "md" | "markdown" => Ok(ReportFormat::Markdown),
            "html" | "htm" => Ok(ReportFormat::Html),
            "both" | "all" => Ok(ReportFormat::Both),
            _ => Err(anyhow!("不支持的报告格式: {}", s)),
        }
    }
}

pub struct ReportGenerator {
    title: String,
    format: ReportFormat,
}

impl ReportGenerator {
    pub fn new(title: &str, format: ReportFormat) -> Self {
        Self {
            title: title.to_string(),
            format,
        }
    }

    pub fn generate(&self, data: &InspectionData, output_path: &str) -> Result<Vec<String>> {
        let mut generated_files = Vec::new();

        match self.format {
            ReportFormat::Markdown => {
                let path = format!("{}.md", output_path.trim_end_matches(".md"));
                self.generate_markdown(data, &path)?;
                generated_files.push(path);
            }
            ReportFormat::Html => {
                let path = format!("{}.html", output_path.trim_end_matches(".html"));
                self.generate_html(data, &path)?;
                generated_files.push(path);
            }
            ReportFormat::Both => {
                let md_path = format!("{}.md", output_path.trim_end_matches(".md"));
                self.generate_markdown(data, &md_path)?;
                generated_files.push(md_path);

                let html_path = format!("{}.html", output_path.trim_end_matches(".html"));
                self.generate_html(data, &html_path)?;
                generated_files.push(html_path);
            }
        }

        Ok(generated_files)
    }

    fn generate_markdown(&self, data: &InspectionData, output_path: &str) -> Result<()> {
        let path = Path::new(output_path);
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("创建报告目录失败: {}", parent.display()))?;
            }
        }

        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(path)
            .with_context(|| format!("创建报告文件失败: {}", path.display()))?;

        let mut w = BufWriter::new(file);
        let r = &data.record;

        writeln!(w, "# {}", self.title)?;
        writeln!(w)?;
        writeln!(w, "> 生成时间: {}", Local::now().format("%Y-%m-%d %H:%M:%S"))?;
        writeln!(w, "> 任务类型: {:?}", r.task_type)?;
        writeln!(w, "> 报告ID: {}", r.id)?;
        writeln!(w)?;

        writeln!(w, "## 概览")?;
        writeln!(w)?;
        writeln!(w, "| 项目 | 值 |")?;
        writeln!(w, "|------|-----|")?;
        writeln!(w, "| 巡检类型 | {:?} |", r.task_type)?;
        writeln!(w, "| 开始时间 | {} |", r.start_time.format("%Y-%m-%d %H:%M:%S"))?;
        writeln!(w, "| 结束时间 | {} |", r.end_time.format("%Y-%m-%d %H:%M:%S"))?;
        writeln!(w, "| 耗时 | {}ms |", r.duration_ms)?;
        writeln!(w, "| 目标集群 | {} |", r.target_clusters.join(", "))?;
        writeln!(w, "| 目标节点 | {} |", r.target_nodes.join(", "))?;
        writeln!(w, "| 节点总数 | {} |", r.total_nodes)?;
        writeln!(w, "| 成功节点 | {} |", r.success_nodes)?;
        writeln!(w, "| 失败节点 | {} |", r.failed_nodes)?;
        writeln!(w, "| 状态 | {} |", if r.has_errors { "有错误" } else { "正常" })?;
        writeln!(w)?;

        if let Some(err) = &r.error_message {
            writeln!(w, "### 错误信息")?;
            writeln!(w)?;
            writeln!(w, "```")?;
            writeln!(w, "{}", err)?;
            writeln!(w, "```")?;
            writeln!(w)?;
        }

        self.write_summary_md(&mut w, &r.summary)?;
        self.write_filter_md(&mut w, r)?;

        if let Some(results) = &data.connection_results {
            self.write_connection_results_md(&mut w, results)?;
        }

        if let Some(statuses) = &data.container_statuses {
            self.write_container_status_md(&mut w, statuses)?;
        }

        if let Some(stats) = &data.resource_stats {
            self.write_resource_stats_md(&mut w, stats)?;
        }

        if let Some(diags) = &data.diagnostics {
            self.write_diagnostics_md(&mut w, diags)?;
        }

        if !r.parameters.is_empty() {
            writeln!(w, "## 参数")?;
            writeln!(w)?;
            for (k, v) in &r.parameters {
                writeln!(w, "- **{}**: {}", k, v)?;
            }
            writeln!(w)?;
        }

        writeln!(w, "---")?;
        writeln!(w)?;
        writeln!(w, "*本报告由 cinspect 自动生成*")?;

        w.flush().context("刷新报告文件失败")?;

        tracing::info!("Markdown 报告已生成: {}", path.display());
        Ok(())
    }

    fn write_summary_md<W: Write>(&self, w: &mut W, s: &crate::storage::InspectionSummary) -> Result<()> {
        writeln!(w, "## 汇总统计")?;
        writeln!(w)?;

        if s.total_containers.is_some() || s.running_containers.is_some() {
            writeln!(w, "### 容器状态")?;
            writeln!(w)?;
            writeln!(w, "| 指标 | 数值 |")?;
            writeln!(w, "|------|------|")?;
            if let Some(v) = s.total_containers { writeln!(w, "| 容器总数 | {} |", v)?; }
            if let Some(v) = s.running_containers { writeln!(w, "| 运行中 | {} |", v)?; }
            if let Some(v) = s.unhealthy_containers { writeln!(w, "| 异常容器 | {} |", v)?; }
            writeln!(w)?;
        }

        if s.avg_cpu_percent.is_some() || s.avg_memory_percent.is_some() {
            writeln!(w, "### 资源使用")?;
            writeln!(w)?;
            writeln!(w, "| 指标 | 数值 |")?;
            writeln!(w, "|------|------|")?;
            if let Some(v) = s.avg_cpu_percent { writeln!(w, "| 平均CPU使用率 | {:.1}% |", v)?; }
            if let Some(v) = s.avg_memory_percent { writeln!(w, "| 平均内存使用率 | {:.1}% |", v)?; }
            if let Some(v) = s.disk_high_usage { writeln!(w, "| 高磁盘占用分区 | {} 个 |", v)?; }
            writeln!(w)?;
        }

        if s.critical_issues.is_some() || s.warning_issues.is_some() {
            writeln!(w, "### 问题诊断")?;
            writeln!(w)?;
            writeln!(w, "| 严重程度 | 数量 |")?;
            writeln!(w, "|----------|------|")?;
            if let Some(v) = s.critical_issues { writeln!(w, "| 严重问题 | {} |", v)?; }
            if let Some(v) = s.warning_issues { writeln!(w, "| 警告问题 | {} |", v)?; }
            writeln!(w)?;
        }

        Ok(())
    }

    fn write_filter_md<W: Write>(&self, w: &mut W, r: &InspectionRecord) -> Result<()> {
        if !r.groups_filter.is_empty() || !r.labels_filter.is_empty() {
            writeln!(w, "## 筛选条件")?;
            writeln!(w)?;
            if !r.groups_filter.is_empty() {
                writeln!(w, "- **分组**: {}", r.groups_filter.join(", "))?;
            }
            if !r.labels_filter.is_empty() {
                let labels: Vec<String> = r.labels_filter.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
                writeln!(w, "- **标签**: {}", labels.join(", "))?;
            }
            writeln!(w)?;
        }
        Ok(())
    }

    fn write_connection_results_md<W: Write>(
        &self,
        w: &mut W,
        results: &[crate::cluster_connection::ConnectionResult],
    ) -> Result<()> {
        writeln!(w, "## 节点连接测试")?;
        writeln!(w)?;
        writeln!(w, "| 集群 | 节点 | 地址 | 状态 | 延迟(ms) | 消息 |")?;
        writeln!(w, "|------|------|------|------|----------|------|")?;
        for r in results {
            let status = match &r.status {
                crate::cluster_connection::ConnectionStatus::Connected => "✓ 已连接",
                crate::cluster_connection::ConnectionStatus::Disconnected => "⚠ 已断开",
                crate::cluster_connection::ConnectionStatus::Failed(_) => "✗ 失败",
            };
            let latency = r.latency_ms.map(|l| l.to_string()).unwrap_or_else(|| "-".to_string());
            writeln!(
                w,
                "| {} | {} | {} | {} | {} | {} |",
                r.cluster_name, r.node_name, r.host, status, latency, r.message
            )?;
        }
        writeln!(w)?;
        Ok(())
    }

    fn write_container_status_md<W: Write>(
        &self,
        w: &mut W,
        statuses: &[crate::container_status::NodeContainerStatus],
    ) -> Result<()> {
        writeln!(w, "## 容器状态巡检")?;
        writeln!(w)?;

        for s in statuses {
            writeln!(w, "### [{}] {} ({})", s.cluster_name, s.node_name, s.host)?;
            writeln!(w)?;

            if let Some(err) = &s.error {
                writeln!(w, "**错误**: {}", err)?;
                writeln!(w)?;
                continue;
            }

            writeln!(
                w,
                "总计: {} 个容器 | {} 运行中 | {} 已停止 | {} 异常",
                s.total_containers, s.running_count, s.stopped_count, s.unhealthy_count
            )?;
            writeln!(w)?;

            if !s.containers.is_empty() {
                writeln!(w, "| 容器ID | 名称 | 镜像 | 状态 | 重启次数 | 描述 |")?;
                writeln!(w, "|--------|------|------|------|----------|------|")?;
                for c in &s.containers {
                    writeln!(
                        w,
                        "| {} | {} | {} | {:?} | {} | {} |",
                        c.id.chars().take(12).collect::<String>(),
                        c.name,
                        c.image,
                        c.state,
                        c.restart_count,
                        c.status,
                    )?;
                }
                writeln!(w)?;
            }
        }
        Ok(())
    }

    fn write_resource_stats_md<W: Write>(
        &self,
        w: &mut W,
        stats: &[crate::resource_stats::NodeResourceStats],
    ) -> Result<()> {
        writeln!(w, "## 资源占用统计")?;
        writeln!(w)?;

        for s in stats {
            writeln!(w, "### [{}] {} ({})", s.cluster_name, s.node_name, s.host)?;
            writeln!(w)?;

            if let Some(err) = &s.error {
                writeln!(w, "**错误**: {}", err)?;
                writeln!(w)?;
                continue;
            }

            writeln!(
                w,
                "CPU: {:.1}% ({} 核) | 内存: {:.1}% ({}/{}) | Swap: {}/{}",
                s.cpu_total_percent,
                s.cpu_cores,
                s.memory_percent,
                format_size(s.memory_used_bytes, DECIMAL),
                format_size(s.memory_total_bytes, DECIMAL),
                format_size(s.swap_used_bytes, DECIMAL),
                format_size(s.swap_total_bytes, DECIMAL)
            )?;
            writeln!(w)?;

            if !s.disk_usage.is_empty() {
                writeln!(w, "#### 磁盘使用")?;
                writeln!(w)?;
                writeln!(w, "| 文件系统 | 挂载点 | 总计 | 已用 | 可用 | 使用率 |")?;
                writeln!(w, "|----------|--------|------|------|------|--------|")?;
                for d in &s.disk_usage {
                    writeln!(
                        w,
                        "| {} | {} | {} | {} | {} | {:.1}% |",
                        d.filesystem,
                        d.mount_point,
                        format_size(d.total_bytes, DECIMAL),
                        format_size(d.used_bytes, DECIMAL),
                        format_size(d.available_bytes, DECIMAL),
                        d.used_percent
                    )?;
                }
                writeln!(w)?;
            }

            if !s.container_stats.is_empty() {
                writeln!(w, "#### 容器资源 TOP 10")?;
                writeln!(w)?;
                writeln!(w, "| 容器ID | 名称 | CPU % | 内存使用 | 内存 % |")?;
                writeln!(w, "|--------|------|-------|----------|--------|")?;
                for cs in s.container_stats.iter().take(10) {
                    writeln!(
                        w,
                        "| {} | {} | {:.1}% | {} | {:.1}% |",
                        cs.container_id.chars().take(12).collect::<String>(),
                        cs.container_name.chars().take(20).collect::<String>(),
                        cs.cpu_percent,
                        format_size(cs.memory_usage_bytes, DECIMAL),
                        cs.memory_percent
                    )?;
                }
                writeln!(w)?;
            }
        }
        Ok(())
    }

    fn write_diagnostics_md<W: Write>(
        &self,
        w: &mut W,
        diags: &[crate::diagnostics::NodeDiagnostics],
    ) -> Result<()> {
        writeln!(w, "## 故障诊断")?;
        writeln!(w)?;

        for d in diags {
            writeln!(w, "### [{}] {} ({})", d.cluster_name, d.node_name, d.host)?;
            writeln!(w)?;

            if let Some(err) = &d.error {
                writeln!(w, "**错误**: {}", err)?;
                writeln!(w)?;
                continue;
            }

            if d.issues.is_empty() {
                writeln!(w, "✓ 未发现问题")?;
                writeln!(w)?;
                continue;
            }

            writeln!(w, "| ID | 严重程度 | 分类 | 标题 | 描述 | 修复建议 | 可自动修复 |")?;
            writeln!(w, "|----|----------|------|------|------|----------|------------|")?;
            for issue in &d.issues {
                let severity = match issue.severity {
                    crate::diagnostics::Severity::Info => "信息",
                    crate::diagnostics::Severity::Warning => "警告",
                    crate::diagnostics::Severity::Critical => "严重",
                    crate::diagnostics::Severity::Fatal => "致命",
                };
                let fixable = if issue.auto_fixable { "是" } else { "否" };
                writeln!(
                    w,
                    "| {} | {} | {} | {} | {} | {} | {} |",
                    issue.id, severity, issue.category, issue.title, issue.description, issue.recommendation, fixable
                )?;
            }
            writeln!(w)?;
        }
        Ok(())
    }

    fn generate_html(&self, data: &InspectionData, output_path: &str) -> Result<()> {
        let path = Path::new(output_path);
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("创建报告目录失败: {}", parent.display()))?;
            }
        }

        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(path)
            .with_context(|| format!("创建报告文件失败: {}", path.display()))?;

        let mut w = BufWriter::new(file);
        let r = &data.record;

        writeln!(w, "<!DOCTYPE html>")?;
        writeln!(w, "<html lang=\"zh-CN\">")?;
        writeln!(w, "<head>")?;
        writeln!(w, "  <meta charset=\"UTF-8\">")?;
        writeln!(w, "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">")?;
        writeln!(w, "  <title>{}</title>", self.title)?;
        writeln!(w, "  <style>")?;
        writeln!(w, "    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; color: #333; }}")?;
        writeln!(w, "    .container {{ max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}")?;
        writeln!(w, "    h1 {{ color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }}")?;
        writeln!(w, "    h2 {{ color: #34495e; margin-top: 30px; border-left: 4px solid #3498db; padding-left: 15px; }}")?;
        writeln!(w, "    h3 {{ color: #555; }}")?;
        writeln!(w, "    table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}")?;
        writeln!(w, "    th {{ background: #3498db; color: white; padding: 10px; text-align: left; }}")?;
        writeln!(w, "    td {{ padding: 8px 12px; border-bottom: 1px solid #ddd; }}")?;
        writeln!(w, "    tr:nth-child(even) {{ background: #f8f9fa; }}")?;
        writeln!(w, "    tr:hover {{ background: #e9ecef; }}")?;
        writeln!(w, "    .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }}")?;
        writeln!(w, "    .summary-card {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }}")?;
        writeln!(w, "    .summary-card .label {{ font-size: 12px; opacity: 0.9; }}")?;
        writeln!(w, "    .summary-card .value {{ font-size: 24px; font-weight: bold; margin-top: 5px; }}")?;
        writeln!(w, "    .error {{ color: #e74c3c; }}")?;
        writeln!(w, "    .success {{ color: #27ae60; }}")?;
        writeln!(w, "    .warning {{ color: #f39c12; }}")?;
        writeln!(w, "    .critical {{ background: #ffebee !important; }}")?;
        writeln!(w, "    pre {{ background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 6px; overflow-x: auto; }}")?;
        writeln!(w, "    .meta {{ background: #ecf0f1; padding: 15px; border-radius: 6px; margin: 20px 0; }}")?;
        writeln!(w, "    .progress {{ background: #e0e0e0; border-radius: 10px; overflow: hidden; height: 10px; margin: 5px 0; }}")?;
        writeln!(w, "    .progress-bar {{ height: 100%; transition: width 0.3s; }}")?;
        writeln!(w, "    .progress-bar.good {{ background: #27ae60; }}")?;
        writeln!(w, "    .progress-bar.warning {{ background: #f39c12; }}")?;
        writeln!(w, "    .progress-bar.danger {{ background: #e74c3c; }}")?;
        writeln!(w, "  </style>")?;
        writeln!(w, "</head>")?;
        writeln!(w, "<body>")?;
        writeln!(w, "  <div class=\"container\">")?;
        writeln!(w, "    <h1>{}</h1>", self.title)?;
        writeln!(w)?;
        writeln!(w, "    <div class=\"meta\">")?;
        writeln!(w, "      <p><strong>生成时间:</strong> {}</p>", Local::now().format("%Y-%m-%d %H:%M:%S"))?;
        writeln!(w, "      <p><strong>任务类型:</strong> {:?}</p>", r.task_type)?;
        writeln!(w, "      <p><strong>报告ID:</strong> {}</p>", r.id)?;
        writeln!(w, "    </div>")?;
        writeln!(w)?;

        writeln!(w, "    <h2>概览</h2>")?;
        writeln!(w, "    <div class=\"summary-grid\">")?;
        writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">节点总数</div><div class=\"value\">{}</div></div>", r.total_nodes)?;
        writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">成功节点</div><div class=\"value\">{}</div></div>", r.success_nodes)?;
        writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">失败节点</div><div class=\"value\">{}</div></div>", r.failed_nodes)?;
        writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">耗时</div><div class=\"value\">{}ms</div></div>", r.duration_ms)?;
        writeln!(w, "    </div>")?;
        writeln!(w)?;

        if let Some(total) = r.summary.total_containers {
            writeln!(w, "    <div class=\"summary-grid\">")?;
            if let Some(v) = r.summary.running_containers {
                writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">容器总数</div><div class=\"value\">{}</div></div>", total)?;
                writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">运行中</div><div class=\"value\">{}</div></div>", v)?;
            }
            if let Some(v) = r.summary.unhealthy_containers {
                writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">异常容器</div><div class=\"value {}\">{}</div></div>", if v > 0 { "error" } else { "success" }, v)?;
            }
            if let Some(v) = r.summary.avg_cpu_percent {
                let cls = if v > 80.0 { "danger" } else if v > 60.0 { "warning" } else { "good" };
                writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">平均CPU</div><div class=\"value\">{:.1}%</div><div class=\"progress\"><div class=\"progress-bar {}\" style=\"width:{:.0}%\"></div></div></div>", v, cls, v)?;
            }
            if let Some(v) = r.summary.avg_memory_percent {
                let cls = if v > 80.0 { "danger" } else if v > 60.0 { "warning" } else { "good" };
                writeln!(w, "      <div class=\"summary-card\"><div class=\"label\">平均内存</div><div class=\"value\">{:.1}%</div><div class=\"progress\"><div class=\"progress-bar {}\" style=\"width:{:.0}%\"></div></div></div>", v, cls, v)?;
            }
            writeln!(w, "    </div>")?;
            writeln!(w)?;
        }

        if let Some(err) = &r.error_message {
            writeln!(w, "    <h3 class=\"error\">错误信息</h3>")?;
            writeln!(w, "    <pre>{}</pre>", err)?;
            writeln!(w)?;
        }

        if let Some(results) = &data.connection_results {
            self.write_connection_results_html(&mut w, results)?;
        }

        if let Some(statuses) = &data.container_statuses {
            self.write_container_status_html(&mut w, statuses)?;
        }

        if let Some(stats) = &data.resource_stats {
            self.write_resource_stats_html(&mut w, stats)?;
        }

        if let Some(diags) = &data.diagnostics {
            self.write_diagnostics_html(&mut w, diags)?;
        }

        writeln!(w, "    <hr>")?;
        writeln!(w, "    <p style=\"color: #777; text-align: center; margin-top: 30px;\"><em>本报告由 cinspect 自动生成</em></p>")?;
        writeln!(w, "  </div>")?;
        writeln!(w, "</body>")?;
        writeln!(w, "</html>")?;

        w.flush().context("刷新报告文件失败")?;
        tracing::info!("HTML 报告已生成: {}", path.display());
        Ok(())
    }

    fn write_connection_results_html<W: Write>(
        &self,
        w: &mut W,
        results: &[crate::cluster_connection::ConnectionResult],
    ) -> Result<()> {
        writeln!(w, "    <h2>节点连接测试</h2>")?;
        writeln!(w, "    <table>")?;
        writeln!(w, "      <tr><th>集群</th><th>节点</th><th>地址</th><th>状态</th><th>延迟(ms)</th><th>消息</th></tr>")?;
        for r in results {
            let (cls, status) = match &r.status {
                crate::cluster_connection::ConnectionStatus::Connected => ("success", "✓ 已连接"),
                crate::cluster_connection::ConnectionStatus::Disconnected => ("warning", "⚠ 已断开"),
                crate::cluster_connection::ConnectionStatus::Failed(_) => ("error", "✗ 失败"),
            };
            let latency = r.latency_ms.map(|l| l.to_string()).unwrap_or_else(|| "-".to_string());
            writeln!(
                w,
                "      <tr><td>{}</td><td>{}</td><td>{}</td><td class=\"{}\">{}</td><td>{}</td><td>{}</td></tr>",
                r.cluster_name, r.node_name, r.host, cls, status, latency, r.message
            )?;
        }
        writeln!(w, "    </table>")?;
        Ok(())
    }

    fn write_container_status_html<W: Write>(
        &self,
        w: &mut W,
        statuses: &[crate::container_status::NodeContainerStatus],
    ) -> Result<()> {
        writeln!(w, "    <h2>容器状态巡检</h2>")?;

        for s in statuses {
            writeln!(w, "    <h3>[{}] {} ({})</h3>", s.cluster_name, s.node_name, s.host)?;

            if let Some(err) = &s.error {
                writeln!(w, "    <p class=\"error\">错误: {}</p>", err)?;
                continue;
            }

            writeln!(
                w,
                "    <p>总计: <strong>{}</strong> 个容器 | <strong class=\"success\">{}</strong> 运行中 | <strong>{}</strong> 已停止 | <strong class=\"error\">{}</strong> 异常</p>",
                s.total_containers, s.running_count, s.stopped_count, s.unhealthy_count
            )?;

            if !s.containers.is_empty() {
                writeln!(w, "    <table>")?;
                writeln!(w, "      <tr><th>容器ID</th><th>名称</th><th>镜像</th><th>状态</th><th>重启次数</th><th>描述</th></tr>")?;
                for c in &s.containers {
                    let row_cls = if !c.is_healthy { "critical" } else { "" };
                    writeln!(
                        w,
                        "      <tr class=\"{}\"><td>{}</td><td>{}</td><td>{}</td><td>{:?}</td><td>{}</td><td>{}</td></tr>",
                        row_cls,
                        c.id.chars().take(12).collect::<String>(),
                        c.name,
                        c.image,
                        c.state,
                        c.restart_count,
                        c.status
                    )?;
                }
                writeln!(w, "    </table>")?;
            }
        }
        Ok(())
    }

    fn write_resource_stats_html<W: Write>(
        &self,
        w: &mut W,
        stats: &[crate::resource_stats::NodeResourceStats],
    ) -> Result<()> {
        writeln!(w, "    <h2>资源占用统计</h2>")?;

        for s in stats {
            writeln!(w, "    <h3>[{}] {} ({})</h3>", s.cluster_name, s.node_name, s.host)?;

            if let Some(err) = &s.error {
                writeln!(w, "    <p class=\"error\">错误: {}</p>", err)?;
                continue;
            }

            writeln!(
                w,
                "    <p>CPU: <strong>{:.1}%</strong> ({} 核) | 内存: <strong>{:.1}%</strong> ({}/{}) | Swap: {}/{}</p>",
                s.cpu_total_percent,
                s.cpu_cores,
                s.memory_percent,
                format_size(s.memory_used_bytes, DECIMAL),
                format_size(s.memory_total_bytes, DECIMAL),
                format_size(s.swap_used_bytes, DECIMAL),
                format_size(s.swap_total_bytes, DECIMAL)
            )?;

            if !s.disk_usage.is_empty() {
                writeln!(w, "    <h4>磁盘使用</h4>")?;
                writeln!(w, "    <table>")?;
                writeln!(w, "      <tr><th>文件系统</th><th>挂载点</th><th>总计</th><th>已用</th><th>可用</th><th>使用率</th></tr>")?;
                for d in &s.disk_usage {
                    let cls = if d.used_percent > 80.0 { "danger" } else if d.used_percent > 60.0 { "warning" } else { "good" };
                    writeln!(
                        w,
                        "      <tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td><div class=\"progress\"><div class=\"progress-bar {}\" style=\"width:{:.0}%\"></div></div>{:.1}%</td></tr>",
                        d.filesystem,
                        d.mount_point,
                        format_size(d.total_bytes, DECIMAL),
                        format_size(d.used_bytes, DECIMAL),
                        format_size(d.available_bytes, DECIMAL),
                        cls, d.used_percent, d.used_percent
                    )?;
                }
                writeln!(w, "    </table>")?;
            }

            if !s.container_stats.is_empty() {
                writeln!(w, "    <h4>容器资源 TOP 10</h4>")?;
                writeln!(w, "    <table>")?;
                writeln!(w, "      <tr><th>容器ID</th><th>名称</th><th>CPU %</th><th>内存使用</th><th>内存 %</th></tr>")?;
                for cs in s.container_stats.iter().take(10) {
                    writeln!(
                        w,
                        "      <tr><td>{}</td><td>{}</td><td>{:.1}%</td><td>{}</td><td>{:.1}%</td></tr>",
                        cs.container_id.chars().take(12).collect::<String>(),
                        cs.container_name.chars().take(20).collect::<String>(),
                        cs.cpu_percent,
                        format_size(cs.memory_usage_bytes, DECIMAL),
                        cs.memory_percent
                    )?;
                }
                writeln!(w, "    </table>")?;
            }
        }
        Ok(())
    }

    fn write_diagnostics_html<W: Write>(
        &self,
        w: &mut W,
        diags: &[crate::diagnostics::NodeDiagnostics],
    ) -> Result<()> {
        writeln!(w, "    <h2>故障诊断</h2>")?;

        for d in diags {
            writeln!(w, "    <h3>[{}] {} ({})</h3>", d.cluster_name, d.node_name, d.host)?;

            if let Some(err) = &d.error {
                writeln!(w, "    <p class=\"error\">错误: {}</p>", err)?;
                continue;
            }

            if d.issues.is_empty() {
                writeln!(w, "    <p class=\"success\">✓ 未发现问题</p>")?;
                continue;
            }

            writeln!(w, "    <table>")?;
            writeln!(w, "      <tr><th>ID</th><th>严重程度</th><th>分类</th><th>标题</th><th>描述</th><th>修复建议</th></tr>")?;
            for issue in &d.issues {
                let (cls, severity) = match issue.severity {
                    crate::diagnostics::Severity::Info => ("", "信息"),
                    crate::diagnostics::Severity::Warning => ("warning", "⚠ 警告"),
                    crate::diagnostics::Severity::Critical => ("error", "✗ 严重"),
                    crate::diagnostics::Severity::Fatal => ("critical", "☠ 致命"),
                };
                writeln!(
                    w,
                    "      <tr class=\"{}\"><td>{}</td><td class=\"{}\">{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                    cls, issue.id, cls, severity, issue.category, issue.title, issue.description, issue.recommendation
                )?;
            }
            writeln!(w, "    </table>")?;
        }
        Ok(())
    }
}

pub fn print_generated_files(files: &[String]) {
    if files.is_empty() {
        return;
    }

    println!("\n{}", "=== 报告生成完成 ===".bold().green());
    for file in files {
        println!("  ✓ {}", file.cyan());
    }
}
