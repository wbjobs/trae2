import time
import logging
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Optional, List

import paramiko

from config import NodeConfig

logger = logging.getLogger(__name__)


@dataclass
class CommandResult:
    host: str
    command: str
    stdout: str = ""
    stderr: str = ""
    exit_code: int = -1
    success: bool = False
    duration: float = 0.0
    error: Optional[str] = None
    retry_count: int = 0


class SSHSession:
    def __init__(
        self,
        node: NodeConfig,
        connect_timeout: int = 10,
        command_timeout: int = 30,
        max_retries: int = 3,
        retry_delay: float = 2.0,
        encoding: str = "utf-8",
    ):
        self.node = node
        self.connect_timeout = connect_timeout
        self.command_timeout = command_timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.encoding = encoding
        self._client: Optional[paramiko.SSHClient] = None
        self._last_activity: float = 0.0
        self._keepalive_interval: int = 30

    @property
    def is_connected(self) -> bool:
        if not self._client:
            return False
        transport = self._client.get_transport()
        if not transport or not transport.is_active():
            return False
        try:
            transport.send_ignore()
            return True
        except Exception:
            return False

    def _try_connect(self, use_key_first: bool = True) -> paramiko.SSHClient:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.load_system_host_keys()

        auth_methods = []
        if self.node.key_file and use_key_first:
            auth_methods.append(("key", self.node.key_file))
        if self.node.password:
            auth_methods.append(("password", self.node.password))
        if self.node.key_file and not use_key_first:
            auth_methods.append(("key", self.node.key_file))

        if not auth_methods:
            raise ConnectionError(f"节点 {self.node.host} 未配置密码或密钥文件")

        last_exception = None
        for method, credential in auth_methods:
            try:
                connect_kwargs = {
                    "hostname": self.node.host,
                    "port": self.node.port,
                    "username": self.node.username,
                    "timeout": self.connect_timeout,
                    "banner_timeout": self.connect_timeout * 2,
                    "auth_timeout": self.connect_timeout * 2,
                    "allow_agent": False,
                    "look_for_keys": False,
                    "compress": True,
                    "sock": None,
                }

                if method == "key":
                    connect_kwargs["key_filename"] = credential
                else:
                    connect_kwargs["password"] = credential

                client.connect(**connect_kwargs)

                transport = client.get_transport()
                if transport:
                    transport.set_keepalive(self._keepalive_interval)
                    transport.banner_timeout = self.connect_timeout * 3

                logger.debug(f"SSH连接成功 [{method}]: {self.node.host}")
                return client

            except paramiko.AuthenticationException as e:
                last_exception = e
                logger.debug(f"认证失败 [{method}]: {self.node.host} - {e}")
                continue
            except paramiko.SSHException as e:
                last_exception = e
                logger.debug(f"SSH协议错误 [{method}]: {self.node.host} - {e}")
                continue
            except socket.timeout as e:
                last_exception = e
                logger.debug(f"连接超时 [{method}]: {self.node.host} - {e}")
                continue
            except Exception as e:
                last_exception = e
                logger.debug(f"连接异常 [{method}]: {self.node.host} - {e}")
                continue

        if last_exception:
            raise last_exception
        raise ConnectionError(f"所有认证方式均失败: {self.node.host}")

    def connect(self) -> None:
        if self.is_connected:
            return

        last_exception = None
        for attempt in range(1, self.max_retries + 1):
            try:
                use_key_first = attempt <= self.max_retries // 2
                self._client = self._try_connect(use_key_first=use_key_first)
                self._last_activity = time.time()
                logger.info(f"SSH连接成功: {self.node.host} (尝试 {attempt}/{self.max_retries})")
                return
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries:
                    delay = self.retry_delay * attempt
                    logger.warning(
                        f"连接失败 (尝试 {attempt}/{self.max_retries}): {self.node.host} - {e}, "
                        f"{delay}秒后重试..."
                    )
                    time.sleep(delay)
                else:
                    logger.error(
                        f"连接最终失败 (已尝试 {self.max_retries} 次): {self.node.host} - {e}"
                    )

        if last_exception:
            raise ConnectionError(f"连接失败: {self.node.host} - {last_exception}")
        raise ConnectionError(f"连接失败: {self.node.host}")

    def _reconnect_if_needed(self) -> None:
        if not self.is_connected:
            logger.warning(f"连接已断开，正在重连: {self.node.host}")
            self._client = None
            self.connect()

    def execute(self, command: str, retries: int = None) -> CommandResult:
        if retries is None:
            retries = self.max_retries

        last_result = None
        for attempt in range(1, retries + 1):
            try:
                self._reconnect_if_needed()

                start = time.time()
                stdin, stdout, stderr = self._client.exec_command(
                    command,
                    timeout=self.command_timeout,
                    bufsize=4096,
                )
                exit_code = stdout.channel.recv_exit_status()

                out_bytes = stdout.read()
                err_bytes = stderr.read()

                try:
                    out = out_bytes.decode(self.encoding, errors="replace")
                except (UnicodeDecodeError, LookupError):
                    out = out_bytes.decode("utf-8", errors="replace")

                try:
                    err = err_bytes.decode(self.encoding, errors="replace")
                except (UnicodeDecodeError, LookupError):
                    err = err_bytes.decode("utf-8", errors="replace")

                duration = time.time() - start
                self._last_activity = time.time()

                result = CommandResult(
                    host=self.node.host,
                    command=command,
                    stdout=out.strip(),
                    stderr=err.strip(),
                    exit_code=exit_code,
                    success=(exit_code == 0),
                    duration=duration,
                    retry_count=attempt - 1,
                )

                if result.success or attempt >= retries:
                    return result

                last_result = result
                logger.debug(
                    f"命令执行失败重试 (尝试 {attempt}/{retries}): {self.node.host} - {command[:50]}..."
                )
                time.sleep(self.retry_delay)

            except (paramiko.SSHException, socket.error) as e:
                duration = time.time() - start if "start" in locals() else 0
                last_result = CommandResult(
                    host=self.node.host,
                    command=command,
                    exit_code=-1,
                    success=False,
                    duration=duration,
                    error=f"连接错误: {e}",
                    retry_count=attempt,
                )
                if attempt < retries:
                    logger.warning(f"连接异常，重试中 ({attempt}/{retries}): {self.node.host} - {e}")
                    self._client = None
                    time.sleep(self.retry_delay)
                else:
                    logger.error(f"命令执行最终失败: {self.node.host} - {command[:50]} - {e}")
                    return last_result
            except Exception as e:
                duration = time.time() - start if "start" in locals() else 0
                last_result = CommandResult(
                    host=self.node.host,
                    command=command,
                    exit_code=-1,
                    success=False,
                    duration=duration,
                    error=str(e),
                    retry_count=attempt,
                )
                if attempt >= retries:
                    return last_result
                time.sleep(self.retry_delay)

        return last_result or CommandResult(
            host=self.node.host,
            command=command,
            exit_code=-1,
            success=False,
            error="执行失败，无结果返回",
        )

    def execute_sudo(self, command: str, sudo_password: Optional[str] = None) -> CommandResult:
        if sudo_password is None:
            sudo_password = self.node.password

        sudo_cmd = f"sudo -S -p '' {command}"
        result = self.execute(sudo_cmd)

        if result.success:
            return result

        if sudo_password and "sudo:" in (result.stderr or ""):
            full_cmd = f"echo '{sudo_password}' | sudo -S -p '' {command}"
            return self.execute(full_cmd)

        return result

    def close(self) -> None:
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None
            logger.debug(f"SSH连接已关闭: {self.node.host}")


