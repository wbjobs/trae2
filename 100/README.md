# 容器集群资源巡检命令行工具集 (container-inspector)

一个用 Rust 开发的容器集群资源巡检命令行工具集，用于批量连接容器集群节点，巡检容器运行状态、统计 CPU / 内存 / 磁盘占用，提取容器运行日志，进行故障诊断分析。

## 功能模块

| 模块 | 文件 | 功能说明 |
|------|------|----------|
| 本地配置模块 | [config.rs](file:///e:/标注项目/trae2/100/src/config.rs) | 管理集群节点配置信息，支持 YAML 配置文件 |
| 集群连接模块 | [cluster_connection.rs](file:///e:/标注项目/trae2/100/src/cluster_connection.rs) | SSH 连接集群节点，执行远程命令 |
| 容器状态巡检模块 | [container_status.rs](file:///e:/标注项目/trae2/100/src/container_status.rs) | 巡检容器运行状态、健康检查 |
| 资源占用统计模块 | [resource_stats.rs](file:///e:/标注项目/trae2/100/src/resource_stats.rs) | 统计 CPU / 内存 / 磁盘资源占用 |
| 日志提取模块 | [log_extract.rs](file:///e:/标注项目/trae2/100/src/log_extract.rs) | 提取容器运行日志，日志模式分析 |
| 故障诊断模块 | [diagnostics.rs](file:///e:/标注项目/trae2/100/src/diagnostics.rs) | 系统级故障诊断分析 |
| CLI 主入口 | [main.rs](file:///e:/标注项目/trae2/100/src/main.rs) + [cli.rs](file:///e:/标注项目/trae2/100/src/cli.rs) | 命令行接口与子命令整合 |

## 编译安装

```bash
# 编译开发版本
cargo build

# 编译发布版本
cargo build --release

# 直接运行
cargo run -- --help
```

编译完成后，二进制文件位于 `target/release/cinspect`（或 Windows 下的 `cinspect.exe`）。

## 快速开始

### 1. 初始化配置

```bash
# 生成示例配置文件
cinspect config init
```

### 2. 编辑配置文件

编辑 `config/clusters.yaml`，添加您的集群节点信息：

```yaml
version: "1.0"
clusters:
  - name: production
    cluster_type: docker
    description: "生产环境Docker集群"
    nodes:
      - name: node-01
        host: 192.168.1.101
        port: 22
        user: root
        key_file: ~/.ssh/id_rsa
        timeout: 30
        enabled: true
```

### 3. 验证配置

```bash
cinspect config validate
```

### 4. 测试连接

```bash
# 测试所有节点连接
cinspect connect

# 测试指定集群
cinspect --cluster production connect

# 测试指定节点
cinspect --cluster production --node node-01 connect
```

## 子命令详解

### 配置管理 (config)

```bash
# 查看配置列表
cinspect config list

# 添加集群
cinspect config add --name mycluster --cluster-type docker \
  --nodes 192.168.1.100,192.168.1.101 \
  --user root --key-file ~/.ssh/id_rsa

# 删除集群
cinspect config remove --name mycluster

# 验证配置
cinspect config validate

# 生成示例配置
cinspect config init
```

### 连接测试 (connect)

```bash
# 测试所有节点连接
cinspect connect

# 设置超时时间（秒）
cinspect connect --timeout 15

# JSON 格式输出
cinspect --output json connect
```

### 容器状态巡检 (status)

```bash
# 查看所有容器状态
cinspect status

# 仅显示异常容器
cinspect status --only-issues

# 按状态过滤
cinspect status --filter running
cinspect status --filter exited

# 指定集群和节点
cinspect --cluster production --node node-01 status
```

### 资源统计 (resource)

```bash
# 查看所有资源统计
cinspect resource

# 仅查看CPU
cinspect resource --resource-type cpu

# 仅查看内存
cinspect resource --resource-type memory

# 仅查看磁盘
cinspect resource --resource-type disk

# 按资源使用率排序，显示TOP 5
cinspect resource --sort --top 5

# YAML 格式输出
cinspect --output yaml resource
```

### 日志提取 (logs)

```bash
# 提取容器最后100行日志
cinspect logs -c container_name_or_id

# 指定行数
cinspect logs -c container_name_or_id -t 500

# 输出到文件
cinspect logs -c container_name_or_id --output-file /tmp/container.log

# 指定开始时间
cinspect logs -c container_name_or_id --since 2024-01-01T00:00:00
```

### 故障诊断 (diagnose)

```bash
# 完整诊断
cinspect diagnose

# 仅诊断容器
cinspect diagnose --diag-type container

# 仅诊断节点
cinspect diagnose --diag-type node

# 仅诊断网络
cinspect diagnose --diag-type network

# 仅诊断存储
cinspect diagnose --diag-type storage

# 输出详细报告
cinspect diagnose --verbose

# 尝试自动修复
cinspect diagnose --auto-fix
```

### 完整巡检 (inspect)

```bash
# 运行完整巡检流程（连接测试 + 状态巡检 + 资源统计 + 故障诊断）
cinspect inspect

# 输出巡检报告
cinspect inspect --report /tmp/inspection-report.md
```

## 全局选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-c, --config <FILE>` | 配置文件路径 | `config/clusters.yaml` |
| `--cluster <NAME>` | 指定集群名称 | 所有集群 |
| `--node <NAME>` | 指定节点名称 | 集群所有节点 |
| `-o, --output <FORMAT>` | 输出格式: table, json, yaml | `table` |
| `--debug` | 启用调试日志 | 关闭 |

## 配置文件格式

```yaml
version: "1.0"
clusters:
  - name: cluster_name           # 集群名称
    cluster_type: docker         # 集群类型: docker, k8s, swarm
    description: "集群描述"       # 可选描述
    nodes:
      - name: node_name           # 节点名称
        host: 192.168.1.100       # 节点地址
        port: 22                  # SSH端口
        user: root                # SSH用户名
        password: secret          # SSH密码（可选）
        key_file: ~/.ssh/id_rsa   # SSH密钥文件（可选）
        timeout: 30               # 连接超时（秒）
        enabled: true             # 是否启用
```

**认证方式优先级**：密钥文件认证 > 密码认证。

## 输出格式

### Table 格式（默认）

友好的终端表格输出，支持颜色高亮显示异常状态。

### JSON 格式

```bash
cinspect --output json status
```

结构化的 JSON 输出，便于后续程序处理。

### YAML 格式

```bash
cinspect --output yaml resource
```

易读的 YAML 格式输出。

## 项目结构

```
e:\标注项目\trae2\100\
├── Cargo.toml              # 项目配置
├── README.md               # 文档
├── config/
│   └── clusters.yaml       # 集群配置文件
└── src/
    ├── main.rs             # 主入口
    ├── cli.rs              # 命令行定义
    ├── config.rs           # 配置管理模块
    ├── cluster_connection.rs  # 集群连接模块
    ├── container_status.rs   # 容器状态模块
    ├── resource_stats.rs     # 资源统计模块
    ├── log_extract.rs        # 日志提取模块
    └── diagnostics.rs        # 故障诊断模块
```

## 主要依赖

- `clap` - 命令行参数解析
- `serde` / `serde_yaml` / `serde_json` - 序列化与配置解析
- `tokio` - 异步运行时
- `ssh2` - SSH 客户端
- `colored` - 终端彩色输出
- `humansize` - 人类可读的文件大小
- `indicatif` - 进度条
- `tracing` - 日志记录
- `anyhow` / `thiserror` - 错误处理

## License

MIT License
