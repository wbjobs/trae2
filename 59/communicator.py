"""
集群节点通信模块
Cluster Node Communicator Module

负责与 Linux 集群节点建立 SSH 连接、执行命令、管理会话。
"""

import os
import time
import socket
import logging
from typing import Optional, Dict, Any, List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import paramiko
from paramiko.ssh_exception import (
    SSHException,
    AuthenticationException,
    NoValidConnectionsError,
    BadHostKeyException,
)

from config import NodeConfig, SSHConfig

logger = logging.getLogger(__name__)


@dataclass
class CommandResult:
    """命令执行结果"""
    node_name: str
    command: str
    stdout: str
    stderr: str
    exit_code: int
    success: bool
    duration: float
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_name": self.node_name,
            "command": self.command,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "success": self.success,
            "duration": self.duration,
            "error": self.error,
        }


@dataclass
class ConnectionStatus:
    """连接状态"""
    node_name: str
    host: str
    connected: bool
    latency: float
    error: Optional[str] = None
    ssh_version: Optional[str] = None


class SSHClientManager:
    """SSH 客户端管理器 - 负责单个节点的连接和命令执行"""

    def __init__(self, node_config: NodeConfig, ssh_config: SSHConfig):
        self.node_config = node_config
        self.ssh_config = ssh_config
        self.client: Optional[paramiko.SSHClient] = None
        self._connected = False
        self._last_activity = 0.0

    @property
    def is_connected(self) -> bool:
        return self._connected and self.client is not None

    def _check_tcp_port(self, timeout: int = 5) -> bool:
        """检查 TCP 端口是否可达

        Args:
            timeout: 超时时间（秒）

        Returns:
            True 如果端口可达，否则 False
        """
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((self.node_config.host, self.node_config.port))
            sock.close()
            return result == 0
        except Exception as e:
            logger.debug(
                f"[{self.node_config.name}] TCP 端口检测失败: {e}"
            )
            return False

    def _create_client(self) -> paramiko.SSHClient:
        """创建 SSH 客户端"""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.load_system_host_keys()
        return client

    def connect(self) -> ConnectionStatus:
        """建立 SSH 连接（带指数退避重试）

        Returns:
            ConnectionStatus 连接状态
        """
        start_time = time.time()
        error_msg = None
        ssh_version = None

        for attempt in range(1, self.ssh_config.retry_count + 1):
            try:
                tcp_check_start = time.time()
                if not self._check_tcp_port(timeout=min(self.ssh_config.timeout // 2, 5)):
                    error_msg = f"TCP 端口不可达 ({self.node_config.host}:{self.node_config.port})"
                    if attempt < self.ssh_config.retry_count:
                        self._sleep_with_backoff(attempt, error_msg)
                        continue
                    else:
                        break

                logger.debug(
                    f"[{self.node_config.name}] TCP 端口检测通过, "
                    f"耗时: {time.time() - tcp_check_start:.3f}s"
                )

                if self.client is None:
                    self.client = self._create_client()
                else:
                    try:
                        self.client.close()
                    except Exception:
                        pass
                    self.client = self._create_client()

                connect_kwargs = {
                    "hostname": self.node_config.host,
                    "port": self.node_config.port,
                    "username": self.node_config.username,
                    "timeout": self.ssh_config.timeout,
                    "auth_timeout": self.ssh_config.auth_timeout,
                    "banner_timeout": self.ssh_config.banner_timeout,
                    "allow_agent": self.ssh_config.allow_agent,
                    "look_for_keys": self.ssh_config.look_for_keys,
                    "compress": True,
                    "sock": None,
                }

                if self.node_config.ssh_key:
                    key_path = self.node_config.ssh_key
                    if key_path.startswith("~"):
                        key_path = os.path.expanduser(key_path)
                    if os.path.exists(key_path):
                        try:
                            private_key = paramiko.RSAKey.from_private_key_file(
                                key_path,
                                password=self.node_config.ssh_key_passphrase or None,
                            )
                            connect_kwargs["pkey"] = private_key
                        except Exception as e:
                            logger.warning(
                                f"[{self.node_config.name}] 加载密钥失败: {e}, "
                                f"将尝试使用 key_filename 方式"
                            )
                            connect_kwargs["key_filename"] = key_path
                            if self.node_config.ssh_key_passphrase:
                                connect_kwargs["passphrase"] = self.node_config.ssh_key_passphrase
                    else:
                        logger.warning(
                            f"[{self.node_config.name}] 密钥文件不存在: {key_path}"
                        )
                        if self.node_config.password:
                            connect_kwargs["password"] = self.node_config.password
                elif self.node_config.password:
                    connect_kwargs["password"] = self.node_config.password

                self.client.connect(**connect_kwargs)

                transport = self.client.get_transport()
                if transport:
                    transport.set_keepalive(self.ssh_config.keepalive_interval)
                    ssh_version = transport.remote_version

                self._connected = True
                self._last_activity = time.time()
                latency = time.time() - start_time

                logger.info(
                    f"[{self.node_config.name}] SSH 连接成功 "
                    f"({self.node_config.username}@{self.node_config.host}:{self.node_config.port}) "
                    f"耗时: {latency:.3f}s"
                )

                return ConnectionStatus(
                    node_name=self.node_config.name,
                    host=self.node_config.host,
                    connected=True,
                    latency=latency,
                    ssh_version=ssh_version,
                )

            except AuthenticationException as e:
                error_msg = f"认证失败: {str(e)}"
                if attempt < self.ssh_config.retry_count:
                    self._sleep_with_backoff(attempt, error_msg)
                else:
                    logger.error(
                        f"[{self.node_config.name}] 认证最终失败: {error_msg}"
                    )
            except NoValidConnectionsError as e:
                error_msg = f"无法建立连接: {str(e)}"
                if attempt < self.ssh_config.retry_count:
                    self._sleep_with_backoff(attempt, error_msg)
            except BadHostKeyException as e:
                error_msg = f"主机密钥验证失败: {str(e)}"
                break
            except socket.timeout as e:
                error_msg = f"连接超时: {str(e)}"
                if attempt < self.ssh_config.retry_count:
                    self._sleep_with_backoff(attempt, error_msg)
            except SSHException as e:
                error_msg = f"SSH 协议错误: {str(e)}"
                if attempt < self.ssh_config.retry_count:
                    self._sleep_with_backoff(attempt, error_msg)
            except OSError as e:
                error_msg = f"网络错误: {str(e)}"
                if attempt < self.ssh_config.retry_count:
                    self._sleep_with_backoff(attempt, error_msg)
            except Exception as e:
                error_msg = f"未知连接错误: {str(e)}"
                if attempt < self.ssh_config.retry_count:
                    self._sleep_with_backoff(attempt, error_msg)

        latency = time.time() - start_time
        logger.error(f"[{self.node_config.name}] SSH 连接最终失败: {error_msg}")

        return ConnectionStatus(
            node_name=self.node_config.name,
            host=self.node_config.host,
            connected=False,
            latency=latency,
            error=error_msg,
        )

    def _sleep_with_backoff(self, attempt: int, error_msg: str):
        """指数退避等待"""
        backoff = min(
            self.ssh_config.retry_delay * (2 ** (attempt - 1)),
            self.ssh_config.retry_delay * 4,
        )
        logger.warning(
            f"[{self.node_config.name}] 连接失败 (第 {attempt}/{self.ssh_config.retry_count} 次): "
            f"{error_msg}, {backoff:.1f}s 后重试..."
        )
        time.sleep(backoff)

    def _ensure_connection(self) -> bool:
        """确保连接有效，必要时重连"""
        if not self._connected or self.client is None:
            logger.warning(f"[{self.node_config.name}] 未连接，尝试建立连接...")
            status = self.connect()
            return status.connected

        try:
            transport = self.client.get_transport()
            if transport is None or not transport.is_active():
                logger.warning(
                    f"[{self.node_config.name}] 连接已失效，尝试重新连接..."
                )
                status = self.connect()
                return status.connected

            if time.time() - self._last_activity > self.ssh_config.keepalive_interval * 2:
                self.execute_command("echo ''", timeout=5)

            return True
        except Exception as e:
            logger.warning(
                f"[{self.node_config.name}] 连接检查失败: {e}, 尝试重连..."
            )
            status = self.connect()
            return status.connected

    def execute_command(self, command: str, timeout: Optional[int] = None) -> CommandResult:
        """执行远程命令（带连接检查和编码优化）

        Args:
            command: 要执行的命令
            timeout: 命令超时时间（秒）

        Returns:
            CommandResult 命令执行结果
        """
        start_time = time.time()
        effective_timeout = timeout or self.ssh_config.timeout

        if not self._ensure_connection():
            return CommandResult(
                node_name=self.node_config.name,
                command=command,
                stdout="",
                stderr="",
                exit_code=-1,
                success=False,
                duration=time.time() - start_time,
                error="无法建立或恢复 SSH 连接",
            )

        try:
            full_command = (
                f"export LC_ALL=C.UTF-8; export LANG=C.UTF-8; {command}"
            )

            stdin, stdout, stderr = self.client.exec_command(
                full_command, timeout=effective_timeout
            )

            try:
                stdout_data = stdout.read().decode("utf-8", errors="replace").strip()
            except Exception:
                stdout_data = ""

            try:
                stderr_data = stderr.read().decode("utf-8", errors="replace").strip()
            except Exception:
                stderr_data = ""

            exit_code = stdout.channel.recv_exit_status()
            success = exit_code == 0

            self._last_activity = time.time()
            duration = time.time() - start_time

            if success:
                logger.debug(
                    f"[{self.node_config.name}] 命令执行成功: {command[:60]}... "
                    f"耗时: {duration:.3f}s"
                )
            else:
                logger.warning(
                    f"[{self.node_config.name}] 命令执行失败 (退出码: {exit_code}): "
                    f"{command[:60]}..., 错误: {stderr_data[:100]}"
                )

            return CommandResult(
                node_name=self.node_config.name,
                command=command,
                stdout=stdout_data,
                stderr=stderr_data,
                exit_code=exit_code,
                success=success,
                duration=duration,
            )

        except socket.timeout as e:
            return CommandResult(
                node_name=self.node_config.name,
                command=command,
                stdout="",
                stderr="",
                exit_code=-1,
                success=False,
                duration=time.time() - start_time,
                error=f"命令执行超时 ({effective_timeout}s): {e}",
            )
        except SSHException as e:
            return CommandResult(
                node_name=self.node_config.name,
                command=command,
                stdout="",
                stderr="",
                exit_code=-1,
                success=False,
                duration=time.time() - start_time,
                error=f"SSH 错误: {e}",
            )
        except Exception as e:
            return CommandResult(
                node_name=self.node_config.name,
                command=command,
                stdout="",
                stderr="",
                exit_code=-1,
                success=False,
                duration=time.time() - start_time,
                error=f"执行错误: {e}",
            )

    def execute_commands(
        self, commands: List[str], timeout: Optional[int] = None
    ) -> List[CommandResult]:
        """批量执行命令

        Args:
            commands: 命令列表
            timeout: 每个命令的超时时间

        Returns:
            命令执行结果列表
        """
        results = []
        for cmd in commands:
            result = self.execute_command(cmd, timeout)
            results.append(result)
        return results

    def close(self):
        """关闭连接"""
        if self.client:
            try:
                transport = self.client.get_transport()
                if transport:
                    transport.close()
                self.client.close()
            except Exception:
                pass
        self._connected = False
        self.client = None
        logger.debug(f"[{self.node_config.name}] SSH 连接已关闭")

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class ClusterCommunicator:
    """集群通信管理器 - 负责多节点并行连接和命令执行"""

    def __init__(self, ssh_config: SSHConfig):
        self.ssh_config = ssh_config
        self.clients: Dict[str, SSHClientManager] = {}
        self._connected_nodes: List[str] = []

    @property
    def connected_nodes(self) -> List[str]:
        return list(self._connected_nodes)

    def connect_node(self, node_config: NodeConfig) -> ConnectionStatus:
        """连接单个节点

        Args:
            node_config: 节点配置

        Returns:
            ConnectionStatus 连接状态
        """
        if node_config.name in self.clients and self.clients[node_config.name].is_connected:
            logger.debug(f"节点 {node_config.name} 已连接，跳过")
            return ConnectionStatus(
                node_name=node_config.name,
                host=node_config.host,
                connected=True,
                latency=0,
                ssh_version="reused",
            )

        client = SSHClientManager(node_config, self.ssh_config)
        status = client.connect()

        if status.connected:
            self.clients[node_config.name] = client
            if node_config.name not in self._connected_nodes:
                self._connected_nodes.append(node_config.name)

        return status

    def connect_nodes(
        self, nodes: List[NodeConfig], max_workers: int = 10
    ) -> List[ConnectionStatus]:
        """并行连接多个节点（带进度和超时控制）

        Args:
            nodes: 节点配置列表
            max_workers: 最大并发数

        Returns:
            连接状态列表
        """
        enabled_nodes = [n for n in nodes if n.enabled]
        if not enabled_nodes:
            return []

        results = []
        logger.info(f"开始连接 {len(enabled_nodes)} 个节点，最大并发: {max_workers}")

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_node = {
                executor.submit(self.connect_node, node): node
                for node in enabled_nodes
            }

            completed = 0
            total = len(future_to_node)

            for future in as_completed(future_to_node):
                node = future_to_node[future]
                try:
                    status = future.result()
                    results.append(status)
                    completed += 1
                    logger.debug(
                        f"连接进度: {completed}/{total} - "
                        f"{node.name}: {'成功' if status.connected else '失败'}"
                    )
                except Exception as e:
                    results.append(ConnectionStatus(
                        node_name=node.name,
                        host=node.host,
                        connected=False,
                        latency=0,
                        error=f"连接异常: {str(e)}",
                    ))
                    completed += 1

        results.sort(key=lambda x: x.node_name)

        success_count = len([r for r in results if r.connected])
        fail_count = len(results) - success_count
        logger.info(
            f"节点连接完成: {success_count} 成功, {fail_count} 失败"
        )

        return results

    def execute_on_node(
        self, node_name: str, command: str, timeout: Optional[int] = None
    ) -> Optional[CommandResult]:
        """在指定节点执行命令

        Args:
            node_name: 节点名称
            command: 要执行的命令
            timeout: 超时时间

        Returns:
            CommandResult 或 None（节点未连接）
        """
        client = self.clients.get(node_name)
        if client:
            return client.execute_command(command, timeout)
        logger.warning(f"节点 {node_name} 未连接")
        return None

    def execute_on_nodes(
        self,
        node_names: List[str],
        command: str,
        timeout: Optional[int] = None,
        max_workers: int = 10,
    ) -> Dict[str, Optional[CommandResult]]:
        """在多个节点并行执行相同命令

        Args:
            node_names: 节点名称列表
            command: 要执行的命令
            timeout: 超时时间
            max_workers: 最大并发数

        Returns:
            节点名称到执行结果的映射
        """
        results: Dict[str, Optional[CommandResult]] = {}
        available_nodes = [n for n in node_names if n in self.clients]
        missing_nodes = [n for n in node_names if n not in self.clients]

        for node_name in missing_nodes:
            results[node_name] = None
            logger.warning(f"节点 {node_name} 未连接，跳过执行")

        if not available_nodes:
            return results

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_node = {
                executor.submit(
                    self.clients[node_name].execute_command, command, timeout
                ): node_name
                for node_name in available_nodes
            }

            for future in as_completed(future_to_node):
                node_name = future_to_node[future]
                try:
                    results[node_name] = future.result()
                except Exception as e:
                    results[node_name] = CommandResult(
                        node_name=node_name,
                        command=command,
                        stdout="",
                        stderr="",
                        exit_code=-1,
                        success=False,
                        duration=0,
                        error=f"执行异常: {str(e)}",
                    )

        return results

    def execute_batch_on_nodes(
        self,
        node_names: List[str],
        commands: List[str],
        timeout: Optional[int] = None,
        max_workers: int = 10,
    ) -> Dict[str, List[CommandResult]]:
        """在多个节点批量执行命令

        Args:
            node_names: 节点名称列表
            commands: 命令列表
            timeout: 每个命令的超时时间
            max_workers: 最大并发数

        Returns:
            节点名称到执行结果列表的映射
        """
        results: Dict[str, List[CommandResult]] = {}
        available_nodes = [n for n in node_names if n in self.clients]

        for node_name in node_names:
            if node_name not in available_nodes:
                results[node_name] = []

        if not available_nodes:
            return results

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_node = {
                executor.submit(
                    self.clients[node_name].execute_commands, commands, timeout
                ): node_name
                for node_name in available_nodes
            }

            for future in as_completed(future_to_node):
                node_name = future_to_node[future]
                try:
                    results[node_name] = future.result()
                except Exception as e:
                    results[node_name] = []
                    logger.error(f"节点 {node_name} 批量执行失败: {e}")

        return results

    def disconnect_node(self, node_name: str):
        """断开单个节点连接"""
        client = self.clients.pop(node_name, None)
        if client:
            client.close()
            self._connected_nodes = [n for n in self._connected_nodes if n != node_name]
            logger.info(f"已断开节点 {node_name} 的连接")

    def disconnect_all(self):
        """断开所有节点连接"""
        for node_name in list(self.clients.keys()):
            self.disconnect_node(node_name)
        self._connected_nodes.clear()
        logger.info("已断开所有节点连接")

    def get_client(self, node_name: str) -> Optional[SSHClientManager]:
        """获取节点客户端"""
        return self.clients.get(node_name)

    def smart_connect_nodes(
        self,
        nodes: List[NodeConfig],
        max_workers: int = 20,
        batch_size: int = 50,
        adaptive_concurrency: bool = True,
    ) -> List[ConnectionStatus]:
        """智能分片连接节点（大规模集群优化版）

        Args:
            nodes: 节点配置列表
            max_workers: 最大并发数
            batch_size: 每批处理的节点数
            adaptive_concurrency: 是否启用自适应并发

        Returns:
            连接状态列表
        """
        enabled_nodes = [n for n in nodes if n.enabled]
        if not enabled_nodes:
            return []

        all_results: List[ConnectionStatus] = []

        node_batches = self._shard_nodes(enabled_nodes, batch_size)
        logger.info(
            f"智能分片连接: {len(enabled_nodes)} 个节点分为 {len(node_batches)} 批, "
            f"每批最多 {batch_size} 个"
        )

        for i, batch in enumerate(node_batches, 1):
            batch_start = time.time()

            current_workers = self._calculate_adaptive_workers(
                len(batch), max_workers, all_results, adaptive_concurrency
            )

            logger.info(
                f"第 {i}/{len(node_batches)} 批: {len(batch)} 个节点, "
                f"并发数: {current_workers}"
            )

            batch_results = self.connect_nodes(batch, current_workers)
            all_results.extend(batch_results)

            batch_duration = time.time() - batch_start
            success = len([r for r in batch_results if r.connected])
            logger.info(
                f"第 {i} 批完成: {success}/{len(batch)} 成功, 耗时: {batch_duration:.2f}s"
            )

            if i < len(node_batches):
                time.sleep(0.1)

        return all_results

    def _shard_nodes(
        self, nodes: List[NodeConfig], batch_size: int
    ) -> List[List[NodeConfig]]:
        """智能节点分片

        按以下优先级分片:
        1. 按区域/可用区分组
        2. 按角色分组
        3. 最后按数量均衡分片
        """
        by_zone: Dict[str, List[NodeConfig]] = {}
        for node in nodes:
            zone = node.labels.get("zone", node.labels.get("region", "default"))
            if zone not in by_zone:
                by_zone[zone] = []
            by_zone[zone].append(node)

        shards: List[List[NodeConfig]] = []
        for zone, zone_nodes in by_zone.items():
            for i in range(0, len(zone_nodes), batch_size):
                shard = zone_nodes[i:i + batch_size]
                shards.append(shard)

        shards.sort(key=lambda x: len(x), reverse=True)
        return shards

    def _calculate_adaptive_workers(
        self,
        batch_size: int,
        max_workers: int,
        prev_results: List[ConnectionStatus],
        adaptive_enabled: bool,
    ) -> int:
        """计算自适应并发数

        根据历史连接成功率动态调整并发数
        """
        if not adaptive_enabled or not prev_results:
            return min(batch_size, max_workers)

        recent = prev_results[-20:] if len(prev_results) > 20 else prev_results
        if not recent:
            return min(batch_size, max_workers)

        success_rate = len([r for r in recent if r.connected]) / len(recent)

        if success_rate >= 0.95:
            workers = min(batch_size, max_workers, int(max_workers * 1.2))
        elif success_rate >= 0.8:
            workers = min(batch_size, max_workers)
        elif success_rate >= 0.5:
            workers = min(batch_size, int(max_workers * 0.7))
        else:
            workers = min(batch_size, int(max_workers * 0.4))

        return max(2, workers)

    def fast_execute_on_nodes(
        self,
        node_names: List[str],
        command: str,
        timeout: Optional[int] = None,
        max_workers: int = 20,
        use_cache: bool = True,
        cache_ttl: int = 30,
    ) -> Dict[str, Optional[CommandResult]]:
        """快速并行执行命令（带缓存和流水线优化）

        Args:
            node_names: 节点名称列表
            command: 要执行的命令
            timeout: 超时时间
            max_workers: 最大并发数
            use_cache: 是否使用结果缓存
            cache_ttl: 缓存有效期（秒）

        Returns:
            节点名称到执行结果的映射
        """
        if not hasattr(self, "_command_cache"):
            self._command_cache: Dict[str, tuple[float, CommandResult]] = {}

        results: Dict[str, Optional[CommandResult]] = {}
        cache_hits = 0
        to_execute = []

        cache_key = f"{command}:{timeout}"
        current_time = time.time()

        for node_name in node_names:
            if node_name not in self.clients:
                results[node_name] = None
                continue

            if use_cache:
                cache_entry_key = f"{node_name}:{cache_key}"
                if cache_entry_key in self._command_cache:
                    cache_time, cached_result = self._command_cache[cache_entry_key]
                    if current_time - cache_time < cache_ttl:
                        results[node_name] = cached_result
                        cache_hits += 1
                        continue

            to_execute.append(node_name)

        if cache_hits > 0:
            logger.debug(f"缓存命中: {cache_hits} 个节点")

        if to_execute:
            execute_results = self.execute_on_nodes(
                to_execute, command, timeout, max_workers
            )
            results.update(execute_results)

            if use_cache:
                for node_name, result in execute_results.items():
                    if result and result.success:
                        cache_entry_key = f"{node_name}:{cache_key}"
                        self._command_cache[cache_entry_key] = (current_time, result)

        return results

    def pipeline_execute(
        self,
        node_names: List[str],
        command_pipeline: List[str],
        max_workers: int = 20,
        stop_on_failure: bool = False,
    ) -> Dict[str, List[CommandResult]]:
        """流水线批量执行命令

        在多个节点上按顺序执行一组命令，支持流水线优化

        Args:
            node_names: 节点名称列表
            command_pipeline: 命令流水线
            max_workers: 最大并发数
            stop_on_failure: 失败时是否停止

        Returns:
            节点名称到执行结果列表的映射
        """
        results: Dict[str, List[CommandResult]] = {
            node: [] for node in node_names
        }
        available_nodes = [n for n in node_names if n in self.clients]

        for i, command in enumerate(command_pipeline, 1):
            logger.debug(f"执行流水线步骤 {i}/{len(command_pipeline)}: {command[:50]}...")

            step_results = self.execute_on_nodes(
                available_nodes, command, max_workers=max_workers
            )

            for node_name, result in step_results.items():
                if result:
                    results[node_name].append(result)

            if stop_on_failure:
                failed_nodes = [
                    n for n, r in step_results.items()
                    if r and not r.success
                ]
                for node in failed_nodes:
                    if node in available_nodes:
                        available_nodes.remove(node)
                        logger.warning(
                            f"节点 {node} 流水线步骤 {i} 失败，已排除"
                        )

                if not available_nodes:
                    logger.warning("所有节点流水线执行失败")
                    break

        return results

    def clear_cache(self):
        """清除命令执行缓存"""
        if hasattr(self, "_command_cache"):
            self._command_cache.clear()
            logger.debug("命令缓存已清除")

    def get_performance_stats(self) -> dict:
        """获取性能统计"""
        cache_size = getattr(self, "_command_cache", {}).__len__()
        return {
            "connected_nodes": len(self._connected_nodes),
            "total_clients": len(self.clients),
            "cache_size": cache_size,
        }

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect_all()
