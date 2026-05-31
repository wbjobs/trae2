# Cluster Ops - 服务器集群运维批量管控工具集

一个功能强大的命令行工具集，用于批量管理和运维 Linux 服务器集群。

## 功能特性

- ✅ **批量命令执行** - 在多台服务器上并行执行 Shell 命令
- ✅ **服务状态巡检** - 一键检查 CPU、内存、磁盘、负载等系统健康状态
- ✅ **服务管理** - 批量启动、停止、重启、检查系统服务
- ✅ **配置批量下发** - 批量上传配置文件，支持自动备份
- ✅ **脚本批量执行** - 上传并在多台服务器上执行脚本
- ✅ **磁盘使用监控** - 批量检查服务器磁盘空间使用情况
- ✅ **执行日志留存** - 所有操作自动记录到本地日志文件
- ✅ **多认证方式** - 支持密码、SSH 密钥、SSH Agent 等多种认证方式
- ✅ **标签分组管理** - 支持按标签对服务器进行分组操作
- ✅ **并行执行** - 可配置并行连接数，提高执行效率
- ✅ **跨平台** - 适配所有 Linux 发行版环境

## 项目结构

```
cluster_ops/
├── __init__.py      # 包初始化
├── config.py        # 配置管理模块
├── logger.py        # 日志输出模块
├── ssh_client.py    # 集群通信模块 (SSH)
├── executor.py      # 运维指令执行模块
├── cli.py           # 指令解析模块
└── main.py          # 主入口
```

## 安装

### 环境要求

- Python 3.8+
- pip

### 安装步骤

1. 克隆或下载项目源码

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 安装到系统（可选）：
```bash
pip install -e .
```

## 快速开始

### 1. 添加服务器

使用命令行添加服务器：

```bash
# 使用密码认证
cluster-ops server add \
  --name web1 \
  --host 192.168.1.10 \
  --user root \
  --password your_password \
  --tags web production

# 使用 SSH 密钥认证
cluster-ops server add \
  --name web2 \
  --host 192.168.1.11 \
  --user root \
  --key ~/.ssh/id_rsa \
  --tags web production
```

### 2. 查看已配置的服务器

```bash
cluster-ops server list
```

### 3. 执行批量命令

```bash
# 在所有服务器上执行命令
cluster-ops exec "uptime" --all

# 在指定服务器上执行
cluster-ops exec "df -h" --servers web1 web2

# 按标签分组执行
cluster-ops exec "systemctl status nginx" --tags web

# 显示详细输出
cluster-ops exec "tail -20 /var/log/syslog" --tags web --verbose
```

### 4. 健康检查

```bash
cluster-ops health --all
```

### 5. 服务管理

```bash
# 检查服务状态
cluster-ops service nginx status --tags web

# 重启服务
cluster-ops service nginx restart --tags web

# 其他操作: start, stop, reload, enable, disable
cluster-ops service nginx start --all
```

### 6. 配置批量下发

```bash
# 上传配置文件（自动备份远端文件）
cluster-ops deploy ./nginx.conf /etc/nginx/nginx.conf --tags web

# 不上传前不备份
cluster-ops deploy ./nginx.conf /etc/nginx/nginx.conf --tags web --no-backup
```

### 7. 批量执行脚本

```bash
cluster-ops script ./deploy.sh --all --args "production"
```

### 8. 磁盘使用检查

```bash
cluster-ops disk --all --path /var/log
```

## 服务器筛选方式

所有运维命令都支持三种服务器筛选方式：

1. **全部服务器**：`--all`
2. **指定服务器**：`--servers server1 server2`
3. **按标签筛选**：`--tags web db`

## 并行执行控制

使用 `-p` 或 `--parallel` 参数控制并行连接数：

```bash
cluster-ops exec "sleep 5" --all --parallel 10
```

## 配置文件

配置文件默认位置：`~/.cluster_ops/config.yaml`

可以直接编辑配置文件批量添加服务器，参考 [config.example.yaml](config.example.yaml)

## 日志文件

- 系统日志：`~/.cluster_ops/logs/`
- 执行日志：`~/.cluster_ops/logs/executions/`

每次执行命令都会在 `executions` 目录下生成详细的执行日志文件。

## 安全配置 (黑白名单)

工具支持命令黑白名单功能，防止误操作执行危险命令。

### 配置方式

编辑 `~/.cluster_ops/config.yaml` 中的 `security` 部分：

```yaml
security:
  enabled: true
  whitelist: []
  blacklist:
    - "rm -rf /"
    - "mkfs"
    - "dd if=/dev"
    - "shutdown"
    - "reboot"
    - "regex:^rm\\s+-rf\\s+/"
  default_action: allow
```

### 匹配模式

- **普通模式**：使用 glob 通配符匹配命令或参数（如 `rm -rf /`）
- **正则模式**：以 `regex:` 开头，使用正则表达式匹配（如 `regex:^rm\s+-rf\s+/`）

### 规则优先级

- `default_action: allow`（默认）：黑名单匹配且不在白名单中的命令被阻止
- `default_action: deny`：仅白名单匹配或不在黑名单中的命令被允许

## 实时进度展示

所有批量操作都会显示实时进度条：

```
Executing [============>           ] 5/12 ( 41.7%) ✓4 ✗1 | 12.3s ETA: 18s
```

进度条包含：
- 完成进度百分比
- 已完成/总数
- 成功/失败计数
- 已用时间
- 预计剩余时间 (ETA)

## 子命令说明

| 子命令 | 说明 |
|--------|------|
| `exec` | 执行 Shell 命令 |
| `health` | 系统健康检查 |
| `service` | 系统服务管理 |
| `deploy` | 配置文件部署 |
| `script` | 脚本批量执行 |
| `disk` | 磁盘使用检查 |
| `server list` | 列出所有服务器 |
| `server add` | 添加服务器 |
| `server remove` | 删除服务器 |

## 使用示例

### 常用运维场景

1. **批量更新系统**
```bash
cluster-ops exec "apt update && apt upgrade -y" --tags production --parallel 2
```

2. **批量检查日志**
```bash
cluster-ops exec "grep ERROR /var/log/app.log | tail -10" --tags app
```

3. **批量部署应用**
```bash
cluster-ops script ./deploy_app.sh --tags app --args "v2.0.0"
```

4. **日常巡检**
```bash
cluster-ops health --all
cluster-ops service cron status --all
cluster-ops disk --all
```

## API 调用

除了命令行使用，也可以在 Python 代码中直接调用：

```python
from cluster_ops.executor import CommandExecutor
from cluster_ops.config import config_manager

# 创建执行器
executor = CommandExecutor()

# 执行命令
result = executor.execute_command(
    "uptime",
    tags=["web"],
    parallel=5,
    verbose=True
)

# 健康检查
health_result = executor.health_check(tags=["production"])
```

## 安全说明

- 密码和密钥信息存储在用户目录下，请确保文件权限正确
- 建议使用 SSH 密钥认证而非密码认证
- 生产环境建议使用 SSH Agent 管理密钥
- 执行危险命令前请在测试环境验证

## License

MIT License
