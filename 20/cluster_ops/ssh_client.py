import time
import socket
import threading
import select
import re
import chardet
from typing import Optional, Tuple, Dict, Any
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError
from dataclasses import dataclass

import paramiko
from paramiko.ssh_exception import (
    SSHException,
    AuthenticationException,
    NoValidConnectionsError,
)

from .config import ServerConfig, config_manager
from .logger import execution_logger


UPLOAD_MAX_RETRIES = 2
UPLOAD_RETRY_DELAY = 1
COMMAND_BUFFER_SIZE = 4096
CHANNEL_READ_TIMEOUT = 2


def _decode_output(raw_data: bytes) -> str:
    if not raw_data:
        return ""
    detected = chardet.detect(raw_data)
    encoding = detected.get("encoding") or "utf-8"
    confidence = detected.get("confidence", 0)
    if confidence < 0.7:
        for enc in ["utf-8", "gbk", "gb2312", "gb18030", "latin-1", "cp1252"]:
            try:
                return raw_data.decode(enc)
            except (UnicodeDecodeError, LookupError):
                continue
        return raw_data.decode("utf-8", errors="replace")
    try:
        return raw_data.decode(encoding, errors="replace")
    except (UnicodeDecodeError, LookupError):
        return raw_data.decode("utf-8", errors="replace")


def _clean_console_text(text: str) -> str:
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)


@dataclass
class SSHResult:
    server_name: str
    command: str
    stdout: str
    stderr: str
    exit_code: int
    success: bool
    duration: float
    error: Optional[str] = None


