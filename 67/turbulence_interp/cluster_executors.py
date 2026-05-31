import os
import logging
import time
import json
import threading
import tempfile
from typing import Optional, Dict, Any

from .task_base import Task, TaskResult, TaskExecutor, TaskStatus

logger = logging.getLogger(__name__)


class SSHConnectionMixin:
    def __init__(self, host: str, username: str, remote_workdir: str, port: int = 22,
                 connection_timeout: float = 30.0, max_retries: int = 3, retry_delay: float = 5.0):
        self.host = host
        self.username = username
        self.port = port
        self.remote_workdir = remote_workdir
        self.connection_timeout = connection_timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._ssh_client = None
        self._sftp_client = None
        self._lock = threading.Lock()

    def _connect(self):
        try:
            import paramiko
        except ImportError:
            raise ImportError("paramiko is required for SSH-based executors")
        
        if self._ssh_client is not None and self._ssh_client.get_transport() and self._ssh_client.get_transport().is_active():
            return
        
        with self._lock:
            if self._ssh_client is not None:
                self._disconnect()
            
            self._ssh_client = paramiko.SSHClient()
            self._ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            self._ssh_client.connect(
                self.host,
                port=self.port,
                username=self.username,
                timeout=self.connection_timeout,
                banner_timeout=self.connection_timeout,
                auth_timeout=self.connection_timeout,
            )
            self._sftp_client = self._ssh_client.open_sftp()

    def _disconnect(self):
        if self._sftp_client:
            try:
                self._sftp_client.close()
            except Exception:
                pass
            self._sftp_client = None
        if self._ssh_client:
            try:
                self._ssh_client.close()
            except Exception:
                pass
            self._ssh_client = None

    def _run_remote_command(self, command: str) -> tuple[str, str, int]:
        last_error = None
        for attempt in range(self.max_retries):
            try:
                self._connect()
                stdin, stdout, stderr = self._ssh_client.exec_command(
                    command,
                    timeout=self.connection_timeout
                )
                out = stdout.read().decode("utf-8")
                err = stderr.read().decode("utf-8")
                rc = stdout.channel.recv_exit_status()
                return out, err, rc
            except Exception as e:
                last_error = e
                logger.warning(f"Remote command attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                    self._disconnect()
                else:
                    raise

    def _check_result_file(self, task: Task) -> bool:
        remote_result_path = f"{self.remote_workdir}/{task.task_id}_result.pkl"
        
        try:
            stat = self._sftp_client.stat(remote_result_path)
            if stat.st_size > 0:
                logger.info(f"Result file for {task.task_id} exists, size: {stat.st_size} bytes")
                return True
            else:
                logger.warning(f"Result file for {task.task_id} is empty")
                return False
        except FileNotFoundError:
            logger.error(f"Result file for {task.task_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error checking result file for {task.task_id}: {e}")
            return False

    def _download_and_parse_result(self, task: Task) -> Optional[TaskResult]:
        remote_result_path = f"{self.remote_workdir}/{task.task_id}_result.pkl"
        local_result_path = os.path.join(tempfile.gettempdir(), f"{task.task_id}_result.pkl")

        last_error = None
        for attempt in range(self.max_retries):
            try:
                self._connect()
                self._sftp_client.get(remote_result_path, local_result_path)
                
                file_size = os.path.getsize(local_result_path)
                if file_size == 0:
                    raise ValueError("Downloaded result file is empty")
                
                import pickle
                with open(local_result_path, "rb") as f:
                    result = pickle.load(f)
                
                if os.path.exists(local_result_path):
                    try:
                        os.remove(local_result_path)
                    except Exception:
                        pass
                
                logger.info(f"Successfully retrieved result for {task.task_id}")
                return TaskResult(
                    task_id=task.task_id,
                    success=True,
                    result=result,
                )
            except Exception as e:
                last_error = e
                logger.warning(f"Result retrieval attempt {attempt + 1} for {task.task_id} failed: {e}")
                if os.path.exists(local_result_path):
                    try:
                        os.remove(local_result_path)
                    except Exception:
                        pass
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                    self._disconnect()
        
        task.status = TaskStatus.FAILED
        task.error = f"Failed to retrieve result after {self.max_retries} attempts: {last_error}"
        logger.error(task.error)
        return None

    def __del__(self):
        self._disconnect()


class SlurmExecutor(SSHConnectionMixin, TaskExecutor):
    def __init__(self, host: str, username: str, remote_workdir: str, port: int = 22,
                 partition: str = "compute", nodes: int = 1, tasks_per_node: int = 1,
                 connection_timeout: float = 30.0, max_retries: int = 3, retry_delay: float = 5.0):
        SSHConnectionMixin.__init__(
            self, host, username, remote_workdir, port,
            connection_timeout, max_retries, retry_delay
        )
        self.partition = partition
        self.nodes = nodes
        self.tasks_per_node = tasks_per_node
        self._job_ids: Dict[str, str] = {}

    def _generate_python_script(self, task: Task) -> str:
        args_json = json.dumps({
            "args": list(task.args),
            "kwargs": task.kwargs,
        })
        
        script = f"""
import json
import sys
import pickle
import base64
import traceback

try:
    args_data = json.loads({json.dumps(args_json)})

    func_code = args_data["kwargs"].pop("func_code", None)
    if func_code:
        exec(base64.b64decode(func_code).decode())
        func = locals()["task_func"]
        result = func(*args_data["args"], **args_data["kwargs"])
        with open("{task.task_id}_result.pkl", "wb") as f:
            pickle.dump(result, f)
        print("RESULT_PICKLE_WRITTEN_SUCCESSFULLY")
    else:
        print("NO_FUNC_CODE_PROVIDED")
except Exception as e:
    with open("{task.task_id}_error.log", "w") as f:
        f.write(f"Error: {{str(e)}}\\n")
        f.write(traceback.format_exc())
    print(f"ERROR: {{str(e)}}")
    sys.exit(1)
"""
        return script

    def _generate_slurm_script(self, task: Task) -> str:
        python_script = self._generate_python_script(task)
        
        remote_py_path = f"{self.remote_workdir}/{task.task_id}.py"
        with self._sftp_client.file(remote_py_path, "w") as f:
            f.write(python_script)
        
        script = f"""#!/bin/bash
#SBATCH --job-name={task.name}
#SBATCH --partition={self.partition}
#SBATCH --nodes={self.nodes}
#SBATCH --ntasks-per-node={self.tasks_per_node}
#SBATCH --output={self.remote_workdir}/{task.task_id}.out
#SBATCH --error={self.remote_workdir}/{task.task_id}.err
#SBATCH --time=24:00:00

cd {self.remote_workdir}
python {task.task_id}.py
EXIT_CODE=$?
echo "TASK_COMPLETED_WITH_EXIT_CODE: $EXIT_CODE" >> {task.task_id}.out
exit $EXIT_CODE
"""
        return script

    def submit(self, task: Task) -> bool:
        self._connect()
        
        try:
            job_script = self._generate_slurm_script(task)
            
            remote_script_path = f"{self.remote_workdir}/{task.task_id}.sh"
            
            with self._sftp_client.file(remote_script_path, "w") as f:
                f.write(job_script)
            
            self._run_remote_command(f"chmod +x {remote_script_path}")
            
            out, err, rc = self._run_remote_command(f"cd {self.remote_workdir} && sbatch {task.task_id}.sh")
            
            if rc == 0 and out.strip():
                job_id = out.strip().split()[-1]
                self._job_ids[task.task_id] = job_id
                task.status = TaskStatus.QUEUED
                logger.info(f"Submitted task {task.task_id} as SLURM job {job_id}")
                return True
            else:
                logger.error(f"Failed to submit task {task.task_id}: {err}")
                task.status = TaskStatus.FAILED
                task.error = err
                return False
        except Exception as e:
            logger.error(f"Exception submitting task {task.task_id}: {e}")
            task.status = TaskStatus.FAILED
            task.error = str(e)
            return False

    def monitor(self, task: Task) -> TaskStatus:
        job_id = self._job_ids.get(task.task_id)
        if not job_id:
            return task.status

        out, err, rc = self._run_remote_command(f"sacct -j {job_id} --format=State,ExitCode --noheader 2>/dev/null | head -1")
        
        if rc == 0 and out.strip():
            parts = out.strip().split()
            state = parts[0] if parts else "UNKNOWN"
            exit_code = parts[1] if len(parts) > 1 else "0:0"
            
            state_map = {
                "PENDING": TaskStatus.QUEUED,
                "RUNNING": TaskStatus.RUNNING,
                "COMPLETED": TaskStatus.COMPLETED,
                "FAILED": TaskStatus.FAILED,
                "CANCELLED": TaskStatus.CANCELLED,
                "TIMEOUT": TaskStatus.FAILED,
                "NODE_FAIL": TaskStatus.FAILED,
                "DEADLINE": TaskStatus.FAILED,
                "OUT_OF_MEMORY": TaskStatus.FAILED,
            }
            
            if state == "COMPLETED" and exit_code.startswith("0:"):
                task.status = TaskStatus.COMPLETED
            elif state in ["COMPLETED", "FAILED", "TIMEOUT", "NODE_FAIL", "DEADLINE", "OUT_OF_MEMORY"]:
                task.status = TaskStatus.FAILED
                if err:
                    task.error = err[:500]
                elif exit_code and not exit_code.startswith("0:"):
                    task.error = f"SLURM exit code: {exit_code}"
            else:
                task.status = state_map.get(state, task.status)
        
        return task.status

    def cancel(self, task: Task) -> bool:
        job_id = self._job_ids.get(task.task_id)
        if not job_id:
            return False

        out, err, rc = self._run_remote_command(f"scancel {job_id}")
        if rc == 0:
            task.status = TaskStatus.CANCELLED
            return True
        return False

    def get_result(self, task: Task) -> Optional[TaskResult]:
        if task.status != TaskStatus.COMPLETED:
            return None

        if not self._check_result_file(task):
            task.status = TaskStatus.FAILED
            task.error = "Result file missing or empty"
            return None

        return self._download_and_parse_result(task)


class SSHExecutor(SSHConnectionMixin, TaskExecutor):
    def __init__(self, host: str, username: str, remote_workdir: str, port: int = 22,
                 connection_timeout: float = 30.0, max_retries: int = 3, retry_delay: float = 5.0,
                 poll_interval: float = 10.0):
        SSHConnectionMixin.__init__(
            self, host, username, remote_workdir, port,
            connection_timeout, max_retries, retry_delay
        )
        self.poll_interval = poll_interval
        self._remote_pids: Dict[str, str] = {}

    def submit(self, task: Task) -> bool:
        self._connect()
        
        try:
            args_json = json.dumps({
                "args": list(task.args),
                "kwargs": task.kwargs,
            })
            
            remote_py_path = f"{self.remote_workdir}/{task.task_id}.py"
            python_script = f"""
import json
import sys
import pickle
import base64
import traceback

try:
    args_data = json.loads({json.dumps(args_json)})
    func_code = args_data["kwargs"].pop("func_code", None)
    if func_code:
        exec(base64.b64decode(func_code).decode())
        func = locals()["task_func"]
        result = func(*args_data["args"], **args_data["kwargs"])
        with open("{task.task_id}_result.pkl", "wb") as f:
            pickle.dump(result, f)
        print("SUCCESS")
    else:
        print("NO_FUNC")
except Exception as e:
    with open("{task.task_id}_error.log", "w") as f:
        f.write(f"Error: {{str(e)}}\\n")
        f.write(traceback.format_exc())
    print(f"ERROR: {{str(e)}}")
    sys.exit(1)
"""
            
            with self._sftp_client.file(remote_py_path, "w") as f:
                f.write(python_script)
            
            out, err, rc = self._run_remote_command(
                f"cd {self.remote_workdir} && nohup python {task.task_id}.py > {task.task_id}.out 2>&1 & echo $!"
            )
            
            if rc == 0 and out.strip():
                pid = out.strip()
                self._remote_pids[task.task_id] = pid
                task.status = TaskStatus.RUNNING
                logger.info(f"Submitted task {task.task_id} as SSH process PID {pid}")
                return True
            else:
                logger.error(f"Failed to submit task {task.task_id}: {err}")
                task.status = TaskStatus.FAILED
                task.error = err
                return False
        except Exception as e:
            logger.error(f"Exception submitting task {task.task_id}: {e}")
            task.status = TaskStatus.FAILED
            task.error = str(e)
            return False

    def monitor(self, task: Task) -> TaskStatus:
        pid = self._remote_pids.get(task.task_id)
        if not pid:
            return task.status

        if task.status == TaskStatus.COMPLETED:
            return task.status

        out, err, rc = self._run_remote_command(f"ps -p {pid} > /dev/null 2>&1; echo $?")
        
        if "1" in out.strip() or rc != 0:
            if self._check_result_file(task):
                task.status = TaskStatus.COMPLETED
            else:
                task.status = TaskStatus.FAILED
                task.error = "Process completed but no result found"
        
        return task.status

    def cancel(self, task: Task) -> bool:
        pid = self._remote_pids.get(task.task_id)
        if not pid:
            return False

        out, err, rc = self._run_remote_command(f"kill -9 {pid} 2>/dev/null; echo $?")
        if rc == 0 or "0" in out:
            task.status = TaskStatus.CANCELLED
            return True
        return False

    def get_result(self, task: Task) -> Optional[TaskResult]:
        if task.status != TaskStatus.COMPLETED:
            return None

        if not self._check_result_file(task):
            task.status = TaskStatus.FAILED
            task.error = "Result file missing or empty"
            return None

        return self._download_and_parse_result(task)
