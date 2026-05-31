import os
import time
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
from dataclasses import dataclass, field
from enum import Enum
import tempfile

from config import HPCConfig
from utils import setup_logger, generate_task_id, save_json, ensure_directory

logger = setup_logger("hpc_client")


class JobState(Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"
    NODE_FAIL = "NODE_FAIL"


@dataclass
class HPCJob:
    job_id: str
    remote_job_id: Optional[str] = None
    name: str = ""
    state: JobState = JobState.PENDING
    nodes: int = 1
    ntasks_per_node: int = 16
    walltime: str = "02:00:00"
    memory: str = "32G"
    queue: str = "normal"
    script_path: Optional[str] = None
    stdout_path: Optional[str] = None
    stderr_path: Optional[str] = None
    submit_time: Optional[float] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    exit_code: Optional[int] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "remote_job_id": self.remote_job_id,
            "name": self.name,
            "state": self.state.value,
            "nodes": self.nodes,
            "ntasks_per_node": self.ntasks_per_node,
            "walltime": self.walltime,
            "memory": self.memory,
            "queue": self.queue,
            "script_path": self.script_path,
            "stdout_path": self.stdout_path,
            "stderr_path": self.stderr_path,
            "submit_time": self.submit_time,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "exit_code": self.exit_code,
            "error_message": self.error_message,
            "metadata": self.metadata
        }


