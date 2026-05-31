import click
import yaml
import json
from pathlib import Path


class Config:
    def __init__(self):
        self.verbose = False
        self.config_file = None
        self.parallel = False
        self.max_workers = 4


pass_config = click.make_pass_decorator(Config, ensure=True)


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="启用详细输出")
@click.option("--config-file", "-c", type=click.Path(exists=True), help="配置文件路径")
@click.option("--parallel/--no-parallel", default=False, help="启用并行操作")
@click.option("--max-workers", type=int, default=4, help="最大并行工作线程数")
@pass_config
def cli(config, verbose, config_file, parallel, max_workers):
    """嵌入式固件批量刷写与版本管理工具"""
    config.verbose = verbose
    config.config_file = config_file
    config.parallel = parallel
    config.max_workers = max_workers
    config.command = None


@cli.group()
def device():
    """设备管理命令"""
    pass


@device.command("scan")
@click.option("--type", "-t", type=click.Choice(["serial", "net", "all"]), default="all", help="设备类型")
@click.option("--baudrate", "-b", type=int, default=115200, help="串口波特率")
@click.option("--ip-range", help="IP扫描范围 (如: 192.168.1.1-192.168.1.100)")
@click.option("--port", "-p", type=int, default=8080, help="网口端口")
@pass_config
def device_scan(config, type, baudrate, ip_range, port):
    """扫描可用设备"""
    config.command = "device_scan"
    config.device_type = type
    config.baudrate = baudrate
    config.ip_range = ip_range
    config.port = port


@device.command("add")
@click.option("--connection", "-c", required=True, help="设备连接 (串口: /dev/ttyUSB0 或 网口: IP:PORT)")
@click.option("--name", "-n", help="设备名称")
@click.option("--type", "-t", type=click.Choice(["serial", "net"]), help="设备类型 (自动检测)")
@click.option("--baudrate", "-b", type=int, default=115200, help="串口波特率")
@click.option("--group", "-g", help="添加到指定分组")
@pass_config
def device_add(config, connection, name, type, baudrate, group):
    """添加设备到目录"""
    config.command = "device_add"
    config.connection = connection
    config.device_name = name
    config.device_type = type
    config.baudrate = baudrate
    config.group_id = group


@device.command("list")
@click.option("--type", "-t", type=click.Choice(["serial", "net", "all"]), default="all", help="按类型筛选")
@pass_config
def device_list(config, type):
    """列出已添加的设备"""
    config.command = "device_list"
    config.device_type = type


@device.command("remove")
@click.argument("device_id")
@pass_config
def device_remove(config, device_id):
    """从目录中删除设备"""
    config.command = "device_remove"
    config.device_id = device_id


@device.command("import")
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--group", "-g", help="导入到指定分组")
@pass_config
def device_import(config, file_path, group):
    """从文件导入设备列表"""
    config.command = "device_import"
    config.import_file = file_path
    config.group_id = group


@device.command("export")
@click.argument("file_path", type=click.Path())
@click.option("--group", "-g", help="仅导出指定分组的设备")
@pass_config
def device_export(config, file_path, group):
    """导出设备列表到文件"""
    config.command = "device_export"
    config.export_file = file_path
    config.group_id = group


@cli.group()
def group():
    """设备分组管理命令"""
    pass


@group.command("create")
@click.option("--name", "-n", required=True, help="分组名称")
@click.option("--description", "-d", help="分组描述")
@pass_config
def group_create(config, name, description):
    """创建设备分组"""
    config.command = "group_create"
    config.group_name = name
    config.group_description = description or ""


@group.command("list")
@pass_config
def group_list(config):
    """列出所有分组"""
    config.command = "group_list"


@group.command("show")
@click.argument("group_id")
@pass_config
def group_show(config, group_id):
    """显示分组详情"""
    config.command = "group_show"
    config.group_id = group_id


@group.command("delete")
@click.argument("group_id")
@pass_config
def group_delete(config, group_id):
    """删除分组"""
    config.command = "group_delete"
    config.group_id = group_id


@group.command("add-device")
@click.option("--group-id", "-g", required=True, help="分组ID")
@click.option("--device-id", "-d", required=True, help="设备ID")
@pass_config
def group_add_device(config, group_id, device_id):
    """添加设备到分组"""
    config.command = "group_add_device"
    config.group_id = group_id
    config.device_id = device_id


@group.command("remove-device")
@click.option("--group-id", "-g", required=True, help="分组ID")
@click.option("--device-id", "-d", required=True, help="设备ID")
@pass_config
def group_remove_device(config, group_id, device_id):
    """从分组移除设备"""
    config.command = "group_remove_device"
    config.group_id = group_id
    config.device_id = device_id