class SSHClient:
    def __init__(self, server_config: ServerConfig):
        self.config = server_config
        self.client: Optional[paramiko.SSHClient] = None
        self.sftp: Optional[paramiko.SFTPClient] = None
        self._sftp_client: Optional[paramiko.SSHClient] = None
        self.logger = execution_logger.get_logger(f"ssh.{server_config.name}")
        self.ssh_config = config_manager.config.ssh
        self._lock = threading.Lock()

    def connect(self) -> bool:
        retries = 0
        while retries < self.ssh_config.max_retries:
            try:
                if self.client:
                    try:
                        self.client.close()
                    except Exception:
                        pass

                self.client = paramiko.SSHClient()
                self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

                connect_kwargs: Dict[str, Any] = {
                    "hostname": self.config.host,
                    "port": self.config.port,
                    "username": self.config.username,
                    "timeout": self.ssh_config.timeout,
                    "banner_timeout": self.ssh_config.timeout,
                    "auth_timeout": self.ssh_config.timeout,
                    "allow_agent": self.ssh_config.allow_agent,
                    "look_for_keys": self.ssh_config.look_for_keys,
                }

                if self.config.password:
                    connect_kwargs["password"] = self.config.password
                elif self.config.private_key:
                    key_path = Path(self.config.private_key).expanduser()
                    if key_path.exists():
                        private_key = paramiko.RSAKey.from_private_key_file(
                            str(key_path),
                            password=self.config.private_key_passphrase
                        )
                        connect_kwargs["pkey"] = private_key
                        connect_kwargs["look_for_keys"] = False

                self.client.connect(**connect_kwargs)

                transport = self.client.get_transport()
                if transport:
                    transport.set_keepalive(30)

                self.logger.info(f"Connected to {self.config.host}:{self.config.port}")
                return True

            except AuthenticationException as e:
                self.logger.error(f"Authentication failed: {e}")
                if retries >= self.ssh_config.max_retries - 1:
                    raise
            except NoValidConnectionsError as e:
                self.logger.error(f"Connection failed: {e}")
            except socket.timeout:
                self.logger.error(f"Connection timeout after {self.ssh_config.timeout}s")
            except SSHException as e:
                self.logger.error(f"SSH error: {e}")
            except Exception as e:
                self.logger.error(f"Unexpected error: {e}")

            retries += 1
            if retries < self.ssh_config.max_retries:
                time.sleep(self.ssh_config.retry_delay)
                self.logger.info(f"Retrying connection ({retries}/{self.ssh_config.max_retries})...")

        return False

    def _ensure_connected(self, require_sftp: bool = False) -> bool:
        with self._lock:
            if not self.client or not self.client.get_transport() or not self.client.get_transport().is_active():
                if not self.connect():
                    return False

            if require_sftp and not self.sftp:
                try:
                    self.sftp = self.client.open_sftp()
                except Exception as e:
                    self.logger.error(f"Failed to open SFTP session: {e}")
                    return False
            return True

    def _read_channel_nonblocking(
        self,
        stdout_channel,
        stderr_channel,
        timeout: float
    ) -> Tuple[str, str, int]:
        stdout_chunks: list = []
        stderr_chunks: list = []
        exit_code = -1

        deadline = time.time() + timeout
        stdout_closed = False
        stderr_closed = False

        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                break

            try:
                if not stdout_closed and stdout_channel.recv_ready():
                    chunk = stdout_channel.recv(COMMAND_BUFFER_SIZE)
                    if chunk:
                        stdout_chunks.append(chunk)
                    else:
                        stdout_closed = True
                elif not stdout_closed and stdout_channel.exit_status_ready():
                    if not stdout_channel.recv_ready():
                        stdout_closed = True

                if not stderr_closed and stderr_channel.recv_stderr_ready():
                    chunk = stderr_channel.recv_stderr(COMMAND_BUFFER_SIZE)
                    if chunk:
                        stderr_chunks.append(chunk)
                    else:
                        stderr_closed = True
                elif not stderr_closed and stdout_channel.exit_status_ready():
                    stderr_closed = True

                if stdout_channel.exit_status_ready():
                    exit_code = stdout_channel.recv_exit_status()
                    stdout_closed = True
                    stderr_closed = True
                    break

                if stdout_closed and stderr_closed:
                    if stdout_channel.exit_status_ready():
                        exit_code = stdout_channel.recv_exit_status()
                    break

                time.sleep(0.05)

            except socket.timeout:
                break
            except Exception:
                break

        stdout_raw = b"".join(stdout_chunks)
        stderr_raw = b"".join(stderr_chunks)

        stdout_str = _decode_output(stdout_raw)
        stderr_str = _decode_output(stderr_raw)

        return stdout_str, stderr_str, exit_code

    def execute(self, command: str, timeout: Optional[int] = None) -> SSHResult:
        start_time = time.time()
        exit_code = -1
        stdout_str = ""
        stderr_str = ""
        success = False
        error = None

        with self._lock:
            if not self._ensure_connected():
                duration = time.time() - start_time
                return SSHResult(
                    server_name=self.config.name,
                    command=command,
                    stdout="",
                    stderr="",
                    exit_code=-1,
                    success=False,
                    duration=duration,
                    error="SSH connection not available"
                )

            try:
                cmd_timeout = (timeout or self.ssh_config.timeout) * 3
                transport = self.client.get_transport()
                if not transport:
                    raise SSHException("No transport available")

                channel = transport.open_session(timeout=cmd_timeout)
                channel.get_pty()
                channel.settimeout(CHANNEL_READ_TIMEOUT)

                channel.exec_command(command)

                stdout_str, stderr_str, exit_code = self._read_channel_nonblocking(
                    channel, channel, cmd_timeout
                )

                try:
                    if not channel.exit_status_ready():
                        remaining = cmd_timeout - (time.time() - start_time)
                        if remaining > 0:
                            try:
                                channel.status_event.wait(timeout=remaining)
                            except Exception:
                                pass
                    if channel.exit_status_ready():
                        exit_code = channel.recv_exit_status()
                except Exception:
                    pass

                try:
                    if not stdout_str:
                        remaining = cmd_timeout - (time.time() - start_time)
                        while remaining > 0 and channel.recv_ready():
                            chunk = channel.recv(COMMAND_BUFFER_SIZE)
                            if chunk:
                                stdout_str += _decode_output(chunk)
                            remaining = cmd_timeout - (time.time() - start_time)
                except Exception:
                    pass

                try:
                    channel.close()
                except Exception:
                    pass

                success = exit_code == 0

                if success:
                    self.logger.debug(f"Command succeeded: {command}")
                else:
                    self.logger.warning(f"Command failed (exit {exit_code}): {command}")

            except socket.timeout:
                error = f"Command timeout after {timeout or self.ssh_config.timeout}s"
                self.logger.error(error)
            except SSHException as e:
                error = f"SSH error: {str(e)}"
                self.logger.error(error)
            except Exception as e:
                error = f"Unexpected error: {str(e)}"
                self.logger.error(error)

            duration = time.time() - start_time
            return SSHResult(
                server_name=self.config.name,
                command=command,
                stdout=stdout_str,
                stderr=stderr_str,
                exit_code=exit_code,
                success=success and not error,
                duration=duration,
                error=error
            )

    def _get_sftp_session(self) -> paramiko.SFTPClient:
        with self._lock:
            if not self.sftp or not self.client or not self.client.get_transport() or not self.client.get_transport().is_active():
                if self._sftp_client:
                    try:
                        self._sftp_client.close()
                    except Exception:
                        pass

                self._sftp_client = paramiko.SSHClient()
                self._sftp_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

                connect_kwargs: Dict[str, Any] = {
                    "hostname": self.config.host,
                    "port": self.config.port,
                    "username": self.config.username,
                    "timeout": self.ssh_config.timeout,
                    "banner_timeout": self.ssh_config.timeout,
                    "auth_timeout": self.ssh_config.timeout,
                    "allow_agent": self.ssh_config.allow_agent,
                    "look_for_keys": self.ssh_config.look_for_keys,
                }

                if self.config.password:
                    connect_kwargs["password"] = self.config.password
                elif self.config.private_key:
                    key_path = Path(self.config.private_key).expanduser()
                    if key_path.exists():
                        private_key = paramiko.RSAKey.from_private_key_file(
                            str(key_path),
                            password=self.config.private_key_passphrase
                        )
                        connect_kwargs["pkey"] = private_key
                        connect_kwargs["look_for_keys"] = False

                self._sftp_client.connect(**connect_kwargs)
                self.sftp = self._sftp_client.open_sftp()

        return self.sftp

    def upload_file(self, local_path: str, remote_path: str) -> bool:
        retry_count = 0
        last_error = None

        while retry_count <= UPLOAD_MAX_RETRIES:
            try:
                local = Path(local_path)
                if not local.exists():
                    self.logger.error(f"Local file not found: {local_path}")
                    return False

                sftp = self._get_sftp_session()
                self._ensure_remote_path_sftp(sftp, remote_path)

                file_size = local.stat().st_size
                self.logger.info(f"Uploading {local_path} ({file_size} bytes) -> {remote_path}")

                sftp.put(str(local), remote_path)

                try:
                    remote_stat = sftp.stat(remote_path)
                    if remote_stat.st_size != file_size:
                        raise IOError(f"Size mismatch: local={file_size}, remote={remote_stat.st_size}")
                except Exception:
                    pass

                self.logger.info(f"Uploaded {local_path} -> {remote_path}")
                return True

            except Exception as e:
                last_error = e
                retry_count += 1
                self.logger.warning(f"Upload attempt {retry_count}/{UPLOAD_MAX_RETRIES + 1} failed: {e}")

                if retry_count <= UPLOAD_MAX_RETRIES:
                    time.sleep(UPLOAD_RETRY_DELAY)
                    try:
                        if self.sftp:
                            self.sftp.close()
                        self.sftp = None
                    except Exception:
                        pass

        self.logger.error(f"Upload failed after {UPLOAD_MAX_RETRIES + 1} attempts: {last_error}")
        return False

    def _ensure_remote_path_sftp(self, sftp: paramiko.SFTPClient, remote_path: str) -> None:
        dir_path = str(Path(remote_path).parent)
        if not dir_path or dir_path == ".":
            return

        parts = Path(dir_path).parts
        current = ""
        for part in parts:
            if not part or part in ("/", "\\"):
                current = "/"
                continue
            current = str(Path(current) / part) if current != "/" else "/" + part
            try:
                sftp.stat(current)
            except FileNotFoundError:
                try:
                    sftp.mkdir(current)
                except IOError:
                    pass

    def download_file(self, remote_path: str, local_path: str) -> bool:
        try:
            sftp = self._get_sftp_session()
            local = Path(local_path)
            local.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(remote_path, str(local))
            self.logger.info(f"Downloaded {remote_path} -> {local_path}")
            return True

        except Exception as e:
            self.logger.error(f"Download failed: {e}")
            return False

    def close(self) -> None:
        if self.sftp:
            try:
                self.sftp.close()
            except Exception:
                pass
            self.sftp = None

        if self._sftp_client:
            try:
                self._sftp_client.close()
            except Exception:
                pass
            self._sftp_client = None

        if self.client:
            try:
                self.client.close()
            except Exception:
                pass
            self.client = None

        self.logger.debug("Connection closed")

    def __enter__(self) -> 'SSHClient':
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()