class HPCClient:
    def __init__(self, config: HPCConfig):
        self.config = config
        self._ssh_client = None
        self._sftp_client = None
        self._jobs: Dict[str, HPCJob] = {}

    def _connect(self) -> None:
        if self._ssh_client is not None:
            return

        try:
            import paramiko
        except ImportError:
            raise ImportError("paramiko is required for HPC communication")

        self._ssh_client = paramiko.SSHClient()
        self._ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        connect_kwargs = {
            "hostname": self.config.host,
            "port": self.config.port,
            "username": self.config.username,
            "timeout": 30,
        }

        if self.config.ssh_key_path:
            connect_kwargs["key_filename"] = self.config.ssh_key_path

        self._ssh_client.connect(**connect_kwargs)
        self._sftp_client = self._ssh_client.open_sftp()
        logger.info(f"Connected to HPC {self.config.host}")

    def close(self) -> None:
        if self._sftp_client:
            self._sftp_client.close()
            self._sftp_client = None
        if self._ssh_client:
            self._ssh_client.close()
            self._ssh_client = None
        logger.info("Disconnected from HPC")

    def __enter__(self):
        self._connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def _execute_remote_command(self, command: str, timeout: int = 60) -> tuple[str, str, int]:
        if self._ssh_client is None:
            self._connect()

        stdin, stdout, stderr = self._ssh_client.exec_command(command, timeout=timeout)
        stdout_str = stdout.read().decode("utf-8")
        stderr_str = stderr.read().decode("utf-8")
        exit_code = stdout.channel.recv_exit_status()

        return stdout_str, stderr_str, exit_code

    def _upload_file(self, local_path: Union[str, Path], remote_path: str) -> None:
        if self._sftp_client is None:
            self._connect()
        local_path = Path(local_path)
        self._sftp_client.put(str(local_path), remote_path)
        logger.debug(f"Uploaded {local_path} -> {remote_path}")

    def _download_file(self, remote_path: str, local_path: Union[str, Path]) -> None:
        if self._sftp_client is None:
            self._connect()
        local_path = Path(local_path)
        ensure_directory(local_path.parent)
        self._sftp_client.get(remote_path, str(local_path))
        logger.debug(f"Downloaded {remote_path} -> {local_path}")

    def _generate_slurm_script(
        self,
        job: HPCJob,
        command: str,
        modules: Optional[List[str]] = None
    ) -> str:
        lines = [
            "#!/bin/bash",
            f"#SBATCH --job-name={job.name}",
            f"#SBATCH --nodes={job.nodes}",
            f"#SBATCH --ntasks-per-node={job.ntasks_per_node}",
            f"#SBATCH --time={job.walltime}",
            f"#SBATCH --mem={job.memory}",
            f"#SBATCH --partition={job.queue}",
            f"#SBATCH --output={job.stdout_path or f'{job.name}_%j.out'}",
            f"#SBATCH --error={job.stderr_path or f'{job.name}_%j.err'}",
            "",
            "# Load modules",
        ]

        if modules:
            for module in modules:
                lines.append(f"module load {module}")

        lines.extend([
            "",
            "# Set working directory",
            f"cd {self.config.remote_workdir}",
            "",
            "# Run command",
            command,
            "",
            "exit $?"
        ])

        return "\n".join(lines)

    def _generate_pbs_script(
        self,
        job: HPCJob,
        command: str,
        modules: Optional[List[str]] = None
    ) -> str:
        lines = [
            "#!/bin/bash",
            f"#PBS -N {job.name}",
            f"#PBS -l nodes={job.nodes}:ppn={job.ntasks_per_node}",
            f"#PBS -l walltime={job.walltime}",
            f"#PBS -l mem={job.memory}",
            f"#PBS -q {job.queue}",
            f"#PBS -o {job.stdout_path or f'{job.name}_$PBS_JOBID.out'}",
            f"#PBS -e {job.stderr_path or f'{job.name}_$PBS_JOBID.err'}",
            "",
            "# Load modules",
        ]

        if modules:
            for module in modules:
                lines.append(f"module load {module}")

        lines.extend([
            "",
            "# Set working directory",
            f"cd {self.config.remote_workdir}",
            "",
            "# Run command",
            command,
            "",
            "exit $?"
        ])

        return "\n".join(lines)

    def submit_job(
        self,
        command: str,
        name: str = "ocean_interp",
        modules: Optional[List[str]] = None,
        local_files: Optional[List[Union[str, Path]]] = None,
        **kwargs
    ) -> str:
        job_id = generate_task_id("hpc")
        job = HPCJob(
            job_id=job_id,
            name=name,
            nodes=kwargs.get("nodes", self.config.nodes),
            ntasks_per_node=kwargs.get("ntasks_per_node", self.config.ntasks_per_node),
            walltime=kwargs.get("walltime", self.config.walltime),
            memory=kwargs.get("memory", self.config.memory),
            queue=kwargs.get("queue", "normal"),
        )

        script_name = f"{job.name}_{job_id[:8]}.sh"
        remote_script_path = f"{self.config.remote_workdir}/{script_name}"
        job.script_path = remote_script_path
        job.stdout_path = f"{self.config.remote_workdir}/{job.name}_{job_id[:8]}.out"
        job.stderr_path = f"{self.config.remote_workdir}/{job.name}_{job_id[:8]}.err"

        if self.config.scheduler == "slurm":
            script_content = self._generate_slurm_script(job, command, modules)
        elif self.config.scheduler == "pbs":
            script_content = self._generate_pbs_script(job, command, modules)
        else:
            raise ValueError(f"Unsupported scheduler: {self.config.scheduler}")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False) as f:
            f.write(script_content)
            local_script_path = f.name

        try:
            self._execute_remote_command(f"mkdir -p {self.config.remote_workdir}")
            self._upload_file(local_script_path, remote_script_path)

            if local_files:
                for local_file in local_files:
                    local_path = Path(local_file)
                    remote_path = f"{self.config.remote_workdir}/{local_path.name}"
                    self._upload_file(local_path, remote_path)

            self._execute_remote_command(f"chmod +x {remote_script_path}")

            if self.config.scheduler == "slurm":
                submit_cmd = f"sbatch {remote_script_path}"
            elif self.config.scheduler == "pbs":
                submit_cmd = f"qsub {remote_script_path}"
            else:
                raise ValueError(f"Unsupported scheduler: {self.config.scheduler}")

            stdout, stderr, exit_code = self._execute_remote_command(submit_cmd)

            if exit_code != 0:
                raise RuntimeError(f"Job submission failed: {stderr}")

            if self.config.scheduler == "slurm":
                remote_job_id = stdout.strip().split()[-1]
            elif self.config.scheduler == "pbs":
                remote_job_id = stdout.strip().split(".")[0]
            else:
                remote_job_id = stdout.strip()

            job.remote_job_id = remote_job_id
            job.submit_time = time.time()
            self._jobs[job_id] = job

            logger.info(f"Submitted job {job_id} -> remote_id={remote_job_id}")
            return job_id

        finally:
            os.unlink(local_script_path)

    def get_job_status(self, job_id: str) -> Optional[HPCJob]:
        job = self._jobs.get(job_id)
        if job is None:
            return None

        if job.remote_job_id is None:
            return job

        if self.config.scheduler == "slurm":
            cmd = f"squeue -j {job.remote_job_id} -h -o %T 2>/dev/null || sacct -j {job.remote_job_id} -h -o State | head -1"
        elif self.config.scheduler == "pbs":
            cmd = f"qstat -f {job.remote_job_id} | grep job_state | awk '{{print $3}}'"
        else:
            raise ValueError(f"Unsupported scheduler: {self.config.scheduler}")

        stdout, stderr, exit_code = self._execute_remote_command(cmd)

        if exit_code == 0 and stdout.strip():
            state_str = stdout.strip().split()[0]
            if self.config.scheduler == "slurm":
                state_map = {
                    "PENDING": JobState.PENDING,
                    "RUNNING": JobState.RUNNING,
                    "COMPLETED": JobState.COMPLETED,
                    "FAILED": JobState.FAILED,
                    "CANCELLED": JobState.CANCELLED,
                    "TIMEOUT": JobState.TIMEOUT,
                    "NODE_FAIL": JobState.NODE_FAIL,
                }
            else:
                state_map = {
                    "Q": JobState.PENDING,
                    "R": JobState.RUNNING,
                    "C": JobState.COMPLETED,
                    "F": JobState.FAILED,
                }

            job.state = state_map.get(state_str, JobState.PENDING)

            if job.state in [JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED, JobState.TIMEOUT, JobState.NODE_FAIL]:
                job.end_time = time.time()

        return job

    def cancel_job(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if job is None or job.remote_job_id is None:
            return False

        if self.config.scheduler == "slurm":
            cmd = f"scancel {job.remote_job_id}"
        elif self.config.scheduler == "pbs":
            cmd = f"qdel {job.remote_job_id}"
        else:
            raise ValueError(f"Unsupported scheduler: {self.config.scheduler}")

        stdout, stderr, exit_code = self._execute_remote_command(cmd)
        success = exit_code == 0

        if success:
            job.state = JobState.CANCELLED
            job.end_time = time.time()
            logger.info(f"Cancelled job {job_id}")

        return success

    def get_job_output(
        self,
        job_id: str,
        local_dir: Union[str, Path],
        remote_output_dir: Optional[str] = None,
        file_patterns: Optional[List[str]] = None,
        max_retries: int = 3,
        verify_checksum: bool = True
    ) -> Dict[str, Any]:
        job = self._jobs.get(job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        local_dir = Path(local_dir)
        ensure_directory(local_dir)

        results = {
            "job_id": job_id,
            "downloaded_files": [],
            "failed_files": [],
            "total_size_mb": 0.0,
        }

        default_patterns = [
            "*.nc", "*.csv", "*.json", "*.txt",
            "*.h5", "*.parquet", "*.mat", "*.tar", "*.zip",
            "output*", "result*", "*.out", "*.err"
        ]
        patterns = file_patterns or default_patterns
        remote_output_dir = remote_output_dir or self.config.remote_workdir

        if job.stdout_path:
            local_stdout = local_dir / f"{job.name}_stdout.txt"
            success, local_path, file_size = self._safe_download(
                job.stdout_path, local_stdout, max_retries, verify_checksum
            )
            if success:
                results["downloaded_files"].append({
                    "remote_path": job.stdout_path,
                    "local_path": str(local_path),
                    "size_mb": file_size
                })
                results["total_size_mb"] += file_size
                try:
                    with open(local_path, "r", encoding="utf-8", errors="replace") as f:
                        results["stdout"] = f.read()
                except Exception as e:
                    results["stdout_read_error"] = str(e)
            else:
                results["failed_files"].append(job.stdout_path)

        if job.stderr_path:
            local_stderr = local_dir / f"{job.name}_stderr.txt"
            success, local_path, file_size = self._safe_download(
                job.stderr_path, local_stderr, max_retries, verify_checksum
            )
            if success:
                results["downloaded_files"].append({
                    "remote_path": job.stderr_path,
                    "local_path": str(local_path),
                    "size_mb": file_size
                })
                results["total_size_mb"] += file_size
                try:
                    with open(local_path, "r", encoding="utf-8", errors="replace") as f:
                        results["stderr"] = f.read()
                except Exception as e:
                    results["stderr_read_error"] = str(e)
            else:
                results["failed_files"].append(job.stderr_path)

        find_cmd = f"find {remote_output_dir} -maxdepth 3 -type f \\( "
        find_cmd += " -o ".join([f"-name '{p}'" for p in patterns])
        find_cmd += " \\) 2>/dev/null"

        try:
            stdout, stderr, exit_code = self._execute_remote_command(find_cmd, timeout=30)
            if exit_code == 0 and stdout.strip():
                remote_files = [f.strip() for f in stdout.strip().split("\n") if f.strip()]
                logger.info(f"Found {len(remote_files)} remote output files to download")

                for remote_file in remote_files:
                    if remote_file == job.stdout_path or remote_file == job.stderr_path:
                        continue

                    rel_path = remote_file.replace(remote_output_dir, "").lstrip("/")
                    local_file = local_dir / rel_path
                    ensure_directory(local_file.parent)

                    success, local_path, file_size = self._safe_download(
                        remote_file, local_file, max_retries, verify_checksum
                    )
                    if success:
                        results["downloaded_files"].append({
                            "remote_path": remote_file,
                            "local_path": str(local_path),
                            "size_mb": file_size
                        })
                        results["total_size_mb"] += file_size
                    else:
                        results["failed_files"].append(remote_file)

        except Exception as e:
            results["file_scan_error"] = str(e)
            logger.warning(f"Error scanning remote files: {e}")

        if verify_checksum:
            checksum_file = None
            for f_info in results["downloaded_files"]:
                if f_info["remote_path"].endswith(".md5") or f_info["remote_path"].endswith(".sha256"):
                    checksum_file = f_info["local_path"]
                    break

            if checksum_file:
                results["checksum_verified"] = self._verify_checksums(local_dir, checksum_file)
            else:
                results["checksum_verified"] = "no_checksum_file"

        logger.info(
            f"Download complete: {len(results['downloaded_files'])} files, "
            f"{results['total_size_mb']:.2f} MB total, "
            f"{len(results['failed_files'])} failed"
        )

        return results

    def _safe_download(
        self,
        remote_path: str,
        local_path: Path,
        max_retries: int = 3,
        verify_checksum: bool = True
    ) -> Tuple[bool, Optional[Path], float]:
        for attempt in range(max_retries):
            try:
                if verify_checksum:
                    temp_local = Path(str(local_path) + f".tmp{attempt}")
                    self._download_file(remote_path, temp_local)

                    remote_checksum = self._get_remote_checksum(remote_path)
                    local_checksum = self._compute_file_checksum(temp_local)

                    if remote_checksum and remote_checksum != local_checksum:
                        logger.warning(f"Checksum mismatch for {remote_path}, retrying ({attempt + 1}/{max_retries})")
                        temp_local.unlink(missing_ok=True)
                        continue

                    temp_local.rename(local_path)
                else:
                    self._download_file(remote_path, local_path)

                file_size_mb = local_path.stat().st_size / (1024 * 1024)
                logger.debug(f"Downloaded {remote_path} -> {local_path} ({file_size_mb:.2f} MB)")
                return True, local_path, file_size_mb

            except Exception as e:
                logger.warning(f"Download attempt {attempt + 1} failed for {remote_path}: {e}")
                if attempt == max_retries - 1:
                    logger.error(f"Failed to download {remote_path} after {max_retries} attempts")
                    return False, None, 0.0
                time.sleep(min(2 ** attempt, 10))

        return False, None, 0.0

    def _get_remote_checksum(self, remote_path: str) -> Optional[str]:
        try:
            stdout, stderr, exit_code = self._execute_remote_command(
                f"md5sum '{remote_path}' 2>/dev/null || sha256sum '{remote_path}' 2>/dev/null",
                timeout=10
            )
            if exit_code == 0 and stdout.strip():
                return stdout.strip().split()[0]
        except Exception:
            pass
        return None

    @staticmethod
    def _compute_file_checksum(file_path: Path) -> str:
        import hashlib
        md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                md5.update(chunk)
        return md5.hexdigest()

    def _verify_checksums(self, local_dir: Path, checksum_file: Path) -> Dict[str, bool]:
        results = {}
        try:
            with open(checksum_file, "r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 2:
                        checksum = parts[0]
                        filename = " ".join(parts[1:]).lstrip("*")
                        local_file = local_dir / Path(filename).name
                        if local_file.exists():
                            computed = self._compute_file_checksum(local_file)
                            results[filename] = (checksum == computed)
        except Exception as e:
            results["error"] = str(e)
        return results

    def generate_remote_checksum_file(self, remote_dir: str, output_file: str = "checksums.md5") -> bool:
        try:
            cmd = f"cd '{remote_dir}' && find . -type f -not -name '*.md5' -not -name '*.sha256' -exec md5sum {{}} \\; > '{output_file}' 2>/dev/null"
            stdout, stderr, exit_code = self._execute_remote_command(cmd, timeout=60)
            return exit_code == 0
        except Exception as e:
            logger.warning(f"Failed to generate checksum file: {e}")
            return False

    def list_jobs(self) -> List[Dict[str, Any]]:
        if self.config.scheduler == "slurm":
            cmd = "squeue -u $USER -o '%.18i %.9P %.30j %.8T %.10M %.6D %.20R'"
        elif self.config.scheduler == "pbs":
            cmd = "qstat -u $USER"
        else:
            raise ValueError(f"Unsupported scheduler: {self.config.scheduler}")

        stdout, stderr, exit_code = self._execute_remote_command(cmd)
        if exit_code != 0:
            return []

        lines = stdout.strip().split("\n")
        return [{"line": line} for line in lines if line.strip()]

    def get_cluster_info(self) -> Dict[str, Any]:
        commands = {
            "hostname": "hostname",
            "uname": "uname -a",
            "cpu_info": "lscpu 2>/dev/null | head -20",
            "memory": "free -h",
            "disk": "df -h $HOME",
            "queues": "sinfo 2>/dev/null || qstat -q 2>/dev/null || echo 'No queue info'",
        }

        info = {}
        for key, cmd in commands.items():
            try:
                stdout, stderr, exit_code = self._execute_remote_command(cmd, timeout=10)
                info[key] = stdout.strip() if exit_code == 0 else stderr.strip()
            except Exception as e:
                info[key] = f"Error: {e}"

        return info

    def wait_for_job(self, job_id: str, poll_interval: int = 30, timeout: Optional[int] = None) -> HPCJob:
        start_time = time.time()

        while True:
            job = self.get_job_status(job_id)
            if job is None:
                raise ValueError(f"Job {job_id} not found")

            if job.state in [JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED, JobState.TIMEOUT, JobState.NODE_FAIL]:
                logger.info(f"Job {job_id} finished with state: {job.state.value}")
                return job

            if timeout and (time.time() - start_time) > timeout:
                logger.warning(f"Timeout waiting for job {job_id}")
                return job

            time.sleep(poll_interval)

    def submit_interpolation_job(
        self,
        data_files: List[Union[str, Path]],
        config_file: Optional[Union[str, Path]] = None,
        remote_output_dir: Optional[str] = None,
        archive_output: bool = True,
        generate_checksums: bool = True,
        **kwargs
    ) -> str:
        output_dir = remote_output_dir or f"{self.config.remote_workdir}/output_{int(time.time())}"

        script_lines = [
            f"mkdir -p {output_dir}",
            f"cd {self.config.remote_workdir}",
            "",
            "# Data validation",
            "echo '=== Data integrity check ==='",
            "md5sum *.csv *.json 2>/dev/null || echo 'No checksum needed'",
            "",
            "# Run interpolation",
            "echo '=== Starting interpolation ==='",
            f"python -u main.py run --input ./ --output {output_dir} --no-parallel 2>&1 || {{ echo 'Interpolation failed with code $?'; exit 1; }}",
            "",
            "# Generate output manifest",
            "echo '=== Generating output manifest ==='",
            f"cd {output_dir}",
            "ls -la > file_list.txt",
            f"find . -type f -exec md5sum {{}} \\; > checksums.md5",
            "wc -l checksums.md5",
            "",
            "# Create archive if requested",
        ]

        if archive_output:
            script_lines.extend([
                "",
                "echo '=== Creating output archive ==='",
                f"tar -czf ../output_archive.tar.gz -C {output_dir} .",
                "md5sum ../output_archive.tar.gz > ../output_archive.md5",
            ])

        script_lines.extend([
            "",
            "echo '=== Job completed successfully ==='",
            "exit 0",
        ])

        full_command = "\n".join(script_lines)

        all_files = list(data_files)
        if config_file:
            all_files.append(config_file)

        main_script = Path(__file__).parent / "main.py"
        if main_script.exists():
            all_files.append(main_script)

        modules = kwargs.get("modules", ["python", "numpy", "scipy", "netcdf"])

        job_name = kwargs.get("name", "ocean_interp")

        return self.submit_job(
            command=full_command,
            name=job_name,
            modules=modules,
            local_files=all_files,
            **kwargs
        )

    def get_job_output_with_retry(
        self,
        job_id: str,
        local_dir: Union[str, Path],
        max_attempts: int = 5,
        retry_delay: int = 30
    ) -> Dict[str, Any]:
        for attempt in range(max_attempts):
            try:
                result = self.get_job_output(
                    job_id,
                    local_dir,
                    max_retries=3,
                    verify_checksum=True
                )

                if len(result.get("failed_files", [])) == 0:
                    return result

                logger.warning(
                    f"Download incomplete on attempt {attempt + 1}: "
                    f"{len(result.get('failed_files', []))} files failed"
                )

            except Exception as e:
                logger.warning(f"Download attempt {attempt + 1} failed: {e}")

            if attempt < max_attempts - 1:
                time.sleep(retry_delay)

        logger.error(f"Failed to download all files after {max_attempts} attempts")
        return result


class LocalHPCSimulator:
    def __init__(self, work_dir: Optional[str] = None):
        self.work_dir = Path(work_dir or "./hpc_sim")
        ensure_directory(self.work_dir)
        self._jobs: Dict[str, HPCJob] = {}
        self._processes: Dict[str, subprocess.Popen] = {}

    def submit_job(
        self,
        command: str,
        name: str = "local_job",
        **kwargs
    ) -> str:
        job_id = generate_task_id("local")
        job = HPCJob(
            job_id=job_id,
            name=name,
            state=JobState.RUNNING,
            submit_time=time.time(),
            start_time=time.time(),
        )

        stdout_path = self.work_dir / f"{name}_{job_id[:8]}.out"
        stderr_path = self.work_dir / f"{name}_{job_id[:8]}.err"
        job.stdout_path = str(stdout_path)
        job.stderr_path = str(stderr_path)

        stdout_file = open(stdout_path, "w")
        stderr_file = open(stderr_path, "w")

        process = subprocess.Popen(
            command,
            shell=True,
            stdout=stdout_file,
            stderr=stderr_file,
            cwd=str(self.work_dir)
        )

        self._jobs[job_id] = job
        self._processes[job_id] = process

        logger.info(f"Submitted local job {job_id}: {command}")
        return job_id

    def get_job_status(self, job_id: str) -> Optional[HPCJob]:
        job = self._jobs.get(job_id)
        if job is None:
            return None

        process = self._processes.get(job_id)
        if process is None:
            return job

        return_code = process.poll()
        if return_code is None:
            job.state = JobState.RUNNING
        else:
            job.exit_code = return_code
            job.end_time = time.time()
            job.state = JobState.COMPLETED if return_code == 0 else JobState.FAILED

        return job

    def wait_for_job(self, job_id: str, poll_interval: int = 1, timeout: Optional[int] = None) -> HPCJob:
        start_time = time.time()

        while True:
            job = self.get_job_status(job_id)
            if job is None:
                raise ValueError(f"Job {job_id} not found")

            if job.state in [JobState.COMPLETED, JobState.FAILED]:
                return job

            if timeout and (time.time() - start_time) > timeout:
                return job

            time.sleep(poll_interval)

    def get_job_output(self, job_id: str, local_dir: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
        job = self._jobs.get(job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")

        results = {
            "job_id": job_id,
            "files": []
        }

        if job.stdout_path and Path(job.stdout_path).exists():
            with open(job.stdout_path, "r", encoding="utf-8") as f:
                results["stdout"] = f.read()
            results["files"].append(job.stdout_path)

        if job.stderr_path and Path(job.stderr_path).exists():
            with open(job.stderr_path, "r", encoding="utf-8") as f:
                results["stderr"] = f.read()
            results["files"].append(job.stderr_path)

        return results

    def cancel_job(self, job_id: str) -> bool:
        process = self._processes.get(job_id)
        if process is None:
            return False

        process.terminate()
        job = self._jobs.get(job_id)
        if job:
            job.state = JobState.CANCELLED
            job.end_time = time.time()

        return True