class ClusterCommunicator:
    def __init__(
        self,
        nodes: List[NodeConfig],
        connect_timeout: int = 10,
        command_timeout: int = 30,
        max_parallel: int = 5,
        max_retries: int = 3,
        retry_delay: float = 2.0,
        encoding: str = "utf-8",
    ):
        self.nodes = nodes
        self.connect_timeout = connect_timeout
        self.command_timeout = command_timeout
        self.max_parallel = max_parallel
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.encoding = encoding
        self._sessions: dict = {}
        self._failed_nodes: set = set()

    def _create_session(self, node: NodeConfig) -> SSHSession:
        session = SSHSession(
            node,
            connect_timeout=self.connect_timeout,
            command_timeout=self.command_timeout,
            max_retries=self.max_retries,
            retry_delay=self.retry_delay,
            encoding=self.encoding,
        )
        session.connect()
        return session

    def connect_all(self) -> dict:
        results = {}
        self._failed_nodes.clear()

        for node in self.nodes:
            try:
                session = self._create_session(node)
                self._sessions[node.host] = session
                results[node.host] = True
                logger.info(f"节点连接成功: {node.host}")
            except ConnectionError as e:
                logger.error(str(e))
                results[node.host] = False
                self._failed_nodes.add(node.host)

        success_count = sum(1 for v in results.values() if v)
        logger.info(f"批量连接完成: {success_count}/{len(self.nodes)} 节点成功")
        return results

    def execute_on_node(self, host: str, command: str) -> Optional[CommandResult]:
        if host in self._failed_nodes:
            logger.debug(f"跳过已标记为失败的节点: {host}")
            return None

        session = self._sessions.get(host)
        if not session:
            node = None
            for n in self.nodes:
                if n.host == host:
                    node = n
                    break

            if not node:
                logger.warning(f"节点未找到: {host}")
                return None

            try:
                session = self._create_session(node)
                self._sessions[host] = session
            except ConnectionError as e:
                logger.error(f"连接节点失败: {host} - {e}")
                self._failed_nodes.add(host)
                return None

        try:
            result = session.execute(command)
            if result.error and "连接错误" in result.error:
                self._failed_nodes.add(host)
            return result
        except Exception as e:
            logger.error(f"执行命令异常 {host}: {e}")
            return None

    def execute_on_all(self, command: str, show_progress: bool = True) -> List[CommandResult]:
        results = []
        total = len(self.nodes)

        for idx, node in enumerate(self.nodes, 1):
            if show_progress:
                logger.info(f"[{idx}/{total}] 执行命令: {node.host}")
            result = self.execute_on_node(node.host, command)
            if result:
                results.append(result)

        return results

    def execute_batch(self, host_command_map: dict) -> List[CommandResult]:
        results = []
        with ThreadPoolExecutor(max_workers=self.max_parallel) as executor:
            futures = {}
            for host, command in host_command_map.items():
                future = executor.submit(self.execute_on_node, host, command)
                futures[future] = host

            for future in as_completed(futures):
                result = future.result()
                if result:
                    results.append(result)
        return results

    def execute_parallel(self, command: str, show_progress: bool = True) -> List[CommandResult]:
        results = []
        total = len(self.nodes)

        with ThreadPoolExecutor(max_workers=self.max_parallel) as executor:
            futures = {}
            for node in self.nodes:
                future = executor.submit(self.execute_on_node, node.host, command)
                futures[future] = node.host

            completed = 0
            for future in as_completed(futures):
                result = future.result()
                completed += 1
                if result and show_progress:
                    logger.debug(f"[{completed}/{total}] 完成: {result.host}")
                if result:
                    results.append(result)

        return results

    def get_failed_nodes(self) -> List[str]:
        return list(self._failed_nodes)

    def get_successful_nodes(self) -> List[str]:
        return [n.host for n in self.nodes if n.host not in self._failed_nodes]

    def reset_failed_nodes(self) -> None:
        self._failed_nodes.clear()
        for host in list(self._sessions.keys()):
            session = self._sessions.pop(host)
            session.close()

    def close_all(self) -> None:
        for session in self._sessions.values():
            session.close()
        self._sessions.clear()
        self._failed_nodes.clear()

    def __enter__(self):
        self.connect_all()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close_all()