class SSHCluster:
    def __init__(self, servers: list):
        self.servers = servers
        self.clients: Dict[str, SSHClient] = {}
        self.logger = execution_logger.get_logger("cluster")
        self.max_workers = config_manager.config.default_parallel
        self._cluster_lock = threading.Lock()

    def _get_or_create_client(self, server: ServerConfig) -> SSHClient:
        with self._cluster_lock:
            if server.name not in self.clients:
                self.clients[server.name] = SSHClient(server)
            return self.clients[server.name]

    def execute(
        self,
        command: str,
        servers: Optional[list] = None,
        parallel: Optional[int] = None
    ) -> Dict[str, SSHResult]:
        target_servers = servers or self.servers
        results: Dict[str, SSHResult] = {}
        workers = min(parallel or self.max_workers, len(target_servers))

        self.logger.info(f"Executing command on {len(target_servers)} servers (parallel={workers}): {command[:80]}...")

        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_server = {}
            for server in target_servers:
                client = self._get_or_create_client(server)
                future = executor.submit(client.execute, command)
                future_to_server[future] = server.name

            for future in as_completed(future_to_server):
                server_name = future_to_server[future]
                try:
                    results[server_name] = future.result(
                        timeout=self._get_effective_timeout() * 3
                    )
                except FutureTimeoutError:
                    self.logger.error(f"[{server_name}] Execution timed out")
                    results[server_name] = SSHResult(
                        server_name=server_name,
                        command=command,
                        stdout="",
                        stderr="Execution timed out",
                        exit_code=-1,
                        success=False,
                        duration=0,
                        error="Execution timed out"
                    )
                except Exception as e:
                    self.logger.error(f"[{server_name}] Execution error: {e}")
                    results[server_name] = SSHResult(
                        server_name=server_name,
                        command=command,
                        stdout="",
                        stderr=str(e),
                        exit_code=-1,
                        success=False,
                        duration=0,
                        error=str(e)
                    )

        return results

    def upload(
        self,
        local_path: str,
        remote_path: str,
        servers: Optional[list] = None,
        parallel: Optional[int] = None
    ) -> Dict[str, bool]:
        target_servers = servers or self.servers
        results: Dict[str, bool] = {}
        workers = min(parallel or self.max_workers, len(target_servers))

        file_size = Path(local_path).stat().st_size if Path(local_path).exists() else 0
        self.logger.info(
            f"Uploading {local_path} ({file_size} bytes) to {len(target_servers)} servers "
            f"(parallel={workers}) -> {remote_path}"
        )

        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_server = {}
            for server in target_servers:
                client = self._get_or_create_client(server)
                future = executor.submit(client.upload_file, local_path, remote_path)
                future_to_server[future] = server.name

            for future in as_completed(future_to_server):
                server_name = future_to_server[future]
                try:
                    results[server_name] = future.result(
                        timeout=self._get_effective_timeout() * 5
                    )
                except FutureTimeoutError:
                    self.logger.error(f"[{server_name}] Upload timed out")
                    results[server_name] = False
                except Exception as e:
                    self.logger.error(f"[{server_name}] Upload error: {e}")
                    results[server_name] = False

        return results

    def _get_effective_timeout(self) -> int:
        return config_manager.config.ssh.timeout

    def close_all(self) -> None:
        for client in self.clients.values():
            client.close()
        self.clients.clear()

    def __enter__(self) -> 'SSHCluster':
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close_all()
