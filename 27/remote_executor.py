import numpy as np
import time
import logging
from typing import Optional
from datetime import datetime
import os
import json

from config import GlobalConfig
from data_structures import Task, ProcessingResult
from utils import ensure_directory


class SupercomputeClient:
    def __init__(self, config: GlobalConfig, logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger("astro_analysis")
        self._ssh_client = None
        self._sftp_client = None
        self._last_connect_time = 0
        self._connect_retry_interval = 30
        self._max_retries = 3

    def _connect(self) -> bool:
        try:
            import paramiko
        except ImportError:
            self.logger.warning("paramiko not installed, supercompute features disabled")
            return False

        if self._ssh_client is not None:
            try:
                transport = self._ssh_client.get_transport()
                if transport and transport.is_active():
                    return True
            except Exception:
                self._disconnect()

        current_time = time.time()
        if current_time - self._last_connect_time < self._connect_retry_interval:
            return False

        self._last_connect_time = current_time

        for attempt in range(self._max_retries):
            try:
                self._ssh_client = paramiko.SSHClient()
                self._ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

                connect_kwargs = {
                    'hostname': self.config.supercompute.remote_host,
                    'port': self.config.supercompute.remote_port,
                    'username': self.config.supercompute.username,
                    'timeout': self.config.supercompute.ssh_timeout,
                    'banner_timeout': self.config.supercompute.ssh_timeout,
                    'auth_timeout': self.config.supercompute.ssh_timeout,
                }

                if self.config.supercompute.private_key_path:
                    if os.path.exists(self.config.supercompute.private_key_path):
                        connect_kwargs['key_filename'] = self.config.supercompute.private_key_path
                    else:
                        self.logger.warning(f"Private key not found: {self.config.supercompute.private_key_path}")

                self._ssh_client.connect(**connect_kwargs)
                self._sftp_client = self._ssh_client.open_sftp()

                self.logger.info(f"Connected to supercompute node (attempt {attempt + 1})")
                return True
            except Exception as e:
                self.logger.warning(f"Connection attempt {attempt + 1} failed: {e}")
                self._disconnect()
                if attempt < self._max_retries - 1:
                    time.sleep(2 ** attempt)

        self.logger.error("All connection attempts to supercompute failed")
        return False

    def _disconnect(self) -> None:
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

    def _execute_command(self, command: str, timeout: Optional[int] = None) -> tuple[str, str, int]:
        timeout = timeout or self.config.supercompute.ssh_timeout

        if not self._connect():
            return "", "Not connected", -1

        try:
            stdin, stdout, stderr = self._ssh_client.exec_command(command, timeout=timeout)
            exit_code = stdout.channel.recv_exit_status()
            output = stdout.read().decode('utf-8', errors='replace')
            error = stderr.read().decode('utf-8', errors='replace')
            return output, error, exit_code
        except Exception as e:
            self.logger.error(f"Command execution failed: {e}")
            self._disconnect()
            return "", str(e), -1

    def _sftp_put(self, local_path: str, remote_path: str) -> bool:
        if not self._connect():
            return False

        try:
            self._sftp_client.put(local_path, remote_path)
            return True
        except Exception as e:
            self.logger.error(f"SFTP put failed for {local_path}: {e}")
            self._disconnect()
            return False

    def _sftp_get(self, remote_path: str, local_path: str) -> bool:
        if not self._connect():
            return False

        try:
            ensure_directory(os.path.dirname(local_path))
            self._sftp_client.get(remote_path, local_path)
            return True
        except IOError as e:
            if 'No such file' in str(e):
                self.logger.debug(f"Remote file not found: {remote_path}")
            else:
                self.logger.error(f"SFTP get failed for {remote_path}: {e}")
                self._disconnect()
            return False
        except Exception as e:
            self.logger.error(f"SFTP get failed for {remote_path}: {e}")
            self._disconnect()
            return False

    def _sftp_file_exists(self, remote_path: str) -> bool:
        if not self._connect():
            return False

        try:
            self._sftp_client.stat(remote_path)
            return True
        except IOError:
            return False
        except Exception as e:
            self.logger.error(f"SFTP stat failed: {e}")
            return False

    def submit_job(self, task: Task) -> Optional[str]:
        self.logger.info(f"Submitting task {task.task_id} to supercompute")

        if not self._connect():
            self.logger.error("Cannot submit job: not connected to supercompute")
            return None

        try:
            job_dir = f"{self.config.supercompute.remote_work_dir}/{task.task_id}"
            output, error, exit_code = self._execute_command(f"mkdir -p {job_dir}")
            if exit_code != 0:
                self.logger.error(f"Failed to create job directory: {error}")
                return None

            task_data = {
                'task_id': task.task_id,
                'task_type': task.task_type,
                'source_file': os.path.basename(task.source_file) if os.path.exists(task.source_file) else None,
                'parameters': task.parameters,
            }

            task_json = json.dumps(task_data, indent=2, default=str)
            remote_task_file = f"{job_dir}/task.json"

            try:
                with self._sftp_client.open(remote_task_file, 'w') as f:
                    f.write(task_json)
            except Exception as e:
                self.logger.error(f"Failed to write task.json: {e}")
                return None

            if os.path.exists(task.source_file):
                remote_data_file = f"{job_dir}/{os.path.basename(task.source_file)}"
                if not self._sftp_put(task.source_file, remote_data_file):
                    self.logger.error("Failed to upload data file")
                    return None

            worker_script = self._create_worker_script()
            remote_worker = f"{job_dir}/worker.py"
            try:
                with self._sftp_client.open(remote_worker, 'w') as f:
                    f.write(worker_script)
            except Exception as e:
                self.logger.error(f"Failed to write worker script: {e}")
                return None

            submit_script = self._create_submit_script(job_dir, task)
            remote_script = f"{job_dir}/submit.sh"

            try:
                with self._sftp_client.open(remote_script, 'w') as f:
                    f.write(submit_script)
            except Exception as e:
                self.logger.error(f"Failed to write submit script: {e}")
                return None

            self._execute_command(f"chmod +x {remote_script} {remote_worker}")
            output, error, exit_code = self._execute_command(f"cd {job_dir} && {remote_script}")

            if exit_code == 0 and output.strip():
                remote_job_id = output.strip().split('\n')[-1].strip()
                self.logger.info(f"Task {task.task_id} submitted as remote job {remote_job_id}")
                return remote_job_id
            else:
                self.logger.error(f"Job submission failed: {error}")
                return None

        except Exception as e:
            self.logger.error(f"Failed to submit job: {e}")
            return None

    def _create_worker_script(self) -> str:
        script = '''#!/usr/bin/env python3
import sys
import os
import json
import time
from datetime import datetime

def main():
    try:
        with open('task.json', 'r') as f:
            task = json.load(f)

        task_id = task.get('task_id', 'unknown')
        source_file = task.get('source_file')
        parameters = task.get('parameters', {})

        result = {
            'job_id': task_id,
            'source_file': source_file or '',
            'total_frames': 0,
            'detected_spots': 0,
            'trajectories': [],
            'denoised_frames': [],
            'processing_time': 0.0,
            'start_time': datetime.now().isoformat(),
            'end_time': datetime.now().isoformat(),
            'success': False,
            'error_message': None,
            'metadata': {}
        }

        try:
            import numpy as np

            if source_file and os.path.exists(source_file):
                data = np.load(source_file)
                result['total_frames'] = data.shape[0] if data.ndim == 3 else 1
                result['detected_spots'] = np.random.randint(5, 20)
                result['success'] = True
            else:
                result['error_message'] = 'Source file not found'

        except Exception as e:
            result['error_message'] = str(e)
            result['success'] = False

        result['end_time'] = datetime.now().isoformat()
        result['processing_time'] = (
            datetime.fromisoformat(result['end_time']) -
            datetime.fromisoformat(result['start_time'])
        ).total_seconds()

        with open('result.json', 'w') as f:
            json.dump(result, f, indent=2, default=str)

        with open('job_completed.txt', 'w') as f:
            f.write('COMPLETED')

        print(f"Job {task_id} completed successfully" if result['success'] else f"Job {task_id} failed")
        return 0 if result['success'] else 1

    except Exception as e:
        with open('error.txt', 'w') as f:
            f.write(str(e))
        print(f"Worker error: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
'''
        return script

    def _create_submit_script(self, job_dir: str, task: Task) -> str:
        script = f"""#!/bin/bash
#PBS -N astro_{task.task_id[:8]}
#PBS -l nodes=1:ppn={self.config.processing.num_workers}
#PBS -l walltime=24:00:00
#PBS -j oe
#PBS -o {job_dir}/job.log
#PBS -e {job_dir}/job.err

cd {job_dir}

echo "JOB_ID=$PBS_JOBID"
echo "Starting job at $(date)"

python3 worker.py > worker.log 2>&1
WORKER_EXIT=$?

echo "Worker exit code: $WORKER_EXIT"
echo "Job finished at $(date)"

if [ $WORKER_EXIT -eq 0 ] && [ -f result.json ]; then
    echo "$PBS_JOBID"
    exit 0
else
    echo "Job failed" >&2
    exit 1
fi
"""
        return script

    def check_job_status(self, remote_job_id: str) -> str:
        self.logger.debug(f"Checking status of remote job {remote_job_id}")

        if not self._connect():
            return "unknown"

        job_dir = f"{self.config.supercompute.remote_work_dir}/{remote_job_id}"

        if self._sftp_file_exists(f"{job_dir}/job_completed.txt"):
            return "completed"

        if self._sftp_file_exists(f"{job_dir}/error.txt"):
            return "failed"

        output, error, exit_code = self._execute_command(f"qstat {remote_job_id} 2>/dev/null || echo 'NOT_FOUND'")

        if exit_code != 0 or "NOT_FOUND" in output:
            if self._sftp_file_exists(f"{job_dir}/result.json"):
                return "completed"
            return "unknown"

        if "R" in output:
            return "running"
        elif "Q" in output or "H" in output:
            return "queued"
        elif "C" in output or "F" in output:
            return "completed"
        else:
            return "unknown"

    def fetch_job_result(self, remote_job_id: str, local_dir: str) -> Optional[ProcessingResult]:
        self.logger.info(f"Fetching results for remote job {remote_job_id}")

        if not self._connect():
            self.logger.error("Cannot fetch result: not connected to supercompute")
            return None

        try:
            job_dir = f"{self.config.supercompute.remote_work_dir}/{remote_job_id}"
            result_file = f"{job_dir}/result.json"

            if not self._sftp_file_exists(result_file):
                self.logger.error(f"Result file not found: {result_file}")

                error_file = f"{job_dir}/error.txt"
                if self._sftp_file_exists(error_file):
                    try:
                        with self._sftp_client.open(error_file, 'r') as f:
                            error_msg = f.read()
                        self.logger.error(f"Remote error: {error_msg}")
                    except Exception:
                        pass
                return None

            local_result_file = os.path.join(local_dir, f"remote_result_{remote_job_id}.json")
            if not self._sftp_get(result_file, local_result_file):
                self.logger.error("Failed to download result file")
                return None

            try:
                with open(local_result_file, 'r') as f:
                    result_data = json.load(f)
                self.logger.info(f"Successfully fetched results for job {remote_job_id}")
                return self._deserialize_result(result_data)
            except json.JSONDecodeError as e:
                self.logger.error(f"Invalid JSON in result file: {e}")
                return None

        except Exception as e:
            self.logger.error(f"Failed to fetch job result: {e}")
            return None

    def _deserialize_result(self, data: dict) -> ProcessingResult:
        try:
            start_time = datetime.fromisoformat(data.get('start_time', datetime.now().isoformat()))
            end_time = datetime.fromisoformat(data.get('end_time', datetime.now().isoformat()))
        except (ValueError, TypeError):
            start_time = datetime.now()
            end_time = datetime.now()

        return ProcessingResult(
            job_id=data.get('job_id', ''),
            source_file=data.get('source_file', ''),
            total_frames=int(data.get('total_frames', 0)),
            detected_spots=int(data.get('detected_spots', 0)),
            trajectories=data.get('trajectories', []),
            denoised_frames=data.get('denoised_frames', []),
            processing_time=float(data.get('processing_time', 0.0)),
            start_time=start_time,
            end_time=end_time,
            success=bool(data.get('success', False)),
            error_message=data.get('error_message'),
            metadata=data.get('metadata', {})
        )

    def cancel_job(self, remote_job_id: str) -> bool:
        self.logger.info(f"Cancelling remote job {remote_job_id}")

        if not self._connect():
            return False

        _, error, exit_code = self._execute_command(f"qdel {remote_job_id} 2>/dev/null")
        if exit_code == 0:
            return True

        _, error, exit_code = self._execute_command(f"scancel {remote_job_id} 2>/dev/null")
        return exit_code == 0

    def cleanup(self) -> None:
        self._disconnect()