@cli.group()
def firmware():
    """固件管理命令"""
    pass


@firmware.command("flash")
@click.argument("firmware_file", type=click.Path(exists=True))
@click.option("--device", "-d", multiple=True, help="目标设备 (串口: /dev/ttyUSB0 或 网口: IP:PORT)")
@click.option("--device-list", "-l", type=click.Path(exists=True), help="设备列表文件 (YAML/JSON)")
@click.option("--group", "-g", help="按分组刷写")
@click.option("--baudrate", "-b", type=int, default=115200, help="串口波特率")
@click.option("--chunk-size", type=int, default=1024, help="分包大小 (字节)")
@click.option("--retry", type=int, default=5, help="失败重试次数")
@click.option("--verify/--no-verify", default=True, help="刷写后校验")
@click.option("--erase", is_flag=True, help="刷写前擦除")
@click.option("--smart-chunks/--no-smart-chunks", default=True, help="使用智能分包策略")
@click.option("--enable-resume/--no-resume", default=True, help="启用断点续传")
@pass_config
def firmware_flash(config, firmware_file, device, device_list, group, baudrate, chunk_size, retry, verify, erase, smart_chunks, enable_resume):
    """批量刷写固件到设备"""
    config.command = "firmware_flash"
    config.firmware_file = firmware_file
    config.devices = list(device)
    config.device_list = device_list
    config.group_id = group
    config.baudrate = baudrate
    config.chunk_size = chunk_size
    config.retry = retry
    config.verify = verify
    config.erase = erase
    config.use_smart_chunks = smart_chunks
    config.enable_resume = enable_resume


@firmware.command("version")
@click.option("--device", "-d", multiple=True, help="目标设备")
@click.option("--device-list", "-l", type=click.Path(exists=True), help="设备列表文件")
@click.option("--output", "-o", type=click.Path(), help="输出版本信息到文件")
@click.option("--format", "-f", type=click.Choice(["json", "yaml", "text"]), default="text", help="输出格式")
@pass_config
def firmware_version(config, device, device_list, output, format):
    """查询设备固件版本"""
    config.command = "firmware_version"
    config.devices = list(device)
    config.device_list = device_list
    config.output = output
    config.format = format


@firmware.command("compare")
@click.argument("version_file_1", type=click.Path(exists=True))
@click.argument("version_file_2", type=click.Path(exists=True))
@click.option("--output", "-o", type=click.Path(), help="输出比对结果到文件")
@click.option("--show-diff", is_flag=True, default=True, help="显示差异详情")
@pass_config
def firmware_compare(config, version_file_1, version_file_2, output, show_diff):
    """比对两个版本信息文件"""
    config.command = "firmware_compare"
    config.version_file_1 = version_file_1
    config.version_file_2 = version_file_2
    config.output = output
    config.show_diff = show_diff


@cli.group()
def task():
    """任务管理命令"""
    pass


@task.command("status")
@click.option("--task-id", "-t", help="任务ID (不指定则显示所有)")
@click.option("--watch", "-w", is_flag=True, help="实时监控进度")
@click.option("--interval", type=int, default=2, help="刷新间隔(秒)")
@pass_config
def task_status(config, task_id, watch, interval):
    """查看任务执行状态"""
    config.command = "task_status"
    config.task_id = task_id
    config.watch = watch
    config.interval = interval


@task.command("list")
@click.option("--limit", "-n", type=int, default=10, help="显示最近N个任务")
@click.option("--status", type=click.Choice(["all", "running", "completed", "failed"]), default="all", help="按状态筛选")
@pass_config
def task_list(config, limit, status):
    """列出历史任务"""
    config.command = "task_list"
    config.limit = limit
    config.status_filter = status


@task.command("cancel")
@click.argument("task_id")
@click.option("--force", "-f", is_flag=True, help="强制取消")
@pass_config
def task_cancel(config, task_id, force):
    """取消正在执行的任务"""
    config.command = "task_cancel"
    config.task_id = task_id
    config.force = force


def load_device_list(file_path):
    """从文件加载设备列表"""
    path = Path(file_path)
    if path.suffix in (".yaml", ".yml"):
        with open(path, "r") as f:
            data = yaml.safe_load(f)
    elif path.suffix == ".json":
        with open(path, "r") as f:
            data = json.load(f)
    else:
        devices = []
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split()
                    device = {"connection": parts[0]}
                    if len(parts) > 1:
                        device["name"] = parts[1]
                    devices.append(device)
        return devices

    if isinstance(data, list):
        return data
    elif isinstance(data, dict) and "devices" in data:
        return data["devices"]
    return []
