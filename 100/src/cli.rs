use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "cinspect",
    version = "2.0.0",
    about = "容器集群资源巡检命令行工具集",
    long_about = "用于批量连接容器集群节点，巡检容器运行状态、统计资源占用、提取日志、故障诊断的综合工具套件"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,

    #[arg(
        short,
        long,
        default_value = "config/clusters.yaml",
        help = "集群配置文件路径"
    )]
    pub config: String,

    #[arg(short, long, help = "指定集群名称，不指定则使用所有集群")]
    pub cluster: Option<String>,

    #[arg(short, long, help = "指定节点名称，不指定则使用集群所有节点")]
    pub node: Option<String>,

    #[arg(long, help = "按节点分组筛选，可多次指定", value_delimiter = ',')]
    pub group: Vec<String>,

    #[arg(long, help = "按标签筛选，格式 key=value，可多次指定", value_parser = parse_label)]
    pub label: Vec<(String, String)>,

    #[arg(short, long, help = "输出格式: table, json, yaml", default_value = "table")]
    pub output: String,

    #[arg(long, help = "启用调试日志")]
    pub debug: bool,

    #[arg(long, help = "连接失败重试次数", default_value_t = 2)]
    pub retries: u32,

    #[arg(long, help = "重试初始延迟(秒)，指数退避", default_value_t = 2)]
    pub retry_delay: u64,

    #[arg(long, help = "禁用结果持久化存储")]
    pub no_store: bool,
}

fn parse_label(s: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = s.splitn(2, '=').collect();
    if parts.len() != 2 {
        return Err(format!("标签格式错误，应为 key=value，实际: {}", s));
    }
    Ok((parts[0].to_string(), parts[1].to_string()))
}

#[derive(Subcommand)]
pub enum Commands {
    #[command(about = "显示集群配置信息", alias = "cfg")]
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },

    #[command(about = "测试集群节点连接", alias = "conn")]
    Connect {
        #[arg(long, help = "连接超时时间(秒)", default_value_t = 10)]
        timeout: u64,
    },

    #[command(about = "巡检容器运行状态", alias = "ps")]
    Status {
        #[arg(long, help = "仅显示异常容器")]
        only_issues: bool,

        #[arg(long, help = "按状态过滤: running, stopped, exited, all", default_value = "all")]
        filter: String,
    },

    #[command(about = "统计资源占用(CPU/内存/磁盘)", alias = "stats")]
    Resource {
        #[arg(long, help = "资源类型: cpu, memory, disk, all", default_value = "all")]
        resource_type: String,

        #[arg(long, help = "按资源使用率排序")]
        sort: bool,

        #[arg(long, help = "显示TOP N个资源占用最高的容器", default_value_t = 10)]
        top: usize,
    },

    #[command(about = "提取容器日志", alias = "log")]
    Logs {
        #[arg(short, long, help = "容器ID或名称")]
        container: String,

        #[arg(short, long, help = "显示最后N行日志", default_value_t = 100)]
        tail: u64,

        #[arg(long, help = "日志输出到文件")]
        output_file: Option<String>,

        #[arg(long, help = "跟踪日志输出")]
        follow: bool,

        #[arg(long, help = "日志开始时间, 格式: 2024-01-01T00:00:00")]
        since: Option<String>,
    },

    #[command(about = "故障诊断分析", alias = "diag")]
    Diagnose {
        #[arg(long, help = "诊断类型: container, node, network, storage, all", default_value = "all")]
        diag_type: String,

        #[arg(long, help = "输出详细诊断报告")]
        verbose: bool,

        #[arg(long, help = "自动修复常见问题")]
        auto_fix: bool,
    },

    #[command(about = "运行完整巡检流程", alias = "all")]
    Inspect {
        #[arg(long, help = "输出报告文件路径")]
        report: Option<String>,

        #[arg(long, help = "报告格式: html, md, both", default_value = "md")]
        report_format: String,

        #[arg(long, help = "报告标题")]
        report_title: Option<String>,
    },

    #[command(about = "巡检历史记录管理", alias = "hist")]
    History {
        #[command(subcommand)]
        action: HistoryAction,
    },

    #[command(about = "生成巡检报告", alias = "rep")]
    Report {
        #[arg(long, help = "历史记录ID，不指定则使用最新记录")]
        id: Option<String>,

        #[arg(long, help = "输出报告文件路径", default_value = "reports/inspection-report")]
        output: String,

        #[arg(long, help = "报告格式: html, md, both", default_value = "both")]
        format: String,

        #[arg(long, help = "报告标题")]
        title: Option<String>,
    },
}

#[derive(Subcommand)]
pub enum ConfigAction {
    #[command(about = "显示集群配置列表")]
    List,

    #[command(about = "添加新集群配置")]
    Add {
        #[arg(long, help = "集群名称")]
        name: String,
        #[arg(long, help = "集群类型: docker, k8s, swarm")]
        cluster_type: String,
        #[arg(long, help = "节点地址列表, 逗号分隔")]
        nodes: String,
        #[arg(long, help = "SSH用户名")]
        user: String,
        #[arg(long, help = "SSH密码")]
        password: Option<String>,
        #[arg(long, help = "SSH密钥文件路径")]
        key_file: Option<String>,
        #[arg(long, help = "SSH端口", default_value_t = 22)]
        port: u16,
    },

    #[command(about = "为节点添加分组")]
    AddGroup {
        #[arg(long, help = "集群名称")]
        cluster: String,
        #[arg(long, help = "节点名称")]
        node: String,
        #[arg(long, help = "分组名称，可多个用逗号分隔")]
        groups: String,
    },

    #[command(about = "为节点添加标签")]
    AddLabel {
        #[arg(long, help = "集群名称")]
        cluster: String,
        #[arg(long, help = "节点名称")]
        node: String,
        #[arg(long, help = "标签，格式 key=value，可多个用逗号分隔")]
        labels: String,
    },

    #[command(about = "删除集群配置")]
    Remove {
        #[arg(long, help = "集群名称")]
        name: String,
    },

    #[command(about = "验证配置文件语法")]
    Validate,

    #[command(about = "生成默认配置模板")]
    Init,
}

#[derive(Subcommand)]
pub enum HistoryAction {
    #[command(about = "列出巡检历史记录")]
    List {
        #[arg(long, help = "显示最近N条记录", default_value_t = 20)]
        limit: usize,

        #[arg(long, help = "按巡检类型过滤: connect, status, resource, diagnose, inspect")]
        task_type: Option<String>,

        #[arg(long, help = "按集群过滤")]
        cluster: Option<String>,
    },

    #[command(about = "查看指定历史记录详情")]
    Show {
        #[arg(long, help = "历史记录ID")]
        id: String,
    },

    #[command(about = "删除历史记录")]
    Delete {
        #[arg(long, help = "历史记录ID")]
        id: String,

        #[arg(long, help = "删除所有历史记录")]
        all: bool,

        #[arg(long, help = "删除N天前的历史记录")]
        older_than_days: Option<u64>,
    },

    #[command(about = "显示存储统计信息")]
    Stats,
}
