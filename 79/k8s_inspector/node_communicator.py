import os
import time
import socket
import paramiko
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class SSHClient:
    def __init__(
        self,
        hostname: str,
        port: int = 22,
        username: str = "root",
        private_key_path: Optional[str] = None,
        timeout: int = 15,
        banner_timeout: int = 10,
        auth_timeout: int = 10,
        channel_timeout: int = 30,
        max_retries: int = 3,
        retry_delay: float = 2.0,
        tcp_keepalive: bool = True,
        tcp_keepalive_interval: int = 30,
        encoding: str = "utf-8",
    ):
        self.hostname = hostname
        self.port = port
        self.username = username
        self.private_key_path = private_key_path or os.path.expanduser("~/.ssh/id_rsa")
        self.timeout = timeout
        self.banner_timeout = banner_timeout
        self.auth_timeout = auth_timeout
        self.channel_timeout = channel_timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.tcp_keepalive = tcp_keepalive
        self.tcp_keepalive_interval = tcp_keepalive_interval
        self.encoding = encoding
        self.client: Optional[paramiko.SSHClient] = None

    def _load_private_key(self) -> paramiko.PKey:
        expanded_key_path = os.path.expanduser(self.private_key_path)
        key_loaders = [
            paramiko.RSAKey,
            paramiko.Ed25519Key,
            paramiko.ECDSAKey,
            paramiko.DSSKey,
        ]

        last_exception = None
        for key_loader in key_loaders:
            try:
                return key_loader.from_private_key_file(expanded_key_path)
            except Exception as e:
                last_exception = e
                continue

        raise ValueError(
            f"无法加载私钥文件 {expanded_key_path}: {last_exception}"
        )

    def _setup_tcp_keepalive(self, sock: socket.socket) -> None:
        if not self.tcp_keepalive:
            return
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        if hasattr(socket, "TCP_KEEPIDLE"):
            sock.setsockopt(
                socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, self.tcp_keepalive_interval
            )
        if hasattr(socket, "TCP_KEEPINTVL"):
            sock.setsockopt(
                socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, self.tcp_keepalive_interval
            )
        if hasattr(socket, "TCP_KEEPCNT"):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 5)

    def connect(self) -> None:
        last_exception = None

        for attempt in range(1, self.max_retries + 1):
            try:
                self.client = paramiko.SSHClient()
                self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                private_key = self._load_private_key()

                self.client.connect(
                    hostname=self.hostname,
                    port=self.port,
                    username=self.username,
                    pkey=private_key,
                    timeout=self.timeout,
                    banner_timeout=self.banner_timeout,
                    auth_timeout=self.auth_timeout,
                    look_for_keys=False,
                    allow_agent=False,
                    compress=True,
                )

                transport = self.client.get_transport()
                if transport and transport.sock:
                    self._setup_tcp_keepalive(transport.sock)

                logger.info(
                    f"SSH 连接成功: {self.username}@{self.hostname}:{self.port} "
                    f"(尝试 {attempt}/{self.max_retries})"
                )
                return

            except Exception as e:
                last_exception = e
                if self.client:
                    try:
                        self.client.close()
                    except:
                        pass
                    self.client = None

                if attempt < self.max_retries:
                    logger.warning(
                        f"SSH 连接失败 (尝试 {attempt}/{self.max_retries}): {e}, "
                        f"{self.retry_delay}秒后重试..."
                    )
                    time.sleep(self.retry_delay)
                else:
                    logger.error(
                        f"SSH 连接失败，已达到最大重试次数 {self.max_retries}: {e}"
                    )

        raise ConnectionError(
            f"无法连接到 {self.hostname}:{self.port}, 错误: {last_exception}"
        )

    def execute(
        self, command: str, encoding: Optional[str] = None
    ) -> Tuple[int, str, str]:
        if not self.client:
            raise ConnectionError("SSH 客户端未连接")

        use_encoding = encoding or self.encoding
        stdin, stdout, stderr = self.client.exec_command(
            command, timeout=self.channel_timeout
        )

        try:
            exit_code = stdout.channel.recv_exit_status()
            output_bytes = stdout.read()
            error_bytes = stderr.read()

            try:
                output = output_bytes.decode(use_encoding, errors="replace").strip()
            except:
                output = output_bytes.decode("latin-1", errors="replace").strip()

            try:
                error = error_bytes.decode(use_encoding, errors="replace").strip()
            except:
                error = error_bytes.decode("latin-1", errors="replace").strip()

            return exit_code, output, error

        except Exception as e:
            logger.error(f"执行命令失败: {command}, 错误: {e}")
            return -1, "", str(e)

    def close(self) -> None:
        if self.client:
            try:
                self.client.close()
            except:
                pass
            self.client = None
            logger.debug(f"SSH 连接已关闭: {self.hostname}")

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class NodeCommunicator:
    def __init__(self, ssh_config: Dict[str, Any]):
        self.ssh_config = ssh_config
        self.clients: Dict[str, SSHClient] = {}

    def create_client(self, node_address: str) -> SSHClient:
        return SSHClient(
            hostname=node_address,
            port=self.ssh_config.get("port", 22),
            username=self.ssh_config.get("username", "root"),
            private_key_path=self.ssh_config.get("private_key_path"),
            timeout=self.ssh_config.get("timeout", 15),
            banner_timeout=self.ssh_config.get("banner_timeout", 10),
            auth_timeout=self.ssh_config.get("auth_timeout", 10),
            channel_timeout=self.ssh_config.get("channel_timeout", 30),
            max_retries=self.ssh_config.get("max_retries", 3),
            retry_delay=self.ssh_config.get("retry_delay", 2.0),
            tcp_keepalive=self.ssh_config.get("tcp_keepalive", True),
            tcp_keepalive_interval=self.ssh_config.get("tcp_keepalive_interval", 30),
            encoding=self.ssh_config.get("encoding", "utf-8"),
        )

    def execute_on_node(
        self, node_address: str, command: str
    ) -> Dict[str, Any]:
        result = {
            "node": node_address,
            "success": False,
            "command": command,
            "exit_code": -1,
            "output": "",
            "error": "",
        }
        try:
            client = self.create_client(node_address)
            with client:
                exit_code, output, error = client.execute(command)
                result.update(
                    {
                        "success": exit_code == 0,
                        "exit_code": exit_code,
                        "output": output,
                        "error": error,
                    }
                )
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"节点 {node_address} 执行命令失败: {e}")
        return result

    def batch_execute(
        self,
        nodes: List[Dict[str, Any]],
        command: str,
        parallel: bool = True,
        max_workers: int = 10,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        node_addresses = [
            n.get("address", n.get("ip")) for n in nodes if n.get("address") or n.get("ip")
        ]

        if parallel and len(node_addresses) > 1:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_node = {
                    executor.submit(self.execute_on_node, addr, command): addr
                    for addr in node_addresses
                }
                for future in as_completed(future_to_node):
                    results.append(future.result())
        else:
            for addr in node_addresses:
                results.append(self.execute_on_node(addr, command))

        return results

    def batch_execute_with_context(
        self,
        nodes: List[Dict[str, Any]],
        command_generator: Callable[[Dict[str, Any]], str],
        parallel: bool = True,
        max_workers: int = 10,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        def _execute_for_node(node: Dict[str, Any]) -> Dict[str, Any]:
            addr = node.get("address", node.get("ip"))
            command = command_generator(node)
            result = self.execute_on_node(addr, command)
            result["node_info"] = node
            return result

        if parallel and len(nodes) > 1:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [executor.submit(_execute_for_node, node) for node in nodes]
                for future in as_completed(futures):
                    results.append(future.result())
        else:
            for node in nodes:
                results.append(_execute_for_node(node))

        return results
