# 服务器集群运维批量管控命令行工具集

基于 Go 语言开发的服务器集群运维批量管控命令行工具集，提供集群连接、批量指令执行、资源状态采集、日志拉取、配置管理和异常告警等功能。

## 功能模块

### 1. 集群连接模块 (cluster)
- `cluster list` - 列出所有服务器
- `cluster test` - 测试服务器连接状态

### 2. 批量指令执行模块 (exec)
- `exec run` - 在多台服务器上批量执行命令

### 3. 资源状态采集模块 (status)
- `status check` - 采集服务器 CPU、内存、磁盘等资源状态

### 4. 日志拉取模块 (logs)
- `logs fetch` - 拉取远程服务器日志内容
- `logs download` - 下载远程日志文件到本地

### 5. 配置管理模块 (config)
- `config init` - 初始化示例配置文件
- `config show` - 显示当前配置
- `config add` - 添加服务器节点
- `config remove` - 删除服务器节点

### 6. 异常告警模块 (alert)
- `alert check` - 检查资源状态并发送告警
- `alert test` - 测试告警通道

## 安装和编译

```bash
# 下载依赖
go mod tidy

# 编译
go build -o cluster-ops
```

## 使用示例

### 1. 初始化配置
```bash
./cluster-ops config init
```

### 2. 查看服务器列表
```bash
./cluster-ops cluster list
./cluster-ops cluster list -g web
```

### 3. 测试连接
```bash
./cluster-ops cluster test
./cluster-ops cluster test -g db
```

### 4. 批量执行命令
```bash
./cluster-ops exec run "df -h"
./cluster-ops exec run "uptime" -g web
./cluster-ops exec run "systemctl status nginx" -s web-01
```

### 5. 采集资源状态
```bash
./cluster-ops status check
./cluster-ops status check -g db
```

### 6. 拉取日志
```bash
./cluster-ops logs fetch /var/log/syslog -n 50
./cluster-ops logs fetch /var/log/nginx/access.log -s web-01 -f
./cluster-ops logs download /var/log/syslog -o ./logs
```

### 7. 配置管理
```bash
./cluster-ops config add -n new-server -H 192.168.1.100 -u root -P password -g web
./cluster-ops config remove web-03
./cluster-ops config show
```

### 8. 告警检查
```bash
./cluster-ops alert check
./cluster-ops alert check -g web -m email
./cluster-ops alert test
```

## 配置文件说明

配置文件采用 YAML 格式，默认读取当前目录下的 `config.yaml`：

```yaml
servers:
  - name: web-01
    host: 192.168.1.101
    port: 22
    user: root
    password: your_password
    keyfile: ~/.ssh/id_rsa  # 可选，密钥认证
    group: web

alerts:
  cpu_threshold: 80      # CPU 告警阈值 (%)
  memory_threshold: 85   # 内存告警阈值 (%)
  disk_threshold: 90     # 磁盘告警阈值 (%)
  webhook_url: ...       # Webhook 告警地址
  email:                 # 邮件告警配置
    smtp: smtp.example.com
    port: 587
    user: alert@example.com
    password: ...
    to:
      - admin@example.com
```

## 项目结构

```
cluster-ops-tool/
├── main.go              # 主入口
├── go.mod
├── config.yaml          # 配置文件
├── cmd/                 # 命令模块
│   ├── root.go          # 根命令
│   ├── cluster.go       # 集群连接模块
│   ├── exec.go          # 批量执行模块
│   ├── status.go        # 资源状态模块
│   ├── logs.go          # 日志拉取模块
│   ├── config_cmd.go    # 配置管理模块
│   ├── alert.go         # 异常告警模块
│   ├── group.go         # 节点分组批量操作
│   ├── script.go        # 运维脚本批量执行
│   └── record.go        # 执行结果管理
└── pkg/                 # 公共包
    ├── config/          # 配置管理
    │   └── config.go
    ├── ssh/             # SSH 连接
    │   └── ssh.go
    └── storage/         # 结果持久化存储
        └── storage.go
```

## 新增功能特性

### 1. 节点分组批量操作
- 支持多分组并行操作（`-g web,db`）
- 支持指定多台服务器（`-s server1,server2`）
- 危险操作前安全提示与延迟确认
- 自动保存执行结果

### 2. 运维指令脚本批量执行
- YAML 格式多步骤脚本定义
- 步骤级超时、重试、错误忽略配置
- 变量替换支持（`{{key}}`）
- 命令行参数覆盖脚本配置
- 本地脚本批量上传

### 3. 网络连接重连机制优化
- SSH 连接池管理，连接复用
- 后台连接状态监控，自动清理空闲连接
- 连接失败自动重连（最多 3 次）
- 指数退避重试策略
- 批量执行统一入口 `BatchExecute()`

### 4. 命令执行结果本地持久化
- 按日期分目录存储（`./data/YYYY-MM-DD/`）
- JSON 格式保存完整执行记录
- 支持按日期、服务器筛选查询
- 支持导出为 CSV 或 JSON 格式
- 批次级记录与单条记录关联
